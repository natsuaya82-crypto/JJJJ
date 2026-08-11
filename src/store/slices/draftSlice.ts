// draft ドメインのアクション（gameStore から分割）。

import type { DraftState, GameStore, SetGame } from '../gameStore'
import { tradeValueCtxOf } from '../marketOps'
import { draftPickValue } from '../../data/economy'
import { SEASON_2027_RACES, generateIndividualEvents } from '../../data/races'
import { ROSTER_MAX, rosterCapOf, teamRosterSize } from '../../data/rosterRules'
import { pickCpuFreeAgents } from '../../engine/cpuMarket'
import { runCpuLoans, runCpuReleases, runCpuTrades, runCpuTransfers } from '../../engine/cpuOffseason'
import { draftLotteryOrder, draftOrderTeams, pickExistsAnywhere, standingsPickNumbers } from '../../engine/draftOrder'
import { buildDraftOrder, generateCpuRosters, generateDraftPool, generateForeignLeaguePlayers, generateJpelForeignName, generatePlayerInitialRoster } from '../../engine/playerGenerator'
import { type Player, type TransferRecord } from '../../types'
import { tierBudget, tierOf } from '../../utils/clubTier'
import { allForeignClubs, findClub } from '../../utils/clubs'
import { draftRoundOf, joinsDraft } from '../../utils/league'
import { movePlayer } from '../../utils/movePlayer'
import { cpuSignedHeadline, draftPickSoldHeadline, initialNews, type NewsItem } from '../../utils/newsItems'
import { faMarketSalary, ovr, perfOf } from '../../utils/playerUtils'
import { SPECIALTIES } from '../../utils/squadNeeds'
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

    // ①CPUの解雇（衰えたベテランと余剰をFAへ）。中身は engine/cpuOffseason の runCpuReleases 1本。
    // 対象は国内リーグのCPUチームのみ（選手のteamIdから拾うと海外クラブまで混ざり、
    // ロスター概念の無い海外側との取引で国内名簿が壊れる）
    const releasedWorld = runCpuReleases(
      { players: state.players, teams: teamsWithPicks },
      { playerTeamId: state.playerTeamId, year: yr, rosterCapFor })
    const playersAfterCpuRelease = releasedWorld.players
    const teamsAfterCpuRelease = releasedWorld.teams

    // ②CPU間移籍（メイン市場）：移籍金を払って他チームの余剰・主力を引き抜く。
    // 中身は engine/cpuOffseason の runCpuTransfers 1本
    const offseasonTxRecords: TransferRecord[] = []   // チーム詳細の移籍ページ用
    // オフの市場の動きをニュースに出す。「1部の控えが下位クラブへ」「若手がレンタルで
    // 走りに出る」が見えないと、市場が効いているかを確かめられない
    const offseasonTxNews: NewsItem[] = []
    const cpuTransferIds = new Set<string>()
    let playersAfterCpuTransfer = playersAfterCpuRelease
    let teamsAfterCpuTransfer = teamsAfterCpuRelease
    {
      const bought = runCpuTransfers(
        { players: playersAfterCpuRelease, teams: teamsAfterCpuRelease },
        { playerTeamId: state.playerTeamId, year: state.currentSeason.year,
          season: state.currentSeason, pastSeasons: state.pastSeasons,
          allTeams: state.teams, foreignLeagues: state.foreignLeagues,
          rosterCapFor, destinationOf: get().destinationOf, excludeIds: cpuTransferIds })
      playersAfterCpuTransfer = bought.players
      teamsAfterCpuTransfer = bought.teams
      offseasonTxRecords.push(...bought.records)
      offseasonTxNews.push(...bought.news)
    }

    // ⑤ CPU間トレード（予算不足でも価値が近い選手同士を交換）。
    // 同じオフに移籍済みの選手（cpuTransferIds）は対象外＝移籍→トレードの連鎖を防ぐ。
    // 中身は engine/cpuOffseason.ts の runCpuTrades 1本（cpuTransferIds はその中で書き足される）
    {
      const traded = runCpuTrades(
        { players: playersAfterCpuTransfer, teams: teamsAfterCpuTransfer },
        { playerTeamId: state.playerTeamId, year: state.currentSeason.year,
          tradeValueCtx: tradeValueCtxOf(state), excludeIds: cpuTransferIds })
      playersAfterCpuTransfer = traded.players
      teamsAfterCpuTransfer = traded.teams
      offseasonTxRecords.push(...traded.records)
    }

    // ④ CPU間レンタル（出番の無い若手を、走らせてくれるクラブが借りる）。
    // 中身は engine/cpuOffseason の runCpuLoans 1本
    // （cpuTransferIds を渡すので、同じオフに移籍・トレードした選手は貸し出さない）
    {
      const loaned = runCpuLoans(
        { players: playersAfterCpuTransfer, teams: teamsAfterCpuTransfer },
        { playerTeamId: state.playerTeamId, year: state.currentSeason.year, excludeIds: cpuTransferIds })
      playersAfterCpuTransfer = loaned.players
      teamsAfterCpuTransfer = loaned.teams
      offseasonTxNews.push(...loaned.news)
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
