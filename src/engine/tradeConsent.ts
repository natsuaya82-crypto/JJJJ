// トレードで**もらう側の選手が首を縦に振るか**。marketSlice から切り出した（挙動不変）。
//
// ■なぜ1本にするのか
//   同じ判定が2箇所にあった。しかも片方（`proposeTrade`）のコメント自身が
//   「成立判定を通らない条件でカウンターを出すと『飲んだのに無反応』になる」と
//   警告していて、**手で揃え続ける前提**になっていた。
//     ・`tradePlayer`   … 成立させる直前の関門
//     ・`proposeTrade`  … チャットの打診に相手が返事をする前の関門
//   さらに「相手クラブが大きく得をするなら本人の説得材料になる」という上乗せの
//   数字（1.2倍・+0.15）が、両方に直接書かれていた。`utils/tradeValue` が
//   「呼び出し側に 0.92 や 1.5 を直接書かないこと」と決めているのと同じ性格の数字なので、
//   ここへ引き上げる。
//
// ■ここでやらないこと
//   ・釣り合っているか（`utils/tradeValue` の `tradeBalance` / `tradeNotLopsided`）
//   ・ロスター上限・予算・出していい選手か … `tradePlayer` の側の関門
import { allTieredClubs, tierOfPlayerClub } from '../utils/clubTier'
import type { ClubTier } from '../utils/clubTier'
import { playRateOf, prevSeasonOf, type PlayRateSeason } from '../utils/playRate'
import { playerConsentToMove } from '../utils/playerUtils'
import type { Destination } from '../utils/transferDecision'
import type { ForeignLeague, Player, Team } from '../types'

/**
 * 相手クラブがこれだけ得をするなら、本人の説得材料になる（もらう額面 ÷ 出す額面）。
 * `utils/tradeValue` の `TRADE_〜` は成立の可否を決める線で、こちらは
 * **成立したうえで本人を口説けるか**の線。別物なので混ぜないこと。
 */
export const TRADE_SWEET_RATIO = 1.2
/** 上の線を超えたときに本人の判定へ足す下駄 */
export const TRADE_SWEET_BONUS = 0.15

export function tradeConsentBonus(ratio: number): number {
  return ratio >= TRADE_SWEET_RATIO ? TRADE_SWEET_BONUS : 0
}

/**
 * もらう選手のうち、**最初に断った1人**とその理由を返す（誰も断らなければ null）。
 *
 * ★渡した順に見る。順番を変えると、2人以上が断るときに名前の出る人が変わる。
 * ★理由も一緒に返すのは、チャットの成功率表示がそれをそのまま見せるため。
 *   名前だけ返すと画面側がもう一度同じ判定を呼ぶことになり、また2箇所に増える。
 */
export function tradeRefuser(
  incoming: Player[],
  ctx: {
    myTeamId: string
    teams: Team[]
    foreignLeagues: ForeignLeague[]
    destinationOf: (clubId: string, player: Player) => Destination
    /** 選手の格（utils/playerTier）。store の playerTierOf をそのまま渡すこと */
    playerTierOf: (player: Player) => ClubTier
    /** 出場率の材料（utils/playRate）。もらう選手の今季は相手クラブの日程で数える */
    currentSeason: PlayRateSeason
    pastSeasons?: readonly ({ year: number } & PlayRateSeason)[]
    year: number
  },
  bonus: number,
): { player: Player; reason: string } | null {
  const clubs = allTieredClubs(ctx.teams, ctx.foreignLeagues)
  for (const rp of incoming) {
    const { fraction, teamRaces } = playRateOf(rp.id, rp.teamId, ctx.currentSeason,
      ctx.teams, ctx.foreignLeagues, prevSeasonOf(ctx.pastSeasons, ctx.year))
    const c = playerConsentToMove(rp, ctx.destinationOf(ctx.myTeamId, rp), tierOfPlayerClub(rp.teamId, clubs),
      fraction, teamRaces, bonus, false, ctx.playerTierOf(rp))
    if (!c.ok) return { player: rp, reason: c.reason }
  }
  return null
}
