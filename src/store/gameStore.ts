import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { jsonSaveStorage, flushSaveNow, deleteSaveForRecovery, setSaveFormatVersion } from './saveStorage'
import { SAVE_VERSION } from './persistence/saveVersion'
import { createSeasonSlice } from './slices/seasonSlice'
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
import type { GameState, Player, Team, RaceResults, IncomingOffer, TeamRole, FacilityKey, CardRarity, CardStatKey, TrainingCard, Ratings, Race, Nationality, Specialty } from '../types'
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
import { reconcileTalks } from '../utils/talkSync'
// 選手がクラブを移るときの後始末は movePlayer.ts に集約（所属・名簿・移籍金・履歴・レンタル）
import { movePlayer } from '../utils/movePlayer'
import { type Destination, type Appraisal } from '../utils/transferDecision'
// トレードの釣り合いの判断（下限・上限・主力割増・OVR差）は tradeValue.ts の1箇所
// 殿堂入りチーム（登録時の数値で固定）
// 監督の在任履歴と、他チームからの監督オファー
// 引退選手の「引退時の所属」を旧セーブに埋める処理（記録室の国内限定ランキング用）
import { stripCareerForSave } from '../utils/careerStats'
import { newSeasonStandings, syncSeasonStandings, divisionOf } from '../utils/league'
import { tierBudget, tierOf } from '../utils/clubTier'
// 端末に置いているものの登録表（キーと寿命）。データ削除で消すのはここから引く
import { clearGameStorage } from './appStorage'

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
  setRaceStrategy: (s: 'aggressive' | 'balanced' | 'conservative') => void
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
  // ★**出せなかった理由を必ず返すこと。** 黙って返すと、画面はシートを閉じるだけなので
  //   「出したのに札が1枚もできない」＝返事が永久に来ない、になる（utils/bidGate）
  submitTransferBid: (playerId: string, fee: number) => { ok: boolean; reason?: string }
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
  runCpuMarketRound: (date: string) => void  // CPU同士の移籍・トレード・レンタル。日付で3週ごと（部のレース数に依らない）
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
  /** 退任について行くか、の返事を閉じる */
  // 監督オファーを受ける／断る（utils/gmOffer.ts）
  /** 殿堂入りチームに登録（既にいればそのときの数値で上書き）。入れたら true */
  registerHofPlayer: (playerId: string) => boolean
  /** 殿堂入りチームから外す */
  removeHofPlayer: (playerId: string) => void
  /** inviteId … 一緒に連れて行きたい選手（1人だけ）。行くかどうかは選手が決める */
  acceptGmOffer: (teamId?: string, inviteId?: string) => void
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
  /** チャットを開いたときに、いま出ている用件を見た扱いにする（ids は chatTopicIds） */
  markChatSeen: (ids: string[]) => void
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
    // 来季から指揮すると決まっているクラブ（★13）。無いのが普通
    pendingGmMove: null,
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
      // iOSはファイル保存（localStorageの5MB制限・同期書き込みを回避）。Webは従来のlocalStorage。
      // createJSONStorage を使わないのは、あれが **set() のたびに** 数MBをJSON化するため。
      // jsonSaveStorage は状態のまま受け取り、JSON化を書き込みと同じデバウンスの中でやる
      // （セーブの中身は1バイトも変わらない。変わるのはいつ作るかだけ）
      storage: jsonSaveStorage,
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

