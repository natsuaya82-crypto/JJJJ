// 選手の記録パッチ（世界記録・日本記録・年度MVP・新人王・区間記録）の解決。
// 選手詳細の1ページ目（最大5個）とロスター名前横（選択した1個）で使う。
// 記録はすべて「現在の保持者」基準：他選手に抜かれたらパッチも自然に外れる。
import type { Player, GameState, SegmentRecord, EventDistKey, Nationality } from '../types'

export type PlayerBadge = {
  key: string      // 一意キー（Player.displayBadge に保存する値）
  label: string    // 表示名（例: 5000m日本記録 / 東北桜駅伝3区区間記録 / 2027年度MVP）
  kind: 'world' | 'japan' | 'cl' | 'mvp' | 'rookie' | 'segment' | 'national' | 'waGold' | 'waFinal' | 'seasonFast' | 'asiaBest'
  flag?: Nationality    // labelの直後に国旗を差し込む（例: 「2044 駅伝 [🇯🇵]代表」）。描画は BadgeContent
  labelSuffix?: string  // 国旗の後ろに続くテキスト（例: 「代表」）
  medal?: 1 | 2 | 3     // 世界陸上メダル（金銀銅SVG）。描画は BadgeContent
  color?: string        // kind色の上書き（銀メダル・銅メダルなど）
}

const DIST_LABEL: Record<EventDistKey, string> = {
  d5000: '5000m', d10000: '10000m', half: 'ハーフ', marathon: 'マラソン',
}
const DIST_KEYS: EventDistKey[] = ['d5000', 'd10000', 'half', 'marathon']

export const BADGE_COLOR: Record<PlayerBadge['kind'], string> = {
  world: '#FF5C8A',    // 世界記録: ピンクレッド
  japan: '#F5C842',    // 日本記録: 金
  cl: '#2ECC71',       // ECL制覇: エメラルド
  mvp: '#F5C842',      // MVP: 金
  rookie: '#4FC3F7',   // 新人王: 水色
  segment: '#C9A84C',  // 区間記録: 落ち着いた金
  national: '#A855F7', // 世界陸上 代表: 紫
  waGold: '#FFD700',   // 世界陸上 金メダル: 明るい金
  waFinal: '#C0C7D0',  // 世界陸上 銀/銅メダル: 銀（銅はcolor上書き）
  seasonFast: '#5ED4FF', // 記録会 年間最速: シアン
  asiaBest: '#EC407A', // 年間アジア最優秀選手: ピンク（アジア予選カラー）
}

type BadgeSource = Pick<GameState, 'worldRecords' | 'japanRecords' | 'seasonAwards' | 'eclHistory'> & {
  segmentRecords?: Record<string, SegmentRecord[]>
  worldRepresentatives?: GameState['worldRepresentatives']
  eventSeasonTops?: GameState['eventSeasonTops']
  worldAthleticsResults?: GameState['worldAthleticsResults']
  worldTournament?: GameState['worldTournament']
}

// 優先順: 世界記録 > 世界陸上🥇 > 日本記録 > ECL MVP > 年度MVP > 年間最速 > 世界陸上🥈🥉 > アジア最優秀 > 区間記録 > 代表 > 新人王。
// maxCount 件で打ち切り
export function getPlayerBadges(p: Player, src: BadgeSource, maxCount = 5): PlayerBadge[] {
  const out: PlayerBadge[] = []

  // 共同保持者（同タイムのタイ記録）にも同じパッチを付ける
  const holdsRecord = (rec?: { playerId: string; coHolders?: { playerId: string }[] }) =>
    !!rec && (rec.playerId === p.id || (rec.coHolders ?? []).some(c => c.playerId === p.id))
  for (const d of DIST_KEYS) {
    if (holdsRecord(src.worldRecords?.[d])) {
      out.push({ key: `wr-${d}`, label: `${DIST_LABEL[d]}世界記録`, kind: 'world' })
    }
  }
  // 世界陸上のメダルパッチ（1〜3位=金銀銅）。代表パッチとは別に獲得できる（代表＋メダルの2枚持ちあり）。
  // 個人種目・駅伝とも対象。年×種目で重複排除（例「2044 世界陸上 5000m [🥇]」「2044 世界陸上 駅伝 [🥇]」）
  const myReps = (src.worldRepresentatives ?? []).filter(r => r.playerId === p.id)
  const seenWa = new Set<string>()
  for (const rep of myReps) {
    if (rep.rank !== 1) continue
    const k = `wag-${rep.year}-${rep.label}`
    if (seenWa.has(k)) continue
    seenWa.add(k)
    out.push({ key: k, label: `${rep.year} 世界陸上 ${rep.label}`, kind: 'waGold', medal: 1 })
  }
  for (const d of DIST_KEYS) {
    if (holdsRecord(src.japanRecords?.[d])) {
      out.push({ key: `jr-${d}`, label: `${DIST_LABEL[d]}日本記録`, kind: 'japan' })
    }
  }
  // ECL MVP（大会で最も突出した走り）。優勝はチーム詳細の「ECL優勝 ×N」に付けるので選手パッチにはしない
  for (const e of src.eclHistory ?? []) {
    if (e.mvpPlayerId === p.id) out.push({ key: `eclmvp-${e.year}`, label: `${e.year}年ECL MVP`, kind: 'cl' })
  }
  for (const a of src.seasonAwards ?? []) {
    if (a.mvpId === p.id) out.push({ key: `mvp-${a.year}`, label: `${a.year}年度MVP`, kind: 'mvp' })
  }
  // 記録会の種目別年間最速（そのシーズンの各種目トップタイム。種目ごとに別のスペシャリストが取れる）
  for (const t of src.eventSeasonTops ?? []) {
    if (t.top[0]?.playerId !== p.id) continue
    out.push({ key: `est-${t.year}-${t.dist}`, label: `${t.year} ${DIST_LABEL[t.dist]} 年間最速`, kind: 'seasonFast' })
  }
  // 世界陸上 銀・銅メダル（2〜3位。旧「入賞」パッチは廃止）
  for (const rep of myReps) {
    if (rep.rank !== 2 && rep.rank !== 3) continue
    const k = `waf-${rep.year}-${rep.label}`
    if (seenWa.has(k)) continue
    seenWa.add(k)
    out.push({ key: k, label: `${rep.year} 世界陸上 ${rep.label}`, kind: 'waFinal', medal: rep.rank as 2 | 3, color: rep.rank === 2 ? '#C0C7D0' : '#CD7F32' })
  }
  // 年間アジア最優秀選手（アジア予選3戦すべてに出走し区間順位平均が最良）
  for (const wr of src.worldAthleticsResults ?? []) {
    if (wr.kind === 'qualifier' && wr.bestPlayer?.playerId === p.id) {
      out.push({ key: `asiabest-${wr.year}`, label: `${wr.year} アジア最優秀選手`, kind: 'asiaBest' })
    }
  }
  // 区間記録: segmentRecords のキーは `${大会名}-${区番号}`、[0]が歴代1位。
  // 同タイムで並んでいる選手は全員保持者（タイ記録）
  for (const [key, entries] of Object.entries(src.segmentRecords ?? {})) {
    const top = entries[0]
    if (!top) continue
    const isHolder = entries.some(e =>
      e.timeSec === top.timeSec && (e.playerId ? e.playerId === p.id : e.playerName === p.name))
    if (!isHolder) continue
    const sep = key.lastIndexOf('-')
    const raceName = sep > 0 ? key.slice(0, sep) : key
    const segIdx = sep > 0 ? key.slice(sep + 1) : ''
    out.push({ key: `seg-${key}`, label: `${raceName}${segIdx}区区間記録`, kind: 'segment' })
  }
  // 世界陸上 代表パッチは「現役代表」のみ（選ばれている間だけ付く。次の選考で外れたら自然に外れる）。
  // 過去の代表歴は選手詳細の代表チーム表とメダルパッチで残る。
  // 現在のサイクル＝その国の直近の選考（開催中の大会 or 最新の保存結果）
  {
    const natCode = p.nationality
    type Cycle = { year: number; squad?: string[]; individuals?: { event: string; placings: { playerId: string }[] }[] }
    const cycles: Cycle[] = []
    if (src.worldTournament) cycles.push({ year: src.worldTournament.year, squad: src.worldTournament.squads?.[`nat_${natCode}`], individuals: src.worldTournament.individuals })
    for (const wr of src.worldAthleticsResults ?? []) cycles.push({ year: wr.year, squad: wr.squads?.[`nat_${natCode}`], individuals: wr.kind === 'main' ? wr.meet.individuals : undefined })
    const cur = cycles.find(c => (c.squad?.length ?? 0) > 0)
    if (cur) {
      if (cur.squad?.includes(p.id)) out.push({ key: `natcur-${cur.year}-駅伝`, label: `${cur.year} 駅伝 `, flag: natCode, labelSuffix: '代表', kind: 'national' })
      const EVL: Record<string, string> = { d5000: '5000m', d10000: '10000m', marathon: 'マラソン' }
      for (const ir of cur.individuals ?? []) {
        if (ir.placings.some(pl => pl.playerId === p.id)) out.push({ key: `natcur-${cur.year}-${ir.event}`, label: `${cur.year} ${EVL[ir.event] ?? ir.event} `, flag: natCode, labelSuffix: '代表', kind: 'national' })
      }
    }
  }
  // 新人王（最下位）
  for (const a of src.seasonAwards ?? []) {
    if (a.rookieId === p.id) out.push({ key: `rookie-${a.year}`, label: `${a.year}年度新人王`, kind: 'rookie' })
  }

  return out.slice(0, maxCount)
}
