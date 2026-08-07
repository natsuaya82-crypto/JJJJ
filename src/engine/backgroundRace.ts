// 裏で走るレースの唯一の入口。
//
// ■ なぜ1本にするのか
//   プレイヤーが見ていないレースを走らせる場所が4つあり、同じ手順を4回書いていた。
//     engine/domesticLeague.ts … 自分以外の部（1部10戦 / 2部8戦 / 3部7戦）
//     engine/foreignLeague.ts  … 海外8リーグ（180クラブ）
//     engine/ecl.ts            … ECL（自チームが出るときだけ配置を差し込む）
//     store/gameStore.ts       … 世界選手権・アジア予選（日本だけ配置を差し込む）
//   手順はどこも同じで「区間に走者を並べる → simulateRace → 得点と通算成績を数える」。
//   にもかかわらず**並べ方だけが3通り**あり、埋め方が食い違っていた。
//
//     domesticLeague … 地形順に置く＋余った区間は能力で埋める
//     ecl / 世界選手権 … 地形順に置く＋余った区間は控えで埋める（負傷者も最後は使う）
//     foreignLeague  … 地形順に置くだけ。**埋めない**
//
//   埋めないと、走者が足りないクラブは空区間のまま走ることになる。ECL のコメントに
//   「1区間でも欠けると、再生では総合タイムが少なく＝1位、結果画面ではバケット方式で
//   最下位になる」と書いてある食い違いが、海外リーグでだけ生き残っていた。
//
// ■ ここが決めること／決めないこと
//   決める … 区間への並べ方・埋め方、simulateRace の呼び方、得点と通算成績の数え方
//   決めない … **誰が出られるか**。これは大会ごとに違う（国内は active のみ、
//              海外は status 未設定も走らせる、代表は選出された20人）ので、
//              呼ぶ側が roster を作って渡す。
//
// ■ 新しい大会を足すとき
//   simulateRace を直接呼ばず、ここを呼ぶこと。scripts/check-single-source.ts が見張っている。

import type { Player, Race, Team } from '../types'
import { simulateRace, bgLineup } from './raceEngine'
export { bgLineup } from './raceEngine'
import { segmentPrizeByTeam } from '../utils/league'

/** 1チーム分の出走者。roster は「出られる人」を呼ぶ側が絞ったもの */
export type BgEntrant = {
  id: string
  roster: Player[]
  /**
   * 走者が区間数に足りないときだけ使う控え（ECLの負傷者など）。
   * 通常の配置には出てこない。空区間を残すよりは走らせる、という最後の手段。
   */
  reserve?: Player[]
  /** 監督が自分で組んだ配置。渡すとその区間だけ優先して使う（自チーム・日本代表） */
  lineup?: Record<number, string>
}

export type BgCareerAdd = { races: number; segWins: number; rankSum: number }

export type BgRaceOutcome = {
  /** 結果を入れたレース。呼ぶ側がそのまま保存する */
  race: Race
  /** entrantId → このレースで得た得点（順位ポイント＋区間ポイント） */
  points: Record<string, number>
  /** entrantId → このレースの順位 */
  ranks: Record<string, number>
  /** entrantId → 区間賞の賞金（数え方は utils/league の1本） */
  segPrize: Record<string, number>
  /** playerId → 通算成績への加算ぶん */
  careerAdd: Record<string, BgCareerAdd>
  /** playerId → どのチームで走ったか */
  ranFor: Record<string, string>
  /** 実際に組んだ配置（entrantId → 区間番号 → playerId） */
  lineups: Record<string, Record<number, string>>
}

/**
 * 1レース走らせて、得点・順位・通算成績への加算をまとめて返す。
 * 順位表への反映も保存も**しない**（大会ごとに置き場所が違うので呼ぶ側の仕事）。
 */
export function runBackgroundRace(o: {
  race: Race
  entrants: BgEntrant[]
  /** タイム計算に使う全選手。roster に無い選手は走らない */
  players: Player[]
  /** 本拠地補正に使う。海外クラブ・代表は teams に居ないので渡さなくてよい（中立） */
  teams?: Team[]
  seasonProgress: number
  /**
   * 保存するレースのID。同じコースを同じ日に複数の集まりが走るとき（海外9リーグ・
   * 大陸予選3地域）は必ず分けること。そのままだと同じIDのレースが並んで記録の紐付けが壊れる。
   */
  raceId?: string
}): BgRaceOutcome {
  const lineups: Record<string, Record<number, string>> = {}
  for (const e of o.entrants) lineups[e.id] = bgLineup(e.roster, o.race, e.lineup, e.reserve)

  const results = simulateRace(o.race, lineups, o.teams ?? [], o.players, o.seasonProgress)

  const points: Record<string, number> = {}
  const ranks: Record<string, number> = {}
  for (const tr of results.teamRankings) {
    points[tr.teamId] = tr.positionPoints + tr.segmentPoints
    ranks[tr.teamId] = tr.rank
  }

  const careerAdd: Record<string, BgCareerAdd> = {}
  const ranFor: Record<string, string> = {}
  const rankOf = new Map<string, number>()
  for (const sr of results.segmentResults) for (const r of sr.runners) rankOf.set(r.playerId, r.rank ?? 0)
  for (const [entrantId, lineup] of Object.entries(lineups)) {
    for (const pid of Object.values(lineup)) {
      if (!pid) continue
      ranFor[pid] = entrantId
      const segWins = results.segmentResults.filter(sr => sr.runners[0]?.playerId === pid).length
      const cur = careerAdd[pid] ?? { races: 0, segWins: 0, rankSum: 0 }
      careerAdd[pid] = { races: cur.races + 1, segWins: cur.segWins + segWins, rankSum: cur.rankSum + (rankOf.get(pid) ?? 0) }
    }
  }

  return {
    race: { ...o.race, ...(o.raceId ? { id: o.raceId } : {}), results },
    points, ranks, careerAdd, ranFor, lineups,
    segPrize: segmentPrizeByTeam(results.segmentResults),
  }
}

/** 通算成績（レース数・区間賞）を選手へ足す。数え方を呼ぶ側で書かせない */
export function applyCareerAdd(players: Player[], careerAdd: Record<string, BgCareerAdd>): Player[] {
  if (Object.keys(careerAdd).length === 0) return players
  return players.map(p => {
    const add = careerAdd[p.id]
    if (!add) return p
    return { ...p, career: { ...p.career, totalRaces: p.career.totalRaces + add.races, segmentWins: p.career.segmentWins + add.segWins } }
  })
}
