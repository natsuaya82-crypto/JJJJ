import type { Player, Specialty } from '../types'
import { SPECIALTY_LABELS } from '../types'
import { ovr } from './playerUtils'

// 「そのクラブは今どのタイプが足りていないか」「その選手は欲しい選手か」を決める1本。
//
// 以前は同じことを別々の基準で2箇所に書いていて、答えが食い違っていた：
//   ・gameStore の cpuSpecialtyNeeds … 人数だけ見る（そのタイプが2人未満なら穴）
//   ・foreignTransfers の weakestSpec … 強さだけ見る（そのタイプの最高OVRが最低なら穴）
// 山型が3人いても全員弱いクラブは、前者では「足りている」、後者では「大穴」になる。
// 国内も海外も同じ判定を通すため、両方の見方をここへまとめる。
//
// 穴は2種類ある。どちらも「必要な選手」なので、獲得の判定では両方を見る。
//   薄い(thin)   … 頭数が足りない。走らせる人がいない
//   弱い(weak)   … 頭数はいるが強さが足りない。走らせても勝てない

/** 全タイプ。SPECIALTY_LABELS のキー順が唯一の並び（3箇所に手書きされていたのをここへ集約） */
export const SPECIALTIES = Object.keys(SPECIALTY_LABELS) as Specialty[]

/** このタイプが何人いれば「薄くない」か */
export const THIN_DEPTH = 2

export type SpecialtyDepth = {
  /** 在籍している人数 */
  count: number
  /** そのタイプの最高OVR（不在なら0） */
  bestOvr: number
}

/**
 * タイプごとの層の厚さ。roster は呼ぶ側が絞り込んだ在籍者を渡す
 * （「出せる選手」の条件は入口ごとに違うので、ここでは絞らない）
 */
export function squadDepth(roster: readonly Player[]): Record<Specialty, SpecialtyDepth> {
  const depth = {} as Record<Specialty, SpecialtyDepth>
  for (const s of SPECIALTIES) depth[s] = { count: 0, bestOvr: 0 }
  for (const p of roster) {
    const d = depth[p.specialty]
    if (!d) continue
    d.count++
    d.bestOvr = Math.max(d.bestOvr, ovr(p))
  }
  return depth
}

/**
 * 頭数が足りないタイプ（薄い順）。人数基準の穴。
 * 旧 gameStore.cpuSpecialtyNeeds と同じ答えを返す
 */
export function thinSpecialties(roster: readonly Player[]): Specialty[] {
  const depth = squadDepth(roster)
  return SPECIALTIES
    .filter(s => depth[s].count < THIN_DEPTH)
    .sort((a, b) => depth[a].count - depth[b].count)
}

/**
 * 一番弱いタイプ（そのタイプの最高OVRが最小）。強さ基準の穴。
 * 旧 foreignTransfers.weakestSpec と同じ答えを返す（同値は SPECIALTIES の先頭側が勝つ）
 */
export function weakestSpecialty(roster: readonly Player[]): Specialty {
  const depth = squadDepth(roster)
  return SPECIALTIES.reduce((w, s) => (depth[s].bestOvr < depth[w].bestOvr ? s : w), SPECIALTIES[0])
}

/** そのタイプの現有戦力（最高OVR）。不在なら0 */
export function bestOvrInSpecialty(roster: readonly Player[], spec: Specialty): number {
  return squadDepth(roster)[spec].bestOvr
}

/**
 * そのクラブはこの選手を必要としているか。獲得に動く条件はこの1本。
 *
 *   薄い(count < THIN_DEPTH) … 頭数が足りないので強さは問わず欲しい
 *   一番弱いタイプ           … 頭数はいるので、今いる誰よりも強いときだけ欲しい
 *
 * 「今いる同タイプより強ければ欲しい」だけにすると穴の判定にならない。
 * OVR85の選手はほぼ全クラブの現有を上回るので、52クラブ全部が欲しがってしまい
 * 「強い選手は全員が欲しがる」＝需要を見ていないのと同じ結果になる（実測で22→20クラブしか減らなかった）。
 * クラブが埋めたいのは自分の穴であって、上積みできる場所すべてではない。
 */
export function needsPlayer(roster: readonly Player[], player: Player): boolean {
  const depth = squadDepth(roster)
  const d = depth[player.specialty]
  if (!d) return false
  if (d.count < THIN_DEPTH) return true
  const weakest = SPECIALTIES.reduce((w, s) => (depth[s].bestOvr < depth[w].bestOvr ? s : w), SPECIALTIES[0])
  return player.specialty === weakest && ovr(player) > d.bestOvr
}
