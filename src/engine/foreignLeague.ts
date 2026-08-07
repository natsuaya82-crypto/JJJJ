import type { ForeignLeague, ForeignStanding, Player, Race } from '../types'
import { runBackgroundRace, applyCareerAdd } from './backgroundRace'
// コースの呼び名は地域ごと（中身は同じ）。ケニアのクラブが「出雲開幕戦」を走らないようにする
import { courseRegionOfNation, localizeRace } from '../data/courseNames'
// 所属の判定は国内チームと同じものを使う（クラブ側に名簿は持たない）
import { belongsToClub } from '../utils/rosterSync'
import { rankedStandings } from '../utils/league'

// 海外リーグの順位表を初期化（全クラブ 0pt）。
export function initForeignStandings(foreignLeagues: ForeignLeague[]): Record<string, ForeignStanding[]> {
  const out: Record<string, ForeignStanding[]> = {}
  for (const league of foreignLeagues) {
    out[league.id] = league.clubs.map(c => ({ teamId: c.id, totalPoints: 0, raceResults: [] }))
  }
  return out
}

// そのクラブで走れる選手。出場不可（引退/負傷）だけ除外し、status未設定(undefined)の
// 海外選手も走れるようにする（status==='active'で絞ると、statusが付いていない海外選手が
// 全員弾かれ空ラインナップ＝出走0になる）。
// **区間への並べ方はここでは決めない**（engine/backgroundRace の bgLineup 1本）。
function clubRoster(clubId: string, players: Player[]): Player[] {
  return players.filter(p => belongsToClub(p, clubId) && p.status !== 'injured')
}

// 海外リーグを1マッチデー進める。全リーグの各クラブが race を走り、順位表と
// 出走選手の career（通算レース・区間賞）を更新する。プレイヤーは干渉せず結果のみ。
export function simulateForeignLeagueRound(
  race: Race,
  foreignLeagues: ForeignLeague[],
  players: Player[],
  standingsByLeague: Record<string, ForeignStanding[]>,
  seasonProgress: number,
): {
  standingsByLeague: Record<string, ForeignStanding[]>
  players: Player[]
  appearances: Record<string, { clubId: string; races: number; wins: number; rankSum: number; rankedRaces: number }>
  /**
   * リーグID → 走らせたレース（結果つき）。呼ぶ側が Season.foreignRaces へ足す。
   * 以前はここを捨てて出走数だけ残していたので、海外クラブの過去が空になっていた。
   * いずれ海外のクラブを指揮するので、国内と同じだけ残す（CLAUDE.md）
   */
  raced: Record<string, Race>
} {
  const careerAdd: Record<string, { races: number; segWins: number; rankSum: number }> = {}
  const clubOf: Record<string, string> = {}   // playerId → 今走ったクラブ
  const newStandings: Record<string, ForeignStanding[]> = { ...standingsByLeague }
  const raced: Record<string, Race> = {}

  for (const league of foreignLeagues) {
    // 走らせるのは engine/backgroundRace の1本。teams は渡さない（海外クラブはteams未登録
    // ＝本拠地補正1.0中立）。レースIDはリーグごとに分ける（同じコースを9リーグが同じ日に
    // 走るので、そのままだと同じIDのレースが9本できて記録の紐付けが壊れる）
    // コースの中身は本編と同じ。名前だけをそのリーグの地域のものに差し替える
    // （いずれ海外のクラブを指揮するので、その先に「出雲開幕戦」しか無い状態にしない）
    const out = runBackgroundRace({
      race: localizeRace(race, courseRegionOfNation(league.country as Parameters<typeof courseRegionOfNation>[0])),
      players, seasonProgress,
      raceId: `${race.id}@${league.id}`,
      entrants: league.clubs.map(c => ({ id: c.id, roster: clubRoster(c.id, players) })),
    })
    raced[league.id] = out.race

    const prev = newStandings[league.id] ?? league.clubs.map(c => ({ teamId: c.id, totalPoints: 0, raceResults: [] }))
    newStandings[league.id] = prev.map(s => {
      const earned = out.points[s.teamId]
      if (earned == null) return s
      return {
        ...s,
        totalPoints: s.totalPoints + earned,
        raceResults: [...s.raceResults, { raceId: race.id, rank: out.ranks[s.teamId] ?? 0, points: earned }],
      }
    })

    Object.assign(clubOf, out.ranFor)
    for (const [id, add] of Object.entries(out.careerAdd)) {
      const cur = careerAdd[id] ?? { races: 0, segWins: 0, rankSum: 0 }
      careerAdd[id] = { races: cur.races + add.races, segWins: cur.segWins + add.segWins, rankSum: cur.rankSum + add.rankSum }
    }
  }

  const updatedPlayers = applyCareerAdd(players, careerAdd)

  // このマッチデーの出場記録（playerId → クラブ・出場数・区間賞数・区間順位合計）。呼び出し側で今季分に加算する。
  const appearances: Record<string, { clubId: string; races: number; wins: number; rankSum: number; rankedRaces: number }> = {}
  for (const [id, add] of Object.entries(careerAdd)) {
    appearances[id] = { clubId: clubOf[id] ?? '', races: add.races, wins: add.segWins, rankSum: add.rankSum, rankedRaces: add.races }
  }

  return { standingsByLeague: newStandings, players: updatedPlayers, appearances, raced }
}

// シーズン終了時、各海外リーグの優勝クラブ所属選手に career.championships +1。
export function applyForeignChampions(
  foreignLeagues: ForeignLeague[],
  players: Player[],
  standingsByLeague: Record<string, ForeignStanding[]>,
): Player[] {
  const champIds = new Set<string>()
  for (const league of foreignLeagues) {
    const st = standingsByLeague[league.id]
    if (!st || st.length === 0) continue
    const champ = rankedStandings(st)[0]
    if (!champ) continue
    for (const p of players) if (belongsToClub(p, champ.teamId)) champIds.add(p.id)
  }
  if (champIds.size === 0) return players
  return players.map(p => champIds.has(p.id)
    ? { ...p, career: { ...p.career, championships: p.career.championships + 1 } }
    : p)
}
