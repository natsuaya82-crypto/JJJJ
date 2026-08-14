// ============================================================================
// **ランクマッチのコース。日付から作る唯一の決まり。**
//
// オーナー判断（2026-08-13）
//   「はちゃめちゃに毎回コース作ってやる」「8〜15区間、コースもランダム」
//
// ★**アプリとサーバーが同じこの関数を呼ぶこと。** 別々に書くと、画面に出るコースと
//   実際に走るコースが食い違う。日付だけで決まるので、どちらで作っても同じものになる。
//
// ★本編の25コース（`data/races.ts`）とは別物。あちらは固定の地形で、記録表もそこに
//   紐づいている。こちらは毎日変わるので**記録には残さない**。
// ============================================================================
import { strHash } from '../utils/hash'
import type { MatchCourse } from '../data/matchCourses'
import type { Race, Segment } from '../types'

/**
 * 区間数の幅（オーナー判断・2026-08-13「8〜15区間、コースもランダム」）。
 * 殿堂入りが30人なので理屈のうえでは30まで出せるが、**上限は15**。
 */
export const SEG_MIN = 8
export const SEG_MAX = 15

/** 1区間の距離の幅（km） */
const KM_MIN = 5
const KM_MAX = 25

/**
 * 日付から引き直す乱数。**同じ日付なら必ず同じコース**。
 *
 * ★**空回ししてから使うこと。** LCGは種が近いと最初の1個も近くなる。
 *   空回しを入れる前は 9/1・9/2・9/3 が**3日とも10区間**になっていた
 *   （最初の1個で区間数を決めているため）。
 */
function rng(seed: number): () => number {
  let s = seed >>> 0
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  for (let i = 0; i < 16; i++) next()
  return next
}

const WEATHER = ['sunny', 'cloudy', 'rainy', 'windy'] as const

/**
 * その日のコースを作る。`dateISO` は 'YYYY-MM-DD'。
 *
 * 区間ごとに距離・登り・下りをばらばらに振る。登りと下りの合計は100%を超えない
 * （超えると平坦が負になる。`raceEngine` は `100 - up - down` を平坦として使う）。
 */
export function ratedCourse(dateISO: string): Race {
  const r = rng(strHash(`rated:${dateISO}`))
  const segCount = SEG_MIN + Math.floor(r() * (SEG_MAX - SEG_MIN + 1))
  const segments: Segment[] = []
  // ★区間の番号は**1始まり**（`data/races.ts` の seg() と同じ）。
  //   0始まりにすると画面に「0区」と出る（LineupPhase は index をそのまま出す）
  for (let i = 1; i <= segCount; i++) {
    const distanceKm = Math.round((KM_MIN + r() * (KM_MAX - KM_MIN)) * 10) / 10
    // 起伏は「登り寄り／下り寄り／平坦」を引いてから幅を決める。
    // 一様に振ると全区間が中くらいの起伏になって、コースの表情が出ない
    const shape = r()
    const up = shape < 0.35 ? Math.round(r() * 70) : Math.round(r() * 25)
    const downMax = Math.max(0, 100 - up)
    const down = shape > 0.65 ? Math.round(r() * Math.min(70, downMax)) : Math.round(r() * Math.min(25, downMax))
    segments.push({ index: i, distanceKm, uphillPct: up, downhillPct: down })
  }
  return {
    id: `rated-${dateISO}`,
    name: `ランクマッチ ${dateISO}`,
    date: dateISO,
    location: 'オンライン',
    type: 'league',
    segments,
    conditions: {
      temperature: Math.round(5 + r() * 25),
      weather: WEATHER[Math.floor(r() * WEATHER.length)],
      elevation: Math.round(r() * 500),
    },
  }
}

/** そのコースの総距離（画面に出す） */
export function courseDistanceKm(race: Race): number {
  return Math.round(race.segments.reduce((s, x) => s + x.distanceKm, 0) * 10) / 10
}

/**
 * その日のコースを、**オンライン対戦の画面と計算が読める形**（`MatchCourse`）にする。
 *
 * ★`data/matchCourses` の一覧（`courseById`）では引けない。あれは固定の25本＋ECLで、
 *   ランクマッチのコースは日付から作るので載っていない。**画面もサーバーもここを呼ぶこと。**
 *   以前は `lib/ratedApi` の中にあったが、Edge Function（サーバー）からも要るので engine に置く
 *   （lib は Supabase を import するので、サーバー側から読ませたくない）。
 */
export function ratedMatchCourse(dateISO: string): MatchCourse {
  const r = ratedCourse(dateISO)
  return {
    id: r.id, name: `ランクマッチ ${dateISO}`, category: 'main', location: r.location,
    segments: r.segments, conditions: r.conditions, distanceKm: courseDistanceKm(r),
  }
}

/** ランクマッチのコースIDから日付を取り出す。`rated-YYYY-MM-DD` 以外なら undefined */
export function ratedCourseOf(id: string): MatchCourse | undefined {
  const m = /^rated-(\d{4}-\d{2}-\d{2})$/.exec(id)
  return m ? ratedMatchCourse(m[1]) : undefined
}

/**
 * **大会の何日目か**（1始まり）。開始日より前・終了後なら0。
 * ★日付の足し算をあちこちに書かないこと（`rated_rounds` の day とサーバーの判定が食い違う）。
 */
export function ratedDayOf(startsOn: string, dateISO: string, totalDays: number): number {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  const day = Math.round((d(dateISO) - d(startsOn)) / 86400000) + 1
  return day >= 1 && day <= totalDays ? day : 0
}

/** 大会の N 日目の日付（`YYYY-MM-DD`） */
export function ratedDateOf(startsOn: string, day: number): string {
  const d = new Date(Date.UTC(+startsOn.slice(0, 4), +startsOn.slice(5, 7) - 1, +startsOn.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + day - 1)
  return d.toISOString().slice(0, 10)
}
