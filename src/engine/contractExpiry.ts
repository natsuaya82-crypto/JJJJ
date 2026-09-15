// 契約満了とレンタル返却の年度処理。endSeason から切り出した（挙動不変）。
//
// ■ここでやること
//   1. 今季で契約が切れる選手を決める（＝FA になる）
//   2. レンタル期間が終わった選手を保有元へ返す
//   3. どちらも `movePlayer` に通して、同じ後始末にする
//
// ■触るときの注意
//   - **レンタル中の選手は契約満了の対象にしない。** 満了は返却後に保有元で改めて処理する。
//     ここで拾うと「残り1年の選手を2年レンタル」したときに1年目の終わりで FA 化し、
//     借り手からも保有元からも消える（2年契約が1年で消える）
//   - **国内も海外も同じに扱う**（2026-09-15）。★以前は「対象は国内クラブ所属だけ」でした。
//     理由は「海外の名簿は海外リーグ側が持っているので、ここで FA にするとクラブには
//     残ったまま teamId だけ空になる」でしたが、**その前提はもうありません**——
//     所属は `player.teamId` 1本で、クラブ側は名簿を持ちません（`types/index.ts` の
//     `ForeignClub`）。前提が消えたあとも除外だけが残っていて、**海外180クラブの
//     契約が一生切れませんでした**。実測（世界を4年）で海外5,035人のうち2,920人＝58%が
//     「残り0年だが誰も出ていかない」状態。出口が無いので海外の名簿は膨らむ一方で、
//     移籍金の契約年数の係数も全員が最低値に張り付いていました。
//   - **契約満了は自チームもCPUと同じく自動FA。** 旧実装は自チームだけ「判断待ちキュー」に
//     積んでいたが、その判断UIが存在せず契約切れのまま残り続けるバグだった。
//     シーズン中に半年切り通知・チャット催促・終了カードの警告が出ていて、
//     退団も繰越時の退団通知（reason:'fa'）に載るので、気づかず消えることはない
//   - **移籍リストに載せたのに行き先が無かった選手は、ここでは動かさない。**
//     問答無用の強制FA（移籍金0で流出）をやめ、GMが「残す／FAで出す」を選ぶ形にした
//     （`currentSeason.stayOrLeave`）。選ぶまではロスターに残る＝既定は残留。
//     ここは「その候補を集めて返す」だけ
//   - 名簿はクラブ側に持たない（在籍は `player.teamId` 1本）ので、触るのは選手だけ
import { allForeignClubs, domesticTeamIdSet } from '../utils/clubs'
import type { ForeignLeague } from '../types'
import { movePlayer } from '../utils/movePlayer'
import type { Player, Team } from '../types'

export type ContractExpiryResult = {
  /** 今季で契約が切れた選手のID（FA化済み） */
  expiredIds: Set<string>
  /** FA化・返却を反映したあとの選手一覧 */
  players: Player[]
  /** 移籍リストに載ったが行き先が決まらなかった自チームの選手（stayOrLeave に積む） */
  undecidedIds: string[]
}

export function processContractExpiry(args: {
  /** 成長処理まで終わった全選手 */
  grownPlayers: Player[]
  teams: Team[]
  /** 海外リーグ。**渡すこと**——渡さないと海外の契約が切れず、名簿が膨らみ続ける */
  foreignLeagues?: ForeignLeague[] | null
  playerTeamId: string
  /** 今季の年 */
  year: number
}): ContractExpiryResult {
  const { grownPlayers, teams, foreignLeagues, playerTeamId, year } = args

  // **国内52＋海外180を同じ1つの集合**にする。どちらのクラブに居ても契約は同じに切れる。
  // 集合で見るのは、消えたクラブのIDが選手に残っていたときに「クラブ所属」と誤らないため
  const clubIdsFA = domesticTeamIdSet(teams)
  for (const c of allForeignClubs(foreignLeagues)) clubIdsFA.add(c.id)
  const expiredIds = new Set(
    grownPlayers
      .filter(p => p.contract.yearsLeft === 0 && !p.loan && p.teamId && clubIdsFA.has(p.teamId) && p.status === 'active')
      .map(p => p.id)
  )

  const undecidedIds = grownPlayers
    .filter(p => !expiredIds.has(p.id) && p.transferListed && p.teamId === playerTeamId && p.status === 'active')
    .map(p => p.id)

  // レンタル期間終了 → 保有元チームへ自動返却
  const loanReturns = grownPlayers.filter(p => !expiredIds.has(p.id) && p.loan && p.loan.untilYear <= year + 1)

  let players: Player[] = grownPlayers
  const runFA = (pid: string, to: string) => {
    const m = movePlayer({ players, teams: [] }, pid, to, { year })
    if (m.ok) players = m.players
  }
  for (const id of expiredIds) runFA(id, '')
  for (const p of loanReturns) runFA(p.id, p.loan!.ownerTeamId)

  return { expiredIds, players, undecidedIds }
}
