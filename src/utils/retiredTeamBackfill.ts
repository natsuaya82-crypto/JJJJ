// ============================================================================
// 旧セーブの穴埋め：引退選手の「引退時の所属」を過去シーズンから推定して retiredTeamId に入れる。
//
// ■なぜ要るのか
//   引退すると teamId が '' になる。これまで引退時の所属をどこにも残していなかったので、
//   海外クラブで現役を終えた選手が、記録室の国内限定ランキング（通算区間賞・通算MVP・
//   記録会の歴代トップ10）に混ざっていた。
//   今後は引退処理が retiredTeamId を書くが、すでに引退している選手には入っていない。
//
// ■何を手がかりにするか
//   過去シーズンに残っている海外リーグの出場記録（foreignAppsC）。これは実際に走った選手だけでなく、
//   その年に海外クラブに在籍していた選手も 0 出場として記録されるので、
//   「最後に海外クラブに居た年」が分かる。
//
// ■間違えないための条件
//   海外へ行って国内に戻ってから引退した選手を海外扱いにしてはいけない。
//   そこで「最後に海外に居た年」と「最後に国内の駅伝に出た年」を比べ、
//   海外の方が後（または同year）のときだけ海外クラブ扱いにする。
//   判断が付かない選手には何も書かない＝今まで通り国内扱いのまま（歴代記録が急に消えない）。
// ============================================================================

type RawSeason = {
  year?: unknown
  races?: unknown
  secondTeamRaces?: unknown
  foreignAppsC?: unknown
  foreignAppearances?: unknown
}

// その年の「海外クラブに居た選手 → クラブID」。圧縮版・旧形式の両方に対応する。
function foreignMembersOf(s: RawSeason): Record<string, string> {
  const out: Record<string, string> = {}
  const packed = s.foreignAppsC
  if (packed && typeof packed === 'object') {
    for (const [clubId, byPlayer] of Object.entries(packed as Record<string, unknown>)) {
      if (!byPlayer || typeof byPlayer !== 'object') continue
      for (const pid of Object.keys(byPlayer as Record<string, unknown>)) out[pid] = clubId
    }
    return out
  }
  const legacy = s.foreignAppearances
  if (legacy && typeof legacy === 'object') {
    for (const [pid, v] of Object.entries(legacy as Record<string, unknown>)) {
      const clubId = (v as { clubId?: unknown })?.clubId
      if (typeof clubId === 'string') out[pid] = clubId
    }
  }
  return out
}

// その年の国内駅伝（1軍・リザーブ）に出た選手ID
function domesticRunnersOf(s: RawSeason, into: Set<string>): void {
  for (const key of ['races', 'secondTeamRaces'] as const) {
    const races = s[key]
    if (!Array.isArray(races)) continue
    for (const r of races) {
      const segs = (r as { results?: { segmentResults?: unknown } })?.results?.segmentResults
      if (!Array.isArray(segs)) continue
      for (const seg of segs) {
        const runners = (seg as { runners?: unknown })?.runners
        if (!Array.isArray(runners)) continue
        for (const run of runners) {
          const pid = (run as { playerId?: unknown })?.playerId
          if (typeof pid === 'string') into.add(pid)
        }
      }
    }
  }
}

// players を書き換えた新しい配列を返す。変化が無ければ元の配列をそのまま返す。
// migrate から呼ぶので、入力は型の付いていない生データであることに注意（欠損・型違いに耐えること）。
export function backfillRetiredTeamIds(
  players: unknown,
  pastSeasons: unknown,
): unknown {
  if (!Array.isArray(players) || !Array.isArray(pastSeasons)) return players

  // 対象は「引退済みで、引退時の所属がまだ入っていない」選手だけ
  const targets = new Set<string>()
  for (const p of players) {
    const q = p as { id?: unknown; status?: unknown; retiredTeamId?: unknown }
    if (q?.status === 'retired' && q.retiredTeamId == null && typeof q.id === 'string') targets.add(q.id)
  }
  if (targets.size === 0) return players

  // 年の新しい順に見て、選手ごとに「最後に海外に居た年」「最後に国内で走った年」を1回ずつ拾う
  const seasons = [...pastSeasons]
    .map(s => s as RawSeason)
    .filter(s => typeof s?.year === 'number')
    .sort((a, b) => (b.year as number) - (a.year as number))

  const lastForeign = new Map<string, { year: number; clubId: string }>()
  const lastDomestic = new Map<string, number>()
  for (const s of seasons) {
    const year = s.year as number
    for (const [pid, clubId] of Object.entries(foreignMembersOf(s))) {
      if (targets.has(pid) && !lastForeign.has(pid)) lastForeign.set(pid, { year, clubId })
    }
    const runners = new Set<string>()
    domesticRunnersOf(s, runners)
    for (const pid of runners) {
      if (targets.has(pid) && !lastDomestic.has(pid)) lastDomestic.set(pid, year)
    }
  }

  const assign = new Map<string, string>()
  for (const [pid, f] of lastForeign) {
    const d = lastDomestic.get(pid)
    // 海外の方が後（同year含む）のときだけ海外クラブ扱い。国内に戻って引退した選手は触らない
    if (d == null || f.year >= d) assign.set(pid, f.clubId)
  }
  if (assign.size === 0) return players

  return players.map(p => {
    const q = p as { id?: unknown }
    const clubId = typeof q?.id === 'string' ? assign.get(q.id) : undefined
    return clubId ? { ...(p as object), retiredTeamId: clubId } : p
  })
}
