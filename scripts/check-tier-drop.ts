/**
 * 【格を下げてまでエースになりに行かない】いま走れている選手は、格が大きく下の
 * クラブへは移らない。ただし**衰えた選手は例外**（行き場が無いと引退するだけになる）。
 *
 * ■なぜ要るのか（オーナー判断・2026-08-14）
 *   「格下げてまでエースになりたいやついないだろ。海外でやってる久保がいきなり
 *    J3に移籍するか？」
 *
 *   点数の綱引きでは止まらない。行き先でエースになれる加点は +0.22 なのに、
 *   格差の減点は**1段 -0.04 しかない**ので、5段下でも 0.30+0.22=0.52 で
 *   同意ライン 0.50 を超えてしまう。実測：
 *
 *     直す前  1部の主力が2部の話を受ける割合 48%（格差は4〜5段下が最多・最大11段下）
 *     直した後 27%。**残った2段以上下は 220/220 が全部ピークを過ぎた選手**
 *
 *   なので `MAX_TIER_DROP_FOR_STARTER` の関門で止める（格上側の「1戦も走っていない
 *   選手は上へ行かない」と対の形）。
 *
 * ■もう1つ：出場率は今季が浅いうちは前シーズンを見る
 *   今季だけで数えると、前年フル出場だった選手も開幕から数戦は「出場率0」になり、
 *   格上への関門（unproven）で「実績なし」扱いになっていた。
 *   オーナー指摘「その前のシーズンは走ってるのにその表示」。
 */
import { appraiseMove, MAX_TIER_DROP_FOR_STARTER } from '../src/utils/transferDecision'
import { playRateOf, SETTLED_RACES } from '../src/utils/playRate'
import type { ClubTier } from '../src/utils/clubTier'
import type { Player, Race, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const mk = (age: number): Player => ({
  id: 'x', name: '試験 太郎', age, specialty: 'ace', personality: 'salary', morale: 60,
  growthCurve: 'normal', teamId: 'src', status: 'active',
  ratings: { speed: 85, stamina: 85, power: 85, technique: 85, mental: 85 },
  contract: { annualSalary: 5000, yearsLeft: 2 },
} as unknown as Player)

// 行き先＝そのクラブでエースになれる（一番おいしい条件）にして、それでも止まるかを見る
const dest = (tier: number) => ({
  clubId: 'dst', tier: tier as ClubTier, squadRank: 1, squadSize: 25,
  inEcl: false, isForeign: false, leagueRank: 1,
} as never)

const SRC_TIER = 7 as ClubTier
const starter = { srcTier: SRC_TIER, teamRaces: 10, playFraction: 1.0 }
const bench = { srcTier: SRC_TIER, teamRaces: 10, playFraction: 0.0 }

console.log(`[1] いま走れている全盛期の選手は、格${MAX_TIER_DROP_FOR_STARTER}段下へは行かない`)
{
  const young = mk(25)   // ピーク前
  const near = appraiseMove(young, dest(SRC_TIER + MAX_TIER_DROP_FOR_STARTER - 1), starter)
  const far = appraiseMove(young, dest(SRC_TIER + MAX_TIER_DROP_FOR_STARTER), starter)
  check(`${MAX_TIER_DROP_FOR_STARTER - 1}段下は行く`, near.ok, `score ${near.score.toFixed(2)}`)
  check(`${MAX_TIER_DROP_FOR_STARTER}段下は行かない`, !far.ok, `score ${far.score.toFixed(2)}`)
  // ★点数では止まっていないこと（止まっているなら関門が仕事をしていない＝空振りの緑）
  check('点数だけなら通ってしまう（関門で止めている）', far.score >= 0.5, `score ${far.score.toFixed(2)}`)
  const veryFar = appraiseMove(young, dest(20), starter)
  check('大きく下（格20）も行かない', !veryFar.ok)
}

console.log('\n[2] ピークを過ぎた選手は下へ行ける（行き場が無いと引退するだけ）')
{
  const old = mk(36)
  const far = appraiseMove(old, dest(SRC_TIER + MAX_TIER_DROP_FOR_STARTER), starter)
  check('衰えた主力は格下へ行く', far.ok, `score ${far.score.toFixed(2)}`)
  const veryFar = appraiseMove(old, dest(SRC_TIER + 6), starter)
  check('もっと下でも行く', veryFar.ok, `score ${veryFar.score.toFixed(2)}`)
}

console.log('\n[3] 控え（出番が無い選手）は格下へ出番を取りに行ける')
{
  const young = mk(25)
  const far = appraiseMove(young, dest(SRC_TIER + MAX_TIER_DROP_FOR_STARTER), bench)
  check('走れていない選手は格下へ行く', far.ok, `score ${far.score.toFixed(2)}`)
}

console.log('\n[4] 出場率は今季が浅いうちは前シーズンを見る')
{
  const teams = [{ id: 'src', division: 1 }] as unknown as Team[]
  const race = (i: number, ran: boolean): Race => ({
    id: `r${i}`, date: '2030-01-01', name: 'x', segments: [],
    results: { teamResults: [], segmentResults: [{ segment: 1, runners: ran ? [{ teamId: 'src', playerId: 'x' }] : [] }] },
  } as unknown as Race)
  // 前シーズン：8戦とも走った。今季：2戦済みでどちらも出ていない
  const prev = { races: Array.from({ length: 8 }, (_, i) => race(i, true)) }
  const now = { races: Array.from({ length: 2 }, (_, i) => race(100 + i, false)) }
  const withPrev = playRateOf('x', 'src', now, teams, undefined, prev)
  const without = playRateOf('x', 'src', now, teams)
  check('前シーズンを渡すと出場率が0にならない', withPrev.fraction > 0, `${withPrev.fraction}`)
  check('渡さなければ今までどおり今季だけ（0になる）', without.fraction === 0, `${without.fraction}`)
  // 今季が育ったら今季の数字に切り替わる
  const settled = { races: Array.from({ length: SETTLED_RACES }, (_, i) => race(200 + i, false)) }
  check(`今季が${SETTLED_RACES}戦こなしたら今季の数字を使う`,
    playRateOf('x', 'src', settled, teams, undefined, prev).fraction === 0)
}

console.log('')
if (failed > 0) { console.log(`✗ 格下への移籍の関門が効いていません（${failed}件）`); process.exit(1) }
console.log('✓ 全盛期の主力は格下へ行かない。衰えた選手と控えは行ける')
