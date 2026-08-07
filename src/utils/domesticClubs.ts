import type { Division, Player, Team } from '../types'
import { INITIAL_TEAMS } from '../data/teams'
import { LOWER_DIVISION_TEAMS } from '../data/teamsLower'
import { generateCpuRosters } from '../engine/playerGenerator'
import { tierBudget } from './clubTier'

// 国内クラブ52（1部20 + 2部16 + 3部16）の名簿と、足りないぶんを補う処理の1本。
//
// 部（ディビジョン）を足したのは build 88。そのときのマイグレーション(v31)は
// 既存セーブのチームに division=1 を書くだけで、**下部リーグの32チームを足していなかった**。
// そのため build 88 より前に始めたセーブは20チームしか持っておらず、
//   ・2部の順位表には「1部から降格した数チーム」しか並ばない／3部は空
//   ・昇降格は毎年2チームを落とすのに上がってくる相手がいないので、1部が痩せ続ける
// という状態になる。ここで足りないクラブを補う。

/** 国内クラブの全リスト。新規データはこれで始まる */
export const ALL_DOMESTIC_TEAMS: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS]

/** データどおりの部（昇降格を1度もしていない状態の配置） */
const ORIGINAL_DIVISION = new Map<string, Division>(
  ALL_DOMESTIC_TEAMS.map(t => [t.id, (t.division ?? 1) as Division]),
)
export function originalDivisionOf(teamId: string): Division {
  return ORIGINAL_DIVISION.get(teamId) ?? 1
}

/** そのセーブに国内クラブが全部そろっているか */
export function domesticClubsComplete(teams: readonly { id: string }[]): boolean {
  const have = new Set(teams.map(t => t.id))
  return ALL_DOMESTIC_TEAMS.every(t => have.has(t.id))
}

/**
 * 足りない国内クラブを補い、部をデータどおりに並べ直す。
 *
 * 部を並べ直すのは、補う時点で「降格先が存在しないのに落ちた」チームがいるため。
 * そのまま足すと 1部18・2部18・3部16 になり、昇降格は上下2ずつなので人数が二度と揃わない。
 * 補った年は降格を無かったことにして 20/16/16 に戻し、**その次の年から**通常の昇降格に戻す。
 *
 * すでに全部そろっているセーブでは何もしない（部にも触らない）。
 */
export function backfillDomesticClubs(params: {
  teams: Team[]
  players: Player[]
  year: number
}): { teams: Team[]; players: Player[]; addedTeams: Team[] } {
  const { teams, players, year } = params
  const have = new Set(teams.map(t => t.id))
  const missing = ALL_DOMESTIC_TEAMS.filter(t => !have.has(t.id))
  if (missing.length === 0) return { teams, players, addedTeams: [] }

  // 補うクラブの器。予算は格から引く（tierBudget）。データの finance.budget は使わない
  // 施設は持たせない。自チーム以外のレベルは格から出す（utils/facilities の facilitiesOf）。
  // 初期順位から別の式で焼き込んでいたので、格が動いても施設だけ初期値のまま残っていた
  const seeded: Team[] = missing.map(t => ({
    ...t,
    roster: { main: [] },
    finance: { ...t.finance, budget: tierBudget(t) },
  }))

  // 選手は今の年で作る（生成4経路と同じ buildRatingsForRank を通る）。
  // 選手IDは `ai-<teamId>-<連番>` なので、そのクラブが居なかったセーブとは衝突しない
  const { cpuPlayers, teamRosters } = generateCpuRosters(seeded, year)
  const addedTeams = seeded.map(t => ({ ...t, roster: teamRosters[t.id] ?? { main: [] } }))

  return {
    // 既存クラブの部はデータどおりに戻す（降格先が無いまま落ちたぶんの取り消し）
    teams: [...teams.map(t => ({ ...t, division: originalDivisionOf(t.id) })), ...addedTeams],
    players: [...players, ...cpuPlayers],
    addedTeams,
  }
}
