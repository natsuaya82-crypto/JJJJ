// オンライン対戦で使えるコース一覧。
//
// ゲーム本編のコースデータを1つの形にそろえただけのもの（新しいコースは作っていない）。
//   ・1軍リーグ  … SEASON_2027_RACES（10本）
//   ・リザーブ    … RESERVE_RACE_POOL（14本）
//   ・ECL        … ECL_COURSES（10本）
// 世界陸上はコースが毎年その場で自動生成される仕組みなので、固定の一覧が作れず対象外。
import type { Race, RaceConditions, Segment } from '../types'
import { SEASON_2027_RACES, RESERVE_RACE_POOL } from './races'
import { ECL_COURSES } from './eclCourses'

export type CourseCategory = 'main' | 'reserve' | 'ecl'

export type MatchCourse = {
  id: string
  name: string
  category: CourseCategory
  location: string
  segments: Segment[]
  conditions: RaceConditions
  /** 総距離（km） */
  distanceKm: number
}

export const CATEGORY_LABEL: Record<CourseCategory, string> = {
  main: '1軍リーグ',
  reserve: 'リザーブ',
  ecl: 'ECL',
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const totalKm = (segs: Segment[]) =>
  Math.round(segs.reduce((s, x) => s + x.distanceKm, 0) * 10) / 10

// ECL のコースデータは天候・気温を持っていないので、本編でECLレースを作るときと同じ値を使う
const ECL_CONDITIONS: RaceConditions = { temperature: 12, weather: 'sunny', elevation: 0 }

export const MATCH_COURSES: MatchCourse[] = [
  ...SEASON_2027_RACES.map((r, i) => ({
    id: `main-${pad2(i + 1)}`,
    name: r.name,
    category: 'main' as const,
    location: r.location,
    segments: r.segments,
    conditions: r.conditions,
    distanceKm: totalKm(r.segments),
  })),
  ...RESERVE_RACE_POOL.map((t, i) => ({
    id: `rsv-${pad2(i + 1)}`,
    name: t.name,
    category: 'reserve' as const,
    location: t.location,
    segments: t.segments,
    conditions: t.conditions,
    distanceKm: totalKm(t.segments),
  })),
  ...ECL_COURSES.map(c => ({
    id: `ecl-${c.id}`,
    name: c.name,
    category: 'ecl' as const,
    location: c.location,
    segments: c.segments,
    conditions: ECL_CONDITIONS,
    distanceKm: totalKm(c.segments),
  })),
]

const BY_ID = new Map(MATCH_COURSES.map(c => [c.id, c]))

export function courseById(id: string): MatchCourse | undefined {
  return BY_ID.get(id)
}

/** レース計算用の Race に変換する。本編のレースとは別物なのでIDだけ分けておく。 */
export function courseToRace(c: MatchCourse, raceNo: number): Race {
  return {
    id: `mp-${c.id}-${raceNo}`,
    name: c.name,
    date: '',
    location: c.location,
    type: 'league',
    segments: c.segments,
    conditions: c.conditions,
    participants: [],
  }
}

/** ランダム抽選。足りなければ同じコースを2回使う（レース数10・コース34なので通常は起きない）。 */
export function randomCourseIds(count: number): string[] {
  const pool = [...MATCH_COURSES]
  const out: string[] = []
  while (out.length < count) {
    if (pool.length === 0) pool.push(...MATCH_COURSES)
    const i = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(i, 1)[0].id)
  }
  return out
}
