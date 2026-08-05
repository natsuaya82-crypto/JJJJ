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

type Row = { id: string; name: string; where: string; score: number }
const rows: Row[] = []

for (const t of [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS]) {
  const r = t.initialRank ?? 52
  rows.push({ id: t.id, name: t.name, where: `JPEL ${t.division ?? 1}部 (${r}位)`, score: 89.0 - (r - 1) * (89.0 - 71.0) / 51 })
}
for (const lg of FOREIGN_LEAGUES) {
  const base = LEAGUE_BASE[lg.id] ?? 77
  const n = lg.clubs.length
  lg.clubs.forEach((c, i) => {
    rows.push({ id: c.id, name: c.name, where: lg.countryName, score: base + SPREAD / 2 - (i / Math.max(1, n - 1)) * SPREAD })
  })
}

rows.sort((a, b) => b.score - a.score)

// 20段に等分（232/20=11.6 → 11 or 12）
const TIERS = 20
const bound = (i: number) => Math.round(rows.length * i / TIERS)
console.log(`# 232クラブ → 20段 の振り分け草案（並べる順＝改修前の実測強さ）\n`)
for (let t = 1; t <= TIERS; t++) {
  const slice = rows.slice(bound(t - 1), bound(t))
  console.log(`## 格${t}  （${slice.length}クラブ）`)
  for (const r of slice) console.log(`  ${r.name}  — ${r.where}`)
  console.log('')
}
