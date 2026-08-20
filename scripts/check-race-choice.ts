/**
 * 駅伝中の選択肢（区間イベント）の網。
 *
 * ■なぜ golden の外に要るのか
 *   区間イベントは**画面から押して初めて通る**（`RacePage` の `startInteractiveSim` →
 *   `resolveChoice`）。store のアクションを叩く golden からは1行も通らない。
 *   ここでは肢を自分で当てて、**どの場面でどれが最良になるか**を数字で見る。
 *
 * ■何を守るか（全部、実際に壊れていたもの）
 *   ① **効き目の表は1本。** 以前は7つのイベントが同じ数字を7回手書きしていた
 *   ② **「温存」が全場面で最良にならない。** 以前は肢がスタミナも削っていて、
 *      スタミナ1点 ≒ 26秒（20km）に対してタイムボーナスが23秒だったので、
 *      **gapがいくつでも温存（＝何も起きない肢）が最良**だった＝正解が常に「押さない」
 *   ③ **自分と相手が同じ目盛り。** 成功率は「自分の区間スタミナ − 相手の強さ」で決まるが、
 *      自分だけ自然消耗を引いた値だったので gap が常に -10〜-41 に沈み、
 *      「攻める」の成功率が**どの場面でも下限の10%**に張り付いていた
 *   ④ **場面ごとに効き幅が違う。** 給水と山岳が同じだけ動くのはおかしい
 *   ⑤ **得意な適性が成功率に効く。** 以前は `isMountain` などが**文言を差し替えるためだけ**に
 *      使われていて、山型が山で攻めても数字は1ミリも変わらなかった
 *   ⑥ **ラスト勝負が実際に出る。** 発火地点（74〜88%）だけ書いてあって
 *      そのIDのイベントが無く、**終盤に出る札が1枚も無かった**
 *
 * ■壊して確かめたこと（この網が本当に守っているか。全部が落ちた）
 *   ・攻めの成功率の上限を `0.65 → 0.55`                        → [2][3] が落ちる
 *   ・温存の成功率を 100% でなくす                              → [1] が落ちる
 *   ・温存に中身を戻す（`0 → -0.0010`）                         → [1][2] が落ちる
 *   ・失敗の減点を得と同じにする（攻め `+0.0039 → +0.0077`）    → [1][2] が落ちる
 *   ・`getCpuOvr` / `fieldOvr` から消耗を引くのをやめる          → [4] が落ちる
 *   ・`EVENT_SCALE` の給水を 0.5 → 1.0                          → [5] が落ちる
 *   ・`resolveChoice` で `scale` を掛けるのをやめる             → [5] が落ちる
 *   ・`SPEC_BONUS` を 0 にする／山岳の適性表を空にする          → [6] が落ちる
 *   ・**表はあるが `withSpecBonus` を呼び忘れる**               → [6] が落ちる
 *   ・ラスト勝負の発火の枝を消す／発火地点を終盤から外す        → [7] が落ちる
 *
 * ■世界の作り方に落とし穴がある（[7] の注記も参照）
 *   並走・追い上げ・先頭プレッシャーは**ラスト勝負より先に判定される**ので、
 *   雑に世界を作ると final_push の枝へ一度も到達しない（最初に書いた版が
 *   300回まわして `pack_race×300` だった）。到達したことを必ず件数で確かめること。
 */
import {
  CHOICE_EFFECTS, EVENT_SCALE, EVENT_SPECIALTIES, SPEC_BONUS, WATER_EFFECTS,
  calcNaturalDrain, calcSegOvr, choiceSuccessProb, generateSegmentEvents, resolveChoice, SPEC_BONUS,
} from '../src/engine/interactiveRace'
import { SPECIALTY_LABELS } from '../src/types'
import type { Player, Ratings, Segment, Specialty, Team } from '../src/types'
import { terrainWeights } from '../src/data/segmentWeights'

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
  const want = [[-0.0077, 0.0039], [-0.0035, 0.0018], [0, 0]]
  check('数字が仕様どおり（攻め -0.77%/+0.39% ・ 標準 -0.35%/+0.18% ・ 温存 0）',
    CHOICE_EFFECTS.every((e, i) => e.timeBonusSuccess === want[i][0] && e.timeBonusFail === want[i][1]),
    CHOICE_EFFECTS.map(e => `${e.timeBonusSuccess}/${e.timeBonusFail}`).join(' '))
  // 温存は「押しても何も起きない＝スキップと同じ」（オーナー決定）。
  // 100%でないと「何も起きないことに失敗する」という意味の無い判定になる
  check('温存は100%', choiceSuccessProb('conservative', 50, 50) === 1
    && choiceSuccessProb('conservative', 10, 90) === 1 && choiceSuccessProb('conservative', 90, 10) === 1)
  check('温存は成功しても失敗しても0秒（スキップと同じ）',
    effectOf('conservative').timeBonusSuccess === 0 && effectOf('conservative').timeBonusFail === 0)
  // 失敗は「そこそこ遅くなる」＝得の半分（オーナー決定）。
  // ここを得と同じにすると、低確率の攻めはどの場面でも損＝押した人が必ず損する罠になる
  const halfRatio = (h: Hand) => effectOf(h).timeBonusFail / -effectOf(h).timeBonusSuccess
  check('失敗の減点は得の半分（攻め・標準とも）',
    Math.abs(halfRatio('aggressive') - 0.5) < 0.02 && Math.abs(halfRatio('balanced') - 0.5) < 0.02,
    `攻め ${halfRatio('aggressive').toFixed(3)} / 標準 ${halfRatio('balanced').toFixed(3)}`)
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
  check('温存は押しても何も起きない（スキップと同じ）', ev('conservative', 0) === 0 && ev('conservative', 30) === 0)
}

console.log('\n[3] 攻めの成功率の幅（低確率・高リターンが成立しているか）')
{
  // ★ここは実際に踏んだ穴。攻めの上限が 55% だと、実力差がいくつでも標準のほうが得で、
  //   **攻めが一度も最良にならない**（低確率なぶんの高リターンが上限で頭打ちになるため）。
  //   65% にして解消。数字を下げるならここが落ちる。
  const pAgg = (g: number) => choiceSuccessProb('aggressive', 50 + g, 50)
  const pBal = (g: number) => choiceSuccessProb('balanced', 50 + g, 50)
  console.log(`      攻め ${(pAgg(-40) * 100).toFixed(0)}〜${(pAgg(40) * 100).toFixed(0)}%（互角 ${(pAgg(0) * 100).toFixed(0)}%）`
    + ` / 標準 ${(pBal(-40) * 100).toFixed(0)}〜${(pBal(40) * 100).toFixed(0)}%（互角 ${(pBal(0) * 100).toFixed(0)}%）`)
  check('攻めは 8〜65%（互角で20%）', pAgg(-40) === 0.08 && pAgg(40) === 0.65 && Math.abs(pAgg(0) - 0.20) < 1e-9)
  check('標準は 30〜92%（互角で62%）', pBal(-40) === 0.30 && pBal(40) === 0.92 && Math.abs(pBal(0) - 0.62) < 1e-9)
  check('攻めは標準より低確率（どの実力差でも）',
    [-40, -20, -10, 0, 10, 20, 40].every(g => pAgg(g) < pBal(g)))

  // 上限を下げるとどうなるかを、この場で計算して確かめる（「65でよかった」の根拠を残す）
  const bestWithCap = (cap: number, gap: number): Hand => {
    const evc = (h: Hand) => {
      const e = effectOf(h)
      const p = h === 'aggressive'
        ? Math.min(cap, choiceSuccessProb(h, 50 + gap, 50))
        : choiceSuccessProb(h, 50 + gap, 50)
      return p * e.timeBonusSuccess + (1 - p) * e.timeBonusFail
    }
    return HANDS.reduce((a, b) => (evc(b) < evc(a) ? b : a))
  }
  const GAPS = Array.from({ length: 51 }, (_, i) => i - 25)
  check('上限55%だと攻めが一度も最良にならない（＝65%が要る理由）',
    GAPS.every(g => bestWithCap(0.55, g) !== 'aggressive'))
  check('いまの上限なら攻めが最良になる実力差がある',
    GAPS.some(g => bestWithCap(1, g) === 'aggressive'))
}

const R = (n: number): Ratings => ({
  speed: n, stamina: n, mountainUp: n, mountainDown: n, pacing: n, mental: n, recovery: n })
const P = (id: string, teamId: string, n: number, specialty: Specialty = 'allrounder'): Player => ({
  id, name: id, age: 25, teamId, status: 'active', specialty,
  ratings: R(n), potential: n, morale: 70, fatigue: 0, form: 0,
  contract: { salary: 1000, yearsLeft: 2 },
  career: { races: 0, wins: 0, championships: 0, segmentAwards: 0 },
} as unknown as Player)
const T = (id: string): Team => ({ id, name: id, shortName: id } as unknown as Team)

console.log('\n[4] 自分と相手が同じ目盛り（相手も自然消耗を引いたあと）')
{
  const me = P('me', 'my', 65)
  const cpus = Array.from({ length: 12 }, (_, i) => P(`c${i}`, `t${i}`, 60 + i))
  const teams = [T('my'), ...cpus.map(c => T(c.teamId))]
  const cpuLineups: Record<string, Record<number, string>> = {}
  for (const c of cpus) cpuLineups[c.teamId] = { 0: c.id }

  // 区間の長さを変えて見る。**消耗は距離で変わる**ので、長い区間ほどズレが大きく出る
  // ★**実在する区間と同じ形にすること。** 区間は必ず重みを持つ（`data/segmentWeights`）。
  //   重み無しで組むと score の目盛りがずれ、この点検だけが別の世界を見ることになる
  const mk = (km: number, up: number, down: number): Segment =>
    ({ index: 0, distanceKm: km, uphillPct: up, downhillPct: down, statWeights: terrainWeights(km, up, down) })
  const SEGS: [string, Segment][] = [
    ['10km 平坦', mk(10, 0, 0)],
    ['20km 平坦', mk(20, 0, 0)],
    ['22km 登り45%', mk(22, 45, 0)],
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
        isFirstSeg: i % 7 === 0, isLastSeg: false, player: me, totalSegs: 7,
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
    // ★**目盛りの大きさに依らない形で見ること。** 以前は `aggLo > 12`（一番きつい場面でも
    //   12%より上）と書いていたが、これは score の目盛りが 1.09 倍に水増しされていた頃の
    //   校正値だった（2026-08-20 に重みを 1.00 へ正規化して、この判定だけが落ちた）。
    //   本当に見たいのは「場面によって成功率が変わるか」で、それは幅で見るのが正しい。
    //   生のOVRを相手にする（＝消耗を引かない）バグでは gap が -20〜-41 に沈み、
    //   **どの場面でも下限に張り付く＝幅が 0** になるので、この形でも必ず落ちる。
    check(`${label}：攻めの成功率が場面で変わる（下限に張り付いていない）`, aggHi - aggLo > 15,
      `${aggLo.toFixed(0)}〜${aggHi.toFixed(0)}%（幅 ${(aggHi - aggLo).toFixed(0)}）`)

    // ★**ここが本体。目盛りが同じかを、目盛りの大きさに依らない形で見る。**
    //   自分とまったく同じ能力の相手なら gap は 0 でなければならない。
    //   相手だけ消耗を引き忘れる（＝左右で単位が違う）と、その分だけ必ずずれる。
    //   上の2つ（`lo > -20` と 幅）はどちらも**校正値**なので、目盛りが変わると
    //   バグを入れても素通りする（2026-08-20 に正規化したとき実際に素通りした）。
    const twin = P('twin', 'tw', 65)
    const twinLineups: Record<string, Record<number, string>> = { tw: { 0: 'twin' } }
    const evs2 = generateSegmentEvents({
      seg, playerBaseTime: 3000, cpuTimesForSeg: { tw: 3000 },
      cumulativeTimes: { __player__: 9000, tw: 9000 },
      isFirstSeg: false, isLastSeg: false, player: me, totalSegs: 7,
      players: [me, twin], cpuLineups: twinLineups, teams: [T('my'), T('tw')] })
    const twinGaps = evs2.filter(e => e.opponentOvr != null).map(e => myStamina - e.opponentOvr!)
    // 開いてよいのは**得意タイプのぶんだけ**（`withSpecBonus` が相手から SPEC_BONUS を引く）。
    // 相手の消耗を引き忘れると距離ぶんずれる（10kmで13・20kmで26・22kmで29）。
    // ★**距離を3つ見ているのが効いている**——消耗は距離で増えるが得意ぶんは 8 で一定なので、
    //   短い区間では許容に隠れても、長い区間で必ず外へ出る
    check(`${label}：同じ能力の相手なら gap は得意ぶんまで（左右が同じ目盛り）`,
      twinGaps.length > 0 && twinGaps.every(g => Math.abs(g) <= SPEC_BONUS + 0.01),
      twinGaps.length === 0 ? '相手が出てきませんでした'
        : `${Math.min(...twinGaps).toFixed(1)}〜${Math.max(...twinGaps).toFixed(1)}（許容 ±${SPEC_BONUS}）`)
  }
}

console.log('\n[5] 場面ごとに効き幅が違う（給水と山岳が同じ数字ではない）')
{
  const T4722 = 4722
  const ROWS = Object.entries(EVENT_SCALE).sort((a, b) => a[1] - b[1])
  for (const [id, k] of ROWS) {
    const win = Math.abs(CHOICE_EFFECTS[0].timeBonusSuccess) * k * T4722
    console.log(`      ${id.padEnd(17)} ×${k}  攻め 成功-${win.toFixed(0)}秒 / 失敗+${(win / 2).toFixed(0)}秒`)
  }
  check('7種＋ラスト勝負の8つ全部に効き幅がある', ROWS.length === 8, `${ROWS.length}件`)
  // ★リテラルで留める。表を読んで表と比べても何も守れない
  const want: Record<string, number> = {
    water_station: 0.5, start_dash: 0.8, front_pressure: 0.9, pack_race: 1.0,
    catching_up: 1.1, mountain_descent: 1.2, mountain_ascent: 1.3, final_push: 1.4 }
  check('効き幅が仕様どおり', ROWS.every(([id, k]) => want[id] === k),
    ROWS.map(([id, k]) => `${id}=${k}`).join(' '))
  check('給水がいちばん小さい', ROWS[0][0] === 'water_station')
  check('ラスト勝負がいちばん大きい', ROWS[ROWS.length - 1][0] === 'final_push')
  check('全部が同じ値ではない', new Set(ROWS.map(r => r[1])).size > 1)
  // 効き幅は resolveChoice で1回だけ掛かる（イベント側に別の割合の表を持たせない）
  const ev0 = { id: 'x', type: 'x', trigger: { type: 'stamina' } as const, situation: '', battleContext: '',
    choices: [], opponentOvr: 1, _effects: CHOICE_EFFECTS }
  const small = resolveChoice({ ...ev0, scale: 0.5 }, 0, 99, 10000)
  const big = resolveChoice({ ...ev0, scale: 1.4 }, 0, 99, 10000)
  // opponentOvr=1・segStamina=99 なら攻めも上限80%…なので成否で揺れる。成功どうしで比べる
  const winAt = (k: number) => {
    for (let i = 0; i < 200; i++) {
      const r = resolveChoice({ ...ev0, scale: k }, 0, 99, 10000)
      if (r.success) return r.timeDelta
    }
    return NaN
  }
  void small; void big
  check('効き幅が大きいほど動く（0.5倍 < 1.4倍）', Math.abs(winAt(1.4)) > Math.abs(winAt(0.5)) * 2,
    `${winAt(0.5)}秒 vs ${winAt(1.4)}秒`)
}

console.log('\n[6] 得意な適性が成功率に効く（文言を変えるだけになっていない）')
{
  const SPECS = Object.keys(SPECIALTY_LABELS) as Specialty[]
  const used = new Set(Object.values(EVENT_SPECIALTIES).flat())
  check('9タイプ全部に出番がある', SPECS.every(sp => used.has(sp)),
    `出番の無いタイプ=${SPECS.filter(sp => !used.has(sp)).map(sp => SPECIALTY_LABELS[sp]).join(',') || 'なし'}`)
  check('給水はどの適性も効かない', (EVENT_SPECIALTIES.water_station ?? []).length === 0)
  check('起伏型は登りと下りの両方',
    EVENT_SPECIALTIES.mountain_ascent.includes('undulating') && EVENT_SPECIALTIES.mountain_descent.includes('undulating'))
  check('加点は8', SPEC_BONUS === 8, `${SPEC_BONUS}`)

  // ★実際にイベントを作らせて、得意な選手のほうが成功率が高いことを見る。
  //   `EVENT_SPECIALTIES` を読んで比べるだけだと、表を無視して作っていても通ってしまう
  const seg: Segment = { index: 0, distanceKm: 20, uphillPct: 45, downhillPct: 0 }
  const cpus = Array.from({ length: 12 }, (_, i) => P(`c${i}`, `t${i}`, 66))
  const teams = [T('my'), ...cpus.map(c => T(c.teamId))]
  const cpuLineups: Record<string, Record<number, string>> = {}
  for (const c of cpus) cpuLineups[c.teamId] = { 0: c.id }
  const avgOpponent = (spec: Specialty) => {
    const me = P('me', 'my', 65, spec)
    const segOvr = calcSegOvr(me, seg)
    const myStam = Math.max(1, segOvr - calcNaturalDrain(segOvr, seg.distanceKm))
    let sum = 0, n = 0
    for (let i = 0; i < 400; i++) {
      const cpuTimes: Record<string, number> = {}
      cpus.forEach((c, k) => { cpuTimes[c.teamId] = 3000 + (k - 6) * 40 })
      const cum: Record<string, number> = { __player__: 9000 }
      cpus.forEach((c, k) => { cum[c.teamId] = 9000 + (k - 6) * 50 })
      for (const e of generateSegmentEvents({
        seg, playerBaseTime: 3000, cpuTimesForSeg: cpuTimes, cumulativeTimes: cum,
        isFirstSeg: false, isLastSeg: false, player: me, totalSegs: 7,
        players: [me, ...cpus], cpuLineups, teams })) {
        if (e.id.startsWith('mountain_ascent') && e.opponentOvr != null) {
          sum += choiceSuccessProb('aggressive', myStam, e.opponentOvr); n++
        }
      }
    }
    return n > 0 ? (sum / n) * 100 : NaN
  }
  const up = avgOpponent('mountain_up')
  const flat = avgOpponent('sprinter')
  // ★母数の確認。1件も拾えていないと NaN 同士の比較になって静かに通る
  check('山岳イベントを実際に拾えている', Number.isFinite(up) && Number.isFinite(flat))
  console.log(`      山岳で「攻める」の成功率： 山登り ${up.toFixed(0)}%  /  スプリンター ${flat.toFixed(0)}%`)
  check('山岳では山登り型のほうが成功率が高い', up > flat + 10, `${up.toFixed(0)}% vs ${flat.toFixed(0)}%`)
}

console.log('\n[7] ラスト勝負が実際に出る（発火地点だけあってイベントが無い、を防ぐ）')
{
  // ★世界の作り方に注意。並走（総合8秒以内に2つ）・追い上げ（区間タイムが10秒以内に前）・
  //   先頭プレッシャー（自分が1位）はどれも**ラスト勝負より先に判定される**ので、
  //   そこへ落ちない世界を作らないと final_push の枝に一度も到達しない
  //   （最初に書いた版がこれで、300回まわして pack_race×300 だった）
  const seg: Segment = { index: 6, distanceKm: 20, uphillPct: 0, downhillPct: 0 }
  const me = P('me', 'my', 65)
  const cpus = Array.from({ length: 12 }, (_, i) => P(`c${i}`, `t${i}`, 60 + i))
  const teams = [T('my'), ...cpus.map(c => T(c.teamId))]
  const cpuLineups: Record<string, Record<number, string>> = {}
  for (const c of cpus) cpuLineups[c.teamId] = { 6: c.id }
  /** 区間タイムは全員10秒より遅く、総合は300秒以上離す（自分は7位） */
  const world = () => {
    const cpuTimes: Record<string, number> = {}
    cpus.forEach((c, k) => { cpuTimes[c.teamId] = 3000 + (k + 1) * 100 })
    const cum: Record<string, number> = { __player__: 9000 }
    cpus.forEach((c, k) => { cum[c.teamId] = 9000 + Math.round((k - 5.5) * 600) })
    return { cpuTimes, cum }
  }
  const gen = (isLastSeg: boolean) => {
    const { cpuTimes, cum } = world()
    return generateSegmentEvents({
      seg, playerBaseTime: 3000, cpuTimesForSeg: cpuTimes, cumulativeTimes: cum,
      isFirstSeg: false, isLastSeg, player: me, totalSegs: 7,
      players: [me, ...cpus], cpuLineups, teams })
  }
  const seen = new Map<string, number>()
  const ratios: number[] = []
  let lastHits = 0
  const N = 200
  for (let i = 0; i < N; i++) {
    for (const e of gen(true)) {
      const base = e.id.split('_seg')[0]
      seen.set(base, (seen.get(base) ?? 0) + 1)
      if (base === 'final_push') {
        lastHits++
        if (e.trigger.type === 'ratio') ratios.push(e.trigger.min)
      }
    }
  }
  console.log('      最終区で出たイベント： ' + [...seen].map(([k, v]) => `${k}×${v}`).join(' '))
  check('ラスト勝負が出る', (seen.get('final_push') ?? 0) > 0)
  check('最終区では必ずラスト勝負', lastHits === N, `${lastHits}/${N}`)

  // 発火地点は終盤（74〜88%）。中盤で出ては「ラスト勝負」にならない
  check('発火地点を拾えている', ratios.length > 0, `${ratios.length}件`)   // ★母数の確認
  if (ratios.length > 0) {
    const rlo = Math.min(...ratios), rhi = Math.max(...ratios)
    console.log(`      発火地点 ${(rlo * 100).toFixed(0)}〜${(rhi * 100).toFixed(0)}%`)
    check('発火地点が終盤（74〜88%）', rlo >= 0.74 && rhi < 0.89,
      `${(rlo * 100).toFixed(0)}〜${(rhi * 100).toFixed(0)}%`)
  }

  // 最終区でなくても、前後20秒以内の競り合いなら出る。離れていれば出ない
  const mid = new Map<string, number>()
  for (let i = 0; i < N; i++) for (const e of gen(false)) {
    const base = e.id.split('_seg')[0]
    mid.set(base, (mid.get(base) ?? 0) + 1)
  }
  console.log('      途中の区間（前後300秒差）： ' + [...mid].map(([k, v]) => `${k}×${v}`).join(' '))
  check('離れていればラスト勝負は出ない', (mid.get('final_push') ?? 0) === 0, `${mid.get('final_push') ?? 0}件`)
  check('その場合は給水になる', (mid.get('water_station') ?? 0) === N, `${mid.get('water_station') ?? 0}/${N}`)
}

console.log(failed === 0 ? '\nOK' : `\nNG ${failed}件`)
process.exit(failed === 0 ? 0 : 1)
