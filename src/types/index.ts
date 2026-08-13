export type Specialty = 'ace' | 'mountain_up' | 'mountain_down' | 'undulating' | 'sprinter' | 'long' | 'allrounder' | 'kick' | 'grinder'
export type GrowthCurve = 'early' | 'normal' | 'late_bloomer'
// 海外挑戦の希望地域。リーグとの対応は utils/transferDecision の REGION_BY_LEAGUE 1本
// （満たしたか＝regionOfLeague／声が掛かるか＝leaguesOfRegion。両方向とも同じ表から引く）
export type OverseasRegion = 'africa' | 'europe' | 'america'

export type Nationality =
  // 東アジア
  | 'JPN' | 'KOR' | 'CHN' | 'TWN' | 'HKG' | 'MGL'
  // 東南アジア
  | 'THA' | 'VIE' | 'INA' | 'MAS' | 'PHI' | 'SGP'
  // 南アジア・中央アジア
  | 'IND' | 'SRI' | 'NEP' | 'KAZ'
  // 西アジア
  | 'BRN' | 'QAT' | 'KSA'
  // オセアニア
  | 'AUS' | 'NZL'
  // アフリカ
  | 'ETH' | 'KEN' | 'UGA' | 'TAN' | 'MAR' | 'ERI' | 'RSA'
  | 'RWA' | 'BDI' | 'ALG' | 'SOM' | 'DJI' | 'SDN' | 'TUN' | 'ZIM' | 'NGA'
  // ヨーロッパ
  | 'GBR' | 'GER' | 'FRA' | 'ITA' | 'ESP' | 'NED' | 'SWE' | 'DEN' | 'AUT' | 'POR'
  | 'NOR' | 'BEL' | 'SUI' | 'POL' | 'IRL' | 'FIN'
  // アメリカ大陸
  | 'USA' | 'CAN' | 'MEX' | 'BRA' | 'COL' | 'ARG' | 'ECU' | 'PER' | 'CHI' | 'URU' | 'VEN'
  | 'GUA' | 'BOL' | 'CRC' | 'CUB' | 'JAM'
export type ForeignCategory = 'domestic' | 'asian' | 'foreign'
export type PlayerStatus = 'active' | 'injured' | 'retired' | 'draft_eligible'
export type SeasonPhase = 'preseason' | 'regular' | 'postseason' | 'draft' | 'free_agency'

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
  /** 競り上げられて逆提示になったときの相手クラブ名（1回だけ上乗せの機会を出す） */
  outbidBy?: string
  /** すでに一度競り上げを受けたか。2回目は上乗せの機会なしで決着する */
  outbidOnce?: boolean
  /**
   * いま同じ選手を狙っている他クラブの数。**数だけ**を持つ（クラブ名は出さない）。
   * 名前まで出すと「この5クラブを避ければいい」という読み合いになって競売にならない。
   */
  rivalCount?: number
}

// 交渉が流れた理由の種類。通知の文言はこの1つから出す（種類ごとに箱を増やさない）
//  bid          = こちらが出した入札が流れた（費用合意の放置・主力ガード）→ 来季まで交渉できない
//  offer        = 他クラブから来た獲得オファーを放置して失効した       → 来季まで交渉できない
//  contract     = 契約更新の話し合いが期限切れになった                 → 交渉禁止にはならない
//  trade        = トレードの打診が、そのあとの状況の変化で飲めなくなった
//  trade_unfair = トレードの打診が、今の評価では釣り合わなくなった
export type ExpiredNegKind = 'bid' | 'outbid' | 'offer' | 'contract' | 'trade' | 'trade_unfair' | 'sale_refused' | 'sale_roster_min'

// 通知に出す1件ぶん。押し込む場所が4箇所あるので形はここ1つで決める
// detail は「その回だけの一言」。入っていれば kind ごとの定型文の代わりに出す
// （競り負けの「◯◯が◯億で上回りました」のように、相手と金額が毎回変わるもの）
export type ExpiredNegotiation = { id: string; playerId: string; playerName: string; kind?: ExpiredNegKind; detail?: string }

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
  // team_refused=主力で放出拒否, low_offer=条件不足, demotion=2軍契約を拒否,
  // not_convinced=金額ではなく行き先の問題（appraiseMove が通らない）
  rejectReason?: 'team_refused' | 'low_offer' | 'demotion' | 'not_convinced'
  // ★rivalCount は置かない。獲得オファー（FA・引き抜き）は**その場で決まる**ので、
  //   取り合いも待ち時間も無い。数だけ持って会話に出していたので、
  //   「17クラブから話が来ています。決着まで3レースお待ちください」と言った次の行で
  //   その場で加入が成立していた。持たせるなら先に仕組みを作ること
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
  saleRefused?: Record<string, number>  // クラブID → 本人がそのクラブへの移籍を断った年。同じクラブは今季もう打診してこない
                                        // （全クラブを止めると「格下は蹴って、あとから来る格上へ行く」ができなくなる）
  retirementDeclinedYear?: number  // 引退を引き留めた年。その年は引退希望を再抽選しない
  pendingRetirementYear?: number   // 引退を承認した年。今季限りで引退（実際の引退処理は endSeason で行う）
  overseasListed?: OverseasRegion  // 海外挑戦を承認済み。希望地域の1部リーグから優先的にオファーが来る
  overseasDeniedYear?: number      // 海外挑戦を引き留めた年。その年は再直訴しない
  overseasDeniedCount?: number     // 引き留め回数。2回目以降はモラール低下が大きい
  transferRequestDismissedYear?: number  // 移籍希望に「残ってほしい」で対応した年。その年は再抽選しない
  faSinceYear?: number        // 無所属(FA)になったシーズン年。2季続けて無所属なら整理（引退/削除）される
  wasPlayerTeam?: boolean     // 一度でも自チームに所属したことがある印。長期整理で絶対に削除しないための目印
  retiredYear?: number        // 引退したシーズン年（選手詳細の「XXXX年引退」表示用。旧セーブは未設定）
  retiredTeamId?: string      // 引退した時に所属していたチーム/クラブのID。引退すると teamId は '' になるため、
                              // これが無いと「国内の選手か海外クラブの選手か」が後から判別できない。
                              // 記録室の通算区間賞・通算MVP・記録会歴代（国内限定）の絞り込みに使う
  finalOvr?: number           // 引退時のOVR。引退選手は能力値そのものを消してセーブを軽くするので、
                              // 歴代ドラフト・移籍履歴で出す総合値だけこの1項目で残す
  potentialBoosts?: Partial<Record<CardStatKey, number>>  // ジュエルの上限解放で能力別上限に加算する値
  customCaps?: Ratings  // マイプレイヤー作成で明示指定した能力別成長上限（あれば getStatPotentials はこれを使う）
  customFace?: { style: number; eye: number; hair: 'black_light' | 'black_dark' | 'brown_light' | 'blond_light'; flip: boolean }  // マイプレイヤーの手動指定顔
  isMyPlayer?: boolean  // アップデート記念のマイプレイヤー（作成した自作選手）
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
  // 通算成績。totalRaces / segmentWins / mvpAwards はセーブに書かず、読み込み時に
  // 保存してあるレース結果から数え直して入れる（utils/careerStats.ts）。
  // championships（優勝回数）だけはシーズン終了時点の在籍で決まりレース結果から戻せないので保存する。
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

/**
 * 順位表の1行。**国内も海外も同じ型**（キーは teamId）。
 *
 * もとは国内 SeasonStanding（teamId）と海外 ForeignStanding（clubId）に割れていた。
 * 中身は同じなのにキー名だけが違うので、読む側は必ず if (isForeign) を書かされ、
 * チーム詳細だけで6か所が二重になっていた（2部の首位が9位と出る類のバグの温床）。
 * 海外クラブも「クラブID」ではなく teamId に入れる（Team と ForeignClub を
 * 1つの型にしたのと同じ理由：地域はただの項目で、扱いを分けない）。
 */
export type SeasonStanding = {
  teamId: string
  totalPoints: number
  raceResults: { raceId: string; rank: number; points: number }[]
  /**
   * 順位ぶんと区間賞ぶんの内訳。**国内だけ**（区間賞は国内のレースにしかない）。
   * 合計は totalPoints にあるので、読む側はふつうそちらを見る。
   */
  leaguePoints?: number
  segmentPoints?: number
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

export type WECRacePlan = {
  /**
   * 使うコースの名前。**世界選手権も本編と同じコースを走る**（utils/worldCourses.ts）。
   * 以前は毎年その場でランダムに区間を作っていたので、同じコースが二度と来ず、
   * 区間記録が1年で使い捨てになっていた。
   * 無い年（この仕組みより前のセーブ）は、これまでどおり年つきの名前で出す。
   */
  courseName?: string
  segments: { distanceKm: number; uphillPct: number; downhillPct: number }[]
}

/**
 * 海外クラブ。**中身は Team と同じ形**（Team を参照）。
 * 国内でしか埋まっていない項目は任意にしてあるが、置き場所は同じなので
 * 予算も施設も監督名も、埋めればそのまま国内と同じ決まりが効く。
 * 新しく「海外用の◯◯」を作らないこと。
 */
export type ForeignClub = Partial<Omit<Team, 'id' | 'name' | 'shortName' | 'colors' | 'leagueId' | 'country'>> & {
  id: string
  name: string
  shortName: string
  leagueId: string
  country: Nationality
  colors: { primary: string; secondary: string }
  /**
   * そのクラブの格。国内チーム（Team.tier）とまったく同じ扱いで、毎年のリーグ順位で動く。
   * 未設定なら data/clubTiers.ts の初期値が読まれる（読むときは必ず tierOf を通すこと）。
   * 将来ここのクラブを指揮することがあるので、国内と別扱いにしないこと。
   */
  tier?: import('../utils/clubTier').ClubTier
  // 所属選手はクラブ側では持たない。player.teamId が唯一の持ち場（国内チームと同じ扱い）。
  // 一覧が要るときは utils/rosterSync の clubMemberIds() で引く
}

export type ForeignLeague = {
  id: string
  name: string
  country: Nationality
  countryName: string
  clubs: ForeignClub[]
}

// 海外リーグの順位表（1クラブぶん）。currentSeason.foreignStandings に leagueId 単位で保持。
/**
 * 海外リーグの順位表の1行。**国内とまったく同じ型**（別名として残してあるだけ）。
 * v39 より前のセーブは行のキーが clubId なので、読むときは
 * utils/clubStanding.ts を通すこと（そこで teamId に均す）。
 */
export type ForeignStanding = SeasonStanding

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

// ECLの歴代優勝。セーブには持たず、保存してあるECLのレース結果から数え直す（utils/eclHistory.ts）
export type EclHistoryEntry = {
  year: number
  championId: string
  winnerPlayerIds: string[]
  mvpPlayerId?: string   // ECL MVP（パッチ付与用）
}

// 世界選手権トーナメント（予選＝アジア＋オセアニア約20カ国／本番＝20カ国）。駅伝3戦は simulateRace の実レース。
export type WorldTournamentParticipant = {
  id: string                 // `nat_JPN` 形式
  nat: Nationality
  name: string
  shortName: string
  colors: { primary: string; secondary: string }
  isPlayerTeam: boolean      // 日本＝プレイヤーが采配
}
export type WorldTournament = {
  year: number
  kind: 'qualifier' | 'main'
  host?: Nationality
  participants: WorldTournamentParticipant[]
  squads: Record<string, string[]>   // participantId → 駅伝代表20人
  races: Race[]                      // 3戦（消化後は results 入り）
  raceIndex: number
  points: Record<string, number>     // participantId → 累計ポイント
  individuals?: import('../engine/worldAthletics').WAIndividualResult[]  // 本番のみ（大会開始時に確定）
  individualsSeen?: boolean          // 個人種目の代表発表を見たか（本番のみ）
  individualsRevealed?: number       // 結果発表済みの個人種目数（駅伝N戦後にN種目目を発表するインターリーブ進行用）
  continentals?: import('../engine/worldAthletics').ContinentalQualResult[]  // 予選年に裏で開催した大陸予選（欧州・アフリカ・アメリカ）。代表パッチの元
  japanIn: boolean
  finished: boolean
}

/** リーグの部。1が最上位 */
export type Division = 1 | 2 | 3

/** 選手の階級。到達点（ポテンシャル）の目安で、今の強さそのものではない。
 *  実際のOVRは（ランク・年齢・成長型）の3つで決まる（engine/ageCurve.ts） */
export type Rank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS'

// クラブの型。**国内と海外で分けません。**
//
// ■なぜ1つにするのか（実際に起きたこと）
//   もとは Team（20項目）と ForeignClub（7項目）の2つに割れていた。
//   海外クラブには finance / facilities / gmName など12項目が無いので、
//   それを必要とするルールは共通の関数を呼べず、**その場で海外用の偽物を作る**しかなかった。
//     ・年間予算 … リーグ別の基準額 × 順位 × クラブIDのハッシュ（格を見ていない）
//     ・施設    … クラブIDのハッシュ（保存も成長もしない飾り）
//     ・創設年・監督名 … クラブIDのハッシュ
//     ・移籍資金 … 置き場所が無いので処理のたびに満タンに戻る
//   同じ種類のバグが何度も出たのはこれが原因。**入れ物を揃えれば偽物を作る理由が消える。**
//
// ■違うのは地域だけ
//   `leagueId` と `country` が「どこのクラブか」。それ以外の扱いは同じ。
//   国内は leagueId='jpel' / country='JPN'。
export type Team = {
  id: string
  name: string
  shortName: string
  /** 所属リーグ。国内は 'jpel'、海外は data/foreignLeagues の ID。**唯一の地域の違い** */
  leagueId?: string
  /** クラブの国。国内は 'JPN' */
  country?: Nationality
  city: string
  region: string
  founded: number
  colors: { primary: string; secondary: string }
  logoId?: string   // プレイヤーが選んだプリセットロゴ（'logo_01'〜'logo_30'）。設定時はこれを最優先で表示。未設定なら従来のteamId基準ロゴ

  finance: {
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
  /**
   * 所属する部（1部・2部・3部）。
   *
   * 未設定は1部として扱う。build 88 までのセーブには入っていないため、
   * 読む側は必ず divisionOf()（utils/league.ts）を通すこと。
   * ここを直接 team.division と読むと、古いセーブで undefined になって
   * 「どの部にも属さないチーム」が生まれる。
   */
  division?: Division
  /**
   * クラブの格（1が頂点・10が最下層）。年間予算＝初期ロスターの強さを決める。
   * 読む側は必ず tierOf()（utils/clubTier.ts）を通すこと。無ければ initialRank から引く。
   */
  tier?: import('../utils/clubTier').ClubTier
  isPlayerControlled: boolean
  gmName: string
  sponsors?: string[]            // Sponsor IDs
  facilities?: Facilities
  // 記録会のチーム歴代記録（在籍時に出したタイムはチームに永続。選手が抜けても残る）。
  // 距離キーごとに選手ベストを保持（同一選手は最速のみ）。
  // playerName/nationality は表示用に焼き込む（選手データが長期整理で削除されても記録が名前ごと残る）
  eventRecords?: Partial<Record<'d5000' | 'd10000' | 'half' | 'marathon', { playerId: string; playerName?: string; nationality?: Nationality; timeSec: number; year: number }[]>>
  // チームの成績（順位・優勝回数・連続上位）はセーブに持たない。
  // 過去シーズンの順位表から数え直す（utils/teamHistory.ts）
}

export type Segment = {
  index: number
  distanceKm: number
  uphillPct: number    // 0–100, % of segment that is uphill
  downhillPct: number  // 0–100, % that is downhill; flatPct = 100 - uphillPct - downhillPct
  statWeights?: Partial<Record<keyof Ratings, number>>
  // この区間の推奨ポジション。SEASON_2027_RACESとECL_COURSESは全区間に必ず1つ明示している
  // （看板区間という特別扱いはしない）。世界選手権など動的生成の区間は今のところ持たない
  recommended?: Specialty
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
  // ※ 「誰が出るか」はここには持たない。実際に走るのは simulateRace に渡した
  //   lineups のキー（raceEngine.ts）で決まる。かつて participants: string[] があったが
  //   どこからも読まれず、全レースに「20チーム全部」と書いてあるだけの嘘のデータだった。
  //   部（ディビジョン）ごとに出場者を分けるとき、書く場所が2つあると必ずズレるので消した。
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
  /**
   * 部ごとのシーズン日程（data/races.ts の drawSeasonSchedules）。
   * races はこのうち自分の部のぶん。裏で走る他の部はここから自分の日程を引く。
   * 25コースのうちファイナル3本は部ごとに固定、残り22本を3部で取り合う（重複なし）。
   */
  divisionRaces?: Record<number, Race[]>
  /**
   * このシーズンは全大会の走行記録を残してあるか（utils/raceRecord）。
   * 目印が無い年は、記録を残していなかった年＝古い集計で読む。
   * **新しいシーズンから立てる。すでに遊んだ年には後から立てないこと**（記録が存在しないため）
   */
  recordsFull?: boolean
  collegeRaces: Race[]
  draftPool: CollegeRunner[]
  scoutPoints: number
  initialBudget?: number   // そのシーズンの開始予算（固定・収支表示用）。前季endSeasonで確定した来期予算。
  seasonGrant?: number     // そのシーズンのクラブ予算（＝格の年間予算。utils/clubTier.ts の tierBudget）
  // 初期予算がどう決まったかの内訳（前季endSeasonで確定）。2年目以降のみ。財務ページで「何が合わさって初期予算か」を表示。
  budgetBreakdown?: {
    carryover: number    // 昨年繰越（前季末の残高）
    grant: number        // クラブ予算（格の年間予算）
    raceIncome: number   // 区間賞賞金（順位別のレース賞金・観客収入は廃止）
    sponsor: number      // スポンサー収入
    objBonus: number     // 目標達成ボーナス
    expenses: number     // 前季支出（年俸＋運営費＋出来高賞与）。いまは繰越に織り込み済みで常に0
  }
  scoutProspects: Player[]
  /**
   * CPU同士の市場（移籍・トレード・レンタル）を最後に回した基準日（`YYYY-MM-DD`）。
   *
   * **レースの本数ではなく日付で数えます。** 部ごとにレース数が違う（1部10戦・2部8戦・
   * 3部7戦）ので、コマ数で回すと部によって市場の活発さが変わってしまう。
   * 進め方は `engine/cpuOffseason` の `cpuMarketRounds` 1本（21日ずつ進める）。
   * 旧セーブには無いので、初回の日程でその日が入る。
   */
  lastCpuMarketDate?: string
  /**
   * 年間順位表。**部ごとに分けて持つ。**
   *
   * 部が違えばレース数が違う（1部10戦 / 2部8戦 / 3部7戦）ので、勝ち点は部をまたいで
   * 比べられない。1部で毎回8着のチーム（130点）が2部の全勝（128点）より上に来る。
   * 海外リーグを `foreignStandings`（リーグID → 順位表）で分けているのと同じ理由。
   *
   * 以前は全52チームを1本の配列で持ち「表示するときに部で絞る」形にしていた。
   * 読む側10箇所のうち絞っていたのは順位表ページだけで、ホーム・チーム画面・
   * レース結果・記録室・ドラフト順・契約更新が全部混ざったまま動いていた。
   * **1本に戻さないこと。** 絞り忘れができる形そのものが原因だった。
   */
  standings: Record<Division, SeasonStanding[]>
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
  pendingTradeOffers?: AITradeOffer[]
  scoutedOpponents?: { playerId: string; reqAt: number; year: number }[]
  trainingPlan?: string | null
  // ── 旧リザーブ駅伝（build 88 まで）─────────────────────────
  // リザーブ（2軍リーグ）は廃止した。新しく書き込むことはない。
  // 記録室・在籍履歴・区間記録が「過去に走った分」を読むためだけに型を残している。
  // 古いセーブを開いたときにその年の記録が消えて見えるのを避けるため。
  // 新しい下部リーグ（2部・3部）は Season.standings と races の中に部として入るので、
  // ここを再利用しないこと。
  secondTeamRaces?: Race[]
  secondTeamStandings?: { teamId: string; totalPoints: number; raceResults: { raceId: string; rank: number; points: number }[] }[]
  transferListings?: TransferListing[]
  incomingOffers?: IncomingOffer[]
  /**
   * 「譲る」と返事をした話。決着は次のレース（その間に他クラブが上乗せしてくる）。
   * 買う側の入札が1レース待つのと揃える（gameStore の runRace の頭）。
   *
   * ★**選手ごとに1件**。読み書きは `utils/saleAnswer` を必ず通すこと。
   *   以前はシーズンに1件しか持てず（下の pendingSale）、同じレース間に2人ぶん返事をすると
   *   前の返事が丸ごと消えて、決着もせず、チャットにまた承諾ボタンが戻っていた。
   */
  pendingSales?: { offerId: string; playerId: string; atRaceIndex: number }[]
  /** 旧セーブの置き場所（シーズンに1件）。`utils/saleAnswer` が読むときだけ吸収する */
  pendingSale?: { offerId: string; playerId: string; atRaceIndex: number }
  incomingLoanOffers?: IncomingLoanOffer[]
  loanRequests?: LoanRequest[]
  loanResponses?: LoanResponse[]
  tradeNegotiations?: TradeNegotiation[]
  transferBids?: TransferBid[]
  contractRequests?: ContractRequest[]
  acquisitionOffers?: AcquisitionOffer[]
  retirementRequests?: { playerId: string; age: number }[]
  transferRequests?: { playerId: string; reason: 'playing_time' | 'team_performance' | 'unhappy' }[]
  overseasRequests?: { playerId: string; region: OverseasRegion }[]  // 選手からの「海外挑戦したい」直訴（チャット対応）
  pendingRenewalDecisions?: string[]
  rosterSubmitted?: boolean
  devProspects?: DevProspect[]
  scoutedProspects?: { prospectId: string; year: number; raceIndex: number }[]
  individualEvents?: IndividualEvent[]
  sponsorOffers?: SponsorOffer[]
  seasonRaceIncome?: number
  // クラブID→今季の区間賞賞金の累計。自チームもCPUも同じように積む（翌季の予算に入る）
  seasonSegPrize?: Record<string, number>
  // 退団予定にしたのに行き先が決まらなかった選手。GMが「FAで出す／残留させる」を選ぶまでロスターに残る。
  // 以前はシーズン終了時に問答無用で強制FA（移籍金0で流出）だった
  stayOrLeave?: { playerId: string }[]
  chatLogs?: Record<string, ChatMessage[]>
  // 海外リーグの裏進行（プレイヤーの本編レースに同期して1戦ずつ進む）
  foreignStandings?: Record<string, ForeignStanding[]>   // leagueId → 順位表
  foreignRaceIndex?: number                              // 消化した海外マッチデー数
  /**
   * 海外リーグの走行記録。リーグID → そのリーグが走ったレース（結果つき）。
   * 国内の裏の部（divisionRaces）と同じ扱い。**大会で残す／捨てるを分けない。**
   * 以前は結果を捨てて出走数（foreignAppearances）だけ残していたので、
   * 区間タイムも順位も残らず、海外クラブを指揮したときに過去が空になっていた。
   */
  foreignRaces?: Record<string, Race[]>
  /**
   * 大陸予選（欧州・アフリカ・アメリカ）の走行記録。地域の記号 → 走ったレース（結果つき）。
   * 海外リーグ（foreignRaces）・裏の部（divisionRaces）と同じ扱いで、シーズンと一緒に
   * 別ファイルへ書き出される（store/seasonArchive）。
   *
   * **worldAthleticsResults の側に持たせないこと。** あちらは普段のセーブに入りっぱなしなので、
   * 予選年ごとに121KBずつ増え続け、100シーズンで6MBが毎回の書き込みに乗る
   * （過去シーズンを別置きにしたのと同じ問題が世界大会だけで再発する）。
   */
  waRaces?: Record<string, Race[]>
  pendingForeignRestructure?: boolean                    // 旧セーブの海外リーグ大再編を次の年度更新で適用するフラグ
  // 海外リーグの選手ごとの出場記録（playerId → 所属クラブ・今季の出場数・区間賞数・区間順位の合計）。
  // rankSum/rankedRaces は平均区間順位の算出用（後から追加。無い旧データは平均を出さない）。
  // currentSeason に積み、シーズン終了で pastSeasons に乗る（選手詳細の在籍履歴に海外クラブ行として表示）。
  foreignAppearances?: Record<string, { clubId: string; races: number; wins: number; rankSum?: number; rankedRaces?: number }>
  /**
   * 自分の部**以外**（裏で走らせた1部・2部・3部）の出走記録。playerId → 出走数・区間賞。
   * 通算成績は保存してあるレース結果から数え直す（utils/careerStats）ので、
   * 裏の部のレースはどこにも残らず「1部の選手が全員0回出走」になっていた。
   * 海外リーグの foreignAppearances と同じ役割。
   */
  awayAppearances?: Record<string, { races: number; wins: number }>
  // 上の圧縮版。過去シーズンに送るときだけこちらに詰め替えてセーブを軽くする（1季あたり約380KB→約190KB）。
  // 形は「クラブID → 選手ID → [出場, 区間賞, 区間順位の合計, 順位の付いたレース数]」。
  // 読むときは playerUtils の foreignAppsOf() を通すこと（旧セーブの foreignAppearances も同じ形で返る）。
  foreignAppsC?: Record<string, Record<string, [number, number, number, number]>>
  // 国内在籍で今季1度も出走しなかった選手の所属（シーズン終了時に保存）。
  // 在籍履歴は出走記録から行を作るため、これが無いと出なかった年の所属が消える
  zeroAppearances?: { playerId: string; teamId: string }[]
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
  // 期限切れ・打ち切りになった交渉の通知。3種類（入札・獲得オファー・契約更新）が
  // 同じ箱に入るので、文言を出し分けるために種類を持たせる。
  // kind 無し＝古いセーブ。元々この箱は入札ぶんだけだったので 'bid' として扱う
  expiredNegotiations?: ExpiredNegotiation[]
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

// 過去シーズン（pastSeasons）に残す項目。Season から「あとで実際に読む物」だけを抜き出した型。
//
// ■なぜ抜き出すのか
//   以前は Season を丸ごと保存してから要らない物を個別に空にしていたため、Season に項目を足すたび
//   過去シーズンが自動的に太っていった。ここを「残す物だけ書き出す（許可リスト）」に反転させたので、
//   Season に新しい項目を足しても、ここに書き足さない限り過去シーズンには乗らない。
//
// ■項目を増やしたくなったら
//   1. 下の Pick に項目名を足す / 2. gameStore の archiveSeason() の返り値に足す。この2つだけ。
//   （過去に遡って値が入るわけではないので、読む側は undefined を許すこと）
//
// ■消したくなったら
//   Pick から外すと、その項目を読んでいる箇所が全部コンパイルエラーになる。それを潰してから消すこと。
export type ArchivedSeason = Pick<Season,
  | 'year'
  | 'races'                 // 1軍の駅伝結果。記録室・在籍履歴・区間記録の元データ
  | 'divisionRaces'         // 裏の部（自分以外の部）の駅伝結果
  | 'foreignRaces'          // 海外リーグの駅伝結果
  | 'waRaces'               // 大陸予選（欧州・アフリカ・アメリカ）の駅伝結果
  | 'collegeRaces'          // 大学駅伝の結果
  | 'standings'             // 年間順位表。歴代優勝・チーム成績・翌季のクラブの格の元
  | 'secondTeamRaces'       // 旧リザーブ駅伝の結果（build 88 まで。読むだけ）
  | 'secondTeamStandings'   // 旧リザーブの年間順位表（build 88 まで。読むだけ）
  | 'foreignStandings'      // 海外リーグの年間順位表
  | 'foreignRaceIndex'      // その年の海外マッチデー数（出場率の分母）
  | 'foreignAppearances'    // 旧セーブ用。新しく書くのは foreignAppsC のみ（読む側は foreignAppsOf() 経由）
  | 'foreignAppsC'          // 海外リーグの選手別出場記録（圧縮版）
  | 'zeroAppearances'       // 出走ゼロだった年の国内所属。無いと在籍履歴に穴が空く
  | 'eclRace'               // 旧・一発勝負時代のECL（旧セーブ互換）
  | 'eclSeries'             // ECL5戦シリーズ。出走履歴・優勝判定に使う
>

// チャットの1発言。playerId 単位で currentSeason.chatLogs に保存し、シーズンをまたぐと（新しい
// currentSeason になるため）自動的にリセットされる。
// kind は「同じ用件の発言」の目印。文面に残り月数や金額が入る発言は開くたびに文字列が
// 変わるので、文字列で見比べていると同じ用件の催促がログに積み上がっていた。
// kind が付いている発言は、増やさずに文面だけ差し替える。
export type ChatMessage = { from: 'player' | 'gm'; text: string; kind?: string }

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

// 区間記録の1行。セーブには持たず、保存してあるレース結果から毎回数え直す（utils/segmentRecords.ts）。
// 選手名・チーム名は選手IDとチームIDから引くので、ここには持たない
export type SegmentRecord = {
  playerId: string
  teamId: string
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
// coHolders: 同タイムで記録に並んだ共同保持者（タイ記録）。記録が破られたら丸ごと入れ替わる
export type EventTimeRecord = { playerId: string; playerName: string; timeSec: number; year: number; coHolders?: { playerId: string; playerName: string; year: number }[] }
// 年度別の表彰（MVP・新人王）。6レース以上出場かつ平均区間順位が最良の選手。
// 新人王はその年のドラフト指名選手が対象（6戦該当ゼロなら3戦に緩和、それでもゼロなら該当なし）
export type SeasonAward = {
  year: number
  /** どの部の表彰か。1部・2部・3部で別々に選ぶ（部が無い旧データだけ undefined） */
  division?: Division
  mvpId?: string
  mvpName?: string
  mvpAvgRank?: number
  rookieId?: string
  rookieName?: string
  rookieAvgRank?: number
}

// 監督（GM）の在任履歴。1件が「そのチームを何年から何年まで指揮したか」。
// いま指揮しているチームだけ toYear が無い。詳しくは utils/gmTenure.ts
export type GmTenure = {
  teamId: string
  fromYear: number
  toYear?: number
}

// 他チームからの監督オファー。シーズンが終わった直後に1件だけ出て、
// 「行く／行かない」を答えると消える。詳しくは utils/gmOffer.ts
//
// 予算・内訳・スカウトポイント・前季順位を持たせてあるのは、受けたときに
// 移籍先の数字へ丸ごと入れ替えるため。オファーを出す時点でしか分からない値なので
// ここに焼き付けておく（移籍先が持っているものを受け継ぐ、という決めごと）。
/** 退任について行くか、の返事。ok=false なら reason に断り文句が入る */
export type GmInviteResult = { name: string; ok: boolean; reason: string } | null

export type GmOffer = {
  teamId: string
  // 就任するシーズン（＝オファーが出た翌シーズン）
  year: number
  budget: number
  budgetBreakdown: {
    carryover: number
    grant: number
    raceIncome: number
    sponsor: number
    objBonus: number
    expenses: number
  }
  scoutPoints: number
  // 移籍先の前季の最終順位。来季の目標を引き直すのに使う
  prevRank: number
  /** 移籍先の部の人数。来季の目標を引き直すのに使う（52ではない） */
  divisionSize?: number
  /** どういう話で来たオファーか（utils/gmOffer.ts）。古いセーブには無い */
  kind?: 'promotion' | 'rebuild' | 'comeback'
}

/**
 * 殿堂入りチームの1人。**登録した瞬間の選手をそのまま凍らせたコピー**。
 *
 * 本人がその後どうなっても（衰えても・引退しても・他クラブへ移っても）ここは変わらない。
 * OVR87で登録すれば、晩年に82になっても殿堂入りの側は87のまま走る。
 * もう一度登録し直すと、そのときの数値で上書きされる（82で入れ直せる）。
 *
 * 監督が移っても引き継ぐので、いろんなクラブ・いろんな年代の選手が1つのチームに並ぶ。
 */
export type HofPlayer = {
  /** 凍らせた選手そのもの。ID は元の選手と同じ（重複登録の判定に使う） */
  player: Player
  /** 登録した年 */
  year: number
  /** 登録したときの所属クラブ名（表示用。あとで移籍しても変わらない） */
  teamName: string
  /** 登録したときのOVR（並べ替え・表示用。player から再計算しても同じ） */
  ovr: number
}

export type GameState = {
  playerTeamId: string
  currentSeason: Season
  // 終わったシーズンの記録。Season 全部ではなく ArchivedSeason（残す物だけ）で持つ
  pastSeasons: ArchivedSeason[]
  teams: Team[]
  players: Player[]
  growthReport: { year: number; entries: GrowthEntry[] } | null
  seasonBudgetNotice?: { year: number; budget: number } | null  // シーズン終了で確定した来期予算（ホームで一度だけポップ表示）
  saveTimestamp: string
  version: string
  rivalTeamId: string | null
  gmRep: number
  // 監督の在任履歴。無い旧セーブは「最初のシーズンからずっと今のチーム」として扱う
  gmTenures?: GmTenure[]
  // 他チームから届いている監督オファー。答えるまで残る（答えたら null）
  /** 殿堂入りチーム。最大30人。登録時の数値で固定される（utils/hofRoster.ts） */
  hofRoster?: HofPlayer[]
  /**
   * 走行記録を別ファイルへ出し終えた年。**書いて読み戻して一致した年だけが載る。**
   * セーブを書くときは、ここに載っている年の結果だけを落とす（store/seasonArchive.ts）。
   * 載っていない年はセーブに残る（重いほうがまし。消えたら戻せない）。
   */
  archivedYears?: number[]
  /**
   * 届いている監督オファー。**1件でも複数でも同じ形で持つ。**
   * 年に1回ランダムに来るぶんは1件、自分から退任したときは3件まで一度に届く。
   * 別々の入れ物にすると、受ける・断るの処理が2本になって片方だけ直し漏れる。
   */
  gmOffers?: GmOffer[]
  /** 前に監督オファーが出た年。毎年は来ないようにするため（utils/gmOffer.ts の GM_OFFER_COOLDOWN） */
  lastGmOfferYear?: number
  /**
   * **来季から指揮すると決まっているクラブ**（オーナー判断★13・2026-08-12）。
   *
   *   > 次シーズンの開始になるからね（オーナー）
   *
   * 自分から退任して届いた打診を受けると、**その場では何も動かず**ここに入る。
   * 実際に入れ替わるのは `endSeason` が来季を組み立てたあと。
   * **受けたら取り消せない**（★13-a）ので、これが入っている間は
   *   ・退任ボタンを押せない
   *   ・年1回のランダムなオファーも来ない（★13-b。受けられない話を並べない）
   *
   * ★シーズン終わりに向こうから届くオファー（`makeGmOffer`）は、答える時点で
   *   もう来季に入っているので**ここを通らずその場で入れ替わる**。
   *   分けているのは「就任する年」1つだけ（`acceptGmOffer` の `offer.year` と今季の比較）。
   */
  pendingGmMove?: { teamId: string; year: number; inviteId?: string } | null
  /**
   * 退任のときに声をかけた選手の返事（1人だけ）。画面に出したら消す。
   * **判定は移籍と同じ appraiseMove 1本**（愛着の向き先が監督に変わるだけ）
   */
  gmInviteResult?: GmInviteResult
  sponsors: Sponsor[]
  foreignLeagues: ForeignLeague[]
  // 世界選手権の日本駅伝代表（監督が候補50から20人選抜。翌年以降は前年をベースに入替）。
  worldSquad?: { year: number; playerIds: string[] }
  // 世界選手権／予選の年次結果（新しい順に積む）。型はエンジン側で定義。
  worldAthleticsResults?: import('../engine/worldAthletics').WAYearResult[]
  // 進行中の世界選手権トーナメント（予選も本番も駅伝3戦を実レースで走る）。年度更新でリセット。
  worldTournament?: WorldTournament
  // その年の駅伝3戦のコース（選考時に地形を見て選手を選べるよう、大会開始前に確定・公開）。年度更新でリセット。
  worldRacePlans?: { year: number; plans: WECRacePlan[] }
  // 選手ごとの世界選手権 代表出場記録（パッチ・代表履歴の元）。label=種目 or 駅伝。
  worldRepresentatives?: { playerId: string; year: number; nat: Nationality; label: string; rank?: number }[]
  balancePatch?: number   // 一括バランス調整の適用済みバージョン（1=アジア/その他圏の既存海外選手ブースト）
  deficitRescue?: number  // 赤字判定バグの救済適用済みバージョン（1=連続赤字リセット＋残高マイナス補填）
  trainingCards: TrainingCard[]
  raceDroppedCards: TrainingCard[]
  pendingGifts: Gift[]
  giftGivenVersions: string[]
  raceExpGains?: Record<string, Partial<Record<CardStatKey, number>>>
  // 直近のレースで区間新記録が出た区間×選手（結果画面の「区間新！」バッジ用。次のレースで上書き）
  raceNewSegmentRecords?: { segmentIndex: number; playerId: string }[]
  // 直近のレース・シーズン終了で獲得したジュエルの内訳。ホームに戻ったときにポップアップで出す。
  // 結果画面ではヘッダーのジュエル表示自体が隠れていて増減が見えないため、ホーム到達まで持ち越す
  jewelGains?: { label: string; amount: number }[]
  jewels: number
  achievements?: Achievement[]
  starredOpponents?: string[]
  starredProspects?: string[]
  lastLoginDate?: string
  loginStreak?: number
  totalLoginDays?: number
  lastAdDate?: string
  adsWatchedToday?: number
  transferHistory?: TransferRecord[]   // 移籍の成立記録（チーム詳細の移籍ページで移籍金・契約期間を表示するため）
  worldRecords?: Partial<Record<EventDistKey, EventTimeRecord>>   // 記録会の種目別 世界記録（全選手の歴代1位）
  japanRecords?: Partial<Record<EventDistKey, EventTimeRecord>>   // 記録会の種目別 日本記録（JPN選手の歴代1位）
  // ECLの歴代優勝はセーブに持たない。過去シーズンのECLのレース結果から数え直す（utils/eclHistory.ts）
  // 記録会のシーズン別上位記録（歴代優勝ページ用の軽量アーカイブ。記録会全結果はシーズン終了で
  // 破棄されるため、種目別トップ10だけ名前焼き込みで永続する）
  eventSeasonTops?: { year: number; dist: EventDistKey; top: { playerId: string; playerName: string; teamId: string; timeSec: number }[] }[]
  adsRemoved?: boolean   // 買い切り版（広告なし・ログインボーナス常時2倍）を購入済みか
  premiumGreatDate?: string   // 買い切り版「大成功確約 1日1回」を使った日（getAdDay基準＝朝10時区切り）
  twitterIntroSeen?: boolean   // 公式Xフォロー案内ポップを一度表示済みか（初回起動のみ表示）
  myPlayerCreated?: boolean     // アップデート記念のマイプレイヤーを作成済みか（1回きり）
  // 長期整理で削除した選手の「名前・国籍」だけを残す辞書（[名前, 国籍]）。
  // 顔は選手IDと国籍から自動生成しているので、この2つがあれば過去レースの区間配置や
  // 移籍履歴で名前も顔も従来どおり表示できる（開けないのは選手詳細だけ）。
  // 選手データ本体は1人約700Bだがこの辞書は1人約45B。
  removedPlayers?: Record<string, [string, Nationality]>
}

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  ace: 'エース',
  mountain_up: '山登り',
  mountain_down: '山下り',
  undulating: '起伏型',
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

