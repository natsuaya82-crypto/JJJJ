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

import type { Player } from '../types'
import { ovr } from './playerUtils'
import { belongsToClub } from './rosterSync'
import { isDeclining } from '../engine/ageCurve'
import { TIER_POTENTIAL_CAP, type ClubTier } from './clubTier'

/** 駅伝で実際に走れる人数。ここに入れるかどうかが「出られるか」の境目 */
export const RUNNING_SLOTS = 7

/** 承諾ライン。これ以上で行く */
export const CONSENT_LINE = 0.5

/**
 * 1人の選手に同時に来る買い取り打診の上限。
 * 良い選手は複数クラブで取り合いになるのが普通なので、1件ずつ来る形はやめた。
 * 5件並べて本人に「どこへ行きたいか」を聞く（rankOffers）
 */
export const MAX_OFFERS_PER_PLAYER = 5

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
  lead: 'tier_up' | 'tier_down' | 'playing_time' | 'no_playing_time' | 'title' | 'ecl' | 'capped' | 'loyalty' | 'even'
  reason: string
  parts: {
    tier: number
    playingTime: number
    benched: number
    title: number
    ecl: number
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
  opts?: { inEcl?: boolean; leagueRank?: number; leagueSize?: number; player?: Player },
): Destination {
  const roster = players.filter(p => belongsToClub(p, clubId))
  const squadSize = roster.length
  const myOvr = opts?.player ? ovr(opts.player) : 0
  // 自分より上手い選手が何人いるか＋1＝その クラブでの番手
  const squadRank = opts?.player ? roster.filter(p => ovr(p) > myOvr).length + 1 : Math.ceil(squadSize / 2)
  return {
    clubId, tier, squadRank, squadSize,
    inEcl: !!opts?.inEcl,
    leagueRank: opts?.leagueRank,
    leagueSize: opts?.leagueSize,
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

  const score = tier + playingTime + benched + title + ecl + capped + personality + morale + bonus
  const ok = score >= CONSENT_LINE
  const parts = { tier, playingTime, benched, title, ecl, capped, personality, morale, bonus }
  // 断ったときは「何が足を引っ張ったか」、行くときは「何に惹かれたか」を出す。
  // 同じ順番で見ると、格下でもエース格で行く選手の理由が「格下だが受け入れる」になってしまう
  const lead: Appraisal['lead'] = ok
    ? (playingTime >= 0.14 ? 'playing_time'
      : capped > 0 ? 'capped'
      : ecl > 0 ? 'ecl'
      : title > 0 ? 'title'
      : gap > 0 ? 'tier_up'
      : gap < 0 ? 'tier_down'
      : 'even')
    : (playingTime <= -0.16 ? 'no_playing_time'
      : gap < 0 && tier < 0.45 ? 'tier_down'
      : personality <= -0.15 ? 'loyalty'
      : 'even')

  const REASON_NO: Record<Appraisal['lead'], string> = {
    no_playing_time: `${p.name}は「${d.squadRank}番手では出番がない」と考えている`,
    tier_down: `${p.name}は格下への移籍に前向きでない`,
    loyalty: `${p.name}は今のチームへの愛着が強く移籍を望んでいない`,
    playing_time: `${p.name}は移籍に納得していない`,
    capped: `${p.name}は移籍に納得していない`,
    ecl: `${p.name}は移籍に納得していない`,
    title: `${p.name}は移籍に納得していない`,
    tier_up: `${p.name}は移籍に納得していない`,
    even: `${p.name}は移籍に納得していない`,
  }
  const REASON_YES: Record<Appraisal['lead'], string> = {
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
  return { score, ok, lead, reason: ok ? REASON_YES[lead] : REASON_NO[lead], parts }
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
