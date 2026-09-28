import type { Race } from '../types'
import { CONT_LABEL_BY_CODE } from '../engine/worldAthletics'

// 世界大会の走行記録を読む唯一の取り出し口。
//
// ■なぜ1本にするのか
//   置き場所が2つある。
//     いま  … Season.waRaces（海外リーグ・裏の部と同じ。シーズンごとに別ファイルへ書き出す）
//     昔    … worldAthleticsResults[].races（普段のセーブに入りっぱなし）
//   worldAthleticsResults は状態が変わるたびに丸ごと書き直される側なので、
//   大会の走行記録を置くと年々重くなる（本戦・アジア予選で1年あたり約50KB、
//   大陸予選まで入れると約170KB。100シーズンで8MBが毎回の書き込みに乗る）。
//   なので新しく書くのは Season.waRaces だけ。**古いセーブの読み口はここだけに置く。**
//   読む側が2か所を自分で見に行くと、片方を足し忘れて出走履歴が消える。
//
// ■大会の記号
//   main … 世界選手権（本戦） / asia … 世界選手権アジア予選
//   afr / eur / ame … 大陸予選（engine/worldAthletics の CONT_REGION_CODE と同じ）

export const WA_LABEL_BY_CODE: Record<string, string> = {
  main: '世界選手権',
  asia: '世界選手権アジア予選',
  ...CONT_LABEL_BY_CODE,
}

/** 恒久保存する側の大会結果（走行記録を持っているのは古いセーブだけ） */
export type WaResultLike = { year: number; kind: 'main' | 'qualifier'; races?: Race[] }
/** シーズン（今季・過去どちらも） */
export type WaSeasonLike = { year: number; waRaces?: Record<string, Race[]> } | undefined

export type WaRaceRow = { year: number; code: string; label: string; race: Race }

/**
 * 世界大会で実際に走ったレースを、年と大会名つきで全部返す。
 * 結果の入っていないレースは返さない（走っていないものは履歴に出さない）。
 */
export function waRaceRows(seasons: readonly WaSeasonLike[], results: readonly WaResultLike[] | undefined): WaRaceRow[] {
  const out: WaRaceRow[] = []
  const seen = new Set<string>()   // 年＋大会。新しい置き場所を優先し、古いほうは足さない
  for (const s of seasons) {
    if (!s) continue
    for (const [code, races] of Object.entries(s.waRaces ?? {})) {
      const done = races.filter(r => r.results)
      if (done.length === 0) continue
      seen.add(`${s.year}|${code}`)
      for (const race of done) out.push({ year: s.year, code, label: WA_LABEL_BY_CODE[code] ?? '世界大会', race })
    }
  }
  for (const r of results ?? []) {
    const code = r.kind === 'main' ? 'main' : 'asia'
    if (seen.has(`${r.year}|${code}`)) continue
    for (const race of (r.races ?? []).filter(x => x.results)) {
      out.push({ year: r.year, code, label: WA_LABEL_BY_CODE[code], race })
    }
  }
  return out
}
