// 記録会の距離種目（表示用の定数とタイム整形のみ。タイム計算は gameStore の simulateIndividualTime を使う）
export type EventDistance = 'd5000' | 'd10000' | 'half' | 'marathon'
export const EVENT_DISTANCES: EventDistance[] = ['d5000', 'd10000', 'half', 'marathon']
export const EVENT_KM: Record<EventDistance, number> = { d5000: 5, d10000: 10, half: 21.0975, marathon: 42.195 }
export const EVENT_LABEL: Record<EventDistance, string> = { d5000: '5000m', d10000: '10000m', half: 'ハーフ', marathon: 'マラソン' }
// 記録会の距離キー（simulateIndividualTime の引数）との対応
export const EVENT_METERS: Record<EventDistance, 5000 | 10000 | 21097 | 42195> = { d5000: 5000, d10000: 10000, half: 21097, marathon: 42195 }

// カレンダー進行: 直前に消化したレースと次のレースの間にある未実施の記録会（＝次の予定）を返す。
// 現在位置より前の日付の未実施分は対象外（過去にさかのぼって実施しない）。
export function getDueIndividualEvent(season: {
  races: { date: string }[]
  currentRaceIndex: number
  individualEvents?: { id: string; name: string; date: string; distance: 5000 | 10000 | 21097 | 42195; results?: unknown }[]
}) {
  const idx = season.currentRaceIndex ?? 0
  const lastDate = idx > 0 ? season.races[idx - 1]?.date ?? '' : ''
  const nextDate = season.races[idx]?.date ?? '9999-12-31'
  const due = (season.individualEvents ?? [])
    .filter(e => !e.results && e.date > lastDate && e.date < nextDate)
    .sort((a, b) => a.date.localeCompare(b.date))
  return due[0] ?? null
}

// タイム表示: 1時間以上は h:mm:ss、未満は m:ss。
export function formatRaceTime(sec: number): string {
  const t = Math.round(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
