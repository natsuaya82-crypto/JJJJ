import type { Player } from '../types'
import { ovr } from './playerUtils'

// リザーブ戦に出せる選手を決める、ただ1つの場所。
//
// もとは同じ段階フィルタが CPU側(gameStore の runSecondTeamRace)と
// プレイヤー側(ReserveLeaguePage)に別々に手書きされていて、片方だけ条件を変えると
// 「自分は出せないのにCPUは出してくる」というズレが起きる形だった。ここに1本化する。
//
// 段階は3つ。上から順に、人数が足りたらそこで止める。
//  ① その週の1軍レースに出ていない かつ OVR80以下（＝基本はこれ）
//  ② 足りなければ OVR80超も解禁。ただし1軍に出た選手はまだ出せない
//  ③ それでも足りなければ1軍に出た選手も解禁（ロスター下限＋故障で組めなくなる詰み対策）
//
// ②と③の順番は入れ替えてはいけない。先に「1軍に出た選手」を解禁すると、
// 同じ週に1軍とリザーブの二重出走になり、出場数と疲労が二重に付く。
// 強い選手がリザーブに出るほうがまだ軽いので、OVRの制限を先に外す。
export const RESERVE_OVR_CAP = 80

export function reserveSquadPool(
  roster: Player[],
  mainRunnerIds: ReadonlySet<string>,
  needed: number,
  // 「頭数として数えられるか」。プレイヤー側は故障者を選べないので数に入れない
  countable: (p: Player) => boolean = () => true,
): Player[] {
  const enough = (list: Player[]) => list.filter(countable).length >= needed
  const fresh = roster.filter(p => !mainRunnerIds.has(p.id))
  const capped = fresh.filter(p => ovr(p) <= RESERVE_OVR_CAP)
  if (enough(capped)) return capped
  if (enough(fresh)) return fresh
  return roster
}
