// draft ドメインのアクション（gameStore から分割）。

import type { DraftState, GameStore, SetGame } from '../gameStore'
import { draftPickValue } from '../../data/economy'
import { SEASON_2027_RACES, generateIndividualEvents } from '../../data/races'
import { ROSTER_MAX, rosterCapOf, teamRosterSize } from '../../data/rosterRules'
import { pickCpuFreeAgents } from '../../engine/cpuMarket'
import { pickExistsAnywhere, standingsPickNumbers } from '../../engine/draftOrder'
import { generateCpuRosters, generateDraftPool, generateForeignLeaguePlayers, generateJpelForeignName, generatePlayerInitialRoster } from '../../engine/playerGenerator'
import { type Player } from '../../types'
import { tierBudget, tierOf } from '../../utils/clubTier'
import { allForeignClubs } from '../../utils/clubs'
import { draftRoundOf, joinsDraft } from '../../utils/league'
import { movePlayer } from '../../utils/movePlayer'
import { initialNews, draftPickSoldHeadline } from '../../utils/newsItems'
import { ovr } from '../../utils/playerUtils'
import { SPECIALTIES } from '../../utils/squadNeeds'
import { teamHistoriesOf } from '../../utils/teamHistory'

type Slice = Pick<GameStore,
  'beginInauguralDraft' | 'playerPick' | 'cpuPick' | 'advanceDraft' | 'setDraftContract' | 'scoutDraftProspect' | 'initScoutPool' | 'generateDevProspects' | 'scoutDevProspect' | 'signDevProspect' | 'ensureFuturePicks' | 'sellDraftPick'>

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
})
