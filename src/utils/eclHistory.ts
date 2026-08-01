import type { EclHistoryEntry, Race } from '../types'

// ECLの歴代優勝を、保存してあるレース結果から毎回組み立てる。
//
// ■なぜ作り直すのか
//   以前はECLが終わるたびに eclHistory（優勝チーム・大会MVP・優勝メンバー）をセーブに書き足していた。
//   だが元になるECLのレースは過去シーズンに全部残っているので、要るときに数え直せる。
//   同じ情報を二重に持たない方がセーブが軽く、集計のズレも起きない。
//
// ■優勝チームの決め方（当時の決め方をそのまま使う）
//   ・5戦シリーズ: 累計ポイントの多い順。同点なら参加チームの並び順（当時と同じ）
//   ・旧・一発勝負: 総合タイムの速い順（レース結果の順位1位）
//
// ■大会MVP
//   全戦の区間の中で「区間1位が2位に一番差をつけた」区間の、その1位選手。
//   当時の計算式のまま。

/** 過去シーズンからECLに必要な物だけを受ける */
export type SeasonEclLike = {
  year: number
  eclRace?: Race
  eclSeries?: {
    participants: { id: string; name: string }[]
    races: Race[]
    points: Record<string, number>
  }
}

/** 全戦の区間から、2位に一番差をつけた区間1位の選手を選ぶ */
function mvpOf(races: Race[]): string | undefined {
  let mvpPlayerId: string | undefined
  let bestGap = -1
  for (const r of races) {
    for (const sr of r.results?.segmentResults ?? []) {
      const sorted = [...sr.runners].sort((a, b) => a.timeSec - b.timeSec)
      const top = sorted[0]
      if (!top) continue
      const gap = (sorted[1]?.timeSec ?? top.timeSec) - top.timeSec
      if (gap > bestGap) { bestGap = gap; mvpPlayerId = top.playerId }
    }
  }
  return mvpPlayerId
}

function entryOf(s: SeasonEclLike): EclHistoryEntry | null {
  const series = s.eclSeries
  if (series && series.races.length > 0) {
    // 全戦を走り終えるまでは優勝は決まらない（途中の年は記録に入れない）
    if (!series.races.every(r => r?.results)) return null
    const champion = [...series.participants]
      .map(pt => ({ id: pt.id, points: series.points?.[pt.id] ?? 0 }))
      .sort((a, b) => b.points - a.points)[0]
    if (!champion) return null
    const winnerPlayerIds = [...new Set(series.races.flatMap(r =>
      (r.results?.segmentResults ?? []).flatMap(sr => sr.runners.filter(x => x.teamId === champion.id).map(x => x.playerId)),
    ))]
    return { year: s.year, championId: champion.id, winnerPlayerIds, mvpPlayerId: mvpOf(series.races) }
  }
  // 旧・一発勝負のECL（古いセーブ）。総合タイム1位が優勝
  const race = s.eclRace
  if (!race?.results) return null
  const championId = race.results.teamRankings.find(tr => tr.rank === 1)?.teamId
  if (!championId) return null
  const winnerPlayerIds = race.results.segmentResults
    .flatMap(sr => sr.runners.filter(r => r.teamId === championId).map(r => r.playerId))
  return { year: s.year, championId, winnerPlayerIds, mvpPlayerId: mvpOf([race]) }
}

export function buildEclHistory(seasons: SeasonEclLike[]): EclHistoryEntry[] {
  const out: EclHistoryEntry[] = []
  for (const s of [...seasons].filter(Boolean).sort((a, b) => a.year - b.year)) {
    const e = entryOf(s)
    if (e) out.push(e)
  }
  return out
}

// 選手一覧やチーム詳細は何度も読むので、直前の結果を覚えておく。
// ECLのレースが入れ替わっていなければ同じ物を返すので、画面の作り直しも起きない。
let cache: { deps: unknown[]; value: EclHistoryEntry[] } | null = null

/**
 * ECLの歴代優勝を作る（結果を覚えておく版）。
 * 今シーズンぶんも見るので、11月の最終戦を終えた時点でその年の優勝が入る（以前と同じタイミング）。
 */
export function eclHistoryOf(pastSeasons: SeasonEclLike[], currentSeason: SeasonEclLike): EclHistoryEntry[] {
  const deps: unknown[] = [pastSeasons, currentSeason?.eclSeries, currentSeason?.eclRace]
  const hit = cache
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value
  const value = buildEclHistory([...pastSeasons, currentSeason])
  // 中身が前と同じなら前の配列をそのまま返す（画面の作り直しを防ぐ）
  const stable = hit && JSON.stringify(hit.value) === JSON.stringify(value) ? hit.value : value
  cache = { deps, value: stable }
  return stable
}
