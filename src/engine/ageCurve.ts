// 年齢カーブ。「その選手は何歳のときOVRいくつか」を決める唯一の場所。
//
// ■ なぜ1本にするのか
//   前は初期生成（playerGenerator の bakeAgeGrowth）と年次成長（gameStore の growPlayer）が
//   同じ係数を別々に手書きしていた。CLAUDE.md に「必ず一緒に変えること」と書いてある時点で
//   1本化できておらず、片方だけ動かすと初年度と定常状態でカーブがズレる。
//   ここ1本にして、生成も成長も同じ表を見る。
//
// ■ 3つの成長型は「いつ強いか」だけが違う
//   早熟・普通・晩成で 18〜35歳のOVRの合計が等しくなるように作ってある（1564前後）。
//   ピークの値も 91.9 / 92.0 / 92.3 でほぼ同じ。違うのはピークの年齢だけ（22 / 27 / 30）。
//   どの型を引いても損得が無い。早熟は若いうちに強く、そのぶん落ちるのも早い。
//
// ■ ランクは平行移動
//   表はSSS基準。SS以下は RANK_OFFSET を足すだけで、カーブの形は全ランク共通。
//
// ■ 上限
//   最後に「そのクラブの格の成長上限」で頭打ちにする（utils/clubTier.ts）。
//   格下へ移っても上限は下がらない。一度上がった上限は本人のもの。

import type { GrowthCurve, Rank } from '../types'

/** カーブが定義されている年齢の範囲 */
export const CURVE_MIN_AGE = 18
export const CURVE_MAX_AGE = 35

/**
 * SSS（成長上限99）のときの年齢→OVR。添字は age - 18。
 * 3つとも18〜35の合計が1564前後で揃えてある。
 */
const SSS_CURVE: Record<GrowthCurve, number[]> = {
  //        18    19    20    21    22    23    24    25    26    27    28    29    30    31    32    33    34    35
  early:  [87.4, 88.9, 90.4, 91.4, 91.9, 91.9, 91.4, 90.9, 89.9, 88.9, 87.9, 86.4, 84.9, 83.4, 81.9, 80.4, 78.9, 77.4],
  normal: [82.0, 83.0, 84.0, 84.5, 85.0, 87.0, 88.5, 90.0, 91.0, 92.0, 92.0, 91.5, 90.5, 89.0, 87.0, 85.0, 82.5, 80.0],
  late_bloomer:
          [77.3, 78.3, 79.8, 81.3, 82.8, 84.3, 85.8, 87.3, 88.8, 90.3, 91.3, 91.8, 92.3, 92.3, 91.8, 90.8, 89.8, 88.3],
}

/** ランクごとの下げ幅（SSSを0とした平行移動） */
export const RANK_OFFSET: Record<Rank, number> = {
  SSS: 0, SS: -4, S: -8, A: -11.5, B: -16, C: -21, D: -25.5,
}

/** 成長型ごとのピーク年齢。値段・衰えの判定もここを見る */
export const PEAK_AGE: Record<GrowthCurve, number> = {
  early: 22, normal: 27, late_bloomer: 30,
}

/**
 * 年齢カーブ上のOVR（上限を掛ける前の素の値）。
 * 18歳未満は18歳の値、35歳超は35歳から先も落ち続ける（1年あたり-2.5）。
 */
export function curveOvr(rank: Rank, growthCurve: GrowthCurve, age: number): number {
  const c = SSS_CURVE[growthCurve] ?? SSS_CURVE.normal
  const off = RANK_OFFSET[rank] ?? 0
  if (age <= CURVE_MIN_AGE) return c[0] + off
  if (age >= CURVE_MAX_AGE) return c[c.length - 1] + off - (age - CURVE_MAX_AGE) * 2.5
  return c[Math.round(age) - CURVE_MIN_AGE] + off
}

/** ピーク年齢。成長型1本で決まる（前は playerUtils の peakAgeOf と2箇所にあった） */
export function peakAgeOfCurve(growthCurve: GrowthCurve): number {
  return PEAK_AGE[growthCurve] ?? PEAK_AGE.normal
}

/** ピークを過ぎているか（衰え・値段の判定に使う） */
export function isDeclining(growthCurve: GrowthCurve, age: number): boolean {
  return age > peakAgeOfCurve(growthCurve)
}
