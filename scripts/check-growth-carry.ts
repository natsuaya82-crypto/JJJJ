/**
 * 【CPU・海外の選手も、ちゃんとポテンシャルへ向かって伸びる】
 *
 * ■なぜ要るのか（オーナー・2026-08-16）
 *   「でも成長してないからそんな弱いんじゃないの？普通に92とか見なくなったし。格の高いチームでも」
 *
 *   `growPlayer` の年次成長が
 *
 *       const gain = Math.floor(1年ぶんのEXP / 必要EXP)
 *
 *   で、**足りなかったぶんを毎年捨てて**いました。必要EXPは
 *   `0.5 × 能力² ×（80以上で2倍・90以上で4倍）`なので、1年ぶんを超えた時点で
 *   **永久に 0** になります。
 *
 *     格1（3.0倍）  … 1能力あたり 4,539／年 → 能力80の必要EXP 6,400 で頭打ち
 *     格20（1.5倍） … 1能力あたり 2,270／年 → 能力75の必要EXP 2,812 で**1度も伸びない**
 *
 *   実測（19歳OVR75・ポテ99＝上限まで育てばOVR93 の選手を引退まで）
 *
 *     | | 直す前 | 直したあと |
 *     |---|---|---|
 *     | 格1  | 80どまり | 83 |
 *     | 格10 | **75のまま（1も伸びない）** | 78 |
 *     | 格20 | **75のまま（1も伸びない）** | 77 |
 *
 *   つまり **CPU・海外の選手は成長でOVR80を超えられません**でした。世界にいる
 *   OVR85+は「最初からそう作られた選手」だけで、その世代が老けると二度と現れない。
 *   同じ世界を12年回すと OVR85+ が **702人 → 154人**まで落ちていました。
 *
 *   自チーム側（`processExpGains`）は最初から貯めて使う形だったので、**同じにしました。**
 *
 * ■この点検が守るもの
 *   ①どの格でも、育てれば実際にOVRが上がる（格20でも止まらない）
 *   ②格が高いほど速い（倍率が効いている）
 *   ③余ったEXPが持ち越されている（`Math.floor(per/need)` に戻ったら落ちる）
 */
import { readFileSync } from 'node:fs'
import { growPlayer } from '../src/engine/growth'
import { buildRatingsForRank, generateCpuRosters } from '../src/engine/playerGenerator'
import { ovr, getStatPotentials, RETIRE_AGE_MIN, RETIRE_AGE_MAX, retirementAgeOf } from '../src/utils/playerUtils'
import { INITIAL_TEAMS } from '../src/data/teams'
import { TIER_POTENTIAL_CAP } from '../src/utils/clubTier'
import type { ClubTier, Player } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
// ★1人だけで見ないこと。衰えの判定に `Math.random` が入っているので、1人だと
//   引きしだいで ±2 ぶれる（最初にそう書いて、伸びているのに落ちる回があった）
const SRC = generateCpuRosters(INITIAL_TEAMS.slice(0, 2), YEAR).cpuPlayers
  .filter(p => p.growthCurve === 'normal').slice(0, 20)

/** 19歳からピーク（27歳）まで育てて、OVRが平均いくつ上がったか */
function grownBy(tier: ClubTier) {
  const outs = SRC.map(src => {
    // ランクAで始める（Sだと格10以下では最初から上限に張り付いていて伸びしろが無い）
    const { ratings, potential } = buildRatingsForRank({
      id: src.id, rank: 'A', specialty: src.specialty, growthCurve: 'normal', age: 19,
      potentialCap: TIER_POTENTIAL_CAP[tier],
    })
    let p: Player = { ...src, age: 19, ratings, potential, exp: {} }
    const start = ovr(p)
    const capOvr = ovr({ ...p, ratings: getStatPotentials(p) })
    // ピークまで（28歳以降は衰えが入るので「育つか」を見る窓としては使わない）。
    // ★**`growPlayer` は中で加齢する**（`age: nextAge` を返す）。呼ぶ側で `age + 1` を
    //   足さないこと——足すと1回で2歳進み、ピークまでのつもりが引退年齢まで走って
    //   衰えぶんを測ることになる（2026-08-16 に実際にそう測って読み違えた）
    while (p.age < 27) p = growPlayer(p, true, tier)
    return { start, end: ovr(p), capOvr }
  })
  const avg = (f: (o: typeof outs[0]) => number) => outs.reduce((a, o) => a + f(o), 0) / outs.length
  return { start: avg(o => o.start), end: avg(o => o.end), gain: avg(o => o.end - o.start), capOvr: avg(o => o.capOvr) }
}

console.log('[1] どの格でも、育てれば実際に伸びる（19歳→27歳・20人の平均）')
const got: Record<number, ReturnType<typeof grownBy>> = {}
for (const t of [1, 5, 10, 20] as ClubTier[]) {
  got[t] = grownBy(t)
  console.log(`      格${String(t).padStart(2)}  OVR ${got[t].start.toFixed(1)} → ${got[t].end.toFixed(1)}（+${got[t].gain.toFixed(1)}）／上限まで育つと ${got[t].capOvr.toFixed(1)}`)
}
for (const t of [1, 5, 10, 20]) {
  // ★ここが本体。**格20でも止まらないこと**（直す前は +0 だった）
  check(`格${t}で伸びている`, got[t].gain > 0, `+${got[t].gain.toFixed(1)}`)
}

console.log('\n[2] 格が高いほど速い（倍率が効いている）')
{
  check('格1 > 格20', got[1].gain > got[20].gain, `${got[1].gain.toFixed(1)} vs ${got[20].gain.toFixed(1)}`)
  check('格1 ≧ 格5 ≧ 格10 ≧ 格20',
    got[1].gain >= got[5].gain && got[5].gain >= got[10].gain && got[10].gain >= got[20].gain,
    [1, 5, 10, 20].map(t => `格${t}:+${got[t].gain.toFixed(1)}`).join(' / '))
}

console.log('\n[3] 余ったEXPを捨てていない')
{
  const g = readFileSync('src/engine/growth.ts', 'utf8')
  // ★捨てる形（1年ぶん ÷ 必要EXP を切り捨て）に戻ったら落とす
  check('Math.floor(1年ぶん / 必要EXP) の形に戻っていない',
    !/Math\.floor\(per \/ Math\.max\(1, need\)\)/.test(g))
  check('貯めて使う形になっている', /acc -= need[\s\S]{0,40}cur\+\+/.test(g))
  check('持ち越したEXPを選手に書き戻している', /exp: expOut/.test(g))
  // 1年ぶんに満たない能力でも、翌年に持ち越されて必ずいつか上がる
  const { ratings, potential } = buildRatingsForRank({
    id: SRC[0].id, rank: 'S', specialty: SRC[0].specialty, growthCurve: 'normal', age: 19,
    potentialCap: TIER_POTENTIAL_CAP[20],
  })
  let p: Player = { ...SRC[0], age: 19, ratings, potential, exp: {} }
  p = growPlayer(p, true, 20)
  const carried = Object.values(p.exp ?? {}).some(v => (v ?? 0) > 0)
  check('1年育てた時点でEXPが残っている（空振りの緑ではない）', carried,
    JSON.stringify(p.exp))
}

console.log('\n[4] 引退年齢は30〜36（オーナー・2026-08-16）')
{
  check('下限が30', RETIRE_AGE_MIN === 30, String(RETIRE_AGE_MIN))
  check('上限が36', RETIRE_AGE_MAX === 36, String(RETIRE_AGE_MAX))
  const world = generateCpuRosters(INITIAL_TEAMS, YEAR).cpuPlayers
  const ages = world.map(p => retirementAgeOf(p))
  const lo = Math.min(...ages), hi = Math.max(...ages)
  console.log(`      実際の散らばり ${lo}〜${hi}（平均 ${(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)}）`)
  check('帯からはみ出さない', lo >= RETIRE_AGE_MIN && hi <= RETIRE_AGE_MAX, `${lo}〜${hi}`)
  check('1つの年齢に潰れていない', new Set(ages).size >= 5, `${new Set(ages).size}通り`)
  // 実力者は少し長く現役（ボーナスが効いている）
  const strong = world.filter(p => ovr(p) >= 80)
  const weak = world.filter(p => ovr(p) < 72)
  check('強い選手のほうが長く現役',
    strong.length > 0 && weak.length > 0
      && strong.reduce((a, p) => a + retirementAgeOf(p), 0) / strong.length
       > weak.reduce((a, p) => a + retirementAgeOf(p), 0) / weak.length)
  // 引退の話は1本（同じ式を他所に書かない）
  const store = readFileSync('src/store/slices/seasonSlice.ts', 'utf8')
  check('store に引退年齢の式を手書きしていない', !/32 \+ \(strHash|30 \+ \(strHash/.test(store))
}

console.log('')
if (failed > 0) { console.log(`✗ 成長・引退が壊れています（${failed}件）`); process.exit(1) }
console.log('✓ どの格でも伸びる。格が高いほど速い。引退は30〜36')
