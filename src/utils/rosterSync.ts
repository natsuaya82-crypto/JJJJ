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
