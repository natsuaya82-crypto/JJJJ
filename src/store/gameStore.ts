import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { saveStorage, flushSaveNow } from './saveStorage'
import type { GameState, Player, Team, RosterTier, RaceResults, TransferListing, IncomingOffer, IncomingLoanOffer, LoanRequest, LoanResponse, TradeNegotiation, ContractRequest, AcquisitionOffer, AITradeOffer, TeamRole, ForeignCategory, FacilityKey, Achievement, CardRarity, CardStatKey, TrainingCard, Gift, Ratings, Race, TransferRecord, SeasonAward, EclStanding } from '../types'
import type { ISim } from '../engine/interactiveRace'
import { SPECIALTY_LABELS } from '../types'
import { INITIAL_TEAMS } from '../data/teams'
import { BASE_PLAYERS } from '../data/players'
import { SEASON_2027_RACES, generateSeasonRaces, SECOND_TEAM_RACES_INITIAL, generateSecondTeamRaces, generateIndividualEvents } from '../data/races'
import { generateDraftPool, buildDraftOrder, generateCpuRosters, generateForeignLeaguePlayers, refreshForeignLeagues, nationalityToForeignCategory, generatePlayerInitialRoster } from '../engine/playerGenerator'
import { simulateRace, buildAILineup, calcWeatherModifier } from '../engine/raceEngine'
import { generateRaceEvents } from '../engine/eventEngine'
import { simulateForeignLeagueRound, applyForeignChampions, initForeignStandings } from '../engine/foreignLeague'
import { simulateEclEvent } from '../engine/ecl'
import type { EclParticipant } from '../engine/ecl'
import { ECL_COURSES } from '../data/eclCourses'
import { simulateForeignTransferMarket, simulateCrossBorderTransfers } from '../engine/foreignTransfers'
import { ovr, faMarketSalary, playerConsentToMove, freeContactConsent, seasonAppearances, isDataKeyPlayer, calcTransferValue, racesConsumed, isOpponentScouted, getStatPotentials, limitBreakCost } from '../utils/playerUtils'
import { getAdDay, ADS_PER_DAY } from '../utils/ads'
import { computeNextSeasonBudget, seasonOperatingResult, rankBudgetGrant, RANK_BUDGET, runningCost, draftPickValue, transferBidBase, leagueDutyGrantCut, racePrizeByRank, cpuSeasonRaceIncome } from '../data/economy'
import { tierForContract, canSignContract, MAIN_REG_MAX, SECOND_REG_MAX, canReleaseFromRoster } from '../data/rosterRules'
import { generateDropCards, detectCombo, MAX_FUSION_CARDS, RARITY_EXP, generateRestCard, generateTrainingCard } from '../utils/cardCombo'
import { FOREIGN_LEAGUES } from '../data/foreignLeagues'
import { generateSponsorOffers } from '../data/sponsors'
import { computeSeasonAwards } from '../utils/awards'

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
  logoId?: string
  region?: string   // プレイヤーが自由入力した本拠地・地域（表示専用。未指定なら選んだ枠のまま）
  city?: string     // プレイヤーが自由入力した本拠地・市（表示専用）
}

// 契約形態→データ上の rosterTier。1軍契約(standard)/2way(dual)→main、育成(development)→second。
// （2wayは1軍側で保持し、2軍にも所属扱い）
function tierForContractType(ct?: 'standard' | 'development' | 'dual'): 'main' | 'second' | null {
  if (!ct) return null
  return tierForContract(ct)
}

// 既存選手の階層を desiredTier に移す。枠上限(rosterRulesの登録上限: 1軍23/2軍20)を超える場合は移動せず現状維持。
// team.roster 配列と rosterTier を同期させ、枠超過が起きないようにする。
function placePlayerInTier(
  teams: Team[], teamId: string, playerId: string,
  currentTier: 'main' | 'second', desiredTier: 'main' | 'second',
): { tier: 'main' | 'second'; teams: Team[] } {
  if (desiredTier === currentTier) return { tier: currentTier, teams }
  const team = teams.find(t => t.id === teamId)
  if (!team) return { tier: currentTier, teams }
  const cap = desiredTier === 'main' ? MAIN_REG_MAX : SECOND_REG_MAX
  const count = desiredTier === 'main' ? team.roster.main.length : team.roster.second.length
  if (count >= cap) return { tier: currentTier, teams }
  const newTeams = teams.map(t => t.id !== teamId ? t : {
    ...t,
    roster: {
      main: desiredTier === 'main'
        ? [...t.roster.main.filter(id => id !== playerId), playerId]
        : t.roster.main.filter(id => id !== playerId),
      second: desiredTier === 'second'
        ? [...t.roster.second.filter(id => id !== playerId), playerId]
        : t.roster.second.filter(id => id !== playerId),
    },
  })
  return { tier: desiredTier, teams: newTeams }
}

// 指名権のバックフィル判定。「自分が今持っているか」ではなく「どこかのチームが保有しているか」で見る。
// 売却・トレード済みの指名権を「欠落」と誤認して再生成（複製）しないため。
function pickExistsAnywhere(teams: Team[], ownerId: string, year: number, round: number): boolean {
  return teams.some(t => (t.draftPicks ?? []).some(pk => pk.year === year && pk.round === round && pk.originallyOwnedBy === ownerId))
}

// 指名権番号を「前年順位の逆順」で振るためのマップ。最下位=1（全体1位指名）〜優勝=N。
// 各チームの直近シーズン順位（history.seasonResults の最新年）を使い、成績の悪い順に 1,2,3... を割り当てる。
// 履歴なし（開幕年など）は最下位扱いとし、配列順を維持（＝従来と同じ挙動でフォールバック）。
function standingsPickNumbers(teams: Team[]): Map<string, number> {
  const latestRank = (t: Team): number => {
    const past = t.history?.seasonResults ?? []
    if (past.length === 0) return Number.POSITIVE_INFINITY
    return past.reduce((best, r) => (r.year > best.year ? r : best)).rank
  }
  const sorted = [...teams].sort((a, b) => latestRank(b) - latestRank(a)) // 成績が悪い順（順位の数字が大きい順）
  const map = new Map<string, number>()
  sorted.forEach((t, i) => map.set(t.id, i + 1))
  return map
}

// 2年目以降のドラフト順（1巡目）を決める加重抽選。
// 前年下位5チームだけ抽選で全体1〜5位の指名順を決め、残り（6位以降）は前年順位の逆順。
// teamId → 全体指名順位(1=全体1位) を返す。
function draftLotteryOrder(teams: Team[]): Map<string, number> {
  const latestRank = (t: Team): number => {
    const past = t.history?.seasonResults ?? []
    if (past.length === 0) return Number.POSITIVE_INFINITY
    return past.reduce((best, r) => (r.year > best.year ? r : best)).rank
  }
  const sorted = [...teams].sort((a, b) => latestRank(b) - latestRank(a)) // 成績が悪い順
  // 下位5チームの重み（最下位ほど高い＝1位指名を引きやすい）
  const LOTTERY_WEIGHTS = [40, 25, 18, 11, 6]
  const pool = sorted.slice(0, 5).map((t, i) => ({ id: t.id, w: LOTTERY_WEIGHTS[i] ?? 1 }))
  const lotteryOrder: string[] = []
  while (pool.length > 0) {
    const total = pool.reduce((s, x) => s + x.w, 0)
    let r = Math.random() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { idx = i; break } }
    lotteryOrder.push(pool[idx].id)
    pool.splice(idx, 1)
  }
  const full = [...lotteryOrder, ...sorted.slice(5).map(t => t.id)]
  const map = new Map<string, number>()
  full.forEach((id, i) => map.set(id, i + 1))
  return map
}

// 指名権キー "YYYY-R{round}-{pickNumber}" から市場価値を出す（位置連動）。解釈不能なら2巡相当
function pickKeyValue(key: string): number {
  const m = key.match(/-R(\d+)-(\d+)$/)
  return m ? draftPickValue(Number(m[1]), Number(m[2])) : 8_000_000
}

// 獲得交渉での選手の希望年俸（厳しめ）。市場年俸に実績プレミアムを乗せ、引き抜きは現年俸からの昇給を要求。
// 相手チームが選手を手放すか。年俸ではなく「出場データ（よく出ている＝主力）」で判断。
// playFraction=消化レースでの出場割合, teamRaces=消化レース数。
function isEssentiallyUnpoachable(player: Player, playFraction: number, teamRaces: number): boolean {
  return isDataKeyPlayer(player, playFraction, teamRaces)
    && player.contract.yearsLeft >= 2
    && (player.morale ?? 60) >= 45
}

// 引き抜き選手の希望年俸。市場相場に、出場データ（主力ほど高い）と現年俸からの昇給要求を反映。
function acquisitionDesiredSalary(player: Player, source: 'fa' | 'scout', playFraction = 0.5, teamRaces = 0): number {
  // 市場給与(OVR/年齢ベース・非線形)と現年俸のブレンド。市場中心＋現年俸で急変を防ぐ。
  // → 衰えれば市場給与が下がって希望も下がる／現在高給でもすぐ暴落しない。
  const market = faMarketSalary(player)
  const cur = player.contract.annualSalary
  const c = player.career
  const achieve = 1 + Math.min(0.20, c.championships * 0.04 + c.mvpAwards * 0.03)
  let desired = (market * 0.65 + cur * 0.35) * achieve
  const personality = player.personality ?? 'salary'
  if (personality === 'salary') desired *= 1.10   // 金型は高め
  if (source === 'scout' && teamRaces >= 3) {
    // 引き抜き：よく出てる主力ほど手放させるのに上乗せ
    const playMult = playFraction >= 0.8 ? 1.35 : playFraction >= 0.6 ? 1.18 : 1.0
    desired *= playMult
  }
  return Math.round(desired / 500000) * 500000
}

// 補強禁止判定：前季までの連続赤字ペナルティ中、または現在の残高がマイナスの間は
// 新規補強（FA・移籍金・引き抜き・レンタル・海外獲得）を止める。ドラフト・契約更新は可。
export function reinforcementBanned(team: { finance: { budget: number; deficitStreak?: number } } | undefined): boolean {
  if (!team) return false
  // 3シーズン連続赤字で補強禁止。または現在の残高がマイナスの間も禁止。
  return (team.finance.deficitStreak ?? 0) >= 3 || team.finance.budget < 0
}

// 獲得成立時の署名処理。旧チームから外し自チームへ。tier満杯(1軍20/2軍18)なら null（契約不可）。
function buildAcquisitionSigning(
  players: Player[], teams: Team[], playerTeamId: string, currentRaceIndex: number, year: number,
  playerId: string, salary: number, years: number,
  contractType: 'standard' | 'development' | 'dual', teamRole?: TeamRole,
): { players: Player[]; teams: Team[] } | null {
  const player = players.find(p => p.id === playerId)
  const myTeam = teams.find(t => t.id === playerTeamId)
  if (!player || !myTeam) return null
  const tier: 'main' | 'second' = tierForContract(contractType)
  // 枠チェック（1軍契約18・2軍契約15・2way5・登録上限）
  if (!canSignContract(players, playerTeamId, contractType)) return null
  const isDual = contractType === 'dual'
  const oldTeamId = player.teamId
  const newPlayers = players.map(p => p.id === playerId ? {
    ...p,
    teamId: playerTeamId,
    rosterTier: tier,
    
    status: 'active' as const,
    form: 0,
    teamRole: teamRole ?? p.teamRole,
    acquiredRaceIndex: currentRaceIndex,
    joinedYear: year,
    contract: { ...p.contract, annualSalary: salary, yearsLeft: years, contractType },
  } : p)
  const newTeams = teams.map(t => {
    if (oldTeamId && oldTeamId !== playerTeamId && t.id === oldTeamId) {
      return { ...t, roster: { main: t.roster.main.filter(id => id !== playerId), second: t.roster.second.filter(id => id !== playerId) } }
    }
    if (t.id === playerTeamId) {
      return { ...t, roster: {
        main: (tier === 'main' || isDual) ? [...t.roster.main.filter(id => id !== playerId), playerId] : t.roster.main.filter(id => id !== playerId),
        second: (tier === 'second' || isDual) ? [...t.roster.second.filter(id => id !== playerId), playerId] : t.roster.second.filter(id => id !== playerId),
      } }
    }
    return t
  })
  return { players: newPlayers, teams: newTeams }
}

export type GameStore = GameState & {
  isInitialized: boolean
  setupData: SetupData | null
  draftState: DraftState | null
  raceLineup: Record<number, string>   // segmentIndex → playerId (for current race)
  lastRaceLineup: Record<number, string>  // saved from previous race for "前回" restore
  seenJoinIds: string[]   // 加入通知を確認済みの選手キー（`playerId-joinedYear`）
  seenInjuryIds?: string[]   // 負傷通知を確認済みのキー（`playerId-injuredUntilRace`）。OKで消せる
  dismissInjuryNotice: (key: string) => void

  // Setup
  startSetup: (setup: SetupData) => void
  beginInauguralDraft: () => void
  updateMyTeam: (patch: { name?: string; shortName?: string; gmName?: string; logoId?: string; region?: string; city?: string }) => void

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
  submitRoster: (selectedIds: string[]) => void
  generateDevProspects: () => void
  scoutDevProspect: (prospectId: string) => void
  signDevProspect: (prospectId: string) => void

  // Scouting
  spendScoutPoint: () => void
  scoutDraftProspect: (prospectId: string) => void
  initScoutPool: () => void

  // Transfer & FA
  releasePlayer: (playerId: string) => void
  signFAPlayer: (playerId: string, salary?: number, years?: number, contractType?: 'standard' | 'development' | 'dual', rosterTier?: 'main' | 'second') => boolean
  // ドラフト後：指名した新人の契約（年俸・役割・契約形態・契約年数）を設定
  setDraftContract: (playerId: string, salary: number, years: number, contractType: 'standard' | 'development' | 'dual', teamRole?: import('../types').TeamRole) => void
  extendContract: (playerId: string) => void
  tradePlayer: (offeredIds: string[], requestedIds: string[], targetTeamId: string, transferFee?: number, offerPickKeys?: string[], requestPickKeys?: string[]) => boolean
  proposeTrade: (targetTeamId: string, giveIds: string[], givePickKeys: string[], getIds: string[], getPickKeys: string[]) => void
  acceptTradeCounter: (negId: string) => boolean
  dismissTradeNegotiation: (negId: string) => void
  setChatLog: (playerId: string, messages: import('../types').ChatMessage[]) => void
  getTransferWindow: () => { open: boolean; label: string; racesUntil: number | null }
  getRosterWindow: () => { open: boolean; label: string }
  ensureFuturePicks: () => void

  // Player sheet
  openPlayerId: string | null
  openPlayerSheet: (id: string | null) => void

  // 個別契約情報モーダル
  contractInfoPlayerId: string | null
  openContractInfo: (id: string) => void
  closeContractInfo: () => void

  // Card fusion (練習) UI state
  fusionPlayerId: string | null
  fusionCardIds: string[]
  setFusionPlayer: (id: string) => void
  addFusionCard: (id: string) => void
  removeFusionCard: (id: string) => void
  clearFusion: () => void
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
  acceptIncomingOffer: (offerId: string) => boolean
  declineIncomingOffer: (offerId: string) => void
  acceptIncomingLoanOffer: (offerId: string) => boolean
  declineIncomingLoanOffer: (offerId: string) => void
  initiateContractRenewal: (playerId: string) => void
  submitContractRenewalOffer: (requestId: string, salary: number, years: number, contractType?: 'standard' | 'development' | 'dual', teamRole?: import('../types').TeamRole) => void
  acceptContractCounter: (requestId: string) => void
  reNegotiateContract: (requestId: string) => void
  abandonContractRenewal: (requestId: string) => void
  // 獲得オファー交渉（FA・他チーム視察）
  startAcquisitionOffer: (playerId: string, source: 'fa' | 'scout') => void
  submitAcquisitionOffer: (offerId: string, salary: number, years: number, contractType: 'standard' | 'development' | 'dual', teamRole?: import('../types').TeamRole) => void
  acceptAcquisitionCounter: (offerId: string) => void
  reNegotiateAcquisition: (offerId: string) => void
  abandonAcquisitionOffer: (offerId: string) => void
  releasePlayerWithBuyout: (playerId: string) => boolean
  counterIncomingOffer: (offerId: string, counterPrice: number) => 'sold' | 'refused' | 'invalid'
  generateContractRequests: () => void
  dismissRetirementRequest: (playerId: string) => void
  acceptRetirement: (playerId: string) => void
  dismissTransferRequest: (playerId: string) => void
  allowPlayerTransfer: (playerId: string) => void  // 移籍を認める→移籍リスト入り（他チームがオファー・決まらなければFA）
  toggleNoSale: (playerId: string) => void  // 移籍方針・非売のON/OFF（ONで他クラブからの買い取りオファーをブロック）
  toggleLoanListed: (playerId: string) => void  // 移籍方針・貸出歓迎のON/OFF（ONでレンタル打診が優先的に来る）
  cancelSellListing: (playerId: string) => void  // 移籍方針・売出の解除（出品取り下げ＋退団予定フラグ解除）
  // レンタル移籍（レンタル枠 最大3・別枠・移籍金なし・給与は借り手負担・期間後自動返却）
  loanInPlayer: (playerId: string, years: number, force?: boolean) => boolean   // 他チームから借りる（forceで主力判定スキップ＝相手が貸す打診済み）
  loanOutPlayer: (playerId: string, toTeamId: string, years: number) => boolean  // 自チームの選手を貸す
  submitLoanRequest: (playerId: string, years: number) => boolean  // 移籍市場からレンタル要請を出す
  cancelLoanRequest: (playerId: string) => void                    // レンタル要請を取り下げる
  dismissLoanResponse: (id: string) => void                        // レンタル回答の通知を確認済みにする
  submitTransferBid: (playerId: string, fee: number) => void
  acceptFeeCounter: (bidId: string) => void
  rejectTransferBid: (bidId: string) => void
  finalizeTransfer: (bidId: string, salary: number, years: number) => { ok: boolean; reason?: string }
  listMyPlayerForSale: (playerId: string, askingPrice: number) => void
  delistMyPlayer: (playerId: string) => void
  sellDraftPick: (pickKey: string, targetTeamId: string, price: number) => boolean

  // Opponent scouting & starring
  scoutOpponentPlayer: (playerId: string) => void
  toggleStarOpponent: (playerId: string) => void
  toggleStarProspect: (prospectId: string) => void
  setDisplayBadge: (playerId: string, badgeKey: string | null) => void

  // Training plan
  setTrainingPlan: (plan: string | null) => void

  // Rival & preseason cards
  setRivalTeam: (id: string | null) => void
  claimPreseasonCards: () => void

  // Second team
  runSecondTeamRace: (lineup: Record<number, string>, strategy?: 'aggressive' | 'balanced' | 'conservative') => void
  setReserveLeagueJoined: (joined: boolean) => void

  // 海外リーグ：本編レースに同期して裏で1戦進める（プレイヤーは干渉せず結果閲覧のみ）
  advanceForeignLeagues: () => void
  runMidSeasonForeignTransfers: () => void   // 移籍ウィンドウ中、レース毎に低確率で日本↔海外の移籍を少数発生
  advanceMarketOneRace: () => void           // 本編以外(リザーブ/記録会)のレースでも入札・レンタル要請の応答を進める
  // ECL：前年の各リーグ上位2（計16チーム）がシーズン中の5戦をポイント制で争う。
  // 次の1戦を開催する（自チーム出場時は lineup で区間配置。未指定はOVR上位を自動配置）。
  // 5戦目の消化で最終順位・賞金・パッチ・歴代記録が確定する
  advanceEclRace: (playerLineup?: Record<number, string>) => void

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
  simulateIndividualEvent: (eventId: string, skipPlayerIds?: string[]) => void

  // World Ekiden
  simulateWorldEkiden: () => void

  // Card training
  applyTrainingCards: (playerId: string, cardIds: string[], grantTrait?: boolean, multiplier?: number) => void
  // ジュエルで能力1つの上限を+1する（コストは playerUtils.limitBreakCost。99が天井）
  breakStatLimit: (playerId: string, stat: CardStatKey) => void
  // 余ったカードを上位レアへEXP等価で一括変換（ノーマル4→レア1／レア10→エピック3／エピック5→レジェンド2）。
  // 変換できた枚数を返す（束が組めなければ0）
  convertCards: (rarity: 'normal' | 'rare' | 'epic') => number
  dismissDroppedCards: () => void
  dismissBudgetNotice: () => void

  // Update gifts (通知から受け取るプレゼント)
  grantUpdateGifts: () => void
  claimGift: (id: string) => void
  ensureIndividualEvents: () => void

  // 加入通知（全経路：FA/移籍/レンタル/トレード/ドラフト）を確認済みにする
  dismissJoinNotice: (key: string) => void

  // Contract renewals
  decideRenewal: (playerId: string, renew: boolean, years?: number) => void

  // Login bonus
  claimLoginBonus: () => { daily: number; weeklyBonus: number; streak: number } | null

  // Ad watching
  watchAd: () => number | null

  // 買い切り版（広告なし）
  setAdsRemoved: (v: boolean) => void
  // レース中の選択イベントを出すか（オフ＝流し見モード。トラック再生と結果だけ進む）
  raceEventsEnabled?: boolean
  setRaceEventsEnabled: (v: boolean) => void
  // 公式Xフォロー案内ポップを表示済みにする（初回のみ表示するためのフラグ）
  markTwitterIntroSeen: () => void
  dismissExpiredNegotiation: (id: string) => void
  dismissFreeTransferNotice: (id: string) => void
  markFreeContactSeen: (id: string) => void
  // フリー接触中の選手に引き留めを断られた：以後この接触は通知・要対応に出さず、本人の決断を待つだけにする
  refuseFreeContactRetention: (playerId: string) => void
  dismissDepartureNotice: (id: string) => void

  // Dev reset
  resetGame: () => void
}

function emptyState(): Omit<GameStore, keyof ReturnType<typeof create>> {
  const basePlayers = BASE_PLAYERS.map(p => ({ ...p, teamId: '', career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 } }))
  return {
    isInitialized: false,
    setupData: null,
    draftState: null,
    raceLineup: {},
    lastRaceLineup: {},
    openPlayerId: null,
    contractInfoPlayerId: null,
    fusionPlayerId: null,
    fusionCardIds: [],
    raceStrategy: 'balanced',
    raceTeamTalk: 'best',
    activeRacePhase: null,
    activeRaceSim: null,
    activeRaceResults: null,
    activeRaceLockedRaceIndex: 0,
    activeRaceLockedRace: null,
    rivalTeamId: null,
    gmRep: 50,
    seenJoinIds: [],
    seenInjuryIds: [],
    playerTeamId: 'fukuoka',
    currentSeason: {
      year: 2027,
      currentRaceIndex: 0,
      phase: 'draft',
      races: [],
      collegeRaces: [],
      draftPool: [],
      scoutPoints: 5,
      initialBudget: rankBudgetGrant(20),
      seasonGrant: rankBudgetGrant(20),   // 1年目は前シーズンが無いので最下位20位相当のグラント＝3.5億。運営費＝この10%。
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
      acquisitionOffers: [],
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
    seasonBudgetNotice: null,
    // 初期予算はグラント表から算出（initialRank連動）。teams.tsの旧ハードコード値に依存しない
    // 初期施設もinitialRank連動（1-5位:各Lv4=維持費8000万/年、6-10位:Lv3=6000万、11-15位:Lv2=4000万、16-20位:Lv1=2000万）
    teams: INITIAL_TEAMS.map(t => {
      const facLv = t.initialRank <= 5 ? 4 : t.initialRank <= 10 ? 3 : t.initialRank <= 15 ? 2 : 1
      return {
        ...t,
        roster: { main: [], second: [] },
        facilities: { trainingCamp: facLv, medicalCenter: facLv, scoutOffice: facLv, tacticsRoom: facLv },
        finance: { ...t.finance, salaryTotal: 0, budget: rankBudgetGrant(t.initialRank) },
      }
    }),
    players: basePlayers,
    saveTimestamp: new Date().toISOString(),
    version: '0.1.0',
    sponsors: [],
    foreignLeagues: FOREIGN_LEAGUES,
    nationalTeam: undefined,
    trainingCards: [],
    raceDroppedCards: [],
    pendingGifts: [],
    giftGivenVersions: [],
    jewels: 0,
    starredOpponents: [],
    starredProspects: [],
    segmentRecords: {},
    // 世界記録・日本記録は空から始め、ゲーム内選手の実走タイムだけで記録を作る
    // （架空のベースライン保持者は廃止。記録保持者には必ずパッチが付く）
    worldRecords: {},
    japanRecords: {},
    transferHistory: [],
    lastLoginDate: undefined as unknown as string,
    loginStreak: undefined as unknown as number,
    totalLoginDays: undefined as unknown as number,
    lastAdDate: undefined as unknown as string,
    adsWatchedToday: undefined as unknown as number,
    adsRemoved: false,
    twitterIntroSeen: false,
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

// シーズン目標。チーム目標＝順位で、前年順位からスケール（初年度は緩め、強くなるほど厳しく）。
function selectSeasonObjectives(hasRival: boolean, teamsLen: number, prevRank?: number) {
  type ObjTemplate = { id: string; desc: string; target: number; rewardJewels: number }
  // 順位目標：初年度はリーグ中位あたりの緩い目標。以降は前年順位から1つ上を狙う（優勝後は優勝維持）。
  const targetRank = prevRank == null
    ? Math.max(6, Math.round(teamsLen * 0.6))
    : Math.max(1, prevRank - 1)
  const rankObj: ObjTemplate = {
    id: 'topN',
    desc: targetRank <= 1 ? '総合優勝' : `トップ${targetRank}フィニッシュ`,
    target: targetRank,
    rewardJewels: targetRank <= 1 ? 150 : targetRank <= 3 ? 80 : targetRank <= 5 ? 50 : 30,
  }
  const pool: ObjTemplate[] = [
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
  const selected: ObjTemplate[] = [rankObj]   // 順位目標は常に含める
  const usedIds = new Set<string>(['topN'])
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
          const players = state.players.map(p => {
            if (!baseIds.includes(p.id)) return p
            const bi = baseIds.indexOf(p.id)
            // 契約年数を3〜5年にばらけさせ、更新が一斉に来ないようにする
            return { ...p, teamId: setup.teamId, contract: { ...p.contract, yearsLeft: 3 + (bi % 3) } }
          })
          const teams = state.teams.map(t => {
            if (t.id === setup.teamId) {
              return {
                ...t,
                name: setup.teamName,
                shortName: setup.teamShortName,
                gmName: setup.gmName,
                logoId: setup.logoId,
                // 本拠地はプレイヤーが自由入力した値で上書き（表示専用。空なら枠の元値のまま）
                region: setup.region?.trim() ? setup.region.trim() : t.region,
                city: setup.city?.trim() ? setup.city.trim() : t.city,
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
        // 初年度は前シーズンが無いので「初期予算の逆順（貧乏なチームから）」で指名順を決める。
        // プレイヤーは最弱スタート（rank20相当=最少予算）なので全体1位固定。残りは初期予算の少ない順。
        // 2巡目はスネークで逆順（1位から）。
        const inauguralOthers = [...state.teams]
          .filter(t => t.id !== state.playerTeamId)
          .sort((a, b) => rankBudgetGrant(a.initialRank) - rankBudgetGrant(b.initialRank))
          .map(t => t.id)
        const inauguralRound1 = [state.playerTeamId, ...inauguralOthers]
        const pickOrder = [...inauguralRound1, ...[...inauguralRound1].reverse()]
        const draftState: DraftState = {
          pool,
          pickOrder,
          currentPick: 0,
          picks: [],
          isComplete: false,
        }

        // Pre-populate AI team rosters (main + second) and player team initial roster
        const { cpuPlayers, teamRosters } = generateCpuRosters(
          state.teams.filter(t => t.id !== state.playerTeamId),
          state.currentSeason.year,
        )
        const { players: prPlayers, mainIds: prMainIds, dualIds: prDualIds, secondIds: prSecondIds } =
          generatePlayerInitialRoster(state.currentSeason.year)
        const prPlayersWithTeam = prPlayers.map(p => ({ ...p, teamId: state.playerTeamId }))
        const prSalaryTotal = prPlayers.reduce((s, p) => s + p.contract.annualSalary, 0)

        const teams = state.teams.map(t => {
          if (t.id === state.playerTeamId) {
            return {
              ...t,
              roster: { main: [...prMainIds, ...prDualIds], second: [...prSecondIds, ...prDualIds] },
              // 最弱スタート：初期予算は最下位(20位)グラント、施設は0から自分で建てる
              facilities: {},
              finance: { ...t.finance, budget: rankBudgetGrant(20), salaryTotal: prSalaryTotal },
            }
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

        // startSetup で teamId を付与した BASE_PLAYERS を除外し、prPlayersWithTeam に置き換える
        const players = [
          ...state.players.filter(p => p.teamId !== state.playerTeamId),
          ...cpuPlayers, ...pool, ...foreignPlayers, ...prPlayersWithTeam,
        ]
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

        const updatedPlayer: Player = {
          ...player,
          teamId: playerTeamId,
          rosterTier: 'main',
          
          draftRound: currentPick < 20 ? 1 : 2,
          draftPick: (currentPick % 20) + 1,
          status: 'active',
          joinedYear: state.currentSeason.year,
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

        const eligibleByCap = pool.filter(p => {
          if (p.nationality === 'FOREIGN' && foreignCount >= 3) return false
          return true
        })
        // 外国人枠で全員弾かれても指名は進める（デッドロック＝ドラフト凍結・自番へスキップ不能を防ぐ）
        const available = eligibleByCap.length > 0 ? eligibleByCap : pool

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
          // 指名権番号は前年順位の逆順（最下位＝全体1位）で振る。
          const currentYear = state.currentSeason.year
          const pickNumMap = standingsPickNumbers(state.teams)
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
          set({
            isInitialized: true,
            players: updatedPlayers,
            teams: teamsWithPicks,
            currentSeason: {
              ...state.currentSeason, phase: 'preseason',
              races: (state.currentSeason.races ?? []).length > 0 ? state.currentSeason.races : SEASON_2027_RACES,
              individualEvents: (state.currentSeason.individualEvents ?? []).length > 0 ? state.currentSeason.individualEvents : generateIndividualEvents(state.currentSeason.year),
              newsFeed: (state.currentSeason.newsFeed ?? []).length > 0 ? state.currentSeason.newsFeed : buildInitialNews(),
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
        // 期日を過ぎたECL戦を先に自動消化する（自チーム出場でも未実施のままリーグ戦へ進んだらAI配置で開催）
        {
          let guard = 0
          while (guard++ < 6) {
            const cs = get().currentSeason
            const es = cs.eclSeries
            const nextLeague = cs.races[cs.currentRaceIndex]
            if (!es || es.raceIndex >= es.races.length || !nextLeague) break
            if (es.races[es.raceIndex].date > nextLeague.date) break
            get().advanceEclRace()
          }
        }
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

        // Tactics room: データ分析でレース中のペース配分とメンタルのみ強化（全能力+ではなく2能力に限定）。
        // 以前は全7能力に+Lvしていて実質OVR+5相当と壊れ性能だったため、効果範囲を絞ってバランス調整。
        const tacticsLvByTeam = new Map(teams.map(t => [t.id, t.facilities?.tacticsRoom ?? 0]))
        const playersForSim = players.map(p => {
          const boost = tacticsLvByTeam.get(p.teamId) ?? 0
          if (boost <= 0) return p
          return { ...p, ratings: {
            ...p.ratings,
            pacing: Math.min(99, p.ratings.pacing + boost),
            mental: Math.min(99, p.ratings.mental + boost),
          }}
        })

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
          // 医療センターは各チームの施設Lvで疲労軽減（CPUも自チームの施設が効く）
          const medLvByTeam = new Map(state.teams.map(t => [t.id, t.facilities?.medicalCenter ?? 0]))
          const baseFatigueGain = Math.min(14, 4 + race.segments.length * 1.5) * stratMult
          const updatedPlayers = state.players.map(p => {
            if (racingIds.has(p.id)) {
              const medMult = 1 - (medLvByTeam.get(p.teamId) ?? 0) * 0.08
              // recovery stat reduces fatigue gain: recovery=50→normal, recovery=90→-12%
              const recoveryMult = 1.0 - (p.ratings.recovery - 50) * 0.003
              const fatigueGain = Math.round(baseFatigueGain * medMult * Math.max(0.7, recoveryMult))
              // 自然回復: 出場選手は毎レース疲労が6減る
              return { ...p, fatigue: Math.max(0, Math.min(100, p.fatigue + fatigueGain) - 6) }
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

          // Race prize money for player team（順位別の新テーブル。economy.tsに集約）
          const racePrize = racePrizeByRank(playerRank)

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

          // Team talk morale modifier
          const teamTalk = state.raceTeamTalk ?? 'best'
          const teamRank = results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? 0
          const baseMoraleDelta = teamRank === 1 ? 8 : teamRank <= 3 ? 3 : teamRank >= state.teams.length - 2 ? -5 : 0
          const talkBonus = teamTalk === 'enjoy' ? 5 : teamTalk === 'win' && teamRank <= 5 ? 10 : 0
          const moraleDelta = baseMoraleDelta + talkBonus
          const raceExpGainsMap: Record<string, Partial<Record<CardStatKey, number>>> = {}
          // 強化合宿: 自チームのレース獲得EXP ×(1 + Lv×6%)
          const campLv = state.teams.find(t => t.id === playerTeamId)?.facilities?.trainingCamp ?? 0
          const campExpMult = 1 + campLv * 0.06
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
            // 役割ミスマッチ：エース/主力を任命したのにベンチだとモラル低下（口約束の代償）
            const roleBenchPenalty = (!isRacer && (p.teamRole === 'ace' || p.teamRole === 'key_player'))
              ? (p.teamRole === 'ace' ? 4 : 2) : 0
            const newMorale = Math.max(10, Math.min(100, (p.morale ?? 70) + moraleDelta + (segWin ? 5 : 0) - roleBenchPenalty))

            // EXPベース成長: 走った区間の地形タイプで能力別EXPを付与
            let newRatings = { ...p.ratings }
            let newExp = { ...(p.exp ?? {}) } as Partial<Record<CardStatKey, number>>
            const statCaps = getStatPotentials(p)  // 能力別ポテンシャル上限
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
                  const result = processExpGains(newRatings, newExp, baseGains, potMult * campExpMult, ageMult, statCaps)
                  newRatings = result.ratings
                  newExp = result.exp
                  const gained: Partial<Record<CardStatKey, number>> = {}
                  ;(Object.keys(baseGains) as CardStatKey[]).forEach(k => {
                    // レース前に既に上限だった能力はEXPが入らない（表示も0）。今回上限に達した分は表示する。
                    const capped = ((p.ratings as Record<string, number>)[k] ?? 0) >= Math.min(99, (statCaps as Record<string, number>)[k] ?? 99)
                    const v = capped ? 0 : Math.round((baseGains[k] ?? 0) * potMult * campExpMult * ageMult)
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
                const result = processExpGains(newRatings, newExp, benchGains, potMult * campExpMult, ageMult, statCaps)
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
                  const result = processExpGains(newRatings, newExp, bonusGain, potMultiplier(p.potential) * campExpMult, 1.0, statCaps)
                  newRatings = result.ratings
                  newExp = result.exp
                }
              }
            }
            return { ...p, form: newForm, morale: newMorale, ratings: newRatings, exp: newExp, fatigue: Math.max(0, Math.min(100, (p.fatigue ?? 0) + planFatigueDelta)), ...careerUpdate }
          })

          // Injury system: racers with high fatigue may get injured (CPUチームの選手も対象)
          const INJURY_NAMES = ['ハムストリング肉離れ', 'ふくらはぎの肉離れ', '疲労骨折', 'アキレス腱炎', '足底筋膜炎', '膝の炎症', '腸脛靭帯炎', '股関節の炎症']
          const injuryNewsItems: typeof state.currentSeason.newsFeed = []
          const playersWithInjuries = finalPlayers.map(p => {
            if (!racingIds.has(p.id) || p.status !== 'active') return p
            const injuryChance = Math.max(0, (p.fatigue - 65) / 35 * 0.10)
            if (Math.random() < injuryChance) {
              const recoveryRaces = 2 + Math.floor(Math.random() * 2)
              const injuryName = INJURY_NAMES[Math.floor(Math.random() * INJURY_NAMES.length)]
              // ニュースとnoInjury目標のカウントは自チームのみ。CPUの故障はサイレントに発生
              if (p.teamId === playerTeamId) {
                injuryNewsItems.push({
                  date: race.date,
                  headline: `${p.name}が${injuryName}で負傷 — 全治約${recoveryRaces}か月`,
                  category: 'injury' as const,
                  relatedIds: [p.id],
                })
              }
              return { ...p, status: 'injured' as const, injuredUntilRace: raceIndex + 1 + recoveryRaces, injuryName }
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
              return { ...p, status: 'active' as const, injuredUntilRace: undefined, injuryName: undefined, form: Math.max(-2, (p.form ?? 0) - 1) }
            }
            return p
          })


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
            teams: state.teams,
          })
          const existingTrades = (state.currentSeason.pendingTradeOffers ?? []).filter(o => o.expiresAtRace > raceIndex + 1)

          // CPUからのトレード打診を低頻度で生成（打診が既に無い時だけ・1件まで）。
          // 相手の余剰選手と自チーム選手の価値が釣り合う1対1交換を提案する
          const newTradeOffers: AITradeOffer[] = []
          if (existingTrades.length === 0 && Math.random() < 0.25) {
            // トレード提案の質を上げる：
            // - 相手チームは「自チームの手薄なポジションを埋められるチーム」を優先
            // - 欲しがるのは相手（CPU）の補強ニーズに合う自チーム選手、差し出すのは自チームの穴に合う選手
            // - 価値が釣り合う候補の中から「もらえる選手のOVRが最も高い」1件を提案（低OVR同士の消化試合をなくす）
            const myTradables = state.players.filter(p =>
              p.teamId === playerTeamId && p.rosterTier === 'main' && p.status === 'active' && !p.loan && !p.noSale && ovr(p) >= 62)
            const myNeeds = cpuSpecialtyNeeds(playerTeamId, state.players)
            const cpuIds = state.teams.map(t => t.id).filter(id => id !== playerTeamId)
            // 自チームの穴を埋められる選手(OVR68+)を持つチームを優先。いなければランダム
            const teamsWithFit = cpuIds.filter(id => state.players.some(p =>
              p.teamId === id && p.rosterTier === 'main' && p.status === 'active' && !p.loan && myNeeds.includes(p.specialty) && ovr(p) >= 68))
            const fromId = teamsWithFit.length > 0
              ? teamsWithFit[Math.floor(Math.random() * teamsWithFit.length)]
              : cpuIds[Math.floor(Math.random() * cpuIds.length)]
            const theirNeeds = cpuSpecialtyNeeds(fromId, state.players)
            // 「自チームで出番がある選手」しか提示させない：自チーム10番手のOVRを下回る選手の打診は出さない
            const myMainOvrs = state.players
              .filter(p => p.teamId === playerTeamId && p.rosterTier === 'main' && p.status === 'active')
              .map(p => ovr(p)).sort((a, b) => b - a)
            const lineupBar = myMainOvrs[Math.min(9, Math.max(0, myMainOvrs.length - 1))] ?? 0
            const theirRoster = state.players.filter(p =>
              p.teamId === fromId && p.rosterTier === 'main' && p.status === 'active' && !p.loan && ovr(p) >= Math.max(65, lineupBar) && p.age <= 33)
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
            let best: { mine: Player; theirs: Player; fits: boolean } | null = null
            for (const mine of askPool) {
              const myVal = calcTransferValue(mine)
              for (const theirs of offerPool) {
                const r = calcTransferValue(theirs) / Math.max(1, myVal)
                if (r < 0.95 || r > 1.3) continue
                if (ovr(theirs) < ovr(mine) - 3) continue
                const fits = myNeeds.includes(theirs.specialty)
                const better = !best
                  || (fits && !best.fits)
                  || (fits === best.fits && ovr(theirs) > ovr(best.theirs))
                if (better) best = { mine, theirs, fits }
              }
            }
            if (best) {
              const fromShort = state.teams.find(t => t.id === fromId)?.shortName ?? ''
              newTradeOffers.push({
                id: `aito-${raceIndex + 1}-${best.mine.id}`,
                fromTeamId: fromId,
                offeredPlayerIds: [best.theirs.id],
                requestedPlayerIds: [best.mine.id],
                expiresAtRace: raceIndex + 5,
                message: `${fromShort}が${best.mine.name}（OVR${ovr(best.mine)}）との交換に${best.theirs.name}（OVR${ovr(best.theirs)}）を提示しています`,
              })
            }
          }

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
          type CpuTx = { playerId: string; fromTeamId: string; toTeamId: string; playerName: string; playerOvr: number; fromShort: string; toShort: string; fee: number }
          const cpuTxList: CpuTx[] = []
          const cpuTxListingIds = new Set<string>()
          if (isWindowOpenNow) {
            const movedThisRace = new Set<string>()
            // 買い手の総在籍数（引退除く）。30人以上のチームは補強不可＝ロスター肥大を止める
            const rosterCount = new Map<string, number>()
            for (const pl of finalPlayers) {
              if (pl.status === 'active' && pl.teamId) rosterCount.set(pl.teamId, (rosterCount.get(pl.teamId) ?? 0) + 1)
            }
            for (const listing of (state.currentSeason.transferListings ?? [])) {
              // 自チームの出品は原則対象外だが、「移籍を認めた」選手（lst-allow-）はCPUが直接買い取れる
              const isMyAllowListing = listing.fromTeamId === playerTeamId && listing.id.startsWith('lst-allow-')
              if ((listing.fromTeamId === playerTeamId && !isMyAllowListing) || listing.competingTeams.length === 0) continue
              if (Math.random() >= 0.5) continue
              const buyerTeamId = listing.competingTeams[Math.floor(Math.random() * listing.competingTeams.length)]
              const p = finalPlayers.find(pl => pl.id === listing.playerId)
              const seller = state.teams.find(t => t.id === listing.fromTeamId)
              const buyer = state.teams.find(t => t.id === buyerTeamId)
              if (!p || !seller || !buyer) continue
              // 出品後に選手が移籍していた古い出品は成立させない（現所属と出品元が一致するときのみ）。
              // 同一レース内で同じ選手が二重に動くのも防ぐ。レンタル中・買い手が現所属と同じ場合も対象外。
              // 今季すでに移籍済み（joinedYear=今年）の選手も対象外＝1シーズンに何度も移籍しない
              if (p.teamId !== listing.fromTeamId || p.loan || movedThisRace.has(p.id) || buyerTeamId === p.teamId || p.joinedYear === state.currentSeason.year) {
                cpuTxListingIds.add(listing.id)  // 無効な出品は掃除する
                continue
              }
              // 買い手が満杯（30人以上）または予算不足なら今回は見送り（出品は残す）
              if ((rosterCount.get(buyerTeamId) ?? 0) >= 30 || buyer.finance.budget < listing.askingPrice) continue
              movedThisRace.add(p.id)
              rosterCount.set(buyerTeamId, (rosterCount.get(buyerTeamId) ?? 0) + 1)
              rosterCount.set(listing.fromTeamId, Math.max(0, (rosterCount.get(listing.fromTeamId) ?? 1) - 1))
              cpuTxList.push({ playerId: p.id, fromTeamId: listing.fromTeamId, toTeamId: buyerTeamId, playerName: p.name, playerOvr: ovr(p), fromShort: seller.shortName, toShort: buyer.shortName, fee: listing.askingPrice })
              cpuTxListingIds.add(listing.id)
            }
          }
          const cpuTxNewsItems: typeof state.currentSeason.newsFeed = cpuTxList.map(tx => ({
            date: race.date,
            headline: `${tx.toShort}が${tx.fromShort}から${tx.playerName}（OVR${tx.playerOvr}）を獲得`,
            category: 'trade' as const,
            relatedIds: [tx.playerId],
            major: tx.fee >= 100_000_000,
            fromTeamId: tx.fromTeamId,
            toTeamId: tx.toTeamId,
          }))
          const existingListingsFiltered = (state.currentSeason.transferListings ?? []).filter(l => !cpuTxListingIds.has(l.id))

          // incomingOffer期限切れ（5試合）→ 失効通知＋1年交渉ロック
          // ※フリー移籍の接触（offeredPrice=0）は対象外：下の「本人決断」で処理する
          const offerExpiredNegs: { id: string; playerId: string; playerName: string }[] = []
          const offerExpiredPlayerIds: string[] = [];
          (state.currentSeason.incomingOffers ?? []).forEach(o => {
            if (o.offeredPrice === 0) return
            if (o.expiresAtRace <= nextRaceIndex) {
              const pl = finalPlayers.find(p => p.id === o.playerId)
              if (pl) {
                offerExpiredNegs.push({ id: o.id, playerId: o.playerId, playerName: pl.name })
                offerExpiredPlayerIds.push(o.playerId)
              }
            }
          })

          // フリー移籍の接触：期限が来たら選手本人が決断する（GMは関与できない）。
          // 移籍するかは本人の納得度（やる気・移籍先の順位・出場状況）で決まる
          const freeDecisionNotices: { id: string; playerId: string; playerName: string; toTeamName: string; left: boolean }[] = []
          const freeMoves: { playerId: string; toTeamId: string }[] = []
          const standingsForFree = [...updatedStandings].sort((a, b) => b.totalPoints - a.totalPoints)
          ;(state.currentSeason.incomingOffers ?? []).forEach(o => {
            if (o.offeredPrice !== 0 || o.expiresAtRace > nextRaceIndex) return
            const pl = finalPlayers.find(p => p.id === o.playerId)
            const suitor = state.teams.find(t => t.id === o.fromTeamId)
            if (!pl || pl.teamId !== playerTeamId || pl.status !== 'active' || !suitor) return
            const suitorRank = standingsForFree.findIndex(s => s.teamId === suitor.id) + 1
            // 決断までに契約を更新できていれば残留確定（引き留め成功）。
            // 判定は出場実績込みの freeContactConsent（よく走っている選手・愛着のある選手は残留に傾く）
            const flApps = seasonAppearances(pl.id, updatedRaces)
            const flFrac = flApps / Math.max(1, nextRaceIndex)
            // 受け手が総在籍上限（30人）なら移籍は成立しない＝残留（31人化の防止）。
            // 引退希望中の選手は移籍しない（引退か引き留めかの話であって、他クラブへは行かない）
            const suitorSize = finalPlayers.filter(p => p.teamId === suitor.id && p.status === 'active').length
            const isRetiringFl = (state.currentSeason.retirementRequests ?? []).some(r => r.playerId === pl.id)
            const leaves = suitorSize >= 30 || isRetiringFl ? false
              : pl.contract.yearsLeft > 1 ? false
              : freeContactConsent(pl, suitorRank, state.teams.length, flFrac, nextRaceIndex)
            freeDecisionNotices.push({ id: o.id, playerId: pl.id, playerName: pl.name, toTeamName: suitor.shortName, left: leaves })
            if (leaves) freeMoves.push({ playerId: pl.id, toTeamId: suitor.id })
          })
          const freeMoveNews = freeDecisionNotices.filter(n => n.left).map(n => ({
            date: race.date,
            headline: `${n.playerName}が契約満了に伴い${n.toTeamName}へフリー移籍を決断`,
            category: 'trade' as const,
            relatedIds: [n.playerId],
          }))
          const retiringWishIds = new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId))
          const transferData = generateTransferActivity(finalPlayers, teamsWithPrize, playerTeamId, nextRaceIndex, existingListingsFiltered, state.currentSeason.incomingOffers ?? [], isWindowOpenNow, state.currentSeason.transferRequests ?? [], retiringWishIds)

          // 海外クラブからの移籍オファー ＋ 相手からのレンタル打診（チャットで対応）
          const foreignClubs = (state.foreignLeagues ?? []).flatMap(l => l.clubs).map(c => ({ id: c.id, name: c.name, shortName: c.shortName, playerIds: c.playerIds }))
          const keptLoanOffers = (state.currentSeason.incomingLoanOffers ?? []).filter(o => o.expiresAtRace > nextRaceIndex && finalPlayers.some(p => p.id === o.playerId))
          const flOffers = generateForeignAndLoanOffers({ players: finalPlayers, teams: teamsWithPrize, foreignClubs, playerTeamId, raceIndex: nextRaceIndex, windowOpen: isWindowOpenNow, existingIncoming: transferData.incomingOffers, existingLoans: keptLoanOffers, races: updatedRaces, retiringIds: retiringWishIds })
          const mergedIncomingOffers = [...transferData.incomingOffers, ...flOffers.foreignIncoming]
          const mergedLoanOffers = [...keptLoanOffers, ...flOffers.loanOffers]

          // Process pending transfer bids
          const bidExpiredNegs: { id: string; playerId: string; playerName: string }[] = []
          const bidExpiredPlayerIds: string[] = []
          const processedBids = (state.currentSeason.transferBids ?? []).map(bid => {
            // 費用合意・カウンター中でも、対象選手が他所へ移籍していたら破談にする（永久に残るのを防ぐ）
            if (bid.status === 'fee_accepted' || bid.status === 'countered') {
              const pl = finalPlayers.find(p => p.id === bid.playerId)
              if (!pl || pl.teamId !== bid.targetTeamId) return { ...bid, status: 'failed' as const }
              // 費用合意から5試合放置で自動失効
              if (bid.status === 'fee_accepted' && bid.feeAcceptedAtRace != null && nextRaceIndex - bid.feeAcceptedAtRace >= 5) {
                const pl2 = finalPlayers.find(p => p.id === bid.playerId)
                bidExpiredNegs.push({ id: bid.id, playerId: bid.playerId, playerName: pl2?.name ?? '' })
                bidExpiredPlayerIds.push(bid.playerId)
                return { ...bid, status: 'failed' as const }
              }
              return bid
            }
            if (bid.status !== 'pending') return bid
            const player = finalPlayers.find(p => p.id === bid.playerId)
            if (!player || player.teamId !== bid.targetTeamId) return { ...bid, status: 'failed' as const }
            // データ上の主力は移籍金をいくら積んでも売らない。費用に合意してから拒否するのではなく、提示の時点で拒否する。
            {
              const apps = seasonAppearances(player.id, updatedRaces)
              const frac = nextRaceIndex > 0 ? apps / nextRaceIndex : (player.rosterTier === 'main' ? 0.5 : 0)
              if (isEssentiallyUnpoachable(player, frac, nextRaceIndex)) {
                // 「移籍拒否」通知を出し、来季まで再入札できないようロックする
                bidExpiredNegs.push({ id: bid.id, playerId: player.id, playerName: player.name })
                bidExpiredPlayerIds.push(player.id)
                return { ...bid, status: 'rejected' as const }
              }
            }
            const val = calcTransferValue(player)
            const isListed = transferData.listings.some(l => l.playerId === bid.playerId)
            const isExpiring = player.contract.yearsLeft <= 1
            // 受諾ラインのベースは UI（成立確率表示）と共有。実際の判定はこれに±10%の揺れを乗せる。
            const threshold = transferBidBase(val, isListed, isExpiring) * (0.9 + Math.random() * 0.2)
            if (bid.offeredFee >= threshold) return { ...bid, status: 'fee_accepted' as const, feeAcceptedAtRace: nextRaceIndex }
            if (bid.offeredFee >= threshold * 0.68 && bid.round < 3) {
              return { ...bid, status: 'countered' as const, counterFee: Math.round(threshold / 1000000) * 1000000 }
            }
            return { ...bid, status: 'rejected' as const }
          })

          const finalPlayerRank = results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? state.teams.length
          const droppedCards = generateDropCards(finalPlayerRank, state.teams.length, mySegWinCount)

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
          // 区間新記録が出たらニュースにする（過去記録がある区間で更新された場合のみ）
          const segRecordNewsItems: typeof newsItems = []
          // 結果画面の「区間新！」バッジ用（このレースで従来記録を破った区間×選手）
          const newSegRecordMarks: { segmentIndex: number; playerId: string }[] = []
          for (const sr of results.segmentResults) {
            const key = `${race.name}-${sr.segmentIndex}`
            const existing = updatedSegmentRecords[key] ?? []
            const prevBest = existing[0]?.timeSec ?? null
            const newEntries = sr.runners.map(r => {
              const pl = state.players.find(x => x.id === r.playerId)
              const tm = state.teams.find(x => x.id === r.teamId)
              return { playerName: pl?.name ?? '不明', teamShort: tm?.shortName ?? '?', playerId: r.playerId, teamId: r.teamId, timeSec: r.timeSec, year: state.currentSeason.year }
            })
            const fastestNew = newEntries.length > 0
              ? newEntries.reduce((min, e) => e.timeSec < min.timeSec ? e : min, newEntries[0])
              : null
            if (prevBest != null && fastestNew && fastestNew.timeSec < prevBest) {
              const fastestRunner = sr.runners.find(r => r.timeSec === fastestNew.timeSec)
              const isMine = fastestRunner?.teamId === playerTeamId
              if (fastestRunner) newSegRecordMarks.push({ segmentIndex: sr.segmentIndex, playerId: fastestRunner.playerId })
              segRecordNewsItems.push({
                date: race.date,
                headline: `【区間新記録】${race.name} 第${sr.segmentIndex}区 ${fastestNew.playerName}（${fastestNew.teamShort}）${fmtTime(fastestNew.timeSec)}（従来 ${fmtTime(prevBest)}）${isMine ? ' ★自チーム' : ''}`,
                category: 'race' as const,
                relatedIds: fastestRunner ? [fastestRunner.playerId] : [],
              })
            }
            // 同一選手は最速の1本だけ残す（同じ選手が何行も並ばないように）。旧データはplayerIdが無いことがあるので名前で代用
            const bestByPlayer = new Map<string, (typeof existing)[0]>()
            for (const e of [...existing, ...newEntries]) {
              const pkey = e.playerId ?? e.playerName
              const cur = bestByPlayer.get(pkey)
              if (!cur || e.timeSec < cur.timeSec) bestByPlayer.set(pkey, e)
            }
            updatedSegmentRecords[key] = [...bestByPlayer.values()]
              .sort((a, b) => a.timeSec - b.timeSec)
              .slice(0, 10)
          }

          const raceJewels =
            (playerRank === 1 ? 20 : playerRank === 2 ? 10 : playerRank === 3 ? 5 : 0)
            + mySegWinCount * 5
            + raceAchievements.reduce((s, a) => s + (ACHIEVEMENT_JEWELS[a.rarity] ?? 0), 0)

          // CPUトレード反映 ＋ 移籍リスト入りフラグの同期（他チーム選手にも「移籍希望」が立つ）
          const listedIdSet = new Set(transferData.listings.map(l => l.playerId))
          const playersWithCpuTx = recoveredPlayers.map(p => {
            const tx = cpuTxList.find(t => t.playerId === p.id)
            // 自チームから出て行った選手とは1年間交渉不可。joinedYearを刻んで同一シーズン内の再移籍を防ぐ
            if (tx) return { ...p, teamId: tx.toTeamId, rosterTier: 'main' as const, transferListed: false, joinedYear: state.currentSeason.year, ...(p.teamId === playerTeamId ? { transferLockedUntilYear: state.currentSeason.year + 1 } : {}) }
            const listed = listedIdSet.has(p.id)
            const nextListed = listed ? true : (p.teamId === playerTeamId ? (p.transferListed ?? false) : false)
            return nextListed === (p.transferListed ?? false) ? p : { ...p, transferListed: nextListed }
          })
          const teamsWithCpuTx = cpuTxList.length === 0 ? teamsWithPrize : teamsWithPrize.map(t => {
            const soldTx = cpuTxList.filter(tx => tx.fromTeamId === t.id)
            const boughtTx = cpuTxList.filter(tx => tx.toTeamId === t.id)
            if (soldTx.length === 0 && boughtTx.length === 0) return t
            const sold = soldTx.map(tx => tx.playerId)
            const bought = boughtTx.map(tx => tx.playerId)
            // 移籍金の授受（売り手に入金・買い手から出金）。自チームが売り手の場合もここで入金される
            const feeDelta = soldTx.reduce((s, tx) => s + tx.fee, 0) - boughtTx.reduce((s, tx) => s + tx.fee, 0)
            // 売り手は1軍・2軍両方の名簿から除去（2軍選手の売却でゴーストが残らないように）。
            // 買い手は既に名簿に居るIDを除いてから追加（再購入での重複防止）
            return { ...t,
              finance: { ...t.finance, budget: t.finance.budget + feeDelta },
              roster: {
                main: [...t.roster.main.filter(id => !sold.includes(id) && !bought.includes(id)), ...bought],
                second: t.roster.second.filter(id => !sold.includes(id) && !bought.includes(id)),
              } }
          })
          // 自チームから買い取られた選手：今期の移籍金収入に計上＋退団通知（黙ってロスターから消えないように）
          const myCpuSales = cpuTxList.filter(tx => tx.fromTeamId === playerTeamId)
          const myCpuSaleIncome = myCpuSales.reduce((s, tx) => s + tx.fee, 0)
          const myCpuSaleNotices = myCpuSales.map(tx => ({
            id: `dep-${tx.playerId}-r${raceIndex}`,
            playerId: tx.playerId,
            playerName: tx.playerName,
            toTeamName: tx.toShort,
            reason: 'transfer' as const,
            fee: tx.fee,
          }))

          // レンタル要請（移籍市場から出したもの）の応答。相手が承諾なら借用成立、拒否ならニュース。
          const pendingLoanReqs = state.currentSeason.loanRequests ?? []
          let playersAfterLoan = playersWithCpuTx
          let teamsAfterLoan = teamsWithCpuTx
          const loanRespNews: { date: string; headline: string; category: 'trade'; relatedIds: string[] }[] = []
          const newLoanResponses: LoanResponse[] = []
          if (pendingLoanReqs.length > 0) {
            const trIdx = raceIndex + 1
            let freeSlots = Math.max(0, 3 - playersWithCpuTx.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId).length)
            const accepted: { playerId: string; ownerId: string; years: number }[] = []
            for (const req of pendingLoanReqs) {
              const pl = playersWithCpuTx.find(p => p.id === req.playerId)
              if (!pl || pl.teamId !== req.targetTeamId || pl.loan) { continue }
              const apps = seasonAppearances(pl.id, updatedRaces)
              const frac = trIdx > 0 ? apps / trIdx : (pl.rosterTier === 'main' ? 0.5 : 0)
              const loanable = !isDataKeyPlayer(pl, frac, trIdx)
              const ownerShort = teamsWithCpuTx.find(t => t.id === pl.teamId)?.shortName
                ?? (state.foreignLeagues ?? []).flatMap(l => l.clubs).find(c => c.id === pl.teamId)?.shortName
                ?? '相手クラブ'
              if (loanable && freeSlots > 0) {
                accepted.push({ playerId: pl.id, ownerId: pl.teamId, years: req.years }); freeSlots--
                loanRespNews.push({ date: race.date, headline: `${ownerShort}が${pl.name}のレンタル要請を承諾。${req.years}年で借用`, category: 'trade', relatedIds: [pl.id] })
                newLoanResponses.push({ id: `lresp_${pl.id}_${raceIndex}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: true, years: req.years })
              } else {
                loanRespNews.push({ date: race.date, headline: `${ownerShort}が${pl.name}のレンタル要請を断った`, category: 'trade', relatedIds: [pl.id] })
                newLoanResponses.push({ id: `lresp_${pl.id}_${raceIndex}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: false, years: req.years })
              }
            }
            if (accepted.length > 0) {
              const myTeamNow = teamsWithCpuTx.find(t => t.id === playerTeamId)
              const acceptedMap = new Map(accepted.map(a => [a.playerId, a]))
              playersAfterLoan = playersWithCpuTx.map(p => {
                const a = acceptedMap.get(p.id)
                if (!a) return p
                return { ...p, teamId: playerTeamId,  loan: { ownerTeamId: a.ownerId, untilYear: state.currentSeason.year + a.years }, acquiredRaceIndex: raceIndex + 1, joinedYear: state.currentSeason.year }
              })
              teamsAfterLoan = teamsWithCpuTx.map(t => {
                const lost = accepted.filter(a => a.ownerId === t.id).map(a => a.playerId)
                if (lost.length === 0) return t
                return { ...t, roster: { main: t.roster.main.filter(id => !lost.includes(id)), second: t.roster.second.filter(id => !lost.includes(id)) } }
              })
            }
          }

          const prevDoneIds = new Set((state.currentSeason.objectives ?? []).filter(o => o.done).map(o => o.id))
          const midRaceObjJewels = updatedObjectives
            .filter(o => o.done && !prevDoneIds.has(o.id))
            .reduce((s, o) => s + (o.rewardJewels ?? 30), 0)

          // ── 移籍希望：契約残り2年切った(≤1)選手から毎レース最大1人。理由は出場機会/強豪志向/待遇不満。 ──
          const existTrReq = new Set((state.currentSeason.transferRequests ?? []).map(r => r.playerId))
          const trTotalTeams = state.teams.length
          const myStandRank = (() => {
            const sorted = [...updatedStandings].sort((a, b) => b.totalPoints - a.totalPoints)
            const i = sorted.findIndex(s => s.teamId === playerTeamId)
            return i >= 0 ? i + 1 : Math.ceil(trTotalTeams / 2)
          })()
          const trCandidates = playersAfterLoan
            // レンタルで借りている選手は移籍希望の対象外（保有権が無く「移籍を認める」と他人の選手を消してしまう）。
            // 既に対応済み（移籍を認めた transferListed / 残ってほしいで説得済み）の選手は同シーズン中に再抽選しない
            .filter(p => p.teamId === playerTeamId && p.status === 'active' && p.contract.yearsLeft <= 1 && !existTrReq.has(p.id) && !p.loan
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
                const market = faMarketSalary(p)
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
          }

          // 期限切れ交渉のプレイヤーを1年間ロック
          const allExpiredPlayerIds = [...new Set([...bidExpiredPlayerIds, ...offerExpiredPlayerIds])]
          const allExpiredNegs = [...bidExpiredNegs, ...offerExpiredNegs]
          const playersWithExpiredLocks = allExpiredPlayerIds.length > 0
            ? playersAfterLoan.map(p => allExpiredPlayerIds.includes(p.id) ? { ...p, transferLockedUntilYear: state.currentSeason.year + 1 } : p)
            : playersAfterLoan

          // フリー移籍の決断で退団する選手を移す（本人が決めたので即時移籍）。
          // 出て行った選手とは1年間交渉不可（すぐ買い戻すのは不自然なので）
          const playersAfterFreeMoves = freeMoves.length > 0
            ? playersWithExpiredLocks.map(p => {
                const mv = freeMoves.find(m => m.playerId === p.id)
                return mv ? { ...p, teamId: mv.toTeamId, rosterTier: 'main' as const, transferListed: undefined, transferLockedUntilYear: state.currentSeason.year + 1 } : p
              })
            : playersWithExpiredLocks
          const teamsAfterFreeMoves = freeMoves.length > 0
            ? teamsAfterLoan.map(t => {
                if (t.id === playerTeamId) return { ...t, roster: { main: t.roster.main.filter(id => !freeMoves.some(m => m.playerId === id)), second: t.roster.second.filter(id => !freeMoves.some(m => m.playerId === id)) } }
                const gains = freeMoves.filter(m => m.toTeamId === t.id)
                return gains.length > 0 ? { ...t, roster: { ...t.roster, main: [...t.roster.main, ...gains.map(g => g.playerId)] } } : t
              })
            : teamsAfterLoan

          // シーズン最終戦なら、表彰（MVP/新人王）と引退表明を「そのシーズンのニュース」として流す
          // （実際の引退・表彰の確定処理は次シーズン開幕時のまま。発表だけ前倒しして年内に見えるようにする）
          const isFinalRace = raceIndex + 1 >= state.currentSeason.races.length
          const seasonEndNews: typeof newsItems = []
          if (isFinalRace) {
            const award = computeSeasonAwards(updatedRaces, finalPlayers, state.currentSeason.year)
            const mvpP = award.mvpId ? finalPlayers.find(p => p.id === award.mvpId) : undefined
            const rookieP = award.rookieId ? finalPlayers.find(p => p.id === award.rookieId) : undefined
            if (mvpP) seasonEndNews.push({ date: race.date, headline: `【シーズンMVP】${state.teams.find(t => t.id === mvpP.teamId)?.shortName ?? ''}の${mvpP.name}が受賞`, category: 'race' as const, relatedIds: [mvpP.id] })
            if (rookieP) seasonEndNews.push({ date: race.date, headline: `【新人王】${state.teams.find(t => t.id === rookieP.teamId)?.shortName ?? ''}の${rookieP.name}が受賞`, category: 'race' as const, relatedIds: [rookieP.id] })
            // 引退表明（次シーズン開幕時の引退判定と同じ決定式を1歳先で評価）。自チームは全員、他チームは実力者を上位6人まで
            const idHashN = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h }
            const retAgeN = (p: Player) => { const o = ovr(p); const bonus = o >= 80 ? 2 : o >= 72 ? 1 : 0; return Math.min(40, 32 + (idHashN(p.id) % 7) + bonus) }
            const domesticIdsRet = new Set(state.teams.map(t => t.id))
            const retiring = finalPlayers.filter(p => p.status === 'active' && domesticIdsRet.has(p.teamId) && (p.age + 1) >= retAgeN(p))
            const mineRet = retiring.filter(p => p.teamId === playerTeamId)
            const othersRet = retiring.filter(p => p.teamId !== playerTeamId && ovr(p) >= 72).sort((a, b) => ovr(b) - ovr(a)).slice(0, 6)
            for (const p of [...mineRet, ...othersRet]) {
              const tn = state.teams.find(t => t.id === p.teamId)?.shortName ?? ''
              seasonEndNews.push({ date: race.date, headline: `【引退表明】${tn}の${p.name}（${p.age}歳）が今季限りでの現役引退を表明`, category: 'race' as const, relatedIds: [p.id] })
            }
          }

          return {
            players: playersAfterFreeMoves,
            teams: teamsAfterFreeMoves,
            // 移籍成立記録（チーム詳細の移籍ページ用）。CPU間売買とフリー移籍の決断をここで記録
            transferHistory: [
              ...(state.transferHistory ?? []),
              ...cpuTxList.map(tx => ({ year: state.currentSeason.year, date: race.date, playerId: tx.playerId, fromTeamId: tx.fromTeamId, toTeamId: tx.toTeamId, fee: tx.fee, years: state.players.find(p => p.id === tx.playerId)?.contract.yearsLeft })),
              ...freeMoves.map(m => ({ year: state.currentSeason.year, date: race.date, playerId: m.playerId, fromTeamId: playerTeamId, toTeamId: m.toTeamId, fee: 0, kind: 'free' as const })),
            ].slice(-400),
            jewels: state.jewels + (playerRank > 0 ? raceJewels : 0) + midRaceObjJewels,
            raceLineup: {},
            lastRaceLineup: { ...state.raceLineup },
            trainingCards: [...(state.trainingCards ?? []), ...droppedCards],
            raceDroppedCards: droppedCards,
            raceExpGains: raceExpGainsMap,
            raceNewSegmentRecords: newSegRecordMarks,
            achievements: [...(state.achievements ?? []), ...raceAchievements],
            gmRep: state.gmRep ?? 50,   // 評判はシーズン終了時の目標達成率でのみ変動
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
              newsFeed: [...seasonEndNews, ...freeMoveNews, ...loanRespNews, ...segRecordNewsItems, ...cpuTxNewsItems, ...injuryNewsItems, prizeNewsItem, ...newsItems, ...state.currentSeason.newsFeed].slice(0, 40),
              events: [...(state.currentSeason.events ?? []), ...newEvents],
              pendingTradeOffers: [...existingTrades, ...newTradeOffers],
              transferListings: transferData.listings,
              incomingOffers: mergedIncomingOffers,
              incomingLoanOffers: mergedLoanOffers,
              loanRequests: [],
              loanResponses: [...(state.currentSeason.loanResponses ?? []), ...newLoanResponses],
              transferBids: processedBids,
              transferRequests: [...(state.currentSeason.transferRequests ?? []).filter(r => finalPlayers.some(p => p.id === r.playerId && p.teamId === playerTeamId && p.status === 'active')), ...newTransferReqs],
              // 契約更新の要求は放置で自動失効させる（応対できないまま通知が永久に残るのを防ぐ）。
              // 旧セーブの期限なし要求(expiresAtRaceなし)もここで失効する
              contractRequests: (state.currentSeason.contractRequests ?? []).map(r =>
                r.status === 'pending_gm' && (r.expiresAtRace ?? 0) <= nextRaceIndex
                  ? { ...r, status: 'rejected' as const }
                  : r),
              seasonRaceIncome: (state.currentSeason.seasonRaceIncome ?? 0) + raceIncomeAccum,
              expiredNegotiations: [...(state.currentSeason.expiredNegotiations ?? []), ...allExpiredNegs],
              freeTransferNotices: [...(state.currentSeason.freeTransferNotices ?? []), ...freeDecisionNotices],
              transferIncome: (state.currentSeason.transferIncome ?? 0) + myCpuSaleIncome,
              departureNotices: [...(state.currentSeason.departureNotices ?? []), ...myCpuSaleNotices],
            },
          }
        })

        // 本編レース完走に同期して海外リーグも1戦進める（別set・裏進行）。
        // 万一エラーが出てもコアのレース進行を壊さないようガードする。
        try { get().advanceForeignLeagues() } catch (e) { console.error('advanceForeignLeagues failed', e) }
        // 移籍ウィンドウ中は日本↔海外の移籍も裏で少数発生させる（別set・裏進行）。
        try { get().runMidSeasonForeignTransfers() } catch (e) { console.error('runMidSeasonForeignTransfers failed', e) }

        return results
      },

      toggleRosterSlot: (playerId, slot) => {
        set(state => {
          const team = state.teams.find(t => t.id === state.playerTeamId)
          if (!team) return state
          const MAX = slot === 'main' ? 23 : 20  // 1軍登録23 / 2軍登録20
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

      submitRoster: (selectedIds) => {
        set(state => {
          const allIds = state.players
            .filter(p => p.teamId === state.playerTeamId && p.status !== 'retired')
            .map(p => p.id)
          const secondIds = allIds.filter(id => !selectedIds.includes(id))
          if (selectedIds.length < 16 || selectedIds.length > 23) return state
          if (secondIds.length > 20) return state
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
          if (team.roster.second.length >= 20) return state


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
            rosterTier: 'main',
            joinedYear: state.currentSeason.year,
            dualRegistered: false,
            contract: {
              yearsLeft: 2,
              annualSalary: 15000000,
              faEligibleYear: state.currentSeason.year + 2,
              contractType: 'development',
            },
            nationality: prospect.nationality,
            origin: prospect.origin,
            
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
          const pool = generateDraftPool(state.currentSeason.year + 1)
          return { currentSeason: { ...state.currentSeason, scoutProspects: pool } }
        })
      },

      releasePlayer: (playerId) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player || player.teamId !== state.playerTeamId) return state
          // 最低ロスター人数を割る放出は不可
          if (!canReleaseFromRoster(state.players, state.playerTeamId)) return state
          // 契約期間が残っているなら解約金（残年俸×(残年-1)）。満了(残1年以下)は無償。
          const buyout = player.contract.annualSalary * Math.max(0, player.contract.yearsLeft - 1)
          return {
            players: state.players.map(p =>
              p.id === playerId ? { ...p, teamId: '', } : p
            ),
            teams: state.teams.map(t => {
              if (t.id !== state.playerTeamId) return t
              return {
                ...t,
                finance: { ...t.finance, budget: Math.max(0, t.finance.budget - buyout) },
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
        const st = get()
        const player = st.players.find(p => p.id === playerId)
        if (!player || player.teamId !== '') return false
        const team = st.teams.find(t => t.id === st.playerTeamId)
        if (!team) return false
        if (reinforcementBanned(team)) return false  // 赤字ペナルティ中・残高マイナスは補強不可
        const finalSalary = salary ?? player.contract.annualSalary
        const finalYears = years ?? Math.max(player.contract.yearsLeft, 2)
        const finalContractType = contractType ?? 'standard'
        // 契約形態でロスター振り分け（standard/dual→main, development→second）
        const effectiveTier: 'main' | 'second' = rosterTier ?? tierForContract(finalContractType)
        // 枠チェック：1軍契約18・2軍契約15・2way5・登録上限(1軍23/2軍20)
        if (!canSignContract(st.players, st.playerTeamId, finalContractType)) return false
        set(state => ({
          players: state.players.map(p =>
            p.id === playerId ? {
              ...p,
              teamId: state.playerTeamId,
              rosterTier: effectiveTier,
              
              status: 'active' as const,
              form: 0,
              joinedYear: state.currentSeason.year,
              contract: { ...p.contract, annualSalary: finalSalary, yearsLeft: finalYears, contractType: finalContractType },
            } : p
          ),
          teams: state.teams.map(t => {
            if (t.id !== state.playerTeamId) return t
            const isDual = finalContractType === 'dual'
            return { ...t, roster: {
              main: (effectiveTier === 'main' || isDual) ? [...t.roster.main.filter(id => id !== playerId), playerId] : t.roster.main,
              second: (effectiveTier === 'second' || isDual) ? [...t.roster.second.filter(id => id !== playerId), playerId] : t.roster.second,
            } }
          }),
        }))
        return true
      },

      setDraftContract: (playerId, salary, years, contractType, teamRole) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player || player.teamId !== state.playerTeamId) return state
          const tier = tierForContract(contractType)
          const isDual = contractType === 'dual'
          return {
            players: state.players.map(p => p.id === playerId ? {
              ...p,
              rosterTier: tier,
              teamRole: teamRole ?? p.teamRole,
              // rookieDeal: ドラフト初回契約は相場の半分まで下げられるが、次の更新では相場基準の要求になる
              contract: { ...p.contract, annualSalary: salary, yearsLeft: years, contractType, rookieDeal: true },
            } : p),
            teams: state.teams.map(t => {
              if (t.id !== state.playerTeamId) return t
              return { ...t, roster: {
                main: (tier === 'main' || isDual) ? [...t.roster.main.filter(id => id !== playerId), playerId] : t.roster.main.filter(id => id !== playerId),
                second: (tier === 'second' || isDual) ? [...t.roster.second.filter(id => id !== playerId), playerId] : t.roster.second.filter(id => id !== playerId),
              } }
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

      openContractInfo: (id) => set({ contractInfoPlayerId: id }),
      closeContractInfo: () => set({ contractInfoPlayerId: null }),

      setFusionPlayer: (id) => set({ fusionPlayerId: id, fusionCardIds: [] }),
      addFusionCard: (id) => set((state) => {
        if (state.fusionCardIds.includes(id) || state.fusionCardIds.length >= MAX_FUSION_CARDS) return {}
        return { fusionCardIds: [...state.fusionCardIds, id] }
      }),
      removeFusionCard: (id) => set((state) => ({ fusionCardIds: state.fusionCardIds.filter(x => x !== id) })),
      clearFusion: () => set({ fusionPlayerId: null, fusionCardIds: [] }),

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
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: Math.max(0, t.finance.budget - 2000000) } } : t)
            } else {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.max(0, p.morale - 15) } : p)
            }
          } else if (event.type === 'player_form_up' && pid) {
            if (choiceIndex === 0) {
              const stat = STATS[Math.floor(Math.random() * STATS.length)]
              players = players.map(p => p.id === pid ? { ...p, ratings: { ...p.ratings, [stat]: Math.min((getStatPotentials(p) as Record<string, number>)[stat] ?? 99, p.ratings[stat] + 1) }, fatigue: Math.min(100, p.fatigue + 8) } : p)
            } else {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 10) } : p)
            }
          } else if (event.type === 'young_breakout' && pid) {
            if (choiceIndex === 0) {
              const stat = STATS[Math.floor(Math.random() * STATS.length)]
              players = players.map(p => p.id === pid ? { ...p, ratings: { ...p.ratings, [stat]: Math.min((getStatPotentials(p) as Record<string, number>)[stat] ?? 99, p.ratings[stat] + 2) }, fatigue: Math.min(100, p.fatigue + 10) } : p)
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
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: Math.max(0, t.finance.budget - 3000000) } } : t)
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
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: Math.max(0, t.finance.budget - 3000000) } } : t)
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
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: Math.max(0, t.finance.budget - 2000000) } } : t)
            }
          } else if (event.type === 'player_retirement' && pid) {
            if (choiceIndex === 0) {
              // Stay bonus — pay 20M, player morale up
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 20) } : p)
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: Math.max(0, t.finance.budget - 20000000) } } : t)
            } else {
              // Accept retirement — mark player as retired（評判は変えない：目標達成に一本化）
              const retPlayer = players.find(p => p.id === pid)
              if (retPlayer) {
                const isLegend = retPlayer.career.segmentWins >= 5 || retPlayer.career.championships >= 1 || retPlayer.yearsPro >= 4
                players = players.map(p => p.id === pid ? { ...p, status: 'retired' as const, teamId: '', retiredYear: state.currentSeason.year } : p)
                players = players.map(p => p.teamId === state.playerTeamId && p.rosterTier === 'main' ? { ...p, morale: Math.min(100, p.morale + 8) } : p)
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
                    // 2軍・2way選手の引退でもゴーストIDが残らないよう両方の名簿から除去
                    return { ...t, roster: { main: t.roster.main.filter(id => id !== pid), second: t.roster.second.filter(id => id !== pid) }, history: { ...t.history, legends: [...(t.history.legends ?? []), legend] } }
                  })
                } else {
                  teams = teams.map(t => t.id === state.playerTeamId ? { ...t, roster: { main: t.roster.main.filter(id => id !== pid), second: t.roster.second.filter(id => id !== pid) } } : t)
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
          // 打診後に対象選手が移籍/引退していた古い打診は成立させず破棄する（ロスター破壊防止）
          const stillValid =
            offer.offeredPlayerIds.every(pid => state.players.some(p => p.id === pid && p.teamId === offer.fromTeamId && p.status === 'active')) &&
            offer.requestedPlayerIds.every(pid => state.players.some(p => p.id === pid && p.teamId === state.playerTeamId && p.status === 'active'))
          if (!stillValid) {
            return { currentSeason: { ...state.currentSeason, pendingTradeOffers: (state.currentSeason.pendingTradeOffers ?? []).filter(o => o.id !== offerId) } }
          }
          let players = state.players
          let teams = state.teams

          // Move offered players to player team
          for (const pid of offer.offeredPlayerIds) {
            const p = players.find(pl => pl.id === pid)
            if (!p) continue
            const fromTeam = teams.find(t => t.id === offer.fromTeamId)
            const toTeam = teams.find(t => t.id === state.playerTeamId)
            if (!fromTeam || !toTeam) continue
            const toMainFull = toTeam.roster.main.length >= 23
            teams = teams.map(t => {
              if (t.id === offer.fromTeamId) return { ...t, roster: { ...t.roster, main: t.roster.main.filter(id => id !== pid) } }
              if (t.id === state.playerTeamId) return toMainFull
                ? { ...t, roster: { ...t.roster, second: [...t.roster.second, pid] } }
                : { ...t, roster: { ...t.roster, main: [...t.roster.main, pid] } }
              return t
            })
            players = players.map(pl => pl.id === pid ? { ...pl, teamId: state.playerTeamId, rosterTier: toMainFull ? 'second' as const : 'main' as const, joinedYear: state.currentSeason.year } : pl)
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
            transferHistory: [
              ...(state.transferHistory ?? []),
              ...offer.offeredPlayerIds.map(pid => ({ year: state.currentSeason.year, date: tradeNews.date, playerId: pid, fromTeamId: offer.fromTeamId, toTeamId: state.playerTeamId, fee: 0, kind: 'trade' as const, years: state.players.find(p => p.id === pid)?.contract.yearsLeft })),
              ...offer.requestedPlayerIds.map(pid => ({ year: state.currentSeason.year, date: tradeNews.date, playerId: pid, fromTeamId: state.playerTeamId, toTeamId: offer.fromTeamId, fee: 0, kind: 'trade' as const, years: state.players.find(p => p.id === pid)?.contract.yearsLeft })),
            ].slice(-400),
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
        if (reinforcementBanned(myTeam)) return false  // 赤字ペナルティ中・残高マイナスは新規補強不可（ドラフト・契約更新は可）
        if (!canSignContract(state.players, state.playerTeamId)) return false  // 総在籍30人の上限（31人化の防止）
        const mktMainFull = myTeam.roster.main.length >= 23
        set(state => ({
          players: state.players.map(p => p.id === listing.playerId ? {
            ...p, teamId: state.playerTeamId, rosterTier: mktMainFull ? 'second' as const : 'main' as const, 
            status: 'active' as const, joinedYear: state.currentSeason.year, contract: { ...p.contract, yearsLeft: Math.max(p.contract.yearsLeft, 2) },
          } : p),
          teams: state.teams.map(t => {
            if (t.id === state.playerTeamId) return mktMainFull
              ? { ...t, finance: { ...t.finance, budget: t.finance.budget - price }, roster: { ...t.roster, second: [...t.roster.second, listing.playerId] } }
              : { ...t, finance: { ...t.finance, budget: t.finance.budget - price }, roster: { ...t.roster, main: [...t.roster.main, listing.playerId] } }
            if (t.id === listing.fromTeamId) return { ...t, roster: { ...t.roster, main: t.roster.main.filter(id => id !== listing.playerId) } }
            return t
          }),
          transferHistory: [...(state.transferHistory ?? []), { year: state.currentSeason.year, date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date, playerId: listing.playerId, fromTeamId: listing.fromTeamId, toTeamId: state.playerTeamId, fee: price, years: Math.max(player.contract.yearsLeft, 2) }].slice(-400),
          currentSeason: {
            ...state.currentSeason,
            transferSpend: (state.currentSeason.transferSpend ?? 0) + price,
            transferListings: (state.currentSeason.transferListings ?? []).filter(l => l.id !== listingId),
            newsFeed: [{ date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}を移籍金${Math.round(price / 10000)}万で獲得`, category: 'trade' as const, relatedIds: [player.id], major: price >= 100_000_000, fromTeamId: listing.fromTeamId, toTeamId: state.playerTeamId }, ...state.currentSeason.newsFeed].slice(0, 30),
          },
        }))
        return true
      },

      acceptIncomingOffer: (offerId) => {
        const state = get()
        const offer = (state.currentSeason.incomingOffers ?? []).find(o => o.id === offerId)
        if (!offer) return false
        const player = state.players.find(p => p.id === offer.playerId)
        if (!player || player.teamId !== state.playerTeamId) return false
        if (player.loan && player.loan.ownerTeamId !== state.playerTeamId) return false  // レンタルで借りている選手は保有権が無く売却不可
        if (!canReleaseFromRoster(state.players, state.playerTeamId)) return false  // ロスター下限(15人)を割る売却は不可
        // 海外クラブへの放出：teams に無いので選手を海外へ移し、資金だけ受け取る
        if (offer.fromForeign) {
          const clubName = (state.foreignLeagues ?? []).flatMap(l => l.clubs).find(c => c.id === offer.fromTeamId)?.shortName ?? '海外クラブ'
          set(st => ({
            // 放出した選手とは1年間交渉不可（transferLockedUntilYear）
            players: st.players.map(p => p.id === offer.playerId ? { ...p, teamId: offer.fromTeamId, rosterTier: 'main' as const, loan: undefined, transferLockedUntilYear: st.currentSeason.year + 1 } : p),
            teams: st.teams.map(t => t.id === st.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + offer.offeredPrice }, roster: { ...t.roster, main: t.roster.main.filter(id => id !== offer.playerId), second: t.roster.second.filter(id => id !== offer.playerId) } } : t),
            foreignLeagues: (st.foreignLeagues ?? []).map(l => ({ ...l, clubs: l.clubs.map(c => c.id === offer.fromTeamId ? { ...c, playerIds: [...c.playerIds, offer.playerId] } : c) })),
            transferHistory: [...(st.transferHistory ?? []), { year: st.currentSeason.year, date: st.currentSeason.races[st.currentSeason.currentRaceIndex]?.date, playerId: offer.playerId, fromTeamId: st.playerTeamId, toTeamId: offer.fromTeamId, fee: offer.offeredPrice }].slice(-400),
            currentSeason: { ...st.currentSeason, transferIncome: (st.currentSeason.transferIncome ?? 0) + offer.offeredPrice, incomingOffers: (st.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId), transferListings: (st.currentSeason.transferListings ?? []).filter(l => l.playerId !== offer.playerId), newsFeed: [{ date: st.currentSeason.races[st.currentSeason.currentRaceIndex]?.date ?? `${st.currentSeason.year}-06-01`, headline: `${player.name}が海外クラブ${clubName}へ移籍（移籍金${Math.round(offer.offeredPrice / 10000)}万）`, category: 'trade' as const, relatedIds: [player.id] }, ...st.currentSeason.newsFeed].slice(0, 30), departureNotices: [...(st.currentSeason.departureNotices ?? []), { id: `dep_${offer.playerId}`, playerId: offer.playerId, playerName: player.name, toTeamName: clubName, reason: 'transfer' as const, fee: offer.offeredPrice }] },
          }))
          return true
        }
        const buyingTeam = state.teams.find(t => t.id === offer.fromTeamId)
        if (!buyingTeam) return false
        set(state => ({
          // 放出した選手とは1年間交渉不可（transferLockedUntilYear）
          players: state.players.map(p => p.id === offer.playerId ? { ...p, teamId: offer.fromTeamId,  rosterTier: 'main' as const, transferLockedUntilYear: state.currentSeason.year + 1 } : p),
          teams: state.teams.map(t => {
            if (t.id === state.playerTeamId) return { ...t, finance: { ...t.finance, budget: t.finance.budget + offer.offeredPrice }, roster: { ...t.roster, main: t.roster.main.filter(id => id !== offer.playerId), second: t.roster.second.filter(id => id !== offer.playerId) } }
            // 買い手側からも移籍金を差し引く（AI経済の整合性）
            if (t.id === offer.fromTeamId) return { ...t, finance: { ...t.finance, budget: t.finance.budget - offer.offeredPrice }, roster: { ...t.roster, main: [...t.roster.main, offer.playerId] } }
            return t
          }),
          transferHistory: [...(state.transferHistory ?? []), { year: state.currentSeason.year, date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date, playerId: offer.playerId, fromTeamId: state.playerTeamId, toTeamId: offer.fromTeamId, fee: offer.offeredPrice }].slice(-400),
          currentSeason: {
            ...state.currentSeason,
            transferIncome: (state.currentSeason.transferIncome ?? 0) + offer.offeredPrice,
            incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId),
            // 売却した選手の出品（自分のもの含む）は市場から掃除する
            transferListings: (state.currentSeason.transferListings ?? []).filter(l => l.playerId !== offer.playerId),
            newsFeed: [{ date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}を${buyingTeam.shortName}へ移籍金${Math.round(offer.offeredPrice / 10000)}万で放出`, category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30),
            departureNotices: [...(state.currentSeason.departureNotices ?? []), { id: `dep_${offer.playerId}`, playerId: offer.playerId, playerName: player.name, toTeamName: buyingTeam.shortName, reason: 'transfer' as const, fee: offer.offeredPrice }],
          },
        }))
        return true
      },

      declineIncomingOffer: (offerId) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId),
          },
        }))
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
          if (!player || player.teamId !== state.playerTeamId) return state
          if (player.transferListed) return state  // 退団予定の選手とは更新交渉できない
          if ((player.renewalLockedUntilYear ?? 0) > state.currentSeason.year) return state  // 最終拒否後1年は更新不可
          const existing = (state.currentSeason.contractRequests ?? []).find(r => r.playerId === playerId && r.status !== 'accepted' && r.status !== 'rejected')
          if (existing) return state
          // 要求額は市場価値(OVR×年齢)×出場割合スケール×性格で算出（自動昇給を廃止し市場価値連動に）
          const gmRacesPlayed = state.currentSeason.currentRaceIndex ?? 0
          const gmSeasonRaces = state.currentSeason.races ?? []
          const gmPersonality = player.personality ?? 'salary'
          const gmMarket = faMarketSalary(player)
          const gmApps = seasonAppearances(player.id, gmSeasonRaces)
          const gmPlayFraction = gmRacesPlayed > 0 ? gmApps / gmRacesPlayed : 0
          const gmPlayFactor = 0.6 + 0.4 * Math.min(1, gmPlayFraction / 0.6)
          const gmPersoFactor = gmPersonality === 'salary' ? 1.05 : gmPersonality === 'winning' ? 1.0 : 0.95
          const gmDemand = Math.max(3_000_000, gmMarket * gmPlayFactor * gmPersoFactor)
          const req: ContractRequest = {
            id: `cr_${Date.now()}`,
            playerId,
            initiatedBy: 'gm',
            round: 1,
            status: 'pending_gm',
            expiresAtRace: (state.currentSeason.currentRaceIndex ?? 0) + 6,
            demandSalary: Math.round(gmDemand / 500000) * 500000,
            demandYears: 2,
            offerSalary: Math.round(Math.min(gmDemand, player.contract.annualSalary * 1.05) / 500000) * 500000,
            offerYears: 2,
          }
          return { currentSeason: { ...state.currentSeason, contractRequests: [...(state.currentSeason.contractRequests ?? []), req] } }
        })
      },

      generateContractRequests: () => {
        set(state => {
          const racesPlayed = state.currentSeason.currentRaceIndex ?? 0
          if (racesPlayed === 0) return state
          // フリー移籍で接触中の選手は契約更新の要求を出さない（用件が二重になるのを防ぐ。引き留めは接触カード経由の提示で行う）
          const contactedIds = new Set((state.currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice === 0).map(o => o.playerId))
          const myPlayers = state.players.filter(p => p.teamId === state.playerTeamId && p.contract.yearsLeft === 1
            && (p.renewalLockedUntilYear ?? 0) <= state.currentSeason.year && !p.transferListed && !contactedIds.has(p.id))
          // 拒否済みも含めて「今季すでに交渉した選手」には再生成しない（開き直しでround 1に戻るのを防ぐ）
          const existing = new Set((state.currentSeason.contractRequests ?? []).map(r => r.playerId))
          const seasonRaces = state.currentSeason.races ?? []
          const newReqs: ContractRequest[] = myPlayers.filter(p => !existing.has(p.id)).map(p => {
            const personality = p.personality ?? 'salary'
            // 要求額は「市場価値(OVR×年齢) × 出場割合スケール × 性格」で決める。
            // 旧仕様の『現年俸×1.2の自動昇給』を廃止。活躍・出場がない選手は市場価値未満＝据え置き〜減額しか要求できない。
            const market = faMarketSalary(p)
            const apps = seasonAppearances(p.id, seasonRaces)
            const playFraction = racesPlayed > 0 ? apps / racesPlayed : 0
            const playFactor = 0.6 + 0.4 * Math.min(1, playFraction / 0.6)   // 出場0→0.6倍, 6割以上出場→1.0倍
            const persoFactor = personality === 'salary' ? 1.05 : personality === 'winning' ? 1.0 : 0.95
            const demand = Math.max(3_000_000, market * playFactor * persoFactor)
            return {
              id: `cr_${Date.now()}_${p.id}`,
              playerId: p.id,
              initiatedBy: 'player' as const,
              round: 1,
              status: 'pending_gm' as const,
              expiresAtRace: racesPlayed + 6,
              demandSalary: Math.round(demand / 500000) * 500000,
              demandYears: personality === 'loyalty' ? 3 : 2,
              offerSalary: 0,
              offerYears: 0,
            }
          })
          const retPlayers = state.players.filter(p => p.teamId === state.playerTeamId && p.age >= 35)
          const existRet = new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId))
          // 今季すでに引き留めた選手は再抽選しない
          const newRet = retPlayers.filter(p => !existRet.has(p.id) && p.retirementDeclinedYear !== state.currentSeason.year && Math.random() < 0.4).map(p => ({ playerId: p.id, age: p.age }))
          // 移籍希望はチャットを開くたびではなくレース進行時に生成する（runRace内 generateTransferWishes）。ここでは扱わない。
          if (newReqs.length === 0 && newRet.length === 0) return state
          return {
            currentSeason: {
              ...state.currentSeason,
              contractRequests: [...(state.currentSeason.contractRequests ?? []), ...newReqs],
              retirementRequests: [...(state.currentSeason.retirementRequests ?? []), ...newRet],
            }
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
            const stgsFc = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
            const suitorIdx = stgsFc.findIndex(s => s.teamId === freeContact.fromTeamId)
            const suitorRank = suitorIdx >= 0 ? suitorIdx + 1 : Math.ceil(state.teams.length / 2)
            const fcRaces = Math.max(1, state.currentSeason.currentRaceIndex)
            const fcFrac = seasonAppearances(player.id, state.currentSeason.races) / fcRaces
            if (freeContactConsent(player, suitorRank, state.teams.length, fcFrac, fcRaces)) {
              // 一度断られたらこの接触は「対応済み」：通知・要対応から消し、以後は本人の決断を待つだけ
              return {
                currentSeason: {
                  ...state.currentSeason,
                  contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? { ...r, status: 'rejected' as const, offerSalary: salary, offerYears: years } : r),
                  incomingOffers: (state.currentSeason.incomingOffers ?? []).map(o => o.id === freeContact.id ? { ...o, retentionRefused: true } : o),
                  seenFreeContactIds: [...new Set([...(state.currentSeason.seenFreeContactIds ?? []), freeContact.id])],
                },
              }
            }
          }
          const myRank = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints).findIndex(s => s.teamId === state.playerTeamId) + 1
          const isGoodTeam = myRank > 0 && myRank <= 5
          const personality = player.personality ?? 'salary'
          const roundFactor = 1 + (req.round - 1) * 0.03
          const demand = Math.round(req.demandSalary * roundFactor / 500000) * 500000
          const ratio = demand > 0 ? salary / demand : 2
          // 士気が高い選手は譲歩する（要求を丸呑みしなくても交渉で下げられる余地を作る）
          const moraleDiscount = (player.morale ?? 60) >= 80 ? 0.05 : (player.morale ?? 60) >= 65 ? 0.02 : 0
          const acceptThresh = (personality === 'winning' && isGoodTeam ? 0.90 : personality === 'loyalty' ? 0.92 : 0.95) - moraleDiscount
          const counterThresh = personality === 'salary' ? 0.77 : 0.73
          const isLastRound = req.round >= 3  // 交渉は最大3ラウンド
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
          // roundの加算は reNegotiateContract 側のみ（獲得交渉と同じ規約）。ここでは進めない＝二重加算しない。
          const updatedReq = { ...req, status: newStatus, offerSalary: salary, offerYears: years, counterSalary, counterYears, offerContractType: contractType, offerTeamRole: teamRole }
          let newPlayers = state.players
          let newTeams = state.teams
          if (newStatus === 'accepted') {
            const desiredTier = tierForContractType(contractType) ?? player.rosterTier
            const placed = placePlayerInTier(state.teams, state.playerTeamId, player.id, player.rosterTier, desiredTier)
            newTeams = placed.teams
            // 契約年数＝現在の残年数＋提示年数（負にはならない）
            const newYears = Math.max(1, player.contract.yearsLeft + years)
            newPlayers = state.players.map(p => p.id === player.id ? {
              ...p,
              rosterTier: placed.tier,
              teamRole: teamRole ?? p.teamRole,
              // 枠不足で階層移動できなかった場合は契約形態も変えない（形態と所属のズレを防ぐ）。更新成立でルーキー契約は終了
              contract: { ...p.contract, annualSalary: salary, yearsLeft: newYears, contractType: placed.tier === desiredTier ? (contractType ?? p.contract.contractType) : p.contract.contractType, faEligibleYear: state.currentSeason.year + newYears, rookieDeal: false },
            } : p)
          } else if (newStatus === 'rejected' && isLastRound) {
            // 最終ラウンドで拒否 → 更新を拒み退団へ（移籍リスト入り＝契約満了でFA、他チームはフリー移籍で獲得可）
            // 来年まで更新オファーもロックする
            newPlayers = state.players.map(p => p.id === player.id ? { ...p, transferListed: true, renewalLockedUntilYear: state.currentSeason.year + 1 } : p)
          }
          return {
            players: newPlayers,
            teams: newTeams,
            currentSeason: {
              ...state.currentSeason,
              contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? updatedReq : r),
              // 更新成立なら進行中のフリー移籍の接触は打ち切り（残留確定）
              incomingOffers: newStatus === 'accepted'
                ? (state.currentSeason.incomingOffers ?? []).filter(o => !(o.playerId === player.id && o.offeredPrice === 0))
                : state.currentSeason.incomingOffers,
            }
          }
        })
      },

      acceptContractCounter: (requestId) => {
        set(state => {
          const req = (state.currentSeason.contractRequests ?? []).find(r => r.id === requestId && r.status === 'countered')
          if (!req || !req.counterSalary || !req.counterYears) return state
          const cPlayer = state.players.find(p => p.id === req.playerId)
          if (!cPlayer) return state
          const desiredTier = tierForContractType(req.offerContractType) ?? cPlayer.rosterTier
          const placed = placePlayerInTier(state.teams, state.playerTeamId, cPlayer.id, cPlayer.rosterTier, desiredTier)
          const cNewYears = Math.max(1, cPlayer.contract.yearsLeft + (req.counterYears ?? 1))
          return {
            players: state.players.map(p => p.id === req.playerId ? {
              ...p,
              rosterTier: placed.tier,
              teamRole: req.offerTeamRole ?? p.teamRole,
              // 枠不足で階層移動できなかった場合は契約形態も変えない（形態と所属のズレを防ぐ）。更新成立でルーキー契約は終了
              contract: { ...p.contract, annualSalary: req.counterSalary!, yearsLeft: cNewYears, contractType: placed.tier === desiredTier ? (req.offerContractType ?? p.contract.contractType) : p.contract.contractType, faEligibleYear: state.currentSeason.year + cNewYears, rookieDeal: false },
            } : p),
            teams: placed.teams,
            currentSeason: {
              ...state.currentSeason,
              contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.id === requestId ? { ...r, status: 'accepted' as const } : r),
              // 更新成立なら進行中のフリー移籍の接触は打ち切り（残留確定）
              incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => !(o.playerId === req.playerId && o.offeredPrice === 0)),
            }
          }
        })
      },

      reNegotiateContract: (requestId) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            contractRequests: (state.currentSeason.contractRequests ?? []).map(r =>
              r.id === requestId && (r.status === 'countered' || r.status === 'rejected')
                ? { ...r, round: r.round + 1, status: 'pending_gm' as const, expiresAtRace: (state.currentSeason.currentRaceIndex ?? 0) + 6, offerSalary: r.counterSalary ?? r.offerSalary, offerYears: r.counterYears ?? r.offerYears }
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

      startAcquisitionOffer: (playerId, source) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player) return state
          if (source === 'fa' && player.teamId !== '') return state
          if (source === 'scout' && (player.teamId === '' || player.teamId === state.playerTeamId)) return state
          // 自チームから移籍・FA流出した選手とは1年間交渉不可（移籍金オファーと同じロック）
          if (player.transferLockedUntilYear != null && state.currentSeason.year < player.transferLockedUntilYear) return state
          // 赤字ペナルティ中は新規補強(FA/引き抜き)不可（ドラフト・契約更新は可）
          const myTeam0 = state.teams.find(t => t.id === state.playerTeamId)
          if (reinforcementBanned(myTeam0)) return state
          const offers = state.currentSeason.acquisitionOffers ?? []
          const active = offers.find(o => o.playerId === playerId && (o.status === 'pending' || o.status === 'countered'))
          if (active) return state
          // 獲得失敗（相手/選手に拒否された）選手は同一シーズン中は再オファー不可（約1年ブロック）。
          // 自主的な取り下げ(abandon)は rejectReason が無いので対象外。offers はシーズン開始で[]にリセットされる。
          const failed = offers.find(o => o.playerId === playerId && o.status === 'rejected' && !!o.rejectReason)
          if (failed) return state
          const newOffer: AcquisitionOffer = {
            id: `ao_${Date.now()}_${playerId}`,
            playerId, source, round: 1, status: 'pending',
            offerSalary: 0, offerYears: 2,
            offerContractType: source === 'scout' && player.rosterTier === 'second' ? 'development' : 'standard',
          }
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
          const teamRaces = state.currentSeason.currentRaceIndex
          const apps = seasonAppearances(player.id, state.currentSeason.races)
          const playFraction = teamRaces > 0 ? apps / teamRaces : (player.rosterTier === 'main' ? 0.5 : 0)
          const rejectWith = (reason: AcquisitionOffer['rejectReason']) => ({
            currentSeason: {
              ...state.currentSeason,
              acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId
                ? { ...o, status: 'rejected' as const, offerSalary: salary, offerYears: years, offerContractType: contractType, offerTeamRole: teamRole, rejectReason: reason }
                : o),
            },
          })
          // 相手チームがデータ上の主力（よく出場）を手放さない（引き抜き）
          if (offer.source === 'scout' && isEssentiallyUnpoachable(player, playFraction, teamRaces)) return rejectWith('team_refused')
          // 契約形態：良い選手は2軍(2way/育成)契約では納得しない
          const isQuality = ovr(player) >= 68 || (teamRaces >= 3 && playFraction >= 0.5)
          if (contractType !== 'standard' && isQuality) return rejectWith('demotion')

          const desired = acquisitionDesiredSalary(player, offer.source, playFraction, teamRaces)
          const ratio = desired > 0 ? salary / desired : 2
          const personality = player.personality ?? 'salary'
          // 視察情報：未視察だと選手は慎重（厳しめ）
          const scouted = offer.source === 'scout' ? isOpponentScouted(player.id, state.currentSeason) : true
          const infoPenalty = offer.source === 'scout' ? (scouted ? 0 : 0.12) : 0
          const rlx = (offer.round - 1) * 0.02
          // 4要素で判断：年俸(ratio)・役割(roleBonus)・契約形態(typeAdjust)・契約年数(yearsBonus)
          const roleBonus = teamRole === 'ace' ? -0.06 : teamRole === 'key_player' ? -0.045 : teamRole === 'sub_ace' ? -0.03 : teamRole === 'rotation' ? -0.015 : 0
          const typeAdjust = contractType === 'standard' ? 0 : contractType === 'dual' ? 0.05 : 0.08
          const yearsBonus = (personality === 'loyalty' && years >= 3) ? -0.03 : 0
          // 性格×行き先：優勝型は「今より強いチーム」なら安くても乗る／弱いチームだと渋る。
          const appealAdj = (() => {
            if (personality !== 'winning') return 0
            const sorted = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
            const myRank = sorted.findIndex(s => s.teamId === state.playerTeamId) + 1
            const theirRank = sorted.findIndex(s => s.teamId === player.teamId) + 1
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
            const signed = buildAcquisitionSigning(
              state.players, state.teams, state.playerTeamId, state.currentSeason.currentRaceIndex, state.currentSeason.year,
              player.id, salary, years, contractType, teamRole,
            )
            if (!signed) return state // ロスター枠満杯：契約不可（UI側で事前警告）
            return {
              players: signed.players,
              teams: signed.teams,
              // 海外クラブ所属だった場合、そのクラブの名簿からも外す（残ると自チームと二重所属＝増殖する）
              foreignLeagues: (state.foreignLeagues ?? []).map(l => ({ ...l, clubs: l.clubs.map(c => c.playerIds.includes(player.id) ? { ...c, playerIds: c.playerIds.filter(id => id !== player.id) } : c) })),
              transferHistory: [...(state.transferHistory ?? []), { year: state.currentSeason.year, date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date, playerId: player.id, fromTeamId: player.teamId, toTeamId: state.playerTeamId, fee: 0, kind: 'free' as const, years }].slice(-400),
              currentSeason: {
                ...state.currentSeason,
                acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId
                  ? { ...o, status: 'accepted' as const, offerSalary: salary, offerYears: years, offerContractType: contractType, offerTeamRole: teamRole }
                  : o),
                newsFeed: [{
                  date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date ?? `${state.currentSeason.year}-06-01`,
                  headline: `${player.name}が加入（年俸${Math.round(salary / 10000)}万・${years}年）`,
                  category: 'fa' as const,
                  relatedIds: [player.id],
                }, ...state.currentSeason.newsFeed].slice(0, 30),
              },
            }
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
                : o),
            },
          }
        })
      },

      acceptAcquisitionCounter: (offerId) => {
        set(state => {
          const offer = (state.currentSeason.acquisitionOffers ?? []).find(o => o.id === offerId && o.status === 'countered')
          if (!offer || !offer.counterSalary || !offer.counterYears) return state
          const signed = buildAcquisitionSigning(
            state.players, state.teams, state.playerTeamId, state.currentSeason.currentRaceIndex, state.currentSeason.year,
            offer.playerId, offer.counterSalary, offer.counterYears, offer.offerContractType, offer.offerTeamRole,
          )
          if (!signed) return state
          const player = state.players.find(p => p.id === offer.playerId)
          return {
            players: signed.players,
            teams: signed.teams,
            // 海外クラブ所属だった場合、そのクラブの名簿からも外す（残ると自チームと二重所属＝増殖する）
            foreignLeagues: (state.foreignLeagues ?? []).map(l => ({ ...l, clubs: l.clubs.map(c => c.playerIds.includes(offer.playerId) ? { ...c, playerIds: c.playerIds.filter(id => id !== offer.playerId) } : c) })),
            transferHistory: [...(state.transferHistory ?? []), { year: state.currentSeason.year, date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date, playerId: offer.playerId, fromTeamId: player?.teamId ?? '', toTeamId: state.playerTeamId, fee: 0, kind: 'free' as const, years: offer.counterYears }].slice(-400),
            currentSeason: {
              ...state.currentSeason,
              acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId ? { ...o, status: 'accepted' as const } : o),
              newsFeed: [{
                date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date ?? `${state.currentSeason.year}-06-01`,
                headline: `${player?.name ?? ''}が加入（年俸${Math.round(offer.counterSalary / 10000)}万・${offer.counterYears}年）`,
                category: 'fa' as const,
                relatedIds: [offer.playerId],
              }, ...state.currentSeason.newsFeed].slice(0, 30),
            },
          }
        })
      },

      reNegotiateAcquisition: (offerId) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o =>
              o.id === offerId && o.status === 'countered'
                ? { ...o, round: o.round + 1, status: 'pending' as const }
                : o),
          },
        }))
      },

      abandonAcquisitionOffer: (offerId) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId ? { ...o, status: 'rejected' as const } : o),
          },
        }))
      },

      releasePlayerWithBuyout: (playerId) => {
        let released = false
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player || player.teamId !== state.playerTeamId) return state
          // 最低ロスター人数を割る解雇は不可
          if (!canReleaseFromRoster(state.players, state.playerTeamId)) return state
          const buyoutCost = player.contract.annualSalary * Math.max(0, player.contract.yearsLeft - 1)
          released = true
          return {
            players: state.players.map(p => p.id === playerId ? { ...p, teamId: '', } : p),
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
        return released
      },

      counterIncomingOffer: (offerId, counterPrice) => {
        // 成立('sold')・決裂('refused')・無効('invalid')をUIに返し、結果表示に使う
        let outcome: 'sold' | 'refused' | 'invalid' = 'invalid'
        set(state => {
          const offer = (state.currentSeason.incomingOffers ?? []).find(o => o.id === offerId)
          if (!offer) return state
          const player = state.players.find(p => p.id === offer.playerId)
          // 所有チェック：オファー後に選手がチームを離れていたら成立させない（acceptIncomingOfferと同じガード）
          if (!player || player.teamId !== state.playerTeamId || (player.loan && player.loan.ownerTeamId !== state.playerTeamId)) {
            return { currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }
          }
          // 海外クラブ：teams に無いので上限は提示額の1.3倍まで、合意なら海外へ放出
          if (offer.fromForeign) {
            if (player && counterPrice <= offer.offeredPrice * 1.3) {
              const clubName = (state.foreignLeagues ?? []).flatMap(l => l.clubs).find(c => c.id === offer.fromTeamId)?.shortName ?? '海外クラブ'
              outcome = 'sold'
              return {
                // 放出した選手とは1年間交渉不可
                players: state.players.map(p => p.id === offer.playerId ? { ...p, teamId: offer.fromTeamId, rosterTier: 'main' as const, loan: undefined, transferLockedUntilYear: state.currentSeason.year + 1 } : p),
                teams: state.teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + counterPrice }, roster: { ...t.roster, main: t.roster.main.filter(id => id !== offer.playerId), second: t.roster.second.filter(id => id !== offer.playerId) } } : t),
                foreignLeagues: (state.foreignLeagues ?? []).map(l => ({ ...l, clubs: l.clubs.map(c => c.id === offer.fromTeamId ? { ...c, playerIds: [...c.playerIds, offer.playerId] } : c) })),
                currentSeason: { ...state.currentSeason, transferIncome: (state.currentSeason.transferIncome ?? 0) + counterPrice, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId), newsFeed: [{ date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}が海外クラブ${clubName}へ移籍（移籍金${Math.round(counterPrice / 10000)}万）`, category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30) },
              }
            }
            outcome = 'refused'
            return { currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }
          }
          const buyingTeam = state.teams.find(t => t.id === offer.fromTeamId)
          const maxBudget = buyingTeam?.finance.budget ?? 0
          if (counterPrice <= maxBudget) {
            outcome = 'sold'
            return {
              // 放出した選手とは1年間交渉不可
              players: state.players.map(p => p.id === offer.playerId ? { ...p, teamId: offer.fromTeamId,  rosterTier: 'main' as const, transferLockedUntilYear: state.currentSeason.year + 1 } : p),
              teams: state.teams.map(t => {
                if (t.id === state.playerTeamId) return { ...t, finance: { ...t.finance, budget: t.finance.budget + counterPrice }, roster: { ...t.roster, main: t.roster.main.filter(id => id !== offer.playerId), second: t.roster.second.filter(id => id !== offer.playerId) } }
                if (t.id === offer.fromTeamId) return { ...t, roster: { ...t.roster, main: [...t.roster.main, offer.playerId] } }
                return t
              }),
              currentSeason: { ...state.currentSeason, transferIncome: (state.currentSeason.transferIncome ?? 0) + counterPrice, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) }
            }
          } else {
            outcome = 'refused'
            return { currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }
          }
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
            players: state.players.map(p => p.id === playerId ? { ...p, status: 'retired' as const, teamId: '', retiredYear: state.currentSeason.year } : p),
            teams: newTeams,
            currentSeason: { ...state.currentSeason, retirementRequests: (state.currentSeason.retirementRequests ?? []).filter(r => r.playerId !== playerId) }
          }
        })
      },

      dismissTransferRequest: (playerId) => set(state => ({
        // 対応済みの年を記録し、同じシーズン中に移籍希望を再抽選しない
        players: state.players.map(p => p.id === playerId ? { ...p, transferRequestDismissedYear: state.currentSeason.year } : p),
        currentSeason: { ...state.currentSeason, transferRequests: (state.currentSeason.transferRequests ?? []).filter(r => r.playerId !== playerId) }
      })),

      allowPlayerTransfer: (playerId) => set(state => {
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId !== state.playerTeamId) return state
        if (player.loan) return state  // レンタルで借りている選手は放流できない（保有権が無い）
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
          askingPrice: Math.max(500000, Math.round(calcTransferValue(player) / 500000) * 500000),
          listedAtRace: raceIdx,
          expiresAtRace: raceIdx + 99,
          competingTeams: interested,
        }
        const alreadyListed = (state.currentSeason.transferListings ?? []).some(l => l.playerId === playerId)
        return {
          // 売出は非売・貸出歓迎と排他（自動で解除して切り替える）
          players: state.players.map(p => p.id === playerId ? { ...p, transferListed: true, noSale: false, loanListed: false } : p),
          currentSeason: {
            ...state.currentSeason,
            transferListings: alreadyListed ? state.currentSeason.transferListings : [...(state.currentSeason.transferListings ?? []), allowListing],
            // 交渉・移籍希望を解決
            contractRequests: (state.currentSeason.contractRequests ?? []).map(r => r.playerId === playerId && r.status !== 'accepted' ? { ...r, status: 'rejected' as const } : r),
            transferRequests: (state.currentSeason.transferRequests ?? []).filter(r => r.playerId !== playerId),
          },
        }
      }),

      toggleNoSale: (playerId) => set(state => {
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId !== state.playerTeamId) return state
        const next = !player.noSale
        return {
          // 売出（移籍リスト入り）とは矛盾するので、非売ONで売出は自動解除
          players: state.players.map(p => p.id === playerId ? { ...p, noSale: next, ...(next ? { transferListed: false } : {}) } : p),
          currentSeason: next ? {
            ...state.currentSeason,
            // ONにした瞬間、既に届いている買い取りオファー（移籍金付き）も取り下げ、出品も下げる。フリー接触（0円）は本人の話なので残す
            incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => !(o.playerId === playerId && o.offeredPrice > 0)),
            transferListings: (state.currentSeason.transferListings ?? []).filter(l => !(l.playerId === playerId && l.fromTeamId === state.playerTeamId)),
          } : state.currentSeason,
        }
      }),

      // 移籍方針・貸出歓迎のON/OFF。ONの選手にはレンタル打診（lend_out）が優先的に来る
      toggleLoanListed: (playerId) => set(state => {
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId !== state.playerTeamId) return state
        if (player.loan) return state  // レンタル中（借入・貸出とも）は設定不可
        const next = !player.loanListed
        return {
          // 売出とは排他（売る気の選手を貸しには出さない）。貸出ONで売出は自動解除
          players: state.players.map(p => p.id === playerId ? { ...p, loanListed: next, ...(next ? { transferListed: false } : {}) } : p),
          currentSeason: next ? {
            ...state.currentSeason,
            transferListings: (state.currentSeason.transferListings ?? []).filter(l => !(l.playerId === playerId && l.fromTeamId === state.playerTeamId)),
          } : state.currentSeason,
        }
      }),

      // 移籍方針・売出の解除（出品を取り下げて退団予定フラグも外す）
      cancelSellListing: (playerId) => set(state => {
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId !== state.playerTeamId) return state
        return {
          players: state.players.map(p => p.id === playerId ? { ...p, transferListed: false } : p),
          currentSeason: {
            ...state.currentSeason,
            transferListings: (state.currentSeason.transferListings ?? []).filter(l => !(l.playerId === playerId && l.fromTeamId === state.playerTeamId)),
          },
        }
      }),

      loanInPlayer: (playerId, years, force = false) => {
        const st = get()
        if (reinforcementBanned(st.teams.find(t => t.id === st.playerTeamId))) return false  // 赤字・残高マイナスは補強不可
        const player = st.players.find(p => p.id === playerId)
        if (!player || player.teamId === '' || player.teamId === st.playerTeamId || player.loan) return false
        // レンタル枠 最大3（借りている選手＝loan.ownerTeamId が自分でない）
        const usedSlots = st.players.filter(p => p.teamId === st.playerTeamId && p.loan && p.loan.ownerTeamId !== st.playerTeamId).length
        if (usedSlots >= 3) return false
        // 相手チームの主力（データ判定）は貸さない（forceなら相手が貸す打診済みなのでスキップ）
        const teamRaces = st.currentSeason.currentRaceIndex
        const apps = seasonAppearances(playerId, st.currentSeason.races)
        const frac = teamRaces > 0 ? apps / teamRaces : (player.rosterTier === 'main' ? 0.5 : 0)
        if (!force && isDataKeyPlayer(player, frac, teamRaces) && (player.morale ?? 60) >= 45) return false
        const ownerId = player.teamId
        const yrs = Math.max(1, Math.min(2, years))
        set(state => {
          const myTeam = state.teams.find(t => t.id === state.playerTeamId)
          return {
            players: state.players.map(p => p.id === playerId ? {
              ...p,
              teamId: state.playerTeamId,
              
              loan: { ownerTeamId: ownerId, untilYear: state.currentSeason.year + yrs },
              acquiredRaceIndex: state.currentSeason.currentRaceIndex,
              joinedYear: state.currentSeason.year,
            } : p),
            // 旧チームのroster配列から外す（レンタル中は自チームで別枠管理）
            teams: state.teams.map(t => t.id === ownerId ? { ...t, roster: { main: t.roster.main.filter(id => id !== playerId), second: t.roster.second.filter(id => id !== playerId) } } : t),
            // 海外クラブから借りた場合はクラブの選手リストからも外す（レンタル中の二重表示防止）
            foreignLeagues: (state.foreignLeagues ?? []).map(l => ({ ...l, clubs: l.clubs.map(c => c.playerIds.includes(playerId) ? { ...c, playerIds: c.playerIds.filter(id => id !== playerId) } : c) })),
            currentSeason: {
              ...state.currentSeason,
              newsFeed: [{ date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}を${yrs}シーズンのレンタルで獲得`, category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30),
            },
          }
        })
        return true
      },

      loanOutPlayer: (playerId, toTeamId, years) => {
        const st = get()
        const player = st.players.find(p => p.id === playerId)
        if (!player || player.teamId !== st.playerTeamId || player.loan) return false
        // 借り手の総在籍が上限（30人）なら貸せない（31人化の防止）
        const toSize = st.players.filter(p => p.teamId === toTeamId && p.status === 'active').length
        if (toSize >= 30) return false
        const yrs = Math.max(1, Math.min(2, years))
        set(state => ({
          players: state.players.map(p => p.id === playerId ? {
            ...p,
            teamId: toTeamId,
            loan: { ownerTeamId: state.playerTeamId, untilYear: state.currentSeason.year + yrs },
          } : p),
          teams: state.teams.map(t => t.id === state.playerTeamId ? { ...t, roster: { main: t.roster.main.filter(id => id !== playerId), second: t.roster.second.filter(id => id !== playerId) } } : t),
          currentSeason: {
            ...state.currentSeason,
            newsFeed: [{ date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}を${yrs}シーズンのレンタルで放出`, category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30),
            departureNotices: [...(state.currentSeason.departureNotices ?? []), { id: `dep_${playerId}`, playerId, playerName: player.name, toTeamName: state.teams.find(t => t.id === toTeamId)?.shortName ?? '他クラブ', reason: 'loan' as const, years: yrs }],
          },
        }))
        return true
      },

      submitLoanRequest: (playerId, years) => {
        const st = get()
        if (!st.getTransferWindow().open) return false
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
            loanRequests: [...(state.currentSeason.loanRequests ?? []), { id: `lr_${Date.now()}`, playerId, targetTeamId: player.teamId, years: yrs, submittedAtRace: state.currentSeason.currentRaceIndex }],
          },
        }))
        return true
      },

      cancelLoanRequest: (playerId) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            loanRequests: (state.currentSeason.loanRequests ?? []).filter(r => r.playerId !== playerId),
          },
        }))
      },

      dismissLoanResponse: (id) => {
        set(state => ({
          currentSeason: {
            ...state.currentSeason,
            loanResponses: (state.currentSeason.loanResponses ?? []).filter(r => r.id !== id),
          },
        }))
      },

      submitTransferBid: (playerId, fee) => {
        const state = get()
        if (!state.getTransferWindow().open) return  // 移籍ウィンドウ閉鎖中はオファー不可
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId === state.playerTeamId || player.teamId === '') return
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

      // 移籍金でチームが合意しても、選手本人が納得しなければ成立しない。
      finalizeTransfer: (bidId, salary, years) => {
        const state = get()
        const bid = (state.currentSeason.transferBids ?? []).find(b => b.id === bidId)
        if (!bid || bid.status !== 'fee_accepted') return { ok: false, reason: '交渉の状態が変わったため、手続きを進められませんでした。' }
        const player = state.players.find(p => p.id === bid.playerId)
        if (!player || player.teamId !== bid.targetTeamId) return { ok: false, reason: '彼は既に別のクラブへ移籍しています。' }
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam || myTeam.finance.budget < bid.offeredFee) return { ok: false, reason: `貴クラブの予算では移籍金${Math.round(bid.offeredFee / 10000)}万を支払えないようです。資金を確保してから改めてお願いします。` }
        // ロスター枠チェック（移籍金ルートは本契約として加入する）。枠不足は決裂扱いにしない
        if (!canSignContract(state.players, state.playerTeamId, 'standard')) {
          return { ok: false, reason: '貴クラブの1軍契約枠が上限のようです。ロスターを整理してから改めてお願いします。' }
        }
        // 選手本人の同意ゲート
        const standings = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
        const myRank = standings.findIndex(s => s.teamId === state.playerTeamId) + 1
        const scoutLvT = myTeam.facilities?.scoutOffice ?? 0
        // 相場を大きく上回る年俸は本人の説得材料になる（相場1.2倍で+0.1、1.5倍で+0.2）
        const marketSalary = faMarketSalary(player)
        const salaryBonus = salary >= marketSalary * 1.5 ? 0.2 : salary >= marketSalary * 1.2 ? 0.1 : 0
        // クラブ間で移籍金が合意済み＝クラブ公認の移籍。「主力だから残りたい」の減点は完全になし
        // （断られるのは愛着の強い選手・順位の低いチームへの誘いくらい）
        const consent = playerConsentToMove(player, myRank, state.teams.length, 0.5, 0, scoutLvT * 0.02 + salaryBonus, true)
        if (!consent.ok) {
          // 交渉決裂: 入札を破談にし、来季までこの選手への移籍金オファーを不可にする
          set(s => ({
            players: s.players.map(p => p.id === bid.playerId ? { ...p, transferLockedUntilYear: s.currentSeason.year + 1 } : p),
            currentSeason: {
              ...s.currentSeason,
              transferBids: (s.currentSeason.transferBids ?? []).map(b => b.id === bidId ? { ...b, status: 'failed' as const } : b),
            },
          }))
          return { ok: false, reason: `${consent.reason}ようです。交渉は決裂となりました。来季まで再交渉はできません。` }
        }
        // 正規の署名処理（枠チェック・旧チームのロスター整理・contractType設定込み）で加入させる
        const signed = buildAcquisitionSigning(
          state.players, state.teams, state.playerTeamId,
          state.currentSeason.currentRaceIndex, state.currentSeason.year,
          bid.playerId, salary, years, 'standard',
        )
        if (!signed) return { ok: false, reason: '貴クラブの1軍契約枠が上限のようです。ロスターを整理してから改めてお願いします。' }
        set(s => ({
          players: signed.players.map(p => p.id === bid.playerId
            ? { ...p, contract: { ...p.contract, faEligibleYear: s.currentSeason.year + years } }
            : p
          ),
          teams: signed.teams.map(t => t.id === s.playerTeamId
            ? { ...t, finance: { ...t.finance, budget: t.finance.budget - bid.offeredFee } }
            : t
          ),
          // 海外クラブから獲得した場合、そのクラブの選手リストからも外す
          foreignLeagues: (s.foreignLeagues ?? []).map(l => ({ ...l, clubs: l.clubs.map(c => c.playerIds.includes(bid.playerId) ? { ...c, playerIds: c.playerIds.filter(id => id !== bid.playerId) } : c) })),
          transferHistory: [...(s.transferHistory ?? []), { year: s.currentSeason.year, date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date, playerId: bid.playerId, fromTeamId: bid.targetTeamId, toTeamId: s.playerTeamId, fee: bid.offeredFee, years }].slice(-400),
          currentSeason: {
            ...s.currentSeason,
            transferSpend: (s.currentSeason.transferSpend ?? 0) + bid.offeredFee,
            transferBids: (s.currentSeason.transferBids ?? []).map(b => b.id === bidId ? { ...b, status: 'complete' as const } : b),
            transferListings: (s.currentSeason.transferListings ?? []).filter(l => l.playerId !== bid.playerId),
            newsFeed: [{ date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date ?? `${s.currentSeason.year}-06-01`, headline: `${player.name}を移籍金${Math.round(bid.offeredFee / 10000)}万・年俸${Math.round(salary / 10000)}万で獲得`, category: 'trade' as const, relatedIds: [player.id], major: bid.offeredFee >= 100_000_000, fromTeamId: bid.targetTeamId, toTeamId: s.playerTeamId }, ...s.currentSeason.newsFeed].slice(0, 30),
          },
        }))
        return { ok: true }
      },

      listMyPlayerForSale: (playerId, askingPrice) => {
        const state = get()
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId !== state.playerTeamId) return
        if (player.loan) return  // レンタルで借りている選手は売り出せない（保有権が無い）
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
        const fairVal = draftPickValue(pick.round, pick.pickNumber)
        if (price > fairVal * 1.3) return false
        if (buyTeam.finance.budget < price) return false  // 買い手が払えない額では成立しない
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
              finance: { ...t.finance, budget: t.finance.budget - price },
              draftPicks: [...t.draftPicks, pick],
            }
            return t
          }),
          currentSeason: {
            ...s.currentSeason,
            transferIncome: (s.currentSeason.transferIncome ?? 0) + price,
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

      // ロスターの名前横に表示する記録パッチを選ぶ（null で非表示）
      setDisplayBadge: (playerId, badgeKey) => {
        set(state => ({
          players: state.players.map(p => p.id === playerId ? { ...p, displayBadge: badgeKey ?? undefined } : p),
        }))
      },

      setTrainingPlan: (plan) => {
        set(state => ({
          currentSeason: { ...state.currentSeason, trainingPlan: plan },
        }))
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

      ensureFuturePicks: () => {
        const state = get()
        const yr = state.currentSeason.year
        const anyMissingPicks = state.teams.some(t =>
          !(t.draftPicks ?? []).some(pk => pk.year > yr)
        )
        if (!anyMissingPicks) return
        // 指名権番号は前年順位の逆順（最下位＝全体1位）で振る。
        const pickNumMap = standingsPickNumbers(state.teams)
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

        // 移籍金を払う場合は予算チェック（予算が無条件にマイナスへ落ちるのを防ぐ）
        if (transferFee > 0) {
          const myBudget = state.teams.find(t => t.id === state.playerTeamId)?.finance.budget ?? 0
          if (myBudget < transferFee) return false
        }

        // レンタル中の選手は保有権が無いのでトレード対象にできない（出す側・もらう側とも）
        if (offered.some(p => p.loan) || requested.some(p => p.loan)) return false

        // 価値の釣り合い：ゴミ選手を複数足しただけでは成立しない。
        // calcTransferValue（OVR・年齢・実績を加味）＋出場データで両サイドの価値を比較。
        // 相手の主力は無条件拒否ではなく1.5倍の価値を要求（proposeTradeと同じ換算）
        const teamRaces = state.currentSeason.currentRaceIndex
        const activityBonus = (p: Player) => {
          const apps = seasonAppearances(p.id, state.currentSeason.races)
          const frac = teamRaces > 0 ? apps / teamRaces : 0
          return 1 + frac * 0.4  // よく出場している選手は価値プレミアム
        }
        const keyPremium = (p: Player) => {
          const apps = seasonAppearances(p.id, state.currentSeason.races)
          const frac = teamRaces > 0 ? apps / teamRaces : (p.rosterTier === 'main' ? 0.5 : 0)
          return isDataKeyPlayer(p, frac, teamRaces) && (p.morale ?? 60) >= 45 ? 1.5 : 1
        }
        const offeredVal = offered.reduce((s, p) => s + calcTransferValue(p) * activityBonus(p), 0)
          + offerPickKeys.reduce((s, k) => s + pickKeyValue(k), 0) + Math.max(0, transferFee)
        const requestedVal = requested.reduce((s, p) => s + calcTransferValue(p) * activityBonus(p) * keyPremium(p), 0)
          + requestPickKeys.reduce((s, k) => s + pickKeyValue(k), 0) + Math.max(0, -transferFee)
        if (offeredVal < requestedVal * 0.92) return false  // 価値が釣り合わなければ不成立

        // 選手本人の同意ゲート：獲得する選手が自チームへの移籍に納得しなければ成立しない
        // （相手クラブが大きく得をする取引＝1.2倍以上なら本人の説得材料になる。proposeTradeと同じ）
        const stgs = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
        const myRankNow = stgs.findIndex(s => s.teamId === state.playerTeamId) + 1
        const consentBonusT = requestedVal > 0 && offeredVal / requestedVal >= 1.2 ? 0.15 : 0
        for (const rp of requested) {
          if (!playerConsentToMove(rp, myRankNow, state.teams.length, 0.5, 0, consentBonusT).ok) return false
        }

        function matchPick(picks: typeof state.teams[0]['draftPicks'], key: string) {
          return picks.find(pk => `${pk.year}-R${pk.round}-${pk.pickNumber}` === key)
        }

        set(state => {
          const myMainAfterTrade = state.teams.find(t => t.id === state.playerTeamId)?.roster.main.filter(id => !offeredIds.includes(id)) ?? []
          const incomingIds = requestedIds.filter(id => !myMainAfterTrade.includes(id))

          // 獲得選手はフラットロスター(main)で加入し、加入レースを記録（加入後2戦は出走不可）。
          // 旧2軍(second)で加えるとロスター一覧（main表示）から消えるバグになる
          const players = state.players.map(p => {
            if (offeredIds.includes(p.id)) return { ...p, teamId: targetTeamId, rosterTier: 'main' as const }
            if (incomingIds.includes(p.id)) return { ...p, teamId: state.playerTeamId, rosterTier: 'main' as const, acquiredRaceIndex: state.currentSeason.currentRaceIndex, joinedYear: state.currentSeason.year }
            return p
          })
          const myTeamPicks = state.teams.find(t => t.id === state.playerTeamId)?.draftPicks ?? []
          const theirPicks = state.teams.find(t => t.id === targetTeamId)?.draftPicks ?? []
          const offeredPicks = offerPickKeys.map(k => matchPick(myTeamPicks, k)).filter(Boolean) as typeof myTeamPicks
          const requestedPicks = requestPickKeys.map(k => matchPick(theirPicks, k)).filter(Boolean) as typeof theirPicks

          const teams = state.teams.map(t => {
            if (t.id === state.playerTeamId) return {
              ...t,
              roster: { main: myMainAfterTrade, second: [...t.roster.second.filter(id => !offeredIds.includes(id)), ...incomingIds] },
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
              offerContractType: (ip && ovr(ip) >= 68 ? 'standard' : 'development') as 'standard' | 'development' | 'dual',
            }
          })
          const keptOffers = (state.currentSeason.acquisitionOffers ?? []).filter(o => !incomingIds.includes(o.playerId))

          // 相手が海外クラブの場合、クラブ名簿（playerIds）も更新する。
          // 放出選手をクラブ名簿へ追加、獲得選手をクラブ名簿から除去（二重所属・宙ぶらりんを防ぐ）
          const foreignLeagues = (state.foreignLeagues ?? []).map(l => ({
            ...l,
            clubs: l.clubs.map(c => c.id === targetTeamId
              ? { ...c, playerIds: [...c.playerIds.filter(id => !requestedIds.includes(id)), ...offeredIds] }
              : c),
          }))

          return { players, teams, foreignLeagues,
            transferHistory: [
              ...(state.transferHistory ?? []),
              ...offeredIds.map(id => ({ year: state.currentSeason.year, date: tradeDate, playerId: id, fromTeamId: state.playerTeamId, toTeamId: targetTeamId, fee: 0, kind: 'trade' as const, years: state.players.find(p => p.id === id)?.contract.yearsLeft })),
              ...incomingIds.map(id => ({ year: state.currentSeason.year, date: tradeDate, playerId: id, fromTeamId: targetTeamId, toTeamId: state.playerTeamId, fee: 0, kind: 'trade' as const, years: state.players.find(p => p.id === id)?.contract.yearsLeft })),
            ].slice(-400),
            currentSeason: {
            ...state.currentSeason,
            acquisitionOffers: [...keptOffers, ...incomingOffers],
            newsFeed: [tradeNews, ...state.currentSeason.newsFeed].slice(0, 30),
          } }
        })
        return true
      },

      // トレードのチャット交渉。提案→相手が承諾/カウンター/拒否（最大3回）。
      proposeTrade: (targetTeamId, giveIds, givePickKeys, getIds, getPickKeys) => {
        const state = get()
        const teamRaces = state.currentSeason.currentRaceIndex
        const activity = (p: Player) => { const apps = seasonAppearances(p.id, state.currentSeason.races); const frac = teamRaces > 0 ? apps / teamRaces : 0; return 1 + frac * 0.4 }
        const pval = (p: Player) => calcTransferValue(p) * activity(p)
        const valOf = (ids: string[], picks: string[]) => ids.map(id => state.players.find(p => p.id === id)).filter((p): p is Player => !!p).reduce((s, p) => s + pval(p), 0) + picks.reduce((s, k) => s + pickKeyValue(k), 0)
        const theirName = state.teams.find(t => t.id === targetTeamId)?.shortName
          ?? (state.foreignLeagues ?? []).flatMap(l => l.clubs).find(c => c.id === targetTeamId)?.shortName
          ?? '相手クラブ'
        // 主力（データ上よく出場・やる気あり）は無条件拒否ではなく1.5倍の価値を要求する
        const keyPremium = (p: Player) => {
          const apps = seasonAppearances(p.id, state.currentSeason.races)
          const frac = teamRaces > 0 ? apps / teamRaces : (p.rosterTier === 'main' ? 0.5 : 0)
          return isDataKeyPlayer(p, frac, teamRaces) && (p.morale ?? 60) >= 45 ? 1.5 : 1
        }
        const cpuGain = valOf(giveIds, givePickKeys)  // 相手が受け取る
        const cpuLoss = getIds.map(id => state.players.find(p => p.id === id)).filter((p): p is Player => !!p).reduce((s, p) => s + pval(p) * keyPremium(p), 0) + getPickKeys.reduce((s, k) => s + pickKeyValue(k), 0)  // 相手が手放す（主力プレミアム込み）

        const existing = (state.currentSeason.tradeNegotiations ?? []).find(n => n.targetTeamId === targetTeamId)
        const round = (existing?.round ?? 0) + 1

        // 獲得選手の同意（相手クラブが大きく得をする取引＝1.2倍以上なら本人の説得材料になる）
        const stgs = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
        const myRank = stgs.findIndex(s => s.teamId === state.playerTeamId) + 1
        const consentBonus = cpuLoss > 0 && cpuGain / cpuLoss >= 1.2 ? 0.15 : 0
        let hardNo = ''
        for (const id of getIds) {
          const rp = state.players.find(p => p.id === id); if (!rp) continue
          if (!playerConsentToMove(rp, myRank, state.teams.length, 0.5, 0, consentBonus).ok) { hardNo = `${rp.name}はこの移籍を望んでいない。`; break }
        }

        let status: TradeNegotiation['status'] = 'countered'
        let message = ''
        let demandAddIds: string[] = []
        const demandAddPickKeys: string[] = []
        const getNames = getIds.map(id => state.players.find(p => p.id === id)?.name).filter(Boolean).join('・') || 'その選手'

        if (getIds.length === 0 && getPickKeys.length === 0) { status = 'rejected'; message = `（${theirName}）何も要求されていない。` }
        else if (hardNo) { status = 'rejected'; message = `（${theirName}）${hardNo}` }
        else if (cpuGain >= cpuLoss * 0.95) { status = 'accepted'; message = `（${theirName}）いいだろう、その条件で成立だ。` }
        else if (cpuGain < cpuLoss * 0.55 || round >= 3) { status = 'rejected'; message = `（${theirName}）話にならない。この条件では無理だ。` }
        else {
          const need = cpuLoss * 0.98 - cpuGain
          const cands = state.players.filter(p => p.teamId === state.playerTeamId && p.status === 'active' && !giveIds.includes(p.id) && !p.loan).sort((a, b) => pval(a) - pval(b))
          const fit = cands.find(p => pval(p) >= need) ?? cands[cands.length - 1]
          // 成立判定(tradePlayer側の0.92)を下回る条件でカウンターを出すと「飲んだのに無反応」になるため閾値を揃える
          if (fit && cpuGain + pval(fit) >= cpuLoss * 0.92) {
            demandAddIds = [fit.id]
            message = `（${theirName}）${getNames}が欲しいなら、${fit.name}も付けてくれ。それで手を打とう。`
          } else {
            status = 'rejected'; message = `（${theirName}）こちらの${getNames}に見合わない。この条件では無理だ。`
          }
        }

        if (status === 'accepted') {
          get().tradePlayer(giveIds, getIds, targetTeamId, 0, givePickKeys, getPickKeys)
          set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: (s.currentSeason.tradeNegotiations ?? []).filter(n => n.targetTeamId !== targetTeamId) } }))
          return
        }
        const neg: TradeNegotiation = { id: existing?.id ?? `trn_${Date.now()}`, targetTeamId, giveIds, givePickKeys, getIds, getPickKeys, round, status, message, demandAddIds: demandAddIds.length ? demandAddIds : undefined, demandAddPickKeys: demandAddPickKeys.length ? demandAddPickKeys : undefined }
        set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: [neg, ...(s.currentSeason.tradeNegotiations ?? []).filter(n => n.targetTeamId !== targetTeamId)] } }))
      },

      acceptTradeCounter: (negId) => {
        const neg = (get().currentSeason.tradeNegotiations ?? []).find(n => n.id === negId)
        if (!neg || neg.status !== 'countered') return false
        const ok = get().tradePlayer([...neg.giveIds, ...(neg.demandAddIds ?? [])], neg.getIds, neg.targetTeamId, 0, [...neg.givePickKeys, ...(neg.demandAddPickKeys ?? [])], neg.getPickKeys)
        if (ok) set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: (s.currentSeason.tradeNegotiations ?? []).filter(n => n.id !== negId) } }))
        return ok
      },

      dismissTradeNegotiation: (negId) => set(s => ({ currentSeason: { ...s.currentSeason, tradeNegotiations: (s.currentSeason.tradeNegotiations ?? []).filter(n => n.id !== negId) } })),

      // チャット履歴を playerId 単位で保存（currentSeason 内なのでシーズンまたぎで自動リセット）
      setChatLog: (playerId, messages) => set(s => ({ currentSeason: { ...s.currentSeason, chatLogs: { ...(s.currentSeason.chatLogs ?? {}), [playerId]: messages } } })),

      runSecondTeamRace: (lineup, strategy = 'balanced') => {
        const state = get()
        const { currentSeason, teams, players, playerTeamId } = state
        if (currentSeason.reserveLeagueJoined === false) return
        const stRaceIndex = currentSeason.secondTeamRaceIndex ?? 0
        const stRaces = currentSeason.secondTeamRaces ?? []
        if (stRaceIndex >= stRaces.length) return

        const race = stRaces[stRaceIndex]
        const seasonProgress = stRaceIndex / stRaces.length
        // EXP付与用の合宿ボーナス倍率（1軍レースと同じ）
        const campLv = teams.find(t => t.id === playerTeamId)?.facilities?.trainingCamp ?? 0
        const campExpMult = 1 + campLv * 0.06

        // リザーブ出場＝「その週の1軍リーグに出ていない選手」。2軍という区分は廃止されたので、
        // リザーブ戦の直前に行われた1軍リーグ戦（同週）の出場者を除外し、残りロスターの上位から起用する。
        const lastMainRace = (currentSeason.races ?? [])
          .filter(r => r.results && r.date <= race.date)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        const mainRunnerIds = new Set<string>()
        if (lastMainRace?.results) {
          for (const seg of lastMainRace.results.segmentResults) {
            for (const rr of seg.runners) mainRunnerIds.add(rr.playerId)
          }
        }
        // 1軍の主力（OVR78以上、または3戦以降で1軍出場率55%以上）はリザーブに出せない（格上の無双を防ぐ）。
        const mainRacesConsumed = currentSeason.currentRaceIndex
        const isMainRegular = (p: Player) =>
          isDataKeyPlayer(p, mainRacesConsumed > 0 ? seasonAppearances(p.id, currentSeason.races) / mainRacesConsumed : 0, mainRacesConsumed)
        const lineups: Record<string, Record<number, string>> = { [playerTeamId]: lineup }
        for (const team of teams) {
          if (team.id === playerTeamId) continue
          const pool = [...team.roster.main, ...team.roster.second]
            .map(id => players.find(p => p.id === id))
            .filter((p): p is Player => !!p && p.status === 'active' && !mainRunnerIds.has(p.id) && !isMainRegular(p))
            .sort((a, b) => ovr(b) - ovr(a))   // 1軍戦の出場者・主力は除外済み。残り＝控えの中から上位を起用。
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
          // 結果画面の経験値タブ用に、獲得EXPを記録する（1軍レースと同じ表示を出す）
          const stExpGains: Record<string, Partial<Record<CardStatKey, number>>> = {}
          const updatedPlayers = state.players.map(p => {
            if (!racingIds.has(p.id)) {
              // リザーブ戦に出場しない自チーム選手は、その週で疲労が回復する（1軍主力を温存できる）
              if (p.teamId === playerTeamId) {
                if (p.status === 'injured') {
                  const nf = Math.max(0, p.fatigue - 18)
                  return { ...p, fatigue: nf, status: nf < 40 ? 'active' as const : p.status }
                }
                if (p.status === 'active') {
                  return { ...p, fatigue: Math.max(0, p.fatigue - 5) }
                }
              }
              return p
            }
            const baseFatigue = Math.round(4 * stratMult)
            const newFatigue = Math.min(100, p.fatigue + baseFatigue)
            // 出場者に走った区間の地形EXPを付与（1軍レースと同じ仕組み。若手の直接+1は廃止しEXPに一本化）
            if (p.status === 'active') {
              const playerSeg = results.segmentResults.find(sr => sr.runners.some(r => r.playerId === p.id))
              const seg = playerSeg ? race.segments.find(s => s.index === playerSeg.segmentIndex) : null
              const ageMult = ageMultiplier(p)
              if (seg && ageMult > 0) {
                const sType = segmentType(seg.uphillPct, seg.downhillPct, seg.distanceKm)
                const baseGains = segTypeExpGain(sType)
                const statCaps = getStatPotentials(p)
                const potMult = potMultiplier(p.potential)
                const result = processExpGains({ ...p.ratings }, { ...(p.exp ?? {}) }, baseGains, potMult * campExpMult, ageMult, statCaps)
                const gained: Partial<Record<CardStatKey, number>> = {}
                ;(Object.keys(baseGains) as CardStatKey[]).forEach(k => {
                  // レース前に既に上限だった能力はEXPが入らない（表示も0）
                  const capped = ((p.ratings as Record<string, number>)[k] ?? 0) >= Math.min(99, (statCaps as Record<string, number>)[k] ?? 99)
                  const v = capped ? 0 : Math.round((baseGains[k] ?? 0) * potMult * campExpMult * ageMult)
                  if (v > 0) gained[k] = v
                })
                stExpGains[p.id] = gained
                return { ...p, fatigue: newFatigue, ratings: result.ratings, exp: result.exp }
              }
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
            raceExpGains: stExpGains,
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
        // リザーブ戦の完了でも入札・レンタル要請の応答を進める（本編以外でも返答が来るように）
        try { get().advanceMarketOneRace() } catch (e) { console.error('advanceMarketOneRace failed', e) }
      },

      setReserveLeagueJoined: (joined: boolean) => set(state => ({
        currentSeason: { ...state.currentSeason, reserveLeagueJoined: joined }
      })),

      // 海外リーグを1マッチデー進める。本編レースの完走に同期して runRace 末尾から呼ばれる。
      // 本編と同じコース（races[foreignRaceIndex]）を各海外クラブが走り、順位表と選手の記録を積む。
      advanceForeignLeagues: () => set(state => {
        const leagues = state.foreignLeagues ?? []
        if (leagues.length === 0) return {}
        const races = state.currentSeason.races
        const idx = state.currentSeason.foreignRaceIndex ?? 0
        if (idx >= races.length) return {}
        const race = races[idx]
        if (!race) return {}
        const prevStandings = state.currentSeason.foreignStandings ?? initForeignStandings(leagues)
        const seasonProgress = races.length > 0 ? idx / races.length : 0
        const { standingsByLeague, players, appearances } = simulateForeignLeagueRound(race, leagues, state.players, prevStandings, seasonProgress)
        // 今季の海外出場記録に加算（選手詳細の在籍履歴に海外クラブ行として表示するため）
        const foreignAppearances = { ...(state.currentSeason.foreignAppearances ?? {}) }
        for (const [id, add] of Object.entries(appearances)) {
          const cur = foreignAppearances[id] ?? { clubId: add.clubId, races: 0, wins: 0 }
          foreignAppearances[id] = {
            clubId: add.clubId || cur.clubId, races: cur.races + add.races, wins: cur.wins + add.wins,
            // 平均区間順位用。導入前から積まれたレース分は rankedRaces に入れない（平均が狂わないように）
            rankSum: (cur.rankSum ?? 0) + add.rankSum, rankedRaces: (cur.rankedRaces ?? 0) + add.rankedRaces,
          }
        }
        return {
          players,
          currentSeason: { ...state.currentSeason, foreignStandings: standingsByLeague, foreignRaceIndex: idx + 1, foreignAppearances },
        }
      }),

      // 移籍ウィンドウ中、レース毎に低確率で日本↔海外のクロスボーダー移籍を少数だけ発生させる（リーグが年中生きてる感じ）。
      // オフシーズンの一括処理と同じ財務＋補強ポイント連動ロジックを、件数を絞って呼ぶ。
      runMidSeasonForeignTransfers: () => {
        const st = get()
        if (!st.getTransferWindow().open) return
        if ((st.foreignLeagues ?? []).length === 0) return
        // 海外クラブ同士の引き抜きも低確率で1件（オフの一括と同じロジック。OVR下限もそのまま効く）
        if (Math.random() < 0.20) {
          set(state => {
            const raceDate = state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`
            const res = simulateForeignTransferMarket({
              foreignLeagues: state.foreignLeagues ?? [],
              players: state.players,
              year: state.currentSeason.year,
              maxMoves: 1,
              includeDecline: false,
              date: raceDate,
            })
            if (res.records.length === 0) return {}
            return {
              players: res.players,
              foreignLeagues: res.foreignLeagues,
              transferHistory: [...(state.transferHistory ?? []), ...res.records].slice(-800),
              currentSeason: { ...state.currentSeason, newsFeed: [...res.news, ...state.currentSeason.newsFeed].slice(0, 40) },
            }
          })
        }
        if (Math.random() > 0.30) return   // 発生率 約30%/レース
        const nIn = Math.random() < 0.55 ? 1 : 0
        const nOut = Math.random() < 0.55 ? 1 : 0
        if (nIn === 0 && nOut === 0) return
        set(state => {
          const res = simulateCrossBorderTransfers({
            teams: state.teams,
            foreignLeagues: state.foreignLeagues ?? [],
            players: state.players,
            playerTeamId: state.playerTeamId,
            year: state.currentSeason.year,
            maxIn: nIn,
            maxOut: nOut,
          })
          if (res.news.length === 0) return {}
          return {
            teams: res.teams,
            players: res.players,
            foreignLeagues: res.foreignLeagues,
            // シーズン中の日本↔海外移籍も履歴に記録（移籍ページで日付・移籍金が出るように）
            transferHistory: [...(state.transferHistory ?? []), ...res.records].slice(-800),
            currentSeason: { ...state.currentSeason, newsFeed: [...res.news, ...state.currentSeason.newsFeed].slice(0, 40) },
          }
        })
      },

      // 本編以外(リザーブ戦/記録会)のレース完了時にも、出した入札(移籍金オファー)とレンタル要請の応答を進める。
      // 本編レースは runRace 内で処理するので、こちらはリザーブ/記録会から呼ぶ。
      advanceMarketOneRace: () => set(state => {
        const cs = state.currentSeason
        const raceIdx = cs.currentRaceIndex ?? 0
        const races = cs.races ?? []
        const playerTeamId = state.playerTeamId
        const expiredNegs: { id: string; playerId: string; playerName: string }[] = []
        const lockedIds: string[] = []

        // 入札(移籍金オファー)の応答
        const bids = (cs.transferBids ?? []).map(bid => {
          if (bid.status === 'fee_accepted' || bid.status === 'countered') {
            const pl = state.players.find(p => p.id === bid.playerId)
            if (!pl || pl.teamId !== bid.targetTeamId) return { ...bid, status: 'failed' as const }
            return bid
          }
          if (bid.status !== 'pending') return bid
          const player = state.players.find(p => p.id === bid.playerId)
          if (!player || player.teamId !== bid.targetTeamId) return { ...bid, status: 'failed' as const }
          const apps = seasonAppearances(player.id, races)
          const frac = raceIdx > 0 ? apps / raceIdx : (player.rosterTier === 'main' ? 0.5 : 0)
          if (isEssentiallyUnpoachable(player, frac, raceIdx)) {
            expiredNegs.push({ id: bid.id, playerId: player.id, playerName: player.name })
            lockedIds.push(player.id)
            return { ...bid, status: 'rejected' as const }
          }
          const val = calcTransferValue(player)
          const isListed = (cs.transferListings ?? []).some(l => l.playerId === bid.playerId)
          const isExpiring = player.contract.yearsLeft <= 1
          const threshold = transferBidBase(val, isListed, isExpiring) * (0.9 + Math.random() * 0.2)
          if (bid.offeredFee >= threshold) return { ...bid, status: 'fee_accepted' as const, feeAcceptedAtRace: raceIdx }
          if (bid.offeredFee >= threshold * 0.68 && bid.round < 3) return { ...bid, status: 'countered' as const, counterFee: Math.round(threshold / 1000000) * 1000000 }
          return { ...bid, status: 'rejected' as const }
        })

        // レンタル要請の応答
        const pendingLoanReqs = cs.loanRequests ?? []
        const newLoanResponses: LoanResponse[] = []
        const acceptedLoans: { playerId: string; ownerId: string; years: number }[] = []
        if (pendingLoanReqs.length > 0) {
          let freeSlots = Math.max(0, 3 - state.players.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId).length)
          for (const req of pendingLoanReqs) {
            const pl = state.players.find(p => p.id === req.playerId)
            if (!pl || pl.teamId !== req.targetTeamId || pl.loan) continue
            const apps = seasonAppearances(pl.id, races)
            const frac = raceIdx > 0 ? apps / raceIdx : (pl.rosterTier === 'main' ? 0.5 : 0)
            const loanable = !isDataKeyPlayer(pl, frac, raceIdx)
            const ownerShort = state.teams.find(t => t.id === pl.teamId)?.shortName
              ?? (state.foreignLeagues ?? []).flatMap(l => l.clubs).find(c => c.id === pl.teamId)?.shortName
              ?? '相手クラブ'
            if (loanable && freeSlots > 0) {
              acceptedLoans.push({ playerId: pl.id, ownerId: pl.teamId, years: req.years }); freeSlots--
              newLoanResponses.push({ id: `lresp_${pl.id}_${raceIdx}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: true, years: req.years })
            } else {
              newLoanResponses.push({ id: `lresp_${pl.id}_${raceIdx}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: false, years: req.years })
            }
          }
        }

        // 変化が無ければ何もしない
        const bidsChanged = bids.some((b, i) => b !== (cs.transferBids ?? [])[i])
        if (!bidsChanged && newLoanResponses.length === 0 && expiredNegs.length === 0) return {}

        const acceptedMap = new Map(acceptedLoans.map(a => [a.playerId, a]))
        const players = state.players.map(p => {
          let np = p
          if (lockedIds.includes(p.id)) np = { ...np, transferLockedUntilYear: cs.year + 1 }
          const a = acceptedMap.get(p.id)
          if (a) np = { ...np, teamId: playerTeamId, loan: { ownerTeamId: a.ownerId, untilYear: cs.year + a.years }, acquiredRaceIndex: raceIdx, joinedYear: cs.year }
          return np
        })
        const teams = acceptedLoans.length ? state.teams.map(t => {
          const lost = acceptedLoans.filter(a => a.ownerId === t.id).map(a => a.playerId)
          if (lost.length === 0) return t
          return { ...t, roster: { main: t.roster.main.filter(id => !lost.includes(id)), second: t.roster.second.filter(id => !lost.includes(id)) } }
        }) : state.teams

        return {
          players,
          teams,
          currentSeason: {
            ...cs,
            transferBids: bids,
            loanRequests: pendingLoanReqs.length > 0 ? [] : (cs.loanRequests ?? []),
            loanResponses: [...(cs.loanResponses ?? []), ...newLoanResponses],
            expiredNegotiations: [...(cs.expiredNegotiations ?? []), ...expiredNegs],
          },
        }
      }),

      // ECLの次の1戦を開催する。5戦目の消化で最終順位（累計ポイント）・賞金・パッチ・歴代記録を確定
      advanceEclRace: (playerLineup) => set(state => {
        const series = state.currentSeason.eclSeries
        if (!series || series.raceIndex >= series.races.length) return {}
        const race = series.races[series.raceIndex]
        const year = state.currentSeason.year

        // ロスターは開催時点の在籍で解決（シーズン中の移籍・負傷を反映）
        const participants: EclParticipant[] = series.participants.map(pt => ({
          ...pt,
          playerIds: pt.isForeign
            ? ((state.foreignLeagues ?? []).flatMap(l => l.clubs).find(c => c.id === pt.id)?.playerIds ?? [])
            : state.players.filter(p => p.teamId === pt.id && p.status === 'active').map(p => p.id),
        })).filter(pt => pt.playerIds.length >= race.segments.length)
        if (participants.length < 2) {
          // 開催不能（消滅チーム等）でも戦は消化して先へ進める
          return { currentSeason: { ...state.currentSeason, eclSeries: { ...series, raceIndex: series.raceIndex + 1 } } }
        }

        const iAmIn = participants.some(p => p.isPlayerTeam)
        const result = simulateEclEvent({
          year, participants, races: [race], teams: state.teams, players: state.players,
          playerLineup: iAmIn && playerLineup ? { teamId: state.playerTeamId, lineup: playerLineup } : undefined,
        })

        // ポイント累積（順位点＋区間点）
        const newPoints = { ...series.points }
        for (const tr of result.raceResults?.teamRankings ?? []) {
          newPoints[tr.teamId] = (newPoints[tr.teamId] ?? 0) + tr.positionPoints + tr.segmentPoints
        }
        const newRaces = series.races.map((r, i) => i === series.raceIndex ? { ...r, results: result.raceResults } : r)
        const nextIndex = series.raceIndex + 1
        const isFinal = nextIndex >= series.races.length

        // 出走で通算出走数、区間1位で通算区間賞（選手詳細に反映）
        const ranIds = new Set((result.raceResults?.segmentResults ?? []).flatMap(sr => sr.runners.map(r => r.playerId)))
        const segWinIds = new Set((result.raceResults?.segmentResults ?? []).map(sr => [...sr.runners].sort((a, b) => a.timeSec - b.timeSec)[0]?.playerId).filter(Boolean))
        let updatedPlayers = ranIds.size > 0
          ? state.players.map(p => ranIds.has(p.id)
            ? { ...p, career: { ...p.career, totalRaces: p.career.totalRaces + 1, segmentWins: p.career.segmentWins + (segWinIds.has(p.id) ? 1 : 0) } }
            : p)
          : state.players

        // この戦のニュース
        const raceWinner = result.standings[0]
        const myRaceRank = result.standings.findIndex(s => s.isPlayerTeam) + 1
        const newsItems: typeof state.currentSeason.newsFeed = [{
          date: race.date,
          headline: `${race.name}（${race.location}）：${raceWinner?.name ?? ''}が制す${myRaceRank > 0 ? `。自チームは${myRaceRank}位` : ''}`,
          category: 'race' as const,
          relatedIds: [race.id],
        }]

        // 区間記録の更新（JPELの駅伝と同じ仕組み。コースは固定10種なので年をまたいで記録が競われ、保持者には区間記録パッチが付く）
        const updatedSegmentRecords = { ...(state.segmentRecords ?? {}) }
        const newSegRecordMarksEcl: { segmentIndex: number; playerId: string }[] = []
        const shortById = new Map(participants.map(pt => [pt.id, pt.shortName]))
        for (const sr of result.raceResults?.segmentResults ?? []) {
          const key = `${race.name}-${sr.segmentIndex}`
          const existing = updatedSegmentRecords[key] ?? []
          const prevBest = existing[0]?.timeSec ?? null
          const newEntries = sr.runners.map(r => {
            const pl = state.players.find(x => x.id === r.playerId)
            return { playerName: pl?.name ?? '不明', teamShort: shortById.get(r.teamId) ?? '?', playerId: r.playerId, teamId: r.teamId, timeSec: r.timeSec, year }
          })
          const fastestNew = newEntries.length > 0
            ? newEntries.reduce((min, e) => e.timeSec < min.timeSec ? e : min, newEntries[0])
            : null
          // 区間新記録が出たらニュースにする（過去記録がある区間で更新された場合のみ）
          if (prevBest != null && fastestNew && fastestNew.timeSec < prevBest) {
            const isMine = fastestNew.teamId === state.playerTeamId
            newsItems.push({
              date: race.date,
              headline: `【区間新記録】${race.name} 第${sr.segmentIndex}区 ${fastestNew.playerName}（${fastestNew.teamShort}）${fmtTime(fastestNew.timeSec)}（従来 ${fmtTime(prevBest)}）${isMine ? ' ★自チーム' : ''}`,
              category: 'race' as const,
              relatedIds: fastestNew.playerId ? [fastestNew.playerId] : [],
            })
            if (fastestNew.playerId) newSegRecordMarksEcl.push({ segmentIndex: sr.segmentIndex, playerId: fastestNew.playerId })
          }
          // 同一選手は最速の1本だけ残す（同じ選手が何行も並ばないように）
          const bestByPlayer = new Map<string, (typeof existing)[0]>()
          for (const e of [...existing, ...newEntries]) {
            const pkey = e.playerId ?? e.playerName
            const cur = bestByPlayer.get(pkey)
            if (!cur || e.timeSec < cur.timeSec) bestByPlayer.set(pkey, e)
          }
          updatedSegmentRecords[key] = [...bestByPlayer.values()]
            .sort((a, b) => a.timeSec - b.timeSec)
            .slice(0, 10)
        }

        let updatedTeams = state.teams
        let newAch: NonNullable<GameState['achievements']> = []
        let historyEntry: NonNullable<GameState['eclHistory']> = []
        let eclResult = state.currentSeason.eclResult

        if (isFinal) {
          // 最終順位＝累計ポイント降順
          const finalStandings: EclStanding[] = series.participants
            .map(pt => ({ ...pt, points: newPoints[pt.id] ?? 0 }))
            .sort((a, b) => b.points - a.points)
          const champion = finalStandings[0]
          const myRank = finalStandings.findIndex(s => s.isPlayerTeam) + 1
          const prize = myRank === 1 ? 200_000_000 : myRank === 2 ? 100_000_000 : myRank > 0 ? 50_000_000 : 0
          if (prize > 0) {
            updatedTeams = state.teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + prize } } : t)
          }
          const won = champion?.id === state.playerTeamId
          if (won) newAch = [{ id: `ecl-champion-${year}`, name: 'ECL制覇', desc: `${year}年 ECLで優勝`, earnedAtYear: year, rarity: 'legendary' as const }]

          // 優勝チームの出走メンバー（全5戦の延べ）と大会MVP（全戦の区間で最も突出した走り）
          const winnerPlayerIds = champion
            ? [...new Set(newRaces.flatMap(r => (r.results?.segmentResults ?? []).flatMap(sr => sr.runners.filter(x => x.teamId === champion.id).map(x => x.playerId))))]
            : []
          let mvpPlayerId: string | undefined
          let bestGap = -1
          for (const r of newRaces) {
            for (const sr of r.results?.segmentResults ?? []) {
              const sorted = [...sr.runners].sort((a, b) => a.timeSec - b.timeSec)
              const top = sorted[0]
              if (!top) continue
              const gap = (sorted[1]?.timeSec ?? top.timeSec) - top.timeSec
              if (gap > bestGap) { bestGap = gap; mvpPlayerId = top.playerId }
            }
          }

          eclResult = {
            year,
            championId: champion?.id ?? '',
            standings: finalStandings,
            races: newRaces.map(r => ({ name: r.name, raceId: r.id })),
            winnerPlayerIds,
            mvpPlayerId,
            playerRank: myRank > 0 ? myRank : undefined,
            prize,
          }
          historyEntry = champion ? [{
            year,
            championId: champion.id,
            championName: champion.name,
            courseName: `5戦シリーズ（${newPoints[champion.id] ?? 0}pt）`,
            timeSec: 0,
            winnerPlayerIds,
            mvpPlayerId,
          }] : []
          newsItems.push({
            date: race.date,
            headline: won
              ? `【世界一】ECL最終戦を終え、自チームが年間王者に！世界の頂点に立つ`
              : `ECL：全5戦を終え${champion?.name ?? ''}が年間王者に${myRank > 0 ? `。自チームは総合${myRank}位` : ''}`,
            category: 'race' as const,
            relatedIds: [race.id],
          })
        }

        return {
          teams: updatedTeams,
          players: updatedPlayers,
          segmentRecords: updatedSegmentRecords,
          // このレースで出た区間新に張り替える（前のリーグ戦のバッジ記録が残って誤表示されるのを防ぐ）
          raceNewSegmentRecords: newSegRecordMarksEcl,
          achievements: [...(state.achievements ?? []), ...newAch],
          eclHistory: [...(state.eclHistory ?? []), ...historyEntry],
          currentSeason: {
            ...state.currentSeason,
            eclSeries: { ...series, races: newRaces, raceIndex: nextIndex, points: newPoints },
            eclResult,
            newsFeed: [...newsItems, ...state.currentSeason.newsFeed].slice(0, 30),
          },
        }
      }),

      startRegularSeason: () => set(state => {
        // プレシーズンのドラフト（今季スカウトした代）が終わったので、
        // 今季スカウトする「翌年の代」を新規生成する。前回ドラフト済みの代の残りを置き換える。
        // これで endSeason 側で引き継いだ視察済みプールがドラフトに使われ、シーズン中の視察は常に新しい代になる。
        const freshScoutPool = generateDraftPool(state.currentSeason.year + 1)
        if ((state.currentSeason.objectives ?? []).length === 0) {
          const firstObjectives = selectSeasonObjectives(!!state.rivalTeamId, state.teams.length)
          return { currentSeason: { ...state.currentSeason, phase: 'regular', objectives: firstObjectives, scoutProspects: freshScoutPool } }
        }
        return { currentSeason: { ...state.currentSeason, phase: 'regular', scoutProspects: freshScoutPool } }
      }),

      initObjectivesIfEmpty: () => set(state => {
        const objs = state.currentSeason.objectives
        if (objs.length === 0) {
          return { currentSeason: { ...state.currentSeason, objectives: selectSeasonObjectives(!!state.rivalTeamId, state.teams.length) } }
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
        // 二度押し/再入ガード：ドラフト進行中に再度呼ばれてもプール選手をID二重登録しない。
        if (state.draftState && !state.draftState.isComplete) return
        // スカウト画面で見せた候補（scoutProspects）をそのままドラフトプールにする。
        // 空のとき（旧セーブ等）だけ従来通り新規生成にフォールバック。
        const scouted = state.currentSeason.scoutProspects ?? []
        const pool = scouted.length > 0 ? scouted : generateDraftPool(state.currentSeason.year)
        const yr = state.currentSeason.year

        // ドラフト順は「当年分の指名権の所有」で決める：指名スロットの並びは各指名権の
        // 【元保有チームの抽選順】で決まり、現在の保有チームがそこで指名する。
        // 2年目以降は前年下位5チームの加重抽選で1巡目の順を決定。2巡目はスネーク（逆順＝1位から）。
        const lotteryPos = draftLotteryOrder(state.teams) // teamId → 全体指名順位(1=全体1位)
        const teamCount = state.teams.length
        const ownedYearPicks = state.teams
          .flatMap(t => (t.draftPicks ?? []).filter(pk => pk.year === yr).map(pk => {
            const basePos = lotteryPos.get(pk.originallyOwnedBy ?? t.id) ?? pk.pickNumber
            // 2巡目はスネーク：1巡目の逆順にする（最後に指名したチームが2巡目の先頭）
            const orderKey = pk.round === 2 ? teamCount + 1 - basePos : basePos
            return { round: pk.round, orderKey, ownerId: t.id }
          }))
          .sort((a, b) => a.round - b.round || a.orderKey - b.orderKey)
        const pickOrder = ownedYearPicks.length >= state.teams.length
          ? ownedYearPicks.map(pk => pk.ownerId)
          : buildDraftOrder(state.teams, state.currentSeason.year, state.playerTeamId)

        // Ensure all teams have future draft picks (backfill for existing saves)
        // 消化した当年分の指名権はここで名簿から外す（順は上のpickOrderに確定済み）
        // 指名権番号は前年順位の逆順（最下位＝全体1位）。既存の将来指名権も"元保有チームの順位"で振り直し、
        // 初回に配列順で焼き込まれた古い番号を都度上書きして正す（表示と実際の指名順を一致させる）。
        const pickNumMap = standingsPickNumbers(state.teams)
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
        const rosterCapFor = (teamId: string) => 30 - (draftPickCounts.get(teamId) ?? 0)

        // CPU teams release declining/surplus players
        // 対象は国内リーグのCPUチームのみ（選手のteamIdから拾うと海外クラブまで混ざり、
        // ロスター概念の無い海外側との取引で国内名簿が壊れる）
        const domesticTeamIdSet = new Set(state.teams.map(t => t.id))
        const cpuReleasedIds = new Set<string>()
        const playersAfterCpuRelease = (() => {
          const releaseSet = new Set<string>()
          const cpuTeamIds = [...new Set(
            state.players
              .filter(p => p.teamId !== state.playerTeamId && p.teamId !== '' && p.teamId !== '__pool__' && domesticTeamIdSet.has(p.teamId))
              .map(p => p.teamId)
          )]
          for (const teamId of cpuTeamIds) {
            const roster = state.players.filter(x => x.teamId === teamId && x.rosterTier === 'main' && x.status === 'active')
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
            const totalRoster = state.players.filter(x => x.teamId === teamId && x.status === 'active' && !releaseSet.has(x.id))
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
          const myRoster = state.players.filter(x => x.teamId === state.playerTeamId && x.status === 'active' && !releaseSet.has(x.id))
          if (myRoster.length > myCap) {
            [...myRoster].sort((a, b) => ovr(a) - ovr(b)).slice(0, myRoster.length - myCap).forEach(p => releaseSet.add(p.id))
          }
          releaseSet.forEach(id => cpuReleasedIds.add(id))
          return state.players.map(p => releaseSet.has(p.id) ? { ...p, teamId: '', } : p)
        })()
        const teamsAfterCpuRelease = teamsWithPicks.map(t => ({
          ...t,
          roster: {
            ...t.roster,
            main: t.roster.main.filter(id => !cpuReleasedIds.has(id)),
            second: t.roster.second.filter(id => !cpuReleasedIds.has(id)),
          },
        }))

        // CPU間移籍（メイン市場）：予算の多いチームから優先で他チームの余剰選手を引き抜く
        // オフシーズンの移籍成立記録（チーム詳細の移籍ページ用）。年は新シーズン（現 currentSeason.year）
        const offseasonTxRecords: TransferRecord[] = []
        const cpuTransferIds = new Set<string>()
        let playersAfterCpuTransfer = playersAfterCpuRelease
        let teamsAfterCpuTransfer = teamsAfterCpuRelease
        {
          // 実際の予算残高（finance.budget）から移籍金を払う。売った側は実際に受け取る（自チームと同じ金の動き）
          const cpuTeamsForTransfer = teamsAfterCpuRelease
            .filter(t => t.id !== state.playerTeamId)
            .map(t => ({ team: t, tier: cpuTeamTier(t.id, playersAfterCpuRelease), budget: Math.max(0, t.finance.budget) }))
            .sort((a, b) => b.budget - a.budget)

          const transferPurchases: Record<string, number> = {}

          for (const { team: buyTeam, tier: buyTier } of cpuTeamsForTransfer) {
            const minOvr = buyTier === 'elite' ? 74 : buyTier === 'mid' ? 67 : 60
            // 売却で残高が増えている可能性があるので現時点の残高を読む
            let remainBudget = Math.max(0, teamsAfterCpuTransfer.find(t => t.id === buyTeam.id)?.finance.budget ?? 0)
            const buyRoster = playersAfterCpuTransfer.filter(p => p.teamId === buyTeam.id && p.rosterTier === 'main' && p.status === 'active')
            const buyTotal = playersAfterCpuTransfer.filter(p => p.teamId === buyTeam.id && p.status === 'active').length
            if (buyRoster.length >= 23 || buyTotal >= rosterCapFor(buyTeam.id)) continue
            if ((transferPurchases[buyTeam.id] ?? 0) >= 2) continue

            const otherCpuIds = cpuTeamsForTransfer.map(x => x.team.id).filter(id => id !== buyTeam.id)
            const candidates = otherCpuIds.flatMap(sellTeamId => {
              const sellRoster = playersAfterCpuTransfer
                .filter(p => p.teamId === sellTeamId && p.rosterTier === 'main' && p.status === 'active')
                .sort((a, b) => ovr(b) - ovr(a))
              const sellTier = cpuTeamTier(sellTeamId, playersAfterCpuTransfer)
              const sellMinOvr = sellTier === 'elite' ? 74 : sellTier === 'mid' ? 67 : 58
              return sellRoster.slice(3).filter(p =>
                !cpuTransferIds.has(p.id) &&
                p.joinedYear !== state.currentSeason.year &&   // クロスボーダー等で今オフ移籍済みなら動かさない
                (ovr(p) < sellMinOvr || sellRoster.length > 21)
              )
            }).sort((a, b) => ovr(b) - ovr(a))

            for (const target of candidates) {
              if (ovr(target) < minOvr) continue
              const fee = calcTransferValue(target)
              const newSalary = faMarketSalary(target)
              if (remainBudget < fee + newSalary) continue
              cpuTransferIds.add(target.id)
              transferPurchases[buyTeam.id] = (transferPurchases[buyTeam.id] ?? 0) + 1
              remainBudget -= fee
              const txYear = state.currentSeason.year
              offseasonTxRecords.push({ year: txYear, date: `${txYear}-02-01`, playerId: target.id, fromTeamId: target.teamId, toTeamId: buyTeam.id, fee, years: 2 })
              playersAfterCpuTransfer = playersAfterCpuTransfer.map(p =>
                p.id !== target.id ? p : {
                  ...p, teamId: buyTeam.id, joinedYear: txYear,
                  contract: { ...p.contract, annualSalary: newSalary, yearsLeft: 2, faEligibleYear: txYear + 2 },
                }
              )
              // 移籍金を実際に動かす：買い手の残高から引き、売り手の残高に足す
              teamsAfterCpuTransfer = teamsAfterCpuTransfer.map(t => {
                if (t.id === target.teamId) return { ...t, finance: { ...t.finance, budget: t.finance.budget + fee }, roster: { ...t.roster, main: t.roster.main.filter(id => id !== target.id) } }
                if (t.id === buyTeam.id) return { ...t, finance: { ...t.finance, budget: t.finance.budget - fee }, roster: { ...t.roster, main: [...t.roster.main, target.id] } }
                return t
              })
              break
            }
          }
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
            const buyTier = cpuTeamTier(buyerId, playersAfterCpuTransfer)
            const buyMinOvr = buyTier === 'elite' ? 74 : buyTier === 'mid' ? 67 : 60
            const buyRoster = playersAfterCpuTransfer.filter(p => p.teamId === buyerId && p.rosterTier === 'main' && p.status === 'active')
            if (buyRoster.length >= 23) continue
            const buyerSurplus = buyRoster
              .filter(p => !tradedIds.has(p.id) && p.joinedYear !== state.currentSeason.year && ovr(p) < buyMinOvr)
              .sort((a, b) => calcTransferValue(b) - calcTransferValue(a))
            if (buyerSurplus.length === 0) continue
            const offered = buyerSurplus[0]
            const offeredVal = calcTransferValue(offered)
            for (const sellerId of cpuIdsForTrade) {
              if (sellerId === buyerId || (tradeCount[sellerId] ?? 0) >= 1) continue
              const sellTier = cpuTeamTier(sellerId, playersAfterCpuTransfer)
              const sellMinOvr = sellTier === 'elite' ? 74 : sellTier === 'mid' ? 67 : 58
              const sellRoster = playersAfterCpuTransfer
                .filter(p => p.teamId === sellerId && p.rosterTier === 'main' && p.status === 'active')
                .sort((a, b) => ovr(b) - ovr(a))
              const target = sellRoster.slice(3).find(p =>
                !tradedIds.has(p.id) &&
                p.joinedYear !== state.currentSeason.year &&
                ovr(p) >= buyMinOvr && ovr(p) < sellMinOvr &&
                calcTransferValue(p) <= offeredVal * 1.3
              )
              if (!target || ovr(offered) < sellMinOvr - 6) continue
              tradedIds.add(offered.id); tradedIds.add(target.id)
              tradeCount[buyerId] = (tradeCount[buyerId] ?? 0) + 1
              tradeCount[sellerId] = (tradeCount[sellerId] ?? 0) + 1
              offseasonTxRecords.push({ year: state.currentSeason.year, date: `${state.currentSeason.year}-02-01`, playerId: offered.id, fromTeamId: buyerId, toTeamId: sellerId, fee: 0, kind: 'trade' })
              offseasonTxRecords.push({ year: state.currentSeason.year, date: `${state.currentSeason.year}-02-01`, playerId: target.id, fromTeamId: sellerId, toTeamId: buyerId, fee: 0, kind: 'trade' })
              playersAfterCpuTransfer = playersAfterCpuTransfer.map(p => {
                if (p.id === offered.id) return { ...p, teamId: sellerId, joinedYear: state.currentSeason.year }
                if (p.id === target.id) return { ...p, teamId: buyerId, joinedYear: state.currentSeason.year }
                return p
              })
              teamsAfterCpuTransfer = teamsAfterCpuTransfer.map(t => {
                if (t.id === buyerId) return { ...t, roster: { ...t.roster, main: [...t.roster.main.filter(id => id !== offered.id), target.id] } }
                if (t.id === sellerId) return { ...t, roster: { ...t.roster, main: [...t.roster.main.filter(id => id !== target.id), offered.id] } }
                return t
              })
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
            playersAfterCpuTransfer.filter(p => p.teamId === teamId && p.rosterTier === 'main' && p.status === 'active' && !p.loan).length
          const givenLoan: Record<string, number> = {}
          const receivedLoan: Record<string, number> = {}
          for (const senderId of cpuIdsForLoan) {
            if (mainCount(senderId) <= 21 || (givenLoan[senderId] ?? 0) >= 1) continue
            const receiver = cpuIdsForLoan.find(id => id !== senderId && mainCount(id) < 17 && (receivedLoan[id] ?? 0) < 1)
            if (!receiver) continue
            const candidate = playersAfterCpuTransfer
              .filter(p => p.teamId === senderId && p.rosterTier === 'main' && p.status === 'active' && !p.loan && !loanedIds.has(p.id) && p.joinedYear !== state.currentSeason.year)
              .sort((a, b) => ovr(a) - ovr(b))[0]
            if (!candidate) continue
            loanedIds.add(candidate.id)
            givenLoan[senderId] = (givenLoan[senderId] ?? 0) + 1
            receivedLoan[receiver] = (receivedLoan[receiver] ?? 0) + 1
            playersAfterCpuTransfer = playersAfterCpuTransfer.map(p =>
              p.id !== candidate.id ? p : { ...p, teamId: receiver, joinedYear: state.currentSeason.year, loan: { ownerTeamId: senderId, untilYear: loanYear } }
            )
            teamsAfterCpuTransfer = teamsAfterCpuTransfer.map(t => {
              if (t.id === senderId) return { ...t, roster: { ...t.roster, main: t.roster.main.filter(id => id !== candidate.id) } }
              if (t.id === receiver) return { ...t, roster: { ...t.roster, main: [...t.roster.main, candidate.id] } }
              return t
            })
          }
        }

        // FA補強（受け皿）：移籍市場で動けなかった選手・チームの補完。
        // 高齢選手は実力どおりに評価しない（33歳以上は年齢ぶん減点した「年齢調整OVR」順で選ぶ＝35歳の高OVRに飛びつかない）
        const ageAdjOvr = (p: Player) => ovr(p) - Math.max(0, p.age - 32) * 3
        const availableFAs = playersAfterCpuTransfer
          .filter(p => p.teamId === '' && p.status === 'active')
          .sort((a, b) => ageAdjOvr(b) - ageAdjOvr(a))
        const signedFAIds = new Set<string>()
        const cpuSignings: { playerId: string; teamId: string; num: number }[] = []
        // Elite teams pick first（同格内は毎年シャッフル＝特定チームだけが毎年良いFAを総取りしないように）
        const tierJitter = new Map(teamsAfterCpuTransfer.map(t => [t.id, Math.random()]))
        const cpuTeamsSorted = teamsAfterCpuTransfer
          .filter(t => t.id !== state.playerTeamId)
          .sort((a, b) => {
            const order = { elite: 0, mid: 1, weak: 2 }
            const d = order[cpuTeamTier(a.id, playersAfterCpuTransfer)] - order[cpuTeamTier(b.id, playersAfterCpuTransfer)]
            return d !== 0 ? d : (tierJitter.get(a.id)! - tierJitter.get(b.id)!)
          })
        // 前年順位（運用方針・予算の基準）
        const lastStandings = [...(state.pastSeasons[state.pastSeasons.length - 1]?.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
        const totalTeams = state.teams.length
        const rankOf = (teamId: string) => { const i = lastStandings.findIndex(s => s.teamId === teamId); return i >= 0 ? i + 1 : Math.ceil(totalTeams / 2) }
        for (const team of cpuTeamsSorted) {
          // フラットロスター：1軍/2軍の区別なし。総在籍だけで管理する
          const currentRoster = playersAfterCpuTransfer.filter(p => p.teamId === team.id && p.status === 'active')
          const tier = cpuTeamTier(team.id, playersAfterCpuTransfer)
          const minOvr = tier === 'elite' ? 74 : tier === 'mid' ? 67 : 58
          const totalNow = currentRoster.length
          const slotsNeeded = Math.max(0, rosterCapFor(team.id) - totalNow)
          if (slotsNeeded <= 0) continue

          // 運用方針と予算
          const avgAge = currentRoster.length ? currentRoster.reduce((s, p) => s + p.age, 0) / currentRoster.length : 27
          const strat = cpuStrategy(rankOf(team.id), totalTeams, avgAge)
          const committedSalary = playersAfterCpuTransfer.filter(p => p.teamId === team.id).reduce((s, p) => s + p.contract.annualSalary, 0)
          const spendFactor = strat === 'contend' ? 1.0 : strat === 'rebuild' ? 0.4 : 0.7
          // 補強原資 ＝ 年俸原資の余り（グラント−既存年俸）＋ 実残高の一部。
          // 売却・賞金で貯めた残高が補強に反映され、貧乏チームは予算切れで少人数（下限24）に落ち着く
          const grantRoom = Math.max(0, rankBudgetGrant(rankOf(team.id)) - committedSalary)
          const budgetRoom = Math.max(0, team.finance.budget) * 0.3
          const spendable = team.finance.budget < 0 ? 0 : (grantRoom + budgetRoom) * spendFactor
          let spent = 0
          const estCost = (fa: Player) => faMarketSalary(fa)

          const needs = cpuSpecialtyNeeds(team.id, playersAfterCpuTransfer)
          const foreignOnTeam = playersAfterCpuTransfer.filter(p => p.teamId === team.id && p.nationality === 'FOREIGN').length
          const usedNums = new Set<number>()
          let foreignSigned = 0, signed = 0
          // 高齢FAとは契約しない：優勝狙いでも33歳まで、通常は32歳まで、エリートは若手志向、再建は27歳まで
          const ageCap = strat === 'contend' ? 34 : strat === 'rebuild' ? 28 : (tier === 'elite' ? 31 : 33)
          // 総在籍24人未満の間は予算に関係なく最低限補強（戦力崩壊防止）。それ以上は予算内でのみ
          const budgetOk = (fa: Player) => (totalNow + signed) < 24 || (spent + estCost(fa) <= spendable)
          const canSign = (fa: Player) =>
            !signedFAIds.has(fa.id) &&
            !(fa.nationality === 'FOREIGN' && foreignOnTeam + foreignSigned >= 3) &&
            fa.age < ageCap
          const doSign = (fa: Player) => {
            let num = 1; while (usedNums.has(num)) num++; usedNums.add(num)
            if (fa.nationality === 'FOREIGN') foreignSigned++
            signedFAIds.add(fa.id); cpuSignings.push({ playerId: fa.id, teamId: team.id, num }); signed++
            spent += estCost(fa)
          }
          // 若手再建はポテンシャル・若さ優先、それ以外はOVR優先（availableFAsは既にOVR降順）
          const pool = strat === 'rebuild'
            ? [...availableFAs].filter(p => p.age <= 27).sort((a, b) => (b.potential - a.potential) || (a.age - b.age))
            : availableFAs

          // Pass 1: fill specialty holes — up to 2 per specialty
          const specFloor = strat === 'rebuild' ? 50 : Math.max(50, minOvr - 10)
          const pass1Counts: Record<string, number> = {}
          for (const spec of needs) {
            if (signed >= slotsNeeded) break
            const currentCount = playersAfterCpuTransfer.filter(p => p.teamId === team.id && p.specialty === spec && p.rosterTier === 'main' && p.status === 'active').length
            const toFill = Math.max(0, 2 - currentCount - (pass1Counts[spec] ?? 0))
            let filled = 0
            for (const fa of pool) {
              if (filled >= toFill || signed >= slotsNeeded) break
              if (fa.specialty !== spec || !canSign(fa) || ovr(fa) < specFloor || !budgetOk(fa)) continue
              doSign(fa); filled++
              pass1Counts[spec] = (pass1Counts[spec] ?? 0) + 1
            }
          }
          // Pass 2: 方針に沿ってベスト補強（予算内）
          const pass2Floor = strat === 'rebuild' ? 50 : minOvr
          for (const fa of pool) {
            if (signed >= slotsNeeded) break
            if (!canSign(fa) || ovr(fa) < pass2Floor || !budgetOk(fa)) continue
            doSign(fa)
          }
          // Pass 3: 安全確保 — 予算/OVRに関係なく総在籍24人（下限）までは埋める。
          // それ以上の頭数合わせはしない（数合わせの弱いFAを抱えない。多く抱えるのは予算のあるチームだけ）
          const floorFill = 24
          for (const fa of availableFAs) {
            if (totalNow + signed >= floorFill) break
            if (!canSign(fa)) continue
            doSign(fa)
          }
        }
        const newYear = state.currentSeason.year
        const playersWithCpuSigns = playersAfterCpuTransfer.map(p => {
          const s = cpuSignings.find(x => x.playerId === p.id)
          if (!s) return p
          // 1軍名簿に入れるので rosterTier/contractType も1軍契約に揃える
          // （元2軍のままだとCPUのラインナップ・戦力評価から不可視になり出走枠が欠ける）
          return { ...p, teamId: s.teamId, rosterTier: 'main' as const, contract: { ...p.contract, yearsLeft: 2, annualSalary: faMarketSalary(p), faEligibleYear: newYear + 2, contractType: 'standard' as const } }
        })
        const teamsWithCpuSigns = teamsAfterCpuTransfer.map(t => ({
          ...t,
          roster: {
            ...t.roster,
            main: [...t.roster.main, ...cpuSignings.filter(s => s.teamId === t.id).map(s => s.playerId)],
          },
        }))

        // フラットロスター化に伴い「2軍を15人まで埋める」補充は廃止（数合わせのFA大量署名をやめる）。
        // 総在籍24人（下限）まではメインの補強パス(Pass3)が保証する
        const cpuSecondSignings: { playerId: string; teamId: string; num: number }[] = []
        const playersWithAllCpuSigns = playersWithCpuSigns.map(p => {
          const s2 = cpuSecondSignings.find(x => x.playerId === p.id)
          if (!s2) return p
          return { ...p, teamId: s2.teamId,  rosterTier: 'second' as const, contract: { ...p.contract, yearsLeft: 2, annualSalary: Math.round(ovr(p) * 90000 / 500000) * 500000, faEligibleYear: newYear + 2, contractType: 'development' as const } }
        })
        const teamsWithAllCpuSigns = teamsWithCpuSigns.map(t => ({
          ...t,
          roster: {
            ...t.roster,
            second: [...t.roster.second, ...cpuSecondSignings.filter(s => s.teamId === t.id).map(s => s.playerId)],
          },
        }))

        // ③ 海外クラブFA補強（外国籍FA中心に海外クラブが獲得）。海外クラブも総在籍30を超えないようにする。
        // ※クラブ名簿(playerIds)にも必ず同期追加する。teamIdだけ変えると名簿が実人数より少なく見え、
        //   シーズン中の日本→海外移籍の満杯チェックをすり抜けて31人になるバグの原因だった
        const foreignClubsList = (state.foreignLeagues ?? []).flatMap(l => l.clubs)
        let playersWithForeignSigns = playersWithAllCpuSigns
        const foreignFaAssign = new Map<string, string[]>()   // clubId → 追加する選手ID
        if (foreignClubsList.length > 0) {
          const clubCount = new Map<string, number>()
          for (const p of playersWithAllCpuSigns) {
            if (p.status === 'active' && foreignClubsList.some(c => c.id === p.teamId)) {
              clubCount.set(p.teamId, (clubCount.get(p.teamId) ?? 0) + 1)
            }
          }
          const remainForeignFAs = playersWithAllCpuSigns
            .filter(p => p.teamId === '' && p.status === 'active' && p.nationality === 'FOREIGN')
            .sort((a, b) => ovr(b) - ovr(a))
          let clubIdx = 0
          for (const fa of remainForeignFAs) {
            // FA補強は「下限(20人)を割っているクラブの救済」だけ。上限まで埋める強制はしない
            // （全クラブが常時30人満杯になると空き枠が無くなり、海外間の移籍市場が窒息する）
            let club: typeof foreignClubsList[0] | null = null
            for (let tries = 0; tries < foreignClubsList.length; tries++) {
              const cand = foreignClubsList[clubIdx % foreignClubsList.length]
              clubIdx++
              if ((clubCount.get(cand.id) ?? 0) < 20) { club = cand; break }
            }
            if (!club) break
            clubCount.set(club.id, (clubCount.get(club.id) ?? 0) + 1)
            foreignFaAssign.set(club.id, [...(foreignFaAssign.get(club.id) ?? []), fa.id])
            playersWithForeignSigns = playersWithForeignSigns.map(p =>
              p.id !== fa.id ? p : { ...p, teamId: club!.id }
            )
          }
        }

        const cpuSigningNewsItems = cpuSignings
          .filter(s => {
            const p = playersAfterCpuTransfer.find(x => x.id === s.playerId)
            return p && ovr(p) >= 65
          })
          .slice(0, 10)
          .map(s => {
            const p = playersAfterCpuTransfer.find(x => x.id === s.playerId)!
            const team = teamsAfterCpuTransfer.find(t => t.id === s.teamId)
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
          players: [...playersWithForeignSigns, ...pool],
          teams: teamsWithAllCpuSigns,
          // 海外FA補強で獲得した選手をクラブ名簿にも反映（teamIdと名簿の同期）
          foreignLeagues: foreignFaAssign.size === 0 ? state.foreignLeagues : (state.foreignLeagues ?? []).map(l => ({
            ...l,
            clubs: l.clubs.map(c => {
              const add = foreignFaAssign.get(c.id)
              return add && add.length > 0 ? { ...c, playerIds: [...c.playerIds, ...add] } : c
            }),
          })),
          // 直近10シーズン分だけ残して古い移籍記録は捨てる
          transferHistory: [
            ...(state.transferHistory ?? []).filter(r => r.year >= newYear - 10),
            ...offseasonTxRecords,
            ...[...cpuSignings, ...cpuSecondSignings].map(s => ({ year: newYear, date: `${newYear}-02-10`, playerId: s.playerId, fromTeamId: '', toTeamId: s.teamId, fee: 0, kind: 'free' as const, years: 2 })),
          ].slice(-800),
          currentSeason: {
            ...state.currentSeason,
            newsFeed: [...cpuSigningNewsItems, ...state.currentSeason.newsFeed].slice(0, 30),
          },
        })
      },

      endSeason: () => {
        // ECLの残り戦が未消化ならAI配置で自動開催してからシーズンを締める
        {
          let guard = 0
          while (guard++ < 8) {
            const es = get().currentSeason.eclSeries
            if (!es || es.raceIndex >= es.races.length) break
            try { get().advanceEclRace() } catch (e) { console.error('advanceEclRace failed', e); break }
          }
        }
        set(state => {
          const newYear = state.currentSeason.year + 1

          // Record OVR before growth for history
          const ovrSnapshot: Record<string, number> = {}
          state.players.forEach(p => { ovrSnapshot[p.id] = ovr(p) })

          // CPUチーム：予算ベースの契約更新（今季満了の主力を予算内で延長）
          // CPUの契約更新も自チームと同じ市場カーブ（faMarketSalary）で。
          // 旧式(ovr×110000)は約1000万で頭打ちになり、OVR90の主力が激安になる不具合があった。
          const cpuRenewalSalary = (p: Player) => faMarketSalary(p)
          const cpuRenewIds = new Set<string>()
          {
            const curStandings = [...(state.currentSeason.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
            const totalTeamsRenewal = state.teams.length
            const rankOfRenewal = (teamId: string) => {
              const i = curStandings.findIndex(s => s.teamId === teamId)
              return i >= 0 ? i + 1 : Math.ceil(totalTeamsRenewal / 2)
            }
            const cpuTeamIdsRenewal = [...new Set(
              state.players
                .filter(p => p.teamId && p.teamId !== '' && p.teamId !== '__pool__' && p.teamId !== state.playerTeamId && p.status === 'active')
                .map(p => p.teamId)
            )]
            for (const teamId of cpuTeamIdsRenewal) {
              const tier = cpuTeamTier(teamId, state.players)
              const minOvr = tier === 'elite' ? 72 : tier === 'mid' ? 65 : 58
              const rank = rankOfRenewal(teamId)
              const ongoingCommitted = state.players
                .filter(p => p.teamId === teamId && p.status === 'active' && p.contract.yearsLeft > 1)
                .reduce((s, p) => s + p.contract.annualSalary, 0)
              let budget = Math.max(0, rankBudgetGrant(rank) - ongoingCommitted)
              const expiring = state.players
                .filter(p => p.teamId === teamId && p.contract.yearsLeft === 1 && p.status === 'active' && p.rosterTier === 'main')
                .sort((a, b) => ovr(b) - ovr(a))
              for (const p of expiring) {
                if (ovr(p) < minOvr) continue
                const sal = cpuRenewalSalary(p)
                if (budget < sal) continue
                cpuRenewIds.add(p.id)
                budget -= sal
              }
            }
          }

          // 加齢処理 + 契約更新適用
          const grownPlayers = state.players.map(pRaw => {
            // オフシーズンで負傷は全快（負傷状態と復帰カウントを持ち越さない）
            const p = pRaw.status === 'injured' ? { ...pRaw, status: 'active' as const, injuredUntilRace: undefined, injuryName: undefined } : pRaw
            // 自チーム以外(CPU・海外)は毎年ポテンシャルへ向けて成長させる。自チームはレース/カードEXPで成長。
            const allowAnnualGrowth = p.teamId !== state.playerTeamId
            const grown = p.status === 'active' || p.status === 'injured' ? growPlayer(p, allowAnnualGrowth) : p
            const snap = ovrSnapshot[p.id]
            const withHistory = snap == null ? grown : { ...grown, ovrHistory: [...(p.ovrHistory ?? []), { year: state.currentSeason.year, ovr: snap }].slice(-8) }
            if (cpuRenewIds.has(p.id)) {
              const newSalary = cpuRenewalSalary(withHistory)
              return { ...withHistory, contract: { ...withHistory.contract, yearsLeft: 2, annualSalary: newSalary, faEligibleYear: newYear + 2 } }
            }
            return withHistory
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
          // レンタル中の選手は保有元チーム基準で判定する（借り手チーム基準だと、貸し出した自チーム選手が勝手にFA化し、
          // 借りている他人の選手の更新判断をユーザーがさせられる）
          const contractOwner = (p: Player) => p.loan?.ownerTeamId ?? p.teamId
          // レンタル中の選手は契約満了によるFA化の対象外（レンタル期間を必ず全うさせる）。
          // これが無いと「元契約残り1年の選手を2年レンタル」した場合に、1年目の終わりでFA化して
          // 借り手からも保有元からも消える（＝2年契約が1年で消える）バグになる。
          // 満了は返却後、保有元チーム側で改めて処理される
          // 契約満了FA化は「国内リーグ所属」だけが対象。海外クラブの選手を含めると
          // クラブ名簿に残ったまま teamId だけ '' になり「未所属」表示のバグになる（海外の名簿は海外リーグ側の更新で管理）
          const domesticIdsFA = new Set(state.teams.map(t => t.id))
          const expiredIds = new Set(
            grownPlayers
              .filter(p => p.contract.yearsLeft === 0 && !p.loan && p.teamId && domesticIdsFA.has(p.teamId) && contractOwner(p) !== state.playerTeamId && p.status === 'active')
              .map(p => p.id)
          )
          // Player-team expiring players: queued for user decision
          const playerTeamExpiringIds = grownPlayers
            .filter(p => p.contract.yearsLeft === 0 && contractOwner(p) === state.playerTeamId && p.status === 'active')
            .map(p => p.id)

          // レンタル期間終了で保有元へ返却される選手（後段でロスター配列にも戻す）
          const loanReturnIds = new Map<string, string>()  // playerId → ownerTeamId
          const playersAfterFA = grownPlayers.map(p => {
            if (expiredIds.has(p.id)) return { ...p, teamId: '',  transferListed: false, loan: undefined }
            // 「移籍を認める」でリスト入りしたのにシーズン内で決まらなかった選手は強制FA。
            // 出て行った選手なので1年間交渉不可（契約満了FAと同じ扱い）
            if (p.transferListed && p.teamId === state.playerTeamId && p.status === 'active') {
              return { ...p, teamId: '',  transferListed: false, transferLockedUntilYear: state.currentSeason.year + 2 }
            }
            // レンタル期間終了 → 保有元チームへ自動返却（フラットロスター＝mainで戻す。secondだと一覧から消える）
            if (p.loan && p.loan.untilYear <= state.currentSeason.year + 1) {
              loanReturnIds.set(p.id, p.loan.ownerTeamId)
              return { ...p, teamId: p.loan.ownerTeamId, loan: undefined, rosterTier: 'main' as const }
            }
            return p
          })

          // ── RETIREMENT SYSTEM ──
          // 選手ごとに引退年齢を32〜40でばらつかせる（idから決定的に算出＝毎シーズンぶれない）。
          // 実力者(高OVR)は少し長く現役を続ける。到達したら引退。
          const idHash = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h }
          const retirementAge = (p: Player) => {
            const o = ovr(p)
            const bonus = o >= 80 ? 2 : o >= 72 ? 1 : 0
            return Math.min(40, 32 + (idHash(p.id) % 7) + bonus)   // 32〜40でばらつく
          }

          const retiringIds = new Set(
            grownPlayers
              .filter(p => p.status === 'active' && p.teamId && p.teamId !== '__pool__' && !expiredIds.has(p.id))
              .filter(p => p.age >= retirementAge(p))
              .map(p => p.id)
          )

          // 海外クラブの年次入れ替え（引退を外し、若手を新加入させる）
          const foreignRefresh = refreshForeignLeagues(state.foreignLeagues ?? [], retiringIds, state.currentSeason.year + 1)

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
            retiringIds.has(p.id) ? { ...p, status: 'retired' as const, teamId: '', retiredYear: state.currentSeason.year } : p
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
          // 前年にオファーが来た会社・契約中の会社は翌年の新規候補から除外（毎年同じ顔ぶれになるのを防ぐ）
          const tplIdOf = (id: string) => /^(?:sp_)?offer_(.+)_\d+_\d+$/.exec(id)?.[1]
          const excludeTplIds = [
            ...(state.currentSeason.sponsorOffers ?? []).map(o => tplIdOf(o.id)),
            ...updatedSponsors.filter(sp => sp.yearsLeft > 0).map(sp => tplIdOf(sp.id)),
          ].filter((x): x is string => !!x)
          const newSponsorOffers = [...renewalOffers, ...generateSponsorOffers(myFinalRank, newYear, excludeTplIds)]
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
          // 翌季のプレシーズンで指名される新人はその年(newYear)に加入するので draftYear=newYear にする。
          // （+1 にすると加入年より1年多い年度で記録され、歴代ドラフトが1年ズレる）
          const nextScoutPool = generateDraftPool(newYear)

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
          // レンタル返却された選手は保有元チームのロスター配列（2軍側）へ戻す
          const teamsWithFA = updatedTeams.map(t => {
            const returned = [...loanReturnIds.entries()].filter(([, ownerId]) => ownerId === t.id).map(([pid]) => pid)
            const mainKept = t.roster.main.filter(id => !expiredIds.has(id) && !retiringIds.has(id))
            const secondKept = t.roster.second.filter(id => !expiredIds.has(id) && !retiringIds.has(id))
            const returnAdds = returned.filter(id => !mainKept.includes(id) && !secondKept.includes(id) && !expiredIds.has(id) && !retiringIds.has(id))
            return {
              ...t,
              roster: {
                main: mainKept,
                second: [...secondKept, ...returnAdds],
              },
              ...(t.id === state.playerTeamId && expiredSponsorIds.size > 0 ? {
                sponsors: (t.sponsors ?? []).filter(id => !expiredSponsorIds.has(id)),
              } : {}),
            }
          })

          // CPU teams do NOT sign FA players here — user gets the FA window during preseason
          // AI will sign remaining FAs when beginSeasonDraft is called

          // Check objectives + award scout points + budget rewards
          const finalRank = [...state.currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints).findIndex(s => s.teamId === state.playerTeamId) + 1
          const playerBudgetAtSeasonEnd = teamsWithFA.find(t => t.id === state.playerTeamId)?.finance.budget ?? 0
          const completedObjs = (state.currentSeason.objectives ?? []).map(obj => {
            if (obj.done) return obj
            if (obj.id === 'topN' && finalRank > 0 && finalRank <= obj.target) return { ...obj, current: finalRank, done: true }
            if (obj.id === 'noInjury' && obj.current === 0) return { ...obj, done: true }
            if (obj.id === 'budgetMaintain' && playerBudgetAtSeasonEnd >= obj.target) return { ...obj, current: playerBudgetAtSeasonEnd, done: true }
            return obj
          })
          const newlyCompletedObjs = completedObjs.filter(o => o.done && !state.currentSeason.objectives.find(x => x.id === o.id)?.done)
          const objBonus = newlyCompletedObjs.reduce((s, o) => s + o.rewardPts, 0)
          const objBudgetBonus = newlyCompletedObjs.reduce((s, o) => s + (o.rewardBudget ?? 0), 0)

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

          // 来季の目標：今季の最終順位を基準にスケール（順位が上がるほど翌年の目標も厳しく）
          const newObjectives = selectSeasonObjectives(!!state.rivalTeamId, state.teams.length, finalRank)

          // GM評判＝今季の目標達成率で少しずつ変動（±5以内）
          const objAchieved = completedObjs.filter(o => o.done).length
          const objTotalCount = completedObjs.length || 1
          const objAchieveRate = objAchieved / objTotalCount
          const repDelta = objAchieveRate >= 1 ? 5 : objAchieveRate >= 0.6 ? 3 : objAchieveRate >= 0.4 ? 1 : objAchieveRate >= 0.2 ? -1 : -3
          const newGmRep = Math.max(1, Math.min(100, (state.gmRep ?? 50) + repDelta))

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

          // League MVP・新人王（選出ルールは utils/awards.ts に一元化。画面表示側と同じ実装を使う）
          const newSeasonAward: SeasonAward = computeSeasonAwards(state.currentSeason.races, grownPlayers, state.currentSeason.year)

          // 記録会のシーズン別トップ10を軽量アーカイブ（記録会の全結果はこの後破棄されるため、
          // 歴代優勝ページ用に種目ごとの上位だけ名前焼き込みで残す）
          const DIST_TO_KEY: Record<number, 'd5000' | 'd10000' | 'half' | 'marathon'> = { 5000: 'd5000', 10000: 'd10000', 21097: 'half', 42195: 'marathon' }
          const newEventTops: NonNullable<GameState['eventSeasonTops']> = []
          {
            const byDist = new Map<'d5000' | 'd10000' | 'half' | 'marathon', Map<string, { playerId: string; teamId: string; timeSec: number }>>()
            for (const ev of state.currentSeason.individualEvents ?? []) {
              const key = DIST_TO_KEY[ev.distance]
              if (!key || !ev.results) continue
              if (!byDist.has(key)) byDist.set(key, new Map())
              const best = byDist.get(key)!
              for (const r of ev.results) {
                const cur = best.get(r.playerId)
                if (!cur || r.timeSec < cur.timeSec) best.set(r.playerId, { playerId: r.playerId, teamId: r.teamId, timeSec: r.timeSec })
              }
            }
            for (const [dist, best] of byDist) {
              // 記録会にはドラフト候補も出るため、名前はプレイヤー→候補の順で解決して焼き込む
              const top = [...best.values()].sort((a, b) => a.timeSec - b.timeSec).slice(0, 10)
                .map(e => ({ ...e, playerName: (state.players.find(p => p.id === e.playerId) ?? (state.currentSeason.scoutProspects ?? []).find(p => p.id === e.playerId))?.name ?? '' }))
              if (top.length > 0) newEventTops.push({ year: state.currentSeason.year, dist, top })
            }
          }
          const leagueMvpId = newSeasonAward.mvpId
          const leagueMvpPlayer = leagueMvpId ? grownPlayers.find(p => p.id === leagueMvpId) : null
          const rookiePlayer = newSeasonAward.rookieId ? grownPlayers.find(p => p.id === newSeasonAward.rookieId) : null

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

          // 1軍・2軍とも年俸を予算から控除（以前は main のみで二軍が実質無料だった）
          const playerSalaryTotal = playersAfterMorale
            .filter(p => p.teamId === state.playerTeamId && (p.rosterTier === 'main' || p.rosterTier === 'second'))
            .reduce((s, p) => s + p.contract.annualSalary, 0)

          const playerTeamObj = teamsWithFA.find(t => t.id === state.playerTeamId)
          const sponsorAnnual = (playerTeamObj?.sponsors ?? [])
            .map(id => (state.sponsors ?? []).find(s => s.id === id))
            .filter(Boolean)
            .reduce((s, sp) => s + sp!.annualPayment, 0)
          const prevRaceIncome = state.currentSeason.seasonRaceIncome ?? 0
          // 来季予算（前季残高の繰り越し + 収入 - 支出、赤字は-1億まで許容）。計算は data/economy.ts に集約。
          const prevStreakMe = playerTeamObj?.finance.deficitStreak ?? 0
          // 施設Lv合計→維持費。強い＝施設充実で維持費が高い。
          const facLevelSum = (f?: Record<string, number>) => Object.values(f ?? {}).reduce((s, v) => s + (v ?? 0), 0)
          const runningCostVal = runningCost(facLevelSum(playerTeamObj?.facilities as Record<string, number> | undefined), rankBudgetGrant(finalRank))
          // 育成義務ペナルティ：在籍22人以下 or リザーブリーグ不参加でグラント減額（自チームのみ。CPUは常時24人以上＋参加扱い）
          const myRosterSize = playersAfterMorale.filter(p => p.teamId === state.playerTeamId && p.status !== 'retired').length
          const reserveJoinedMe = (state.currentSeason.secondTeamRaces ?? []).length === 0 || state.currentSeason.reserveLeagueJoined === true
          const dutyCutMe = leagueDutyGrantCut(myRosterSize, reserveJoinedMe)
          const playerBudgetArgs = {
            finalRank,
            prevBalance: playerBudgetAtSeasonEnd,
            deficitStreak: prevStreakMe,
            sponsorAnnual,
            seasonRaceIncome: prevRaceIncome,
            objBudgetBonus,
            bonusPayout: bonusTotalPayout,
            salaryTotal: playerSalaryTotal,
            runningCost: runningCostVal,
            dutyGrantCut: dutyCutMe,
          }
          const newBudget = computeNextSeasonBudget(playerBudgetArgs)
          // 初期予算の内訳（財務ページで「何が合わさって初期予算か」を表示）。グラントは連続赤字ペナルティ適用後の実額。
          // 繰越は「前季の最終収支」＝期末残高から年俸・運営費・ボーナスを精算した後の額。
          // 前季の支出は前季で完結しているため、内訳に支出行は出さない
          const grantMultForBudget = prevStreakMe >= 3 ? 0.65 : prevStreakMe >= 2 ? 0.80 : 1.0
          const newBudgetBreakdown = {
            carryover: playerBudgetAtSeasonEnd - (bonusTotalPayout + playerSalaryTotal + runningCostVal),
            grant: Math.round(rankBudgetGrant(finalRank) * grantMultForBudget * (1 - dutyCutMe)),
            raceIncome: prevRaceIncome,
            sponsor: sponsorAnnual,
            objBonus: objBudgetBonus,
            expenses: 0,  // 精算済みのためcarryoverに織り込み（旧セーブの表示互換のためフィールドは残す）
          }
          // 単年の営業収支が赤字なら連続赤字カウント+1、黒字なら0にリセット（残高ではなく単年収支で判定）
          const newStreakMe = seasonOperatingResult(playerBudgetArgs) < 0 ? prevStreakMe + 1 : 0

          // 全チームの来季予算を順位連動に（自チームと同じ computeNextSeasonBudget）。
          const teamSalaryTotal = (teamId: string) => playersAfterMorale
            .filter(p => p.teamId === teamId && (p.rosterTier === 'main' || p.rosterTier === 'second'))
            .reduce((s, p) => s + p.contract.annualSalary, 0)
          const teamSponsorAnnual = (t: typeof teamsWithFA[0]) => (t.sponsors ?? [])
            .map(id => (state.sponsors ?? []).find(s => s.id === id))
            .filter(Boolean)
            .reduce((s, sp) => s + sp!.annualPayment, 0)
          const seasonRacesCount = state.currentSeason.races?.length ?? 10
          const teamsWithSeasonRewards = teamsWithFA.map(t => {
            if (t.id === state.playerTeamId) {
              return { ...t, finance: { ...t.finance, budget: newBudget, salaryTotal: playerSalaryTotal, deficitStreak: newStreakMe } }
            }
            const rank = sortedStandings.findIndex(s => s.teamId === t.id) + 1
            const sal = teamSalaryTotal(t.id)
            const prevStreak = t.finance.deficitStreak ?? 0
            const cpuBudgetArgs = {
              finalRank: rank,
              prevBalance: t.finance.budget,
              deficitStreak: prevStreak,
              sponsorAnnual: teamSponsorAnnual(t),
              // CPUにも賞金＋観客収入を最終順位ベースで加え、さらに足りない分としてグラントの10%を上乗せ
              seasonRaceIncome: cpuSeasonRaceIncome(rank, seasonRacesCount),
              objBudgetBonus: 0,
              bonusPayout: 0,
              salaryTotal: sal,
              runningCost: runningCost(facLevelSum(t.facilities as Record<string, number> | undefined), rankBudgetGrant(rank)),
            }
            const b = computeNextSeasonBudget(cpuBudgetArgs)
            // 単年収支が赤字なら連続赤字+1（残高ではなく単年で判定）
            const cpuStreak = seasonOperatingResult(cpuBudgetArgs) < 0 ? prevStreak + 1 : 0
            return { ...t, finance: { ...t.finance, budget: b, salaryTotal: sal, deficitStreak: cpuStreak } }
          })

          // Generate future draft picks (next 2 seasons) for each team based on final rank
          const numTeams = state.teams.length
          const teamsWithFuturePicks = teamsWithSeasonRewards.map(t => {
            const teamFinalRank = sortedStandings.findIndex(s => s.teamId === t.id) + 1
            const pickNum = Math.max(1, numTeams - teamFinalRank + 1)
            const newPicks: typeof t.draftPicks = []
            for (const yr of [newYear, newYear + 1]) {
              for (const round of [1, 2]) {
                const alreadyHas = pickExistsAnywhere(teamsWithSeasonRewards, t.id, yr, round)
                if (!alreadyHas) newPicks.push({ year: yr, round, pickNumber: pickNum, originallyOwnedBy: t.id })
              }
            }
            return { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] }
          })

          // Remove expired draft picks (older than the upcoming draft year)
          let teamsWithCleanedPicks = teamsWithFuturePicks.map(t => ({
            ...t,
            draftPicks: (t.draftPicks ?? []).filter(pk => pk.year >= newYear),
          }))

          // ── 赤字ペナルティ：3年以上連続赤字はドラフト制限 ──
          // 来季ドラフトの自チーム最上位指名権が、資金力のあるチームへ強制売却される（売却額は補填として入金）
          const pickPenaltyNews: { date: string; headline: string; category: 'finance'; relatedIds: string[] }[] = []
          if (newStreakMe >= 3) {
            const meT = teamsWithCleanedPicks.find(t => t.id === state.playerTeamId)
            const myNextPicks = (meT?.draftPicks ?? []).filter(pk => pk.year === newYear)
            const soldPick = [...myNextPicks].sort((a, b) => a.round - b.round || a.pickNumber - b.pickNumber)[0]
            const buyer = [...teamsWithCleanedPicks].filter(t => t.id !== state.playerTeamId).sort((a, b) => b.finance.budget - a.finance.budget)[0]
            if (soldPick && buyer) {
              const price = draftPickValue(soldPick.round, soldPick.pickNumber)
              const samePick = (pk: typeof soldPick) => pk.year === soldPick.year && pk.round === soldPick.round && pk.originallyOwnedBy === soldPick.originallyOwnedBy
              teamsWithCleanedPicks = teamsWithCleanedPicks.map(t => {
                if (t.id === state.playerTeamId) return { ...t, finance: { ...t.finance, budget: t.finance.budget + price }, draftPicks: (t.draftPicks ?? []).filter(pk => !samePick(pk)) }
                if (t.id === buyer.id) return { ...t, finance: { ...t.finance, budget: t.finance.budget - price }, draftPicks: [...(t.draftPicks ?? []), soldPick] }
                return t
              })
              pickPenaltyNews.push({
                date: `${state.currentSeason.year}-10-31`,
                headline: `【赤字ペナルティ】${newStreakMe}年連続赤字により、${newYear}年ドラフト${soldPick.round}巡目指名権が${buyer.shortName}へ売却されました（${Math.round(price / 10000)}万円が予算に補填）`,
                category: 'finance' as const,
                relatedIds: [],
              })
            }
          }

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

          // MVP/新人王ニュースはシーズン最終戦の直後（そのシーズンのニュース）で流すため、ここでは出さない（二重表示防止）

          // 在籍履歴（(L)レンタル）用：現在レンタル中の選手について、この年その所属チームでの出場記録を追記
          const seasonYear = state.currentSeason.year
          const playersWithLoanHistory = playersWithChamp.map(p => {
            if (!p.loan) return p
            const existing = p.loanTeamYears ?? []
            if (existing.some(l => l.year === seasonYear && l.teamId === p.teamId)) return p
            return { ...p, loanTeamYears: [...existing, { year: seasonYear, teamId: p.teamId }] }
          })

          const objJewels = newlyCompletedObjs.reduce((s, o) => s + (o.rewardJewels ?? 30), 0)
          const seasonAchievementJewels = seasonAchievements.reduce((s, a) => s + (ACHIEVEMENT_JEWELS[a.rarity] ?? 0), 0)
          const rankJewels = finalRank === 1 ? 200 : finalRank === 2 ? 100 : finalRank === 3 ? 50 : 0

          // 海外リーグの優勝クラブ所属選手に championships +1（今季の順位表を確定してから）
          const playersWithForeignChamp = applyForeignChampions(
            state.foreignLeagues ?? [], playersWithLoanHistory, state.currentSeason.foreignStandings ?? {},
          )

          // シーズンオフの海外クラブ間移籍（引き抜き）。選手がクラブ・国境を越えて移動する。
          // 万一エラーが出てもシーズン更新自体は壊さないよう、失敗時は移籍なしにフォールバック。
          const foreignBasePlayers = [...playersWithForeignChamp, ...foreignRefresh.newPlayers]
          let foreignTx: { foreignLeagues: typeof foreignRefresh.updatedLeagues; players: typeof foreignBasePlayers; news: { date: string; headline: string; category: 'trade'; relatedIds: string[] }[]; records: TransferRecord[] }
          try {
            foreignTx = simulateForeignTransferMarket({
              foreignLeagues: foreignRefresh.updatedLeagues,
              players: foreignBasePlayers,
              year: newYear,
            })
          } catch (e) {
            console.error('simulateForeignTransferMarket failed', e)
            foreignTx = { foreignLeagues: foreignRefresh.updatedLeagues, players: foreignBasePlayers, news: [], records: [] }
          }

          // シーズンオフの日本↔海外クロスボーダー移籍（CPU同士）。プレイヤーのチームは対象外。
          let crossTx: { teams: typeof teamsWithCleanedPicks; foreignLeagues: typeof foreignTx.foreignLeagues; players: typeof foreignTx.players; news: typeof foreignTx.news; records: TransferRecord[] }
          try {
            crossTx = simulateCrossBorderTransfers({
              teams: teamsWithCleanedPicks,
              foreignLeagues: foreignTx.foreignLeagues,
              players: foreignTx.players,
              playerTeamId: state.playerTeamId,
              year: newYear,
            })
          } catch (e) {
            console.error('simulateCrossBorderTransfers failed', e)
            crossTx = { teams: teamsWithCleanedPicks, foreignLeagues: foreignTx.foreignLeagues, players: foreignTx.players, news: [], records: [] }
          }

          // ── 長期プレイでの肥大化対策（記録は名前焼き込みで残るため消えない） ──
          // 1) 海外クラブ名簿を「teamId起点」で毎年完全に再構築する（30人上限もここで適用）。
          //    海外選手がFA化・国内移籍しても旧クラブのplayerIdsに残存し、翌年の海外間移籍が
          //    その亡霊名簿を動かしてteamIdを海外へ書き戻す（国内名簿と二重所属になる）バグの根治。
          //    毎年通るので既存セーブの汚れも自動修復される
          const playerByIdCl = new Map(crossTx.players.map(p => [p.id, p]))
          const foreignDropIds = new Set<string>()
          const clubMembers = new Map<string, string[]>()
          {
            const clubIdsAll = new Set(crossTx.foreignLeagues.flatMap(l => l.clubs.map(c => c.id)))
            for (const p of crossTx.players) {
              if (p.status === 'active' && clubIdsAll.has(p.teamId)) {
                const arr = clubMembers.get(p.teamId) ?? []
                arr.push(p.id)
                clubMembers.set(p.teamId, arr)
              }
            }
          }
          const cappedForeignLeagues = crossTx.foreignLeagues.map(l => ({
            ...l,
            clubs: l.clubs.map(c => {
              const ids = clubMembers.get(c.id) ?? []
              if (ids.length <= 30) return { ...c, playerIds: ids }
              const sorted = [...ids].sort((a, b) => {
                const pa = playerByIdCl.get(a); const pb = playerByIdCl.get(b)
                return (pb ? ovr(pb) : 0) - (pa ? ovr(pa) : 0)
              })
              sorted.slice(30).forEach(id => foreignDropIds.add(id))
              return { ...c, playerIds: sorted.slice(0, 30) }
            }),
          }))
          // 2) 引退選手の軽量化（能力履歴・特性などを落として名前と実績だけ残す）
          //    ＋整理のルールは国内・海外で共通：「実績（出走・区間賞・記録会ベスト）のある選手は絶対に消さず引退として残す」。
          //    実績ゼロの選手だけ削除する。これでニュース・記録・歴代優勝から選手詳細が必ず開ける
          const leanRetired = (p: Player): Player => ({ ...p, status: 'retired', teamId: '', ovrHistory: [], traits: [], fatigue: 0, form: 0, loan: undefined, faSinceYear: undefined })
          const hasCareerRecord = (p: Player) =>
            p.career.totalRaces > 0 || p.career.segmentWins > 0 || Object.keys(p.eventBests ?? {}).length > 0
          const cleanedPlayers = crossTx.players
            .flatMap((p): Player[] => {
              // 海外クラブの名簿から溢れた選手：実績があれば引退として残す（従来は完全削除→詳細が開けなかった）
              if (foreignDropIds.has(p.id)) {
                return hasCareerRecord(p) ? [leanRetired({ ...p, retiredYear: p.retiredYear ?? state.currentSeason.year })] : []
              }
              if (p.status === 'retired') return [leanRetired(p)]
              if (p.status === 'active' && p.teamId === '') {
                const since = p.faSinceYear ?? state.currentSeason.year
                if (newYear - since >= 2) {
                  return (p.draftRound != null || hasCareerRecord(p))
                    ? [leanRetired({ ...p, retiredYear: p.retiredYear ?? since })]
                    : []
                }
                return [{ ...p, faSinceYear: since }]
              }
              return [p.faSinceYear != null ? { ...p, faSinceYear: undefined } : p]
            })

          // 自チームから居なくなった選手の退団通知（契約満了のFA流出・他クラブへの移籍）。
          // ロスターから黙って消えるのを防ぐ。引退は別途セレモニー・ニュースがあるため除外
          const departureClubName = (teamId: string) =>
            state.teams.find(t => t.id === teamId)?.shortName
            ?? cappedForeignLeagues.flatMap(l => l.clubs).find(c => c.id === teamId)?.shortName
            ?? null
          const departureNotices = state.players
            .filter(p => p.teamId === state.playerTeamId && p.status !== 'retired')
            .flatMap((oldP): { id: string; playerId: string; playerName: string; toTeamName: string; reason: 'transfer' | 'fa' }[] => {
              const now = cleanedPlayers.find(p => p.id === oldP.id)
              if (!now || now.status === 'retired' || now.teamId === state.playerTeamId) return []
              const to = now.teamId === '' ? null : departureClubName(now.teamId)
              return [{ id: `dep-${oldP.id}-${newYear}`, playerId: oldP.id, playerName: oldP.name, toTeamName: to ?? '', reason: to ? 'transfer' : 'fa' }]
            })
          // 退団（FA流出・移籍）を移籍履歴にも記録する（移籍ページの「出」に日付付きで出るように）
          const departureRecords: TransferRecord[] = departureNotices.map(n => {
            const now = cleanedPlayers.find(p => p.id === n.playerId)
            return { year: newYear, date: `${state.currentSeason.year}-11-05`, playerId: n.playerId, fromTeamId: state.playerTeamId, toTeamId: now?.teamId ?? '', fee: 0, kind: 'free' as const }
          })

          // 海外クラブ在籍で今季出場ゼロの選手にも0戦のエントリを埋めて保存する。
          // 在籍履歴（選手詳細）は出場記録から行を作るため、これが無いと出なかった年の所属が消える
          const archivedForeignApps = { ...(state.currentSeason.foreignAppearances ?? {}) }
          for (const fl of (state.foreignLeagues ?? [])) {
            for (const fc of fl.clubs) {
              for (const pid of fc.playerIds) {
                if (!archivedForeignApps[pid]) archivedForeignApps[pid] = { clubId: fc.id, races: 0, wins: 0 }
              }
            }
          }
          // 国内も同様：今季1度も出走しなかった在籍選手の所属を記録して保存（在籍履歴の空白防止）
          const appearedIds = new Set<string>()
          for (const race of [...state.currentSeason.races, ...(state.currentSeason.secondTeamRaces ?? [])]) {
            if (!race.results) continue
            for (const sr of race.results.segmentResults) for (const r of sr.runners) appearedIds.add(r.playerId)
          }
          const domesticTeamIds = new Set(state.teams.map(t => t.id))
          const zeroAppearances = state.players
            .filter(p => p.status === 'active' && domesticTeamIds.has(p.teamId) && !appearedIds.has(p.id))
            .map(p => ({ playerId: p.id, teamId: p.teamId, tier: (p.rosterTier === 'second' ? 'second' : 'main') as 'main' | 'second' }))

          // 国内チームの名簿もteamId起点で毎年完全に同期する（海外クラブと同じ自動修復）。
          // 契約満了のFA化（teamId=''）や長期整理での選手削除がroster配列に残存し、
          // 「名簿に居るのにteamIdが違う/存在しない」不整合になるのを根治する
          // レンタル中（loanあり）の選手は名簿外が正規仕様（teamId=借り手だが借り手の名簿には載せない）
          const syncedTeams = crossTx.teams.map(t => ({
            ...t,
            roster: {
              main: cleanedPlayers.filter(p => p.teamId === t.id && p.status === 'active' && !p.loan).map(p => p.id),
              second: [] as string[],
            },
          }))

          return {
            players: cleanedPlayers,
            teams: syncedTeams,
            foreignLeagues: cappedForeignLeagues,
            // 退団（FA流出・移籍）と海外移籍（クラブ間・日本↔海外）を移籍履歴に記録（移籍ページの日付・移籍金表示用）
            transferHistory: [...(state.transferHistory ?? []), ...departureRecords, ...foreignTx.records, ...crossTx.records].slice(-800),
            jewels: state.jewels + objJewels + seasonAchievementJewels + rankJewels,
            gmRep: newGmRep,
            achievements: [...(state.achievements ?? []), ...seasonAchievements],
            // 年度別MVP・新人王（選手プロフィールのパッチ・シーズン振り返り用）
            seasonAwards: [...(state.seasonAwards ?? []), newSeasonAward],
            eventSeasonTops: [...(state.eventSeasonTops ?? []), ...newEventTops],
            draftState: null,
            sponsors: updatedSponsors,
            // 過去シーズンはレース結果・順位・世界駅伝など「記録として見返すもの」だけ残す。
            // 記録会の全結果（毎年約1MB）・ニュース・チャットログ等は一度も読まれないため空にして保存する
            pastSeasons: [...state.pastSeasons, {
              ...state.currentSeason,
              foreignAppearances: archivedForeignApps,
              zeroAppearances,
              objectives: completedObjs,
              individualEvents: [],
              newsFeed: [],
              chatLogs: {},
              scoutProspects: [],
              draftPool: [],
              collegeRaces: state.currentSeason.collegeRaces,
              transferListings: [],
              incomingOffers: [],
              transferBids: [],
              contractRequests: [],
              acquisitionOffers: [],
              retirementRequests: [],
              transferRequests: [],
              events: [],
              scoutMissions: [],
              faVisits: [],
              pendingTradeOffers: [],
              scoutedOpponents: [],
            }],
            raceLineup: {},
            raceStrategy: 'balanced' as const,
            growthReport: { year: state.currentSeason.year, entries: growthEntries },
            // シーズン終了で確定した来期予算（ホームでポップ表示 → 確認で消える）
            seasonBudgetNotice: { year: newYear, budget: newBudget },
            currentSeason: {
              year: newYear,
              currentRaceIndex: 0,
              phase: 'preseason',
              races: newRaces,
              collegeRaces: [],
              draftPool: [],
              scoutPoints: 5 + objBonus + (state.teams.find(t => t.id === state.playerTeamId)?.facilities?.scoutOffice ?? 0),
              initialBudget: newBudget,   // 来期の開始予算（＝繰越+グラント+賞金観客スポンサー）。収支表示の基準。
              seasonGrant: rankBudgetGrant(finalRank),   // 来期の順位グラント額（前年＝今季順位ベース）。運営費＝この10%。
              budgetBreakdown: newBudgetBreakdown,       // 初期予算の内訳（財務ページで表示）
              // 今季スカウトした候補（＝来季プレシーズンで指名する代）をそのまま引き継ぐ。
              // 視察した選手がそのままドラフトに並ぶようにする。空のとき（一度もスカウトを開いていない等）だけ新規生成。
              scoutProspects: (state.currentSeason.scoutProspects?.length ?? 0) > 0 ? state.currentSeason.scoutProspects : nextScoutPool,
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
              individualEvents: generateIndividualEvents(newYear),
              departureNotices,
              worldEkidenResult: undefined,
              sponsorOffers: newSponsorOffers,
              seasonRaceIncome: 0,
              secondTeamRaces: newSecondTeamRaces,
              secondTeamRaceIndex: 0,
              secondTeamStandings: state.teams.map(t => ({ teamId: t.id, totalPoints: 0, raceResults: [] })),
              foreignStandings: initForeignStandings(foreignRefresh.updatedLeagues),
              foreignRaceIndex: 0,
              foreignAppearances: {},
              // 来季のECL：今季（＝前年）の各リーグ上位2チームで開催。4/6/7/9/11月の5戦、コースは10種から重複なし抽選。
              // 初年度は前年成績が無いためこの経路でしか生成されない＝1年目は開催なし
              eclSeries: (() => {
                const parts = [] as { id: string; name: string; shortName: string; isForeign: boolean; isPlayerTeam: boolean; leagueName: string; colors: { primary: string; secondary: string } }[]
                sortedStandings.slice(0, 2).forEach(s => {
                  const t = state.teams.find(tm => tm.id === s.teamId)
                  if (t) parts.push({ id: t.id, name: t.name, shortName: t.shortName, isForeign: false, isPlayerTeam: t.id === state.playerTeamId, leagueName: 'JPEL', colors: t.colors })
                })
                const fsEnd = state.currentSeason.foreignStandings ?? {}
                for (const league of foreignRefresh.updatedLeagues) {
                  const top2 = [...(fsEnd[league.id] ?? [])].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 2)
                  top2.forEach(s => {
                    const club = league.clubs.find(c => c.id === s.clubId)
                    if (club) parts.push({ id: club.id, name: club.name, shortName: club.shortName, isForeign: true, isPlayerTeam: false, leagueName: league.name, colors: club.colors })
                  })
                }
                if (parts.length < 4) return undefined
                const courses = [...ECL_COURSES].sort(() => Math.random() - 0.5).slice(0, 5)
                const months = ['04', '06', '07', '09', '11']
                const weathers = ['sunny', 'cloudy', 'rainy', 'windy'] as const
                // 開催日はリーグ戦の合間の「中間日」に置く（リーグ戦の前日にECLが来るような殺人日程を防ぐ）
                const leagueDates = newRaces.map(r => r.date).sort()
                const midDate = (target: string): string => {
                  const prev = [...leagueDates].filter(d => d <= target).pop()
                  const next = leagueDates.find(d => d > target)
                  if (!prev || !next) return target
                  const mid = new Date((new Date(prev).getTime() + new Date(next).getTime()) / 2)
                  return `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}-${String(mid.getDate()).padStart(2, '0')}`
                }
                return {
                  participants: parts,
                  // 大会名はコース名でくくる（第X戦にすると年ごとに別コースが同名になり、距離や記録の比較が壊れる）
                  races: courses.map((course, i) => ({
                    id: `ecl-${newYear}-r${i + 1}`,
                    name: `ECL ${course.name}`,
                    date: midDate(`${newYear}-${months[i]}-20`),
                    location: course.location,
                    type: 'league' as const,
                    segments: course.segments,
                    conditions: { temperature: 12, weather: weathers[Math.floor(Math.random() * weathers.length)], elevation: 0 },
                    participants: parts.map(p => p.id),
                  })),
                  raceIndex: 0,
                  points: {},
                }
              })(),
              standings: state.teams.map(t => ({
                teamId: t.id, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [],
              })),
              newsFeed: [
                { date: `${newYear}-03-01`, headline: `${newYear}シーズン開幕！全${newRaces.length}戦のスケジュール決定`, category: 'race' as const, relatedIds: [] },
                ...crossTx.news,
                ...foreignTx.news,
                { date: `${state.currentSeason.year}-10-25`, headline: `${state.currentSeason.year}シーズン王者：${champion?.name ?? ''}！`, category: 'race' as const, relatedIds: [] },
                seasonPrizeNews,
                ...pickPenaltyNews,
                ...(objBonus > 0 ? [{ date: `${state.currentSeason.year}-11-01`, headline: `目標達成ボーナス：スカウトPt+${objBonus}・予算+${Math.round(objBudgetBonus / 10000)}万`, category: 'draft' as const, relatedIds: [] }] : []),
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
        if (reinforcementBanned(myTeam)) return false  // 赤字ペナルティ中・残高マイナスは補強不可

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
        const fromClubId = state.foreignLeagues.flatMap(l => l.clubs).find(c => c.playerIds.includes(playerId))?.id ?? ''
        const updatedLeagues = state.foreignLeagues.map(league => ({
          ...league,
          clubs: league.clubs.map(club => ({
            ...club,
            playerIds: club.playerIds.filter(id => id !== playerId),
          })),
        }))


        const mainFull = myTeam.roster.main.length >= 23
        const assignedTier: 'main' | 'second' = mainFull ? 'second' : 'main'

        set(s => ({
          players: s.players.map(p => p.id === playerId
            ? {
                ...p,
                teamId: s.playerTeamId,
                rosterTier: assignedTier,
                
                status: 'active',
                joinedYear: s.currentSeason.year,
                foreignCategory: foreignCat,
                // contractType/personality を明示（未設定だと契約更新UIの初期値・判定が欠ける）
                contract: { yearsLeft: years, annualSalary: salary, faEligibleYear: s.currentSeason.year + years, contractType: 'standard' as const },
                personality: p.personality ?? 'salary',
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
          transferHistory: [...(s.transferHistory ?? []), { year: s.currentSeason.year, date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date, playerId, fromTeamId: fromClubId, toTeamId: s.playerTeamId, fee: transferFee, years }].slice(-400),
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
        if (currentLv >= 5) return false
        const UPGRADE_COSTS = [100, 300, 500, 1000, 3000]
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
      simulateIndividualEvent: (eventId, skipPlayerIds) => {
        set(state => {
          const event = state.currentSeason.individualEvents?.find(e => e.id === eventId)
          if (!event || event.results) return state
          const skip = new Set(skipPlayerIds ?? [])
          // 出走は国内リーグ所属選手のみ（海外クラブ選手は対象外）。
          // CPUチームは疲労40以上の選手を自動で休ませる（自チームはプレイヤーの出走/休む選択に従う）
          const domesticTeamIds = new Set(state.teams.map(t => t.id))
          // 指定4記録会だけ海外クラブ選手も出走可（春季5000m/夏季10000m/夏季マラソン/冬季ハーフ）
          const FOREIGN_TT_KEYS = ['tt-5k-1', 'tt-10k-2', 'tt-mara', 'tt-half-2']
          const foreignAllowed = FOREIGN_TT_KEYS.some(k => event.id.startsWith(k))
          const foreignClubIds = foreignAllowed
            ? new Set((state.foreignLeagues ?? []).flatMap(l => l.clubs).map(c => c.id))
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
            timeSec: simulateIndividualTime(p, event.distance, event.weather),
          }))
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
              next = { ...next, fatigue: Math.min(100, (next.fatigue ?? 0) + fatGain) }
              const prev = p.eventBests?.[bestKey]
              if (!prev || ran < prev.timeSec) {
                next = { ...next, eventBests: { ...next.eventBests, [bestKey]: { timeSec: ran, year: state.currentSeason.year } } }
              }
            } else if (p.status === 'active' && p.teamId) {
              next = { ...next, fatigue: Math.max(0, (next.fatigue ?? 0) - 8) }
            }
            if (playerTeamTop.some(r => r.playerId === p.id)) {
              next = { ...next, morale: Math.min(100, (next.morale ?? 70) + 8), form: Math.min(2, (next.form ?? 0) + 1) }
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
              value: RARITY_EXP[rarity],
            })
          }

          // News for player team finishers
          const myBest = ranked.find(r => r.teamId === state.playerTeamId)
          const myBestPlayer = myBest ? state.players.find(p => p.id === myBest.playerId) : null
          const distLabel = event.distance === 5000 ? '5000m' : event.distance === 10000 ? '10000m' : event.distance === 42195 ? 'マラソン' : 'ハーフ'
          const newsItem = myBestPlayer ? {
            date: event.date,
            headline: `${event.name}：${myBestPlayer.name}が${distLabel}で${myBest!.rank}位（${fmtTime(myBest!.timeSec)}）`,
            category: 'race' as const,
            relatedIds: [myBestPlayer.id],
          } : null

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
            const distName = event.distance === 5000 ? '5000m' : event.distance === 10000 ? '10000m' : event.distance === 21097 ? 'ハーフマラソン' : 'マラソン'
            // 同タイムは共同保持（タイ記録）。同レース内で並んだ場合も、後日並ばれた場合も全員が保持者になる
            const coOf = (r: { playerId: string }) => ({ playerId: r.playerId, playerName: allPById.get(r.playerId)?.name ?? '', year: evYear0 })
            if (fastest && fastestP) {
              const curWr = state.worldRecords?.[bestKey]
              if (!curWr || fastest.timeSec < curWr.timeSec) {
                const ties = ranked.filter(r => r.playerId !== fastest.playerId && r.timeSec === fastest.timeSec).map(coOf)
                newWorldRecords = { ...newWorldRecords, [bestKey]: { playerId: fastest.playerId, playerName: fastestP.name, timeSec: fastest.timeSec, year: evYear0, ...(ties.length > 0 ? { coHolders: ties } : {}) } }
                recordNewsItems.push({ date: event.date, headline: `【世界新記録】${distName} ${fastestP.name} ${fmtTime(fastest.timeSec)}`, category: 'race' as const, relatedIds: [fastest.playerId] })
                for (const c of ties) recordNewsItems.push({ date: event.date, headline: `【世界新記録】${distName} ${c.playerName} ${fmtTime(fastest.timeSec)}（同タイムで共同保持）`, category: 'race' as const, relatedIds: [c.playerId] })
              } else if (fastest.timeSec === curWr.timeSec) {
                const holderIds = new Set([curWr.playerId, ...(curWr.coHolders ?? []).map(c => c.playerId)])
                const newCo = ranked.filter(r => r.timeSec === curWr.timeSec && !holderIds.has(r.playerId)).map(coOf)
                if (newCo.length > 0) {
                  newWorldRecords = { ...newWorldRecords, [bestKey]: { ...curWr, coHolders: [...(curWr.coHolders ?? []), ...newCo] } }
                  for (const c of newCo) recordNewsItems.push({ date: event.date, headline: `【世界タイ記録】${distName} ${c.playerName} ${fmtTime(curWr.timeSec)}`, category: 'race' as const, relatedIds: [c.playerId] })
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
                recordNewsItems.push({ date: event.date, headline: `【日本新記録】${distName} ${fastestJpnP.name} ${fmtTime(fastestJpn.timeSec)}`, category: 'race' as const, relatedIds: [fastestJpn.playerId] })
                for (const c of ties) recordNewsItems.push({ date: event.date, headline: `【日本新記録】${distName} ${c.playerName} ${fmtTime(fastestJpn.timeSec)}（同タイムで共同保持）`, category: 'race' as const, relatedIds: [c.playerId] })
              } else if (fastestJpn.timeSec === curJr.timeSec) {
                const holderIds = new Set([curJr.playerId, ...(curJr.coHolders ?? []).map(c => c.playerId)])
                const newCo = ranked.filter(r => isJpn(r) && r.timeSec === curJr.timeSec && !holderIds.has(r.playerId)).map(coOf)
                if (newCo.length > 0) {
                  newJapanRecords = { ...newJapanRecords, [bestKey]: { ...curJr, coHolders: [...(curJr.coHolders ?? []), ...newCo] } }
                  for (const c of newCo) recordNewsItems.push({ date: event.date, headline: `【日本タイ記録】${distName} ${c.playerName} ${fmtTime(curJr.timeSec)}`, category: 'race' as const, relatedIds: [c.playerId] })
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
              newsFeed: [
                ...recordNewsItems,
                ...(newsItem ? [newsItem] : []),
                ...(state.currentSeason.newsFeed ?? []),
              ],
              scoutProspects: updatedProspects,
            },
          }
        })
        // 記録会の完了でも入札・レンタル要請の応答を進める（本編以外でも返答が来るように）
        try { get().advanceMarketOneRace() } catch (e) { console.error('advanceMarketOneRace failed', e) }
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

            const lineups: Record<string, Record<number, string>> = { 'wec_JPN': {} }
            japanRunners.forEach((p, i) => { lineups['wec_JPN'][i + 1] = p.id })

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
                  nationality: 'JPN', origin: n.name,  status: 'active',
                  fatigue: 10 + Math.floor(Math.random() * 20),
                  morale: 60 + Math.floor(Math.random() * 20),
                  form: Math.floor(Math.random() * 3) - 1,
                  career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
                } as Player)
                lineups[`wec_${n.country}`][i + 1] = pid
              }
            })

            const allPlayers = [...state.players, ...virtualPlayers]

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

          const budgetBoost = japanFinalRank === 1 ? 20000000 : japanFinalRank === 2 ? 12000000 : japanFinalRank === 3 ? 8000000 : japanFinalRank <= 6 ? 3000000 : japanFinalRank <= 10 ? 1000000 : 0

          const resultLabel = japanFinalRank === 1 ? '金メダル獲得！' : japanFinalRank <= 3 ? `${japanFinalRank}位入賞！` : `${japanFinalRank}位`
          const newsItem = {
            date: `${year}-12-01`,
            headline: `世界駅伝選手権（${cityInfo.city}）3レース制：日本${resultLabel}`,
            category: 'race' as const,
            relatedIds: [],
          }

          return {
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
            getStatPotentials(player),  // 能力別ポテンシャル上限
          )
          let newTraits = [...(player.traits ?? [])]
          if (grantTrait && combo.traitGrant && !newTraits.includes(combo.traitGrant)) {
            if (Math.random() < (combo.traitChance ?? 1.0)) {
              newTraits = [...newTraits, combo.traitGrant]
            }
          }
          // 疲労回復（完全休養／超回復）。大成功倍率(multiplier)も疲労に掛ける。
          const fatigueRecovered = combo.fatigueDelta ? Math.round(combo.fatigueDelta * multiplier) : 0
          const newFatigue = Math.max(0, (player.fatigue ?? 0) - fatigueRecovered)
          const remaining = (state.trainingCards ?? []).filter(c => !cardIds.includes(c.id))
          return {
            trainingCards: remaining,
            players: state.players.map(p =>
              p.id === playerId ? { ...p, ratings: result.ratings, exp: result.exp, traits: newTraits, fatigue: newFatigue } : p
            ),
          }
        })
      },

      // 余りカードの一括変換（EXP等価・ロスなし）。完全休養カードは対象外
      convertCards: (rarity) => {
        const RATE = {
          normal: { need: 4, produce: 1, to: 'rare' as const },
          rare:   { need: 10, produce: 3, to: 'epic' as const },
          epic:   { need: 5, produce: 2, to: 'legendary' as const },
        }[rarity]
        const pool = (get().trainingCards ?? []).filter(c => c.rarity === rarity && c.kind !== 'rest')
        const bundles = Math.floor(pool.length / RATE.need)
        if (bundles === 0) return 0
        const consumeIds = new Set(pool.slice(0, bundles * RATE.need).map(c => c.id))
        const produced = Array.from({ length: bundles * RATE.produce }, () => generateTrainingCard(RATE.to))
        set(s => ({ trainingCards: [...(s.trainingCards ?? []).filter(c => !consumeIds.has(c.id)), ...produced] }))
        return produced.length
      },

      breakStatLimit: (playerId, stat) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player) return state
          const cap = (getStatPotentials(player) as Record<string, number>)[stat]
          if (cap >= 99) return state
          const cost = limitBreakCost(cap + 1)
          if ((state.jewels ?? 0) < cost) return state
          // 上限が確実に+1されるまでboostを積む（現在値>基礎上限のエッジケースで空振りしないように）
          let np: Player = { ...player, potentialBoosts: { ...(player.potentialBoosts ?? {}), [stat]: (player.potentialBoosts?.[stat] ?? 0) + 1 } }
          let guard = 0
          while ((getStatPotentials(np) as Record<string, number>)[stat] <= cap && guard++ < 30) {
            np = { ...np, potentialBoosts: { ...np.potentialBoosts, [stat]: (np.potentialBoosts?.[stat] ?? 0) + 1 } }
          }
          return {
            jewels: state.jewels - cost,
            players: state.players.map(p => p.id === playerId ? np : p),
          }
        })
      },

      dismissDroppedCards: () => set({ raceDroppedCards: [], raceExpGains: {} }),

      dismissBudgetNotice: () => set({ seasonBudgetNotice: null }),

      dismissJoinNotice: (key) => set(s => ({ seenJoinIds: s.seenJoinIds.includes(key) ? s.seenJoinIds : [...s.seenJoinIds, key] })),

      // 負傷通知をOKで確認済みにする（復帰で自動的に対象からも消える。キーは playerId-injuredUntilRace）
      dismissInjuryNotice: (key) => set(s => ({ seenInjuryIds: (s.seenInjuryIds ?? []).includes(key) ? s.seenInjuryIds : [...(s.seenInjuryIds ?? []), key].slice(-100) })),

      // アップデートギフト配布＋期限切れギフトの掃除（毎回起動時に呼ばれる・冪等）。
      // 1.0.6：不具合のお詫びとしてジュエル1000個を配布（受け取り期間1か月）。
      grantUpdateGifts: () => {
        set(state => {
          // 期限切れ（expiresAt を過ぎた）ギフトは毎回掃除する
          const nowISO = new Date().toISOString()
          const pruned = (state.pendingGifts ?? []).filter(g => !g.expiresAt || g.expiresAt >= nowISO)
          const prunedChanged = pruned.length !== (state.pendingGifts ?? []).length

          const GIFT_VERSION = '1.0.6-apology'
          if ((state.giftGivenVersions ?? []).includes(GIFT_VERSION)) {
            return prunedChanged ? { pendingGifts: pruned } : state
          }
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()  // 配布から1か月
          const gift: Gift = {
            id: `gift_${GIFT_VERSION}`,
            title: 'バグ修正のお詫び',
            message: '不具合でご迷惑をおかけしたお詫びに、ジュエル1000個をお贈りします。受け取り期間は配布から1か月です。',
            cards: [],
            jewels: 1000,
            expiresAt,
          }
          return {
            pendingGifts: [...pruned, gift],
            giftGivenVersions: [...(state.giftGivenVersions ?? []), GIFT_VERSION],
          }
        })
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
            giftGivenVersions: [...(state.giftGivenVersions ?? []), MARK],
          }
        })
        // 誤追記バグ（交渉返答が文脈違いで復元される）で汚れた保存チャットログを一度だけ全消去する
        set(state => {
          const CHAT_MARK = 'chatlogs-reset-v1'
          if ((state.giftGivenVersions ?? []).includes(CHAT_MARK)) return state
          return {
            currentSeason: { ...state.currentSeason, chatLogs: {} },
            giftGivenVersions: [...(state.giftGivenVersions ?? []), CHAT_MARK],
          }
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
          const leagues = (state.foreignLeagues ?? []).map(l => ({
            ...l,
            clubs: l.clubs.map(c => ({ ...c, playerIds: [...new Set(c.playerIds)] })),
          }))
          return {
            players: deduped.length !== state.players.length ? deduped : state.players,
            foreignLeagues: leagues,
            giftGivenVersions: [...(state.giftGivenVersions ?? []), ID_MARK],
          }
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
        // フラットロスター化の残骸救済：rosterTier 'second' のままの選手はロスター一覧（main表示）から
        // 消えてしまう（トレード獲得・レンタル返却の旧コード経由）。全員 main に揃える
        set(state => {
          if (!state.players.some(p => p.rosterTier === 'second')) return state
          return { players: state.players.map(p => p.rosterTier === 'second' ? { ...p, rosterTier: 'main' as const } : p) }
        })
        // 未来年の記録の掃除：セーブ破損（時間が巻き戻った状態での上書き）で現在より先の年の
        // 受賞・記録が残ると、2028年に「2030年MVP」パッチが付くような矛盾が起きるため除去する
        set(state => {
          const year = state.currentSeason.year
          const awards = (state.seasonAwards ?? []).filter(a => a.year <= year)
          const ecl = (state.eclHistory ?? []).filter(e => e.year <= year)
          const tops = (state.eventSeasonTops ?? []).filter(t => t.year <= year)
          if (awards.length === (state.seasonAwards ?? []).length
            && ecl.length === (state.eclHistory ?? []).length
            && tops.length === (state.eventSeasonTops ?? []).length) return state
          return { seasonAwards: awards, eclHistory: ecl, eventSeasonTops: tops }
        })
        // 海外クラブの名簿に載っているのに teamId が ''（未所属）になった選手を復元する
        // （旧バージョンで契約満了FA化が海外選手にも効いてしまっていたセーブの救済）
        set(state => {
          const clubByPlayer = new Map<string, string>()
          for (const l of (state.foreignLeagues ?? [])) for (const c of l.clubs) for (const pid of c.playerIds) clubByPlayer.set(pid, c.id)
          let changed = false
          const players = state.players.map(p => {
            if (p.teamId === '' && p.status === 'active' && clubByPlayer.has(p.id)) { changed = true; return { ...p, teamId: clubByPlayer.get(p.id)!, faSinceYear: undefined } }
            return p
          })
          return changed ? { players } : state
        })
        // 二重所属の掃除＋名簿とteamIdの完全同期（毎起動・冪等）。
        // 海外クラブは「クラブ側の名簿(playerIds)」と「選手側のteamId」の二重管理のため、移籍処理で
        // 片方だけ更新されると「所属なし」表示や増殖が起きる。teamId を正として両方向を揃える：
        //  1) 国内チーム所属の選手は海外名簿から除去（増殖の是正）
        //  2) teamId が別のクラブ/無所属なのに名簿に残っている選手は名簿から除去
        //  3) teamId がそのクラブなのに名簿に載っていない選手は名簿へ追加
        set(state => {
          const domesticIds = new Set(state.players.filter(p => p.teamId !== '' && state.teams.some(t => t.id === p.teamId)).map(p => p.id))
          const playerTeamById = new Map(state.players.map(p => [p.id, p.teamId]))
          const playersByClub = new Map<string, string[]>()
          for (const p of state.players) {
            if (p.status !== 'active' || p.teamId === '') continue
            if (!playersByClub.has(p.teamId)) playersByClub.set(p.teamId, [])
            playersByClub.get(p.teamId)!.push(p.id)
          }
          let changed = false
          const leagues = (state.foreignLeagues ?? []).map(l => ({
            ...l,
            clubs: l.clubs.map(c => {
              // 1)+2) teamId がこのクラブでない選手を名簿から外す
              const kept = c.playerIds.filter(id => !domesticIds.has(id) && playerTeamById.get(id) === c.id)
              // 3) teamId がこのクラブなのに名簿に無い選手を加える
              const inClub = playersByClub.get(c.id) ?? []
              const missing = inClub.filter(id => !kept.includes(id))
              if (kept.length !== c.playerIds.length || missing.length > 0) {
                changed = true
                return { ...c, playerIds: [...kept, ...missing] }
              }
              return c
            }),
          }))
          return changed ? { foreignLeagues: leagues } : state
        })
      },

      claimGift: (id) => {
        set(state => {
          const gift = (state.pendingGifts ?? []).find(g => g.id === id)
          if (!gift) return state
          // 期限切れは受け取らせず削除だけする
          if (gift.expiresAt && gift.expiresAt < new Date().toISOString()) {
            return { pendingGifts: (state.pendingGifts ?? []).filter(g => g.id !== id) }
          }
          return {
            trainingCards: [...(state.trainingCards ?? []), ...gift.cards],
            jewels: (state.jewels ?? 0) + (gift.jewels ?? 0),
            pendingGifts: (state.pendingGifts ?? []).filter(g => g.id !== id),
          }
        })
      },

      decideRenewal: (playerId, renew, years = 2) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player || player.teamId !== state.playerTeamId) return state

          const newPending = (state.currentSeason.pendingRenewalDecisions ?? []).filter(id => id !== playerId)

          if (!renew) {
            const newPlayers = state.players.map(p =>
              p.id === playerId ? { ...p, teamId: '', } : p
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
        // 10:00 AM reset: before 10AM counts as previous day。日付はローカル基準で統一（UTCと混ぜない）。
        const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const now = new Date()
        const base = new Date(now)
        if (base.getHours() < 10) base.setDate(base.getDate() - 1)
        const today = localDate(base)
        if (state.lastLoginDate === today) return null

        const prev = new Date(base)
        prev.setDate(prev.getDate() - 1)
        const yesterday = localDate(prev)
        const continued = state.lastLoginDate === yesterday
        const prevStreak = continued ? (state.loginStreak ?? 0) : 0
        const newStreak = prevStreak + 1
        // 買い切り版はログインボーナス常時2倍
        const mult = state.adsRemoved ? 2 : 1
        const daily = 100 * mult
        const weeklyBonus = (newStreak === 7 ? 1000 : 0) * mult
        const gained = daily + weeklyBonus
        set({
          jewels: state.jewels + gained,
          lastLoginDate: today,
          loginStreak: newStreak === 7 ? 0 : newStreak,
          totalLoginDays: (state.totalLoginDays ?? 0) + 1,
        })
        return { daily, weeklyBonus, streak: newStreak }
      },

      watchAd: () => {
        const state = get()
        const today = getAdDay()
        const sameDay = state.lastAdDate === today
        const watched = sameDay ? (state.adsWatchedToday ?? 0) : 0
        if (watched >= ADS_PER_DAY) return null
        set({ jewels: state.jewels + 100, lastAdDate: today, adsWatchedToday: watched + 1 })
        return 100
      },

      setAdsRemoved: (v) => set({ adsRemoved: v }),
      setRaceEventsEnabled: (v) => set({ raceEventsEnabled: v }),
      markTwitterIntroSeen: () => set({ twitterIntroSeen: true }),
      dismissExpiredNegotiation: (id) => set(s => ({ currentSeason: { ...s.currentSeason, expiredNegotiations: (s.currentSeason.expiredNegotiations ?? []).filter(n => n.id !== id) } })),
      dismissFreeTransferNotice: (id) => set(s => ({ currentSeason: { ...s.currentSeason, freeTransferNotices: (s.currentSeason.freeTransferNotices ?? []).filter(n => n.id !== id) } })),
      markFreeContactSeen: (id) => set(s => ({ currentSeason: { ...s.currentSeason, seenFreeContactIds: [...new Set([...(s.currentSeason.seenFreeContactIds ?? []), id])] } })),
      refuseFreeContactRetention: (playerId) => set(s => {
        const fc = (s.currentSeason.incomingOffers ?? []).find(o => o.playerId === playerId && o.offeredPrice === 0)
        if (!fc) return s
        return {
          currentSeason: {
            ...s.currentSeason,
            incomingOffers: (s.currentSeason.incomingOffers ?? []).map(o => o.id === fc.id ? { ...o, retentionRefused: true } : o),
            seenFreeContactIds: [...new Set([...(s.currentSeason.seenFreeContactIds ?? []), fc.id])],
          },
        }
      }),
      dismissDepartureNotice: (id) => set(s => ({ currentSeason: { ...s.currentSeason, departureNotices: (s.currentSeason.departureNotices ?? []).filter(n => n.id !== id) } })),

      updateMyTeam: (patch) => {
        set(s => ({
          teams: s.teams.map(t => t.id === s.playerTeamId ? {
            ...t,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.shortName !== undefined ? { shortName: patch.shortName } : {}),
            ...(patch.gmName !== undefined ? { gmName: patch.gmName } : {}),
            ...(patch.logoId !== undefined ? { logoId: patch.logoId } : {}),
            ...(patch.region !== undefined ? { region: patch.region } : {}),
            ...(patch.city !== undefined ? { city: patch.city } : {}),
          } : t),
        }))
      },

      resetGame: () => {
        // データ削除：ゲーム進行・広告カウント・ログインボーナスはリセット（また受け取れる）するが、
        // 課金(広告なし購入)は「データ」ではなく権利なので維持する。
        // ※アプリのアンインストール時は localStorage ごと消えるので、その場合のみ「購入を復元」が必要。
        const paid = get().adsRemoved
        // 公式Xフォロー案内は「この端末で一度見たか」の記録なので、リセット（新規ゲーム）でも保持する。
        // これをリセットすると毎回案内が出てしまう（最初の起動時1回だけにする）。
        const twSeen = get().twitterIntroSeen
        set({ ...(emptyState() as unknown as GameStore), adsRemoved: paid, twitterIntroSeen: twSeen })
        // ファイル保存(native)はlocalStorageを消しても残るため、初期化状態を即時フラッシュして確定させる。
        // （旧セーブ掃除のため localStorage も従来どおり削除）
        localStorage.removeItem('jpel-manager-save')
        void flushSaveNow()
      },
    }),
    {
      name: 'jpel-manager-save',
      version: 13,
      // iOSはファイル保存（localStorageの5MB制限・同期書き込みを回避）。Webは従来のlocalStorage
      storage: createJSONStorage(() => saveStorage),
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
        // v4→v5: reset career for not-yet-started saves (base players had fake career values hardcoded)
        if (version < 5 && !s.isInitialized && Array.isArray(s.players)) {
          s.players = (s.players as Record<string, unknown>[]).map(p => ({
            ...p,
            career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
          }))
        }
        // v5→v6: initialRank を追加、budget を新グラント額に更新
        if (version < 6 && Array.isArray(s.teams)) {
          const RANK_MAP: Record<string, number> = {
            sapporo: 9, morioka: 16, aomori: 18, sendai: 10,
            tokyo: 1, yokohama: 4, chiba: 8, saitama: 7,
            nagano: 14, niigata: 20, shizuoka: 11, nagoya: 3,
            kyoto: 13, osaka: 2, kobe: 6,
            hiroshima: 12, okayama: 19,
            fukuoka: 5, kagoshima: 15, okinawa: 17,
          }
          s.teams = (s.teams as Record<string, unknown>[]).map(t => {
            const id = t.id as string
            const isPlayer = t.isPlayerControlled as boolean
            const initialRank = RANK_MAP[id] ?? 10
            const newBudget = isPlayer ? 400_000_000 : (RANK_BUDGET[initialRank] ?? 400_000_000)
            return {
              ...t,
              initialRank,
              finance: { ...(t.finance as Record<string, unknown>), budget: newBudget },
            }
          })
        }
        // v7: ロスターをフラット化（1軍/2軍・契約種別を廃止し、単一ロスター(main)へ統合）
        if (version < 7) {
          if (Array.isArray(s.teams)) {
            s.teams = (s.teams as Record<string, unknown>[]).map(t => {
              const roster = (t.roster ?? {}) as { main?: string[]; second?: string[] }
              const merged = Array.from(new Set([...(roster.main ?? []), ...(roster.second ?? [])]))
              return { ...t, roster: { main: merged, second: [] } }
            })
          }
          if (Array.isArray(s.players)) {
            s.players = (s.players as Record<string, unknown>[]).map(p => {
              const contract = (p.contract ?? {}) as Record<string, unknown>
              return { ...p, rosterTier: 'main', dualRegistered: false, contract: { ...contract, contractType: 'standard' } }
            })
          }
        }
        // v8: 既存セーブの予算を新グラント表に合わせる（プレイヤーは最下位20位＝最弱スタート、CPUはinitialRank連動）
        if (version < 8 && Array.isArray(s.teams)) {
          const pid = s.playerTeamId as string | undefined
          s.teams = (s.teams as Record<string, unknown>[]).map(t => {
            const initialRank = (t.initialRank as number) ?? 10
            const isPlayer = t.id === pid || t.isPlayerControlled === true
            const budget = isPlayer ? rankBudgetGrant(20) : rankBudgetGrant(initialRank)
            return { ...t, finance: { ...(t.finance as Record<string, unknown>), budget } }
          })
        }
        // v9: currentSeason.initialBudget が無い旧セーブは、現在のプレイヤー予算を初期予算とみなす（3.5億で埋めないため）
        if (version < 9 && s.currentSeason && (s.currentSeason as Record<string, unknown>).initialBudget == null) {
          const pid = s.playerTeamId as string | undefined
          const myTeam = Array.isArray(s.teams) ? (s.teams as Record<string, unknown>[]).find(t => t.id === pid) : undefined
          const curBudget = myTeam ? ((myTeam.finance as Record<string, unknown>)?.budget as number) : undefined
          s.currentSeason = { ...(s.currentSeason as Record<string, unknown>), initialBudget: curBudget ?? rankBudgetGrant(20) }
        }
        // v10: セーブ肥大化の掃除（既に膨らんだセーブの救済）。
        //  - 過去シーズンから一度も読まれない重いデータ（記録会全結果・ニュース・チャットログ等）を空にする
        //  - チーム歴代記録に選手名を焼き込む（今後の選手データ整理で名前が消えないように）
        //  ※レース結果・順位・世界駅伝・自己ベスト・歴代記録は全て残る
        if (version < 10) {
          if (Array.isArray(s.pastSeasons)) {
            s.pastSeasons = (s.pastSeasons as Record<string, unknown>[]).map(ps => ({
              ...ps,
              individualEvents: [], newsFeed: [], chatLogs: {}, scoutProspects: [], draftPool: [],
              transferListings: [], incomingOffers: [], transferBids: [], contractRequests: [],
              acquisitionOffers: [], retirementRequests: [], transferRequests: [], events: [],
              scoutMissions: [], faVisits: [], pendingTradeOffers: [], scoutedOpponents: [],
            }))
          }
          if (Array.isArray(s.teams) && Array.isArray(s.players)) {
            const nameById = new Map((s.players as Record<string, unknown>[]).map(p => [p.id as string, { name: p.name as string, nationality: p.nationality }]))
            s.teams = (s.teams as Record<string, unknown>[]).map(t => {
              const er = t.eventRecords as Record<string, { playerId: string; playerName?: string; nationality?: unknown; timeSec: number; year: number }[]> | undefined
              if (!er) return t
              const filled = Object.fromEntries(Object.entries(er).map(([k, recs]) => [k, (recs ?? []).map(r => {
                if (r.playerName) return r
                const info = nameById.get(r.playerId)
                return info ? { ...r, playerName: info.name, nationality: info.nationality } : r
              })]))
              return { ...t, eventRecords: filled }
            })
          }
        }
        // v11:
        //  - 区間記録の重複掃除（同一選手は最速の1本だけ残す。以後は保存時に集約される）
        //  - 旧セーブに現行定義のリーグ/クラブが欠けている場合の補完（クラブごと消えて見える問題の救済）
        if (version < 11) {
          if (s.segmentRecords && typeof s.segmentRecords === 'object') {
            type SegRec = { playerId?: string; playerName?: string; timeSec: number }
            s.segmentRecords = Object.fromEntries(Object.entries(s.segmentRecords as Record<string, SegRec[]>).map(([k, recs]) => {
              const best = new Map<string, SegRec>()
              for (const r of recs ?? []) {
                const pkey = r.playerId ?? r.playerName ?? '?'
                const cur = best.get(pkey)
                if (!cur || r.timeSec < cur.timeSec) best.set(pkey, r)
              }
              return [k, [...best.values()].sort((a, b) => a.timeSec - b.timeSec).slice(0, 10)]
            }))
          }
          if (s.isInitialized && Array.isArray(s.foreignLeagues) && Array.isArray(s.players)) {
            const saved = s.foreignLeagues as { id: string; clubs: { id: string }[] }[]
            // 定義にあるのにセーブに無いリーグ/クラブを洗い出す
            const toGenerate = FOREIGN_LEAGUES.flatMap(def => {
              const sl = saved.find(l => l.id === def.id)
              const missingClubs = sl ? def.clubs.filter(c => !sl.clubs.some(sc => sc.id === c.id)) : def.clubs
              return missingClubs.length > 0 ? [{ ...def, clubs: missingClubs.map(c => ({ ...c, playerIds: [] as string[] })) }] : []
            })
            if (toGenerate.length > 0) {
              const year = ((s.currentSeason as Record<string, unknown>)?.year as number) ?? 2027
              const gen = generateForeignLeaguePlayers(toGenerate, year)
              s.players = [...(s.players as unknown[]), ...gen.players]
              // 生成済みクラブを既存リーグへ合流（リーグごと無ければ丸ごと追加）
              const genByLeague = new Map(gen.updatedLeagues.map(l => [l.id, l]))
              const merged = saved.map(sl => {
                const gl = genByLeague.get(sl.id)
                return gl ? { ...sl, clubs: [...sl.clubs, ...gl.clubs] } : sl
              })
              for (const gl of gen.updatedLeagues) {
                if (!merged.some(l => l.id === gl.id)) merged.push(gl as unknown as (typeof merged)[0])
              }
              s.foreignLeagues = merged
              // 補完したリーグの順位表が currentSeason に無いと表示が壊れるので、欠けている分だけ初期化して足す
              const cs = (s.currentSeason ?? {}) as Record<string, unknown>
              const standings = { ...((cs.foreignStandings as Record<string, unknown>) ?? {}) }
              const initAll = initForeignStandings(merged as Parameters<typeof initForeignStandings>[0])
              for (const [lid, st] of Object.entries(initAll)) {
                if (!standings[lid]) standings[lid] = st
              }
              s.currentSeason = { ...cs, foreignStandings: standings }
            }
          }
        }
        // v13: ECL戦名を「ECL 第X戦」→「ECL コース名」へ（生成側の命名変更に既存セーブを合わせる）。
        // 選手詳細の出走履歴は過去シーズンのECL戦名も読むので、currentSeasonだけでなくpastSeasonsも全部直す
        if (version < 13) {
          const renameRaces = (races: { name: string; location: string }[]) =>
            races.map(r => {
              if (!/^ECL 第\d+戦$/.test(r.name)) return r
              const course = ECL_COURSES.find(c => c.location === r.location)
              return course ? { ...r, name: `ECL ${course.name}` } : r
            })
          const renameSeason = (season: Record<string, unknown>) => {
            const series = season.eclSeries as { races?: { name: string; location: string }[] } | undefined
            if (!series?.races) return season
            return { ...season, eclSeries: { ...series, races: renameRaces(series.races) } }
          }
          if (s.currentSeason) s.currentSeason = renameSeason(s.currentSeason as Record<string, unknown>)
          if (Array.isArray(s.pastSeasons)) s.pastSeasons = (s.pastSeasons as Record<string, unknown>[]).map(renameSeason)
        }
        return s
      },
      // 古いセーブで currentSeason に欠けているフィールドを初期値で補完する。
      // （新バージョンで追加された配列フィールド等が undefined のままだと、参照時に
      //   クラッシュ→ボタン無反応・進行不可になるため、ロード時に一括で埋める）
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<typeof currentState>
        // ECL戦名「ECL 第X戦」→「ECL コース名」（migrateはバージョンスタンプ済みだと走らないので、毎回ここで冪等に直す）
        const renameEcl = <T extends { eclSeries?: { races: { name: string; location: string }[] } }>(season: T): T => {
          if (!season?.eclSeries?.races?.some(r => /^ECL 第\d+戦$/.test(r.name))) return season
          return {
            ...season,
            eclSeries: {
              ...season.eclSeries,
              races: season.eclSeries.races.map(r => {
                if (!/^ECL 第\d+戦$/.test(r.name)) return r
                const course = ECL_COURSES.find(c => c.location === r.location)
                return course ? { ...r, name: `ECL ${course.name}` } : r
              }),
            },
          }
        }
        // ECL開催日を「リーグ戦の中間日」へ再配置（生成時の修正は来季からしか効かないので、既存セーブもここで直す。消化済みの戦は動かさない）
        const fixEclDates = (season: typeof currentState.currentSeason): typeof currentState.currentSeason => {
          const series = season.eclSeries
          if (!series?.races?.length || !season.races?.length) return season
          const leagueDates = season.races.map(r => r.date).sort()
          const midDate = (target: string): string => {
            const prev = [...leagueDates].filter(d => d <= target).pop()
            const next = leagueDates.find(d => d > target)
            if (!prev || !next) return target
            const mid = new Date((new Date(prev).getTime() + new Date(next).getTime()) / 2)
            return `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}-${String(mid.getDate()).padStart(2, '0')}`
          }
          let changed = false
          const races = series.races.map(r => {
            if (r.results) return r
            const d = midDate(r.date)
            if (d === r.date) return r
            changed = true
            return { ...r, date: d }
          })
          return changed ? { ...season, eclSeries: { ...series, races } } : season
        }
        if (p.currentSeason) p.currentSeason = fixEclDates(renameEcl(p.currentSeason))
        if (Array.isArray(p.pastSeasons)) p.pastSeasons = p.pastSeasons.map(renameEcl)
        return {
          ...currentState,
          ...p,
          currentSeason: { ...currentState.currentSeason, ...(p.currentSeason ?? {}) },
        }
      },
    }
  )
)

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// 距離別ベストタイム(秒)の能力アンカー[能力値, 秒]。コンディション最高(form+2/疲労0/モラール80+)での値。
//  能力: 50 / 70 / 90 / 99
//  5000: 14:30 13:45 13:00 12:30
//  10000:29:30 28:15 27:00 26:00
//  ハーフ:65:00 62:00 59:00 57:00
//  マラソン:2:13 2:09 2:04 2:00
const IND_ANCHORS: Record<number, [number, number][]> = {
  5000:  [[50, 870], [70, 825], [90, 780], [99, 750]],
  10000: [[50, 1770], [70, 1695], [90, 1620], [99, 1560]],
  21097: [[50, 3900], [70, 3720], [90, 3540], [99, 3420]],
  42195: [[50, 7980], [70, 7740], [90, 7470], [99, 7200]],  // 90は2:04:30（日本記録級が量産されない傾きに）。99=世界記録レベルは設計通り
}

// 種目別のステータス比率。OVRではなくこの加重平均（種目適性値）で基準タイムを引く。
// 短い種目ほどスピード、長い種目ほどスタミナ・回復・ペース配分・精神が効く。山岳系は対象外。
const IND_STAT_WEIGHTS: Record<number, { speed: number; stamina: number; pacing: number; mental: number; recovery: number }> = {
  5000:  { speed: 0.50, stamina: 0.20, pacing: 0.12, mental: 0.10, recovery: 0.08 },
  10000: { speed: 0.35, stamina: 0.30, pacing: 0.15, mental: 0.10, recovery: 0.10 },
  21097: { speed: 0.18, stamina: 0.40, pacing: 0.20, mental: 0.10, recovery: 0.12 },
  42195: { speed: 0.08, stamina: 0.42, pacing: 0.18, mental: 0.14, recovery: 0.18 },
}

// 種目適性値: 種目ごとのステータス加重平均
export function individualEventAbility(player: Player, distance: 5000 | 10000 | 21097 | 42195): number {
  const w = IND_STAT_WEIGHTS[distance]
  const r = player.ratings
  return r.speed * w.speed + r.stamina * w.stamina + r.pacing * w.pacing + r.mental * w.mental + r.recovery * w.recovery
}

// 種目適性値から距離別ベストタイム(コンディション最高時)。アンカーを区分線形で通し、50未満は最下段の傾きで延長。
function individualBaseTime(o: number, distance: 5000 | 10000 | 21097 | 42195): number {
  const pts = IND_ANCHORS[distance]
  const oo = Math.min(99, o)
  if (oo <= pts[0][0]) {
    const [o0, t0] = pts[0], [o1, t1] = pts[1]
    return t0 + (pts[0][0] - oo) * (t0 - t1) / (o1 - o0)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [o0, t0] = pts[i], [o1, t1] = pts[i + 1]
    if (oo >= o0 && oo <= o1) return t0 + (oo - o0) * (t1 - t0) / (o1 - o0)
  }
  return pts[pts.length - 1][1]
}

export function simulateIndividualTime(player: Player, distance: 5000 | 10000 | 21097 | 42195, weather?: 'sunny' | 'cloudy' | 'rainy' | 'windy'): number {
  const o = individualEventAbility(player, distance)
  const base = individualBaseTime(o, distance)  // コンディション最高でのベスト
  // 割合ペナルティは距離に比例して絶対秒が膨らむ（同じ2%でも5000mは+17秒、マラソンは+2.5分）。
  // ハーフ以上は影響を距離に応じて圧縮し、マラソンでも天候・ぶれによる遅れが最大1分程度に収まるようにする
  const distDamp = distance <= 10000 ? 1 : 10000 / distance
  // コンディション低下ペナルティ（最高で0＝アンカー通り）
  const formPen = (2 - (player.form ?? 0)) * 4
  const fatiguePen = base * ((player.fatigue ?? 0) / 100) * 0.05 * distDamp   // 疲労で最大+5%（長距離は圧縮）
  const moralePen = Math.max(0, 80 - (player.morale ?? 70)) * 0.12
  const noise = Math.random() * base * 0.03 * distDamp                        // 毎回0〜+3%のぶらつき（長距離は圧縮）
  // 天気補正（レースと同じ関数）。performance倍率を時間係数(2-mod)に反転して適用し、長距離では圧縮
  const weatherExcess = weather
    ? (2 - calcWeatherModifier(weather, player.specialty, player.ratings.stamina, player.ratings.mental)) - 1
    : 0
  const weatherFactor = 1 + weatherExcess * distDamp
  const t = (base + formPen + fatiguePen + moralePen + noise) * weatherFactor
  return Math.max(400, Math.round(t))
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
// CPUチームの今季の運用方針。前年順位と主力の平均年齢から決める。
// contend=勝ちにいく（ベテランでも即戦力を補強）, rebuild=若手刷新（今季は捨て若手中心）, balanced=中庸。
function cpuStrategy(lastRank: number, totalTeams: number, avgAge: number): 'contend' | 'rebuild' | 'balanced' {
  if (avgAge >= 30) return 'contend'          // 主力が高齢＝今のうちに勝負
  if (avgAge <= 24) return 'rebuild'          // 若い核＝育成路線
  if (lastRank > 0 && lastRank <= 4) return 'contend'                 // 上位＝優勝を狙いにいく
  if (lastRank >= totalTeams - 3) return 'rebuild'                     // 下位＝再建
  return 'balanced'
}

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

// 海外クラブからの移籍オファー ＋ 相手からのレンタル打診（双方向）を生成。チャットで対応する。
function generateForeignAndLoanOffers(params: {
  players: Player[]
  teams: Team[]
  foreignClubs: { id: string; name: string; shortName: string; playerIds: string[] }[]
  playerTeamId: string
  raceIndex: number
  windowOpen: boolean
  existingIncoming: IncomingOffer[]
  existingLoans: IncomingLoanOffer[]
  races?: Race[]   // 出場機会の判定用（borrow_in打診は出番のない選手から選ぶ）
  retiringIds?: Set<string>   // 引退希望中の選手（オファー・打診の対象外）
}): { foreignIncoming: IncomingOffer[]; loanOffers: IncomingLoanOffer[] } {
  const { players, teams, foreignClubs, playerTeamId, raceIndex, windowOpen, existingIncoming, existingLoans, races, retiringIds } = params
  const foreignIncoming: IncomingOffer[] = []
  const loanOffers: IncomingLoanOffer[] = []
  if (!windowOpen) return { foreignIncoming, loanOffers }

  const myPlayers = players.filter(p => p.teamId === playerTeamId && p.status === 'active')
  const myMain = myPlayers.filter(p => p.rosterTier === 'main' && !p.loan)
  // 貸出歓迎（移籍方針）に設定した選手。年齢・立場の制限なしで打診対象になる。引退希望中は対象外
  const myLoanListed = myPlayers.filter(p => !p.loan && p.loanListed && !p.transferListed && !retiringIds?.has(p.id))
  const myYoung = myPlayers.filter(p => !p.loan && p.age <= 23 && !retiringIds?.has(p.id))
  const offeredIds = new Set(existingIncoming.map(o => o.playerId))
  const loanTargetIds = new Set(existingLoans.map(o => o.playerId))
  const aiTeams = teams.filter(t => t.id !== playerTeamId)

  // 1) 海外クラブからの移籍オファー（自チームの上位選手を狙う）
  if (foreignClubs.length > 0 && myMain.length > 0 && Math.random() < 0.30) {
    // 高齢選手（33歳以上）・引退希望中は狙わない（移籍金を払ってまで獲得しない）
    const target = [...myMain].filter(p => !offeredIds.has(p.id) && !p.noSale && ovr(p) >= 74 && p.age <= 32 && !retiringIds?.has(p.id)).sort((a, b) => ovr(b) - ovr(a))[0]
    if (target) {
      const club = foreignClubs[(ovr(target) + raceIndex) % foreignClubs.length]
      const tv = calcTransferValue(target)
      foreignIncoming.push({ id: `finc-${raceIndex}-${club.id}-${target.id}`, fromTeamId: club.id, playerId: target.id, offeredPrice: Math.max(1000000, Math.round(tv * (0.95 + Math.random() * 0.25) / 1000000) * 1000000), expiresAtRace: raceIndex + 5, round: 1, fromForeign: true })
    }
  }

  // 2) レンタル打診：相手（国内/海外）が自チームの選手を借りたい（lend_out）。
  // 貸出歓迎に設定した選手がいれば優先的・高確率（70%）でその中から。いなければ従来どおり低確率で若手に
  {
    const listedCands = myLoanListed.filter(p => !loanTargetIds.has(p.id))
    const youngCands = myYoung.filter(p => !loanTargetIds.has(p.id)).sort((a, b) => ovr(b) - ovr(a))
    const target = listedCands.length > 0 && Math.random() < 0.70
      ? listedCands[(raceIndex + listedCands.length) % listedCands.length]
      : (youngCands.length > 0 && Math.random() < 0.25 ? youngCands[0] : null)
    if (target) {
      const pool: { id: string; fromForeign: boolean }[] = [...aiTeams.map(t => ({ id: t.id, fromForeign: false })), ...foreignClubs.map(c => ({ id: c.id, fromForeign: true }))]
      if (pool.length > 0) {
        const from = pool[(ovr(target) + raceIndex) % pool.length]
        loanOffers.push({ id: `loanout-${raceIndex}-${from.id}-${target.id}`, fromTeamId: from.id, playerId: target.id, direction: 'lend_out', years: 1 + (target.age % 2), expiresAtRace: raceIndex + 3, fromForeign: from.fromForeign })
      }
    }
  }

  // 3) レンタル打診：相手が自チームに選手を貸したい（borrow_in・国内チームのみ）。
  // クラブが貸しに出すのは「出番のない選手」：出場率が低い26歳以下から、こちらの補強ニーズに合う選手を優先して提示
  if (aiTeams.length > 0 && Math.random() < 0.20) {
    const myNeedsLoan = cpuSpecialtyNeeds(playerTeamId, players)
    const playFrac = (pid: string) => raceIndex > 0 && races ? seasonAppearances(pid, races) / raceIndex : 0
    const cands = players.filter(p =>
      p.teamId !== playerTeamId && p.teamId !== '' && aiTeams.some(t => t.id === p.teamId)
      && p.status === 'active' && !p.loan && p.age <= 26 && ovr(p) < 76 && !loanTargetIds.has(p.id)
      && playFrac(p.id) < 0.35)   // 出場率3.5割未満＝現所属で干されている選手だけが貸しに出される
    const fits = cands.filter(p => myNeedsLoan.includes(p.specialty))
    // 干され組の中では実力上位を提示（借りる価値のある選手にする）
    const cand = (fits.length > 0 ? fits : cands).sort((a, b) => ovr(b) - ovr(a))[0]
    if (cand) {
      loanOffers.push({ id: `loanin-${raceIndex}-${cand.teamId}-${cand.id}`, fromTeamId: cand.teamId, playerId: cand.id, direction: 'borrow_in', years: 1, expiresAtRace: raceIndex + 3 })
    }
  }

  return { foreignIncoming, loanOffers }
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
  retiringIds: Set<string> = new Set(),  // 引退希望中の選手（オファー・接触の対象外にする）
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

  // Incoming offers targeting the player's team（非売リスト・引退希望中の選手には来ない）
  const playerTeamPlayers = players.filter(p => p.teamId === playerTeamId && p.rosterTier === 'main' && p.status !== 'retired' && !p.loan && !p.noSale && !retiringIds.has(p.id))
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

    // 高齢選手（34歳超）は移籍金オファーの対象外。並びも年齢調整OVR（33歳以上は減点）で若い実力者を優先
    let targets = playerTeamPlayers.filter(p => !offerTargets.has(p.id) && ovr(p) >= minTargetOvr && p.age <= 34)
    // Prioritize players who want to leave
    const wantLeaveTargets = targets.filter(p => wantToLeaveIds.has(p.id))
    if (wantLeaveTargets.length > 0) targets = wantLeaveTargets
    else {
      const specTargets = targets.filter(p => needs.includes(p.specialty))
      if (specTargets.length > 0) targets = specTargets
    }
    if (targets.length === 0) continue
    const adjOvr = (p: Player) => ovr(p) - Math.max(0, p.age - 32) * 3
    targets.sort((a, b) => adjOvr(b) - adjOvr(a))
    const target = targets[0]
    const tv = calcTransferValue(target)
    // Realistic offer: 85-105% for elite, 80-97% for others
    const ratio = tier === 'elite' ? (0.85 + Math.random() * 0.20) : (0.80 + Math.random() * 0.17)
    newIncoming.push({ id: `inc-${raceIndex}-${team.id}-${target.id}`, fromTeamId: team.id, playerId: target.id, offeredPrice: Math.max(1000000, Math.round(tv * ratio / 1000000) * 1000000), expiresAtRace: raceIndex + 5, round: 1 })
    offerTargets.add(target.id)
    offeringTeams.add(team.id)
  }

  // Competing bids for player-listed players (more likely for high-OVR players)
  // 自チームの出品への入札（オファーチャット）。
  // lst-allow-（移籍を認めた／移籍方針の売出）はチャット対応なしの自動売却専用なのでオファーを生成しない
  const myListings = [...validListings, ...newListings].filter(l => l.fromTeamId === playerTeamId && !l.id.startsWith('lst-allow-'))
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
        expiresAtRace: raceIndex + 5,
        round: 1,
      })
      alreadyOfferedIds.add(p.id)
      break
    }
  }

  // 契約残りわずか（残1年以下）の自チーム選手には、他チームからフリー移籍（移籍金なし）のオファーが来る
  // レンタルで借りている選手は保有権が無いので対象外。引退希望中の選手は「引退か引き留めか」の話なので勧誘しない
  const expiringMine = players.filter(p => p.teamId === playerTeamId && p.contract.yearsLeft <= 1 && p.status !== 'retired' && !p.loan && !retiringIds.has(p.id))
  for (const ep of expiringMine) {
    if (alreadyOfferedIds.has(ep.id)) continue
    const chance = ovr(ep) >= 75 ? 0.5 : ovr(ep) >= 65 ? 0.3 : 0.15
    if (Math.random() >= chance) continue
    const suitor = aiTeams.find(t => !offeringTeams.has(t.id))
    if (!suitor) continue
    newIncoming.push({
      id: `inc-free-${raceIndex}-${suitor.id}-${ep.id}`,
      fromTeamId: suitor.id,
      playerId: ep.id,
      offeredPrice: 0, // フリー移籍（移籍金なし・GMは関与できず、期限が来たら本人が決断する）
      expiresAtRace: raceIndex + 3,
      round: 1,
    })
    alreadyOfferedIds.add(ep.id)
    offeringTeams.add(suitor.id)
  }

  return { listings: [...validListings, ...newListings], incomingOffers: [...validIncoming, ...newIncoming] }
}

type RatingsKey = keyof import('../types').Ratings

// ── EXP システム（設計書準拠） ─────────────────────────────────────────────

/** L→L+1 に必要なEXP。L<80: ×1 / 80≤L<90: ×2 / 90≤L: ×4（設計書どおり。緩和版1.5/2は廃止） */
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
  caps: Partial<Record<CardStatKey, number>>,
): { ratings: Player['ratings']; exp: Partial<Record<CardStatKey, number>> } {
  const newRatings = { ...ratings }
  const newExp = { ...exp }
  const capOf = (stat: CardStatKey) => Math.min(99, caps[stat] ?? 99)
  for (const [stat, baseGain] of Object.entries(gains) as [CardStatKey, number][]) {
    // 既に能力別ポテンシャル上限に達している能力はEXPを加算しない（カード・EXPの無駄を防ぐ）。
    const cur0 = (newRatings as Record<string, number>)[stat] ?? 0
    if (cur0 >= capOf(stat)) continue
    const gain = Math.round(baseGain * potMult * ageMult)
    if (gain <= 0) continue
    newExp[stat] = (newExp[stat] ?? 0) + gain
  }
  const STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
  for (const stat of STAT_KEYS) {
    const cap = capOf(stat)
    let cur = (newRatings as Record<string, number>)[stat] ?? 0
    let acc = newExp[stat] ?? 0
    while (cur < cap && acc > 0) {
      const req = requiredExpForLevel(cur)
      if (acc < req) break
      acc -= req
      cur++
    }
    ;(newRatings as Record<string, number>)[stat] = cur
    // 上限到達時は余剰EXPを残さない（無駄に溜め込まない）
    newExp[stat] = cur >= cap ? 0 : acc
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

// growPlayer: 年齢増加・自然老化（ピーク後の衰え）＋加齢によるポテンシャル上限の減衰。
// 自チームの成長はレース/カードEXPで行うため allowAnnualGrowth=false。
// CPU/海外は allowAnnualGrowth=true で毎年ポテンシャル上限へ向けて成長させる（高数値ほど鈍化）。
const GROW_KEYS: RatingsKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
function growPlayer(p: Player, allowAnnualGrowth = false): Player {
  const peakAge = p.growthCurve === 'early' ? 24 : p.growthCurve === 'normal' ? 27 : 30
  const nextAge = p.age + 1
  const ageDiff = nextAge - peakAge
  const ratings = { ...p.ratings }
  const primary = getPrimaryKey(p.specialty)

  // 加齢でポテンシャル上限自体が下がる。35歳以降は急に（37歳でエースが85のまま等を防ぐ）。
  let potential = p.potential
  if (nextAge >= 37) potential = Math.max(45, potential - 3)
  else if (nextAge >= 35) potential = Math.max(45, potential - 2)
  else if (ageDiff >= 1) potential = Math.max(50, potential - (ageDiff >= 6 ? 2 : 1))
  const caps = getStatPotentials({ ...p, potential })  // 減衰後の上限で頭打ち

  // CPU/海外の年次成長：成長期(ピーク前)のみ、各能力を上限へ向けて少しずつ。
  // カーブは初期生成(bakeAgeGrowth)と同一に揃える。以前は80以上でほぼ停止するカーブだったため、
  // ポテンシャル85級の新人が72前後で頭打ちになり、初期生成の強い世代が引退する7〜8年目に
  // リーグのエース層(OVR85+)が枯れて「同じメンバーで余裕で勝てる」状態になっていた
  if (allowAnnualGrowth && nextAge <= peakAge + 1) {
    // 若手の成長を底上げ（⑤：一斉引退後にドラフト/FA補充された若手が育ち切らず、強豪が急落して戻れない対策）。
    // 中ポテンシャル(75+)を1.0→1.3、低(＜75)を0.6→0.85に強化。成長窓もピーク+1年まで延長。
    const potFactor = potential >= 87 ? 1.8 : potential >= 75 ? 1.3 : 0.85
    for (const stat of GROW_KEYS) {
      const cur = ratings[stat]
      const cap = caps[stat]
      if (cur >= cap) continue
      const diff = cur >= 90 ? 0.5 : cur >= 82 ? 0.8 : cur >= 72 ? 1.0 : 1.2
      const gain = Math.round(rnd(0, 2) * potFactor * diff)
      if (gain > 0) ratings[stat] = Math.min(cap, cur + gain)
    }
  }

  // 衰え。35歳以降は絶対年齢で急激に落とす（37歳で85バリバリを防ぐ）。身体系を大きく、経験系はやや。
  const PHYS: RatingsKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'recovery']
  if (nextAge >= 37) {
    for (const s of PHYS) ratings[s] = Math.max(20, ratings[s] - rnd(3, 6))
    ratings.mental = Math.max(20, ratings.mental - rnd(1, 3))
    ratings.pacing = Math.max(20, ratings.pacing - rnd(1, 3))
  } else if (nextAge >= 35) {
    for (const s of PHYS) ratings[s] = Math.max(20, ratings[s] - rnd(2, 4))
    ratings.mental = Math.max(20, ratings.mental - rnd(0, 2))
    ratings.pacing = Math.max(20, ratings.pacing - rnd(0, 2))
  } else if (ageDiff >= 4) {
    // ピーク超過（35歳未満）：中程度の衰え。ピークから離れるほど加速する
    // （33〜34歳の高OVRがほぼ落ちず「いつ衰えるねん」となる問題の対策）
    const sev = ageDiff >= 6 ? 2 : 1
    ratings[primary] = Math.max(20, ratings[primary] - rnd(1, 2) * sev)
    if (Math.random() < 0.70) ratings.stamina = Math.max(20, ratings.stamina - rnd(1, 2) * sev)
    if (Math.random() < 0.50) ratings.recovery = Math.max(20, ratings.recovery - sev)
    if (Math.random() < 0.40) ratings.speed = Math.max(20, ratings.speed - sev)
    if (Math.random() < 0.30) ratings.mountainUp = Math.max(20, ratings.mountainUp - sev)
    if (Math.random() < 0.30) ratings.mountainDown = Math.max(20, ratings.mountainDown - sev)
  } else if (ageDiff >= 1) {
    // 初期衰え: 身体系がわずかに落ちるが経験でカバー
    if (Math.random() < 0.30) ratings[primary] = Math.max(20, ratings[primary] - 1)
    if (Math.random() < 0.20) ratings.stamina = Math.max(20, ratings.stamina - 1)
    if (Math.random() < 0.35) ratings.mental = Math.min(caps.mental, ratings.mental + 1)
    if (Math.random() < 0.30) ratings.pacing = Math.min(caps.pacing, ratings.pacing + 1)
  }
  // 成長期・ピーク前後: レース/カードEXPに委ねる（growPlayerでは変化なし）

  return {
    ...p,
    age: nextAge,
    yearsPro: p.yearsPro + 1,
    ratings,
    potential,
    fatigue: 5,
    form: 0,
    morale: Math.min(100, (p.morale ?? 70) + 5),
    contract: { ...p.contract, yearsLeft: Math.max(0, p.contract.yearsLeft - 1) },
  }
}

// calcTransferValue は playerUtils に一本化（重複を排除）。この行より上の import から使用する。

function buildInitialNews() {
  return [
    { date: '2027-03-01', headline: 'JPELドラフト完了！各球団が新体制でシーズン準備へ', category: 'draft' as const, relatedIds: [] },
    { date: '2027-03-05', headline: '出雲開幕戦まであと10日——各球団の仕上がりは？', category: 'race' as const, relatedIds: [] },
    { date: '2027-03-08', headline: '第1回JPEL開幕直前！注目のルーキーたちを紹介', category: 'draft' as const, relatedIds: [] },
  ]
}
