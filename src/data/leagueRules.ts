import type { LeagueId } from '../types'

// ============================================================================
// リーグの決まり（リーグの違いはここだけに書く）。表は `data/leagues` の WORLD_LEAGUES も使う。
//
// ★**コードに「国内なら」「海外なら」を書かず、そのリーグの決まりを引くこと。**
//
// ■この表を data/leagues から分けている理由
//   data/leagues は海外180クラブの初期データ（data/foreignLeagues）を読み込むので、
//   `utils/league` がそちらを import すると、レート戦の Edge Function（`src/lib/ratedTick.ts`
//   を1枚にまとめたもの）にクラブのデータが丸ごと乗る（実測 65KB → 110KB）。
// ============================================================================

/** そのリーグの決まり */
export type LeagueRules = {
  /** 部の入れ替え（昇格・降格）がある */
  promotion: boolean
  /** クラブの格が順位で動く（オーナー・2026-08-18「格はもう動かさない。国内だけ動かす」） */
  tierMoves: boolean
  /** ドラフトに参加する（指名されなかった候補はFAになるので、ほかのリーグはそこから拾う） */
  draft: boolean
}

/** 決まりを持つリーグ。**ここに無いリーグ（海外9）は全部 false** */
const RULES: Readonly<Record<LeagueId, LeagueRules>> = {
  'jpel-1': { promotion: true, tierMoves: true, draft: true },
  'jpel-2': { promotion: true, tierMoves: true, draft: false },
  'jpel-3': { promotion: true, tierMoves: true, draft: false },
}
const NO_RULES: LeagueRules = { promotion: false, tierMoves: false, draft: false }

/** そのリーグの決まり。知らないリーグは何も無い */
export function leagueRules(leagueId: LeagueId | null | undefined): LeagueRules {
  return (leagueId != null ? RULES[leagueId] : undefined) ?? NO_RULES
}
