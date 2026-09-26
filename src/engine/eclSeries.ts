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
import { rankedStandings, TOP_DIVISION } from '../utils/league'
import { ovr } from '../utils/playerUtils'
import type { Player, Race, WorldClub } from '../types'
import { clubById, clubsInLeague } from '../utils/world'
import { leaguesWhere } from '../data/leagues'
import { JPEL_LEAGUE_NAME } from '../utils/clubs'

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

/**
 * 出場チームを決める。**ピラミッドの頂点のリーグ（日本1部と海外9）それぞれの上位2。**
 *
 * 順位表がまだ無い年（再編直後・旧セーブ）は、開催しないのではなく、
 * クラブの戦力（上位10人のOVR合計）の上位2で代替する。★どのリーグも同じ決まり
 *（以前は日本1部だけ「順位表が無ければ出ない」、海外だけ戦力で代替、と分かれていた）
 */
export function buildEclParticipants(args: {
  /** 世界のクラブ（各リーグの顔ぶれもここから引く） */
  clubs: readonly WorldClub[]
  playerTeamId: string
  /**
   * その年のリーグ（順位表をここから引く）。**全リーグ同じ年のものを渡すこと**
   *（呼び出し側が「走り終えた年」か「前年」かを決める。リーグごとに年を混ぜない）
   */
  seasonLeagues: Readonly<Record<string, { standings: readonly { teamId: string; totalPoints: number }[] }>>
  /** 戦力での代替に使う。順位表がある年は読まれない */
  players: readonly Player[]
}): EclSeriesParticipant[] {
  const { clubs, playerTeamId, seasonLeagues, players } = args
  const parts: EclSeriesParticipant[] = []

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

  // 頂点のリーグ＝部の無いリーグと、日本の最上位の部（utils/league の titleTier と同じ段の数え方）
  for (const league of leaguesWhere(l => (l.division ?? TOP_DIVISION) === TOP_DIVISION)) {
    const st = rankedStandings(seasonLeagues[league.id]?.standings ?? []).slice(0, ECL_SLOTS_PER_LEAGUE)
    const members = clubsInLeague(clubs, league.id)
    const picked: ClubLike[] = st.length >= ECL_SLOTS_PER_LEAGUE
      ? st.map(s => clubById(members, s.teamId)).filter((c): c is WorldClub => !!c)
      : [...members].sort((a, b) => clubStrength(b) - clubStrength(a)).slice(0, ECL_SLOTS_PER_LEAGUE)
    for (const club of picked) {
      parts.push({
        id: club.id, name: club.name, shortName: club.shortName,
        // 自チームかどうかは id だけで見る（W6。どのリーグから出ても同じ）
        isForeign: league.division == null, isPlayerTeam: club.id === playerTeamId,
        leagueName: league.division != null ? JPEL_LEAGUE_NAME : league.name, colors: club.colors,
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
