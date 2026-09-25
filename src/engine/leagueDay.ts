// リーグの日程を組む・日付で進める。**「どのリーグがいつ走るか」はここ1本。**
//
// ■日程
//   日本1部・2部・3部の日程は `data/races` の `drawSeasonSchedules`（部ごとに抽選）。
//   海外9リーグは**日本1部と同じ10日・同じコースの並び**を走る（オーナー・2026-09-25）。
//   コースの呼び名だけそのリーグの地域のもの（`data/courseNames` の `localizeRace`）。
//   レースIDは `<1部のレースID>@<リーグID>`（同じ日に9リーグが同じコースを走るので分ける）。
import type { LeagueId, LeagueSeason, Player, Race, Season, SeasonStanding, WorldClub } from '../types'
import { courseRegionOfNation, localizeRace } from '../data/courseNames'
import { TOP_DIVISION, addRaceToStandings, divisionLeagueId, divisionOfLeague } from '../utils/league'
import { clubsInLeague } from '../utils/world'
import { FOREIGN_LEAGUE_DEFS, type WorldLeague } from '../data/leagues'
import { playersByClub } from '../utils/rosterSync'
import { applyCareerAdd, runBackgroundRace } from './backgroundRace'
import { applyRaceMorale, standingOf } from './raceMorale'

type Leagues = Record<LeagueId, LeagueSeason>

/** 海外リーグの日程の手本＝日本1部の日程（結果は外す） */
function templateRaces(leagues: Leagues): Race[] {
  return (leagues[divisionLeagueId(TOP_DIVISION)]?.races ?? []).map(r => ({ ...r, results: undefined }))
}

/** 手本の1戦を、そのリーグの1戦にする（呼び名は地域のもの・IDはリーグごと） */
function foreignRaceOf(template: Race, league: Pick<WorldLeague, 'id' | 'country'>): Race {
  const local = localizeRace(template, courseRegionOfNation(league.country as Parameters<typeof courseRegionOfNation>[0]))
  return { ...local, id: `${template.id}@${league.id}` }
}

/**
 * 海外リーグの日程と順位表をそろえる。**冪等**（何度通しても同じ）。
 *
 * ・日程は手本（日本1部）の本数までを足す。走り終えた回はそのまま残し、足りないぶんだけ
 *   手本の同じ番目から足す（旧セーブで自チームの部の日程を借りて走っていた回も消さない）
 * ・順位表が無いリーグは全クラブ 0pt で作る。途中で増えたクラブの行も足す
 */
export function withForeignSchedules(leagues: Leagues, clubs: readonly WorldClub[] | undefined): Leagues {
  const template = templateRaces(leagues)
  let out: Leagues | null = null
  for (const lg of FOREIGN_LEAGUE_DEFS) {
    const members = clubsInLeague(clubs, lg.id)
    // クラブが1つも居ないリーグは組まない（そのリーグを持たない世界）
    if (members.length === 0) continue
    const cur = leagues[lg.id]
    const races = cur?.races ?? []
    const add = template.slice(races.length).map(t => foreignRaceOf(t, lg))
    const rows = cur?.standings ?? []
    const have = new Set(rows.map(r => r.teamId))
    const missing: SeasonStanding[] = members.filter(c => !have.has(c.id)).map(c => ({ teamId: c.id, totalPoints: 0, raceResults: [] }))
    if (cur && add.length === 0 && missing.length === 0) continue
    out = out ?? { ...leagues }
    out[lg.id] = { races: [...races, ...add], standings: [...rows, ...missing] }
  }
  return out ?? leagues
}

// ============================================================================
// 時計は日付1本
//
// ★**「自チームの何戦目か」で他のリーグを進めないこと。** 自チームのリーグの次の1戦の日付が来たら、
//   その日までに開催のある**ほかのリーグを全部、日付の順に**走らせてから本編を走る（store の runRace）。
//   シーズンの終わりには、残っている開催を全部走らせる（store の endSeason）。
//   以前は国内の他の部（engine/domesticLeague の simulateAwayDivisions）と海外
//   （advanceForeignLeagues）が別々に「自チームの何戦目か」で進んでいて、3部で遊ぶと
//   1部の日程が7戦で止まり、海外は自チームの部の日程を借りて7戦しか走らなかった。
// ★走らせるのは engine/backgroundRace の runBackgroundRace 1本。どのリーグも同じ形で、
//   順位表・走行記録・通算成績・士気・区間賞の賞金を同じだけ動かす。
// ============================================================================

/**
 * リーグ戦に出られる選手。負傷・引退・ドラフト候補は出られない。
 * 海外の選手は status を持たないセーブがあるので、未設定も走れる扱い。
 */
function canRunLeagueRace(p: Player): boolean {
  return p.status == null || p.status === 'active'
}

/**
 * `through`（その日を含む）までに開催のある各リーグのレースを、日付の順に全部走らせる。
 * 走るものも、そろえる日程も無ければ null（呼ぶ側は状態を変えない）。
 *
 * ★**乱数を引く。** 走らせる順（日付 → 同じ日ならリーグの並び）を動かすと世界が変わる。
 */
export function runLeaguesThrough(o: {
  season: Season
  players: Player[]
  /** 世界のクラブ（海外リーグの顔ぶれ・施設・本拠地の補正） */
  clubs: WorldClub[]
  /** `YYYY-MM-DD`。この日までの開催を走らせる */
  through: string
  /** 走らせないリーグ（自チームのリーグ。本編で走る） */
  skip?: LeagueId
}): { season: Season; players: Player[] } | null {
  const scheduled = withForeignSchedules(o.season.leagues, o.clubs)
  const leagues: Leagues = { ...scheduled }
  const due: { leagueId: LeagueId; index: number; date: string }[] = []
  for (const [leagueId, lg] of Object.entries(leagues)) {
    if (leagueId === o.skip) continue
    lg.races.forEach((r, index) => { if (!r.results && r.date <= o.through) due.push({ leagueId, index, date: r.date }) })
  }
  if (due.length === 0) {
    // 走るものが無くても、海外リーグの日程をそろえたなら残す（日程の画面が空にならないように）
    return scheduled === o.season.leagues ? null : { season: { ...o.season, leagues: scheduled }, players: o.players }
  }
  // 日付の順。同じ日はリーグの並び（Array#sort は安定）
  due.sort((a, b) => a.date.localeCompare(b.date))

  // 施設（戦術室）は国内・海外とも所属クラブのもの
  let players = o.players
  const segPrize = { ...(o.season.seasonSegPrize ?? {}) }
  const awayApps = { ...(o.season.awayAppearances ?? {}) }
  const foreignApps = { ...(o.season.foreignAppearances ?? {}) }

  for (const d of due) {
    const lg = leagues[d.leagueId]
    const byClub = playersByClub(players)
    const out = runBackgroundRace({
      race: lg.races[d.index],
      players, clubs: o.clubs,
      seasonProgress: d.index / lg.races.length,
      entrants: lg.standings.map(s => ({ id: s.teamId, roster: (byClub.get(s.teamId) ?? []).filter(canRunLeagueRace) })),
    })
    leagues[d.leagueId] = {
      races: lg.races.map((r, i) => (i === d.index ? out.race : r)),
      standings: addRaceToStandings(lg.standings, out.race),
    }
    // 通算成績と士気（engine/raceMorale）。走ったクラブの選手だけが動く
    players = applyRaceMorale({
      players: applyCareerAdd(players, out.careerAdd),
      standing: standingOf(out.race.results?.teamRankings ?? []),
      segWinIds: new Set(Object.entries(out.careerAdd).filter(([, a]) => a.segWins > 0).map(([id]) => id)),
      racingIds: new Set(Object.keys(out.ranFor)),
    })
    for (const [tid, v] of Object.entries(out.segPrize)) segPrize[tid] = (segPrize[tid] ?? 0) + v
    // 旧い集計（走行記録を残す前の年の読み口と、海外の実績倍率 perfOf が読む）。
    // 国内の部は awayAppearances、海外は foreignAppearances に積む（置き場所が違うだけ）
    const isDivision = divisionOfLeague(d.leagueId) != null
    for (const [pid, a] of Object.entries(out.careerAdd)) {
      if (isDivision) {
        const cur = awayApps[pid] ?? { races: 0, wins: 0 }
        awayApps[pid] = { races: cur.races + a.races, wins: cur.wins + a.segWins }
      } else {
        const cur = foreignApps[pid] ?? { clubId: out.ranFor[pid] ?? '', races: 0, wins: 0 }
        foreignApps[pid] = {
          clubId: out.ranFor[pid] || cur.clubId, races: cur.races + a.races, wins: cur.wins + a.segWins,
          rankSum: (cur.rankSum ?? 0) + a.rankSum, rankedRaces: (cur.rankedRaces ?? 0) + a.races,
        }
      }
    }
  }

  return {
    players,
    season: { ...o.season, leagues, seasonSegPrize: segPrize, awayAppearances: awayApps, foreignAppearances: foreignApps },
  }
}
