export type Specialty = 'ace' | 'mountain_up' | 'mountain_down' | 'sprinter' | 'long' | 'allrounder' | 'kick' | 'grinder'
export type GrowthCurve = 'early' | 'normal' | 'late_bloomer'
export type Nationality = 'JPN' | 'KOR' | 'CHN' | 'TWN' | 'ETH' | 'KEN' | 'UGA' | 'TAN' | 'USA' | 'EUR' | 'FOREIGN'
export type ForeignCategory = 'domestic' | 'asian' | 'foreign'
export type PlayerStatus = 'active' | 'injured' | 'retired' | 'draft_eligible'
export type SeasonPhase = 'preseason' | 'regular' | 'postseason' | 'draft' | 'free_agency'
export type RosterTier = 'main' | 'second'

export type GameEventType =
  | 'player_fatigue'
  | 'player_morale_low'
  | 'player_form_up'
  | 'player_wants_renewal'
  | 'young_breakout'
  | 'sponsor_offer'
  | 'media_interview'
  | 'press_conference'
  | 'playing_time_demand'
  | 'transfer_request'
  | 'board_warning'
  | 'player_milestone'
  | 'budget_boost'
  | 'player_retirement'
  | 'veteran_ambition'
  | 'rival_provocation'
  | 'ai_poaching'
  | 'team_chemistry'
  | 'budget_crisis'

export type EventChoice = { label: string; desc: string }

export type GameEvent = {
  id: string
  raceIndex: number
  type: GameEventType
  playerId?: string
  title: string
  body: string
  choices: EventChoice[]
  resolved: boolean
  choiceIndex?: number
}

export type AITradeOffer = {
  id: string
  fromTeamId: string
  offeredPlayerIds: string[]
  requestedPlayerIds: string[]
  offeredPickKeys?: string[]
  requestedPickKeys?: string[]
  expiresAtRace: number
  message: string
}

export type TransferListing = {
  id: string
  playerId: string
  fromTeamId: string
  askingPrice: number
  listedAtRace: number
  expiresAtRace: number
  competingTeams: string[]
}

export type IncomingOffer = {
  id: string
  fromTeamId: string
  playerId: string
  offeredPrice: number
  expiresAtRace: number
  round: number
  fromForeign?: boolean   // 海外クラブからのオファー
  retentionRefused?: boolean  // フリー接触中に引き留めを一度断った（以後は本人の決断待ちだけ・通知や要対応に出さない）
}

// トレードのチャット交渉。提案→相手が承諾/カウンター/拒否→往復（最大3回）。
export type TradeNegotiation = {
  id: string
  targetTeamId: string
  giveIds: string[]        // 自チームが出す選手
  givePickKeys: string[]   // 自チームが出す指名権
  getIds: string[]         // 相手から獲得する選手
  getPickKeys: string[]    // 相手から獲得する指名権
  round: number
  status: 'countered' | 'accepted' | 'rejected'
  message: string          // 相手GMのメッセージ
  demandAddIds?: string[]      // カウンター：追加で出してほしい自チーム選手
  demandAddPickKeys?: string[] // カウンター：追加で出してほしい指名権
}

// 自チームから出すレンタル要請（移籍市場から）。相手が次レースで応答。
export type LoanRequest = {
  id: string
  playerId: string
  targetTeamId: string
  years: number
  submittedAtRace: number
}

// レンタル要請への相手クラブの回答（承諾/却下）。通知で表示して確認したら消す。
export type LoanResponse = {
  id: string
  playerId: string
  playerName: string
  ownerShort: string
  accepted: boolean
  years: number
}

// 相手チームから来るレンタル打診（チャットで対応）
export type IncomingLoanOffer = {
  id: string
  fromTeamId: string
  playerId: string
  direction: 'lend_out' | 'borrow_in'   // lend_out=自チームの若手を貸してほしい / borrow_in=相手の選手を借りませんか
  years: number
  expiresAtRace: number
  fromForeign?: boolean
}

export type TransferBidStatus = 'pending' | 'fee_accepted' | 'countered' | 'rejected' | 'player_neg' | 'complete' | 'failed'

export type TransferBid = {
  id: string
  playerId: string
  targetTeamId: string
  offeredFee: number
  round: number
  status: TransferBidStatus
  counterFee?: number
  offeredSalary?: number
  offeredYears?: number
  submittedAtRace: number
  feeAcceptedAtRace?: number
}

export type TeamRole = 'ace' | 'sub_ace' | 'key_player' | 'rotation' | 'development'

export type ContractRequest = {
  id: string
  playerId: string
  initiatedBy: 'player' | 'gm'
  round: number
  status: 'pending_gm' | 'countered' | 'accepted' | 'rejected'
  expiresAtRace?: number  // pending_gmのままこのレース番号に達したら自動失効（通知が永久に残るのを防ぐ）
  demandSalary: number
  demandYears: number
  offerSalary: number
  offerYears: number
  counterSalary?: number
  counterYears?: number
  offerContractType?: 'standard' | 'development' | 'dual'
  offerTeamRole?: TeamRole
}

// 他チーム選手・FA選手への獲得オファー交渉。チャットで交渉する。
export type AcquisitionOffer = {
  id: string
  playerId: string
  source: 'fa' | 'scout'   // fa=フリー選手, scout=他チーム選手の引き抜き
  round: number
  status: 'pending' | 'countered' | 'accepted' | 'rejected'
  offerSalary: number
  offerYears: number
  offerContractType: 'standard' | 'development' | 'dual'
  counterSalary?: number
  counterYears?: number
  offerTeamRole?: TeamRole
  rejectReason?: 'team_refused' | 'low_offer' | 'demotion'   // team_refused=主力で放出拒否, low_offer=条件不足, demotion=2軍契約を拒否
}

export type TraitId =
  | 'big_stage'
  | 'pressure_weak'
  | 'clutch'
  | 'fade'
  | 'mountain_ace'
  | 'sprint_burst'
  | 'consistent'
  | 'volatile'
  | 'team_player'
  | 'iron_will'

export type Ratings = {
  speed: number
  stamina: number
  mountainUp: number
  mountainDown: number
  pacing: number
  mental: number
  recovery: number
}

export type BonusClause = {
  type: 'champion' | 'segment_win' | 'mvp'
  amount: number
}

export type SegmentPB = {
  key: string      // terrain profile key: e.g. "10km-up30-down0"
  timeSec: number
  raceName: string
  date: string
}

export type Player = {
  id: string
  name: string
  nameKana: string
  age: number
  yearsPro: number
  draftYear: number
  draftRound: number | null
  draftPick: number | null
  predictedPick?: number   // 生成時に焼き込む予想指名順位（能力＋将来性の全候補内順位）。ドラフト中に候補が減っても不変
  ratings: Ratings
  specialty: Specialty
  potential: number
  growthCurve: GrowthCurve
  teamId: string
  rosterTier: RosterTier
  dualRegistered?: boolean
  injuredUntilRace?: number   // race index until player is available (injury system)
  injuryName?: string         // 負傷名（通知・ニュース表示用。復帰で消える）
  segmentPBs?: SegmentPB[]   // personal best times per terrain profile
  contract: {
    yearsLeft: number
    annualSalary: number
    faEligibleYear: number
    contractType?: 'standard' | 'development' | 'dual'
    bonusClauses?: BonusClause[]
    rookieDeal?: boolean   // ドラフト直後の初回契約（相場より安い）。次の更新では相場基準の要求になる
  }
  nationality: Nationality
  origin: string
  acquiredRaceIndex?: number  // 移籍/トレードで加入したレース番号。加入後2戦は出走不可の判定に使う
  joinedYear?: number         // このチームに加入したシーズン年。当該シーズン中は「NEW」表示
  renewalLockedUntilYear?: number  // 更新交渉を最終拒否 → この年まで自チームは更新オファー不可
  transferLockedUntilYear?: number // 移籍交渉が決裂 → この年まで自チームは移籍金オファー不可
  retirementDeclinedYear?: number  // 引退を引き留めた年。その年は引退希望を再抽選しない
  transferRequestDismissedYear?: number  // 移籍希望に「残ってほしい」で対応した年。その年は再抽選しない
  faSinceYear?: number        // 無所属(FA)になったシーズン年。2季続けて無所属なら整理（引退/削除）される
  retiredYear?: number        // 引退したシーズン年（選手詳細の「XXXX年引退」表示用。旧セーブは未設定）
  potentialBoosts?: Partial<Record<CardStatKey, number>>  // ジュエルの上限解放で能力別上限に加算する値
  transferListed?: boolean    // 「移籍を認める」で移籍リスト入り（他チームのオファー対象・シーズン内に決まらなければFA）
  noSale?: boolean            // 移籍方針・非売：他クラブ（国内・海外）からの買い取りオファーが一切来なくなる
  loanListed?: boolean        // 移籍方針・貸出歓迎：レンタル打診（lend_out）が優先的・高確率で来る
  // レンタル移籍：ownerTeamId が保有元、teamId は現在プレー中（借り手）。untilYear シーズン終了で自動返却。
  loan?: { ownerTeamId: string; untilYear: number }
  loanTeamYears?: { year: number; teamId: string }[]  // 在籍履歴用：その年そのチームでレンタル出場した記録（今後のシーズンから蓄積）
  eventBests?: Partial<Record<'d5000' | 'd10000' | 'half' | 'marathon', { timeSec: number; year: number }>>  // 記録会の種目別自己ベスト
  displayBadge?: string  // ロスターの名前横に表示する記録パッチのキー（複数保持者はどれを出すか選べる）
  status: PlayerStatus
  fatigue: number
  morale: number
  form?: number      // -2=絶不調, -1=不調, 0=普通, 1=好調, 2=絶好調
  career: {
    totalRaces: number
    segmentWins: number
    championships: number
    mvpAwards: number
  }
  ovrHistory?: { year: number; ovr: number }[]
  traits?: TraitId[]
  personality?: 'salary' | 'winning' | 'loyalty'
  foreignCategory?: ForeignCategory
  personalSponsors?: string[]    // Sponsor IDs
  missNextRace?: boolean
  exp?: Partial<Record<CardStatKey, number>>  // 蓄積EXP（レース・カードで貯まりLvUpに使う）
  teamRole?: TeamRole
}

export type SeasonStanding = {
  teamId: string
  leaguePoints: number
  segmentPoints: number
  totalPoints: number
  raceResults: { raceId: string; rank: number; points: number }[]
}

export type CardStatKey = 'speed' | 'stamina' | 'mountainUp' | 'mountainDown' | 'pacing' | 'mental' | 'recovery'
export type CardRarity = 'normal' | 'rare' | 'epic' | 'legendary'
export type TrainingCard = {
  id: string
  statKey: CardStatKey
  rarity: CardRarity
  value: number
  kind?: 'rest'   // 未指定＝通常の能力カード / 'rest'＝完全休養（疲労回復カード）
}
export type Gift = {
  id: string
  title: string
  message: string
  cards: TrainingCard[]
  jewels?: number       // ジュエル配布ギフト（お詫び等）。cards は空でよい
  expiresAt?: string    // 受け取り期限（ISO日時）。過ぎたら受け取り不可で自動削除
}
export type ComboResult = {
  name: string
  color: string
  statDeltas: Partial<Record<CardStatKey, number>>
  traitGrant?: TraitId
  traitChance?: number
  isSpecial: boolean
  fatigueDelta?: number   // 正の数＝減らす疲労量
}

export type SponsorType = 'team' | 'personal'
export type SponsorTier = 'small' | 'medium' | 'large' | 'title'
export type SponsorTargetType = 'rank' | 'segmentWins' | 'championship'

export type SponsorTarget = {
  type: SponsorTargetType
  value: number
  description: string
}

export type SponsorOffer = {
  id: string
  name: string
  tier: SponsorTier
  annualPayment: number
  contractYears: number
  target: SponsorTarget
  logoColor: string
}

export type Sponsor = {
  id: string
  name: string
  type: SponsorType
  tier: SponsorTier
  annualPayment: number
  yearsLeft: number
  contractYears?: number
  target?: SponsorTarget
  conditions?: string
  logoColor: string
}

export type FacilityKey = 'trainingCamp' | 'medicalCenter' | 'scoutOffice' | 'tacticsRoom'
export type Facilities = Partial<Record<FacilityKey, number>>

export type IndividualEventResult = {
  playerId: string
  teamId: string
  timeSec: number
  rank: number
}
export type IndividualEvent = {
  id: string
  name: string
  date: string
  distance: 5000 | 10000 | 21097 | 42195
  weather?: 'sunny' | 'cloudy' | 'rainy' | 'windy'   // 記録会当日の天気（タイムに影響）
  results?: IndividualEventResult[]
  rewardCards?: TrainingCard[]  // 開催時に自チームへ付与した練習カード（結果画面の表示用）
}

export type WorldEkidenCountryResult = {
  country: string
  name: string
  totalTimeSec: number
  rank: number
}

export type WECRacePlan = {
  segments: { distanceKm: number; uphillPct: number; downhillPct: number }[]
}

export type WECSegmentNationTime = {
  segmentIndex: number
  distanceKm: number
  uphillPct: number
  downhillPct: number
  nations: { country: string; name: string; timeSec: number }[]
}

export type WECRaceResult = {
  raceNumber: number
  weather: 'sunny' | 'cloudy' | 'rainy' | 'windy'
  legResults: { segmentIndex: number; playerName: string; distanceKm: number; timeSec: number }[]
  segmentNationTimes: WECSegmentNationTime[]
  countryResults: { country: string; name: string; totalTimeSec: number; rank: number; points: number }[]
  japanTime: number
  japanRank: number
}

export type WECFinalStanding = {
  country: string
  name: string
  totalPoints: number
  finalRank: number
}

export type WorldEkidenResult = {
  year: number
  hostCity: string
  courseChar: string
  races: WECRaceResult[]
  finalStandings: WECFinalStanding[]
  japanFinalRank: number
  japanTotalTime: number
  // Legacy fields (old saves)
  japanRank?: number
  japanTime?: number
  playerIds?: string[]
  legResults?: { segmentIndex: number; playerName: string; timeSec: number }[]
  countryResults?: WorldEkidenCountryResult[]
  weather?: 'sunny' | 'cloudy' | 'rainy' | 'windy'
}

export type ForeignClub = {
  id: string
  name: string
  shortName: string
  leagueId: string
  country: Nationality
  colors: { primary: string; secondary: string }
  playerIds: string[]
}

export type ForeignLeague = {
  id: string
  name: string
  country: Nationality
  countryName: string
  clubs: ForeignClub[]
}

// 海外リーグの順位表（1クラブぶん）。currentSeason.foreignStandings に leagueId 単位で保持。
export type ForeignStanding = { clubId: string; totalPoints: number; raceResults: { raceId: string; rank: number; points: number }[] }

// ECL（Ekiden Champions League）：日本リーグ上位2＋海外各リーグ上位2の計16チームが3戦のポイント制で優勝を争う国際大会。
export type EclStanding = {
  id: string
  name: string
  shortName: string
  isForeign: boolean
  isPlayerTeam: boolean
  leagueName: string
  colors: { primary: string; secondary: string }
  points: number
  timeSec?: number   // 一発勝負の総合タイム（順位はこの昇順）
}
export type EclResult = {
  year: number
  championId: string
  standings: EclStanding[]           // タイム昇順（=最終順位）
  races: { name: string; raceId: string }[]
  courseName?: string                // 開催コース（10コースからランダム）
  location?: string
  courseCharacter?: string
  raceResults?: RaceResults          // 一発勝負の全区間結果（結果画面用）
  winnerPlayerIds?: string[]         // 優勝チームの出走メンバー（記録パッチ付与用）
  mvpPlayerId?: string               // 大会MVP（区間で最も突出した走りをした選手）
  playerRank?: number                // 自チームの最終順位（不出場は undefined）
  prize?: number                     // 自チームが得た賞金
}

// ECLの歴代記録（シーズンをまたいで永続。優勝パッチと記録室の歴代優勝で使う）
export type EclHistoryEntry = {
  year: number
  championId: string
  championName: string
  courseName: string
  timeSec: number
  winnerPlayerIds: string[]
  mvpPlayerId?: string   // ECL MVP（パッチ付与用）
}

export type NationalTeam = {
  coachTeamId: string
  year: number
  squadIds: string[]
  racePlan: WECRacePlan[]
  racePlayerIds: string[][]
  isPlayerCoach: boolean
  playerIds?: string[]  // legacy
}

export type Team = {
  id: string
  name: string
  shortName: string
  city: string
  region: string
  founded: number
  colors: { primary: string; secondary: string }
  logoUrl: string
  logoId?: string   // プレイヤーが選んだプリセットロゴ（'logo_01'〜'logo_30'）。設定時はこれを最優先で表示。未設定なら従来のteamId基準ロゴ

  roster: {
    main: string[]
    second: string[]
  }
  finance: {
    salaryTotal: number
    budget: number
    deficitStreak?: number  // 連続赤字シーズン数（0=黒字）。赤字ペナルティの段階判定に使う
  }
  draftPicks: {
    year: number
    round: number
    pickNumber: number
    originallyOwnedBy: string
  }[]
  initialRank: number
  isPlayerControlled: boolean
  gmName: string
  sponsors?: string[]            // Sponsor IDs
  facilities?: Facilities
  // 記録会のチーム歴代記録（在籍時に出したタイムはチームに永続。選手が抜けても残る）。
  // 距離キーごとに選手ベストを保持（同一選手は最速のみ）。
  // playerName/nationality は表示用に焼き込む（選手データが長期整理で削除されても記録が名前ごと残る）
  eventRecords?: Partial<Record<'d5000' | 'd10000' | 'half' | 'marathon', { playerId: string; playerName?: string; nationality?: Nationality; timeSec: number; year: number }[]>>
  history: {
    seasonResults: { year: number; rank: number; points: number }[]
    championships: number
    cupWins: number
    legends?: {
      name: string
      specialty: Specialty
      retiredAge: number
      retiredYear: number
      peakOvr: number
      yearsInTeam: number
      career: { segmentWins: number; championships: number; mvpAwards: number }
    }[]
    bestStreak?: number        // longest consecutive top-3 finish streak
    currentStreak?: number
  }
}

export type Segment = {
  index: number
  distanceKm: number
  uphillPct: number    // 0–100, % of segment that is uphill
  downhillPct: number  // 0–100, % that is downhill; flatPct = 100 - uphillPct - downhillPct
  statWeights?: Partial<Record<keyof Ratings, number>>
}

export type RaceConditions = {
  temperature: number
  weather: 'sunny' | 'cloudy' | 'rainy' | 'windy'
  elevation: number
}

export type RaceResults = {
  teamRankings: { teamId: string; totalTimeSec: number; rank: number; positionPoints: number; segmentPoints: number }[]
  segmentResults: {
    segmentIndex: number
    runners: { playerId: string; teamId: string; timeSec: number; rank: number }[]
  }[]
}

export type Race = {
  id: string
  name: string
  date: string
  location: string
  type: 'league' | 'college'
  segments: Segment[]
  conditions: RaceConditions
  participants: string[]
  results?: RaceResults
}

export type GrowthEntry = {
  playerId: string
  name: string
  age: number
  specialty: Specialty
  ovrBefore: number
  ovrAfter: number
}

export type Season = {
  year: number
  currentRaceIndex: number
  phase: SeasonPhase
  races: Race[]
  collegeRaces: Race[]
  draftPool: CollegeRunner[]
  scoutPoints: number
  initialBudget?: number   // そのシーズンの開始予算（固定・収支表示用）。前季endSeasonで確定した来期予算。
  seasonGrant?: number     // そのシーズンの順位グラント額（前年順位ベース。運営費＝この10%）。1年目は最下位20位相当＝3.5億。
  // 初期予算がどう決まったかの内訳（前季endSeasonで確定）。2年目以降のみ。財務ページで「何が合わさって初期予算か」を表示。
  budgetBreakdown?: {
    carryover: number    // 昨年繰越（前季末の残高）
    grant: number        // 順位グラント（連続赤字ペナルティ適用後）
    raceIncome: number   // 賞金・観客収入
    sponsor: number      // スポンサー収入
    objBonus: number     // 目標達成ボーナス
    expenses: number     // 前季支出（年俸＋運営費＋施設維持費＋出来高賞与）
  }
  scoutProspects: Player[]
  standings: {
    teamId: string
    leaguePoints: number
    segmentPoints: number
    totalPoints: number
    raceResults: { raceId: string; rank: number; points: number }[]
  }[]
  newsFeed: {
    date: string
    headline: string
    category: 'trade' | 'draft' | 'college' | 'race' | 'injury' | 'fa' | 'finance'
    relatedIds: string[]
    major?: boolean       // 大ニュース（移籍金1億以上の大型移籍など）
    fromTeamId?: string   // 移籍元チーム
    toTeamId?: string     // 移籍先チーム
  }[]
  objectives: {
    id: string
    desc: string
    target: number
    current: number
    rewardPts: number
    rewardBudget?: number
    rewardJewels?: number
    done: boolean
  }[]
  trainingAssignments: Record<string, string>
  scoutMissions: { id: string; prospectId: string; racesLeft: number }[]
  faVisits?: { playerId: string; raceScouted: number }[]
  campBonus?: { type: string; applied: boolean }
  events?: GameEvent[]
  pendingTradeOffers?: AITradeOffer[]
  scoutedOpponents?: { playerId: string; reqAt: number; year: number }[]
  trainingPlan?: string | null
  secondTeamRaces?: Race[]
  secondTeamRaceIndex?: number
  secondTeamStandings?: { teamId: string; totalPoints: number; raceResults: { raceId: string; rank: number; points: number }[] }[]
  transferListings?: TransferListing[]
  incomingOffers?: IncomingOffer[]
  incomingLoanOffers?: IncomingLoanOffer[]
  loanRequests?: LoanRequest[]
  loanResponses?: LoanResponse[]
  tradeNegotiations?: TradeNegotiation[]
  transferBids?: TransferBid[]
  reserveLeagueJoined?: boolean
  contractRequests?: ContractRequest[]
  acquisitionOffers?: AcquisitionOffer[]
  retirementRequests?: { playerId: string; age: number }[]
  transferRequests?: { playerId: string; reason: 'playing_time' | 'team_performance' | 'unhappy' }[]
  pendingRenewalDecisions?: string[]
  rosterSubmitted?: boolean
  devProspects?: DevProspect[]
  scoutedProspects?: { prospectId: string; year: number; raceIndex: number }[]
  individualEvents?: IndividualEvent[]
  worldEkidenResult?: WorldEkidenResult
  sponsorOffers?: SponsorOffer[]
  seasonRaceIncome?: number
  chatLogs?: Record<string, ChatMessage[]>
  // 海外リーグの裏進行（プレイヤーの本編レースに同期して1戦ずつ進む）
  foreignStandings?: Record<string, ForeignStanding[]>   // leagueId → 順位表
  foreignRaceIndex?: number                              // 消化した海外マッチデー数
  // 海外リーグの選手ごとの出場記録（playerId → 所属クラブ・今季の出場数・区間賞数・区間順位の合計）。
  // rankSum/rankedRaces は平均区間順位の算出用（後から追加。無い旧データは平均を出さない）。
  // currentSeason に積み、シーズン終了で pastSeasons に乗る（選手詳細の在籍履歴に海外クラブ行として表示）。
  foreignAppearances?: Record<string, { clubId: string; races: number; wins: number; rankSum?: number; rankedRaces?: number }>
  // 国内在籍で今季1度も出走しなかった選手の所属（シーズン終了時に保存）。
  // 在籍履歴は出走記録から行を作るため、これが無いと出なかった年の所属が消える
  zeroAppearances?: { playerId: string; teamId: string; tier: 'main' | 'second' }[]
  eclResult?: EclResult                                  // ECL最終結果（5戦消化後に確定）
  eclRace?: Race                                         // 旧・一発勝負時代のレース（旧セーブ互換のため残す）
  eclCourseId?: string                                   // 旧フィールド（互換のため残す）
  // ECL本体：前年の各リーグ上位2チームが、シーズン中の5戦（4/6/7/9/11月）をポイント制で争う。
  // 初年度は前年成績が無いので開催されない（endSeasonで翌季分を組む）
  eclSeries?: {
    participants: { id: string; name: string; shortName: string; isForeign: boolean; isPlayerTeam: boolean; leagueName: string; colors: { primary: string; secondary: string } }[]
    races: Race[]              // 5戦。resultsが入っていれば消化済み
    raceIndex: number          // 次に走る戦のindex
    points: Record<string, number>   // チームid → 累計ポイント（順位点+区間点）
  }
  expiredNegotiations?: { id: string; playerId: string; playerName: string }[]
  // フリー移籍（移籍金0の接触）の決断結果。left=移籍した/false=残留。確認で消す
  freeTransferNotices?: { id: string; playerId: string; playerName: string; toTeamName: string; left: boolean }[]
  // タップして対応済みの接触中通知のID（通知とバッジから消す。接触自体は裏で進行）
  seenFreeContactIds?: string[]
  // 自チーム選手の退団通知（シーズン切替時の契約満了・FA流出・移籍）。確認で消す
  departureNotices?: { id: string; playerId: string; playerName: string; toTeamName: string; reason: 'transfer' | 'fa' | 'loan'; fee?: number; years?: number }[]
  // 今季の移籍金の累計（財務ページの明細表示用）。売却・指名権売却=収入 / 移籍金での獲得=支出
  transferIncome?: number
  transferSpend?: number
}

// チャットの1発言。playerId 単位で currentSeason.chatLogs に保存し、シーズンをまたぐと（新しい
// currentSeason になるため）自動的にリセットされる。
export type ChatMessage = { from: 'player' | 'gm'; text: string }

export type CollegeRunner = {
  id: string
  name: string
  age: number
  school: string
  schoolType: 'univ' | 'high_school' | 'foreign'
  publicRatings: Partial<Ratings>
  trueRatings: Ratings
  truePotential: number
  scoutingGrade: number
  expectedRound: number
  expectedPick: number
  collegeRaceHistory: { raceId: string; segmentRank: number; timeSeconds: number }[]
  specialty: Specialty
  nationality: Nationality
  scoutedBy: string[]
}

export type DevProspect = {
  id: string
  name: string
  age: number
  origin: string
  nationality: Nationality
  specialty: Specialty
  potential: number
  trueRatings: Ratings
  signingFee: number
  scouted: boolean
}

export type AchievementRarity = 'bronze' | 'silver' | 'gold' | 'legendary'

export type Achievement = {
  id: string
  name: string
  desc: string
  earnedAtYear: number
  earnedAtRace?: string
  rarity: AchievementRarity
}

export type SegmentRecord = {
  playerName: string
  teamShort: string
  playerId?: string  // 旧セーブの記録には無い。表示側は名前からのフォールバック解決をする
  teamId?: string
  timeSec: number
  year: number
}

// 移籍の成立記録。fee=0 のときは kind で区別（free=フリー移籍 / trade=トレード）。
// years は移籍時に結んだ契約年数（不明なら省略）。date は 'YYYY-MM-DD'（成立日、あれば表示）
export type TransferRecord = {
  year: number
  date?: string
  playerId: string
  fromTeamId: string
  toTeamId: string
  fee: number
  kind?: 'free' | 'trade'
  years?: number
}

// 記録会の種目キー（eventBests と同じ）
export type EventDistKey = 'd5000' | 'd10000' | 'half' | 'marathon'
// 種目別の歴代最高記録（世界記録/日本記録）。名前を焼き込み、選手データが消えても記録は残る
export type EventTimeRecord = { playerId: string; playerName: string; timeSec: number; year: number }
// 年度別の表彰（MVP・新人王）。6レース以上出場かつ平均区間順位が最良の選手。
// 新人王はその年のドラフト指名選手が対象（6戦該当ゼロなら3戦に緩和、それでもゼロなら該当なし）
export type SeasonAward = {
  year: number
  mvpId?: string
  mvpName?: string
  mvpAvgRank?: number
  rookieId?: string
  rookieName?: string
  rookieAvgRank?: number
}

export type GameState = {
  playerTeamId: string
  currentSeason: Season
  pastSeasons: Season[]
  teams: Team[]
  players: Player[]
  growthReport: { year: number; entries: GrowthEntry[] } | null
  seasonBudgetNotice?: { year: number; budget: number } | null  // シーズン終了で確定した来期予算（ホームで一度だけポップ表示）
  saveTimestamp: string
  version: string
  rivalTeamId: string | null
  gmRep: number
  sponsors: Sponsor[]
  foreignLeagues: ForeignLeague[]
  nationalTeam?: NationalTeam
  trainingCards: TrainingCard[]
  raceDroppedCards: TrainingCard[]
  pendingGifts: Gift[]
  giftGivenVersions: string[]
  raceExpGains?: Record<string, Partial<Record<CardStatKey, number>>>
  // 直近のレースで区間新記録が出た区間×選手（結果画面の「区間新！」バッジ用。次のレースで上書き）
  raceNewSegmentRecords?: { segmentIndex: number; playerId: string }[]
  jewels: number
  achievements?: Achievement[]
  starredOpponents?: string[]
  starredProspects?: string[]
  lastLoginDate?: string
  loginStreak?: number
  totalLoginDays?: number
  lastAdDate?: string
  adsWatchedToday?: number
  segmentRecords?: Record<string, SegmentRecord[]>
  transferHistory?: TransferRecord[]   // 移籍の成立記録（チーム詳細の移籍ページで移籍金・契約期間を表示するため）
  worldRecords?: Partial<Record<EventDistKey, EventTimeRecord>>   // 記録会の種目別 世界記録（全選手の歴代1位）
  japanRecords?: Partial<Record<EventDistKey, EventTimeRecord>>   // 記録会の種目別 日本記録（JPN選手の歴代1位）
  seasonAwards?: SeasonAward[]   // 年度別MVP・新人王（選手プロフィールのパッチ表示用）
  eclHistory?: EclHistoryEntry[]   // ECLの歴代優勝（優勝パッチ・記録室の歴代優勝表示用）
  // 記録会のシーズン別上位記録（歴代優勝ページ用の軽量アーカイブ。記録会全結果はシーズン終了で
  // 破棄されるため、種目別トップ10だけ名前焼き込みで永続する）
  eventSeasonTops?: { year: number; dist: EventDistKey; top: { playerId: string; playerName: string; teamId: string; timeSec: number }[] }[]
  adsRemoved?: boolean   // 買い切り版（広告なし・ログインボーナス常時2倍）を購入済みか
  twitterIntroSeen?: boolean   // 公式Xフォロー案内ポップを一度表示済みか（初回起動のみ表示）
}

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  ace: 'エース',
  mountain_up: '山登り',
  mountain_down: '山下り',
  sprinter: 'スプリンター',
  long: '長距離',
  allrounder: 'オールラウンダー',
  kick: 'スパート型',
  grinder: '粘り型',
}

export const GROWTH_CURVE_LABELS: Record<GrowthCurve, string> = {
  early: '早熟型',
  normal: '標準型',
  late_bloomer: '晩成型',
}

