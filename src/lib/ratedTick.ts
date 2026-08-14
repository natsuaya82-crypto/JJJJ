// ============================================================================
// **レート戦の1日ぶんを締める処理。サーバーとアプリの唯一の決まり。**
//
// ■ここに何を置くか
//   「その日の提出を締めて、グループごとに走らせて、順位とレートを出す」の全部。
//   **通信も React も import しません**（`lib/roomMachine` とまったく同じ理由）。
//   Edge Function 側は「表から読んで → ここへ渡して → 表へ書く」だけの殻にすること。
//   判断をあちらへ書くと、点検からは一生見えないところに2本目の物差しができます。
//
// ■既にあるものを使う（新しく書かない）
//   コース      … `engine/ratedCourse` の `ratedMatchCourse`（日付から作る）
//   埋める・不戦… `lib/roomMachine` の `resolveOrders`（オンライン対戦とまったく同じ線）
//   レース計算  … `lib/matchSim` の `buildRacePayload` → `engine/raceEngine` の `simulateRace`
//   グループ    … `engine/rating` の `splitGroups`
//   レート      … `engine/rating` の `applyElo`
//
//   ★結果の形も `MatchRacePayload` のまま返します。こうしておくと結果画面も再生も
//     `FinishPanel` / `MatchReplayPage` がそのまま使えます（似た画面を2つ作らないため）。
// ============================================================================
import type { HofPlayer, Player } from '../types'
import { ratedMatchCourse } from '../engine/ratedCourse'
import { applyElo, splitGroups, type RatedEntry } from '../engine/rating'
import { resolveOrders, type Order } from './roomMachine'
import { buildRacePayload, type MatchRacePayload, type MatchTeamInfo } from './matchSim'

// ★このファイルは**サーバー（Edge Function）の入口**でもある。
//   `npm run build:edge` がここを起点に1枚へまとめて `supabase/functions/rated-tick/engine.js`
//   を作るので、サーバーが要るものはここから出すこと（あちらで src を直接 import しない。
//   Deno は拡張子なしの相対 import を解決できないので、そのままでは動かない）。
export { ratedMatchCourse, ratedCourse, ratedDayOf, ratedDateOf } from '../engine/ratedCourse'
export { GROUP_MIN } from '../engine/rating'

/** 1人ぶん。サーバーは `rated_entries` ＋ `profiles` ＋ `rosters.hof` から組み立てる */
export type RatedEntrant = {
  userId: string
  rating: number
  /** 表示に要るぶんだけ（プロフィール） */
  team: MatchTeamInfo
  /** 殿堂入り30人。**登録した時点で凍っている**ので、あとから育てて盛れない */
  hof: HofPlayer[]
}

export type RatedRoundRow = {
  userId: string
  /** グループの通し番号（1が最上位グループ） */
  group: number
  /** グループ内の順位（1が最速） */
  place: number
  timeSec: number
  /** レートの増減 */
  delta: number
  ratingAfter: number
  /** 何も出さなかった人 */
  forfeit: boolean
}

export type RatedGroupRace = {
  group: number
  race: MatchRacePayload
}

export type RatedRoundOutcome = {
  /** 10人に満たず流会したか。true なら rows も races も空でレートは動かない */
  skipped: boolean
  groups: number
  rows: RatedRoundRow[]
  races: RatedGroupRace[]
}

/**
 * **その日ぶんを締める。**
 *
 * ★`lineups` に載っていない人も**走らせます**（おまかせ＋不戦敗）。
 *   出さないほうが得、にしないため（オンライン対戦の `resolveOrders` と同じ考え方）。
 *
 * ★入力だけで答えが決まります（時刻も乱数も見ない）。締め切りの判定はサーバーの
 *   SQL 側に1本だけ置いてあり、ここへは「締め切りまでに届いたぶん」だけが渡ります。
 */
export function runRatedRound(args: {
  /** 走る日（`YYYY-MM-DD`）。コースはここから決まる */
  dateISO: string
  /** 大会の何日目か（1始まり）。おまかせ編成の通し番号に使う */
  day: number
  entrants: readonly RatedEntrant[]
  /** 締め切りまでに届いた提出（userId → 区間番号 → 殿堂入りの選手ID） */
  lineups: Readonly<Record<string, Record<number, string>>>
}): RatedRoundOutcome {
  const { dateISO, day, entrants, lineups } = args
  const course = ratedMatchCourse(dateISO)

  const pool: RatedEntry[] = entrants.map(e => ({ id: e.userId, rating: e.rating }))
  const groups = splitGroups(pool)
  if (groups.length === 0) return { skipped: true, groups: 0, rows: [], races: [] }

  const byId = new Map(entrants.map(e => [e.userId, e]))
  const rows: RatedRoundRow[] = []
  const races: RatedGroupRace[] = []

  groups.forEach((group, gi) => {
    const groupNo = gi + 1
    const members = group.map(g => byId.get(g.id)!).filter(Boolean)
    const activeIds = members.map(m => m.userId)

    // ★殿堂入りをそのままロスターとして渡す。**能力値は端末から受け取らない**
    //   （サーバーが `rosters.hof` を読む。端末が渡す形だと盛れる）
    const rosters: Record<string, Player[]> = {}
    const entries: Record<string, Order | undefined> = {}
    for (const m of members) {
      rosters[m.userId] = m.hof.map(h => h.player)
      const line = lineups[m.userId]
      entries[m.userId] = line && Object.keys(line).length > 0 ? { lineup: line } : undefined
    }

    const { orders, forfeits } = resolveOrders({ activeIds, entries, course, rosters, raceNo: day })
    const race = buildRacePayload({
      raceNo: day - 1,             // 0始まり
      course,
      startAt: 0,                  // 走り出す時刻の待ち合わせはしない（結果を配るだけ）
      teams: members.map(m => m.team),
      rosters,
      orders,
      teamCount: members.length,
      forfeits,
    })

    // ★**速い順の id** を渡す（順位ではなくタイム順。同着の扱いを呼ぶ側で書かせない）
    const order = [...race.standings].sort((a, b) => a.rank - b.rank || a.totalTimeSec - b.totalTimeSec)
    const delta = applyElo(group, order.map(s => s.teamId))
    const place = new Map(race.standings.map(s => [s.teamId, s]))

    for (const m of members) {
      const st = place.get(m.userId)
      const d = delta[m.userId] ?? 0
      rows.push({
        userId: m.userId,
        group: groupNo,
        place: st?.rank ?? 0,
        timeSec: st?.totalTimeSec ?? 0,
        delta: d,
        ratingAfter: m.rating + d,
        forfeit: forfeits.includes(m.userId),
      })
    }
    races.push({ group: groupNo, race })
  })

  return { skipped: false, groups: groups.length, rows, races }
}
