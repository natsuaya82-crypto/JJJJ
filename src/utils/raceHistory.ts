import type { LeagueId, Race } from '../types'
import { DIVISIONS, divisionInSeason, divisionLeagueId, divisionOfLeague, leagueRaces } from './league'
import { waRaceRows, type WaResultLike } from './waRaces'
import { leagueById } from '../data/leagues'

// 「その選手が走ったレースを、どの大会のものとして並べるか」を決める唯一の場所。
//
// ■なぜ1本にするのか
//   走行記録の置き場所はシーズンの中に6つある。
//     leagues（国内の部・海外リーグ）/ collegeRaces / secondTeamRaces /
//     eclSeries・eclRace / waRaces（＋古いセーブの worldAthleticsResults）
//   画面がこれを1つずつ拾っていたので、足し忘れたぶんは**そのまま表示から消えていた**
//   （海外リーグの出走が選手ページに1件も出ていなかった）。
//
// ■並べ方
//   リーグ名 → そのリーグで走った駅伝名、の順に並べる。
//   **同じコース名でも部が違えば別の大会**として扱う（1部の出雲開幕戦と3部の出雲開幕戦）。
//   部ごとにレース数もコースも違うので、混ぜると記録が比べられない。
//
// ■出すのは走ったものだけ
//   「まだ走っていない大会」を空欄で並べない。海外クラブの選手にJPELの10本が
//   空欄で並ぶ、というのが実際に起きていた。

/** 大会の並び順（小さいほど上）。同じ順位のときは大会名で並べる */
export const LEAGUE_ORDER = {
  division: 0,     // JPEL 1部〜3部（部の番号を足す）
  college: 10,
  reserve: 11,
  ecl: 20,
  foreign: 30,
  world: 40,
} as const

export type RanRace = { year: number; league: string; order: number; race: Race }

export type RaceHistorySeason = {
  year: number
  leagues?: Readonly<Record<LeagueId, { races: Race[]; standings?: readonly { teamId: string; totalPoints: number }[] }>>
  collegeRaces?: Race[]
  secondTeamRaces?: Race[]
  eclRace?: Race
  eclSeries?: { races: Race[] }
  waRaces?: Record<string, Race[]>
}

const done = (rs: readonly Race[] | undefined): Race[] => (rs ?? []).filter(r => r.results)

/**
 * 走り終えたレースを、大会名つきで全部返す。
 * @param playerTeamId 自チームのID。その年に自チームが居た部を先に並べるのに使う
 */
export function ranRaces(o: {
  seasons: readonly (RaceHistorySeason | undefined)[]
  waResults?: readonly WaResultLike[]
  playerTeamId: string
}): RanRace[] {
  const out: RanRace[] = []
  const push = (year: number, league: string, order: number, races: readonly Race[] | undefined) => {
    for (const race of done(races)) out.push({ year, league, order, race })
  }

  for (const s of o.seasons) {
    if (!s) continue
    // 国内の部。その年に自チームが居た部を先に並べる（昇降格で年ごとに変わる）
    const myDiv = divisionInSeason(s, o.playerTeamId)
    for (const d of myDiv != null ? [myDiv, ...DIVISIONS.filter(x => x !== myDiv)] : DIVISIONS) {
      push(s.year, `JPEL ${d}部`, LEAGUE_ORDER.division + d, leagueRaces(s, divisionLeagueId(d)))
    }
    push(s.year, '大学駅伝', LEAGUE_ORDER.college, s.collegeRaces)
    push(s.year, '2軍駅伝', LEAGUE_ORDER.reserve, s.secondTeamRaces)
    push(s.year, 'ECL', LEAGUE_ORDER.ecl, [...(s.eclSeries?.races ?? []), ...(s.eclRace ? [s.eclRace] : [])])
    for (const [lid, lg] of Object.entries(s.leagues ?? {})) {
      if (divisionOfLeague(lid) != null) continue   // 国内の部は上で入れてある
      push(s.year, leagueById(lid)?.name ?? lid, LEAGUE_ORDER.foreign, lg.races)
    }
  }
  // 世界大会は置き場所が新旧2つあるので utils/waRaces から受け取る（そこが吸収する）
  for (const row of waRaceRows(o.seasons.filter(Boolean) as { year: number; waRaces?: Record<string, Race[]> }[], o.waResults)) {
    out.push({ year: row.year, league: row.label, order: LEAGUE_ORDER.world, race: row.race })
  }
  return out
}

// 鍵の区切り。リーグ名にも駅伝名にも空白が入る（「JPEL 1部」「アメリカ予選 大阪カップ」）ので、
// 画面に出ない文字で区切る。空白で切るとほどけない
const SEP = '\u241F'

/** 大会 × 駅伝名 をひとつの鍵にする。同じ駅伝名でも部が違えば別の記録として持つ */
export function raceKey(league: string, raceName: string): string {
  return league + SEP + raceName
}

/**
 * 見出しに出すリーグ名とかぶるぶんを落とした駅伝名。
 * 世界大会のレース名は「アフリカ予選 モガディシュカップ」のように大会名を含むので、
 * 「アフリカ予選」の見出しの下でそのまま出すと二度書きになる。
 */
export function shortRaceName(league: string, raceName: string): string {
  return raceName.startsWith(`${league} `) ? raceName.slice(league.length + 1) : raceName
}

/** 鍵をほどく */
export function splitRaceKey(key: string): { league: string; raceName: string } {
  const i = key.indexOf(SEP)
  return i < 0 ? { league: '', raceName: key } : { league: key.slice(0, i), raceName: key.slice(i + 1) }
}
