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
import { divisionOf, DIVISION_LABEL, DIVISION_SIZE } from './league'
import { fmtYen } from './money'
import { formatRaceTime } from './eventTime'

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

/**
 * 海外へ送り出した。行き先の格で3段階に書き分ける。
 *   big    … ビッグクラブ（格2以上）へ＝世界最高峰
 *   stepUp … 自クラブより格上へ＝ステップアップ
 *   どちらでもない … ただの海外移籍
 * ★どのクラブが big / stepUp かは utils/clubTier の `isBigClub` / `isStepUp` 1本。
 *   ここで格の数字を判定しないこと（見出しは文面だけを持つ）。
 */
export function overseasMoveHeadline(a: { playerName: string; playerOvr: number; clubName: string; fee: number; big: boolean; stepUp: boolean }): string {
  if (a.big) return `【世界へ挑戦】${a.playerName}（OVR${a.playerOvr}）が世界最高峰・${a.clubName}へ移籍！自クラブ育ちの選手が世界の舞台へ（移籍金${fmtYen(a.fee)}）`
  if (a.stepUp) return `【ステップアップ】${a.playerName}（OVR${a.playerOvr}）が格上の${a.clubName}へ移籍。より高いレベルへ挑む（移籍金${fmtYen(a.fee)}）`
  return `${a.playerName}が海外クラブ${a.clubName}へ移籍（移籍金${fmtYen(a.fee)}）`
}

/** 海外クラブから獲得した */
export function foreignSignedHeadline(a: { playerName: string; nationality: string; fee: number }): string {
  return `${a.playerName}（${a.nationality}）を海外移籍金${fmtYen(a.fee)}で獲得`
}

/**
 * 日本↔海外の移籍（裏で動いた分）。格上へ行くのか、日本へ来るのかで書き分ける。
 * ★`stepUp` は utils/clubTier の `isStepUp`（行き先の格 < 送り出したクラブの格）で作ること。
 *   以前はここだけ「格1〜4のクラブなら」という絶対の線で、自チームの見出しと基準が違っていた。
 */
export function crossBorderHeadline(a: {
  playerName: string
  playerOvr: number
  fromName: string
  toName: string
  fee: number
  dir: 'in' | 'out'
  stepUp: boolean
}): string {
  if (a.dir === 'in') return `【海外→日本】${a.playerName}（OVR${a.playerOvr}）が${a.fromName}から${a.toName}へ移籍（移籍金${fmtYen(a.fee)}）`
  if (a.stepUp) return `【日本→海外】${a.playerName}（OVR${a.playerOvr}）が格上の${a.toName}へ移籍。世界の舞台で腕試し（移籍金${fmtYen(a.fee)}）`
  return `【日本→海外】${a.playerName}（OVR${a.playerOvr}）が${a.fromName}から${a.toName}へ移籍（移籍金${fmtYen(a.fee)}）`
}

/** 日本人選手が世界最高峰へ渡った。列島が沸くやつ */
export function overseasBreakthroughHeadline(a: { playerName: string; playerOvr: number; toName: string; fee: number }): string {
  return `【世界へ挑戦】${a.playerName}（OVR${a.playerOvr}）が世界最高峰・${a.toName}へ電撃移籍！日本人ランナーの歴史的な挑戦に列島が沸く（移籍金${fmtYen(a.fee)}）`
}

/** 契約満了によるフリー移籍 */
export function freeTransferHeadline(a: { playerName: string; toLabel: string }): string {
  return `${a.playerName}が契約満了に伴い${a.toLabel}へフリー移籍を決断`
}

/** CPUクラブがFA選手と合意した */
export function cpuSignedHeadline(a: { clubShort: string; playerName: string; playerOvr: number }): string {
  return `${a.clubShort}が${a.playerName}（OVR${a.playerOvr}）と契約合意`
}

/** レンタル要請への返事。借りる側から出した打診に対する承諾／拒否 */
export function loanReplyHeadline(a: { ownerLabel: string; playerName: string; years: number; accepted: boolean }): string {
  return a.accepted
    ? `${a.ownerLabel}が${a.playerName}のレンタル要請を承諾。${a.years}年で借用`
    : `${a.ownerLabel}が${a.playerName}のレンタル要請を断った`
}

// ── レース ───────────────────────────────────────────────────
//
// 見出しの「ゆらぎ」（同じ出来事に何通りかの文面）もここに置く。
// 呼ぶ側は 0〜1 の乱数を pick で渡すだけ。文面の数を増やしても呼ぶ側は変わらない。

function variant(list: string[], pick: number): string {
  return list[Math.min(list.length - 1, Math.floor(pick * list.length))]
}

/** そのレースの優勝クラブ */
export function raceWinnerHeadline(a: { division: Division; raceName: string; winnerName: string; points?: number; pick: number }): string {
  const tag = divisionTag(a.division)
  return variant([
    `${tag}${a.raceName}：${a.winnerName}が圧倒的な走りで優勝！`,
    `${tag}${a.raceName}：${a.winnerName}が頂点に立つ`,
    `${tag}${a.raceName} 優勝は${a.winnerName}。完璧なチーム運営が光った`,
    `${tag}${a.raceName}：${a.winnerName}、今季${a.points ?? 0}pt獲得で圧勝`,
  ], a.pick)
}

/** 自チームの着順。順位帯で語り口を変える */
export function myFinishHeadline(a: { division: Division; raceName: string; rank: number; rankSuffix: string; pick: number }): string {
  const tag = divisionTag(a.division)
  const list = a.rank === 1
    ? [`${tag}${a.raceName} — 自チームが優勝！完璧な作戦が結実`, `${tag}${a.raceName} 優勝。チーム全員の力を証明した`]
    : a.rank <= 3
    ? [`${tag}${a.raceName} — 自チームは${a.rankSuffix}。表彰台確保`, `${tag}${a.raceName} ${a.rankSuffix}フィニッシュ。確かな進歩を示した`]
    : a.rank <= 8
    ? [`${tag}${a.raceName} — ${a.rankSuffix}フィニッシュ。上位との差を縮めたい`, `${tag}${a.raceName} ${a.rankSuffix}。課題は明確、次戦に向け修正を`]
    : [`${tag}${a.raceName} — ${a.rankSuffix}。改善点を洗い出し立て直しが必要`, `${tag}${a.raceName} ${a.rankSuffix}フィニッシュ。厳しい現実と向き合う時`]
  return variant(list, a.pick)
}

/** 自チームの選手が区間賞を取った */
export function segmentWinHeadline(a: { playerName: string; segmentIndex: number; pick: number }): string {
  return variant([
    `${a.playerName}が第${a.segmentIndex}区で区間賞`,
    `区間賞：第${a.segmentIndex}区で${a.playerName}が最速タイムをマーク`,
    `${a.playerName}、第${a.segmentIndex}区区間賞。今後の起用に期待`,
  ], a.pick)
}

/** フロントからの評価（数戦ごと） */
export function boardEvalHeadline(a: { rank: number; remainingRaces: number; satisfied: boolean; pick: number }): string {
  const list = a.satisfied
    ? [
        `フロント評価：シーズン途中で${a.rank}位。フロントは現状に満足している`,
        `フロント：「現在${a.rank}位は期待通り。このペースを維持してほしい」`,
        `経営陣評価：${a.rank}位と好調。残り${a.remainingRaces}戦もこの調子で`,
      ]
    : [
        `フロント評価：現在${a.rank}位。フロントは成績に不満を示している`,
        `経営陣から警告：「${a.rank}位は容認できない。残り${a.remainingRaces}戦での巻き返しを求める」`,
        `フロント：「順位${a.rank}位は期待を大きく下回る。戦略の見直しが必要だ」`,
      ]
  return variant(list, a.pick)
}

/** ライバルとの直接対決 */
export function rivalHeadline(a: { rivalShort: string; myRank: number; rivalRank: number }): string {
  return a.myRank < a.rivalRank
    ? `ライバル${a.rivalShort}に勝利！（自${a.myRank}位 vs ${a.rivalRank}位）`
    : `ライバル${a.rivalShort}に敗北（自${a.myRank}位 vs ${a.rivalRank}位）`
}

/**
 * 区間新記録。国内リーグは部を付け、ECLは部の外なので付けない。
 * 以前は同じ文面が国内用とECL用に2つコピーされていて、片方だけ部が付いていた。
 */
export function segmentRecordHeadline(a: {
  division?: Division
  raceName: string
  segmentIndex: number
  playerName: string
  clubShort: string
  timeSec: number
  prevTimeSec: number
  mine: boolean
}): string {
  const tag = a.division ? divisionTag(a.division) : ''
  return `【区間新記録】${tag}${a.raceName} 第${a.segmentIndex}区 ${a.playerName}（${a.clubShort}）`
    + `${formatRaceTime(a.timeSec)}（従来 ${formatRaceTime(a.prevTimeSec)}）${a.mine ? ' ★自チーム' : ''}`
}

/** ECLの年間王者（全5戦を終えて） */
export function eclSeasonEndHeadline(a: { won: boolean; championName: string; myRank: number }): string {
  return a.won
    ? '【世界一】ECL最終戦を終え、自チームが年間王者に！世界の頂点に立つ'
    : `ECL：全5戦を終え${a.championName}が年間王者に${a.myRank > 0 ? `。自チームは総合${a.myRank}位` : ''}`
}

// ── 世界選手権・記録 ─────────────────────────────────────────

/**
 * 距離の呼び名。以前は同じ画面の中で 21097 が「ハーフ」と「ハーフマラソン」に割れていた。
 */
export function distanceLabel(distance: number): string {
  if (distance === 5000) return '5000m'
  if (distance === 10000) return '10000m'
  if (distance === 42195) return 'マラソン'
  return 'ハーフマラソン'
}

/** 世界選手権での自チーム選手の成績 */
export function worldChampFinishHeadline(a: { eventName: string; playerName: string; distance: number; rank: number; timeSec: number }): string {
  return `${a.eventName}：${a.playerName}が${distanceLabel(a.distance)}で${a.rank}位（${formatRaceTime(a.timeSec)}）`
}

/** 世界記録・日本記録の更新／タイ。共同保持もここで書き分ける */
export function recordHeadline(a: {
  scope: 'world' | 'japan'
  tie: boolean
  distance: number
  playerName: string
  timeSec: number
  coHolder?: boolean
}): string {
  const label = a.scope === 'world' ? (a.tie ? '世界タイ記録' : '世界新記録') : (a.tie ? '日本タイ記録' : '日本新記録')
  const co = a.coHolder ? '（同タイムで共同保持）' : ''
  return `【${label}】${distanceLabel(a.distance)} ${a.playerName} ${formatRaceTime(a.timeSec)}${co}`
}

/** 世界選手権の大陸予選の閉幕。通過国を地域ごとに並べる */
export function continentalQualifierHeadline(a: { regions: readonly { region: string; nations: readonly string[] }[] }): string {
  const body = a.regions
    .map(c => `${c.region.replace('アメリカ大陸', 'アメリカ')}: ${c.nations.join('・')}`)
    .join(' ／ ')
  return `世界選手権 大陸予選が閉幕 — ${body} が本戦へ`
}

// ── シーズンの節目 ───────────────────────────────────────────

/** 昇格・降格 */
export function divisionMoveHeadline(a: { clubName: string; from: Division; to: Division }): string {
  return `${a.clubName} ${DIVISION_LABEL[a.from]}→${DIVISION_LABEL[a.to]} ${a.to < a.from ? '昇格' : '降格'}`
}

/** シーズン開幕 */
export function seasonOpenHeadline(year: number, raceCount: number): string {
  return `${year}シーズン開幕！全${raceCount}戦のスケジュール決定`
}

/** 2部・3部の発足（古いセーブを52クラブへ補完したとき） */
export function divisionsFoundedHeadline(added: number, total: number): string {
  return `JPEL 2部・3部が発足。${added}クラブが加わり全${total}クラブに`
}

/** まとめて契約満了 */
export function massFreeAgentHeadline(count: number): string {
  return `${count}名の選手が契約満了でFA市場へ`
}

/** 大きく伸びた選手 */
export function growthHeadline(a: { playerName: string; specialtyLabel: string; gain: number }): string {
  return `${a.playerName}（${a.specialtyLabel}）が大きく成長 OVR +${a.gain}`
}

/** 引退の発表（シーズン終了時。シーズン中の「引退表明」は retirementHeadline） */
export function retiredHeadline(a: { playerName: string; age: number; segmentWins: number }): string {
  return `${a.playerName}（${a.age}歳）が現役引退を発表 — 通算区間賞${a.segmentWins}回`
}

/** 出来高ボーナスの支払い */
export function bonusPayoutHeadline(a: { playerName: string; kind: 'champion' | 'segment_win' | 'mvp'; amount: number; count?: number }): string {
  const label = a.kind === 'champion' ? '優勝ボーナス発動'
    : a.kind === 'mvp' ? 'MVPボーナス発動'
    : `区間賞ボーナス×${a.count ?? 1}回`
  return `${a.playerName} ${label} +${fmtYen(a.amount)}`
}

/** スポンサー契約の満了 */
export function sponsorEndHeadline(a: { sponsorName: string; met: boolean; targetDesc?: string }): string {
  return a.met
    ? `${a.sponsorName}との契約満了 — 目標達成、更新オファーが届いた`
    : `${a.sponsorName}との契約打ち切り — 目標未達（${a.targetDesc ?? '条件未達'}）`
}

/** 目標達成の報酬 */
export function objectiveBonusHeadline(a: { points: number; budget: number }): string {
  return `目標達成ボーナス：スカウトPt+${a.points}・予算+${fmtYen(a.budget)}`
}

/** 来季予算の確定 */
export function seasonBudgetHeadline(a: { year: number; finalRank: number; budget: number; prize: number; sponsor: number }): string {
  return `${a.year}シーズン最終順位${a.finalRank}位 — 来季予算${fmtYen(a.budget)}確定（賞金${fmtYen(a.prize)}・スポンサー${fmtYen(a.sponsor)}含む）`
}

/** 指名権の売却（自分の意思で売った） */
export function draftPickSoldHeadline(a: { fromShort: string; toShort: string; year: number; round: number; price: number }): string {
  return `${a.fromShort}が${a.year}年${a.round}巡目指名権を${a.toShort}へ売却（${fmtYen(a.price)}）`
}

/** 連続赤字で指名権を取り上げられた */
export function deficitPickPenaltyHeadline(a: { streak: number; year: number; round: number; buyerShort: string; price: number }): string {
  return `【赤字ペナルティ】${a.streak}年連続赤字により、${a.year}年ドラフト${a.round}巡目指名権が${a.buyerShort}へ売却されました（${fmtYen(a.price)}が予算に補填）`
}

/** 赤字判定の不具合を直したときのお知らせ（セーブの移行時に1回だけ出る） */
export function deficitRescueHeadline(parts: readonly string[]): string {
  return `【不具合修正】赤字判定の不具合により補強禁止が解除されない問題を修正しました（${parts.join('・')}）。以後は「単年営業収支」が黒字になれば解除されます`
}

// ── トレード ─────────────────────────────────────────────────

/** 相手から持ちかけられたトレードの成立 */
export function tradeAcceptedHeadline(fromLabel: string): string {
  return `${fromLabel}とのトレード成立`
}

/** 自分から出したトレードの成立。何を出して何を取ったかを並べる */
export function tradeSummaryHeadline(a: {
  gave: readonly string[]
  got: readonly string[]
  /** 正なら受け取り、負なら支払い（呼ぶ側の符号のまま渡す） */
  fee: number
  withPicks: boolean
}): string {
  const feeNote = a.fee > 0 ? ` (+${fmtYen(a.fee)})` : a.fee < 0 ? ` (受取${fmtYen(-a.fee)})` : ''
  return `トレード成立：${a.gave.join('・')} ↔ ${a.got.join('・')}${feeNote}${a.withPicks ? ' [指名権含む]' : ''}`
}

// ── 王朝（監督個人の通算成績の節目）──────────────────────────
//
// 以前は endSeason の中に条件と文面が10行ぶん直に書かれていた。
// 「何回目で何を出すか」もここ1本にまとめる。

export function dynastyHeadlines(a: {
  finalRank: number
  championships: number
  seasons: number
  currentStreak: number
  division: Division
  /** 今季を終えた時点の自チーム通算区間賞 */
  segWinsAfter: number
  /** 今季を始める前の自チーム通算区間賞 */
  segWinsBefore: number
}): string[] {
  const out: string[] = []
  if (a.finalRank === 1) {
    if (a.championships === 1) out.push('【フランチャイズ初優勝】新たな歴史の始まり — このチームの伝説が刻まれた')
    else if (a.championships === 3) out.push('【強豪の証】通算3度目の優勝達成 — リーグに名を轟かせる')
    else if (a.championships === 5) out.push('【名門チーム】5回の頂点 — 歴史に刻まれた王朝の誕生')
    else if (a.championships === 10) out.push('【黄金王朝】10回の制覇 — このチームは時代を超えた伝説となった')
    if (a.currentStreak === 3) out.push('【3連覇達成】誰もこのチームを止められない')
    if (a.currentStreak === 5) out.push('【5連覇の怪物王朝】リーグの歴史を塗り替えた')
  }
  // 「5年やって下位のまま」。下位の基準は自分の部の中で見る（3部を52で割らない）
  if (a.seasons === 5 && a.finalRank > DIVISION_SIZE[a.division] - 3) {
    out.push('【再建の岐路】5年でタイトルなし — チームの方向性を見直す時')
  }
  // 今季のあいだに50回を跨いだときだけ
  if (a.segWinsAfter >= 50 && a.segWinsBefore < 50) {
    out.push('【通算区間賞50回突破】このチームの走者たちが歴史に名を刻む')
  }
  return out
}

/** 新規セーブの最初のニュース */
export function initialNews(): NewsItem[] {
  return [
    { date: '2027-03-01', headline: 'JPELドラフト完了！各球団が新体制でシーズン準備へ', category: 'draft', relatedIds: [] },
    { date: '2027-03-05', headline: '出雲開幕戦まであと10日——各球団の仕上がりは？', category: 'race', relatedIds: [] },
    { date: '2027-03-08', headline: '第1回JPEL開幕直前！注目のルーキーたちを紹介', category: 'draft', relatedIds: [] },
  ]
}

/**
 * 取り合いになっていることを伝える一言。**数だけ**で、クラブ名は出さない。
 * 名前まで出すと「この5クラブを避ければいい」という読み合いになって競売にならない。
 * 0件のときは何も言わない（undefined）。
 *
 * 数え方は `utils/transferRivals` の `rivalClubsFor` 1本で、中身は
 * 「そのクラブに必要か（needsPlayer）」「そこで走れるか（wouldMakeLineup）」
 * 「本人が行く気になるか（appraiseMove）」。**FAでも移籍金つきでも同じ**。
 *
 * ★言っていいのは、その数のクラブが実際に動くときだけ。
 *   以前は「決着まで3レースお待ちください」と書いてあったが、そんな待ち方をする処理は
 *   どこにも無く、獲得オファーはその場で合否が出ていた。さらに**シーズン中はCPUクラブが
 *   FAを1人も獲らなかった**ので、17クラブという数字も動いていなかった。
 *   いまはシーズン中もクラブがFAを獲る（gameStore の pickCpuFreeAgents／phase:'inseason'）ので、
 *   もたつけば先に契約される。だから「早く決めないと持っていかれる」が本当になった。
 */
export function rivalCountLine(count: number | undefined): string | undefined {
  if (!count || count <= 0) return undefined
  return `（代理人）いま他に${count}クラブが動いています。決まらないうちに他所と契約するかもしれません。`
}
