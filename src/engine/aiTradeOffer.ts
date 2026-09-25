// CPUクラブから自チームへのトレード打診を作る（store/slices/raceSlice の runRace から切り出し）。
//
// 兄弟のCPU側ロジックは engine/cpuMarket.ts（FA獲得・引き抜き）。あちらが
// 「CPU同士・CPUが誰を獲るか」なのに対し、ここは「CPUがGMに何を持ちかけるか」。
//
// ★出す条件は他の移籍とそろえる（utils/transferEligibility の canBePoached）。
//   以前はここだけ非売しか見ておらず、海外挑戦を承認した選手にも打診が来ていた。
// ★乱数は引数で受ける（既定は Math.random）。呼ぶ順は切り出し前と同じで、
//   「既に打診があるなら抽選もしない」短絡もそのまま。
import { effectiveOvr } from '../utils/foreignClubProfile'
import type { AITradeOffer, Player, Season, WorldClub } from '../types'
import { AI_OFFER_GAIN_MAX, AI_OFFER_GAIN_MIN, priceOf } from '../utils/tradeValue'
import { canBePoached, eligibilityCtx } from '../utils/transferEligibility'
import { ovr } from '../utils/playerUtils'
import { cpuSpecialtyNeeds } from './cpuMarket'
import { clubById, clubIds, myLeagueRaces, otherClubs } from '../utils/world'

/** 打診が1件も無いときだけ、25%の確率で1件つくる。作れなければ空 */
export function generateAiTradeOffers(params: {
  players: Player[]
  /** 世界のクラブ（国内52＋海外180）。打診はどのクラブからも来る */
  clubs: WorldClub[]
  playerTeamId: string
  currentSeason: Season
  raceIndex: number
  hasExistingOffer: boolean
  rng?: () => number
}): AITradeOffer[] {
  const { players, clubs, playerTeamId, currentSeason, raceIndex, hasExistingOffer, rng = Math.random } = params
  if (hasExistingOffer) return []
  if (!(rng() < 0.25)) return []
      // トレード提案の質を上げる：
      // - 相手チームは「自チームの手薄なポジションを埋められるチーム」を優先
      // - 欲しがるのは相手（CPU）の補強ニーズに合う自チーム選手、差し出すのは自チームの穴に合う選手
      // - 価値が釣り合う候補の中から「もらえる選手のOVRが最も高い」1件を提案（低OVR同士の消化試合をなくす）
      // トレードで欲しがられる条件も他の移籍と同じ（utils/transferEligibility.ts）。
      // ここだけ非売しか見ておらず、海外挑戦を承認した選手や引退希望の選手にも打診が来ていた
      const tradeCtx = eligibilityCtx(currentSeason, playerTeamId)
      const myTradables = players.filter(p => canBePoached(p, tradeCtx) && ovr(p) >= 62)
      const myNeeds = cpuSpecialtyNeeds(playerTeamId, players)
      // ★**打診してくるのは国内52＋海外180の全部**（オーナー・2026-09-16「二も一緒」）。
      //   CPU同士のトレードは 2026-08-13 に既に1本化されている（「移籍は揃えて。
      //   国内国外という考えは消す」）のに、**GMに来る打診だけ国内に閉じて**いました。
      const cpuIds = clubIds(otherClubs(clubs, playerTeamId))
      // 自チームの穴を埋められる選手(OVR68+)を持つチームを優先。いなければランダム
      const teamsWithFit = cpuIds.filter(id => players.some(p =>
        p.teamId === id && p.status === 'active' && !p.loan && myNeeds.includes(p.specialty) && ovr(p) >= 68))
      const fromId = teamsWithFit.length > 0
        ? teamsWithFit[Math.floor(rng() * teamsWithFit.length)]
        : cpuIds[Math.floor(rng() * cpuIds.length)]
      const theirNeeds = cpuSpecialtyNeeds(fromId, players)
      // 「自チームで出番がある選手」しか提示させない：自チーム10番手のOVRを下回る選手の打診は出さない
      const myMainOvrs = players
        .filter(p => p.teamId === playerTeamId && p.status === 'active')
        .map(p => ovr(p)).sort((a, b) => b - a)
      const lineupBar = myMainOvrs[Math.min(9, Math.max(0, myMainOvrs.length - 1))] ?? 0
      const theirRoster = players.filter(p =>
        // ★年齢の蓋（`p.age <= 33`）は外した。強さは `effectiveOvr`（年齢込み）1本で見る
        p.teamId === fromId && p.status === 'active' && !p.loan && effectiveOvr(p) >= Math.max(65, lineupBar))
      // 自チームの穴（手薄なポジション）に合う選手を優先。いなければ出番基準を満たす全員から
      const fitRoster = theirRoster.filter(p => myNeeds.includes(p.specialty))
      const offerPool = fitRoster.length > 0 ? fitRoster : theirRoster
      // 相手が欲しがるのは補強ニーズに合う自チーム選手（いなければ全員から）
      const wantedByThem = myTradables.filter(p => theirNeeds.includes(p.specialty))
      const askPool = wantedByThem.length > 0 ? wantedByThem : myTradables
      // 価値が釣り合う全組み合わせから選ぶ。
      // もらう選手が出す選手よりOVRで明確に下回る提案は不成立（弱点ポジ適合でも、
      // 数値が低ければ結局使わないので意味がない。市場価値の年齢補正で「若手60⇄ベテラン75」が
      // 等価になっても、額面で損する交換は提示しない）。上回る分は制限なし。
      // 選定はニーズ適合を最優先し、その中でOVR最上位
      // ★**値段は `utils/tradeValue` の `priceOf` 1本**（成立を判断する側とまったく同じ）。
      //   以前ここだけ `calcTransferValue(p)` を**引数なしで**呼んでいて、判断する側は
      //   出場と割増（`transferFeeFor`）を見ていたので、**作る物差しと飲む物差しが別**でした。
      const tvCtx = { races: myLeagueRaces(currentSeason, playerTeamId), teamRaces: currentSeason.currentRaceIndex, players }
      let best: { mine: Player; theirs: Player; fits: boolean } | null = null
      for (const mine of askPool) {
        const myVal = priceOf(mine, tvCtx)
        for (const theirs of offerPool) {
          // ここは「こちらがもらう額面 ÷ こちらが出す額面」なので、成立判定の定数とは逆向き。
          // 同じ数字を使い回すと片方の調整がもう片方に逆向きに効くので別の定数にしてある
          const r = priceOf(theirs, tvCtx) / Math.max(1, myVal)
          if (r < AI_OFFER_GAIN_MIN || r > AI_OFFER_GAIN_MAX) continue
          if (ovr(theirs) < ovr(mine) - 3) continue
          const fits = myNeeds.includes(theirs.specialty)
          const better = !best
            || (fits && !best.fits)
            || (fits === best.fits && ovr(theirs) > ovr(best.theirs))
          if (better) best = { mine, theirs, fits }
        }
      }
  if (!best) return []
  // クラブ名は国内・海外どちらも同じ並びから引く
  const fromShort = clubById(clubs, fromId)?.shortName ?? ''
  return [{
    id: `aito-${raceIndex + 1}-${best.mine.id}`,
    fromTeamId: fromId,
    offeredPlayerIds: [best.theirs.id],
    requestedPlayerIds: [best.mine.id],
    expiresAtRace: raceIndex + 5,
    message: `${fromShort}が${best.mine.name}（OVR${ovr(best.mine)}）との交換に${best.theirs.name}（OVR${ovr(best.theirs)}）を提示しています` }]
}
