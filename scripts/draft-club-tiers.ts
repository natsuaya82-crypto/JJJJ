// 232クラブを20段に振り分けた「草案」を出す。実装ではなく確認用の一覧。
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'

// 並べる順の素点。改修前の実測（上位10人の平均OVR）に寄せる。
// 国内は initialRank 1〜52 を 89.0〜71.0 に直線で割り当て。
// 海外はリーグの実測値を中心に、リーグ内の並び順で±3.5の幅を付ける。
const LEAGUE_BASE: Record<string, number> = {
  africa_ns: 86.3, africa_east: 86.3, north_america: 86.1, europe_ws: 85.5,
  europe_ne: 80.5, oceania: 80.2, asia_league: 79.8,
  central_america: 77.6, south_america: 77.2,
}
const SPREAD = 7

type Row = { id: string; name: string; where: string; score: number; rank?: number }
const rows: Row[] = []

for (const t of [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS]) {
  const r = t.initialRank ?? 52
  rows.push({ id: t.id, name: t.name, where: `JPEL ${t.division ?? 1}部 (${r}位)`, score: 89.0 - (r - 1) * (89.0 - 71.0) / 51, rank: r })
}
for (const lg of FOREIGN_LEAGUES) {
  const base = LEAGUE_BASE[lg.id] ?? 77
  const n = lg.clubs.length
  lg.clubs.forEach((c, i) => {
    rows.push({ id: c.id, name: c.name, where: lg.countryName, score: base + SPREAD / 2 - (i / Math.max(1, n - 1)) * SPREAD })
  })
}

// 段ごとのクラブ数。上ほど薄いピラミッド型にする。
// 格1は「レアル・バルサの位置」なので2クラブだけ。均等割り（各11〜12）だと上が厚すぎる。
const TIER_SIZE: number[] = [2, 4, 8, 12, ...Array(14).fill(13), 12, 12]   // 合計232

// 国内は最上位でも格4。initialRank 1〜52 を 格4〜格20 に割り当てる。
const JPEL_TOP_TIER = 4
const JPEL_BOTTOM_TIER = 20
const jpelTier = (initialRank: number) =>
  JPEL_TOP_TIER + Math.round((initialRank - 1) * (JPEL_BOTTOM_TIER - JPEL_TOP_TIER) / 51)

const domestic = rows.filter(r => r.where.startsWith('JPEL'))
const foreign = rows.filter(r => !r.where.startsWith('JPEL')).sort((a, b) => b.score - a.score)

// 先に国内を置いて、残りの席を海外で強い順に埋める
const buckets: Row[][] = Array.from({ length: 20 }, () => [])
for (const r of domestic) buckets[jpelTier(r.rank!) - 1].push(r)
let fi = 0
for (let t = 0; t < 20; t++) {
  const free = TIER_SIZE[t] - buckets[t].length
  for (let k = 0; k < free && fi < foreign.length; k++) buckets[t].push(foreign[fi++])
}
if (fi < foreign.length) console.log(`※ 席が足りず ${foreign.length - fi} クラブ余りました`)

console.log(`# 232クラブ → 20段 の振り分け草案（第2版）`)
console.log(`# ・格1は2クラブだけ（レアル・バルサの位置）。上ほど薄いピラミッド型`)
console.log(`# ・国内は最上位でも格${JPEL_TOP_TIER}。JPEL 1位→格${JPEL_TOP_TIER}、52位→格${JPEL_BOTTOM_TIER}`)
console.log('')
for (let t = 0; t < 20; t++) {
  const jp = buckets[t].filter(r => r.where.startsWith('JPEL')).length
  console.log(`## 格${t + 1}  （${buckets[t].length}クラブ${jp ? ` / うち国内${jp}` : ''}）`)
  for (const r of buckets[t]) console.log(`  ${r.name}  — ${r.where}`)
  console.log('')
}
