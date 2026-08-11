// race ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
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
import { domesticTeamIdSet as domesticTeamIdSet_, bigClub } from '../../utils/clubs'
import { appendChatLog } from '../../utils/chatLog'
import { myDivSize } from '../../utils/league'
import { CARD_UNIT_EXP } from '../../data/cardShop'
import { generateIndividualEvents } from '../../data/races'
import { ACHIEVEMENT_JEWELS, checkRaceAchievements } from '../../engine/achievements'
import { generateForeignAndLoanOffers, generateTransferActivity } from '../../engine/cpuMarket'
import { applyAwayDivisionRound, applyRacedToSchedule, simulateAwayDivisions } from '../../engine/domesticLeague'
import { generateRaceEvents } from '../../engine/eventEngine'
import { simulateIndividualTime } from '../../engine/individualRace'
import { applyRaceBoosts } from '../../engine/raceBoosts'
import { buildCpuLineups, simulateRace } from '../../engine/raceEngine'
import { type CardRarity, type CardStatKey, type ExpiredNegotiation, type GameState, type LoanResponse, type Player, type Ratings, type TrainingCard, type TransferRecord } from '../../types'
import { computeSeasonAwards } from '../../utils/awards'
import { generateDropCards } from '../../utils/cardCombo'
import { MAJOR_NEWS_OVR, allTieredClubs, tierOfPlayerClub } from '../../utils/clubTier'
import { allForeignClubs, findClub, foreignClubIdSet } from '../../utils/clubs'
import { withFatigue, withMorale } from '../../utils/condition'
import { isLiveContract } from '../../utils/contractTalk'
import { DIVISION_SIZE, divisionOf, domesticThroughRank, rankOfTeam, segmentPrizeByTeam } from '../../utils/league'
import { type DepartureNotice, movePlayer } from '../../utils/movePlayer'
import { awardHeadline, loanReplyHeadline, recordHeadline, retirementHeadline, segmentPrizeHeadline, transferHeadline, worldChampFinishHeadline } from '../../utils/newsItems'
import { comparePlayers } from '../../utils/playerSort'
import { faMarketSalary, getStatPotentials, keyPlayerStatus, ovr, racesConsumed, retirementAgeOf, seasonAppearances, seasonPerfProfile } from '../../utils/playerUtils'
import { keepSaleAnswers, saleAnswers } from '../../utils/saleAnswer'
import { openWishIds } from '../../utils/talkSync'
import { appraiseMove, dreamRegionOf } from '../../utils/transferDecision'
import { canWishTransfer } from '../../utils/transferEligibility'

type Slice = Pick<GameStore,
  'setRaceLineup' | 'clearRaceLineup' | 'runRace' | 'setRaceStrategy' | 'setRaceTeamTalk' | 'setActiveRaceSim' | 'setActiveRacePhase' | 'setActiveRaceResults' | 'setActiveRaceLocked' | 'clearActiveRace' | 'resolveEvent' | 'simulateIndividualEvent' | 'ensureIndividualEvents'>

export const createRaceSlice = (set: SetGame, get: () => GameStore): Slice => ({

  // Race lineup
  setRaceLineup: (segmentIndex, playerId) => {
    set(state => ({ raceLineup: { ...state.raceLineup, [segmentIndex]: playerId } }))
  },

  clearRaceLineup: () => set({ raceLineup: {} }),


  runRace: (lineup, segmentTactics, preComputedResults) => {
    // ── 「譲る」と返事をした話の決着 ─────────────────────────────
    // 買う側の入札が1レース待つのに、売る側だけタップで即成立していたので揃える。
    //
    // ★行き先は**GMが選んだクラブで確定**。
    //   以前はここで全オファーを本人の希望順に並べ直し、一番良いものを勝たせていた。
    //   そのため「台北に譲る」を押したのにマドリードへ移籍する、という
    //   GMの意思をまるごと無視する動きになっていた。売る相手を決めるのはGM。
    //   本人にできるのは「その行き先なら行く／行かない」だけ（下の consentToLeave）。
    //
    // ★返事は**選手ごとに1件**。ここで全部決着させる（utils/saleAnswer）。
    //   置き場所がシーズンに1件しか無かったころは、同じレース間に2人ぶん返事をすると
    //   前の返事が上書きされ、その選手は決着もせずチャットに承諾ボタンが戻っていた。
    {
      const cs0 = get().currentSeason
      const answers = saleAnswers(cs0)
      // 先に全部落としてから決着させる（acceptIncomingOffer の中で札を見るため）
      if (answers.length > 0) set(st => ({ currentSeason: keepSaleAnswers(st.currentSeason, () => false) }))
      for (const ps of answers) {
        const winner = ps.offerId
        const beforeName = get().players.find(x => x.id === ps.playerId)?.name ?? ''
        const winnerId = (cs0.incomingOffers ?? []).find(o => o.id === winner)?.fromTeamId
        const winnerName = findClub(get().teams, get().foreignLeagues, winnerId)?.shortName ?? '相手クラブ'
        const outcome = get().acceptIncomingOffer(winner, true)
        const p = get().players.find(x => x.id === ps.playerId)

        // ★決着は必ず会話に書く。ここが無かったので「譲ります」と返事をしてレースを
        //   進めても、成立したのか流れたのかが会話にも通知にも出ず、次の打診だけが来ていた。
        if (outcome === 'sold') {
          set(st => ({ currentSeason: appendChatLog(st.currentSeason, ps.playerId, {
            from: 'player',
            text: `（代理人）${beforeName}の${winnerName}への移籍が成立しました。お世話になりました` }) }))
        } else if (p) {
          // 流れたときも黙って消さず、会話と通知の両方に理由を残す
          const kind = outcome === 'roster_min' ? 'sale_roster_min' as const : 'sale_refused' as const
          const reason = outcome === 'roster_min'
            ? `（代理人）在籍人数が下限を下回るため、${p.name}の移籍は成立しませんでした。残留します`
            : `（代理人）${p.name}は最後まで悩みましたが、移籍しないことに決めました。残留します`
          // ★本人が「行かない」と決めた以上、**そのとき打診していたクラブは今季もう来ない**。
          //   ここを入れ忘れていたので、「移籍しないことに決めました。残留します」の直後に
          //   同じクラブからまた「◯億でお譲りいただけないでしょうか」が並んでいた。
          //   （断られたクラブだけを止める。全クラブを止めると「格下を蹴って、あとから来る
          //    格上へ行く」ができなくなる — utils/transferEligibility の canClubApproachAgain）
          const refusedClubs = outcome === 'refused'
            ? [...new Set((cs0.incomingOffers ?? []).filter(o => o.playerId === ps.playerId).map(o => o.fromTeamId))]
            : []
          if (refusedClubs.length > 0) {
            const year = get().currentSeason.year
            set(st => ({ players: st.players.map(pl => pl.id === ps.playerId
              ? { ...pl, saleRefused: { ...(pl.saleRefused ?? {}), ...Object.fromEntries(refusedClubs.map(c => [c, year])) } }
              : pl) }))
          }
          set(st => ({ currentSeason: {
            ...appendChatLog(st.currentSeason, ps.playerId, { from: 'player', text: reason }),
            // 残った札は全部たたむ。残すと次のレースでまた同じ返事を求められる
            incomingOffers: (st.currentSeason.incomingOffers ?? []).filter(o => o.playerId !== ps.playerId),
            expiredNegotiations: [
              ...(st.currentSeason.expiredNegotiations ?? []),
              { id: `sale_${ps.playerId}_${st.currentSeason.currentRaceIndex}`, playerId: p.id, playerName: p.name, kind },
            ] } }))
        }
      }
    }
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
        playerTeamId, myDivision, currentSeason: state.currentSeason,
        raceTeamTalk: state.raceTeamTalk, awayCareerAdd: awayRound.careerAdd })
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

      // Generate inter-race events and AI trade offers
      const newEvents = generateRaceEvents({
        players: recoveredPlayers,
        playerTeamId,
        raceIndex: raceIndex + 1,
        season: { ...state.currentSeason, events: state.currentSeason.events ?? [] },
        gmRep: state.gmRep ?? 50,
        teams: state.teams })
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
        currentSeason: state.currentSeason, playerTeamId, raceDate: race.date,
        retiringWishIds, destinationOf: (clubId, p) => get().destinationOf(clubId, p) })
      const cpuTxList = cpuSettle.txList
      const cpuTxListingIds = cpuSettle.settledListingIds
      const cpuTxNewsItems = cpuSettle.news

      const existingListingsFiltered = (state.currentSeason.transferListings ?? []).filter(l => !cpuTxListingIds.has(l.id))

      // 期限が来た話の処理は engine/offerExpiry 1本
      // （有料の打診＝失効通知／フリーの接触＝本人が決断。見る順番に意味がある）
      const expiry = resolveExpiredOffers({
        players: finalPlayers, teams: state.teams, foreignLeagues: state.foreignLeagues,
        currentSeason: state.currentSeason, playerTeamId, nextClock, nextRaceIndex,
        ranRaces: updatedRaces, raceDate: race.date,
        destinationOf: (clubId, p) => get().destinationOf(clubId, p) })
      const offerExpiredNegs = expiry.expiredNegs
      const offerExpiredPlayerIds = expiry.expiredPlayerIds
      const freeDecisionNotices = expiry.freeDecisionNotices
      const freeMoves = expiry.freeMoves
      const freeMoveNews = expiry.freeMoveNews

      const transferData = generateTransferActivity(finalPlayers, teamsWithPrize, playerTeamId, nextClock, existingListingsFiltered, state.currentSeason.incomingOffers ?? [], state.currentSeason.transferRequests ?? [], retiringWishIds, state.currentSeason.year, state.currentSeason.races.length)

      // 海外クラブからの移籍オファー ＋ 相手からのレンタル打診（チャットで対応）
      // クラブはそのまま渡す。**ここで id/name/leagueId/country だけに削っていた**ので、
      // 受け取る側は格も手元資金も見られず、いくらまで出せるかを初期値の格から作り直していた。
      const foreignClubs = allForeignClubs(state.foreignLeagues)
      const keptLoanOffers = (state.currentSeason.incomingLoanOffers ?? []).filter(o => o.expiresAtRace > nextClock && finalPlayers.some(p => p.id === o.playerId))
      const flOffers = generateForeignAndLoanOffers({ players: finalPlayers, teams: teamsWithPrize, foreignClubs, playerTeamId, raceIndex: nextClock, existingIncoming: transferData.incomingOffers, existingLoans: keptLoanOffers, races: updatedRaces, season: { ...state.currentSeason, races: updatedRaces }, retiringIds: retiringWishIds, currentYear: state.currentSeason.year })
      const mergedIncomingOffers = [...transferData.incomingOffers, ...flOffers.foreignIncoming]
      const mergedLoanOffers = [...keptLoanOffers, ...flOffers.loanOffers]

      // 入札の応答は engine/bidResolution 1本（判定は utils/transferBid の resolveBid）
      const bidResult = resolveTransferBids({
        bids: state.currentSeason.transferBids ?? [],
        players: finalPlayers, teams: state.teams, foreignLeagues: state.foreignLeagues ?? [],
        listings: transferData.listings, currentSeason: state.currentSeason,
        pastSeasons: state.pastSeasons, races: updatedRaces, raceClock: nextClock, playerTeamId,
        destinationOf: (clubId, p) => get().destinationOf(clubId, p) })
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

      // CPUトレード反映 ＋ 移籍リスト入りフラグの同期（他チーム選手にも「移籍希望」が立つ）
      const listedIdSet = new Set(transferData.listings.map(l => l.playerId))
      // 移籍が決まった選手は下の movePlayer で動かすので、ここでは札の同期だけ
      const txIds = new Set(cpuTxList.map(t => t.playerId))
      const playersListedSynced = recoveredPlayers.map(p => {
        if (txIds.has(p.id)) return p
        const listed = listedIdSet.has(p.id)
        const nextListed = listed ? true : (p.teamId === playerTeamId ? (p.transferListed ?? false) : false)
        return nextListed === (p.transferListed ?? false) ? p : { ...p, transferListed: nextListed }
      })
      // CPUの移籍成立を1件ずつ movePlayer に通す。
      // 所属・名簿の付け替え・移籍金の授受・移籍履歴・退団のお知らせが自チームの操作と同じ形になる。
      // 自チームから出て行った選手とは1年間交渉不可（transferLockedUntilYear）。
      let playersWithCpuTx: Player[] = playersListedSynced
      let teamsWithCpuTx = teamsWithPrize
      const cpuTxRecords: TransferRecord[] = []
      const myCpuSaleNotices: DepartureNotice[] = []
      let myCpuSaleIncome = 0
      for (const tx of cpuTxList) {
        const m = movePlayer({ players: playersWithCpuTx, teams: teamsWithCpuTx }, tx.playerId, tx.toTeamId, {
          year: state.currentSeason.year,
          date: race.date,
          fee: tx.fee,
          years: playersWithCpuTx.find(p => p.id === tx.playerId)?.contract.yearsLeft,
          toName: tx.toShort,
          myTeamId: playerTeamId,
          ...(tx.fromTeamId === playerTeamId ? { lockUntilYear: state.currentSeason.year + 1 } : {}) })
        if (!m.ok) continue
        playersWithCpuTx = m.players
        teamsWithCpuTx = m.teams
        if (m.record) cpuTxRecords.push(m.record)
        if (m.notice) myCpuSaleNotices.push(m.notice)
        myCpuSaleIncome += m.income
      }

      // 競り負けた入札。上回ったクラブが実際にその選手を獲る（言うだけで選手が残ると、
      // 次の節にもう一度同じ額で出せてしまい「競り負け」が形だけになる）。
      // 通すのはCPU間売買と同じ movePlayer なので、名簿・移籍金・履歴の後始末も同じ形になる
      const outbidNewsItems: typeof state.currentSeason.newsFeed = []
      for (const mv of outbidMoves) {
        const before = playersWithCpuTx.find(p => p.id === mv.playerId)
        const fromShort = before ? findClub(teamsWithCpuTx, state.foreignLeagues, before.teamId)?.shortName ?? '' : ''
        // ★移す直前に本人の意思をもう一度みる。**移籍の可否は appraiseMove 1本**。
        //   他の入口（承諾・逆提示・トレード・引き抜き）は移す瞬間に本人へ聞いているのに、
        //   ここだけ「競り勝ったクラブがいる＝確定」で、本人が断って残る道が無かった。
        //   競り上げの間に序列や状況が変わることもあるので、ここで聞き直す。
        if (before) {
          const dest = get().destinationOf(mv.toTeamId, before)
          const srcTier = tierOfPlayerClub(before.teamId, allTieredClubs(state.teams, state.foreignLeagues))
          if (!appraiseMove(before, dest, { srcTier }).ok) {
            // 本人が断った＝残留。誰の手にも渡らないので、理由を通知に残す
            bidExpiredNegs.push({
              id: `stay_${mv.playerId}_${nextClock}`, playerId: mv.playerId, playerName: mv.playerName,
              kind: 'outbid', detail: `${mv.clubName}の提示を${mv.playerName}が断り、残留しました` })
            continue
          }
        }
        const m = movePlayer({ players: playersWithCpuTx, teams: teamsWithCpuTx }, mv.playerId, mv.toTeamId, {
          year: state.currentSeason.year,
          date: race.date,
          fee: mv.fee,
          years: before?.contract.yearsLeft,
          toName: mv.clubName,
          myTeamId: playerTeamId })
        if (!m.ok) continue
        playersWithCpuTx = m.players
        teamsWithCpuTx = m.teams
        if (m.record) cpuTxRecords.push(m.record)
        outbidNewsItems.push({
          date: race.date,
          headline: transferHeadline({
            playerName: mv.playerName,
            playerOvr: ovr(state.players.find(x => x.id === mv.playerId) ?? ({ ratings: {} } as Player)),
            fromLabel: fromShort, toLabel: mv.clubName, fee: mv.fee }),
          category: 'trade' as const,
          relatedIds: [mv.playerId],
          // 大ニュースはOVR85以上か格1のクラブが絡んだとき（utils/clubTier 1本）
          major: (ovr(state.players.find(x => x.id === mv.playerId) ?? ({ ratings: {} } as Player)) >= MAJOR_NEWS_OVR) || bigClub(state, mv.toTeamId),
          toTeamId: mv.toTeamId })
      }

      // レンタル要請（移籍市場から出したもの）の応答。相手が承諾なら借用成立、拒否ならニュース。
      const pendingLoanReqs = state.currentSeason.loanRequests ?? []
      let playersAfterLoan: Player[] = playersWithCpuTx
      let teamsAfterLoan = teamsWithCpuTx
      const loanRespNews: { date: string; headline: string; category: 'trade'; relatedIds: string[] }[] = []
      const newLoanResponses: LoanResponse[] = []
      if (pendingLoanReqs.length > 0) {
        let freeSlots = Math.max(0, 3 - playersWithCpuTx.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId).length)
        const accepted: { playerId: string; ownerId: string; years: number }[] = []
        for (const req of pendingLoanReqs) {
          const pl = playersWithCpuTx.find(p => p.id === req.playerId)
          if (!pl || pl.teamId !== req.targetTeamId || pl.loan) { continue }
          const loanable = keyPlayerStatus(pl, { year: state.currentSeason.year, races: updatedRaces, eclSeries: state.currentSeason.eclSeries }, state.pastSeasons) === 'open'
          const ownerShort = findClub(teamsWithCpuTx, state.foreignLeagues, pl.teamId)?.shortName
            ?? '相手クラブ'
          if (loanable && freeSlots > 0) {
            accepted.push({ playerId: pl.id, ownerId: pl.teamId, years: req.years }); freeSlots--
            loanRespNews.push({ date: race.date, headline: loanReplyHeadline({ ownerLabel: ownerShort, playerName: pl.name, years: req.years, accepted: true }), category: 'trade', relatedIds: [pl.id] })
            newLoanResponses.push({ id: `lresp_${pl.id}_${raceIndex}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: true, years: req.years })
          } else {
            loanRespNews.push({ date: race.date, headline: loanReplyHeadline({ ownerLabel: ownerShort, playerName: pl.name, years: req.years, accepted: false }), category: 'trade', relatedIds: [pl.id] })
            newLoanResponses.push({ id: `lresp_${pl.id}_${raceIndex}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: false, years: req.years })
          }
        }
        // 借用成立も movePlayer に通す（保有元を残して、貸した側の名簿から外す）
        for (const a of accepted) {
          const m = movePlayer({ players: playersAfterLoan, teams: teamsAfterLoan }, a.playerId, playerTeamId, {
            year: state.currentSeason.year,
            until: state.currentSeason.year + a.years,
            raceIndex: raceIndex + 1,
            years: a.years,
            myTeamId: playerTeamId })
          if (!m.ok) continue
          playersAfterLoan = m.players
          teamsAfterLoan = m.teams
        }
      }

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

      // ── 移籍希望：契約残り2年切った(≤1)選手から毎レース最大1人。理由は出場機会/強豪志向/待遇不満。 ──
      // 直訴（引退したい・移籍したい・海外に行きたい）の札は1人につき1つだけ。
      // 3つを別々に抽選していたので、同じ選手が「移籍したい」と「海外に行きたい」を
      // 同時に持ててしまい、ベルは2件なのにチャットには1行、という数のズレになっていた。
      // 「もう何か言っている選手か」の判定は talkSync の openWishIds 1本に寄せる
      const openWish = openWishIds(state.currentSeason)
      // 順位の物差しは自分の部の中（52で見ると3部が永久に「上位」になる）
      const trTotalTeams = DIVISION_SIZE[myDivision]
      const myStandRank = (() => {
        const r = rankOfTeam(updatedStandings[myDivision], playerTeamId)
        return r > 0 ? r : Math.ceil(trTotalTeams / 2)
      })()
      const trCandidates = playersAfterLoan
        // canWishTransfer＝借り物・引退の話をしている・海外挑戦を承認済み、を全部外す。
        // （借り物は保有権が無く「移籍を認める」と他人の選手を消してしまう。
        //   引退を見ていなかったので、引退を承認した選手が数レース後に移籍を直訴してきていた）
        // 既に対応済み（移籍を認めた transferListed / 残ってほしいで説得済み）の選手は同シーズン中に再抽選しない
        .filter(p => canWishTransfer(p, { teamId: playerTeamId, currentYear: state.currentSeason.year, retiringIds: retiringWishIds })
          && p.status === 'active' && p.contract.yearsLeft <= 1 && !openWish.has(p.id)
          && !p.transferListed && p.transferRequestDismissedYear !== state.currentSeason.year)
        .map(p => {
          const apps = seasonAppearances(p.id, updatedRaces)
          const frac = apps / (raceIndex + 1)
          let score = 0
          let reason: 'playing_time' | 'team_performance' | 'unhappy' = 'unhappy'
          if (frac < 0.3) { score = (0.3 - frac) * 40; reason = 'playing_time' }
          // 役割ミスマッチ：任命した役割が期待する出場ラインを下回ると不満（エース/主力ほど強い）
          const roleExpect = p.teamRole === 'ace' ? 0.7 : p.teamRole === 'key_player' ? 0.5 : p.teamRole === 'sub_ace' ? 0.35 : 0
          if (roleExpect > 0 && frac < roleExpect) {
            const rs = (roleExpect - frac) * 55
            if (rs > score) { score = rs; reason = 'playing_time' }
          }
          if (ovr(p) >= 75 && myStandRank > trTotalTeams / 2) {
            const amb = (ovr(p) - 72) + (myStandRank - trTotalTeams / 2) * 1.2
            if (amb > score) { score = amb; reason = 'team_performance' }
          }
          if ((p.morale ?? 70) < 50) {
            const un = (50 - (p.morale ?? 70)) * 0.8
            if (un > score) { score = un; reason = 'unhappy' }
          }
          // 年俸重視の性格：相場の7割未満で使われていると「安すぎる」と不満を持つ（純粋なお金理由の移籍希望）。
          // ドラフト初回契約（rookieDeal）は安いのが前提なので対象外＝更新交渉で適正化する流れに乗せる
          if ((p.personality ?? 'salary') === 'salary' && !p.contract.rookieDeal) {
            const market = faMarketSalary(p, seasonPerfProfile(p.id, updatedRaces, raceIndex + 1))
            const payRatio = market > 0 ? p.contract.annualSalary / market : 1
            if (payRatio < 0.7) {
              const money = (0.7 - payRatio) * 50
              if (money > score) { score = money; reason = 'unhappy' }
            }
          }
          return { id: p.id, score, reason }
        })
        .filter(c => c.score > 0)
      let newTransferReqs: { playerId: string; reason: 'playing_time' | 'team_performance' | 'unhappy' }[] = []
      if (trCandidates.length > 0 && Math.random() < 0.45) {
        const totalScore = trCandidates.reduce((s, c) => s + c.score, 0)
        let r = Math.random() * totalScore
        let picked = trCandidates[0]
        for (const c of trCandidates) { r -= c.score; if (r <= 0) { picked = c; break } }
        newTransferReqs = [{ playerId: picked.id, reason: picked.reason }]
        // この場で移籍希望を出した選手は、続く海外挑戦の抽選から外す
        openWish.add(picked.id)
      }

      // ── 海外挑戦の直訴：世界レベル（OVR80+・30歳以下）が「海外でやりたい」とチャットで言い出す。
      //    代表帰り（前年〜今年に世界選手権代表）は世界を見てきたので言い出しやすい ──
      // 夢の行き先はタイプで変わる：持久系→アフリカ高地／スピード系→欧州トラック／山・万能→北米
      // 夢の行き先は utils/transferDecision.ts の dreamRegionOf 1本（移籍の判定と同じ表を見る）
      const ovCands = playersAfterLoan.filter(p => p.teamId === playerTeamId && p.status === 'active' && !p.loan
        && ovr(p) >= 80 && p.age <= 30 && !p.overseasListed && !openWish.has(p.id)
        && p.overseasDeniedYear !== state.currentSeason.year && !p.transferListed)
      let newOvReqs: { playerId: string; region: import('../../types').OverseasRegion }[] = []
      for (const p of ovCands) {
        const wasRep = (state.worldRepresentatives ?? []).some(r => r.playerId === p.id && r.year >= state.currentSeason.year - 1)
        if (Math.random() < (wasRep ? 0.10 : 0.03)) { newOvReqs = [{ playerId: p.id, region: dreamRegionOf(p.specialty) }]; break }
      }

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
        playerTeamId, raceDate: race.date, nextClock })
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
          events: [...(state.currentSeason.events ?? []), ...newEvents],
          pendingTradeOffers: [...existingTrades, ...newTradeOffers],
          transferListings: transferData.listings,
          incomingOffers: mergedIncomingOffers,
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
    try { get().runMidSeasonForeignTransfers() } catch (e) { console.error('runMidSeasonForeignTransfers failed', e) }

    return results
  },


  setRaceStrategy: (s) => set({ raceStrategy: s }),

  setRaceTeamTalk: (t) => set({ raceTeamTalk: t }),


  setActiveRaceSim: (sim) => set({ activeRaceSim: sim }),

  setActiveRacePhase: (phase) => set({ activeRacePhase: phase }),

  setActiveRaceResults: (results) => set({ activeRaceResults: results }),

  setActiveRaceLocked: (race, index) => set({ activeRaceLockedRace: race, activeRaceLockedRaceIndex: index }),

  clearActiveRace: () => set({ activeRacePhase: null, activeRaceSim: null, activeRaceResults: null, activeRaceLockedRace: null, activeRaceLockedRaceIndex: 0 }),


  resolveEvent: (eventId, choiceIndex) => {
    set(state => {
      const event = (state.currentSeason.events ?? []).find(e => e.id === eventId)
      if (!event || event.resolved) return state
      let players = state.players
      let teams = state.teams
      let gmRep = state.gmRep ?? 50
      let season = state.currentSeason
      const pid = event.playerId
      const STATS = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery'] as const

      if (event.type === 'player_fatigue' && pid) {
        if (choiceIndex === 0) {
          players = players.map(p => p.id === pid ? { ...withFatigue(p, -40), form: Math.min(2, (p.form ?? 0) + 1), missNextRace: true } : p)
        } else if (choiceIndex === 1) {
          players = players.map(p => p.id === pid ? withFatigue(p, -15) : p)
        } else {
          players = players.map(p => p.id === pid ? withFatigue(p, 15) : p)
        }
      } else if (event.type === 'player_morale_low' && pid) {
        if (choiceIndex === 0) {
          players = players.map(p => p.id === pid ? withMorale(p, 25) : p)
        } else if (choiceIndex === 1) {
          players = players.map(p => p.id === pid ? withMorale(p, 15) : p)
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 2000000 } } : t)
        } else {
          players = players.map(p => p.id === pid ? withMorale(p, -15) : p)
        }
      } else if (event.type === 'player_form_up' && pid) {
        if (choiceIndex === 0) {
          const stat = STATS[Math.floor(Math.random() * STATS.length)]
          players = players.map(p => p.id === pid ? { ...p, ratings: { ...p.ratings, [stat]: Math.min((getStatPotentials(p) as Record<string, number>)[stat] ?? 99, p.ratings[stat] + 1) }, fatigue: withFatigue(p, 8).fatigue } : p)
        } else {
          players = players.map(p => p.id === pid ? withMorale(p, 10) : p)
        }
      } else if (event.type === 'young_breakout' && pid) {
        if (choiceIndex === 0) {
          const stat = STATS[Math.floor(Math.random() * STATS.length)]
          players = players.map(p => p.id === pid ? { ...p, ratings: { ...p.ratings, [stat]: Math.min((getStatPotentials(p) as Record<string, number>)[stat] ?? 99, p.ratings[stat] + 2) }, fatigue: withFatigue(p, 10).fatigue } : p)
        }
      } else if (event.type === 'player_wants_renewal' && pid) {
        if (choiceIndex === 0) {
          players = players.map(p => p.id === pid ? withMorale(p, 10) : p)
        } else {
          players = players.map(p => p.id === pid ? withMorale(p, -5) : p)
        }
      } else if (event.type === 'sponsor_offer') {
        if (choiceIndex === 0) {
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + 5000000 } } : t)
          gmRep = Math.min(100, gmRep + 1)
        } else {
          gmRep = Math.min(100, gmRep + 3)
        }
      } else if (event.type === 'media_interview') {
        if (choiceIndex === 0) {
          gmRep = Math.min(100, gmRep + 4)
          players = players.map(p => p.teamId === state.playerTeamId ? withMorale(p, 5) : p)
        } else if (choiceIndex === 1) {
          gmRep = Math.min(100, gmRep + 2)
        } else {
          players = players.map(p => p.teamId === state.playerTeamId ? withMorale(p, 8) : p)
        }
      } else if (event.type === 'press_conference') {
        if (choiceIndex === 0) {
          gmRep = Math.min(100, gmRep + 3)
          players = players.map(p => p.teamId === state.playerTeamId ? withMorale(p, 6) : p)
        } else if (choiceIndex === 1) {
          gmRep = Math.min(100, gmRep + 1)
        } else {
          players = players.map(p => p.teamId === state.playerTeamId ? withMorale(p, 10) : p)
        }
      } else if (event.type === 'playing_time_demand' && pid) {
        if (choiceIndex === 0) {
          players = players.map(p => p.id === pid ? withMorale(p, 20) : p)
        } else if (choiceIndex === 1) {
          players = players.map(p => p.id === pid ? withMorale(p, 5) : p)
        } else {
          players = players.map(p => p.id === pid ? withMorale(p, -15) : p)
        }
      } else if (event.type === 'transfer_request' && pid) {
        const reqPlayer = players.find(p => p.id === pid)
        if (choiceIndex === 0) {
          players = players.map(p => p.id === pid ? withMorale(p, 15) : p)
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 3000000 } } : t)
        } else if (choiceIndex === 2 && reqPlayer) {
          players = players.map(p => p.id === pid ? withMorale(p, -25) : p)
          const escalation = {
            id: `evt_${Date.now()}`,
            raceIndex: season.currentRaceIndex + 1,
            type: 'transfer_request' as const,
            playerId: pid,
            title: `${reqPlayer.name}が移籍を強く要求`,
            body: '無視されたことで態度が硬化。エージェントが正式に移籍要求書を提出しました。これ以上放置すれば士気は底を打ちます。',
            choices: [
              { label: '慰留費を支払う（-500万）', desc: 'モラール+20。今季は残留確定。' },
              { label: '移籍市場に出す', desc: '選手を売却プロセスへ。' },
              { label: '無視する', desc: 'モラール-30。パフォーマンス大幅低下。' },
            ],
            resolved: false }
          season = { ...season, events: [...(season.events ?? []), escalation] }
        }
      } else if (event.type === 'board_warning') {
        if (choiceIndex === 0) {
          gmRep = Math.min(100, gmRep + 5)
        }
      } else if (event.type === 'player_milestone' && pid) {
        if (choiceIndex === 0) {
          players = players.map(p => p.id === pid ? withMorale(p, 15) : p)
        } else {
          players = players.map(p => p.teamId === state.playerTeamId ? withMorale(p, 8) : p)
        }
      } else if (event.type === 'veteran_ambition' && pid) {
        if (choiceIndex === 0) {
          players = players.map(p => p.id === pid ? withFatigue(withMorale(p, 30), 5) : p)
          players = players.map(p => p.teamId === state.playerTeamId && p.id !== pid ? withMorale(p, 8) : p)
        } else if (choiceIndex === 1) {
          players = players.map(p => p.teamId === state.playerTeamId ? withMorale(p, 12) : p)
        }
      } else if (event.type === 'rival_provocation') {
        if (choiceIndex === 0) {
          players = players.map(p => p.teamId === state.playerTeamId ? withMorale(p, 15) : p)
          gmRep = Math.min(100, gmRep + 3)
        } else if (choiceIndex === 1) {
          gmRep = Math.min(100, gmRep + 4)
        }
      } else if (event.type === 'ai_poaching' && pid) {
        if (choiceIndex === 0) {
          players = players.map(p => p.id === pid ? withMorale(p, 20) : p)
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 3000000 } } : t)
        } else if (choiceIndex === 1) {
          players = players.map(p => p.id === pid ? withMorale(p, 5) : p)
        } else {
          players = players.map(p => p.id === pid ? withMorale(p, -20) : p)
        }
      } else if (event.type === 'team_chemistry') {
        if (choiceIndex === 0) {
          players = players.map(p => p.teamId === state.playerTeamId ? withFatigue(withMorale(p, 10), 3) : p)
        } else if (choiceIndex === 1) {
          players = players.map(p => p.teamId === state.playerTeamId ? withFatigue(withMorale(p, 20), 8) : p)
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 2000000 } } : t)
        }
      } else if (event.type === 'player_retirement' && pid) {
        if (choiceIndex === 0) {
          // Stay bonus — pay 20M, player morale up
          players = players.map(p => p.id === pid ? withMorale(p, 20) : p)
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 20000000 } } : t)
        } else {
          // Accept retirement — 即引退はせず「今季限りで引退」フラグを立てる。
          // 実際の引退処理（ロスター除外・レジェンド登録）はendSeasonで行う
          players = players.map(p => p.id === pid ? { ...p, pendingRetirementYear: state.currentSeason.year } : p)
          players = players.map(p => p.teamId === state.playerTeamId ? withMorale(p, 8) : p)
        }
      } else if (event.type === 'budget_boost') {
        if (choiceIndex === 0) {
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + 10000000 } } : t)
        } else if (choiceIndex === 1) {
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + 25000000 } } : t)
          gmRep = Math.max(0, gmRep - 5)
        }
      } else if (event.type === 'budget_crisis') {
        if (choiceIndex === 0) {
          // Emergency sponsor deal: +30M, gmRep -2
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + 30000000 } } : t)
          gmRep = Math.max(0, gmRep - 2)
        } else if (choiceIndex === 1) {
          // Wage cut: main players morale -10, budget +15M
          players = players.map(p => p.teamId === state.playerTeamId ? withMorale(p, -10) : p)
          teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + 15000000 } } : t)
        }
      }

      season = { ...season, events: (season.events ?? []).map(e => e.id === eventId ? { ...e, resolved: true, choiceIndex } : e) }
      return { players, teams, gmRep, currentSeason: season }
    })
  },


  // ── Individual Events ─────────────────────────────────────────────
  simulateIndividualEvent: (eventId, skipPlayerIds) => {
    set(state => {
      const event = state.currentSeason.individualEvents?.find(e => e.id === eventId)
      if (!event || event.results) return state
      const skip = new Set(skipPlayerIds ?? [])
      // 出走は国内リーグ所属選手のみ（海外クラブ選手は対象外）。
      // CPUチームは疲労40以上の選手を自動で休ませる（自チームはプレイヤーの出走/休む選択に従う）
      const domesticTeamIds = domesticTeamIdSet_(state.teams)
      // 指定4記録会だけ海外クラブ選手も出走可（春季5000m/夏季10000m/夏季マラソン/冬季ハーフ）
      const FOREIGN_TT_KEYS = ['tt-5k-1', 'tt-10k-2', 'tt-mara', 'tt-half-2']
      const foreignAllowed = FOREIGN_TT_KEYS.some(k => event.id.startsWith(k))
      const foreignClubIds = foreignAllowed
        ? foreignClubIdSet(state.foreignLeagues)
        : new Set<string>()
      // スカウト候補（大学/高校のドラフト候補）も記録会に参加させ、実力タイムを残す（チーム未所属＝teamId空）。
      const prospects = (state.currentSeason.scoutProspects ?? []).filter(p => (p.status === 'active' || p.status === 'draft_eligible') && !skip.has(p.id) && !state.players.some(pl => pl.id === p.id))
      const activePlayers = [
        ...state.players.filter(p =>
          p.status === 'active' && !skip.has(p.id)
          && (
            (domesticTeamIds.has(p.teamId) && (p.teamId === state.playerTeamId || (p.fatigue ?? 0) < 40))
            || (foreignClubIds.has(p.teamId) && (p.fatigue ?? 0) < 40)
          )),
        ...prospects,
      ]
      const results = activePlayers.map(p => ({
        playerId: p.id,
        teamId: p.teamId,
        timeSec: simulateIndividualTime(p, event.distance, event.weather) }))
      results.sort((a, b) => a.timeSec - b.timeSec)
      const ranked = results.map((r, i) => ({ ...r, rank: i + 1 }))

      // Form/morale boost for top finishers from player team
      const playerTeamTop = ranked.filter(r => r.teamId === state.playerTeamId && r.rank <= 3)
      // 種目別自己ベスト: 実際に走ったタイムでのみ更新（全選手）
      const bestKey: 'd5000' | 'd10000' | 'half' | 'marathon' =
        event.distance === 5000 ? 'd5000' : event.distance === 10000 ? 'd10000' : event.distance === 21097 ? 'half' : 'marathon'
      const timeByPlayer = new Map(ranked.map(r => [r.playerId, r.timeSec]))
      // 疲労: 出走で距離別に増加、休んだ現役選手は回復
      const FAT_GAIN: Record<number, number> = { 5000: 3, 10000: 5, 21097: 8, 42195: 14 }
      const fatGain = FAT_GAIN[event.distance] ?? 5
      const updatedPlayers = state.players.map(p => {
        const ran = timeByPlayer.get(p.id)
        let next = p
        if (ran != null) {
          next = withFatigue(next, fatGain)
          const prev = p.eventBests?.[bestKey]
          if (!prev || ran < prev.timeSec) {
            next = { ...next, eventBests: { ...next.eventBests, [bestKey]: { timeSec: ran, year: state.currentSeason.year } } }
          }
        } else if (p.status === 'active' && p.teamId) {
          next = withFatigue(next, -8)
        }
        if (playerTeamTop.some(r => r.playerId === p.id)) {
          next = { ...withMorale(next, 8), form: Math.min(2, (next.form ?? 0) + 1) }
        }
        return next
      })

      // スカウト候補の自己ベストも更新（未所属なので疲労・士気・報酬は対象外。記録のみ残す）。
      const updatedProspects = (state.currentSeason.scoutProspects ?? []).map(p => {
        const ran = timeByPlayer.get(p.id)
        if (ran == null) return p
        const prev = p.eventBests?.[bestKey]
        if (!prev || ran < prev.timeSec) {
          return { ...p, eventBests: { ...p.eventBests, [bestKey]: { timeSec: ran, year: state.currentSeason.year } } }
        }
        return p
      })

      // カード報酬（自チームのみ）: 総合1位=レジェンダリー、2〜10位=エピック、11〜100位=レア 各1枚
      const CARD_STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
      const rewardCards: TrainingCard[] = []
      for (const r of ranked) {
        if (r.teamId !== state.playerTeamId) continue
        const rarity: CardRarity | null = r.rank === 1 ? 'legendary' : r.rank <= 10 ? 'epic' : r.rank <= 100 ? 'rare' : null
        if (!rarity) continue
        rewardCards.push({
          id: `tt_${event.id}_${r.playerId}`,
          statKey: CARD_STAT_KEYS[Math.floor(Math.random() * CARD_STAT_KEYS.length)],
          rarity,
          value: CARD_UNIT_EXP[rarity] })
      }

      // News for player team finishers
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
      // 世界記録＝全走者の最速、日本記録＝JPN国籍走者の最速。更新時はニュースにも流す
      const allPById = new Map([...state.players, ...(state.currentSeason.scoutProspects ?? [])].map(p => [p.id, p]))
      let newWorldRecords = state.worldRecords
      let newJapanRecords = state.japanRecords
      const recordNewsItems: typeof state.currentSeason.newsFeed = []
      {
        const evYear0 = state.currentSeason.year
        const fastest = ranked[0]
        const fastestP = fastest ? allPById.get(fastest.playerId) : undefined
        // 同タイムは共同保持（タイ記録）。同レース内で並んだ場合も、後日並ばれた場合も全員が保持者になる
        const coOf = (r: { playerId: string }) => ({ playerId: r.playerId, playerName: allPById.get(r.playerId)?.name ?? '', year: evYear0 })
        if (fastest && fastestP) {
          const curWr = state.worldRecords?.[bestKey]
          if (!curWr || fastest.timeSec < curWr.timeSec) {
            const ties = ranked.filter(r => r.playerId !== fastest.playerId && r.timeSec === fastest.timeSec).map(coOf)
            newWorldRecords = { ...newWorldRecords, [bestKey]: { playerId: fastest.playerId, playerName: fastestP.name, timeSec: fastest.timeSec, year: evYear0, ...(ties.length > 0 ? { coHolders: ties } : {}) } }
            recordNewsItems.push({ date: event.date, headline: recordHeadline({ scope: 'world', tie: false, distance: event.distance, playerName: fastestP.name, timeSec: fastest.timeSec }), category: 'race' as const, relatedIds: [fastest.playerId] })
            for (const c of ties) recordNewsItems.push({ date: event.date, headline: recordHeadline({ scope: 'world', tie: false, distance: event.distance, playerName: c.playerName, timeSec: fastest.timeSec, coHolder: true }), category: 'race' as const, relatedIds: [c.playerId] })
          } else if (fastest.timeSec === curWr.timeSec) {
            const holderIds = new Set([curWr.playerId, ...(curWr.coHolders ?? []).map(c => c.playerId)])
            const newCo = ranked.filter(r => r.timeSec === curWr.timeSec && !holderIds.has(r.playerId)).map(coOf)
            if (newCo.length > 0) {
              newWorldRecords = { ...newWorldRecords, [bestKey]: { ...curWr, coHolders: [...(curWr.coHolders ?? []), ...newCo] } }
              for (const c of newCo) recordNewsItems.push({ date: event.date, headline: recordHeadline({ scope: 'world', tie: true, distance: event.distance, playerName: c.playerName, timeSec: curWr.timeSec }), category: 'race' as const, relatedIds: [c.playerId] })
            }
          }
        }
        const isJpn = (r: { playerId: string }) => allPById.get(r.playerId)?.nationality === 'JPN'
        const fastestJpn = ranked.find(isJpn)
        const fastestJpnP = fastestJpn ? allPById.get(fastestJpn.playerId) : undefined
        if (fastestJpn && fastestJpnP) {
          const curJr = state.japanRecords?.[bestKey]
          if (!curJr || fastestJpn.timeSec < curJr.timeSec) {
            const ties = ranked.filter(r => isJpn(r) && r.playerId !== fastestJpn.playerId && r.timeSec === fastestJpn.timeSec).map(coOf)
            newJapanRecords = { ...newJapanRecords, [bestKey]: { playerId: fastestJpn.playerId, playerName: fastestJpnP.name, timeSec: fastestJpn.timeSec, year: evYear0, ...(ties.length > 0 ? { coHolders: ties } : {}) } }
            recordNewsItems.push({ date: event.date, headline: recordHeadline({ scope: 'japan', tie: false, distance: event.distance, playerName: fastestJpnP.name, timeSec: fastestJpn.timeSec }), category: 'race' as const, relatedIds: [fastestJpn.playerId] })
            for (const c of ties) recordNewsItems.push({ date: event.date, headline: recordHeadline({ scope: 'japan', tie: false, distance: event.distance, playerName: c.playerName, timeSec: fastestJpn.timeSec, coHolder: true }), category: 'race' as const, relatedIds: [c.playerId] })
          } else if (fastestJpn.timeSec === curJr.timeSec) {
            const holderIds = new Set([curJr.playerId, ...(curJr.coHolders ?? []).map(c => c.playerId)])
            const newCo = ranked.filter(r => isJpn(r) && r.timeSec === curJr.timeSec && !holderIds.has(r.playerId)).map(coOf)
            if (newCo.length > 0) {
              newJapanRecords = { ...newJapanRecords, [bestKey]: { ...curJr, coHolders: [...(curJr.coHolders ?? []), ...newCo] } }
              for (const c of newCo) recordNewsItems.push({ date: event.date, headline: recordHeadline({ scope: 'japan', tie: true, distance: event.distance, playerName: c.playerName, timeSec: curJr.timeSec }), category: 'race' as const, relatedIds: [c.playerId] })
            }
          }
        }
      }

      // チーム歴代記録：走った選手のタイムを当時所属チームに永続記録（選手ごと最速・距離別）。
      // 名前・国籍も焼き込む（選手データが長期整理で削除されても記録が名前ごと残る）
      const playerById = new Map(state.players.map(p => [p.id, p]))
      const teamEventUpdates = new Map<string, { playerId: string; timeSec: number }[]>()
      for (const r of ranked) {
        const arr = teamEventUpdates.get(r.teamId) ?? []
        arr.push({ playerId: r.playerId, timeSec: r.timeSec })
        teamEventUpdates.set(r.teamId, arr)
      }
      const evYear = state.currentSeason.year
      const updatedTeams = state.teams.map(t => {
        const ups = teamEventUpdates.get(t.id)
        if (!ups || ups.length === 0) return t
        const byPlayer = new Map((t.eventRecords?.[bestKey] ?? []).map(e => [e.playerId, e]))
        for (const u of ups) {
          const prev = byPlayer.get(u.playerId)
          const pl = playerById.get(u.playerId)
          if (!prev || u.timeSec < prev.timeSec) byPlayer.set(u.playerId, { playerId: u.playerId, playerName: pl?.name, nationality: pl?.nationality, timeSec: u.timeSec, year: evYear })
        }
        const merged = [...byPlayer.values()].sort((a, b) => a.timeSec - b.timeSec).slice(0, 30)
        return { ...t, eventRecords: { ...t.eventRecords, [bestKey]: merged } }
      })

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
