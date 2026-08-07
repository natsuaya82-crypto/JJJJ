/**
 * 「全大会のレース結果を保存したら、セーブがどれだけ太るか」を実データから測る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-save-size.ts --outfile=/tmp/mss.cjs && node /tmp/mss.cjs
 *
 * いま捨てている（＝出走数だけの集計に置き換えている）のは裏の部と海外リーグ。
 * ここを保存すると移籍・記録・監督の海外移籍に使えるようになるが、その代わりに太る。
 * 大会ごとに残す／捨てるを分けるのは特別扱いになるので、
 * 「全部残したうえで、行の持ち方を詰める」でどこまで小さくなるかを比べる。
 */
import { LEAGUE_COURSE_POOL } from '../src/data/races'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { DIVISIONS, DIVISION_SIZE, DIVISION_RACES, DIVISION_LABEL } from '../src/utils/league'
import { allForeignClubs } from '../src/utils/clubs'

// 1走者ぶんの実測バイト数（JSON化した文字列の長さ）
const ROW_NOW = JSON.stringify({ playerId: 'base-0123', timeSec: 1834.213, rank: 4 }).length
const ROW_PACKED = JSON.stringify(['base-0123', 1834, 4]).length

// コースの平均区間数（6〜10でばらけている）
const segCounts = LEAGUE_COURSE_POOL.map(c => c.segments.length)
const AVG_SEGS = segCounts.reduce((s, n) => s + n, 0) / segCounts.length

const fClubs = allForeignClubs(FOREIGN_LEAGUES)
const leagueCount = FOREIGN_LEAGUES.length

type Row = { name: string; rows: number; note: string }
const rows: Row[] = []

// ── 国内（自分の部＋裏の部）──
let domesticRows = 0
for (const d of DIVISIONS) {
  const n = Math.round(DIVISION_SIZE[d] * AVG_SEGS * DIVISION_RACES[d])
  domesticRows += n
  rows.push({ name: `国内 ${DIVISION_LABEL[d]}`, rows: n, note: `${DIVISION_SIZE[d]}クラブ × 約${AVG_SEGS.toFixed(1)}区間 × ${DIVISION_RACES[d]}戦` })
}

// ── 海外リーグ（本編と同じ日程で回る）──
const foreignMatchdays = DIVISION_RACES[1]
const foreignRows = Math.round(fClubs.length * AVG_SEGS * foreignMatchdays)
rows.push({ name: '海外リーグ', rows: foreignRows, note: `${fClubs.length}クラブ(${leagueCount}リーグ) × 約${AVG_SEGS.toFixed(1)}区間 × ${foreignMatchdays}戦` })

// ── ECL（20クラブ・5戦）──
const eclRows = Math.round(20 * AVG_SEGS * 5)
rows.push({ name: 'ECL', rows: eclRows, note: `20クラブ × 約${AVG_SEGS.toFixed(1)}区間 × 5戦` })

// ── 世界選手権（駅伝3戦＋大陸予選）──
const waRows = Math.round(24 * AVG_SEGS * 3 * 2)
rows.push({ name: '世界選手権・大陸予選', rows: waRows, note: `約24カ国 × 約${AVG_SEGS.toFixed(1)}区間 × 3戦 × (本戦+予選)` })

const total = rows.reduce((s, r) => s + r.rows, 0)
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

console.log(`1走者ぶんの大きさ   いまの形 ${ROW_NOW}バイト / 詰めた形 ${ROW_PACKED}バイト`)
console.log(`コースの区間数      ${Math.min(...segCounts)}〜${Math.max(...segCounts)}（平均${AVG_SEGS.toFixed(1)}）`)
console.log('')
console.log('大会ごとの1シーズンの走行記録')
for (const r of rows) {
  console.log(`  ${r.name.padEnd(22)} ${String(r.rows).padStart(6)}行   ${r.note}`)
}
console.log(`  ${'合計'.padEnd(23)} ${String(total).padStart(6)}行`)
console.log('')
console.log('セーブの大きさ（走行記録ぶんだけ）')
console.log('              いまの形      詰めた形')
for (const y of [1, 3, 5, 10, 20]) {
  console.log(`  ${String(y).padStart(2)}シーズン    ${mb(total * ROW_NOW * y).padStart(9)}    ${mb(total * ROW_PACKED * y).padStart(9)}`)
}
console.log('')
console.log(`※ 国内だけ(いま保存しているぶん)は1シーズン ${mb(domesticRows * ROW_NOW)}。`)
console.log(`   捨てている裏の部と海外を足すと、その ${(total / domesticRows).toFixed(1)}倍になる。`)
