// ============================================================================
// **レート戦のコース。日付から作る唯一の決まり。**
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
    name: `レート戦 ${dateISO}`,
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
