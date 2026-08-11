// market ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
import { tradeValueCtxOf, acquisitionDesiredSalary, faAllowedDespiteBan, willingFeeFor, finalizeSale } from '../marketOps'
import { buildContractRequests } from '../../engine/contractRequests'
import { judgeRenewalOffer } from '../../engine/renewalDecision'
import { judgeSaleOffer, withSaleRefused } from '../../engine/saleOfferGate'
import { runTradeMoves, swapDraftPicks } from '../../engine/tradeExecution'
import { tradeConsentBonus, tradeRefuser } from '../../engine/tradeConsent'
import { reinforcementBanned } from '../../data/economy'
import { pickKeysValue, roundFee } from '../../data/economy'
import { ROSTER_MAX, canReleaseFromRoster, canSignContract } from '../../data/rosterRules'
import { nationalityToForeignCategory } from '../../engine/playerGenerator'
import { type AcquisitionOffer, type ContractRequest, type ExpiredNegKind, type ForeignCategory, type IncomingOffer, type Player, type TradeNegotiation, type TransferListing } from '../../types'
import { MAJOR_NEWS_OVR, allTieredClubs, tierOf, tierOfClubId, tierOfPlayerClub } from '../../utils/clubTier'
import { bigClub, findClub, leagueOfClub } from '../../utils/clubs'
import { withMorale } from '../../utils/condition'
import { canOfferRenewal, canReNegotiate, contractTalkCtx, liveContractOf } from '../../utils/contractTalk'
import { divisionOf, divisionStandings, domesticThroughRankOfTeam, rankOfTeam, rankedStandings, seasonDivisionStandings } from '../../utils/league'
import { fmtYen } from '../../utils/money'
import { movePlayer } from '../../utils/movePlayer'
import { foreignSignedHeadline, joinedHeadline, loanInOutHeadline, renewalHeadline, signedWithFeeHeadline, tradeAcceptedHeadline, tradeSummaryHeadline } from '../../utils/newsItems'
import { type OfferOutcome } from '../../utils/offerResult'
import { playRateOf } from '../../utils/playRate'
import { calcTransferValue, faMarketSalary, freeContactConsent, keyPlayerStatus, ovr, perfOf, playerConsentToMove, racesConsumed, salaryAppealBonus, seasonPerfProfile } from '../../utils/playerUtils'
import { belongsToClub, squadIdsOf } from '../../utils/rosterSync'
import { withSaleAnswer } from '../../utils/saleAnswer'
import { STALE_TRADE_MSG } from '../../utils/talkSync'
import { TRADE_HARD_NO_RATIO, TRADE_MIN_RATIO, TRADE_OK_RATIO, faceValueOf, tradeBalance, tradeNotLopsided, tradeValues } from '../../utils/tradeValue'
import { type Appraisal, type Destination, appraiseMove, buildDestination, rankOffers, regionOfLeague } from '../../utils/transferDecision'
import { canAcceptOfferFor, canBePoached, canListForSale, canLoanOut, canTradeAway, eligibilityCtx, isLeavingClub } from '../../utils/transferEligibility'

type Slice = Pick<GameStore,
  'releasePlayer' | 'extendContract' | 'renewContractOffer' | 'sendScoutMission' | 'startFAVisit' | 'acceptTradeOffer' | 'rejectTradeOffer' | 'executeTransferPurchase' | 'destinationOf' | 'resolveStayOrLeave' | 'rankIncomingOffers' | 'consentToLeave' | 'acceptIncomingOffer' | 'declineIncomingOffer' | 'acceptIncomingLoanOffer' | 'declineIncomingLoanOffer' | 'initiateContractRenewal' | 'generateContractRequests' | 'submitContractRenewalOffer' | 'acceptContractCounter' | 'reNegotiateContract' | 'abandonContractRenewal' | 'startAcquisitionOffer' | 'submitAcquisitionOffer' | 'acceptAcquisitionCounter' | 'reNegotiateAcquisition' | 'abandonAcquisitionOffer' | 'releasePlayerWithBuyout' | 'counterAllIncomingOffers' | 'counterIncomingOffer' | 'dismissRetirementRequest' | 'acceptRetirement' | 'approveOverseasChallenge' | 'denyOverseasChallenge' | 'dismissTransferRequest' | 'allowPlayerTransfer' | 'toggleNoSale' | 'toggleLoanListed' | 'cancelSellListing' | 'loanInPlayer' | 'loanOutPlayer' | 'submitLoanRequest' | 'cancelLoanRequest' | 'dismissLoanResponse' | 'submitTransferBid' | 'acceptFeeCounter' | 'rejectTransferBid' | 'finalizeTransfer' | 'listMyPlayerForSale' | 'delistMyPlayer' | 'scoutOpponentPlayer' | 'toggleStarOpponent' | 'toggleStarProspect' | 'tradePlayer' | 'proposeTrade' | 'acceptTradeCounter' | 'dismissTradeNegotiation' | 'setChatLog' | 'signForeignPlayer' | 'getTransferWindow' | 'getRosterWindow' | 'refuseFreeContactRetention'>

// トレードの同意判定に渡す材料（engine/tradeConsent）。成立させる側とチャットの打診側で
// **同じものを渡す**ためにここ1本から作る（手書きすると片方だけ古い state を見る事故が起きる）
const consentCtxOf = (get: () => GameStore) => () => {
  const st = get()
  return { myTeamId: st.playerTeamId, teams: st.teams, foreignLeagues: st.foreignLeagues, destinationOf: st.destinationOf }
}

export const createMarketSlice = (set: SetGame, get: () => GameStore): Slice => {
  const consentCtx = consentCtxOf(get)
  return ({

  releasePlayer: (playerId) => {
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      if (!player || player.teamId !== state.playerTeamId) return state
      // 最低ロスター人数を割る放出は不可
      if (!canReleaseFromRoster(state.players, state.playerTeamId)) return state
      // 契約期間が残っているなら解約金（残年俸×(残年-1)）。満了(残1年以下)は無償。
      const buyout = player.contract.annualSalary * Math.max(0, player.contract.yearsLeft - 1)
      // 支払いは Math.max(0, ...) で挟まない。挟むと残高がマイナスのときに
      // 「払ったら0円に戻る（＝実質チャージ）」になってしまう。赤字はそのまま深くする。
      // 移動は movePlayer 一本（所属を空にして名簿から外し、移籍リストの札もはがす）
      const moved = movePlayer(state, playerId, '', { year: state.currentSeason.year })
      if (!moved.ok) return state
      return {
        players: moved.players,
        teams: moved.teams.map(t => t.id === state.playerTeamId
          ? { ...t, finance: { ...t.finance, budget: t.finance.budget - buyout } }
          : t) }
    })
  },


  extendContract: (playerId) => {
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      if (!player || player.teamId !== state.playerTeamId) return state
      return {
        players: state.players.map(p =>
          p.id === playerId ? {
            ...p,
            contract: {
              ...p.contract,
              yearsLeft: p.contract.yearsLeft + 3,
              annualSalary: Math.round(p.contract.annualSalary * 1.1) } } : p
        ) }
    })
  },


  sendScoutMission: (prospectId) => {
    set(state => {
      if (state.currentSeason.scoutPoints < 2) return state
      const already = (state.currentSeason.scoutMissions ?? []).some(m => m.prospectId === prospectId)
      if (already) return state
      return {
        currentSeason: {
          ...state.currentSeason,
          scoutPoints: state.currentSeason.scoutPoints - 2,
          scoutMissions: [...(state.currentSeason.scoutMissions ?? []), { id: `sm_${Date.now()}`, prospectId, racesLeft: 2 }] }
      }
    })
  },


  startFAVisit: (playerId) => {
    set(state => {
      const already = (state.currentSeason.faVisits ?? []).some(v => v.playerId === playerId)
      if (already) return state
      return {
        currentSeason: {
          ...state.currentSeason,
          faVisits: [
            ...(state.currentSeason.faVisits ?? []),
            { playerId, raceScouted: state.currentSeason.currentRaceIndex },
          ] } }
    })
  },


  renewContractOffer: (playerId, salary, years) => {
    const state = get()
    const player = state.players.find(p => p.id === playerId)
    if (!player || player.teamId !== state.playerTeamId) return false
    const ratio = salary / player.contract.annualSalary
    const personality = player.personality ?? 'salary'
    // 「上位のチームか」は自分が走っている部の中で見る（順位表は部ごとに分かれている）
    const standings = seasonDivisionStandings(state.currentSeason, state.playerTeamId)
    const myRank = rankOfTeam(standings, state.playerTeamId)
    const isGoodTeam = myRank > 0 && myRank <= 5
    const minRatio =
      personality === 'loyalty' ? 0.98
      : personality === 'winning' && isGoodTeam ? 1.05
      : 1.08
    if (ratio < minRatio || years < 1) return false
    set(state => ({
      players: state.players.map(p =>
        p.id === playerId
          ? { ...p, contract: { ...p.contract, yearsLeft: p.contract.yearsLeft + years, annualSalary: salary } }
          : p
      ),
      currentSeason: {
        ...state.currentSeason,
        newsFeed: [{
          date: state.currentSeason.races[state.currentSeason.currentRaceIndex - 1]?.date ?? `${state.currentSeason.year}-06-01`,
          headline: renewalHeadline({ playerName: player.name, years }),
          category: 'fa' as const,
          relatedIds: [playerId] }, ...state.currentSeason.newsFeed].slice(0, 30) } }))
    return true
  },


  acceptTradeOffer: (offerId) => {
    set(state => {
      const offer = (state.currentSeason.pendingTradeOffers ?? []).find(o => o.id === offerId)
      if (!offer) return state
      // 打診後に状況が変わっていたら成立させず破棄する（ロスター破壊防止）。
      // 打診は5レース残るので、その間に非売にした・海外挑戦を承認した・引退希望を受理した、
      // という場合も止める（以前は在籍しているかどうかしか見ていなかった）
      const offerCtx = eligibilityCtx(state.currentSeason, state.playerTeamId)
      // 飲めないときは黙ってカードを消さず、なぜ流れたかを通知に残す。
      // 通知は「交渉期限切れ」の箱（expiredNegotiations）に相乗りする。新しい箱は作らない
      const callOff = (playerId: string, kind: ExpiredNegKind) => ({
        currentSeason: {
          ...state.currentSeason,
          pendingTradeOffers: (state.currentSeason.pendingTradeOffers ?? []).filter(o => o.id !== offerId),
          expiredNegotiations: [
            ...(state.currentSeason.expiredNegotiations ?? []).filter(n => n.id !== `tx_${offerId}`),
            { id: `tx_${offerId}`, playerId,
              // 指名権だけの交換なら選手が居ないので、そのぶんの言い方にする
              playerName: state.players.find(pl => pl.id === playerId)?.name ?? '指名権', kind },
          ] } })
      // 前提が崩れた選手を1人だけ特定する（誰の話で止まったのかを通知に出すため）
      const brokenId =
        offer.offeredPlayerIds.find(pid => {
          const p = state.players.find(pl => pl.id === pid)
          return !p || !canBePoached(p, { teamId: offer.fromTeamId, currentYear: state.currentSeason.year })
        })
        ?? offer.requestedPlayerIds.find(pid => {
          const p = state.players.find(pl => pl.id === pid)
          return !p || !canTradeAway(p, offerCtx) || !!p.noSale
        })
      if (brokenId !== undefined) return callOff(brokenId, 'trade')
      // 釣り合いの見張り。ここだけ判定が1つも無く、打診は5レース残るので、その間に
      // こちらの選手が伸びた／相手の選手が衰えたあとでも、作られた当時の条件のまま飲めていた。
      // 出す側（自チーム）が offeredVal、もらう側が requestedVal と向きが逆になる点に注意
      const tvCtxA = tradeValueCtxOf(state)
      const outPlayers = offer.requestedPlayerIds.map(pid => state.players.find(pl => pl.id === pid)).filter((p): p is Player => !!p)
      const inPlayers = offer.offeredPlayerIds.map(pid => state.players.find(pl => pl.id === pid)).filter((p): p is Player => !!p)
      const acceptIn = { outPlayers, inPlayers,
        outExtra: pickKeysValue(offer.requestedPickKeys ?? []),
        inExtra: pickKeysValue(offer.offeredPickKeys ?? []) }
      if (!tradeNotLopsided(acceptIn, tvCtxA).ok) {
        return callOff(offer.requestedPlayerIds[0] ?? offer.offeredPlayerIds[0] ?? '', 'trade_unfair')
      }
      const tradeDate = state.currentSeason.races[state.currentSeason.currentRaceIndex - 1]?.date
      // 選手の出し入れも指名権の交換も engine/tradeExecution 1本
      // （こちらから出す tradePlayer とまったく同じ動かし方を通す）
      const moved = runTradeMoves({ players: state.players, teams: state.teams }, [
        ...offer.offeredPlayerIds.map(pid => ({ playerId: pid, toTeamId: state.playerTeamId })),
        ...offer.requestedPlayerIds.map(pid => ({ playerId: pid, toTeamId: offer.fromTeamId })),
      ], { year: state.currentSeason.year, date: tradeDate, raceIndex: state.currentSeason.currentRaceIndex, myTeamId: state.playerTeamId })
      const players = moved.players
      const teams = swapDraftPicks(moved.teams,
        { teamId: offer.fromTeamId, pickKeys: offer.offeredPickKeys ?? [] },
        { teamId: state.playerTeamId, pickKeys: offer.requestedPickKeys ?? [] })
      const tradeRecords = moved.records
      const tradeNotices = moved.notices

      const fromTeamName = teams.find(t => t.id === offer.fromTeamId)?.shortName ?? ''
      const tradeNews = {
        date: tradeDate ?? `${state.currentSeason.year}-06-01`,
        headline: tradeAcceptedHeadline(fromTeamName),
        category: 'trade' as const,
        relatedIds: [...offer.offeredPlayerIds, ...offer.requestedPlayerIds] }
      return {
        players, teams,
        transferHistory: [...(state.transferHistory ?? []), ...tradeRecords].slice(-400),
        currentSeason: {
          ...state.currentSeason,
          pendingTradeOffers: (state.currentSeason.pendingTradeOffers ?? []).filter(o => o.id !== offerId),
          newsFeed: [tradeNews, ...state.currentSeason.newsFeed].slice(0, 30),
          departureNotices: [...(state.currentSeason.departureNotices ?? []), ...tradeNotices] } }
    })
  },


  rejectTradeOffer: (offerId) => {
    set(state => ({
      currentSeason: {
        ...state.currentSeason,
        pendingTradeOffers: (state.currentSeason.pendingTradeOffers ?? []).filter(o => o.id !== offerId) } }))
  },


  executeTransferPurchase: (listingId, price) => {
    const state = get()
    const listing = (state.currentSeason.transferListings ?? []).find(l => l.id === listingId)
    if (!listing) return false
    const player = state.players.find(p => p.id === listing.playerId)
    if (!player || player.teamId !== listing.fromTeamId) return false
    const myTeam = state.teams.find(t => t.id === state.playerTeamId)
    if (!myTeam || myTeam.finance.budget < price) return false
    if (reinforcementBanned(myTeam)) return false  // 赤字ペナルティ中・残高マイナスは新規補強不可（ドラフト・契約更新は可）
    if (!canSignContract(state.players, state.playerTeamId)) return false  // 総在籍30人の上限（31人化の防止）
    // 移動は movePlayer 一本（売り手への入金・買い手からの出金・名簿の付け替え・履歴まで込み）
    let bought = false
    set(state => {
      const years = Math.max(player.contract.yearsLeft, 2)
      const moved = movePlayer(state, listing.playerId, state.playerTeamId, {
        year: state.currentSeason.year,
        date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date,
        raceIndex: state.currentSeason.currentRaceIndex,
        fee: price, years, myTeamId: state.playerTeamId, checkCapacity: true,
        contract: { yearsLeft: years } })
      if (!moved.ok) return state
      bought = true
      return ({
      players: moved.players,
      teams: moved.teams,
      transferHistory: [...(state.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
      currentSeason: {
        ...state.currentSeason,
        transferSpend: (state.currentSeason.transferSpend ?? 0) + moved.spend,
        transferListings: (state.currentSeason.transferListings ?? []).filter(l => l.id !== listingId),
        newsFeed: [{ date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`, headline: signedWithFeeHeadline({ playerName: player.name, fee: price }), category: 'trade' as const, relatedIds: [player.id], major: ovr(player) >= MAJOR_NEWS_OVR || bigClub(state, listing.fromTeamId), fromTeamId: listing.fromTeamId, toTeamId: state.playerTeamId }, ...state.currentSeason.newsFeed].slice(0, 30) } })
    })
    return bought
  },


  // 売る側の本人同意。買う側（submitTransferBid → finalizeTransfer）が通しているのと
  // 同じ playerConsentToMove 1本を、売る側にも通す。ここだけ判定が無く、GMが承諾した
  // 瞬間に選手が動いていた（本人の意思が入るのは買うときだけ、という非対称）。
  // 断られたら今季はこの選手への打診が来なくなる（saleRefusedYear）。
  // 自チームが買いに行って断られたときの transferLockedUntilYear と同じ扱い。
  // 行き先クラブの姿（格・そこで何番手か・ECL出場・順位）を作る。
  // 国内チームでも海外クラブでも同じ入口。判断そのものは utils/transferDecision.ts
  destinationOf: (clubId, player) => {
    const state = get()
    const team = state.teams.find(t => t.id === clubId)
    const tier = team ? tierOf(team) : (tierOfPlayerClub(clubId, allTieredClubs(state.teams, state.foreignLeagues)) ?? tierOfClubId(clubId))
    const inEcl = (state.currentSeason.eclSeries?.participants ?? []).some(pt => pt.id === clubId)
    // 国内は順位表、海外はそのリーグの順位表から順位を引く
    let leagueRank: number | undefined
    let leagueSize: number | undefined
    if (team) {
      const rows = divisionStandings(state.currentSeason, divisionOf(team))
      const i = rows.findIndex(r => r.teamId === clubId)
      if (i >= 0) { leagueRank = i + 1; leagueSize = rows.length }
    }
    // 海外クラブは所属リーグから順位と地域を引く（地域は「憧れの地域」の突き合わせに使う）
    let region: import('../../types').OverseasRegion | undefined
    if (!team) {
      const lg = leagueOfClub(state.foreignLeagues, clubId)
      region = regionOfLeague(lg?.id)
      const rows = rankedStandings((state.currentSeason.foreignStandings ?? {})[lg?.id ?? ''] ?? [])
      const i = rows.findIndex(r => r.teamId === clubId)
      if (i >= 0) { leagueRank = i + 1; leagueSize = rows.length }
    }
    return buildDestination(clubId, tier, state.players, { inEcl, leagueRank, leagueSize, isForeign: !team, region, player })
  },


  // 売る側の本人同意。買う側（submitTransferBid → finalizeTransfer）が通しているのと
  // 同じ判断（utils/transferDecision.ts）を、売る側にも通す。ここだけ判定が無く、
  // GMが承諾した瞬間に選手が動いていた（本人の意思が入るのは買うときだけ、という非対称）。
  // 行き先が決まらなかった退団予定の選手の去就。GMがチャットで選ぶ。
  // 残留を選んでもモラルは下げない（クラブが追い出さなかっただけで、本人の希望は続く）
  resolveStayOrLeave: (playerId, choice) => set(state => {
    const rest = (state.currentSeason.stayOrLeave ?? []).filter(x => x.playerId !== playerId)
    if (choice === 'stay') {
      // 残留。移籍希望（transferListed）はそのまま＝来季も出たがっている
      return { currentSeason: { ...state.currentSeason, stayOrLeave: rest } }
    }
    // FAで放出。出て行った選手なので1年間は交渉できない（契約満了FAと同じ扱い）
    const m = movePlayer({ players: state.players, teams: state.teams }, playerId, '', {
      year: state.currentSeason.year,
      lockUntilYear: state.currentSeason.year + 1 })
    return {
      players: m.ok ? m.players : state.players,
      teams: m.ok ? m.teams : state.teams,
      currentSeason: { ...state.currentSeason, stayOrLeave: rest } }
  }),


  // 同時に来ている打診を、本人の希望順に並べる（会話で「君の希望は？」を出すため）
  rankIncomingOffers: (playerId) => {
    const state = get()
    const player = state.players.find(p => p.id === playerId)
    if (!player) return []
    const offers = (state.currentSeason.incomingOffers ?? []).filter(o => o.playerId === playerId && o.offeredPrice > 0)
    if (offers.length === 0) return []
    // ★出場率は「そのクラブが走っている日程」で数える（utils/playRate の1本）。
    //   currentSeason.races は自分の部だけなので、1部・2部の選手は必ず0になり、
    //   appraiseMove の「干されている」(+0.2)が全員に付いていた
    const { fraction: frac, teamRaces: races } = playRateOf(
      playerId, player.teamId, state.currentSeason, state.teams, state.foreignLeagues)
    const ctx = {
      srcTier: tierOfPlayerClub(player.teamId, allTieredClubs(state.teams, state.foreignLeagues)),
      playFraction: frac, teamRaces: races, clubBlessed: true }
    const ranked = rankOffers(player, offers.map(o => get().destinationOf(o.fromTeamId, player)), ctx)
    // 並べ替えたあとに、どのオファーの話かを取り戻す
    return ranked
      .map(r => ({ offer: offers.find(o => o.fromTeamId === r.dest.clubId), dest: r.dest, appraisal: r.appraisal }))
      .filter((x): x is { offer: IncomingOffer; dest: Destination; appraisal: Appraisal } => !!x.offer)
  },


  consentToLeave: (playerId, toTeamId, fromForeign) => {
    const state = get()
    const player = state.players.find(p => p.id === playerId)
    if (!player) return false
    // 本人が海外挑戦を直訴してGMが認めた選手は、海外クラブ行きに既に同意している。
    // ここで改めて聞くと「行きたい」と言った本人が断る（愛着の強い性格ほど断る）ので聞かない。
    // canGoOverseasDream が「本人とGMが望んだ移籍」として加入1年目すら止めないのと同じ扱い
    if (player.overseasListed && fromForeign) return true
    // ★出場率は「そのクラブが走っている日程」で数える（utils/playRate の1本）
    const { fraction: frac, teamRaces: races } = playRateOf(
      playerId, player.teamId, state.currentSeason, state.teams, state.foreignLeagues)
    // clubBlessed=true：移籍金はクラブ間で合意済み。「主力だから残りたい」の減点は掛けず、
    // 本人は行き先の姿だけで決める（買う側の finalizeTransfer と同じ渡し方）
    return appraiseMove(player, get().destinationOf(toTeamId, player), {
      srcTier: tierOfPlayerClub(player.teamId, allTieredClubs(state.teams, state.foreignLeagues)),
      playFraction: frac, teamRaces: races, clubBlessed: true }).ok
  },


  acceptIncomingOffer: (offerId, now = false) => {
    const state = get()
    const offer = (state.currentSeason.incomingOffers ?? []).find(o => o.id === offerId)
    if (!offer) return 'invalid'
    // もう成立しようが無いオファーの札は取り下げる（逆提示側と同じ扱い）。
    // 以前は承諾だけ札を残していたので、押しても何も起きない札が居座っていた
    const dropOffer = () => set(st => ({ currentSeason: { ...st.currentSeason, incomingOffers: (st.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }))
    // 「この選手に返事をしていいか」の関門は judgeSaleOffer 1本（逆提示側とまったく同じ順・同じ札の扱い）。
    // 以前ここには判定が一つも無く、引退の話が決まっている選手でもそのまま移籍が成立していた
    const gate = judgeSaleOffer(state, offer)
    if (!gate.ok) { if (gate.dropOffer) dropOffer(); return gate.outcome }
    // ★売る側も1レース待つ。買う側の入札（resolveBid）が次のレースで決着するのと揃える。
    //   その1レースのあいだに他クラブが上乗せしてきて、最後は本人が行き先を選ぶ
    //   （決着は runRace の頭で resolvePendingSale が行う）。
    //   now=true はその決着から呼ばれたときで、そのまま成立させる
    if (!now) {
      // 返事は選手ごとに1件（utils/saleAnswer）。同じ選手に出し直したら行き先の選び直し
      set(st => ({ currentSeason: withSaleAnswer(st.currentSeason, {
        offerId, playerId: offer.playerId, atRaceIndex: st.currentSeason.currentRaceIndex ?? 0 }) }))
      return 'pending'
    }
    // クラブが合意しても本人が納得しなければ成立しない（買う側と同じゲート）
    if (!get().consentToLeave(offer.playerId, offer.fromTeamId, offer.fromForeign)) {
      set(st => ({
        players: withSaleRefused(st.players, offer.playerId, offer.fromTeamId, st.currentSeason.year),
        currentSeason: { ...st.currentSeason, incomingOffers: (st.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }))
      return 'refused_by_player'
    }
    // 国内へ売るときだけ相手が teams に居ることを確かめる（海外クラブは teams に居ない）
    if (!offer.fromForeign && !state.teams.some(t => t.id === offer.fromTeamId)) { dropOffer(); return 'invalid' }
    // 成立後の後始末は finalizeSale 1本（国内・海外の違いもこの中）
    set(st => finalizeSale(st, offer, offer.offeredPrice))
    return 'sold'
  },


  declineIncomingOffer: (offerId) => {
    set(state => ({
      currentSeason: {
        ...state.currentSeason,
        incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }))
  },


  acceptIncomingLoanOffer: (offerId) => {
    const offer = (get().currentSeason.incomingLoanOffers ?? []).find(o => o.id === offerId)
    if (!offer) return false
    const ok = offer.direction === 'lend_out'
      ? get().loanOutPlayer(offer.playerId, offer.fromTeamId, offer.years)   // 自チームの若手を貸す
      : get().loanInPlayer(offer.playerId, offer.years, true)                 // 相手の選手を借りる（相手が貸す打診済み＝force）
    if (ok) set(state => ({ currentSeason: { ...state.currentSeason, incomingLoanOffers: (state.currentSeason.incomingLoanOffers ?? []).filter(o => o.id !== offerId) } }))
    return ok
  },


  declineIncomingLoanOffer: (offerId) => {
    set(state => ({ currentSeason: { ...state.currentSeason, incomingLoanOffers: (state.currentSeason.incomingLoanOffers ?? []).filter(o => o.id !== offerId) } }))
  },


  initiateContractRenewal: (playerId) => {
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      // 判定は contractTalk の1本だけ（借り物・引退の話・海外承認・退団予定・更新ロック）。
      // フリー接触中でもGMからの引き留めは通る（ここで止めていたので空振りしていた）
      const icrCtx = contractTalkCtx(state.currentSeason, state.playerTeamId)
      if (!player || !canOfferRenewal(player, icrCtx)) return state
      if (liveContractOf(icrCtx.contractRequests, playerId)) return state
      // 要求額は市場価値×性格で算出（自動昇給は廃止）。市場価値の中に
      // 出場割合・平均区間順位・今季の区間賞・通算実績が畳み込まれている（faMarketSalary）
      const gmRacesPlayed = state.currentSeason.currentRaceIndex ?? 0
      const gmSeasonRaces = state.currentSeason.races ?? []
      const gmPersonality = player.personality ?? 'salary'
      const gmMarket = faMarketSalary(player, seasonPerfProfile(player.id, gmSeasonRaces, gmRacesPlayed))
      const gmPersoFactor = gmPersonality === 'salary' ? 1.05 : gmPersonality === 'winning' ? 1.0 : 0.95
      const gmDemand = Math.max(3_000_000, gmMarket * gmPersoFactor)
      const req: ContractRequest = {
        id: `cr_${Date.now()}_${playerId}`,   // 選手IDを入れないと同じミリ秒に作った札とIDがぶつかる
        playerId,
        initiatedBy: 'gm',
        round: 1,
        status: 'pending_gm',
        expiresAtRace: (state.currentSeason.currentRaceIndex ?? 0) + 6,
        demandSalary: Math.round(gmDemand / 500000) * 500000,
        demandYears: 2,
        offerSalary: Math.round(Math.min(gmDemand, player.contract.annualSalary * 1.05) / 500000) * 500000,
        offerYears: 2 }
      return { currentSeason: { ...state.currentSeason, contractRequests: [...(state.currentSeason.contractRequests ?? []), req] } }
    })
  },


  generateContractRequests: () => {
    set(state => {
      // 要求と引退の直訴づくりは engine/contractRequests 1本
      const built = buildContractRequests({
        players: state.players, currentSeason: state.currentSeason, playerTeamId: state.playerTeamId })
      if (!built) return state
      return {
        currentSeason: {
          ...state.currentSeason,
          contractRequests: [...(state.currentSeason.contractRequests ?? []), ...built.newReqs],
          retirementRequests: [...(state.currentSeason.retirementRequests ?? []), ...built.newRet] }
      }
    })
  },


  submitContractRenewalOffer: (requestId, salary, years, contractType, teamRole) => {
    set(state => {
      const req = (state.currentSeason.contractRequests ?? []).find(r => r.id === requestId)
      if (!req) return state
      if (req.status === 'accepted' || req.status === 'rejected') return state  // 二重実行ガード（契約年数の二重加算防止）
      const player = state.players.find(p => p.id === req.playerId)
      if (!player) return state
      // フリー移籍で他クラブと接触中：本人に移籍の意思がある場合、提示内容に関わらず更新を断る
      // （判定は決断時と同じ freeContactConsent＝出場実績込み）
      const freeContact = (state.currentSeason.incomingOffers ?? []).find(o => o.playerId === player.id && o.offeredPrice === 0)
      if (freeContact) {
        const fc = playRateOf(player.id, player.teamId, state.currentSeason, state.teams, state.foreignLeagues)
        const fcRaces = fc.teamRaces, fcFrac = fc.fraction
        if (freeContactConsent(player, get().destinationOf(freeContact.fromTeamId, player), tierOfPlayerClub(player.teamId, allTieredClubs(state.teams, state.foreignLeagues)), fcFrac, fcRaces)) {
          // 一度断られたらこの接触は「対応済み」：通知・要対応から消し、以後は本人の決断を待つだけ
          return {
            currentSeason: {
              ...state.currentSeason,
              contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? { ...r, status: 'rejected' as const, offerSalary: salary, offerYears: years } : r),
              incomingOffers: (state.currentSeason.incomingOffers ?? []).map(o => o.id === freeContact.id ? { ...o, retentionRefused: true } : o),
              seenFreeContactIds: [...new Set([...(state.currentSeason.seenFreeContactIds ?? []), freeContact.id])] } }
        }
      }
      // 「強豪か」は自分の部の中での順位で見る（順位表は部ごとに分かれている）
      const myRank = rankOfTeam(seasonDivisionStandings(state.currentSeason, state.playerTeamId), state.playerTeamId)
      const isGoodTeam = myRank > 0 && myRank <= 5
      // その提示を受けるか・逆提示するか・断るかは engine/renewalDecision 1本
      const judged = judgeRenewalOffer({ request: req, player, salary, years, isGoodTeam })
      const newStatus = judged.status
      const counterSalary = judged.counterSalary
      const counterYears = judged.counterYears
      const isLastRound = judged.isLastRound
      // roundの加算は reNegotiateContract 側のみ（獲得交渉と同じ規約）。ここでは進めない＝二重加算しない。
      const updatedReq = { ...req, status: newStatus, offerSalary: salary, offerYears: years, counterSalary, counterYears, offerContractType: contractType, offerTeamRole: teamRole }
      let newPlayers = state.players
      const newTeams = state.teams
      if (newStatus === 'accepted') {
        // 契約年数＝現在の残年数＋提示年数（負にはならない）
        const newYears = Math.max(1, player.contract.yearsLeft + years)
        newPlayers = state.players.map(p => p.id === player.id ? {
          ...p,
          teamRole: teamRole ?? p.teamRole,
          // 更新成立でルーキー契約は終了
          contract: { ...p.contract, annualSalary: salary, yearsLeft: newYears, contractType: contractType ?? p.contract.contractType, faEligibleYear: state.currentSeason.year + newYears, rookieDeal: false } } : p)
      } else if (newStatus === 'rejected' && isLastRound) {
        // 最終ラウンドで拒否 → 更新を拒み退団へ（移籍リスト入り＝契約満了でFA、他チームはフリー移籍で獲得可）
        // 来年まで更新オファーもロックする
        newPlayers = state.players.map(p => p.id === player.id ? { ...p, transferListed: true, renewalLockedUntilYear: state.currentSeason.year + 1 } : p)
      }
      // 最終ラウンド決裂で退団予定になった選手は、抱えている直訴（引退したい・移籍したい・
      // 海外に行きたい）の前提が崩れる。ここに片付けが無かったので、**返事のボタンが
      // 一つも出ないメッセージだけがチャットに残り**、次のレース進行で黙って消えていた
      return {
        players: newPlayers,
        teams: newTeams,
        currentSeason: {
          ...state.currentSeason,
          contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? updatedReq : r),
          // 更新成立なら進行中のフリー移籍の接触は打ち切り（残留確定）
          incomingOffers: newStatus === 'accepted'
            ? (state.currentSeason.incomingOffers ?? []).filter(o => !(o.playerId === player.id && o.offeredPrice === 0))
            : state.currentSeason.incomingOffers } }
    })
  },


  acceptContractCounter: (requestId) => {
    set(state => {
      const req = (state.currentSeason.contractRequests ?? []).find(r => r.id === requestId && r.status === 'countered')
      if (!req || !req.counterSalary || !req.counterYears) return state
      const cPlayer = state.players.find(p => p.id === req.playerId)
      if (!cPlayer) return state
      const cNewYears = Math.max(1, cPlayer.contract.yearsLeft + (req.counterYears ?? 1))
      return {
        players: state.players.map(p => p.id === req.playerId ? {
          ...p,
          teamRole: req.offerTeamRole ?? p.teamRole,
          // 更新成立でルーキー契約は終了
          contract: { ...p.contract, annualSalary: req.counterSalary!, yearsLeft: cNewYears, contractType: req.offerContractType ?? p.contract.contractType, faEligibleYear: state.currentSeason.year + cNewYears, rookieDeal: false } } : p),
        currentSeason: {
          ...state.currentSeason,
          contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? { ...r, status: 'accepted' as const } : r),
          // 更新成立なら進行中のフリー移籍の接触は打ち切り（残留確定）
          incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => !(o.playerId === req.playerId && o.offeredPrice === 0)) }
      }
    })
  },


  reNegotiateContract: (requestId) => {
    set(state => {
      const rnCtx = contractTalkCtx(state.currentSeason, state.playerTeamId)
      const rnReq = rnCtx.contractRequests.find(r => r.id === requestId)
      // ラウンド上限と更新ロックの判定は canReNegotiate の1本だけ。
      // ここに上限が無かったせいで round が3を超えて伸び、次に少しでも足りない額を
      // 出した瞬間「最終ラウンドで決裂」扱いになって退団予定にされていた
      if (!rnReq || !canReNegotiate(rnReq, state.players.find(p => p.id === rnReq.playerId), rnCtx)) return state
      return {
        currentSeason: {
          ...state.currentSeason,
          contractRequests: rnCtx.contractRequests.map(r =>
            r.id === requestId
              ? { ...r, round: r.round + 1, status: 'pending_gm' as const, expiresAtRace: (state.currentSeason.currentRaceIndex ?? 0) + 6, offerSalary: r.counterSalary ?? r.offerSalary, offerYears: r.counterYears ?? r.offerYears }
              : r
          )
        }
      }
    })
  },


  abandonContractRenewal: (requestId) => {
    set(state => ({
      currentSeason: {
        ...state.currentSeason,
        contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? { ...r, status: 'rejected' as const } : r)
      }
    }))
  },


  startAcquisitionOffer: (playerId, source) => {
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      if (!player) return state
      if (source === 'fa' && player.teamId !== '') return state
      if (source === 'scout' && (player.teamId === '' || player.teamId === state.playerTeamId)) return state
      // 引き抜きは入札と同じ判定を通す（レンタル中・非売・海外挑戦承認済み・今季加入は対象外）
      if (source === 'scout' && !canBePoached(player, { teamId: player.teamId, currentYear: state.currentSeason.year })) return state
      // 自チームから移籍・FA流出した選手とは1年間交渉不可（移籍金オファーと同じロック）
      if (player.transferLockedUntilYear != null && state.currentSeason.year < player.transferLockedUntilYear) return state
      // 赤字ペナルティ中は新規補強(FA/引き抜き)不可（ドラフト・契約更新は可）。
      // ただしロスター15人以下のときはFAだけ通す（開幕できず詰むのを防ぐ／引き抜きは禁止のまま）
      const myTeam0 = state.teams.find(t => t.id === state.playerTeamId)
      if (reinforcementBanned(myTeam0) && !(source === 'fa' && faAllowedDespiteBan(state.players, state.playerTeamId))) return state
      const offers = state.currentSeason.acquisitionOffers ?? []
      const active = offers.find(o => o.playerId === playerId && (o.status === 'pending' || o.status === 'countered'))
      if (active) return state
      // 獲得失敗（相手/選手に拒否された）選手は同一シーズン中は再オファー不可（約1年ブロック）。
      // 自主的な取り下げ(abandon)は rejectReason が無いので対象外。offers はシーズン開始で[]にリセットされる。
      const failed = offers.find(o => o.playerId === playerId && o.status === 'rejected' && !!o.rejectReason)
      if (failed) return state
      // ★取り合いの数は持たない。獲得オファーは submitAcquisitionOffer が**その場で**
      //   合否を出す（相手クラブが割り込む仕組みも、待つレースも無い）。
      //   数だけ焼き込んで会話に出していたので「17クラブから話が来ています。
      //   決着まで3レースお待ちください」の次の行でその場で加入が決まっていた
      const newOffer: AcquisitionOffer = {
        id: `ao_${Date.now()}_${playerId}`,
        playerId, source, round: 1, status: 'pending',
        offerSalary: 0, offerYears: 2,
        offerContractType: 'standard' }
      // 同一選手の過去オファー(rejected/accepted)は置換
      const filtered = offers.filter(o => o.playerId !== playerId)
      return { currentSeason: { ...state.currentSeason, acquisitionOffers: [...filtered, newOffer] } }
    })
  },


  submitAcquisitionOffer: (offerId, salary, years, contractType, teamRole) => {
    set(state => {
      const offer = (state.currentSeason.acquisitionOffers ?? []).find(o => o.id === offerId)
      if (!offer) return state
      const player = state.players.find(p => p.id === offer.playerId)
      if (!player) return state
      // 出場データ（年俸ではなくデータで主力度を判定）
      const pr = playRateOf(player.id, player.teamId, state.currentSeason, state.teams, state.foreignLeagues)
      const teamRaces = pr.teamRaces, playFraction = pr.fraction
      const rejectWith = (reason: AcquisitionOffer['rejectReason']) => ({
        currentSeason: {
          ...state.currentSeason,
          acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId
            ? { ...o, status: 'rejected' as const, offerSalary: salary, offerYears: years, offerContractType: contractType, offerTeamRole: teamRole, rejectReason: reason }
            : o) } })
      // 相手チームがデータ上の主力（複数年の出場＋ECL経験で判定）を手放さない（引き抜き）
      if (offer.source === 'scout' && keyPlayerStatus(player, state.currentSeason, state.pastSeasons) !== 'open') return rejectWith('team_refused')
      // 契約形態：良い選手は2軍(2way/育成)契約では納得しない
      const isQuality = ovr(player) >= 68 || (teamRaces >= 3 && playFraction >= 0.5)
      if (contractType !== 'standard' && isQuality) return rejectWith('demotion')

      const desired = acquisitionDesiredSalary(player, offer.source, playFraction, teamRaces, perfOf(state.currentSeason, player.id, teamRaces))
      const ratio = desired > 0 ? salary / desired : 2
      const personality = player.personality ?? 'salary'
      // スカウト（未視察は慎重）は廃止。全選手が最初から開示されているため常に0
      const infoPenalty = 0
      const rlx = (offer.round - 1) * 0.02
      // 4要素で判断：年俸(ratio)・役割(roleBonus)・契約形態(typeAdjust)・契約年数(yearsBonus)
      const roleBonus = teamRole === 'ace' ? -0.06 : teamRole === 'key_player' ? -0.045 : teamRole === 'sub_ace' ? -0.03 : teamRole === 'rotation' ? -0.015 : 0
      const typeAdjust = contractType === 'standard' ? 0 : contractType === 'dual' ? 0.05 : 0.08
      const yearsBonus = (personality === 'loyalty' && years >= 3) ? -0.03 : 0
      // 性格×行き先：優勝型は「今より強いチーム」なら安くても乗る／弱いチームだと渋る。
      const appealAdj = (() => {
        if (personality !== 'winning') return 0
        // 部をまたいで比べるので、部内順位ではなく国内通し順位（1〜52）で見る
        const myRank = domesticThroughRankOfTeam(state.currentSeason, state.playerTeamId)
        const theirRank = domesticThroughRankOfTeam(state.currentSeason, player.teamId)
        if (myRank <= 0 || theirRank <= 0) return 0
        // 自チームが相手より上位なら閾値↓(乗りやすい)、下位なら↑
        return Math.max(-0.08, Math.min(0.08, (theirRank - myRank) * -0.012))
      })()
      // スカウト拠点: Lv×2%ぶん受諾ラインを緩和（獲得・移籍しやすくなる）
      const scoutLv = state.teams.find(t => t.id === state.playerTeamId)?.facilities?.scoutOffice ?? 0
      const scoutNegoBonus = scoutLv * 0.02
      const acceptThresh = (personality === 'loyalty' ? 0.97 : personality === 'winning' ? 1.0 : 1.02) + infoPenalty - rlx + roleBonus + typeAdjust + yearsBonus + appealAdj - scoutNegoBonus
      const counterThresh = (personality === 'salary' ? 0.90 : 0.85) + infoPenalty - rlx - scoutNegoBonus
      const isLastRound = offer.round >= 3

      if (ratio >= acceptThresh) {
        // ★条件が揃っても、本人がその行き先を選ぶかは別。
        //   **移籍の可否は appraiseMove 1本**（utils/transferDecision）。
        //   ここだけこのゲートが無く、年俸が希望額に届いたかどうかだけで決めていた。
        //   だから格差も出場機会も憧れの地域も一切効かず、17クラブが欲しがるOVR83が
        //   3部のクラブに前年俸のまま加入していた。入札ルート（finalizeTransfer）は
        //   最初から通していたので、FA・引き抜きだけが素通りしていた。
        //
        //   ・無所属（fa）は「今のクラブ」が無いので srcTier は無し＝格差の項もclubBlessedも効かない
        //   ・引き抜き（scout）はクラブの合意が無いので clubBlessed は false
        const srcTierAcq = offer.source === 'scout'
          ? tierOfPlayerClub(player.teamId, allTieredClubs(state.teams, state.foreignLeagues))
          : undefined
        const marketAcq = faMarketSalary(player, perfOf(state.currentSeason, player.id, teamRaces))
        const consentAcq = playerConsentToMove(
          player, get().destinationOf(state.playerTeamId, player), srcTierAcq,
          playFraction, teamRaces,
          scoutNegoBonus + salaryAppealBonus(salary, marketAcq),
          offer.source === 'fa',
        )
        if (!consentAcq.ok) return rejectWith('not_convinced')
        const moved = movePlayer(state, player.id, state.playerTeamId, {
          year: state.currentSeason.year,
          date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date,
          raceIndex: state.currentSeason.currentRaceIndex,
          kind: 'free', years, teamRole, myTeamId: state.playerTeamId, checkCapacity: true,
          contract: { annualSalary: salary, yearsLeft: years, contractType } })
        if (!moved.ok) return state // ロスターが上限：契約できない（画面側で先に警告している）
        return {
          players: moved.players,
          teams: moved.teams,
          transferHistory: [...(state.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
          currentSeason: {
            ...state.currentSeason,
            acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId
              ? { ...o, status: 'accepted' as const, offerSalary: salary, offerYears: years, offerContractType: contractType, offerTeamRole: teamRole }
              : o),
            newsFeed: [{
              date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date ?? `${state.currentSeason.year}-06-01`,
              headline: joinedHeadline({ playerName: player.name, salary, years }),
              category: 'fa' as const,
              relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30) } }
      }

      let status: AcquisitionOffer['status']
      let counterSalary: number | undefined
      let counterYears: number | undefined
      let rejectReason: AcquisitionOffer['rejectReason']
      if (ratio >= counterThresh && !isLastRound) {
        status = 'countered'
        counterSalary = Math.round(desired / 500000) * 500000
        counterYears = Math.max(years, 2)
      } else {
        status = 'rejected'
        rejectReason = 'low_offer'
      }
      return {
        currentSeason: {
          ...state.currentSeason,
          acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId
            ? { ...o, status, offerSalary: salary, offerYears: years, offerContractType: contractType, offerTeamRole: teamRole, counterSalary, counterYears, rejectReason }
            : o) } }
    })
  },


  acceptAcquisitionCounter: (offerId) => {
    set(state => {
      const offer = (state.currentSeason.acquisitionOffers ?? []).find(o => o.id === offerId && o.status === 'countered')
      if (!offer || !offer.counterSalary || !offer.counterYears) return state
      const player = state.players.find(p => p.id === offer.playerId)
      const moved = movePlayer(state, offer.playerId, state.playerTeamId, {
        year: state.currentSeason.year,
        date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date,
        raceIndex: state.currentSeason.currentRaceIndex,
        kind: 'free', years: offer.counterYears, teamRole: offer.offerTeamRole,
        myTeamId: state.playerTeamId, checkCapacity: true,
        contract: { annualSalary: offer.counterSalary, yearsLeft: offer.counterYears, contractType: offer.offerContractType } })
      if (!moved.ok) return state
      return {
        players: moved.players,
        teams: moved.teams,
        transferHistory: [...(state.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
        currentSeason: {
          ...state.currentSeason,
          acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId ? { ...o, status: 'accepted' as const } : o),
          newsFeed: [{
            date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date ?? `${state.currentSeason.year}-06-01`,
            headline: joinedHeadline({ playerName: player?.name ?? '', salary: offer.counterSalary, years: offer.counterYears }),
            category: 'fa' as const,
            relatedIds: [offer.playerId] }, ...state.currentSeason.newsFeed].slice(0, 30) } }
    })
  },


  reNegotiateAcquisition: (offerId) => {
    set(state => ({
      currentSeason: {
        ...state.currentSeason,
        acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o =>
          o.id === offerId && o.status === 'countered'
            ? { ...o, round: o.round + 1, status: 'pending' as const }
            : o) } }))
  },


  abandonAcquisitionOffer: (offerId) => {
    set(state => ({
      currentSeason: {
        ...state.currentSeason,
        acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId ? { ...o, status: 'rejected' as const } : o) } }))
  },


  releasePlayerWithBuyout: (playerId) => {
    let released = false
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      if (!player || player.teamId !== state.playerTeamId) return state
      // 最低ロスター人数を割る解雇は不可
      if (!canReleaseFromRoster(state.players, state.playerTeamId)) return state
      const buyoutCost = player.contract.annualSalary * Math.max(0, player.contract.yearsLeft - 1)
      const moved = movePlayer(state, playerId, '', { year: state.currentSeason.year })
      if (!moved.ok) return state
      released = true
      return {
        players: moved.players,
        teams: moved.teams.map(t => t.id === state.playerTeamId
          ? { ...t, finance: { ...t.finance, budget: t.finance.budget - buyoutCost } }
          : t) }
    })
    return released
  },


  // 打診してきた全クラブに、同じ移籍金を一斉に提示する。
  // 払えるクラブだけがその額で残り、払えないクラブは辞退して消える。
  // ★ここでは成立させない。最後に「どこへ行くか」を決めるのは本人の希望（rankIncomingOffers）
  counterAllIncomingOffers: (playerId, price) => {
    const res: { accepted: string[]; declined: string[]; blocked?: 'roster_min' | 'invalid' } =
      { accepted: [], declined: [] }
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      const mine = (state.currentSeason.incomingOffers ?? []).filter(o => o.playerId === playerId && o.offeredPrice > 0)
      if (!player || mine.length === 0) { res.blocked = 'invalid'; return state }
      // 出していい選手かの判定は承諾と同じ canAcceptOfferFor 1本
      if (!canAcceptOfferFor(player, eligibilityCtx(state.currentSeason, state.playerTeamId))) {
        res.blocked = 'invalid'
        return { currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.playerId !== playerId) } }
      }
      // ロスター下限を割る売却はそもそもできない。札は全部残す
      if (!canReleaseFromRoster(state.players, state.playerTeamId)) { res.blocked = 'roster_min'; return state }
      const kept: IncomingOffer[] = []
      for (const o of mine) {
        if (price <= willingFeeFor(state, o, player)) {
          kept.push({ ...o, offeredPrice: price, round: o.round + 1 })
          res.accepted.push(o.fromTeamId)
        } else {
          res.declined.push(o.fromTeamId)
        }
      }
      const others = (state.currentSeason.incomingOffers ?? []).filter(o => !(o.playerId === playerId && o.offeredPrice > 0))
      return { currentSeason: { ...state.currentSeason, incomingOffers: [...others, ...kept] } }
    })
    return res
  },


  counterIncomingOffer: (offerId, counterPrice) => {
    // 結果は utils/offerResult の OfferOutcome 1本。承諾(acceptIncomingOffer)と同じ言葉で返す
    let outcome: OfferOutcome = 'invalid'
    set(state => {
      const offer = (state.currentSeason.incomingOffers ?? []).find(o => o.id === offerId)
      if (!offer) return state
      // 関門は acceptIncomingOffer と同じ judgeSaleOffer 1本（順番も、落ちたときに札を
      // 落とすかどうかも向こうと揃う）。
      // オファーを出したあとに選手がチームを離れた／引退や海外挑戦の話が決まった、はここで弾く。
      // ロスター下限は相手が金を出せなかった('refused')わけではないので理由を分けて返す。
      // 以前はここで 'refused' を返して札まで消していたため、画面に「相手が支払えず決裂」と
      // 嘘の理由が出た上に、補強しても再交渉できなくなっていた
      const gate = judgeSaleOffer(state, offer)
      if (!gate.ok) {
        outcome = gate.outcome
        if (!gate.dropOffer) return state
        return { currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }
      }
      const player = gate.player
      // クラブが合意しても本人が納得しなければ成立しない（承諾側・買う側と同じゲート）
      if (!get().consentToLeave(offer.playerId, offer.fromTeamId, offer.fromForeign)) {
        outcome = 'refused_by_player'
        return {
          players: withSaleRefused(state.players, offer.playerId, offer.fromTeamId, state.currentSeason.year),
          currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }
      }
      // 応じるラインは willingFeeFor 1本（国内も海外も、全クラブ一斉の逆提示と同じ判定）。
      // 以前は海外だけ別の枝で同じ判定と同じ後始末を書いていた
      if (counterPrice > willingFeeFor(state, offer, player)) {
        outcome = 'refused'
        return { currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }
      }
      // 逆提示で成立したときも、承諾したときとまったく同じ後始末を通す（finalizeSale 1本）
      outcome = 'sold'
      return finalizeSale(state, offer, counterPrice)
    })
    return outcome
  },


  dismissRetirementRequest: (playerId) => set(state => ({
    // 引き留めた年は再抽選しない（開き直すたびに引退希望が再発するのを防ぐ）
    players: state.players.map(p => p.id === playerId ? { ...p, retirementDeclinedYear: state.currentSeason.year } : p),
    currentSeason: { ...state.currentSeason, retirementRequests: (state.currentSeason.retirementRequests ?? []).filter(r => r.playerId !== playerId) }
  })),


  acceptRetirement: (playerId) => {
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      if (!player || player.status === 'retired') return state
      // 承認しても即引退はしない。「今季限りで引退」の予約フラグだけ立てて、
      // 実際の引退（ロスター除外・レジェンド登録）は endSeason で行う。
      // シーズン途中で選手が消える味気なさ＆戦力急落を防ぐ
      // 進路が決まったので、この選手についての札は set の1枚（store 冒頭）が全部たたむ。
      // ここで引退希望だけ手で消していたせいで、買い取りオファー・売出・レンタル打診・
      // トレード・移籍希望が残ったままになり、承認した直後にそのまま移籍が成立していた
      const players = state.players.map(p => p.id === playerId ? { ...p, pendingRetirementYear: state.currentSeason.year } : p)
      return { players }
    })
  },


  // 海外挑戦を認める：希望地域の1部リーグから優先オファーが来るようになる。夢を認められて士気UP
  approveOverseasChallenge: (playerId) => set(state => {
    const req = (state.currentSeason.overseasRequests ?? []).find(r => r.playerId === playerId)
    if (!req) return state
    // 引退の承認と同じで、進路が決まった選手の札は set の1枚（store 冒頭）が全部たたむ。
    // ここでは海外挑戦の直訴と契約更新の2つしか消しておらず、国内の買い取りオファーや
    // 売出は残ったままだった（「海外行っていいよ」の直後に国内へ売られる）
    // 移籍方針の「非売」「貸出歓迎」も外す。
    // 非売のままだと canGoOverseasDream / canBePoached が !p.noSale を要求するので、
    // 海外挑戦を認めたのに**どのクラブからもオファーが来ない詰み**になっていた。
    // 移籍容認(allowPlayerTransfer)は既に同じ後始末をしている。承認は「出していい」という
    // 監督の判断なので、前に付けた非売の指示はそこで上書きされる
    const players = state.players.map(p => p.id === playerId
      ? { ...withMorale(p, 8), overseasListed: req.region, noSale: false, loanListed: false }
      : p)
    return { players }
  }),


  // 海外挑戦を引き留める：モラール低下（2回目以降は大）。その年は再直訴しない
  denyOverseasChallenge: (playerId) => set(state => {
    const cnt = ((state.players.find(p => p.id === playerId)?.overseasDeniedCount) ?? 0) + 1
    const drop = cnt >= 2 ? 20 : 12
    return {
      players: state.players.map(p => p.id === playerId ? { ...withMorale(p, -drop), overseasDeniedYear: state.currentSeason.year, overseasDeniedCount: cnt } : p),
      currentSeason: { ...state.currentSeason, overseasRequests: (state.currentSeason.overseasRequests ?? []).filter(r => r.playerId !== playerId) } }
  }),


  dismissTransferRequest: (playerId) => set(state => ({
    // 対応済みの年を記録し、同じシーズン中に移籍希望を再抽選しない
    players: state.players.map(p => p.id === playerId ? { ...p, transferRequestDismissedYear: state.currentSeason.year } : p),
    currentSeason: { ...state.currentSeason, transferRequests: (state.currentSeason.transferRequests ?? []).filter(r => r.playerId !== playerId) }
  })),


  allowPlayerTransfer: (playerId) => set(state => {
    const player = state.players.find(p => p.id === playerId)
    // レンタルで借りている選手（保有権が無い）と、海外挑戦を承認済みの選手は出せない。
    // 判定に渡す材料は他の呼び出しと同じものを揃える。ここだけ retiringIds を渡していなくて、
    // 「引退したい」と言ったまま返事をしていない選手を移籍容認できてしまっていた
    if (!player || !canListForSale(player, eligibilityCtx(state.currentSeason, state.playerTeamId))) return state
    // 移籍を認めた選手は市場に出品され、シーズン中にCPUが市場価値で買い取れる（成立した瞬間に移籍金＋退団通知）。
    // シーズン内に買い手が付かなければ従来どおり年度末にFA
    const raceIdx = state.currentSeason.currentRaceIndex ?? 0
    const aiTeams = state.teams.filter(t => t.id !== state.playerTeamId)
    const interested = aiTeams.filter(() => Math.random() < 0.5).slice(0, 3).map(t => t.id)
    if (interested.length === 0 && aiTeams.length > 0) interested.push(aiTeams[Math.floor(Math.random() * aiTeams.length)].id)
    const allowListing: TransferListing = {
      id: `lst-allow-${raceIdx}-${playerId}`,
      playerId,
      fromTeamId: state.playerTeamId,
      askingPrice: roundFee(calcTransferValue(player)),
      listedAtRace: raceIdx,
      // 選手本人の移籍希望を認めた売出は今季いっぱい有効
      expiresAtRace: Math.max(raceIdx + 1, state.currentSeason.races.length),
      competingTeams: interested }
    const alreadyListed = (state.currentSeason.transferListings ?? []).some(l => l.playerId === playerId)
    // 売出は非売・貸出歓迎と排他（自動で解除して切り替える）
    const aptPlayers = state.players.map(p => p.id === playerId ? { ...p, transferListed: true, noSale: false, loanListed: false } : p)
    // 抱えている話（契約更新・移籍希望・レンタル打診など）の片付けは reconcileTalks に任せる。
    // ここで契約の札を「拒否」に書き換えていたのが、容認を取り消しても契約更新の話が
    // 二度と出てこなくなる原因だった。引退・海外承認と同じ道を通す
    return {
      players: aptPlayers,
      currentSeason: {
        ...state.currentSeason,
        transferListings: alreadyListed ? state.currentSeason.transferListings : [...(state.currentSeason.transferListings ?? []), allowListing] } }
  }),


  toggleNoSale: (playerId) => set(state => {
    const player = state.players.find(p => p.id === playerId)
    if (!player || player.teamId !== state.playerTeamId) return state
    // 進路が決まった選手（引退承認・海外挑戦承認・退団予定）には非売を付け直せない。
    // 付けられると canGoOverseasDream / canBePoached が止まり、承認したのにオファーが
    // 一切来ない状態へ戻ってしまう。解除（ON→OFF）は常に通す
    if (!player.noSale && isLeavingClub(player)) return state
    const next = !player.noSale
    // 売出（移籍リスト入り）とは矛盾するので、非売ONで売出は自動解除
    const tnsPlayers = state.players.map(p => p.id === playerId ? { ...p, noSale: next, ...(next ? { transferListed: false } : {}) } : p)
    return {
      players: tnsPlayers,
      currentSeason: next ? {
        ...state.currentSeason,
        // ONにした瞬間、既に届いている買い取りオファー（移籍金付き）も取り下げ、出品も下げる。フリー接触（0円）は本人の話なので残す
        incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => !(o.playerId === playerId && o.offeredPrice > 0)),
        transferListings: (state.currentSeason.transferListings ?? []).filter(l => !(l.playerId === playerId && l.fromTeamId === state.playerTeamId)) } : state.currentSeason }
  }),


  // 移籍方針・貸出歓迎のON/OFF。ONの選手にはレンタル打診（lend_out）が優先的に来る
  toggleLoanListed: (playerId) => set(state => {
    const player = state.players.find(p => p.id === playerId)
    if (!player || player.teamId !== state.playerTeamId) return state
    if (player.loan) return state  // レンタル中（借入・貸出とも）は設定不可
    const next = !player.loanListed
    // 売出とは排他（売る気の選手を貸しには出さない）。貸出ONで売出は自動解除
    const tllPlayers = state.players.map(p => p.id === playerId ? { ...p, loanListed: next, ...(next ? { transferListed: false } : {}) } : p)
    return {
      players: tllPlayers,
      currentSeason: next ? {
        ...state.currentSeason,
        transferListings: (state.currentSeason.transferListings ?? []).filter(l => !(l.playerId === playerId && l.fromTeamId === state.playerTeamId)) } : state.currentSeason }
  }),


  // 移籍方針・売出の解除（出品を取り下げて退団予定フラグも外す）
  cancelSellListing: (playerId) => set(state => {
    const player = state.players.find(p => p.id === playerId)
    if (!player || player.teamId !== state.playerTeamId) return state
    const cslPlayers = state.players.map(p => p.id === playerId ? { ...p, transferListed: false } : p)
    return {
      players: cslPlayers,
      // 退団予定を解除したら、その選手あての古い札も片付ける。
      // 契約更新の札は allowPlayerTransfer 側でもう消えているので、ここで解除すれば
      // 次のレース進行から普通に契約更新の話が出るようになる
      currentSeason: {
        ...state.currentSeason,
        transferListings: (state.currentSeason.transferListings ?? []).filter(l => !(l.playerId === playerId && l.fromTeamId === state.playerTeamId)) } }
  }),


  loanInPlayer: (playerId, years, force = false) => {
    const st = get()
    if (reinforcementBanned(st.teams.find(t => t.id === st.playerTeamId))) return false  // 赤字・残高マイナスは補強不可
    const player = st.players.find(p => p.id === playerId)
    if (!player || player.teamId === '' || player.teamId === st.playerTeamId || player.loan) return false
    // レンタル枠 最大3（借りている選手＝loan.ownerTeamId が自分でない）
    const usedSlots = st.players.filter(p => p.teamId === st.playerTeamId && p.loan && p.loan.ownerTeamId !== st.playerTeamId).length
    if (usedSlots >= 3) return false
    // ロスター上限チェック。借入も1人ぶん枠を食う。以前は判定が無く、上限を超えたうえに
    // レンタル選手は解雇できないため人数を戻せない詰み状態になっていた。
    const myRosterNow = st.players.filter(p => p.teamId === st.playerTeamId && p.status !== 'retired').length
    if (myRosterNow >= ROSTER_MAX) return false
    // 相手チームの主力（複数年の出場＋ECL経験で判定）は貸さない（forceなら相手が貸す打診済みなのでスキップ）
    if (!force && keyPlayerStatus(player, st.currentSeason, st.pastSeasons) !== 'open') return false
    const yrs = Math.max(1, Math.min(2, years))
    set(state => {
      // 移動は movePlayer 一本。until を渡すとレンタル扱いになり、保有元(ownerId)が残り
      // 貸し手の名簿から外れる。借り手の名簿にも載せない（走るのは自チームだが保有権は無い）
      const moved = movePlayer(state, playerId, state.playerTeamId, {
        year: state.currentSeason.year,
        until: state.currentSeason.year + yrs,
        raceIndex: state.currentSeason.currentRaceIndex,
        myTeamId: state.playerTeamId })
      if (!moved.ok) return state
      return {
        players: moved.players,
        teams: moved.teams,
        currentSeason: {
          ...state.currentSeason,
          newsFeed: [{ date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date ?? `${state.currentSeason.year}-06-01`, headline: loanInOutHeadline({ playerName: player.name, years: yrs, dir: 'in' }), category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30) } }
    })
    return true
  },


  loanOutPlayer: (playerId, toTeamId, years) => {
    const st = get()
    const player = st.players.find(p => p.id === playerId)
    // 貸し出していい選手かの判定は他の移籍と同じものを使う（utils/transferEligibility.ts）。
    // ここは自前で「借りている選手か」だけ見ていたので、引退希望を受けた選手や
    // 海外挑戦を承認した選手をレンタルに出せてしまっていた
    if (!player) return false
    if (!canLoanOut(player, eligibilityCtx(st.currentSeason, st.playerTeamId))) return false
    // 借り手の総在籍が上限なら貸せない（上限+1人化の防止）。
    // 人数の上限は rosterRules の ROSTER_MAX 1本。ここだけ 30 が直書きで、
    // 上限を変えたときにここだけ追従しない状態になっていた
    const toSize = st.players.filter(p => p.teamId === toTeamId && p.status === 'active').length
    if (toSize >= ROSTER_MAX) return false
    const yrs = Math.max(1, Math.min(2, years))
    set(state => {
      const moved = movePlayer(state, playerId, toTeamId, {
        year: state.currentSeason.year,
        until: state.currentSeason.year + yrs,
        years: yrs,
        myTeamId: state.playerTeamId,
        toName: state.teams.find(t => t.id === toTeamId)?.shortName ?? '他クラブ' })
      if (!moved.ok) return state
      return {
        players: moved.players,
        teams: moved.teams,
        currentSeason: {
          ...state.currentSeason,
          newsFeed: [{ date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date ?? `${state.currentSeason.year}-06-01`, headline: loanInOutHeadline({ playerName: player.name, years: yrs, dir: 'out' }), category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30),
          departureNotices: [...(state.currentSeason.departureNotices ?? []), ...(moved.notice ? [moved.notice] : [])] } }
    })
    return true
  },


  submitLoanRequest: (playerId, years) => {
    const st = get()
    if (reinforcementBanned(st.teams.find(t => t.id === st.playerTeamId))) return false  // 赤字・残高マイナスは補強不可
    const player = st.players.find(p => p.id === playerId)
    if (!player || player.teamId === st.playerTeamId || player.teamId === '' || player.loan) return false
    const usedSlots = st.players.filter(p => p.teamId === st.playerTeamId && p.loan && p.loan.ownerTeamId !== st.playerTeamId).length
    if (usedSlots >= 3) return false
    if ((st.currentSeason.loanRequests ?? []).some(r => r.playerId === playerId)) return false
    const yrs = Math.max(1, Math.min(2, years))
    set(state => ({
      currentSeason: {
        ...state.currentSeason,
        loanRequests: [...(state.currentSeason.loanRequests ?? []), { id: `lr_${Date.now()}`, playerId, targetTeamId: player.teamId, years: yrs, submittedAtRace: state.currentSeason.currentRaceIndex }] } }))
    return true
  },


  cancelLoanRequest: (playerId) => {
    set(state => ({
      currentSeason: {
        ...state.currentSeason,
        loanRequests: (state.currentSeason.loanRequests ?? []).filter(r => r.playerId !== playerId) } }))
  },


  dismissLoanResponse: (id) => {
    set(state => ({
      currentSeason: {
        ...state.currentSeason,
        loanResponses: (state.currentSeason.loanResponses ?? []).filter(r => r.id !== id) } }))
  },


  submitTransferBid: (playerId, fee) => {
    const state = get()
    const player = state.players.find(p => p.id === playerId)
    if (!player || player.teamId === state.playerTeamId || player.teamId === '') return
    // 引き抜ける選手かどうかは他の移籍と同じ判定（utils/transferEligibility.ts）。
    // ここに判定が無かったので、レンタルで貸している自分の選手や、よそが借りている選手にも
    // 入札できてしまい、保有権の無いクラブへ移籍金を払って奪えていた
    if (!canBePoached(player, { teamId: player.teamId, currentYear: state.currentSeason.year })) return
    // 交渉決裂ペナルティ: 決裂した年の翌年まで移籍金オファー不可
    if (player.transferLockedUntilYear != null && state.currentSeason.year < player.transferLockedUntilYear) return
    // 赤字ペナルティ中は新規補強(入札)不可（ドラフト・契約更新は可）
    const myTeamBid = state.teams.find(t => t.id === state.playerTeamId)
    if (reinforcementBanned(myTeamBid)) return
    const existing = (state.currentSeason.transferBids ?? []).find(b => b.playerId === playerId && (b.status === 'pending' || b.status === 'fee_accepted' || b.status === 'countered' || b.status === 'player_neg'))
    if (existing) return
    // 同一選手への入札は今季3回まで。roundは過去の入札数を引き継ぐ（取り下げ→再入札の無限ループ防止）
    const priorBids = (state.currentSeason.transferBids ?? []).filter(b => b.playerId === playerId).length
    if (priorBids >= 3) return
    const bid = { id: `bid_${Date.now()}`, playerId, targetTeamId: player.teamId, offeredFee: fee, round: priorBids + 1, status: 'pending' as const, submittedAtRace: state.currentSeason.currentRaceIndex }
    set(s => ({ currentSeason: { ...s.currentSeason, transferBids: [...(s.currentSeason.transferBids ?? []), bid] } }))
  },


  acceptFeeCounter: (bidId) => {
    set(s => ({
      currentSeason: {
        ...s.currentSeason,
        transferBids: (s.currentSeason.transferBids ?? []).map(b =>
          b.id === bidId && b.status === 'countered' && b.counterFee != null
            ? { ...b, offeredFee: b.counterFee, status: 'fee_accepted' as const }
            : b
        ) } }))
  },


  rejectTransferBid: (bidId) => {
    set(s => ({
      currentSeason: {
        ...s.currentSeason,
        transferBids: (s.currentSeason.transferBids ?? []).filter(b => b.id !== bidId) } }))
  },


  // 移籍金でチームが合意しても、選手本人が納得しなければ成立しない。
  finalizeTransfer: (bidId, salary, years) => {
    const state = get()
    const bid = (state.currentSeason.transferBids ?? []).find(b => b.id === bidId)
    if (!bid || bid.status !== 'fee_accepted') return { ok: false, reason: '交渉の状態が変わったため、手続きを進められませんでした。' }
    const player = state.players.find(p => p.id === bid.playerId)
    if (!player || player.teamId !== bid.targetTeamId) return { ok: false, reason: '彼は既に別のクラブへ移籍しています。' }
    // 入札してから成立までの間に状況が変わっていないか、入口と同じ判定で見直す
    if (!canBePoached(player, { teamId: bid.targetTeamId, currentYear: state.currentSeason.year })) {
      return { ok: false, reason: '彼の状況が変わったため、この移籍は成立しませんでした。' }
    }
    const myTeam = state.teams.find(t => t.id === state.playerTeamId)
    if (!myTeam || myTeam.finance.budget < bid.offeredFee) return { ok: false, reason: `貴クラブの予算では移籍金${fmtYen(bid.offeredFee)}を支払えないようです。資金を確保してから改めてお願いします。` }
    // ロスター枠チェック（移籍金ルートは本契約として加入する）。枠不足は決裂扱いにしない
    if (!canSignContract(state.players, state.playerTeamId)) {
      return { ok: false, reason: `貴クラブのロスターが上限（${ROSTER_MAX}人）のようです。整理してから改めてお願いします。` }
    }
    // 選手本人の同意ゲート
    const scoutLvT = myTeam.facilities?.scoutOffice ?? 0
    // 相場を大きく上回る年俸は本人の説得材料になる。式は playerUtils の salaryAppealBonus 1本
    // （獲得オファー側にも同じ説得材料が要るので、手書きを2つに増やさない）
    const marketSalary = faMarketSalary(player, perfOf(state.currentSeason, player.id))
    const salaryBonus = salaryAppealBonus(salary, marketSalary)
    // クラブ間で移籍金が合意済み＝クラブ公認の移籍。「主力だから残りたい」の減点は完全になし
    // （断られるのは愛着の強い選手・順位の低いチームへの誘いくらい）
    const consent = playerConsentToMove(player, get().destinationOf(myTeam.id, player), tierOfPlayerClub(player.teamId, allTieredClubs(state.teams, state.foreignLeagues)), 0.5, 0, scoutLvT * 0.02 + salaryBonus, true)
    if (!consent.ok) {
      // 交渉決裂: 入札を破談にし、来季までこの選手への移籍金オファーを不可にする
      set(s => ({
        players: s.players.map(p => p.id === bid.playerId ? { ...p, transferLockedUntilYear: s.currentSeason.year + 1 } : p),
        currentSeason: {
          ...s.currentSeason,
          transferBids: (s.currentSeason.transferBids ?? []).map(b => b.id === bidId ? { ...b, status: 'failed' as const } : b) } }))
      return { ok: false, reason: `${consent.reason}ようです。交渉は決裂となりました。来季まで再交渉はできません。` }
    }
    // 移動は movePlayer 一本（枠チェック・旧クラブの名簿整理・移籍金の受け渡し・履歴まで込み）
    const moved = movePlayer(state, bid.playerId, state.playerTeamId, {
      year: state.currentSeason.year,
      date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date,
      raceIndex: state.currentSeason.currentRaceIndex,
      fee: bid.offeredFee, years, myTeamId: state.playerTeamId, checkCapacity: true,
      contract: { annualSalary: salary, yearsLeft: years, contractType: 'standard' } })
    if (!moved.ok) return { ok: false, reason: '貴クラブの契約枠が上限のようです。ロスターを整理してから改めてお願いします。' }
    set(s => ({
      players: moved.players.map(p => p.id === bid.playerId
        ? { ...p, contract: { ...p.contract, faEligibleYear: s.currentSeason.year + years } }
        : p
      ),
      teams: moved.teams,
      transferHistory: [...(s.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
      currentSeason: {
        ...s.currentSeason,
        transferSpend: (s.currentSeason.transferSpend ?? 0) + moved.spend,
        transferBids: (s.currentSeason.transferBids ?? []).map(b => b.id === bidId ? { ...b, status: 'complete' as const } : b),
        transferListings: (s.currentSeason.transferListings ?? []).filter(l => l.playerId !== bid.playerId),
        newsFeed: [{ date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date ?? `${s.currentSeason.year}-06-01`, headline: signedWithFeeHeadline({ playerName: player.name, fee: bid.offeredFee, salary }), category: 'trade' as const, relatedIds: [player.id], major: ovr(player) >= MAJOR_NEWS_OVR || bigClub(s, bid.targetTeamId), fromTeamId: bid.targetTeamId, toTeamId: s.playerTeamId }, ...s.currentSeason.newsFeed].slice(0, 30) } }))
    return { ok: true }
  },


  listMyPlayerForSale: (playerId, askingPrice) => {
    const state = get()
    const player = state.players.find(p => p.id === playerId)
    // レンタルで借りている選手（保有権が無い）と、海外挑戦を承認済みの選手は売り出せない。
    // 材料は allowPlayerTransfer と同じものを渡す（引退希望を出したままの選手を売りに出せていた）
    if (!player || !canListForSale(player, eligibilityCtx(state.currentSeason, state.playerTeamId))) return
    const already = (state.currentSeason.transferListings ?? []).some(l => l.playerId === playerId)
    if (already) return
    const raceIndex = state.currentSeason.currentRaceIndex
    const listing: TransferListing = {
      id: `lst-my-${Date.now()}-${playerId}`,
      playerId,
      fromTeamId: state.playerTeamId,
      askingPrice,
      listedAtRace: raceIndex,
      expiresAtRace: raceIndex + 8,
      competingTeams: [] }
    set(s => ({ currentSeason: { ...s.currentSeason, transferListings: [...(s.currentSeason.transferListings ?? []), listing] } }))
  },


  delistMyPlayer: (playerId) => {
    set(s => ({
      currentSeason: {
        ...s.currentSeason,
        transferListings: (s.currentSeason.transferListings ?? []).filter(l => !(l.playerId === playerId && l.fromTeamId === s.playerTeamId)) } }))
  },


  scoutOpponentPlayer: (playerId) => {
    set(state => {
      // 視察はポイント不要・人数無制限。既に依頼済みなら何もしない。
      // 依頼時の消化レース数(reqAt)を記録し、次の1レース消化で開示される。
      const existing = (state.currentSeason.scoutedOpponents ?? []).find(s => s.playerId === playerId)
      if (existing) return state
      // 視察したら自動でウォッチリスト（スター）登録する
      const starred = state.starredOpponents ?? []
      return {
        starredOpponents: starred.includes(playerId) ? starred : [...starred, playerId],
        currentSeason: {
          ...state.currentSeason,
          scoutedOpponents: [
            ...(state.currentSeason.scoutedOpponents ?? []),
            { playerId, reqAt: racesConsumed(state.currentSeason), year: state.currentSeason.year },
          ] } }
    })
  },


  toggleStarOpponent: (playerId) => {
    set(state => {
      const current = state.starredOpponents ?? []
      const next = current.includes(playerId)
        ? current.filter(id => id !== playerId)
        : [...current, playerId]
      return { starredOpponents: next }
    })
  },


  toggleStarProspect: (prospectId) => {
    set(state => {
      const current = state.starredProspects ?? []
      const next = current.includes(prospectId)
        ? current.filter(id => id !== prospectId)
        : [...current, prospectId]
      return { starredProspects: next }
    })
  },


  // 移籍ウィンドウは撤廃。いつでも移籍・オファー可能。
  getTransferWindow: () => ({ open: true, label: '移籍受付中', racesUntil: null }),


  getRosterWindow: () => {
    const { currentSeason } = get()
    if (currentSeason.phase === 'preseason') return { open: true, label: '開幕前ウィンドウ' }
    if (currentSeason.phase === 'regular' && currentSeason.currentRaceIndex === 5)
      return { open: true, label: '中間ウィンドウ（第5戦後）' }
    return { open: false, label: 'ウィンドウ閉鎖中' }
  },


  tradePlayer: (offeredIds, requestedIds, targetTeamId, transferFee = 0, offerPickKeys = [], requestPickKeys = []) => {
    const state = get()
    const offered = offeredIds.map(id => state.players.find(p => p.id === id)).filter((p): p is Player => !!p)
    const requested = requestedIds.map(id => state.players.find(p => p.id === id)).filter((p): p is Player => !!p)
    const hasContent = offered.length > 0 || offerPickKeys.length > 0
    const hasRequest = requested.length > 0 || requestPickKeys.length > 0
    if (!hasContent || !hasRequest) return { ok: false, reason: '交換する中身がそろっていない。' }

    // ロスター上限チェック。以前は無かったため、2対1のトレードを重ねると31人・32人…と
    // 上限を超えて増え、解雇下限やレンタル枠と噛み合って詰む状態になっていた。
    const myRosterNow = state.players.filter(p => p.teamId === state.playerTeamId && p.status !== 'retired').length
    if (myRosterNow - offered.length + requested.length > ROSTER_MAX) return { ok: false, reason: `そちらの選手枠が上限（${ROSTER_MAX}人）を超えてしまう。誰かを放出してから来てくれ。` }

    // 移籍金を払う場合は予算チェック（予算が無条件にマイナスへ落ちるのを防ぐ）
    if (transferFee > 0) {
      const myBudget = state.teams.find(t => t.id === state.playerTeamId)?.finance.budget ?? 0
      if (myBudget < transferFee) return { ok: false, reason: 'そちらの予算では移籍金を払えないようだ。' }
    }

    // トレードも他の移籍と同じ判定を通す（utils/transferEligibility.ts）。
    // 以前はレンタル中しか見ておらず、海外挑戦を承認した選手・引退の話をしている選手・
    // 今季加入したばかりの相手選手まで、トレードなら動かせてしまっていた
    const tradeCtx = eligibilityCtx(state.currentSeason, state.playerTeamId)
    const badOut = offered.find(p => !canTradeAway(p, tradeCtx))
    if (badOut) return { ok: false, reason: `${badOut.name}は今トレードに出せる状態ではない。` }
    const badIn = requested.find(p => !canBePoached(p, { teamId: p.teamId, currentYear: state.currentSeason.year }))
    if (badIn) return { ok: false, reason: `${badIn.name}は今こちらが動かせる選手ではない。` }

    // 価値の釣り合い：判断は utils/tradeValue.ts の1箇所（上下どちらにはみ出しても不成立）。
    // 以前はここに下限0.92だけを書いていたので、こちらが一方的に持ち出す取引に歯止めが無かった。
    // 主力の割増も「もらう側」だけに掛かっていて、こちらの主力が額面より安く数えられていた
    const tvCtx = tradeValueCtxOf(state)
    const tradeIn = {
      outPlayers: offered, inPlayers: requested,
      outExtra: pickKeysValue(offerPickKeys) + Math.max(0, transferFee),
      inExtra: pickKeysValue(requestPickKeys) + Math.max(0, -transferFee) }
    const bal = tradeBalance(tradeIn, tvCtx)
    if (!bal.ok) return { ok: false, reason: bal.reason }
    const tradeVals = tradeValues(tradeIn, tvCtx)

    // 選手本人の同意ゲートは engine/tradeConsent 1本（チャットの打診 proposeTrade と同じ）
    const refuser = tradeRefuser(requested, consentCtx(), tradeConsentBonus(tradeVals.ratio))
    if (refuser) return { ok: false, reason: `${refuser.player.name}はこの移籍を望んでいない。` }

    set(state => {
      // 在籍判定は player.teamId 1本（クラブ側の名簿は廃止）。
      // 以前はクラブ側の名簿に古いセーブ由来のゴーストIDが残ることがあり、
      // それを見た選手だけ movePlayer が呼ばれず片落ちトレードになっていた
      const myIdsAfterTrade = squadIdsOf(state.players, state.playerTeamId).filter(id => !offeredIds.includes(id))
      const incomingIds = requestedIds.filter(id => !myIdsAfterTrade.includes(id))
      const tradeDate = state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`

      // 選手の出し入れも指名権の交換も engine/tradeExecution 1本
      // （相手からの打診を飲む acceptTradeOffer とまったく同じ動かし方を通す）
      const moved = runTradeMoves({ players: state.players, teams: state.teams }, [
        ...offeredIds.map(id => ({ playerId: id, toTeamId: targetTeamId })),
        ...incomingIds.map(id => ({ playerId: id, toTeamId: state.playerTeamId })),
      ], { year: state.currentSeason.year, date: tradeDate, raceIndex: state.currentSeason.currentRaceIndex, myTeamId: state.playerTeamId })
      const players = moved.players
      const tradeRecords = moved.records
      const tradeNotices = moved.notices
      const withPicks = swapDraftPicks(moved.teams,
        { teamId: state.playerTeamId, pickKeys: offerPickKeys },
        { teamId: targetTeamId, pickKeys: requestPickKeys })

      // 名簿も指名権も動かし終わったので、ここで動かすのは現金だけ
      // （transferFee はマイナス＝受け取りもあるので movePlayer の移籍金には乗せない）
      const teams = withPicks.map(t => {
        if (t.id === state.playerTeamId) return { ...t, finance: { ...t.finance, budget: (t.finance.budget ?? 0) - transferFee } }
        if (t.id === targetTeamId) return { ...t, finance: { ...t.finance, budget: (t.finance.budget ?? 0) + transferFee } }
        return t
      })
      const parts = [...offered.map(p => p.name), ...offerPickKeys.map(k => k.split('-').slice(0,2).join(' '))]
      const rparts = [...requested.map(p => p.name), ...requestPickKeys.map(k => k.split('-').slice(0,2).join(' '))]
      const tradeNews = {
        date: tradeDate,
        headline: tradeSummaryHeadline({
          gave: parts, got: rparts, fee: transferFee,
          withPicks: offerPickKeys.length + requestPickKeys.length > 0 }),
        category: 'trade' as const, relatedIds: [...offeredIds, ...requestedIds] }

      // トレード成立後、加入選手ごとに契約交渉オファーを生成し、既存の獲得チャットに乗せる。
      // 相手チーム同意はトレードで済んでいるので source は 'fa' 相当で扱う（team_refused は起きない）。
      // 加入選手はまず2軍に入り、チャットで契約体系/役割/年俸を合意して正式に tier 確定
      // （1軍満杯なら1軍契約不可・格上は2way/2軍を拒否＝既存 submitAcquisitionOffer が効く）。
      const incomingOffers: AcquisitionOffer[] = incomingIds.map(id => {
        const ip = state.players.find(p => p.id === id)
        return {
          id: `ao_trade_${state.currentSeason.currentRaceIndex}_${id}`,
          playerId: id,
          source: 'fa' as const,
          round: 1,
          status: 'pending' as const,
          offerSalary: 0,
          offerYears: 2,
          offerContractType: (ip && ovr(ip) >= 68 ? 'standard' : 'development') as 'standard' | 'development' | 'dual' }
      })
      const keptOffers = (state.currentSeason.acquisitionOffers ?? []).filter(o => !incomingIds.includes(o.playerId))

      // 出した選手についての話（購入オファー・契約更新・移籍希望など）は成立と同時に片付ける。
      // レースを跨ぐまで古い札が残っていると、退団した選手のチャットが開けてしまう
      return { players, teams,
        transferHistory: [...(state.transferHistory ?? []), ...tradeRecords].slice(-400),
        currentSeason: {
        ...state.currentSeason,
        acquisitionOffers: [...keptOffers, ...incomingOffers],
        newsFeed: [tradeNews, ...state.currentSeason.newsFeed].slice(0, 30),
        departureNotices: [...(state.currentSeason.departureNotices ?? []), ...tradeNotices] } }
    })
    return { ok: true }
  },


  // トレードのチャット交渉。提案→相手が承諾/カウンター/拒否（最大3回）。
  proposeTrade: (targetTeamId, giveIds, givePickKeys, getIds, getPickKeys) => {
    const state = get()
    // 評価式は utils/tradeValue.ts の1本。主力の割増は出す側・もらう側の両方に同じだけ掛かる
    const tvCtx = tradeValueCtxOf(state)
    const playersOf = (ids: string[]) => ids.map(id => state.players.find(p => p.id === id)).filter((p): p is Player => !!p)
    const theirName = findClub(state.teams, state.foreignLeagues, targetTeamId)?.shortName
      ?? '相手クラブ'
    const givePlayers = playersOf(giveIds)
    const getPlayersT = playersOf(getIds)
    const baseIn = { outPlayers: givePlayers, inPlayers: getPlayersT,
      outExtra: pickKeysValue(givePickKeys), inExtra: pickKeysValue(getPickKeys) }
    // 相手が受け取るぶんは額面、相手が手放すぶんは相手の言い値。物差しは tradeValues が持つ
    const { cpuGain, cpuLoss } = tradeValues(baseIn, tvCtx)

    const existing = (state.currentSeason.tradeNegotiations ?? []).find(n => n.targetTeamId === targetTeamId)
    const round = (existing?.round ?? 0) + 1

    // 獲得選手の同意は engine/tradeConsent 1本（成立させる tradePlayer と同じ）
    const refuser = tradeRefuser(getPlayersT, consentCtx(), cpuLoss > 0 ? tradeConsentBonus(cpuGain / cpuLoss) : 0)
    const hardNo = refuser ? `${refuser.player.name}はこの移籍を望んでいない。` : ''

    let status: TradeNegotiation['status'] = 'countered'
    let message = ''
    let demandAddIds: string[] = []
    const demandAddPickKeys: string[] = []
    const getNames = getIds.map(id => state.players.find(p => p.id === id)?.name).filter(Boolean).join('・') || 'その選手'

    // 釣り合いすぎ・持ち出しすぎの判定は成立側(tradePlayer)と同じ tradeBalance を使う。
    // ここで通しても成立側で弾かれると「飲んだのに無反応」になるため
    const overBal = tradeBalance(baseIn, tvCtx)
    const overOnly = !overBal.ok && cpuGain >= cpuLoss * TRADE_MIN_RATIO

    if (getIds.length === 0 && getPickKeys.length === 0) { status = 'rejected'; message = `（${theirName}）何も要求されていない。` }
    else if (hardNo) { status = 'rejected'; message = `（${theirName}）${hardNo}` }
    else if (overOnly) { status = 'rejected'; message = `（${theirName}）${overBal.reason}` }
    else if (cpuGain >= cpuLoss * TRADE_OK_RATIO) { status = 'accepted'; message = `（${theirName}）いいだろう、その条件で成立だ。` }
    else if (cpuGain < cpuLoss * TRADE_HARD_NO_RATIO || round >= 3) { status = 'rejected'; message = `（${theirName}）話にならない。この条件では無理だ。` }
    else {
      const need = cpuLoss * 0.98 - cpuGain
      // 「これも付けてくれ」と要求される選手も、実際に出せる選手だけにする
      const counterCtx = eligibilityCtx(state.currentSeason, state.playerTeamId)
      const cands = state.players.filter(p => canTradeAway(p, counterCtx) && !giveIds.includes(p.id))
        .sort((a, b) => faceValueOf(a) - faceValueOf(b))
      const fit = cands.find(p => faceValueOf(p) >= need) ?? cands[cands.length - 1]
      // 成立判定(tradeBalance)を通らない条件でカウンターを出すと「飲んだのに無反応」になるため、
      // 足したあとの形をそのまま成立判定に掛けて確かめる
      if (fit && tradeBalance({ ...baseIn, outPlayers: [...givePlayers, fit] }, tvCtx).ok) {
        demandAddIds = [fit.id]
        message = `（${theirName}）${getNames}が欲しいなら、${fit.name}も付けてくれ。それで手を打とう。`
      } else {
        status = 'rejected'; message = `（${theirName}）こちらの${getNames}に見合わない。この条件では無理だ。`
      }
    }

    if (status === 'accepted') {
      // tradePlayer の戻り値を捨てていたため、選手枠の上限や保有権で弾かれても
      // 「いいだろう、その条件で成立だ」と言われて交渉だけ消え、選手は動かなかった
      const res = get().tradePlayer(giveIds, getIds, targetTeamId, 0, givePickKeys, getPickKeys)
      if (res.ok) {
        set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: (s.currentSeason.tradeNegotiations ?? []).filter(n => n.targetTeamId !== targetTeamId) } }))
        return
      }
      status = 'rejected'
      message = `（${theirName}）${res.reason ?? 'この取引は成立させられない。'}`
      demandAddIds = []
    }
    const neg: TradeNegotiation = { id: existing?.id ?? `trn_${Date.now()}`, targetTeamId, giveIds, givePickKeys, getIds, getPickKeys, round, status, message, demandAddIds: demandAddIds.length ? demandAddIds : undefined, demandAddPickKeys: demandAddPickKeys.length ? demandAddPickKeys : undefined }
    set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: [neg, ...(s.currentSeason.tradeNegotiations ?? []).filter(n => n.targetTeamId !== targetTeamId)] } }))
  },


  acceptTradeCounter: (negId) => {
    const st = get()
    const neg = (st.currentSeason.tradeNegotiations ?? []).find(n => n.id === negId)
    if (!neg || neg.status !== 'countered') return false
    // 提案してから押すまでの間に選手が動いていたら成立させない。
    // 見張りが無いと、対象がよそへ移ったあとでも成立してしまい、
    // 「今いるクラブから引き抜いて、こちらの選手は最初の相手へ送る」というありえない移動になる
    // （移籍金オファー側の finalizeTransfer と同じ見張り）
    const giveOk = [...neg.giveIds, ...(neg.demandAddIds ?? [])].every(id =>
      st.players.some(p => p.id === id && belongsToClub(p, st.playerTeamId)))
    const getOk = neg.getIds.every(id =>
      st.players.some(p => p.id === id && belongsToClub(p, neg.targetTeamId)))
    if (!giveOk || !getOk) {
      set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: (s.currentSeason.tradeNegotiations ?? []).map(n =>
        n.id === negId ? { ...n, status: 'rejected' as const, message: STALE_TRADE_MSG } : n) } }))
      return false
    }
    const res = get().tradePlayer([...neg.giveIds, ...(neg.demandAddIds ?? [])], neg.getIds, neg.targetTeamId, 0, [...neg.givePickKeys, ...(neg.demandAddPickKeys ?? [])], neg.getPickKeys)
    if (res.ok) set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: (s.currentSeason.tradeNegotiations ?? []).filter(n => n.id !== negId) } }))
    // 断られたときは黙って消さず、理由を交渉カードに残す
    else set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: (s.currentSeason.tradeNegotiations ?? []).map(n =>
      n.id === negId ? { ...n, status: 'rejected' as const, message: res.reason ?? STALE_TRADE_MSG } : n) } }))
    return res.ok
  },


  dismissTradeNegotiation: (negId) => set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: (s.currentSeason.tradeNegotiations ?? []).filter(n => n.id !== negId) } })),


  // チャット履歴を playerId 単位で保存（currentSeason 内なのでシーズンまたぎで自動リセット）
  // 1人ぶんのログは直近60発言まで。放っておくと会話がセーブの中で伸び続ける
  setChatLog: (playerId, messages) => set(s => ({ currentSeason: { ...s.currentSeason, chatLogs: { ...(s.currentSeason.chatLogs ?? {}), [playerId]: messages.slice(-60) } } })),


  // ── Foreign transfer market ───────────────────────────────────────
  signForeignPlayer: (playerId, salary, years) => {
    const state = get()
    const player = state.players.find(p => p.id === playerId)
    const myTeam = state.teams.find(t => t.id === state.playerTeamId)
    if (!player || !myTeam) return false
    if (reinforcementBanned(myTeam)) return false  // 赤字ペナルティ中・残高マイナスは補強不可

    // 外国人枠（外国人3人・アジア5人）は廃止。人数制限なしで獲得できる。
    // foreignCategory は選手データの表示用に持たせるだけ。
    const foreignCat: ForeignCategory = player.foreignCategory ?? nationalityToForeignCategory(player.nationality)

    // Transfer fee is based on player market value (independent of salary)
    const transferFee = calcTransferValue(player)
    if (myTeam.finance.budget < transferFee) return false

    set(s => {
      // 所属・名簿・移籍金・加入年・移籍履歴は movePlayer にまとめて任せる（国内移籍と同じ後始末）
      const moved = movePlayer(s, playerId, s.playerTeamId, {
        year: s.currentSeason.year,
        date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date,
        raceIndex: s.currentSeason.currentRaceIndex,
        fee: transferFee,
        years,
        myTeamId: s.playerTeamId,
        contract: { annualSalary: salary, yearsLeft: years, contractType: 'standard' } })
      if (!moved.ok) return s
      return {
        // 海外選手だけの持ち物（国籍区分・FA取得年・性格）はここで足す
        players: moved.players.map(p => p.id === playerId
          ? {
              ...p,
              foreignCategory: foreignCat,
              contract: { ...p.contract, faEligibleYear: s.currentSeason.year + years },
              personality: p.personality ?? 'salary' }
          : p
        ),
        teams: moved.teams,
        transferHistory: [...(s.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
        currentSeason: {
          ...s.currentSeason,
          transferSpend: (s.currentSeason.transferSpend ?? 0) + moved.spend,
          newsFeed: [{
            date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date ?? `${s.currentSeason.year}-06-01`,
            headline: foreignSignedHeadline({ playerName: player.name, nationality: player.nationality, fee: transferFee }),
            category: 'fa' as const,
            relatedIds: [playerId] }, ...s.currentSeason.newsFeed].slice(0, 30) } }
    })
    return true
  },

  refuseFreeContactRetention: (playerId) => set(s => {
    const fc = (s.currentSeason.incomingOffers ?? []).find(o => o.playerId === playerId && o.offeredPrice === 0)
    if (!fc) return s
    return {
      currentSeason: {
        ...s.currentSeason,
        incomingOffers: (s.currentSeason.incomingOffers ?? []).map(o => o.id === fc.id ? { ...o, retentionRefused: true } : o),
        seenFreeContactIds: [...new Set([...(s.currentSeason.seenFreeContactIds ?? []), fc.id])] } }
  }),
})
}
