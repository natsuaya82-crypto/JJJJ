// 年度表彰（MVP・新人王）の選出ルール（単一の実装を endSeason と画面表示の両方で使う）。
// - **リーグごとに選ぶ**（12リーグ。日本の1部・2部・3部も海外9も同じ形）。走る相手も
//   走る本数もリーグごとに違うので、混ぜて並べても意味が無い（オーナー・2026-09-26
//   「mvpはそれぞれのリーグごとに作ろう」）
// - 対象は1軍駅伝のみ
// - 資格: 6レース以上出場
// - 選出: 平均区間順位が最良 → タイブレークは 区間賞数 → 出走数
// - 新人王: **その年に世界に入った選手**（`draftYear === 年`＝ドラフト・若手の補充・海外の補充・開幕の床）。
//   ただし育成選手（`signDevProspect`・IDの頭が DEV_PROSPECT_ID_PREFIX）は外す。3戦以上。該当ゼロなら該当なし。★以前は「ドラフト指名選手」だけで、ドラフトは日本1部にしか無いので
//   2部・3部と海外9リーグには新人王の候補がそもそも居なかった
//
// 表彰はセーブに貯めず、保存してあるレース結果から毎回選び直す（下の seasonAwardsOf）。
// 選び方は上のルールのまま変えていないので、これまでの受賞者がそのまま出る。
import type { LeagueId, Nationality, Player, Race, SeasonAward } from '../types'
import { leagueRaces } from './league'
import { WORLD_LEAGUES } from '../data/leagues'
import { DEV_PROSPECT_ID_PREFIX } from '../data/rosterRules'

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
  leagueId?: LeagueId,
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
  const rookieIds = players.filter(p => p.draftYear === year && !p.id.startsWith(DEV_PROSPECT_ID_PREFIX)).map(p => p.id)
  // 新人王は**3戦以上**（MVPの6戦とは別の線。上の 6 は触らないこと）。
  //
  // ★以前は `pickBest(rookieIds, 6) ?? pickBest(rookieIds, 3)` と、6戦の網を先に当てて
  //   ゼロなら3戦へ緩める形だった。だが新人が6戦に届くかは**部で決まってしまう**。
  //   CPUの区間配置（engine/raceEngine の bgLineup）は能力だけで7人を選ぶので、
  //   名簿の強い1部では新人が7人枠に入れず、6戦どころか3戦にも届かない年が続く。
  //   結果、1部だけ新人王が空欄のまま、という状態になっていた。
  //   最初から3戦で選ぶ（該当ゼロの年は新人王なしのまま通す）。
  const rookiePick = pickBest(rookieIds, 3)
  const mvpName = mvpPick ? nameOf(mvpPick.id) : undefined
  const rookieName = rookiePick ? nameOf(rookiePick.id) : undefined
  return {
    year,
    ...(leagueId != null ? { leagueId } : {}),
    ...(mvpPick && mvpName ? { mvpId: mvpPick.id, mvpName, mvpAvgRank: Math.round(mvpPick.avg * 10) / 10 } : {}),
    ...(rookiePick && rookieName ? { rookieId: rookiePick.id, rookieName, rookieAvgRank: Math.round(rookiePick.avg * 10) / 10 } : {}),
  }
}

export function computeSeasonAwards(races: Race[], players: Player[], year: number, leagueId?: LeagueId): SeasonAward {
  const byId = new Map(players.map(p => [p.id, p]))
  return awardsFromStats(seasonStats(races), players, year, id => byId.get(id)?.name, leagueId)
}

/**
 * その年のレースをリーグごとに分ける。**表彰をリーグごとに選ぶための唯一の入口。**
 * 並びは12リーグの並び（日本1部・2部・3部 → 海外9）。
 */
export function racesByLeague(s: SeasonRacesLike): { leagueId: LeagueId; races: Race[] }[] {
  return WORLD_LEAGUES
    .map(l => ({ leagueId: l.id, races: leagueRaces(s, l.id) }))
    .filter(b => b.races.length > 0)
}
const LEAGUE_ORDER = new Map(WORLD_LEAGUES.map((l, i) => [l.id, i]))

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
  /** リーグごとの日程（結果つき）。表彰は12リーグ全部で選ぶ */
  leagues?: Readonly<Record<LeagueId, { races: Race[] }>>
}

type StatsByYear = { year: number; leagueId: LeagueId; stats: SeasonStats }[]

let statsCache: { deps: unknown; value: StatsByYear } | null = null
function statsByYear(pastSeasons: SeasonRacesLike[]): StatsByYear {
  if (statsCache && statsCache.deps === pastSeasons) return statsCache.value
  const value = pastSeasons
    .filter(Boolean)
    .flatMap(s => racesByLeague(s).map(b => ({ year: s.year, leagueId: b.leagueId, stats: seasonStats(b.races) })))
    .sort((a, b) => a.year - b.year || (LEAGUE_ORDER.get(a.leagueId) ?? 99) - (LEAGUE_ORDER.get(b.leagueId) ?? 99))
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
  const value = byYear.map(({ year, leagueId, stats }) => awardsFromStats(stats, players, year, nameOf, leagueId))
  // 中身が前と同じなら前の配列をそのまま返す（画面の作り直しを防ぐ）
  const stable = hit && JSON.stringify(hit.value) === JSON.stringify(value) ? hit.value : value
  awardsCache = { deps, value: stable }
  return stable
}
