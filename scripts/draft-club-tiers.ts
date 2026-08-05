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
  africa_ns:       { top: 3, bottom: 9, shape: 'heavy', label: 'アフリカ北・南' },
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

// 格1の5クラブ。オーナー指定＝アフリカ×2・ヨーロッパ×2・アメリカ×1。
// リーグ内の並び順（データの並び＝国ごとのまとまり）で機械的に取ると
// アフリカ2枠がケニアのクラブ2つになるので、ここだけ名指しで置く。
const TIER1_CLUBS = [
  'ナイロビ・ハリアーズ',        // ケニア
  'アディスアベバAC',           // エチオピア
  'テムズ・ハリアーズ',          // イギリス（ロンドン）
  'ベルリン・ラウフラボ',        // ドイツ
  'ニューヨーク陸上クラブ',      // アメリカ
]

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

const tier1 = new Set<string>(TIER1_CLUBS)

function place(key: string, clubs: { name: string; note: string }[]) {
  const band = BANDS[key]
  const n = clubs.length
  clubs.forEach((c, i) => {
    // 格1は上の5クラブだけ。枠の上が1のリーグでも、選ばれていないクラブは格2から
    const tier = tier1.has(c.name) ? 1 : Math.max(2, tierOfIndex(band, i, n))
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

console.log('# 232クラブ → 20段の格：振り分け草案（第5版・素点なし）')
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
