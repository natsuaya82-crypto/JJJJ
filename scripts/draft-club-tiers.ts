// 232クラブを20段の「格」に振り分けた草案を出す。確認用の一覧を出すだけで、ゲーム側は何も変えない。
//
//   npx esbuild --bundle --platform=node --format=cjs scripts/draft-club-tiers.ts --outfile=/tmp/d.cjs && node /tmp/d.cjs
//
// 枠（どのリーグが格いくつからいくつに入るか）はオーナー指定。ここを書き換えれば並びが変わる。
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
// 国内の帯と順位→格の変換は utils/clubTier.ts の1本（ここで数字を持たない）
import { DOMESTIC_TIER_BAND, FOREIGN_TIER_BAND, tierFromDomesticRank, tierInBand, type TierSpread } from '../src/utils/clubTier'
// リーグ内の並び順。都市の規模で並べる（データの並び順＝国ごとのまとまり、ではない）。
// ここに書いたリーグだけ差し替える。書いていないリーグはデータの並び順のまま
// （北米・オセアニア・南米・中米は元から国順＋国内の都市規模順で、都市順とほぼ同じ）。
const CITY_ORDER: Record<string, string[]> = {
  africa_east: [
    'ナイロビ・ハリアーズ', 'アディスアベバAC', 'ダルエスサラーム・ロードランナーズ',
    'カンパラ・ハリアーズ', 'モガディシュ・ペースクラブ', 'キガリRC', 'モンバサ沿岸RC',
    'アスマラ高地ランナーズ', 'ブジュンブラ・ロードランナーズ', 'エルドレット高地AC',
    'ジブチAC', 'ディレダワ・アスレティック', 'キスムAC', 'アルーシャ・サファリAC',
    'バハルダール・ロードランナーズ', 'ブタレAC', 'ジンジャ・ソースRC',
    'ギテガ・ディスタンスクラブ', 'マッサワAC', 'アリサビエ・アスレティック',
  ],
  africa_ns: [
    'ラゴスRC', 'ヨハネスブルグ・ハイベルトAC', 'ハルツーム・ペースクラブ',
    'ケープタウン・ハリアーズ', 'カサブランカ・アトラスAC', 'カノ・アスレティック',
    'ダーバン・ストライダーズ', 'アブジャAC', 'アルジェ・ストライダーズ',
    'チュニス・ロードランナーズ', 'オムドゥルマンランナーズ', 'ラバトAC', 'オランTC',
    'ハラレランナーズ', 'フェズ・ロードランナーズ', 'マラケシュ・アスレティック',
    'ポートスーダン・ハリアーズ', 'コンスタンティーヌRC', 'スファックス・ディスタンスクラブ',
    'スース・ペースクラブ',
  ],
  europe_ws: [
    'ロンドン・ハリアーズ', 'マドリード・アスレティコ', 'パリ・アスレティック',
    'バルセロナTC', 'ベルリン・ラウフラボ', 'ローマ・ストライダーズ', 'ハンブルクRC',
    'ミュンヘンTC', 'ミラノ・マラソンクラブ', 'ブリュッセル・ハリアーズ',
    'アムステル・ランナーズ', 'バーミンガム・ハリアーズ', 'マルセイユ・ペースクラブ',
    'トリノRC', 'バレンシアRC', 'ロッテルダム・アスレティック', 'リスボン・アトランティコ',
    'マンチェスターランナーズ', 'リヨン・ディスタンスクラブ', 'ポルト・ストライダーズ',
  ],
  europe_ne: [
    'ウィーン・ドナウRC', 'ワルシャワAC', 'コペンハーゲン・ノルディック',
    'ダブリン・ハリアーズ', 'ストックホルム・ノルディックRC', 'クラクフ・アスレティック',
    'オスロ・ペースクラブ', 'ヘルシンキ・ハリアーズ', 'ヨーテボリランナーズ',
    'チューリッヒ・ハリアーズ', 'マルメ・ハリアーズ', 'グラーツAC', 'ベルゲンランナーズ',
    'オーフス・アスレティック', 'タンペレ・ストライダーズ', 'コーク・ストライダーズ',
    'トロンハイム・ハリアーズ', 'ジュネーブ・ストライダーズ', 'トゥルクTC', 'バーゼルTC',
  ],
  asia_league: [
    '上海速跑クラブ', '北京長跑隊', 'ジャカルタ陸上クラブ', 'ニューデリー陸上クラブ',
    'ソウル漢江AC', 'バンコク・ロードランナーズ', 'ハノイ長距離クラブ',
    'マニラ・ストライダーズ', 'リヤドRC', '香港ハーバーAC', 'シンガポール・ライオンズ',
    'クアラルンプール・ストライダーズ', '釜山マリンRC', '台北ランナーズ',
    'アルマトイRC', 'コロンボRC', 'ドーハ・エリートRC', 'ウランバートル・ステップRC',
    'カトマンズ・ヒマラヤンRC', 'マナーマ・ディスタンスクラブ',
  ],
}

// 'heavy' = 下に厚い（上位は少なく、下ほど多い。サッカーのリーグの形）
// 'flat'  = 範囲に点在（均等にばらまく）
type Band = { top: number; bottom: number; shape: TierSpread; label: string; leagueId?: string }

// 帯も配り方も utils/clubTier.ts の FOREIGN_TIER_BAND / DOMESTIC_TIER_BAND が唯一の決まり。
// **ここに数字も配り方も書かない。** 以前は配り方（heavy/flat）だけをここが持っていて、
// 実行時（tierFromForeignRank）は常に heavy で計算していたので、
// アジアと中米・カリブの40クラブが1シーズンで別の分布に塗り替わっていた。
const LABELS: Record<string, string> = {
  africa_east: '東アフリカ', africa_ns: 'アフリカ北・南', europe_ws: 'ヨーロッパ西・南',
  north_america: '北米', europe_ne: 'ヨーロッパ北・東', oceania: 'オセアニア',
  south_america: '南米', asia_league: 'アジア', central_america: '中米・カリブ',
}
const BANDS: Record<string, Band> = Object.fromEntries([
  ...Object.entries(FOREIGN_TIER_BAND).map(([id, b]) => [id, { top: b[0], bottom: b[1], shape: b[2], label: LABELS[id] ?? id, leagueId: id }]),
  // 国内は tierFromDomesticRank で引くので配り方は使わない（place の中で分岐）
  ...([1, 2, 3] as const).map(d => [`jpel${d}`, { top: DOMESTIC_TIER_BAND[d][0], bottom: DOMESTIC_TIER_BAND[d][1], shape: 'heavy' as TierSpread, label: `JPEL ${d}部` }]),
])

// 格1の5クラブ。オーナー指定＝アフリカ×2・ヨーロッパ×2・アメリカ×1。
// リーグ内の並び順（データの並び＝国ごとのまとまり）で機械的に取ると
// アフリカ2枠がケニアのクラブ2つになるので、ここだけ名指しで置く。
const TIER1_CLUBS = [
  'ナイロビ・ハリアーズ',        // ケニア
  'アディスアベバAC',           // エチオピア
  'ロンドン・ハリアーズ',        // イギリス
  'マドリード・アスレティコ',    // スペイン
  'ニューヨーク陸上クラブ',      // アメリカ
]

// 配り方は utils/clubTier の tierInBand 1本（実行時の格の更新とまったく同じ）
function tierOfIndex(band: Band, i: number, n: number): number {
  return tierInBand([band.top as never, band.bottom as never, band.shape], i, n)
}

type Row = { name: string; league: string; note: string }
const buckets: Row[][] = Array.from({ length: 20 }, () => [])

const tier1 = new Set<string>(TIER1_CLUBS)

function place(key: string, clubs: { name: string; note: string; throughRank?: number }[]) {
  const band = BANDS[key]
  const n = clubs.length
  clubs.forEach((c, i) => {
    // 国内は毎年の更新と同じ関数で引く。初期値と更新規則が食い違うと、
    // 1シーズン終えた瞬間に初期値が上書きされて消える（実際に52クラブ中36件がズレていた）
    if (c.throughRank != null) {
      const t = tierFromDomesticRank(c.throughRank)
      buckets[t - 1].push({ name: c.name, league: band.label, note: c.note })
      return
    }
    // 格1は上の5クラブだけ。枠の上が1のリーグでも、選ばれていないクラブは格2から
    const tier = tier1.has(c.name) ? 1 : Math.max(2, tierOfIndex(band, i, n))
    buckets[Math.min(20, Math.max(1, tier)) - 1].push({ name: c.name, league: band.label, note: c.note })
  })
}

for (const lg of FOREIGN_LEAGUES) {
  if (!BANDS[lg.id]) continue
  const order = CITY_ORDER[lg.id]
  const names = order
    ? [...order, ...lg.clubs.map(c => c.name).filter(n => !order.includes(n))]
    : lg.clubs.map(c => c.name)
  place(lg.id, names.map((n, i) => ({ name: n, note: `${i + 1}番手` })))
}
const domestic = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].sort((a, b) => (a.initialRank ?? 99) - (b.initialRank ?? 99))
for (const [key, div] of [['jpel1', 1], ['jpel2', 2], ['jpel3', 3]] as const) {
  const teams = domestic.filter(t => (t.division ?? 1) === div)
  place(key, teams.map(t => ({ name: t.name, note: `${t.initialRank}位`, throughRank: t.initialRank })))
}

// --emit を付けると src/data/clubTiers.ts の中身を吐く
if (process.argv.includes('--emit')) {
  const idOf = new Map<string, string>()
  for (const lg of FOREIGN_LEAGUES) for (const c of lg.clubs) idOf.set(c.name, c.id)
  for (const t of [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS]) idOf.set(t.name, t.id)
  console.log(`// 全232クラブの格。国内52＋海外180。`)
  console.log(`// ★このファイルは scripts/draft-club-tiers.ts --emit の生成物。手で直してよい。`)
  console.log(`// 格はプレイヤーに見せない内部データ。画面に出さないこと。`)
  console.log(`export const CLUB_TIER_BY_ID: Record<string, number> = {`)
  for (let t = 0; t < 20; t++) {
    if (buckets[t].length === 0) continue
    console.log(`  // 格${t + 1}`)
    for (const r of buckets[t]) console.log(`  '${idOf.get(r.name) ?? r.name}': ${t + 1},   // ${r.name}（${r.league}）`)
  }
  console.log(`}`)
  process.exit(0)
}
console.log('# 232クラブ → 20段の格：振り分け草案（第7版・ロンドン改名／欧州の順を反映）')
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
