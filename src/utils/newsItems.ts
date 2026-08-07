// ニュースの見出しを作る唯一の場所。
//
// ■なぜ作ったのか
//   見出しの文面が gameStore に78か所・foreignTransfers に4か所、直書きされていた。
//   そのため
//     ・金額が「万」と「億」で混在（3.2億の移籍が「32000万」と出る見出しがあった）
//     ・部を書く見出しと書かない見出しがある（3部の優勝も1部の優勝も同じ形）
//     ・国内と海外で文面の作りが別（同じ「移籍成立」が3種類あった）
//   という状態になり、文面を直すたびに82か所を探すことになっていた。
//
// ■決まり
//   呼ぶ側は**出来事のデータだけ**渡す。文面・部の表記・金額の書き方はここが決める。
//   新しい見出しを画面や gameStore に直書きしないこと。
//
// ■部の表記
//   クラブ名には必ず部を添える（clubLabel）。国内クラブだけが部を持つので、
//   海外クラブはリーグ名を添える。呼ぶ側が国内・海外を気にしなくてよいのが狙い。

import type { Division, Team } from '../types'
import { divisionOf, DIVISION_LABEL } from './league'
import { fmtYen } from './money'

/** ニュース1件。gameStore の newsFeed に入る形と同じ */
export type NewsItem = {
  date: string
  headline: string
  category: 'trade' | 'draft' | 'college' | 'race' | 'injury' | 'fa' | 'finance'
  relatedIds: string[]
  major?: boolean
  fromTeamId?: string
  toTeamId?: string
}

/** クラブの呼び名。国内は「札幌（2部）」、海外は「ロンドン（欧州西）」 */
export function clubLabel(
  clubId: string,
  teams: readonly Pick<Team, 'id' | 'shortName' | 'division'>[],
  foreign?: { id: string; shortName: string; leagueName?: string },
): string {
  const t = teams.find(x => x.id === clubId)
  if (t) return `${t.shortName}（${DIVISION_LABEL[divisionOf(t)]}）`
  if (foreign) return foreign.leagueName ? `${foreign.shortName}（${foreign.leagueName}）` : foreign.shortName
  return '他クラブ'
}

/** その部の呼び名を頭に付ける（レース・記録・表彰など、クラブではなく大会に添える） */
export function divisionTag(division: Division): string {
  return `［${DIVISION_LABEL[division]}］`
}

/** 移籍の見出し。国内・海外の区別なく同じ形で出す */
export function transferHeadline(a: {
  playerName: string
  playerOvr: number
  fromLabel: string
  toLabel: string
  fee: number
}): string {
  return `${a.toLabel}が${a.fromLabel}から${a.playerName}（OVR${a.playerOvr}）を獲得 移籍金${fmtYen(a.fee)}`
}

/** 出場機会を求めた移籍。何番手だったかを出すと、市場が効いているかが見出しで分かる */
export function seekPlayingTimeHeadline(a: {
  playerName: string
  age: number
  squadRank: number
  fromLabel: string
  toLabel: string
}): string {
  return `${a.playerName}（${a.age}歳・${a.fromLabel}で${a.squadRank}番手）が出場機会を求め${a.toLabel}へ`
}

/** 若手のレンタル。育てる側と走らせる側の関係を出す */
export function loanHeadline(a: {
  playerName: string
  age: number
  ownerLabel: string
  borrowerLabel: string
  years: number
}): string {
  return `${a.ownerLabel}が${a.playerName}（${a.age}歳）を${a.borrowerLabel}へ${a.years}年のレンタル。出場機会を得る`
}

/** レース結果。どの部のレースかを必ず出す */
export function raceResultHeadline(a: {
  division: Division
  raceName: string
  location: string
  winnerName: string
  myRank?: number
}): string {
  const mine = a.myRank && a.myRank > 0 ? `。自チームは${a.myRank}位` : ''
  return `${divisionTag(a.division)}${a.raceName}（${a.location}）：${a.winnerName}が制す${mine}`
}

/** 表彰（MVP・新人王）。部を書かないと1部と3部のMVPが同格に見える */
export function awardHeadline(a: {
  kind: 'mvp' | 'rookie'
  division: Division
  clubShort: string
  playerName: string
}): string {
  const label = a.kind === 'mvp' ? 'シーズンMVP' : '新人王'
  return `【${label}】${divisionTag(a.division)}${a.clubShort}の${a.playerName}が受賞`
}

/** 引退表明 */
export function retirementHeadline(a: {
  division: Division
  clubShort: string
  playerName: string
  age: number
}): string {
  return `【引退表明】${divisionTag(a.division)}${a.clubShort}の${a.playerName}（${a.age}歳）が今季限りでの現役引退を表明`
}

/** 各部の優勝 */
export function divisionChampionHeadline(year: number, division: Division, clubName: string): string {
  return `${year} JPEL${DIVISION_LABEL[division]} 優勝：${clubName}`
}

/**
 * ECLの1戦の結果。ECLは部の外の大会なので部は付けない。
 * 何戦目か・通算何位かを出す（5戦のポイント制なので、途中経過が分からないと追えない）
 */
export function eclRaceHeadline(a: {
  raceNo: number
  totalRaces: number
  raceName: string
  winnerName: string
  myRank?: number
  myTotalRank?: number
}): string {
  const mine = a.myRank && a.myRank > 0
    ? `。自チームは${a.myRank}位${a.myTotalRank && a.myTotalRank > 0 ? `（通算${a.myTotalRank}位）` : ''}`
    : ''
  return `【ECL第${a.raceNo}戦/${a.totalRaces}】${a.raceName}：${a.winnerName}が制す${mine}`
}

/** 世界選手権の本戦の結果 */
export function worldChampHeadline(a: { year: number; eventName: string; winner: string; japanRank?: number }): string {
  const jp = a.japanRank && a.japanRank > 0 ? `。日本は${a.japanRank}位` : ''
  return `【世界選手権】${a.year} ${a.eventName}：${a.winner}が優勝${jp}`
}

/** 日本代表の選出。自チームから選ばれたかは呼ぶ側が major で立てる */
export function nationalCallUpHeadline(a: { year: number; names: string[]; mineCount: number }): string {
  const mine = a.mineCount > 0 ? `（うち自チーム${a.mineCount}名）` : ''
  return `【日本代表】${a.year} 代表に${a.names.length}名が選出${mine}：${a.names.slice(0, 5).join('・')}${a.names.length > 5 ? ' ほか' : ''}`
}

/**
 * 負傷。復帰までは**レース数**で管理しているので、そのままレース数で出す。
 * 以前は同じ数字を「か月」と書いていて、2レース欠場が「全治約2か月」と出ていた。
 */
export function injuryHeadline(a: { playerName: string; injuryName: string; races: number }): string {
  return `${a.playerName}が${a.injuryName}で負傷 — 復帰まで約${a.races}戦`
}

// ── 自チームの出来事 ─────────────────────────────────────────
// 部を書く必要はない（全部自分のクラブの話）が、文面をここでしか変えられなくするために置く。

/** 選手を獲得した（移籍金を払った） */
export function signedWithFeeHeadline(a: { playerName: string; fee: number; salary?: number }): string {
  const sal = a.salary != null ? `・年俸${fmtYen(a.salary)}` : ''
  return `${a.playerName}を移籍金${fmtYen(a.fee)}${sal}で獲得`
}

/** 選手を放出した */
export function soldPlayerHeadline(a: { playerName: string; toLabel: string; fee: number }): string {
  return `${a.playerName}を${a.toLabel}へ移籍金${fmtYen(a.fee)}で放出`
}

/** FA・契約で加入した */
export function joinedHeadline(a: { playerName: string; salary: number; years: number }): string {
  return `${a.playerName}が加入（年俸${fmtYen(a.salary)}・${a.years}年）`
}

/** 契約更新 */
export function renewalHeadline(a: { playerName: string; years: number }): string {
  return `${a.playerName}が${a.years}年契約更新`
}

/** レンタルの出入り */
export function loanInOutHeadline(a: { playerName: string; years: number; dir: 'in' | 'out' }): string {
  return `${a.playerName}を${a.years}シーズンのレンタルで${a.dir === 'in' ? '獲得' : '放出'}`
}

/** 区間賞の賞金 */
export function segmentPrizeHeadline(a: { raceName: string; prize: number; myRank?: number }): string {
  const rank = a.myRank && a.myRank > 0 ? `（${a.myRank}位）` : ''
  return `${a.raceName} 区間賞賞金 +${fmtYen(a.prize)}${rank}`
}

/** 海外へ送り出した。世界最高峰なら特別扱いにする */
export function overseasMoveHeadline(a: { playerName: string; playerOvr: number; clubName: string; fee: number; elite: boolean }): string {
  return a.elite
    ? `【世界へ挑戦】${a.playerName}（OVR${a.playerOvr}）が世界最高峰・${a.clubName}へ移籍！自クラブ育ちの選手が世界の舞台へ（移籍金${fmtYen(a.fee)}）`
    : `${a.playerName}が海外クラブ${a.clubName}へ移籍（移籍金${fmtYen(a.fee)}）`
}
