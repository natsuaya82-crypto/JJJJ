/**
 * 【士気が本当に効いているか】
 *
 * ■なにが起きていたか（オーナー・2026-08-19「モラールって何？しかも機能してる？」）
 *   士気はタイムに直接掛かる（70で±0・100で+3%・10で−4.3%）のに、
 *   実際に回すと**2年で世界中が100に張り付いて**いました。
 *
 *     CPU・海外の全選手      95 → 100 → 100 → …
 *     自チーム（中位以上）   95 → 100 → 100 → …
 *
 *   ・`growPlayer` が毎年 全選手に +5。下がる口が1つも無い
 *   ・レースで士気が動くのは**自チームだけ**（232クラブ5,800人は一生100）
 *
 *   全員が同じ値なら、掛けていないのと同じです。
 *
 * ■いまの決まり
 *   走るたびに既定値(70)へ `MORALE_RECOVER` ぶん戻してから、着順ぶんを足す。
 *   動くのは**走ったクラブ全部**（国内も海外も自チームも同じ1本）。
 *
 * ■この点検の作り
 *   ソースを見るだけにしないこと。**実際に6年ぶん回して分布を数えます**
 *   （「上限に張り付いていないか」はソースの字面からは分かりません）。
 */
import { applyRaceMorale, standingOf, moraleDeltaForRank, MORALE_RECOVER } from '../src/engine/raceMorale'
import { calcConditionModifier } from '../src/engine/raceEngine'
import { logicSource } from './storeSource'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

// ── ① 士気を動かす口は1本（applyRaceMorale）だけ ──
const logic = logicSource()
const calls = (logic.match(/(?<!function )applyRaceMorale\(/g) ?? []).length
check('士気を動かすのは applyRaceMorale だけ（自分の部＋裏の部／海外リーグ の2か所）', calls === 2, `${calls}か所`)

// ── ② 毎年の底上げが戻っていないこと ──
const growth = readFileSync('src/engine/growth.ts', 'utf8')
check('growPlayer は士気を触らない', !/withMorale\(|morale:/.test(growth))

// ── ③ 既定値へ戻してから足していること ──
const src = readFileSync('src/engine/raceMorale.ts', 'utf8')
check('既定値へ戻す割合を持っている', MORALE_RECOVER > 0 && MORALE_RECOVER < 1, String(MORALE_RECOVER))
check('戻してから着順ぶんを足している', /MORALE_DEFAULT - \(p\.morale/.test(src))

// ── ④ 着順ぶんは出走クラブ数で決まる（部で数が違う） ──
check('1位は上がる', moraleDeltaForRank(1, 20) > 0)
check('最下位は下がる', moraleDeltaForRank(20, 20) < 0)
check('中位は動かない', moraleDeltaForRank(10, 20) === 0)
check('出走数が変われば「下位」の線も動く', moraleDeltaForRank(14, 16) < 0 && moraleDeltaForRank(14, 20) === 0)

// ── ⑤ 実際に6年ぶん回す。★ここが本体（張り付いていないか・差がつくか） ──
const CLUBS = 20, PER = 25
let players: any[] = []
for (let c = 0; c < CLUBS; c++) for (let i = 0; i < PER; i++)
  players.push({ id: `c${c}p${i}`, teamId: `c${c}`, status: 'active', morale: 90 })
const mul = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const rng = mul(7)
const allIds = new Set(players.map(p => p.id))
for (let year = 1; year <= 6; year++) for (let r = 0; r < 10; r++) {
  const order = [...Array(CLUBS).keys()].map(c => ({ c, k: c + (rng() - 0.5) * 6 })).sort((a, b) => a.k - b.k)
  players = applyRaceMorale({
    players, standing: standingOf(order.map((o, i) => ({ teamId: `c${o.c}`, rank: i + 1 }))),
    segWinIds: new Set(), racingIds: allIds })
}
const ms = players.map(p => p.morale as number).sort((a, b) => a - b)
const pinned = ms.filter(m => m >= 100).length / ms.length
const strong = players.find(p => p.teamId === 'c0')!.morale as number
const weak = players.find(p => p.teamId === `c${CLUBS - 1}`)!.morale as number
check('上限に張り付いていない', pinned === 0, `${(pinned * 100).toFixed(1)}%`)
check('強いクラブと弱いクラブで差がつく', strong - weak >= 20, `強${Math.round(strong)} / 弱${Math.round(weak)}`)
const spread = calcConditionModifier(0, ms[ms.length - 1], 0) / calcConditionModifier(0, ms[0], 0) - 1
check('タイム差がレースのブレ(±4%)に埋もれない', spread >= 0.02, `${(spread * 100).toFixed(1)}%`)

console.log(failed === 0 ? '✓ 士気: OK' : `✗ ${failed}件`)
process.exit(failed === 0 ? 0 : 1)
