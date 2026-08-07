/**
 * 移籍の「理由」が、実際に一番効いた要素になっているかを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-move-reason.ts --outfile=/tmp/cmr.cjs && node /tmp/cmr.cjs
 *
 * 見たいこと：出番が無いのに「憧れだから行きたい」のような、
 * 筋の通らない見出しが出ないこと。
 */
import { appraiseMove } from '../src/utils/transferDecision'
import type { Player } from '../src/types'

const p = {
  id: 'x', name: '野村 修平', age: 28, specialty: 'mountain', personality: 'salary', morale: 60,
  growthCurve: 'normal',
  ratings: { speed: 70, stamina: 70, power: 70, technique: 70, mental: 70 },
} as unknown as Player

const cases: { label: string; d: Parameters<typeof appraiseMove>[1]; ctx: Parameters<typeof appraiseMove>[2] }[] = [
  { label: '格上・憧れの地域・行き先で23番手', d: { clubId: 'a', tier: 4, squadRank: 23, squadSize: 28, inEcl: false, isForeign: true, region: 'africa' } as never, ctx: { srcTier: 12 } },
  { label: '格上・憧れの地域・行き先で3番手', d: { clubId: 'a', tier: 4, squadRank: 3, squadSize: 28, inEcl: false, isForeign: true, region: 'africa' } as never, ctx: { srcTier: 12 } },
  { label: '同格・国内・行き先で2番手',       d: { clubId: 'a', tier: 12, squadRank: 2, squadSize: 25, inEcl: false, isForeign: false } as never, ctx: { srcTier: 12 } },
  { label: '格下・国内・行き先で1番手',       d: { clubId: 'a', tier: 17, squadRank: 1, squadSize: 25, inEcl: false, isForeign: false } as never, ctx: { srcTier: 12 } },
  { label: '格上・地域違いの海外・20番手',   d: { clubId: 'a', tier: 6, squadRank: 20, squadSize: 28, inEcl: false, isForeign: true, region: 'europe' } as never, ctx: { srcTier: 12 } },
]

for (const c of cases) {
  const a = appraiseMove(p, c.d, c.ctx)
  console.log(`${c.label.padEnd(28)} → ${a.ok ? '行く' : '断る'} (${a.score.toFixed(2)})  ${a.reason}`)
}

// 取り合いの一覧が「どのクラブの話か」読めるかを見る
const fmtYen2 = (y: number) => y >= 1e8 ? `${(y/1e8).toFixed(1)}億` : `${Math.round(y/1e4)}万`
const offers = [
  { name: 'アムステル', price: 80_000_000, d: { clubId: 'a', tier: 6, squadRank: 4, squadSize: 26, inEcl: false, isForeign: true, region: 'europe' } },
  { name: '札幌', price: 74_000_000, d: { clubId: 'b', tier: 8, squadRank: 23, squadSize: 27, inEcl: false, isForeign: false } },
]
const sp = { ...p, specialty: 'sprinter' } as unknown as Player
console.log('')
console.log('（代理人）2クラブから佐藤 健司選手の獲得の打診が来ています。')
for (const o of offers) {
  const a = appraiseMove(sp, o.d as never, { srcTier: 12 })
  console.log(`・${o.name}（移籍金${fmtYen2(o.price)}）`)
  console.log(`　→ ${o.name}へは${a.ok ? '行きたい' : '行かない'}（${a.shortReason}）`)
}
