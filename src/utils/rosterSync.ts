import type { Player, Team } from '../types'

// ============================================================================
// 「どの選手がどのチームに居るか」を決める唯一の場所。
//
// ■なぜ要るのか
//   所属の持ち方が2つあった。
//     (A) 選手側の player.teamId
//     (B) チーム側の team.roster.main / roster.second（選手IDの一覧）
//   出走メンバー選択・カード練習・人数上限の判定など、ほとんどの画面は (A) を見ているのに、
//   ロスター画面とダッシュボードの注目選手だけが (B) を見ていた。
//   トレードや獲得の処理で (A) だけ更新して (B) を更新し損ねると、
//   「ロスターに出ないのに駅伝には出せる選手」が生まれる。実際にそれが起きていた。
//
// ■方針
//   (A) の player.teamId を正とし、(B) は毎回そこから組み直す“控え”とみなす。
//   画面は下の squadPlayersOf() を通して選手を取る。
//   セーブ読み込み時に rebuildRosters() を通すので、すでにズレているセーブもその場で直る。
//
// ■チーム所属の条件（ここが唯一の定義）
//   1. player.teamId がそのチーム
//   2. 引退していない（負傷中は在籍のまま。ロスターにも人数にも数える）
//   3. レンタル中でない（貸し借り中の選手は roster とは別枠で管理している。
//      借りている選手はロスター画面の「レンタル」タブに出る）
// ============================================================================

export function isSquadMember(p: Player, teamId: string): boolean {
  return p.teamId === teamId && p.status !== 'retired' && !p.loan
}

export function squadPlayersOf(players: Player[], teamId: string): Player[] {
  return players.filter(p => isSquadMember(p, teamId))
}

export function squadIdsOf(players: Player[], teamId: string): string[] {
  const ids: string[] = []
  for (const p of players) if (isSquadMember(p, teamId)) ids.push(p.id)
  return ids
}

// team.roster を player.teamId から組み直す。1軍/2軍の区分は廃止済みなので second は常に空。
// 中身が変わらないチームは元のオブジェクトをそのまま返す（無駄な再描画とセーブ書き込みを避ける）。
export function rebuildRosters(players: Player[], teams: Team[]): Team[] {
  const byTeam = new Map<string, string[]>()
  for (const p of players) {
    if (p.status === 'retired' || p.loan || !p.teamId) continue
    const list = byTeam.get(p.teamId)
    if (list) list.push(p.id)
    else byTeam.set(p.teamId, [p.id])
  }
  let changed = false
  const next = teams.map(t => {
    const main = byTeam.get(t.id) ?? []
    const cur = t.roster
    const same = cur
      && cur.main.length === main.length
      && (cur.second?.length ?? 0) === 0
      && cur.main.every((id, i) => id === main[i])
    if (same) return t
    changed = true
    return { ...t, roster: { main, second: [] as string[] } }
  })
  return changed ? next : teams
}
