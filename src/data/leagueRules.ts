import type { LeagueId } from '../types'

// ============================================================================
// リーグの決まり（リーグの違いはここだけに書く）。表は `data/leagues` の WORLD_LEAGUES も使う。
//
// ★**コードに「国内なら」「海外なら」を書かず、そのリーグの決まりを引くこと。**
//
// ■この表を data/leagues から分けている理由
//   data/leagues は海外180クラブの初期データ（data/foreignLeagues）を読み込むので、
//   `utils/league` がそちらを import すると、引いた先にクラブのデータが丸ごと乗る
//   （当時のレート戦の Edge Function で実測 65KB → 110KB。ランクマッチは 2026-09-26 に削除）。
// ============================================================================

/** そのリーグの決まり */
export type LeagueRules = {
  /** 部の入れ替え（昇格・降格）がある */
  promotion: boolean
  /** クラブの格が順位で動く（オーナー・2026-08-18「格はもう動かさない。国内だけ動かす」） */
  tierMoves: boolean
  /** ドラフトに参加する（指名されなかった候補はFAになるので、ほかのリーグはそこから拾う） */
  draft: boolean
  /**
   * ドラフトの指名権を持つ（持てる）。ドラフトに参加するリーグと、昇格してそこへ上がる
   * リーグのクラブ。**持てないクラブへは指名権を渡せない**（トレードの中身に入れない）
   */
  draftPicks: boolean
  /**
   * **どの記録会に出るか**（`data/races` の `TIME_TRIALS` の `circuits` と突き合わせる）。
   * 日本のリーグのクラブは日本の記録会、海外リーグのクラブは海外の記録会を走る
   *（オーナー・2026-09-25）。両方の印が付いた記録会は全員が走る
   */
  timeTrials: TimeTrialCircuit
  /**
   * **日程の手本にするリーグ。** null＝部ごとに抽選（日本の部。`data/races` の `drawSeasonSchedules`）。
   * 海外9リーグは日本1部と同じ10日・同じコースの並びを走る（オーナー・2026-09-25。
   * 組むのは `engine/leagueDay` の `withCopiedSchedules`）
   */
  scheduleFrom: LeagueId | null
  /**
   * **毎年の新しい選手の入口**（`engine/playerGenerator`）。
   *   'draft'   … ドラフトで獲る（日本1部）
   *   'youth'   … 1クラブ2人・ドラフト外の帯（日本2部・3部。オーナー・2026-08-16）＝`refreshDomesticYouth`
   *   'refresh' … 23歳以下が3人を割ったら足す・26人まで（海外9）＝`refreshForeignLeagues`
   * どれとも別に、開幕の直前の床（`fillRostersForSeason`）は232クラブ全部に効く
   */
  newcomers: Newcomers
  /**
   * **選手の国籍の配り方**（`engine/playerGenerator`）。外国籍の国はどちらも `utils/nationTier` の
   * `drawNationalityForRank`（席の強さから国の格で引く）1本で、違うのは自国の人が座るかだけ。
   *   'home'  … 自国中心。外国籍は1クラブ5〜6人（日本の部。オーナー・2026-09-26）
   *   'world' … クラブの所在国と関係なく、全部の席を国の格で引く（海外9）
   */
  rosterNationality: RosterNationality
}

/** 選手の国籍の配り方 */
export type RosterNationality = 'home' | 'world'

/** 毎年の新しい選手の入口の種類 */
export type Newcomers = 'draft' | 'youth' | 'refresh'

/** 記録会の系統。記録会ごとに「どの系統のクラブが出るか」を持つ */
export type TimeTrialCircuit = 'japan' | 'overseas'

/** 決まりを持つリーグ。**ここに無いリーグ（海外9）は全部 false**（記録会は海外の系統） */
const RULES: Readonly<Record<LeagueId, LeagueRules>> = {
  'jpel-1': { promotion: true, tierMoves: true, draft: true, draftPicks: true, timeTrials: 'japan', scheduleFrom: null, newcomers: 'draft', rosterNationality: 'home' },
  'jpel-2': { promotion: true, tierMoves: true, draft: false, draftPicks: true, timeTrials: 'japan', scheduleFrom: null, newcomers: 'youth', rosterNationality: 'home' },
  'jpel-3': { promotion: true, tierMoves: true, draft: false, draftPicks: true, timeTrials: 'japan', scheduleFrom: null, newcomers: 'youth', rosterNationality: 'home' },
}
const NO_RULES: LeagueRules = {
  promotion: false, tierMoves: false, draft: false, draftPicks: false, timeTrials: 'overseas',
  scheduleFrom: 'jpel-1', newcomers: 'refresh', rosterNationality: 'world',
}

/** そのリーグの決まり。知らないリーグは何も無い */
export function leagueRules(leagueId: LeagueId | null | undefined): LeagueRules {
  return (leagueId != null ? RULES[leagueId] : undefined) ?? NO_RULES
}

/** そのクラブは指名権を持てるか（トレードの画面と、成立させる側が同じここを見る） */
export function holdsDraftPicks(club: { leagueId?: LeagueId } | null | undefined): boolean {
  return leagueRules(club?.leagueId).draftPicks
}
