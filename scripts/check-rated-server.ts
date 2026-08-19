/**
 * 【レート戦のサーバー側】1か月を実際に回す。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-rated-server.ts \
 *     --outfile=node_modules/.cache/check-rs.cjs --log-level=error && node node_modules/.cache/check-rs.cjs
 *
 * ■なぜ要るか
 *   `check-rated` はレート・段位・グループ分け・コースを**部品ごとに**見ています。
 *   ところが実際に動くのは「提出を締めて → 走らせて → レートを書く」の一続きで、
 *   **その道は1行も通っていませんでした。**（`runRatedRound` は Edge Function からしか
 *   呼ばれないので、画面のゴールデンにも store のゴールデンにも絶対に届かない）
 *
 * ■何を守るか
 *   ① 提出したぶんはそのとおり走る（区間に置いた選手が、その区間を走っている）
 *   ② **出さなかった人も走る**（おまかせ＋不戦敗）。出さないほうが得、にしない
 *   ③ 全グループの合計 = 参加者数。誰も落ちない・二重に数えない
 *   ④ **レートは0を下回らない**（オーナー・2026-08-14「レートはマイナスいかないからね？」）。
 *      下限があるぶん減りが目減りするので、増減の合計は**0以上**になる（下限に当たった人が
 *      居なければ0。総当たりEloなので、本来は増えたぶんと減ったぶんが釣り合う）
 *   ⑤ 1か月回して、レートの散らばりが `RANK_BANDS` の帯に収まっている
 *      （上の段位に誰も届かない、が起きない）
 *   ⑥ 10人未満は流会。**レートが1も動かない**
 *   ⑦ 端末の言い値を見ていない（他人の殿堂入りの選手を出しても、その人は走れない）
 *
 * ■壊して確かめたこと（全部落ちた）
 *   ・`runRatedRound` で未提出者を entrants から外す（走らない）           → ②
 *   ・`applyElo` に渡す order を「速い順」ではなく参加順にする              → ①④
 *   ・`splitGroups` の結果の最後のグループを捨てる                          → ③
 *   ・流会（skipped）でもレートを書く                                       → ⑥
 *   ・`clampRating` の下限を外す／−1000 にする（マイナスに行く）             → ④（8件）
 */
import { readFileSync } from 'node:fs'
import { runRatedRound, type RatedEntrant } from '../src/lib/ratedTick'
import { ratedMatchCourse, ratedDateOf, ratedDayOf } from '../src/engine/ratedCourse'
import { RANK_BANDS, GROUP_MAX, GROUP_MIN, rankOf } from '../src/engine/rating'
import { buildRatingsForRank } from '../src/engine/playerGenerator'
import { HOF_MAX } from '../src/utils/hofRoster'
import { ovr } from '../src/utils/playerUtils'
import type { HofPlayer, Player } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

// ── 種を固定した世界 ────────────────────────────────────
// 実機の殿堂入りに近づける：登録した時点で凍っている30人。
// 人によって強さに差がある（レートが散らばらないと⑤が見られない）
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

const SPECS = ['山型', 'スピード型', '持久型', '万能型'] as const

function makeHof(userId: string, strength: number, r: () => number): HofPlayer[] {
  const out: HofPlayer[] = []
  for (let i = 0; i < HOF_MAX; i++) {
    // rank 1 が最上位。強い人ほど良いランクが並ぶ
    const rank = Math.max(1, Math.min(10, Math.round(strength + (r() - 0.5) * 3)))
    const age = 22 + Math.floor(r() * 12)
    const p = {
      id: `${userId}-h${i}`,
      name: `選手${i}`,
      nationality: 'JPN',
      teamId: userId,
      age,
      status: 'active',
      specialty: SPECS[Math.floor(r() * SPECS.length)],
      ratings: buildRatingsForRank(rank, age, `${userId}-h${i}`),
      fatigue: 0, form: 0, morale: 60, potential: 99,
    } as unknown as Player
    out.push({ player: p, year: 2030 + i, teamName: userId, ovr: ovr(p) })
  }
  return out
}

function makeEntrants(n: number, seed = 7, rating = 0): RatedEntrant[] {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => ({
    userId: `u${String(i).padStart(3, '0')}`,
    rating,
    team: {
      id: `u${String(i).padStart(3, '0')}`, name: `チーム${i}`, shortName: `T${i}`,
      gmName: `GM${i}`, primary: '#122440', secondary: '#f5c842', logoId: 'logo_01',
    },
    // 1〜9 のあいだで散らす（実力差が無いとレートも散らばらない）
    hof: makeHof(`u${String(i).padStart(3, '0')}`, 1 + (i % 9), r),
  }))
}

/** その人の殿堂入りから、区間数ぶんちょうど選ぶ（OVR順） */
function pickLineup(e: RatedEntrant, segCount: number): Record<number, string> {
  const sorted = [...e.hof].sort((a, b) => b.ovr - a.ovr)
  const out: Record<number, string> = {}
  for (let i = 1; i <= segCount; i++) out[i] = sorted[i - 1].player.id
  return out
}

const START = '2026-09-01'
const DAYS = 30

console.log('[1] 提出したとおりに走る／出さなかった人も走る')
{
  const entrants = makeEntrants(20)
  const course = ratedMatchCourse(START)
  const segCount = course.segments.length
  // 半分だけ提出する
  const lineups: Record<string, Record<number, string>> = {}
  for (const e of entrants.slice(0, 10)) lineups[e.userId] = pickLineup(e, segCount)

  const out = runRatedRound({ dateISO: START, day: 1, entrants, lineups })
  check('流会していない', !out.skipped)
  check('20人なので1グループ', out.groups === 1, String(out.groups))
  check('20人ぶんの行が出る', out.rows.length === 20, String(out.rows.length))

  // ① 提出した人は、置いたとおりの選手がその区間を走っている
  const race = out.races[0].race
  const me = entrants[0]
  const mine = lineups[me.userId]
  const ok1 = course.segments.every(s => {
    const sr = race.segments.find(x => x.segmentIndex === s.index)
    const run = sr?.runners.find(x => x.teamId === me.userId)
    // 計算用に「ユーザーID#元のID」へ付け替えられている
    return run?.playerId === `${me.userId}#${mine[s.index]}`
  })
  check('置いた選手がその区間を走っている', ok1)

  // ② 出さなかった人も走っていて、不戦敗が付いている
  const lazy = out.rows.filter(x => x.forfeit).map(x => x.userId).sort()
  check('出さなかった10人だけが不戦敗',
    lazy.join(',') === entrants.slice(10).map(e => e.userId).sort().join(','), lazy.join(','))
  check('不戦敗の人も順位が付いている（走っている）',
    out.rows.filter(x => x.forfeit).every(x => x.place >= 1 && x.timeSec > 0))
  // ★**下限から離れた場所で見ること。** 全員レート0だと、負けた不戦敗の人は0で止まって
  //   増減が0になる（下限が正しく効いているだけ）。ここは「不戦敗でも勝負として数える」
  //   ことを見たいので、床から離した回でもう一度回す。以前は同じ回で見ていて、
  //   不戦敗の誰か1人がたまたま中位に入った日だけ通る**ゆらぐ網**だった。
  const above = runRatedRound({
    dateISO: START, day: 1, entrants: makeEntrants(20, 7, 1500), lineups,
  })
  check('不戦敗でもレートは動く',
    above.rows.filter(x => x.forfeit).every(x => x.delta !== 0),
    above.rows.filter(x => x.forfeit && x.delta === 0).map(x => x.userId).join(','))

  // ⑦ 他人の選手IDを出しても走れない（おまかせで埋まるだけ・不戦敗にはならない）
  const cheat = runRatedRound({
    dateISO: START, day: 1, entrants,
    lineups: { [entrants[1].userId]: pickLineup(entrants[2], segCount) },
  })
  const cheatRunners = cheat.races[0].race.runners
    .filter(r => r.teamId === entrants[1].userId).map(r => r.srcId)
  check('他人の選手は1人も走っていない',
    cheatRunners.every(id => id.startsWith(entrants[1].userId)),
    cheatRunners.filter(id => !id.startsWith(entrants[1].userId)).join(','))
  check('中身が欠けていただけの人は不戦敗にしない',
    !cheat.rows.find(x => x.userId === entrants[1].userId)?.forfeit)

  // ★**増減が着順と結びついていること。**
  //   全員レート0なので期待勝率は全員0.5＝増減は着順だけで決まり、1位が最大・最下位が最小になる。
  //   これが無いと、`applyElo` に**速い順ではなく参加順**を渡しても全部の網が緑のままだった
  //   （合計は0のままだし、レートも散らばる。散らばり方が着順と無関係なだけ）。
  const byPlace = [...out.rows].sort((a, b) => a.place - b.place)
  //   ★**下限（0）に当たった人は0で止まる**ので「厳密に減っていく」にはならない。
  //     全員0から始めた日は、負けた側が全員0のまま並ぶ（オーナー・2026-08-14
  //     「レートはマイナスいかないからね？」）。見るのは
  //       ・着順が下の人が上の人より増えることは無い（順序が逆転しない）
  //       ・止まっていない人どうしは厳密に減っていく
  //       ・**誰もマイナスにならない**
  check('着順が下の人のほうが増える、が起きない',
    byPlace.every((x, i) => i === 0 || byPlace[i - 1].delta >= x.delta),
    byPlace.map(x => `${x.place}位${x.delta > 0 ? '+' : ''}${x.delta}`).join(' '))
  const moving = byPlace.filter(x => x.ratingAfter > 0)
  check('下限で止まっていない人どうしは着順どおりに並ぶ',
    moving.every((x, i) => i === 0 || moving[i - 1].delta > x.delta),
    moving.map(x => `${x.place}位${x.delta}`).join(' '))
  check('1位が最大', byPlace[0].delta === Math.max(...out.rows.map(x => x.delta)))
  check('誰もマイナスにならない', out.rows.every(x => x.ratingAfter >= 0),
    out.rows.filter(x => x.ratingAfter < 0).map(x => `${x.userId}:${x.ratingAfter}`).join(' '))
}

console.log('\n[1-b] 大会全体の順位と、前日からの上下（順位表の矢印）')
{
  // 20人・全員提出。**レートに差を付けてから**走らせて、順位が動くことを見る
  // ★**下限（0）から離したところで見ること。** 以前は 200〜10 という下限のすぐ上に
  //   並べていて、1戦の増減（K=40 で±380くらい）のほうが差より桁違いに大きいので、
  //   **負けた人が全員0で止まって同点になり**、同点は userId 順＝元の並びそのまま。
  //   その日は上下が1つも起きず、**40回に2回落ちる**網になっていた（2026-08-18 に実測）。
  //   下限が効いていること自体は [2] と [4] が別に見ている。
  const base = makeEntrants(20, 4)
  const entrants = base.map((e, i) => ({ ...e, rating: 1500 + (20 - i) * 10 }))   // u000 が最上位
  const segCount = ratedMatchCourse(START).segments.length
  const lineups = Object.fromEntries(entrants.map(e => [e.userId, pickLineup(e, segCount)]))
  const out = runRatedRound({ dateISO: START, day: 1, entrants, lineups })

  const overall = out.rows.map(r => r.overall).sort((a, b) => a - b)
  check('大会全体の順位が 1〜20 で重複なし',
    overall.join(',') === Array.from({ length: 20 }, (_, i) => i + 1).join(','), overall.join(','))

  // 並べ方が rated_standings と同じか（レートの高い順・同点は userId 順）
  const expect = [...out.rows]
    .sort((a, b) => b.ratingAfter - a.ratingAfter || (a.userId < b.userId ? -1 : 1))
    .map((r, i) => `${r.userId}:${i + 1}`).join(' ')
  const got = [...out.rows].sort((a, b) => a.overall - b.overall)
    .map(r => `${r.userId}:${r.overall}`).join(' ')
  check('並べ方はレートの高い順・同点は userId 順', expect === got, `\n      期待 ${expect}\n      実際 ${got}`)

  // ★**上下の合計は必ず0**（誰かが上がれば誰かが下がる）。数え直しの食い違いはここで出る
  check(`上下の合計が0（${out.rows.reduce((a, b) => a + b.move, 0)}）`,
    out.rows.reduce((a, b) => a + b.move, 0) === 0)
  check('誰かは動いている（全員0ではない）', out.rows.some(r => r.move !== 0),
    '実力差を付けたのに順位が1つも動いていない')
  // ★上下を**この点検の中で独立に数え直して**突き合わせる。
  //   「順位が上がった人はレートも増えているはず」は**嘘**なので判定に使わないこと
  //   （自分より上の人が自分より大きく負ければ、レートを減らしたまま順位は上がる。
  //    実測 u018 が move+1 / delta−5 で、最初はこれを NG と誤判定していた）。
  const rankBy = (get: (id: string) => number) => {
    const ids = out.rows.map(r => r.userId)
      .sort((a, b) => get(b) - get(a) || (a < b ? -1 : 1))
    return new Map(ids.map((id, i) => [id, i + 1]))
  }
  const rate0 = new Map(entrants.map(e => [e.userId, e.rating]))
  const rate1 = new Map(out.rows.map(r => [r.userId, r.ratingAfter]))
  const before = rankBy(id => rate0.get(id) ?? 0)
  const after = rankBy(id => rate1.get(id) ?? 0)
  const bad = out.rows.filter(r =>
    r.overall !== after.get(r.userId) || r.move !== (before.get(r.userId)! - after.get(r.userId)!))
  check('数え直した順位・上下と1つも食い違わない', bad.length === 0,
    bad.map(r => `${r.userId} overall${r.overall}(=${after.get(r.userId)}) move${r.move}`).join(' '))
}

console.log('\n[2] 誰も落ちない・レートの合計は動かない')
{
  for (const n of [10, 20, 21, 43, 100]) {
    const entrants = makeEntrants(n, n)
    const segCount = ratedMatchCourse(START).segments.length
    const lineups = Object.fromEntries(entrants.map(e => [e.userId, pickLineup(e, segCount)]))
    const out = runRatedRound({ dateISO: START, day: 1, entrants, lineups })
    // ③ 合計 = 参加者数。グループの大きさも 10〜20
    const sizes = out.races.map(g => g.race.standings.length)
    check(`${n}人：全員ぶんの行がある（${sizes.join('+')}）`,
      out.rows.length === n && sizes.reduce((a, b) => a + b, 0) === n,
      `${out.rows.length}行 / ${sizes.reduce((a, b) => a + b, 0)}人`)
    check(`${n}人：グループは ${GROUP_MIN}〜${GROUP_MAX} 人`,
      sizes.every(s => s >= GROUP_MIN && s <= GROUP_MAX), sizes.join(','))
    check(`${n}人：1人1グループ（重複なし）`,
      new Set(out.rows.map(r => r.userId)).size === n)
    // ④ 総当たりElo なので**下限が無ければ**増減の合計は0。
    //    下限（0）があるぶんだけ減りが目減りするので、合計は必ず0以上になる。
    //    ★「0以上」だけだと緩いので、**下限に当たった人が居ないときは0**も見る
    const sum = out.rows.reduce((a, b) => a + b.delta, 0)
    const floored = out.rows.filter(x => x.ratingAfter === 0).length
    check(`${n}人：レートの増減の合計は0以上（${sum}・下限で止まった人 ${floored}）`, sum >= 0)
    check(`${n}人：下限に当たった人が居なければ合計は0`,
      floored > 0 || Math.abs(sum) <= n, `${sum}`)
    check(`${n}人：誰もマイナスにならない`, out.rows.every(x => x.ratingAfter >= 0))
  }
}

console.log('\n[3] 10人に満たなければ流会。レートは1も動かない')
{
  const entrants = makeEntrants(9)
  const out = runRatedRound({ dateISO: START, day: 1, entrants, lineups: {} })
  check('流会', out.skipped && out.groups === 0)
  check('行も結果も出ない', out.rows.length === 0 && out.races.length === 0)
}

console.log('\n[4] 1か月まるごと回す（30回戦）')
{
  const entrants = makeEntrants(60, 99)
  const rating = new Map(entrants.map(e => [e.userId, 0]))
  let forfeitDays = 0

  const badDays: string[] = []
  for (let day = 1; day <= DAYS; day++) {
    const dateISO = ratedDateOf(START, day)
    if (ratedDayOf(START, dateISO, DAYS) !== day) badDays.push(`${day}→${dateISO}`)

    const segCount = ratedMatchCourse(dateISO).segments.length
    const today = entrants.map(e => ({ ...e, rating: rating.get(e.userId)! }))
    // 10人に1人は出し忘れる
    const lineups: Record<string, Record<number, string>> = {}
    for (const e of today) if (Number(e.userId.slice(1)) % 10 !== day % 10) {
      lineups[e.userId] = pickLineup(e, segCount)
    }
    const out = runRatedRound({ dateISO, day, entrants: today, lineups })
    if (out.skipped) { forfeitDays++; continue }
    for (const r of out.rows) rating.set(r.userId, r.ratingAfter)
  }

  const vals = [...rating.values()].sort((a, b) => a - b)
  const lo = vals[0], hi = vals[vals.length - 1]
  check(`日付と何日目かが往復する（${DAYS}日ぶん）`, badDays.length === 0, badDays.join(' '))
  check('30日とも成立した', forfeitDays === 0)
  check(`レートが散らばった（${lo} 〜 ${hi}）`, hi - lo > 1000, `${lo}〜${hi}`)

  // ⑤ 7段位のうち、実際に人が居る段位の数。**上の段位に誰も届かない、が起きない**
  const used = new Set(vals.map(rankOf))
  check(`段位が3段以上使われた（${[...used].join(' / ')}）`, used.size >= 3, [...used].join(','))
  check('いちばん上のレートは最上位の帯の下限に届いている、か少なくとも2段目に居る',
    hi >= RANK_BANDS[RANK_BANDS.length - 2].min, `最高 ${hi}`)
  // ★下限（0）があるので、通算のレートは**増えていく**（減るぶんが目減りする）。仕様。
  //   見るのは「誰もマイナスにならない」ことと、下限がちゃんと効いている
  //   （＝いちばん下が0で止まっている）こと。
  const total = vals.reduce((a, b) => a + b, 0)
  check(`誰もマイナスにならない（最小 ${lo}）`, lo >= 0, `${lo}`)
  check('下限が効いている（いちばん下は0で止まる）', lo === 0, `${lo}`)
  check(`通算の合計は0以上（${total}）`, total >= 0)
}

console.log('\n[5] 同じ入力なら「誰がどこで何を走るか」は同じ（変わるのは当日のブレだけ）')
{
  // ★タイムは毎回変わります（`simulateRace` は当日のブレを引く＝本編とまったく同じ）。
  //   だから**締めた回をもう一度締めてはいけない**。二度目は別のタイムが出て、
  //   レートだけが二重に動きます。その歯止めは Edge Function 側の status です（下で見る）。
  const entrants = makeEntrants(30, 5)
  const segCount = ratedMatchCourse(START).segments.length
  const lineups = Object.fromEntries(entrants.map(e => [e.userId, pickLineup(e, segCount)]))
  const a = runRatedRound({ dateISO: START, day: 1, entrants, lineups })
  const b = runRatedRound({ dateISO: START, day: 1, entrants, lineups })
  const shape = (o: typeof a) => JSON.stringify({
    groups: o.groups,
    members: o.races.map(g => g.race.standings.map(s => s.teamId).sort()),
    runners: o.races.map(g => g.race.runners.map(r => r.id).sort()),
  })
  check('グループ分けと出走する選手は同じ', shape(a) === shape(b))
  check('タイムは変わる（当日のブレを引いている）',
    JSON.stringify(a.races) !== JSON.stringify(b.races))
}

console.log('\n[6] 締めた回は二度と締めない（Edge Function の歯止め）')
{
  const fn = readFileSync('supabase/functions/rated-tick/index.ts', 'utf8')
  // 締める対象は「open で、今日より前」だけ。ここが緩むと同じ日を二度走らせてしまう
  check("締めるのは status='open' の回だけ", /\.eq\('status',\s*'open'\)/.test(fn))
  check('今日より前の回だけ締める', /\.lt\('date_iso',\s*today\)/.test(fn))
  check("締めたら status を closed か void にする",
    /status:\s*'closed'/.test(fn) && /status:\s*'void'/.test(fn))
  // その日の回は作り直さない（作り直すとコースは同じでも提出が消える）
  check('その日の回は重複を無視して作る', /ignoreDuplicates:\s*true/.test(fn))
  // ★判断を殻に書かない。レートもグループも engine から来ること
  check('殻に Elo もグループ分けも書いていない',
    !/applyElo|splitGroups|RATED_K|RANK_BANDS/.test(fn))
  check('走らせるのは runRatedRound 1本', (fn.match(/runRatedRound\(/g) ?? []).length === 1)

  // ★組は**受付が開いた10:00に決めて保存**し、走らせるときはそれを使う
  //   （オーナー・2026-08-19「当日はまずレート分けされて部屋が見れるんでしょ？」）。
  //   走らせる側で割り直すと、当日ずっと見せていた部屋と食い違う。
  check('受付が開いたら組を決めて保存する', /rated_round_groups[\s\S]{0,400}assignGroups\(/.test(fn)
    || /assignGroups\([\s\S]{0,400}rated_round_groups/.test(fn))
  // ★`groupOf` という字が**どこかにある**だけでは足りない（宣言だけしてあって
  //   渡していない、が緑になる。実際にそれで素通りした）。**渡しているか**を見る
  check('走らせるときは保存した組を渡す', /runRatedRound\(\{[^}]*groupOf/s.test(fn))
  check('組は作り直さない（もうあれば何もしない）', /if \(!count\)/.test(fn))
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
