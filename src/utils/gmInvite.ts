import type { ForeignLeague, Player, Season, Team } from '../types'
import { appraiseMove, isSurplus, type Appraisal, type Destination } from './transferDecision'
import { allTieredClubs, tierOfPlayerClub } from './clubTier'
import { comparePlayers } from './playerSort'
import { perfOf, transferFeeFor } from './playerUtils'
import { playRateOf } from './playRate'

// ============================================================================
// **退任するとき1人だけ連れて行く：その選手が頷くか、の唯一の決まり。**
//
// ★判定は移籍とまったく同じ `appraiseMove` 1本で、変わるのは**愛着の向き先だけ**
//   （`followGm`：クラブへの愛着 -0.15 → 監督への愛着 +0.15）。
//   **「監督への信頼」のような2本目の物差しを作らないこと。**
// ★移籍金もふつうの移籍と同じ（`transferFeeFor` 1本）。新しいクラブが払う。
//
// ■なぜ関数に出したか
//   声をかけたその場でチャットで返事をもらう形になったので、
//   **「聞くとき」と「実際に動かすとき」の2か所**から同じ答えが要る。
//   ここに1本置いて両方が呼ぶ。呼ぶ側で判定を書かないこと
//   （書いた瞬間に「チャットでは頷いたのに移らない」が起きる）。
// ============================================================================

export type GmInviteVerdict =
  | { ok: true; fee: number }
  /**
   * 断られた。
   * ★`lead`（一番効いた要素）を返すのが要点。**文面ではなく判断を渡す**ので、
   *   チャットの言い回しは `utils/chatLines` 側で組み立てられる。
   *   `reason` / `shortReason` は移籍と同じ第三者の説明（一覧・ニュース向け）。
   */
  | { ok: false; fee: number; lead: Appraisal['lead']; reason: string; shortReason: string }
  /** 移籍金が足りない。本人は断っていない */
  | { ok: false; fee: number; lead: 'fee'; reason: string; shortReason: string }

export type GmInviteCtx = {
  players: Player[]
  teams: Team[]
  foreignLeagues?: ForeignLeague[]
  currentSeason: Season
  /** いま指揮しているクラブ（声をかける側） */
  fromTeamId: string
  /** 行き先を組み立てる（store の destinationOf をそのまま渡す） */
  destinationOf: (teamId: string, player: Player) => Destination
}

/**
 * **移籍金だけ。**（`appraiseGmInvite` の中でも使う）
 *
 * 実際に動かすとき（`applyGmMove`）は**返事を聞き直さない**——声をかけたのは
 * 今季、動くのは来季の入れ替わりのときで、そのあいだに年を取り名簿も変わるので、
 * 聞き直すと「ついて行きます」と言った選手が来なくなる（実測で12人中4人）。
 * 頷いたかどうかは声をかけた時点の答えが正で、ここでは金額だけ引き直す。
 */
export function gmInviteFeeFor(ctx: GmInviteCtx, playerId: string): number | null {
  const p = ctx.players.find(x => x.id === playerId)
  if (!p || p.status !== 'active') return null
  // ★声をかけたあと、入れ替わるまでに**契約が切れて無所属になっている**ことがある。
  //   それでも約束は約束なので連れて行く。出す側が居ないので移籍金は0
  //   （実測：12人に声をかけると1人がここに落ちて、置き去りになっていた）
  if (p.teamId === '') return 0
  if (p.teamId !== ctx.fromTeamId) return null
  const { teamRaces: ranRaces } = playRateOf(
    p.id, ctx.fromTeamId, ctx.currentSeason, ctx.teams, ctx.foreignLeagues)
  const oldRoster = ctx.players
    .filter(x => x.teamId === ctx.fromTeamId && x.status === 'active')
    .sort(comparePlayers('ovr'))
  const surplus = isSurplus({ squadRank: oldRoster.findIndex(x => x.id === p.id) + 1 })
  return transferFeeFor(p, surplus, perfOf(ctx.currentSeason, p.id, ranRaces))
}

/** その選手が監督について行くか。声をかけられない相手（他クラブ・引退等）は null */
export function appraiseGmInvite(ctx: GmInviteCtx, playerId: string, destTeamId: string): GmInviteVerdict | null {
  const p = ctx.players.find(x => x.id === playerId)
  if (!p || p.teamId !== ctx.fromTeamId || p.status !== 'active') return null

  const tieredClubs = allTieredClubs(ctx.teams, ctx.foreignLeagues ?? [])
  // ★出場率は「そのクラブが走っている日程」で数える（utils/playRate の1本）
  const { fraction, teamRaces: ranRaces } = playRateOf(
    p.id, ctx.fromTeamId, ctx.currentSeason, ctx.teams, ctx.foreignLeagues)
  const a = appraiseMove(p, ctx.destinationOf(destTeamId, p), {
    srcTier: tierOfPlayerClub(ctx.fromTeamId, tieredClubs),
    playFraction: fraction, teamRaces: ranRaces,
    followGm: true })

  const fee = gmInviteFeeFor(ctx, playerId) ?? 0

  if (!a.ok) return { ok: false, fee, lead: a.lead, reason: a.reason, shortReason: a.shortReason }
  // 払えなければ連れて行けない。**聞く前にここまで見る**ので、
  // 「ついて行きます」と言われたのに移らない、が起きない
  const destBudget = ctx.teams.find(t => t.id === destTeamId)?.finance.budget ?? 0
  if (destBudget < fee) {
    return { ok: false, fee, lead: 'fee', reason: `${p.name}の移籍金を用意できませんでした`, shortReason: '移籍金が用意できない' }
  }
  return { ok: true, fee }
}
