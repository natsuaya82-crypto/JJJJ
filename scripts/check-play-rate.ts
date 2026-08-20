/**
 * **出場率が移籍の判断に本当に届いているか**の網（`utils/playRate` の `playRateOf`）。
 * 格の関門そのものは `check-player-tier` が見る（世界を1つ作って流す）。
 *
 * ■なぜ要るのか
 *   `appraiseMove` にはオーナー指示（2026-08-14「格下げてまでエースになりたいやつ
 *   いないだろ。海外でやってる久保がいきなりJ3に移籍するか？」）で入れた関門があります。
 *
 *       starterNow  = races >= 3 && frac >= 0.5
 *       tooFarDown  = !freeAgent && !declining && starterNow && -gap >= MAX_TIER_DROP_FOR_STARTER
 *
 *   ところが `playFraction` / `teamRaces` が**省略可**だったため、7つの呼び出し口のうち
 *   **移籍の唯一の経路（`engine/transferMarket.ts`）を含む5つ**が渡しておらず、
 *   既定の `teamRaces = 0` が入って `starterNow` が**常に false**。
 *   関門は書いてあるのに**世界中で一度も発火していませんでした**（2026-08-20 に発覚）。
 *
 *   実測（232クラブ5800人・1年）：格下へ動いた 561件のうち **131件（23.4%）が本来は止まる**
 *   （OVR85+ が58件、78-84 が72件）。
 *
 * ■この点検が見るもの
 *   ① 型が必須のままか（`MoveContext` の2つに `?` が付いていない）
 *   ② 呼び出し口に 0.5 / 0 の手書きが無いか（**否定**なので安全側）
 *   ③ 今季走っている選手を「1戦も走っていない」にしないこと
 */
import { playRateOf } from '../src/utils/playRate'
import { logicSource } from './storeSource'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Race, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
/** コメントを外してから見る（この点検の説明文や、コードの中の経緯の説明に当たるため） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// ── ① 型が必須のままか ──────────────────────────────
console.log('[1] 出場率は省略できない（型）')
{
  const src = readFileSync('src/utils/transferDecision.ts', 'utf8')
  const ctx = src.slice(src.indexOf('export type MoveContext'), src.indexOf('export type Appraisal'))
  check('MoveContext.playFraction が必須', /^\s*playFraction: number/m.test(ctx),
    '`playFraction?:` に戻すと、渡し忘れた呼び出し口で関門が黙って死にます')
  check('MoveContext.teamRaces が必須', /^\s*teamRaces: number/m.test(ctx))
  const pu = strip(readFileSync('src/utils/playerUtils.ts', 'utf8'))
  check('playerConsentToMove の2つも必須',
    /playFraction: number, teamRaces: number/.test(pu),
    '`playFraction = 0.5, teamRaces = 0` に戻さないこと')
}

// ── ② 手書きが無いか（否定） ─────────────────────────
console.log('[2] 0.5 / 0 を手書きしていない')
{
  const compSrc = readdirSync('src/components', { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map(f => readFileSync(join('src/components', f), 'utf8')).join('\n')
  const all = strip(logicSource() + '\n' + compSrc)
  // `playerConsentToMove(..., 0.5, 0, ...)`（位置引数）
  // ★改行をまたぐこと。`srcTier,\n  0.5, 0, 0, ...` と折り返されると、
  //   `/, 0\.5, 0,/` は**1件も当たりません**（実際にそれで空振りしました）
  check('playerConsentToMove に 0.5, 0 を渡していない', !/,\s*0\.5,\s*0,/.test(all))
  // `appraiseMove(..., { playFraction: 0.5, teamRaces: 0 })`（名前つき）
  check('appraiseMove に 0.5 / 0 を書いていない',
    !/playFraction: 0\.5/.test(all) && !/teamRaces: 0(?!\.)/.test(all.replace(/fraction: 0\.5, teamRaces: 0 \}/g, '')))
  // 移籍の唯一の経路が playRateOf を通っているか（**入口の数と通っている数を両方数える**）
  const tm = strip(readFileSync('src/engine/transferMarket.ts', 'utf8'))
  check('transferMarket が playRateOf を通る', /playRateOf\(/.test(tm),
    '出場率を数え直さず playRateOf 1本から引くこと')
  check('transferMarket が season.races を直に数えていない',
    !/season\.races\b(?!\s*\?\?\s*\[\])/.test(tm.replace(/ctx\.season\.races \?\? \[\]/g, '')),
    '自分の部の日程しか入っていないので、他の部と海外の212クラブが全員「0戦」になります')
}

// ── ⑥ 今季走っている選手を「1戦も走っていない」にしないこと ────────────
//    前シーズンの日程は「**いまのクラブ**が去年走ったぶん」なので、今年そこへ移ってきた
//    選手は1本も載っていません。今季もう走っているのにそちらを見ると 0/10 になり、
//    `appraiseMove` の `unproven`（今のクラブで1戦も走っていない）に当たります。
const YEAR = 2030
const HI = 'hi'
const teams = [{ id: HI, name: HI, shortName: HI, division: 1, tier: 5 }] as unknown as Team[]
console.log('[3] 今季走っている選手は、前シーズンで上書きされない')
{
  const mk = (id: string, runners: string[]): Race => ({
    id, name: id, date: `${YEAR}-01-01`, segments: [{ distanceKm: 10, uphillPct: 0, downhillPct: 0 }],
    results: { teamResults: [], segmentResults: [{ segment: 1, runners: runners.map(p => ({ playerId: p, teamId: HI })) }] },
  } as unknown as Race)
  const thisSeason = { races: [mk('r1', ['p']), mk('r2', ['p']), mk('r3', ['p'])] }
  // 前季：同じクラブが10戦。本人はそのクラブに居なかったので0戦
  const prev = { races: Array.from({ length: 10 }, (_, i) => mk(`q${i}`, ['other'])) }
  const r = playRateOf('p', HI, thisSeason, teams, [], prev)
  check('⑥ 3戦フル出場なら、前季を渡しても出場率100%', r.fraction === 1 && r.races === 3,
    `fraction=${r.fraction} races=${r.races} teamRaces=${r.teamRaces}`)
  // 空振りでないこと：今季まだ1戦も走っていないなら、前季を見る（本来の目的）
  const notYet = { races: [mk('r1', ['other']), mk('r2', ['other'])] }
  const prevFull = { races: Array.from({ length: 10 }, (_, i) => mk(`q${i}`, ['p'])) }
  const r2 = playRateOf('p', HI, notYet, teams, [], prevFull)
  check('⑥ 空振りでない（今季まだ走っていなければ前季を見る）', r2.fraction === 1 && r2.teamRaces === 10,
    `fraction=${r2.fraction} teamRaces=${r2.teamRaces}`)
}

process.exit(failed > 0 ? 1 : 0)
