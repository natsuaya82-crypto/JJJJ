// 来季の格と昇降格（store/slices/seasonSlice の endSeason から切り出し）。
//
// **国内クラブの格は「今季の国内通し順位」1本で決まる。** 1部1位＝格5、3部最下位＝格20。
// 通し順位は 部 → 部内順位 の順（utils/league の domesticThroughRank）。
// **順位表の得点で52チームを直接並べてはいけない**（部ごとにレース数が10/8/7と違うので
// 3部が2部を追い抜く）。予算もスポンサーもロスターの強さも、全部この格から降りてくる。
//
// 昇降格は各部の上位2・下位2。プレーオフなし。
// **格は「今季走った部」での順位で決まり、部の入れ替えはそのあと。**
//
// ★下部リーグのクラブが入っていない古いセーブ（build 88 より前に始めたもの）への配慮が
//   入っている。降格先が無いまま落ちたチームが「2チームしかいない2部」にいると、
//   その部で数えた通し順位21位＝格11相当になり、本来1部のクラブが1年ぶん不当に低い
//   予算を受け取ってしまう。補完する年は**データどおりの部**で数え、昇降格は通さない
//   （補ったばかりのクラブが、走ってもいない順位で動いてしまうため）。
//
// 乱数は使わない。
import type { Division, Season, SeasonStanding, Team } from '../types'
import { tierFromDomesticRank } from '../utils/clubTier'
import { domesticClubsComplete, originalDivisionOf } from '../utils/domesticClubs'
import { DIVISIONS, PROMOTION_SLOTS, divisionOf, domesticThroughRank, rankOfTeam, teamsInDivision } from '../utils/league'
import { divisionMoveHeadline } from '../utils/newsItems'

export function computePromotion(params: {
  teams: Team[]
  currentSeason: Season
  playerTeamId: string
}) {
  const { teams, currentSeason, playerTeamId } = params
  // ── 来季の格 ────────────────────────────────────────────────
  // 国内クラブの格は「今季の国内通し順位」1本で決まる。1部1位＝格5、3部最下位＝格20。
  // 通し順位は 部 → 部内順位 の順（domesticThroughRank）。順位表の得点で52チームを
  // 直接並べてはいけない（部ごとにレース数が違うので3部が2部を追い抜く）。
  // 予算もスポンサーもロスターの強さも、全部この格から降りてくる。
  //
  // ★下部リーグのクラブが入っていない古いセーブ（build 88 より前に始めたもの）は、
  //   降格先が存在しないまま落ちたチームが「2チームしかいない2部」にいる。
  //   その部で数えると通し順位21位＝格11相当になり、本来1部のクラブが1年ぶん
  //   不当に低い予算を受け取ってしまう。補完する年はデータどおりの部で数える。
  const clubsIncomplete = !domesticClubsComplete(teams)
  const effDivisionOf = (t: { id: string; division?: Division }): Division =>
    clubsIncomplete ? originalDivisionOf(t.id) : divisionOf(t)
  // 効き目のある部でまとめ直す。補完が要らない年は、順位表のキーとまったく同じ組になる
  const rowsByEffDiv = (() => {
    const m = new Map<Division, SeasonStanding[]>()
    for (const d of DIVISIONS) {
      for (const r of currentSeason.standings[d] ?? []) {
        const e = effDivisionOf(teams.find(x => x.id === r.teamId) ?? { id: r.teamId })
        const list = m.get(e)
        if (list) list.push(r); else m.set(e, [r])
      }
    }
    return m
  })()
  const divisionRankOf = (t: { id: string; division?: Division }) =>
    rankOfTeam(rowsByEffDiv.get(effDivisionOf(t)), t.id)
  const nextTierOf = (t: { id: string; division?: Division }) =>
    tierFromDomesticRank(domesticThroughRank(effDivisionOf(t), divisionRankOf(t)))
  const myNextTier = nextTierOf(teams.find(t => t.id === playerTeamId) ?? { id: playerTeamId })

  // ── 昇降格 ──────────────────────────────────────────────────
  // 各部の上位2チームが昇格、下位2チームが降格。プレーオフなし。
  // 1部に上は無く、3部に下は無い。上下2ずつなので各部の人数は変わらない。
  // ★格は「今季走った部」での順位で決まる（nextTierOf）。部の入れ替えはその後。
  //
  // ★クラブが足りていないセーブでは、このシーズン終わりに32クラブを補う（下の backfill）。
  //   降格先が存在しないまま落ちていたぶんは取り消してデータどおりの 20/16/16 に戻し、
  //   **次の年から**通常の昇降格に戻す。ここで昇降格を通すと、補ったばかりのクラブが
  //   走ってもいない順位で動いてしまう。
  const nextDivisionOf = (t: { id: string; division?: Division }): Division => {
    if (clubsIncomplete) return originalDivisionOf(t.id)
    const d = divisionOf(t)
    const r = divisionRankOf(t)
    const size = teamsInDivision(teams, d).length
    if (d > DIVISIONS[0] && r <= PROMOTION_SLOTS) return (d - 1) as Division
    if (d < DIVISIONS[DIVISIONS.length - 1] && r > size - PROMOTION_SLOTS) return (d + 1) as Division
    return d
  }
  const divisionMoveNews = clubsIncomplete ? [] : teams
    .map(t => ({ t, from: divisionOf(t), to: nextDivisionOf(t) }))
    .filter(x => x.from !== x.to)
    .map(({ t, from, to }) => ({
      date: `${currentSeason.year}-12-01`,
      headline: divisionMoveHeadline({ clubName: t.name, from, to }),
      category: 'race' as const,
      relatedIds: [t.id] }))
  const myNextDivision = nextDivisionOf(teams.find(t => t.id === playerTeamId) ?? { id: playerTeamId })
  return { nextTierOf, nextDivisionOf, myNextTier, myNextDivision, divisionMoveNews }
}
