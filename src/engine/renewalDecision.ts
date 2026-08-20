// 契約更新の提示に、選手がどう返事をするか。marketSlice から切り出した（挙動不変）。
//
//   承諾（accepted） ／ 逆提示（countered） ／ 拒否（rejected）
//
// ■触るときの注意
//   - **要求額は `utils/contractTalk` の `effectiveDemandSalary` 1本。**
//     チャットで見せている額と、ここで承諾を判定する額が同じ式でなければならない
//     （ラウンドごとに+3%・50万円刻み）
//   - **逆提示は「提示と要求の中間」。** 承諾すれば実際に値引きが成立する額にすること。
//     以前は「要求+3%」で、逆提示に応じるほど損をするので誰も応じなかった
//   - **ラウンドの加算はここでやらない**（`reNegotiateContract` 側だけ。獲得交渉と同じ規約）。
//     ここで進めると二重に加算される
//   - ラウンドの上限は `utils/contractTalk` の `MAX_CONTRACT_ROUNDS` 1本
//   - 乱数を引かない（同じ提示には毎回同じ返事）
import { MAX_CONTRACT_ROUNDS, effectiveDemandSalary } from '../utils/contractTalk'
import type { ContractRequest, Player } from '../types'
import { MORALE_DEFAULT } from '../utils/condition'

export function judgeRenewalOffer(args: {
  request: ContractRequest
  player: Player
  /** 提示した年俸 */
  salary: number
  /** 提示した年数 */
  years: number
  /** 自分の部の中で5位以内か（「強豪か」は部内順位で見る） */
  isGoodTeam: boolean
}): { status: ContractRequest['status']; counterSalary?: number; counterYears?: number; isLastRound: boolean } {
  const { request: req, player, salary, years, isGoodTeam } = args

const personality = player.personality ?? 'salary'
// 要求額は contractTalk の effectiveDemandSalary 1本（チャットで見せている額と同じ）
const demand = effectiveDemandSalary(req)
const ratio = demand > 0 ? salary / demand : 2
// 士気が高い選手は譲歩する（要求を丸呑みしなくても交渉で下げられる余地を作る）
const moraleDiscount = (player.morale ?? MORALE_DEFAULT) >= 80 ? 0.05 : (player.morale ?? MORALE_DEFAULT) >= 65 ? 0.02 : 0
const acceptThresh = (personality === 'winning' && isGoodTeam ? 0.90 : personality === 'loyalty' ? 0.92 : 0.95) - moraleDiscount
const counterThresh = personality === 'salary' ? 0.77 : 0.73
const isLastRound = req.round >= MAX_CONTRACT_ROUNDS  // 交渉のラウンド上限は contractTalk の1本
let newStatus: ContractRequest['status']
let counterSalary: number | undefined
let counterYears: number | undefined
if (ratio >= acceptThresh) {
  newStatus = 'accepted'
} else if (ratio >= counterThresh && !isLastRound) {
  newStatus = 'countered'
  // カウンターは「提示と要求の中間」＝承諾すれば実際に値引きが成立する（従来は要求+3%で交渉するだけ損だった）
  counterSalary = Math.round((demand + salary) / 2 / 500000) * 500000
  counterYears = Math.max(1, years, req.demandYears)
} else {
  newStatus = 'rejected'
}

  return { status: newStatus, counterSalary, counterYears, isLastRound }
}
