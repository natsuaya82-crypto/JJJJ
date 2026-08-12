/**
 * 駅伝中の選択肢（区間イベント）の網。
 *
 * ■なぜ golden の外に要るのか
 *   区間イベントは**画面から押して初めて通る**（`RacePage` の `startInteractiveSim` →
 *   `resolveChoice`）。store のアクションを叩く golden からは1行も通らない。
 *   ここでは肢を自分で当てて、**どの場面でどれが最良になるか**を数字で見る。
 *
 * ■何を守るか（3つとも、実際に壊れていたもの）
 *   ① **効き目の表は1本。** 以前は7つのイベントが同じ数字を7回手書きしていた
 *   ② **「温存」が全場面で最良にならない。** 以前は肢がスタミナも削っていて、
 *      スタミナ1点 ≒ 26秒（20km）に対してタイムボーナスが23秒だったので、
 *      **gapがいくつでも温存（＝何も起きない肢）が最良**だった＝正解が常に「押さない」
 *   ③ **自分と相手が同じ目盛り。** 成功率は「自分の区間スタミナ − 相手の強さ」で決まるが、
 *      自分だけ自然消耗を引いた値だったので gap が常に -10〜-41 に沈み、
 *      「攻める」の成功率が**どの場面でも下限の10%**に張り付いていた
 *
 * ■壊して確かめたこと（この網が本当に守っているか）
 *   ・`CHOICE_EFFECTS` の温存を `-0.0010 → 0` に戻す           → [2] が落ちる
 *   ・攻めの失敗を `+0.0090 → +0.0068`（比を標準と揃える）      → [3] が落ちる
 *   ・`getCpuOvr` / `fieldOvr` から消耗を引くのをやめる          → [4] が落ちる
 */
import {
  CHOICE_EFFECTS, WATER_EFFECTS, calcNaturalDrain, calcSegOvr,
  choiceSuccessProb, generateSegmentEvents, resolveChoice,
} from '../src/engine/interactiveRace'
import type { Player, Ratings, Segment, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

// ── 期待値。効き目はタイムの割合だけなので、そのまま足せる ──────────────
type Hand = 'aggressive' | 'balanced' | 'conservative'
const HANDS: Hand[] = ['aggressive', 'balanced', 'conservative']
const LABEL: Record<Hand, string> = { aggressive: '攻め', balanced: '標準', conservative: '温存' }
const effectOf = (h: Hand) => CHOICE_EFFECTS.find(e => e.effortType === h)!
/** その肢の期待タイム（区間タイムに対する割合。負が速い） */
function ev(h: Hand, gap: number): number {
  const e = effectOf(h)
  const p = choiceSuccessProb(h, 50 + gap, 50)
  return p * e.timeBonusSuccess + (1 - p) * e.timeBonusFail
}
const bestAt = (gap: number): Hand =>
  HANDS.reduce((a, b) => (ev(b, gap) < ev(a, gap) ? b : a))

console.log('[1] 効き目の表は1本（7つのイベントが同じ数字を手書きしていない）')
{
  check('肢は3つ', CHOICE_EFFECTS.length === 3, `${CHOICE_EFFECTS.length}`)
  check('並びは 攻め → 標準 → 温存',
    CHOICE_EFFECTS.map(e => e.effortType).join(',') === 'aggressive,balanced,conservative')
  // 給水だけ画面の並びが逆（しっかり給水＝温存 が肢a）。中身は同じ表であること
  check('給水は同じ表の逆順（別の数字を持たない）',
    WATER_EFFECTS.length === 3 && WATER_EFFECTS.map(e => e.effortType).join(',') === 'conservative,balanced,aggressive'
    && WATER_EFFECTS.every(w => {
      const c = effectOf(w.effortType)
      return w.timeBonusSuccess === c.timeBonusSuccess && w.timeBonusFail === c.timeBonusFail
    }))
  // ★数字はリテラルで留める（表を読んで表と比べても何も守れない）
  const want = [[-0.0090, 0.0090], [-0.0035, 0.0020], [-0.0010, 0]]
  check('数字が仕様どおり（攻め ∓0.90% / 標準 -0.35%+0.20% / 温存 -0.10%）',
    CHOICE_EFFECTS.every((e, i) => e.timeBonusSuccess === want[i][0] && e.timeBonusFail === want[i][1]),
    CHOICE_EFFECTS.map(e => `${e.timeBonusSuccess}/${e.timeBonusFail}`).join(' '))
  // 効き目は**タイムだけ**。スタミナを戻すと、区間ごとに引き直される値を削るだけの
  // 隠れた2本目のタイム減点になり、②が再発する
  check('効き目にスタミナが無い',
    CHOICE_EFFECTS.every(e => Object.keys(e).sort().join(',') === 'effortType,timeBonusFail,timeBonusSuccess'),
    Object.keys(CHOICE_EFFECTS[0]).join(','))
  const r = resolveChoice(
    { id: 'x', type: 'x', trigger: { type: 'stamina' }, situation: '', battleContext: '',
      choices: [], opponentOvr: 50, _effects: CHOICE_EFFECTS }, 0, 50, 3000)
  check('resolveChoice が返すのはタイムと成否だけ',
    Object.keys(r).sort().join(',') === 'success,timeDelta', Object.keys(r).join(','))
}

console.log('\n[2] 「温存」が全場面で最良にならない（＝正解が常に「押さない」ではない）')
{
  const gaps = [-25, -20, -15, -10, -7, -5, 0, 5, 8, 10, 15, 20]
  const bests = gaps.map(bestAt)
  for (const g of [-20, 0, 15]) {
    console.log(`      gap${String(g).padStart(4)}  ` + HANDS.map(h =>
      `${LABEL[h]} ${(choiceSuccessProb(h, 50 + g, 50) * 100).toFixed(0)}% ${(ev(h, g) * 4722).toFixed(1)}秒`).join(' / ')
      + `  → ${LABEL[bestAt(g)]}`)
  }
  check('3つの肢すべてが、どこかで最良になる',
    HANDS.every(h => bests.includes(h)),
    `出た肢=${[...new Set(bests)].map(h => LABEL[h]).join(',')}`)
  // 具体的にどこで切り替わるか。ここを literal で留めないと「3つ出た」だけで通ってしまう
  check('不利（gap-20）なら温存', bestAt(-20) === 'conservative', LABEL[bestAt(-20)])
  check('互角（gap 0）なら標準', bestAt(0) === 'balanced', LABEL[bestAt(0)])
  check('有利（gap+15）なら攻め', bestAt(15) === 'aggressive', LABEL[bestAt(15)])
  check('温存は失敗しても損しない', effectOf('conservative').timeBonusFail === 0)
  check('温存にも中身がある（押して何も起きない肢にしない）',
    effectOf('conservative').timeBonusSuccess < 0)
}

console.log('\n[3] 肢ごとに「得になる分かれ目」が違う（攻めが標準の倍率違いになっていない）')
{
  // 得と損の比が同じだと、EVが0になる成功率が全部同じ値になる＝攻めは標準の2倍でしかない。
  // 分かれ目 = 損 / (得 + 損)
  const breakeven = (h: Hand) => {
    const e = effectOf(h)
    return e.timeBonusFail / (e.timeBonusFail - e.timeBonusSuccess)
  }
  for (const h of HANDS) console.log(`      ${LABEL[h]} の分かれ目 = 成功率 ${(breakeven(h) * 100).toFixed(1)}%`)
  check('攻めの分かれ目は50%', Math.abs(breakeven('aggressive') - 0.5) < 1e-9)
  check('標準の分かれ目は50%より低い（攻めよりリスクが小さい）',
    breakeven('balanced') < breakeven('aggressive') - 0.05,
    `${(breakeven('balanced') * 100).toFixed(1)}%`)
  check('温存に分かれ目は無い（常に損しない）', breakeven('conservative') === 0)
}

console.log('\n[4] 自分と相手が同じ目盛り（相手も自然消耗を引いたあと）')
{
  const R = (n: number): Ratings => ({
    speed: n, stamina: n, mountainUp: n, mountainDown: n, pacing: n, mental: n, recovery: n })
  const P = (id: string, teamId: string, n: number): Player => ({
    id, name: id, age: 25, teamId, status: 'active', specialty: 'allrounder',
    ratings: R(n), potential: n, morale: 70, fatigue: 0, form: 0,
    contract: { salary: 1000, yearsLeft: 2 },
    career: { races: 0, wins: 0, championships: 0, segmentAwards: 0 },
  } as unknown as Player)
  const T = (id: string): Team => ({ id, name: id, shortName: id } as unknown as Team)

  const me = P('me', 'my', 65)
  const cpus = Array.from({ length: 12 }, (_, i) => P(`c${i}`, `t${i}`, 60 + i))
  const teams = [T('my'), ...cpus.map(c => T(c.teamId))]
  const cpuLineups: Record<string, Record<number, string>> = {}
  for (const c of cpus) cpuLineups[c.teamId] = { 0: c.id }

  // 区間の長さを変えて見る。**消耗は距離で変わる**ので、長い区間ほどズレが大きく出る
  const SEGS: [string, Segment][] = [
    ['10km 平坦', { index: 0, distanceKm: 10, uphillPct: 0, downhillPct: 0 }],
    ['20km 平坦', { index: 0, distanceKm: 20, uphillPct: 0, downhillPct: 0 }],
    ['22km 登り45%', { index: 0, distanceKm: 22, uphillPct: 45, downhillPct: 0 }],
  ]
  for (const [label, seg] of SEGS) {
    const segOvr = calcSegOvr(me, seg)
    const myStamina = Math.max(1, segOvr - calcNaturalDrain(segOvr, seg.distanceKm))
    // 前後にCPUを散らして、どの枝（並走・追い上げ・先頭・給水・山岳）も引けるようにする
    const gaps: number[] = []
    for (let i = 0; i < 200; i++) {
      const base = 3000 + i
      const cpuTimes: Record<string, number> = {}
      cpus.forEach((c, k) => { cpuTimes[c.teamId] = base + (k - 6) * (i % 5 === 0 ? 3 : 40) })
      const cum: Record<string, number> = { __player__: 9000 }
      cpus.forEach((c, k) => { cum[c.teamId] = 9000 + (k - 6) * (i % 3 === 0 ? 4 : 50) })
      const evs = generateSegmentEvents({
        seg, playerBaseTime: base, cpuTimesForSeg: cpuTimes, cumulativeTimes: cum,
        isFirstSeg: i % 7 === 0, player: me, totalSegs: 7,
        players: [me, ...cpus], cpuLineups, teams })
      for (const e of evs) if (e.opponentOvr != null) gaps.push(myStamina - e.opponentOvr)
    }
    const lo = Math.min(...gaps), hi = Math.max(...gaps)
    const aggLo = choiceSuccessProb('aggressive', myStamina, myStamina - lo) * 100
    const aggHi = choiceSuccessProb('aggressive', myStamina, myStamina - hi) * 100
    console.log(`      ${label.padEnd(12)} 自分${String(myStamina).padStart(3)}  gap ${String(lo).padStart(4)}〜${String(hi).padStart(3)}`
      + `  攻めの成功率 ${aggLo.toFixed(0)}〜${aggHi.toFixed(0)}%`)
    // 生のOVRを相手にすると（＝消耗を引かないと）gap は -20 より下へ沈み、
    // 攻めの成功率が下限10%に張り付く
    check(`${label}：gapが沈んでいない（-20より上）`, lo > -20, `最小 ${lo}`)
    check(`${label}：攻めが下限10%に張り付いていない`, aggLo > 12, `${aggLo.toFixed(0)}%`)
  }
}

console.log(failed === 0 ? '\nOK' : `\nNG ${failed}件`)
process.exit(failed === 0 ? 0 : 1)
