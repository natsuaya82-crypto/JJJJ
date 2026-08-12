// ドラフト会場のAI（`components/draft/DraftRoom.tsx` から移設）。
//
// ■「何が足りないか」は補強と同じ物差しを使います（2026-08-12・オーナー判断）
//   移設した時点では**別の答えを出す2本**でした。
//
//     utils/squadNeeds  … そのタイプが0人か、チーム平均を下回っているか。**強さを見る**
//     ここ（旧）        … そのタイプの**人数が少ない順に2つ**。強さを見ない
//
//   人数しか見ないので、**OVR90の逸材もOVR57の候補も、欲しがるクラブが同じ11クラブ**でした
//   （実測・候補120人 × 国内52クラブ）。ドラフトとしておかしいので `squadNeeds` へ揃えました。
//
// ■ただし「走れる7人に入るか」の関門だけは当てません
//   ドラフトは**いま走る人ではなく数年後の戦力を採る場**なので、即戦力の線を当てると
//   成長を待つという考え方が消えます。実測：
//
//     候補が入団したときの序列は中央値14番手。走れる7人に入るのは32%だけ（1部では9.8%）
//     関門あり … 120人中35人が**全52クラブから無視される**（下位30人は全員ゼロ）＝ドラフトが壊れる
//     関門なし … 誰も欲しがらない候補は0人。目玉23.4クラブ／下位5.7クラブと差が付く
//
//   `needsPlayer` の `requireLineup: false` はここだけで使います。
//   **移籍金を払う移籍では絶対に緩めないこと**（1部のクラブが3部で1戦も走っていない
//   選手を「必要」と言い出します）。
import { SALARY_DIAL_MIN, SALARY_DIAL_STEP } from '../data/economy'
import { faMarketSalary } from '../utils/playerUtils'
import { SPECIALTIES, needDepth, needsPlayer } from '../utils/squadNeeds'
import type { Player, Specialty, Team } from '../types'

/** 指名の記録のうち、ここで見るぶんだけ（画面の PickLog の一部） */
export type DraftPick = { teamId: string; playerId: string }

/**
 * ドラフト新人の年俸の下限。**市場相場の半分**を下回らない（極端に安く囲えないようにする）。
 * 上限は `data/economy` の `DRAFT_SALARY_MAX`。
 */
export function draftSalaryFloor(p: Player): number {
  const half = Math.round(faMarketSalary(p) / 2 / SALARY_DIAL_STEP) * SALARY_DIAL_STEP
  return Math.max(SALARY_DIAL_MIN, half)
}

/**
 * そのクラブの名簿（在籍者＋その会場で指名済みのぶん）。
 * **指名した選手はもう名簿に入っている**ものとして数えます（同じタイプを2人続けて指名しない）。
 */
function rosterWithPicks(teamId: string, picks: DraftPick[], allPlayers: Player[]): Player[] {
  const drafted = picks.filter(p => p.teamId === teamId)
    .map(p => allPlayers.find(pl => pl.id === p.playerId))
    .filter(Boolean) as Player[]
  const existing = allPlayers.filter(p => p.teamId === teamId && p.status === 'active')
  return [...existing, ...drafted]
}

/**
 * そのクラブが欲しがっているタイプ（**穴の深い順に2つ**）。画面の「補強ポイント」表示用。
 *
 * 深さの物差しは `utils/squadNeeds` の `needDepth`（チーム平均 − そのタイプの平均）1本。
 * 不在のタイプはチーム平均をそのまま返すので、**0人のタイプが最優先**になります。
 * ★穴がまったく無いクラブでは空になります（「全部足りている」を2つに水増ししない）。
 */
export function draftTeamNeeds(teamId: string, picks: DraftPick[], allPlayers: Player[]): Specialty[] {
  const roster = rosterWithPicks(teamId, picks, allPlayers)
  return SPECIALTIES
    .map(s => ({ s, d: needDepth(roster, s) }))
    .filter(x => x.d > 0)
    .sort((a, b) => b.d - a.d)
    .slice(0, 2)
    .map(x => x.s)
}

/**
 * その候補を欲しがっている他クラブの数（画面の「注目度」）。自クラブは数えない。
 *
 * **タイプの一覧ではなく、その選手そのものを見ます**（`needsPlayer`）。
 * 一覧で数えていたころは、同じタイプなら誰でも同じ注目度になっていました。
 */
export function draftBuzz(player: Player, teams: Team[], playerTeamId: string, picks: DraftPick[], allPlayers: Player[]): number {
  return teams
    .filter(t => t.id !== playerTeamId)
    .filter(t => needsPlayer(rosterWithPicks(t.id, picks, allPlayers), player, { requireLineup: false }))
    .length
}
