import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { clubLabel, transferHeadline, divisionChampionHeadline, loanHeadline, seekPlayingTimeHeadline, cpuSignedHeadline, divisionMoveHeadline, seasonOpenHeadline, divisionsFoundedHeadline, massFreeAgentHeadline, growthHeadline, retiredHeadline, bonusPayoutHeadline, sponsorEndHeadline, objectiveBonusHeadline, seasonBudgetHeadline, deficitPickPenaltyHeadline, dynastyHeadlines, type NewsItem } from '../utils/newsItems'
import { comparePlayers } from '../utils/playerSort'
import { saveStorage, flushSaveNow, deleteSaveForRecovery, setSaveFormatVersion } from './saveStorage'
import { SAVE_VERSION } from './persistence/saveVersion'
import { tradeValueCtxOf, acquisitionDesiredSalary } from './marketOps'
import { createMarketSlice } from './slices/marketSlice'
import { myDivSize } from '../utils/league'
import { createRaceSlice } from './slices/raceSlice'
import { createDraftSlice } from './slices/draftSlice'
import { createEconomySlice } from './slices/economySlice'
import { createCardsSlice } from './slices/cardsSlice'
import { migrateSave } from './persistence/migrateSave'
import { mergeSave } from './persistence/mergeSave'
import { saveSlotSuffix } from './saveSlot'
// 端末に紐づくもの（課金の権利など）はスロットをまたいで共通。セーブの中に置かない
import { deviceAdsRemoved, setDeviceAdsRemoved, deviceTwitterIntroSeen, setDeviceTwitterIntroSeen } from './deviceFlags'
import { setSaveHealth } from './saveHealth'
import type { GameState, Division, Player, Team, RaceResults, IncomingOffer, TeamRole, FacilityKey, CardRarity, CardStatKey, TrainingCard, Ratings, Race, TransferRecord, SeasonAward, Nationality, Specialty, SeasonStanding, GmOffer } from '../types'
import type { ISim } from '../engine/interactiveRace'
import { SPECIALTY_LABELS } from '../types'
import { INITIAL_TEAMS } from '../data/teams'

// リーグの全チーム（1部20 ＋ 2部16 ＋ 3部16 = 52）。
// 部の切り分けは Team.division が持つ。
// 「どの部か」を見たいところは utils/league.ts の divisionOf / teamsInDivision を通すこと。
// 52チームの名簿そのものは utils/domesticClubs.ts の1本（既存セーブの補完もそこ）
const ALL_TEAMS = ALL_DOMESTIC_TEAMS

// マイ選手を作れるのは「新規データの初年度に1人」だけ。
// 初年度はドラフトに参加しない代わりに、自分で1人つくって加入させる。
// （アップデート記念の配布枠560は終了。GameState.myPlayerCreated は古いセーブに残るだけで使わない）
/** マイ選手に振り分けられる能力の合計 */
export const MY_PLAYER_POINTS = 500
import { BASE_PLAYERS } from '../data/players'
import { generateSeasonRaces, drawSeasonSchedules, generateIndividualEvents } from '../data/races'
import { generateDraftPool, buildDraftOrder, generateForeignLeaguePlayers, refreshForeignLeagues } from '../engine/playerGenerator'
import { simulateAwayDivisions, applyAwayDivisionRound, applyRacedToSchedule } from '../engine/domesticLeague'
import { applyForeignChampions, initForeignStandings } from '../engine/foreignLeague'
import { buildEclParticipants, buildEclRaces } from '../engine/eclSeries'
import { simulateForeignTransferMarket, simulateCrossBorderTransfers } from '../engine/foreignTransfers'
import { growPlayer } from '../engine/growth'
import { ovr, retirementAgeOf, faMarketSalary, playerConsentToMove, calcTransferValue, packForeignApps } from '../utils/playerUtils'
import { setMorale, MORALE_DEFAULT } from '../utils/condition'
import { roundRobin } from '../utils/roundRobin'
import { facilityUpkeepOf } from '../utils/facilities'
import { computeNextSeasonBudget, operatingCostOf, draftPickValue, POACH_PREMIUM } from '../data/economy'
import { ROSTER_MAX, rosterCapOf } from '../data/rosterRules'
import type { OfferOutcome } from '../utils/offerResult'
import { type CardExchange } from '../utils/cardCombo'
import { FOREIGN_LEAGUES } from '../data/foreignLeagues'
// 区間の地形→推奨ポジションは utils/terrain の1本
// 過去シーズンに「何を残すか」は archiveSeason.ts に集約してある（保存時・移行時で同じ形になる）
import { archiveSeason } from '../utils/archiveSeason'
// セーブに「何を書かないか」は ephemeralState.ts に集約してある（画面の開閉状態と読まれない残骸）
import { stripEphemeral } from './ephemeralState'
import { stripArchivedResults, hydratePastSeasons, writeSeasonArchive, clearSeasonArchives } from './seasonArchive'
// 「どの選手がどのチームに居るか」は rosterSync.ts に集約（player.teamId が正・team.roster は組み直す）
import { squadPlayersOf, squadIdsOf, clubMembersByClub } from '../utils/rosterSync'
// 国内52クラブの名簿と、下部リーグが入っていない古いセーブの補完
import { ALL_DOMESTIC_TEAMS, domesticClubsComplete, backfillDomesticClubs, originalDivisionOf } from '../utils/domesticClubs'
// 出場率は「そのクラブが走っている日程」で数える1本（自分の部・他の部・海外を区別しない）
// 「そのクラブはどのタイプが足りていないか／この選手は欲しい選手か」は国内・海外で共通の1本
import { needsPlayer, wouldMakeLineup } from '../utils/squadNeeds'
import { reconcileTalks } from '../utils/talkSync'
// 選手がクラブを移るときの後始末は movePlayer.ts に集約（所属・名簿・移籍金・履歴・レンタル）
import { movePlayer } from '../utils/movePlayer'
import { hasNoPlayingTime, seeksPlayingTime, type Destination, type Appraisal } from '../utils/transferDecision'
import { isOwnedBy } from '../utils/transferEligibility'
// トレードの釣り合いの判断（下限・上限・主力割増・OVR差）は tradeValue.ts の1箇所
import { tradeBalance } from '../utils/tradeValue'
import { findClub, domesticTeamIdSet as domesticTeamIdSet_, allForeignClubs, foreignClubIdSet, bigClub } from '../utils/clubs'
// 殿堂入りチーム（登録時の数値で固定）
// 監督の在任履歴と、他チームからの監督オファー
import { startTenure, gmSeasonRanks, gmCareerTotals } from '../utils/gmTenure'
import { makeGmOffer, resignOffers } from '../utils/gmOffer'
// 引退選手の「引退時の所属」を旧セーブに埋める処理（記録室の国内限定ランキング用）
import { generateSponsorOffers } from '../data/sponsors'
import { computeSeasonAwards, seasonAwardsOf } from '../utils/awards'
import { eclHistoryOf } from '../utils/eclHistory'
import { stripCareerForSave, buildCareerCounts } from '../utils/careerStats'
import { segmentRecordsOf } from '../utils/segmentRecords'
import { teamHistoriesOf, teamHistoryOf } from '../utils/teamHistory'
import { rankedStandings, rankOfTeam, seasonDivisionStandings, divisionStandings, domesticThroughRankOfTeam, newSeasonStandings, syncSeasonStandings, divisionOf, teamsInDivision, joinsDraft, domesticThroughRank, DIVISIONS, DIVISION_SIZE, PROMOTION_SLOTS, TOP_DIVISION } from '../utils/league'
import { tierBudget, tierOf, tierOfClubId, tierStrength, MAJOR_NEWS_OVR, tierOfPlayerClub, tierFromDomesticRank, tierFromForeignRank, allTieredClubs } from '../utils/clubTier'
// 端末に置いているものの登録表（キーと寿命）。データ削除で消すのはここから引く
import { clearGameStorage } from './appStorage'
import { ACHIEVEMENT_JEWELS, checkSeasonAchievements, podiumJewels, selectSeasonObjectives } from '../engine/achievements'
import { cpuSpecialtyNeeds, pickCpuFreeAgents } from '../engine/cpuMarket'
import { draftLotteryOrder, draftOrderTeams, pickExistsAnywhere, standingsPickNumbers } from '../engine/draftOrder'
import { perfOf } from '../utils/playerUtils'

/**
 * セーブ形式の版。**上げるのはここ1本。**
 *
 * ★上げたら必ず `scripts/check-load-v39.ts`（前の版のセーブを読ませる確認）を通すこと。
 *   build 106 で30シーズンぶんのセーブが失われたのは、これを上げた変更を
 *   既存のセーブで一度も読ませずに実機へ出したから。
 */
// 保存層に版を教える（版を上げる前のセーブを退避するかの判定に使う）。
// 数字を2か所に持たないため、あちらは持たずここから受け取る
setSaveFormatVersion(SAVE_VERSION)

export type DraftState = {
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
  // 行き先クラブの姿（格・そこで何番手か・ECL・順位）を作る
  destinationOf: (clubId: string, player: Player) => Destination
  // 行き先が決まらなかった退団予定の選手を、FAで出すか残留させるか
  resolveStayOrLeave: (playerId: string, choice: 'stay' | 'release') => void
  // 同時に来ている打診を本人の希望順に並べる（1位が本命）
  rankIncomingOffers: (playerId: string) => { offer: IncomingOffer; dest: Destination; appraisal: Appraisal }[]
  // クラブが合意したあと、本人がそのクラブへ行くことに納得するか（売る側の同意ゲート）
  consentToLeave: (playerId: string, toTeamId: string, fromForeign?: boolean) => boolean
  // 返り値は utils/offerResult の OfferOutcome 1本。逆提示(counterIncomingOffer)と同じ言葉で返す
  /** now=true は決着処理からの呼び出し。通常は1レース待つ「予約」になる */
  acceptIncomingOffer: (offerId: string, now?: boolean) => OfferOutcome
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
  // 打診してきた全クラブに同じ移籍金を一斉提示する。払えるクラブだけが残る
  counterAllIncomingOffers: (playerId: string, price: number) => { accepted: string[]; declined: string[]; blocked?: 'roster_min' | 'invalid' }
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
  /** 殿堂入りチームに登録（既にいればそのときの数値で上書き）。入れたら true */
  registerHofPlayer: (playerId: string) => boolean
  /** 殿堂入りチームから外す */
  removeHofPlayer: (playerId: string) => void
  acceptGmOffer: (teamId?: string) => void
  declineGmOffer: () => void
  /** 自分から退任する。行き先の候補が一度に届く（設定から） */
  resignAsGm: () => void
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
  // ★ use〜 という名前にしないこと。Reactのフックと見分けが付かず、eslint の
  //   rules-of-hooks が「条件付きでフックを呼んでいる」と誤検知する（実際は
  //   ボタンのハンドラから呼ぶ普通のアクション）
  claimDailyGreatSuccess: () => boolean
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
  /** マイ選手の作成。初年度の1人('inaugural')とアップデート記念の1人('gift')は別枠 */
  createMyPlayer: (params: { name: string; age: number; specialty: Specialty; nationality: Nationality; ratings: Ratings; customFace: NonNullable<Player['customFace']> }) => boolean
  /** 初年度に作る1人を作成済みか（記念の myPlayerCreated とは別に持つ） */
  inauguralPlayerCreated: boolean
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
    gmOffers: [],
    hofRoster: [],
    // 前に監督オファーが出た年。毎年は来ないようにするため（utils/gmOffer.ts の GM_OFFER_COOLDOWN）
    lastGmOfferYear: undefined,
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
      // 1年目は前シーズンが無いので、自チームの格そのままが初期予算になる
      initialBudget: tierBudget({ id: 'fukuoka' }),
      seasonGrant: tierBudget({ id: 'fukuoka' }),
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
      // 順位表は部ごとに分けて持つ（utils/league の newSeasonStandings）
      standings: newSeasonStandings(ALL_TEAMS, teamId => ({
        teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [] })),
      newsFeed: [] },
    pastSeasons: [],
    growthReport: null,
    seasonBudgetNotice: null,
    // 初期予算はクラブの格から算出。teams.tsの旧ハードコード値に依存しない。
    // 施設は焼き込まない。自チーム以外のレベルは格から出す（utils/facilities の facilitiesOf）。
    // 自チームは 0 から自分で建てる（startSetup で facilities: {} を入れる）
    teams: ALL_TEAMS.map(t => ({
      ...t,
      finance: { ...t.finance, budget: tierBudget(t) } })),
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
    inauguralPlayerCreated: false } as unknown as Omit<GameStore, keyof ReturnType<typeof create>>
}

export type SetGame = (partial: GameStore | Partial<GameStore> | ((s: GameStore) => GameStore | Partial<GameStore>)) => void

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
          // ★どのクラブを選んでも最下位（通し52位＝3部・格20）から始まる。
          //   選択はJPEL52クラブ全部から。
          //
          //   持っているのは「52クラブの並び」1本で、部はそれを切り分けたものにすぎない。
          //   選んだクラブを列から抜いて最後尾へ回すと、**下にいたクラブが全部ひとつずつ繰り上がる**。
          //   1クラブと入れ替えるのではなく列がずれるだけなので、各部の人数は自然に 20/16/16 のまま。
          //
          //   繰り上がるのは「枠」＝(部, 格)の組。格は data/clubTiers.ts に手で振ってあり、
          //   部をまたいで重なっている（2部の上位は1部の下位より格が上）。順位から
          //   tierFromDomesticRank で引き直すとその値を捨ててしまうので、枠ごと動かす。
          const orderedTeams = [...state.teams].sort((a, b) => (a.initialRank ?? 999) - (b.initialRank ?? 999))
          const slots = orderedTeams.map(t => ({ division: divisionOf(t), tier: tierOf(t) }))
          const reordered = [...orderedTeams.filter(t => t.id !== setup.teamId), orderedTeams.find(t => t.id === setup.teamId)!]
          const placementOf = new Map(reordered.map((t, i) => [t.id, slots[i]]))
          const renamedTeams: Team[] = state.teams.map(t => {
            // initialRank は初期施設のもとになった値なので触らない（枠だけ動かす）
            const placed = placementOf.get(t.id) ?? { division: divisionOf(t), tier: tierOf(t) }
            if (t.id === setup.teamId) {
              return {
                ...t,
                ...placed,
                name: setup.teamName,
                shortName: setup.teamShortName,
                gmName: setup.gmName,
                logoId: setup.logoId,
                // 本拠地はプレイヤーが自由入力した値で上書き（表示専用。空なら枠の元値のまま）
                region: setup.region?.trim() ? setup.region.trim() : t.region,
                city: setup.city?.trim() ? setup.city.trim() : t.city,
                isPlayerControlled: true }
            }
            if (t.isPlayerControlled) return { ...t, ...placed, isPlayerControlled: false }
            return { ...t, ...placed }
          })
          // 部が決まったので日程を引き直す。25コースのうちファイナル3本は部ごとに固定、
          // 残り22本を3部で取り合う（data/races.ts の drawSeasonSchedules）。
          // ここでやらないと、部が決まる前に組んだ1部の10戦のまま3部を走ることになる
          const schedules = drawSeasonSchedules(state.currentSeason.year)
          // 繰り上げ後の自分の部（列の最後尾なので3部になる）
          const myDiv = divisionOf(renamedTeams.find(t => t.id === setup.teamId))

          // 最初の18人をチームに入れる。入り口はドラフトでも移籍でも同じなので movePlayer を通す
          let players: Player[] = state.players
          let teams = renamedTeams
          baseIds.forEach((id, bi) => {
            const m = movePlayer({ players, teams }, id, setup.teamId, {
              year: state.currentSeason.year,
              history: false,
              // 契約年数を3〜5年にばらけさせ、更新が一斉に来ないようにする
              contract: { yearsLeft: 3 + (bi % 3) } })
            if (!m.ok) return
            players = m.players
            teams = m.teams
          })
          return {
            teams, players, setupData: setup, playerTeamId: setup.teamId,
            currentSeason: {
              ...state.currentSeason,
              races: schedules[myDiv],
              divisionRaces: schedules,
              // ★ここで部が動いたので順位表も合わせる（utils/league の syncSeasonStandings 1本）。
              //   順位表は部ごとに分けて持つ＝部がキーなので、teams の部だけ動かすと
              //   「走る部」と「順位表に載っている部」が食い違い、自分の行が書き込み先に
              //   存在しなくなる（2部のクラブを選ぶと自分だけ0ptのまま・元の2部が裏で走り続けた）
              standings: syncSeasonStandings({
                standings: state.currentSeason.standings, races: [], teams, playerTeamId: setup.teamId }) },
            // 監督の在任履歴はここが起点。以後の移籍でここに積んでいく（utils/gmTenure.ts）
            gmTenures: [{ teamId: setup.teamId, fromYear: state.currentSeason.year }] }
        })
      },
      ...createDraftSlice(set, get),
      ...createRaceSlice(set, get),

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
      ...createMarketSlice(set, get),

      openPlayerSheet: (id) => set({ openPlayerId: id }),

      openContractInfo: (id) => set({ contractInfoPlayerId: id }),
      closeContractInfo: () => set({ contractInfoPlayerId: null }),
      ...createCardsSlice(set, get),

      setRivalTeam: (id) => set({ rivalTeamId: id }),

      startRegularSeason: () => set(state => {
        // ロスター下限ガード：15人未満では開幕できない（UI側でもブロックするが、最終防衛線としてここでも弾く）
        const myCount = state.players.filter(p => p.teamId === state.playerTeamId && p.status !== 'retired').length
        if (myCount < 15) return state
        // プレシーズンのドラフト（今季スカウトした代）が終わったので、
        // 今季スカウトする「翌年の代」を新規生成する。前回ドラフト済みの代の残りを置き換える。
        // これで endSeason 側で引き継いだ視察済みプールがドラフトに使われ、シーズン中の視察は常に新しい代になる。
        const freshScoutPool = generateDraftPool(state.currentSeason.year + 1, new Set(state.players.map(pl => pl.name)))
        if ((state.currentSeason.objectives ?? []).length === 0) {
          const firstObjectives = selectSeasonObjectives(!!state.rivalTeamId, myDivSize(state))
          return { currentSeason: { ...state.currentSeason, phase: 'regular', objectives: firstObjectives, scoutProspects: freshScoutPool } }
        }
        return { currentSeason: { ...state.currentSeason, phase: 'regular', scoutProspects: freshScoutPool } }
      }),

      initObjectivesIfEmpty: () => set(state => {
        const objs = state.currentSeason.objectives
        if (objs.length === 0) {
          return { currentSeason: { ...state.currentSeason, objectives: selectSeasonObjectives(!!state.rivalTeamId, myDivSize(state)) } }
        }
        const hasJewels = objs.some(o => (o.rewardJewels ?? 0) > 0)
        if (!hasJewels) {
          const migrated = objs.map(o => ({
            ...o,
            rewardJewels: o.id === 'topN' ? 50 : o.id === 'segWins' ? 40 : o.id === 'noInjury' ? 30 : o.id === 'budgetMaintain' ? 40 : 30 }))
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
        // ── 他の部の残り日程を消化してから締める ─────────────────────────
        // 裏の部（engine/domesticLeague）は「自分の部で何戦目か」で進むので、
        // 自分の部のほうが戦数が少ないと他の部の日程が残ったままシーズンが終わる。
        // 3部（7戦）で遊ぶと1部（10戦）は7戦しか走らず、順位表も昇降格も通算成績も
        // 3戦ぶん足りない状態で確定していた。残りをここで全部走らせる。
        set(state => {
          const divRaces = state.currentSeason.divisionRaces
          if (!divRaces) return state
          const myDivision = divisionOf(state.teams.find(t => t.id === state.playerTeamId))
          const doneRounds = state.currentSeason.races.length
          const maxRounds = Math.max(...Object.values(divRaces).map(rs => rs.length))
          if (maxRounds <= doneRounds) return state
          let standings = state.currentSeason.standings
          let catchUpSchedule = state.currentSeason.divisionRaces
          const careerAdd: Record<string, { races: number; segWins: number }> = {}
          const segPrize: Record<string, number> = { ...(state.currentSeason.seasonSegPrize ?? {}) }
          for (let r = doneRounds; r < maxRounds; r++) {
            const round = simulateAwayDivisions(
              state.currentSeason.races[state.currentSeason.races.length - 1],
              state.teams, state.players, myDivision, 1, divRaces, r,
            )
            // 順位表へ足すときの raceId は、その回に実際に走った部のコースを使う
            const anyRace = DIVISIONS.map(d => (d === myDivision ? undefined : divRaces[d]?.[r])).find(Boolean)
            if (!anyRace) continue
            standings = applyAwayDivisionRound(standings, myDivision, round, anyRace)
            // 走行記録も日程へ書き戻す（レース中の反映と同じ関数を通す）
            catchUpSchedule = applyRacedToSchedule(catchUpSchedule, round.raced)
            for (const [pid, v] of Object.entries(round.careerAdd)) {
              const cur = careerAdd[pid] ?? { races: 0, segWins: 0 }
              careerAdd[pid] = { races: cur.races + v.races, segWins: cur.segWins + v.segWins }
            }
            for (const [tid, v] of Object.entries(round.segPrize)) segPrize[tid] = (segPrize[tid] ?? 0) + v
          }
          const awayApps2: Record<string, { races: number; wins: number }> = { ...(state.currentSeason.awayAppearances ?? {}) }
          for (const [pid, v] of Object.entries(careerAdd)) {
            const cur = awayApps2[pid] ?? { races: 0, wins: 0 }
            awayApps2[pid] = { races: cur.races + v.races, wins: cur.wins + v.segWins }
          }
          return {
            currentSeason: { ...state.currentSeason, standings, divisionRaces: catchUpSchedule, seasonSegPrize: segPrize, awayAppearances: awayApps2 },
            players: state.players.map(p => {
              const add = careerAdd[p.id]
              return add
                ? { ...p, career: { ...p.career, totalRaces: p.career.totalRaces + add.races, segmentWins: p.career.segmentWins + add.segWins } }
                : p
            }) }
        })
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
            const cpuTeamIdsRenewal = [...new Set(
              state.players
                .filter(p => p.teamId && p.teamId !== '' && p.teamId !== '__pool__' && p.teamId !== state.playerTeamId && p.status === 'active')
                .map(p => p.teamId)
            )]
            for (const teamId of cpuTeamIdsRenewal) {
              // 誰を更新するかは「そのクラブで出番があるか」（transferDecision の hasNoPlayingTime）と
              // 「穴が空いているか」（squadNeeds の needsPlayer）だけ。
              // 以前はここに平均OVRから作った下限表（72/65/58）があり、格とは別の物差しだった。
              // 下限はクラブの平均に連動するので、弱いクラブほど下限も下がって実質全員が通っていた
              const renewRoster = [...state.players.filter(p => p.teamId === teamId && p.status === 'active')].sort(comparePlayers('ovr'))
              const ongoingCommitted = state.players
                .filter(p => p.teamId === teamId && p.status === 'active' && p.contract.yearsLeft > 1)
                .reduce((s, p) => s + p.contract.annualSalary, 0)
              // 更新に使える原資も「格ぶんの予算 − 既存の年俸」。順位ではない
              let budget = Math.max(0, tierBudget(state.teams.find(t => t.id === teamId)) - ongoingCommitted)
              const expiring = state.players
                .filter(p => p.teamId === teamId && p.contract.yearsLeft === 1 && p.status === 'active')
                .sort(comparePlayers('ovr'))
              for (const p of expiring) {
                const renewRank = renewRoster.findIndex(x => x.id === p.id) + 1
                if (hasNoPlayingTime(renewRank) && !needsPlayer(renewRoster, p)) continue
                const sal = cpuRenewalSalary(p)
                if (budget < sal) continue
                cpuRenewIds.add(p.id)
                budget -= sal
              }
            }
          }

          // 格を引くクラブ一覧。国内だけ渡すと海外の格が初期値のままになるので必ず両方入れる
          const tieredClubsForGrowth = allTieredClubs(state.teams, state.foreignLeagues)
          // 加齢処理 + 契約更新適用
          const grownPlayers = state.players.map(pRaw => {
            // オフシーズンで負傷は全快（負傷状態と復帰カウントを持ち越さない）
            const p = pRaw.status === 'injured' ? { ...pRaw, status: 'active' as const, injuredUntilRace: undefined, injuryName: undefined } : pRaw
            // 自チーム以外(CPU・海外)は毎年ポテンシャルへ向けて成長させる。自チームはレース/カードEXPで成長。
            const allowAnnualGrowth = p.teamId !== state.playerTeamId
            // 伸びる量はそのクラブの格で決まる。国内・海外を問わず**いまの格**を引く。
            // 以前は海外だけ tierOfClubId＝clubTiers.ts の初期値を読んでいたので、
            // 海外の格が毎年動くようになったあとも、育つ速さだけが初期値のまま固定だった
            // （最下位を続けて格20まで落ちたクラブの選手が、格1の速さで伸び続ける）。
            const growTier = tierOfPlayerClub(p.teamId, tieredClubsForGrowth)
            const grown = p.status === 'active' || p.status === 'injured'
              ? growPlayer(p, allowAnnualGrowth, growTier)
              : p
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
                ovrAfter: ovr(after) }
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
            .sort((a, b) => Math.abs(b.ovrAfter - b.ovrBefore) - Math.abs(a.ovrAfter - a.ovrBefore))

          // Expired contracts → FA (yearsLeft=0 after growth)
          // CPU team players go to FA automatically; player-team players wait for renewal decision
          // レンタル中の選手は保有元チーム基準で判定する（借り手チーム基準だと、貸し出した自チーム選手が勝手にFA化し、
          // 借りている他人の選手の更新判断をユーザーがさせられる）
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
          // 行き先が決まらなかった退団予定の選手（新シーズンの stayOrLeave に積む）
          let undecidedIds: string[] = []
          {
            // 契約満了・売れ残りの強制FA・レンタル満了の返却。どれも movePlayer に通して同じ後始末にする。
            // 名簿は下の teamsWithFA で所属から組み直すので、ここでは選手側だけ動かす
            const yearNow = state.currentSeason.year
            // 「移籍を認める」でリスト入りしたのに、どこからもオファーが来なかった選手。
            // ★以前は問答無用で強制FA（移籍金0で流出）だったが、行き先が無かっただけで
            //   クラブから追い出すのはおかしい。GMが「FAで出す／残留させる」を選ぶ（stayOrLeave）。
            //   選ぶまではロスターに残る＝既定は残留。残しても移籍希望は続く（transferListed のまま）
            undecidedIds = grownPlayers
              .filter(p => !expiredIds.has(p.id) && p.transferListed && p.teamId === state.playerTeamId && p.status === 'active')
              .map(p => p.id)
            const listedOutIds: string[] = []
            const listedOutSet = new Set(listedOutIds)
            // レンタル期間終了 → 保有元チームへ自動返却
            const loanReturns = grownPlayers
              .filter(p => !expiredIds.has(p.id) && !listedOutSet.has(p.id) && p.loan && p.loan.untilYear <= yearNow + 1)
            const runFA = (pid: string, to: string, lock?: number) => {
              const m = movePlayer({ players: playersAfterFA, teams: [] }, pid, to, {
                year: yearNow,
                ...(lock != null ? { lockUntilYear: lock } : {}) })
              if (m.ok) playersAfterFA = m.players
            }
            for (const id of expiredIds) runFA(id, '')
            for (const id of listedOutIds) runFA(id, '', yearNow + 2)
            for (const p of loanReturns) runFA(p.id, p.loan!.ownerTeamId)
          }

          // ── RETIREMENT SYSTEM ──
          // 引退年齢は utils/playerUtils の retirementAgeOf 1本（最終戦後の引退表明ニュースと同じ式）
          const retiringIds = new Set(
            grownPlayers
              .filter(p => p.status === 'active' && p.teamId && p.teamId !== '__pool__' && !expiredIds.has(p.id))
              .filter(p => p.age >= retirementAgeOf(p))
              .map(p => p.id)
          )
          // 引退承認済み（今季限りで引退フラグ）はここで確実に引退させる（承認時は即引退しない仕様）
          for (const p of grownPlayers) if (p.pendingRetirementYear != null && p.status === 'active') retiringIds.add(p.id)

          // 海外クラブの年次入れ替え（引退を外し、若手を新加入させる）。
          // ただし旧セーブの大再編が保留中なら、この年度更新で新9リーグへ丸ごと置換し旧海外選手は退場させる。
          const pendingRestructure = (state.currentSeason as unknown as { pendingForeignRestructure?: boolean }).pendingForeignRestructure === true
          const oldForeignClubIds = foreignClubIdSet(state.foreignLeagues)
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
            resolved: false }))

          // 引退を反映する。引退も「所属が無くなる」だけなので movePlayer の分岐を通す
          // （引退時の所属の控え・レンタル解除・名簿からの外しがまとめて付いてくる）。
          // クラブ側に名簿は無い（在籍は player.teamId 1本）ので、ここは選手だけ触る
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
            resolved: false }))

          // Morale streak system: apply morale bonus/penalty to player team based on season finish
          const myFinalRank = rankOfTeam(seasonDivisionStandings(state.currentSeason, state.playerTeamId), state.playerTeamId)
          const myDivRows = seasonDivisionStandings(state.currentSeason, state.playerTeamId)

          // ── 来季の格 ────────────────────────────────────────────────
          // 国内クラブの格は「今季の国内通し順位」1本で決まる。1部1位＝格5、3部最下位＝格20。
          // 通し順位は 部 → 部内順位 の順（domesticThroughRank）。順位表の得点で52チームを
          // 直接並べてはいけない（部ごとにレース数が違うので3部が2部を追い抜く）。
          // 予算もスポンサーもロスターの強さも、全部この格から降りてくる。
          //
          // ★下部リーグのクラブが入っていない古いセーブ（build 88 より前に始めたもの）は、
          //   降格先が存在しないまま落ちたチームが「2チームしかいない2部」にいる。
          //   その部で数えると通し順位21位＝格11相当になり、本来1部のクラブが1年ぶん
          //   不当に低い予算を受け取ってしまう。補完する年はデータどおりの部で数える。
          const clubsIncomplete = !domesticClubsComplete(state.teams)
          const effDivisionOf = (t: { id: string; division?: Division }): Division =>
            clubsIncomplete ? originalDivisionOf(t.id) : divisionOf(t)
          // 効き目のある部でまとめ直す。補完が要らない年は、順位表のキーとまったく同じ組になる
          const rowsByEffDiv = (() => {
            const m = new Map<Division, SeasonStanding[]>()
            for (const d of DIVISIONS) {
              for (const r of state.currentSeason.standings[d] ?? []) {
                const e = effDivisionOf(state.teams.find(x => x.id === r.teamId) ?? { id: r.teamId })
                const list = m.get(e)
                if (list) list.push(r); else m.set(e, [r])
              }
            }
            return m
          })()
          const divisionRankOf = (t: { id: string; division?: Division }) =>
            rankOfTeam(rowsByEffDiv.get(effDivisionOf(t)), t.id)
          const nextTierOf = (t: { id: string; division?: Division }) =>
            tierFromDomesticRank(domesticThroughRank(effDivisionOf(t), divisionRankOf(t)))
          const myNextTier = nextTierOf(state.teams.find(t => t.id === state.playerTeamId) ?? { id: state.playerTeamId })

          // ── 昇降格 ──────────────────────────────────────────────────
          // 各部の上位2チームが昇格、下位2チームが降格。プレーオフなし。
          // 1部に上は無く、3部に下は無い。上下2ずつなので各部の人数は変わらない。
          // ★格は「今季走った部」での順位で決まる（nextTierOf）。部の入れ替えはその後。
          //
          // ★クラブが足りていないセーブでは、このシーズン終わりに32クラブを補う（下の backfill）。
          //   降格先が存在しないまま落ちていたぶんは取り消してデータどおりの 20/16/16 に戻し、
          //   **次の年から**通常の昇降格に戻す。ここで昇降格を通すと、補ったばかりのクラブが
          //   走ってもいない順位で動いてしまう。
          const nextDivisionOf = (t: { id: string; division?: Division }): Division => {
            if (clubsIncomplete) return originalDivisionOf(t.id)
            const d = divisionOf(t)
            const r = divisionRankOf(t)
            const size = teamsInDivision(state.teams, d).length
            if (d > DIVISIONS[0] && r <= PROMOTION_SLOTS) return (d - 1) as Division
            if (d < DIVISIONS[DIVISIONS.length - 1] && r > size - PROMOTION_SLOTS) return (d + 1) as Division
            return d
          }
          const divisionMoveNews = clubsIncomplete ? [] : state.teams
            .map(t => ({ t, from: divisionOf(t), to: nextDivisionOf(t) }))
            .filter(x => x.from !== x.to)
            .map(({ t, from, to }) => ({
              date: `${state.currentSeason.year}-12-01`,
              headline: divisionMoveHeadline({ clubName: t.name, from, to }),
              category: 'race' as const,
              relatedIds: [t.id] }))

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
                  logoColor: sp.logoColor })
              }
              sponsorNews.push({
                date: `${state.currentSeason.year}-10-27`,
                headline: sponsorEndHeadline({ sponsorName: sp.name, met: targetMet, targetDesc: sp.target?.description }),
                category: 'finance' as const,
                relatedIds: [] })
            }
            return { ...sp, yearsLeft: Math.max(0, newYearsLeft) }
          })
          // 前年にオファーが来た会社・契約中の会社は翌年の新規候補から除外（毎年同じ顔ぶれになるのを防ぐ）
          const tplIdOf = (id: string) => /^(?:sp_)?offer_(.+)_\d+_\d+$/.exec(id)?.[1]
          const excludeTplIds = [
            ...(state.currentSeason.sponsorOffers ?? []).map(o => tplIdOf(o.id)),
            ...updatedSponsors.filter(sp => sp.yearsLeft > 0).map(sp => tplIdOf(sp.id)),
          ].filter((x): x is string => !!x)
          const newSponsorOffers = [...renewalOffers, ...generateSponsorOffers(myNextTier, newYear, excludeTplIds)]
          // 連続上位はセーブに持たないので、過去シーズン（＝今季を入れる前）の順位表から数え直す。
          // 昔ここで読んでいた値も「今季を足す前」の連続数だったので、意味は同じ
          const myTeamStreak = teamHistoryOf(state.pastSeasons, state.playerTeamId).currentStreak
          const streakMoraleDelta = myFinalRank <= 3
            ? Math.min(12, 4 + myTeamStreak * 2)   // up to +12 for long winning streak
            : myFinalRank >= myDivRows.length - 2
            ? Math.max(-12, -4 - myTeamStreak * 2) // down to -12 for losing streak
            : 0
          const playersAfterMorale = streakMoraleDelta !== 0
            ? playersAfterRetire.map(p => {
                if (p.teamId !== state.playerTeamId || p.status === 'retired') return p
                // 連勝・連敗の効き。連敗でも10は下回らせない（上下限は condition.ts）
                return setMorale(p, Math.max(10, (p.morale ?? MORALE_DEFAULT) + streakMoraleDelta))
              })
            : playersAfterRetire

          // チームの成績（順位・勝ち点・優勝回数・連続上位）はセーブに書き足さない。
          // 今季の順位表は下で過去シーズンに保存されるので、成績はそこから数え直せる（utils/teamHistory.ts）
          const updatedTeams = state.teams

          // 来季の日程も部ごとに引き直す（25コースのうちファイナル3本は固定、22本を3部で取り合う）。
          // 自分の部は昇降格のあとの部で引く
          const nextSchedules = drawSeasonSchedules(newYear)
          const myNextDivision = nextDivisionOf(state.teams.find(t => t.id === state.playerTeamId) ?? { id: state.playerTeamId })
          const newRaces = nextSchedules[myNextDivision] ?? generateSeasonRaces(newYear)
          // 王者は「部ごと」。52チームを得点で並べた先頭ではない（部ごとにレース数が違う）。
          // 表に出すのは1部の王者だが、2部・3部の優勝も同じ形でニュースに出す
          const championOfDiv = (d: Division) => {
            const top = divisionStandings(state.currentSeason, d)[0]
            return updatedTeams.find(t => t.id === top?.teamId)
          }
          const divisionChampionNews = DIVISIONS.map(d => {
            const c = championOfDiv(d)
            return c ? { date: `${state.currentSeason.year}-10-25`, headline: divisionChampionHeadline(state.currentSeason.year, d, c.name), category: 'race' as const, relatedIds: [] } : null
          }).filter((x): x is NonNullable<typeof x> => !!x)
          // 翌季のプレシーズンで指名される新人はその年(newYear)に加入するので draftYear=newYear にする。
          // （+1 にすると加入年より1年多い年度で記録され、歴代ドラフトが1年ズレる）
          const nextScoutPool = generateDraftPool(newYear, new Set(state.players.map(pl => pl.name)))

          // FA news
          const faNews = expiredIds.size > 0
            ? [{
                date: `${state.currentSeason.year}-10-30`,
                headline: massFreeAgentHeadline(expiredIds.size),
                category: 'fa' as const,
                relatedIds: [...expiredIds] }]
            : []

          // Growth news
          const bigGrowth = growthEntries.filter(e => e.ovrAfter - e.ovrBefore >= 3).slice(0, 2)
          const growthNews = bigGrowth.map(e => ({
            date: `${state.currentSeason.year}-11-01`,
            headline: growthHeadline({ playerName: e.name, specialtyLabel: SPECIALTY_LABELS[e.specialty], gain: e.ovrAfter - e.ovrBefore }),
            category: 'draft' as const,
            relatedIds: [e.playerId] }))

          // Remove expired + retired players from team rosters; remove expired sponsor contracts
          // レンタル返却された選手は保有元チームのロスターへ戻す
          // 名簿は所属(player.teamId)から組み直す。契約満了・引退・売れ残りの強制FAで抜けた選手が消え、
          // レンタルから返ってきた選手が戻る。どこか1ヶ所を書き忘れて食い違うことが無くなる
          const teamsWithFA = updatedTeams.map(t => (
            t.id === state.playerTeamId && expiredSponsorIds.size > 0
              ? { ...t, sponsors: (t.sponsors ?? []).filter(id => !expiredSponsorIds.has(id)) }
              : t
          ))

          // CPU teams do NOT sign FA players here — user gets the FA window during preseason
          // AI will sign remaining FAs when beginSeasonDraft is called

          // Check objectives + award scout points + budget rewards
          // 目標の順位は自分の部の中での順位（「3位以内」は自分の部での3位）
          const finalRank = rankOfTeam(myDivRows, state.playerTeamId)
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
              headline: retiredHeadline({ playerName: p.name, age: p.age, segmentWins: p.career.segmentWins }),
              category: 'fa' as const,
              relatedIds: [p.id] } : null
          }).filter(Boolean) as typeof faNews

          // 来季の目標：今季の最終順位を基準にスケール（順位が上がるほど翌年の目標も厳しく）
          const newObjectives = selectSeasonObjectives(!!state.rivalTeamId, myDivSize(state), finalRank)

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
          // 在籍は player.teamId が唯一の持ち場（utils/rosterSync の squadIdsOf）。
          // teamsWithFA はこの playersAfterRetire から組み直したものなので、直接数えても同じ
          const playerTeamRosterIds = squadIdsOf(playersAfterRetire, state.playerTeamId)

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
          const newSeasonAward: SeasonAward = computeSeasonAwards(state.currentSeason.races, grownPlayers, state.currentSeason.year, divisionOf(state.teams.find(t => t.id === state.playerTeamId)))

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

          let bonusTotalPayout = 0
          const bonusPayoutNews: { date: string; headline: string; category: 'race'; relatedIds: string[] }[] = []

          for (const pid of playerTeamRosterIds) {
            const p = playersAfterRetire.find(x => x.id === pid)
            if (!p?.contract.bonusClauses?.length) continue
            for (const clause of p.contract.bonusClauses) {
              if (clause.type === 'champion' && finalRank === 1) {
                bonusTotalPayout += clause.amount
                bonusPayoutNews.push({ date: `${state.currentSeason.year}-10-26`, headline: bonusPayoutHeadline({ playerName: p.name, kind: 'champion', amount: clause.amount }), category: 'race', relatedIds: [p.id] })
              } else if (clause.type === 'segment_win') {
                const wins = playerSegWinsSeason[p.id] ?? 0
                if (wins > 0) {
                  const payout = clause.amount * wins
                  bonusTotalPayout += payout
                  bonusPayoutNews.push({ date: `${state.currentSeason.year}-10-26`, headline: bonusPayoutHeadline({ playerName: p.name, kind: 'segment_win', amount: payout, count: wins }), category: 'race', relatedIds: [p.id] })
                }
              } else if (clause.type === 'mvp' && p.career.mvpAwards > 0) {
                bonusTotalPayout += clause.amount
                bonusPayoutNews.push({ date: `${state.currentSeason.year}-10-26`, headline: bonusPayoutHeadline({ playerName: p.name, kind: 'mvp', amount: clause.amount }), category: 'race', relatedIds: [p.id] })
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
          const prevRaceIncome = state.currentSeason.seasonRaceIncome ?? 0   // 区間賞のみ
          const prevStreakMe = playerTeamObj?.finance.deficitStreak ?? 0

          // ── 来季予算 ────────────────────────────────────────────────
          // 収入は「来季の格の年間予算」＋スポンサー＋目標ボーナス。支出は年俸＋運営費(年俸の1割)。
          // 順位グラント・レース賞金・観客収入・CPU補填・連続赤字ペナルティ・育成義務ペナルティは
          // 全部この1本に畳んだ（data/economy.ts の computeNextSeasonBudget）。
          const myBaseGrant = tierBudget({ tier: myNextTier })
          const myOpCost = operatingCostOf(playerSalaryTotal)
          const newBudget = computeNextSeasonBudget({
            baseGrant: myBaseGrant,
            prevBalance: playerBudgetAtSeasonEnd,
            sponsorAnnual,
            raceIncome: prevRaceIncome,
            objBudgetBonus,
            bonusPayout: bonusTotalPayout,
            salaryTotal: playerSalaryTotal,
            facilityUpkeep: facilityUpkeepOf(state.teams.find(t => t.id === state.playerTeamId)) })
          // 初期予算の内訳（財務ページで「何が合わさって初期予算か」を表示）。
          // 繰越は「前季の最終収支」＝期末残高から年俸・運営費・ボーナスを精算した後の額。
          const newBudgetBreakdown = {
            carryover: playerBudgetAtSeasonEnd - (bonusTotalPayout + playerSalaryTotal + myOpCost),
            grant: myBaseGrant,
            raceIncome: prevRaceIncome,
            sponsor: sponsorAnnual,
            objBonus: objBudgetBonus,
            expenses: 0,  // 精算済みのためcarryoverに織り込み（旧セーブの表示互換のためフィールドは残す）
          }
          // シーズンを終えた時点の残高がマイナスなら連続赤字+1、プラスなら0にリセット。
          // 連続赤字でグラントを削る仕掛けは廃止したので、これは補強禁止の判定にだけ使う。
          const newStreakMe = newBudget < 0 ? prevStreakMe + 1 : 0

          // 全チームの来季予算（自チームと同じ computeNextSeasonBudget）。
          const teamSalaryTotal = (teamId: string) => playersAfterMorale
            .filter(p => p.teamId === teamId)
            .reduce((s, p) => s + p.contract.annualSalary, 0)
          const teamSponsorAnnual = (t: typeof teamsWithFA[0]) => (t.sponsors ?? [])
            .map(id => (state.sponsors ?? []).find(s => s.id === id))
            .filter(Boolean)
            .reduce((s, sp) => s + sp!.annualPayment, 0)
          // 監督オファーを受けたときに移籍先の予算へ丸ごと入れ替えるので、
          // 他チームの来季予算の内訳もここで控えておく（あとからは計算し直せない）
          const cpuNextBudgets: Record<string, typeof newBudgetBreakdown & { budget: number }> = {}
          const teamsWithSeasonRewards = teamsWithFA.map(t => {
            if (t.id === state.playerTeamId) {
              return { ...t, tier: myNextTier, division: nextDivisionOf(t), finance: { ...t.finance, budget: newBudget, deficitStreak: newStreakMe } }
            }
            const cpuTier = nextTierOf(t)
            const sal = teamSalaryTotal(t.id)
            const prevStreak = t.finance.deficitStreak ?? 0
            const cpuBaseGrant = tierBudget({ tier: cpuTier })
            const cpuSponsor = teamSponsorAnnual(t)
            // 区間賞は自チームと同じ数え方で積んである（currentSeason.seasonSegPrize）
            const cpuSegPrize = (state.currentSeason.seasonSegPrize ?? {})[t.id] ?? 0
            const b = computeNextSeasonBudget({
              baseGrant: cpuBaseGrant,
              prevBalance: t.finance.budget,
              sponsorAnnual: cpuSponsor,
              raceIncome: cpuSegPrize,
              objBudgetBonus: 0,
              bonusPayout: 0,
              salaryTotal: sal,
              // 施設の維持費は全クラブが払う（自チームと同じ1本。レベルは格から出る）
              facilityUpkeep: facilityUpkeepOf({ ...t, tier: cpuTier }) })
            // 自チームと同じ判定：精算後の残高がマイナスなら連続赤字+1、プラスなら0
            const cpuStreak = b < 0 ? prevStreak + 1 : 0
            cpuNextBudgets[t.id] = {
              budget: b,
              carryover: t.finance.budget - (sal + operatingCostOf(sal)),
              grant: cpuBaseGrant,
              raceIncome: cpuSegPrize,
              sponsor: cpuSponsor,
              objBonus: 0,
              expenses: 0 }
            return { ...t, tier: cpuTier, division: nextDivisionOf(t), finance: { ...t.finance, budget: b, deficitStreak: cpuStreak } }
          })

          // Generate future draft picks (next 2 seasons) for each team based on final rank
          const numTeams = state.teams.length
          const teamsWithFuturePicks = teamsWithSeasonRewards.map(t => {
            // 部をまたいで並べるので国内通し順位（1〜52）。下位ほど早い番号になる
            const teamFinalRank = domesticThroughRankOfTeam(state.currentSeason, t.id)
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
            draftPicks: (t.draftPicks ?? []).filter(pk => pk.year >= newYear) }))

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
                headline: deficitPickPenaltyHeadline({ streak: newStreakMe, year: newYear, round: soldPick.round, buyerShort: buyer.shortName, price }),
                category: 'finance' as const,
                relatedIds: [] })
            }
          }

          const seasonPrizeNews = {
            date: `${state.currentSeason.year}-10-30`,
            headline: seasonBudgetHeadline({ year: state.currentSeason.year, finalRank, budget: newBudget, prize: prevRaceIncome, sponsor: sponsorAnnual }),
            category: 'race' as const,
            relatedIds: [] }

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
          const segWinsAfter = playersAfterMorale.filter(p => p.teamId === state.playerTeamId).reduce((s, p) => s + p.career.segmentWins, 0)
          const segWinsBefore = state.players.filter(p => p.teamId === state.playerTeamId).reduce((s, p) => s + p.career.segmentWins, 0)
          // 節目の条件も文面も utils/newsItems の dynastyHeadlines 1本
          const dynastyNews: NewsItem[] = dynastyHeadlines({
            finalRank, championships: totalChamps, seasons: totalSeasons, currentStreak: curStreak,
            division: divisionOf(state.teams.find(t => t.id === state.playerTeamId)),
            segWinsAfter, segWinsBefore }).map(headline => ({ date: `${state.currentSeason.year}-10-26`, headline, category: 'race' as const, relatedIds: [] }))

          // Update MVP player's career.mvpAwards
          const playersWithMVP = leagueMvpId
            ? playersAfterMorale.map(p =>
                p.id === leagueMvpId ? { ...p, career: { ...p.career, mvpAwards: p.career.mvpAwards + 1 } } : p
              )
            : playersAfterMorale

          // Update championship team players' career.championships
          // 優勝は部ごとに1クラブ（1部の優勝も3部の優勝も、その部の優勝として数える）
          const champTeamIds = new Set(DIVISIONS.map(d => divisionStandings(state.currentSeason, d)[0]?.teamId).filter(Boolean))
          const playersWithChamp = champTeamIds.size > 0
            ? playersWithMVP.map(p =>
                champTeamIds.has(p.teamId)
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
            existing: state.achievements ?? [] })

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
          const rankJewels = podiumJewels(finalRank)

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

          // 海外クラブの格も今季のリーグ順位で動かす。国内（Team.tier）とまったく同じ扱いで、
          // 違うのは「どの順位表で決まるか」だけ。順位表はあるのに格へ返していなかったので、
          // 海外クラブの格は初期値のまま一生固定だった（最下位を続けても格1のまま）。
          const foreignStandingsFinal = state.currentSeason.foreignStandings ?? {}
          const leaguesWithTier = foreignRefresh.updatedLeagues.map(lg => {
            const rows = rankedStandings(foreignStandingsFinal[lg.id] ?? [])
            if (rows.length === 0) return lg   // 1戦もしていないリーグは触らない
            const rankOf = new Map(rows.map((r, i) => [r.teamId, i + 1]))
            return {
              ...lg,
              clubs: lg.clubs.map(c => {
                const rank = rankOf.get(c.id)
                return rank == null ? c : { ...c, tier: tierFromForeignRank(lg.id, rank, rows.length) }
              }) }
          })

          // シーズンオフの海外クラブ間移籍（引き抜き）。選手がクラブ・国境を越えて移動する。
          // 万一エラーが出てもシーズン更新自体は壊さないよう、失敗時は移籍なしにフォールバック。
          const foreignBasePlayers = [
            ...(removedForeignPlayerIds.size > 0 ? playersWithForeignChamp.filter(p => !removedForeignPlayerIds.has(p.id)) : playersWithForeignChamp),
            ...foreignRefresh.newPlayers,
          ]
          // 海外クラブの来季予算。**国内CPUとまったく同じ computeNextSeasonBudget 1本**を通す。
          //   収入 = 格の年間予算   支出 = 総年俸 + 運営費(年俸の1割) + 施設維持費
          // これまで海外クラブには資金の置き場所（finance）が無く、移籍の処理に入るたびに
          // tierBudget へ満タンに戻っていた。使っても減らないので、
          //   ・繰越の上限（CARRYOVER_CAP_SHARE）が効かない
          //   ・施設維持費も年俸も払わない
          //   ・格を上げても下げても手元の額が変わらない
          // という状態で、国内だけが資金のやりくりをしていた。
          // 総年俸は補充・引退を反映した後の名簿（foreignBasePlayers）から数える。
          const foreignSalaryTotal = new Map<string, number>()
          for (const p of foreignBasePlayers) {
            if (p.status === 'retired') continue
            foreignSalaryTotal.set(p.teamId, (foreignSalaryTotal.get(p.teamId) ?? 0) + p.contract.annualSalary)
          }
          const leaguesWithFinance = leaguesWithTier.map(lg => ({
            ...lg,
            clubs: lg.clubs.map(c => {
              const sal = foreignSalaryTotal.get(c.id) ?? 0
              return {
                ...c,
                finance: {
                  ...c.finance,
                  budget: computeNextSeasonBudget({
                    baseGrant: tierBudget(c),
                    // 古いセーブには finance が無い。その年は「格の年間予算ちょうど」から始める
                    prevBalance: c.finance?.budget ?? tierBudget(c),
                    sponsorAnnual: 0,   // 海外クラブはスポンサー契約を結ばない（国内CPUも同じ）
                    raceIncome: 0,      // 区間賞は国内のレースだけ
                    objBudgetBonus: 0,
                    bonusPayout: 0,
                    salaryTotal: sal,
                    facilityUpkeep: facilityUpkeepOf(c) }) } }
            }) }))

          let foreignTx: { foreignLeagues: typeof foreignRefresh.updatedLeagues; players: typeof foreignBasePlayers; news: NewsItem[]; records: TransferRecord[] }
          try {
            foreignTx = simulateForeignTransferMarket({
              foreignLeagues: leaguesWithFinance,
              players: foreignBasePlayers,
              year: newYear })
          } catch (e) {
            console.error('simulateForeignTransferMarket failed', e)
            foreignTx = { foreignLeagues: leaguesWithFinance, players: foreignBasePlayers, news: [], records: [] }
          }

          // シーズンオフの日本↔海外クロスボーダー移籍（CPU同士）。プレイヤーのチームは対象外。
          let crossTx: { teams: typeof teamsWithCleanedPicks; foreignLeagues: typeof foreignTx.foreignLeagues; players: typeof foreignTx.players; news: typeof foreignTx.news; records: TransferRecord[] }
          try {
            crossTx = simulateCrossBorderTransfers({
              teams: teamsWithCleanedPicks,
              foreignLeagues: foreignTx.foreignLeagues,
              players: foreignTx.players,
              playerTeamId: state.playerTeamId,
              year: newYear })
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
                // 人数上限は data/rosterRules の ROSTER_MAX 1本。30 と書かない
                if (ids.length <= ROSTER_MAX) continue
                const sorted = [...ids].sort((a, b) => {
                  const pa = playerByIdCl.get(a); const pb = playerByIdCl.get(b)
                  return (pb ? ovr(pb) : 0) - (pa ? ovr(pa) : 0)
                })
                sorted.slice(ROSTER_MAX).forEach(id => foreignDropIds.add(id))
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
          // 各国代表に選ばれた20人。代表タブはこの20人をそのまま出すので、
          // ここで守らないと引退した選手が名簿から消えて「20人選ばれたはずが18人」になる。
          // 次の選出で入れ替わるまでは、引退していても20人のまま見せる
          for (const squads of [
            state.worldTournament?.squads,
            ...(state.worldAthleticsResults ?? []).map(r => r.squads),
          ]) {
            for (const ids of Object.values(squads ?? {})) for (const id of ids ?? []) protectedIds.add(id)
          }
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
            const foreignClubIds = foreignClubIdSet(state.foreignLeagues)
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
              .map(([lid, st]) => [lid, st.map(s2 => ({ teamId: s2.teamId, totalPoints: s2.totalPoints, raceResults: [] }))]),
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
          const syncedTeams0 = crossTx.teams

          // 下部リーグのクラブが入っていない古いセーブに、足りない32クラブを補う。
          // 補うのは来季の器を組んだこの時点＝**次の年から**参加する（今季の順位表は触らない）。
          // そろっているセーブでは何もしない（utils/domesticClubs.ts）
          // ★自チームのIDを渡すこと。渡さないと自チームの部まで「データどおり」に戻され、
          //   3部から始めたはずのクラブが選んだクラブの元の部（1部・2部）へ引き戻される
          const backfilled = backfillDomesticClubs({
            teams: syncedTeams0, players: cleanedPlayers, year: newYear, playerTeamId: state.playerTeamId })
          const syncedTeams = backfilled.teams
          const playersWithBackfill = backfilled.players
          const backfillNews = backfilled.addedTeams.length === 0 ? [] : [{
            date: `${newYear}-01-05`,
            headline: divisionsFoundedHeadline(backfilled.addedTeams.length, syncedTeams.length),
            category: 'race' as const,
            relatedIds: [] }]

          // 他チームから監督の声がかかるか。来季の予算と評判が決まったあとに判定する。
          // 出るのは1シーズンに最大1件で、答えるまでホームに出続ける（utils/gmOffer.ts）
          const gmOffer = makeGmOffer({
            season: state.currentSeason,
            playerTeamId: state.playerTeamId,
            finalRank,
            gmRep: newGmRep,
            teamCount: myDivSize(state),
            nextYear: newYear,
            teams: syncedTeams,
            nextBudgets: cpuNextBudgets,
            objBonus,
            rng: Math.random,
            lastOfferYear: state.lastGmOfferYear,
            tenureStartYear: (state.gmTenures ?? []).slice(-1)[0]?.fromYear })

          // 終わったシーズンを別ファイルへ書き出す。**書けて読み戻せた年だけ**を archivedYears に足し、
          // その年の走行記録は次のセーブから外れる（store/seasonArchive.ts）。
          // 書けなければ何も起きない＝セーブに残ったままになるだけで、記録は消えない
          const archivedThisSeason = archiveSeason(state.currentSeason, {
            foreignAppsC: packForeignApps(archivedForeignApps),
            foreignStandings: archivedForeignStandings,
            zeroAppearances })
          void writeSeasonArchive(archivedThisSeason).then(ok => {
            if (!ok) return
            useGameStore.setState(st => ({
              archivedYears: [...new Set([...(st.archivedYears ?? []), archivedThisSeason.year])] }))
          })

          return {
            players: playersWithBackfill,
            removedPlayers,
            teams: syncedTeams,
            // 1件でも複数でも同じ入れ物（退任したときは3件まで一度に届く）
            gmOffers: gmOffer ? [gmOffer] : [],
            // 出た年を控えて、次のオファーまで間隔を空ける
            lastGmOfferYear: gmOffer ? newYear : state.lastGmOfferYear,
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
            pastSeasons: [...state.pastSeasons, archivedThisSeason],
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
              divisionRaces: nextSchedules,
              collegeRaces: [],
              draftPool: [],
              scoutPoints: 5 + objBonus + (state.teams.find(t => t.id === state.playerTeamId)?.facilities?.scoutOffice ?? 0),
              initialBudget: newBudget,   // 来期の開始予算（＝繰越+クラブ予算+スポンサー）。収支表示の基準。
              seasonGrant: newBudgetBreakdown.grant,   // 来期のクラブ予算（＝来季の格の年間予算）。内訳表示と一致させる。
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
              // 行き先が決まらなかった退団予定の選手。preseason にチャットで「FAで出す／残留させる」を選ぶ
              stayOrLeave: undecidedIds.map(id => ({ playerId: id })),
              sponsorOffers: newSponsorOffers,
              seasonRaceIncome: 0,
              seasonSegPrize: {},
              foreignStandings: initForeignStandings(foreignRefresh.updatedLeagues),
              foreignRaceIndex: 0,
              foreignAppearances: {},
              pendingForeignRestructure: false,  // 再編を適用したのでフラグ解除
              // 来季のECL：今季（＝前年）の各リーグ上位2チームで開催。4/6/7/9/11月の5戦、コースは10種から重複なし抽選。
              // 初年度は前年成績が無いためこの経路でしか生成されない＝1年目は開催なし
              eclSeries: (() => {
                const parts = buildEclParticipants({
                  // ECLの枠は1部の上位2クラブ
                  standings: divisionStandings(state.currentSeason, TOP_DIVISION),
                  teams: state.teams,
                  playerTeamId: state.playerTeamId,
                  leagues: foreignRefresh.updatedLeagues,
                  foreignStandings: state.currentSeason.foreignStandings ?? {},
                  players: foreignTx.players })
                if (parts.length < 4) return undefined
                return {
                  participants: parts,
                  races: buildEclRaces(newYear, newRaces.map(r => r.date)),
                  raceIndex: 0,
                  points: {} }
              })(),
              // 補ったクラブぶんも来季の順位表に並ぶよう、state.teams ではなく補完後を使う。
              // 部の割り振りは昇降格を通したあとの部（＝来季走る部）で決まる
              standings: newSeasonStandings(syncedTeams, teamId => ({
                teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [] })),
              newsFeed: [
                ...backfillNews,
                { date: `${newYear}-03-01`, headline: seasonOpenHeadline(newYear, newRaces.length), category: 'race' as const, relatedIds: [] },
                ...crossTx.news,
                ...foreignTx.news,
                ...divisionChampionNews,
                ...divisionMoveNews,
                seasonPrizeNews,
                ...pickPenaltyNews,
                ...(objBonus > 0 ? [{ date: `${state.currentSeason.year}-11-01`, headline: objectiveBonusHeadline({ points: objBonus, budget: objBudgetBonus }), category: 'draft' as const, relatedIds: [] }] : []),
                ...dynastyNews,
                ...retirementNews,
                ...bonusPayoutNews,
                ...faNews,
                ...aiSigningNews,
                ...growthNews,
                ...sponsorNews,
              ] } }
        })
      },
      ...createEconomySlice(set, get),

      acceptGmOffer: (teamId) => {
        set(state => {
          // 届いている中から選ぶ。1件しか無いときは指定なしでもよい
          const offer = teamId ? (state.gmOffers ?? []).find(o => o.teamId === teamId) : (state.gmOffers ?? [])[0]
          if (!offer) return {}
          const dest = state.teams.find(t => t.id === offer.teamId)
          if (!dest) return { gmOffers: [] }
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
            gmOffers: [],
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
              // 目標は移籍先の部の人数と、その部での前季順位で引き直す。
              // 52を渡すと「52チーム中◯位」の目標になり、16チームの部では達成不能になる
              objectives: selectSeasonObjectives(
                state.rivalTeamId === offer.teamId ? false : !!state.rivalTeamId,
                offer.divisionSize ?? myDivSize(state),
                offer.prevRank,
              ),
              trainingAssignments: {},
              scoutMissions: [] },
            raceLineup: {} }
        })
      },

      declineGmOffer: () => set({ gmOffers: [] }),

      // 自分から退任する（設定から）。行き先の候補が一度に届く。
      // シーズン途中でも押せて、受けたその日から新しいクラブを指揮する。
      // 声がかかるかの抽選はしない（辞めると決めた以上、行き先0件では詰むため）。
      resignAsGm: () => {
        set(state => {
          if ((state.gmOffers ?? []).length > 0) return {}   // すでに届いている
          // 候補クラブの「いま使えるお金」をそのまま持って行く（年度更新を待たない）。
          // 予算は格1本（utils/clubTier）なので、内訳のグラントもそこから出す
          const tiered = allTieredClubs(state.teams, state.foreignLeagues ?? [])
          const nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }> = {}
          for (const t of state.teams) {
            nextBudgets[t.id] = {
              budget: t.finance.budget,
              carryover: 0, grant: tierBudget(t), raceIncome: 0, sponsor: 0, objBonus: 0, expenses: 0 }
          }
          const offers = resignOffers({
            season: state.currentSeason,
            playerTeamId: state.playerTeamId,
            finalRank: rankOfTeam(seasonDivisionStandings(state.currentSeason, state.playerTeamId), state.playerTeamId),
            nextYear: state.currentSeason.year,
            teams: state.teams,
            nextBudgets,
            rng: Math.random,
            tierNow: id => tierOf(tiered.find(c => c.id === id)),
            tierSeed: id => tierOfClubId(id) })
          return { gmOffers: offers }
        })
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
        // 別ファイルに出してある過去シーズンの走行記録（store/seasonArchive.ts）。
        // 消さないと、新しく始めたゲームが同じ年に達したときに前のデータを読み戻してしまう
        const archivedYearsToClear = get().archivedYears
        void (async () => {
          await clearSeasonArchives(archivedYearsToClear)
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
            // 端末に置いているもののうち「データ削除で消える」ものを全部消す。
            // **ここに消すものを手書きで並べないこと。** 置き場所と寿命の登録表は
            // store/appStorage.ts の1本で、新しい保存場所を足す人はそこに足す。
            // 以前はここに手書きの一覧があり、書き足し忘れたもの（もらったカードの箱）が
            // データ削除でも残っていた。
            clearGameStorage()
          } catch (e) {
            console.warn('[reset] failed to clear friend identity', e)
          }
          set({ ...(emptyState() as unknown as GameStore), adsRemoved: paid, twitterIntroSeen: twSeen })
          await flushSaveNow()
        })()
      } }
    },
    {
      // 保存先はスロットごとに分かれる（store/saveSlot.ts）。スロット1は接尾辞なし＝
      // 今までの名前のままなので、既存のセーブはスロット1として読める
      name: `jpel-manager-save${saveSlotSuffix()}`,
      version: SAVE_VERSION,
      // iOSはファイル保存（localStorageの5MB制限・同期書き込みを回避）。Webは従来のlocalStorage
      storage: createJSONStorage(() => saveStorage),
      // 保存する内容は「既定で全部。ephemeralState.ts に並べた物だけ書かない」。
      // 除外するのは画面を開いている状態（モーダル等）と、どこからも読まれない残骸だけ。
      // 何を除外するかは ephemeralState.ts の1箇所だけ見ればよい
      // 選手の通算成績（通算出走数・通算区間賞・MVP回数）は保存してあるレース結果から
      // 数え直せるので書かない（utils/careerStats.ts）。優勝回数だけは復元できないので残す
      // 過去シーズンの走行記録は別ファイルに出してある（store/seasonArchive.ts）。
      // セーブは状態が変わるたびに全部を書き直すので、ここを落とさないと
      // 選手を1人動かすたびに過去100シーズンぶんの区間タイムまで書き直される。
      // **落とすのは archivedYears に載っている年だけ**（書いて読み戻して確かめた年）
      partialize: (s) => ({
        ...stripEphemeral(s),
        players: stripCareerForSave(s.players),
        pastSeasons: stripArchivedResults(s.pastSeasons, s.archivedYears) }),
      migrate: migrateSave,
      merge: (persistedState, currentState) => mergeSave(persistedState, currentState),
      // 読み込み（hydration）の成否をアプリ側へ伝える唯一のフック。
      // zustand は読み込み中の例外を内部で握り潰し、そのとき hasHydrated を true にせず
      // onFinishHydration も発火しない。ここで失敗を拾わないと
      // 「セーブが無い（＝新規）」と「読めなかった」の区別がつかず、新規ゲーム画面を出して
      // 本物のセーブを上書きしてしまう。
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[save] hydration failed', error)
          setSaveHealth('failed', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
          return
        }
        setSaveHealth('ok', '')
        // 端末に紐づくもの（課金の権利・案内を見たか）をセーブより先に反映する。
        // セーブ側が true で端末側が未設定なら、そちらを端末へ持ち上げる（スロットを
        // 使う前からの購入者を拾う）。逆に端末側が true なら、新しいスロットでも最初から有効。
        if (state) {
          if (state.adsRemoved && !deviceAdsRemoved()) setDeviceAdsRemoved(true)
          if (state.twitterIntroSeen && !deviceTwitterIntroSeen()) setDeviceTwitterIntroSeen(true)
          state.adsRemoved = state.adsRemoved || deviceAdsRemoved()
          state.twitterIntroSeen = state.twitterIntroSeen || deviceTwitterIntroSeen()
          // 別ファイルに出してある過去シーズンの走行記録を読み戻す。
          // 戻したあとの形は今までとまったく同じなので、読む側の画面は何も変わらない。
          // 読めなくても画面は出す（記録が出ないだけ）
          void hydratePastSeasons(state.pastSeasons ?? [], state.archivedYears).then(ps => {
            useGameStore.setState({ pastSeasons: ps })
          })
        }
      } }
  )
)

/** 自分の部のチーム数。「リーグの規模」を teams.length(52) で見ないための入口 */

