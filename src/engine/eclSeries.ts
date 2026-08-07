// ECLシリーズ（年5戦）の組み立て。出場チームの決め方と、日程の作り方の唯一の決まり。
//
// ここに集めた理由：
//   まったく同じ処理が gameStore.ts の2箇所にコピーされていた。
//     ・endSeason  … シーズン更新のときに翌季ぶんを組む
//     ・ensureEclSeries … 今季のECLが無いときに補充する（旧セーブ・途中加入の救済）
//   コース抽選・開催月・天候・「リーグ戦の合間の中間日に置く」日付計算まで丸ごと2つあり、
//   片方だけ直すと「翌季のECLと補充されたECLで日程の規則が違う」という状態になる。
//
// 出場枠を「1部の上位2」に変えるときも、ここ1箇所を直せば両方に効く。
import { ECL_COURSES } from '../data/eclCourses'
import { rankedStandings } from '../utils/league'
import { ovr } from '../utils/playerUtils'
import type { Player, Race } from '../types'

/** ECLシリーズに出るチーム1つぶん（国内チームでも海外クラブでも同じ形にそろえる） */
export type EclSeriesParticipant = {
  id: string
  name: string
  shortName: string
  isForeign: boolean
  isPlayerTeam: boolean
  leagueName: string
  colors: { primary: string; secondary: string }
}

/** 各リーグから取る枠。JPELも海外も同じ数 */
export const ECL_SLOTS_PER_LEAGUE = 2

/** 開催月。5戦ぶん */
const ECL_MONTHS = ['04', '06', '07', '09', '11'] as const
const ECL_WEATHERS = ['sunny', 'cloudy', 'rainy', 'windy'] as const

type ClubLike = { id: string; name: string; shortName: string; colors: { primary: string; secondary: string } }
type LeagueLike = { id: string; name: string; clubs: ClubLike[] }

/**
 * 出場チームを決める。JPELの上位2 ＋ 海外各リーグの上位2。
 *
 * 海外リーグは、再編直後などで順位表がまだ無い年がある。そのときは開催しないのではなく、
 * クラブの戦力（上位10人のOVR合計）の上位2で代替する。
 */
export function buildEclParticipants(args: {
  /**
   * JPEL**1部**の順位表（この年ぶん、または前年ぶん。呼び出し側がどちらを渡すか決める）。
   * 出場枠は1部の上位2クラブ。部をまたいだ順位表を渡さないこと
   * （部ごとにレース数が違うので、混ぜた順位に意味が無い）
   */
  standings: readonly { teamId: string; totalPoints: number }[]
  teams: readonly { id: string; name: string; shortName: string; colors: { primary: string; secondary: string } }[]
  playerTeamId: string
  leagues: readonly LeagueLike[]
  foreignStandings: Record<string, { clubId: string; totalPoints: number }[]>
  /** 戦力での代替に使う。順位表がある年は読まれない */
  players: readonly Player[]
}): EclSeriesParticipant[] {
  const { standings, teams, playerTeamId, leagues, foreignStandings, players } = args
  const parts: EclSeriesParticipant[] = []

  for (const s of rankedStandings(standings).slice(0, ECL_SLOTS_PER_LEAGUE)) {
    const t = teams.find(tm => tm.id === s.teamId)
    if (t) {
      parts.push({
        id: t.id, name: t.name, shortName: t.shortName,
        isForeign: false, isPlayerTeam: t.id === playerTeamId,
        leagueName: 'JPEL', colors: t.colors,
      })
    }
  }

  // クラブの戦力＝在籍選手のOVR上位10人の合計
  const ovrsByClub = new Map<string, number[]>()
  for (const p of players) {
    if (p.status === 'retired' || !p.teamId) continue
    const arr = ovrsByClub.get(p.teamId)
    if (arr) arr.push(ovr(p))
    else ovrsByClub.set(p.teamId, [ovr(p)])
  }
  const clubStrength = (club: ClubLike) =>
    [...(ovrsByClub.get(club.id) ?? [])].sort((a, b) => b - a).slice(0, 10).reduce((s, v) => s + v, 0)

  for (const league of leagues) {
    const st = rankedStandings(foreignStandings[league.id] ?? []).slice(0, ECL_SLOTS_PER_LEAGUE)
    const clubs = st.length >= ECL_SLOTS_PER_LEAGUE
      ? st.map(s => league.clubs.find(c => c.id === s.clubId)).filter((c): c is ClubLike => !!c)
      : [...league.clubs].sort((a, b) => clubStrength(b) - clubStrength(a)).slice(0, ECL_SLOTS_PER_LEAGUE)
    for (const club of clubs) {
      parts.push({
        id: club.id, name: club.name, shortName: club.shortName,
        isForeign: true, isPlayerTeam: false,
        leagueName: league.name, colors: club.colors,
      })
    }
  }
  return parts
}

/**
 * ECLの開催日の決まり：前後のリーグ戦のちょうど中間に置く。
 * そのままの日付だとリーグ戦の前日にECLが来る殺人日程になるため。
 * 挟むリーグ戦が見つからないときは指定日のまま。
 *
 * 生成時（buildEclRaces）と、旧セーブの日付を直すとき（gameStore の merge）の
 * 両方から呼ぶ。片方だけ直すと「新しく組んだECLと直したECLで日付の規則が違う」ことになる。
 */
export function eclDateBetweenLeagueRaces(target: string, leagueDates: readonly string[]): string {
  const sorted = [...leagueDates].sort()
  const prev = [...sorted].filter(d => d <= target).pop()
  const next = sorted.find(d => d > target)
  if (!prev || !next) return target
  const mid = new Date((new Date(prev).getTime() + new Date(next).getTime()) / 2)
  return `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}-${String(mid.getDate()).padStart(2, '0')}`
}

/**
 * ECLの5戦を作る。
 * @param leagueDates その年のリーグ戦の開催日（並び順は問わない）
 */
export function buildEclRaces(year: number, leagueDates: readonly string[]): Race[] {
  const courses = [...ECL_COURSES].sort(() => Math.random() - 0.5).slice(0, ECL_MONTHS.length)
  const midDate = (target: string) => eclDateBetweenLeagueRaces(target, leagueDates)
  // 大会名はコース名でくくる（第X戦にすると年ごとに別コースが同名になり、距離や記録の比較が壊れる）
  return courses.map((course, i) => ({
    id: `ecl-${year}-r${i + 1}`,
    name: `ECL ${course.name}`,
    date: midDate(`${year}-${ECL_MONTHS[i]}-20`),
    location: course.location,
    type: 'league' as const,
    segments: course.segments,
    conditions: { temperature: 12, weather: ECL_WEATHERS[Math.floor(Math.random() * ECL_WEATHERS.length)], elevation: 0 },
  }))
}
