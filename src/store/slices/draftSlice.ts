// draft ドメインのアクション（gameStore から分割）。

import type { DraftState, GameStore, SetGame } from '../gameStore'
import { acquisitionDesiredSalary, tradeValueCtxOf } from '../marketOps'
import { tradeBalance } from '../../utils/tradeValue'
import { roundRobin } from '../../utils/roundRobin'
import { hasNoPlayingTime, seeksPlayingTime } from '../../utils/transferDecision'
import { isOwnedBy } from '../../utils/transferEligibility'
import { comparePlayers } from '../../utils/playerSort'
import { buildCareerCounts } from '../../utils/careerStats'
import { POACH_PREMIUM, draftPickValue } from '../../data/economy'
import { SEASON_2027_RACES, generateIndividualEvents } from '../../data/races'
import { ROSTER_MAX, rosterCapOf, teamRosterSize } from '../../data/rosterRules'
import { cpuSpecialtyNeeds, pickCpuFreeAgents } from '../../engine/cpuMarket'
import { draftLotteryOrder, draftOrderTeams, pickExistsAnywhere, standingsPickNumbers } from '../../engine/draftOrder'
import { buildDraftOrder, generateCpuRosters, generateDraftPool, generateForeignLeaguePlayers, generateJpelForeignName, generatePlayerInitialRoster } from '../../engine/playerGenerator'
import { type Player, type TransferRecord } from '../../types'
import { MAJOR_NEWS_OVR, tierBudget, tierOf, tierOfPlayerClub, tierStrength } from '../../utils/clubTier'
import { allForeignClubs, bigClub, domesticTeamIdSet as domesticTeamIdSet_, findClub } from '../../utils/clubs'
import { DIVISION_SIZE, divisionOf, draftRoundOf, joinsDraft, rankOfTeam, seasonDivisionStandings } from '../../utils/league'
import { movePlayer } from '../../utils/movePlayer'
import { clubLabel, cpuSignedHeadline, draftPickSoldHeadline, initialNews, loanHeadline, seekPlayingTimeHeadline, transferHeadline, type NewsItem } from '../../utils/newsItems'
import { calcTransferValue, faMarketSalary, ovr, perfOf, playerConsentToMove } from '../../utils/playerUtils'
import { SPECIALTIES, needsPlayer, wouldMakeLineup } from '../../utils/squadNeeds'
import { teamHistoriesOf } from '../../utils/teamHistory'

type Slice = Pick<GameStore,
  'beginInauguralDraft' | 'playerPick' | 'cpuPick' | 'advanceDraft' | 'setDraftContract' | 'scoutDraftProspect' | 'initScoutPool' | 'generateDevProspects' | 'scoutDevProspect' | 'signDevProspect' | 'ensureFuturePicks' | 'sellDraftPick' | 'beginSeasonDraft'>

export const createDraftSlice = (set: SetGame, get: () => GameStore): Slice => ({

  beginInauguralDraft: () => {
    const state = get()
    const pool = generateDraftPool(state.currentSeason.year, new Set(state.players.map(pl => pl.name)))
    // 初年度は前シーズンが無いので「初期予算の逆順（貧乏なチームから）」で指名順を決める。
    // 2巡目はスネークで逆順（1位から）。
    //
    // ★指名できるのは1部のクラブだけ（utils/league の joinsDraft）。
    //   プレイヤーはどのクラブを選んでも3部から始まるので、初年度は必ず観戦になる。
    //   代わりに選手を1人自分で作って加入させる（createMyPlayer）。
    //   指名されなかった候補はFAになるので、2部・3部はそこから拾う。
    const inauguralRound1 = [...state.teams]
      .filter(t => joinsDraft(t))
      .sort((a, b) => tierBudget(a) - tierBudget(b))
      .map(t => t.id)
    const pickOrder = [...inauguralRound1, ...[...inauguralRound1].reverse()]
    const draftState: DraftState = {
      pool,
      pickOrder,
      currentPick: 0,
      picks: [],
      isComplete: false }

    // Pre-populate AI team rosters and player team initial roster
    const { cpuPlayers } = generateCpuRosters(
      state.teams.filter(t => t.id !== state.playerTeamId),
      state.currentSeason.year,
    )
    // 自チームの初期ロスターも「格」から作る。CPU・海外と同じ tierRankComposition を通るので、
    // 3部のクラブを選べば3部相当の顔ぶれで始まる（前はどのクラブでも同じ固定の強さだった）
    const myTeamForRoster = state.teams.find(t => t.id === state.playerTeamId)
    const { players: prPlayers } = generatePlayerInitialRoster(state.currentSeason.year, tierOf(myTeamForRoster))
    const prPlayersWithTeam = prPlayers.map(p => ({ ...p, teamId: state.playerTeamId }))

    const seededTeams = state.teams.map(t => t.id === state.playerTeamId
      ? {
          ...t,
          // 最弱スタート：予算はそのクラブの格ぶん、施設は0から自分で建てる
          facilities: {},
          finance: { ...t.finance, budget: tierBudget(t) } }
      : t)

    // Generate foreign league players
    const { players: foreignPlayers, updatedLeagues } = generateForeignLeaguePlayers(
      state.foreignLeagues,
      state.currentSeason.year,
    )

    // startSetup で teamId を付与した BASE_PLAYERS を除外し、prPlayersWithTeam に置き換える
    const players = [
      ...state.players.filter(p => p.teamId !== state.playerTeamId),
      ...cpuPlayers, ...pool, ...foreignPlayers, ...prPlayersWithTeam,
    ]
    // 最初の名簿は人数が多いので1人ずつ通さず、所属から一気に組み直す。
    // 決まり（引退とレンタル中は載せない）は movePlayer と同じ1つなのでズレない
    const teams = seededTeams
    set({ draftState, players, teams, foreignLeagues: updatedLeagues })
  },


  playerPick: (playerId) => {
    const state = get()
    if (!state.draftState) return
    const { draftState, playerTeamId } = state
    const { currentPick, pool, pickOrder, picks } = draftState

    // 連打・二重指名ガード：今が自チームの指名番でなければ無視（CPU番の横取り防止）
    if (currentPick >= pickOrder.length) return
    if (pickOrder[currentPick] !== playerTeamId) return

    const player = pool.find(p => p.id === playerId)
    if (!player) return

    const newPicks = [...picks, { pickNumber: currentPick + 1, teamId: playerTeamId, playerId, playerName: player.name }]
    const newPool = pool.filter(p => p.id !== playerId)

    // ドラフトも入手経路が違うだけで「クラブに入る」は同じなので movePlayer を通す
    const moved = movePlayer(state, playerId, playerTeamId, { year: state.currentSeason.year, history: false })
    if (!moved.ok) return
    const teams = moved.teams
    const players = moved.players.map(p => p.id === playerId
      ? { ...p, ...(({ round, pickInRound }) => ({ draftRound: round, draftPick: pickInRound }))(draftRoundOf(currentPick, pickOrder.length)) }
      : p)

    const nextPick = currentPick + 1
    const isComplete = nextPick >= pickOrder.length

    set({
      draftState: { ...draftState, pool: newPool, picks: newPicks, currentPick: nextPick, isComplete },
      teams,
      players })
  },


  cpuPick: () => {
    const state = get()
    if (!state.draftState) return
    const { draftState } = state
    const { currentPick, pool, pickOrder, picks } = draftState
    if (currentPick >= pickOrder.length || pool.length === 0) return

    const teamId = pickOrder[currentPick]
    const team = state.teams.find(t => t.id === teamId)
    if (!team) return

    // 外国人枠は廃止したので国籍による指名制限は無い（誰でも指名できる）
    const scored = pool.map(p => {
      return { p, score: ovr(p) * (0.97 + Math.random() * 0.06) }
    })
    scored.sort((a, b) => b.score - a.score)
    const picked = scored[0].p

    const newPicks = [...picks, { pickNumber: currentPick + 1, teamId, playerId: picked.id, playerName: picked.name }]
    const newPool = pool.filter(p => p.id !== picked.id)
    // 自チームの指名と同じ入口を通す（加入年・名簿の入れ方が指名する側で変わらないように）
    const moved = movePlayer(state, picked.id, teamId, { year: state.currentSeason.year, history: false })
    if (!moved.ok) return
    const teams = moved.teams
    const players = moved.players.map(p => p.id === picked.id
      ? { ...p, ...(({ round, pickInRound }) => ({ draftRound: round, draftPick: pickInRound }))(draftRoundOf(currentPick, pickOrder.length)) }
      : p)
    const nextPick = currentPick + 1
    const isComplete = nextPick >= pickOrder.length

    set({
      draftState: { ...draftState, pool: newPool, picks: newPicks, currentPick: nextPick, isComplete },
      teams,
      players })
  },


  advanceDraft: () => {
    const state = get()
    if (state.draftState?.isComplete) {
      // Undrafted players become free agents.
      // Check both status field AND draftState.pool membership for robustness.
      const remainingPoolIds = new Set((state.draftState.pool ?? []).map(p => p.id))
      const undraftedIds = state.players
        .filter(p => (remainingPoolIds.has(p.id)
          || (p.status === 'draft_eligible' && (p.teamId === '' || p.teamId === '__pool__')))
          && p.teamId !== state.playerTeamId)
        .map(p => p.id)
      // 未指名は無所属(FA)になるだけ。放出と同じ扱いなので同じ入口を通す
      let undraftedApplied: Player[] = state.players
      for (const id of undraftedIds) {
        const m = movePlayer({ players: undraftedApplied, teams: [] }, id, '', { year: state.currentSeason.year })
        if (m.ok) undraftedApplied = m.players
      }
      const undraftedSet = new Set(undraftedIds)
      let updatedPlayers = undraftedApplied.map(p =>
        undraftedSet.has(p.id) && p.status === 'draft_eligible' ? { ...p, status: 'active' as const } : p)

      // ★指名漏れが出たこのタイミングで、CPUのFA補強をもう一度回す。
      //   FA補強は beginSeasonDraft（ドラフトの前）でしか走っていなかったので、
      //   指名されなかった候補は**丸1年FA市場に置き去り**になっていた。
      //   「指名されなかった候補はFAになるので、2部・3部はそこから拾う」（CLAUDE.md）が
      //   一度も起きていなかった。判断は pickCpuFreeAgents 1本（ドラフト前と同じ）
      {
        // ドラフトは終わっているので空けておく枠は無い。数え方は同じ rosterCapOf
        const capForPost = () => rosterCapOf(0)
        const postForeign = allForeignClubs(state.foreignLeagues)
        const postForeignIds = new Set(postForeign.map(c => c.id))
        const postSignings = pickCpuFreeAgents({
          players: updatedPlayers, clubs: [...state.teams, ...postForeign],
          playerTeamId: state.playerTeamId, season: state.currentSeason,
          capFor: (id) => (postForeignIds.has(id) ? ROSTER_MAX : capForPost()),
          phase: 'offseason' })
        for (const sg of postSignings) {
          const m = movePlayer({ players: updatedPlayers, teams: [] }, sg.playerId, sg.clubId, {
            year: state.currentSeason.year, kind: 'free', years: 2, history: false })
          if (m.ok) updatedPlayers = m.players
        }
      }
      // Generate future draft picks for all teams (yr+1, yr+2, rounds 1-2)
      // 指名権番号は前年順位の逆順（最下位＝全体1位）で振る。
      const currentYear = state.currentSeason.year
      const pickNumMap = standingsPickNumbers(state.teams, teamHistoriesOf(state.pastSeasons))
      const teamsWithPicks = state.teams.map((t) => {
        const pickNum = pickNumMap.get(t.id) ?? 1
        const newPicks: typeof t.draftPicks = []
        for (const yr of [currentYear + 1, currentYear + 2]) {
          for (const round of [1, 2]) {
            if (!pickExistsAnywhere(state.teams, t.id, yr, round)) {
              newPicks.push({ year: yr, round, pickNumber: pickNum, originallyOwnedBy: t.id })
            }
          }
        }
        return newPicks.length > 0 ? { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] } : t
      })
      // ドラフト/オフの流れから来た時だけプレシーズンに戻す。
      // すでに開幕後なら巻き戻さない（保険）。
      const nextPhase = (state.currentSeason.phase === 'regular' || state.currentSeason.phase === 'postseason')
        ? state.currentSeason.phase : 'preseason'
      set({
        isInitialized: true,
        players: updatedPlayers,
        teams: teamsWithPicks,
        draftState: { ...state.draftState, contractsDone: true },
        currentSeason: {
          ...state.currentSeason, phase: nextPhase,
          races: (state.currentSeason.races ?? []).length > 0 ? state.currentSeason.races : SEASON_2027_RACES,
          individualEvents: (state.currentSeason.individualEvents ?? []).length > 0 ? state.currentSeason.individualEvents : generateIndividualEvents(state.currentSeason.year),
          newsFeed: (state.currentSeason.newsFeed ?? []).length > 0 ? state.currentSeason.newsFeed : initialNews() } })
    }
  },


  generateDevProspects: () => {
    set(state => {
      if ((state.currentSeason.devProspects ?? []).length > 0) return state
      const NAMES = ['村上 蒼', '橋本 颯', '田中 悠馬', '小林 煌', '中村 海斗', '伊藤 涼', '山田 蓮', '佐藤 翔', '加藤 健', '鈴木 碧', '松本 楓', '渡辺 律', '井上 光', '木村 颯太', '高橋 凌', '石川 仁', '林 優斗', '近藤 葵', '前田 空', '岡田 風']
      const CITIES = ['東京', '神奈川', '大阪', '愛知', '福岡', '北海道', '宮城', '広島', '静岡', '千葉']
      const SPECS = SPECIALTIES
      const usedForeignNames = new Set<string>()
      const prospects: import('../../types').DevProspect[] = Array.from({ length: 12 }, (_, i) => {
        const potential = 50 + Math.floor(Math.random() * 45)
        const base = 40 + Math.floor(Math.random() * 30)
        // 15%は外国人。国籍だけ「外国」ではなく、実際の国籍・出身国・現地名を持たせる
        const foreign = Math.random() < 0.15 ? generateJpelForeignName(usedForeignNames) : null
        return {
          id: `dev_${state.currentSeason.year}_${i}`,
          name: foreign ? foreign.name : NAMES[i % NAMES.length],
          age: 18 + Math.floor(Math.random() * 4),
          origin: foreign ? foreign.origin : CITIES[Math.floor(Math.random() * CITIES.length)],
          nationality: foreign ? foreign.nat : 'JPN',
          specialty: SPECS[Math.floor(Math.random() * SPECS.length)],
          potential,
          trueRatings: {
            speed: base + Math.floor(Math.random() * 20),
            stamina: base + Math.floor(Math.random() * 20),
            mountainUp: base + Math.floor(Math.random() * 20),
            mountainDown: base + Math.floor(Math.random() * 20),
            pacing: base + Math.floor(Math.random() * 20),
            mental: base + Math.floor(Math.random() * 20),
            recovery: base + Math.floor(Math.random() * 20) },
          signingFee: (20 + Math.floor(Math.random() * 60)) * 1000000,
          scouted: false }
      })
      return { currentSeason: { ...state.currentSeason, devProspects: prospects } }
    })
  },


  scoutDevProspect: (prospectId) => {
    set(state => {
      const pts = state.currentSeason.scoutPoints ?? 0
      if (pts < 1) return state
      return {
        currentSeason: {
          ...state.currentSeason,
          scoutPoints: pts - 1,
          devProspects: (state.currentSeason.devProspects ?? []).map(p =>
            p.id === prospectId ? { ...p, scouted: true } : p
          ) } }
    })
  },


  signDevProspect: (prospectId) => {
    set(state => {
      const team = state.teams.find(t => t.id === state.playerTeamId)
      if (!team) return state
      const prospect = (state.currentSeason.devProspects ?? []).find(p => p.id === prospectId)
      if (!prospect) return state
      if (team.finance.budget < prospect.signingFee) return state
      // 2軍の区分は廃止済み。人数は総在籍(ROSTER_MAX)で見る
      if (teamRosterSize(state.players, team.id) >= ROSTER_MAX) return state


      const newPlayer: import('../../types').Player = {
        id: prospect.id,
        name: prospect.name,
        nameKana: '',
        age: prospect.age,
        yearsPro: 0,
        draftYear: state.currentSeason.year,
        draftRound: null,
        draftPick: null,
        ratings: { ...prospect.trueRatings },
        specialty: prospect.specialty,
        potential: prospect.potential,
        growthCurve: 'normal',
        // 所属はこのあと movePlayer で入れる（名簿と支度金の後始末をまとめて任せるため）
        teamId: '',
        joinedYear: state.currentSeason.year,
        contract: {
          yearsLeft: 2,
          annualSalary: 15000000,
          faEligibleYear: state.currentSeason.year + 2,
          contractType: 'development' },
        nationality: prospect.nationality,
        origin: prospect.origin,

        status: 'active',
        fatigue: 0,
        morale: 70,
        form: 0,
        career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 } }

      // 名簿入りと支度金の引き落としは movePlayer に任せる（獲得・移籍と同じ後始末）。
      // 移籍ではないので履歴には残さない
      const moved = movePlayer(
        { players: [...state.players, newPlayer], teams: state.teams },
        newPlayer.id, state.playerTeamId,
        { year: state.currentSeason.year, fee: prospect.signingFee, history: false },
      )
      if (!moved.ok) return state
      return {
        players: moved.players,
        teams: moved.teams,
        currentSeason: {
          ...state.currentSeason,
          devProspects: (state.currentSeason.devProspects ?? []).filter(p => p.id !== prospectId) } }
    })
  },


  scoutDraftProspect: (prospectId) => {
    set(state => {
      if (state.currentSeason.scoutPoints <= 0) return state
      const already = (state.currentSeason.scoutedProspects ?? []).some(s => s.prospectId === prospectId)
      if (already) return state
      return {
        currentSeason: {
          ...state.currentSeason,
          scoutPoints: state.currentSeason.scoutPoints - 1,
          scoutedProspects: [
            ...(state.currentSeason.scoutedProspects ?? []),
            { prospectId, year: state.currentSeason.year, raceIndex: state.currentSeason.currentRaceIndex },
          ] } }
    })
  },


  initScoutPool: () => {
    set(state => {
      const cur = state.currentSeason.scoutProspects ?? []
      // 加入済み（players に居る）候補を除去。残りがあればそれを維持し、空になったら翌年のドラフト候補を新規生成。
      // （既存セーブで候補が加入者で埋まり、翌年候補が出てこないのを解消）
      const remaining = cur.filter(p => !state.players.some(pl => pl.id === p.id))
      if (remaining.length > 0) {
        return remaining.length === cur.length
          ? state
          : { currentSeason: { ...state.currentSeason, scoutProspects: remaining } }
      }
      const pool = generateDraftPool(state.currentSeason.year + 1, new Set(state.players.map(pl => pl.name)))
      return { currentSeason: { ...state.currentSeason, scoutProspects: pool } }
    })
  },


  setDraftContract: (playerId, salary, years, contractType, teamRole) => {
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      if (!player || player.teamId !== state.playerTeamId) return state
      return {
        players: state.players.map(p => p.id === playerId ? {
          ...p,
          teamRole: teamRole ?? p.teamRole,
          // rookieDeal: ドラフト初回契約は相場の半分まで下げられるが、次の更新では相場基準の要求になる
          contract: { ...p.contract, annualSalary: salary, yearsLeft: years, contractType, rookieDeal: true } } : p),
        // 名簿はここで並べ替えない。所属から組み直す決まりに任せる（指名の時点で入っている）
      }
    })
  },


  sellDraftPick: (pickKey, targetTeamId, price) => {
    const state = get()
    const myTeam = state.teams.find(t => t.id === state.playerTeamId)
    const buyTeam = state.teams.find(t => t.id === targetTeamId)
    if (!myTeam || !buyTeam) return false
    const pick = myTeam.draftPicks.find(p => `${p.year}-R${p.round}-${p.pickNumber}` === pickKey)
    if (!pick) return false
    const fairVal = draftPickValue(pick.round, pick.pickNumber)
    if (price > fairVal * 1.3) return false
    if (buyTeam.finance.budget < price) return false  // 買い手が払えない額では成立しない
    const date = state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`
    set(s => ({
      teams: s.teams.map(t => {
        if (t.id === s.playerTeamId) return {
          ...t,
          finance: { ...t.finance, budget: t.finance.budget + price },
          draftPicks: t.draftPicks.filter(p => `${p.year}-R${p.round}-${p.pickNumber}` !== pickKey) }
        if (t.id === targetTeamId) return {
          ...t,
          finance: { ...t.finance, budget: t.finance.budget - price },
          draftPicks: [...t.draftPicks, pick] }
        return t
      }),
      currentSeason: {
        ...s.currentSeason,
        transferIncome: (s.currentSeason.transferIncome ?? 0) + price,
        newsFeed: [{
          date,
          headline: draftPickSoldHeadline({ fromShort: myTeam.shortName, toShort: buyTeam.shortName, year: pick.year, round: pick.round, price }),
          category: 'trade' as const,
          relatedIds: [] }, ...s.currentSeason.newsFeed].slice(0, 30) } }))
    return true
  },


  ensureFuturePicks: () => {
    const state = get()
    const yr = state.currentSeason.year
    const anyMissingPicks = state.teams.some(t =>
      !(t.draftPicks ?? []).some(pk => pk.year > yr)
    )
    if (!anyMissingPicks) return
    // 指名権番号は前年順位の逆順（最下位＝全体1位）で振る。
    const pickNumMap = standingsPickNumbers(state.teams, teamHistoriesOf(state.pastSeasons))
    const updatedTeams = state.teams.map((t) => {
      const newPicks: typeof t.draftPicks = []
      for (const year of [yr + 1, yr + 2]) {
        for (const round of [1, 2]) {
          if (!pickExistsAnywhere(state.teams, t.id, year, round)) {
            newPicks.push({ year, round, pickNumber: pickNumMap.get(t.id) ?? 1, originallyOwnedBy: t.id })
          }
        }
      }
      return newPicks.length > 0 ? { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] } : t
    })
    set({ teams: updatedTeams })
  },

  beginSeasonDraft: () => {
    const state = get()
    // 二度押し/再入ガード：ドラフト進行中に再度呼ばれてもプール選手をID二重登録しない。
    if (state.draftState && !state.draftState.isComplete) return
    // スカウト画面で見せた候補（scoutProspects）をそのままドラフトプールにする。
    // 空のとき（旧セーブ等）だけ従来通り新規生成にフォールバック。
    const scouted = state.currentSeason.scoutProspects ?? []
    const pool = scouted.length > 0 ? scouted : generateDraftPool(state.currentSeason.year, new Set(state.players.map(pl => pl.name)))
    const yr = state.currentSeason.year

    // ドラフト順は「当年分の指名権の所有」で決める：指名スロットの並びは各指名権の
    // 【元保有チームの抽選順】で決まり、現在の保有チームがそこで指名する。
    // 2年目以降は前年下位5チームの加重抽選で1巡目の順を決定。2巡目はスネーク（逆順＝1位から）。
    const lotteryPos = draftLotteryOrder(state.teams, teamHistoriesOf(state.pastSeasons)) // teamId → 全体指名順位(1=全体1位)
    const teamCount = state.teams.length
    const ownedYearPicks = state.teams
      .flatMap(t => (t.draftPicks ?? []).filter(pk => pk.year === yr).map(pk => {
        const basePos = lotteryPos.get(pk.originallyOwnedBy ?? t.id) ?? pk.pickNumber
        // 2巡目はスネーク：1巡目の逆順にする（最後に指名したチームが2巡目の先頭）
        const orderKey = pk.round === 2 ? teamCount + 1 - basePos : basePos
        return { round: pk.round, orderKey, ownerId: t.id }
      }))
      .sort((a, b) => a.round - b.round || a.orderKey - b.orderKey)
    // 指名するのは1部のクラブだけ（joinsDraft）。指名権を持っていても、
    // その年に1部にいなければ使えない
    const draftTeams = state.teams.filter(t => joinsDraft(t))
    const draftTeamIds = new Set(draftTeams.map(t => t.id))
    const yearPicksInTop = ownedYearPicks.filter(pk => draftTeamIds.has(pk.ownerId))
    const pickOrder = yearPicksInTop.length >= draftTeams.length
      ? yearPicksInTop.map(pk => pk.ownerId)
      : buildDraftOrder(draftOrderTeams(draftTeams, state.pastSeasons), state.currentSeason.year, state.playerTeamId)

    // Ensure all teams have future draft picks (backfill for existing saves)
    // 消化した当年分の指名権はここで名簿から外す（順は上のpickOrderに確定済み）
    // 指名権番号は前年順位の逆順（最下位＝全体1位）。既存の将来指名権も"元保有チームの順位"で振り直し、
    // 初回に配列順で焼き込まれた古い番号を都度上書きして正す（表示と実際の指名順を一致させる）。
    const pickNumMap = standingsPickNumbers(state.teams, teamHistoriesOf(state.pastSeasons))
    const teamsWithPicks = state.teams.map((t) => {
      const newPicks: typeof t.draftPicks = []
      for (const year of [yr + 1, yr + 2]) {
        for (const round of [1, 2]) {
          if (!pickExistsAnywhere(state.teams, t.id, year, round)) {
            newPicks.push({ year, round, pickNumber: pickNumMap.get(t.id) ?? 1, originallyOwnedBy: t.id })
          }
        }
      }
      const keptFuture = (t.draftPicks ?? []).filter(pk => pk.year > yr)
        .map(pk => ({ ...pk, pickNumber: pickNumMap.get(pk.originallyOwnedBy ?? t.id) ?? pk.pickNumber }))
      return { ...t, draftPicks: [...keptFuture, ...newPicks] }
    })

    // 今年のドラフトで各チームに入る人数（保有指名権数）。総在籍30の上限は
    // ドラフト加入分を先に差し引いておき、ドラフト後に30を超えないようにする（32人問題の修正）
    const draftPickCounts = new Map<string, number>()
    for (const tid of pickOrder) draftPickCounts.set(tid, (draftPickCounts.get(tid) ?? 0) + 1)
    // 上限の数え方は rosterRules の rosterCapOf 1本（未消化の指名権ぶんを空けておく）
    const rosterCapFor = (teamId: string) => rosterCapOf(draftPickCounts.get(teamId) ?? 0)

    // CPU teams release declining/surplus players
    // 対象は国内リーグのCPUチームのみ（選手のteamIdから拾うと海外クラブまで混ざり、
    // ロスター概念の無い海外側との取引で国内名簿が壊れる）
    const domesticTeamIdSet = domesticTeamIdSet_(state.teams)
    const cpuReleasedIds = new Set<string>()
    const releasedWorld = (() => {
      const releaseSet = new Set<string>()
      // 他チームから借りている選手は解雇できない（保有権が無い）。以前は対象に含まれていて、
      // 強制解雇でよそのクラブの選手をFAにしてしまっていた。返却はレンタル期間の処理に任せる。
      const isLoanedIn = (x: Player) => !!x.loan && x.loan.ownerTeamId !== x.teamId
      const cpuTeamIds = [...new Set(
        state.players
          .filter(p => p.teamId !== state.playerTeamId && p.teamId !== '' && p.teamId !== '__pool__' && domesticTeamIdSet.has(p.teamId))
          .map(p => p.teamId)
      )]
      for (const teamId of cpuTeamIds) {
        const roster = state.players.filter(x => x.teamId === teamId && x.status === 'active' && !isLoanedIn(x))
        const avgOvr = roster.length > 0 ? roster.reduce((s, x) => s + ovr(x), 0) / roster.length : 60
        // Release aging veterans whose OVR dropped below team average and contract is expiring
        for (const p of roster) {
          if (p.age > 30 && ovr(p) < avgOvr - 6 && p.contract.yearsLeft <= 1) releaseSet.add(p.id)
        }
        // Release surplus above 23（1軍登録上限）: penalise old players in sort
        const remaining = roster.filter(p => !releaseSet.has(p.id))
        if (remaining.length > 23) {
          const sorted = [...remaining].sort((a, b) => {
            const scoreA = ovr(a) - (a.age > 30 ? 8 : 0) - (a.age > 33 ? 8 : 0)
            const scoreB = ovr(b) - (b.age > 30 ? 8 : 0) - (b.age > 33 ? 8 : 0)
            return scoreA - scoreB
          })
          sorted.slice(0, remaining.length - 23).forEach(p => releaseSet.add(p.id))
        }
        // 総在籍（1軍+2軍・引退除く）が上限（30−ドラフト加入予定数）を超えるチームは
        // OVR下位から解雇して収める。既に膨らんだセーブもここを通れば毎年是正される
        const cpuCap = rosterCapFor(teamId)
        const totalRoster = state.players.filter(x => x.teamId === teamId && x.status === 'active' && !releaseSet.has(x.id) && !isLoanedIn(x))
        if (totalRoster.length > cpuCap) {
          const sortedAll = [...totalRoster].sort((a, b) => {
            const scoreA = ovr(a) - (a.age > 30 ? 8 : 0) - (a.age > 33 ? 8 : 0)
            const scoreB = ovr(b) - (b.age > 30 ? 8 : 0) - (b.age > 33 ? 8 : 0)
            return scoreA - scoreB
          })
          sortedAll.slice(0, totalRoster.length - cpuCap).forEach(p => releaseSet.add(p.id))
        }
      }
      // 自チーム：シーズン中に整理しなかった超過分を、OVR下位から強制的にFAへ（警告で猶予を与えた上での最終処理）。
      // ドラフト加入分も差し引いておかないと、指名後に30を超えてしまう
      const myCap = rosterCapFor(state.playerTeamId)
      const myRoster = state.players.filter(x => x.teamId === state.playerTeamId && x.status === 'active' && !releaseSet.has(x.id) && !isLoanedIn(x))
      if (myRoster.length > myCap) {
        [...myRoster].sort((a, b) => ovr(a) - ovr(b)).slice(0, myRoster.length - myCap).forEach(p => releaseSet.add(p.id))
      }
      releaseSet.forEach(id => cpuReleasedIds.add(id))
      // 解雇も movePlayer に通す（所属を外す・名簿から消す・移籍リストの札をはがす）
      let players: Player[] = state.players
      let teams = teamsWithPicks
      for (const id of releaseSet) {
        const m = movePlayer({ players, teams }, id, '', { year: yr })
        if (!m.ok) continue
        players = m.players
        teams = m.teams
      }
      return { players, teams }
    })()
    const playersAfterCpuRelease = releasedWorld.players
    const teamsAfterCpuRelease = releasedWorld.teams

    // CPU間移籍（メイン市場）：予算の多いチームから優先で他チームの余剰選手を引き抜く
    // オフシーズンの移籍成立記録（チーム詳細の移籍ページ用）。年は新シーズン（現 currentSeason.year）
    const offseasonTxRecords: TransferRecord[] = []
    // オフの市場の動きをニュースに出す。「1部の控えが下位クラブへ」「若手がレンタルで
    // 走りに出る」が見えないと、市場が効いているかを確かめられない
    const offseasonTxNews: NewsItem[] = []
    const cpuTransferIds = new Set<string>()
    let playersAfterCpuTransfer = playersAfterCpuRelease
    let teamsAfterCpuTransfer = teamsAfterCpuRelease
    {
      // 前年順位（引き抜き時の本人同意＝移籍先の魅力判定に使う）
      const lastSeasonForTx = state.pastSeasons[state.pastSeasons.length - 1]
      // そのクラブが前年に走った部の中での順位（順位表は部ごとに分かれている）
      const rankOfTx = (teamId: string) => {
        const r = lastSeasonForTx ? rankOfTeam(seasonDivisionStandings(lastSeasonForTx, teamId), teamId) : 0
        return r > 0 ? r : Math.ceil(DIVISION_SIZE[divisionOf(state.teams.find(t => t.id === teamId))] / 2)
      }

      // 実際の予算残高（finance.budget）から移籍金を払う。売った側は実際に受け取る（自チームと同じ金の動き）。
      // 順番は「前年順位が下のチームから」。同順は残高の多い方から
      const cpuTeamsForTransfer = teamsAfterCpuRelease
        .filter(t => t.id !== state.playerTeamId)
        .map(t => ({ team: t, tier: tierOf(t), budget: Math.max(0, t.finance.budget) }))
        .sort((a, b) => (rankOfTx(b.team.id) - rankOfTx(a.team.id)) || (b.budget - a.budget))

      const transferPurchases: Record<string, number> = {}
      const sellCounts: Record<string, number> = {}   // 1チームが1オフに失う人数の上限（薄くしすぎない）
      const txNeeds = new Map(cpuTeamsForTransfer.map(x => [x.team.id, new Set(cpuSpecialtyNeeds(x.team.id, playersAfterCpuTransfer))]))

      // 「出場機会を求めて出ていく人」を決めるための出走数。序列だけで決めると
      // 30人ロスターの下半分がまるごと市場に出るので、実際に走れたかを見る（utils/transferDecision）。
      // 数はレース結果から数え直す1本（utils/careerStats）。今季と前季を別々に取る
      const txThisSeason = buildCareerCounts([state.currentSeason])
      const txPrevSeason = buildCareerCounts([state.pastSeasons[state.pastSeasons.length - 1]])
      const txThisRaces = state.currentSeason.races.filter(r => r.results).length
      const txPrevRaces = (state.pastSeasons[state.pastSeasons.length - 1]?.races ?? []).filter(r => r.results).length

      // 1周につき1人だけ買う。以前は1チームが上限まで買い切ってから次に回していたので、
      // 市場の良い選手が予算の多い上位チームに固まっていた（utils/roundRobin.ts）
      const buyOnePlayer = ({ team: buyTeam, tier: buyTier }: typeof cpuTeamsForTransfer[number]): boolean => {
        // 1オフに獲れる人数は格から（格1が4人、格20が2人）。強さの物差しは格1本
        const buyCap = 2 + Math.round(2 * tierStrength(buyTier))
        const needs = txNeeds.get(buyTeam.id)!
        if ((transferPurchases[buyTeam.id] ?? 0) >= buyCap) return false
        const remainBudget = Math.max(0, teamsAfterCpuTransfer.find(t => t.id === buyTeam.id)?.finance.budget ?? 0)
        const buyRoster = playersAfterCpuTransfer.filter(p => p.teamId === buyTeam.id && p.status === 'active')
        const buyTotal = playersAfterCpuTransfer.filter(p => p.teamId === buyTeam.id && p.status === 'active').length
        if (buyRoster.length >= 25 || buyTotal >= rosterCapFor(buyTeam.id)) return false

        const otherCpuIds = cpuTeamsForTransfer.map(x => x.team.id).filter(id => id !== buyTeam.id)
        const candidates = otherCpuIds.flatMap(sellTeamId => {
          if ((sellCounts[sellTeamId] ?? 0) >= 2) return []   // 1チームから奪うのは最大2人
          const sellRoster = playersAfterCpuTransfer
            .filter(p => p.teamId === sellTeamId && p.status === 'active')
            .sort(comparePlayers('ovr'))
          if (sellRoster.length <= 16) return []   // 薄いチームからは引き抜かない（下限保護）
          // 売り手の絶対的エース(1番手)だけ保護。それ以外は主力でも引き抜き対象にする。
          return sellRoster.slice(1)
            // isOwnedBy でレンタル中の選手を外す。ここが抜けていたため、貸し出した選手が
            // オフシーズンに貸出先の名簿として売られ、保有元に何も残らず消えていた
            .filter(p => isOwnedBy(p, sellTeamId) && !cpuTransferIds.has(p.id) && p.joinedYear !== state.currentSeason.year)
            // 余剰＝弱い or 人数過多 に加えて、**出場機会を求めて出ていく選手**も対象にする。
            // 判定は utils/transferDecision の seeksPlayingTime 1本（海外の序列陥落と同じ入口）。
            // 序列だけを見ていたころは30人ロスターの下半分が毎年まるごと市場に出ていたので、
            // 「今季どれだけ走れたか」「去年は走れていたか」「待っていられる年齢か」まで見る
            .map(p => {
              const rank = sellRoster.findIndex(x => x.id === p.id) + 1
              const benched = seeksPlayingTime({
                squadRank: rank, age: p.age,
                races: txThisSeason.get(p.id)?.totalRaces ?? 0, teamRaces: txThisRaces,
                prevRaces: txPrevSeason.get(p.id)?.totalRaces, prevTeamRaces: txPrevRaces })
              // 「余剰か（通常額）／主力の引き抜きか（割増＋本人同意）」も既にある1本で言う。
              // 以前はここに売り手の平均OVRから作った下限表（74/67/58）があった。
              // 出番が無い序列（走れる人数の2倍より下）なら、それがそのまま余剰という意味
              const surplus = hasNoPlayingTime(rank) || sellRoster.length > 21 || benched
              return { p, rank, benched, sellTeamId, surplus }
            })
        })
          // ★「必要だから動く」の関門。ここが抜けていて、needs は下の並び替えの
          //   優先度にしか使われていなかった＝**どのクラブでも誰でも買えた**。
          //   判定は squadNeeds の needsPlayer 1本（移籍金を払う移籍なので穴のときだけ）
          .filter(({ p }) => needsPlayer(buyRoster, p))
          // 欲しいタイプ・OVRの高い選手を優先
          .sort((a, b) => (Number(needs.has(b.p.specialty)) - Number(needs.has(a.p.specialty))) || (ovr(b.p) - ovr(a.p)))

        let bought = false
        for (const { p: target, surplus, benched, rank: sellRank, sellTeamId } of candidates) {
          // 余剰は通常額、主力の引き抜きは割増移籍金＋昇給要求＋本人同意
          const fee = surplus ? calcTransferValue(target) : Math.round(calcTransferValue(target) * POACH_PREMIUM)
          const tgtPerf = perfOf(state.currentSeason, target.id)
          const newSalary = surplus ? faMarketSalary(target, tgtPerf) : acquisitionDesiredSalary(target, 'scout', 0.5, 0, tgtPerf)
          if (remainBudget < fee + newSalary) continue
          // 引き抜きは本人が移籍先の魅力で納得するか判定（クラブは割増で合意済み＝clubBlessed）
          if (!surplus && !playerConsentToMove(target, get().destinationOf(buyTeam.id, target), tierOfPlayerClub(target.teamId, teamsAfterCpuTransfer), 0.5, 0, 0, true).ok) continue
          const txYear = state.currentSeason.year
          // 所属・名簿・移籍金・移籍履歴は movePlayer にまとめて任せる（自チームの獲得と同じ後始末）
          const moved = movePlayer({ players: playersAfterCpuTransfer, teams: teamsAfterCpuTransfer }, target.id, buyTeam.id, {
            year: txYear,
            date: `${txYear}-02-01`,
            fee,
            years: 2,
            contract: { annualSalary: newSalary, yearsLeft: 2 } })
          if (!moved.ok) continue
          cpuTransferIds.add(target.id)
          transferPurchases[buyTeam.id] = (transferPurchases[buyTeam.id] ?? 0) + 1
          sellCounts[moved.from] = (sellCounts[moved.from] ?? 0) + 1
          playersAfterCpuTransfer = moved.players.map(p =>
            p.id !== target.id ? p : { ...p, contract: { ...p.contract, faEligibleYear: txYear + 2 } })
          teamsAfterCpuTransfer = moved.teams
          if (moved.record) offseasonTxRecords.push(moved.record)
          // 序列から落ちて出番が無くなった選手は、その事情がわかる見出しにする。
          // 「何番手だったか」を出すと、市場が効いているかがニュースだけで追える
          offseasonTxNews.push({
            date: `${state.currentSeason.year}-11-10`,
            headline: benched
              ? seekPlayingTimeHeadline({
                  playerName: target.name, age: target.age, squadRank: sellRank,
                  fromLabel: clubLabel(sellTeamId, teamsAfterCpuTransfer),
                  toLabel: clubLabel(buyTeam.id, teamsAfterCpuTransfer) })
              : transferHeadline({
                  playerName: target.name, playerOvr: ovr(target), fee,
                  fromLabel: clubLabel(sellTeamId, teamsAfterCpuTransfer),
                  toLabel: clubLabel(buyTeam.id, teamsAfterCpuTransfer) }),
            category: 'trade', relatedIds: [target.id],
            major: ovr(target) >= MAJOR_NEWS_OVR || bigClub(state, sellTeamId) || bigClub(state, buyTeam.id) })
          bought = true
          break
        }
        return bought
      }
      roundRobin(cpuTeamsForTransfer, buyOnePlayer)
    }

    // ⑤ CPU間トレード（予算不足でも価値が近い選手同士を交換）。
    // 同じオフに移籍済みの選手（cpuTransferIds）は対象外＝移籍→トレードの連鎖を防ぐ
    {
      const tradedIds = cpuTransferIds
      const tradeCount: Record<string, number> = {}
      const cpuIdsForTrade = [...new Set(
        playersAfterCpuTransfer
          .filter(p => p.teamId && p.teamId !== '' && p.teamId !== '__pool__' && p.teamId !== state.playerTeamId && domesticTeamIdSet.has(p.teamId))
          .map(p => p.teamId)
      )]
      for (const buyerId of cpuIdsForTrade) {
        if ((tradeCount[buyerId] ?? 0) >= 1) continue
        const buyRoster = playersAfterCpuTransfer.filter(p => p.teamId === buyerId && p.status === 'active')
        if (buyRoster.length >= 23) continue
        // 出すのは「自分のところで出番が無い選手」（transferDecision の hasNoPlayingTime 1本）。
        // 以前はここに平均OVRから作った下限表（74/67/60）があった＝格とは別の物差し
        const buyerRanked = [...buyRoster].sort(comparePlayers('ovr'))
        const buyerSurplus = buyerRanked
          // レンタルで借りている選手は保有権が無いのでトレードに出せない
          .filter((p, i) => isOwnedBy(p, buyerId) && !tradedIds.has(p.id) && p.joinedYear !== state.currentSeason.year && hasNoPlayingTime(i + 1))
          .sort((a, b) => calcTransferValue(b) - calcTransferValue(a))
        if (buyerSurplus.length === 0) continue
        const offered = buyerSurplus[0]
        for (const sellerId of cpuIdsForTrade) {
          if (sellerId === buyerId || (tradeCount[sellerId] ?? 0) >= 1) continue
          const sellRoster = playersAfterCpuTransfer
            .filter(p => p.teamId === sellerId && p.status === 'active')
            .sort(comparePlayers('ovr'))
          // もらう側で走れて、出す側では走れない選手＝両方が得をする交換（squadNeeds 1本）。
          // 釣り合いは utils/tradeValue の tradeBalance 1本（以前はここだけ「×1.3」と直書きで、
          // 自チームのトレードが通る tradeValue.ts とは別の判定になっていた）
          const target = sellRoster.slice(3).find((p, i) =>
            isOwnedBy(p, sellerId) &&
            !tradedIds.has(p.id) &&
            p.joinedYear !== state.currentSeason.year &&
            wouldMakeLineup(buyRoster, p) && hasNoPlayingTime(i + 4) &&
            tradeBalance({ outPlayers: [offered], inPlayers: [p] }, tradeValueCtxOf(state)).ok
          )
          // 売り手が受け取る側でも使えること（needsPlayer / wouldMakeLineup）
          if (!target || !(needsPlayer(sellRoster, offered) || wouldMakeLineup(sellRoster, offered))) continue
          tradedIds.add(offered.id); tradedIds.add(target.id)
          tradeCount[buyerId] = (tradeCount[buyerId] ?? 0) + 1
          tradeCount[sellerId] = (tradeCount[sellerId] ?? 0) + 1
          // 交換する2人とも movePlayer に通す（自チームのトレードと同じ後始末）
          for (const [pid, toId] of [[offered.id, sellerId], [target.id, buyerId]] as const) {
            const m = movePlayer({ players: playersAfterCpuTransfer, teams: teamsAfterCpuTransfer }, pid, toId, {
              year: state.currentSeason.year,
              date: `${state.currentSeason.year}-02-01`,
              kind: 'trade' })
            if (!m.ok) continue
            playersAfterCpuTransfer = m.players
            teamsAfterCpuTransfer = m.teams
            if (m.record) offseasonTxRecords.push(m.record)
          }
          break
        }
      }
    }

    // ④ CPU間レンタル（ロスター過多チームから不足チームへ1年貸し出し）。
    // 同じオフに移籍・トレード済みの選手は貸し出さない（1オフ1移動）
    {
      const loanedIds = cpuTransferIds
      const loanYear = state.currentSeason.year + 1
      const cpuIdsForLoan = [...new Set(
        playersAfterCpuTransfer
          .filter(p => p.teamId && p.teamId !== '' && p.teamId !== '__pool__' && p.teamId !== state.playerTeamId && domesticTeamIdSet.has(p.teamId))
          .map(p => p.teamId)
      )]
      const mainCount = (teamId: string) =>
        playersAfterCpuTransfer.filter(p => p.teamId === teamId && p.status === 'active' && !p.loan).length
      const givenLoan: Record<string, number> = {}
      const receivedLoan: Record<string, number> = {}
      // ★動かすのは借りたい側。**出番の無い若手を、走らせてくれるクラブが借りに行く**。
      //   以前は「人数が多いクラブが一番弱い選手を、人数の少ないクラブへ渡す」だけで、
      //   頭数合わせにしかなっていなかった（借りた側は走らせる気のない選手を受け取る）。
      //   出番の判定は hasNoPlayingTime、必要かどうかは needsPlayer。どちらも既存の1本。
      const rosterOf = (teamId: string) => playersAfterCpuTransfer
        .filter(p => p.teamId === teamId && p.status === 'active' && !p.loan)
        .sort(comparePlayers('ovr'))
      for (const receiver of cpuIdsForLoan) {
        if ((receivedLoan[receiver] ?? 0) >= 1 || mainCount(receiver) >= ROSTER_MAX) continue
        const myRoster = rosterOf(receiver)
        let candidate: Player | undefined
        let senderId = ''
        for (const sid of cpuIdsForLoan) {
          if (sid === receiver || (givenLoan[sid] ?? 0) >= 1) continue
          const sRoster = rosterOf(sid)
          const found = sRoster.find((p, i) =>
            hasNoPlayingTime(i + 1) && p.age <= 24
            && !loanedIds.has(p.id) && p.joinedYear !== state.currentSeason.year
            && needsPlayer(myRoster, p))
          if (found) { candidate = found; senderId = sid; break }
        }
        if (!candidate || !senderId) continue
        loanedIds.add(candidate.id)
        givenLoan[senderId] = (givenLoan[senderId] ?? 0) + 1
        receivedLoan[receiver] = (receivedLoan[receiver] ?? 0) + 1
        // レンタルも movePlayer に通す。借りた側の名簿には載せない
        // （以前はここだけ載せていて、セーブを読み直すと消える食い違いになっていた）
        const m = movePlayer({ players: playersAfterCpuTransfer, teams: teamsAfterCpuTransfer }, candidate.id, receiver, {
          year: state.currentSeason.year,
          until: loanYear })
        if (!m.ok) continue
        playersAfterCpuTransfer = m.players
        teamsAfterCpuTransfer = m.teams
        offseasonTxNews.push({
          date: `${state.currentSeason.year}-11-15`,
          headline: loanHeadline({
            playerName: candidate.name, age: candidate.age, years: 1,
            ownerLabel: clubLabel(senderId, teamsAfterCpuTransfer),
            borrowerLabel: clubLabel(receiver, teamsAfterCpuTransfer) }),
          category: 'trade', relatedIds: [candidate.id] })
      }
    }

    // FA補強（受け皿）：移籍市場で動けなかった選手・クラブの補完。判断は pickCpuFreeAgents 1本。
    // ★国内クラブと海外クラブをまとめて渡す。以前は海外だけ endSeason の中に別実装があり、
    //   「在籍20人を割ったクラブの救済」しか見ていなかった（必要かどうかを見ていない）。
    //   海外クラブのロスター上限も国内と同じ ROSTER_MAX
    const foreignClubsForFa = allForeignClubs(state.foreignLeagues)
    const foreignIdSet = new Set(foreignClubsForFa.map(c => c.id))
    const cpuSignings = pickCpuFreeAgents({
      players: playersAfterCpuTransfer,
      clubs: [...teamsAfterCpuTransfer, ...foreignClubsForFa],
      playerTeamId: state.playerTeamId, season: state.currentSeason,
      capFor: (id) => (foreignIdSet.has(id) ? ROSTER_MAX : rosterCapFor(id)),
      phase: 'offseason' })
    const newYear = state.currentSeason.year
    // CPUのFA契約も movePlayer に通す（所属・名簿・加入年をまとめて。名簿に入れるので契約種別も本契約に揃える）
    let playersWithCpuSigns: Player[] = playersAfterCpuTransfer
    let teamsWithCpuSigns = teamsAfterCpuTransfer
    for (const sg of cpuSignings) {
      const before = playersWithCpuSigns.find(x => x.id === sg.playerId)
      if (!before) continue
      const m = movePlayer({ players: playersWithCpuSigns, teams: teamsWithCpuSigns }, sg.playerId, sg.clubId, {
        year: newYear,
        date: `${newYear}-02-01`,
        kind: 'free',
        history: false,
        contract: { yearsLeft: 2, annualSalary: faMarketSalary(before, perfOf(state.currentSeason, sg.playerId)), contractType: 'standard' } })
      if (!m.ok) continue
      playersWithCpuSigns = m.players.map(p =>
        p.id !== sg.playerId ? p : { ...p, contract: { ...p.contract, faEligibleYear: newYear + 2 } })
      teamsWithCpuSigns = m.teams
    }

    // ロスターは1つだけ。「2軍を15人まで埋める」数合わせのFA大量署名は廃止済み。
    // 総在籍24人（下限）まではメインの補強パス(Pass3)が保証する
    const playersWithAllCpuSigns = playersWithCpuSigns
    const teamsWithAllCpuSigns = teamsWithCpuSigns

    // ★海外クラブのFA補強は、もう上の pickCpuFreeAgents に入っている。
    //   ここに別実装（在籍20人を割ったクラブの救済／外国籍FAだけ）があったのを畳んだ。
    //   救済は「必要か」を見ていないので、必要でもないクラブが頭数だけ埋め、
    //   逆に必要としているクラブは20人居ると1人も獲れなかった。日本と海外で
    //   獲る理由が違う状態になっていたのがここ。
    const playersWithForeignSigns: Player[] = playersWithAllCpuSigns

    // FA契約の成立日をオフシーズン期間（1/12〜3/21）に分散させる（全員同日に5人契約のような不自然さを消す）
    const OFF_DAYS = ['01-12', '01-16', '01-21', '01-25', '01-30', '02-03', '02-07', '02-10', '02-14', '02-18', '02-21', '02-25', '03-01', '03-05', '03-09', '03-13', '03-17', '03-21']
    const offDate = (i: number) => `${newYear}-${OFF_DAYS[i % OFF_DAYS.length]}`
    const cpuSigningNewsItems = cpuSignings
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => {
        const p = playersAfterCpuTransfer.find(x => x.id === s.playerId)
        return p && ovr(p) >= 65
      })
      .slice(0, 10)
      .map(({ s, i }) => {
        const p = playersAfterCpuTransfer.find(x => x.id === s.playerId)!
        const team = findClub(teamsAfterCpuTransfer, state.foreignLeagues, s.clubId)
        return {
          date: offDate(i),
          headline: cpuSignedHeadline({ clubShort: team?.shortName ?? '', playerName: p.name, playerOvr: ovr(p) }),
          category: 'fa' as const,
          relatedIds: [p.id] }
      })

    // isInitialized は true のまま維持する。以前ここで false に落としていたため、
    // セーブ破壊ガード（進行中セーブの上に初期状態を書かない仕組み）が全ての保存を拒否し、
    // ドラフト中は一切セーブされず、落ちるとドラフト前まで巻き戻っていた。
    // ドラフト画面への遷移は App.tsx 側で draftState を見て判定する。
    set({
      draftState: { pool, pickOrder, currentPick: 0, picks: [], isComplete: false },
      players: [...playersWithForeignSigns, ...pool],
      teams: teamsWithAllCpuSigns,
      // 直近10シーズン分だけ残して古い移籍記録は捨てる
      transferHistory: [
        ...(state.transferHistory ?? []).filter(r => r.year >= newYear - 10),
        ...offseasonTxRecords,
        ...cpuSignings.map((s, i) => ({ year: newYear, date: offDate(i), playerId: s.playerId, fromTeamId: '', toTeamId: s.clubId, fee: 0, kind: 'free' as const, years: 2 })),
      ].slice(-800),
      currentSeason: {
        ...state.currentSeason,
        newsFeed: [...offseasonTxNews, ...cpuSigningNewsItems, ...state.currentSeason.newsFeed].slice(0, 30) } })
  },
})
