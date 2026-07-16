// 選手の記録パッチ（世界記録・日本記録・年度MVP・新人王・区間記録）の解決。
// 選手詳細の1ページ目（最大5個）とロスター名前横（選択した1個）で使う。
// 記録はすべて「現在の保持者」基準：他選手に抜かれたらパッチも自然に外れる。
import type { Player, GameState, SegmentRecord, EventDistKey } from '../types'

export type PlayerBadge = {
  key: string      // 一意キー（Player.displayBadge に保存する値）
  label: string    // 表示名（例: 5000m日本記録 / 東北桜駅伝3区区間記録 / 2027年度MVP）
  kind: 'world' | 'japan' | 'cl' | 'mvp' | 'rookie' | 'segment'
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
}

type BadgeSource = Pick<GameState, 'worldRecords' | 'japanRecords' | 'seasonAwards' | 'eclHistory'> & {
  segmentRecords?: Record<string, SegmentRecord[]>
}

// 優先順: 世界記録 > 日本記録 > 年度MVP > 新人王 > 区間記録。maxCount 件で打ち切り
export function getPlayerBadges(p: Player, src: BadgeSource, maxCount = 5): PlayerBadge[] {
  const out: PlayerBadge[] = []

  for (const d of DIST_KEYS) {
    if (src.worldRecords?.[d]?.playerId === p.id) {
      out.push({ key: `wr-${d}`, label: `${DIST_LABEL[d]}世界記録`, kind: 'world' })
    }
  }
  for (const d of DIST_KEYS) {
    if (src.japanRecords?.[d]?.playerId === p.id) {
      out.push({ key: `jr-${d}`, label: `${DIST_LABEL[d]}日本記録`, kind: 'japan' })
    }
  }
  // ECL制覇：優勝チームで出走した選手に付く（世界一メンバーの証）。MVPは大会で最も突出した走り
  for (const e of src.eclHistory ?? []) {
    if (e.winnerPlayerIds.includes(p.id)) out.push({ key: `ecl-${e.year}`, label: `${e.year}年ECL制覇`, kind: 'cl' })
    if (e.mvpPlayerId === p.id) out.push({ key: `eclmvp-${e.year}`, label: `${e.year}年ECL MVP`, kind: 'cl' })
  }
  for (const a of src.seasonAwards ?? []) {
    if (a.mvpId === p.id) out.push({ key: `mvp-${a.year}`, label: `${a.year}年度MVP`, kind: 'mvp' })
  }
  for (const a of src.seasonAwards ?? []) {
    if (a.rookieId === p.id) out.push({ key: `rookie-${a.year}`, label: `${a.year}年度新人王`, kind: 'rookie' })
  }
  // 区間記録: segmentRecords のキーは `${大会名}-${区番号}`、[0]が歴代1位（現在の保持者）
  for (const [key, entries] of Object.entries(src.segmentRecords ?? {})) {
    const top = entries[0]
    if (!top) continue
    const isHolder = top.playerId ? top.playerId === p.id : top.playerName === p.name
    if (!isHolder) continue
    const sep = key.lastIndexOf('-')
    const raceName = sep > 0 ? key.slice(0, sep) : key
    const segIdx = sep > 0 ? key.slice(sep + 1) : ''
    out.push({ key: `seg-${key}`, label: `${raceName}${segIdx}区区間記録`, kind: 'segment' })
  }

  return out.slice(0, maxCount)
}
