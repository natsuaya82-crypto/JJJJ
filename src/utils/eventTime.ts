// 記録会の距離種目（表示用の定数とタイム整形のみ。タイム計算は gameStore の simulateIndividualTime を使う）
export type EventDistance = 'd5000' | 'd10000' | 'half' | 'marathon'
export const EVENT_DISTANCES: EventDistance[] = ['d5000', 'd10000', 'half', 'marathon']
export const EVENT_KM: Record<EventDistance, number> = { d5000: 5, d10000: 10, half: 21.0975, marathon: 42.195 }
export const EVENT_LABEL: Record<EventDistance, string> = { d5000: '5000m', d10000: '10000m', half: 'ハーフ', marathon: 'マラソン' }
// 記録会の距離キー（simulateIndividualTime の引数）との対応
export const EVENT_METERS: Record<EventDistance, 5000 | 10000 | 21097 | 42195> = { d5000: 5000, d10000: 10000, half: 21097, marathon: 42195 }

// タイム表示: 1時間以上は h:mm:ss、未満は m:ss。
export function formatRaceTime(sec: number): string {
  const t = Math.round(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
