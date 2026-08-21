// race ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
import { playRateOf, prevSeasonOf } from '../../utils/playRate'
import { recoverInjuredPlayers, rollRaceInjuries } from '../../engine/raceInjury'
import { applySegmentPBs } from '../../engine/segmentPB'
import { generateAiTradeOffers } from '../../engine/aiTradeOffer'
import { buildRaceNews } from '../../engine/raceNews'
import { applyRaceFatigue } from '../../engine/raceFatigue'
import { applyRaceProgress } from '../../engine/raceProgress'
import { detectSegmentRecords } from '../../engine/raceRecords'
import { settleCpuTransfers } from '../../engine/cpuTransfers'
import { resolveExpiredOffers } from '../../engine/offerExpiry'
import { resolveTransferBids } from '../../engine/bidResolution'
import { signInSeasonFreeAgents } from '../../engine/inSeasonFa'
import { buildSeasonFinaleNews } from '../../engine/seasonFinaleNews'
import { applySettledTransfers } from '../../engine/applyTransfers'
import { resolveLoanRequests } from '../../engine/loanRequests'
import { generatePlayerWishes } from '../../engine/playerWishes'
import { settleSaleAnswers } from '../marketOps'
import { eventDistKey, updateBestRecord, withEventBest } from '../../engine/timeTrialRecords'
import { TT_REST_RECOVERY, runTimeTrial, timeTrialBoosted, timeTrialFatigueGain, timeTrialRewardCards, timeTrialRunners, updateTeamEventRecords } from '../../engine/timeTrial'
import { myDivSize } from '../../utils/league'
import { generateIndividualEvents } from '../../data/races'
import { ACHIEVEMENT_JEWELS, checkRaceAchievements } from '../../engine/achievements'
import { generateLoanOffers, generateTransferActivity } from '../../engine/cpuMarket'
import { applyAwayDivisionRound, applyRacedToSchedule, simulateAwayDivisions } from '../../engine/domesticLeague'
import { applyRaceBoosts } from '../../engine/raceBoosts'
import { buildCpuLineups, simulateRace } from '../../engine/raceEngine'
import { type ExpiredNegotiation, type GameState, type Player, type Ratings, type TransferRecord } from '../../types'
import { generateDropCards } from '../../utils/cardCombo'
import { allForeignClubs } from '../../utils/clubs'
import { GM_REP_DEFAULT, withFatigue, withMorale } from '../../utils/condition'
import { isLiveContract } from '../../utils/contractTalk'
import { divisionOf, domesticThroughRank, segmentPrizeByTeam } from '../../utils/league'
import { movePlayer } from '../../utils/movePlayer'
import { segmentPrizeHeadline, worldChampFinishHeadline } from '../../utils/newsItems'
import { playerConsentToMove, racesConsumed } from '../../utils/playerUtils'
import { allTieredClubs, tierOfPlayerClub } from '../../utils/clubTier'

type Slice = Pick<GameStore,
  'setRaceLineup' | 'clearRaceLineup' | 'runRace' | 'setRaceStrategy' | 'setActiveRaceSim' | 'setActiveRacePhase' | 'setActiveRaceResults' | 'setActiveRaceLocked' | 'clearActiveRace' | 'simulateIndividualEvent' | 'ensureIndividualEvents'>

export const createRaceSlice = (set: SetGame, get: () => GameStore): Slice => ({

  // Race lineup
  setRaceLineup: (segmentIndex, playerId) => {
    set(state => ({ raceLineup: { ...state.raceLineup, [segmentIndex]: playerId } }))
  },

  clearRaceLineup: () => set({ raceLineup: {} }),


  runRace: (lineup, segmentTactics, preComputedResults) => {
    // 「譲る」と返事をした話の決着は store/marketOps の settleSaleAnswers 1本
    settleSaleAnswers(set, get)

    // 期日を過ぎたECL戦を先に自動消化する。
    // ただし自チームが出場するシリーズは自動消化しない（AI配置で勝手に走らせず、プレイヤーに配置させる）。
    // 観戦（非出場）のシリーズだけAIで裏消化する。
    {
      let guard = 0
      while (guard++ < 6) {
        const cs = get().currentSeason
        const es = cs.eclSeries
        const nextLeague = cs.races[cs.currentRaceIndex]
        if (!es || es.raceIndex >= es.races.length || !nextLeague) break
        if (es.participants?.some(pt => pt.isPlayerTeam)) break   // 自チーム出場シリーズは自動消化しない
        if (es.races[es.raceIndex].date > nextLeague.date) break
        get().advanceEclRace()
      }
    }
    const state = get()
    const { currentSeason, teams, players, playerTeamId } = state
    const raceIndex = currentSeason.currentRaceIndex
    // 日程の位置(raceIndex)と、時間の進み(clock)は別物。
    // 期限・回復は「何本走ったか」で数える。ECLも記録会も1本（utils/playerUtils の racesConsumed）。
    // ここを currentRaceIndex で兼ねていたので、ECLと記録会のあいだは時間が止まっていた
    const clock = racesConsumed(currentSeason)
    const nextClock = clock + 1
    if (raceIndex >= currentSeason.races.length) return null

    const race = currentSeason.races[raceIndex]
    const seasonProgress = raceIndex / currentSeason.races.length

    // 出走するのは自分と同じ部のチームだけ。判定は engine/raceEngine.ts の buildCpuLineups 1本。
    // 以前はここと RacePage（中継つきレース）の2箇所に手書きしていて、RacePage 側だけ
    // 部で絞っていなかった（3部なのに52チームで走って48位になっていた）。
    const myDivision = divisionOf(teams.find(t => t.id === playerTeamId))
    const lineups: Record<string, Record<number, string>> = {
      [playerTeamId]: lineup,
      ...buildCpuLineups(teams, players, race, playerTeamId) }

    const playersForSimFinal = applyRaceBoosts(players, teams, playerTeamId, lineup)

    const results = preComputedResults ?? simulateRace(race, lineups, teams, playersForSimFinal, seasonProgress, playerTeamId, segmentTactics)

    // 自分の部以外も同じ日に裏で走らせる（海外8リーグと同じ扱い）。
    // これが無いと2部3部の順位表が0ptのまま動かず、昇降格も通算成績も決まらない
    const awayRound = simulateAwayDivisions(
      race, teams, players, myDivision, seasonProgress,
      currentSeason.divisionRaces, raceIndex,
    )

    // Persist results into race, update standings, advance index
    set(state => {
      const updatedRaces = state.currentSeason.races.map((r, i) =>
        i === raceIndex ? { ...r, results } : r
      )

      const myDivStandings = (state.currentSeason.standings[myDivision] ?? []).map(s => {
        const tr = results.teamRankings.find(r => r.teamId === s.teamId)
        if (!tr) return s
        const earned = tr.positionPoints + tr.segmentPoints
        return {
          ...s,
          leaguePoints: (s.leaguePoints ?? 0) + tr.positionPoints,
          segmentPoints: (s.segmentPoints ?? 0) + tr.segmentPoints,
          totalPoints: s.totalPoints + earned,
          raceResults: [...s.raceResults, { raceId: race.id, rank: tr.rank, points: earned }] }
      })
      const updatedStandings = applyAwayDivisionRound(
        { ...state.currentSeason.standings, [myDivision]: myDivStandings },
        myDivision, awayRound, race,
      )
      // 裏の部の走行記録を日程へ書き戻す。捨てると区間タイムも順位も戻らない
      const updatedDivisionRaces = applyRacedToSchedule(state.currentSeason.divisionRaces, awayRound.raced)
      // 裏の部の出走記録。通算成績は保存したレース結果から数え直すので、
      // ここに残さないと1部・2部の選手が全員0回出走のままになる（海外の foreignAppearances と同じ役割）
      const awayApps: Record<string, { races: number; wins: number }> = { ...(state.currentSeason.awayAppearances ?? {}) }
      for (const [pid, v] of Object.entries(awayRound.careerAdd)) {
        const cur = awayApps[pid] ?? { races: 0, wins: 0 }
        awayApps[pid] = { races: cur.races + v.races, wins: cur.wins + v.segWins }
      }

      // レース結果のニュースは engine/raceNews 1本（見出しの文面は utils/newsItems）
      const playerResult = results.teamRankings.find(r => r.teamId === playerTeamId)
      const playerRank = playerResult?.rank ?? 0
      const newsItems = buildRaceNews({
        race, results, teams, players, playerTeamId, myDivision,
        currentSeason: state.currentSeason, rivalTeamId: state.rivalTeamId })

      // Fatigue + injury (strategy modifier)
      const racingIds = new Set(
        Object.values(lineups).flatMap(l => Object.values(l)).filter(Boolean) as string[]
      )
      // 疲労の増減は engine/raceFatigue 1本（医療センターはCPUにも効く）
      const updatedPlayers = applyRaceFatigue({
        players: state.players, racingIds, teams: state.teams,
        raceStrategy: state.raceStrategy, segmentCount: race.segments.length })

      // ★順位別のレース賞金と観客収入は廃止した。クラブの収入は「格の年間予算」1本
      //   （data/economy.ts）。順位は翌年の格を通してのみ収入に効く。
      //   ここに残すのは区間賞だけ（走った選手個人の働きに対する賞金）。
      //   数え方は utils/league.ts の segmentPrizeByTeam 1本。自チームもCPUも同額。
      //   以前はここで自チームぶんだけ数えていて、CPUには1円も入っていなかった
      const segPrizeByTeam = segmentPrizeByTeam(results.segmentResults)
      const segPrize = segPrizeByTeam[playerTeamId] ?? 0

      const prizeNewsItem = segPrize > 0 ? {
        date: race.date,
        headline: segmentPrizeHeadline({ raceName: race.name, prize: segPrize, myRank: playerRank }),
        category: 'race' as const,
        relatedIds: [race.id] } : null

      // Check if player beat rival this race
      const rivalBeatThisRace = !!state.rivalTeamId &&
        (results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? 99) <
        (results.teamRankings.find(r => r.teamId === state.rivalTeamId)?.rank ?? 99)

      // Update objectives（noInjury は負傷判定が後段なので後で反映）
      const mySegWinCount = results.segmentResults.filter(sr => sr.runners[0]?.teamId === playerTeamId).length
      const baseObjectives = (state.currentSeason.objectives ?? []).map(obj => {
        if (obj.done) return obj
        if (obj.id === 'segWins') {
          const next = obj.current + mySegWinCount
          return { ...obj, current: next, done: next >= obj.target }
        }
        if (obj.id === 'winRace' && playerRank === 1) {
          const next = obj.current + 1
          return { ...obj, current: next, done: next >= obj.target }
        }
        if (obj.id === 'rivalBeat' && rivalBeatThisRace) {
          const next = obj.current + 1
          return { ...obj, current: next, done: next >= obj.target }
        }
        return obj
      })

      // 選手の変化（調子・通算成績・モラル・成長・練習プラン）は engine/raceProgress 1本。
      // 5つを1周のループで見る順序に意味があるので、分けて何周もしないこと
      const progress = applyRaceProgress({
        players: updatedPlayers, results, racingIds, teams: state.teams,
        foreignLeagues: state.foreignLeagues,
        playerTeamId, currentSeason: state.currentSeason,
        awayCareerAdd: awayRound.careerAdd,
        // ★士気は走ったクラブ全部が動く（engine/raceMorale）。裏の部のぶんもここで渡す
        awayStanding: new Map(Object.entries(awayRound.ranks)
          .map(([id, rank]) => [id, { rank, teamCount: awayRound.entrantCount[id] ?? 0 }])) })
      const finalPlayers = progress.players
      const raceExpGainsMap = progress.raceExpGains

      // 負傷判定は engine/raceInjury 1本（ニュースになるのは自チームだけ）
      const injuries = rollRaceInjuries({
        players: finalPlayers, racingIds, playerTeamId, nextClock, raceDate: race.date })
      const playersWithInjuries = injuries.players
      const injuryNewsItems = injuries.news

      // noInjury 目標：今レースの負傷者数を反映
      const updatedObjectives = baseObjectives.map(obj => {
        if (!obj.done && obj.id === 'noInjury' && injuryNewsItems.length > 0) {
          return { ...obj, current: obj.current + injuryNewsItems.length }
        }
        return obj
      })

      // 自己ベスト（自チームのみ）と、復帰時期が来た負傷者の復帰
      const playersWithPBs = applySegmentPBs(playersWithInjuries, playerTeamId, race, results)
      const recoveredPlayers = recoverInjuredPlayers(playersWithPBs, nextClock)

      // Scout missions countdown
      const updatedMissions = (state.currentSeason.scoutMissions ?? []).map(m => ({ ...m, racesLeft: m.racesLeft - 1 }))
      const completedProspectIds = new Set(updatedMissions.filter(m => m.racesLeft <= 0).map(m => m.prospectId))
      const activeMissions = updatedMissions.filter(m => m.racesLeft > 0)
      const updatedScoutProspects = completedProspectIds.size > 0
        ? (state.currentSeason.scoutProspects ?? []).map(sp => {
            if (!completedProspectIds.has(sp.id)) return sp
            const tr = (sp as Player & { trueRatings?: Ratings }).trueRatings
            return { ...sp, publicRatings: { speed: tr?.speed ?? sp.ratings.speed, stamina: tr?.stamina ?? sp.ratings.stamina, mountainUp: tr?.mountainUp ?? sp.ratings.mountainUp, mountainDown: tr?.mountainDown ?? sp.ratings.mountainDown, pacing: tr?.pacing ?? sp.ratings.pacing } }
          })
        : state.currentSeason.scoutProspects

      // CPUからのトレード打診
      const existingTrades = (state.currentSeason.pendingTradeOffers ?? []).filter(o => o.expiresAtRace > nextClock)

      // CPUからのトレード打診（低頻度・1件まで）。engine/aiTradeOffer 1本
      const newTradeOffers = generateAiTradeOffers({
        players: state.players, teams: state.teams, playerTeamId,
        currentSeason: state.currentSeason, raceIndex,
        hasExistingOffer: existingTrades.length > 0 })

      // 区間賞のぶんだけを翌季の予算に繰り越す（レース賞金・観客収入は廃止）。
      // 自分の部＋裏で走らせた部を合わせて、全クラブぶんを積む
      const raceIncomeAccum = segPrize
      const segPrizeAll: Record<string, number> = { ...segPrizeByTeam }
      for (const [tid, v] of Object.entries(awayRound.segPrize)) segPrizeAll[tid] = (segPrizeAll[tid] ?? 0) + v
      const teamsWithPrize = state.teams

      // Transfer market activity
      const nextRaceIndex = raceIndex + 1
      // 移籍ウィンドウは撤廃済み（getTransferWindow が常に「移籍受付中」を返す）。
      // 以前はここだけシーズンの35〜55%の間しかCPUのオファーを作らず、画面は
      // 「移籍受付中」なのに何も来ない期間ができていたので、常時オープンに揃えた
      // 引退希望を受理済みの選手（移籍の話は持ちかけない）。売出の成立判定でも使う
      const retiringWishIds = new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId))
      // CPU同士の移籍の成立は engine/cpuTransfers 1本
      const cpuSettle = settleCpuTransfers({
        players: finalPlayers, teams: state.teams, foreignLeagues: state.foreignLeagues,
        currentSeason: state.currentSeason, pastSeasons: state.pastSeasons, playerTeamId, raceDate: race.date,
        retiringWishIds, destinationOf: (clubId, p) => get().destinationOf(clubId, p),
        playerTierOf: (p) => get().playerTierOf(p) })
      const cpuTxList = cpuSettle.txList
      const cpuTxListingIds = cpuSettle.settledListingIds
      const cpuTxNewsItems = cpuSettle.news

      const existingListingsFiltered = (state.currentSeason.transferListings ?? []).filter(l => !cpuTxListingIds.has(l.id))

      // 期限が来た話の処理は engine/offerExpiry 1本
      // （有料の打診＝失効通知／フリーの接触＝本人が決断。見る順番に意味がある）
      const expiry = resolveExpiredOffers({
        players: finalPlayers, teams: state.teams, foreignLeagues: state.foreignLeagues,
        currentSeason: state.currentSeason, playerTeamId, nextClock, nextRaceIndex,
        ranRaces: updatedRaces, raceDate: race.date, playerTierOf: (p) => get().playerTierOf(p),
        destinationOf: (clubId, p) => get().destinationOf(clubId, p) })
      const offerExpiredNegs = expiry.expiredNegs
      const offerExpiredPlayerIds = expiry.expiredPlayerIds
      const freeDecisionNotices = expiry.freeDecisionNotices
      const freeMoves = expiry.freeMoves
      const freeMoveNews = expiry.freeMoveNews

      // 買い取りの打診は**国内52＋海外180を1本のループ**で回す（engine/cpuMarket）。
      // クラブはそのまま渡す。**ここで id/name/leagueId/country だけに削っていた**ので、
      // 受け取る側は格も手元資金も見られず、いくらまで出せるかを初期値の格から作り直していた。
      const foreignClubs = allForeignClubs(state.foreignLeagues)
      const transferData = generateTransferActivity(finalPlayers, teamsWithPrize, playerTeamId, nextClock, existingListingsFiltered, state.currentSeason.incomingOffers ?? [], state.currentSeason.transferRequests ?? [], retiringWishIds, state.currentSeason.year, state.currentSeason.races.length, foreignClubs,
        // 出場率は utils/playRate 1本（本人が受けるかの判定がこれを見る）
        (pid) => playRateOf(pid, playerTeamId, state.currentSeason, state.teams, state.foreignLeagues,
          prevSeasonOf(state.pastSeasons, state.currentSeason.year)),
        // 行き先の姿は store の destinationOf 1本（打診の関門が本人の判定をそのまま呼ぶ）
        (clubId, player) => get().destinationOf(clubId, player))

      // 相手からのレンタル打診（チャットで対応）
      const keptLoanOffers = (state.currentSeason.incomingLoanOffers ?? []).filter(o => o.expiresAtRace > nextClock && finalPlayers.some(p => p.id === o.playerId))
      const flOffers = generateLoanOffers({ players: finalPlayers, teams: teamsWithPrize, foreignClubs, playerTeamId, raceIndex: nextClock, existingLoans: keptLoanOffers, races: updatedRaces, season: { ...state.currentSeason, races: updatedRaces }, retiringIds: retiringWishIds, currentYear: state.currentSeason.year })
      const mergedLoanOffers = [...keptLoanOffers, ...flOffers.loanOffers]

      // 入札の応答は engine/bidResolution 1本（判定は utils/transferBid の resolveBid）
      const bidResult = resolveTransferBids({
        bids: state.currentSeason.transferBids ?? [],
        players: finalPlayers, teams: state.teams, foreignLeagues: state.foreignLeagues ?? [],
        listings: transferData.listings, currentSeason: state.currentSeason,
        pastSeasons: state.pastSeasons, races: updatedRaces, raceClock: nextClock, playerTeamId,
        destinationOf: (clubId, p) => get().destinationOf(clubId, p),
        playerTierOf: (p) => get().playerTierOf(p) })
      const processedBids = bidResult.bids
      const bidExpiredNegs = bidResult.expiredNegs
      const bidExpiredPlayerIds = bidResult.expiredPlayerIds
      const outbidMoves = bidResult.outbidMoves

      const finalPlayerRank = results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? myDivSize(state)
      // カードは国内の通し順位で決まる（部内順位だと3部優勝も1部優勝も同じだった）。
      // 部内1位のときだけ1段上げる扱いは utils/cardCombo の中
      const myDivForCards = divisionOf(state.teams.find(t => t.id === playerTeamId))
      const droppedCards = generateDropCards(
        domesticThroughRank(myDivForCards, finalPlayerRank),
        mySegWinCount,
        finalPlayerRank === 1,
      )

      const raceAchievements = checkRaceAchievements({
        playerRank: finalPlayerRank,
        mySegWinCount,
        totalSegments: race.segments.length,
        year: state.currentSeason.year,
        raceName: race.name,
        existing: state.achievements ?? [] })

      // 区間新記録の判定は engine/raceRecords 1本（歴代記録は保存済みの結果から数え直す）
      const segRecords = detectSegmentRecords({
        race, results, players: state.players, teams: state.teams,
        playerTeamId, myDivision, pastSeasons: state.pastSeasons, currentSeason: state.currentSeason })
      const segRecordNewsItems = segRecords.news
      const newSegRecordMarks = segRecords.marks

      const raceJewels =
        (playerRank === 1 ? 20 : playerRank === 2 ? 10 : playerRank === 3 ? 5 : 0)
        + mySegWinCount * 5
        + raceAchievements.reduce((s, a) => s + (ACHIEVEMENT_JEWELS[a.rarity] ?? 0), 0)

      // 決まった移籍の反映は engine/applyTransfers 1本（どちらも movePlayer を通る）
      const applied = applySettledTransfers({
        players: recoveredPlayers, teams: teamsWithPrize, foreignLeagues: state.foreignLeagues,
        origPlayers: state.players, currentSeason: state.currentSeason,
        listings: transferData.listings, txList: cpuTxList, outbidMoves,
        playerTeamId, raceDate: race.date, raceClock: nextClock,
        playerTierOf: (p) => get().playerTierOf(p),
        destinationOf: (clubId, p) => get().destinationOf(clubId, p) })
      const playersWithCpuTx = applied.players
      const teamsWithCpuTx = applied.teams
      const cpuTxRecords = applied.records
      const myCpuSaleNotices = applied.departureNotices
      const myCpuSaleIncome = applied.income
      const outbidNewsItems = applied.outbidNews
      bidExpiredNegs.push(...applied.stayNegs)

      // レンタル要請への返事は engine/loanRequests 1本（成立も movePlayer を通る）
      const loanResult = resolveLoanRequests({
        players: playersWithCpuTx, teams: teamsWithCpuTx, foreignLeagues: state.foreignLeagues,
        currentSeason: state.currentSeason, pastSeasons: state.pastSeasons, races: updatedRaces,
        playerTeamId, raceIndex, raceDate: race.date })
      const playersAfterLoan = loanResult.players
      const teamsAfterLoan = loanResult.teams
      const loanRespNews = loanResult.news
      const newLoanResponses = loanResult.responses

      const prevDoneIds = new Set((state.currentSeason.objectives ?? []).filter(o => o.done).map(o => o.id))
      const midRaceObjJewels = updatedObjectives
        .filter(o => o.done && !prevDoneIds.has(o.id))
        .reduce((s, o) => s + (o.rewardJewels ?? 30), 0)

      // ジュエル獲得の内訳（ホームに戻ったときのポップアップ用）。加算そのものは下の jewels: と midRaceObjJewels が担当し、
      // ここは表示用の明細を組み立てるだけ。合計が一致するよう同じ計算式から作る
      const raceJewelGains: { label: string; amount: number }[] = []
      if (playerRank > 0) {
        const rankJ = playerRank === 1 ? 20 : playerRank === 2 ? 10 : playerRank === 3 ? 5 : 0
        if (rankJ > 0) raceJewelGains.push({ label: `レース${playerRank}位`, amount: rankJ })
        if (mySegWinCount > 0) raceJewelGains.push({ label: `区間賞×${mySegWinCount}`, amount: mySegWinCount * 5 })
        for (const a of raceAchievements) {
          const j = ACHIEVEMENT_JEWELS[a.rarity] ?? 0
          if (j > 0) raceJewelGains.push({ label: `実績「${a.name}」`, amount: j })
        }
      }
      if (midRaceObjJewels > 0) raceJewelGains.push({ label: '目標達成', amount: midRaceObjJewels })

      // 選手からの直訴（移籍したい／海外でやりたい）は engine/playerWishes 1本。
      // 札は1人につき1つだけ（判定は utils/talkSync の openWishIds）
      const wishes = generatePlayerWishes({
        players: playersAfterLoan, currentSeason: state.currentSeason,
        standings: updatedStandings, myDivision, playerTeamId,
        races: updatedRaces, raceIndex, retiringWishIds,
        worldRepresentatives: state.worldRepresentatives })
      const newTransferReqs = wishes.transferRequests
      const newOvReqs = wishes.overseasRequests

      // 契約更新の要求は放置で自動失効する。以前は status:'rejected' にして札を残していたが、
      // 「札がある＝今季もう話しかけた」の判定に引っかかり、**一度も応対していない選手が
      // そのシーズン二度と契約更新に出てこなくなっていた**（契約更新のチャットが出ない主因）。
      // 決着ではないので札ごと消して跡を残さない。代わりに「交渉が流れた」通知だけ出す。
      // countered（こちらの返事待ち）も同じく失効させる。以前は pending_gm しか見ておらず、
      // 返事待ちのまま通知にも出ずに永久に残る札があった
      const expiredContractReqs = (state.currentSeason.contractRequests ?? [])
        .filter(r => isLiveContract(r) && (r.expiresAtRace ?? 0) <= nextClock)
      const expiredContractIds = new Set(expiredContractReqs.map(r => r.id))
      // 契約更新の期限切れ。移籍の話ではないので kind で区別する。
      // （通知の文言が「移籍を拒否しました／来季まで交渉できません」で固定されていて、
      //   更新の期限切れなのに移籍拒否と出る＝嘘になっていた）
      const contractExpiredNegs: ExpiredNegotiation[] = expiredContractReqs.map(r => ({
        id: `cx_${r.id}`,
        playerId: r.playerId,
        playerName: playersAfterLoan.find(p => p.id === r.playerId)?.name ?? '選手',
        kind: 'contract' }))

      // 期限切れ交渉のプレイヤーを1年間ロック（移籍交渉のみ。契約更新はロックしない）
      const allExpiredPlayerIds = [...new Set([...bidExpiredPlayerIds, ...offerExpiredPlayerIds])]
      const allExpiredNegs: ExpiredNegotiation[] = [...bidExpiredNegs, ...offerExpiredNegs, ...contractExpiredNegs]
      // ★シーズン中のFA補強で先を越されたぶんは下（faSnipedNegs）で足す
      const playersWithExpiredLocks = allExpiredPlayerIds.length > 0
        ? playersAfterLoan.map(p => allExpiredPlayerIds.includes(p.id) ? { ...p, transferLockedUntilYear: state.currentSeason.year + 1 } : p)
        : playersAfterLoan

      // フリー移籍の決断で退団する選手を移す（本人が決めたので即時移籍）。
      // 出て行った選手とは1年間交渉不可（すぐ買い戻すのは不自然なので）
      let playersAfterFreeMoves: Player[] = playersWithExpiredLocks
      let teamsAfterFreeMoves = teamsAfterLoan
      const freeMoveRecords: TransferRecord[] = []
      for (const mv of freeMoves) {
        const m = movePlayer({ players: playersAfterFreeMoves, teams: teamsAfterFreeMoves }, mv.playerId, mv.toTeamId, {
          year: state.currentSeason.year,
          date: race.date,
          kind: 'free',
          myTeamId: playerTeamId,
          lockUntilYear: state.currentSeason.year + 1 })
        if (!m.ok) continue
        playersAfterFreeMoves = m.players
        teamsAfterFreeMoves = m.teams
        if (m.record) freeMoveRecords.push(m.record)
      }

      // シーズン中のFA補強は engine/inSeasonFa 1本（オフと同じ pickCpuFreeAgents を通る）
      const faResult = signInSeasonFreeAgents({
        players: playersAfterFreeMoves, teams: teamsAfterFreeMoves,
        foreignClubs, foreignLeagues: state.foreignLeagues,
        currentSeason: state.currentSeason, races: updatedRaces,
        playerTeamId, raceDate: race.date, nextClock,
        // ④本人が行くか（オフの一括処理・現金の移籍・トレードと同じ入口）
        // 出場率は utils/playRate 1本。**無所属なら関数が 0.5 / 0戦 を返す**ので、
        // ここで 0.5 / 0 を手書きしないこと（元クラブが残っている選手も同じ道を通る）
        consents: (fa, clubId) => {
          const { fraction, teamRaces } = playRateOf(fa.id, fa.teamId, state.currentSeason,
            state.teams, state.foreignLeagues, prevSeasonOf(state.pastSeasons, state.currentSeason.year))
          return playerConsentToMove(fa, get().destinationOf(clubId, fa),
            tierOfPlayerClub(fa.teamId, allTieredClubs(state.teams, state.foreignLeagues)),
            fraction, teamRaces, 0, true, get().playerTierOf(fa)).ok
        } })
      playersAfterFreeMoves = faResult.players
      teamsAfterFreeMoves = faResult.teams
      freeMoveRecords.push(...faResult.records)
      const faSignNews = faResult.news
      const faSnipedNegs = faResult.snipedNegs

      // シーズン最終戦なら、表彰と引退表明を先に流す（engine/seasonFinaleNews 1本）。
      // 確定処理は次シーズン開幕のままで、ここは発表だけ
      const isFinalRace = raceIndex + 1 >= state.currentSeason.races.length
      const seasonEndNews = isFinalRace ? buildSeasonFinaleNews({
        players: finalPlayers, teams: state.teams, currentSeason: state.currentSeason,
        races: updatedRaces, playerTeamId, raceDate: race.date }) : []

      return {
        players: playersAfterFreeMoves,
        teams: teamsAfterFreeMoves,
        // ★**海外クラブの資金を書き戻す。** `movePlayer` は `teams`（国内52）しか
        //   知らないので、相手が海外クラブのときは `settleForeignFee` が要る
        //   （`engine/applyTransfers` が呼ぶ）。ここで戻さないと、精算しても捨てられて
        //   **海外クラブは移籍金を払わずに選手を持っていける**。
        foreignLeagues: applied.foreignLeagues,
        // 移籍成立記録（チーム詳細の移籍ページ用）。CPU間売買とフリー移籍の決断をここで記録
        transferHistory: [
          ...(state.transferHistory ?? []),
          ...cpuTxRecords,
          ...freeMoveRecords,
        ].slice(-400),
        jewels: state.jewels + (playerRank > 0 ? raceJewels : 0) + midRaceObjJewels,
        // 直前にECL戦が裏で消化されている場合があるので、既存の未表示ぶんに足す（ホームで見たら空になる）
        jewelGains: [...(state.jewelGains ?? []), ...raceJewelGains].slice(-20),
        raceLineup: {},
        lastRaceLineup: { ...state.raceLineup },
        trainingCards: [...(state.trainingCards ?? []), ...droppedCards],
        raceDroppedCards: droppedCards,
        raceExpGains: raceExpGainsMap,
        raceNewSegmentRecords: newSegRecordMarks,
        achievements: [...(state.achievements ?? []), ...raceAchievements],
        gmRep: state.gmRep ?? 50,   // 評判はシーズン終了時の目標達成率でのみ変動
        // 交渉ごとの札の掃除は set の1枚（store 冒頭）がやる
        currentSeason: {
          ...state.currentSeason,
          currentRaceIndex: raceIndex + 1,
          phase: raceIndex + 1 >= state.currentSeason.races.length ? 'postseason' as const : 'regular' as const,
          races: updatedRaces,
          standings: updatedStandings,
          divisionRaces: updatedDivisionRaces,
          objectives: updatedObjectives,
          scoutMissions: activeMissions,
          scoutProspects: updatedScoutProspects,
          newsFeed: [...seasonEndNews, ...freeMoveNews, ...faSignNews, ...loanRespNews, ...segRecordNewsItems, ...cpuTxNewsItems, ...outbidNewsItems, ...injuryNewsItems, ...(prizeNewsItem ? [prizeNewsItem] : []), ...newsItems, ...state.currentSeason.newsFeed].slice(0, 40),
          pendingTradeOffers: [...existingTrades, ...newTradeOffers],
          transferListings: transferData.listings,
          incomingOffers: transferData.incomingOffers,
          incomingLoanOffers: mergedLoanOffers,
          loanRequests: [],
          loanResponses: [...(state.currentSeason.loanResponses ?? []), ...newLoanResponses],
          transferBids: processedBids,
          // 在籍していない選手の直訴を落とすのは下の reconcileTalks の役目。ここは新しい直訴を足すだけ
          // （前はここで status === 'active' も見ていたので、ケガした瞬間に交渉中の話が消えていた）
          transferRequests: [...(state.currentSeason.transferRequests ?? []), ...newTransferReqs],
          overseasRequests: [...(state.currentSeason.overseasRequests ?? []), ...newOvReqs],
          // 失効した契約更新の札は消す（上の expiredContractReqs で選んである）。
          // 旧セーブの期限なし要求(expiresAtRaceなし)もここで失効する
          contractRequests: (state.currentSeason.contractRequests ?? []).filter(r => !expiredContractIds.has(r.id)),
          seasonRaceIncome: (state.currentSeason.seasonRaceIncome ?? 0) + raceIncomeAccum,
          awayAppearances: awayApps,
          // 全クラブぶんの区間賞（翌季の予算に入れる。自チームだけの seasonRaceIncome とは別に持つ）
          seasonSegPrize: (() => {
            const acc = { ...(state.currentSeason.seasonSegPrize ?? {}) }
            for (const [tid, v] of Object.entries(segPrizeAll)) acc[tid] = (acc[tid] ?? 0) + v
            return acc
          })(),
          expiredNegotiations: [...(state.currentSeason.expiredNegotiations ?? []), ...allExpiredNegs, ...faSnipedNegs],
          freeTransferNotices: [...(state.currentSeason.freeTransferNotices ?? []), ...freeDecisionNotices],
          transferIncome: (state.currentSeason.transferIncome ?? 0) + myCpuSaleIncome,
          departureNotices: [...(state.currentSeason.departureNotices ?? []), ...myCpuSaleNotices] } }
    })

    // 本編レース完走に同期して海外リーグも1戦進める（別set・裏進行）。
    // 万一エラーが出てもコアのレース進行を壊さないようガードする。
    try { get().advanceForeignLeagues() } catch (e) { console.error('advanceForeignLeagues failed', e) }
    // 移籍ウィンドウ中は日本↔海外の移籍も裏で少数発生させる（別set・裏進行）。
    // CPU同士の移籍・トレード・レンタルも、オフだけでなくシーズン中に回す。
    // **何回ぶん進むかは日付で決まる**ので、部ごとのレース数の違いに影響されない
    try { get().runCpuMarketRound(race.date) } catch (e) { console.error('runCpuMarketRound failed', e) }

    return results
  },


  setRaceStrategy: (s) => set({ raceStrategy: s }),



  setActiveRaceSim: (sim) => set({ activeRaceSim: sim }),

  setActiveRacePhase: (phase) => set({ activeRacePhase: phase }),

  setActiveRaceResults: (results) => set({ activeRaceResults: results }),

  setActiveRaceLocked: (race, index) => set({ activeRaceLockedRace: race, activeRaceLockedRaceIndex: index }),

  clearActiveRace: () => set({ activeRacePhase: null, activeRaceSim: null, activeRaceResults: null, activeRaceLockedRace: null, activeRaceLockedRaceIndex: 0 }),


  // ── Individual Events ─────────────────────────────────────────────
  simulateIndividualEvent: (eventId, skipPlayerIds) => {
    set(state => {
      const event = state.currentSeason.individualEvents?.find(e => e.id === eventId)
      if (!event || event.results) return state
      const skip = new Set(skipPlayerIds ?? [])
      // 誰が走るか・走らせて順位を付けるところは engine/timeTrial 1本
      const runners = timeTrialRunners(
        { players: state.players, teams: state.teams, foreignLeagues: state.foreignLeagues,
          playerTeamId: state.playerTeamId, prospects: state.currentSeason.scoutProspects ?? [] },
        event, skip)
      const ranked = runTimeTrial(runners, event)

      const bestKey = eventDistKey(event.distance)
      const timeByPlayer = new Map(ranked.map(r => [r.playerId, r.timeSec]))
      // 自チームの上位3人は士気と調子が上がる
      const boosted = timeTrialBoosted(ranked, state.playerTeamId)
      // 走れば距離ぶん疲れ、休んだ現役選手は回復する
      const fatGain = timeTrialFatigueGain(event.distance)
      const updatedPlayers = state.players.map(p => {
        const ran = timeByPlayer.get(p.id)
        let next = p
        if (ran != null) {
          next = withEventBest(withFatigue(next, fatGain), bestKey, ran, state.currentSeason.year)
        } else if (p.status === 'active' && p.teamId) {
          next = withFatigue(next, TT_REST_RECOVERY)
        }
        if (boosted.has(p.id)) {
          next = { ...withMorale(next, 8), form: Math.min(2, (next.form ?? 0) + 1) }
        }
        return next
      })

      // スカウト候補は記録だけ残す（未所属なので疲労・士気・報酬は対象外）
      const updatedProspects = (state.currentSeason.scoutProspects ?? []).map(p => {
        const ran = timeByPlayer.get(p.id)
        if (ran == null) return p
        return withEventBest(p, bestKey, ran, state.currentSeason.year)
      })

      const rewardCards = timeTrialRewardCards(ranked, state.playerTeamId, event.id)

      // 自チームの最上位をニュースに
      const myBest = ranked.find(r => r.teamId === state.playerTeamId)
      const myBestPlayer = myBest ? state.players.find(p => p.id === myBest.playerId) : null
      const newsItem = myBestPlayer ? {
        date: event.date,
        headline: worldChampFinishHeadline({
          eventName: event.name, playerName: myBestPlayer.name,
          distance: event.distance, rank: myBest!.rank, timeSec: myBest!.timeSec }),
        category: 'race' as const,
        relatedIds: [myBestPlayer.id] } : null

      // 世界記録・日本記録の更新（種目別の歴代1位。名前焼き込みで永続）。
      // **世界も日本も engine/timeTrialRecords の updateBestRecord 1本**を通る。
      // 違うのは「誰を見るか（全員／JPNだけ）」と「どこへ書くか」だけ
      const allPById = new Map([...state.players, ...(state.currentSeason.scoutProspects ?? [])].map(p => [p.id, p]))
      const recCtx = {
        eligible: () => true,
        nameOf: (id: string) => allPById.get(id)?.name,
        year: state.currentSeason.year, date: event.date, distance: event.distance }
      const wr = updateBestRecord(state.worldRecords?.[bestKey], ranked, { ...recCtx, scope: 'world' })
      const jr = updateBestRecord(state.japanRecords?.[bestKey], ranked, {
        ...recCtx, scope: 'japan', eligible: r => allPById.get(r.playerId)?.nationality === 'JPN' })
      const newWorldRecords = wr.record ? { ...state.worldRecords, [bestKey]: wr.record } : state.worldRecords
      const newJapanRecords = jr.record ? { ...state.japanRecords, [bestKey]: jr.record } : state.japanRecords
      const recordNewsItems = [...wr.news, ...jr.news]

      // チーム歴代記録（選手ごと最速・種目別）。名前と国籍も焼き込む
      const updatedTeams = updateTeamEventRecords(
        state.teams, ranked, new Map(state.players.map(p => [p.id, p])), bestKey, state.currentSeason.year)

      return {
        players: updatedPlayers,
        teams: updatedTeams,
        worldRecords: newWorldRecords,
        japanRecords: newJapanRecords,
        trainingCards: rewardCards.length > 0 ? [...(state.trainingCards ?? []), ...rewardCards] : state.trainingCards,
        currentSeason: {
          ...state.currentSeason,
          individualEvents: state.currentSeason.individualEvents?.map(e =>
            e.id === eventId ? { ...e, results: ranked, rewardCards } : e
          ),
          // 他の書き込み箇所と同じ上限(30)。ここだけ無かったため、記録会を連続で消化すると
          // 次にrunRace等が上限付きで書き込むまでの間、際限なく積み上がっていた
          newsFeed: [
            ...recordNewsItems,
            ...(newsItem ? [newsItem] : []),
            ...(state.currentSeason.newsFeed ?? []),
          ].slice(0, 30),
          scoutProspects: updatedProspects } }
    })
    // 記録会の完了でも入札・レンタル要請の応答を進める（本編以外でも返答が来るように）
    try { get().advanceMarketOneRace() } catch (e) { console.error('advanceMarketOneRace failed', e) }
    // CPU同士の市場も記録会の日付で進める。**レースだけで数えると部ごとに回数が変わる**
    // （1部10戦・2部8戦・3部7戦）。記録会は3部とも同じ7回なので、ここも通す
    try {
      const ev = get().currentSeason.individualEvents?.find(e => e.id === eventId)
      if (ev) get().runCpuMarketRound(ev.date)
    } catch (e) { console.error('runCpuMarketRound failed', e) }
  },


  // 既存セーブ移行：現シーズンに記録会を注入（冪等・1回だけ）。
  // 過去には戻れないので、シーズン途中の場合は「まだ来ていない日付」の記録会だけ入れる。
  ensureIndividualEvents: () => {
    set(state => {
      const MARK = 'tt-events-v1'
      if ((state.giftGivenVersions ?? []).includes(MARK)) return state
      const cs = state.currentSeason
      const races = cs.races ?? []
      if (races.length === 0) return state  // 本編開始前はマークもせず、開始処理側で生成
      const evs = cs.individualEvents ?? []
      const alreadyNew = evs.length > 0 && evs.every(e => e.id.startsWith('tt-'))
      // 現在地点＝最後に消化したレースの日付（未消化なら全部未来）
      const idx = cs.currentRaceIndex ?? 0
      const cutoff = idx > 0 ? (races[idx - 1]?.date ?? '') : ''
      const events = alreadyNew ? evs : generateIndividualEvents(cs.year).filter(e => e.date >= cutoff)
      return {
        // 旧仕様で溜まった移籍希望（チャットを開くたびに増殖したもの）を一度だけリセット。以後はレース進行時に正しく生成される。
        currentSeason: { ...cs, individualEvents: events, transferRequests: [] },
        giftGivenVersions: [...(state.giftGivenVersions ?? []), MARK] }
    })
    // 誤追記バグ（交渉返答が文脈違いで復元される）で汚れた保存チャットログを一度だけ全消去する
    set(state => {
      const CHAT_MARK = 'chatlogs-reset-v1'
      if ((state.giftGivenVersions ?? []).includes(CHAT_MARK)) return state
      return {
        currentSeason: { ...state.currentSeason, chatLogs: {} },
        giftGivenVersions: [...(state.giftGivenVersions ?? []), CHAT_MARK] }
    })
    // 海外選手のID衝突（採番カウンタが再起動でリセット）で生まれた重複を一度だけ除去する。
    // players配列は先勝ち（元からいた選手を残す）、クラブ名簿はID重複を排除。
    set(state => {
      const ID_MARK = 'foreign-id-dedupe-v1'
      if ((state.giftGivenVersions ?? []).includes(ID_MARK)) return state
      const seen = new Set<string>()
      const deduped: typeof state.players = []
      for (const p of state.players) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        deduped.push(p)
      }
      return {
        players: deduped.length !== state.players.length ? deduped : state.players,
        giftGivenVersions: [...(state.giftGivenVersions ?? []), ID_MARK] }
    })
    // 世界記録・日本記録の整備（毎起動）。架空のベースライン保持者は廃止：
    // 過去に注入されたベースライン（playerIdなし）を取り除き、実在選手の自己ベストで埋め直す
    set(state => {
      const strip = (cur: GameState['worldRecords']) => {
        let changed = false
        const out = { ...(cur ?? {}) }
        for (const k of ['d5000', 'd10000', 'half', 'marathon'] as const) {
          if (out[k] && !out[k]!.playerId) { delete out[k]; changed = true }
        }
        return { out, changed }
      }
      const w = strip(state.worldRecords)
      const j = strip(state.japanRecords)
      // 実在選手の自己ベスト（eventBests）で記録を埋め直す。
      // 記録データ導入前のタイムや、ベースライン除去後の空欄をここで実選手の最速に更新する
      let wChanged = w.changed
      let jChanged = j.changed
      for (const k of ['d5000', 'd10000', 'half', 'marathon'] as const) {
        for (const p of state.players) {
          const b = p.eventBests?.[k]
          if (!b) continue
          const cw = w.out[k]
          if (!cw || b.timeSec < cw.timeSec) {
            w.out[k] = { playerId: p.id, playerName: p.name, timeSec: b.timeSec, year: b.year }
            wChanged = true
          }
          if (p.nationality === 'JPN') {
            const cj = j.out[k]
            if (!cj || b.timeSec < cj.timeSec) {
              j.out[k] = { playerId: p.id, playerName: p.name, timeSec: b.timeSec, year: b.year }
              jChanged = true
            }
          }
        }
      }
      if (!wChanged && !jChanged) return state
      return { worldRecords: w.out, japanRecords: j.out }
    })
    // 未来年の記録の掃除：セーブ破損（時間が巻き戻った状態での上書き）で現在より先の年の
    // 受賞・記録が残ると、2028年に「2030年MVP」パッチが付くような矛盾が起きるため除去する
    set(state => {
      const year = state.currentSeason.year
      const tops = (state.eventSeasonTops ?? []).filter(t => t.year <= year)
      if (tops.length === (state.eventSeasonTops ?? []).length) return state
      return { eventSeasonTops: tops }
    })
    // 所属は player.teamId だけで持つようになったので、クラブ名簿との同期処理は不要になった
    // （旧セーブの救済は persist の migrate v22 で1回だけ行う）
  } })
