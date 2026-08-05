// 記録会の距離種目の定数・タイム整形と、能力→距離別ベストタイムの換算。
// （実際の記録会のタイム計算＝コンディション込みは gameStore の simulateIndividualTime）
export type EventDistance = 'd5000' | 'd10000' | 'half' | 'marathon'
export const EVENT_DISTANCES: EventDistance[] = ['d5000', 'd10000', 'half', 'marathon']
export const EVENT_LABEL: Record<EventDistance, string> = { d5000: '5000m', d10000: '10000m', half: 'ハーフ', marathon: 'マラソン' }
// 記録会の距離キー（simulateIndividualTime の引数）との対応

// カレンダー進行: 直前に消化したレースと次のレースの間にある未実施の記録会（＝次の予定）を返す。
// 現在位置より前の日付の未実施分は対象外（過去にさかのぼって実施しない）。
export function getDueIndividualEvent<E extends { id: string; date: string; results?: unknown }>(season: {
  races: { date: string }[]
  currentRaceIndex: number
  individualEvents?: E[]
}): E | null {
  const idx = season.currentRaceIndex ?? 0
  const lastDate = idx > 0 ? season.races[idx - 1]?.date ?? '' : ''
  const nextDate = season.races[idx]?.date ?? '9999-12-31'
  const due = (season.individualEvents ?? [])
    .filter(e => !e.results && e.date > lastDate && e.date < nextDate)
    .sort((a, b) => a.date.localeCompare(b.date))
  return due.length > 0 ? due[0] : null
}

// タイム表示: 1時間以上は h:mm:ss、未満は m:ss。
//
// 同じ処理が formatTime（engine/raceEngine.ts）・fmtTime（store/gameStore.ts）として
// 3つ手書きされていた。fmtTime だけ Math.round が無く、小数秒が渡ると "12:7.5" のような
// 表示になるバグがあった。ここへ1本化し、Math.round する版（他の2つと同じ挙動）に揃える。
export function formatRaceTime(sec: number): string {
  const t = Math.round(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// ============================================================================
// 能力 → 距離別ベストタイムの換算。
// もともと gameStore.ts にあった物をここへ移した。代表選出エンジン
// （engine/worldAthletics.ts）からも使うため（gameStore を import すると循環になる）
// ============================================================================
import type { Player } from '../types'
import { safeRatings } from '../engine/raceEngine'

// 距離別ベストタイム(秒)の能力アンカー[能力値, 秒]。コンディション最高(form+2/疲労0/モラール80+)での値。
//  能力: 50 / 70 / 90 / 99
//  5000: 14:30 13:45 13:00 12:30
//  10000:29:30 28:15 27:00 26:00
//  ハーフ:65:00 62:00 59:00 57:00
//  マラソン:2:13 2:09 2:04 2:00
const IND_ANCHORS: Record<number, [number, number][]> = {
  5000:  [[50, 870], [70, 825], [90, 780], [99, 750]],
  10000: [[50, 1770], [70, 1695], [90, 1620], [99, 1560]],
  21097: [[50, 3900], [70, 3720], [90, 3540], [99, 3420]],
  42195: [[50, 7980], [70, 7740], [90, 7470], [99, 7200]],  // 90は2:04:30（日本記録級が量産されない傾きに）。99=世界記録レベルは設計通り
}

// 種目別のステータス比率。OVRではなくこの加重平均（種目適性値）で基準タイムを引く。
// 短い種目ほどスピード、長い種目ほどスタミナ・回復・ペース配分・精神が効く。山岳系は対象外。
const IND_STAT_WEIGHTS: Record<number, { speed: number; stamina: number; pacing: number; mental: number; recovery: number }> = {
  5000:  { speed: 0.50, stamina: 0.20, pacing: 0.12, mental: 0.10, recovery: 0.08 },
  10000: { speed: 0.35, stamina: 0.30, pacing: 0.15, mental: 0.10, recovery: 0.10 },
  21097: { speed: 0.18, stamina: 0.40, pacing: 0.20, mental: 0.10, recovery: 0.12 },
  42195: { speed: 0.08, stamina: 0.42, pacing: 0.18, mental: 0.14, recovery: 0.18 },
}

// 種目適性値: 種目ごとのステータス加重平均
export function individualEventAbility(player: Player, distance: 5000 | 10000 | 21097 | 42195): number {
  const w = IND_STAT_WEIGHTS[distance] ?? IND_STAT_WEIGHTS[10000]
  const r = safeRatings(player.ratings)
  return r.speed * w.speed + r.stamina * w.stamina + r.pacing * w.pacing + r.mental * w.mental + r.recovery * w.recovery
}

// 種目適性値から距離別ベストタイム(コンディション最高時)。アンカーを区分線形で通し、50未満は最下段の傾きで延長。
export function individualBaseTime(o: number, distance: 5000 | 10000 | 21097 | 42195): number {
  const pts = IND_ANCHORS[distance]
  const oo = Math.min(99, o)
  if (oo <= pts[0][0]) {
    const [o0, t0] = pts[0], [o1, t1] = pts[1]
    return t0 + (pts[0][0] - oo) * (t0 - t1) / (o1 - o0)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [o0, t0] = pts[i], [o1, t1] = pts[i + 1]
    if (oo >= o0 && oo <= o1) return t0 + (oo - o0) * (t1 - t0) / (o1 - o0)
  }
  return pts[pts.length - 1][1]
}
