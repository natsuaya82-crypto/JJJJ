import type { Player } from '../types'

// ============================================================================
// 旧セーブの引っ越し用（version 22）。
//
// 昔は海外クラブだけが「クラブ側の選手名簿(playerIds)」を持っていて、
// 選手側の teamId と二重管理になっていた。今は国内チームと同じく teamId 一本にした。
//
// 名簿を捨てる前に1回だけやることが2つある。
//   1) 名簿には載っているのに teamId が空になっている選手の所属を戻す
//      （旧バージョンで契約満了のFA化が海外選手にも効いてしまったセーブの救済）
//   2) 名簿そのものをセーブから消す（以後は書き出さない）
// ============================================================================

type LegacyClub = { id: string; playerIds?: string[] }
type LegacyLeague = { clubs?: LegacyClub[] }

// 名簿にしか残っていない所属を選手側へ戻す。書き換えが要らなければ元の配列をそのまま返す
export function restoreTeamIdsFromLegacyClubs(players: Player[], leagues: unknown): Player[] {
  if (!Array.isArray(players) || !Array.isArray(leagues)) return players
  const clubByPlayer = new Map<string, string>()
  for (const l of leagues as LegacyLeague[]) {
    for (const c of (l?.clubs ?? [])) {
      for (const pid of (c?.playerIds ?? [])) clubByPlayer.set(pid, c.id)
    }
  }
  if (clubByPlayer.size === 0) return players
  let changed = false
  const next = players.map(p => {
    // 条件は belongsToClub と同じ「引退していない」。status が付いていない古い海外選手も戻す
    if (p.teamId === '' && p.status !== 'retired' && clubByPlayer.has(p.id)) {
      changed = true
      return { ...p, teamId: clubByPlayer.get(p.id)!, faSinceYear: undefined }
    }
    return p
  })
  return changed ? next : players
}

// クラブ側の名簿を消す（セーブに残り続けないように）
export function dropLegacyClubRosters(leagues: unknown): void {
  if (!Array.isArray(leagues)) return
  for (const l of leagues as LegacyLeague[]) {
    for (const c of (l?.clubs ?? [])) {
      if (c && 'playerIds' in c) delete c.playerIds
    }
  }
}
