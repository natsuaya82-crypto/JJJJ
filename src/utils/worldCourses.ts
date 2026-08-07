import type { WECRacePlan } from '../types'
import { LEAGUE_COURSE_POOL, FINAL_COURSES } from '../data/races'
import { terrainKindOf } from './terrain'

// 世界選手権のコースを決める場所。
//
// ■なぜ本編と同じコースを使うのか
//   以前は開催国の地形に合わせて**毎年その場で区間をランダムに作って**いた。
//   コースが二度と同じにならないので、区間記録が1年で使い捨てになる
//   （区間記録は「大会名＋区番号」で貯まるため）。
//   本編のコースをそのまま使えば、**コースの数は増えないのに記録だけが貯まる**。
//   タイムも本編と地形が同じになるので、「あの区間の世界記録」と「JPELの区間記録」を
//   同じ物差しで比べられる。
//
// ■記録の並びは大会ごとに分ける
//   レース名は「世界選手権 ◯◯（コース名）」。JPELの同じコースとは別の記録表になる。
//   混ぜると海外の代表勢が国内のコース記録を総取りしてしまうため。
//   年と開催地は名前に入れない（入れると毎年別の記録表になって貯まらない）。

/** 抽選に使うコース。本編と同じ25本（ファイナルも含む） */
const ALL_COURSES = [...LEAGUE_COURSE_POOL, ...FINAL_COURSES]

/** 開催国の地形に合うコースか。山の国なら山、平坦な国なら平坦を優先して引く */
function suitsProfile(
  course: typeof ALL_COURSES[number],
  profile: 'mountain' | 'flat' | 'mixed',
): boolean {
  if (profile === 'mixed') return true
  const kinds = course.segments.map(s => terrainKindOf(s.uphillPct, s.downhillPct, s.distanceKm))
  const hilly = kinds.filter(k => k === 'uphill' || k === 'downhill' || k === 'undulating').length
  // 3区間以上が山がち＝山の国向け。1区間以下＝平坦な国向け
  return profile === 'mountain' ? hilly >= 3 : hilly <= 1
}

/**
 * その年の3戦ぶんのコースを決める。**同じコースは引かない。**
 * @param year その年（同じ年なら何度呼んでも同じ組になる）
 */
export function worldRacePlans(year: number, profile: 'mountain' | 'flat' | 'mixed' = 'mixed'): WECRacePlan[] {
  const suited = ALL_COURSES.filter(c => suitsProfile(c, profile))
  // 合うコースが3本に満たない開催国では、全部から引く（大会が開けないほうが困る）
  const pool = suited.length >= 3 ? suited : ALL_COURSES
  // 年から決める並び替え。同じ年なら同じ組、年が変われば別の組になる
  const ordered = pool
    .map((c, i) => ({ c, k: (year * 9301 + i * 49297) % 233280 }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.c)
  return ordered.slice(0, 3).map(c => ({
    courseName: c.name,
    segments: c.segments.map(s => ({ distanceKm: s.distanceKm, uphillPct: s.uphillPct, downhillPct: s.downhillPct })),
  }))
}

/**
 * 世界選手権のレース名。**年と開催地は入れない**（入れると毎年別の記録表になって貯まらない）。
 * コース名が無い古いセーブだけ、これまでどおり年つきの名前で出す。
 */
export function worldRaceName(
  plan: WECRacePlan,
  fallback: string,
  isMain: boolean,
): string {
  if (!plan.courseName) return fallback
  return `${isMain ? '世界選手権' : '世界選手権アジア予選'} ${plan.courseName}`
}
