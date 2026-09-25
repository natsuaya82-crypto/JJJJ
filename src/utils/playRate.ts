import type { ForeignLeague, LeagueId, Player, Race, Team } from '../types'
import { divisionLeagueId, divisionOf, divisionOfLeague, leagueRaces } from './league'
import { teamById } from './world'

/**
 * **「そのレースにその選手が走ったか」を数えるのに要る形だけ。**
 * 出場を数えるのは出場率の領分なので、型も関数もここに置く
 * （以前は `utils/playerUtils` にあり、`playRate` → `playerUtils` の import が
 *   `playerUtils` → `transferDecision` → `playRate` の輪を作っていた）。
 */
export type RaceLike = { results?: { segmentResults: { runners: { playerId: string }[] }[] } }

/** その選手がその日程のうち何本に出場したか。**出場を数えるのはこの1本。** */
export function seasonAppearances(playerId: string, races: readonly RaceLike[]): number {
  let c = 0
  for (const r of races) {
    if (r.results?.segmentResults.some(s => s.runners.some(rn => rn.playerId === playerId))) c++
  }
  return c
}

// ============================================================================
// 「その選手は今季どれだけ走っているか」を出す唯一の入口。
//
// ■なぜ要るのか
//   出場率は `seasonAppearances(id, 自分の部の日程) / currentRaceIndex` と
//   書かれていた。自分の部の日程には
//   1部・2部のクラブの選手はそこに1本も載らず、**出場率が必ず 0** になっていた。
//
//   これが移籍の判断に直結する。`transferDecision.appraiseMove` は
//   「今のクラブで干されている」に +0.2 を付ける。出場率0だと全員に付くので、
//   **1部の日本代表が3部のクラブへ移ることに同意する**（実際にそうなっていた）。
//   分母も間違っていて、`currentRaceIndex` は自分の部の消化数（3部なら7戦）なのに、
//   1部のクラブは10戦走る。
//
//   「そのクラブが走っている日程」は、そのクラブのリーグ（`Season.leagues`）にある。
//   国内の部も海外も同じ形なので、読む側はリーグIDを引くだけ。
//
// ■分からないときは 0.5 / 0戦
//   `teamRaces` が 0 なら `appraiseMove` の「干されている」は付かない（races>=3 が条件）。
//   0にすると「全員が干されている」になるので、分からないときは 0 ではなく中立にする。
// ============================================================================

/** 出場率を出すのに要るものだけ。今シーズンも過去シーズンも同じ形で渡せる */
export type PlayRateSeason = {
  leagues?: Readonly<Record<LeagueId, { races: Race[] }>>
}

/**
 * そのクラブが今季走っている日程。**「どのレースを走るクラブか」の引き方はここ1本。**
 *
 * いまそのクラブが所属しているリーグ（国内は部のリーグ、海外はそのリーグ）の日程。
 */
export function clubSeasonRaces(
  season: PlayRateSeason,
  clubId: string,
  teams: readonly Team[],
  foreignLeagues?: readonly ForeignLeague[],
): Race[] {
  const team = teamById(teams, clubId)
  if (team) return leagueRaces(season, divisionLeagueId(divisionOf(team)))
  for (const l of foreignLeagues ?? []) {
    if (l.clubs.some(c => c.id === clubId)) return leagueRaces(season, l.id)
  }
  return []
}

/**
 * **今季の出場率を「その選手の姿」として信用しはじめるレース数。**
 * これ未満のあいだは前シーズンを見る（前年フル出場の選手が開幕直後に
 * 「1戦も走っていない」扱いになるのを防ぐ）。部ごとのレース数は10/8/7なので、
 * 4戦は1部で4割・3部で6割にあたる。
 */
export const SETTLED_RACES = 4

/**
 * 前シーズンを取り出す。**`playRateOf` に渡す前シーズンの引き方はここ1本**
 * （呼ぶ側で `pastSeasons.find(...)` と書かないこと）。
 */
export function prevSeasonOf(
  pastSeasons: readonly ({ year: number } & PlayRateSeason)[] | undefined,
  year: number,
): PlayRateSeason | undefined {
  return pastSeasons?.find(s => s.year === year - 1)
}

/** 走り終わったレースの数（結果が入っているぶんだけ） */
export function racesDone(races: readonly Race[]): number {
  return races.filter(r => r.results).length
}

/** 海外リーグが今季消化した回の数（海外の出場記録の分母。どのリーグも同じ日程で走る） */
export function foreignRacesDone(season: PlayRateSeason): number {
  return Math.max(0, ...Object.entries(season.leagues ?? {})
    .filter(([id]) => divisionOfLeague(id) == null).map(([, lg]) => racesDone(lg.races)))
}

/**
 * その選手の今季の出場率と、そのクラブの消化レース数。
 * **移籍の判断に出場率を渡すところは必ずここを通すこと。**
 */
export function playRateOf(
  playerId: string,
  clubId: string | undefined,
  season: PlayRateSeason,
  teams: readonly Team[],
  foreignLeagues?: readonly ForeignLeague[],
  /**
   * 前シーズン。**今季がまだ浅いときはこちらを見る**（下の★）。
   * 渡さなければ今までどおり今季だけで数える。
   */
  prevSeason?: PlayRateSeason,
): { fraction: number; teamRaces: number; races: number } {
  if (!clubId) return { fraction: 0.5, teamRaces: 0, races: 0 }
  const list = clubSeasonRaces(season, clubId, teams, foreignLeagues)
  const teamRaces = racesDone(list)
  // ★**今季が浅いうちは前シーズンの出場率を使う。**
  //   今季だけで数えると、前年フル出場だった選手も開幕から数戦のあいだ「出場率0」になり、
  //   移籍の関門（`appraiseMove` の unproven）で「1戦も走っていない＝実績なし」扱いになる。
  //   オーナー指摘（2026-08-14）「その前のシーズンは走ってるのにその表示」。
  //   `SETTLED_RACES` を超えたら今季の数字に切り替わる（今季の姿のほうが新しいので）。
  const races = seasonAppearances(playerId, list)
  // ★**今季もう走っているなら、前シーズンを見ないこと。**
  //   前シーズンの日程は「**いまのクラブ**が去年走ったぶん」なので、**今年そのクラブへ
  //   移ってきた選手はそこに1本も載っていません**。そのまま使うと 0/10 になり、
  //   毎レース走っている選手が `appraiseMove` の `unproven` に当たって
  //   **「今のクラブで1戦も走っていない」**と表示されていました
  //   （オーナー・2026-08-20「めちゃくちゃ走ってるのに、移籍でこのチームで走ってないですって出る」）。
  //   前シーズンを見るのは「**今季まだ何も分からないとき**」だけです。
  if (races === 0 && teamRaces < SETTLED_RACES && prevSeason) {
    const prevList = clubSeasonRaces(prevSeason, clubId, teams, foreignLeagues)
    const prevTeamRaces = racesDone(prevList)
    if (prevTeamRaces > 0) {
      const prevRaces = seasonAppearances(playerId, prevList)
      return { fraction: prevRaces / prevTeamRaces, teamRaces: prevTeamRaces, races: prevRaces }
    }
  }
  if (teamRaces === 0) return { fraction: 0.5, teamRaces: 0, races: 0 }
  return { fraction: races / teamRaces, teamRaces, races }
}

/**
 * **移籍まわりで「世界」を渡すところの形。ここ1つ。**
 * 出場率（`playRateOf`）・戦力に入っているか（`transferDecision.keyPlayerStatus`）・
 * 市場価値（`playerUtils.marketValueOf`）が、どれも同じこの材料から出ます。
 * store の状態も engine の引数もそのまま当てはまるので、**呼ぶ側で作り直さないこと。**
 */
export type PlayRateWorld = {
  players: readonly Player[]
  teams: readonly Team[]
  foreignLeagues?: readonly ForeignLeague[]
  currentSeason: { year: number } & PlayRateSeason
  pastSeasons?: readonly ({ year: number } & PlayRateSeason)[]
}
