import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { saveStorage, flushSaveNow, deleteSaveForRecovery } from './saveStorage'
import { setSaveHealth } from './saveHealth'
import { markDataUpdateNeeded } from './dataUpdate'
import type { GameState, Player, Team, RaceResults, TransferListing, IncomingOffer, IncomingLoanOffer, LoanRequest, LoanResponse, TradeNegotiation, ContractRequest, AcquisitionOffer, AITradeOffer, TeamRole, ForeignCategory, FacilityKey, Achievement, CardRarity, CardStatKey, TrainingCard, Gift, Ratings, Race, TransferRecord, SeasonAward, EclStanding, Nationality, Specialty, SeasonStanding, ExpiredNegotiation, ExpiredNegKind } from '../types'
import type { ISim } from '../engine/interactiveRace'
import { SPECIALTY_LABELS } from '../types'
import { INITIAL_TEAMS } from '../data/teams'
import { BASE_PLAYERS } from '../data/players'
import { SEASON_2027_RACES, generateSeasonRaces, generateIndividualEvents } from '../data/races'
import { generateDraftPool, buildDraftOrder, generateCpuRosters, generateForeignLeaguePlayers, refreshForeignLeagues, nationalityToForeignCategory, generatePlayerInitialRoster, generateJpelForeignName } from '../engine/playerGenerator'
import { simulateRace, buildAILineup, assignLineupByTerrain, calcWeatherModifier } from '../engine/raceEngine'
import { generateRaceEvents } from '../engine/eventEngine'
import { simulateForeignLeagueRound, applyForeignChampions, initForeignStandings } from '../engine/foreignLeague'
import { individualEventAbility, individualBaseTime, formatRaceTime } from '../utils/eventTime'
import { runWorldAthleticsYear, hostForYear, qualHostForYear, hostTerrain, WA_HOST_CITY, qualifyNations, simulateContinentalQualifiers, ekidenCandidates, ekidenCandidatesWithFit, autoSelectEkiden, nationStrength, selectIndividualFields, simulateIndividuals, composeQualifierResult, composeMainResult, ekidenSegmentPoints, waRaceDate, WA_CLOSING_DATE } from '../engine/worldAthletics'
import { simulateEclEvent, lineupFor as terrainLineupFor, ensureAllSegments as fillAllSegments } from '../engine/ecl'
import type { EclParticipant } from '../engine/ecl'
import { natLabel, natGeoRegion, natStrengthRegion, isForeignNat, NAT_LABEL } from '../data/nationalities'
import { buildEclParticipants, buildEclRaces, eclDateBetweenLeagueRaces } from '../engine/eclSeries'
import { ECL_COURSES } from '../data/eclCourses'
import { simulateForeignTransferMarket, simulateCrossBorderTransfers } from '../engine/foreignTransfers'
import { segmentType, segTypeExpGain, applyGrowth } from '../engine/growth'
import { ovr, peakAgeOf, faMarketSalary, seasonPerfProfile, foreignPerfProfile, playerConsentToMove, freeContactConsent, seasonAppearances, isDataKeyPlayer, keyPlayerStatus, calcTransferValue, racesConsumed, getStatPotentials, limitBreakCost, packForeignApps } from '../utils/playerUtils'
import { roundRobin } from '../utils/roundRobin'
import type { PerfProfile } from '../utils/playerUtils'
import { resolveBid } from '../utils/transferBid'
import { getAdDay, ADS_PER_DAY } from '../utils/ads'
import { computeNextSeasonBudget, rankBudgetGrant, effectiveGrant, RANK_BUDGET, runningCost, draftPickValue, pickKeyValue, roundFee, counterCeiling, POACH_PREMIUM, leagueDutyGrantCut, racePrizeByRank, cpuSeasonRaceIncome, DEFICIT_RESCUE_BUDGET } from '../data/economy'
import { canSignContract, canReleaseFromRoster, ROSTER_MAX, ROSTER_MIN, teamRosterSize } from '../data/rosterRules'
import type { OfferOutcome } from '../utils/offerResult'
import { generateDropCards, detectCombo, MAX_FUSION_CARDS, RARITY_EXP, planExchange, type CardExchange } from '../utils/cardCombo'
import { FOREIGN_LEAGUES } from '../data/foreignLeagues'
// 過去シーズンに「何を残すか」は archiveSeason.ts に集約してある（保存時・移行時で同じ形になる）
import { archiveSeason, toArchivedShape } from '../utils/archiveSeason'
// セーブに「何を書かないか」は ephemeralState.ts に集約してある（画面の開閉状態と読まれない残骸）
import { EPHEMERAL_KEYS, stripEphemeral } from './ephemeralState'
// 「どの選手がどのチームに居るか」は rosterSync.ts に集約（player.teamId が正・team.roster は組み直す）
import { squadPlayersOf, squadIdsOf, rebuildRosters, belongsToClub, clubMembersByClub } from '../utils/rosterSync'
import { reconcileTalks, openWishIds, STALE_TRADE_MSG } from '../utils/talkSync'
// 選手がクラブを移るときの後始末は movePlayer.ts に集約（所属・名簿・移籍金・履歴・レンタル）
import type { DepartureNotice } from '../utils/movePlayer'
import { movePlayer } from '../utils/movePlayer'
import { isOwnedBy, canBePoached, canReceiveFreeContact, canGoOverseasDream, canListForSale, canLoanOut, canTradeAway, canAcceptOfferFor, canWishTransfer } from '../utils/transferEligibility'
import { contractTalkCtx, canOfferRenewal, canRequestRenewal, canReNegotiate, isLiveContract, liveContractOf, hasContractTalk, MAX_CONTRACT_ROUNDS } from '../utils/contractTalk'
// トレードの釣り合いの判断（下限・上限・主力割増・OVR差）は tradeValue.ts の1箇所
import { tradeValues, faceValueOf, tradeBalance, tradeNotLopsided, TRADE_MIN_RATIO, TRADE_OK_RATIO, TRADE_HARD_NO_RATIO, AI_OFFER_GAIN_MIN, AI_OFFER_GAIN_MAX } from '../utils/tradeValue'
import type { TradeValueCtx } from '../utils/tradeValue'
import { findClub, domesticTeamIdSet as domesticTeamIdSet_ } from '../utils/clubs'
// 監督の在任履歴と、他チームからの監督オファー
import { startTenure, gmSeasonRanks, gmCareerTotals } from '../utils/gmTenure'
import { makeGmOffer } from '../utils/gmOffer'
import { restoreTeamIdsFromLegacyClubs, dropLegacyClubRosters } from '../utils/legacyClubRoster'
// 引退選手の「引退時の所属」を旧セーブに埋める処理（記録室の国内限定ランキング用）
import { backfillRetiredTeamIds } from '../utils/retiredTeamBackfill'
import { generateSponsorOffers } from '../data/sponsors'
import { computeSeasonAwards, seasonAwardsOf } from '../utils/awards'
import { eclHistoryOf } from '../utils/eclHistory'
import { withCareerCounts, stripCareerForSave } from '../utils/careerStats'
import { segmentRecordsOf } from '../utils/segmentRecords'
import { teamHistoriesOf, teamHistoryOf, EMPTY_TEAM_HISTORY, type TeamHistoryMap } from '../utils/teamHistory'
import { rankedStandings, rankOfTeam, draftRoundOf, divisionOf, teamsInDivision } from '../utils/league'

type DraftState = {
  pool: Player[]
  pickOrder: string[]       // teamId[] 40 picks
  currentPick: number       // 0-based index
  picks: { pickNumber: number; teamId: string; playerId: string; playerName: string }[]
  isComplete: boolean
  // 指名後の「契約を決める画面」まで終わったか。
  // isComplete だけだと2年目以降（isInitialized=true）は契約画面が一瞬で閉じてしまうため、
  // この旗が立つまで DraftRoom を表示し続ける。advanceDraft() で true にする。
  contractsDone?: boolean
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

// 指名権のバックフィル判定。「自分が今持っているか」ではなく「どこかのチームが保有しているか」で見る。
// 売却・トレード済みの指名権を「欠落」と誤認して再生成（複製）しないため。
function pickExistsAnywhere(teams: Team[], ownerId: string, year: number, round: number): boolean {
  return teams.some(t => (t.draftPicks ?? []).some(pk => pk.year === year && pk.round === round && pk.originallyOwnedBy === ownerId))
}

// 指名権番号を「前年順位の逆順」で振るためのマップ。最下位=1（全体1位指名）〜優勝=N。
// 各チームの直近シーズン順位（過去シーズンの順位表から数え直した最新年）を使い、成績の悪い順に 1,2,3... を割り当てる。
// 履歴なし（開幕年など）は最下位扱いとし、配列順を維持（＝従来と同じ挙動でフォールバック）。
function standingsPickNumbers(teams: Team[], histories: TeamHistoryMap): Map<string, number> {
  const latestRank = (t: Team): number => {
    const past = histories[t.id]?.seasonResults ?? []
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
function draftLotteryOrder(teams: Team[], histories: TeamHistoryMap): Map<string, number> {
  const latestRank = (t: Team): number => {
    const past = histories[t.id]?.seasonResults ?? []
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

// ドラフト順の計算に渡す形。成績はセーブに持たないので、過去シーズンから数え直して詰め替える
function draftOrderTeams(teams: Team[], pastSeasons: { year: number; standings?: SeasonStanding[] }[]) {
  const histories = teamHistoriesOf(pastSeasons)
  return teams.map(t => ({ id: t.id, seasonResults: (histories[t.id] ?? EMPTY_TEAM_HISTORY).seasonResults }))
}

// トレードの値付けに要るものを state から1回で取り出す。
// 成立(tradePlayer)・チャット交渉(proposeTrade)・逆提示を飲む(acceptTradeCounter)・
// 相手からの打診を飲む(acceptTradeOffer) が、全部この同じ ctx を使う
function tradeValueCtxOf(state: { currentSeason: GameState['currentSeason']; pastSeasons: GameState['pastSeasons'] }): TradeValueCtx {
  return {
    races: state.currentSeason.races,
    teamRaces: state.currentSeason.currentRaceIndex,
    currentSeason: state.currentSeason,
    pastSeasons: state.pastSeasons,
  }
}


// 今季の活躍データの取得口。海外リーグ在籍中の選手は国内レースに出ないので、
// foreignAppearances 側から同じ形（PerfProfile）で作る。国内・海外を同じ物差しで見るための1本化。
function perfOf(season: { races: Race[]; currentRaceIndex: number; foreignAppearances?: Record<string, { clubId: string; races: number; wins: number; rankSum?: number; rankedRaces?: number }>; foreignRaceIndex?: number }, playerId: string, teamRaces?: number): PerfProfile | undefined {
  const fa = season.foreignAppearances?.[playerId]
  if (fa && fa.races > 0) return foreignPerfProfile(fa, season.foreignRaceIndex ?? fa.races)
  return seasonPerfProfile(playerId, season.races, teamRaces ?? season.currentRaceIndex)
}

// 引き抜き選手の希望年俸。市場相場に、出場データ（主力ほど高い）と現年俸からの昇給要求を反映。
function acquisitionDesiredSalary(player: Player, source: 'fa' | 'scout', playFraction = 0.5, teamRaces = 0, perf?: PerfProfile): number {
  // 市場給与(素体×実績倍率)と現年俸のブレンド。市場中心＋現年俸で急変を防ぐ。
  // → 衰えれば市場給与が下がって希望も下がる／現在高給でもすぐ暴落しない。
  const market = faMarketSalary(player, perf)
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

// 補強禁止中でも、ロスターが下限(15人)以下のときはFA獲得だけ通す。
// 契約満了・引退で15人を割ると開幕できないのに、補強禁止中はドラフト(年2人)しか手段が無く、
// シーズンが進まない＝収入も入らないので永久に抜け出せない詰みになるため。
// 対象はFAのみ。引き抜き・移籍金・トレード・レンタル・海外獲得は禁止のまま。
function faAllowedDespiteBan(players: Player[], teamId: string): boolean {
  return teamRosterSize(players, teamId) <= ROSTER_MIN
}

// レースのタイム計算に乗せる補正をまとめて適用した選手配列を返す。
//   1) 戦術分析室：所属チームの施設Lvぶん「ペース配分」「メンタル」を強化
//      （以前は全7能力に+Lvしていて実質OVR+5相当と壊れ性能だったため2能力に限定）
//   2) 国籍ケミストリー：自チームの出走メンバーの最多国籍が7人以上なら、その国籍の選手の士気を加算
// 以前は runRace の中だけでこの補正を作っていたが、リーグ戦は画面側（interactiveRace）で
// タイムを計算してから preComputedResults として渡すため、補正が一切反映されていなかった。
// 画面と store の両方からこの関数を呼ぶことで、施設とケミストリーの効果を必ず効かせる。
export function applyRaceBoosts(
  players: Player[], teams: Team[], playerTeamId: string, lineup: Record<number, string>,
): Player[] {
  const tacticsLvByTeam = new Map(teams.map(t => [t.id, t.facilities?.tacticsRoom ?? 0]))
  const boosted = players.map(p => {
    const boost = tacticsLvByTeam.get(p.teamId) ?? 0
    if (boost <= 0) return p
    return { ...p, ratings: {
      ...p.ratings,
      pacing: Math.min(99, p.ratings.pacing + boost),
      mental: Math.min(99, p.ratings.mental + boost),
    }}
  })

  const lineupPlayerIds = Object.values(lineup).filter(Boolean)
  if (lineupPlayerIds.length === 0) return boosted
  const lineupIdSet = new Set(lineupPlayerIds)
  const natCounts: Record<string, number> = {}
  for (const id of lineupPlayerIds) {
    const lp = boosted.find(p => p.id === id)
    if (lp) natCounts[lp.nationality] = (natCounts[lp.nationality] ?? 0) + 1
  }
  const maxNatCount = Math.max(0, ...Object.values(natCounts))
  const chemBonus = maxNatCount >= 9 ? 10 : maxNatCount >= 7 ? 6 : 0
  if (chemBonus <= 0) return boosted

  const dominantNat = Object.entries(natCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  return boosted.map(p => {
    if (p.teamId !== playerTeamId || !lineupIdSet.has(p.id) || p.nationality !== dominantNat) return p
    return { ...p, morale: Math.min(100, (p.morale ?? 70) + chemBonus) }
  })
}

// 自クラブの選手を売る（承諾でも逆提示でも、国内でも海外でも）ときの移動。
// 移籍金の受け取り・名簿からの除外・移籍履歴・退団のお知らせ・1年間の再交渉禁止まで、
// 全部 movePlayer に任せて同じ後始末になるようにする。
// 海外クラブは teams に居ないので、買い手側の出金は自動的に起きない（そのままでいい）。
function sellMove(
  state: Pick<GameState, 'players' | 'teams' | 'playerTeamId' | 'currentSeason'>,
  playerId: string, toTeamId: string, fee: number, toName: string,
) {
  return movePlayer(state, playerId, toTeamId, {
    year: state.currentSeason.year,
    date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date,
    raceIndex: state.currentSeason.currentRaceIndex,
    fee, toName,
    myTeamId: state.playerTeamId,
    lockUntilYear: state.currentSeason.year + 1,
  })
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
  getTeamPlayers: (teamId: string) => Player[]
  getSalaryTotal: (teamId: string) => number
  generateDevProspects: () => void
  scoutDevProspect: (prospectId: string) => void
  signDevProspect: (prospectId: string) => void

  // Scouting
  spendScoutPoint: () => void
  scoutDraftProspect: (prospectId: string) => void
  initScoutPool: () => void

  // Transfer & FA
  releasePlayer: (playerId: string) => void
  // ドラフト後：指名した新人の契約（年俸・役割・契約形態・契約年数）を設定
  setDraftContract: (playerId: string, salary: number, years: number, contractType: 'standard' | 'development' | 'dual', teamRole?: import('../types').TeamRole) => void
  extendContract: (playerId: string) => void
  // 成立したか＝ok。断られた理由は reason（チャットにそのまま出す）
  tradePlayer: (offeredIds: string[], requestedIds: string[], targetTeamId: string, transferFee?: number, offerPickKeys?: string[], requestPickKeys?: string[]) => { ok: boolean; reason?: string }
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
  // 返り値は utils/offerResult の OfferOutcome 1本。逆提示(counterIncomingOffer)と同じ言葉で返す
  acceptIncomingOffer: (offerId: string) => OfferOutcome
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
  counterIncomingOffer: (offerId: string, counterPrice: number) => OfferOutcome
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
  renamePlayer: (playerId: string, name: string) => void

  // Training plan
  setTrainingPlan: (plan: string | null) => void

  // Rival & preseason cards
  setRivalTeam: (id: string | null) => void
  claimPreseasonCards: () => void

  // Second team

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

  // National team
  setWorldSquad: (playerIds: string[]) => void
  runWorldAthletics: () => void
  startWorldTournament: () => void
  advanceWorldRace: (japanLineup?: Record<number, string>) => void
  markWorldIndividualsSeen: () => void
  markWorldIndividualRevealed: () => void
  approveOverseasChallenge: (playerId: string) => void
  denyOverseasChallenge: (playerId: string) => void
  ensureWorldRacePlans: () => void
  ensureEclSeries: () => void

  // Facilities
  upgradeFacility: (key: FacilityKey) => boolean

  // Individual events
  simulateIndividualEvent: (eventId: string, skipPlayerIds?: string[]) => void

  // Card training
  applyTrainingCards: (playerId: string, cardIds: string[], multiplier?: number) => void
  // ジュエルで能力1つの上限を+1する（コストは playerUtils.limitBreakCost。99が天井）
  breakStatLimit: (playerId: string, stat: CardStatKey) => void
  // カードの交換。レートも種類も utils/cardCombo.ts の CARD_EXCHANGES 1本。
  // statKey は完全休養からの交換でだけ効く（もらうカードの種類を指名する）。
  // もらえた枚数を返す（束が組めなければ0）
  exchangeCards: (ex: CardExchange, statKey?: CardStatKey) => number
  // 走友会の掲示板でカードを1枚渡す／もらったカードを受け取る
  removeTrainingCard: (cardId: string) => void
  addTrainingCards: (cards: TrainingCard[]) => void
  dismissDroppedCards: () => void
  dismissBudgetNotice: () => void
  // 監督オファーを受ける／断る（utils/gmOffer.ts）
  acceptGmOffer: () => void
  declineGmOffer: () => void
  // ホームで出したジュエル獲得ポップアップを閉じる
  dismissJewelGains: () => void

  // Update gifts (通知から受け取るプレゼント)
  grantUpdateGifts: () => void
  claimGift: (id: string) => void
  ensureIndividualEvents: () => void

  // 加入通知（全経路：FA/移籍/レンタル/トレード/ドラフト）を確認済みにする
  dismissJoinNotice: (key: string) => void

  // Contract renewals

  // Login bonus
  claimLoginBonus: () => { daily: number; weeklyBonus: number; streak: number } | null

  // Ad watching
  watchAd: () => number | null

  // 買い切り版（広告なし）
  setAdsRemoved: (v: boolean) => void
  // 買い切り版の特典：1日1回、カード合成を大成功にする権利を消費する（使えたら true）
  useDailyGreatSuccess: () => boolean
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
  createMyPlayer: (params: { name: string; age: number; specialty: Specialty; ratings: Ratings; customFace: NonNullable<Player['customFace']> }) => boolean
}

function emptyState(): Omit<GameStore, keyof ReturnType<typeof create>> {
  const basePlayers = BASE_PLAYERS.map(p => ({ ...p, teamId: '', career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 } }))
  return {
    isInitialized: false,
    // 既存セーブ向けの1回限りの補正（migrate内で実行）は、新規ゲームでは適用済み扱いにする。
    // 未設定だと新品のセーブにも走ってしまい、初期予算の書き換えなどが起きていた。
    balancePatch: 1,
    deficitRescue: 1,
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
    gmTenures: [],
    gmOffer: null,
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
        roster: { main: [] },
        facilities: { trainingCamp: facLv, medicalCenter: facLv, scoutOffice: facLv, tacticsRoom: facLv },
        finance: { ...t.finance, budget: rankBudgetGrant(t.initialRank) },
      }
    }),
    players: basePlayers,
    saveTimestamp: new Date().toISOString(),
    version: '0.1.0',
    sponsors: [],
    foreignLeagues: FOREIGN_LEAGUES,
    trainingCards: [],
    raceDroppedCards: [],
    pendingGifts: [],
    giftGivenVersions: [],
    jewels: 0,
    starredOpponents: [],
    starredProspects: [],
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
    myPlayerCreated: false,
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
  const myMainPlayers = myPlayers
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

// set に渡せる形（zustand と同じ）。replace の第2引数はこの store では一度も使っていない
type SetGame = (partial: GameStore | Partial<GameStore> | ((s: GameStore) => GameStore | Partial<GameStore>)) => void

export const useGameStore = create<GameStore>()(
  persist(
    (rawSet, get) => {
      // 「選手が動いたら交渉ごとの札を掃除する」を、幹の1本にまとめた場所。
      //
      // 前は movePlayer を呼ぶ処理ごとに reconcileTalks を書き足す形だったので、
      // 書き忘れた処理では退団した選手の買い取りオファーやレンタル打診が残り、
      // 同じ選手に二重に打診が積まれる・チャットが開ける、といったズレが出ていた。
      // ここで set を1枚かぶせて、players か currentSeason を触った更新は必ず掃除を通す。
      // 掃除で何も変わらなければ reconcileTalks は同じ実体を返すので、余計な再描画は起きない
      const set: SetGame = (partial) => {
        rawSet((state: GameStore) => {
          const next = typeof partial === 'function' ? partial(state) : partial
          if (!('players' in next) && !('currentSeason' in next)) return next
          const season = next.currentSeason ?? state.currentSeason
          if (!season) return next
          const swept = reconcileTalks(season, next.players ?? state.players, next.playerTeamId ?? state.playerTeamId)
          return swept === season ? next : { ...next, currentSeason: swept }
        })
      }

      return {
      ...emptyState() as unknown as GameStore,

      startSetup: (setup) => {
        set(state => {
          const baseIds = BASE_PLAYERS.map(p => p.id)
          const renamedTeams = state.teams.map(t => {
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
              }
            }
            if (t.isPlayerControlled && t.id !== setup.teamId) {
              return { ...t, isPlayerControlled: false }
            }
            return t
          })
          // 最初の18人をチームに入れる。入り口はドラフトでも移籍でも同じなので movePlayer を通す
          let players: Player[] = state.players
          let teams = renamedTeams
          baseIds.forEach((id, bi) => {
            const m = movePlayer({ players, teams }, id, setup.teamId, {
              year: state.currentSeason.year,
              history: false,
              // 契約年数を3〜5年にばらけさせ、更新が一斉に来ないようにする
              contract: { yearsLeft: 3 + (bi % 3) },
            })
            if (!m.ok) return
            players = m.players
            teams = m.teams
          })
          return {
            teams, players, setupData: setup, playerTeamId: setup.teamId,
            // 監督の在任履歴はここが起点。以後の移籍でここに積んでいく（utils/gmTenure.ts）
            gmTenures: [{ teamId: setup.teamId, fromYear: state.currentSeason.year }],
          }
        })
      },

      beginInauguralDraft: () => {
        const state = get()
        const pool = generateDraftPool(state.currentSeason.year, new Set(state.players.map(pl => pl.name)))
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

        // Pre-populate AI team rosters and player team initial roster
        const { cpuPlayers } = generateCpuRosters(
          state.teams.filter(t => t.id !== state.playerTeamId),
          state.currentSeason.year,
        )
        const { players: prPlayers } = generatePlayerInitialRoster(state.currentSeason.year)
        const prPlayersWithTeam = prPlayers.map(p => ({ ...p, teamId: state.playerTeamId }))

        const seededTeams = state.teams.map(t => t.id === state.playerTeamId
          ? {
              ...t,
              // 最弱スタート：初期予算は最下位(20位)グラント、施設は0から自分で建てる
              facilities: {},
              finance: { ...t.finance, budget: rankBudgetGrant(20) },
            }
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
        const teams = rebuildRosters(players, seededTeams)
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
          players,
        })
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
          const updatedPlayers = undraftedApplied.map(p =>
            undraftedSet.has(p.id) && p.status === 'draft_eligible' ? { ...p, status: 'active' as const } : p)
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
              newsFeed: (state.currentSeason.newsFeed ?? []).length > 0 ? state.currentSeason.newsFeed : buildInitialNews(),
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
        if (raceIndex >= currentSeason.races.length) return null

        const race = currentSeason.races[raceIndex]
        const seasonProgress = raceIndex / currentSeason.races.length

        // 出走するのは自分と同じ部のチームだけ。
        // 「誰が走るか」の唯一の出どころは、ここで組む lineups のキー（raceEngine.ts:329）。
        // レースデータ側に参加チームを書く場所は用意していない（2箇所あると必ずズレるため）。
        const myDivision = divisionOf(teams.find(t => t.id === playerTeamId))
        const lineups: Record<string, Record<number, string>> = { [playerTeamId]: lineup }
        for (const team of teamsInDivision(teams, myDivision)) {
          if (team.id === playerTeamId) continue
          lineups[team.id] = buildAILineup(team.id, players, race)
        }

        const playersForSimFinal = applyRaceBoosts(players, teams, playerTeamId, lineup)

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
              const sortedStandingsNow = rankedStandings(state.currentSeason.standings)
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
            // 引退選手は能力値を消してセーブを軽くしてあるので、疲労計算の対象外
            if (!p.ratings || p.status === 'retired') return p
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

          // Attendance revenue: rank-proportional（economy.ts attendanceRevenueByRank と同じ段階に揃える）
          const attendanceBase = 2000000 + Math.random() * 1500000
          const attendanceRankBonus =
            playerRank === 1 ? 4000000 :
            playerRank <= 3 ? 2500000 :
            playerRank <= 6 ? 1000000 :
            playerRank <= 10 ? 400000 : 0
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

            if (p.teamId !== playerTeamId) return { ...p, form: newForm, ...careerUpdate }

            const segWin = results.segmentResults.some(sr => sr.runners[0]?.playerId === p.id)
            // 役割ミスマッチ：エース/主力を任命したのにベンチだとモラル低下（口約束の代償）
            const roleBenchPenalty = (!isRacer && (p.teamRole === 'ace' || p.teamRole === 'key_player'))
              ? (p.teamRole === 'ace' ? 4 : 2) : 0
            const newMorale = Math.max(10, Math.min(100, (p.morale ?? 70) + moraleDelta + (segWin ? 5 : 0) - roleBenchPenalty))

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
                const outcome = applyGrowth({ player: { ...p, ratings: newRatings, exp: newExp }, source: 'race', baseGains, campLv })
                newRatings = outcome.ratings
                newExp = outcome.exp
                if (outcome.breakdown.age > 0) {
                  raceExpGainsMap[p.id] = outcome.gained
                }
              }
            } else if (p.status === 'active') {
              // 見学EXP: 全能力に50EXP（設計書: ベンチ ×0.5 間接育成）
              const benchGains: Partial<Record<CardStatKey, number>> = {
                speed: 50, stamina: 50, mountainUp: 50, mountainDown: 50, pacing: 50, mental: 50, recovery: 50,
              }
              const outcome = applyGrowth({ player: { ...p, ratings: newRatings, exp: newExp }, source: 'bench', baseGains: benchGains, campLv })
              newRatings = outcome.ratings
              newExp = outcome.exp
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
                  const outcome = applyGrowth({ player: { ...p, ratings: newRatings, exp: newExp }, source: 'plan', baseGains: bonusGain, campLv })
                  newRatings = outcome.ratings
                  newExp = outcome.exp
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
            // トレードで欲しがられる条件も他の移籍と同じ（utils/transferEligibility.ts）。
            // ここだけ非売しか見ておらず、海外挑戦を承認した選手や引退希望の選手にも打診が来ていた
            const tradeCtx = {
              teamId: playerTeamId,
              currentYear: state.currentSeason.year,
              retiringIds: new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId)),
            }
            const myTradables = state.players.filter(p => canBePoached(p, tradeCtx) && ovr(p) >= 62)
            const myNeeds = cpuSpecialtyNeeds(playerTeamId, state.players)
            const cpuIds = state.teams.map(t => t.id).filter(id => id !== playerTeamId)
            // 自チームの穴を埋められる選手(OVR68+)を持つチームを優先。いなければランダム
            const teamsWithFit = cpuIds.filter(id => state.players.some(p =>
              p.teamId === id && p.status === 'active' && !p.loan && myNeeds.includes(p.specialty) && ovr(p) >= 68))
            const fromId = teamsWithFit.length > 0
              ? teamsWithFit[Math.floor(Math.random() * teamsWithFit.length)]
              : cpuIds[Math.floor(Math.random() * cpuIds.length)]
            const theirNeeds = cpuSpecialtyNeeds(fromId, state.players)
            // 「自チームで出番がある選手」しか提示させない：自チーム10番手のOVRを下回る選手の打診は出さない
            const myMainOvrs = state.players
              .filter(p => p.teamId === playerTeamId && p.status === 'active')
              .map(p => ovr(p)).sort((a, b) => b - a)
            const lineupBar = myMainOvrs[Math.min(9, Math.max(0, myMainOvrs.length - 1))] ?? 0
            const theirRoster = state.players.filter(p =>
              p.teamId === fromId && p.status === 'active' && !p.loan && ovr(p) >= Math.max(65, lineupBar) && p.age <= 33)
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
                // ここは「こちらがもらう額面 ÷ こちらが出す額面」なので、成立判定の定数とは逆向き。
                // 同じ数字を使い回すと片方の調整がもう片方に逆向きに効くので別の定数にしてある
                const r = calcTransferValue(theirs) / Math.max(1, myVal)
                if (r < AI_OFFER_GAIN_MIN || r > AI_OFFER_GAIN_MAX) continue
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
          // 移籍ウィンドウは撤廃済み（getTransferWindow が常に「移籍受付中」を返す）。
          // 以前はここだけシーズンの35〜55%の間しかCPUのオファーを作らず、画面は
          // 「移籍受付中」なのに何も来ない期間ができていたので、常時オープンに揃えた
          // 引退希望を受理済みの選手（移籍の話は持ちかけない）。売出の成立判定でも使う
          const retiringWishIds = new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId))
          // CPU-to-CPU transfer completions
          type CpuTx = { playerId: string; fromTeamId: string; toTeamId: string; playerName: string; playerOvr: number; fromShort: string; toShort: string; fee: number }
          const cpuTxList: CpuTx[] = []
          const cpuTxListingIds = new Set<string>()
          {
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
              // レンタル中・非売品・海外挑戦を承認済み・今季加入の除外は canBePoached が見る。
              // 同一レース内で同じ選手が二重に動くのと、買い手が現所属と同じ場合はここで弾く
              if (!canBePoached(p, { teamId: listing.fromTeamId, currentYear: state.currentSeason.year, retiringIds: retiringWishIds }) || movedThisRace.has(p.id) || buyerTeamId === p.teamId) {
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
          const offerExpiredNegs: ExpiredNegotiation[] = []
          const offerExpiredPlayerIds: string[] = [];
          (state.currentSeason.incomingOffers ?? []).forEach(o => {
            if (o.offeredPrice === 0) return
            if (o.expiresAtRace <= nextRaceIndex) {
              const pl = finalPlayers.find(p => p.id === o.playerId)
              if (pl) {
                offerExpiredNegs.push({ id: o.id, playerId: o.playerId, playerName: pl.name, kind: 'offer' })
                offerExpiredPlayerIds.push(o.playerId)
              }
            }
          })

          // フリー移籍の接触：期限が来たら選手本人が決断する（GMは関与できない）。
          // 移籍するかは本人の納得度（やる気・移籍先の順位・出場状況）で決まる
          const freeDecisionNotices: { id: string; playerId: string; playerName: string; toTeamName: string; left: boolean }[] = []
          const freeMoves: { playerId: string; toTeamId: string }[] = []
          const standingsForFree = rankedStandings(updatedStandings)
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
          const transferData = generateTransferActivity(finalPlayers, teamsWithPrize, playerTeamId, nextRaceIndex, existingListingsFiltered, state.currentSeason.incomingOffers ?? [], state.currentSeason.transferRequests ?? [], retiringWishIds, state.currentSeason.year)

          // 海外クラブからの移籍オファー ＋ 相手からのレンタル打診（チャットで対応）
          const foreignClubs = (state.foreignLeagues ?? []).flatMap(l => l.clubs).map(c => ({ id: c.id, name: c.name, shortName: c.shortName, leagueId: c.leagueId, country: c.country }))
          const keptLoanOffers = (state.currentSeason.incomingLoanOffers ?? []).filter(o => o.expiresAtRace > nextRaceIndex && finalPlayers.some(p => p.id === o.playerId))
          const flOffers = generateForeignAndLoanOffers({ players: finalPlayers, teams: teamsWithPrize, foreignClubs, playerTeamId, raceIndex: nextRaceIndex, existingIncoming: transferData.incomingOffers, existingLoans: keptLoanOffers, races: updatedRaces, retiringIds: retiringWishIds, currentYear: state.currentSeason.year })
          const mergedIncomingOffers = [...transferData.incomingOffers, ...flOffers.foreignIncoming]
          const mergedLoanOffers = [...keptLoanOffers, ...flOffers.loanOffers]

          // 入札(移籍金オファー)の応答。判定は utils/transferBid の resolveBid 1本。
          // サブの1戦を進めたときも同じ関数を呼ぶので、進め方で結果が変わらない
          const bidExpiredNegs: ExpiredNegotiation[] = []
          const bidExpiredPlayerIds: string[] = []
          const processedBids = (state.currentSeason.transferBids ?? []).map(bid => {
            const r = resolveBid(bid, {
              players: finalPlayers,
              listings: transferData.listings,
              currentSeason: { year: state.currentSeason.year, races: updatedRaces, eclSeries: state.currentSeason.eclSeries },
              pastSeasons: state.pastSeasons,
              raceIndex: nextRaceIndex,
            })
            if (r.expired) {
              bidExpiredNegs.push(r.expired)
              bidExpiredPlayerIds.push(r.expired.playerId)
            }
            return r.bid
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

          // 区間新記録の判定。
          // 歴代記録はセーブに貯めず、保存してあるレース結果から数え直す。
          // このレースの結果はまだ currentSeason に入っていないので、これは「今走ったレースの前の記録」になる。
          const prevSegRecords = segmentRecordsOf(state.pastSeasons, state.currentSeason)
          // 区間新記録が出たらニュースにする（過去記録がある区間で更新された場合のみ）
          const segRecordNewsItems: typeof newsItems = []
          // 結果画面の「区間新！」バッジ用（このレースで従来記録を破った区間×選手）
          const newSegRecordMarks: { segmentIndex: number; playerId: string }[] = []
          for (const sr of results.segmentResults) {
            const prevBest = (prevSegRecords[`${race.name}-${sr.segmentIndex}`] ?? [])[0]?.timeSec ?? null
            const fastestRunner = sr.runners.length > 0
              ? sr.runners.reduce((min, r) => r.timeSec < min.timeSec ? r : min, sr.runners[0])
              : null
            if (prevBest != null && fastestRunner && fastestRunner.timeSec < prevBest) {
              const isMine = fastestRunner.teamId === playerTeamId
              const plName = state.players.find(x => x.id === fastestRunner.playerId)?.name ?? '不明'
              const tmShort = state.teams.find(x => x.id === fastestRunner.teamId)?.shortName ?? '?'
              newSegRecordMarks.push({ segmentIndex: sr.segmentIndex, playerId: fastestRunner.playerId })
              segRecordNewsItems.push({
                date: race.date,
                headline: `【区間新記録】${race.name} 第${sr.segmentIndex}区 ${plName}（${tmShort}）${formatRaceTime(fastestRunner.timeSec)}（従来 ${formatRaceTime(prevBest)}）${isMine ? ' ★自チーム' : ''}`,
                category: 'race' as const,
                relatedIds: [fastestRunner.playerId],
              })
            }
          }

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
              ...(tx.fromTeamId === playerTeamId ? { lockUntilYear: state.currentSeason.year + 1 } : {}),
            })
            if (!m.ok) continue
            playersWithCpuTx = m.players
            teamsWithCpuTx = m.teams
            if (m.record) cpuTxRecords.push(m.record)
            if (m.notice) myCpuSaleNotices.push(m.notice)
            myCpuSaleIncome += m.income
          }

          // レンタル要請（移籍市場から出したもの）の応答。相手が承諾なら借用成立、拒否ならニュース。
          const pendingLoanReqs = state.currentSeason.loanRequests ?? []
          let playersAfterLoan: Player[] = playersWithCpuTx
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
              const loanable = keyPlayerStatus(pl, { year: state.currentSeason.year, races: updatedRaces, eclSeries: state.currentSeason.eclSeries }, state.pastSeasons) === 'open'
              const ownerShort = findClub(teamsWithCpuTx, state.foreignLeagues, pl.teamId)?.shortName
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
            // 借用成立も movePlayer に通す（保有元を残して、貸した側の名簿から外す）
            for (const a of accepted) {
              const m = movePlayer({ players: playersAfterLoan, teams: teamsAfterLoan }, a.playerId, playerTeamId, {
                year: state.currentSeason.year,
                until: state.currentSeason.year + a.years,
                raceIndex: raceIndex + 1,
                years: a.years,
                myTeamId: playerTeamId,
              })
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
          const trTotalTeams = state.teams.length
          const myStandRank = (() => {
            const sorted = rankedStandings(updatedStandings)
            const i = sorted.findIndex(s => s.teamId === playerTeamId)
            return i >= 0 ? i + 1 : Math.ceil(trTotalTeams / 2)
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
          const regionForSpec = (s: Player['specialty']): import('../types').OverseasRegion =>
            (s === 'long' || s === 'grinder') ? 'africa'
            : (s === 'sprinter' || s === 'kick' || s === 'ace') ? 'europe'
            : 'america'
          const ovCands = playersAfterLoan.filter(p => p.teamId === playerTeamId && p.status === 'active' && !p.loan
            && ovr(p) >= 80 && p.age <= 30 && !p.overseasListed && !openWish.has(p.id)
            && p.overseasDeniedYear !== state.currentSeason.year && !p.transferListed)
          let newOvReqs: { playerId: string; region: import('../types').OverseasRegion }[] = []
          for (const p of ovCands) {
            const wasRep = (state.worldRepresentatives ?? []).some(r => r.playerId === p.id && r.year >= state.currentSeason.year - 1)
            if (Math.random() < (wasRep ? 0.10 : 0.03)) { newOvReqs = [{ playerId: p.id, region: regionForSpec(p.specialty) }]; break }
          }

          // 契約更新の要求は放置で自動失効する。以前は status:'rejected' にして札を残していたが、
          // 「札がある＝今季もう話しかけた」の判定に引っかかり、**一度も応対していない選手が
          // そのシーズン二度と契約更新に出てこなくなっていた**（契約更新のチャットが出ない主因）。
          // 決着ではないので札ごと消して跡を残さない。代わりに「交渉が流れた」通知だけ出す。
          // countered（こちらの返事待ち）も同じく失効させる。以前は pending_gm しか見ておらず、
          // 返事待ちのまま通知にも出ずに永久に残る札があった
          const expiredContractReqs = (state.currentSeason.contractRequests ?? [])
            .filter(r => isLiveContract(r) && (r.expiresAtRace ?? 0) <= nextRaceIndex)
          const expiredContractIds = new Set(expiredContractReqs.map(r => r.id))
          // 契約更新の期限切れ。移籍の話ではないので kind で区別する。
          // （通知の文言が「移籍を拒否しました／来季まで交渉できません」で固定されていて、
          //   更新の期限切れなのに移籍拒否と出る＝嘘になっていた）
          const contractExpiredNegs: ExpiredNegotiation[] = expiredContractReqs.map(r => ({
            id: `cx_${r.id}`,
            playerId: r.playerId,
            playerName: playersAfterLoan.find(p => p.id === r.playerId)?.name ?? '選手',
            kind: 'contract',
          }))

          // 期限切れ交渉のプレイヤーを1年間ロック（移籍交渉のみ。契約更新はロックしない）
          const allExpiredPlayerIds = [...new Set([...bidExpiredPlayerIds, ...offerExpiredPlayerIds])]
          const allExpiredNegs: ExpiredNegotiation[] = [...bidExpiredNegs, ...offerExpiredNegs, ...contractExpiredNegs]
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
              lockUntilYear: state.currentSeason.year + 1,
            })
            if (!m.ok) continue
            playersAfterFreeMoves = m.players
            teamsAfterFreeMoves = m.teams
            if (m.record) freeMoveRecords.push(m.record)
          }

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
              // 在籍していない選手の直訴を落とすのは下の reconcileTalks の役目。ここは新しい直訴を足すだけ
              // （前はここで status === 'active' も見ていたので、ケガした瞬間に交渉中の話が消えていた）
              transferRequests: [...(state.currentSeason.transferRequests ?? []), ...newTransferReqs],
              overseasRequests: [...(state.currentSeason.overseasRequests ?? []), ...newOvReqs],
              // 失効した契約更新の札は消す（上の expiredContractReqs で選んである）。
              // 旧セーブの期限なし要求(expiresAtRaceなし)もここで失効する
              contractRequests: (state.currentSeason.contractRequests ?? []).filter(r => !expiredContractIds.has(r.id)),
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

      generateDevProspects: () => {
        set(state => {
          if ((state.currentSeason.devProspects ?? []).length > 0) return state
          const NAMES = ['村上 蒼', '橋本 颯', '田中 悠馬', '小林 煌', '中村 海斗', '伊藤 涼', '山田 蓮', '佐藤 翔', '加藤 健', '鈴木 碧', '松本 楓', '渡辺 律', '井上 光', '木村 颯太', '高橋 凌', '石川 仁', '林 優斗', '近藤 葵', '前田 空', '岡田 風']
          const CITIES = ['東京', '神奈川', '大阪', '愛知', '福岡', '北海道', '宮城', '広島', '静岡', '千葉']
          const SPECS: import('../types').Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
          const usedForeignNames = new Set<string>()
          const prospects: import('../types').DevProspect[] = Array.from({ length: 12 }, (_, i) => {
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
          // 2軍の区分は廃止済み。人数は総在籍(ROSTER_MAX)で見る
          if (teamRosterSize(state.players, team.id) >= ROSTER_MAX) return state


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
            // 所属はこのあと movePlayer で入れる（名簿と支度金の後始末をまとめて任せるため）
            teamId: '',
            joinedYear: state.currentSeason.year,
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
              devProspects: (state.currentSeason.devProspects ?? []).filter(p => p.id !== prospectId),
            },
          }
        })
      },

      getTeam: (teamId) => get().teams.find(t => t.id === teamId),
      getPlayer: (playerId) => get().players.find(p => p.id === playerId),
      // 在籍選手は player.teamId から直接引く（team.roster の写しは見ない）。
      // 以前は roster 配列を見ていたため、更新し損ねると「ロスター画面にだけ出ない選手」が生まれていた。
      // 1軍/2軍の区分は廃止済みなので second は常に空を返す。
      getTeamPlayers: (teamId) => squadPlayersOf(get().players, teamId),
      getSalaryTotal: (teamId) => squadPlayersOf(get().players, teamId)
        .reduce((sum, p) => sum + (p.contract?.annualSalary ?? 0), 0),

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
          const pool = generateDraftPool(state.currentSeason.year + 1, new Set(state.players.map(pl => pl.name)))
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
          // 支払いは Math.max(0, ...) で挟まない。挟むと残高がマイナスのときに
          // 「払ったら0円に戻る（＝実質チャージ）」になってしまう。赤字はそのまま深くする。
          // 移動は movePlayer 一本（所属を空にして名簿から外し、移籍リストの札もはがす）
          const moved = movePlayer(state, playerId, '', { year: state.currentSeason.year })
          if (!moved.ok) return state
          return {
            players: moved.players,
            teams: moved.teams.map(t => t.id === state.playerTeamId
              ? { ...t, finance: { ...t.finance, budget: t.finance.budget - buyout } }
              : t),
          }
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
              contract: { ...p.contract, annualSalary: salary, yearsLeft: years, contractType, rookieDeal: true },
            } : p),
            // 名簿はここで並べ替えない。所属から組み直す決まりに任せる（指名の時点で入っている）
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
        const standings = rankedStandings(state.currentSeason.standings)
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
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 5) } : p)
            } else if (choiceIndex === 1) {
              gmRep = Math.min(100, gmRep + 2)
            } else {
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 8) } : p)
            }
          } else if (event.type === 'press_conference') {
            if (choiceIndex === 0) {
              gmRep = Math.min(100, gmRep + 3)
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 6) } : p)
            } else if (choiceIndex === 1) {
              gmRep = Math.min(100, gmRep + 1)
            } else {
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 10) } : p)
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
            } else {
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 8) } : p)
            }
          } else if (event.type === 'veteran_ambition' && pid) {
            if (choiceIndex === 0) {
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 30), fatigue: Math.min(100, p.fatigue + 5) } : p)
              players = players.map(p => p.teamId === state.playerTeamId && p.id !== pid ? { ...p, morale: Math.min(100, p.morale + 8) } : p)
            } else if (choiceIndex === 1) {
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 12) } : p)
            }
          } else if (event.type === 'rival_provocation') {
            if (choiceIndex === 0) {
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 15) } : p)
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
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 10), fatigue: Math.min(100, p.fatigue + 3) } : p)
            } else if (choiceIndex === 1) {
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 20), fatigue: Math.min(100, p.fatigue + 8) } : p)
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 2000000 } } : t)
            }
          } else if (event.type === 'player_retirement' && pid) {
            if (choiceIndex === 0) {
              // Stay bonus — pay 20M, player morale up
              players = players.map(p => p.id === pid ? { ...p, morale: Math.min(100, p.morale + 20) } : p)
              teams = teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget - 20000000 } } : t)
            } else {
              // Accept retirement — 即引退はせず「今季限りで引退」フラグを立てる。
              // 実際の引退処理（ロスター除外・レジェンド登録）はendSeasonで行う
              players = players.map(p => p.id === pid ? { ...p, pendingRetirementYear: state.currentSeason.year } : p)
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.min(100, p.morale + 8) } : p)
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
              players = players.map(p => p.teamId === state.playerTeamId ? { ...p, morale: Math.max(0, p.morale - 10) } : p)
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
          // 打診後に状況が変わっていたら成立させず破棄する（ロスター破壊防止）。
          // 打診は5レース残るので、その間に非売にした・海外挑戦を承認した・引退希望を受理した、
          // という場合も止める（以前は在籍しているかどうかしか見ていなかった）
          const offerCtx = {
            teamId: state.playerTeamId,
            currentYear: state.currentSeason.year,
            retiringIds: new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId)),
          }
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
              ],
            },
          })
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
            outExtra: (offer.requestedPickKeys ?? []).reduce((s2, k) => s2 + pickKeyValue(k), 0),
            inExtra: (offer.offeredPickKeys ?? []).reduce((s2, k) => s2 + pickKeyValue(k), 0) }
          if (!tradeNotLopsided(acceptIn, tvCtxA).ok) {
            return callOff(offer.requestedPlayerIds[0] ?? offer.offeredPlayerIds[0] ?? '', 'trade_unfair')
          }
          let players = state.players
          let teams = state.teams
          const tradeDate = state.currentSeason.races[state.currentSeason.currentRaceIndex - 1]?.date
          const tradeRecords: TransferRecord[] = []
          // 出入りとも movePlayer 一本。片方だけ加入年が入らない、といった書き分けが起きない
          const runTrade = (pid: string, toTeamId: string) => {
            const m = movePlayer({ players, teams }, pid, toTeamId, {
              year: state.currentSeason.year,
              date: tradeDate,
              raceIndex: state.currentSeason.currentRaceIndex,
              kind: 'trade',
              years: players.find(pl => pl.id === pid)?.contract.yearsLeft,
              myTeamId: state.playerTeamId,
            })
            if (!m.ok) return
            players = m.players
            teams = m.teams
            if (m.record) tradeRecords.push(m.record)
          }
          for (const pid of offer.offeredPlayerIds) runTrade(pid, state.playerTeamId)
          for (const pid of offer.requestedPlayerIds) runTrade(pid, offer.fromTeamId)

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
            date: tradeDate ?? `${state.currentSeason.year}-06-01`,
            headline: `${fromTeamName}とのトレード成立`,
            category: 'trade' as const,
            relatedIds: [...offer.offeredPlayerIds, ...offer.requestedPlayerIds],
          }
          return {
            players, teams,
            transferHistory: [...(state.transferHistory ?? []), ...tradeRecords].slice(-400),
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
        // 移動は movePlayer 一本（売り手への入金・買い手からの出金・名簿の付け替え・履歴まで込み）
        let bought = false
        set(state => {
          const years = Math.max(player.contract.yearsLeft, 2)
          const moved = movePlayer(state, listing.playerId, state.playerTeamId, {
            year: state.currentSeason.year,
            date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date,
            raceIndex: state.currentSeason.currentRaceIndex,
            fee: price, years, myTeamId: state.playerTeamId, checkCapacity: true,
            contract: { yearsLeft: years },
          })
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
            newsFeed: [{ date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}を移籍金${Math.round(price / 10000)}万で獲得`, category: 'trade' as const, relatedIds: [player.id], major: price >= 100_000_000, fromTeamId: listing.fromTeamId, toTeamId: state.playerTeamId }, ...state.currentSeason.newsFeed].slice(0, 30),
          },
        })
        })
        return bought
      },

      acceptIncomingOffer: (offerId) => {
        const state = get()
        const offer = (state.currentSeason.incomingOffers ?? []).find(o => o.id === offerId)
        if (!offer) return 'invalid'
        // もう成立しようが無いオファーの札は取り下げる（逆提示側と同じ扱い）。
        // 以前は承諾だけ札を残していたので、押しても何も起きない札が居座っていた
        const dropOffer = () => set(st => ({ currentSeason: { ...st.currentSeason, incomingOffers: (st.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }))
        const player = state.players.find(p => p.id === offer.playerId)
        // 「この選手を出していいか」の判定は canAcceptOfferFor 1本に寄せる。
        // ここには判定が一つも無く、引退の話が決まっている選手でもそのまま移籍が成立していた
        // （借りている選手の売却も isOwnedBy が弾く）
        if (!player || !canAcceptOfferFor(player, {
          teamId: state.playerTeamId,
          currentYear: state.currentSeason.year,
          retiringIds: new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId)),
        }, offer.fromForeign)) { dropOffer(); return 'invalid' }
        // ロスター下限(15人)を割る売却は不可。札は残す＝補強してから改めて返事ができる（逆提示側と同じ）
        if (!canReleaseFromRoster(state.players, state.playerTeamId)) return 'roster_min'
        // 海外クラブへの放出：teams に無いので選手を海外へ移し、資金だけ受け取る
        if (offer.fromForeign) {
          const destLeague = (state.foreignLeagues ?? []).find(l => l.clubs.some(c => c.id === offer.fromTeamId))
          const clubName = destLeague?.clubs.find(c => c.id === offer.fromTeamId)?.shortName ?? '海外クラブ'
          // 4大リーグ（世界最高峰）への送り出しは大ニュース＋初回は実績を獲得
          const isElite = ['africa_east', 'africa_ns', 'europe_ws', 'north_america'].includes(destLeague?.id ?? '')
          // 海外クラブは teams に居ないので、movePlayer では自クラブ側だけ入金される
          set(st => {
          const moved = sellMove(st, offer.playerId, offer.fromTeamId, offer.offeredPrice, clubName)
          return ({
            players: moved.players,
            teams: moved.teams,
            transferHistory: [...(st.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
            achievements: isElite && !(st.achievements ?? []).some(a => a.id === 'overseas-pioneer')
              ? [...(st.achievements ?? []), { id: 'overseas-pioneer', name: '世界へ翔ぶ', desc: `${st.currentSeason.year}年 ${player.name}を世界最高峰リーグへ送り出した`, earnedAtYear: st.currentSeason.year, rarity: 'legendary' as const }]
              : st.achievements,
            currentSeason: { ...st.currentSeason, transferIncome: (st.currentSeason.transferIncome ?? 0) + moved.income, incomingOffers: (st.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId), transferListings: (st.currentSeason.transferListings ?? []).filter(l => l.playerId !== offer.playerId), newsFeed: [{ date: st.currentSeason.races[st.currentSeason.currentRaceIndex]?.date ?? `${st.currentSeason.year}-06-01`, headline: isElite ? `【世界へ挑戦】${player.name}（OVR${ovr(player)}）が世界最高峰・${clubName}へ移籍！自クラブ育ちの選手が世界の舞台へ（移籍金${Math.round(offer.offeredPrice / 10000)}万）` : `${player.name}が海外クラブ${clubName}へ移籍（移籍金${Math.round(offer.offeredPrice / 10000)}万）`, category: 'trade' as const, relatedIds: [player.id], major: isElite }, ...st.currentSeason.newsFeed].slice(0, 30), departureNotices: [...(st.currentSeason.departureNotices ?? []), ...(moved.notice ? [moved.notice] : [])] },
          })
          })
          return 'sold'
        }
        const buyingTeam = state.teams.find(t => t.id === offer.fromTeamId)
        if (!buyingTeam) { dropOffer(); return 'invalid' }
        set(state => {
        const moved = sellMove(state, offer.playerId, offer.fromTeamId, offer.offeredPrice, buyingTeam.shortName)
        return ({
          players: moved.players,
          teams: moved.teams,
          transferHistory: [...(state.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
          currentSeason: {
            ...state.currentSeason,
            transferIncome: (state.currentSeason.transferIncome ?? 0) + moved.income,
            incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId),
            // 売却した選手の出品（自分のもの含む）は市場から掃除する
            transferListings: (state.currentSeason.transferListings ?? []).filter(l => l.playerId !== offer.playerId),
            newsFeed: [{ date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}を${buyingTeam.shortName}へ移籍金${Math.round(offer.offeredPrice / 10000)}万で放出`, category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30),
            departureNotices: [...(state.currentSeason.departureNotices ?? []), ...(moved.notice ? [moved.notice] : [])],
          },
        })
        })
        return 'sold'
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
            offerYears: 2,
          }
          return { currentSeason: { ...state.currentSeason, contractRequests: [...(state.currentSeason.contractRequests ?? []), req] } }
        })
      },

      generateContractRequests: () => {
        set(state => {
          const racesPlayed = state.currentSeason.currentRaceIndex ?? 0
          if (racesPlayed === 0) return state
          // 借りている選手の引退話も出さない（引退を受理しても保有クラブに戻るだけ）
          const retPlayers = state.players.filter(p => isOwnedBy(p, state.playerTeamId) && p.age >= 35)
          const existRet = new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId))
          // 直訴の札は1人1つ（判定は talkSync の openWishIds）。移籍希望・海外挑戦希望を
          // 出したままの選手は引退の抽選に入れない。入れると同じ選手の札が2枚になる
          const openWish = openWishIds(state.currentSeason)
          // 引退の話が湧くかどうかは Math.random ではなく「選手ID＋年＋消化レース数」から決める。
          // この関数はチャットを開くたびに走るので、乱数だと開き直すだけで何度も抽選が回り、
          // 35歳以上が次々に引退を言い出していた。同じレース内なら何度開いても結果は同じにする
          const retRoll = (id: string) => {
            let h = 0
            const seed = `${id}|${state.currentSeason.year}|${racesPlayed}`
            for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
            return h % 100
          }
          // 今季すでに引き留めた選手は再抽選しない
          const newRet = retPlayers.filter(p => !openWish.has(p.id) && p.retirementDeclinedYear !== state.currentSeason.year && p.pendingRetirementYear == null && retRoll(p.id) < 40).map(p => ({ playerId: p.id, age: p.age }))
          // 引退の話をしている選手には契約更新の話を出さない。この2つは別々に選んでいたので、
          // 同じ選手から「引退したい」と「契約を更新したい」が同じタイミングで来ていた。
          // 今この場で引退を言い出した分（newRet）も含めて外す
          const retiringIds = new Set([...existRet, ...newRet.map(r => r.playerId)])
          // 判定は contractTalk の1本だけ（借り物・引退の話・海外承認・退団予定・更新ロック・
          // フリー接触中）。今この場で引退を言い出した分も retiringIds に含めて外す
          const gcrCtx = { ...contractTalkCtx(state.currentSeason, state.playerTeamId), retiringIds }
          // 「今季すでに交渉した選手」には再生成しない（開き直しでround 1に戻るのを防ぐ）。
          // 期限切れの札はもう残らないので、ここに引っかかるのは本当に応対した話だけ
          const myPlayers = state.players.filter(p => canRequestRenewal(p, gcrCtx)
            && p.contract.yearsLeft === 1
            && !hasContractTalk(gcrCtx.contractRequests, p.id))
          const seasonRaces = state.currentSeason.races ?? []
          const newReqs: ContractRequest[] = myPlayers.map(p => {
            const personality = p.personality ?? 'salary'
            // 要求額は「市場価値 × 性格」で決める。
            // 市場価値(faMarketSalary)＝素体(OVR×年齢)×実績倍率で、実績倍率の中に
            // 今季の出場割合・平均区間順位・区間賞と、通算の出走/区間賞/優勝/MVPが入っている。
            // 旧仕様の『現年俸×1.2の自動昇給』は廃止のまま。走っていない選手は減額しか要求できない。
            const market = faMarketSalary(p, seasonPerfProfile(p.id, seasonRaces, racesPlayed))
            const persoFactor = personality === 'salary' ? 1.05 : personality === 'winning' ? 1.0 : 0.95
            const demand = Math.max(3_000_000, market * persoFactor)
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
            const stgsFc = rankedStandings(state.currentSeason.standings)
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
          const myRank = rankOfTeam(state.currentSeason.standings, state.playerTeamId)
          const isGoodTeam = myRank > 0 && myRank <= 5
          const personality = player.personality ?? 'salary'
          const roundFactor = 1 + (req.round - 1) * 0.03
          const demand = Math.round(req.demandSalary * roundFactor / 500000) * 500000
          const ratio = demand > 0 ? salary / demand : 2
          // 士気が高い選手は譲歩する（要求を丸呑みしなくても交渉で下げられる余地を作る）
          const moraleDiscount = (player.morale ?? 60) >= 80 ? 0.05 : (player.morale ?? 60) >= 65 ? 0.02 : 0
          const acceptThresh = (personality === 'winning' && isGoodTeam ? 0.90 : personality === 'loyalty' ? 0.92 : 0.95) - moraleDiscount
          const counterThresh = personality === 'salary' ? 0.77 : 0.73
          const isLastRound = req.round >= MAX_CONTRACT_ROUNDS  // 交渉のラウンド上限は contractTalk の1本
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
            // 契約年数＝現在の残年数＋提示年数（負にはならない）
            const newYears = Math.max(1, player.contract.yearsLeft + years)
            newPlayers = state.players.map(p => p.id === player.id ? {
              ...p,
              teamRole: teamRole ?? p.teamRole,
              // 更新成立でルーキー契約は終了
              contract: { ...p.contract, annualSalary: salary, yearsLeft: newYears, contractType: contractType ?? p.contract.contractType, faEligibleYear: state.currentSeason.year + newYears, rookieDeal: false },
            } : p)
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
                : state.currentSeason.incomingOffers,
            },
          }
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
              contract: { ...p.contract, annualSalary: req.counterSalary!, yearsLeft: cNewYears, contractType: req.offerContractType ?? p.contract.contractType, faEligibleYear: state.currentSeason.year + cNewYears, rookieDeal: false },
            } : p),
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
          const newOffer: AcquisitionOffer = {
            id: `ao_${Date.now()}_${playerId}`,
            playerId, source, round: 1, status: 'pending',
            offerSalary: 0, offerYears: 2,
            offerContractType: 'standard',
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
          const playFraction = teamRaces > 0 ? apps / teamRaces : 0.5
          const rejectWith = (reason: AcquisitionOffer['rejectReason']) => ({
            currentSeason: {
              ...state.currentSeason,
              acquisitionOffers: (state.currentSeason.acquisitionOffers ?? []).map(o => o.id === offerId
                ? { ...o, status: 'rejected' as const, offerSalary: salary, offerYears: years, offerContractType: contractType, offerTeamRole: teamRole, rejectReason: reason }
                : o),
            },
          })
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
            const sorted = rankedStandings(state.currentSeason.standings)
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
            const moved = movePlayer(state, player.id, state.playerTeamId, {
              year: state.currentSeason.year,
              date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date,
              raceIndex: state.currentSeason.currentRaceIndex,
              kind: 'free', years, teamRole, myTeamId: state.playerTeamId, checkCapacity: true,
              contract: { annualSalary: salary, yearsLeft: years, contractType },
            })
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
          const player = state.players.find(p => p.id === offer.playerId)
          const moved = movePlayer(state, offer.playerId, state.playerTeamId, {
            year: state.currentSeason.year,
            date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date,
            raceIndex: state.currentSeason.currentRaceIndex,
            kind: 'free', years: offer.counterYears, teamRole: offer.offerTeamRole,
            myTeamId: state.playerTeamId, checkCapacity: true,
            contract: { annualSalary: offer.counterSalary, yearsLeft: offer.counterYears, contractType: offer.offerContractType },
          })
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
          const moved = movePlayer(state, playerId, '', { year: state.currentSeason.year })
          if (!moved.ok) return state
          released = true
          return {
            players: moved.players,
            teams: moved.teams.map(t => t.id === state.playerTeamId
              ? { ...t, finance: { ...t.finance, budget: t.finance.budget - buyoutCost } }
              : t),
          }
        })
        return released
      },

      counterIncomingOffer: (offerId, counterPrice) => {
        // 結果は utils/offerResult の OfferOutcome 1本。承諾(acceptIncomingOffer)と同じ言葉で返す
        let outcome: OfferOutcome = 'invalid'
        set(state => {
          const offer = (state.currentSeason.incomingOffers ?? []).find(o => o.id === offerId)
          if (!offer) return state
          const player = state.players.find(p => p.id === offer.playerId)
          // 判定は acceptIncomingOffer と同じ canAcceptOfferFor 1本。
          // オファーを出したあとに選手がチームを離れた／引退や海外挑戦の話が決まった、はここで弾く
          if (!player || !canAcceptOfferFor(player, {
            teamId: state.playerTeamId,
            currentYear: state.currentSeason.year,
            retiringIds: new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId)),
          }, offer.fromForeign)) {
            return { currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }
          }
          // ロスター下限(15人)を割る売却は不可（acceptIncomingOfferと同じガード）。
          // 相手が金を出せなかった('refused')わけではないので理由を分けて返し、札も消さない。
          // 以前はここで 'refused' を返して札まで消していたため、画面に「相手が支払えず決裂」と
          // 嘘の理由が出た上に、補強しても再交渉できなくなっていた
          if (!canReleaseFromRoster(state.players, state.playerTeamId)) {
            outcome = 'roster_min'
            return state
          }
          // 海外クラブ：上限は economy.counterCeiling の1本。合意なら海外へ放出
          if (offer.fromForeign) {
            if (player && counterPrice <= counterCeiling(calcTransferValue(player), offer.offeredPrice)) {
              const destLg = (state.foreignLeagues ?? []).find(l => l.clubs.some(c => c.id === offer.fromTeamId))
              const clubName = destLg?.clubs.find(c => c.id === offer.fromTeamId)?.shortName ?? '海外クラブ'
              const isElite = ['africa_east', 'africa_ns', 'europe_ws', 'north_america'].includes(destLg?.id ?? '')
              outcome = 'sold'
              const moved = sellMove(state, offer.playerId, offer.fromTeamId, counterPrice, clubName)
              return {
                players: moved.players,
                teams: moved.teams,
                transferHistory: [...(state.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
                achievements: isElite && !(state.achievements ?? []).some(a => a.id === 'overseas-pioneer')
                  ? [...(state.achievements ?? []), { id: 'overseas-pioneer', name: '世界へ翔ぶ', desc: `${state.currentSeason.year}年 ${player.name}を世界最高峰リーグへ送り出した`, earnedAtYear: state.currentSeason.year, rarity: 'legendary' as const }]
                  : state.achievements,
                currentSeason: { ...state.currentSeason, transferIncome: (state.currentSeason.transferIncome ?? 0) + moved.income, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId), transferListings: (state.currentSeason.transferListings ?? []).filter(l => l.playerId !== offer.playerId), newsFeed: [{ date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`, headline: isElite ? `【世界へ挑戦】${player.name}（OVR${ovr(player)}）が世界最高峰・${clubName}へ移籍！自クラブ育ちの選手が世界の舞台へ（移籍金${Math.round(counterPrice / 10000)}万）` : `${player.name}が海外クラブ${clubName}へ移籍（移籍金${Math.round(counterPrice / 10000)}万）`, category: 'trade' as const, relatedIds: [player.id], major: isElite }, ...state.currentSeason.newsFeed].slice(0, 30), departureNotices: [...(state.currentSeason.departureNotices ?? []), ...(moved.notice ? [moved.notice] : [])] },
              }
            }
            outcome = 'refused'
            return { currentSeason: { ...state.currentSeason, incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId) } }
          }
          const buyingTeam = state.teams.find(t => t.id === offer.fromTeamId)
          const maxBudget = buyingTeam?.finance.budget ?? 0
          // 応じるラインは海外と同じ economy.counterCeiling。ただし相手の予算内。
          // 相場での逆提示は基本通る（予算が無いチームはそもそもオファーを出さない）
          const willing = Math.min(maxBudget, counterCeiling(calcTransferValue(player), offer.offeredPrice))
          if (counterPrice <= willing) {
            outcome = 'sold'
            const moved = sellMove(state, offer.playerId, offer.fromTeamId, counterPrice, buyingTeam?.shortName ?? '')
            const soldDate = state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`
            return {
              players: moved.players,
              teams: moved.teams,
              transferHistory: [...(state.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
              currentSeason: {
                ...state.currentSeason,
                transferIncome: (state.currentSeason.transferIncome ?? 0) + moved.income,
                incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offerId),
                // 売却した選手の出品（自分のもの含む）は市場から掃除する
                transferListings: (state.currentSeason.transferListings ?? []).filter(l => l.playerId !== offer.playerId),
                // 逆提示で成立したときも、承諾したときと同じようにニュースと退団のお知らせを出す
                newsFeed: [{ date: soldDate, headline: `${player.name}を${buyingTeam?.shortName ?? ''}へ移籍金${Math.round(counterPrice / 10000)}万で放出`, category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30),
                departureNotices: [...(state.currentSeason.departureNotices ?? []), ...(moved.notice ? [moved.notice] : [])],
              },
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
        const players = state.players.map(p => p.id === playerId ? { ...p, overseasListed: req.region, morale: Math.min(100, (p.morale ?? 70) + 8) } : p)
        return { players }
      }),

      // 海外挑戦を引き留める：モラール低下（2回目以降は大）。その年は再直訴しない
      denyOverseasChallenge: (playerId) => set(state => {
        const cnt = ((state.players.find(p => p.id === playerId)?.overseasDeniedCount) ?? 0) + 1
        const drop = cnt >= 2 ? 20 : 12
        return {
          players: state.players.map(p => p.id === playerId ? { ...p, overseasDeniedYear: state.currentSeason.year, overseasDeniedCount: cnt, morale: Math.max(0, (p.morale ?? 70) - drop) } : p),
          currentSeason: { ...state.currentSeason, overseasRequests: (state.currentSeason.overseasRequests ?? []).filter(r => r.playerId !== playerId) },
        }
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
        if (!player || !canListForSale(player, {
          teamId: state.playerTeamId,
          currentYear: state.currentSeason.year,
          retiringIds: new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId)),
        })) return state
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
          competingTeams: interested,
        }
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
            transferListings: alreadyListed ? state.currentSeason.transferListings : [...(state.currentSeason.transferListings ?? []), allowListing],
          },
        }
      }),

      toggleNoSale: (playerId) => set(state => {
        const player = state.players.find(p => p.id === playerId)
        if (!player || player.teamId !== state.playerTeamId) return state
        const next = !player.noSale
        // 売出（移籍リスト入り）とは矛盾するので、非売ONで売出は自動解除
        const tnsPlayers = state.players.map(p => p.id === playerId ? { ...p, noSale: next, ...(next ? { transferListed: false } : {}) } : p)
        return {
          players: tnsPlayers,
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
        // 売出とは排他（売る気の選手を貸しには出さない）。貸出ONで売出は自動解除
        const tllPlayers = state.players.map(p => p.id === playerId ? { ...p, loanListed: next, ...(next ? { transferListed: false } : {}) } : p)
        return {
          players: tllPlayers,
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
        const cslPlayers = state.players.map(p => p.id === playerId ? { ...p, transferListed: false } : p)
        return {
          players: cslPlayers,
          // 退団予定を解除したら、その選手あての古い札も片付ける。
          // 契約更新の札は allowPlayerTransfer 側でもう消えているので、ここで解除すれば
          // 次のレース進行から普通に契約更新の話が出るようになる
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
        // ロスター上限チェック。借入も1人ぶん枠を食う。以前は判定が無く、上限を超えたうえに
        // レンタル選手は解雇できないため人数を戻せない詰み状態になっていた。
        const myRosterNow = st.players.filter(p => p.teamId === st.playerTeamId && p.status !== 'retired').length
        if (myRosterNow >= ROSTER_MAX) return false
        // 相手チームの主力（複数年の出場＋ECL経験で判定）は貸さない（forceなら相手が貸す打診済みなのでスキップ）
        if (!force && keyPlayerStatus(player, st.currentSeason, st.pastSeasons) !== 'open') return false
        const ownerId = player.teamId
        const yrs = Math.max(1, Math.min(2, years))
        set(state => {
          // 移動は movePlayer 一本。until を渡すとレンタル扱いになり、保有元(ownerId)が残り
          // 貸し手の名簿から外れる。借り手の名簿にも載せない（走るのは自チームだが保有権は無い）
          const moved = movePlayer(state, playerId, state.playerTeamId, {
            year: state.currentSeason.year,
            until: state.currentSeason.year + yrs,
            raceIndex: state.currentSeason.currentRaceIndex,
            myTeamId: state.playerTeamId,
          })
          if (!moved.ok) return state
          return {
            players: moved.players,
            teams: moved.teams,
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
        // 貸し出していい選手かの判定は他の移籍と同じものを使う（utils/transferEligibility.ts）。
        // ここは自前で「借りている選手か」だけ見ていたので、引退希望を受けた選手や
        // 海外挑戦を承認した選手をレンタルに出せてしまっていた
        if (!player) return false
        if (!canLoanOut(player, {
          teamId: st.playerTeamId,
          currentYear: st.currentSeason.year,
          retiringIds: new Set((st.currentSeason.retirementRequests ?? []).map(r => r.playerId)),
        })) return false
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
            toName: state.teams.find(t => t.id === toTeamId)?.shortName ?? '他クラブ',
          })
          if (!moved.ok) return state
          return {
            players: moved.players,
            teams: moved.teams,
            currentSeason: {
              ...state.currentSeason,
              newsFeed: [{ date: state.currentSeason.races[Math.max(0, state.currentSeason.currentRaceIndex - 1)]?.date ?? `${state.currentSeason.year}-06-01`, headline: `${player.name}を${yrs}シーズンのレンタルで放出`, category: 'trade' as const, relatedIds: [player.id] }, ...state.currentSeason.newsFeed].slice(0, 30),
              departureNotices: [...(state.currentSeason.departureNotices ?? []), ...(moved.notice ? [moved.notice] : [])],
            },
          }
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
        // 入札してから成立までの間に状況が変わっていないか、入口と同じ判定で見直す
        if (!canBePoached(player, { teamId: bid.targetTeamId, currentYear: state.currentSeason.year })) {
          return { ok: false, reason: '彼の状況が変わったため、この移籍は成立しませんでした。' }
        }
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam || myTeam.finance.budget < bid.offeredFee) return { ok: false, reason: `貴クラブの予算では移籍金${Math.round(bid.offeredFee / 10000)}万を支払えないようです。資金を確保してから改めてお願いします。` }
        // ロスター枠チェック（移籍金ルートは本契約として加入する）。枠不足は決裂扱いにしない
        if (!canSignContract(state.players, state.playerTeamId)) {
          return { ok: false, reason: `貴クラブのロスターが上限（${ROSTER_MAX}人）のようです。整理してから改めてお願いします。` }
        }
        // 選手本人の同意ゲート
        const standings = rankedStandings(state.currentSeason.standings)
        const myRank = standings.findIndex(s => s.teamId === state.playerTeamId) + 1
        const scoutLvT = myTeam.facilities?.scoutOffice ?? 0
        // 相場を大きく上回る年俸は本人の説得材料になる（相場1.2倍で+0.1、1.5倍で+0.2）
        const marketSalary = faMarketSalary(player, perfOf(state.currentSeason, player.id))
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
        // 移動は movePlayer 一本（枠チェック・旧クラブの名簿整理・移籍金の受け渡し・履歴まで込み）
        const moved = movePlayer(state, bid.playerId, state.playerTeamId, {
          year: state.currentSeason.year,
          date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date,
          raceIndex: state.currentSeason.currentRaceIndex,
          fee: bid.offeredFee, years, myTeamId: state.playerTeamId, checkCapacity: true,
          contract: { annualSalary: salary, yearsLeft: years, contractType: 'standard' },
        })
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
            newsFeed: [{ date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date ?? `${s.currentSeason.year}-06-01`, headline: `${player.name}を移籍金${Math.round(bid.offeredFee / 10000)}万・年俸${Math.round(salary / 10000)}万で獲得`, category: 'trade' as const, relatedIds: [player.id], major: bid.offeredFee >= 100_000_000, fromTeamId: bid.targetTeamId, toTeamId: s.playerTeamId }, ...s.currentSeason.newsFeed].slice(0, 30),
          },
        }))
        return { ok: true }
      },

      listMyPlayerForSale: (playerId, askingPrice) => {
        const state = get()
        const player = state.players.find(p => p.id === playerId)
        // レンタルで借りている選手（保有権が無い）と、海外挑戦を承認済みの選手は売り出せない。
        // 材料は allowPlayerTransfer と同じものを渡す（引退希望を出したままの選手を売りに出せていた）
        if (!player || !canListForSale(player, {
          teamId: state.playerTeamId,
          currentYear: state.currentSeason.year,
          retiringIds: new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId)),
        })) return
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

      // 自チーム選手の名前を変更する。名前は選手データそのものに書くので、
      // 移籍しても引退してもそのまま残る（過去の記録に残っている名前は当時のまま）。
      renamePlayer: (playerId, name) => {
        const trimmed = name.trim().slice(0, 12)
        if (!trimmed) return
        set(state => ({
          players: state.players.map(p => p.id === playerId ? { ...p, name: trimmed } : p),
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

      setRivalTeam: (id) => set({ rivalTeamId: id }),

      claimPreseasonCards: () => {
        set(state => {
          if (state.currentSeason.campBonus?.applied) return state
          const lastSeason = state.pastSeasons[state.pastSeasons.length - 1]
          let rank = 0
          if (lastSeason?.standings?.length) {
            const sorted = rankedStandings(lastSeason.standings)
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
        const tradeCtx = {
          teamId: state.playerTeamId,
          currentYear: state.currentSeason.year,
          retiringIds: new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId)),
        }
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
          outExtra: offerPickKeys.reduce((s, k) => s + pickKeyValue(k), 0) + Math.max(0, transferFee),
          inExtra: requestPickKeys.reduce((s, k) => s + pickKeyValue(k), 0) + Math.max(0, -transferFee),
        }
        const bal = tradeBalance(tradeIn, tvCtx)
        if (!bal.ok) return { ok: false, reason: bal.reason }
        const tradeVals = tradeValues(tradeIn, tvCtx)

        // 選手本人の同意ゲート：獲得する選手が自チームへの移籍に納得しなければ成立しない
        // （相手クラブが大きく得をする取引＝1.2倍以上なら本人の説得材料になる。proposeTradeと同じ）
        const stgs = rankedStandings(state.currentSeason.standings)
        const myRankNow = stgs.findIndex(s => s.teamId === state.playerTeamId) + 1
        const consentBonusT = tradeVals.ratio >= 1.2 ? 0.15 : 0
        for (const rp of requested) {
          if (!playerConsentToMove(rp, myRankNow, state.teams.length, 0.5, 0, consentBonusT).ok) return { ok: false, reason: `${rp.name}はこの移籍を望んでいない。` }
        }

        function matchPick(picks: typeof state.teams[0]['draftPicks'], key: string) {
          return picks.find(pk => `${pk.year}-R${pk.round}-${pk.pickNumber}` === key)
        }

        set(state => {
          // 在籍判定は player.teamId が単一ソース。team.roster.main には古いセーブ由来の
          // ゴーストIDが残ることがあり、それを見ると該当選手だけ movePlayer が呼ばれず、
          // こちらの選手だけ出て行って相手の選手が来ない片落ちトレードになる
          const myIdsAfterTrade = squadIdsOf(state.players, state.playerTeamId).filter(id => !offeredIds.includes(id))
          const incomingIds = requestedIds.filter(id => !myIdsAfterTrade.includes(id))
          const tradeDate = state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`

          // 出入りとも movePlayer 一本。出す側だけ加入年が入らない、といった書き分けが起きない
          let players = state.players
          let movedTeams = state.teams
          const tradeRecords: TransferRecord[] = []
          const runTrade = (pid: string, toTeamId: string) => {
            const m = movePlayer({ players, teams: movedTeams }, pid, toTeamId, {
              year: state.currentSeason.year,
              date: tradeDate,
              raceIndex: state.currentSeason.currentRaceIndex,
              kind: 'trade',
              years: players.find(p => p.id === pid)?.contract.yearsLeft,
              myTeamId: state.playerTeamId,
            })
            if (!m.ok) return
            players = m.players
            movedTeams = m.teams
            if (m.record) tradeRecords.push(m.record)
          }
          for (const id of offeredIds) runTrade(id, targetTeamId)
          for (const id of incomingIds) runTrade(id, state.playerTeamId)

          const myTeamPicks = state.teams.find(t => t.id === state.playerTeamId)?.draftPicks ?? []
          const theirPicks = state.teams.find(t => t.id === targetTeamId)?.draftPicks ?? []
          const offeredPicks = offerPickKeys.map(k => matchPick(myTeamPicks, k)).filter(Boolean) as typeof myTeamPicks
          const requestedPicks = requestPickKeys.map(k => matchPick(theirPicks, k)).filter(Boolean) as typeof theirPicks

          // 名簿はもう movePlayer が付け替え済み。ここでは指名権と現金だけ動かす
          // （transferFee はマイナス＝受け取りもあるので movePlayer の移籍金には乗せない）
          const teams = movedTeams.map(t => {
            if (t.id === state.playerTeamId) return {
              ...t,
              finance: { ...t.finance, budget: (t.finance.budget ?? 0) - transferFee },
              draftPicks: [...(t.draftPicks ?? []).filter(pk => !offeredPicks.includes(pk)), ...requestedPicks],
            }
            if (t.id === targetTeamId) return {
              ...t,
              finance: { ...t.finance, budget: (t.finance.budget ?? 0) + transferFee },
              draftPicks: [...(t.draftPicks ?? []).filter(pk => !requestedPicks.includes(pk)), ...offeredPicks],
            }
            return t
          })
          const feeNote = transferFee > 0 ? ` (+${Math.round(transferFee/10000)}万)` : transferFee < 0 ? ` (受取${Math.round(-transferFee/10000)}万)` : ''
          const pickNote = [...offerPickKeys.map(() => `指名権`), ...requestPickKeys.map(() => `指名権`)].length > 0 ? ` [指名権含む]` : ''
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

          // 出した選手についての話（購入オファー・契約更新・移籍希望など）は成立と同時に片付ける。
          // レースを跨ぐまで古い札が残っていると、退団した選手のチャットが開けてしまう
          return { players, teams,
            transferHistory: [...(state.transferHistory ?? []), ...tradeRecords].slice(-400),
            currentSeason: {
            ...state.currentSeason,
            acquisitionOffers: [...keptOffers, ...incomingOffers],
            newsFeed: [tradeNews, ...state.currentSeason.newsFeed].slice(0, 30),
          } }
        })
        return { ok: true }
      },

      // トレードのチャット交渉。提案→相手が承諾/カウンター/拒否（最大3回）。
      proposeTrade: (targetTeamId, giveIds, givePickKeys, getIds, getPickKeys) => {
        const state = get()
        // 評価式は utils/tradeValue.ts の1本。主力の割増は出す側・もらう側の両方に同じだけ掛かる
        const tvCtx = tradeValueCtxOf(state)
        const playersOf = (ids: string[]) => ids.map(id => state.players.find(p => p.id === id)).filter((p): p is Player => !!p)
        const picksOf = (picks: string[]) => picks.reduce((s, k) => s + pickKeyValue(k), 0)
        const theirName = findClub(state.teams, state.foreignLeagues, targetTeamId)?.shortName
          ?? '相手クラブ'
        const givePlayers = playersOf(giveIds)
        const getPlayersT = playersOf(getIds)
        const baseIn = { outPlayers: givePlayers, inPlayers: getPlayersT,
          outExtra: picksOf(givePickKeys), inExtra: picksOf(getPickKeys) }
        // 相手が受け取るぶんは額面、相手が手放すぶんは相手の言い値。物差しは tradeValues が持つ
        const { cpuGain, cpuLoss } = tradeValues(baseIn, tvCtx)

        const existing = (state.currentSeason.tradeNegotiations ?? []).find(n => n.targetTeamId === targetTeamId)
        const round = (existing?.round ?? 0) + 1

        // 獲得選手の同意（相手クラブが大きく得をする取引＝1.2倍以上なら本人の説得材料になる）
        const stgs = rankedStandings(state.currentSeason.standings)
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
          const counterCtx = {
            teamId: state.playerTeamId,
            currentYear: state.currentSeason.year,
            retiringIds: new Set((state.currentSeason.retirementRequests ?? []).map(r => r.playerId)),
          }
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
        const expiredNegs: ExpiredNegotiation[] = []
        const lockedIds: string[] = []

        // 入札(移籍金オファー)の応答。判定は本編の1戦と同じ resolveBid 1本
        const bids = (cs.transferBids ?? []).map(bid => {
          const r = resolveBid(bid, {
            players: state.players,
            listings: cs.transferListings ?? [],
            currentSeason: { year: cs.year, races, eclSeries: cs.eclSeries },
            pastSeasons: state.pastSeasons,
            raceIndex: raceIdx,
          })
          if (r.expired) {
            expiredNegs.push(r.expired)
            lockedIds.push(r.expired.playerId)
          }
          return r.bid
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
            const loanable = keyPlayerStatus(pl, { year: cs.year, races, eclSeries: cs.eclSeries }, state.pastSeasons) === 'open'
            const ownerShort = findClub(state.teams, state.foreignLeagues, pl.teamId)?.shortName
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

        let players: Player[] = state.players.map(p =>
          lockedIds.includes(p.id) ? { ...p, transferLockedUntilYear: cs.year + 1 } : p)
        let teams = state.teams
        // 借用成立は movePlayer に通す（保有元を残して、貸した側の名簿から外す）
        for (const a of acceptedLoans) {
          const m = movePlayer({ players, teams }, a.playerId, playerTeamId, {
            year: cs.year,
            until: cs.year + a.years,
            raceIndex: raceIdx,
            years: a.years,
            myTeamId: playerTeamId,
          })
          if (!m.ok) continue
          players = m.players
          teams = m.teams
        }

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
          // 国内チームも海外クラブも同じ数え方。所属は選手側の teamId だけを見る。
          // 負傷者もここには入れる（実際に走らせるかは ecl.ts が決める。健康な選手を先に使い、
          // 区間が埋まらないときだけ負傷者を立てる。ここで外すと空区間や出場取り消しになる）
          playerIds: state.players.filter(p => belongsToClub(p, pt.id)).map(p => p.id),
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

        // 区間記録の判定（JPELの駅伝と同じ仕組み。コースは固定10種なので年をまたいで記録が競われ、保持者には区間記録パッチが付く）。
        // 歴代記録は保存してあるレース結果から数え直す。今走った結果はまだ入っていないので「走る前の記録」になる
        const prevSegRecordsEcl = segmentRecordsOf(state.pastSeasons, state.currentSeason)
        const newSegRecordMarksEcl: { segmentIndex: number; playerId: string }[] = []
        const shortById = new Map(participants.map(pt => [pt.id, pt.shortName]))
        for (const sr of result.raceResults?.segmentResults ?? []) {
          const prevBest = (prevSegRecordsEcl[`${race.name}-${sr.segmentIndex}`] ?? [])[0]?.timeSec ?? null
          const fastestRunner = sr.runners.length > 0
            ? sr.runners.reduce((min, r) => r.timeSec < min.timeSec ? r : min, sr.runners[0])
            : null
          // 区間新記録が出たらニュースにする（過去記録がある区間で更新された場合のみ）
          if (prevBest != null && fastestRunner && fastestRunner.timeSec < prevBest) {
            const isMine = fastestRunner.teamId === state.playerTeamId
            const plName = state.players.find(x => x.id === fastestRunner.playerId)?.name ?? '不明'
            const tmShort = shortById.get(fastestRunner.teamId) ?? '?'
            newsItems.push({
              date: race.date,
              headline: `【区間新記録】${race.name} 第${sr.segmentIndex}区 ${plName}（${tmShort}）${formatRaceTime(fastestRunner.timeSec)}（従来 ${formatRaceTime(prevBest)}）${isMine ? ' ★自チーム' : ''}`,
              category: 'race' as const,
              relatedIds: [fastestRunner.playerId],
            })
            newSegRecordMarksEcl.push({ segmentIndex: sr.segmentIndex, playerId: fastestRunner.playerId })
          }
        }

        let updatedTeams = state.teams
        let newAch: NonNullable<GameState['achievements']> = []
        let eclResult = state.currentSeason.eclResult
        let eclFinalRank = 0   // 最終戦のみ確定する年間総合順位（ジュエルの総合ボーナス用）

        if (isFinal) {
          // 最終順位＝累計ポイント降順
          const finalStandings: EclStanding[] = series.participants
            .map(pt => ({ ...pt, points: newPoints[pt.id] ?? 0 }))
            .sort((a, b) => b.points - a.points)
          const champion = finalStandings[0]
          const myRank = finalStandings.findIndex(s => s.isPlayerTeam) + 1
          eclFinalRank = myRank
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
          newsItems.push({
            date: race.date,
            headline: won
              ? `【世界一】ECL最終戦を終え、自チームが年間王者に！世界の頂点に立つ`
              : `ECL：全5戦を終え${champion?.name ?? ''}が年間王者に${myRank > 0 ? `。自チームは総合${myRank}位` : ''}`,
            category: 'race' as const,
            relatedIds: [race.id],
          })
        }

        // ── ジュエル：国内レース（runRace）の1.5倍。順位20/10/5→30/15/7、区間賞5→7、実績も1.5倍。
        //    7.5は切り捨てて7。年間総合順位のボーナスだけは国内のシーズン終了と同じ200/100/50（1.5倍しない）。
        //    二軍（advanceSecondTeamRace）と世界選手権はこれまで通り付与なし。 ──
        const myEclSegWins = myRaceRank > 0
          ? state.players.filter(p => p.teamId === state.playerTeamId && segWinIds.has(p.id)).length
          : 0
        const eclJewelGains: { label: string; amount: number }[] = []
        if (myRaceRank > 0) {
          const rankJ = myRaceRank === 1 ? 30 : myRaceRank === 2 ? 15 : myRaceRank === 3 ? 7 : 0
          if (rankJ > 0) eclJewelGains.push({ label: `ECL${myRaceRank}位`, amount: rankJ })
          if (myEclSegWins > 0) eclJewelGains.push({ label: `区間賞×${myEclSegWins}`, amount: myEclSegWins * 7 })
          for (const a of newAch) {
            const j = Math.round((ACHIEVEMENT_JEWELS[a.rarity] ?? 0) * 1.5)
            if (j > 0) eclJewelGains.push({ label: `実績「${a.name}」`, amount: j })
          }
        }
        // 年間総合（最終戦時のみ）。自チームが出ていないシリーズでは eclFinalRank が0になるので付かない
        const eclTotalJ = eclFinalRank === 1 ? 200 : eclFinalRank === 2 ? 100 : eclFinalRank === 3 ? 50 : 0
        if (eclTotalJ > 0) eclJewelGains.push({ label: `ECL年間総合${eclFinalRank}位`, amount: eclTotalJ })
        const eclJewels = eclJewelGains.reduce((s, g) => s + g.amount, 0)

        return {
          teams: updatedTeams,
          players: updatedPlayers,
          // 自チームが出ていない観戦シリーズは裏で自動消化されるので、獲得ゼロのときは
          // 未表示の内訳（前のレースぶん）を消さないようキーごと書かない
          ...(eclJewels > 0 ? {
            jewels: state.jewels + eclJewels,
            jewelGains: [...(state.jewelGains ?? []), ...eclJewelGains].slice(-20),
          } : {}),
          // このレースで出た区間新に張り替える（前のリーグ戦のバッジ記録が残って誤表示されるのを防ぐ）
          raceNewSegmentRecords: newSegRecordMarksEcl,
          achievements: [...(state.achievements ?? []), ...newAch],
          currentSeason: {
            ...state.currentSeason,
            eclSeries: { ...series, races: newRaces, raceIndex: nextIndex, points: newPoints },
            eclResult,
            newsFeed: [...newsItems, ...state.currentSeason.newsFeed].slice(0, 30),
          },
        }
      }),

      startRegularSeason: () => set(state => {
        // ロスター下限ガード：15人未満では開幕できない（UI側でもブロックするが、最終防衛線としてここでも弾く）
        const myCount = state.players.filter(p => p.teamId === state.playerTeamId && p.status !== 'retired').length
        if (myCount < 15) return state
        // プレシーズンのドラフト（今季スカウトした代）が終わったので、
        // 今季スカウトする「翌年の代」を新規生成する。前回ドラフト済みの代の残りを置き換える。
        // これで endSeason 側で引き継いだ視察済みプールがドラフトに使われ、シーズン中の視察は常に新しい代になる。
        const freshScoutPool = generateDraftPool(state.currentSeason.year + 1, new Set(state.players.map(pl => pl.name)))
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
        const pickOrder = ownedYearPicks.length >= state.teams.length
          ? ownedYearPicks.map(pk => pk.ownerId)
          : buildDraftOrder(draftOrderTeams(state.teams, state.pastSeasons), state.currentSeason.year, state.playerTeamId)

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
        const rosterCapFor = (teamId: string) => 30 - (draftPickCounts.get(teamId) ?? 0)

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
        const cpuTransferIds = new Set<string>()
        let playersAfterCpuTransfer = playersAfterCpuRelease
        let teamsAfterCpuTransfer = teamsAfterCpuRelease
        {
          // 前年順位（引き抜き時の本人同意＝移籍先の魅力判定に使う）
          const lastStandingsForTx = rankedStandings((state.pastSeasons[state.pastSeasons.length - 1]?.standings ?? []))
          const totalTeamsTx = state.teams.length
          const rankOfTx = (teamId: string) => { const i = lastStandingsForTx.findIndex(s => s.teamId === teamId); return i >= 0 ? i + 1 : Math.ceil(totalTeamsTx / 2) }

          // 実際の予算残高（finance.budget）から移籍金を払う。売った側は実際に受け取る（自チームと同じ金の動き）。
          // 順番は「前年順位が下のチームから」。同順は残高の多い方から
          const cpuTeamsForTransfer = teamsAfterCpuRelease
            .filter(t => t.id !== state.playerTeamId)
            .map(t => ({ team: t, tier: cpuTeamTier(t.id, playersAfterCpuRelease), budget: Math.max(0, t.finance.budget) }))
            .sort((a, b) => (rankOfTx(b.team.id) - rankOfTx(a.team.id)) || (b.budget - a.budget))

          const transferPurchases: Record<string, number> = {}
          const sellCounts: Record<string, number> = {}   // 1チームが1オフに失う人数の上限（薄くしすぎない）
          const txNeeds = new Map(cpuTeamsForTransfer.map(x => [x.team.id, new Set(cpuSpecialtyNeeds(x.team.id, playersAfterCpuTransfer))]))

          // 1周につき1人だけ買う。以前は1チームが上限まで買い切ってから次に回していたので、
          // 市場の良い選手が予算の多い上位チームに固まっていた（utils/roundRobin.ts）
          const buyOnePlayer = ({ team: buyTeam, tier: buyTier }: typeof cpuTeamsForTransfer[number]): boolean => {
            const minOvr = buyTier === 'elite' ? 74 : buyTier === 'mid' ? 67 : 60
            // 有料移籍・引き抜きを補強の主体にする：獲得上限をtier別に引き上げ（旧: 一律2人）
            const buyCap = buyTier === 'elite' ? 4 : buyTier === 'mid' ? 3 : 2
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
                .sort((a, b) => ovr(b) - ovr(a))
              if (sellRoster.length <= 16) return []   // 薄いチームからは引き抜かない（下限保護）
              const sellTier = cpuTeamTier(sellTeamId, playersAfterCpuTransfer)
              const sellMinOvr = sellTier === 'elite' ? 74 : sellTier === 'mid' ? 67 : 58
              // 売り手の絶対的エース(1番手)だけ保護。それ以外は主力でも引き抜き対象にする。
              return sellRoster.slice(1)
                // isOwnedBy でレンタル中の選手を外す。ここが抜けていたため、貸し出した選手が
                // オフシーズンに貸出先の名簿として売られ、保有元に何も残らず消えていた
                .filter(p => isOwnedBy(p, sellTeamId) && !cpuTransferIds.has(p.id) && p.joinedYear !== state.currentSeason.year)
                .map(p => ({ p, surplus: ovr(p) < sellMinOvr || sellRoster.length > 21 }))
            })
              .filter(({ p }) => ovr(p) >= minOvr - 4)
              // 買い手のニーズに合う選手・OVRの高い選手を優先
              .sort((a, b) => (Number(needs.has(b.p.specialty)) - Number(needs.has(a.p.specialty))) || (ovr(b.p) - ovr(a.p)))

            let bought = false
            for (const { p: target, surplus } of candidates) {
              // 余剰は通常額、主力の引き抜きは割増移籍金＋昇給要求＋本人同意
              const fee = surplus ? calcTransferValue(target) : Math.round(calcTransferValue(target) * POACH_PREMIUM)
              const tgtPerf = perfOf(state.currentSeason, target.id)
              const newSalary = surplus ? faMarketSalary(target, tgtPerf) : acquisitionDesiredSalary(target, 'scout', 0.5, 0, tgtPerf)
              if (remainBudget < fee + newSalary) continue
              // 引き抜きは本人が移籍先の魅力で納得するか判定（クラブは割増で合意済み＝clubBlessed）
              if (!surplus && !playerConsentToMove(target, rankOfTx(buyTeam.id), totalTeamsTx, 0.5, 0, 0, true).ok) continue
              const txYear = state.currentSeason.year
              // 所属・名簿・移籍金・移籍履歴は movePlayer にまとめて任せる（自チームの獲得と同じ後始末）
              const moved = movePlayer({ players: playersAfterCpuTransfer, teams: teamsAfterCpuTransfer }, target.id, buyTeam.id, {
                year: txYear,
                date: `${txYear}-02-01`,
                fee,
                years: 2,
                contract: { annualSalary: newSalary, yearsLeft: 2 },
              })
              if (!moved.ok) continue
              cpuTransferIds.add(target.id)
              transferPurchases[buyTeam.id] = (transferPurchases[buyTeam.id] ?? 0) + 1
              sellCounts[moved.from] = (sellCounts[moved.from] ?? 0) + 1
              playersAfterCpuTransfer = moved.players.map(p =>
                p.id !== target.id ? p : { ...p, contract: { ...p.contract, faEligibleYear: txYear + 2 } })
              teamsAfterCpuTransfer = moved.teams
              if (moved.record) offseasonTxRecords.push(moved.record)
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
            const buyTier = cpuTeamTier(buyerId, playersAfterCpuTransfer)
            const buyMinOvr = buyTier === 'elite' ? 74 : buyTier === 'mid' ? 67 : 60
            const buyRoster = playersAfterCpuTransfer.filter(p => p.teamId === buyerId && p.status === 'active')
            if (buyRoster.length >= 23) continue
            const buyerSurplus = buyRoster
              // レンタルで借りている選手は保有権が無いのでトレードに出せない
              .filter(p => isOwnedBy(p, buyerId) && !tradedIds.has(p.id) && p.joinedYear !== state.currentSeason.year && ovr(p) < buyMinOvr)
              .sort((a, b) => calcTransferValue(b) - calcTransferValue(a))
            if (buyerSurplus.length === 0) continue
            const offered = buyerSurplus[0]
            const offeredVal = calcTransferValue(offered)
            for (const sellerId of cpuIdsForTrade) {
              if (sellerId === buyerId || (tradeCount[sellerId] ?? 0) >= 1) continue
              const sellTier = cpuTeamTier(sellerId, playersAfterCpuTransfer)
              const sellMinOvr = sellTier === 'elite' ? 74 : sellTier === 'mid' ? 67 : 58
              const sellRoster = playersAfterCpuTransfer
                .filter(p => p.teamId === sellerId && p.status === 'active')
                .sort((a, b) => ovr(b) - ovr(a))
              const target = sellRoster.slice(3).find(p =>
                isOwnedBy(p, sellerId) &&
                !tradedIds.has(p.id) &&
                p.joinedYear !== state.currentSeason.year &&
                ovr(p) >= buyMinOvr && ovr(p) < sellMinOvr &&
                calcTransferValue(p) <= offeredVal * 1.3
              )
              if (!target || ovr(offered) < sellMinOvr - 6) continue
              tradedIds.add(offered.id); tradedIds.add(target.id)
              tradeCount[buyerId] = (tradeCount[buyerId] ?? 0) + 1
              tradeCount[sellerId] = (tradeCount[sellerId] ?? 0) + 1
              // 交換する2人とも movePlayer に通す（自チームのトレードと同じ後始末）
              for (const [pid, toId] of [[offered.id, sellerId], [target.id, buyerId]] as const) {
                const m = movePlayer({ players: playersAfterCpuTransfer, teams: teamsAfterCpuTransfer }, pid, toId, {
                  year: state.currentSeason.year,
                  date: `${state.currentSeason.year}-02-01`,
                  kind: 'trade',
                })
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
          for (const senderId of cpuIdsForLoan) {
            if (mainCount(senderId) <= 21 || (givenLoan[senderId] ?? 0) >= 1) continue
            const receiver = cpuIdsForLoan.find(id => id !== senderId && mainCount(id) < 17 && (receivedLoan[id] ?? 0) < 1)
            if (!receiver) continue
            const candidate = playersAfterCpuTransfer
              .filter(p => p.teamId === senderId && p.status === 'active' && !p.loan && !loanedIds.has(p.id) && p.joinedYear !== state.currentSeason.year)
              .sort((a, b) => ovr(a) - ovr(b))[0]
            if (!candidate) continue
            loanedIds.add(candidate.id)
            givenLoan[senderId] = (givenLoan[senderId] ?? 0) + 1
            receivedLoan[receiver] = (receivedLoan[receiver] ?? 0) + 1
            // レンタルも movePlayer に通す。借りた側の名簿には載せない
            // （以前はここだけ載せていて、セーブを読み直すと消える食い違いになっていた）
            const m = movePlayer({ players: playersAfterCpuTransfer, teams: teamsAfterCpuTransfer }, candidate.id, receiver, {
              year: state.currentSeason.year,
              until: loanYear,
            })
            if (!m.ok) continue
            playersAfterCpuTransfer = m.players
            teamsAfterCpuTransfer = m.teams
          }
        }

        // FA補強（受け皿）：移籍市場で動けなかった選手・チームの補完。
        // 高齢選手は実力どおりに評価しない（33歳以上は年齢ぶん減点した「年齢調整OVR」順で選ぶ＝35歳の高OVRに飛びつかない）
        const ageAdjOvr = (p: Player) => ovr(p) - Math.max(0, p.age - 32) * 3
        const availableFAs = playersAfterCpuTransfer
          .filter(p => p.teamId === '' && p.status === 'active')
          .sort((a, b) => ageAdjOvr(b) - ageAdjOvr(a))
        const signedFAIds = new Set<string>()
        const cpuSignings: { playerId: string; teamId: string }[] = []
        // 前年順位（運用方針・予算の基準）
        const lastStandings = rankedStandings((state.pastSeasons[state.pastSeasons.length - 1]?.standings ?? []))
        const totalTeams = state.teams.length
        const rankOf = (teamId: string) => { const i = lastStandings.findIndex(s => s.teamId === teamId); return i >= 0 ? i + 1 : Math.ceil(totalTeams / 2) }
        // 順番は「前年順位が下のチームから」。同順の並びは毎年シャッフル（特定チームだけが毎年得をしないように）
        const tierJitter = new Map(teamsAfterCpuTransfer.map(t => [t.id, Math.random()]))
        const cpuTeamsSorted = teamsAfterCpuTransfer
          .filter(t => t.id !== state.playerTeamId)
          .sort((a, b) => (rankOf(b.id) - rankOf(a.id)) || (tierJitter.get(a.id)! - tierJitter.get(b.id)!))

        // チームごとの補強の事情（枠・予算・欲しい専門）は最初に1回だけ組み立てる
        const faCtxList = cpuTeamsSorted.map(team => {
          // フラットロスター：1軍/2軍の区別なし。総在籍だけで管理する
          const currentRoster = playersAfterCpuTransfer.filter(p => p.teamId === team.id && p.status === 'active')
          const tier = cpuTeamTier(team.id, playersAfterCpuTransfer)
          const minOvr = tier === 'elite' ? 74 : tier === 'mid' ? 67 : 58
          const totalNow = currentRoster.length
          // 運用方針と予算
          const avgAge = currentRoster.length ? currentRoster.reduce((s, p) => s + p.age, 0) / currentRoster.length : 27
          const strat = cpuStrategy(rankOf(team.id), totalTeams, avgAge)
          const committedSalary = playersAfterCpuTransfer.filter(p => p.teamId === team.id).reduce((s, p) => s + p.contract.annualSalary, 0)
          const spendFactor = strat === 'contend' ? 1.0 : strat === 'rebuild' ? 0.4 : 0.7
          // 補強原資 ＝ 年俸原資の余り（グラント−既存年俸）＋ 実残高の一部。
          // 売却・賞金で貯めた残高が補強に反映され、貧乏チームは予算切れで少人数（下限24）に落ち着く
          const grantRoom = Math.max(0, rankBudgetGrant(rankOf(team.id)) - committedSalary)
          const budgetRoom = Math.max(0, team.finance.budget) * 0.3
          return {
            team, totalNow,
            slotsNeeded: Math.max(0, rosterCapFor(team.id) - totalNow),
            spendable: team.finance.budget < 0 ? 0 : (grantRoom + budgetRoom) * spendFactor,
            spent: 0, signed: 0,
            needs: cpuSpecialtyNeeds(team.id, playersAfterCpuTransfer),
            specCounts: {} as Record<string, number>,
            // 高齢FAとは契約しない：優勝狙いでも33歳まで、通常は32歳まで、エリートは若手志向、再建は27歳まで
            ageCap: strat === 'contend' ? 34 : strat === 'rebuild' ? 28 : (tier === 'elite' ? 31 : 33),
            specFloor: strat === 'rebuild' ? 50 : Math.max(50, minOvr - 10),
            // 若手再建はポテンシャル・若さ優先、それ以外はOVR優先（availableFAsは既にOVR降順）
            pool: strat === 'rebuild'
              ? [...availableFAs].filter(p => p.age <= 27).sort((a, b) => (b.potential - a.potential) || (a.age - b.age))
              : availableFAs,
          }
        })
        type FaCtx = typeof faCtxList[number]
        const estCost = (fa: Player) => faMarketSalary(fa, perfOf(state.currentSeason, fa.id))
        const doSignFA = (c: FaCtx, fa: Player) => {
          signedFAIds.add(fa.id); cpuSignings.push({ playerId: fa.id, teamId: c.team.id })
          c.signed++; c.spent += estCost(fa)
        }
        // 1周につき1人だけ。取れるチームが無くなったら終わり（utils/roundRobin.ts）。
        // 以前は1チームが枠を埋めきってから次に回していたので、良いFAが上位チームに固まっていた
        const signOneFA = (c: FaCtx): boolean => {
          if (c.signed >= c.slotsNeeded) return false
          // 外国人枠は廃止したので国籍による人数制限は無い
          const canSign = (fa: Player) => !signedFAIds.has(fa.id) && fa.age < c.ageCap
          // 総在籍24人未満の間は予算に関係なく最低限補強（戦力崩壊防止）。それ以上は予算内でのみ
          const budgetOk = (fa: Player) => (c.totalNow + c.signed) < 24 || (c.spent + estCost(fa) <= c.spendable)
          // ① 専門の穴埋め（1つの専門につき2人まで）
          for (const spec of c.needs) {
            const have = playersAfterCpuTransfer.filter(p => p.teamId === c.team.id && p.specialty === spec && p.status === 'active').length
            if (have + (c.specCounts[spec] ?? 0) >= 2) continue
            const fa = c.pool.find(f => f.specialty === spec && canSign(f) && ovr(f) >= c.specFloor && budgetOk(f))
            if (!fa) continue
            doSignFA(c, fa)
            c.specCounts[spec] = (c.specCounts[spec] ?? 0) + 1
            return true
          }
          // ② 頭数の確保 — 予算/OVRに関係なく総在籍24人（下限）までは埋める。
          // それ以上の頭数合わせはしない（数合わせの弱いFAを抱えない。多く抱えるのは予算のあるチームだけ）。
          // 「方針に沿ったベスト補強」は廃止済み：質の高い補強は有料移籍・引き抜きに一本化する
          if (c.totalNow + c.signed >= 24) return false
          const fa = availableFAs.find(canSign)
          if (!fa) return false
          doSignFA(c, fa)
          return true
        }
        roundRobin(faCtxList, signOneFA)
        const newYear = state.currentSeason.year
        // CPUのFA契約も movePlayer に通す（所属・名簿・加入年をまとめて。名簿に入れるので契約種別も本契約に揃える）
        let playersWithCpuSigns: Player[] = playersAfterCpuTransfer
        let teamsWithCpuSigns = teamsAfterCpuTransfer
        for (const sg of cpuSignings) {
          const before = playersWithCpuSigns.find(x => x.id === sg.playerId)
          if (!before) continue
          const m = movePlayer({ players: playersWithCpuSigns, teams: teamsWithCpuSigns }, sg.playerId, sg.teamId, {
            year: newYear,
            date: `${newYear}-02-01`,
            kind: 'free',
            history: false,
            contract: { yearsLeft: 2, annualSalary: faMarketSalary(before, perfOf(state.currentSeason, sg.playerId)), contractType: 'standard' },
          })
          if (!m.ok) continue
          playersWithCpuSigns = m.players.map(p =>
            p.id !== sg.playerId ? p : { ...p, contract: { ...p.contract, faEligibleYear: newYear + 2 } })
          teamsWithCpuSigns = m.teams
        }

        // ロスターは1つだけ。「2軍を15人まで埋める」数合わせのFA大量署名は廃止済み。
        // 総在籍24人（下限）まではメインの補強パス(Pass3)が保証する
        const playersWithAllCpuSigns = playersWithCpuSigns
        const teamsWithAllCpuSigns = teamsWithCpuSigns

        // ③ 海外クラブFA補強（外国籍FA中心に海外クラブが獲得）。海外クラブも総在籍30を超えないようにする。
        // 所属は選手側の teamId だけを書き換える（クラブ側に名簿は持たない）
        const foreignClubsList = (state.foreignLeagues ?? []).flatMap(l => l.clubs)
        let playersWithForeignSigns: Player[] = playersWithAllCpuSigns
        if (foreignClubsList.length > 0) {
          const clubCount = new Map<string, number>()
          for (const p of playersWithAllCpuSigns) {
            if (p.status === 'active' && foreignClubsList.some(c => c.id === p.teamId)) {
              clubCount.set(p.teamId, (clubCount.get(p.teamId) ?? 0) + 1)
            }
          }
          const remainForeignFAs = playersWithAllCpuSigns
            .filter(p => p.teamId === '' && p.status === 'active' && isForeignNat(p.nationality))
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
            // 海外クラブへのFA加入も movePlayer に通す（海外クラブは teams に居ないので名簿と金は素通りする）
            const m = movePlayer({ players: playersWithForeignSigns, teams: teamsWithAllCpuSigns }, fa.id, club.id, {
              year: newYear,
              history: false,
            })
            if (m.ok) playersWithForeignSigns = m.players
          }
        }

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
            const team = teamsAfterCpuTransfer.find(t => t.id === s.teamId)
            return {
              date: offDate(i),
              headline: `${team?.shortName ?? ''}が${p.name}（OVR${ovr(p)}）と契約合意`,
              category: 'fa' as const,
              relatedIds: [p.id],
            }
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
            ...cpuSignings.map((s, i) => ({ year: newYear, date: offDate(i), playerId: s.playerId, fromTeamId: '', toTeamId: s.teamId, fee: 0, kind: 'free' as const, years: 2 })),
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
          const cpuRenewalSalary = (p: Player) => faMarketSalary(p, perfOf(state.currentSeason, p.id))
          const cpuRenewIds = new Set<string>()
          {
            const curStandings = rankedStandings((state.currentSeason.standings ?? []))
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
                .filter(p => p.teamId === teamId && p.contract.yearsLeft === 1 && p.status === 'active')
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
          const mainIds = squadIdsOf(state.players, state.playerTeamId)
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
          const domesticIdsFA = domesticTeamIdSet_(state.teams)
          // 契約満了＝自チームもCPUと同じく自動FA。
          // シーズン中に半年切り通知・チャット催促・終了カードの契約未解決警告で警告済みで、
          // 退団は繰越時の退団通知（reason:'fa'）に載る＝気づかず消えることはない。
          // （旧実装は自チームだけ「判断待ちキュー」に積んでいたが、判断UIが存在せず契約切れのまま残り続けるバグだった）
          const expiredIds = new Set(
            grownPlayers
              .filter(p => p.contract.yearsLeft === 0 && !p.loan && p.teamId && domesticIdsFA.has(p.teamId) && p.status === 'active')
              .map(p => p.id)
          )

          // レンタル期間終了で保有元へ返却される選手（後段でロスター配列にも戻す）
          let playersAfterFA: Player[] = grownPlayers
          {
            // 契約満了・売れ残りの強制FA・レンタル満了の返却。どれも movePlayer に通して同じ後始末にする。
            // 名簿は下の teamsWithFA で所属から組み直すので、ここでは選手側だけ動かす
            const yearNow = state.currentSeason.year
            // 「移籍を認める」でリスト入りしたのにシーズン内で決まらなかった選手は強制FA。
            // 出て行った選手なので1年間交渉不可（契約満了FAと同じ扱い）
            const listedOutIds = grownPlayers
              .filter(p => !expiredIds.has(p.id) && p.transferListed && p.teamId === state.playerTeamId && p.status === 'active')
              .map(p => p.id)
            const listedOutSet = new Set(listedOutIds)
            // レンタル期間終了 → 保有元チームへ自動返却
            const loanReturns = grownPlayers
              .filter(p => !expiredIds.has(p.id) && !listedOutSet.has(p.id) && p.loan && p.loan.untilYear <= yearNow + 1)
            const runFA = (pid: string, to: string, lock?: number) => {
              const m = movePlayer({ players: playersAfterFA, teams: [] }, pid, to, {
                year: yearNow,
                ...(lock != null ? { lockUntilYear: lock } : {}),
              })
              if (m.ok) playersAfterFA = m.players
            }
            for (const id of expiredIds) runFA(id, '')
            for (const id of listedOutIds) runFA(id, '', yearNow + 2)
            for (const p of loanReturns) runFA(p.id, p.loan!.ownerTeamId)
          }

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
          // 引退承認済み（今季限りで引退フラグ）はここで確実に引退させる（承認時は即引退しない仕様）
          for (const p of grownPlayers) if (p.pendingRetirementYear != null && p.status === 'active') retiringIds.add(p.id)

          // 海外クラブの年次入れ替え（引退を外し、若手を新加入させる）。
          // ただし旧セーブの大再編が保留中なら、この年度更新で新9リーグへ丸ごと置換し旧海外選手は退場させる。
          const pendingRestructure = (state.currentSeason as unknown as { pendingForeignRestructure?: boolean }).pendingForeignRestructure === true
          const oldForeignClubIds = new Set((state.foreignLeagues ?? []).flatMap(l => l.clubs.map(c => c.id)))
          const removedForeignPlayerIds = pendingRestructure
            ? new Set(state.players.filter(p => oldForeignClubIds.has(p.teamId)).map(p => p.id))
            : new Set<string>()
          const foreignRefresh = pendingRestructure
            ? (() => { const g = generateForeignLeaguePlayers(FOREIGN_LEAGUES, state.currentSeason.year + 1); return { newPlayers: g.players, updatedLeagues: g.updatedLeagues } })()
            : refreshForeignLeagues(state.foreignLeagues ?? [], retiringIds, state.currentSeason.year + 1, grownPlayers)

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

          // 引退を反映する。引退も「所属が無くなる」だけなので movePlayer の分岐を通す
          // （引退時の所属の控え・レンタル解除・名簿からの外しがまとめて付いてくる）。
          // 名簿(teams)はこのあと rebuildRosters で組み直すので、ここでは選手だけ触る
          let playersAfterRetire: Player[] = playersAfterFA
          for (const id of retiringIds) {
            const m = movePlayer({ players: playersAfterRetire, teams: [] }, id, '', { year: state.currentSeason.year, retire: true })
            if (m.ok) playersAfterRetire = m.players
          }

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

          const sortedStandings = rankedStandings(state.currentSeason.standings)

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
          // 連続上位はセーブに持たないので、過去シーズン（＝今季を入れる前）の順位表から数え直す。
          // 昔ここで読んでいた値も「今季を足す前」の連続数だったので、意味は同じ
          const myTeamStreak = teamHistoryOf(state.pastSeasons, state.playerTeamId).currentStreak
          const streakMoraleDelta = myFinalRank <= 3
            ? Math.min(12, 4 + myTeamStreak * 2)   // up to +12 for long winning streak
            : myFinalRank >= sortedStandings.length - 2
            ? Math.max(-12, -4 - myTeamStreak * 2) // down to -12 for losing streak
            : 0
          const playersAfterMorale = streakMoraleDelta !== 0
            ? playersAfterRetire.map(p => {
                if (p.teamId !== state.playerTeamId || p.status === 'retired') return p
                return { ...p, morale: Math.max(10, Math.min(100, (p.morale ?? 70) + streakMoraleDelta)) }
              })
            : playersAfterRetire

          // チームの成績（順位・勝ち点・優勝回数・連続上位）はセーブに書き足さない。
          // 今季の順位表は下で過去シーズンに保存されるので、成績はそこから数え直せる（utils/teamHistory.ts）
          const updatedTeams = state.teams

          const newRaces = generateSeasonRaces(newYear)
          const champion = updatedTeams.find(t => t.id === sortedStandings[0]?.teamId)
          // 翌季のプレシーズンで指名される新人はその年(newYear)に加入するので draftYear=newYear にする。
          // （+1 にすると加入年より1年多い年度で記録され、歴代ドラフトが1年ズレる）
          const nextScoutPool = generateDraftPool(newYear, new Set(state.players.map(pl => pl.name)))

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
          // レンタル返却された選手は保有元チームのロスターへ戻す
          // 名簿は所属(player.teamId)から組み直す。契約満了・引退・売れ残りの強制FAで抜けた選手が消え、
          // レンタルから返ってきた選手が戻る。どこか1ヶ所を書き忘れて食い違うことが無くなる
          const teamsWithFA = rebuildRosters(playersAfterRetire, updatedTeams).map(t => (
            t.id === state.playerTeamId && expiredSponsorIds.size > 0
              ? { ...t, sponsors: (t.sponsors ?? []).filter(id => !expiredSponsorIds.has(id)) }
              : t
          ))

          // CPU teams do NOT sign FA players here — user gets the FA window during preseason
          // AI will sign remaining FAs when beginSeasonDraft is called

          // Check objectives + award scout points + budget rewards
          const finalRank = rankOfTeam(state.currentSeason.standings, state.playerTeamId)
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
          // ここは teamsWithFA の名簿を見る（シーズン開始時の state.players ではなく）。
          // teamsWithFA は契約切れ・引退・強制FAを反映したあとの所属から組み直してあるので、
          // 退団が決まった選手にボーナスを払ってしまう事故を防げる
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

          // 在籍選手の年俸を予算から控除。
          // 集計元は state.players（契約満了・引退を処理する前）。playersAfterMorale だと
          // 今季で退団する選手の teamId が空になっているため、今季1年ぶんの年俸が請求されず消えていた。
          const playerSalaryTotal = state.players
            .filter(p => p.teamId === state.playerTeamId)
            .reduce((s, p) => s + p.contract.annualSalary, 0)

          const playerTeamObj = teamsWithFA.find(t => t.id === state.playerTeamId)
          // スポンサー収入は myActiveSponsorIds（契約満了を反映する前のリスト）が基準。
          // teamsWithFA からだと今季で満了したスポンサーが既に外れていて、
          // 最終年ぶんの協賛金をまるごと受け取れていなかった。
          const sponsorAnnual = myActiveSponsorIds
            .map(id => (state.sponsors ?? []).find(s => s.id === id))
            .filter(Boolean)
            .reduce((s, sp) => s + sp!.annualPayment, 0)
          const prevRaceIncome = state.currentSeason.seasonRaceIncome ?? 0
          // 来季予算（前季残高の繰り越し + 収入 - 支出、赤字は-1億まで許容）。計算は data/economy.ts に集約。
          const prevStreakMe = playerTeamObj?.finance.deficitStreak ?? 0
          // 施設Lv合計→維持費。強い＝施設充実で維持費が高い。
          const facLevelSum = (f?: Record<string, number>) => Object.values(f ?? {}).reduce((s, v) => s + (v ?? 0), 0)
          // 育成義務ペナルティ：在籍22人以下でグラント減額（自チームのみ。CPUは常時24人以上）
          // 補強禁止中は免除（選手を売って年俸を削る＝人数が減る、しか脱出手段が無いのに、
          // 減らすと更にグラントが減って赤字が深まる二重の罠になっていたため）
          const myRosterSize = playersAfterMorale.filter(p => p.teamId === state.playerTeamId && p.status !== 'retired').length
          const bannedMe = prevStreakMe >= 3 || playerBudgetAtSeasonEnd < 0
          const dutyCutMe = leagueDutyGrantCut(myRosterSize, bannedMe)
          // 運営費はペナルティ後の「実際に受け取るグラント」基準。満額基準のままだと収入だけ減って抜け出せない
          const runningCostVal = runningCost(facLevelSum(playerTeamObj?.facilities as Record<string, number> | undefined), effectiveGrant(finalRank, prevStreakMe, dutyCutMe))
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
          const newBudgetBreakdown = {
            carryover: playerBudgetAtSeasonEnd - (bonusTotalPayout + playerSalaryTotal + runningCostVal),
            grant: effectiveGrant(finalRank, prevStreakMe, dutyCutMe),
            raceIncome: prevRaceIncome,
            sponsor: sponsorAnnual,
            objBonus: objBudgetBonus,
            expenses: 0,  // 精算済みのためcarryoverに織り込み（旧セーブの表示互換のためフィールドは残す）
          }
          // シーズンを終えた時点の残高がマイナスなら連続赤字+1、プラスなら0にリセット。
          // 判定は「精算後に残高が残っているか」だけ。以前は「単年営業収支」という別指標で判定していたが、
          // 残高はプラスなのに赤字扱いという食い違いを生むだけだったため、元の残高判定に戻した。
          const newStreakMe = newBudget < 0 ? prevStreakMe + 1 : 0

          // 全チームの来季予算を順位連動に（自チームと同じ computeNextSeasonBudget）。
          const teamSalaryTotal = (teamId: string) => playersAfterMorale
            .filter(p => p.teamId === teamId)
            .reduce((s, p) => s + p.contract.annualSalary, 0)
          const teamSponsorAnnual = (t: typeof teamsWithFA[0]) => (t.sponsors ?? [])
            .map(id => (state.sponsors ?? []).find(s => s.id === id))
            .filter(Boolean)
            .reduce((s, sp) => s + sp!.annualPayment, 0)
          const seasonRacesCount = state.currentSeason.races?.length ?? 10
          // 監督オファーを受けたときに移籍先の予算へ丸ごと入れ替えるので、
          // 他チームの来季予算の内訳もここで控えておく（あとからは計算し直せない）
          const cpuNextBudgets: Record<string, typeof newBudgetBreakdown & { budget: number }> = {}
          const teamsWithSeasonRewards = teamsWithFA.map(t => {
            if (t.id === state.playerTeamId) {
              return { ...t, finance: { ...t.finance, budget: newBudget, deficitStreak: newStreakMe } }
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
              runningCost: runningCost(facLevelSum(t.facilities as Record<string, number> | undefined), effectiveGrant(rank, prevStreak)),
            }
            const b = computeNextSeasonBudget(cpuBudgetArgs)
            // 自チームと同じ判定：精算後の残高がマイナスなら連続赤字+1、プラスなら0
            const cpuStreak = b < 0 ? prevStreak + 1 : 0
            cpuNextBudgets[t.id] = {
              budget: b,
              carryover: t.finance.budget - (sal + cpuBudgetArgs.runningCost),
              grant: effectiveGrant(rank, prevStreak),
              raceIncome: cpuBudgetArgs.seasonRaceIncome,
              sponsor: cpuBudgetArgs.sponsorAnnual,
              objBonus: 0,
              expenses: 0,
            }
            return { ...t, finance: { ...t.finance, budget: b, deficitStreak: cpuStreak } }
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
          // 通算成績は「今季を足したあと」で見たいので、過去シーズンに今季の順位表を足して数え直す
          // 称号と連覇は「監督個人の通算」で数える。チームの通算（球団史）で数えると、
          // 優勝の多いチームへ移った瞬間に前任者の優勝で連覇・王朝の称号が解除されてしまう（utils/gmTenure.ts）
          const gmRanksAfter = gmSeasonRanks([
            ...state.pastSeasons,
            { year: state.currentSeason.year, standings: state.currentSeason.standings },
          ], state.gmTenures, state.playerTeamId)
          const gmTotalsAfter = gmCareerTotals(gmRanksAfter)
          const totalChamps = gmTotalsAfter.championships
          const totalSeasons = gmTotalsAfter.seasons
          const curStreak = gmTotalsAfter.currentStreak
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
                p.teamId === champTeamId
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

          // シーズン終了ぶんのジュエル内訳（ホームに戻ったときのポップアップ用）。加算は下の jewels: が担当
          const seasonJewelGains: { label: string; amount: number }[] = []
          if (rankJewels > 0) seasonJewelGains.push({ label: `シーズン${finalRank}位`, amount: rankJewels })
          if (objJewels > 0) seasonJewelGains.push({ label: '目標達成', amount: objJewels })
          for (const a of seasonAchievements) {
            const j = ACHIEVEMENT_JEWELS[a.rarity] ?? 0
            if (j > 0) seasonJewelGains.push({ label: `実績「${a.name}」`, amount: j })
          }

          // 海外リーグの優勝クラブ所属選手に championships +1（今季の順位表を確定してから）
          const playersWithForeignChamp = applyForeignChampions(
            state.foreignLeagues ?? [], playersWithLoanHistory, state.currentSeason.foreignStandings ?? {},
          )

          // シーズンオフの海外クラブ間移籍（引き抜き）。選手がクラブ・国境を越えて移動する。
          // 万一エラーが出てもシーズン更新自体は壊さないよう、失敗時は移籍なしにフォールバック。
          const foreignBasePlayers = [
            ...(removedForeignPlayerIds.size > 0 ? playersWithForeignChamp.filter(p => !removedForeignPlayerIds.has(p.id)) : playersWithForeignChamp),
            ...foreignRefresh.newPlayers,
          ]
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
          // 1) 海外クラブの在籍上限(30人)をここで適用する。所属は選手側の teamId だけが記録なので、
          //    クラブごとに数えて、はみ出したぶん（能力の低い順）を下の整理で外す
          const playerByIdCl = new Map(crossTx.players.map(p => [p.id, p]))
          const foreignDropIds = new Set<string>()
          {
            // 数えるのは現役だけ。負傷中の選手まで数に入れると、怪我をしただけで
            // 上限からはみ出して引退させられてしまう
            const membersByClub = clubMembersByClub(crossTx.players.filter(p => p.status === 'active'))
            for (const l of crossTx.foreignLeagues) {
              for (const c of l.clubs) {
                const ids = membersByClub.get(c.id) ?? []
                if (ids.length <= 30) continue
                const sorted = [...ids].sort((a, b) => {
                  const pa = playerByIdCl.get(a); const pb = playerByIdCl.get(b)
                  return (pb ? ovr(pb) : 0) - (pa ? ovr(pa) : 0)
                })
                sorted.slice(30).forEach(id => foreignDropIds.add(id))
              }
            }
          }
          const cappedForeignLeagues = crossTx.foreignLeagues
          // 2) 引退選手の軽量化（能力履歴・特性などを落として名前と実績だけ残す）
          //    ＋整理のルールは国内・海外で共通：「実績（出走・区間賞・記録会ベスト）のある選手は絶対に消さず引退として残す」。
          //    実績ゼロの選手だけ削除する。これでニュース・記録・歴代優勝から選手詳細が必ず開ける
          //    引退後の選手詳細は1ページ目（能力レーダー・契約・市場価値）を表示しないので、
          //    能力値・EXP・上限解放などは持たせない。セーブ容量の節約。
          //    ratings は型上は必須だが、読む側は safeRatings/ovr で欠損に耐える作りにしてある。
          //    contract は残す（引退ニュースのカードが p.contract.annualSalary を直接読むため）
          const LEAN_DROP_KEYS = ['ratings', 'exp', 'potentialBoosts', 'customCaps', 'segmentPBs', 'personalSponsors', 'predictedPick', 'ovrHistory', 'traits'] as const
          // 引退そのものは movePlayer の分岐に任せる（上の引退処理を通っていない経路もここに来るため）。
          // ここに残すのはセーブを軽くするためのデータ削りだけ
          const leanRetired = (p: Player, retiredYear = state.currentSeason.year): Player => {
            const moved = movePlayer({ players: [p], teams: [] }, p.id, '', { year: retiredYear, retire: true })
            const q: Record<string, unknown> = { ...(moved.ok ? moved.players[0] : p) }
            for (const k of LEAN_DROP_KEYS) delete q[k]
            return q as unknown as Player
          }
          // 3) 「二度と名前が出ない選手」は選手データごと削除してセーブを軽くする。
          //    残すのは画面のどこかで名前が出る可能性がある選手だけ：
          //      ・一度でも自チームに所属した
          //      ・区間賞を取ったことがある（通算区間賞ランキング）
          //      ・区間記録／記録会の歴代記録（世界記録・日本記録・種目別トップ10・チーム歴代記録）の保持者
          //      ・駅伝代表に選ばれたことがある（全出場国の代表20人ぶんが worldRepresentatives に入る）
          //      ・MVP・新人王・ECL優勝メンバー・ECL MVP
          //      ・ドラフト指名歴がある（歴代ドラフトの一覧が歯抜けになる）
          //      ・スター（★）を付けている
          //    削除した選手は removedPlayers に「名前・国籍」だけ残すので、過去レースの区間配置や
          //    移籍履歴では名前も顔もそのまま出る（選手詳細だけ開けなくなる）。
          const protectedIds = new Set<string>()
          for (const list of Object.values(segmentRecordsOf(state.pastSeasons, state.currentSeason))) {
            for (const r of list) protectedIds.add(r.playerId)
          }
          for (const rec of [...Object.values(state.worldRecords ?? {}), ...Object.values(state.japanRecords ?? {})]) {
            if (!rec) continue
            protectedIds.add(rec.playerId)
            for (const co of rec.coHolders ?? []) protectedIds.add(co.playerId)
          }
          for (const g of state.eventSeasonTops ?? []) for (const t of g.top) protectedIds.add(t.playerId)
          for (const t of state.teams) {
            for (const list of Object.values(t.eventRecords ?? {})) for (const r of list ?? []) protectedIds.add(r.playerId)
          }
          // 年度MVP・新人王はセーブに持たず、過去シーズンのレース結果から選び直す（utils/awards.ts）
          for (const a of seasonAwardsOf(state.pastSeasons, state.players, state.removedPlayers)) {
            if (a.mvpId) protectedIds.add(a.mvpId)
            if (a.rookieId) protectedIds.add(a.rookieId)
          }
          // ECLの歴代優勝もセーブに持たず、保存してあるECLのレース結果から数え直す（utils/eclHistory.ts）
          for (const e of eclHistoryOf(state.pastSeasons, state.currentSeason)) {
            if (e.mvpPlayerId) protectedIds.add(e.mvpPlayerId)
            for (const id of e.winnerPlayerIds ?? []) protectedIds.add(id)
          }
          for (const r of state.worldRepresentatives ?? []) protectedIds.add(r.playerId)
          for (const id of state.worldSquad?.playerIds ?? []) protectedIds.add(id)
          for (const id of [...(state.starredOpponents ?? []), ...(state.starredProspects ?? [])]) protectedIds.add(id)
          // 自チーム在籍歴：過去シーズンの出走記録・0出走記録から拾う（印が無い旧セーブぶんの救済）
          // 監督は移籍できるので、今のチームだけでなく過去に指揮したチーム全部を見る。
          // ここを今のチームだけにすると、移籍した瞬間に前のチームのOBが消える
          const myTeamIdsEver = new Set<string>([state.playerTeamId, ...(state.gmTenures ?? []).map(t => t.teamId)])
          for (const season of [...state.pastSeasons, state.currentSeason]) {
            for (const race of [...(season.races ?? []), ...(season.secondTeamRaces ?? [])]) {
              if (!race.results) continue
              for (const sr of race.results.segmentResults) {
                for (const r of sr.runners) if (myTeamIdsEver.has(r.teamId)) protectedIds.add(r.playerId)
              }
            }
            for (const z of season.zeroAppearances ?? []) if (myTeamIdsEver.has(z.teamId)) protectedIds.add(z.playerId)
          }
          const isWorthKeeping = (p: Player) =>
            p.wasPlayerTeam === true
            || p.isMyPlayer === true
            || protectedIds.has(p.id)
            || p.career.segmentWins > 0
            || p.draftRound != null
          const removedPlayers: Record<string, [string, Nationality]> = { ...(state.removedPlayers ?? {}) }
          const dropPlayer = (p: Player): Player[] => {
            removedPlayers[p.id] = [p.name, p.nationality]
            return []
          }
          const cleanedPlayers = crossTx.players
            // 今season自チームに居た選手には在籍歴の印を付ける（以後の整理で絶対に消えない）
            .map(p => (p.teamId === state.playerTeamId && p.wasPlayerTeam !== true ? { ...p, wasPlayerTeam: true } : p))
            .flatMap((p): Player[] => {
              // 海外クラブの名簿から溢れた選手
              if (foreignDropIds.has(p.id)) {
                return isWorthKeeping(p) ? [leanRetired(p)] : dropPlayer(p)
              }
              if (p.status === 'retired') return isWorthKeeping(p) ? [leanRetired(p)] : dropPlayer(p)
              if (p.status === 'active' && p.teamId === '') {
                const since = p.faSinceYear ?? state.currentSeason.year
                if (newYear - since >= 2) {
                  return isWorthKeeping(p)
                    ? [leanRetired(p, since)]
                    : dropPlayer(p)
                }
                return [{ ...p, faSinceYear: since }]
              }
              return [p.faSinceYear != null ? { ...p, faSinceYear: undefined } : p]
            })

          // 自チームから居なくなった選手の退団通知（契約満了のFA流出・他クラブへの移籍）。
          // ロスターから黙って消えるのを防ぐ。引退は別途セレモニー・ニュースがあるため除外
          const departureClubName = (teamId: string) =>
            findClub(state.teams, cappedForeignLeagues, teamId)?.shortName
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
          {
            const foreignClubIds = new Set((state.foreignLeagues ?? []).flatMap(l => l.clubs.map(c => c.id)))
            for (const p of state.players) {
              if (!foreignClubIds.has(p.teamId)) continue
              if (!archivedForeignApps[p.id]) archivedForeignApps[p.id] = { clubId: p.teamId, races: 0, wins: 0 }
            }
          }
          // 過去シーズンの海外リーグ順位表は「合計ポイント」しか読まれない（チーム詳細の歴代成績・
          // リーグ優勝回数）。1戦ごとの結果は今季ぶんだけ（直近フォーム・消化数）なので保存時に落とす。
          // セーブ容量の節約：1シーズンあたり約120KB
          const archivedForeignStandings = Object.fromEntries(
            Object.entries(state.currentSeason.foreignStandings ?? {})
              .map(([lid, st]) => [lid, st.map(s2 => ({ clubId: s2.clubId, totalPoints: s2.totalPoints, raceResults: [] }))]),
          )
          // 国内も同様：今季1度も出走しなかった在籍選手の所属を記録して保存（在籍履歴の空白防止）
          const appearedIds = new Set<string>()
          for (const race of [...state.currentSeason.races, ...(state.currentSeason.secondTeamRaces ?? [])]) {
            if (!race.results) continue
            for (const sr of race.results.segmentResults) for (const r of sr.runners) appearedIds.add(r.playerId)
          }
          const domesticTeamIds = domesticTeamIdSet_(state.teams)
          const zeroAppearances = state.players
            .filter(p => p.status === 'active' && domesticTeamIds.has(p.teamId) && !appearedIds.has(p.id))
            .map(p => ({ playerId: p.id, teamId: p.teamId }))

          // 国内チームの名簿もteamId起点で毎年完全に同期する（海外クラブと同じ自動修復）。
          // 契約満了のFA化（teamId=''）や長期整理での選手削除がroster配列に残存し、
          // 「名簿に居るのにteamIdが違う/存在しない」不整合になるのを根治する
          // レンタル中（loanあり）の選手は名簿外が正規仕様（teamId=借り手だが借り手の名簿には載せない）
          const syncedTeams = rebuildRosters(cleanedPlayers, crossTx.teams)

          // 他チームから監督の声がかかるか。来季の予算と評判が決まったあとに判定する。
          // 出るのは1シーズンに最大1件で、答えるまでホームに出続ける（utils/gmOffer.ts）
          const gmOffer = makeGmOffer({
            standings: state.currentSeason.standings,
            playerTeamId: state.playerTeamId,
            finalRank,
            gmRep: newGmRep,
            teamCount: state.teams.length,
            nextYear: newYear,
            teams: syncedTeams,
            nextBudgets: cpuNextBudgets,
            objBonus,
            rng: Math.random,
          })

          return {
            players: cleanedPlayers,
            removedPlayers,
            teams: syncedTeams,
            gmOffer,
            foreignLeagues: cappedForeignLeagues,
            worldTournament: undefined,  // 世界選手権トーナメントは年度で完結（翌年は新規に開催）
            worldRacePlans: undefined,   // コースも毎年引き直し
            // 退団（FA流出・移籍）と海外移籍（クラブ間・日本↔海外）を移籍履歴に記録（移籍ページの日付・移籍金表示用）
            transferHistory: [...(state.transferHistory ?? []), ...departureRecords, ...foreignTx.records, ...crossTx.records].slice(-800),
            jewels: state.jewels + objJewels + seasonAchievementJewels + rankJewels,
            // 最終戦ぶんがまだ未表示なので上書きせず足す
            jewelGains: [...(state.jewelGains ?? []), ...seasonJewelGains].slice(-20),
            gmRep: newGmRep,
            achievements: [...(state.achievements ?? []), ...seasonAchievements],
            eventSeasonTops: [...(state.eventSeasonTops ?? []), ...newEventTops],
            draftState: null,
            sponsors: updatedSponsors,
            // 過去シーズンは archiveSeason() が「残す項目」だけを書き出す（許可リスト方式）。
            // 何を残すかは types の ArchivedSeason と archiveSeason() の2箇所だけを見ればよい
            pastSeasons: [...state.pastSeasons, archiveSeason(state.currentSeason, {
              foreignAppsC: packForeignApps(archivedForeignApps),
              foreignStandings: archivedForeignStandings,
              zeroAppearances,
            })],
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
              seasonGrant: newBudgetBreakdown.grant,   // 来期の実グラント額（順位＋ペナルティ適用後）。運営費＝この10%。内訳表示と一致させる。
              budgetBreakdown: newBudgetBreakdown,       // 初期予算の内訳（財務ページで表示）
              // 今季スカウトした候補（＝来季プレシーズンで指名する代）をそのまま引き継ぐ。
              // 視察した選手がそのままドラフトに並ぶようにする。空のとき（一度もスカウトを開いていない等）だけ新規生成。
              scoutProspects: (state.currentSeason.scoutProspects?.length ?? 0) > 0 ? state.currentSeason.scoutProspects : nextScoutPool,
              objectives: newObjectives,
              trainingAssignments: {},
              scoutMissions: [],
              faVisits: [],
              events: [...retirementEvents, ...renewalEvents],
              pendingRenewalDecisions: [],  // 廃止：満了は自動FA（旧セーブの残キューもここで消える）
              pendingTradeOffers: [],
              scoutedOpponents: (state.currentSeason.scoutedOpponents ?? []).filter(s => s.year >= state.currentSeason.year),
              scoutedProspects: (state.currentSeason.scoutedProspects ?? []).filter(s => s.year >= state.currentSeason.year),
              trainingPlan: null,
              individualEvents: generateIndividualEvents(newYear),
              departureNotices,
              sponsorOffers: newSponsorOffers,
              seasonRaceIncome: 0,
              foreignStandings: initForeignStandings(foreignRefresh.updatedLeagues),
              foreignRaceIndex: 0,
              foreignAppearances: {},
              pendingForeignRestructure: false,  // 再編を適用したのでフラグ解除
              // 来季のECL：今季（＝前年）の各リーグ上位2チームで開催。4/6/7/9/11月の5戦、コースは10種から重複なし抽選。
              // 初年度は前年成績が無いためこの経路でしか生成されない＝1年目は開催なし
              eclSeries: (() => {
                const parts = buildEclParticipants({
                  standings: sortedStandings,
                  teams: state.teams,
                  playerTeamId: state.playerTeamId,
                  leagues: foreignRefresh.updatedLeagues,
                  foreignStandings: state.currentSeason.foreignStandings ?? {},
                  players: foreignTx.players,
                })
                if (parts.length < 4) return undefined
                return {
                  participants: parts,
                  races: buildEclRaces(newYear, newRaces.map(r => r.date)),
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
            contract: { annualSalary: salary, yearsLeft: years, contractType: 'standard' },
          })
          if (!moved.ok) return s
          return {
            // 海外選手だけの持ち物（国籍区分・FA取得年・性格）はここで足す
            players: moved.players.map(p => p.id === playerId
              ? {
                  ...p,
                  foreignCategory: foreignCat,
                  contract: { ...p.contract, faEligibleYear: s.currentSeason.year + years },
                  personality: p.personality ?? 'salary',
                }
              : p
            ),
            teams: moved.teams,
            transferHistory: [...(s.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
            currentSeason: {
              ...s.currentSeason,
              transferSpend: (s.currentSeason.transferSpend ?? 0) + moved.spend,
              newsFeed: [{
                date: s.currentSeason.races[s.currentSeason.currentRaceIndex]?.date ?? `${s.currentSeason.year}-06-01`,
                headline: `${player.name}(${player.nationality})を海外移籍金${Math.round(transferFee / 10000)}万で獲得`,
                category: 'fa' as const,
                relatedIds: [playerId],
              }, ...s.currentSeason.newsFeed].slice(0, 30),
            },
          }
        })
        return true
      },


      // ── National team ─────────────────────────────────────────────────
      // 世界選手権：日本駅伝代表20人を確定（候補50から監督が選抜）
      setWorldSquad: (playerIds: string[]) => {
        set(state => ({ worldSquad: { year: state.currentSeason.year, playerIds: playerIds.slice(0, 20) } }))
      },

      // 世界選手権／予選をその年ぶん実行して結果を保存（既に実行済みの年は何もしない）
      runWorldAthletics: () => {
        set(state => {
          const year = state.currentSeason.year
          const done = (state.worldAthleticsResults ?? []).some(r => r.year === year)
          if (done) return state
          const squad = state.worldSquad?.year === year ? state.worldSquad.playerIds : undefined
          // 本番年は前年のアジア＋オセアニア予選の通過国で出場を決める（予選落ちなら日本は出ない）
          const prevQual = (state.worldAthleticsResults ?? []).find(r => r.kind === 'qualifier' && r.year === year - 1)
          const result = runWorldAthleticsYear(state.players, year, squad, prevQual?.kind === 'qualifier' ? prevQual.advanced : undefined)
          // 本番なら代表出場記録を積む（個人種目の出場者＋駅伝の走者）。パッチ・代表履歴の元。
          const reps = [...(state.worldRepresentatives ?? [])]
          if (result.kind === 'main') {
            const EV: Record<string, string> = { d5000: '5000m', d10000: '10000m', marathon: 'マラソン' }
            for (const ir of result.meet.individuals) {
              for (const pl of ir.placings) reps.push({ playerId: pl.playerId, year, nat: pl.nat, label: EV[ir.event] ?? ir.event, rank: pl.rank })
            }
            for (const ek of result.meet.ekiden) {
              for (const rid of ek.runnerIds) reps.push({ playerId: rid, year, nat: ek.nat, label: '駅伝', rank: ek.rank })
            }
          }
          return { worldAthleticsResults: [result, ...(state.worldAthleticsResults ?? [])], worldRepresentatives: reps }
        })
      },

      // 世界選手権トーナメント開始：出場国・各国の駅伝代表20・3戦のコースを確定。
      // 予選＝アジア＋オセアニア（最大20カ国）／本番＝20カ国（前年予選の通過国でアジア＋オセ枠を決定）。
      // 本番は個人種目の結果もここで確定（発表は画面側で段階表示）。
      startWorldTournament: () => {
        set(state => {
          const year = state.currentSeason.year
          if ((state.worldAthleticsResults ?? []).some(r => r.year === year)) return state
          if (state.worldTournament && state.worldTournament.year === year && !state.worldTournament.finished) return state
          const isMain = (year - 2028) % 2 === 0
          // 予選も開催国ローテーション（アジア＋オセアニアの国で持ち回り。コースも開催国の地形）
          const host = isMain ? hostForYear(year) : qualHostForYear(year)
          let nations: import('../types').Nationality[]
          if (isMain) {
            const prevQual = (state.worldAthleticsResults ?? []).find(r => r.kind === 'qualifier' && r.year === year - 1)
            const pq = prevQual?.kind === 'qualifier' ? prevQual : undefined
            // アジアは実レース予選、欧州・アフリカ・アメリカは前年に裏で回した大陸予選の通過国から
            nations = qualifyNations(state.players, year, host!, pq?.advanced, pq?.continentals)
          } else {
            const pool = ([...new Set(state.players.filter(p => p.status !== 'retired').map(p => p.nationality))] as import('../types').Nationality[])
              .filter(n => (natGeoRegion(n) === 'アジア' || natGeoRegion(n) === 'オセアニア') && nationStrength(state.players, n, year) > 0)
              .sort((a, b) => nationStrength(state.players, b, year) - nationStrength(state.players, a, year))
            // 開催国は自動出場（選手がいる場合のみ）。残りを強い順で埋める
            nations = pool.includes(host!)
              ? [host!, ...pool.filter(n => n !== host)].slice(0, 20)
              : pool.slice(0, 20)
          }
          const japanIn = nations.includes('JPN')
          // 駅伝優先：まず各国が最強20人を駅伝代表に投入（日本は手動選考があればそれ）。
          // 個人種目は駅伝に入らなかった選手から選考する（標準突破優先＋ランキング補充・国別3・マラソン専任）
          const japanManual = japanIn && state.worldSquad?.year === year && state.worldSquad.playerIds.length > 0
            ? state.worldSquad.playerIds : undefined
          // コースは選考画面で公開したものをそのまま使う（無ければここで生成）。他国の選抜もこの地形を見る
          const plans = state.worldRacePlans?.year === year ? state.worldRacePlans.plans : generateWECRacePlan()
          const squads: Record<string, string[]> = {}
          for (const nat of nations) {
            if (nat === 'JPN' && japanManual) {
              squads[`nat_${nat}`] = japanManual
              continue
            }
            // 他国も日本と同じく「持ちタイム14人＋コース適性6人」の混成で20人を選抜する
            // （タイム上位だけだと山岳コースで登り・下り専門が居ない適当な代表になるため）
            const cands = ekidenCandidatesWithFit(state.players, nat, year, plans, 20, 6)
            squads[`nat_${nat}`] = autoSelectEkiden(cands, new Set<string>(), 20).map(p => p.id)
          }
          const ekidenIds = new Set(Object.values(squads).flat())
          const fields = isMain ? selectIndividualFields(state.players, nations, year, ekidenIds) : undefined
          // 国旗色はその国の先頭クラブのカラーを流用（日本は金）
          const clubColor = (nat: string) => {
            if (nat === 'JPN') return { primary: '#C9A84C', secondary: '#14121F' }
            for (const l of state.foreignLeagues ?? []) { const c = l.clubs.find(c => c.country === nat); if (c) return c.colors }
            return { primary: '#4B5563', secondary: '#FFFFFF' }
          }
          const participants = nations.map(nat => ({
            id: `nat_${nat}`, nat, name: natLabel(nat), shortName: natLabel(nat).slice(0, 5),
            colors: clubColor(nat), isPlayerTeam: nat === 'JPN' && japanIn,
          }))
          const WEATHERS = ['sunny', 'cloudy', 'rainy', 'windy'] as const
          const races: import('../types').Race[] = plans.map((plan, i) => ({
            id: `wa-${year}-r${i + 1}`,
            // 例: 「2030 世界選手権 テグ 第1戦」「2029 アジア＋オセアニア予選 第1戦」
            name: isMain
              ? `${year} 世界選手権 ${WA_HOST_CITY[host!] ?? natLabel(host!)} 第${i + 1}戦`
              : `${year} 世界選手権アジア予選 ${WA_HOST_CITY[host!] ?? natLabel(host!)} 第${i + 1}戦`,
            // JPELグランドファイナル(12/27)の後、オフシーズンの1月開催。年をまたぐので year+1 になる
            date: waRaceDate(year, i),
            location: '',
            type: 'league' as const,
            segments: plan.segments.map((s, j) => ({ index: j + 1, distanceKm: s.distanceKm, uphillPct: s.uphillPct, downhillPct: s.downhillPct })),
            conditions: { temperature: 12, weather: WEATHERS[Math.floor(Math.random() * WEATHERS.length)], elevation: 0 },
          }))
          const individuals = fields ? simulateIndividuals(fields) : undefined
          // 代表は選出された時点で代表：駅伝20人＋個人種目エントリーをここで代表記録に積む
          // （予選年も本戦年も、大会結果を待たずに「◯◯年 駅伝 [国旗]代表」パッチ・代表履歴が付く）
          const repsAtStart = [...(state.worldRepresentatives ?? [])]
          const repKey = (r: { playerId: string; year: number; label: string; rank?: number }) => `${r.playerId}|${r.year}|${r.label}|${r.rank ?? ''}`
          const repSeen = new Set(repsAtStart.map(repKey))
          const pushRep = (r: { playerId: string; year: number; nat: import('../types').Nationality; label: string; rank?: number }) => {
            const k = repKey(r)
            if (!repSeen.has(k)) { repsAtStart.push(r); repSeen.add(k) }
          }
          for (const [pid, ids] of Object.entries(squads)) {
            const nat = pid.slice(4) as import('../types').Nationality
            for (const id of ids) pushRep({ playerId: id, year, nat, label: '駅伝' })
          }
          if (individuals) {
            const EV: Record<string, string> = { d5000: '5000m', d10000: '10000m', marathon: 'マラソン' }
            for (const ir of individuals) for (const pl of ir.placings) pushRep({ playerId: pl.playerId, year, nat: pl.nat, label: EV[ir.event] ?? ir.event })
          }
          // 予選年は欧州・アフリカ・アメリカの大陸予選も同時に裏開催（レースはしないが代表20人を選出）。
          // 各国の代表はここで確定＝アジア予選と同じタイミングで「駅伝 [国旗]代表」パッチが付く。
          // 代表20人は continentals.squads にまとめて持つ（worldRepresentativesへは重複保存しない＝セーブ肥大を回避）
          const continentals = !isMain ? simulateContinentalQualifiers(state.players, year) : undefined
          return {
            worldTournament: {
              year, kind: isMain ? 'main' as const : 'qualifier' as const, host,
              participants, squads, races, raceIndex: 0, points: {},
              individuals, individualsSeen: !isMain, continentals, japanIn, finished: false,
            },
            worldRepresentatives: repsAtStart,
          }
        })
      },

      // 駅伝1戦を実レースで走らせる（日本は手動配置可）。3戦目で最終結果を確定して記録へ積む
      advanceWorldRace: (japanLineup?: Record<number, string>) => {
        set(state => {
          const t = state.worldTournament
          if (!t || t.finished || t.raceIndex >= t.races.length) return state
          const race = t.races[t.raceIndex]
          const lineups: Record<string, Record<number, string>> = {}
          for (const pt of t.participants) {
            const ids = t.squads[pt.id] ?? []
            const base = (pt.isPlayerTeam && japanLineup && Object.keys(japanLineup).length > 0)
              ? japanLineup
              : terrainLineupFor(ids, state.players, race)
            lineups[pt.id] = fillAllSegments(base, ids, state.players, race)
          }
          const results = simulateRace(race, lineups, [], state.players, 0.7)
          const newRaces = t.races.map((r, i) => i === t.raceIndex ? { ...r, results } : r)
          const points = { ...t.points }
          for (const tr of results.teamRankings) points[tr.teamId] = (points[tr.teamId] ?? 0) + tr.positionPoints + tr.segmentPoints
          const nextIdx = t.raceIndex + 1
          const finished = nextIdx >= t.races.length
          if (!finished) {
            return { worldTournament: { ...t, races: newRaces, raceIndex: nextIdx, points, finished } }
          }
          // 最終戦消化 → 3戦合計ポイントで最終結果を確定
          const runnersOf = (pid: string) => {
            const set = new Set<string>()
            for (const r of newRaces) for (const sr of r.results?.segmentResults ?? []) for (const run of sr.runners) if (run.teamId === pid) set.add(run.playerId)
            return [...set]
          }
          const rows = t.participants.map(pt => ({ nat: pt.nat, points: points[pt.id] ?? 0, runnerIds: runnersOf(pt.id) }))
          // 年間アジア最優秀選手（予選のみ）: 3戦すべてに出走した選手のうち区間順位平均が最良。同率は合計タイムが速い方
          const bestPlayer = (() => {
            if (t.kind !== 'qualifier') return undefined
            const perf = new Map<string, { nat: Nationality; ranks: number[]; time: number }>()
            for (const r of newRaces) for (const sr of r.results?.segmentResults ?? []) for (const run of sr.runners) {
              if (!run.teamId.startsWith('nat_')) continue
              const e = perf.get(run.playerId) ?? { nat: run.teamId.slice(4) as Nationality, ranks: [], time: 0 }
              e.ranks.push(run.rank ?? 99)
              e.time += run.timeSec
              perf.set(run.playerId, e)
            }
            let best: { playerId: string; nat: Nationality; avgRank: number; time: number } | undefined
            for (const [pid, e] of perf) {
              if (e.ranks.length < newRaces.length) continue
              const avg = e.ranks.reduce((a, b) => a + b, 0) / e.ranks.length
              if (!best || avg < best.avgRank || (avg === best.avgRank && e.time < best.time)) best = { playerId: pid, nat: e.nat, avgRank: avg, time: e.time }
            }
            return best ? { playerId: best.playerId, nat: best.nat, avgRank: best.avgRank } : undefined
          })()
          // 大陸予選は大会開始時に確定済み（worldTournament.continentals）。無い旧セーブ用に念のためフォールバック
          const continentals = t.kind === 'qualifier' ? (t.continentals ?? simulateContinentalQualifiers(state.players, t.year)) : undefined
          // 駅伝3戦のレース詳細も結果に残す（ECLのeclSeriesと同じ扱い。選手詳細の駅伝データ等で使う）
          // 駅伝の区間ポイント（全3戦の各区間で区間順位1位3/2位2/3位1）を国別に集計
          const segPts = t.kind === 'main' ? ekidenSegmentPoints(newRaces) : undefined
          const result = {
            ...(t.kind === 'qualifier'
              ? { ...composeQualifierResult(t.year, rows, 3, t.host), bestPlayer, continentals }
              : composeMainResult(t.year, t.host!, t.participants.map(p => p.nat), t.individuals ?? [], rows, segPts)),
            races: newRaces,
            // 選出された駅伝代表20人を恒久保存（チームタブの代表表示・0走でも代表履歴に残すための元データ）
            squads: t.squads,
          }
          // 代表出場記録（パッチ・代表履歴の元）。
          // 選出時点の記録（rank無し）は startWorldTournament で積み済み。ここでは成績付き（rank）を追加する。
          // 同一エントリーの重複はキーで排除（旧セーブで選出時記録が無い場合もここで補完される）
          const reps = [...(state.worldRepresentatives ?? [])]
          const endRepKey = (r: { playerId: string; year: number; label: string; rank?: number }) => `${r.playerId}|${r.year}|${r.label}|${r.rank ?? ''}`
          const endRepSeen = new Set(reps.map(endRepKey))
          const pushEndRep = (r: { playerId: string; year: number; nat: Nationality; label: string; rank?: number }) => {
            const k = endRepKey(r)
            if (!endRepSeen.has(k)) { reps.push(r); endRepSeen.add(k) }
          }
          if (result.kind === 'main') {
            const EV: Record<string, string> = { d5000: '5000m', d10000: '10000m', marathon: 'マラソン' }
            for (const ir of result.meet.individuals) for (const pl of ir.placings) pushEndRep({ playerId: pl.playerId, year: t.year, nat: pl.nat, label: EV[ir.event] ?? ir.event, rank: pl.rank })
            for (const ek of result.meet.ekiden) {
              const squad = t.squads[`nat_${ek.nat}`] ?? []
              const ran = new Set(ek.runnerIds)
              for (const pid of squad) pushEndRep({ playerId: pid, year: t.year, nat: ek.nat, label: '駅伝', rank: ran.has(pid) ? ek.rank : undefined })
              for (const rid of ek.runnerIds) if (!squad.includes(rid)) pushEndRep({ playerId: rid, year: t.year, nat: ek.nat, label: '駅伝', rank: ek.rank })
            }
          } else {
            for (const pt of t.participants) for (const pid of t.squads[pt.id] ?? []) pushEndRep({ playerId: pid, year: t.year, nat: pt.nat, label: '駅伝' })
          }
          // 大陸予選の結果をニュースに流す（通過国を国名で）
          const contNews = (result.kind === 'qualifier' && result.continentals)
            ? [{
                date: `${t.year + 1}${WA_CLOSING_DATE}`,
                headline: `世界選手権 大陸予選が閉幕 — ${result.continentals.map(c => `${c.region.replace('アメリカ大陸', 'アメリカ')}: ${c.advanced.map(n => natLabel(n)).join('・')}`).join(' ／ ')} が本戦へ`,
                category: 'race' as const,
                relatedIds: [] as string[],
              }]
            : []
          return {
            worldTournament: { ...t, races: newRaces, raceIndex: nextIdx, points, finished: true },
            worldAthleticsResults: [result, ...(state.worldAthleticsResults ?? [])],
            worldRepresentatives: reps,
            ...(contNews.length > 0 ? { currentSeason: { ...state.currentSeason, newsFeed: [...contNews, ...state.currentSeason.newsFeed].slice(0, 30) } } : {}),
          }
        })
      },

      markWorldIndividualsSeen: () => {
        set(state => state.worldTournament ? { worldTournament: { ...state.worldTournament, individualsSeen: true } } : state)
      },

      // 個人種目の結果発表を1つ消化（駅伝第N戦後にN種目目を発表するインターリーブ進行）
      markWorldIndividualRevealed: () => {
        set(state => state.worldTournament ? { worldTournament: { ...state.worldTournament, individualsRevealed: (state.worldTournament.individualsRevealed ?? 0) + 1 } } : state)
      },

      // その年の駅伝3戦のコースを（未生成なら）確定する。選考画面が地形を表示するために呼ぶ。
      // 大会開始(startWorldTournament)も同じコースを使うので、選考時に見た地形どおりのレースになる
      ensureWorldRacePlans: () => {
        set(state => {
          const year = state.currentSeason.year
          if (state.worldRacePlans?.year === year) return state
          // コースは開催国の地形で作る（本番＝世界選手権の開催国、予選＝アジア予選の開催国）
          const isMain = (year - 2028) % 2 === 0
          const host = isMain ? hostForYear(year) : qualHostForYear(year)
          return { worldRacePlans: { year, plans: generateWECRacePlan(hostTerrain(host)) } }
        })
      },

      // 既存セーブ救済：今シーズンにECLが無ければ後から生成する（起動時に呼ばれる・冪等）。
      // リーグ再編をまたいだ年は旧リーグIDの順位表しか無く、ECLの生成が丸ごとスキップされていた。
      // 参加チームは JPEL=前年順位上位2、海外=各リーグのクラブ戦力（上位10人のOVR合計）上位2で構成する。
      // 補充は日付基準：現在の進行地点より未来の開催回だけ生成し、シーズンが終わっていれば何もしない
      // （4月のレースをシーズン末に出さない。その年のECLはもう開催できなかったものとして来季から通常開催）
      ensureEclSeries: () => {
        set(state => {
          const cs = state.currentSeason
          const seasonDone = cs.races.length > 0 && cs.currentRaceIndex >= cs.races.length
          // 旧救済が日付を無視して終了済みシーズンに補充してしまった未着手のECLを削除する
          // （raceIndex=0かつ全戦結果なし＝日付的にあり得ない生成物。通常のシーズン末のECL残り戦は
          //  シーズン中に日付順で消化が強制されるため、この状態には正規プレイでは到達しない）
          if (cs.eclSeries && seasonDone && cs.eclSeries.raceIndex === 0 && cs.eclSeries.races.every(r => !r.results)) {
            return { currentSeason: { ...cs, eclSeries: undefined } }
          }
          if (cs.eclSeries) return state
          if (seasonDone) return state // 未来の日付が残っていないので今年はもう開催できない
          if ((state.pastSeasons?.length ?? 0) === 0) return state // 初年度は開催なし（仕様）
          const leagues = state.foreignLeagues ?? []
          if (leagues.length === 0) return state
          const last = state.pastSeasons[state.pastSeasons.length - 1]
          const parts = buildEclParticipants({
            standings: last?.standings ?? [],
            teams: state.teams,
            playerTeamId: state.playerTeamId,
            leagues,
            foreignStandings: cs.foreignStandings ?? {},
            players: state.players,
          })
          if (parts.length < 4) return state
          // 日付基準のフィルタ：最後に消化したレースより未来の開催回だけを残す（過ぎた回は開催されなかった扱い）
          const lastPlayedDate = cs.currentRaceIndex > 0 ? cs.races[cs.currentRaceIndex - 1].date : ''
          const races = buildEclRaces(cs.year, cs.races.map(r => r.date)).filter(r => r.date > lastPlayedDate)
          if (races.length === 0) return state
          return {
            currentSeason: {
              ...cs,
              eclSeries: {
                participants: parts,
                races,
                raceIndex: 0,
                points: {},
              },
            },
          }
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
          const domesticTeamIds = domesticTeamIdSet_(state.teams)
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
            headline: `${event.name}：${myBestPlayer.name}が${distLabel}で${myBest!.rank}位（${formatRaceTime(myBest!.timeSec)}）`,
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
                recordNewsItems.push({ date: event.date, headline: `【世界新記録】${distName} ${fastestP.name} ${formatRaceTime(fastest.timeSec)}`, category: 'race' as const, relatedIds: [fastest.playerId] })
                for (const c of ties) recordNewsItems.push({ date: event.date, headline: `【世界新記録】${distName} ${c.playerName} ${formatRaceTime(fastest.timeSec)}（同タイムで共同保持）`, category: 'race' as const, relatedIds: [c.playerId] })
              } else if (fastest.timeSec === curWr.timeSec) {
                const holderIds = new Set([curWr.playerId, ...(curWr.coHolders ?? []).map(c => c.playerId)])
                const newCo = ranked.filter(r => r.timeSec === curWr.timeSec && !holderIds.has(r.playerId)).map(coOf)
                if (newCo.length > 0) {
                  newWorldRecords = { ...newWorldRecords, [bestKey]: { ...curWr, coHolders: [...(curWr.coHolders ?? []), ...newCo] } }
                  for (const c of newCo) recordNewsItems.push({ date: event.date, headline: `【世界タイ記録】${distName} ${c.playerName} ${formatRaceTime(curWr.timeSec)}`, category: 'race' as const, relatedIds: [c.playerId] })
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
                recordNewsItems.push({ date: event.date, headline: `【日本新記録】${distName} ${fastestJpnP.name} ${formatRaceTime(fastestJpn.timeSec)}`, category: 'race' as const, relatedIds: [fastestJpn.playerId] })
                for (const c of ties) recordNewsItems.push({ date: event.date, headline: `【日本新記録】${distName} ${c.playerName} ${formatRaceTime(fastestJpn.timeSec)}（同タイムで共同保持）`, category: 'race' as const, relatedIds: [c.playerId] })
              } else if (fastestJpn.timeSec === curJr.timeSec) {
                const holderIds = new Set([curJr.playerId, ...(curJr.coHolders ?? []).map(c => c.playerId)])
                const newCo = ranked.filter(r => isJpn(r) && r.timeSec === curJr.timeSec && !holderIds.has(r.playerId)).map(coOf)
                if (newCo.length > 0) {
                  newJapanRecords = { ...newJapanRecords, [bestKey]: { ...curJr, coHolders: [...(curJr.coHolders ?? []), ...newCo] } }
                  for (const c of newCo) recordNewsItems.push({ date: event.date, headline: `【日本タイ記録】${distName} ${c.playerName} ${formatRaceTime(curJr.timeSec)}`, category: 'race' as const, relatedIds: [c.playerId] })
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

      applyTrainingCards: (playerId, cardIds, multiplier = 1.0) => {
        set(state => {
          const player = state.players.find(p => p.id === playerId)
          if (!player) return state
          const cards = (state.trainingCards ?? []).filter(c => cardIds.includes(c.id))
          if (cards.length === 0) return state
          const combo = detectCombo(cards)
          if (!combo) return state
          // statDeltas は EXP量（設計書準拠）。ポテ・年齢倍率なし（固定EXP付与）
          const result = applyGrowth({
            player,
            source: 'card',
            baseGains: combo.statDeltas as Partial<Record<CardStatKey, number>>,
            bonusMultiplier: multiplier,
          })
          // 疲労回復（完全休養／超回復）。大成功倍率(multiplier)も疲労に掛ける。
          const fatigueRecovered = combo.fatigueDelta ? Math.round(combo.fatigueDelta * multiplier) : 0
          const newFatigue = Math.max(0, (player.fatigue ?? 0) - fatigueRecovered)
          const remaining = (state.trainingCards ?? []).filter(c => !cardIds.includes(c.id))
          return {
            trainingCards: remaining,
            players: state.players.map(p =>
              p.id === playerId ? { ...p, ratings: result.ratings, exp: result.exp, fatigue: newFatigue } : p
            ),
          }
        })
      },

      // カードの交換。何を何枚消して何をもらうかは utils/cardCombo.ts の表が決める
      exchangeCards: (ex, statKey) => {
        const plan = planExchange(get().trainingCards ?? [], ex, statKey)
        if (!plan) return 0
        set(s => ({ trainingCards: [...(s.trainingCards ?? []).filter(c => !plan.consumeIds.has(c.id)), ...plan.produced] }))
        return plan.produced.length
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

      // 走友会でカードを渡したとき（手元から1枚減らす）
      removeTrainingCard: (cardId) =>
        set(s => ({ trainingCards: (s.trainingCards ?? []).filter(c => c.id !== cardId) })),

      // 走友会でカードをもらったとき。idがぶつかると練習で消えなくなるので付け直す
      addTrainingCards: (cards) =>
        set(s => {
          const have = new Set((s.trainingCards ?? []).map(c => c.id))
          const add = cards.map((c, i) =>
            have.has(c.id) ? { ...c, id: `${c.id}_g${Date.now()}_${i}` } : c)
          return { trainingCards: [...(s.trainingCards ?? []), ...add] }
        }),

      dismissDroppedCards: () => set({ raceDroppedCards: [], raceExpGains: {} }),

      dismissJewelGains: () => set({ jewelGains: [] }),

      dismissBudgetNotice: () => set({ seasonBudgetNotice: null }),

      // 監督オファーを受ける。指揮するチームがここで入れ替わる。
      //
      // 受け継ぐのは移籍先が持っているもの（選手・予算・施設・ドラフト権）。
      // 前のチームからは何も持って行かない。予算とスカウトポイントは
      // シーズン終了時に控えておいた移籍先の数字へ差し替える（utils/gmOffer.ts）。
      // 在任履歴には前のチームを前年で閉じてから新しいチームを足す（utils/gmTenure.ts）。
      acceptGmOffer: () => {
        set(state => {
          const offer = state.gmOffer
          if (!offer) return {}
          const dest = state.teams.find(t => t.id === offer.teamId)
          if (!dest) return { gmOffer: null }
          const oldTeamId = state.playerTeamId
          // 監督名は人について回る。前のチームには元のGM名を戻す
          const myGmName = state.teams.find(t => t.id === oldTeamId)?.gmName
            ?? state.setupData?.gmName ?? '監督'
          const oldOriginalGm = INITIAL_TEAMS.find(t => t.id === oldTeamId)?.gmName ?? '新監督'
          const teams = state.teams.map(t => {
            if (t.id === offer.teamId) return { ...t, isPlayerControlled: true, gmName: myGmName }
            if (t.id === oldTeamId) return { ...t, isPlayerControlled: false, gmName: oldOriginalGm }
            return t
          })
          // 移籍方針（非売・貸出歓迎）は監督が付けた指示。CPUに戻るチームに残すと
          // 「絶対に売られない選手」がずっと居座って移籍市場が固まるので外す
          const players = state.players.map(p => (
            p.teamId === oldTeamId && (p.noSale || p.loanListed || p.transferListed)
              ? { ...p, noSale: false, loanListed: false, transferListed: false }
              : p
          ))
          // ECLの「どれが自チームか」の印は前季の終わりに焼き付けてある。
          // 移籍したらここを付け替えないと、来季のECLで前のチームが自チーム扱いになり
          // オーダーを組む相手と自動シミュの対象がずれる
          const ecl = state.currentSeason.eclSeries
          const eclSeries = ecl
            ? { ...ecl, participants: ecl.participants.map(pt => ({ ...pt, isPlayerTeam: pt.id === offer.teamId })) }
            : ecl
          return {
            playerTeamId: offer.teamId,
            teams,
            players,
            gmOffer: null,
            // 前のチームのオーダーは「前回のオーダー」として残さない
            lastRaceLineup: {},
            gmTenures: startTenure(state.gmTenures, offer.teamId, offer.year, oldTeamId),
            // 移籍先が因縁のチームだったらライバル設定は解除する
            rivalTeamId: state.rivalTeamId === offer.teamId ? null : state.rivalTeamId,
            seasonBudgetNotice: { year: offer.year, budget: offer.budget },
            currentSeason: {
              ...state.currentSeason,
              eclSeries,
              initialBudget: offer.budget,
              seasonGrant: offer.budgetBreakdown.grant,
              budgetBreakdown: offer.budgetBreakdown,
              scoutPoints: offer.scoutPoints,
              // 目標は移籍先の前季順位で引き直す
              objectives: selectSeasonObjectives(
                state.rivalTeamId === offer.teamId ? false : !!state.rivalTeamId,
                state.teams.length,
                offer.prevRank,
              ),
              trainingAssignments: {},
              scoutMissions: [],
            },
            raceLineup: {},
          }
        })
      },

      declineGmOffer: () => set({ gmOffer: null }),

      // 確認済みキーは増える一方なので直近100件で打ち切る（負傷通知と同じ扱い）
      dismissJoinNotice: (key) => set(s => ({ seenJoinIds: s.seenJoinIds.includes(key) ? s.seenJoinIds : [...s.seenJoinIds, key].slice(-100) })),

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
          return {
            players: deduped.length !== state.players.length ? deduped : state.players,
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

      // 買い切り版の特典：カード合成の大成功(×1.5)を1日1回だけ無料で確約。
      // 区切りは動画広告と同じ getAdDay()＝朝10時。未購入・当日消費済みなら false。
      useDailyGreatSuccess: () => {
        const state = get()
        if (!state.adsRemoved) return false
        const today = getAdDay()
        if (state.premiumGreatDate === today) return false
        set({ premiumGreatDate: today })
        return true
      },

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

      // アップデート記念：好きな選手を1人自作してロスターに加える（1回きり）。
      // ratings=振り分けた560、customCaps=育て切ると合計644(平均92)になる能力別上限（低い能力から水割り）
      createMyPlayer: (params: {
        name: string; age: number; specialty: import('../types').Specialty
        ratings: import('../types').Ratings
        customFace: NonNullable<import('../types').Player['customFace']>
      }) => {
        const state = get()
        if (state.myPlayerCreated) return false
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam) return false
        const STAT_KEYS: (keyof import('../types').Ratings)[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
        // 能力別成長上限：現在値スタートで、合計が644(平均92)になるまで低い能力から+1ずつ水割り（各92天井）
        const caps: Record<string, number> = {}
        for (const k of STAT_KEYS) caps[k] = Math.round((params.ratings as Record<string, number>)[k] ?? 0)
        let budget = 644 - STAT_KEYS.reduce((s, k) => s + caps[k], 0)
        // budget<0（振り分け超過）はあり得ないが念のため0でクランプ
        let guard = 0
        while (budget > 0 && guard++ < 1000) {
          // 92未満で最も低い能力を+1
          let lowKey: string | null = null
          for (const k of STAT_KEYS) { if (caps[k] < 92 && (lowKey === null || caps[k] < caps[lowKey])) lowKey = k }
          if (!lowKey) break
          caps[lowKey] += 1; budget -= 1
        }
        const id = `myplayer-${state.currentSeason.year}`
        const newPlayer: import('../types').Player = {
          id, name: params.name, nameKana: '', age: params.age,
          nationality: 'JPN', origin: 'マイプレイヤー',
          ratings: { ...params.ratings },
          specialty: params.specialty,
          potential: 92,
          growthCurve: 'normal',
          // 所属はこのあと movePlayer で入れる（名簿への追加をまとめて任せるため）
          teamId: '',
          status: 'active',
          contract: { yearsLeft: 4, annualSalary: faMarketSalary({ ratings: params.ratings, age: params.age } as import('../types').Player), totalYears: 4, contractType: 'standard', faEligibleYear: state.currentSeason.year + 4, rookieDeal: false },
          career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
          fatigue: 0, form: 0, morale: 90,
          joinedYear: state.currentSeason.year,
          customCaps: caps as unknown as import('../types').Ratings,
          customFace: params.customFace,
          isMyPlayer: true,
          yearsPro: 0,
        } as unknown as import('../types').Player
        const moved = movePlayer(
          { players: [...state.players, newPlayer], teams: state.teams },
          id, state.playerTeamId,
          { year: state.currentSeason.year, history: false },
        )
        if (!moved.ok) return false
        set({
          players: moved.players,
          teams: moved.teams,
          myPlayerCreated: true,
        })
        return true
      },

      resetGame: () => {
        // データ削除：ゲーム進行・広告カウント・ログインボーナスはリセット（また受け取れる）するが、
        // 課金(広告なし購入)は「データ」ではなく権利なので維持する。
        // ※アプリのアンインストール時は localStorage ごと消えるので、その場合のみ「購入を復元」が必要。
        const paid = get().adsRemoved
        // 公式Xフォロー案内は「この端末で一度見たか」の記録なので、リセット（新規ゲーム）でも保持する。
        // これをリセットすると毎回案内が出てしまう（最初の起動時1回だけにする）。
        const twSeen = get().twitterIntroSeen
        // native のセーブはファイル保存なので localStorage を消しても残る。以前はファイルを消さずに
        // 初期状態を flush していただけで、セーブ破壊ガード（進行中セーブに初期状態を書かせない仕組み）に
        // 弾かれて何も書かれず、再起動すると削除したはずの古いセーブが復活していた。
        // 先にファイルを削除してガードを解除してから初期状態を書き込む。
        void (async () => {
          await deleteSaveForRecovery()
          // フレンド用のアカウント（Keychainに保存している証明書）もここで消す。
          // アプリ削除や機種変更では残る仕様なので、消えるのはこのデータ削除のときだけ。
          try {
            const [{ clearIdentity }, { supabase, resetAuthCache, markIdentityCleared, deleteServerAccount }] =
              await Promise.all([import('../lib/durableId'), import('../lib/supabase')])
            // サーバーに残る自分のデータ（プロフィール・フレンド関係・走友会の在籍）もここで消す。
            // これをやらないと、相手のフレンド一覧に消えたはずの自分が残り続ける。
            // 通信できなければ false が返るだけで、端末側の削除は止めない。
            await deleteServerAccount()
            await clearIdentity()
            markIdentityCleared()   // ログアウトが通り切らなくても古いアカウントに戻さない
            await supabase.auth.signOut()
            resetAuthCache()
            localStorage.removeItem('jpel_friend_sync_stamp') // 新アカウントで送り直させる
          } catch (e) {
            console.warn('[reset] failed to clear friend identity', e)
          }
          set({ ...(emptyState() as unknown as GameStore), adsRemoved: paid, twitterIntroSeen: twSeen })
          await flushSaveNow()
        })()
      },
      }
    },
    {
      name: 'jpel-manager-save',
      version: 31,
      // iOSはファイル保存（localStorageの5MB制限・同期書き込みを回避）。Webは従来のlocalStorage
      storage: createJSONStorage(() => saveStorage),
      // 保存する内容は「既定で全部。ephemeralState.ts に並べた物だけ書かない」。
      // 除外するのは画面を開いている状態（モーダル等）と、どこからも読まれない残骸だけ。
      // 何を除外するかは ephemeralState.ts の1箇所だけ見ればよい
      // 選手の通算成績（通算出走数・通算区間賞・MVP回数）は保存してあるレース結果から
      // 数え直せるので書かない（utils/careerStats.ts）。優勝回数だけは復元できないので残す
      partialize: (s) => ({ ...stripEphemeral(s), players: stripCareerForSave(s.players) }),
      migrate: (persistedState: unknown, version: number) => {
        try {
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
                return { ...t, roster: { main: merged } }
              })
            }
            if (Array.isArray(s.players)) {
              s.players = (s.players as Record<string, unknown>[]).map(p => {
                const contract = (p.contract ?? {}) as Record<string, unknown>
                return { ...p, contract: { ...contract, contractType: 'standard' } }
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
          //  ※レース結果・順位・世界選手権・自己ベスト・歴代記録は全て残る
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
                return missingClubs.length > 0 ? [{ ...def, clubs: missingClubs }] : []
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
          // v16: 海外リーグ大再編（9リーグ×20クラブ）。リーグIDが全面刷新されたため、旧セーブは現シーズンは
          // 旧リーグのまま走らせ、次の年度更新で新9リーグへ丸ごと置換する（pendingForeignRestructure→rolloverで処理）。
          // ※現シーズンの順位を壊さないための「次年度反映」。新規ゲームは最初から新リーグ。
          if (version < 16) {
            if (s.isInitialized && Array.isArray(s.foreignLeagues)) {
              const hasNew = (s.foreignLeagues as { id: string }[]).some(l => l.id === 'asia_league')
              if (!hasNew) {
                const cs = (s.currentSeason ?? {}) as Record<string, unknown>
                s.currentSeason = { ...cs, pendingForeignRestructure: true }
              }
            }
          }
          // v17: DraftState.contractsDone を追加。既に契約まで済んでいる旧セーブに旗を立てておかないと、
          // 起動時にドラフト完了画面へ戻ってしまうため、開始済み（isInitialized）のセーブは done 扱いにする。
          if (version < 17) {
            const ds = s.draftState as Record<string, unknown> | undefined
            if (ds && ds.isComplete && s.isInitialized) s.draftState = { ...ds, contractsDone: true }
          }
          // v18: 国籍の「バケツ」廃止。旧セーブの nationality 'FOREIGN'（国不明）/'EUR'（欧州選抜）を
          // 実在の国コードへ直す。外国人選手は origin に出身国名が入っているので、そこから逆引きする。
          // （旗の画像もラベルも実在国コードしか持たないため、直さないと旗が出ず国名も空になる）
          if (version < 18) {
            const natByLabel = new Map<string, string>(
              (Object.entries(NAT_LABEL) as [string, string][]).map(([code, label]) => [label, code]),
            )
            const isBucket = (n: unknown) => n === 'FOREIGN' || n === 'EUR'
            // 選手（players）：origin＝出身国名から逆引き。分からなければケニア扱い（外国人であることは保つ）
            if (Array.isArray(s.players)) {
              s.players = (s.players as Record<string, unknown>[]).map(p => {
                if (!isBucket(p.nationality)) return p
                const nat = natByLabel.get(String(p.origin ?? '')) ?? 'KEN'
                return { ...p, nationality: nat, foreignCategory: nationalityToForeignCategory(nat as Nationality) }
              })
            }
            // 育成選手：日本名・日本の出身地なので日本国籍に寄せる
            const fixProspects = (season: Record<string, unknown>) => {
              const dp = season.devProspects
              if (!Array.isArray(dp)) return season
              return { ...season, devProspects: (dp as Record<string, unknown>[]).map(d =>
                isBucket(d.nationality) ? { ...d, nationality: natByLabel.get(String(d.origin ?? '')) ?? 'JPN' } : d) }
            }
            if (s.currentSeason) s.currentSeason = fixProspects(s.currentSeason as Record<string, unknown>)
            // 世界駅伝は廃止したので旧セーブの残骸を落とす（残っていても使われないが容量の無駄）
            delete s.nationalTeam
            if (s.currentSeason) delete (s.currentSeason as Record<string, unknown>).worldEkidenResult
          }
          // v19: 過去シーズンを「許可リスト方式」に揃える。
          // 旧セーブは Season を丸ごと積んでいたため、一度も読まれない項目（財務・目標・練習設定・
          // 交渉/オファー/通知の類・ECL最終結果など）が全部残っている。ここで ArchivedSeason と
          // 同じ形まで削り落とす。残す項目は archiveSeason() と1対1で対応させること。
          // ※ここで消えるのは「読む箇所がゼロの項目」だけ。記録室・在籍履歴・歴代優勝の元データ
          //   （races / standings / foreignApps / zeroAppearances / ECL）はすべて残す。
          if (version < 19 && Array.isArray(s.pastSeasons)) {
            s.pastSeasons = (s.pastSeasons as Record<string, unknown>[]).map(toArchivedShape)
          }
          // v20: 既存セーブに残っている「一時的な状態」を消す。
          // 今後は保存時に除外される（persist の partialize）が、すでに書かれてしまった分は
          // ここで落とさないと、更新後の初回起動で1度だけ選手シートが勝手に開いてしまう。
          // 加入通知の確認済みキーも増える一方だったので直近100件に切り詰める。
          if (version < 20) {
            for (const k of EPHEMERAL_KEYS) delete s[k]
            if (Array.isArray(s.seenJoinIds) && s.seenJoinIds.length > 100) {
              s.seenJoinIds = (s.seenJoinIds as string[]).slice(-100)
            }
            // 廃止した「1軍に昇格させますか？」の通知が未回答のまま残っているセーブがあるので取り除く
            const cs = s.currentSeason as { events?: { id?: string }[] } | undefined
            if (cs && Array.isArray(cs.events)) {
              cs.events = cs.events.filter(ev => !(typeof ev?.id === 'string' && ev.id.startsWith('promo-')))
            }
          }
          // v21: 引退選手の「引退時の所属」を過去シーズンから推定して入れる。
          // これが無いと、海外クラブで現役を終えた選手が記録室の国内ランキング
          // （通算区間賞・通算MVP・記録会の歴代）に混ざったままになる。
          // 判断が付かない選手には何も書かないので、既存の順位が急に変わることはない
          if (version < 21) {
            s.players = backfillRetiredTeamIds(s.players, s.pastSeasons)
          }
          // v22: 海外クラブが持っていた選手名簿(playerIds)を廃止。
          // 所属は選手側の teamId だけで持つ（国内チームと同じ扱い）。
          // 捨てる前に1回だけ、名簿にしか載っていない選手の所属を teamId へ戻す
          // （旧バージョンで契約満了のFA化が海外選手にも効いてしまったセーブの救済）。
          if (version < 22) {
            s.players = restoreTeamIdsFromLegacyClubs(s.players as Player[], s.foreignLeagues)
            dropLegacyClubRosters(s.foreignLeagues)
          }
          // v23: 2軍の枠を廃止。選手の rosterTier / dualRegistered と
          // チームの roster.second を捨てる（second に居た選手は main へ寄せる）。
          // 実際の所属は player.teamId が正なので、これで消える選手はいない。
          // セーブの容量も減る。
          if (version < 23) {
            if (Array.isArray(s.teams)) {
              s.teams = (s.teams as Record<string, unknown>[]).map(t => {
                const roster = (t.roster ?? {}) as { main?: string[]; second?: string[] }
                const merged = Array.from(new Set([...(roster.main ?? []), ...(roster.second ?? [])]))
                return { ...t, roster: { main: merged } }
              })
            }
            if (Array.isArray(s.players)) {
              s.players = (s.players as Record<string, unknown>[]).map(p => {
                const next = { ...p }
                delete next.rosterTier
                delete next.dualRegistered
                return next
              })
            }
            if (Array.isArray(s.pastSeasons)) {
              s.pastSeasons = (s.pastSeasons as Record<string, unknown>[]).map(ps => {
                const za = ps.zeroAppearances
                if (!Array.isArray(za)) return ps
                return { ...ps, zeroAppearances: (za as Record<string, unknown>[]).map(z => ({ playerId: z.playerId, teamId: z.teamId })) }
              })
            }
          }
          // v24: チームから、書くだけで誰も読んでいなかった持ち物を捨てる。
          //  - logoUrl ... いつも空文字。ロゴの表示は logoId とチームIDで決めていた
          //  - finance.salaryTotal ... 保存していたが参照する場所が無い。年俸の合計は要る時に選手から数える
          //  - history.cupWins ... 増やす処理も出す画面も無かった
          //  - history.legends ... 引退した名選手を貯めていたが出す画面が無かった。
          //    記録室の「名選手」は選手データから作り直すので、貯めたぶんは要らない
          // 所属・成績・記録には触らないので消える情報は無い。セーブの容量だけ減る。
          if (version < 24 && Array.isArray(s.teams)) {
            s.teams = (s.teams as Record<string, unknown>[]).map(t => {
              const next = { ...t }
              delete next.logoUrl
              const fin = { ...((next.finance ?? {}) as Record<string, unknown>) }
              delete fin.salaryTotal
              next.finance = fin
              const his = { ...((next.history ?? {}) as Record<string, unknown>) }
              delete his.cupWins
              delete his.legends
              next.history = his
              return next
            })
          }
          // v25: 区間記録（segmentRecords）を保存するのをやめる。
          // 元になるレース結果は過去シーズンに全部残っていて消えないので、記録は表示のたびに数え直す。
          // 貯めていたのはトップ10だけだったが、数え直すほうが取りこぼしが無く、セーブも軽くなる。
          if (version < 25) {
            delete s.segmentRecords
          }
          // v26: チームの成績（history）を保存するのをやめる。
          // 順位・勝ち点・優勝回数・連続上位は、過去シーズンの順位表から数え直せる。
          // 順位表は消えないので、これまでの成績がそのまま出る。
          if (version < 26 && Array.isArray(s.teams)) {
            s.teams = (s.teams as Record<string, unknown>[]).map(t => {
              const next = { ...t }
              delete next.history
              return next
            })
          }

          // v27: 年度MVP・新人王（seasonAwards）を保存するのをやめる。
          // 受賞者は過去シーズンのレース結果から選び直せる（utils/awards.ts）。
          // 選び方は作った時から変えていないので、これまでの受賞者がそのまま出る。
          if (version < 27) {
            delete s.seasonAwards
          }

          // v28: ECLの歴代優勝（eclHistory）を保存するのをやめる。
          // 優勝チーム・大会MVP・優勝メンバーは、過去シーズンのECLのレース結果から数え直せる。
          // 決め方は当時のまま変えていないので、これまでの記録がそのまま出る。
          if (version < 28) {
            delete s.eclHistory
          }

          // v29: 選手の通算成績（通算出走数・通算区間賞・MVP回数）を保存するのをやめる。
          // 数字は保存してあるレース結果から数え直す（utils/careerStats.ts）。
          // ここで消す必要はない（読み込みのたびに merge で入れ直し、保存時に落とす）。
          //
          // ここまでの v25〜v29 が「セーブに持たず数え直す」への切り替え。
          // 変換自体は自動で終わっているが、古いセーブの初回起動だけは
          // 数え直しを先に済ませて新しい形で書き直したいので、更新画面を出す合図を立てる。
          if (version < 29 && s.isInitialized) markDataUpdateNeeded()

          // v30: リザーブ（2軍リーグ）を廃止。
          // 今シーズンの進行中データだけを落とす。過去シーズン（pastSeasons）の
          // secondTeamRaces / secondTeamStandings は残す。消すと記録室から
          // 「あったはずのリザーブの記録」が消えて見えるため。
          if (version < 30) {
            const cs = s.currentSeason as Record<string, unknown> | undefined
            if (cs) {
              delete cs.secondTeamRaces
              delete cs.secondTeamRaceIndex
              delete cs.secondTeamStandings
              delete cs.reserveLeagueJoined
            }
          }

          // v31: 部（ディビジョン）を足した。build 88 までのセーブのチームは全員1部。
          // divisionOf() が未設定を1部として扱うので入れなくても動くが、
          // 入れておかないとセーブを覗いたときに「所属が無いチーム」に見えて紛らわしい。
          if (version < 31) {
            const teams = s.teams as { division?: number }[] | undefined
            if (Array.isArray(teams)) for (const t of teams) if (t && t.division == null) t.division = 1
          }
          return s
        } catch (e) {
          // 旧セーブの変換中に例外が出ても読み込み自体は失敗させず、変換前のデータをそのまま渡す。
          // ここで throw すると persist の内部の .catch に吸われ、セーブが無かったことになる。
          console.error('[save] migrate failed; using the persisted state as-is', e)
          return persistedState as Record<string, unknown>
        }
      },
      // 古いセーブで currentSeason に欠けているフィールドを初期値で補完する。
      // （新バージョンで追加された配列フィールド等が undefined のままだと、参照時に
      //   クラッシュ→ボタン無反応・進行不可になるため、ロード時に一括で埋める）
      merge: (persistedState, currentState) => {
        try {
          const p = (persistedState ?? {}) as Partial<typeof currentState>
          // 旧セーブの海外クラブ名簿(playerIds)の取り込み。通常は migrate v22 で済むが、
          // migrate が途中の年代変換で例外を出すと v22 まで届かないまま version だけ22になる。
          // ここは毎回通るので、取りこぼしたセーブもここで拾える（新しいセーブでは何もしない）
          if (Array.isArray(p.players)) p.players = restoreTeamIdsFromLegacyClubs(p.players, p.foreignLeagues)
          dropLegacyClubRosters(p.foreignLeagues)
          // 監督の在任履歴が無い旧セーブは「最初のシーズンからずっと今のチーム」として1件だけ入れる。
          // これまで出ていたキャリアの数字がそのまま出るので、既存プレイヤーの見た目は変わらない。
          if (p.isInitialized && p.playerTeamId && !(Array.isArray(p.gmTenures) && p.gmTenures.length > 0)) {
            const firstYear = p.pastSeasons?.[0]?.year ?? p.currentSeason?.year
            if (typeof firstYear === 'number') p.gmTenures = [{ teamId: p.playerTeamId, fromYear: firstYear }]
          }
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
            const leagueDates = season.races.map(r => r.date)
            const midDate = (target: string) => eclDateBetweenLeagueRaces(target, leagueDates)
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
          // 世界選手権の旧レース名（「アジア＋オセアニア予選 駅伝 第1戦」等）を現行形式へ冪等に直す。
          // 旧セーブは大会生成時の名前で凍結されているため、コード側のリネームだけでは直らない
          {
            const OLD_WA = /アジア[＋+]オセアニア予選/
            const fixWaName = (name: string, year: number, kind: 'qualifier' | 'main', host: Nationality | undefined, i: number): string => {
              if (!OLD_WA.test(name) && !/^世界選手権 駅伝 第\d+戦$/.test(name)) return name
              const city = host ? (WA_HOST_CITY[host] ?? '') : ''
              return kind === 'main'
                ? `${year} 世界選手権${city ? ` ${city}` : ''} 第${i + 1}戦`
                : `${year} 世界選手権アジア予選${city ? ` ${city}` : ''} 第${i + 1}戦`
            }
            if (p.worldTournament?.races) {
              const t = p.worldTournament
              p.worldTournament = { ...t, races: t.races.map((r, i) => ({ ...r, name: fixWaName(r.name, t.year, t.kind, t.host, i) })) }
            }
            if (Array.isArray(p.worldAthleticsResults)) {
              p.worldAthleticsResults = p.worldAthleticsResults.map(res => res.races
                ? { ...res, races: res.races.map((r, i) => ({ ...r, name: fixWaName(r.name, res.year, res.kind, res.kind === 'qualifier' ? res.host : res.host, i) })) }
                : res)
            }
          }
          // 既存セーブのアジア/その他圏の海外選手を新生成レンジへ一括ブースト（1回だけ適用・balancePatch=1）。
          // 生成側の強化（ASIA上限84→90等）は新規選手にしか効かないため、現存選手も同じ水準へ引き上げて
          // アジア予選を即座に接戦化する。日本人と、日本リーグ所属の外国人（国内バランス維持）は対象外
          if (Array.isArray(p.players) && ((p as { balancePatch?: number }).balancePatch ?? 0) < 1) {
            const jpelTeamIds = new Set((p.teams ?? []).map(t => t.id))
            p.players = p.players.map(pl => {
              if (!pl.ratings || pl.nationality === 'JPN' || pl.status === 'retired') return pl
              const region = natStrengthRegion(pl.nationality)
              if (region !== 'ASIA' && region !== 'OTHER') return pl
              if (pl.teamId && jpelTeamIds.has(pl.teamId)) return pl
              const f = region === 'ASIA' ? 0.18 : 0.10
              const cap = region === 'ASIA' ? 92 : 88
              const up = (v: number) => Math.min(cap, Math.max(v, Math.round(v + Math.max(0, v - 50) * f)))
              const r = pl.ratings
              return {
                ...pl,
                ratings: { speed: up(r.speed), stamina: up(r.stamina), mountainUp: up(r.mountainUp), mountainDown: up(r.mountainDown), pacing: up(r.pacing), mental: up(r.mental), recovery: up(r.recovery) },
                potential: Math.max(pl.potential ?? 0, Math.min(region === 'ASIA' ? 90 : 87, (pl.potential ?? 0) + (region === 'ASIA' ? 6 : 3))),
              }
            })
            ;(p as { balancePatch?: number }).balancePatch = 1
          }
          // 海外クラブ名を静的データ（foreignLeagues.ts）の最新名に同期する（冪等）。
          // 「〜AC」ばかりに平坦化された旧名を、既存セーブでも個性名へ差し替えるための処理
          if (Array.isArray(p.foreignLeagues)) {
            const staticClub = new Map(FOREIGN_LEAGUES.flatMap(l => l.clubs).map(c => [c.id, c]))
            p.foreignLeagues = p.foreignLeagues.map(l => ({
              ...l,
              clubs: l.clubs.map(c => {
                const sc = staticClub.get(c.id)
                return sc && (sc.name !== c.name || sc.shortName !== c.shortName) ? { ...c, name: sc.name, shortName: sc.shortName } : c
              }),
            }))
          }
          // ── 旧仕様の赤字判定バグで詰んだセーブの救済（1回だけ・deficitRescue=1）──
          // 旧 seasonOperatingResult は連続赤字ペナルティ適用「後」の減額グラントで黒字/赤字を判定していたため、
          // 一度赤字になると判定ラインが毎年上がり続け、年俸を削っても連続赤字が解除されない＝
          // 補強禁止が永久に続き、さらに毎年ドラフト最上位指名権を失う状態に陥っていた。
          // 修正版の判定に切り替えるだけでは既に積み上がったカウントと借金は消えないため、
          // 全チームの連続赤字カウントをリセットし、残高マイナスのチームを救済ラインまで戻す。
          if (Array.isArray(p.teams) && ((p as { deficitRescue?: number }).deficitRescue ?? 0) < 1) {
            let rescuedMe = false
            let myStreak = 0
            let myOldBudget = 0
            p.teams = p.teams.map(t => {
              const streak = t.finance?.deficitStreak ?? 0
              const bal = t.finance?.budget ?? 0
              if (streak === 0 && bal >= 0) return t
              if (t.id === p.playerTeamId) {
                rescuedMe = true
                myStreak = streak
                myOldBudget = bal
              }
              return {
                ...t,
                finance: {
                  ...t.finance,
                  deficitStreak: 0,
                  budget: bal < 0 ? DEFICIT_RESCUE_BUDGET : bal,
                },
              }
            })
            ;(p as { deficitRescue?: number }).deficitRescue = 1
            if (rescuedMe && p.currentSeason) {
              const y = p.currentSeason.year ?? 2046
              const parts: string[] = []
              if (myStreak > 0) parts.push(`連続赤字${myStreak}年をリセット`)
              if (myOldBudget < 0) parts.push(`残高を${Math.round(DEFICIT_RESCUE_BUDGET / 10000)}万円へ補填`)
              p.currentSeason = {
                ...p.currentSeason,
                newsFeed: [
                  {
                    date: `${y}-01-01`,
                    headline: `【不具合修正】赤字判定の不具合により補強禁止が解除されない問題を修正しました（${parts.join('・')}）。以後は「単年営業収支」が黒字になれば解除されます`,
                    category: 'finance' as const,
                    relatedIds: [],
                    major: true,
                  },
                  ...(p.currentSeason.newsFeed ?? []),
                ],
              }
            }
          }
          // ── 壊れた選手データの自動修復（毎回・冪等）──
          // ratings や contract が欠けた選手が1人でも混ざると、一覧や出走メンバー選択の描画中に
          // 例外が飛んでルートごとアンマウントされ「画面が真っ白・タップは効く」状態になる。
          // 描画側にも防御を入れてあるが、元データもここで直しておく（正常時は同じ配列をそのまま返す）。
          if (Array.isArray(p.players)) {
            let repaired = 0
            const players = p.players.map(pl => {
              if (!pl || typeof pl !== 'object') return pl
              // 引退選手は能力値を「わざと」消してセーブを軽くしているので、壊れている扱いにしない。
              // ここで埋め戻すと毎回の起動でセーブが元の大きさに戻り、さらに引退時の総合値(finalOvr)ではなく
              // でっちあげた数値が歴代ドラフト等に表示されてしまう。契約(contract)の修復は引退選手にも要る。
              const badRatings = pl.status !== 'retired' && (!pl.ratings || typeof pl.ratings !== 'object'
                || !['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
                  .every(k => Number.isFinite((pl.ratings as unknown as Record<string, number>)[k])))
              const badContract = !pl.contract || typeof pl.contract !== 'object'
                || !Number.isFinite(pl.contract.yearsLeft) || !Number.isFinite(pl.contract.annualSalary)
              if (!badRatings && !badContract) return pl
              repaired++
              const base = Math.max(40, Math.min(80, Math.round(pl.potential ?? 60)))
              const c = (pl.contract ?? {}) as Partial<Player['contract']>
              return {
                ...pl,
                // 生きている能力値はそのまま残し、欠けている分だけ potential 基準で埋める
                ratings: badRatings ? (() => {
                  const src = (pl.ratings ?? {}) as Record<string, number>
                  const out = {} as Record<string, number>
                  for (const k of ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']) {
                    out[k] = Number.isFinite(src[k]) ? src[k] : base
                  }
                  return out as unknown as Player['ratings']
                })() : pl.ratings,
                contract: badContract ? {
                  yearsLeft: Number.isFinite(c.yearsLeft) ? c.yearsLeft as number : 2,
                  annualSalary: Number.isFinite(c.annualSalary) ? c.annualSalary as number : 5_000_000,
                  faEligibleYear: Number.isFinite(c.faEligibleYear) ? c.faEligibleYear as number : (p.currentSeason?.year ?? 2027) + 2,
                  ...(c.contractType ? { contractType: c.contractType } : {}),
                } : pl.contract,
              }
            })
            if (repaired > 0) {
              console.error(`[save] repaired ${repaired} broken player record(s)`)
              p.players = players
            }
          }
          // ── チーム名簿の自動修復（毎回・冪等）──
          // 所属は player.teamId が正。team.roster はそこから毎回組み直す（rosterSync.ts）。
          // トレードや獲得の処理で片方だけ更新されて食い違うと、
          // 「ロスター画面に出ないのに駅伝には出せる・カード練習だけできない」選手が生まれる。
          // すでにその状態になっているセーブも、ここを通るだけで直る。
          if (Array.isArray(p.players)) {
            if (Array.isArray(p.teams)) p.teams = rebuildRosters(p.players, p.teams)
          }
          // ── 通算成績の組み立て（毎回・冪等）──
          // 通算出走数・通算区間賞・MVP回数はセーブに持たず、保存してあるレース結果から
          // 数え直す（utils/careerStats.ts）。優勝回数はシーズン終了時点の在籍で決まり
          // レース結果からは正しく戻せないので、選手が持っている数字をそのまま使う。
          if (Array.isArray(p.players)) {
            p.players = withCareerCounts(
              p.players,
              (p.pastSeasons ?? []) as never,
              (p.currentSeason ?? undefined) as never,
              p.removedPlayers,
            )
          }
          return {
            ...currentState,
            ...p,
            currentSeason: { ...currentState.currentSeason, ...(p.currentSeason ?? {}) },
          }
        } catch (e) {
          // 互換処理のどれかが例外を投げても、読み込み自体は失敗させない（変換なしのデータで続行する）。
          // ここで throw すると persist の内部の .catch に吸われ、hasHydrated も onFinishHydration も
          // 更新されないまま「セーブが無い」のと同じ状態になり、新規ゲーム画面が出てしまう。
          console.error('[save] merge failed; falling back to a plain merge', e)
          const fb = (persistedState && typeof persistedState === 'object' ? persistedState : {}) as Partial<typeof currentState>
          const merged = {
            ...currentState,
            ...fb,
            currentSeason: { ...currentState.currentSeason, ...(fb.currentSeason ?? {}) },
          }
          // セーブの中身はあるのに isInitialized を取り出せなかった場合、そのまま返すと
          // 新規ゲーム画面が出る。しかもセーブ破壊ガードで書き込みは拒否されるため、
          // 「チームを作り直したのに何も保存されない」状態になっていた。復旧画面へ回す。
          if (!merged.isInitialized && (Array.isArray(fb.players) ? fb.players.length > 0 : fb.playerTeamId != null)) {
            setSaveHealth('failed', 'セーブの変換に失敗しました')
          }
          return merged
        }
      },
      // 読み込み（hydration）の成否をアプリ側へ伝える唯一のフック。
      // zustand は読み込み中の例外を内部で握り潰し、そのとき hasHydrated を true にせず
      // onFinishHydration も発火しない。ここで失敗を拾わないと
      // 「セーブが無い（＝新規）」と「読めなかった」の区別がつかず、新規ゲーム画面を出して
      // 本物のセーブを上書きしてしまう。
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('[save] hydration failed', error)
          setSaveHealth('failed', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
        } else {
          setSaveHealth('ok', '')
        }
      },
    }
  )
)

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export { individualEventAbility }   // 参照元（RacePage）向けの再export。実体は utils/eventTime.ts

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

// 開催国の地形プロファイルに合わせてコースを作る。
// mountain=山の国（登り下りが激しい）/ flat=平坦な国（スピードコース）/ mixed=従来のランダム
function generateWECRacePlan(profile: 'mountain' | 'flat' | 'mixed' = 'mixed'): import('../types').WECRacePlan[] {
  return Array.from({ length: 3 }, () => {
    // 20人選抜しているので、区間は必ず6区間以上にする（4区間だと走る人数が少なすぎる）
    const segmentCount = 6 + Math.floor(Math.random() * 5)   // 6〜10区間
    const segments = Array.from({ length: segmentCount }, () => {
      let uphillPct: number, downhillPct: number
      if (profile === 'mountain') {
        uphillPct = 8 + Math.floor(Math.random() * 37)   // 8〜44%
        downhillPct = 5 + Math.floor(Math.random() * 28) // 5〜32%
      } else if (profile === 'flat') {
        uphillPct = Math.floor(Math.random() * 12)       // 0〜11%
        downhillPct = Math.floor(Math.random() * 9)      // 0〜8%
      } else {
        uphillPct = Math.floor(Math.random() * 35)
        downhillPct = Math.floor(Math.random() * 25)
      }
      return {
        distanceKm: Math.round((5 + Math.random() * 10) * 10) / 10,
        uphillPct, downhillPct,
      }
    })
    return { segments }
  })
}

// タイム表示は utils/eventTime.ts の formatRaceTime に一本化した（同じ処理が3つ手書き
// されていたうちの1つ。fmtTime だけ Math.round が無いバグがあったため統合時に揃えた）。

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
  const roster = players.filter(p => p.teamId === teamId && p.status === 'active')
  if (roster.length === 0) return 'weak'
  const avg = roster.reduce((s, p) => s + ovr(p), 0) / roster.length
  return avg >= 79 ? 'elite' : avg >= 73 ? 'mid' : 'weak'
}

function cpuSpecialtyNeeds(teamId: string, players: Player[]): string[] {
  const ALL = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const counts: Record<string, number> = {}
  const roster = players.filter(p => p.teamId === teamId && p.status === 'active')
  for (const p of roster) counts[p.specialty] = (counts[p.specialty] ?? 0) + 1
  return ALL.filter(s => (counts[s] ?? 0) < 2).sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0))
}

// 海外クラブからの移籍オファー ＋ 相手からのレンタル打診（双方向）を生成。チャットで対応する。
function generateForeignAndLoanOffers(params: {
  players: Player[]
  teams: Team[]
  foreignClubs: { id: string; name: string; shortName: string; leagueId?: string; country?: string }[]
  playerTeamId: string
  raceIndex: number
  existingIncoming: IncomingOffer[]
  existingLoans: IncomingLoanOffer[]
  races?: Race[]   // 出場機会の判定用（borrow_in打診は出番のない選手から選ぶ）
  retiringIds?: Set<string>   // 引退希望中の選手（オファー・打診の対象外）
  currentYear?: number        // 今のシーズン年。加入1年目の選手を引き抜き対象から外す
}): { foreignIncoming: IncomingOffer[]; loanOffers: IncomingLoanOffer[] } {
  const { players, teams, foreignClubs, playerTeamId, raceIndex, existingIncoming, existingLoans, races, retiringIds, currentYear } = params
  // 「誰に話を持ちかけていいか」の条件は utils/transferEligibility.ts に集約
  const eligCtx = { teamId: playerTeamId, currentYear, retiringIds }
  const foreignIncoming: IncomingOffer[] = []
  const loanOffers: IncomingLoanOffer[] = []

  const myPlayers = players.filter(p => p.teamId === playerTeamId && p.status === 'active')
  const myMain = myPlayers.filter(p => !p.loan)
  // 貸出歓迎（移籍方針）に設定した選手。年齢・立場の制限なしで打診対象になる。引退希望中は対象外
  const myLoanListed = myPlayers.filter(p => p.loanListed && !p.transferListed && canLoanOut(p, eligCtx))
  const myYoung = myPlayers.filter(p => p.age <= 23 && canLoanOut(p, eligCtx))
  const offeredIds = new Set(existingIncoming.map(o => o.playerId))
  const loanTargetIds = new Set(existingLoans.map(o => o.playerId))
  const aiTeams = teams.filter(t => t.id !== playerTeamId)

  // 1a) 海外挑戦リストの選手：希望地域の1部リーグ（4大リーグ）から高確率で指名オファー。
  //     実力がその地域の水準（アフリカ84/欧州80/北米80）に届いていることが条件
  const ELITE_BY_REGION: Record<string, string[]> = { africa: ['africa_east', 'africa_ns'], europe: ['europe_ws'], america: ['north_america'] }
  const OV_MIN_OVR: Record<string, number> = { africa: 84, europe: 80, america: 80 }
  for (const target of myMain.filter(p => !offeredIds.has(p.id) && canGoOverseasDream(p, eligCtx))) {
    if (foreignIncoming.length >= 2) break
    const region = target.overseasListed!
    if (ovr(target) < (OV_MIN_OVR[region] ?? 80)) continue
    if (Math.random() > 0.75) continue
    const clubs = foreignClubs.filter(c => (ELITE_BY_REGION[region] ?? []).includes(c.leagueId ?? ''))
    if (clubs.length === 0) continue
    const club = clubs[(ovr(target) + raceIndex) % clubs.length]
    const tv = calcTransferValue(target)
    // 夢の移籍は向こうも本気＝市場価値の1.1〜1.4倍を提示
    foreignIncoming.push({ id: `finc-${raceIndex}-${club.id}-${target.id}`, fromTeamId: club.id, playerId: target.id, offeredPrice: roundFee(tv * (1.1 + Math.random() * 0.3), 1_000_000), expiresAtRace: raceIndex + 5, round: 1, fromForeign: true })
  }

  // 1b) 世界レベル（OVR85+・34歳以下）はリスト設定なしでも4大リーグが放っておかない
  if (foreignClubs.length > 0 && Math.random() < 0.6) {
    const eliteAll = foreignClubs.filter(c => ['africa_east', 'africa_ns', 'europe_ws', 'north_america'].includes(c.leagueId ?? ''))
    const star = [...myMain]
      .filter(p => !offeredIds.has(p.id) && ovr(p) >= 85 && p.age <= 34 && !foreignIncoming.some(o => o.playerId === p.id) && canBePoached(p, eligCtx))
      .sort((a, b) => ovr(b) - ovr(a))[0]
    if (star && eliteAll.length > 0) {
      const club = eliteAll[(ovr(star) + raceIndex) % eliteAll.length]
      const tv = calcTransferValue(star)
      foreignIncoming.push({ id: `finc-${raceIndex}-${club.id}-${star.id}`, fromTeamId: club.id, playerId: star.id, offeredPrice: roundFee(tv * (1.1 + Math.random() * 0.25), 1_000_000), expiresAtRace: raceIndex + 5, round: 1, fromForeign: true })
    }
  }

  // 1) 海外クラブからの移籍オファー（自チームの上位選手を狙う）。
  // 発生率30%→55%・最大2件・対象OVR74→70に緩和（海外クラブが多数あるのに打診がほぼ来ない問題の解消）
  if (foreignClubs.length > 0 && myMain.length > 0 && foreignIncoming.length === 0 && Math.random() < 0.55) {
    // 高齢選手（34歳以上）・引退希望中は狙わない（移籍金を払ってまで獲得しない）
    const targets = [...myMain]
      .filter(p => !offeredIds.has(p.id) && ovr(p) >= 70 && p.age <= 33 && canBePoached(p, eligCtx))
      .sort((a, b) => ovr(b) - ovr(a))
      .slice(0, 4)
    const nOffers = targets.length > 0 ? (Math.random() < 0.35 ? 2 : 1) : 0
    for (let oi = 0; oi < Math.min(nOffers, targets.length); oi++) {
      // 1件目は最上位、2件目はそれ以外からランダム（同じ選手に集中させない）
      const target = oi === 0 ? targets[0] : targets[1 + Math.floor(Math.random() * (targets.length - 1))]
      if (!target || foreignIncoming.some(o => o.playerId === target.id)) continue
      const club = foreignClubs[(ovr(target) + raceIndex + oi * 7) % foreignClubs.length]
      const tv = calcTransferValue(target)
      foreignIncoming.push({ id: `finc-${raceIndex}-${club.id}-${target.id}`, fromTeamId: club.id, playerId: target.id, offeredPrice: roundFee(tv * (0.95 + Math.random() * 0.25), 1_000_000), expiresAtRace: raceIndex + 5, round: 1, fromForeign: true })
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
  transferRequests: { playerId: string; reason: string }[] = [],
  retiringIds: Set<string> = new Set(),  // 引退希望中の選手（オファー・接触の対象外にする）
  currentYear = 0,                       // 今のシーズン年。加入1年目の選手をオファー対象から外すのに使う
): { listings: TransferListing[]; incomingOffers: IncomingOffer[] } {
  const validListings = existingListings.filter(l => l.expiresAtRace > raceIndex)
  const validIncoming = existingIncoming.filter(o => o.expiresAtRace > raceIndex)

  const listedPlayerIds = new Set(validListings.map(l => l.playerId))
  const newListings: TransferListing[] = []
  const newIncoming: IncomingOffer[] = []
  const aiTeams = teams.filter(t => t.id !== playerTeamId)

  for (const team of aiTeams) {
    // 出品できるのは保有権のある選手だけ。ここが抜けていたため、他クラブから借りている選手が
    // 「出品中」として移籍市場に並び、そこから入札で奪われていた
    const teamPlayers = players.filter(p => isOwnedBy(p, team.id))
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
          const price = roundFee(calcTransferValue(c) * (c.age > 28 ? 0.85 : 1.0))
          newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: price, listedAtRace: raceIndex, expiresAtRace: raceIndex + 6, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.5).slice(0, 3).map(t => t.id) })
          listedPlayerIds.add(c.id); listed = true
        }
      }
    }

    // Surplus roster > 20: list player well below team average
    if (!listed && teamPlayers.length > 20) {
      const c = [...teamPlayers].filter(p => !listedPlayerIds.has(p.id) && p.contract.yearsLeft > 0 && ovr(p) >= 65 && ovr(p) < avgOvr - 5).sort((a, b) => ovr(a) - ovr(b))[0]
      if (c) {
        newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: roundFee(calcTransferValue(c)), listedAtRace: raceIndex, expiresAtRace: raceIndex + 5, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.4).slice(0, 3).map(t => t.id) })
        listedPlayerIds.add(c.id); listed = true
      }
    }

    // Aging player (>30) with expiring contract below team average
    if (!listed) {
      const c = [...teamPlayers].filter(p => p.age > 30 && ovr(p) >= 65 && ovr(p) < avgOvr - 3 && !listedPlayerIds.has(p.id) && p.contract.yearsLeft <= 1).sort((a, b) => a.age - b.age)[0]
      if (c) {
        newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: roundFee(calcTransferValue(c) * 0.7), listedAtRace: raceIndex, expiresAtRace: raceIndex + 4, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.25).slice(0, 2).map(t => t.id) })
        listedPlayerIds.add(c.id); listed = true
      }
    }

    // Expiring contract below tier threshold
    if (!listed) {
      const c = [...teamPlayers].filter(p => p.contract.yearsLeft <= 1 && ovr(p) >= 65 && ovr(p) < threshold && !listedPlayerIds.has(p.id)).sort((a, b) => ovr(a) - ovr(b))[0]
      if (c) {
        newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: roundFee(calcTransferValue(c) * 0.65), listedAtRace: raceIndex, expiresAtRace: raceIndex + 4, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.25).slice(0, 2).map(t => t.id) })
        listedPlayerIds.add(c.id)
      }
    }
  }

  // 自チームへのオファー対象。「誰に話を持ちかけていいか」の条件は utils/transferEligibility.ts に集約
  const eligCtx = { teamId: playerTeamId, currentYear, retiringIds }
  const playerTeamPlayers = players.filter(p => canBePoached(p, eligCtx))
  const offerTargets = new Set(validIncoming.map(o => o.playerId))
  const offeringTeams = new Set(validIncoming.map(o => o.fromTeamId))
  const wantToLeaveIds = new Set(transferRequests.map(r => r.playerId))

  for (const team of aiTeams) {
    if (offeringTeams.has(team.id)) continue
    const teamPlayers = players.filter(p => p.teamId === team.id)
    const tier = cpuTeamTier(team.id, players)
    const needsSlot = teamPlayers.length < 20
    // 打診の発生率を引き上げ（35/20/8% → 45/30/15%。自チームに打診がほぼ来ない問題の緩和）
    const wantsUpgrade = tier === 'elite' ? Math.random() < 0.45 : tier === 'mid' ? Math.random() < 0.30 : Math.random() < 0.15

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
    // 相場まで払えない（予算＜市場価値）チームはオファーを出さない。
    // これが無いと「安値で打診→相場に上げると予算不足で必ず決裂」の理不尽が起きる
    if ((team.finance?.budget ?? 0) < tv) continue
    // Realistic offer: 85-105% for elite, 80-97% for others
    const ratio = tier === 'elite' ? (0.85 + Math.random() * 0.20) : (0.80 + Math.random() * 0.17)
    newIncoming.push({ id: `inc-${raceIndex}-${team.id}-${target.id}`, fromTeamId: team.id, playerId: target.id, offeredPrice: roundFee(tv * ratio, 1_000_000), expiresAtRace: raceIndex + 5, round: 1 })
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
    // 出品が残っていても、そのあと海外挑戦を承認した／引退希望を受けた選手には入札が来ない
    if (!p || !canBePoached(p, eligCtx)) continue
    const bidChance = ovr(p) >= 80 ? 0.65 : ovr(p) >= 72 ? 0.45 : 0.25
    const biddingTeams = aiTeams.filter(() => Math.random() < bidChance).slice(0, 4)
    for (const bTeam of biddingTeams) {
      const tv = calcTransferValue(p)
      newIncoming.push({
        id: `inc-lst-${raceIndex}-${bTeam.id}-${p.id}-${Date.now()}`,
        fromTeamId: bTeam.id,
        playerId: p.id,
        offeredPrice: Math.max(roundFee(listing.askingPrice * 0.92), roundFee(tv * (0.85 + Math.random() * 0.20))),
        expiresAtRace: raceIndex + 5,
        round: 1,
      })
      alreadyOfferedIds.add(p.id)
      break
    }
  }

  // 契約残りわずか（残1年以下）の自チーム選手には、他チームからフリー移籍（移籍金なし）のオファーが来る
  // レンタルで借りている選手は保有権が無いので対象外。引退希望中の選手は「引退か引き留めか」の話なので勧誘しない
  const expiringMine = players.filter(p => p.contract.yearsLeft <= 1 && canReceiveFreeContact(p, eligCtx))
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
  const peakAge = peakAgeOf(p)
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
  if (allowAnnualGrowth && nextAge <= peakAge + 3) {
    // 若手の成長を底上げ（⑤：一斉引退後にドラフト/FA補充された若手が育ち切らず、強豪が急落して戻れない対策）。
    // 中ポテンシャル(75+)を1.0→1.3、低(＜75)を0.6→0.85に強化。
    //
    // 2046調整: ドラフト生6000人を31歳まで走らせたところ、能力別の上限に到達した選手が
    // 0%（中央値でポテンシャル82に対しOVR74＝8ポイント余らせたまま引退）だった。
    // ポテンシャルは余っていて、足りないのは「伸びる速さと期間」だったので、
    //   ・基準値 rnd(0,2)（1/3の確率で成長ゼロ・平均1.0）→ rnd(1,3)（平均2.0・ゼロの年を無くす）
    //   ・成長窓 ピーク+1年 → ピーク+3年
    // の2つを変更した。ポテンシャルの値そのものは意図的に据え置いている
    // （上げても届かないので体感が変わらず、上限が遠のくだけ）。
    // これで中央OVR 74→80、80以上が25%→50%、上限到達が0%→35%（同条件のシミュレーション）。
    // bakeAgeGrowth（playerGenerator.ts）は同じ係数を共有しているので、必ず一緒に変えること。
    const potFactor = potential >= 87 ? 1.8 : potential >= 75 ? 1.3 : 0.85
    for (const stat of GROW_KEYS) {
      const cur = ratings[stat]
      const cap = caps[stat]
      if (cur >= cap) continue
      const diff = cur >= 90 ? 0.5 : cur >= 82 ? 0.8 : cur >= 72 ? 1.0 : 1.2
      const gain = Math.round(rnd(1, 3) * potFactor * diff)
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
