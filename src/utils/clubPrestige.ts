import type { Player } from '../types'
import { ovr } from './playerUtils'

// ============================================================================
// クラブの「格」。国内(JPEL)・海外の区別なく、全クラブを同じ物差しで並べる唯一の場所。
//
// ■なぜ要るのか
//   選手が「そのクラブへ行きたいか」の判定(playerConsentToMove)が、行き先の
//   JPEL順位だけを見ていた。そのため JPEL首位のクラブは appeal=1.0（＝世界最高の
//   行き先）として評価され、世界的強豪の24歳の主力でも普通に移籍してきていた。
//   現実には、格上のクラブでスタメンを張っている若い選手が格下リーグへ移ることはない。
//   一方で逆方向（日本→海外）には既に年齢の減衰が入っており（foreignTransfers の
//   effectiveOvr が33歳から1歳ごとに-3）、片方向だけリアルな状態になっていた。
//
// ■物差し
//   「OVR上位10人の平均年俸」。年俸は国内・海外とも同じ faMarketSalary から
//   算出されているので、全クラブを分岐なしで比較できる。
//
//   総年俸ではなく上位10人にしているのは、頭数で格が上がるのを防ぐため。
//   JPELは28人、海外は22人で生成されるので、総額だとJPEL上位が海外の4大リーグと
//   並んでしまう（実測: 総年俸 JPEL1位6.3億 vs 4大リーグ6.4億。ただし平均OVRは
//   74.7 vs 80.0 で明確に負けている）。サッカーで「スタメンの質」で格を語るのと同じ。
//
// ■ここでやらないこと
//   移籍の可否そのもの。ここは「格がいくつか」だけを返す。
//   格差をどう扱うか（何歳なら格下へ動くか等）は呼び出し側の判断。
// ============================================================================

/** クラブの格。5が世界的ビッグクラブ、1が下位。 */
export type Prestige = 1 | 2 | 3 | 4 | 5

/** 格の素点に使う人数。スタメン+数人ぶん。 */
export const PRESTIGE_SQUAD_SIZE = 10

/**
 * 格の素点＝そのクラブのOVR上位10人の平均年俸（円）。
 * 在籍が10人未満のクラブは、居る人数の平均をそのまま使う（薄いロスターは素点も低くなる）。
 */
export function prestigeScore(clubId: string, players: readonly Player[]): number {
  const squad = players
    .filter(p => p.teamId === clubId && p.status !== 'retired')
    .sort((a, b) => ovr(b) - ovr(a))
    .slice(0, PRESTIGE_SQUAD_SIZE)
  if (squad.length === 0) return 0
  const total = squad.reduce((s, p) => s + (p.contract?.annualSalary ?? 0), 0)
  return total / squad.length
}

/**
 * 素点 → 格（1〜5）の境界。円。
 * 固定境界にしているのは、分位（上位x%）だとリーグ全体が育った年に
 * 「相対的に落ちる」クラブが出て格が毎年揺れるため。
 *
 * ★★ この境界はまだ暫定。実際の移籍判定に接続してはいけない ★★
 *   実データを測ったところ、上位10人の平均OVRが
 *     4大リーグ 87.0 / JPEL1位 86.3 / JPEL20位 83.2 / 欧州西南 80.7
 *   で、JPEL上位が4大リーグと同格・JPEL最下位が欧州西南より上という状態だった。
 *   原因は generateCpuRosters の RANK_UP（国内CPUだけ年俸から決まったランクを
 *   1段階引き上げている）で、海外との予算差2倍以上を打ち消している。
 *   ここを是正してから境界を確定させること。今の数字で線を引くと
 *   「JPEL優勝チーム＝世界的強豪」になってしまう。
 */
const PRESTIGE_BANDS: [number, Prestige][] = [
  [46_000_000, 5],
  [38_000_000, 4],
  [30_000_000, 3],
  [22_000_000, 2],
]

/** 素点から格を引く（ECL加算などは含まない素の値）。 */
export function prestigeFromScore(score: number): Prestige {
  for (const [min, p] of PRESTIGE_BANDS) if (score >= min) return p
  return 1
}

/**
 * クラブの格。ECLに出場しているクラブは+1（上限5）。
 * 「ECLに出ると良い選手が集まる」を成立させるための唯一の加点。
 */
export function clubPrestige(
  clubId: string,
  players: readonly Player[],
  opts?: { eclClubIds?: ReadonlySet<string> },
): Prestige {
  const base = prestigeFromScore(prestigeScore(clubId, players))
  const inEcl = opts?.eclClubIds?.has(clubId) ?? false
  return (inEcl ? Math.min(5, base + 1) : base) as Prestige
}

export const PRESTIGE_LABEL: Record<Prestige, string> = {
  5: '世界的強豪', 4: '強豪', 3: '中堅', 2: '発展途上', 1: '下位',
}
