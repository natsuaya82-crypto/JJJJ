import type { GmOffer, Team } from '../types'

// ============================================================================
// 監督（GM）オファー。「シーズンが終わったあと、別のチームから声がかかる」仕組み。
//
// ■いつ出るか
//   シーズン終了処理の最後、来季の予算と評判が確定したあと。1シーズンに最大1件。
//   答える（行く／行かない）まで残り、答えたら消える。
//
// ■誰から来るか
//   国内チームだけ。海外クラブからは今は来ない。
//   声がかかるのは「自分より上のチーム」。自分が1位のときだけ、他の上位チームから来る。
//   引き抜きなので、成績と評判が良いほど確率が上がる。悪い年は誰も来ない。
//
// ■受けたらどうなるか
//   移籍先が持っているもの（予算・施設・選手・ドラフト権）をそのまま受け継ぐ。
//   前のチームの物は一切持って行かない。だから受諾時に差し替える数字を
//   オファー1件に焼き付けてある（オファーを出す時点でしか分からないため）。
//
// ■解任は無い
//   成績が悪くてもクビにはならない。行くか行かないかを選ぶだけ。
// ============================================================================

// 機能のオン・オフ。false にすると声がかからなくなる（受諾処理は残る）
export const GM_OFFER_ENABLED = true

// 声がかかる確率。成績（順位）と評判から決める。
// 20チームなら 1位=38点、10位=20点、20位=0点。評判は0〜100。
export function offerChance(finalRank: number, gmRep: number, teamCount: number): number {
  if (finalRank <= 0) return 0
  const rankScore = Math.max(0, teamCount - finalRank) * 2
  const score = rankScore + gmRep
  if (score >= 110) return 0.45
  if (score >= 90) return 0.28
  if (score >= 70) return 0.15
  return 0
}

// 声をかけてくるチームの候補。
// 自分より上位のチーム。自分が1位のときは2位・3位（自分以外の上位3チーム）。
export function offerCandidates(
  standings: { teamId: string; totalPoints: number }[],
  playerTeamId: string,
): string[] {
  const sorted = [...standings].sort((a, b) => b.totalPoints - a.totalPoints).map(s => s.teamId)
  const myIndex = sorted.indexOf(playerTeamId)
  if (myIndex < 0) return []
  // 自分より上（0..myIndex-1）。1位なら上が居ないので、自分以外の上位3チームから
  const above = myIndex > 0 ? sorted.slice(0, myIndex) : sorted.slice(0, 4).filter(id => id !== playerTeamId)
  return above
}

// オファーを1件作る。条件を満たさなければ null。
// rng は 0〜1 を返す関数（テストで差し替えられるように外から渡す）。
export function makeGmOffer(params: {
  standings: { teamId: string; totalPoints: number }[]
  playerTeamId: string
  finalRank: number
  gmRep: number
  teamCount: number
  nextYear: number
  teams: Team[]
  nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }>
  objBonus: number
  rng: () => number
}): GmOffer | null {
  if (!GM_OFFER_ENABLED) return null
  const { standings, playerTeamId, finalRank, gmRep, teamCount, nextYear, teams, nextBudgets, objBonus, rng } = params
  if (rng() >= offerChance(finalRank, gmRep, teamCount)) return null
  const candidates = offerCandidates(standings, playerTeamId).filter(id => nextBudgets[id])
  if (candidates.length === 0) return null
  const teamId = candidates[Math.floor(rng() * candidates.length)] ?? candidates[0]
  const b = nextBudgets[teamId]
  const dest = teams.find(t => t.id === teamId)
  const sorted = [...standings].sort((x, y) => y.totalPoints - x.totalPoints)
  const prevRank = sorted.findIndex(s => s.teamId === teamId) + 1
  return {
    teamId,
    year: nextYear,
    budget: b.budget,
    budgetBreakdown: {
      carryover: b.carryover,
      grant: b.grant,
      raceIncome: b.raceIncome,
      sponsor: b.sponsor,
      objBonus: b.objBonus,
      expenses: b.expenses,
    },
    // 目標達成ボーナスのスカウトポイントは監督個人の成果なので持って行く。
    // 施設ぶんは移籍先のスカウト部門を使う
    scoutPoints: 5 + objBonus + (dest?.facilities?.scoutOffice ?? 0),
    prevRank: prevRank > 0 ? prevRank : finalRank,
  }
}
