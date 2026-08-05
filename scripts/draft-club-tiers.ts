// 232クラブを20段の「格」に振り分けた草案を出す。確認用の一覧を出すだけで、ゲーム側は何も変えない。
//
//   npx esbuild --bundle --platform=node --format=cjs scripts/draft-club-tiers.ts --outfile=/tmp/d.cjs && node /tmp/d.cjs
//
// 枠（どのリーグが格いくつからいくつに入るか）はオーナー指定。ここを書き換えれば並びが変わる。
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'

// 'heavy' = 下に厚い（上位は少なく、下ほど多い。サッカーのリーグの形）
// 'flat'  = 範囲に点在（均等にばらまく）
type Shape = 'heavy' | 'flat'
type Band = { top: number; bottom: number; shape: Shape; label: string }

const BANDS: Record<string, Band> = {
  africa_east:     { top: 1, bottom: 7, shape: 'heavy', label: '東アフリカ' },
  africa_ns:       { top: 1, bottom: 7, shape: 'heavy', label: 'アフリカ北・南' },
  europe_ws:       { top: 1, bottom: 7, shape: 'heavy', label: 'ヨーロッパ西・南' },
  north_america:   { top: 1, bottom: 8, shape: 'heavy', label: '北米' },
  europe_ne:       { top: 3, bottom: 10, shape: 'heavy', label: 'ヨーロッパ北・東' },
  oceania:         { top: 5, bottom: 12, shape: 'heavy', label: 'オセアニア' },
  south_america:   { top: 7, bottom: 15, shape: 'heavy', label: '南米' },
  asia_league:     { top: 10, bottom: 20, shape: 'flat', label: 'アジア' },
  central_america: { top: 10, bottom: 20, shape: 'flat', label: '中米・カリブ' },
  jpel1:           { top: 5, bottom: 12, shape: 'heavy', label: 'JPEL 1部' },
  jpel2:           { top: 10, bottom: 17, shape: 'heavy', label: 'JPEL 2部' },
  jpel3:           { top: 14, bottom: 20, shape: 'heavy', label: 'JPEL 3部' },
}

// 格1に置くクラブ数（リーグごと）。オーナー指定＝アフリカ×2・ヨーロッパ×2・アメリカ×1 の計5。
// ヨーロッパ北・東は格3始まりなので、ヨーロッパ枠2つはどちらも西・南から出す。
const TOP_TIER_SLOTS: Record<string, number> = {
  africa_east: 1, africa_ns: 1, europe_ws: 2, north_america: 1,
}

// 範囲の中での配り方。i は0始まり（0がそのリーグの最上位）。
// heavy は指数0.7で下に寄せる。flat は範囲に均等。
function tierOfIndex(band: Band, i: number, n: number): number {
  const span = band.bottom - band.top
  if (n <= 1) return band.top
  if (band.shape === 'flat') return band.top + Math.round(span * i / (n - 1))
  return band.top + Math.round(span * Math.pow(i / (n - 1), 0.7))
}

type Row = { name: string; league: string; note: string }
const buckets: Row[][] = Array.from({ length: 20 }, () => [])

function place(key: string, clubs: { name: string; note: string }[]) {
  const band = BANDS[key]
  const n = clubs.length
  const forcedTop = TOP_TIER_SLOTS[key] ?? 0
  clubs.forEach((c, i) => {
    // 格1の枠は上から順に埋める（そのリーグで一番上のクラブたち）
    const tier = i < forcedTop ? 1 : tierOfIndex(band, i, n)
    buckets[Math.min(20, Math.max(1, tier)) - 1].push({ name: c.name, league: band.label, note: c.note })
  })
}

for (const lg of FOREIGN_LEAGUES) {
  if (!BANDS[lg.id]) continue
  place(lg.id, lg.clubs.map((c, i) => ({ name: c.name, note: `${i + 1}番手` })))
}
const domestic = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].sort((a, b) => (a.initialRank ?? 99) - (b.initialRank ?? 99))
for (const [key, div] of [['jpel1', 1], ['jpel2', 2], ['jpel3', 3]] as const) {
  const teams = domestic.filter(t => (t.division ?? 1) === div)
  place(key, teams.map(t => ({ name: t.name, note: `${t.initialRank}位` })))
}

console.log('# 232クラブ → 20段の格：振り分け草案（第3版）')
console.log('#')
console.log('# 枠（オーナー指定）')
for (const b of Object.values(BANDS)) {
  console.log(`#   ${b.label}  格${b.top}〜${b.bottom}  ${b.shape === 'flat' ? '点在' : '下に厚い'}`)
}
console.log('')
for (let t = 0; t < 20; t++) {
  const b = buckets[t]
  const jp = b.filter(r => r.league.startsWith('JPEL')).length
  console.log(`## 格${t + 1}  （${b.length}クラブ${jp ? ` / うち国内${jp}` : ''}）`)
  for (const r of b) console.log(`  ${r.name}  — ${r.league} ${r.note}`)
  console.log('')
}
console.log(`合計 ${buckets.reduce((s, b) => s + b.length, 0)} クラブ`)
