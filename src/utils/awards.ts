// 年度表彰（MVP・新人王）の選出ルール（単一の実装を endSeason と画面表示の両方で使う）。
// - **部ごとに選ぶ**（1部MVP・2部MVP・3部MVP）。走る相手も走る本数も部ごとに違うので、
//   3部の選手と1部の選手を同じ土俵で並べても意味が無い
// - 対象は1軍駅伝のみ
// - 資格: 6レース以上出場
// - 選出: 平均区間順位が最良 → タイブレークは 区間賞数 → 出走数
// - 新人王: その年のドラフト指名選手のみ。6戦該当ゼロなら3戦以上に緩和、それでもゼロなら該当なし
//
// 表彰はセーブに貯めず、保存してあるレース結果から毎回選び直す（下の seasonAwardsOf）。
// 選び方は上のルールのまま変えていないので、これまでの受賞者がそのまま出る。
import type { Division, Nationality, Player, Race, SeasonAward } from '../types'
import { DIVISIONS } from './league'

type Stat = { races: number; rankSum: number; segWins: number }
/** 選手ID → その年の出走数・区間順位の合計・区間賞数 */
export type SeasonStats = Map<string, Stat>

/** 1シーズンぶんの走りを数える（重いのはここだけ） */
export function seasonStats(races: Race[]): SeasonStats {
  const stats: SeasonStats = new Map()
  for (const race of races) {
    if (!race?.results) continue
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
  return stats
}

function awardsFromStats(
  stats: SeasonStats,
  players: Player[],
  year: number,
  nameOf: (id: string) => string | undefined,
  division?: Division,
): SeasonAward {
  const pickBest = (candidates: string[], minRaces: number) => {
    const rows = candidates
      .map(id => ({ id, st: stats.get(id) }))
      .filter((x): x is { id: string; st: Stat } => !!x.st && x.st.races >= minRaces)
      .map(x => ({ id: x.id, avg: x.st.rankSum / x.st.races, segWins: x.st.segWins, races: x.st.races }))
      .sort((a, b) => a.avg - b.avg || b.segWins - a.segWins || b.races - a.races)
    return rows[0] ?? null
  }
  const mvpPick = pickBest([...stats.keys()], 6)
  const rookieIds = players.filter(p => p.draftYear === year && p.draftRound != null).map(p => p.id)
  const rookiePick = pickBest(rookieIds, 6) ?? pickBest(rookieIds, 3)
  const mvpName = mvpPick ? nameOf(mvpPick.id) : undefined
  const rookieName = rookiePick ? nameOf(rookiePick.id) : undefined
  return {
    year,
    ...(division != null ? { division } : {}),
    ...(mvpPick && mvpName ? { mvpId: mvpPick.id, mvpName, mvpAvgRank: Math.round(mvpPick.avg * 10) / 10 } : {}),
    ...(rookiePick && rookieName ? { rookieId: rookiePick.id, rookieName, rookieAvgRank: Math.round(rookiePick.avg * 10) / 10 } : {}),
  }
}

export function computeSeasonAwards(races: Race[], players: Player[], year: number, division?: Division): SeasonAward {
  const byId = new Map(players.map(p => [p.id, p]))
  return awardsFromStats(seasonStats(races), players, year, id => byId.get(id)?.name, division)
}

/**
 * その年のレースを部ごとに分ける。**表彰を部ごとに選ぶための唯一の入口。**
 *
 * 自分の部の結果は `season.races` に、他の部は `season.divisionRaces` に入っている
 * （`races` は `divisionRaces[自分の部]` と同じ日程だが、結果が入るのは `races` の側）。
 * どの部が自分のぶんかはレースIDの重なりで分かるので、外から部を教える必要はない。
 * 部を持たない旧セーブは、これまでどおり部の付かない1件になる。
 */
export function racesByDivision(s: SeasonRacesLike): { division?: Division; races: Race[] }[] {
  const mine = s.races ?? []
  const buckets = DIVISIONS
    .map(d => ({ division: d as Division, races: s.divisionRaces?.[d] ?? [] }))
    .filter(b => b.races.length > 0)
  if (buckets.length === 0) return mine.length > 0 ? [{ races: mine }] : []
  const myIds = new Set(mine.map(r => r.id))
  let placed = false
  const out = buckets.map(b => {
    if (!b.races.some(r => myIds.has(r.id))) return b
    placed = true
    // 同じIDは結果の入っている season.races 側を採る
    return { division: b.division, races: [...mine, ...b.races.filter(r => !myIds.has(r.id))] }
  })
  // どの部にも重ならなかったとき（部の日程が壊れているセーブ）は落とさず部無しで残す
  return placed || mine.length === 0 ? out : [...out, { races: mine }]
}

// ── 歴代の表彰（保存してあるレース結果から作り直す） ──────────────────
//
// ■なぜ作り直すのか
//   以前はシーズンが終わるたびに seasonAwards（年度MVP・新人王）をセーブに書き足していた。
//   だが元になるレース結果は過去シーズンに全部残っているので、受賞者は要るときに選び直せる。
//
// ■受賞者が変わらない理由
//   ・選び方（上のルール）は作った時から一度も変えていない。
//   ・元になる1軍駅伝の結果は過去シーズンに全部残っていて、消える処理がない。
//   ・ドラフト指名歴のある選手は長期整理でも絶対に消さない仕様なので、新人王の候補は欠けない。
//   ・名前は、選手が消えていても removedPlayers（名前と国籍だけ残す）から引ける。

/** 過去シーズンから必要な物だけを受ける */
export type SeasonRacesLike = {
  year: number
  races?: Race[]
  /** 部ごとの日程（1部・2部・3部）。自分が走っていない部もここに入っている */
  divisionRaces?: Partial<Record<number, Race[]>>
}

type StatsByYear = { year: number; division?: Division; stats: SeasonStats }[]

let statsCache: { deps: unknown; value: StatsByYear } | null = null
function statsByYear(pastSeasons: SeasonRacesLike[]): StatsByYear {
  if (statsCache && statsCache.deps === pastSeasons) return statsCache.value
  const value = pastSeasons
    .filter(Boolean)
    .flatMap(s => racesByDivision(s).map(b => ({ year: s.year, division: b.division, stats: seasonStats(b.races) })))
    .sort((a, b) => a.year - b.year || (a.division ?? 9) - (b.division ?? 9))
  statsCache = { deps: pastSeasons, value }
  return value
}

let awardsCache: { deps: unknown[]; value: SeasonAward[] } | null = null

/**
 * 歴代の年度MVP・新人王を作る（結果を覚えておく版）。
 * 今シーズンはまだ終わっていないので数えない（終わったぶんだけ）。
 */
export function seasonAwardsOf(
  pastSeasons: SeasonRacesLike[],
  players: Player[],
  removedPlayers?: Record<string, [string, Nationality]>,
): SeasonAward[] {
  const byYear = statsByYear(pastSeasons)
  const deps: unknown[] = [byYear, players, removedPlayers]
  const hit = awardsCache
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value
  const byId = new Map(players.map(p => [p.id, p]))
  const nameOf = (id: string) => byId.get(id)?.name ?? removedPlayers?.[id]?.[0]
  const value = byYear.map(({ year, division, stats }) => awardsFromStats(stats, players, year, nameOf, division))
  // 中身が前と同じなら前の配列をそのまま返す（画面の作り直しを防ぐ）
  const stable = hit && JSON.stringify(hit.value) === JSON.stringify(value) ? hit.value : value
  awardsCache = { deps, value: stable }
  return stable
}
