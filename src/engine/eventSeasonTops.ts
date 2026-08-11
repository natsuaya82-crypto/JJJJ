// 記録会のシーズン別トップ10を軽くして残す。endSeason から切り出した（挙動不変）。
//
// ■なぜ要るのか
//   記録会の全結果はシーズンの保存時に捨てるので、そのままだと歴代優勝ページから
//   過去の記録会が消える。**種目ごとの上位10人だけ、名前を焼き込んで残す。**
//
// ■触るときの注意
//   - **名前を焼き込むこと。** あとで選手データが消えても（savePruning）名前は残る
//   - 記録会にはドラフト候補も出る。名前は「選手 → 候補」の順で解決する
//   - 同じ選手が同じ種目に複数回出ることがあるので、**自己ベストだけを残す**
import type { GameState, Player } from '../types'

export function collectEventSeasonTops(args: {
  currentSeason: GameState['currentSeason']
  players: Player[]
}): NonNullable<GameState['eventSeasonTops']> {
  const { currentSeason, players } = args

  // 記録会のシーズン別トップ10を軽量アーカイブ（記録会の全結果はこの後破棄されるため、
  // 歴代優勝ページ用に種目ごとの上位だけ名前焼き込みで残す）
  const DIST_TO_KEY: Record<number, 'd5000' | 'd10000' | 'half' | 'marathon'> = { 5000: 'd5000', 10000: 'd10000', 21097: 'half', 42195: 'marathon' }
  const newEventTops: NonNullable<GameState['eventSeasonTops']> = []
  {
    const byDist = new Map<'d5000' | 'd10000' | 'half' | 'marathon', Map<string, { playerId: string; teamId: string; timeSec: number }>>()
    for (const ev of currentSeason.individualEvents ?? []) {
      const key = DIST_TO_KEY[ev.distance]
      if (!key || !ev.results) continue
      if (!byDist.has(key)) byDist.set(key, new Map())
      const best = byDist.get(key)!
      for (const r of ev.results) {
        const cur = best.get(r.playerId)
        if (!cur || r.timeSec < cur.timeSec) best.set(r.playerId, { playerId: r.playerId, teamId: r.teamId, timeSec: r.timeSec })
      }
    }
    for (const [dist, best] of byDist) {
      // 記録会にはドラフト候補も出るため、名前はプレイヤー→候補の順で解決して焼き込む
      const top = [...best.values()].sort((a, b) => a.timeSec - b.timeSec).slice(0, 10)
        .map(e => ({ ...e, playerName: (players.find(p => p.id === e.playerId) ?? (currentSeason.scoutProspects ?? []).find(p => p.id === e.playerId))?.name ?? '' }))
      if (top.length > 0) newEventTops.push({ year: currentSeason.year, dist, top })
    }
  }

  return newEventTops
}
