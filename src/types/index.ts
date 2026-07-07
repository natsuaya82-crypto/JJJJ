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
}

export type TeamRole = 'ace' | 'sub_ace' | 'key_player' | 'rotation' | 'development'

export type ContractRequest = {
  id: string
  playerId: string
  initiatedBy: 'player' | 'gm'
  round: number
  status: 'pending_gm' | 'countered' | 'accepted' | 'rejected'
  demandSalary: number
  demandYears: number
  offerSalary: number
  offerYears: number
  counterSalary?: number
  counterYears?: number
  offerContractType?: 'standard' | 'development' | 'dual'
  offerTeamRole?: TeamRole
}

// 他チーム選手（視察）・FA選手への獲得オファー交渉。チャットで交渉する。
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
  ratings: Ratings
  specialty: Specialty
  potential: number
  growthCurve: GrowthCurve
  teamId: string
  rosterTier: RosterTier
  dualRegistered?: boolean
  injuredUntilRace?: number   // race index until player is available (injury system)
  segmentPBs?: SegmentPB[]   // personal best times per terrain profile
  contract: {
    yearsLeft: number
    annualSalary: number
    faEligibleYear: number
    contractType?: 'standard' | 'development' | 'dual'
    bonusClauses?: BonusClause[]
  }
  nationality: Nationality
  origin: string
  acquiredRaceIndex?: number  // 移籍/トレードで加入したレース番号。加入後2戦は出走不可の判定に使う
  joinedYear?: number         // このチームに加入したシーズン年。当該シーズン中は「NEW」表示
  renewalLockedUntilYear?: number  // 更新交渉を最終拒否 → この年まで自チームは更新オファー不可
  transferListed?: boolean    // 「移籍を認める」で移籍リスト入り（他チームのオファー対象・シーズン内に決まらなければFA）
  // レンタル移籍：ownerTeamId が保有元、teamId は現在プレー中（借り手）。untilYear シーズン終了で自動返却。
  loan?: { ownerTeamId: string; untilYear: number }
  loanTeamYears?: { year: number; teamId: string }[]  // 在籍履歴用：その年そのチームでレンタル出場した記録（今後のシーズンから蓄積）
  eventBests?: Partial<Record<'d5000' | 'd10000' | 'half' | 'marathon', { timeSec: number; year: number }>>  // 記録会の種目別自己ベスト
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
  results?: IndividualEventResult[]
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
  isPlayerControlled: boolean
  gmName: string
  sponsors?: string[]            // Sponsor IDs
  facilities?: Facilities
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
}

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
  timeSec: number
  year: number
}

export type GameState = {
  playerTeamId: string
  currentSeason: Season
  pastSeasons: Season[]
  teams: Team[]
  players: Player[]
  growthReport: { year: number; entries: GrowthEntry[] } | null
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
  adsRemoved?: boolean   // 買い切り版（広告なし・ログインボーナス常時2倍）を購入済みか
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

