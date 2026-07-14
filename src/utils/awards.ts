// 年度表彰（MVP・新人王）の選出ルール（単一の実装を endSeason と画面表示の両方で使う）。
// - 対象は1軍駅伝のみ
// - 資格: 6レース以上出場
// - 選出: 平均区間順位が最良 → タイブレークは 区間賞数 → 出走数
// - 新人王: その年のドラフト指名選手のみ。6戦該当ゼロなら3戦以上に緩和、それでもゼロなら該当なし
import type { Player, Race, SeasonAward } from '../types'

export function computeSeasonAwards(races: Race[], players: Player[], year: number): SeasonAward {
  const stats = new Map<string, { races: number; rankSum: number; segWins: number }>()
  for (const race of races) {
    if (!race.results) continue
    for (const seg of race.results.segmentResults) {
      for (const r of seg.runners) {
        const st = stats.get(r.playerId) ?? { races: 0, rankSum: 0, segWins: 0 }
        st.races += 1
        st.rankSum += r.rank
        if (r.rank === 1) st.segWins += 1
        stats.set(r.playerId, st)
      }
    }
  }
  const pickBest = (candidates: string[], minRaces: number) => {
    const rows = candidates
      .map(id => ({ id, st: stats.get(id) }))
      .filter((x): x is { id: string; st: { races: number; rankSum: number; segWins: number } } => !!x.st && x.st.races >= minRaces)
      .map(x => ({ id: x.id, avg: x.st.rankSum / x.st.races, segWins: x.st.segWins, races: x.st.races }))
      .sort((a, b) => a.avg - b.avg || b.segWins - a.segWins || b.races - a.races)
    return rows[0] ?? null
  }
  const byId = new Map(players.map(p => [p.id, p]))
  const mvpPick = pickBest([...stats.keys()], 6)
  const rookieIds = players.filter(p => p.draftYear === year && p.draftRound != null).map(p => p.id)
  const rookiePick = pickBest(rookieIds, 6) ?? pickBest(rookieIds, 3)
  const mvpP = mvpPick ? byId.get(mvpPick.id) : undefined
  const rookieP = rookiePick ? byId.get(rookiePick.id) : undefined
  return {
    year,
    ...(mvpP && mvpPick ? { mvpId: mvpP.id, mvpName: mvpP.name, mvpAvgRank: Math.round(mvpPick.avg * 10) / 10 } : {}),
    ...(rookieP && rookiePick ? { rookieId: rookieP.id, rookieName: rookieP.name, rookieAvgRank: Math.round(rookiePick.avg * 10) / 10 } : {}),
  }
}
