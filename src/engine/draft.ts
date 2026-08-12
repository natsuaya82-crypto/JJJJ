// ドラフト会場のAI（`components/draft/DraftRoom.tsx` から移設・挙動不変）。
//
// ■ここにあるのは「ドラフトの場での見立て」であって、補強の判断ではありません
//   `utils/squadNeeds` の `needsPlayer` とは**別の答えを出します**。
//
//     squadNeeds  … そのタイプが0人か、チーム平均を下回っているか。**強さを見る**
//     ここ        … そのタイプの**人数が少ない順に2つ**。強さを見ない
//
//   ドラフトは頭数を揃える場なので人数だけを見る、という形になっています。
//   **どちらが正かはオーナー判断**なので、移設では揃えていません
//   （`docs/OWNER_DECISIONS.md`）。**勝手に `needsPlayer` へ寄せないこと。**
//
// ■移設のときに確かめたこと
//   旧実装をそのまま写して、4チーム×5段階の指名状況×候補18人＝総当たり 468件を
//   突き合わせ、差分ゼロを確認しています（`scripts/check-draft-ai.ts` が同じ形で見張ります）。
import { SALARY_DIAL_MIN, SALARY_DIAL_STEP } from '../data/economy'
import { faMarketSalary } from '../utils/playerUtils'
import { SPECIALTIES } from '../utils/squadNeeds'
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
 * そのチームがドラフトで欲しがるタイプ（**人数の少ない順に2つ**）。
 * 既存の在籍者に、その会場で指名済みのぶんを足して数えます。
 *
 * ★同数のときは `SPECIALTIES` の並び順で先にあるほうが勝ちます（`sort` が安定なので）。
 *   並び順を変えると指名の傾向が変わるので、`utils/squadNeeds` の `SPECIALTIES` を触らないこと。
 */
export function draftTeamNeeds(teamId: string, picks: DraftPick[], allPlayers: Player[]): Specialty[] {
  const drafted = picks.filter(p => p.teamId === teamId).map(p => allPlayers.find(pl => pl.id === p.playerId)).filter(Boolean) as Player[]
  const existing = allPlayers.filter(p => p.teamId === teamId)
  const all = [...existing, ...drafted]
  const specs: readonly Specialty[] = SPECIALTIES
  const counts = specs.reduce((acc, s) => { acc[s] = all.filter(p => p.specialty === s).length; return acc }, {} as Record<Specialty, number>)
  return [...specs].sort((a, b) => counts[a] - counts[b]).slice(0, 2)
}

/** その候補を欲しがっている他チームの数（画面の「注目度」）。自チームは数えない。 */
export function draftBuzz(player: Player, teams: Team[], playerTeamId: string, picks: DraftPick[], allPlayers: Player[]): number {
  return teams
    .filter(t => t.id !== playerTeamId)
    .filter(t => draftTeamNeeds(t.id, picks, allPlayers).includes(player.specialty))
    .length
}
