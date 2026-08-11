import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { clubLabel, transferHeadline, loanHeadline, seekPlayingTimeHeadline, cpuSignedHeadline, type NewsItem } from '../utils/newsItems'
import { comparePlayers } from '../utils/playerSort'
import { saveStorage, flushSaveNow, deleteSaveForRecovery, setSaveFormatVersion } from './saveStorage'
import { SAVE_VERSION } from './persistence/saveVersion'
import { createSeasonSlice } from './slices/seasonSlice'
import { tradeValueCtxOf, acquisitionDesiredSalary } from './marketOps'
import { createMarketSlice } from './slices/marketSlice'
import { createRaceSlice } from './slices/raceSlice'
import { createDraftSlice } from './slices/draftSlice'
import { createCardsSlice } from './slices/cardsSlice'
import { createMetaSlice } from './slices/metaSlice'
import { createCompetitionSlice } from './slices/competitionSlice'
import { createWorldAthleticsSlice } from './slices/worldAthleticsSlice'
import { createEconomySlice } from './slices/economySlice'
import { migrateSave } from './persistence/migrateSave'
import { mergeSave } from './persistence/mergeSave'
import { saveSlotSuffix } from './saveSlot'
// 端末に紐づくもの（課金の権利など）はスロットをまたいで共通。セーブの中に置かない
import { deviceAdsRemoved, setDeviceAdsRemoved, deviceTwitterIntroSeen, setDeviceTwitterIntroSeen } from './deviceFlags'
import { setSaveHealth } from './saveHealth'
import type { GameState, Player, Team, RaceResults, IncomingOffer, TeamRole, FacilityKey, CardRarity, CardStatKey, TrainingCard, Ratings, Race, TransferRecord, Nationality, Specialty } from '../types'
import type { ISim } from '../engine/interactiveRace'

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
import { drawSeasonSchedules } from '../data/races'
import { generateDraftPool, buildDraftOrder } from '../engine/playerGenerator'
import { ovr, faMarketSalary, playerConsentToMove, calcTransferValue } from '../utils/playerUtils'
import { roundRobin } from '../utils/roundRobin'
import { POACH_PREMIUM } from '../data/economy'
import { ROSTER_MAX, rosterCapOf } from '../data/rosterRules'
import type { OfferOutcome } from '../utils/offerResult'
import { type CardExchange } from '../utils/cardCombo'
import { FOREIGN_LEAGUES } from '../data/foreignLeagues'
// 区間の地形→推奨ポジションは utils/terrain の1本
// 過去シーズンに「何を残すか」は archiveSeason.ts に集約してある（保存時・移行時で同じ形になる）
// セーブに「何を書かないか」は ephemeralState.ts に集約してある（画面の開閉状態と読まれない残骸）
import { stripEphemeral } from './ephemeralState'
import { stripArchivedResults, hydratePastSeasons, clearSeasonArchives } from './seasonArchive'
// 「どの選手がどのチームに居るか」は rosterSync.ts に集約（player.teamId が正・team.roster は組み直す）
import { squadPlayersOf } from '../utils/rosterSync'
// 国内52クラブの名簿と、下部リーグが入っていない古いセーブの補完
import { ALL_DOMESTIC_TEAMS } from '../utils/domesticClubs'
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
import { findClub, domesticTeamIdSet as domesticTeamIdSet_, allForeignClubs, bigClub } from '../utils/clubs'
// 殿堂入りチーム（登録時の数値で固定）
// 監督の在任履歴と、他チームからの監督オファー
// 引退選手の「引退時の所属」を旧セーブに埋める処理（記録室の国内限定ランキング用）
import { stripCareerForSave, buildCareerCounts } from '../utils/careerStats'
import { teamHistoriesOf } from '../utils/teamHistory'
import { rankOfTeam, seasonDivisionStandings, newSeasonStandings, syncSeasonStandings, divisionOf, joinsDraft, DIVISION_SIZE } from '../utils/league'
import { tierBudget, tierOf, tierStrength, MAJOR_NEWS_OVR, tierOfPlayerClub } from '../utils/clubTier'
// 端末に置いているものの登録表（キーと寿命）。データ削除で消すのはここから引く
import { clearGameStorage } from './appStorage'
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
      ...createMetaSlice(set, get),
      ...createCompetitionSlice(set, get),
      ...createWorldAthleticsSlice(set, get),
      ...createEconomySlice(set, get),

      setRivalTeam: (id) => set({ rivalTeamId: id }),
      ...createSeasonSlice(set, get),

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

