// 移籍の意思決定の唯一の場所。
//
// ■ 何を決めるか
//   「その選手が、そのクラブへ行くことに納得するか」だけ。
//   クラブ同士が金で合意するかは別（data/economy.ts の入札まわり）。
//
// ■ なぜ1本にするのか
//   同意の判定は、買う側（入札→契約交渉）・売る側（オファー承諾・逆提示・売出の自動買取）・
//   トレード・CPU間の引き抜き・FA接触、と6つの入口がある。ここが入口ごとに違うと、
//   「自チームが買うときだけ本人に聞く」「売るときは聞かない」のような非対称が生まれる。
//   実際そうなっていた。入口が増えても判断の本体はこのファイル1つにする。
//
// ■ 何を見るか（オーナーの指定）
//   移籍は「そこで出られるか」と「格上でやりたいか」で基本が決まる。
//   それに「優勝したい」「ECLに出たい」が乗る。
//
//     1. 格差          … 行き先が今より格上か。格上なら基本断らない
//     2. 行き先での序列 … そのクラブで何番手になるか。4大リーグでも2年ベンチなら行かない
//     3. 今の出場機会   … 今のクラブで干されているほど動きたがる
//     4. 優勝           … 行き先が上位争いをしているか
//     5. ECL           … 行き先が今季ECLに出ているか
//
//   出場機会を求めて格下へ落ちる（ステップダウン）も、2と3で自然に成立する。
//
// ■ 断らない側に寄せてある
//   以前は性格(loyalty)が格上への移籍まで潰していて、2段上のクラブでも1/4が断っていた。
//   性格は「同格・格下のときだけ」効かせる。格上の話を愛着で蹴るのは、移籍の絵として不自然。

import type { OverseasRegion, Player } from '../types'
import { ovr } from './playerUtils'
import { belongsToClub } from './rosterSync'
import { isDeclining } from '../engine/ageCurve'
import { TIER_POTENTIAL_CAP, type ClubTier } from './clubTier'
import { RUNNING_SLOTS } from '../data/rosterRules'
// 「そのクラブで何番手か」は squadNeeds の1本
import { squadRankOf } from './squadNeeds'

/**
 * 憧れの地域は選手のタイプで決まる。持久系→アフリカ高地／スピード系→ヨーロッパのトラック／
 * 山・万能→北米南米。**保存しない**（タイプから毎回同じ答えが出るので持つ必要がない）。
 * 海外挑戦の直訴（gameStore の overseasRequests）の行き先もここを見る。
 */
export function dreamRegionOf(specialty: Player['specialty']): OverseasRegion {
  return (specialty === 'long' || specialty === 'grinder') ? 'africa'
    : (specialty === 'sprinter' || specialty === 'kick' || specialty === 'ace') ? 'europe'
    : 'america'
}

/** 憧れの地域の呼び方。会話にそのまま出す */
export const DREAM_LABEL: Record<OverseasRegion, string> = {
  africa: 'アフリカ', europe: 'ヨーロッパ', america: '北米・南米',
}

// 走れる人数は data/rosterRules.ts の1本。ここは今までどおり使えるように通すだけ
export { RUNNING_SLOTS } from '../data/rosterRules'

/**
 * 「そのクラブでは出番が無い」と言える序列。**国内も海外もこの1本で判定する。**
 *
 * 走れるのは区間数ぶん（コースは6〜10区間）。故障者が出れば少し下まで回ってくるので、
 * 「ほぼ出ない」と言えるのは**走れる人数の2倍**より下。7区間なら15番手以降。
 * 11番手のような直書きを各所に置かないこと。
 */
export function hasNoPlayingTime(squadRank: number, slots: number = RUNNING_SLOTS): boolean {
  return squadRank > slots * 2
}

// ── 誰が市場に出るか（供給の唯一の決まり）─────────────────────
//
// ■なぜ要るのか
//   「序列から落ちた人は移籍する」だけにすると、ロスター30人のクラブは毎年
//   下半分（15人以上）がまるごと市場に出る。1クラブ23人が動く計算になり、市場が壊れる。
//   実際に出ていくのは「走れていたのに走れなくなった」人で、かつ待っていられない人だけ。
//
// ■3つの条件（全部満たしたときだけ出る）
//   1. 序列が届いていない            … hasNoPlayingTime
//   2. 実際に走れていない            … 今季の出走率が APPEARANCE_FLOOR 未満
//   3. 待っていられない              … SEEK_MIN_AGE 以上。若手は残ってレンタルで出番を作る
//
// ■「落ちた」か「続いている」か
//   去年は走れていたのに今季走れなくなった（＝スタメンを失った）人は、その年に動く。
//   もともと走れていない人は、若いうちは伸びしろに賭けて残り、SEEK_PATIENCE_AGE を超えたら動く。

/** 「走れている」と言える出走率。今季これを下回ると出番が無い扱い */
export const APPEARANCE_FLOOR = 0.34
/** これ未満は移籍せず残る（出番はレンタルで作る） */
export const SEEK_MIN_AGE = 24
/** もともと控えの選手が「もう待てない」と判断する年齢 */
export const SEEK_PATIENCE_AGE = 27

export function seeksPlayingTime(a: {
  /** そのクラブでの序列（1が最上位） */
  squadRank: number
  age: number
  /** 今季の出走数とチームのレース数 */
  races: number
  teamRaces: number
  /** 前季の出走数とチームのレース数。分からなければ省略 */
  prevRaces?: number
  prevTeamRaces?: number
  /** 走れる区間数（コースによって6〜10） */
  slots?: number
}): boolean {
  if (!hasNoPlayingTime(a.squadRank, a.slots)) return false
  if (a.age < SEEK_MIN_AGE) return false
  const rate = a.teamRaces > 0 ? a.races / a.teamRaces : 0
  if (rate >= APPEARANCE_FLOOR) return false
  // 前季が分からない（加入1年目・古いセーブ）なら今季だけで判断する
  if (a.prevRaces == null || !a.prevTeamRaces) return true
  const prevRate = a.prevRaces / a.prevTeamRaces
  // 去年は走れていた＝スタメンを失った年。すぐ動く
  if (prevRate >= APPEARANCE_FLOOR) return true
  // もともと控え。伸びしろに賭けられる年齢のうちは残る
  return a.age >= SEEK_PATIENCE_AGE
}

/** 承諾ライン。これ以上で行く */
export const CONSENT_LINE = 0.5

/**
 * 1人の選手に同時に来る買い取り打診の上限。
 * 良い選手は複数クラブで取り合いになるのが普通なので、1件ずつ来る形はやめた。
 * 5件並べて本人に「どこへ行きたいか」を聞く（rankOffers）
 */
export const MAX_OFFERS_PER_PLAYER = 5

/**
 * リーグID → 憧れの地域。
 * 「OVR90でヨーロッパへ行きたいのにアジアへ移籍する」を止めるための対応表。
 * 海外挑戦の直訴（overseasRequests）が使っている3区分と同じもの。
 * 国内リーグ（leagueId 無し）は地域を持たない＝憧れの判定の対象外。
 */
export function regionOfLeague(leagueId: string | undefined): OverseasRegion | undefined {
  switch (leagueId) {
    case 'africa_east': case 'africa_ns': return 'africa'
    case 'europe_ws': case 'europe_ne': return 'europe'
    case 'north_america': case 'central_america': case 'south_america': return 'america'
    default: return undefined   // アジア・オセアニア・国内は「憧れの地域」に該当しない
  }
}

/** 行き先クラブの姿。呼び出し側は buildDestination で作る */
export type Destination = {
  clubId: string
  tier: ClubTier
  /** そのクラブに入ったとき、OVR順で何番手になるか（1が最上位） */
  squadRank: number
  /** そのクラブの在籍人数 */
  squadSize: number
  /** 今季ECLに出ているクラブか */
  inEcl: boolean
  /** 行き先の順位（1が首位）。分からなければ undefined */
  leagueRank?: number
  /** 行き先のリーグのチーム数 */
  leagueSize?: number
  /** 海外クラブか。国内移籍には「憧れの地域」が効かない */
  isForeign?: boolean
  /**
   * 行き先の地域。憧れの3区分（アフリカ／ヨーロッパ／北米南米）に当たるときだけ入る。
   * アジア・オセアニアは誰の憧れでもないので undefined＝「憧れではない海外」になる
   */
  region?: OverseasRegion
}

/** 今の状況 */
export type MoveContext = {
  /** 今の所属クラブの格。無所属(FA)は undefined */
  srcTier?: ClubTier
  /** 今のクラブでの出場割合 0..1 */
  playFraction?: number
  /** 今季の消化レース数。0なら出場データ無しとして扱う */
  teamRaces?: number
  /** 交渉ボーナス（スカウト施設・年俸の上積みなど） */
  bonus?: number
  /**
   * クラブ間で移籍金が合意済みの公認移籍。
   * 売る判断はクラブが済ませているので「主力だから残りたい」の減点は働かない
   */
  clubBlessed?: boolean
}

/** 判定の内訳。画面と会話でそのまま使う */
export type Appraisal = {
  score: number
  ok: boolean
  /** 一番効いた要素。断った理由・選んだ理由の文言はこれで決める */
  lead: 'tier_up' | 'tier_down' | 'playing_time' | 'no_playing_time' | 'title' | 'ecl' | 'dream' | 'wrong_region' | 'capped' | 'loyalty' | 'even'
  reason: string
  /** 一覧で1行ずつ並べるときの短い理由（選手名を繰り返さない） */
  shortReason: string
  parts: {
    tier: number
    playingTime: number
    benched: number
    title: number
    ecl: number
    dreamFit: number
    capped: number
    personality: number
    morale: number
    bonus: number
  }
}

/** そのクラブに入ったときの序列と姿を作る */
export function buildDestination(
  clubId: string,
  tier: ClubTier,
  players: readonly Player[],
  opts?: { inEcl?: boolean; leagueRank?: number; leagueSize?: number; isForeign?: boolean; region?: OverseasRegion; player?: Player },
): Destination {
  const roster = players.filter(p => belongsToClub(p, clubId))
  const squadSize = roster.length
  // 何番手になるかの数え方は squadNeeds の squadRankOf 1本（FAを取るかの判断と同じ物差し）
  const squadRank = opts?.player ? squadRankOf(roster, opts.player) : Math.ceil(squadSize / 2)
  return {
    clubId, tier, squadRank, squadSize,
    inEcl: !!opts?.inEcl,
    leagueRank: opts?.leagueRank,
    leagueSize: opts?.leagueSize,
    isForeign: opts?.isForeign,
    region: opts?.region,
  }
}

/**
 * 「そこで出られるか」の点数。
 * 走れるのは7区間なので、7番手までに入るなら主力、そこから離れるほど出番が無い。
 * 4大リーグから声が掛かっても20番手なら行かない、が成立する。
 */
function playingTimeScore(d: Destination): number {
  if (d.squadRank <= 3) return 0.22           // エース格
  if (d.squadRank <= RUNNING_SLOTS) return 0.14
  if (d.squadRank <= RUNNING_SLOTS + 3) return 0    // 当落線上
  if (d.squadRank <= RUNNING_SLOTS + 8) return -0.16
  return -0.28                                 // 何年も出番が無い
}

/**
 * その選手がその移籍をどう見るか。**移籍の可否を出すところは必ずここを通すこと。**
 */
export function appraiseMove(p: Player, d: Destination, ctx: MoveContext = {}): Appraisal {
  const declining = isDeclining(p.growthCurve ?? 'normal', p.age)

  // 1. 格差。行き先が格上なら基本は行く（0.65〜0.90）。同格0.50。格下は落ちる
  const gap = (ctx.srcTier ?? d.tier) - d.tier
  let tier = gap > 0
    ? 0.65 + Math.min(0.25, gap * 0.03)
    : gap === 0 ? 0.50 : 0.50 + gap * 0.04
  // ピークを過ぎた選手は格へのこだわりが薄れる（残りのキャリアで走れる場所を選ぶ）
  if (declining) tier = 0.5 + (tier - 0.5) * 0.6

  // 2. 行き先で出られるか
  const playingTime = playingTimeScore(d)

  // 3. 今のクラブで干されているか。
  //    ★行き先でも出られないなら効かない。「出たいから動く」のであって、
  //      別のベンチへ移りたいわけではない（格上でも20番手なら行かない、が保たれる）
  const races = ctx.teamRaces ?? 0
  const frac = ctx.playFraction ?? 0.5
  const benched = races >= 3 && frac < 0.4 && playingTime > 0 ? 0.2 : 0

  // 4. 優勝争いをしているクラブか
  const title = d.leagueRank != null && d.leagueRank <= 3 ? 0.08 : 0

  // 5. ECLに出ているクラブか
  const ecl = d.inEcl ? 0.1 : 0

  // 6. 憧れの地域か。海外へ出るときだけ効く。
  //    「OVR90でヨーロッパに行きたいのにアジアへ移籍する」を止める。
  //    憧れの地域なら後押し、別の地域の海外クラブなら渋る。国内移籍には効かない
  //    アジア・オセアニアは誰の憧れでもないので、海外なのに憧れの地域でない＝減点になる。
  //    「OVR90でヨーロッパに行きたいのにアジアへ移籍」がこれで止まる。
  //    減点は-0.22から-0.12へ。-0.22だと「格上(+0.90)＋控え(-0.16)＋地域違い(-0.22)」が
  //    0.47で同意ラインを割り、3部の選手が格上の海外を断っていた
  const dream = dreamRegionOf(p.specialty)
  const dreamFit = !d.isForeign ? 0 : d.region === dream ? 0.12 : -0.12

  // 今のクラブの成長上限に達していて、行き先の上限が高い＝ここではもう伸びない
  const capped = ctx.srcTier != null && !declining
    && ovr(p) >= TIER_POTENTIAL_CAP[ctx.srcTier] - 1
    && TIER_POTENTIAL_CAP[d.tier] > TIER_POTENTIAL_CAP[ctx.srcTier]
    ? 0.15 : 0

  // 性格は「同格・格下のとき」だけ効く。格上の話を愛着で蹴らせない
  const personality = gap > 0 ? 0
    : (p.personality ?? 'salary') === 'loyalty' ? -0.15
    : (p.personality ?? 'salary') === 'winning' ? 0.05
    : 0

  const morale = (p.morale ?? 60) < 40 ? 0.1 : (p.morale ?? 60) >= 75 ? -0.05 : 0
  const bonus = ctx.bonus ?? 0

  const score = tier + playingTime + benched + title + ecl + dreamFit + capped + personality + morale + bonus
  const ok = score >= CONSENT_LINE
  const parts = { tier, playingTime, benched, title, ecl, dreamFit, capped, personality, morale, bonus }
  // 見出しにする理由は「一番効いた要素」。行くときは一番の後押し、断るときは一番の足かせ。
  //
  // ★決め打ちの順番で選ばないこと。
  //   以前は ok のとき dreamFit を最初に見ていたので、格上(+0.40)に惹かれて行く選手でも
  //   憧れ(+0.12)が付いていれば必ず「憧れの◯◯で走りたい」になっていた。
  //   行き先で23番手（出番 -0.28）でも見出しは憧れのままなので、
  //   「出番がないのに憧れだから行きたい」という筋の通らない話に見える。
  //
  // 格(tier)だけは0.50が「同格＝素の状態」なので、そこからの差で他と比べる。
  // 生の値で比べると、同格の0.50が常に最大になって全部「格」の話になってしまう。
  const weights: { lead: Appraisal['lead']; v: number }[] = [
    { lead: gap > 0 ? 'tier_up' : gap < 0 ? 'tier_down' : 'even', v: tier - 0.50 },
    { lead: playingTime > 0 ? 'playing_time' : 'no_playing_time', v: playingTime },
    { lead: 'playing_time', v: benched },
    { lead: 'title', v: title },
    { lead: 'ecl', v: ecl },
    { lead: dreamFit >= 0 ? 'dream' : 'wrong_region', v: dreamFit },
    { lead: 'capped', v: capped },
    { lead: personality < 0 ? 'loyalty' : 'even', v: personality },
  ]
  const best = weights.reduce((a, b) => (ok ? b.v > a.v : b.v < a.v) ? b : a)
  // どれも効いていない（横並び）なら「条件は悪くない」で締める
  const lead: Appraisal['lead'] = (ok ? best.v <= 0 : best.v >= 0) ? 'even' : best.lead

  const REASON_NO: Record<Appraisal['lead'], string> = {
    no_playing_time: `${p.name}は「${d.squadRank}番手では出番がない」と考えている`,
    dream: `${p.name}は移籍に納得していない`,
    wrong_region: `${p.name}が挑戦したいのは${DREAM_LABEL[dreamRegionOf(p.specialty)]}で、この地域ではない`,
    tier_down: `${p.name}は格下への移籍に前向きでない`,
    loyalty: `${p.name}は今のチームへの愛着が強く移籍を望んでいない`,
    playing_time: `${p.name}は移籍に納得していない`,
    capped: `${p.name}は移籍に納得していない`,
    ecl: `${p.name}は移籍に納得していない`,
    title: `${p.name}は移籍に納得していない`,
    tier_up: `${p.name}は移籍に納得していない`,
    even: `${p.name}は移籍に納得していない`,
  }
  // 取り合いのときは1行ずつクラブの下に並べるので、選手名を繰り返さない短い形も持つ。
  // 「→ 佐藤 健司は「23番手では出番がない」と考えている」だと、その1クラブの話なのか
  // その選手の全体の話なのかが読み取れなかった
  const SHORT_NO: Record<Appraisal['lead'], string> = {
    no_playing_time: `${d.squadRank}番手で出番がない`,
    wrong_region: `行きたいのは${DREAM_LABEL[dreamRegionOf(p.specialty)]}。この地域ではない`,
    tier_down: '格下への移籍に前向きでない',
    loyalty: '今のチームへの愛着が強い',
    dream: '乗り気ではない',
    playing_time: '乗り気ではない',
    capped: '乗り気ではない',
    ecl: '乗り気ではない',
    title: '乗り気ではない',
    tier_up: '乗り気ではない',
    even: '乗り気ではない',
  }
  const REASON_YES: Record<Appraisal['lead'], string> = {
    dream: `憧れの${DREAM_LABEL[dreamRegionOf(p.specialty)]}で走りたい`,
    wrong_region: '行きたい地域ではない',
    tier_up: '格上のクラブで挑戦したい',
    playing_time: '出場機会が見込める',
    no_playing_time: '出場機会が見込めない',
    tier_down: '格下だが受け入れる',
    loyalty: '今のチームに愛着がある',
    capped: 'このクラブではもう伸びしろがない',
    ecl: 'ECLで走りたい',
    title: '優勝を争えるクラブで走りたい',
    even: '条件は悪くない',
  }
  return { score, ok, lead, reason: ok ? REASON_YES[lead] : REASON_NO[lead], shortReason: ok ? REASON_YES[lead] : SHORT_NO[lead], parts }
}

/**
 * 複数クラブから同時に話が来たときの、本人の希望順。
 * 点数の高い順に並べ、承諾ラインに届いているものだけが「行ってもいい」先。
 */
export function rankOffers(
  p: Player, dests: readonly Destination[], ctx: MoveContext = {},
): { dest: Destination; appraisal: Appraisal }[] {
  return dests
    .map(dest => ({ dest, appraisal: appraiseMove(p, dest, ctx) }))
    .sort((a, b) => b.appraisal.score - a.appraisal.score)
}
