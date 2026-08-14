import type { Player } from '../types'

// ============================================================================
// 「どの選手がどのクラブに居るか」を決める唯一の場所。
// 国内(JPEL)のチームも海外リーグのクラブも、ここでは同じ「クラブ」として同じルールで扱う。
// 国が違うだけで、やっていることは同じリーグだから。
//
// ■なぜ要るのか
//   所属の持ち方が2つあった。
//     (A) 選手側の player.teamId
//     (B) チーム側の team.roster.main（選手IDの一覧）
//   出走メンバー選択・カード練習・人数上限の判定など、ほとんどの画面は (A) を見ているのに、
//   ロスター画面とダッシュボードの注目選手だけが (B) を見ていた。
//   トレードや獲得の処理で (A) だけ更新して (B) を更新し損ねると、
//   「ロスターに出ないのに駅伝には出せる選手」が生まれる。実際にそれが起きていた。
//
// ■方針：**(B) は無くした**
//   player.teamId が唯一の持ち場。クラブ側の名簿は同じ事実の写しでしかなく、
//   写しがある限り「片方だけ更新して食い違う」が起き続ける。
//   毎回組み直す rebuildRosters を置いて誤魔化していたが、
//   組み直す関数が要ること自体が二重に持っている証拠だった。
//   一覧が要るときは下の squadPlayersOf() / squadIdsOf() で player から引く。
//
// ■所属の条件（ここが唯一の定義）。使い分けは2つだけ。
//   belongsToClub … そのクラブでプレーする人。teamId がそのクラブで、引退していない。
//                   レンタルで来ている選手も含む（実際に走るのはそのクラブだから）。
//                   出走メンバー・人数・クラブの選手一覧はこちら。
//   isSquadMember … そのうえで「名簿(team.roster)に並べる人」。レンタル中の選手は除く。
//                   貸し借り中の選手はロスター画面の「レンタル」タブで別に出しているため。
// ============================================================================

// そのクラブでプレーする選手か（国内チーム・海外クラブ共通）
export function belongsToClub(p: Pick<Player, 'teamId' | 'status'>, clubId: string): boolean {
  return p.teamId === clubId && p.status !== 'retired'
}

/**
 * **クラブID → 在籍選手**の索引を1回で作る。
 *
 * ★「クラブごとに `players.filter(...)` する」を**繰り返さないこと**。
 *   232クラブ × 5,800人 を毎回走査すると、1マッチデーで100万回の比較になる。
 *   まとめて回すところ（海外リーグ・裏の部・移籍市場）は必ずこれを通す。
 */
export function playersByClub(players: readonly Player[]): Map<string, Player[]> {
  const byClub = new Map<string, Player[]>()
  for (const p of players) {
    if (p.status === 'retired' || !p.teamId) continue
    const list = byClub.get(p.teamId)
    if (list) list.push(p); else byClub.set(p.teamId, [p])
  }
  return byClub
}

/**
 * `playersByClub` を**同じ配列に対して1回だけ**作って覚えておく版。
 *
 * ★「1人ごとに全選手を走査してそのクラブの名簿を作る」を消すためのもの。
 *   移籍の同意を1件見るたびに 5,800人を走査していました（CPUの4分の1）。
 * ★覚え方は配列そのものを鍵にした WeakMap。**選手の配列を書き換えて使い回さないこと**
 *   （このリポジトリでは選手が動いたら必ず新しい配列を作っている）。
 */
const clubIndexCache = new WeakMap<readonly Player[], { len: number; index: Map<string, Player[]> }>()
export function clubIndexOf(players: readonly Player[]): Map<string, Player[]> {
  const hit = clubIndexCache.get(players)
  if (hit && hit.len === players.length) return hit.index
  const index = playersByClub(players)
  clubIndexCache.set(players, { len: players.length, index })
  return index
}

// そのクラブに所属する選手ID。海外クラブの名簿(旧 playerIds)の代わりに使う
export function clubMemberIds(players: Player[], clubId: string): string[] {
  const ids: string[] = []
  for (const p of players) if (belongsToClub(p, clubId)) ids.push(p.id)
  return ids
}

// クラブID → 所属選手IDの一覧。海外は180クラブあるので、まとめて1回で作る
export function clubMembersByClub(players: Player[]): Map<string, string[]> {
  const byClub = new Map<string, string[]>()
  for (const p of players) {
    if (p.status === 'retired' || !p.teamId) continue
    const list = byClub.get(p.teamId)
    if (list) list.push(p.id)
    else byClub.set(p.teamId, [p.id])
  }
  return byClub
}

export function isSquadMember(p: Player, teamId: string): boolean {
  return belongsToClub(p, teamId) && !p.loan
}

export function squadPlayersOf(players: Player[], teamId: string): Player[] {
  return players.filter(p => isSquadMember(p, teamId))
}

export function squadIdsOf(players: Player[], teamId: string): string[] {
  const ids: string[] = []
  for (const p of players) if (isSquadMember(p, teamId)) ids.push(p.id)
  return ids
}

// ※ rebuildRosters（team.roster を player.teamId から組み直す）はここにあったが消した。
//   組み直す関数が要るということは、同じ事実を2か所に持っている証拠だった。
//   クラブ側の名簿そのものを無くしたので、ズレようがない。
