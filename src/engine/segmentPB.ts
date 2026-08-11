// 区間の自己ベスト（自チームの選手のみ持つ）。store/slices/raceSlice の runRace から切り出し。
//
// ★同じ地形なら比べられる、という考え方。距離を1km刻み・起伏を10%刻みに丸めた
//   「地形キー」ごとに最速タイムを1本だけ持つ。キーの作り方はここが唯一の決まり
//   （型の説明にある "10km-up30-down0" は書式の例で、実体はこの pbKeyOf）。
import type { Player, Race, RaceResults } from '../types'

/** 区間の地形 → 自己ベストのキー（距離1km刻み・起伏10%刻み） */
export function pbKeyOf(seg: { distanceKm: number; uphillPct: number; downhillPct: number }): string {
  return `${Math.round(seg.distanceKm)}km-up${Math.round(seg.uphillPct / 10) * 10}-dn${Math.round(seg.downhillPct / 10) * 10}`
}

/** そのレースの走りで自己ベストを更新する（自チームの選手だけ・速いときだけ差し替え） */
export function applySegmentPBs(players: Player[], playerTeamId: string, race: Race, results: RaceResults): Player[] {
  return players.map(p => {
    if (p.teamId !== playerTeamId) return p
    let pbs = [...(p.segmentPBs ?? [])]
    for (const sr of results.segmentResults) {
      const runner = sr.runners.find(r => r.playerId === p.id)
      if (!runner) continue
      const seg = race.segments.find(s => s.index === sr.segmentIndex)
      if (!seg) continue
      const key = pbKeyOf(seg)
      const existing = pbs.find(pb => pb.key === key)
      if (!existing || runner.timeSec < existing.timeSec) {
        pbs = [...pbs.filter(pb => pb.key !== key), { key, timeSec: runner.timeSec, raceName: race.name, date: race.date }]
      }
    }
    return { ...p, segmentPBs: pbs }
  })
}
