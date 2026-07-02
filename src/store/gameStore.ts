import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameState, Player, Team, RosterTier, RaceResults, TransferListing, IncomingOffer, ContractRequest, ForeignCategory, FacilityKey, Achievement, CardRarity, CardStatKey, TrainingCard, Ratings, Race } from '../types'
import type { ISim } from '../engine/interactiveRace'
import { SPECIALTY_LABELS } from '../types'
import { INITIAL_TEAMS } from '../data/teams'
import { BASE_PLAYERS } from '../data/players'
import { SEASON_2027_RACES, generateSeasonRaces, SECOND_TEAM_RACES_INITIAL, generateSecondTeamRaces } from '../data/races'
import { generateDraftPool, buildDraftOrder, generateCpuRosters, generateForeignLeaguePlayers, nationalityToForeignCategory, generatePlayerSecondTeam } from '../engine/playerGenerator'
import { simulateRace, buildAILineup } from '../engine/raceEngine'
import { generateRaceEvents, generatePressConference } from '../engine/eventEngine'
import { ovr } from '../utils/playerUtils'
import { generateDropCards, detectCombo } from '../utils/cardCombo'
import { FOREIGN_LEAGUES } from '../data/foreignLeagues'
import { generateSponsorOffers } from '../data/sponsors'

type DraftState = {
  pool: Player[]
  pickOrder: string[]       // teamId[] 40 picks
  currentPick: number       // 0-based index
  picks: { pickNumber: number; teamId: string; playerId: string; playerName: string }[]
  isComplete: boolean
}

type SetupData = {
  teamName: string
  teamShortName: string
  teamId: string
  gmName: string
}

export type GameStore = GameState & {
  isInitialized: boolean
  setupData: SetupData | null
  draftState: DraftState | null
  raceLineup: Record<number, string>   // segmentIndex → playerId (for current race)
  lastRaceLineup: Record<number, string>  // saved from previous race for "前回" restore

  // Setup
  startSetup: (setup: SetupData) => void
  beginInauguralDraft: () => void

  // Draft
  playerPick: (playerId: string) => void
  cpuPick: () => void
  advanceDraft: () => void

  // Race
  raceStrategy: 'aggressive' | 'balanced' | 'conservative'
  raceTeamTalk: string
  setRaceStrategy: (s: 'aggressive' | 'balanced' | 'conservative') => void
  setRaceTeamTalk: (t: string) => void
  setRaceLineup: (segmentIndex: number, playerId: string) => void
  clearRaceLineup: () => void
  runRace: (lineup: Record<number, string>, segmentTactics?: Record<number, string>, preComputedResults?: RaceResults) => RaceResults | null

  // Active race sim state (persisted to survive navigation)
  activeRacePhase: 'lineup' | 'simulating' | 'results' | null
  activeRaceSim: ISim | null
  activeRaceResults: RaceResults | null
  activeRaceLockedRaceIndex: number
  activeRaceLockedRace: Race | null
  setActiveRaceSim: (sim: ISim | null) => void
  setActiveRacePhase: (phase: 'lineup' | 'simulating' | 'results' | null) => void
  setActiveRaceResults: (results: RaceResults | null) => void
  setActiveRaceLocked: (race: Race, index: number) => void
  clearActiveRace: () => void

  // Gameplay
  getTeam: (teamId: string) => Team | undefined
  getPlayer: (playerId: string) => Player | undefined
  getTeamPlayers: (teamId: string, tier: RosterTier) => Player[]
  getSalaryTotal: (teamId: string) => number
  toggleRosterSlot: (playerId: string, slot: 'main' | 'second') => void
  submitRoster: (selectedIds: string[], jerseyMap: Record<string, number>) => void
  generateDevProspects: () => void
  scoutDevProspect: (prospectId: string) => void
  signDevProspect: (prospectId: string) => void

  // Scouting
  spendScoutPoint: () => void
  scoutDraftProspect: (prospectId: string) => void
  initScoutPool: () => void

  // Transfer & FA
  releasePlayer: (playerId: string) => void
  signFAPlayer: (playerId: string, salary?: number, years?: number, contractType?: 'standard' | 'development' | 'dual', rosterTier?: 'main' | 'second') => void
  extendContract: (playerId: string) => void
  tradePlayer: (offeredIds: string[], requestedIds: string[], targetTeamId: string, transferFee?: number, offerPickKeys?: string[], requestPickKeys?: string[]) => boolean
  getTransferWindow: () => { open: boolean; label: string; racesUntil: number | null }
  getRosterWindow: () => { open: boolean; label: string }
  ensureFuturePicks: () => void

  // Player sheet
  openPlayerId: string | null
  openPlayerSheet: (id: string | null) => void
  setTrainingFocus: (playerId: string, ratingKey: string | null) => void
  sendScoutMission: (prospectId: string) => void
  startFAVisit: (playerId: string) => void
  renewContractOffer: (playerId: string, salary: number, years: number) => boolean

  // Events
  resolveEvent: (eventId: string, choiceIndex: number) => void

  // AI trade offers
  acceptTradeOffer: (offerId: string) => void
  rejectTradeOffer: (offerId: string) => void

  // Transfer market
  executeTransferPurchase: (listingId: string, price: number) => boolean
  acceptIncomingOffer: (offerId: string) => void
  declineIncomingOffer: (offerId: string) => void
  initiateContractRenewal: (playerId: string) => void
  submitContractRenewalOffer: (requestId: string, salary: number, years: number, contractType?: 'standard' | 'development' | 'dual', teamRole?: import('../types').TeamRole) => void
  acceptContractCounter: (requestId: string) => void
  reNegotiateContract: (requestId: string) => void
  abandonContractRenewal: (requestId: string) => void
  releasePlayerWithBuyout: (playerId: string) => void
  counterIncomingOffer: (offerId: string, counterPrice: number) => void
  generateContractRequests: () => void
  dismissRetirementRequest: (playerId: string) => void
  acceptRetirement: (playerId: string) => void
  dismissTransferRequest: (playerId: string) => void
  submitTransferBid: (playerId: string, fee: number) => void
  acceptFeeCounter: (bidId: string) => void
  rejectTransferBid: (bidId: string) => void
  finalizeTransfer: (bidId: string, salary: number, years: number) => boolean
  listMyPlayerForSale: (playerId: string, askingPrice: number) => void
  delistMyPlayer: (playerId: string) => void
  sellDraftPick: (pickKey: string, targetTeamId: string, price: number) => boolean

  // Opponent scouting & starring
  scoutOpponentPlayer: (playerId: string, level: 1 | 2) => void
  toggleStarOpponent: (playerId: string) => void
  toggleStarProspect: (prospectId: string) => void

  // Training plan
  setTrainingPlan: (plan: string | null) => void

  // Rival & preseason cards
  setRivalTeam: (id: string | null) => void
  claimPreseasonCards: () => void

  // Second team
  runSecondTeamRace: (lineup: Record<number, string>, strategy?: 'aggressive' | 'balanced' | 'conservative') => void
  setReserveLeagueJoined: (joined: boolean) => void

  // Season
  beginSeasonDraft: () => void
  startRegularSeason: () => void
  initObjectivesIfEmpty: () => void
  endSeason: () => void

  buyTrainingCard: (rarity: CardRarity, qty?: number) => TrainingCard[] | false

  // Sponsors
  signSponsor: (sponsorId: string, targetId: string | null) => boolean  // null = team sponsor
  terminateSponsor: (sponsorId: string, targetId: string | null) => void
  collectSponsorIncome: () => void
  acceptSponsorOffer: (offerId: string) => void

  // Foreign transfer market
  signForeignPlayer: (playerId: string, salary: number, years: number) => boolean
  listPlayerToForeignMarket: (playerId: string, askingPrice: number) => void
  acceptForeignOffer: (playerId: string, offeringClubId: string) => void

  // National team
  updateNationalTeam: () => void
  confirmSquad: (ids: string[]) => void
  setRacePlayerIds: (raceIdx: number, ids: string[]) => void

  // Facilities
  upgradeFacility: (key: FacilityKey) => boolean

  // Individual events
  simulateIndividualEvent: (eventId: string) => void

  // World Ekiden
  simulateWorldEkiden: () => void

  // Card training
  applyTrainingCards: (playerId: string, cardIds: string[], grantTrait?: boolean, multiplier?: number) => void
  dismissDroppedCards: () => void

  // Contract renewals
  decideRenewal: (playerId: string, renew: boolean, years?: number) => void

  // Login bonus
  claimLoginBonus: () => { daily: number; weeklyBonus: number; streak: number } | null

  // Ad watching
  watchAd: () => number | null

  // Dev reset
  resetGame: () => void
}

function emptyState(): Omit<GameStore, keyof ReturnType<typeof create>> {
  const basePlayers = BASE_PLAYERS.map(p => ({ ...p, teamId: '' }))
  return {
    isInitialized: false,
    setupData: null,
    draftState: null,
    raceLineup: {},
    lastRaceLineup: {},
    openPlayerId: null,
    raceStrategy: 'balanced',
    raceTeamTalk: 'best',
    activeRacePhase: null,
    activeRaceSim: null,
    activeRaceResults: null,
    activeRaceLockedRaceIndex: 0,
    activeRaceLockedRace: null,
    rivalTeamId: null,
    gmRep: 50,
    playerTeamId: 'fukuoka',
    currentSeason: {
      year: 2027,
      currentRaceIndex: 0,
      phase: 'draft',
      races: [],
      collegeRaces: [],
      draftPool: [],
      scoutPoints: 5,
      scoutProspects: [],
      objectives: [],
      trainingAssignments: {},
      scoutMissions: [],
      faVisits: [],
      events: [],
      pendingTradeOffers: [],
      scoutedOpponents: [],
      trainingPlan: null,
      transferListings: [],
      incomingOffers: [],
      transferBids: [],
      contractRequests: [],
      retirementRequests: [],
      transferRequests: [],
      standings: INITIAL_TEAMS.map(t => ({
        teamId: t.id, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [],
      })),
      newsFeed: [],
      secondTeamRaces: [],
      secondTeamRaceIndex: 0,
      secondTeamStandings: INITIAL_TEAMS.map(t => ({ teamId: t.id, totalPoints: 0, raceResults: [] })),
    },
    pastSeasons: [],
    growthReport: null,
    teams: INITIAL_TEAMS.map(t => ({ ...t, roster: { main: [], second: [] }, finance: { ...t.finance, salaryTotal: 0 } })),
    players: basePlayers,
    saveTimestamp: new Date().toISOString(),
    version: '0.1.0',
    sponsors: [],
    foreignLeagues: FOREIGN_LEAGUES,
    nationalTeam: undefined,
    trainingCards: [],
    raceDroppedCards: [],
    jewels: 0,
    starredOpponents: [],
    starredProspects: [],
    segmentRecords: {},
    lastLoginDate: undefined as unknown as string,
    loginStreak: undefined as unknown as number,
    totalLoginDays: undefined as unknown as number,
  } as unknown as Omit<GameStore, keyof ReturnType<typeof create>>
}

const ACHIEVEMENT_JEWELS: Record<string, number> = {
  bronze: 10, silver: 20, gold: 50, legendary: 100,
}

function checkRaceAchievements(params: {
  playerRank: number
  mySegWinCount: number
  totalSegments: number
  year: number
  raceName: string
  existing: Achievement[]
}): Achievement[] {
  const { playerRank, mySegWinCount, totalSegments, year, raceName, existing } = params
  const newAchievements: Achievement[] = []
  const has = (id: string) => existing.some(a => a.id === id)

  if (playerRank <= 3 && !has('top3_first')) {
    newAchievements.push({ id: 'top3_first', name: '初TOP3', desc: 'レースで初めてトップ3に入賞', earnedAtYear: year, earnedAtRace: raceName, rarity: 'bronze' })
  }
  if (playerRank === 1 && !has('first_win')) {
    newAchievements.push({ id: 'first_win', name: '初勝利', desc: 'レースで初めて1位を獲得', earnedAtYear: year, earnedAtRace: raceName, rarity: 'bronze' })
  }
  if (mySegWinCount >= 1 && !has('first_seg_win')) {
    newAchievements.push({ id: 'first_seg_win', name: '初区間賞', desc: '初めて区間賞を獲得', earnedAtYear: year, earnedAtRace: raceName, rarity: 'bronze' })
  }
  if (mySegWinCount >= 3 && !has('hat_trick')) {
    newAchievements.push({ id: 'hat_trick', name: 'ハットトリック', desc: '1レースで3区間以上を制覇', earnedAtYear: year, earnedAtRace: raceName, rarity: 'silver' })
  }
  if (totalSegments > 0 && mySegWinCount === totalSegments && !has('segment_sweep')) {
    newAchievements.push({ id: 'segment_sweep', name: '区間完全制覇', desc: '1レースで全区間1位を獲得', earnedAtYear: year, earnedAtRace: raceName, rarity: 'gold' })
  }
  return newAchievements
}

function checkSeasonAchievements(params: {
  finalRank: number
  year: number
  totalChamps: number
  curStreak: number
  seasonSegWins: number
  totalSeasons: number
  players: Player[]
  playerTeamId: string
  existing: Achievement[]
}): Achievement[] {
  const { finalRank, year, totalChamps, curStreak, seasonSegWins, totalSeasons, players, playerTeamId, existing } = params
  const newAchievements: Achievement[] = []
  const has = (id: string) => existing.some(a => a.id === id)

  if (totalSeasons >= 1 && !has('season_complete')) {
    newAchievements.push({ id: 'season_complete', name: 'シーズン完走', desc: '初めてのシーズンを完走した', earnedAtYear: year, rarity: 'bronze' })
  }
  if (finalRank === 2 && !has('runner_up')) {
    newAchievements.push({ id: 'runner_up', name: '準優勝', desc: 'シーズン2位フィニッシュ', earnedAtYear: year, rarity: 'bronze' })
  }
  if (finalRank === 1 && !has('champion')) {
    newAchievements.push({ id: 'champion', name: 'リーグ王者', desc: 'シーズン1位を獲得', earnedAtYear: year, rarity: 'gold' })
  }
  if (curStreak >= 2 && !has('back_to_back')) {
    newAchievements.push({ id: 'back_to_back', name: '2連覇', desc: '2シーズン連続で優勝', earnedAtYear: year, rarity: 'gold' })
  }
  if (curStreak >= 3 && !has('dynasty')) {
    newAchievements.push({ id: 'dynasty', name: '王朝の始まり', desc: '3連覇を達成', earnedAtYear: year, rarity: 'legendary' })
  }
  if (totalChamps >= 5 && !has('dynasty_5')) {
    newAchievements.push({ id: 'dynasty_5', name: '黄金王朝', desc: '通算5回の優勝を達成', earnedAtYear: year, rarity: 'legendary' })
  }
  if (seasonSegWins >= 5 && !has('segment_hunter')) {
    newAchievements.push({ id: 'segment_hunter', name: '区間賞ハンター', desc: '1シーズンで5区間賞以上を獲得', earnedAtYear: year, rarity: 'silver' })
  }
  if (seasonSegWins >= 10 && !has('segment_king')) {
    newAchievements.push({ id: 'segment_king', name: '区間賞の帝王', desc: '1シーズンで10区間賞以上を獲得', earnedAtYear: year, rarity: 'gold' })
  }
  const myPlayers = players.filter(p => p.teamId === playerTeamId)
  const myMainPlayers = myPlayers.filter(p => p.rosterTier === 'main')
  if (myPlayers.some(p => ovr(p) >= 85) && !has('ace_breeder')) {
    newAchievements.push({ id: 'ace_breeder', name: 'エース育成者', desc: 'OVR85以上の選手を育成', earnedAtYear: year, rarity: 'silver' })
  }
  if (myMainPlayers.filter(p => ovr(p) >= 80).length >= 2 && !has('ace_factory')) {
    newAchievements.push({ id: 'ace_factory', name: 'エース工場', desc: 'OVR80以上の選手を2人以上保有', earnedAtYear: year, rarity: 'gold' })
  }
  if (myPlayers.some(p => p.career.mvpAwards >= 1) && !has('mvp_maker')) {
    newAchievements.push({ id: 'mvp_maker', name: 'MVP輩出', desc: 'チームからMVP選手を輩出', earnedAtYear: year, rarity: 'silver' })
  }
  if (myMainPlayers.filter(p => p.age <= 22).length >= 3 && !has('youth_wave')) {
    newAchievements.push({ id: 'youth_wave', name: '若手の台頭', desc: '22歳以下の選手を3人以上1軍に起用', earnedAtYear: year, rarity: 'bronze' })
  }
  if (myMainPlayers.some(p => p.age >= 35) && !has('veteran_pride')) {
    newAchievements.push({ id: 'veteran_pride', name: 'ベテランの意地', desc: '35歳以上の選手が1軍で活躍', earnedAtYear: year, rarity: 'bronze' })
  }
  if (myMainPlayers.length >= 18 && !has('deep_squad')) {
    newAchievements.push({ id: 'deep_squad', name: '選手層充実', desc: '1軍登録選手が18名以上', earnedAtYear: year, rarity: 'silver' })
  }
  return newAchievements
}

function selectSeasonObjectives(hasRival: boolean) {
  type ObjTemplate = { id: string; desc: string; target: number; rewardJewels: number }
  const pool: ObjTemplate[] = [
    { id: 'topN', desc: '総合優勝', target: 1, rewardJewels: 150 },
    { id: 'topN', desc: 'トップ3フィニッシュ', target: 3, rewardJewels: 80 },
    { id: 'topN', desc: 'トップ5フィニッシュ', target: 5, rewardJewels: 50 },
    { id: 'topN', desc: 'トップ8フィニッシュ', target: 8, rewardJewels: 30 },
    { id: 'segWins', desc: '区間賞1回獲得', target: 1, rewardJewels: 20 },
    { id: 'segWins', desc: '区間賞3回獲得', target: 3, rewardJewels: 50 },
    { id: 'segWins', desc: '区間賞5回獲得', target: 5, rewardJewels: 80 },
    { id: 'winRace', desc: 'レース優勝1回', target: 1, rewardJewels: 40 },
    { id: 'winRace', desc: 'レース優勝2回', target: 2, rewardJewels: 70 },
    { id: 'noInjury', desc: 'シーズン通じて主力選手の怪我なし', target: 0, rewardJewels: 40 },
    { id: 'budgetMaintain', desc: 'シーズン終了時に1000万以上残す', target: 10000000, rewardJewels: 20 },
    { id: 'budgetMaintain', desc: 'シーズン終了時に3000万以上残す', target: 30000000, rewardJewels: 40 },
    { id: 'budgetMaintain', desc: 'シーズン終了時に5000万以上残す', target: 50000000, rewardJewels: 60 },
  ]
  if (hasRival) {
    pool.push(
      { id: 'rivalBeat', desc: 'ライバルに1回勝利', target: 1, rewardJewels: 30 },
      { id: 'rivalBeat', desc: 'ライバルに2回以上勝利', target: 2, rewardJewels: 50 },
    )
  }
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const selected: ObjTemplate[] = []
  const usedIds = new Set<string>()
  for (const o of shuffled) {
    if (!usedIds.has(o.id) && selected.length < 5) {
      selected.push(o)
      usedIds.add(o.id)
    }
  }
  return selected.map(o => ({
    id: o.id, desc: o.desc, target: o.target,
    current: o.id === 'topN' ? 99 : 0,
    rewardPts: 0, rewardBudget: 0, rewardJewels: o.rewardJewels, done: false,
  }))
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...emptyState() as unknown as GameStore,

      startSetup: (setup) => {
        set(state => {
          const baseIds = BASE_PLAYERS.map(p => p.id)
          const baseSalary = BASE_PLAYERS.reduce((s, p) => s + p.contract.annualSalary, 0)
          const players = state.players.map(p =>
            baseIds.includes(p.id) ? { ...p, teamId: setup.teamId } : p
          )
          const teams = state.teams.map(t => {
            if (t.id === setup.teamId) {
              return {
                ...t,
                name: setup.teamName,
                shortName: setup.teamShortName,
                gmName: setup.gmName,
                isPlayerControlled: true,
                roster: { main: baseIds, second: [] },
                finance: { ...t.finance, salaryTotal: baseSalary },
              }
            }
            if (t.isPlayerControlled && t.id !== setup.teamId) {
              return { ...t, isPlayerControlled: false }
            }
            return t
          })
          return { teams, players, setupData: setup, playerTeamId: setup.teamId }
        })
      },

      beginInauguralDraft: () => {
        const state = get()
        const pool = generateDraftPool(state.currentSeason.year)
        const pickOrder = buildDraftOrder(state.teams, state.currentSeason.year, state.playerTeamId)
        const draftState: DraftState = {
          pool,
          pickOrder,
          currentPick: 0,
          picks: [],
          isComplete: false,
        }

        // Pre-populate AI team rosters (main + second) and player team second
        const { cpuPlayers, teamRosters } = generateCpuRosters(
          state.teams.filter(t => t.id !== state.playerTeamId),
          state.currentSeason.year,
        )
        const playerSecondPlayers = generatePlayerSecondTeam(state.currentSeason.year)
        const playerSecondIds = playerSecondPlayers.map(p => p.id)
        const playerSecondWithTeam = playerSecondPlayers.map(p => ({ ...p, teamId: state.playerTeamId }))

        const teams = state.teams.map(t => {
          if (t.id === state.playerTeamId) {
            return { ...t, roster: { ...t.roster, second: playerSecondIds } }
          }
          const cpuRoster = teamRosters[t.id]
          if (!cpuRoster) return t
          return { ...t, roster: { main: cpuRoster.main, second: cpuRoster.second } }
        })

        // Generate foreign league players
        const { players: foreignPlayers, updatedLeagues } = generateForeignLeaguePlayers(
          state.foreignLeagues,
          state.currentSeason.year,
        )

        const players = [...state.players, ...cpuPlayers, ...pool, ...foreignPlayers, ...playerSecondWithTeam]
        set({ draftState, players, teams, foreignLeagues: updatedLeagues })
      },

      playerPick: (playerId) => {
        const state = get()
        if (!state.draftState) return
        const { draftState, playerTeamId } = state
        const { currentPick, pool, pickOrder, picks } = draftState

        const player = pool.find(p => p.id === playerId)
        if (!player) return

        const newPicks = [...picks, { pickNumber: currentPick + 1, teamId: playerTeamId, playerId, playerName: player.name }]
        const newPool = pool.filter(p => p.id !== playerId)

        const existingNums = new Set(
          (state.teams.find(t => t.id === playerTeamId)?.roster.main ?? [])
            .map(id => state.players.find(p => p.id === id)?.jerseyNumber ?? 0)
        )
        let jerseyNum = (state.teams.find(t => t.id === playerTeamId)?.roster.main.length ?? 0) + 1
        while (existingNums.has(jerseyNum)) jerseyNum++
        const updatedPlayer: Player = {
          ...player,
          teamId: playerTeamId,
          rosterTier: 'main',
          jerseyNumber: jerseyNum,
          draftRound: currentPick < 20 ? 1 : 2,
          draftPick: (currentPick % 20) + 1,
          status: 'active',
        }

        const teams = state.teams.map(t => {
          if (t.id !== playerTeamId) return t
          return { ...t, roster: { ...t.roster, main: [...t.roster.main, playerId] } }
        })
        const players = state.players.map(p => p.id === playerId ? updatedPlayer : p)

        const nextPick = currentPick + 1
        const isComplete = nextPick >= pickOrder.length

        set({
          draftState: { ...draftState, pool: newPool, picks: newPicks, currentPick: nextPick, isComplete },
          teams,
          players,
        })
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

        const foreignCount = team.roster.main
          .map(id => state.players.find(p => p.id === id))
          .filter(p => p?.nationality === 'FOREIGN').length

        const available = pool.filter(p => {
          if (p.nationality === 'FOREIGN' && foreignCount >= 3) return false
          return true
        })
        if (available.length === 0) return

        const scored = available.map(p => {
          return { p, score: ovr(p) * (0.97 + Math.random() * 0.06) }
        })
        scored.sort((a, b) => b.score - a.score)
        const picked = scored[0].p

        const newPicks = [...picks, { pickNumber: currentPick + 1, teamId, playerId: picked.id, playerName: picked.name }]
        const newPool = pool.filter(p => p.id !== picked.id)
        const jerseyNum = (team.roster.main.length) + 1
        const updatedPlayer: Player = {
          ...picked,
          teamId,
          rosterTier: 'main',
          jerseyNumber: jerseyNum,
          draftRound: currentPick < 20 ? 1 : 2,
          draftPick: (currentPick % 20) + 1,
          status: 'active',
        }
        const teams = state.teams.map(t => {
          if (t.id !== teamId) return t
          return { ...t, roster: { ...t.roster, main: [...t.roster.main, picked.id] } }
        })
        const players = state.players.map(p => p.id === picked.id ? updatedPlayer : p)
        const nextPick = currentPick + 1
        const isComplete = nextPick >= pickOrder.length

        set({
          draftState: { ...draftState, pool: newPool, picks: newPicks, currentPick: nextPick, isComplete },
          teams,
          players,
        })
      },

      advanceDraft: () => {
        const state = get()
        if (state.draftState?.isComplete) {
          // Undrafted players become free agents.
          // Check both status field AND draftState.pool membership for robustness.
          const remainingPoolIds = new Set((state.draftState.pool ?? []).map(p => p.id))
          const updatedPlayers = state.players.map(p => {
            const isUndrafted = remainingPoolIds.has(p.id) ||
              (p.status === 'draft_eligible' && (p.teamId === '' || p.teamId === '__pool__'))
            if (isUndrafted && p.teamId !== state.playerTeamId) {
              return { ...p, status: 'active' as const, teamId: '' }
            }
            return p
          })
          // Generate future draft picks for all teams (yr+1, yr+2, rounds 1-2)
          const currentYear = state.currentSeason.year
          const teamsWithPicks = state.teams.map((t, tIdx) => {
            const pickNum = tIdx + 1
            const newPicks: typeof t.draftPicks = []
            for (const yr of [currentYear + 1, currentYear + 2]) {
              for (const round of [1, 2]) {
                if (!(t.draftPicks ?? []).some(pk => pk.year === yr && pk.round === round && pk.originallyOwnedBy === t.id)) {
                  newPicks.push({ year: yr, round, pickNumber: pickNum, originallyOwnedBy: t.id })
                }
              }
            }
            return newPicks.length > 0 ? { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] } : t
          })
          set({
            isInitialized: true,
            players: updatedPlayers,
            teams: teamsWithPicks,
            currentSeason: {
              ...state.currentSeason, phase: 'preseason',
              races: state.currentSeason.races.length > 0 ? state.currentSeason.races : SEASON_2027_RACES,
              newsFeed: state.currentSeason.newsFeed.length > 0 ? state.currentSeason.newsFeed : buildInitialNews(),
              secondTeamRaces: (state.currentSeason.secondTeamRaces ?? []).length > 0 ? state.currentSeason.secondTeamRaces : SECOND_TEAM_RACES_INITIAL,
              secondTeamRaceIndex: state.currentSeason.secondTeamRaceIndex ?? 0,
              secondTeamStandings: state.currentSeason.secondTeamStandings ?? state.teams.map(t => ({ teamId: t.id, totalPoints: 0, raceResults: [] })),
            },
          })
        }
      },

      // Race lineup
      setRaceLineup: (segmentIndex, playerId) => {
        set(state => ({ raceLineup: { ...state.raceLineup, [segmentIndex]: playerId } }))
      },
      clearRaceLineup: () => set({ raceLineup: {} }),

      runRace: (lineup, segmentTactics, preComputedResults) => {
        const state = get()
        const { currentSeason, teams, players, playerTeamId } = state
        const raceIndex = currentSeason.currentRaceIndex
        if (raceIndex >= currentSeason.races.length) return null

        const race = currentSeason.races[raceIndex]
        const seasonProgress = raceIndex / currentSeason.races.length

        // Build CPU lineups for all non-player teams
        const lineups: Record<string, Record<number, string>> = { [playerTeamId]: lineup }
        for (const team of teams) {
          if (team.id === playerTeamId) continue
          lineups[team.id] = buildAILineup(team.id, players, race)
        }

        // Tactics room: boost player-team runners' effective OVR
        const tacticsLv = teams.find(t => t.id === playerTeamId)?.facilities?.tacticsRoom ?? 0
        const playersForSim = tacticsLv > 0 ? players.map(p => {
          if (p.teamId !== playerTeamId) return p
          const boost = tacticsLv
          return { ...p, ratings: {
            speed: Math.min(99, p.ratings.speed + boost),
            stamina: Math.min(99, p.ratings.stamina + boost),
            mountainUp: Math.min(99, p.ratings.mountainUp + boost),
            mountainDown: Math.min(99, p.ratings.mountainDown + boost),
            pacing: Math.min(99, p.ratings.pacing + boost),
            mental: Math.min(99, p.ratings.mental + boost),
            recovery: Math.min(99, p.ratings.recovery + boost),
          }}
        }) : players

        // Chemistry: nationality cohesion bonus for player team lineup
        const lineupPlayerIds = Object.values(lineup)
        const lineupPlayers = lineupPlayerIds.map(id => playersForSim.find(p => p.id === id)).filter(Boolean) as typeof playersForSim
        const natCounts: Record<string, number> = {}
        for (const lp of lineupPlayers) natCounts[lp.nationality] = (natCounts[lp.nationality] ?? 0) + 1
        const maxNatCount = Math.max(0, ...Object.values(natCounts))
        const chemBonus = maxNatCount >= 9 ? 10 : maxNatCount >= 7 ? 6 : 0
        const playersForSimFinal = chemBonus > 0
          ? (() => {
              const dominantNat = Object.entries(natCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
              return playersForSim.map(p => {
                if (p.teamId !== playerTeamId || !lineupPlayerIds.includes(p.id) || p.nationality !== dominantNat) return p
                return { ...p, morale: Math.min(100, (p.morale ?? 70) + chemBonus) }
              })
            })()
          : playersForSim

        const results = preComputedResults ?? simulateRace(race, lineups, teams, playersForSimFinal, seasonProgress, playerTeamId, segmentTactics)

        // Persist results into race, update standings, advance index
        set(state => {
          const updatedRaces = state.currentSeason.races.map((r, i) =>
            i === raceIndex ? { ...r, results } : r
          )

          const updatedStandings = state.currentSeason.standings.map(s => {
            const tr = results.teamRankings.find(r => r.teamId === s.teamId)
            if (!tr) return s
            const earned = tr.positionPoints + tr.segmentPoints
            return {
              ...s,
              leaguePoints: s.leaguePoints + tr.positionPoints,
              segmentPoints: s.segmentPoints + tr.segmentPoints,
              totalPoints: s.totalPoints + earned,
              raceResults: [...s.raceResults, { raceId: race.id, rank: tr.rank, points: earned }],
            }
          })

          // Update news
          const winnerTeam = teams.find(t => t.id === results.teamRankings[0]?.teamId)
          const playerResult = results.teamRankings.find(r => r.teamId === playerTeamId)
          const playerRank = playerResult?.rank ?? 0
          const rankSuffix = playerRank === 1 ? '優勝' : `第${playerRank}位`

          // Segment awards from player team
          const mySegWins = results.segmentResults
            .filter(sr => sr.runners[0]?.teamId === playerTeamId)
          const mySegWinPlayer = mySegWins.length > 0
            ? players.find(p => p.id === mySegWins[0].runners[0]?.playerId)
            : null

          const rng01 = Math.random()
          const winVariants = [
            `${race.name}：${winnerTeam?.name ?? ''}が圧倒的な走りで優勝！`,
            `${race.name}：${winnerTeam?.name ?? ''}が頂点に立つ`,
            `${race.name} 優勝は${winnerTeam?.name ?? ''}。完璧なチーム運営が光った`,
            `${race.name}：${winnerTeam?.name ?? ''}、今季${results.teamRankings[0]?.positionPoints}pt獲得で圧勝`,
          ]
          const playerRankVariants = playerRank === 1
            ? [`${race.name} — 自チームが優勝！完璧な作戦が結実`, `${race.name} 優勝。チーム全員の力を証明した`]
            : playerRank <= 3
            ? [`${race.name} — 自チームは${rankSuffix}。表彰台確保`, `${race.name} ${rankSuffix}フィニッシュ。確かな進歩を示した`]
            : playerRank <= 8
            ? [`${race.name} — ${rankSuffix}フィニッシュ。上位との差を縮めたい`, `${race.name} ${rankSuffix}。課題は明確、次戦に向け修正を`]
            : [`${race.name} — ${rankSuffix}。改善点を洗い出し立て直しが必要`, `${race.name} ${rankSuffix}フィニッシュ。厳しい現実と向き合う時`]
          const segWinVariants = mySegWinPlayer ? [
            `${mySegWinPlayer.name}が第${mySegWins[0].segmentIndex}区で区間賞`,
            `区間賞：第${mySegWins[0].segmentIndex}区で${mySegWinPlayer.name}が最速タイムをマーク`,
            `${mySegWinPlayer.name}、第${mySegWins[0].segmentIndex}区区間賞。今後の起用に期待`,
          ] : []

          const newsItems: { date: string; headline: string; category: 'trade' | 'draft' | 'college' | 'race' | 'injury' | 'fa' | 'finance'; relatedIds: string[] }[] = [
            {
              date: race.date,
              headline: winVariants[Math.floor(rng01 * winVariants.length)],
              category: 'race' as const,
              relatedIds: [race.id],
            },
            ...(playerRank > 0 ? [{
              date: race.date,
              headline: playerRankVariants[Math.floor(rng01 * playerRankVariants.length)],
              category: 'race' as const,
              relatedIds: [race.id],
            }] : []),
            ...(mySegWinPlayer && segWinVariants.length > 0 ? [{
              date: race.date,
              headline: segWinVariants[Math.floor(rng01 * segWinVariants.length)],
              category: 'race' as const,
              relatedIds: [mySegWinPlayer.id],
            }] : []),
          ]

          // Board expectation news (every 3 races after race 3)
          if (playerRank > 0) {
            const raceIndex = state.currentSeason.currentRaceIndex
            const totalRaces = state.currentSeason.races.length
            if (raceIndex >= 3 && raceIndex % 3 === 0) {
              const sortedStandingsNow = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
              const myCurrentRank = sortedStandingsNow.findIndex(s => s.teamId === state.playerTeamId) + 1
              const expectedRank = Math.ceil(teams.length / 3)
              const remainingRaces = totalRaces - raceIndex
              if (myCurrentRank <= expectedRank) {
                const msgs = [
                  `フロント評価：シーズン${raceIndex}戦終了時点で${myCurrentRank}位。フロントは現状に満足している`,
                  `フロント：「現在${myCurrentRank}位は期待通り。このペースを維持してほしい」`,
                  `経営陣評価：${myCurrentRank}位と好調。残り${remainingRaces}戦もこの調子で`,
                ]
                newsItems.push({ date: race.date, headline: msgs[Math.floor(Math.random() * msgs.length)], category: 'finance' as const, relatedIds: [] })
              } else if (myCurrentRank > expectedRank + 4) {
                const msgs = [
                  `フロント評価：現在${myCurrentRank}位。フロントは成績に不満を示している`,
                  `経営陣から警告：「${myCurrentRank}位は容認できない。残り${remainingRaces}戦での巻き返しを求める」`,
                  `フロント：「順位${myCurrentRank}位は期待を大きく下回る。戦略の見直しが必要だ」`,
                ]
                newsItems.push({ date: race.date, headline: msgs[Math.floor(Math.random() * msgs.length)], category: 'finance' as const, relatedIds: [] })
              }
            }
          }

          // Rivalry news
          if (state.rivalTeamId && playerRank > 0) {
            const rivalRank = results.teamRankings.find(r => r.teamId === state.rivalTeamId)?.rank
            const rivalShort = teams.find(t => t.id === state.rivalTeamId)?.shortName
            if (rivalRank != null && rivalShort) {
              if (playerRank < rivalRank) {
                newsItems.push({ date: race.date, headline: `ライバル${rivalShort}に勝利！（自${playerRank}位 vs ${rivalRank}位）`, category: 'race' as const, relatedIds: [state.rivalTeamId] })
              } else if (playerRank > rivalRank) {
                newsItems.push({ date: race.date, headline: `ライバル${rivalShort}に敗北（自${playerRank}位 vs ${rivalRank}位）`, category: 'race' as const, relatedIds: [state.rivalTeamId] })
              }
            }
          }

          // Fatigue + injury (strategy modifier)
          const racingIds = new Set(
            Object.values(lineups).flatMap(l => Object.values(l)).filter(Boolean) as string[]
          )
          const stratMult = state.raceStrategy === 'aggressive' ? 1.4 : state.raceStrategy === 'conservative' ? 0.65 : 1.0
          const medLv = state.teams.find(t => t.id === state.playerTeamId)?.facilities?.medicalCenter ?? 0
          const medMult = 1 - medLv * 0.08
          const baseFatigueGain = Math.min(14, 4 + race.segments.length * 1.5) * stratMult * medMult
          const updatedPlayers = state.players.map(p => {
            if (racingIds.has(p.id)) {
              // recovery stat reduces fatigue gain: recovery=50→normal, recovery=90→-12%
              const recoveryMult = 1.0 - (p.ratings.recovery - 50) * 0.003
              const fatigueGain = Math.round(baseFatigueGain * Math.max(0.7, recoveryMult))
              return { ...p, fatigue: Math.min(100, p.fatigue + fatigueGain) }
            } else if (p.status === 'injured') {
              // Injured players recover 18 fatigue per race
              const newFatigue = Math.max(0, p.fatigue - 18)
              return { ...p, fatigue: newFatigue, status: newFatigue < 40 ? 'active' as const : p.status }
            } else {
              // Resting players recover 12 fatigue per race (+ bonus from recovery rating)
              const recoveryBonus = Math.round((p.ratings.recovery - 50) * 0.08)
              return { ...p, fatigue: Math.max(0, p.fatigue - 16 - recoveryBonus) }
            }
          })

          // Race prize money for player team
          const PRIZE_TABLE = [2000, 1500, 1000, 700, 500, 300, 300, 300]
          const racePrizePct = PRIZE_TABLE[Math.min(playerRank - 1, PRIZE_TABLE.length - 1)] ?? 200
          const racePrize = racePrizePct * 10000

          // Segment prize money (top 3 per segment — goes to team)
          const SEG_PRIZE = [5000000, 3000000, 1500000]
          const segPrize = results.segmentResults.reduce((total, sr) => {
            const myRunner = sr.runners.find(r => r.teamId === playerTeamId)
            if (!myRunner || myRunner.rank > 3) return total
            return total + (SEG_PRIZE[myRunner.rank - 1] ?? 0)
          }, 0)

          // Attendance revenue: rank-proportional
          const attendanceBase = 2000000 + Math.random() * 1500000
          const attendanceRankBonus =
            playerRank === 1 ? 8000000 :
            playerRank <= 3 ? 4500000 :
            playerRank <= 6 ? 1800000 :
            playerRank <= 10 ? 600000 : 0
          const attendanceRevenue = Math.round((attendanceBase + attendanceRankBonus + (Math.random() - 0.5) * 500000) / 100000) * 100000

          const prizeNewsItem = playerRank > 0 ? {
            date: race.date,
            headline: `${race.name} 賞金${Math.round(racePrize / 10000)}万${segPrize > 0 ? `+区間賞${Math.round(segPrize / 10000)}万` : ''}+観客収入${Math.round(attendanceRevenue / 10000)}万（${playerRank}位）`,
            category: 'race' as const,
            relatedIds: [race.id],
          } : {
            date: race.date,
            headline: `${race.name} 観客動員収入 +${Math.round(attendanceRevenue / 10000)}万円`,
            category: 'race' as const,
            relatedIds: [race.id],
          }

          // Check if player beat rival this race
          const rivalBeatThisRace = !!state.rivalTeamId &&
            (results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? 99) <
            (results.teamRankings.find(r => r.teamId === state.rivalTeamId)?.rank ?? 99)

          // Update objectives（noInjury は負傷判定が後段なので後で反映）
          const mySegWinCount = results.segmentResults.filter(sr => sr.runners[0]?.teamId === playerTeamId).length
          const baseObjectives = state.currentSeason.objectives.map(obj => {
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

          // Team talk morale modifier
          const teamTalk = state.raceTeamTalk ?? 'best'
          const teamRank = results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? 0
          const baseMoraleDelta = teamRank === 1 ? 8 : teamRank <= 3 ? 3 : teamRank >= state.teams.length - 2 ? -5 : 0
          const talkBonus = teamTalk === 'enjoy' ? 5 : teamTalk === 'win' && teamRank <= 5 ? 10 : 0
          const moraleDelta = baseMoraleDelta + talkBonus
          const raceExpGainsMap: Record<string, Partial<Record<CardStatKey, number>>> = {}
          const finalPlayers = updatedPlayers.map(p => {
            // Form: 設計書準拠 レース後再抽選（絶好調10%/好調25%/普通40%/不調20%/最悪5%）
            const fr = Math.random()
            const newForm = fr < 0.10 ? 2 : fr < 0.35 ? 1 : fr < 0.75 ? 0 : fr < 0.95 ? -1 : -2
            // Career stats: increment totalRaces and segmentWins for all racers
            const isRacer = racingIds.has(p.id)
            const segWinsThisRace = isRacer
              ? results.segmentResults.filter(sr => sr.runners[0]?.playerId === p.id).length
              : 0
            const careerUpdate = isRacer ? { career: { ...p.career, totalRaces: p.career.totalRaces + 1, segmentWins: p.career.segmentWins + segWinsThisRace } } : {}

            if (p.teamId !== playerTeamId || p.rosterTier !== 'main') return { ...p, form: newForm, ...careerUpdate }

            const segWin = results.segmentResults.some(sr => sr.runners[0]?.playerId === p.id)
            const newMorale = Math.max(10, Math.min(100, (p.morale ?? 70) + moraleDelta + (segWin ? 5 : 0)))

            // EXPベース成長: 走った区間の地形タイプで能力別EXPを付与
            let newRatings = { ...p.ratings }
            let newExp = { ...(p.exp ?? {}) } as Partial<Record<CardStatKey, number>>
            if (racingIds.has(p.id) && p.status === 'active') {
              const playerSeg = results.segmentResults.find(sr =>
                sr.runners.some(r => r.playerId === p.id)
              )
              const seg = playerSeg ? race.segments.find(s => s.index === playerSeg.segmentIndex) : null
              if (seg) {
                const sType = segmentType(seg.uphillPct, seg.downhillPct, seg.distanceKm)
                const baseGains = segTypeExpGain(sType)
                const ageMult = ageMultiplier(p)
                const potMult = potMultiplier(p.potential)
                if (ageMult > 0) {
                  const result = processExpGains(newRatings, newExp, baseGains, potMult, ageMult)
                  newRatings = result.ratings
                  newExp = result.exp
                  const gained: Partial<Record<CardStatKey, number>> = {}
                  ;(Object.keys(baseGains) as CardStatKey[]).forEach(k => {
                    const v = Math.round((baseGains[k] ?? 0) * potMult * ageMult)
                    if (v > 0) gained[k] = v
                  })
                  raceExpGainsMap[p.id] = gained
                }
              }
            } else if (p.status === 'active') {
              // 見学EXP: 全能力に50EXP（設計書: ベンチ ×0.5 間接育成）
              const benchGains: Partial<Record<CardStatKey, number>> = {
                speed: 50, stamina: 50, mountainUp: 50, mountainDown: 50, pacing: 50, mental: 50, recovery: 50,
              }
              const ageMult = ageMultiplier(p)
              const potMult = potMultiplier(p.potential)
              if (ageMult > 0) {
                const result = processExpGains(newRatings, newExp, benchGains, potMult, ageMult)
                newRatings = result.ratings
                newExp = result.exp
              }
            }

            // Training plan effect (team-wide)
            const plan = state.currentSeason.trainingPlan
            let planFatigueDelta = 0
            if (plan && p.status === 'active') {
              if (plan === '回復調整') {
                planFatigueDelta = -8
              } else {
                const planStatMap: Record<string, keyof typeof newRatings> = {
                  '持久重視': 'stamina', 'スピード重視': 'speed', '精神強化': 'mental', '登り強化': 'mountainUp',
                }
                const planStat = planStatMap[plan]
                if (planStat && Math.random() < 0.30) {
                  // 練習プランはEXPボーナスとして追加（直接+1ではなく）
                  const bonusGain: Partial<Record<CardStatKey, number>> = { [planStat as CardStatKey]: 600 }
                  const result = processExpGains(newRatings, newExp, bonusGain, potMultiplier(p.potential), 1.0)
                  newRatings = result.ratings
                  newExp = result.exp
                }
              }
            }
            return { ...p, form: newForm, morale: newMorale, ratings: newRatings, exp: newExp, fatigue: Math.max(0, Math.min(100, (p.fatigue ?? 0) + planFatigueDelta)), ...careerUpdate }
          })

          // Injury system: racers with high fatigue may get injured
          const injuryNewsItems: typeof state.currentSeason.newsFeed = []
          const playersWithInjuries = finalPlayers.map(p => {
            if (p.teamId !== playerTeamId || !racingIds.has(p.id) || p.status !== 'active') return p
            const injuryChance = Math.max(0, (p.fatigue - 65) / 35 * 0.10)
            if (Math.random() < injuryChance) {
              const recoveryRaces = 2 + Math.floor(Math.random() * 2)
              injuryNewsItems.push({
                date: race.date,
                headline: `${p.name}が疲労で戦線離脱 — 復帰まで約${recoveryRaces}戦`,
                category: 'injury' as const,
                relatedIds: [p.id],
              })
              return { ...p, status: 'injured' as const, injuredUntilRace: raceIndex + 1 + recoveryRaces }
            }
            return p
          })

          // noInjury 目標：今レースの負傷者数を反映
          const updatedObjectives = baseObjectives.map(obj => {
            if (!obj.done && obj.id === 'noInjury' && injuryNewsItems.length > 0) {
              return { ...obj, current: obj.current + injuryNewsItems.length }
            }
            return obj
          })

          // PB tracking for player team
          const playersWithPBs = playersWithInjuries.map(p => {
            if (p.teamId !== playerTeamId) return p
            let pbs = [...(p.segmentPBs ?? [])]
            for (const sr of results.segmentResults) {
              const runner = sr.runners.find(r => r.playerId === p.id)
              if (!runner) continue
              const seg = race.segments.find(s => s.index === sr.segmentIndex)
              if (!seg) continue
              const pbKey = `${Math.round(seg.distanceKm)}km-up${Math.round(seg.uphillPct / 10) * 10}-dn${Math.round(seg.downhillPct / 10) * 10}`
              const existing = pbs.find(pb => pb.key === pbKey)
              if (!existing || runner.timeSec < existing.timeSec) {
                pbs = [...pbs.filter(pb => pb.key !== pbKey), { key: pbKey, timeSec: runner.timeSec, raceName: race.name, date: race.date }]
              }
            }
            return { ...p, segmentPBs: pbs }
          })

          // Recover already-injured players whose recovery race has passed
          const recoveredPlayers = playersWithPBs.map(p => {
            if (p.status === 'injured' && p.injuredUntilRace != null && raceIndex + 1 >= p.injuredUntilRace) {
              // Comeback penalty: form -1 for first race back
              return { ...p, status: 'active' as const, injuredUntilRace: undefined, form: Math.max(-2, (p.form ?? 0) - 1) }
            }
            return p
          })

          // GM rep delta per race
          const raceRank = results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? 10
          const raceRepDelta = raceRank === 1 ? 2 : raceRank <= 3 ? 1 : raceRank >= state.teams.length - 2 ? -2 : 0

          // Scout missions countdown
          const updatedMissions = (state.currentSeason.scoutMissions ?? []).map(m => ({ ...m, racesLeft: m.racesLeft - 1 }))
          const completedProspectIds = new Set(updatedMissions.filter(m => m.racesLeft <= 0).map(m => m.prospectId))
          const activeMissions = updatedMissions.filter(m => m.racesLeft > 0)
          const updatedScoutProspects = completedProspectIds.size > 0
            ? state.currentSeason.scoutProspects.map(sp => {
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
            teams: state.teams,
          })
          const pressRank = results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? 10
          const pressSegWins = results.segmentResults.filter(sr => sr.runners[0]?.teamId === playerTeamId).length
          const pressNotable = pressRank === 1 || pressRank >= state.teams.length - 1 || raceIndex + 1 >= state.currentSeason.races.length - 1
          if (pressNotable && Math.random() < 0.5) {
            const pressConf = generatePressConference({
              playerTeamId,
              raceIndex: raceIndex + 1,
              teamRank: pressRank,
              totalTeams: state.teams.length,
              segWins: pressSegWins,
            })
            newEvents.unshift(pressConf)
          }
          const existingTrades = (state.currentSeason.pendingTradeOffers ?? []).filter(o => o.expiresAtRace > raceIndex + 1)

          // Accumulate race income (prizes + attendance) to carry over to next season's budget
          const raceIncomeAccum = (racePrize > 0 ? racePrize : 0) + segPrize + attendanceRevenue
          const teamsWithPrize = state.teams

          // Transfer market activity
          const nextRaceIndex = raceIndex + 1
          const isWindowOpenNow = (() => {
            const ph = nextRaceIndex >= state.currentSeason.races.length ? 'postseason' : state.currentSeason.phase
            if (ph === 'preseason' || ph === 'postseason') return true
            const total = state.currentSeason.races.length
            const mid0 = Math.floor(total * 0.35); const mid1 = Math.floor(total * 0.55)
            return nextRaceIndex >= mid0 && nextRaceIndex <= mid1
          })()
          // CPU-to-CPU transfer completions during open window
          type CpuTx = { playerId: string; fromTeamId: string; toTeamId: string; playerName: string; playerOvr: number; fromShort: string; toShort: string }
          const cpuTxList: CpuTx[] = []
          const cpuTxListingIds = new Set<string>()
          if (isWindowOpenNow) {
            for (const listing of (state.currentSeason.transferListings ?? [])) {
              if (listing.fromTeamId === playerTeamId || listing.competingTeams.length === 0) continue
              if (Math.random() >= 0.5) continue
              const buyerTeamId = listing.competingTeams[Math.floor(Math.random() * listing.competingTeams.length)]
              const p = finalPlayers.find(pl => pl.id === listing.playerId)
              const seller = state.teams.find(t => t.id === listing.fromTeamId)
              const buyer = state.teams.find(t => t.id === buyerTeamId)
              if (!p || !seller || !buyer) continue
              cpuTxList.push({ playerId: p.id, fromTeamId: listing.fromTeamId, toTeamId: buyerTeamId, playerName: p.name, playerOvr: ovr(p), fromShort: seller.shortName, toShort: buyer.shortName })
              cpuTxListingIds.add(listing.id)
            }
          }
          const cpuTxNewsItems: typeof state.currentSeason.newsFeed = cpuTxList.map(tx => ({
            date: race.date,
            headline: `${tx.toShort}が${tx.fromShort}から${tx.playerName}（OVR${tx.playerOvr}）を獲得`,
            category: 'trade' as const,
            relatedIds: [tx.playerId],
          }))
          const existingListingsFiltered = (state.currentSeason.transferListings ?? []).filter(l => !cpuTxListingIds.has(l.id))

          const transferData = generateTransferActivity(finalPlayers, teamsWithPrize, playerTeamId, nextRaceIndex, existingListingsFiltered, state.currentSeason.incomingOffers ?? [], isWindowOpenNow, state.currentSeason.transferRequests ?? [])

          // Process pending transfer bids
          const processedBids = (state.currentSeason.transferBids ?? []).map(bid => {
            if (bid.status !== 'pending') return bid
            const player = finalPlayers.find(p => p.id === bid.playerId)
            if (!player || player.teamId !== bid.targetTeamId) return { ...bid, status: 'failed' as const }
            const val = calcTransferValue(player)
            const isListed = transferData.listings.some(l => l.playerId === bid.playerId)
            const isExpiring = player.contract.yearsLeft <= 1
            const threshold = val * (isListed ? 0.85 : isExpiring ? 0.92 : 1.05) * (0.9 + Math.random() * 0.2)
            if (bid.offeredFee >= threshold) return { ...bid, status: 'fee_accepted' as const }
            if (bid.offeredFee >= threshold * 0.68 && bid.round < 3) {
              return { ...bid, status: 'countered' as const, counterFee: Math.round(threshold / 1000000) * 1000000 }
            }
            return { ...bid, status: 'rejected' as const }
          })

          const finalPlayerRank = results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? state.teams.length
          const droppedCards = generateDropCards(finalPlayerRank, state.teams.length, mySegWinCount > 0)

          const raceAchievements = checkRaceAchievements({
            playerRank: finalPlayerRank,
            mySegWinCount,
            totalSegments: race.segments.length,
            year: state.currentSeason.year,
            raceName: race.name,
            existing: state.achievements ?? [],
          })

          // Update all-time segment records
          const updatedSegmentRecords = { ...(state.segmentRecords ?? {}) }
          for (const sr of results.segmentResults) {
            const key = `${race.name}-${sr.segmentIndex}`
            const existing = updatedSegmentRecords[key] ?? []
            const newEntries = sr.runners.map(r => {
              const pl = state.players.find(x => x.id === r.playerId)
              const tm = state.teams.find(x => x.id === r.teamId)
              return { playerName: pl?.name ?? '不明', teamShort: tm?.shortName ?? '?', timeSec: r.timeSec, year: state.currentSeason.year }
            })
            updatedSegmentRecords[key] = [...existing, ...newEntries]
              .sort((a, b) => a.timeSec - b.timeSec)
              .slice(0, 10)
          }

          const raceJewels =
            (playerRank === 1 ? 20 : playerRank === 2 ? 10 : playerRank === 3 ? 5 : 0)
            + mySegWinCount * 5
            + raceAchievements.reduce((s, a) => s + (ACHIEVEMENT_JEWELS[a.rarity] ?? 0), 0)

          const playersWithCpuTx = cpuTxList.length === 0 ? recoveredPlayers : recoveredPlayers.map(p => {
            const tx = cpuTxList.find(t => t.playerId === p.id)
            return tx ? { ...p, teamId: tx.toTeamId, rosterTier: 'main' as const } : p
          })
          const teamsWithCpuTx = cpuTxList.length === 0 ? teamsWithPrize : teamsWithPrize.map(t => {
            const sold = cpuTxList.filter(tx => tx.fromTeamId === t.id).map(tx => tx.playerId)
            const bought = cpuTxList.filter(tx => tx.toTeamId === t.id).map(tx => tx.playerId)
            if (sold.length === 0 && bought.length === 0) return t
            return { ...t, roster: { ...t.roster, main: [...t.roster.main.filter(id => !sold.includes(id)), ...bought] } }
          })

          const prevDoneIds = new Set(state.currentSeason.objectives.filter(o => o.done).map(o => o.id))
          const midRaceObjJewels = updatedObjectives
            .filter(o => o.done && !prevDoneIds.has(o.id))
            .reduce((s, o) => s + (o.rewardJewels ?? 30), 0)

          return {
            players: playersWithCpuTx,
            teams: teamsWithCpuTx,
            jewels: state.jewels + (playerRank > 0 ? raceJewels : 0) + midRaceObjJewels,
            raceLineup: {},
            lastRaceLineup: { ...state.raceLineup },
            trainingCards: [...(state.trainingCards ?? []), ...droppedCards],
            raceDroppedCards: droppedCards,
            raceExpGains: raceExpGainsMap,
            achievements: [...(state.achievements ?? []), ...raceAchievements],
            gmRep: Math.max(1, Math.min(100, (state.gmRep ?? 50) + raceRepDelta)),
            segmentRecords: updatedSegmentRecords,
            currentSeason: {
              ...state.currentSeason,
              currentRaceIndex: raceIndex + 1,
              phase: raceIndex + 1 >= state.currentSeason.races.length ? 'postseason' : 'regular',
              races: updatedRaces,
              standings: updatedStandings,
              objectives: updatedObjectives,
              scoutMissions: activeMissions,
              scoutProspects: updatedScoutProspects,
              newsFeed: [...cpuTxNewsItems, ...injuryNewsItems, prizeNewsItem, ...newsItems, ...state.currentSeason.newsFeed].slice(0, 40),
              events: [...(state.currentSeason.events ?? []), ...newEvents],
              pendingTradeOffers: existingTrades,
              transferListings: transferData.listings,
              incomingOffers: transferData.incomingOffers,
              transferBids: processedBids,
              seasonRaceIncome: (state.currentSeason.seasonRaceIncome ?? 0) + raceIncomeAccum,
            },
          }
        })

        return results
      },

      toggleRosterSlot: (playerId, slot) => {
        set(state => {
          const team = state.teams.find(t => t.id === state.playerTeamId)
          if (!team) return state
          const MAX = 18
          const isInSlot = team.roster[slot].includes(playerId)

      

          let newMain = [...team.roster.main]
          let newSecond = [...team.roster.second]

          if (isInSlot) {
            // Remove from this slot
            if (slot === 'main') newMain = newMain.filter(id => id !== playerId)
            else newSecond = newSecond.filter(id => id !== playerId)
          } else {
            // Add to this slot (check capacity)
            const currentCount = slot === 'main' ? newMain.length : newSecond.length
            if (currentCount >= MAX) return state
            if (slot === 'main') newMain.push(playerId)
            else newSecond.push(playerId)
          }

          const newRoster = { main: newMain, second: newSecond }
          const inMain = newMain.includes(playerId)
          const inSecond = newSecond.includes(playerId)
          const dual = inMain && inSecond
          const newTier = inMain ? 'main' : inSecond ? 'second' : 'second'

          return {
            teams: state.teams.map(t => t.id === state.playerTeamId ? { ...t, roster: newRoster } : t),
            players: state.players.map(p => p.id === playerId
              ? { ...p, rosterTier: newTier as 'main' | 'second', dualRegistered: dual }
              : p
            ),
          }
        })
      },

      submitRoster: (selectedIds, jerseyMap) => {
        set(state => {
          const allIds = state.players
            .filter(p => p.teamId === state.playerTeamId && p.status !== 'retired')
            .map(p => p.id)
          const secondIds = allIds.filter(id => !selectedIds.includes(id))
          if (selectedIds.length < 16 || selectedIds.length > 20) return state
          if (secondIds.length > 18) return state
          return {
            teams: state.teams.map(t => t.id === state.playerTeamId
              ? { ...t, roster: { main: selectedIds, second: secondIds } }
              : t
            ),
            players: state.players.map(p => {
              if (p.teamId !== state.playerTeamId || p.status === 'retired') return p
              const inMain = selectedIds.includes(p.id)
              return {
                ...p,
                rosterTier: (inMain ? 'main' : 'second') as 'main' | 'second',
                jerseyNumber: jerseyMap[p.id] ?? p.jerseyNumber,
                dualRegistered: false,
              }
            }),
            currentSeason: { ...state.currentSeason, rosterSubmitted: true },
          }
        })
      },

      generateDevProspects: () => {
        set(state => {
          if ((state.currentSeason.devProspects ?? []).length > 0) return state
          const NAMES = ['村上 蒼', '橋本 颯', '田中 悠馬', '小林 煌', '中村 海斗', '伊藤 涼', '山田 蓮', '佐藤 翔', '加藤 健', '鈴木 碧', '松本 楓', '渡辺 律', '井上 光', '木村 颯太', '高橋 凌', '石川 仁', '林 優斗', '近藤 葵', '前田 空', '岡田 風']
          const CITIES = ['東京', '神奈川', '大阪', '愛知', '福岡', '北海道', '宮城', '広島', '静岡', '千葉']
          const SPECS: import('../types').Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
          const prospects: import('../types').DevProspect[] = Array.from({ length: 12 }, (_, i) => {
            const potential = 50 + Math.floor(Math.random() * 45)
            const base = 40 + Math.floor(Math.random() * 30)
            return {
              id: `dev_${state.currentSeason.year}_${i}`,
              name: NAMES[i % NAMES.length],
              age: 18 + Math.floor(Math.random() * 4),
              origin: CITIES[Math.floor(Math.random() * CITIES.length)],
              nationality: Math.random() < 0.15 ? 'FOREIGN' : 'JPN',
              specialty: SPECS[Math.floor(Math.random() * SPECS.length)],
              potential,
              trueRatings: {
                speed: base + Math.floor(Math.random() * 20),
                stamina: base + Math.floor(Math.random() * 20),
                mountainUp: base + Math.floor(Math.random() * 20),
                mountainDown: base + Math.floor(Math.random() * 20),
                pacing: base + Math.floor(Math.random() * 20),
                mental: base + Math.floor(Math.random() * 20),
                recovery: base + Math.floor(Math.random() * 20),
              },
              signingFee: (20 + Math.floor(Math.random() * 60)) * 1000000,
              scouted: false,
            }
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
              ),
            },
          }
        })
      },

      signDevProspect: (prospectId) => {
        set(state => {
          const team = state.teams.find(t => t.id === state.playerTeamId)
          if (!team) return state
          const prospect = (state.currentSeason.devProspects ?? []).find(p => p.id === prospectId)
          if (!prospect) return state
          if (team.finance.budget < prospect.signingFee) return state
          if (team.roster.second.length >= 18) return state

          const existingNums = new Set(state.players.filter(p => p.teamId === state.playerTeamId).map(p => p.jerseyNumber))
          let jerseyNum = 50
          while (existingNums.has(jerseyNum)) jerseyNum++

          const newPlayer: import('../types').Player = {
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
            teamId: state.playerTeamId,
            rosterTier: 'second',
            dualRegistered: false,
            contract: {
              yearsLeft: 2,
              annualSalary: 15000000,
              faEligibleYear: state.currentSeason.year + 2,
              contractType: 'development',
            },
            nationality: prospect.nationality,
            origin: prospect.origin,
            jerseyNumber: jerseyNum,
            status: 'active',
            fatigue: 0,
            morale: 70,
            form: 0,
            career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
          }

          return {
            players: [...state.players, newPlayer],
            teams: state.teams.map(t => t.id === state.playerTeamId
              ? {
                  ...t,
                  roster: { ...t.roster, second: [...t.roster.second, prospect.id] },
                  finance: { ...t.finance, budget: t.finance.budget - prospect.signingFee },
                }
              : t
            ),
            currentSeason: {
              ...state.currentSeason,
              devProspects: (state.currentSeason.devProspects ?? []).filter(p => p.id !== prospectId),
            },
          }
        })
      },

      getTeam: (teamId) => get().teams.find(t => t.id === teamId),
      getPlayer: (playerId) => get().players.find(p => p.id === playerId),
      getTeamPlayers: (teamId, tier) => {
        const team = get().teams.find(t => t.id === teamId)
        if (!team) return []
        return team.roster[tier].map(id => get().players.find(p => p.id === id)).filter((p): p is Player => !!p)
      },
      getSalaryTotal: (teamId) => {
        const team = get().teams.find(t => t.id === teamId)
        if (!team) return 0
        const allIds = [...new Set([...team.roster.main, ...team.roster.second])]
        return allIds.reduce((sum, id) => {
          return sum + (get().players.find(p => p.id === id)?.contract.annualSalary ?? 0)
        }, 0)
      },

      spendScoutPoint: () => {
        set(state => {
          if (state.currentSeason.scoutPoints <= 0) return state
          return { currentSeason: { ...state.currentSeason, scoutPoints: state.currentSeason.scoutPoints - 1 } }
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
              ],
            },
          }
        })
      },

      initScoutPool: () => {
        const state = get()
        if (state.currentSeason.scoutProspects.length > 0) return
        const pool = generateDraftPool(state.currentSeason.year + 1)
        set(s => ({ currentSeason: { ...s.currentSeason, scoutProspects: pool } }))
      },

      releasePlayer: (playerId) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player || player.teamId !== state.playerTeamId) return state
          return {
            players: state.players.map(p =>
              p.id === playerId ? { ...p, teamId: '', jerseyNumber: 0 } : p
            ),
            teams: state.teams.map(t => {
              if (t.id !== state.playerTeamId) return t
              return {
                ...t,
                roster: {
                  main: t.roster.main.filter(id => id !== playerId),
                  second: t.roster.second.filter(id => id !== playerId),
                },
              }
            }),
          }
        })
      },

      signFAPlayer: (playerId, salary?, years?, contractType?, rosterTier?) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player || player.teamId !== '') return state
          const team = state.teams.find(t => t.id === state.playerTeamId)
          if (!team) return state
          const finalSalary = salary ?? player.contract.annualSalary
          const finalYears = years ?? Math.max(player.contract.yearsLeft, 2)
          const finalContractType = contractType ?? 'standard'
          const isDev = finalContractType === 'development'
          const effectiveTier: 'main' | 'second' = rosterTier ?? (isDev ? 'second' : 'main')
          const existingNums = new Set(
            [...team.roster.main, ...team.roster.second].map(id => state.players.find(p => p.id === id)?.jerseyNumber ?? 0)
          )
          let jerseyNum = 1
          while (existingNums.has(jerseyNum)) jerseyNum++
          return {
            players: state.players.map(p =>
              p.id === playerId ? {
                ...p,
                teamId: state.playerTeamId,
                rosterTier: effectiveTier,
                jerseyNumber: jerseyNum,
                status: 'active' as const,
                form: 0,
                contract: { ...p.contract, annualSalary: finalSalary, yearsLeft: finalYears, contractType: finalContractType },
              } : p
            ),
            teams: state.teams.map(t => {
              if (t.id !== state.playerTeamId) return t
              if (effectiveTier === 'main') {
                return { ...t, roster: { ...t.roster, main: [...t.roster.main, playerId] } }
              }
              return { ...t, roster: { ...t.roster, second: [...t.roster.second, playerId] } }
            }),
          }
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
                  annualSalary: Math.round(p.contract.annualSalary * 1.1),
                },
              } : p
            ),
          }
        })
      },

      openPlayerSheet: (id) => set({ openPlayerId: id }),
      setRaceStrategy: (s) => set({ raceStrategy: s }),
      setRaceTeamTalk: (t) => set({ raceTeamTalk: t }),

      setActiveRaceSim: (sim) => set({ activeRaceSim: sim }),
      setActiveRacePhase: (phase) => set({ activeRacePhase: phase }),
      setActiveRaceResults: (results) => set({ activeRaceResults: results }),
      setActiveRaceLocked: (race, index) => set({ activeRaceLockedRace: race, activeRaceLockedRaceIndex: index }),
      clearActiveRace: () => set({ activeRacePhase: null, activeRaceSim: null, activeRaceResults: null, activeRaceLockedRace: null, activeRaceLockedRaceIndex: 0 }),

      setTrainingFocus: (playerId, ratingKey) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            trainingAssignments: ratingKey === null
              ? Object.fromEntries(Object.entries(state.currentSeason.trainingAssignments ?? {}).filter(([k]) => k !== playerId))
              : { ...(state.currentSeason.trainingAssignments ?? {}), [playerId]: ratingKey },
          }
        }))
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
              scoutMissions: [...(state.currentSeason.scoutMissions ?? []), { id: `sm_${Date.now()}`, prospectId, racesLeft: 2 }],
            }
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
              ],
            },
          }
        })
      },

      renewContractOffer: (playerId, salary, years) => {
        const state = get()
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId !== state.playerTeamId) return false
        const ratio = salary / player.contract.annualSalary
        const personality = player.personality ?? 'salary'
        const standings = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
        const myRank = standings.findIndex(s => s.teamId === state.playerTeamId) + 1
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
              headline: `${player.name}が${years}年契約更新`,
              category: 'fa' as const,
              relatedIds: [playerId],
            }, ...state.currentSeason.newsFeed].slice(0, 30),
          },
        }))
        return true
      },

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
              players = players.map(p => p.id === pid ? { ...p, fatigue: Math.max(0, p.fatigue - 40), form: Math.min(2, (p.form ?? 0) + 1), missNextRace: true } : p)
            } else if (choiceIndex === 1) {
              players = players.map(p => p.id === pid ? { ...p, fatigue: Math.max(0, p.fatigue - 15) } : p)
            } else {
              players = players.map(p => p.id === pid ? { ...p, fatigue: Math.min(100, p.fatigue + 15) } : p)
            }
          } else if (event.type === 'player_morale_low' && pid) {
            if (choiceIndex === 0) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 25) } : p)
            } else if (choiceIndex === 1) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 15) } : p)
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 2000000 } } : t)
            } else {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.max(0, p.morale - 15) } : p)
            }
          } else if (event.type === 'player_form_up' && pid) {
            if (choiceIndex === 0) {
              const stat = STATS[Math.floor(Math.random() * STATS.length)]
              players = players.map(p => p.id === pid ? { ...p, ratings: { ...p.ratings, [stat]: Math.min(99, p.ratings[stat] + 1) }, fatigue: Math.min(100, p.fatigue + 8) } : p)
            } else {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 10) } : p)
            }
          } else if (event.type === 'young_breakout' && pid) {
            if (choiceIndex === 0) {
              const stat = STATS[Math.floor(Math.random() * STATS.length)]
              players = players.map(p => p.id === pid ? { ...p, ratings: { ...p.ratings, [stat]: Math.min(99, p.ratings[stat] + 2) }, fatigue: Math.min(100, p.fatigue + 10) } : p)
            }
          } else if (event.type === 'player_wants_renewal' && pid) {
            if (choiceIndex === 0) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 10) } : p)
            } else {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.max(0, p.morale - 5) } : p)
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
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 5) } : p)
            } else if (choiceIndex === 1) {
              gmRep = Math.min(100, gmRep + 2)
            } else {
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 8) } : p)
            }
          } else if (event.type === 'press_conference') {
            if (choiceIndex === 0) {
              gmRep = Math.min(100, gmRep + 3)
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 6) } : p)
            } else if (choiceIndex === 1) {
              gmRep = Math.min(100, gmRep + 1)
            } else {
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 10) } : p)
            }
          } else if (event.type === 'playing_time_demand' && pid) {
            if (choiceIndex === 0) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 20) } : p)
            } else if (choiceIndex === 1) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 5) } : p)
            } else {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.max(0, p.morale - 15) } : p)
            }
          } else if (event.type === 'transfer_request' && pid) {
            const reqPlayer = players.find(p => p.id === pid)
            if (choiceIndex === 0) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 15) } : p)
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 3000000 } } : t)
            } else if (choiceIndex === 2 && reqPlayer) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.max(0, p.morale - 25) } : p)
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
                resolved: false,
              }
              season = { ...season, events: [...(season.events ?? []), escalation] }
            }
          } else if (event.type === 'board_warning') {
            if (choiceIndex === 0) {
              gmRep = Math.min(100, gmRep + 5)
            }
          } else if (event.type === 'player_milestone' && pid) {
            if (choiceIndex === 0) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 15) } : p)
              gmRep = Math.min(100, gmRep + 2)
            } else {
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 8) } : p)
            }
          } else if (event.type === 'veteran_ambition' && pid) {
            if (choiceIndex === 0) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 30), fatigue: Math.min(100, p.fatigue + 5) } : p)
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' && p.id !== pid ? { ...p, morale: Math.min(100, p.morale + 8) } : p)
            } else if (choiceIndex === 1) {
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 12) } : p)
            }
          } else if (event.type === 'rival_provocation') {
            if (choiceIndex === 0) {
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 15) } : p)
              gmRep = Math.min(100, gmRep + 3)
            } else if (choiceIndex === 1) {
              gmRep = Math.min(100, gmRep + 4)
            }
          } else if (event.type === 'ai_poaching' && pid) {
            if (choiceIndex === 0) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 20) } : p)
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 3000000 } } : t)
            } else if (choiceIndex === 1) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 5) } : p)
            } else {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.max(0, p.morale - 20) } : p)
            }
          } else if (event.type === 'team_chemistry') {
            if (choiceIndex === 0) {
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 10), fatigue: Math.min(100, p.fatigue + 3) } : p)
            } else if (choiceIndex === 1) {
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 20), fatigue: Math.min(100, p.fatigue + 8) } : p)
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 2000000 } } : t)
            }
          } else if (event.type === 'player_retirement' && pid) {
            if (choiceIndex === 0) {
              // Stay bonus — pay 20M, player morale up
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 20) } : p)
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 20000000 } } : t)
            } else {
              // Accept retirement — mark player as retired, gmRep up
              const retPlayer = players.find(p => p.id === pid)
              if (retPlayer) {
                const isLegend = retPlayer.career.segmentWins >= 5 || retPlayer.career.championships >= 1 || retPlayer.yearsPro >= 4
                players = players.map(p => p.id === pid ? { ...p, status: 'retired' as const, teamId: '' } : p)
                players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 8) } : p)
                gmRep = Math.min(100, gmRep + 3)
                if (isLegend) {
                  teams = teams.map(t => {
                    if (t.id !== state.playerTeamId) return t
                    const legend = {
                      name: retPlayer.name,
                      specialty: retPlayer.specialty,
                      retiredAge: retPlayer.age,
                      retiredYear: state.currentSeason.year,
                      peakOvr: Math.max(ovr(retPlayer), ...(retPlayer.ovrHistory?.map(h => h.ovr) ?? [])),
                      yearsInTeam: retPlayer.yearsPro,
                      career: { segmentWins: retPlayer.career.segmentWins, championships: retPlayer.career.championships, mvpAwards: retPlayer.career.mvpAwards },
                    }
                    return { ...t, roster: { ...t.roster, main: t.roster.main.filter(id => id !== pid) }, history: { ...t.history, legends: [...(t.history.legends ?? []), legend] } }
                  })
                } else {
                  teams = teams.map(t => t.id === state.playerTeamId ? { ...t, roster: { ...t.roster, main: t.roster.main.filter(id => id !== pid) } } : t)
                }
              }
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
              players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.max(0, p.morale - 10) } : p)
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + 15000000 } } : t)
            }
          }

          season = { ...season, events: (season.events ?? []).map(e => e.id === eventId ? { ...e, resolved: true, choiceIndex } : e) }
          return { players, teams, gmRep, currentSeason: season }
        })
      },

      acceptTradeOffer: (offerId) => {
        set(state => {
          const offer = (state.currentSeason.pendingTradeOffers ?? []).find(o => o.id === offerId)
          if (!offer) return state
          let players = state.players
          let teams = state.teams

          // Move offered players to player team
          for (const pid of offer.offeredPlayerIds) {
            const p = players.find(pl => pl.id === pid)
            if (!p) continue
            const fromTeam = teams.find(t => t.id === offer.fromTeamId)
            const toTeam = teams.find(t => t.id === state.playerTeamId)
            if (!fromTeam || !toTeam) continue
            const toMainFull = toTeam.roster.main.length >= 20
            teams = teams.map(t => {
              if (t.id === offer.fromTeamId) return { ...t, roster: { ...t.roster, main: t.roster.main.filter(id => id !== pid) } }
              if (t.id === state.playerTeamId) return toMainFull
                ? { ...t, roster: { ...t.roster, second: [...t.roster.second, pid] } }
                : { ...t, roster: { ...t.roster, main: [...t.roster.main, pid] } }
              return t
            })
            players = players.map(pl => pl.id === pid ? { ...pl, teamId: state.playerTeamId, rosterTier: toTeam.roster.main.length >= 20 ? 'second' as const : 'main' as const } : pl)
          }

          // Move requested players to AI team
          for (const pid of offer.requestedPlayerIds) {
            teams = teams.map(t => {
              if (t.id === state.playerTeamId) return { ...t, roster: { ...t.roster, main: t.roster.main.filter(id => id !== pid) } }
              if (t.id === offer.fromTeamId) return { ...t, roster: { ...t.roster, main: [...t.roster.main, pid] } }
              return t
            })
            players = players.map(pl => pl.id === pid ? { ...pl, teamId: offer.fromTeamId, rosterTier: 'main' as const } : pl)
          }

          // Transfer draft picks
          function matchPick(picks: typeof teams[0]['draftPicks'], key: string) {
            return picks.find(pk => `${pk.year}-R${pk.round}-${pk.pickNumber}` === key)
          }
          const theirCurrentPicks = teams.find(t => t.id === offer.fromTeamId)?.draftPicks ?? []
          const myCurrentPicks = teams.find(t => t.id === state.playerTeamId)?.draftPicks ?? []
          const offeredPicks = (offer.offeredPickKeys ?? []).map(k => matchPick(theirCurrentPicks, k)).filter(Boolean) as typeof theirCurrentPicks
          const requestedPicks = (offer.requestedPickKeys ?? []).map(k => matchPick(myCurrentPicks, k)).filter(Boolean) as typeof myCurrentPicks
          if (offeredPicks.length > 0 || requestedPicks.length > 0) {
            teams = teams.map(t => {
              if (t.id === offer.fromTeamId) return {
                ...t,
                draftPicks: [...(t.draftPicks ?? []).filter(pk => !offeredPicks.includes(pk)), ...requestedPicks],
              }
              if (t.id === state.playerTeamId) return {
                ...t,
                draftPicks: [...(t.draftPicks ?? []).filter(pk => !requestedPicks.includes(pk)), ...offeredPicks],
              }
              return t
            })
          }

          const fromTeamName = teams.find(t => t.id === offer.fromTeamId)?.shortName ?? ''
          const tradeNews = {
            date: state.currentSeason.races[state.currentSeason.currentRaceIndex - 1]?.date ?? `${state.currentSeason.year}-06-01`,
            headline: `${fromTeamName}とのトレード成立`,
            category: 'trade' as const,
            relatedIds: [...offer.offeredPlayerIds, ...offer.requestedPlayerIds],
          }
          return {
            players, teams,
            currentSeason: {
              ...state.currentSeason,
              pendingTradeOffers: (state.currentSeason.pendingTradeOffers ?? []).filter(o => o.id !== offerId),
              newsFeed: [tradeNews, ...state.currentSeason.newsFeed].slice(0, 30),
            },
          }
        })
      },

      rejectTradeOffer: (offerId) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            pendingTradeOffers: (state.currentSeason.pendingTradeOffers ?? []).filter(o => o.id !== offerId),
          },
        }))
      },

      executeTransferPurchase: (listingId, price) => {
        const state = get()
        const listing = (state.currentSeason.transferListings ?? []).find(l => l.id === listingId)
        if (!listing) return false
        const player = state.players.find(p => p.id === listing.playerId)
        if (!player || player.teamId !== listing.fromTeamId) return false
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam || myTeam.finance.budget < price) return false
        const existingNums = new Set(myTeam.roster.main.map(id => state.players.find(p => p.id === id)?.jerseyNumber ?? 0))
        let jerseyNum = 1
        while (existingNums.has(jerseyNum)) jerseyNum++
        const mktMainFull = myTeam.roster.main.length >= 20
        set(state => ({
          players: state.players.map(p => p.id === listing.playerId ? {
            ...p, teamId: state.playerTeamId, rosterTier: mktMainFull ? 'second' as const : 'main' as const, jerseyNumber: jerseyNum,
            status: 'active' as const, contract: { ...p.contract, yearsLeft: Math.max(p.contract.yearsLeft, 2) },
          } : p),
          teams: state.teams.map(t => {
            if (t.id === state.playerTeamId) return mktMainFull
              ? { ...t, finance: { ...t.finance, budget: t.finance.budget - price }, roster: { ...t.roster, second: [...t.roster.second, listing.playerId] } }
              : { ...t, finance: { ...t.finance, budget: t.finance.budget - price }, roster: { ...t.roster, main: [...t.roster.main, listing.playerId] } }
            if (t.id === listing.fromTeamId) return { ...t, roster: { ...t.roster, main: t.roster.main.filter(id => id !== listing.playerId) } }
            return t
          }),
          currentSeason: {
            ...state.currentSeason,
            transferListings: (state.currentSeason.transferListings ?? []).filter(l => l.id !== listingId),
            newsFeed: [{ date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}を移籍金${Math.round(price / 10000)}万で獲得`, category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30),
          },
        }))
        return true
      },

      acceptIncomingOffer: (offerId) => {
        const state = get()
        const offer = (state.currentSeason.incomingOffers ?? []).find(o => o.id === offerId)
        if (!offer) return
        const player = state.players.find(p => p.id === offer.playerId)
        if (!player || player.teamId !== state.playerTeamId) return
        const buyingTeam = state.teams.find(t => t.id === offer.fromTeamId)
        if (!buyingTeam) return
        const existingNums = new Set(buyingTeam.roster.main.map(id => state.players.find(p => p.id === id)?.jerseyNumber ?? 0))
        let jerseyNum = 1
        while (existingNums.has(jerseyNum)) jerseyNum++
        set(state => ({
          players: state.players.map(p => p.id === offer.playerId ? { ...p, teamId: offer.fromTeamId, jerseyNumber: jerseyNum, rosterTier: 'main' as const } : p),
          teams: state.teams.map(t => {
            if (t.id === state.playerTeamId) return { ...t, finance: { ...t.finance, budget: t.finance.budget + offer.offeredPrice }, roster: { ...t.roster, main: t.roster.main.filter(id => id !== offer.playerId), second: t.roster.second.filter(id => id !== offer.playerId) } }
            if (t.id === offer.fromTeamId) return { ...t, roster: { ...t.roster, main: [...t.roster.main, offer.playerId] } }
            return t
          }),
          currentSeason: {
            ...state.currentSeason,
            incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId),
            newsFeed: [{ date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}を${buyingTeam.shortName}へ移籍金${Math.round(offer.offeredPrice / 10000)}万で放出`, category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30),
          },
        }))
      },

      declineIncomingOffer: (offerId) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId),
          },
        }))
      },

      initiateContractRenewal: (playerId) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player || player.teamId !== state.playerTeamId) return state
          const existing = (state.currentSeason.contractRequests ?? []).find(r => r.playerId === playerId && r.status !== 'accepted' && r.status !== 'rejected')
          if (existing) return state
          const req: ContractRequest = {
            id: `cr_${Date.now()}`,
            playerId,
            initiatedBy: 'gm',
            round: 1,
            status: 'pending_gm',
            demandSalary: Math.round(player.contract.annualSalary * 1.12 / 500000) * 500000,
            demandYears: 2,
            offerSalary: Math.round(player.contract.annualSalary * 1.05 / 500000) * 500000,
            offerYears: 2,
          }
          return { currentSeason: { ...state.currentSeason, contractRequests: [...(state.currentSeason.contractRequests ?? []), req] } }
        })
      },

      generateContractRequests: () => {
        set(state => {
          const myPlayers = state.players.filter(p => p.teamId === state.playerTeamId && p.contract.yearsLeft === 1)
          const existing = new Set((state.currentSeason.contractRequests ?? []).filter(r => r.status !== 'rejected').map(r => r.playerId))
          const newReqs: ContractRequest[] = myPlayers.filter(p => !existing.has(p.id)).map(p => {
            const personality = p.personality ?? 'salary'
            const mult = personality === 'salary' ? 1.2 : personality === 'winning' ? 1.1 : 1.06
            return {
              id: `cr_${Date.now()}_${p.id}`,
              playerId: p.id,
              initiatedBy: 'player' as const,
              round: 1,
              status: 'pending_gm' as const,
              demandSalary: Math.round(p.contract.annualSalary * mult / 500000) * 500000,
              demandYears: personality === 'loyalty' ? 3 : 2,
              offerSalary: 0,
              offerYears: 0,
            }
          })
          const retPlayers = state.players.filter(p => p.teamId === state.playerTeamId && p.age >= 35)
          const existRet = new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId))
          const newRet = retPlayers.filter(p => !existRet.has(p.id) && Math.random() < 0.4).map(p => ({ playerId: p.id, age: p.age }))
          const racesPlayed = state.currentSeason.currentRaceIndex ?? 0
          const tranPlayers = racesPlayed > 0
            ? state.players.filter(p => p.teamId === state.playerTeamId && p.rosterTier === 'second' && p.age < 28)
            : []
          const existTran = new Set((state.currentSeason.transferRequests ?? []).map(r => r.playerId))
          const newTran = tranPlayers.filter(p => !existTran.has(p.id) && Math.random() < 0.08).slice(0, 2).map(p => ({ playerId: p.id, reason: 'playing_time' as const }))
          if (newReqs.length === 0 && newRet.length === 0 && newTran.length === 0) return state
          return {
            currentSeason: {
              ...state.currentSeason,
              contractRequests: [...(state.currentSeason.contractRequests ?? []), ...newReqs],
              retirementRequests: [...(state.currentSeason.retirementRequests ?? []), ...newRet],
              transferRequests: [...(state.currentSeason.transferRequests ?? []), ...newTran],
            }
          }
        })
      },

      submitContractRenewalOffer: (requestId, salary, years, contractType, teamRole) => {
        set(state => {
          const req = (state.currentSeason.contractRequests ?? []).find(r => r.id === requestId)
          if (!req) return state
          const player = state.players.find(p => p.id === req.playerId)
          if (!player) return state
          const myRank = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints).findIndex(s => s.teamId === state.playerTeamId) + 1
          const isGoodTeam = myRank > 0 && myRank <= 5
          const personality = player.personality ?? 'salary'
          const roundFactor = 1 + (req.round - 1) * 0.03
          const demand = Math.round(req.demandSalary * roundFactor / 500000) * 500000
          const ratio = demand > 0 ? salary / demand : 2
          const acceptThresh = personality === 'winning' && isGoodTeam ? 0.90 : personality === 'loyalty' ? 0.92 : 0.95
          const counterThresh = personality === 'salary' ? 0.77 : 0.73
          const isLastRound = req.round >= 3
          let newStatus: ContractRequest['status']
          let counterSalary: number | undefined
          let counterYears: number | undefined
          if (ratio >= acceptThresh) {
            newStatus = 'accepted'
          } else if (ratio >= counterThresh && !isLastRound) {
            newStatus = 'countered'
            counterSalary = Math.round(demand * 1.03 / 500000) * 500000
            counterYears = Math.max(years, req.demandYears)
          } else {
            newStatus = 'rejected'
          }
          const updatedReq = { ...req, status: newStatus, offerSalary: salary, offerYears: years, counterSalary, counterYears, offerContractType: contractType, offerTeamRole: teamRole }
          let newPlayers = state.players
          if (newStatus === 'accepted') {
            const isDev = contractType === 'development'
            const effectiveTier: 'main' | 'second' = isDev ? 'second' : 'main'
            newPlayers = state.players.map(p => p.id === player.id ? {
              ...p,
              rosterTier: effectiveTier,
              teamRole: teamRole ?? p.teamRole,
              contract: { ...p.contract, annualSalary: salary, yearsLeft: years, contractType: contractType ?? p.contract.contractType },
            } : p)
          }
          return {
            players: newPlayers,
            currentSeason: { ...state.currentSeason, contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? updatedReq : r) }
          }
        })
      },

      acceptContractCounter: (requestId) => {
        set(state => {
          const req = (state.currentSeason.contractRequests ?? []).find(r => r.id === requestId && r.status === 'countered')
          if (!req || !req.counterSalary || !req.counterYears) return state
          const isDev = req.offerContractType === 'development'
          const effectiveTier: 'main' | 'second' = isDev ? 'second' : 'main'
          return {
            players: state.players.map(p => p.id === req.playerId ? {
              ...p,
              rosterTier: effectiveTier,
              teamRole: req.offerTeamRole ?? p.teamRole,
              contract: { ...p.contract, annualSalary: req.counterSalary!, yearsLeft: req.counterYears!, contractType: req.offerContractType ?? p.contract.contractType },
            } : p),
            currentSeason: { ...state.currentSeason, contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? { ...r, status: 'accepted' as const } : r) }
          }
        })
      },

      reNegotiateContract: (requestId) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            contractRequests: (state.currentSeason.contractRequests ?? []).map(r =>
              r.id === requestId && r.status === 'countered'
                ? { ...r, round: r.round + 1, status: 'pending_gm' as const, offerSalary: r.counterSalary ?? r.offerSalary, offerYears: r.counterYears ?? r.offerYears }
                : r
            )
          }
        }))
      },

      abandonContractRenewal: (requestId) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? { ...r, status: 'rejected' as const } : r)
          }
        }))
      },

      releasePlayerWithBuyout: (playerId) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player || player.teamId !== state.playerTeamId) return state
          const buyoutCost = player.contract.annualSalary * Math.max(0, player.contract.yearsLeft - 1)
          return {
            players: state.players.map(p => p.id === playerId ? { ...p, teamId: '', jerseyNumber: 0 } : p),
            teams: state.teams.map(t => {
              if (t.id !== state.playerTeamId) return t
              return {
                ...t,
                finance: { ...t.finance, budget: Math.max(0, t.finance.budget - buyoutCost) },
                roster: {
                  main: t.roster.main.filter(id => id !== playerId),
                  second: t.roster.second.filter(id => id !== playerId),
                },
              }
            }),
          }
        })
      },

      counterIncomingOffer: (offerId, counterPrice) => {
        set(state => {
          const offer = (state.currentSeason.incomingOffers ?? []).find(o => o.id === offerId)
          if (!offer) return state
          const buyingTeam = state.teams.find(t => t.id === offer.fromTeamId)
          const maxBudget = buyingTeam?.finance.budget ?? 0
          if (counterPrice <= maxBudget) {
            const existingNums = new Set(buyingTeam!.roster.main.map(id => state.players.find(p => p.id === id)?.jerseyNumber ?? 0))
            let jerseyNum = 1
            while (existingNums.has(jerseyNum)) jerseyNum++
            return {
              players: state.players.map(p => p.id === offer.playerId ? { ...p, teamId: offer.fromTeamId, jerseyNumber: jerseyNum, rosterTier: 'main' as const } : p),
              teams: state.teams.map(t => {
                if (t.id === state.playerTeamId) return { ...t, finance: { ...t.finance, budget: t.finance.budget + counterPrice }, roster: { ...t.roster, main: t.roster.main.filter(id => id !== offer.playerId), second: t.roster.second.filter(id => id !== offer.playerId) } }
                if (t.id === offer.fromTeamId) return { ...t, roster: { ...t.roster, main: [...t.roster.main, offer.playerId] } }
                return t
              }),
              currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) }
            }
          } else {
            return { currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }
          }
        })
      },

      dismissRetirementRequest: (playerId) => set(state => ({
        currentSeason: { ...state.currentSeason, retirementRequests: (state.currentSeason.retirementRequests ?? []).filter(r => r.playerId !== playerId) }
      })),

      acceptRetirement: (playerId) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player) return state
          const isLegend = player.career.segmentWins >= 5 || player.career.championships >= 1 || player.yearsPro >= 4
          const newTeams = state.teams.map(t => {
            if (t.id !== state.playerTeamId) return t
            const base = { ...t, roster: { main: t.roster.main.filter(id => id !== playerId), second: t.roster.second.filter(id => id !== playerId) } }
            if (!isLegend) return base
            const legend = {
              name: player.name, specialty: player.specialty, retiredAge: player.age,
              retiredYear: state.currentSeason.year,
              peakOvr: Math.max(ovr(player), ...(player.ovrHistory?.map(h => h.ovr) ?? [])),
              yearsInTeam: player.yearsPro,
              career: { segmentWins: player.career.segmentWins, championships: player.career.championships, mvpAwards: player.career.mvpAwards },
            }
            return { ...base, history: { ...base.history, legends: [...(base.history.legends ?? []), legend] } }
          })
          return {
            players: state.players.map(p => p.id === playerId ? { ...p, status: 'retired' as const, teamId: '', jerseyNumber: 0 } : p),
            teams: newTeams,
            currentSeason: { ...state.currentSeason, retirementRequests: (state.currentSeason.retirementRequests ?? []).filter(r => r.playerId !== playerId) }
          }
        })
      },

      dismissTransferRequest: (playerId) => set(state => ({
        currentSeason: { ...state.currentSeason, transferRequests: (state.currentSeason.transferRequests ?? []).filter(r => r.playerId !== playerId) }
      })),

      submitTransferBid: (playerId, fee) => {
        const state = get()
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId === state.playerTeamId || player.teamId === '') return
        const existing = (state.currentSeason.transferBids ?? []).find(b => b.playerId === playerId && (b.status === 'pending' || b.status === 'fee_accepted' || b.status === 'countered' || b.status === 'player_neg'))
        if (existing) return
        const bid = { id: `bid_${Date.now()}`, playerId, targetTeamId: player.teamId, offeredFee: fee, round: 1, status: 'pending' as const, submittedAtRace: state.currentSeason.currentRaceIndex }
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
            ),
          },
        }))
      },

      rejectTransferBid: (bidId) => {
        set(s => ({
          currentSeason: {
            ...s.currentSeason,
            transferBids: (s.currentSeason.transferBids ?? []).filter(b => b.id !== bidId),
          },
        }))
      },

      finalizeTransfer: (bidId, salary, years) => {
        const state = get()
        const bid = (state.currentSeason.transferBids ?? []).find(b => b.id === bidId)
        if (!bid || bid.status !== 'fee_accepted') return false
        const player = state.players.find(p => p.id === bid.playerId)
        if (!player || player.teamId !== bid.targetTeamId) return false
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam || myTeam.finance.budget < bid.offeredFee) return false
        const existingNums = new Set(myTeam.roster.main.map(id => state.players.find(p => p.id === id)?.jerseyNumber ?? 0))
        let jerseyNum = 1
        while (existingNums.has(jerseyNum)) jerseyNum++
        const ftMainFull = myTeam.roster.main.length >= 20
        set(s => ({
          players: s.players.map(p => p.id === bid.playerId
            ? { ...p, teamId: s.playerTeamId, rosterTier: ftMainFull ? 'second' as const : 'main' as const, jerseyNumber: jerseyNum, status: 'active' as const, contract: { ...p.contract, annualSalary: salary, yearsLeft: years, faEligibleYear: s.currentSeason.year + years } }
            : p
          ),
          teams: s.teams.map(t => {
            if (t.id === s.playerTeamId) return ftMainFull
              ? { ...t, finance: { ...t.finance, budget: t.finance.budget - bid.offeredFee }, roster: { ...t.roster, second: [...t.roster.second, bid.playerId] } }
              : { ...t, finance: { ...t.finance, budget: t.finance.budget - bid.offeredFee }, roster: { ...t.roster, main: [...t.roster.main, bid.playerId] } }
            if (t.id === bid.targetTeamId) return { ...t, roster: { ...t.roster, main: t.roster.main.filter(id => id !== bid.playerId) } }
            return t
          }),
          currentSeason: {
            ...s.currentSeason,
            transferBids: (s.currentSeason.transferBids ?? []).map(b => b.id === bidId ? { ...b, status: 'complete' as const } : b),
            transferListings: (s.currentSeason.transferListings ?? []).filter(l => l.playerId !== bid.playerId),
            newsFeed: [{ date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date ?? `${s.currentSeason.year}-06-01`, headline: `${player.name}を移籍金${Math.round(bid.offeredFee / 10000)}万・年俸${Math.round(salary / 10000)}万で獲得`, category: 'trade' as const, relatedIds: [player.id] }, ...s.currentSeason.newsFeed].slice(0, 30),
          },
        }))
        return true
      },

      listMyPlayerForSale: (playerId, askingPrice) => {
        const state = get()
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId !== state.playerTeamId) return
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
          competingTeams: [],
        }
        set(s => ({ currentSeason: { ...s.currentSeason, transferListings: [...(s.currentSeason.transferListings ?? []), listing] } }))
      },

      delistMyPlayer: (playerId) => {
        set(s => ({
          currentSeason: {
            ...s.currentSeason,
            transferListings: (s.currentSeason.transferListings ?? []).filter(l => !(l.playerId === playerId && l.fromTeamId === s.playerTeamId)),
          },
        }))
      },

      sellDraftPick: (pickKey, targetTeamId, price) => {
        const state = get()
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        const buyTeam = state.teams.find(t => t.id === targetTeamId)
        if (!myTeam || !buyTeam) return false
        const pick = myTeam.draftPicks.find(p => `${p.year}-R${p.round}-${p.pickNumber}` === pickKey)
        if (!pick) return false
        const fairVal = pick.round === 1 ? 25_000_000 : 8_000_000
        if (price > fairVal * 1.3) return false
        const date = state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`
        set(s => ({
          teams: s.teams.map(t => {
            if (t.id === s.playerTeamId) return {
              ...t,
              finance: { ...t.finance, budget: t.finance.budget + price },
              draftPicks: t.draftPicks.filter(p => `${p.year}-R${p.round}-${p.pickNumber}` !== pickKey),
            }
            if (t.id === targetTeamId) return {
              ...t,
              draftPicks: [...t.draftPicks, pick],
            }
            return t
          }),
          currentSeason: {
            ...s.currentSeason,
            newsFeed: [{
              date,
              headline: `${myTeam.shortName}が${pick.year}年${pick.round}巡目指名権を${buyTeam.shortName}へ売却（${Math.round(price / 10000)}万）`,
              category: 'trade' as const,
              relatedIds: [],
            }, ...s.currentSeason.newsFeed].slice(0, 30),
          },
        }))
        return true
      },

      scoutOpponentPlayer: (playerId, level) => {
        set(state => {
          const cost = level === 1 ? 1 : 2
          if (state.currentSeason.scoutPoints < cost) return state
          const existing = (state.currentSeason.scoutedOpponents ?? []).find(s => s.playerId === playerId)
          if (existing && existing.level >= level) return state
          return {
            currentSeason: {
              ...state.currentSeason,
              scoutPoints: state.currentSeason.scoutPoints - cost,
              scoutedOpponents: [
                ...(state.currentSeason.scoutedOpponents ?? []).filter(s => s.playerId !== playerId),
                { playerId, level, year: state.currentSeason.year },
              ],
            },
          }
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

      setTrainingPlan: (plan) => {
        set(state => ({
          currentSeason: { ...state.currentSeason, trainingPlan: plan },
        }))
      },

      getTransferWindow: () => {
        const { currentSeason } = get()
        if (currentSeason.phase === 'preseason') return { open: false, label: 'ウィンドウ閉鎖中', racesUntil: 2 }
        if (currentSeason.phase === 'regular') {
          const idx = currentSeason.currentRaceIndex
          if (idx >= 2 && idx <= 9) return { open: true, label: '移籍ウィンドウ', racesUntil: 9 - idx + 1 }
          if (idx < 2) return { open: false, label: 'ウィンドウ閉鎖中', racesUntil: 2 - idx }
          return { open: false, label: 'ウィンドウ閉鎖中', racesUntil: null }
        }
        return { open: true, label: 'オフシーズン', racesUntil: null }
      },

      getRosterWindow: () => {
        const { currentSeason } = get()
        if (currentSeason.phase === 'preseason') return { open: true, label: '開幕前ウィンドウ' }
        if (currentSeason.phase === 'regular' && currentSeason.currentRaceIndex === 5)
          return { open: true, label: '中間ウィンドウ（第5戦後）' }
        return { open: false, label: 'ウィンドウ閉鎖中' }
      },

      ensureFuturePicks: () => {
        const state = get()
        const yr = state.currentSeason.year
        const anyMissingPicks = state.teams.some(t =>
          !(t.draftPicks ?? []).some(pk => pk.year > yr)
        )
        if (!anyMissingPicks) return
        const numTeams = state.teams.length
        const updatedTeams = state.teams.map((t, tIdx) => {
          const newPicks: typeof t.draftPicks = []
          for (const year of [yr + 1, yr + 2]) {
            for (const round of [1, 2]) {
              if (!(t.draftPicks ?? []).some(pk => pk.year === year && pk.round === round && pk.originallyOwnedBy === t.id)) {
                newPicks.push({ year, round, pickNumber: Math.max(1, numTeams - tIdx), originallyOwnedBy: t.id })
              }
            }
          }
          return newPicks.length > 0 ? { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] } : t
        })
        set({ teams: updatedTeams })
      },

      setRivalTeam: (id) => set({ rivalTeamId: id }),

      claimPreseasonCards: () => {
        set(state => {
          if (state.currentSeason.campBonus?.applied) return state
          const lastSeason = state.pastSeasons[state.pastSeasons.length - 1]
          let rank = 0
          if (lastSeason?.standings?.length) {
            const sorted = [...lastSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
            rank = sorted.findIndex(s => s.teamId === state.playerTeamId) + 1
          }
          type Dist = { rarity: CardRarity; count: number }
          const dist: Dist[] =
            rank === 1 ? [{ rarity: 'legendary', count: 1 }, { rarity: 'epic', count: 1 }, { rarity: 'rare', count: 2 }, { rarity: 'normal', count: 2 }] :
            rank === 2 ? [{ rarity: 'epic', count: 1 }, { rarity: 'rare', count: 2 }, { rarity: 'normal', count: 3 }] :
            rank === 3 ? [{ rarity: 'epic', count: 1 }, { rarity: 'rare', count: 1 }, { rarity: 'normal', count: 4 }] :
            rank <= 6  ? [{ rarity: 'rare', count: 2 }, { rarity: 'normal', count: 4 }] :
            rank <= 10 ? [{ rarity: 'rare', count: 1 }, { rarity: 'normal', count: 5 }] :
            rank <= 14 ? [{ rarity: 'normal', count: 6 }] :
            rank >= 15 ? [{ rarity: 'epic', count: 1 }, { rarity: 'normal', count: 6 }] :
            [{ rarity: 'rare', count: 1 }, { rarity: 'normal', count: 5 }]
          const STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
          const EXP: Record<CardRarity, number> = { normal: 300, rare: 1200, epic: 4000, legendary: 10000 }
          const cards: TrainingCard[] = []
          let idx = 0
          for (const { rarity, count } of dist) {
            for (let i = 0; i < count; i++) {
              cards.push({
                id: `preseason_${state.playerTeamId}_${Date.now()}_${idx++}`,
                statKey: STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)],
                rarity,
                value: EXP[rarity],
              })
            }
          }
          return {
            trainingCards: [...(state.trainingCards ?? []), ...cards],
            currentSeason: { ...state.currentSeason, campBonus: { type: 'preseason_cards', applied: true } },
          }
        })
      },

      tradePlayer: (offeredIds, requestedIds, targetTeamId, transferFee = 0, offerPickKeys = [], requestPickKeys = []) => {
        const state = get()
        const offered = offeredIds.map(id => state.players.find(p => p.id === id)).filter((p): p is Player => !!p)
        const requested = requestedIds.map(id => state.players.find(p => p.id === id)).filter((p): p is Player => !!p)
        const hasContent = offered.length > 0 || offerPickKeys.length > 0
        const hasRequest = requested.length > 0 || requestPickKeys.length > 0
        if (!hasContent || !hasRequest) return false

        function matchPick(picks: typeof state.teams[0]['draftPicks'], key: string) {
          return picks.find(pk => `${pk.year}-R${pk.round}-${pk.pickNumber}` === key)
        }

        set(state => {
          const myMainAfterTrade = state.teams.find(t => t.id === state.playerTeamId)?.roster.main.filter(id => !offeredIds.includes(id)) ?? []
          const incomingIds = requestedIds.filter(id => !myMainAfterTrade.includes(id))
          const overflowIds = incomingIds.slice(Math.max(0, 20 - myMainAfterTrade.length))
          const mainIncomingIds = incomingIds.slice(0, Math.max(0, 20 - myMainAfterTrade.length))

          const players = state.players.map(p => {
            if (offeredIds.includes(p.id)) return { ...p, teamId: targetTeamId, rosterTier: 'main' as const }
            if (mainIncomingIds.includes(p.id)) return { ...p, teamId: state.playerTeamId, rosterTier: 'main' as const }
            if (overflowIds.includes(p.id)) return { ...p, teamId: state.playerTeamId, rosterTier: 'second' as const }
            return p
          })
          const myTeamPicks = state.teams.find(t => t.id === state.playerTeamId)?.draftPicks ?? []
          const theirPicks = state.teams.find(t => t.id === targetTeamId)?.draftPicks ?? []
          const offeredPicks = offerPickKeys.map(k => matchPick(myTeamPicks, k)).filter(Boolean) as typeof myTeamPicks
          const requestedPicks = requestPickKeys.map(k => matchPick(theirPicks, k)).filter(Boolean) as typeof theirPicks

          const teams = state.teams.map(t => {
            if (t.id === state.playerTeamId) return {
              ...t,
              roster: { main: [...myMainAfterTrade, ...mainIncomingIds], second: [...t.roster.second.filter(id => !offeredIds.includes(id)), ...overflowIds] },
              finance: { ...t.finance, budget: (t.finance.budget ?? 0) - transferFee },
              draftPicks: [...(t.draftPicks ?? []).filter(pk => !offeredPicks.includes(pk)), ...requestedPicks],
            }
            if (t.id === targetTeamId) return {
              ...t,
              roster: { ...t.roster, main: [...t.roster.main.filter(id => !requestedIds.includes(id)), ...offeredIds] },
              finance: { ...t.finance, budget: (t.finance.budget ?? 0) + transferFee },
              draftPicks: [...(t.draftPicks ?? []).filter(pk => !requestedPicks.includes(pk)), ...offeredPicks],
            }
            return t
          })
          const feeNote = transferFee > 0 ? ` (+${Math.round(transferFee/10000)}万)` : transferFee < 0 ? ` (受取${Math.round(-transferFee/10000)}万)` : ''
          const pickNote = [...offerPickKeys.map(() => `指名権`), ...requestPickKeys.map(() => `指名権`)].length > 0 ? ` [指名権含む]` : ''
          const tradeDate = state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`
          const parts = [...offered.map(p => p.name), ...offerPickKeys.map(k => k.split('-').slice(0,2).join(' '))]
          const rparts = [...requested.map(p => p.name), ...requestPickKeys.map(k => k.split('-').slice(0,2).join(' '))]
          const tradeNews = { date: tradeDate, headline: `トレード成立：${parts.join('・')} ↔ ${rparts.join('・')}${feeNote}${pickNote}`, category: 'trade' as const, relatedIds: [...offeredIds, ...requestedIds] }
          return { players, teams, currentSeason: { ...state.currentSeason, newsFeed: [tradeNews, ...state.currentSeason.newsFeed].slice(0, 30) } }
        })
        return true
      },

      runSecondTeamRace: (lineup, strategy = 'balanced') => {
        const state = get()
        const { currentSeason, teams, players, playerTeamId } = state
        if (currentSeason.reserveLeagueJoined === false) return
        const stRaceIndex = currentSeason.secondTeamRaceIndex ?? 0
        const stRaces = currentSeason.secondTeamRaces ?? []
        if (stRaceIndex >= stRaces.length) return

        const race = stRaces[stRaceIndex]
        const seasonProgress = stRaceIndex / stRaces.length

        // Build CPU lineups: prefer second tier, fallback to weakest main-team players
        const lineups: Record<string, Record<number, string>> = { [playerTeamId]: lineup }
        for (const team of teams) {
          if (team.id === playerTeamId) continue
          const pool = [
            ...team.roster.second.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p && p.status === 'active'),
            ...team.roster.main.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p && p.status === 'active').sort((a, b) => ovr(a) - ovr(b)),
          ]
          const cpuLineup: Record<number, string> = {}
          for (let i = 0; i < race.segments.length; i++) {
            if (pool[i]) cpuLineup[race.segments[i].index] = pool[i].id
          }
          lineups[team.id] = cpuLineup
        }

        const results = simulateRace(race, lineups, teams, players, seasonProgress)

        set(state => {
          const updatedRaces = (state.currentSeason.secondTeamRaces ?? []).map((r, i) =>
            i === stRaceIndex ? { ...r, results } : r
          )

          const stStandings = state.currentSeason.secondTeamStandings ??
            state.teams.map(t => ({ teamId: t.id, totalPoints: 0, raceResults: [] }))
          const updatedStStandings = stStandings.map(s => {
            const tr = results.teamRankings.find(r => r.teamId === s.teamId)
            if (!tr) return s
            const earned = tr.positionPoints + tr.segmentPoints
            return {
              ...s,
              totalPoints: s.totalPoints + earned,
              raceResults: [...s.raceResults, { raceId: race.id, rank: tr.rank, points: earned }],
            }
          })

          // Fatigue based on strategy + young player development
          const stratMult = strategy === 'aggressive' ? 1.4 : strategy === 'conservative' ? 0.65 : 1.0
          const racingIds = new Set(Object.values(lineups[playerTeamId] ?? {}).filter(Boolean) as string[])
          const STATS = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery'] as const
          const updatedPlayers = state.players.map(p => {
            if (!racingIds.has(p.id)) return p
            const baseFatigue = Math.round(4 * stratMult)
            const newFatigue = Math.min(100, p.fatigue + baseFatigue)
            if (p.age <= 24 && Math.random() < 0.22 && p.status === 'active') {
              const stat = STATS[Math.floor(Math.random() * STATS.length)]
              const cur = (p.ratings as Record<string, number>)[stat] ?? 0
              if (cur < 99) return { ...p, fatigue: newFatigue, ratings: { ...p.ratings, [stat]: cur + 1 } }
            }
            return { ...p, fatigue: newFatigue }
          })

          const playerRank = results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? 0
          const winnerTeam = teams.find(t => t.id === results.teamRankings[0]?.teamId)

          // Promotion candidate notification for reserve players who won a segment
          const playerSegWins = results.segmentResults.filter(sr => sr.runners[0]?.teamId === playerTeamId)
          const promotionEvents = updatedPlayers
            .filter(p => p.teamId === playerTeamId && p.rosterTier === 'second' && p.age <= 24 && p.status === 'active')
            .filter(p => playerSegWins.some(sr => sr.runners[0]?.playerId === p.id))
            .slice(0, 2)
            .map(p => ({
              id: `promo-${p.id}-${stRaceIndex}`,
              type: 'player_wants_renewal' as const,
              raceIndex: state.currentSeason.currentRaceIndex,
              title: `${p.name}が昇格候補に`,
              body: `リザーブ戦で区間賞を獲得した${p.name}（${p.age}歳・OVR${ovr(p)}）を1軍に昇格させますか？`,
              playerId: p.id,
              choices: [
                { label: '1軍に昇格させる', desc: '即戦力として期待' },
                { label: 'リザーブで経験を積む', desc: 'もう少し様子見' },
              ],
              resolved: false,
            }))

          const stNews = [{
            date: race.date,
            headline: `【リザーブ】${race.name} 優勝：${winnerTeam?.shortName ?? ''}${playerRank > 0 ? `（自チーム${playerRank}位）` : ''}`,
            category: 'race' as const,
            relatedIds: [race.id],
          }]

          return {
            players: updatedPlayers,
            currentSeason: {
              ...state.currentSeason,
              secondTeamRaces: updatedRaces,
              secondTeamRaceIndex: stRaceIndex + 1,
              secondTeamStandings: updatedStStandings,
              newsFeed: [...stNews, ...state.currentSeason.newsFeed].slice(0, 30),
              events: [...(state.currentSeason.events ?? []), ...promotionEvents],
            },
          }
        })
      },

      setReserveLeagueJoined: (joined: boolean) => set(state => ({
        currentSeason: { ...state.currentSeason, reserveLeagueJoined: joined }
      })),

      startRegularSeason: () => set(state => {
        if (state.currentSeason.objectives.length === 0) {
          const firstObjectives = selectSeasonObjectives(!!state.rivalTeamId)
          return { currentSeason: { ...state.currentSeason, phase: 'regular', objectives: firstObjectives } }
        }
        return { currentSeason: { ...state.currentSeason, phase: 'regular' } }
      }),

      initObjectivesIfEmpty: () => set(state => {
        const objs = state.currentSeason.objectives
        if (objs.length === 0) {
          return { currentSeason: { ...state.currentSeason, objectives: selectSeasonObjectives(!!state.rivalTeamId) } }
        }
        const hasJewels = objs.some(o => (o.rewardJewels ?? 0) > 0)
        if (!hasJewels) {
          const migrated = objs.map(o => ({
            ...o,
            rewardJewels: o.id === 'topN' ? 50 : o.id === 'segWins' ? 40 : o.id === 'noInjury' ? 30 : o.id === 'budgetMaintain' ? 40 : 30,
          }))
          return { currentSeason: { ...state.currentSeason, objectives: migrated } }
        }
        return state
      }),

      beginSeasonDraft: () => {
        const state = get()
        const pool = generateDraftPool(state.currentSeason.year)
        const pickOrder = buildDraftOrder(state.teams, state.currentSeason.year, state.playerTeamId)

        // Ensure all teams have future draft picks (backfill for existing saves)
        const yr = state.currentSeason.year
        const numTeamsForPicks = state.teams.length
        const teamsWithPicks = state.teams.map((t, tIdx) => {
          const approxPick = numTeamsForPicks - tIdx
          const newPicks: typeof t.draftPicks = []
          for (const year of [yr + 1, yr + 2]) {
            for (const round of [1, 2]) {
              if (!(t.draftPicks ?? []).some(pk => pk.year === year && pk.round === round && pk.originallyOwnedBy === t.id)) {
                newPicks.push({ year, round, pickNumber: approxPick, originallyOwnedBy: t.id })
              }
            }
          }
          return newPicks.length > 0 ? { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] } : t
        })

        // CPU teams release declining/surplus players
        const cpuReleasedIds = new Set<string>()
        const playersAfterCpuRelease = (() => {
          const releaseSet = new Set<string>()
          const cpuTeamIds = [...new Set(
            state.players
              .filter(p => p.teamId !== state.playerTeamId && p.teamId !== '' && p.teamId !== '__pool__')
              .map(p => p.teamId)
          )]
          for (const teamId of cpuTeamIds) {
            const roster = state.players.filter(x => x.teamId === teamId && x.rosterTier === 'main' && x.status === 'active')
            const avgOvr = roster.length > 0 ? roster.reduce((s, x) => s + ovr(x), 0) / roster.length : 60
            // Release aging veterans whose OVR dropped below team average and contract is expiring
            for (const p of roster) {
              if (p.age > 30 && ovr(p) < avgOvr - 6 && p.contract.yearsLeft <= 1) releaseSet.add(p.id)
            }
            // Release surplus above 20: penalise old players in sort
            const remaining = roster.filter(p => !releaseSet.has(p.id))
            if (remaining.length > 20) {
              const sorted = [...remaining].sort((a, b) => {
                const scoreA = ovr(a) - (a.age > 30 ? 8 : 0) - (a.age > 33 ? 8 : 0)
                const scoreB = ovr(b) - (b.age > 30 ? 8 : 0) - (b.age > 33 ? 8 : 0)
                return scoreA - scoreB
              })
              sorted.slice(0, remaining.length - 20).forEach(p => releaseSet.add(p.id))
            }
          }
          releaseSet.forEach(id => cpuReleasedIds.add(id))
          return state.players.map(p => releaseSet.has(p.id) ? { ...p, teamId: '', jerseyNumber: 0 } : p)
        })()
        const teamsAfterCpuRelease = teamsWithPicks.map(t => ({
          ...t,
          roster: {
            ...t.roster,
            main: t.roster.main.filter(id => !cpuReleasedIds.has(id)),
            second: t.roster.second.filter(id => !cpuReleasedIds.has(id)),
          },
        }))

        // CPU teams sign FA players — tier-aware, specialty-filling
        const availableFAs = playersAfterCpuRelease
          .filter(p => p.teamId === '' && p.status === 'active')
          .sort((a, b) => ovr(b) - ovr(a))
        const signedFAIds = new Set<string>()
        const cpuSignings: { playerId: string; teamId: string; num: number }[] = []
        // Elite teams pick first
        const cpuTeamsSorted = teamsAfterCpuRelease
          .filter(t => t.id !== state.playerTeamId)
          .sort((a, b) => {
            const order = { elite: 0, mid: 1, weak: 2 }
            return order[cpuTeamTier(a.id, playersAfterCpuRelease)] - order[cpuTeamTier(b.id, playersAfterCpuRelease)]
          })
        for (const team of cpuTeamsSorted) {
          const currentRoster = playersAfterCpuRelease.filter(p => p.teamId === team.id && p.rosterTier === 'main' && p.status === 'active')
          const tier = cpuTeamTier(team.id, playersAfterCpuRelease)
          const minOvr = tier === 'elite' ? 74 : tier === 'mid' ? 67 : 58
          const targetSize = tier === 'elite' ? 22 : 20
          const slotsNeeded = Math.max(0, targetSize - currentRoster.length)
          if (slotsNeeded <= 0) continue
          const needs = cpuSpecialtyNeeds(team.id, playersAfterCpuRelease)
          const foreignOnTeam = playersAfterCpuRelease.filter(p => p.teamId === team.id && p.nationality === 'FOREIGN').length
          const usedNums = new Set(playersAfterCpuRelease.filter(p => p.teamId === team.id).map(p => p.jerseyNumber))
          let foreignSigned = 0, signed = 0
          const canSign = (fa: Player) =>
            !signedFAIds.has(fa.id) &&
            !(fa.nationality === 'FOREIGN' && foreignOnTeam + foreignSigned >= 3) &&
            fa.age < (tier === 'elite' ? 32 : 35)
          // Pass 1: fill specialty holes — relaxed floor, up to 2 per specialty
          const specFloor = Math.max(50, minOvr - 10)
          const pass1Counts: Record<string, number> = {}
          for (const spec of needs) {
            if (signed >= slotsNeeded) break
            const currentCount = playersAfterCpuRelease.filter(p => p.teamId === team.id && p.specialty === spec && p.rosterTier === 'main' && p.status === 'active').length
            const toFill = Math.max(0, 2 - currentCount - (pass1Counts[spec] ?? 0))
            let filled = 0
            for (const fa of availableFAs) {
              if (filled >= toFill || signed >= slotsNeeded) break
              if (fa.specialty !== spec || !canSign(fa) || ovr(fa) < specFloor) continue
              let num = 1; while (usedNums.has(num)) num++; usedNums.add(num)
              if (fa.nationality === 'FOREIGN') foreignSigned++
              signedFAIds.add(fa.id); cpuSignings.push({ playerId: fa.id, teamId: team.id, num }); signed++; filled++
              pass1Counts[spec] = (pass1Counts[spec] ?? 0) + 1
            }
          }
          // Pass 2: best available above threshold
          for (const fa of availableFAs) {
            if (signed >= slotsNeeded) break
            if (!canSign(fa) || ovr(fa) < minOvr) continue
            let num = 1; while (usedNums.has(num)) num++; usedNums.add(num)
            if (fa.nationality === 'FOREIGN') foreignSigned++
            signedFAIds.add(fa.id); cpuSignings.push({ playerId: fa.id, teamId: team.id, num }); signed++
          }
          // Pass 3: weak teams fill roster regardless of OVR
          if (tier === 'weak') {
            for (const fa of availableFAs) {
              if (signed >= slotsNeeded) break
              if (!canSign(fa)) continue
              let num = 1; while (usedNums.has(num)) num++; usedNums.add(num)
              if (fa.nationality === 'FOREIGN') foreignSigned++
              signedFAIds.add(fa.id); cpuSignings.push({ playerId: fa.id, teamId: team.id, num }); signed++
            }
          }
        }
        const newYear = state.currentSeason.year
        const playersWithCpuSigns = playersAfterCpuRelease.map(p => {
          const s = cpuSignings.find(x => x.playerId === p.id)
          if (!s) return p
          return { ...p, teamId: s.teamId, jerseyNumber: s.num, contract: { yearsLeft: 2, annualSalary: Math.round(ovr(p) * 110000 / 500000) * 500000, faEligibleYear: newYear + 2 } }
        })
        const teamsWithCpuSigns = teamsAfterCpuRelease.map(t => ({
          ...t,
          roster: {
            ...t.roster,
            main: [...t.roster.main, ...cpuSignings.filter(s => s.teamId === t.id).map(s => s.playerId)],
          },
        }))

        // CPU second-team FA signing (target 15 players per team)
        const cpuSecondSignings: { playerId: string; teamId: string; num: number }[] = []
        for (const team of cpuTeamsSorted) {
          const secondRoster = playersWithCpuSigns.filter(p => p.teamId === team.id && p.rosterTier === 'second' && p.status === 'active')
          const slotsNeeded = Math.max(0, 15 - secondRoster.length)
          if (slotsNeeded <= 0) continue
          const foreignOnTeam = playersWithCpuSigns.filter(p => p.teamId === team.id && p.nationality === 'FOREIGN').length
          const usedNums = new Set(playersWithCpuSigns.filter(p => p.teamId === team.id).map(p => p.jerseyNumber))
          let foreignSigned2 = 0, signed2 = 0
          for (const fa of availableFAs) {
            if (signed2 >= slotsNeeded) break
            if (signedFAIds.has(fa.id)) continue
            if (ovr(fa) > 72) continue
            if (fa.nationality === 'FOREIGN' && foreignOnTeam + foreignSigned2 >= 2) continue
            if (fa.age > 34) continue
            let num = 21; while (usedNums.has(num)) num++; usedNums.add(num)
            if (fa.nationality === 'FOREIGN') foreignSigned2++
            signedFAIds.add(fa.id)
            cpuSecondSignings.push({ playerId: fa.id, teamId: team.id, num })
            signed2++
          }
        }
        const playersWithAllCpuSigns = playersWithCpuSigns.map(p => {
          const s2 = cpuSecondSignings.find(x => x.playerId === p.id)
          if (!s2) return p
          return { ...p, teamId: s2.teamId, jerseyNumber: s2.num, rosterTier: 'second' as const, contract: { yearsLeft: 2, annualSalary: Math.round(ovr(p) * 90000 / 500000) * 500000, faEligibleYear: newYear + 2 } }
        })
        const teamsWithAllCpuSigns = teamsWithCpuSigns.map(t => ({
          ...t,
          roster: {
            ...t.roster,
            second: [...t.roster.second, ...cpuSecondSignings.filter(s => s.teamId === t.id).map(s => s.playerId)],
          },
        }))

        const cpuSigningNewsItems = cpuSignings
          .filter(s => {
            const p = playersAfterCpuRelease.find(x => x.id === s.playerId)
            return p && ovr(p) >= 65
          })
          .slice(0, 10)
          .map(s => {
            const p = playersAfterCpuRelease.find(x => x.id === s.playerId)!
            const team = teamsAfterCpuRelease.find(t => t.id === s.teamId)
            return {
              date: `${newYear}-02-10`,
              headline: `${team?.shortName ?? ''}が${p.name}（OVR${ovr(p)}）と契約合意`,
              category: 'fa' as const,
              relatedIds: [p.id],
            }
          })

        set({
          draftState: { pool, pickOrder, currentPick: 0, picks: [], isComplete: false },
          isInitialized: false,
          players: [...playersWithAllCpuSigns, ...pool],
          teams: teamsWithAllCpuSigns,
          currentSeason: {
            ...state.currentSeason,
            newsFeed: [...cpuSigningNewsItems, ...state.currentSeason.newsFeed].slice(0, 30),
          },
        })
      },

      endSeason: () => {
        set(state => {
          const newYear = state.currentSeason.year + 1

          // Record OVR before growth for history
          const ovrSnapshot: Record<string, number> = {}
          state.players.forEach(p => { ovrSnapshot[p.id] = ovr(p) })

          const campLv = state.teams.find(t => t.id === state.playerTeamId)?.facilities?.trainingCamp ?? 0
          const grownPlayers = state.players.map(p => {
            const grown = p.status === 'active' || p.status === 'injured' ? growPlayer(p) : p
            // trainingCamp: extra growth roll for player-team players
            const extraGrown = (campLv > 0 && p.teamId === state.playerTeamId && Math.random() < campLv * 0.07)
              ? growPlayer(grown) : grown
            const snap = ovrSnapshot[p.id]
            if (snap == null) return extraGrown
            return { ...extraGrown, ovrHistory: [...(p.ovrHistory ?? []), { year: state.currentSeason.year, ovr: snap }].slice(-8) }
          })

          // Build growth report for player team
          const mainIds = state.teams.find(t => t.id === state.playerTeamId)?.roster.main ?? []
          const growthEntries = mainIds
            .map(id => {
              const before = state.players.find(p => p.id === id)
              const after = grownPlayers.find(p => p.id === id)
              if (!before || !after) return null
              return {
                playerId: id,
                name: before.name,
                age: after.age,
                specialty: before.specialty,
                ovrBefore: ovr(before),
                ovrAfter: ovr(after),
              }
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
            .sort((a, b) => Math.abs(b.ovrAfter - b.ovrBefore) - Math.abs(a.ovrAfter - a.ovrBefore))

          // Expired contracts → FA (yearsLeft=0 after growth)
          // CPU team players go to FA automatically; player-team players wait for renewal decision
          const expiredIds = new Set(
            grownPlayers
              .filter(p => p.contract.yearsLeft === 0 && p.teamId && p.teamId !== '__pool__' && p.teamId !== state.playerTeamId && p.status === 'active')
              .map(p => p.id)
          )
          // Player-team expiring players: queued for user decision
          const playerTeamExpiringIds = grownPlayers
            .filter(p => p.contract.yearsLeft === 0 && p.teamId === state.playerTeamId && p.status === 'active')
            .map(p => p.id)

          const playersAfterFA = grownPlayers.map(p =>
            expiredIds.has(p.id) ? { ...p, teamId: '', jerseyNumber: 0 } : p
          )

          // ── RETIREMENT SYSTEM ──
          const retireProb = (age: number) =>
            age >= 38 ? 0.97 : age >= 36 ? 0.80 : age >= 34 ? 0.35 : age >= 32 ? 0.10 : 0

          const retiringIds = new Set(
            grownPlayers
              .filter(p => p.status === 'active' && p.teamId && p.teamId !== '__pool__' && !expiredIds.has(p.id))
              .filter(p => Math.random() < retireProb(p.age))
              .map(p => p.id)
          )

          // Pre-retirement consideration events (age 34-36, didn't retire, active on player team)
          const considerRetirement = grownPlayers.filter(p =>
            p.teamId === state.playerTeamId &&
            p.status === 'active' &&
            !retiringIds.has(p.id) &&
            !expiredIds.has(p.id) &&
            p.age >= 34 && p.age <= 37 &&
            ovr(p) >= 60
          ).slice(0, 1)

          const retirementEvents = considerRetirement.map(p => ({
            id: `retire-consid-${p.id}-${state.currentSeason.year + 1}`,
            type: 'player_retirement' as const,
            raceIndex: 0,
            title: `${p.name}が引退を考慮`,
            body: `${p.age}歳になった${p.name}が今後のキャリアについて考えています。特別ボーナスで続投を要請するか、引退を受け入れますか？`,
            playerId: p.id,
            choices: [
              { label: '続投ボーナス2000万で要請', desc: '来季も戦力になるが予算圧迫' },
              { label: '引退を受け入れる（感謝の式）', desc: 'GM評判+3、チームの士気UP' },
            ],
            resolved: false,
          }))

          // Apply retirements to player array
          const playersAfterRetire = playersAfterFA.map(p =>
            retiringIds.has(p.id) ? { ...p, status: 'retired' as const, teamId: '' } : p
          )

          // Auto contract renewal events for player-team players with yearsLeft === 1 after growth
          const renewalCandidates = playersAfterRetire.filter(p =>
            p.teamId === state.playerTeamId &&
            p.status === 'active' &&
            p.contract.yearsLeft === 1 &&
            !retiringIds.has(p.id) &&
            !expiredIds.has(p.id)
          )
          const renewalEvents: typeof state.currentSeason.events = renewalCandidates.slice(0, 4).map(p => ({
            id: `renewal-${p.id}-${state.currentSeason.year + 1}`,
            type: 'player_wants_renewal' as const,
            raceIndex: 1,
            title: `${p.name}が契約更新を希望`,
            body: `${p.name}（${p.age}歳・OVR${ovr(p)}）の契約が今季終了予定です。シーズン中に延長交渉を進めてください。`,
            playerId: p.id,
            choices: [
              { label: '交渉を開始する', desc: '延長交渉ページで条件を確認' },
              { label: '後で対応する', desc: '通知を閉じる。後でも交渉可能。' },
            ],
            resolved: false,
          }))

          const sortedStandings = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)

          // Morale streak system: apply morale bonus/penalty to player team based on season finish
          const myFinalRank = sortedStandings.findIndex(s => s.teamId === state.playerTeamId) + 1

          // Sponsor contract processing
          const myActiveSponsorIds = state.teams.find(t => t.id === state.playerTeamId)?.sponsors ?? []
          const mySegWins = state.currentSeason.races
            .filter(r => r.results)
            .flatMap(r => r.results!.segmentResults)
            .filter(sr => sr.runners[0]?.teamId === state.playerTeamId)
            .length
          const expiredSponsorIds = new Set<string>()
          const sponsorNews: typeof state.currentSeason.newsFeed = []
          const renewalOffers: import('../types').SponsorOffer[] = []
          const updatedSponsors = (state.sponsors ?? []).map(sp => {
            if (!myActiveSponsorIds.includes(sp.id)) return sp
            const newYearsLeft = sp.yearsLeft - 1
            if (newYearsLeft <= 0) {
              expiredSponsorIds.add(sp.id)
              let targetMet = true
              if (sp.target) {
                if (sp.target.type === 'rank') targetMet = myFinalRank > 0 && myFinalRank <= sp.target.value
                else if (sp.target.type === 'segmentWins') targetMet = mySegWins >= sp.target.value
                else if (sp.target.type === 'championship') targetMet = myFinalRank === 1
              }
              if (targetMet) {
                renewalOffers.push({
                  id: `offer_renewal_${sp.id}_${newYear}`,
                  name: sp.name,
                  tier: sp.tier,
                  annualPayment: Math.round(sp.annualPayment * 1.05 / 500000) * 500000,
                  contractYears: Math.min((sp.contractYears ?? 1) + 1, 3),
                  target: sp.target ?? { type: 'rank', value: 5, description: '5位以内' },
                  logoColor: sp.logoColor,
                })
              }
              sponsorNews.push({
                date: `${state.currentSeason.year}-10-27`,
                headline: targetMet
                  ? `${sp.name}との契約満了 — 目標達成、更新オファーが届いた`
                  : `${sp.name}との契約打ち切り — 目標未達（${sp.target?.description ?? '条件未達'}）`,
                category: 'finance' as const,
                relatedIds: [],
              })
            }
            return { ...sp, yearsLeft: Math.max(0, newYearsLeft) }
          })
          const newSponsorOffers = [...renewalOffers, ...generateSponsorOffers(myFinalRank, newYear)]
          const myTeamStreak = state.teams.find(t => t.id === state.playerTeamId)?.history.currentStreak ?? 0
          const streakMoraleDelta = myFinalRank <= 3
            ? Math.min(12, 4 + myTeamStreak * 2)   // up to +12 for long winning streak
            : myFinalRank >= sortedStandings.length - 2
            ? Math.max(-12, -4 - myTeamStreak * 2) // down to -12 for losing streak
            : 0
          const playersAfterMorale = streakMoraleDelta !== 0
            ? playersAfterRetire.map(p => {
                if (p.teamId !== state.playerTeamId || p.rosterTier !== 'main' || p.status === 'retired') return p
                return { ...p, morale: Math.max(10, Math.min(100, (p.morale ?? 70) + streakMoraleDelta)) }
              })
            : playersAfterRetire

          const updatedTeams = state.teams.map(t => {
            const rank = sortedStandings.findIndex(s => s.teamId === t.id) + 1
            const pts = sortedStandings.find(s => s.teamId === t.id)?.totalPoints ?? 0

            // Legends: notable retiring players from this team
            const teamRetirees = [...retiringIds]
              .map(id => grownPlayers.find(p => p.id === id))
              .filter((p): p is Player => !!p && p.teamId === t.id)
              .filter(p => p.career.segmentWins >= 5 || p.career.championships >= 1 || p.yearsPro >= 4)
            const newLegends = teamRetirees.map(p => ({
              name: p.name,
              specialty: p.specialty,
              retiredAge: p.age,
              retiredYear: state.currentSeason.year,
              peakOvr: Math.max(ovr(p), ...(p.ovrHistory?.map(h => h.ovr) ?? [])),
              yearsInTeam: p.yearsPro,
              career: { segmentWins: p.career.segmentWins, championships: p.career.championships, mvpAwards: p.career.mvpAwards },
            }))

            // Streak tracking (top 3 = good season)
            const isTop3 = rank > 0 && rank <= 3
            const prevStreak = t.history.currentStreak ?? 0
            const newStreak = isTop3 ? prevStreak + 1 : 0
            const bestStreak = Math.max(t.history.bestStreak ?? 0, newStreak)

            return {
              ...t,
              history: {
                ...t.history,
                seasonResults: [...t.history.seasonResults, { year: state.currentSeason.year, rank, points: pts }],
                championships: rank === 1 ? t.history.championships + 1 : t.history.championships,
                legends: [...(t.history.legends ?? []), ...newLegends],
                currentStreak: newStreak,
                bestStreak,
              },
            }
          })

          const newRaces = generateSeasonRaces(newYear)
          const newSecondTeamRaces = generateSecondTeamRaces(newYear)
          const champion = updatedTeams.find(t => t.id === sortedStandings[0]?.teamId)
          const nextScoutPool = generateDraftPool(newYear + 1)

          // FA news
          const faNews = expiredIds.size > 0
            ? [{
                date: `${state.currentSeason.year}-10-30`,
                headline: `${expiredIds.size}名の選手が契約満了でFA市場へ`,
                category: 'fa' as const,
                relatedIds: [...expiredIds],
              }]
            : []

          // Growth news
          const bigGrowth = growthEntries.filter(e => e.ovrAfter - e.ovrBefore >= 3).slice(0, 2)
          const growthNews = bigGrowth.map(e => ({
            date: `${state.currentSeason.year}-11-01`,
            headline: `${e.name}（${SPECIALTY_LABELS[e.specialty]}）が大きく成長 OVR +${e.ovrAfter - e.ovrBefore}`,
            category: 'draft' as const,
            relatedIds: [e.playerId],
          }))

          // Remove expired + retired players from team rosters; remove expired sponsor contracts
          const teamsWithFA = updatedTeams.map(t => ({
            ...t,
            roster: {
              main: t.roster.main.filter(id => !expiredIds.has(id) && !retiringIds.has(id)),
              second: t.roster.second.filter(id => !expiredIds.has(id) && !retiringIds.has(id)),
            },
            ...(t.id === state.playerTeamId && expiredSponsorIds.size > 0 ? {
              sponsors: (t.sponsors ?? []).filter(id => !expiredSponsorIds.has(id)),
            } : {}),
          }))

          // CPU teams do NOT sign FA players here — user gets the FA window during preseason
          // AI will sign remaining FAs when beginSeasonDraft is called

          // Check objectives + award scout points + budget rewards
          const finalRank = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints).findIndex(s => s.teamId === state.playerTeamId) + 1
          const playerBudgetAtSeasonEnd = teamsWithFA.find(t => t.id === state.playerTeamId)?.finance.budget ?? 0
          const completedObjs = state.currentSeason.objectives.map(obj => {
            if (obj.done) return obj
            if (obj.id === 'topN' && finalRank > 0 && finalRank <= obj.target) return { ...obj, current: finalRank, done: true }
            if (obj.id === 'noInjury' && obj.current === 0) return { ...obj, done: true }
            if (obj.id === 'budgetMaintain' && playerBudgetAtSeasonEnd >= obj.target) return { ...obj, current: playerBudgetAtSeasonEnd, done: true }
            return obj
          })
          const newlyCompletedObjs = completedObjs.filter(o => o.done && !state.currentSeason.objectives.find(x => x.id === o.id)?.done)
          const objBonus = newlyCompletedObjs.reduce((s, o) => s + o.rewardPts, 0)
          const objBudgetBonus = newlyCompletedObjs.reduce((s, o) => s + (o.rewardBudget ?? 0), 0)

          // Annual budget allocation based on final rank (given at start of next season)
          const RANK_BUDGET: Record<number, number> = {
            1: 500_000_000, 2: 400_000_000, 3: 350_000_000,
            4: 300_000_000, 5: 250_000_000,
          }
          const rankBonus = RANK_BUDGET[finalRank] ?? (finalRank <= 10 ? 220_000_000 : 200_000_000)

          const aiSigningNews: typeof faNews = []  // AI signing happens at draft start now

          // Retirement news
          const retirementNews = [...retiringIds].slice(0, 4).map(id => {
            const p = grownPlayers.find(x => x.id === id)
            return p ? {
              date: `${state.currentSeason.year}-10-25`,
              headline: `${p.name}（${p.age}歳）が現役引退を発表 — 通算区間賞${p.career.segmentWins}回`,
              category: 'fa' as const,
              relatedIds: [p.id],
            } : null
          }).filter(Boolean) as typeof faNews

          // New season objectives (5 types, randomized)
          const newObjectives = selectSeasonObjectives(!!state.rivalTeamId)

          const seasonRep = finalRank === 1 ? 8 : finalRank <= 3 ? 3 : finalRank >= state.teams.length - 2 ? -8 : -2
          const newGmRep = Math.max(1, Math.min(100, (state.gmRep ?? 50) + seasonRep + (objBonus > 0 ? 2 : 0)))

          // ── BONUS CLAUSE PAYOUTS (item 16) ──
          const playerTeamRosterIds = teamsWithFA.find(t => t.id === state.playerTeamId)?.roster.main ?? []

          // Count segment wins per player this season from race results
          const playerSegWinsSeason: Record<string, number> = {}
          const leagueSegWinsSeason: Record<string, number> = {}
          for (const race of state.currentSeason.races) {
            if (!race.results) continue
            for (const seg of race.results.segmentResults) {
              const winner = seg.runners.find(r => r.rank === 1)
              if (winner) {
                leagueSegWinsSeason[winner.playerId] = (leagueSegWinsSeason[winner.playerId] ?? 0) + 1
                if (winner.teamId === state.playerTeamId) {
                  playerSegWinsSeason[winner.playerId] = (playerSegWinsSeason[winner.playerId] ?? 0) + 1
                }
              }
            }
          }

          // League MVP: most segment wins this season
          const leagueMvpEntry = Object.entries(leagueSegWinsSeason).sort((a, b) => b[1] - a[1])[0]
          const leagueMvpId = leagueMvpEntry?.[0]
          const leagueMvpPlayer = leagueMvpId ? grownPlayers.find(p => p.id === leagueMvpId) : null
          const leagueMvpWins = leagueMvpEntry?.[1] ?? 0

          let bonusTotalPayout = 0
          const bonusPayoutNews: { date: string; headline: string; category: 'race'; relatedIds: string[] }[] = []

          for (const pid of playerTeamRosterIds) {
            const p = playersAfterRetire.find(x => x.id === pid)
            if (!p?.contract.bonusClauses?.length) continue
            for (const clause of p.contract.bonusClauses) {
              if (clause.type === 'champion' && finalRank === 1) {
                bonusTotalPayout += clause.amount
                bonusPayoutNews.push({ date: `${state.currentSeason.year}-10-26`, headline: `${p.name} 優勝ボーナス発動 +${Math.round(clause.amount / 10000)}万円`, category: 'race', relatedIds: [p.id] })
              } else if (clause.type === 'segment_win') {
                const wins = playerSegWinsSeason[p.id] ?? 0
                if (wins > 0) {
                  const payout = clause.amount * wins
                  bonusTotalPayout += payout
                  bonusPayoutNews.push({ date: `${state.currentSeason.year}-10-26`, headline: `${p.name} 区間賞ボーナス×${wins}回 +${Math.round(payout / 10000)}万円`, category: 'race', relatedIds: [p.id] })
                }
              } else if (clause.type === 'mvp' && p.career.mvpAwards > 0) {
                bonusTotalPayout += clause.amount
                bonusPayoutNews.push({ date: `${state.currentSeason.year}-10-26`, headline: `${p.name} MVPボーナス発動 +${Math.round(clause.amount / 10000)}万円`, category: 'race', relatedIds: [p.id] })
              }
            }
          }

          const playerSalaryTotal = playersAfterMorale
            .filter(p => p.teamId === state.playerTeamId && p.rosterTier === 'main')
            .reduce((s, p) => s + p.contract.annualSalary, 0)

          const playerTeamObj = teamsWithFA.find(t => t.id === state.playerTeamId)
          const sponsorAnnual = (playerTeamObj?.sponsors ?? [])
            .map(id => (state.sponsors ?? []).find(s => s.id === id))
            .filter(Boolean)
            .reduce((s, sp) => s + sp!.annualPayment, 0)
          const prevRaceIncome = state.currentSeason.seasonRaceIncome ?? 0
          const newBudget = Math.max(
            200_000_000,
            rankBonus + sponsorAnnual + prevRaceIncome + objBudgetBonus - bonusTotalPayout - playerSalaryTotal
          )

          const teamsWithSeasonRewards = teamsWithFA.map(t =>
            t.id === state.playerTeamId
              ? { ...t, finance: { ...t.finance, budget: newBudget, salaryTotal: playerSalaryTotal } }
              : t
          )

          // Generate future draft picks (next 2 seasons) for each team based on final rank
          const numTeams = state.teams.length
          const teamsWithFuturePicks = teamsWithSeasonRewards.map(t => {
            const teamFinalRank = sortedStandings.findIndex(s => s.teamId === t.id) + 1
            const pickNum = Math.max(1, numTeams - teamFinalRank + 1)
            const newPicks: typeof t.draftPicks = []
            for (const yr of [newYear, newYear + 1]) {
              for (const round of [1, 2]) {
                const alreadyHas = (t.draftPicks ?? []).some(pk => pk.year === yr && pk.round === round && pk.originallyOwnedBy === t.id)
                if (!alreadyHas) newPicks.push({ year: yr, round, pickNumber: pickNum, originallyOwnedBy: t.id })
              }
            }
            return { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] }
          })

          // Remove expired draft picks (older than the upcoming draft year)
          const teamsWithCleanedPicks = teamsWithFuturePicks.map(t => ({
            ...t,
            draftPicks: (t.draftPicks ?? []).filter(pk => pk.year >= newYear),
          }))

          const seasonPrizeNews = {
            date: `${state.currentSeason.year}-10-30`,
            headline: `${state.currentSeason.year}シーズン最終順位${finalRank}位 — 来季予算${Math.round(newBudget / 10000)}万円確定（賞金${Math.round(prevRaceIncome / 10000)}万・スポンサー${Math.round(sponsorAnnual / 10000)}万含む）`,
            category: 'race' as const,
            relatedIds: [],
          }

          // ── DYNASTY MILESTONES ──
          const myUpdatedTeam = teamsWithFuturePicks.find(t => t.id === state.playerTeamId)
          const totalChamps = myUpdatedTeam?.history.championships ?? 0
          const totalSeasons = (myUpdatedTeam?.history.seasonResults.length ?? 0)
          const curStreak = myUpdatedTeam?.history.currentStreak ?? 0
          const allPlayerSegWins = playersAfterMorale.filter(p => p.teamId === state.playerTeamId).reduce((s, p) => s + p.career.segmentWins, 0)
          const dynastyNews: { date: string; headline: string; category: 'race'; relatedIds: string[] }[] = []

          if (finalRank === 1) {
            if (totalChamps === 1) dynastyNews.push({ date: `${state.currentSeason.year}-10-26`, headline: '【フランチャイズ初優勝】新たな歴史の始まり — このチームの伝説が刻まれた', category: 'race', relatedIds: [] })
            else if (totalChamps === 3) dynastyNews.push({ date: `${state.currentSeason.year}-10-26`, headline: `【強豪の証】通算3度目の優勝達成 — リーグに名を轟かせる`, category: 'race', relatedIds: [] })
            else if (totalChamps === 5) dynastyNews.push({ date: `${state.currentSeason.year}-10-26`, headline: `【名門チーム】5回の頂点 — 歴史に刻まれた王朝の誕生`, category: 'race', relatedIds: [] })
            else if (totalChamps === 10) dynastyNews.push({ date: `${state.currentSeason.year}-10-26`, headline: `【黄金王朝】10回の制覇 — このチームは時代を超えた伝説となった`, category: 'race', relatedIds: [] })
            if (curStreak === 3) dynastyNews.push({ date: `${state.currentSeason.year}-10-26`, headline: '【3連覇達成】誰もこのチームを止められない', category: 'race', relatedIds: [] })
            if (curStreak === 5) dynastyNews.push({ date: `${state.currentSeason.year}-10-26`, headline: '【5連覇の怪物王朝】リーグの歴史を塗り替えた', category: 'race', relatedIds: [] })
          }
          if (totalSeasons === 5 && finalRank > state.teams.length - 3) dynastyNews.push({ date: `${state.currentSeason.year}-10-27`, headline: '【再建の岐路】5年でタイトルなし — チームの方向性を見直す時', category: 'race', relatedIds: [] })
          if (allPlayerSegWins >= 50 && allPlayerSegWins - (state.players.filter(p => p.teamId === state.playerTeamId).reduce((s, p) => s + p.career.segmentWins, 0)) < 10) dynastyNews.push({ date: `${state.currentSeason.year}-10-27`, headline: `【通算区間賞50回突破】このチームの走者たちが歴史に名を刻む`, category: 'race', relatedIds: [] })

          // Update MVP player's career.mvpAwards
          const playersWithMVP = leagueMvpId
            ? playersAfterMorale.map(p =>
                p.id === leagueMvpId ? { ...p, career: { ...p.career, mvpAwards: p.career.mvpAwards + 1 } } : p
              )
            : playersAfterMorale

          // Update championship team players' career.championships
          const champTeamId = sortedStandings[0]?.teamId
          const playersWithChamp = champTeamId
            ? playersWithMVP.map(p =>
                p.teamId === champTeamId && p.rosterTier === 'main'
                  ? { ...p, career: { ...p.career, championships: p.career.championships + 1 } }
                  : p
              )
            : playersWithMVP

          const seasonTotalSegWins = Object.values(playerSegWinsSeason).reduce((s, v) => s + v, 0)
          const seasonAchievements = checkSeasonAchievements({
            finalRank,
            year: state.currentSeason.year,
            totalChamps,
            curStreak,
            seasonSegWins: seasonTotalSegWins,
            totalSeasons,
            players: playersWithChamp,
            playerTeamId: state.playerTeamId,
            existing: state.achievements ?? [],
          })

          const mvpNews = leagueMvpPlayer
            ? [{
                date: `${state.currentSeason.year}-10-28`,
                headline: `${state.currentSeason.year}シーズンMVP：${leagueMvpPlayer.name}（区間賞${leagueMvpWins}回）`,
                category: 'race' as const,
                relatedIds: [leagueMvpPlayer.id],
              }]
            : []

          const objJewels = newlyCompletedObjs.reduce((s, o) => s + (o.rewardJewels ?? 30), 0)
          const seasonAchievementJewels = seasonAchievements.reduce((s, a) => s + (ACHIEVEMENT_JEWELS[a.rarity] ?? 0), 0)
          const rankJewels = finalRank === 1 ? 200 : finalRank === 2 ? 100 : finalRank === 3 ? 50 : 0

          return {
            players: playersWithChamp,
            teams: teamsWithCleanedPicks,
            jewels: state.jewels + objJewels + seasonAchievementJewels + rankJewels,
            gmRep: newGmRep,
            achievements: [...(state.achievements ?? []), ...seasonAchievements],
            draftState: null,
            sponsors: updatedSponsors,
            pastSeasons: [...state.pastSeasons, { ...state.currentSeason, objectives: completedObjs }],
            raceLineup: {},
            raceStrategy: 'balanced' as const,
            growthReport: { year: state.currentSeason.year, entries: growthEntries },
            currentSeason: {
              year: newYear,
              currentRaceIndex: 0,
              phase: 'preseason',
              races: newRaces,
              collegeRaces: [],
              draftPool: [],
              scoutPoints: 5 + objBonus + (state.teams.find(t => t.id === state.playerTeamId)?.facilities?.scoutOffice ?? 0),
              scoutProspects: nextScoutPool,
              objectives: newObjectives,
              trainingAssignments: {},
              scoutMissions: [],
              faVisits: [],
              events: [...retirementEvents, ...renewalEvents],
              pendingRenewalDecisions: playerTeamExpiringIds,
              pendingTradeOffers: [],
              scoutedOpponents: (state.currentSeason.scoutedOpponents ?? []).filter(s => s.year >= state.currentSeason.year),
              scoutedProspects: (state.currentSeason.scoutedProspects ?? []).filter(s => s.year >= state.currentSeason.year),
              trainingPlan: null,
              individualEvents: [
                { id: `ev5k-${newYear}`, name: `${newYear}年度 全日本5000m選手権`, date: `${newYear}-04-15`, distance: 5000 as const },
                { id: `ev10k-${newYear}`, name: `${newYear}年度 全日本10000m選手権`, date: `${newYear}-07-01`, distance: 10000 as const },
                { id: `evhalf-${newYear}`, name: `${newYear}年度 全日本ハーフマラソン選手権`, date: `${newYear}-09-20`, distance: 21097 as const },
              ],
              worldEkidenResult: undefined,
              sponsorOffers: newSponsorOffers,
              seasonRaceIncome: 0,
              secondTeamRaces: newSecondTeamRaces,
              secondTeamRaceIndex: 0,
              secondTeamStandings: state.teams.map(t => ({ teamId: t.id, totalPoints: 0, raceResults: [] })),
              standings: state.teams.map(t => ({
                teamId: t.id, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [],
              })),
              newsFeed: [
                { date: `${newYear}-03-01`, headline: `${newYear}シーズン開幕！全${newRaces.length}戦のスケジュール決定`, category: 'race' as const, relatedIds: [] },
                { date: `${state.currentSeason.year}-10-25`, headline: `${state.currentSeason.year}シーズン王者：${champion?.name ?? ''}！`, category: 'race' as const, relatedIds: [] },
                seasonPrizeNews,
                ...(objBonus > 0 ? [{ date: `${state.currentSeason.year}-11-01`, headline: `目標達成ボーナス：スカウトPt+${objBonus}・予算+${Math.round(objBudgetBonus / 10000)}万`, category: 'draft' as const, relatedIds: [] }] : []),
                ...mvpNews,
                ...dynastyNews,
                ...retirementNews,
                ...bonusPayoutNews,
                ...faNews,
                ...aiSigningNews,
                ...growthNews,
                ...sponsorNews,
              ],
            },
          }
        })
      },

      buyTrainingCard: (rarity, qty = 1) => {
        const PRICES: Record<string, number> = { normal: 30, rare: 120, epic: 500, legendary: 1500 }
        const EXP: Record<string, number> = { normal: 300, rare: 1200, epic: 4000, legendary: 10000 }
        const STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
        const state = get()
        const price = PRICES[rarity]
        if (price === undefined) return false
        if ((state.jewels ?? 0) < price * qty) return false
        const cards: TrainingCard[] = Array.from({ length: qty }, (_, i) => ({
          id: `shop_${rarity}_${Date.now()}_${i}`,
          statKey: STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)],
          rarity,
          value: EXP[rarity],
        }))
        set(s => ({
          trainingCards: [...(s.trainingCards ?? []), ...cards],
          jewels: (s.jewels ?? 0) - price * qty,
        }))
        return cards
      },

      // ── Sponsors ─────────────────────────────────────────────────────
      signSponsor: (sponsorId, targetId) => {
        const state = get()
        const sponsor = state.sponsors.find(s => s.id === sponsorId)
        if (!sponsor) return false

        if (targetId === null) {
          // Team sponsor
          set(s => ({
            teams: s.teams.map(t => t.id === s.playerTeamId
              ? { ...t, sponsors: [...(t.sponsors ?? []), sponsorId] }
              : t
            ),
          }))
        } else {
          // Personal sponsor
          set(s => ({
            players: s.players.map(p => p.id === targetId
              ? { ...p, personalSponsors: [...(p.personalSponsors ?? []), sponsorId] }
              : p
            ),
          }))
        }
        return true
      },

      terminateSponsor: (sponsorId, targetId) => {
        if (targetId === null) {
          set(s => ({
            teams: s.teams.map(t => t.id === s.playerTeamId
              ? { ...t, sponsors: (t.sponsors ?? []).filter(id => id !== sponsorId) }
              : t
            ),
          }))
        } else {
          set(s => ({
            players: s.players.map(p => p.id === targetId
              ? { ...p, personalSponsors: (p.personalSponsors ?? []).filter(id => id !== sponsorId) }
              : p
            ),
          }))
        }
      },

      acceptSponsorOffer: (offerId) => {
        set(state => {
          const offer = (state.currentSeason.sponsorOffers ?? []).find(o => o.id === offerId)
          if (!offer) return state
          const myTeam = state.teams.find(t => t.id === state.playerTeamId)
          if (!myTeam) return state
          const currentTeamSponsors = myTeam.sponsors ?? []
          if (currentTeamSponsors.length >= 3) return state
          const newSponsor = {
            id: `sp_${offerId}`,
            name: offer.name,
            type: 'team' as const,
            tier: offer.tier,
            annualPayment: offer.annualPayment,
            yearsLeft: offer.contractYears,
            contractYears: offer.contractYears,
            target: offer.target,
            logoColor: offer.logoColor,
          }
          return {
            sponsors: [...(state.sponsors ?? []), newSponsor],
            teams: state.teams.map(t =>
              t.id === state.playerTeamId
                ? { ...t, sponsors: [...currentTeamSponsors, newSponsor.id] }
                : t
            ),
            currentSeason: {
              ...state.currentSeason,
              sponsorOffers: (state.currentSeason.sponsorOffers ?? []).filter(o => o.id !== offerId),
            },
          }
        })
      },

      collectSponsorIncome: () => {
        const state = get()
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam) return

        let totalIncome = 0

        // Team sponsors
        for (const sId of myTeam.sponsors ?? []) {
          const sp = state.sponsors.find(s => s.id === sId)
          if (sp) totalIncome += sp.annualPayment
        }

        // Personal sponsors (go to team budget as prize money)
        const myPlayerIds = new Set(state.players.filter(p => p.teamId === state.playerTeamId).map(p => p.id))
        for (const player of state.players) {
          if (!myPlayerIds.has(player.id)) continue
          for (const sId of player.personalSponsors ?? []) {
            const sp = state.sponsors.find(s => s.id === sId)
            if (sp) totalIncome += sp.annualPayment
          }
        }

        if (totalIncome > 0) {
          set(s => ({
            teams: s.teams.map(t => t.id === s.playerTeamId
              ? { ...t, finance: { ...t.finance, budget: t.finance.budget + totalIncome } }
              : t
            ),
          }))
        }
      },

      // ── Foreign transfer market ───────────────────────────────────────
      signForeignPlayer: (playerId, salary, years) => {
        const state = get()
        const player = state.players.find(p => p.id === playerId)
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!player || !myTeam) return false

        const foreignCat: ForeignCategory = player.foreignCategory ?? nationalityToForeignCategory(player.nationality)

        // Count current foreign/asian players on main roster
        const mainIds = new Set(myTeam.roster.main)
        const myMainPlayers = state.players.filter(p => mainIds.has(p.id))
        const foreignCount = myMainPlayers.filter(p =>
          (p.foreignCategory ?? nationalityToForeignCategory(p.nationality)) === 'foreign'
        ).length
        const asianCount = myMainPlayers.filter(p =>
          (p.foreignCategory ?? nationalityToForeignCategory(p.nationality)) === 'asian'
        ).length

        if (foreignCat === 'foreign' && foreignCount >= 3) return false
        if (foreignCat === 'asian' && asianCount >= 5) return false

        // Transfer fee is based on player market value (independent of salary)
        const transferFee = calcTransferValue(player)
        if (myTeam.finance.budget < transferFee) return false

        // Remove player from foreign club roster
        const updatedLeagues = state.foreignLeagues.map(league => ({
          ...league,
          clubs: league.clubs.map(club => ({
            ...club,
            playerIds: club.playerIds.filter(id => id !== playerId),
          })),
        }))

        const existingNums = new Set(myMainPlayers.map(p => p.jerseyNumber))
        let jerseyNum = myTeam.roster.main.length + 1
        while (existingNums.has(jerseyNum)) jerseyNum++

        const mainFull = myTeam.roster.main.length >= 20
        const assignedTier: 'main' | 'second' = mainFull ? 'second' : 'main'

        set(s => ({
          players: s.players.map(p => p.id === playerId
            ? {
                ...p,
                teamId: s.playerTeamId,
                rosterTier: assignedTier,
                jerseyNumber: jerseyNum,
                status: 'active',
                foreignCategory: foreignCat,
                contract: { yearsLeft: years, annualSalary: salary, faEligibleYear: s.currentSeason.year + years },
              }
            : p
          ),
          teams: s.teams.map(t => t.id === s.playerTeamId
            ? {
                ...t,
                roster: mainFull
                  ? { ...t.roster, second: [...t.roster.second, playerId] }
                  : { ...t.roster, main: [...t.roster.main, playerId] },
                finance: { ...t.finance, budget: t.finance.budget - transferFee, salaryTotal: t.finance.salaryTotal + salary },
              }
            : t
          ),
          foreignLeagues: updatedLeagues,
          currentSeason: {
            ...s.currentSeason,
            newsFeed: [{
              date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date ?? `${s.currentSeason.year}-06-01`,
              headline: `${player.name}(${player.nationality})を海外移籍金${Math.round(transferFee / 10000)}万で獲得`,
              category: 'fa' as const,
              relatedIds: [playerId],
            }, ...s.currentSeason.newsFeed].slice(0, 30),
          },
        }))
        return true
      },

      listPlayerToForeignMarket: (playerId) => {
        // Simplified: just release from team, they go back to free agent pool
        get().releasePlayer(playerId)
      },

      acceptForeignOffer: (playerId) => {
        // Release the player to the foreign club
        get().releasePlayer(playerId)
      },

      // ── National team ─────────────────────────────────────────────────
      updateNationalTeam: () => {
        const state = get()
        const standingsSorted = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
        const coachTeamId = standingsSorted[0]?.teamId ?? state.playerTeamId
        const isPlayerCoach = coachTeamId === state.playerTeamId
        const domesticIds = new Set(state.teams.map(t => t.id))
        const sorted = state.players
          .filter(p => p.nationality === 'JPN' && p.status === 'active' && domesticIds.has(p.teamId))
          .sort((a, b) => ovr(b) - ovr(a))
        const squad = sorted.slice(0, 20).map(p => p.id)
        const racePlan = generateWECRacePlan()
        const racePlayerIds = autoSelectRacePlayers(squad, racePlan, state.players)
        set({ nationalTeam: { coachTeamId, year: state.currentSeason.year, squadIds: squad, racePlan, racePlayerIds, isPlayerCoach } })
      },

      confirmSquad: (ids: string[]) => {
        const state = get()
        const nt = state.nationalTeam
        if (!nt) return
        const racePlan = generateWECRacePlan()
        const racePlayerIds = autoSelectRacePlayers(ids, racePlan, state.players)
        set({ nationalTeam: { ...nt, squadIds: ids, racePlan, racePlayerIds } })
      },

      setRacePlayerIds: (raceIdx: number, ids: string[]) => {
        set(state => {
          if (!state.nationalTeam) return state
          const newRacePlayerIds = [...(state.nationalTeam.racePlayerIds ?? [])]
          newRacePlayerIds[raceIdx] = ids
          return { nationalTeam: { ...state.nationalTeam, racePlayerIds: newRacePlayerIds } }
        })
      },

      // ── Facilities ────────────────────────────────────────────────────
      upgradeFacility: (key) => {
        const state = get()
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam) return false
        const currentLv = myTeam.facilities?.[key] ?? 0
        if (currentLv >= 3) return false
        const UPGRADE_COSTS = [50, 100, 200]
        const cost = UPGRADE_COSTS[currentLv]
        if (state.jewels < cost) return false
        set(state => ({
          jewels: state.jewels - cost,
          teams: state.teams.map(t => t.id === state.playerTeamId ? {
            ...t,
            facilities: { ...t.facilities, [key]: currentLv + 1 },
          } : t),
        }))
        return true
      },

      // ── Individual Events ─────────────────────────────────────────────
      simulateIndividualEvent: (eventId) => {
        set(state => {
          const event = state.currentSeason.individualEvents?.find(e => e.id === eventId)
          if (!event || event.results) return state
          const activePlayers = state.players.filter(p => p.status === 'active' && p.teamId)
          const results = activePlayers.map(p => ({
            playerId: p.id,
            teamId: p.teamId,
            timeSec: simulateIndividualTime(p, event.distance),
          }))
          results.sort((a, b) => a.timeSec - b.timeSec)
          const ranked = results.map((r, i) => ({ ...r, rank: i + 1 }))

          // Form/morale boost for top finishers from player team
          const playerTeamTop = ranked.filter(r => r.teamId === state.playerTeamId && r.rank <= 3)
          const updatedPlayers = state.players.map(p => {
            if (playerTeamTop.some(r => r.playerId === p.id)) {
              return { ...p, morale: Math.min(100, (p.morale ?? 70) + 8), form: Math.min(2, (p.form ?? 0) + 1) }
            }
            return p
          })

          // News for player team finishers
          const myBest = ranked.find(r => r.teamId === state.playerTeamId)
          const myBestPlayer = myBest ? state.players.find(p => p.id === myBest.playerId) : null
          const distLabel = event.distance === 5000 ? '5000m' : event.distance === 10000 ? '10000m' : 'ハーフ'
          const newsItem = myBestPlayer ? {
            date: event.date,
            headline: `${event.name}：${myBestPlayer.name}が${distLabel}で${myBest!.rank}位（${fmtTime(myBest!.timeSec)}）`,
            category: 'race' as const,
            relatedIds: [myBestPlayer.id],
          } : null

          return {
            players: updatedPlayers,
            currentSeason: {
              ...state.currentSeason,
              individualEvents: state.currentSeason.individualEvents?.map(e =>
                e.id === eventId ? { ...e, results: ranked } : e
              ),
              newsFeed: newsItem
                ? [...(state.currentSeason.newsFeed ?? []), newsItem]
                : state.currentSeason.newsFeed ?? [],
            },
          }
        })
      },

      // ── World Ekiden ──────────────────────────────────────────────────
      simulateWorldEkiden: () => {
        set(state => {
          if (state.currentSeason.worldEkidenResult) return state

          const year = state.currentSeason.year
          let nt = state.nationalTeam
          if (!nt || nt.year !== year || !nt.racePlan || nt.racePlan.length < 3) {
            const sorted = [...state.players].sort((a, b) => ovr(b) - ovr(a))
            const squadIds = sorted.slice(0, 20).map(p => p.id)
            const racePlan = generateWECRacePlan()
            const racePlayerIds = autoSelectRacePlayers(squadIds, racePlan, state.players)
            nt = { coachTeamId: state.playerTeamId ?? '', year, squadIds, racePlan, racePlayerIds, isPlayerCoach: false }
          }

          const cityIdx = Math.max(0, Math.floor((year - 2027) / 4) % WEC_CITIES.length)
          const cityInfo = WEC_CITIES[cityIdx]
          const coachBoost = nt.isPlayerCoach ? 3 : 0

          const RACE_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1, 1]
          const WEC_NATIONS = [
            { country: 'KEN', name: 'ケニア',         boost: 24, variance: 30 },
            { country: 'ETH', name: 'エチオピア',      boost: 20, variance: 35 },
            { country: 'UGA', name: 'ウガンダ',        boost: 14, variance: 35 },
            { country: 'BHR', name: 'バーレーン',      boost: 9,  variance: 40 },
            { country: 'MAR', name: 'モロッコ',        boost: 7,  variance: 40 },
            { country: 'TAN', name: 'タンザニア',      boost: 5,  variance: 45 },
            { country: 'USA', name: 'アメリカ',        boost: 4,  variance: 45 },
            { country: 'EUR', name: 'ヨーロッパ選抜',  boost: 2,  variance: 40 },
            { country: 'ERI', name: 'エリトリア',      boost: 1,  variance: 50 },
            { country: 'QAT', name: 'カタール',        boost: -2, variance: 50 },
            { country: 'CHN', name: '中国',            boost: -4, variance: 45 },
            { country: 'KOR', name: '韓国',            boost: -5, variance: 45 },
            { country: 'NZL', name: 'ニュージーランド', boost: -8, variance: 50 },
            { country: 'AUS', name: 'オーストラリア',  boost: -10, variance: 50 },
          ]
          const WEATHERS = ['sunny', 'cloudy', 'rainy', 'windy'] as const
          const SPEC_OPTIONS = ['long', 'ace', 'allrounder', 'long', 'grinder'] as const

          const pointsAcc: Record<string, number> = {}
          WEC_NATIONS.forEach(n => { pointsAcc[n.country] = 0 })
          pointsAcc['JPN'] = 0

          const races: import('../types').WECRaceResult[] = nt.racePlan.map((plan, raceIdx) => {
            const weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)]
            const segCount = plan.segments.length

            // Race object: apply courseMult via distance scaling
            const wecRace: import('../types').Race = {
              id: `wec_${year}_r${raceIdx + 1}`,
              name: `世界駅伝選手権 第${raceIdx + 1}レース`,
              date: `${year}-12-01`,
              location: cityInfo.city,
              type: 'league' as const,
              segments: plan.segments.map((s, i) => ({
                index: i + 1,
                distanceKm: Math.round(s.distanceKm * cityInfo.courseMult * 10) / 10,
                uphillPct: s.uphillPct,
                downhillPct: s.downhillPct,
              })),
              conditions: { temperature: 15, weather, elevation: 0 },
              participants: [],
            }

            // Japan runners
            const rawIds = nt.racePlayerIds?.[raceIdx] ?? []
            const rawRunners = rawIds.map(id => state.players.find(p => p.id === id)).filter(Boolean) as Player[]
            const japanRunners = rawRunners.length >= segCount
              ? rawRunners.slice(0, segCount)
              : nt.squadIds.map(id => state.players.find(p => p.id === id)).filter(Boolean)
                  .sort((a, b) => ovr(b as Player) - ovr(a as Player))
                  .slice(0, segCount) as Player[]

            const boostedJapanRunners = coachBoost > 0
              ? japanRunners.map(p => ({ ...p, ratings: { ...p.ratings, speed: Math.min(99, p.ratings.speed + coachBoost), stamina: Math.min(99, p.ratings.stamina + coachBoost) } }))
              : japanRunners

            const lineups: Record<string, Record<number, string>> = { 'wec_JPN': {} }
            boostedJapanRunners.forEach((p, i) => { lineups['wec_JPN'][i + 1] = p.id })

            // Virtual players for foreign nations
            const avgJpnOvr = japanRunners.reduce((s, p) => s + ovr(p), 0) / Math.max(1, japanRunners.length)
            const virtualPlayers: Player[] = []
            WEC_NATIONS.forEach(n => {
              const targetOvr = Math.max(40, Math.min(98, avgJpnOvr + n.boost))
              lineups[`wec_${n.country}`] = {}
              for (let i = 0; i < segCount; i++) {
                const pid = `wec_${n.country}_${raceIdx}_${i}`
                const varOvr = Math.max(35, Math.min(99, Math.round(targetOvr + (Math.random() - 0.5) * (n.variance / 3))))
                const spec = SPEC_OPTIONS[Math.floor(Math.random() * SPEC_OPTIONS.length)]
                virtualPlayers.push({
                  id: pid, name: `${n.name}選手${i + 1}`, nameKana: '',
                  age: 25, yearsPro: 5, draftYear: 0, draftRound: null, draftPick: null,
                  ratings: { speed: varOvr, stamina: varOvr, mountainUp: varOvr, mountainDown: varOvr, pacing: varOvr, mental: varOvr, recovery: varOvr },
                  specialty: spec, potential: 80, growthCurve: 'normal',
                  teamId: `wec_${n.country}`, rosterTier: 'main',
                  contract: { yearsLeft: 1, annualSalary: 0, faEligibleYear: 9999 },
                  nationality: 'JPN', origin: n.name, jerseyNumber: i + 1, status: 'active',
                  fatigue: 10 + Math.floor(Math.random() * 20),
                  morale: 60 + Math.floor(Math.random() * 20),
                  form: Math.floor(Math.random() * 3) - 1,
                  career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
                } as Player)
                lineups[`wec_${n.country}`][i + 1] = pid
              }
            })

            // Boosted Japan runners override originals
            const boostedMap = new Map(boostedJapanRunners.map(p => [p.id, p]))
            const allPlayers = [...state.players.map(p => boostedMap.get(p.id) ?? p), ...virtualPlayers]

            const raceResult = simulateRace(wecRace, lineups, state.teams, allPlayers, 0.5)

            const legResults: import('../types').WECRaceResult['legResults'] = raceResult.segmentResults.map(sr => {
              const jr = sr.runners.find(r => r.teamId === 'wec_JPN')
              const jp = jr ? state.players.find(p => p.id === jr.playerId) : null
              const seg = wecRace.segments.find(s => s.index === sr.segmentIndex)
              return { segmentIndex: sr.segmentIndex, playerName: jp?.name ?? '不明', distanceKm: seg?.distanceKm ?? 0, timeSec: jr?.timeSec ?? 0 }
            })

            const segmentNationTimes: import('../types').WECSegmentNationTime[] = raceResult.segmentResults.map(sr => {
              const seg = wecRace.segments.find(s => s.index === sr.segmentIndex)
              const nations = [
                ...WEC_NATIONS.map(n => ({ country: n.country, name: n.name, timeSec: sr.runners.find(r => r.teamId === `wec_${n.country}`)?.timeSec ?? 0 })),
                { country: 'JPN', name: '日本', timeSec: sr.runners.find(r => r.teamId === 'wec_JPN')?.timeSec ?? 0 },
              ].sort((a, b) => a.timeSec - b.timeSec)
              return { segmentIndex: sr.segmentIndex, distanceKm: seg?.distanceKm ?? 0, uphillPct: seg?.uphillPct ?? 0, downhillPct: seg?.downhillPct ?? 0, nations }
            })

            const allCountryTimes = raceResult.teamRankings.map(tr => {
              if (tr.teamId === 'wec_JPN') return { country: 'JPN', name: '日本', totalTimeSec: tr.totalTimeSec }
              const n = WEC_NATIONS.find(x => `wec_${x.country}` === tr.teamId)
              return { country: n?.country ?? tr.teamId, name: n?.name ?? tr.teamId, totalTimeSec: tr.totalTimeSec }
            }).sort((a, b) => a.totalTimeSec - b.totalTimeSec)

            const countryResults = allCountryTimes.map((c, i) => ({ ...c, rank: i + 1, points: RACE_POINTS[i] ?? 1 }))
            countryResults.forEach(c => { pointsAcc[c.country] = (pointsAcc[c.country] ?? 0) + c.points })

            const japanTime = raceResult.teamRankings.find(tr => tr.teamId === 'wec_JPN')?.totalTimeSec ?? 0
            const japanRank = countryResults.find(c => c.country === 'JPN')?.rank ?? 15

            return { raceNumber: raceIdx + 1, weather, legResults, segmentNationTimes, countryResults, japanTime, japanRank }
          })

          const finalStandings: import('../types').WECFinalStanding[] = [
            ...WEC_NATIONS.map(n => ({ country: n.country, name: n.name })),
            { country: 'JPN', name: '日本' },
          ]
            .map(n => ({ ...n, totalPoints: pointsAcc[n.country] ?? 0 }))
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .map((n, i) => ({ ...n, finalRank: i + 1 }))

          const japanFinalRank = finalStandings.find(s => s.country === 'JPN')?.finalRank ?? 15
          const japanTotalTime = races.reduce((s, r) => s + r.japanTime, 0)

          const gmRepBoost = japanFinalRank === 1 ? 15 : japanFinalRank === 2 ? 10 : japanFinalRank === 3 ? 7 : japanFinalRank <= 6 ? 3 : japanFinalRank <= 10 ? 1 : 0
          const budgetBoost = japanFinalRank === 1 ? 20000000 : japanFinalRank === 2 ? 12000000 : japanFinalRank === 3 ? 8000000 : japanFinalRank <= 6 ? 3000000 : japanFinalRank <= 10 ? 1000000 : 0

          const resultLabel = japanFinalRank === 1 ? '金メダル獲得！' : japanFinalRank <= 3 ? `${japanFinalRank}位入賞！` : `${japanFinalRank}位`
          const newsItem = {
            date: `${year}-12-01`,
            headline: `世界駅伝選手権（${cityInfo.city}）3レース制：日本${resultLabel}`,
            category: 'race' as const,
            relatedIds: [],
          }

          return {
            gmRep: Math.min(100, (state.gmRep ?? 50) + gmRepBoost),
            teams: budgetBoost > 0 ? state.teams.map(t =>
              t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + budgetBoost } } : t
            ) : state.teams,
            currentSeason: {
              ...state.currentSeason,
              worldEkidenResult: { year, hostCity: cityInfo.city, courseChar: cityInfo.courseChar, races, finalStandings, japanFinalRank, japanTotalTime },
              newsFeed: [...(state.currentSeason.newsFeed ?? []), newsItem],
            },
          }
        })
      },

      applyTrainingCards: (playerId, cardIds, grantTrait, multiplier = 1.0) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player) return state
          const cards = (state.trainingCards ?? []).filter(c => cardIds.includes(c.id))
          if (cards.length === 0) return state
          const combo = detectCombo(cards)
          if (!combo) return state
          // statDeltas は EXP量（設計書準拠）。ポテ・年齢倍率なし（固定EXP付与）
          const result = processExpGains(
            player.ratings,
            player.exp ?? {},
            combo.statDeltas as Partial<Record<CardStatKey, number>>,
            multiplier,
            1.0,  // カードは年齢倍率なし
          )
          let newTraits = [...(player.traits ?? [])]
          if (grantTrait && combo.traitGrant && !newTraits.includes(combo.traitGrant)) {
            if (Math.random() < (combo.traitChance ?? 1.0)) {
              newTraits = [...newTraits, combo.traitGrant]
            }
          }
          const remaining = (state.trainingCards ?? []).filter(c => !cardIds.includes(c.id))
          return {
            trainingCards: remaining,
            players: state.players.map(p =>
              p.id === playerId ? { ...p, ratings: result.ratings, exp: result.exp, traits: newTraits } : p
            ),
          }
        })
      },

      dismissDroppedCards: () => set({ raceDroppedCards: [], raceExpGains: {} }),

      decideRenewal: (playerId, renew, years = 2) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player || player.teamId !== state.playerTeamId) return state

          const newPending = (state.currentSeason.pendingRenewalDecisions ?? []).filter(id => id !== playerId)

          if (!renew) {
            const newPlayers = state.players.map(p =>
              p.id === playerId ? { ...p, teamId: '', jerseyNumber: 0 } : p
            )
            const newTeams = state.teams.map(t =>
              t.id !== state.playerTeamId ? t : {
                ...t,
                roster: {
                  main: t.roster.main.filter(id => id !== playerId),
                  second: t.roster.second.filter(id => id !== playerId),
                }
              }
            )
            return { players: newPlayers, teams: newTeams, currentSeason: { ...state.currentSeason, pendingRenewalDecisions: newPending } }
          }

          const newSalary = Math.round(player.contract.annualSalary * 1.12 / 500000) * 500000
          const newPlayers = state.players.map(p =>
            p.id === playerId ? { ...p, contract: { ...p.contract, yearsLeft: years, annualSalary: newSalary } } : p
          )
          return { players: newPlayers, currentSeason: { ...state.currentSeason, pendingRenewalDecisions: newPending } }
        })
      },

      claimLoginBonus: () => {
        const state = get()
        // 10:00 AM reset: before 10AM counts as previous day
        const now = new Date()
        const base = new Date(now)
        if (base.getHours() < 10) base.setDate(base.getDate() - 1)
        const today = base.toISOString().slice(0, 10)
        if (state.lastLoginDate === today) return null

        const prev = new Date(base)
        prev.setDate(prev.getDate() - 1)
        const yesterday = prev.toISOString().slice(0, 10)
        const continued = state.lastLoginDate === yesterday
        const prevStreak = continued ? (state.loginStreak ?? 0) : 0
        const newStreak = prevStreak + 1
        const weeklyBonus = newStreak === 7 ? 1000 : 0
        const gained = 100 + weeklyBonus
        set({
          jewels: state.jewels + gained,
          lastLoginDate: today,
          loginStreak: newStreak === 7 ? 0 : newStreak,
          totalLoginDays: (state.totalLoginDays ?? 0) + 1,
        })
        return { daily: 100, weeklyBonus, streak: newStreak }
      },

      watchAd: () => {
        const state = get()
        const now = new Date()
        const base = new Date(now)
        if (base.getHours() < 10) base.setDate(base.getDate() - 1)
        const today = base.toISOString().slice(0, 10)
        const sameDay = state.lastAdDate === today
        const watched = sameDay ? (state.adsWatchedToday ?? 0) : 0
        if (watched >= 3) return null
        set({ jewels: state.jewels + 100, lastAdDate: today, adsWatchedToday: watched + 1 })
        return 100
      },

      resetGame: () => {
        set({ ...(emptyState() as unknown as GameStore) })
        localStorage.removeItem('jpel-manager-save')
      },
    }),
    {
      name: 'jpel-manager-save',
      version: 4,
      migrate: (persistedState: unknown, version: number) => {
        const s = persistedState as Record<string, unknown>
        // v1→v2: undrafted pool players that were never converted to FA
        if (version < 2 && s.isInitialized && Array.isArray(s.players)) {
          s.players = (s.players as Record<string, unknown>[]).map(p => {
            if (p.status === 'draft_eligible' && (p.teamId === '__pool__' || p.teamId === '')) {
              return { ...p, status: 'active', teamId: '' }
            }
            return p
          })
        }
        // v3→v4: reset ALL pre-populated career stats (wipes fake initial values for base/ai/fp players)
        if (version < 4 && Array.isArray(s.players)) {
          s.players = (s.players as Record<string, unknown>[]).map(p => ({
            ...p,
            career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
          }))
        }
        return s
      },
    }
  )
)

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function simulateIndividualTime(player: Player, distance: 5000 | 10000 | 21097): number {
  const o = ovr(player)
  const base = distance === 5000 ? (850 - (o - 50) * 2.0)
             : distance === 10000 ? (1740 - (o - 50) * 4.0)
             : (4100 - (o - 50) * 9.5)
  const specBonus = player.specialty === 'sprinter' ? -8 : player.specialty === 'long' ? -10 : player.specialty === 'ace' ? -5 : player.specialty === 'allrounder' ? -4 : 0
  const formBonus = (player.form ?? 0) * -5
  const fatiguePenalty = Math.max(0, (player.fatigue ?? 0) - 20) * 0.15
  const noise = (Math.random() - 0.5) * 25
  return Math.max(500, Math.round(base + specBonus + formBonus + fatiguePenalty + noise))
}

export const WEC_CITIES = [
  { city: 'ロンドン',       courseChar: 'フラットコース',           courseMult: 0.98 },
  { city: 'ナイロビ',       courseChar: '高地コース（標高1600m）',   courseMult: 1.04 },
  { city: 'ニューヨーク',   courseChar: '市街地・起伏あり',          courseMult: 1.01 },
  { city: 'ベルリン',       courseChar: 'フラット・高速コース',      courseMult: 0.97 },
  { city: '北京',           courseChar: '内陸部・大気コンディション', courseMult: 1.02 },
  { city: 'シドニー',       courseChar: '沿岸コース・海風',          courseMult: 1.01 },
  { city: 'バルセロナ',     courseChar: '丘陵地帯・高温多湿',        courseMult: 1.03 },
  { city: 'アディスアベバ', courseChar: '超高地（標高2400m）',       courseMult: 1.07 },
]

function generateWECRacePlan(): import('../types').WECRacePlan[] {
  return Array.from({ length: 3 }, () => {
    const segmentCount = 4 + Math.floor(Math.random() * 5)
    const segments = Array.from({ length: segmentCount }, () => ({
      distanceKm: Math.round((5 + Math.random() * 10) * 10) / 10,
      uphillPct: Math.floor(Math.random() * 35),
      downhillPct: Math.floor(Math.random() * 25),
    }))
    return { segments }
  })
}

function autoSelectRacePlayers(squadIds: string[], racePlan: import('../types').WECRacePlan[], players: Player[]): string[][] {
  const sorted = squadIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => ovr(b) - ovr(a))
  return racePlan.map(plan => sorted.slice(0, plan.segments.length).map(p => p.id))
}

export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── CPU チーム戦略ヘルパー ───────────────────────────────────────────────
function cpuTeamTier(teamId: string, players: Player[]): 'elite' | 'mid' | 'weak' {
  const roster = players.filter(p => p.teamId === teamId && p.rosterTier === 'main' && p.status === 'active')
  if (roster.length === 0) return 'weak'
  const avg = roster.reduce((s, p) => s + ovr(p), 0) / roster.length
  return avg >= 79 ? 'elite' : avg >= 73 ? 'mid' : 'weak'
}

function cpuSpecialtyNeeds(teamId: string, players: Player[]): string[] {
  const ALL = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const counts: Record<string, number> = {}
  const roster = players.filter(p => p.teamId === teamId && p.rosterTier === 'main' && p.status === 'active')
  for (const p of roster) counts[p.specialty] = (counts[p.specialty] ?? 0) + 1
  return ALL.filter(s => (counts[s] ?? 0) < 2).sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0))
}

function generateTransferActivity(
  players: Player[],
  teams: Team[],
  playerTeamId: string,
  raceIndex: number,
  existingListings: TransferListing[],
  existingIncoming: IncomingOffer[],
  isWindowOpen: boolean,
  transferRequests: { playerId: string; reason: string }[] = [],
): { listings: TransferListing[]; incomingOffers: IncomingOffer[] } {
  const validListings = existingListings.filter(l => l.expiresAtRace > raceIndex)
  const validIncoming = existingIncoming.filter(o => o.expiresAtRace > raceIndex)
  if (!isWindowOpen) return { listings: validListings, incomingOffers: validIncoming }

  const listedPlayerIds = new Set(validListings.map(l => l.playerId))
  const newListings: TransferListing[] = []
  const newIncoming: IncomingOffer[] = []
  const aiTeams = teams.filter(t => t.id !== playerTeamId)

  for (const team of aiTeams) {
    const teamPlayers = players.filter(p => p.teamId === team.id && p.rosterTier === 'main' && p.status !== 'retired')
    if (validListings.filter(l => l.fromTeamId === team.id).length >= 3) continue

    const avgOvr = teamPlayers.length > 0 ? teamPlayers.reduce((s, p) => s + ovr(p), 0) / teamPlayers.length : 60
    const tier = cpuTeamTier(team.id, players)
    const threshold = tier === 'elite' ? 72 : tier === 'mid' ? 65 : 58
    let listed = false

    // Surplus specialist: 3+ players of same specialty → list the weakest
    if (!listed) {
      const specGroups: Record<string, Player[]> = {}
      for (const p of teamPlayers) {
        if (!specGroups[p.specialty]) specGroups[p.specialty] = []
        specGroups[p.specialty].push(p)
      }
      for (const group of Object.values(specGroups)) {
        if (listed || group.length < 3) continue
        const c = [...group].filter(p => !listedPlayerIds.has(p.id) && p.contract.yearsLeft > 0 && ovr(p) >= 65).sort((a, b) => ovr(a) - ovr(b))[0]
        if (c) {
          const price = Math.max(500000, Math.round(calcTransferValue(c) * (c.age > 28 ? 0.85 : 1.0) / 500000) * 500000)
          newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: price, listedAtRace: raceIndex, expiresAtRace: raceIndex + 6, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.5).slice(0, 3).map(t => t.id) })
          listedPlayerIds.add(c.id); listed = true
        }
      }
    }

    // Surplus roster > 20: list player well below team average
    if (!listed && teamPlayers.length > 20) {
      const c = [...teamPlayers].filter(p => !listedPlayerIds.has(p.id) && p.contract.yearsLeft > 0 && ovr(p) >= 65 && ovr(p) < avgOvr - 5).sort((a, b) => ovr(a) - ovr(b))[0]
      if (c) {
        newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: Math.max(500000, Math.round(calcTransferValue(c) / 500000) * 500000), listedAtRace: raceIndex, expiresAtRace: raceIndex + 5, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.4).slice(0, 3).map(t => t.id) })
        listedPlayerIds.add(c.id); listed = true
      }
    }

    // Aging player (>30) with expiring contract below team average
    if (!listed) {
      const c = [...teamPlayers].filter(p => p.age > 30 && ovr(p) >= 65 && ovr(p) < avgOvr - 3 && !listedPlayerIds.has(p.id) && p.contract.yearsLeft <= 1).sort((a, b) => a.age - b.age)[0]
      if (c) {
        newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: Math.max(500000, Math.round(calcTransferValue(c) * 0.7 / 500000) * 500000), listedAtRace: raceIndex, expiresAtRace: raceIndex + 4, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.25).slice(0, 2).map(t => t.id) })
        listedPlayerIds.add(c.id); listed = true
      }
    }

    // Expiring contract below tier threshold
    if (!listed) {
      const c = [...teamPlayers].filter(p => p.contract.yearsLeft <= 1 && ovr(p) >= 65 && ovr(p) < threshold && !listedPlayerIds.has(p.id)).sort((a, b) => ovr(a) - ovr(b))[0]
      if (c) {
        newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: Math.max(500000, Math.round(calcTransferValue(c) * 0.65 / 500000) * 500000), listedAtRace: raceIndex, expiresAtRace: raceIndex + 4, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.25).slice(0, 2).map(t => t.id) })
        listedPlayerIds.add(c.id)
      }
    }
  }

  // Incoming offers targeting the player's team
  const playerTeamPlayers = players.filter(p => p.teamId === playerTeamId && p.rosterTier === 'main' && p.status !== 'retired')
  const offerTargets = new Set(validIncoming.map(o => o.playerId))
  const offeringTeams = new Set(validIncoming.map(o => o.fromTeamId))
  const wantToLeaveIds = new Set(transferRequests.map(r => r.playerId))

  for (const team of aiTeams) {
    if (offeringTeams.has(team.id)) continue
    const teamPlayers = players.filter(p => p.teamId === team.id && p.rosterTier === 'main')
    const tier = cpuTeamTier(team.id, players)
    const needsSlot = teamPlayers.length < 20
    const wantsUpgrade = tier === 'elite' ? Math.random() < 0.35 : tier === 'mid' ? Math.random() < 0.20 : Math.random() < 0.08

    // Teams are also attracted by players who have requested transfers
    const transferWantedPlayers = playerTeamPlayers.filter(p => wantToLeaveIds.has(p.id) && !offerTargets.has(p.id))
    const hasTransferTarget = transferWantedPlayers.length > 0 && Math.random() < 0.60

    if (!needsSlot && !wantsUpgrade && !hasTransferTarget) continue

    const needs = cpuSpecialtyNeeds(team.id, players)
    const minTargetOvr = needsSlot
      ? (tier === 'elite' ? 72 : 65)
      : (tier === 'elite' ? 78 : 73)

    let targets = playerTeamPlayers.filter(p => !offerTargets.has(p.id) && ovr(p) >= minTargetOvr)
    // Prioritize players who want to leave
    const wantLeaveTargets = targets.filter(p => wantToLeaveIds.has(p.id))
    if (wantLeaveTargets.length > 0) targets = wantLeaveTargets
    else {
      const specTargets = targets.filter(p => needs.includes(p.specialty))
      if (specTargets.length > 0) targets = specTargets
    }
    if (targets.length === 0) continue
    targets.sort((a, b) => ovr(b) - ovr(a))
    const target = targets[0]
    const tv = calcTransferValue(target)
    // Realistic offer: 85-105% for elite, 80-97% for others
    const ratio = tier === 'elite' ? (0.85 + Math.random() * 0.20) : (0.80 + Math.random() * 0.17)
    newIncoming.push({ id: `inc-${raceIndex}-${team.id}-${target.id}`, fromTeamId: team.id, playerId: target.id, offeredPrice: Math.max(1000000, Math.round(tv * ratio / 1000000) * 1000000), expiresAtRace: raceIndex + 3, round: 1 })
    offerTargets.add(target.id)
    offeringTeams.add(team.id)
  }

  // Competing bids for player-listed players (more likely for high-OVR players)
  const myListings = [...validListings, ...newListings].filter(l => l.fromTeamId === playerTeamId)
  const alreadyOfferedIds = new Set([...validIncoming, ...newIncoming].map(o => o.playerId))
  for (const listing of myListings) {
    if (alreadyOfferedIds.has(listing.playerId)) continue
    const p = players.find(pl => pl.id === listing.playerId)
    if (!p) continue
    const bidChance = ovr(p) >= 80 ? 0.65 : ovr(p) >= 72 ? 0.45 : 0.25
    const biddingTeams = aiTeams.filter(() => Math.random() < bidChance).slice(0, 4)
    for (const bTeam of biddingTeams) {
      const tv = calcTransferValue(p)
      newIncoming.push({
        id: `inc-lst-${raceIndex}-${bTeam.id}-${p.id}-${Date.now()}`,
        fromTeamId: bTeam.id,
        playerId: p.id,
        offeredPrice: Math.max(Math.round(listing.askingPrice * 0.92 / 500000) * 500000, Math.round(tv * (0.85 + Math.random() * 0.20) / 500000) * 500000),
        expiresAtRace: raceIndex + 3,
        round: 1,
      })
      alreadyOfferedIds.add(p.id)
      break
    }
  }

  return { listings: [...validListings, ...newListings], incomingOffers: [...validIncoming, ...newIncoming] }
}

type RatingsKey = keyof import('../types').Ratings

// ── EXP システム（設計書準拠） ─────────────────────────────────────────────

/** L→L+1 に必要なEXP。L<80: ×1 / 80≤L<90: ×2 / 90≤L: ×4 */
function requiredExpForLevel(level: number): number {
  const dull = level < 80 ? 1 : level < 90 ? 2 : 4
  return Math.floor(0.5 * level * level * dull)
}

/** ポテンシャル数値 → EXP倍率（設計書: S≥87→1.4 / A≥75→1.2 / B≥58→1.0 / C→0.75） */
function potMultiplier(potential: number): number {
  if (potential >= 87) return 1.4
  if (potential >= 75) return 1.2
  if (potential >= 58) return 1.0
  return 0.75
}

/** 年齢 × 成長曲線 → EXP倍率（成長期×2.5 / 下降期0 / その他×1） */
function ageMultiplier(p: Player): number {
  const peakAge = p.growthCurve === 'early' ? 24 : p.growthCurve === 'normal' ? 27 : 30
  const growthStart = peakAge - 5
  if (p.age >= growthStart && p.age < peakAge) return 2.5
  if (p.age >= peakAge + 4) return 0  // 下降期: EXP成長なし
  return 1.0
}

/** 区間の地形情報 → 区間タイプ */
type SegType = 'flat' | 'mountain_up' | 'mountain_down' | 'long' | 'technical'
function segmentType(uphillPct: number, downhillPct: number, distanceKm: number): SegType {
  if (uphillPct >= 40) return 'mountain_up'
  if (downhillPct >= 40) return 'mountain_down'
  if (distanceKm >= 15) return 'long'
  if (uphillPct + downhillPct >= 15) return 'technical'
  return 'flat'
}

/** 区間タイプ → 基本EXP配分（主400 / 副A200 / 副B150） */
function segTypeExpGain(type: SegType): Partial<Record<CardStatKey, number>> {
  switch (type) {
    case 'flat':          return { speed: 400, pacing: 200, stamina: 150 }
    case 'mountain_up':   return { mountainUp: 400, stamina: 200, mental: 150 }
    case 'mountain_down': return { mountainDown: 400, pacing: 200, speed: 150 }
    case 'long':          return { stamina: 400, mental: 200, recovery: 150 }
    case 'technical':     return { pacing: 400, mental: 200, stamina: 150 }
  }
}

/** EXP付与 → レベルアップ処理（カードはageMult=1固定で呼ぶ） */
function processExpGains(
  ratings: Player['ratings'],
  exp: Partial<Record<CardStatKey, number>>,
  gains: Partial<Record<CardStatKey, number>>,
  potMult: number,
  ageMult: number,
): { ratings: Player['ratings']; exp: Partial<Record<CardStatKey, number>> } {
  const newRatings = { ...ratings }
  const newExp = { ...exp }
  for (const [stat, baseGain] of Object.entries(gains) as [CardStatKey, number][]) {
    const gain = Math.round(baseGain * potMult * ageMult)
    if (gain <= 0) continue
    newExp[stat] = (newExp[stat] ?? 0) + gain
  }
  const STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
  for (const stat of STAT_KEYS) {
    let cur = (newRatings as Record<string, number>)[stat] ?? 0
    let acc = newExp[stat] ?? 0
    while (cur < 99 && acc > 0) {
      const req = requiredExpForLevel(cur)
      if (acc < req) break
      acc -= req
      cur++
    }
    ;(newRatings as Record<string, number>)[stat] = cur
    newExp[stat] = acc
  }
  return { ratings: newRatings, exp: newExp }
}

// ─────────────────────────────────────────────────────────────────────────────

function getPrimaryKey(specialty: string): RatingsKey {
  if (specialty === 'sprinter') return 'speed'
  if (specialty === 'mountain_up') return 'mountainUp'
  if (specialty === 'mountain_down') return 'mountainDown'
  if (specialty === 'ace') return 'pacing'
  return 'stamina'
}

// growPlayer: 年齢増加・自然老化（ピーク後の衰え）のみ。成長はレース/カードEXPで行う。
function growPlayer(p: Player): Player {
  const peakAge = p.growthCurve === 'early' ? 24 : p.growthCurve === 'normal' ? 27 : 30
  const ageDiff = (p.age + 1) - peakAge
  const ratings = { ...p.ratings }
  const primary = getPrimaryKey(p.specialty)

  if (ageDiff >= 1 && ageDiff < 4) {
    // 初期衰え: 身体系がわずかに落ちるが経験でカバー
    if (Math.random() < 0.30) ratings[primary] = Math.max(20, ratings[primary] - 1)
    if (Math.random() < 0.20) ratings.stamina = Math.max(20, ratings.stamina - 1)
    if (Math.random() < 0.35) ratings.mental = Math.min(99, ratings.mental + 1)
    if (Math.random() < 0.30) ratings.pacing = Math.min(99, ratings.pacing + 1)
  } else if (ageDiff >= 4) {
    // 本格的な衰え
    ratings[primary] = Math.max(20, ratings[primary] - rnd(1, 2))
    if (Math.random() < 0.60) ratings.stamina = Math.max(20, ratings.stamina - 1)
    if (Math.random() < 0.40) ratings.recovery = Math.max(20, ratings.recovery - 1)
    if (Math.random() < 0.20) ratings.speed = Math.max(20, ratings.speed - 1)
    if (Math.random() < 0.20) ratings.mental = Math.min(99, ratings.mental + 1)
    if (Math.random() < 0.15) ratings.pacing = Math.min(99, ratings.pacing + 1)
  }
  // 成長期・ピーク前後: レース/カードEXPに委ねる（growPlayerでは変化なし）

  return {
    ...p,
    age: p.age + 1,
    yearsPro: p.yearsPro + 1,
    ratings,
    fatigue: 5,
    form: 0,
    morale: Math.min(100, p.morale + 5),
    contract: { ...p.contract, yearsLeft: Math.max(0, p.contract.yearsLeft - 1) },
  }
}

export function calcTransferValue(p: Player): number {
  const o = ovr(p)
  const ageFactor = p.age <= 22 ? 1.3 : p.age <= 25 ? 1.1 : p.age <= 28 ? 0.95 : p.age <= 31 ? 0.7 : 0.45
  const specFactor = (p.specialty === 'ace' || p.specialty === 'allrounder') ? 1.15 : 1.0
  return Math.round(Math.max(0, o - 50) * 500000 * ageFactor * specFactor / 500000) * 500000
}

function buildInitialNews() {
  return [
    { date: '2027-03-01', headline: 'JPELドラフト完了！各球団が新体制でシーズン準備へ', category: 'draft' as const, relatedIds: [] },
    { date: '2027-03-05', headline: '出雲開幕戦まであと10日——各球団の仕上がりは？', category: 'race' as const, relatedIds: [] },
    { date: '2027-03-08', headline: '第1回JPEL開幕直前！注目のルーキーたちを紹介', category: 'draft' as const, relatedIds: [] },
  ]
}
