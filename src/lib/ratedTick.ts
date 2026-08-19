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
import { applyElo, clampRating, groupsFromMap, splitGroups, type RatedEntry } from '../engine/rating'
import { resolveOrders, type Order } from './roomMachine'
import { buildRacePayload, type MatchRacePayload, type MatchTeamInfo } from './matchSim'

// ★このファイルは**サーバー（Edge Function）の入口**でもある。
//   `npm run build:edge` がここを起点に1枚へまとめて `supabase/functions/rated-tick/engine.js`
//   を作るので、サーバーが要るものはここから出すこと（あちらで src を直接 import しない。
//   Deno は拡張子なしの相対 import を解決できないので、そのままでは動かない）。
export { ratedMatchCourse, ratedCourse, ratedDayOf, ratedDateOf } from '../engine/ratedCourse'
export { GROUP_MIN } from '../engine/rating'

/**
 * **その日の組を決める**（受付が開く10:00に1回だけ。番号は1始まり）。
 *
 * ★Edge Function は**この1本だけ**を呼ぶこと。`splitGroups` を向こうから直に呼ぶと、
 *   「どう割るか」が殻の側にも現れて2本目の物差しになる（`check-rated-server` が落とす）。
 */
export function assignGroups(entrants: readonly RatedEntry[]): { userId: string; groupNo: number }[] {
  return splitGroups(entrants).flatMap((g, i) => g.map(m => ({ userId: m.id, groupNo: i + 1 })))
}

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
  /** **大会全体での順位**（その日が終わった時点。1が最上位） */
  overall: number
  /** **前日からの上下**（＋2＝2つ上がった／−1＝1つ下がった）。順位表の矢印はこれ1本 */
  move: number
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
  /**
   * **その日の組**（受付が開いた 10:00 に決めて保存してあるぶん・userId → 組の番号）。
   * ★渡さないと**その場で割り直す**ので、当日ずっと見せていた部屋と食い違います。
   *   古い回（組を保存していなかった日）だけ、渡さずに走らせること。
   */
  groupOf?: Readonly<Record<string, number>>
}): RatedRoundOutcome {
  const { dateISO, day, entrants, lineups, groupOf } = args
  const course = ratedMatchCourse(dateISO)

  const pool: RatedEntry[] = entrants.map(e => ({ id: e.userId, rating: e.rating }))
  const groups = groupOf && Object.keys(groupOf).length > 0
    ? groupsFromMap(pool, groupOf)
    : splitGroups(pool)
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
      // ★**0より下がらない**（`clampRating` 1本）。そのうえで画面に出す増減は
      //   「実際に動いたぶん」にする。生の増減をそのまま出すと、レート0の人の行に
      //   「−380」と出ているのに数字が動かない＝矢印と数字が嘘をつく
      const after = clampRating(m.rating + (delta[m.userId] ?? 0))
      const d = after - m.rating
      rows.push({
        userId: m.userId,
        group: groupNo,
        place: st?.rank ?? 0,
        timeSec: st?.totalTimeSec ?? 0,
        delta: d,
        ratingAfter: after,
        forfeit: forfeits.includes(m.userId),
        overall: 0, move: 0,   // ↓ 全グループが出そろってから入れる
      })
    }
    races.push({ group: groupNo, race })
  })

  // ★**大会全体の順位と前日からの上下。**
  //   グループごとには出せない（全員のレートが出そろって初めて並べられる）ので、
  //   ここでまとめて入れる。並べ方は `rated_standings` とまったく同じ
  //   （レートの高い順、同点は user_id 順）にすること。**片方だけ変えると矢印が嘘になる。**
  const rankOfBy = (get: (r: RatedRoundRow) => number): Map<string, number> => {
    const sorted = [...rows].sort((a, b) => get(b) - get(a) || (a.userId < b.userId ? -1 : 1))
    return new Map(sorted.map((r, i) => [r.userId, i + 1]))
  }
  const before = rankOfBy(r => byId.get(r.userId)?.rating ?? 0)
  const after = rankOfBy(r => r.ratingAfter)
  for (const r of rows) {
    r.overall = after.get(r.userId) ?? 0
    // 順位は小さいほど上。上がったら＋になるよう「前 − 今」で出す
    r.move = (before.get(r.userId) ?? 0) - r.overall
  }

  return { skipped: false, groups: groups.length, rows, races }
}
