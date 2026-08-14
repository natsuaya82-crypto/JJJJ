import type { Player, Specialty } from '../types'
import { SPECIALTY_LABELS } from '../types'
import { ovr } from './playerUtils'
import { RUNNING_SLOTS } from '../data/rosterRules'

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
 * そのクラブはこの選手を必要としているか。**獲得に動く条件はこの1本。**
 *
 * 判断はひとつだけ：**その選手を入れたら、そのポジションが強くなるか。**
 *
 *   ① 誰もいないポジション        … 走らせる人がいないので必ず欲しい
 *   ② チーム平均を下回るポジション … そこが穴。**今いる最上位を上回る選手だけ**欲しい
 *
 * 以前は「そのポジションが2人未満なら頭数が要るので強さを問わない」だったため、
 * 山登りが1人のクラブがOVR60の山登りを買っていた（金があっても安い穴埋めを買う）。
 * 人数ではなく強さで見る。ポジション別平均とチーム平均の差は画面にも出ている数字で、
 * 低いポジションほど穴が深い＝そこに高い選手を取りに行く、という動きになる。
 *
 * 「今いる同タイプより強ければ欲しい」だけにはしない。OVR85はほぼ全クラブの現有を
 * 上回るので、全クラブが欲しがる＝需要を見ていないのと同じになる。
 * 埋めたいのは自分の穴であって、上積みできる場所すべてではない。
 */
export function needsPlayer(
  roster: readonly Player[],
  player: Player,
  opts: {
    /**
     * **そこで走れる選手でなければ獲らない**（既定 true）。
     *
     * **`false` にしてよいのはドラフトだけです**（`engine/draft.ts`）。
     * ドラフトは「いま走る人」ではなく「数年後の戦力」を採る場なので、
     * 即戦力の線を当てると成長を待つという考え方が消えます。実測（候補120人 × 52クラブ）：
     *
     *     入団したときの序列は中央値14番手。走れる7人に入るのは32%だけ（1部では9.8%）
     *     関門を当てる … 120人中35人が**全52クラブから無視される**（下位30人は全員ゼロ）
     *     当てない     … 誰も欲しがらない候補は0人。目玉23.4クラブ／下位5.7クラブと差が付く
     *
     * 移籍金を払う移籍では**必ず既定のまま**にしてください。ここを緩めると、
     * 1部のクラブが3部で1戦も走っていない選手を「必要」と言い出します。
     */
    requireLineup?: boolean
  } = {},
): boolean {
  const depth = squadDepth(roster)
  const d = depth[player.specialty]
  if (!d) return false
  // ★どの穴でも、**そこで走れる選手でなければ獲らない**（走れるのは7区間）。
  //   「16番手になる選手をわざわざ獲るクラブはいない」（CLAUDE.md）を、
  //   言葉だけでなく判定に入れる。以前は①が無条件、②も序列を見ていなかったので、
  //   1部のクラブが3部で1戦も走っていないOVR64を「必要」と言っていた。
  if (opts.requireLineup !== false && !wouldMakeLineup(roster, player)) return false
  // ① 不在のポジションは埋めたい
  //
  //   ★以前はここが無条件（`return true`）だった。強さを一切見ないので、
  //     1部のクラブに粘り型が1人もいなければ、3部で1戦も走っていないOVR64の
  //     粘り型を「必要」と判断して獲っていた。サッカーで言えば、1部のクラブが
  //     3部の出場ゼロの選手を獲るのと同じで、現実には起きない。
  //     実測：OVR68の選手を9タイプ×1部20クラブ＝180通りで試すと、
  //     「必要」15通りに対して「走れる7人に入る」は0通り。全部この枝だった。
  //   タイプが0人でも、そこで20番手になる選手を入れて埋まるわけではない。
  if (d.count === 0) return true
  // ② そのポジションの平均がチーム平均を下回っているか（＝穴）
  const active = roster.filter(p => p.status === 'active')
  if (active.length === 0) return true
  const teamAvg = active.reduce((s2, p) => s2 + ovr(p), 0) / active.length
  const same = active.filter(p => p.specialty === player.specialty)
  const specAvg = same.length > 0 ? same.reduce((s2, p) => s2 + ovr(p), 0) / same.length : 0
  if (specAvg >= teamAvg) return false
  // 穴でも、今いる最上位を上回らないなら意味がない（頭数合わせで弱い選手を取らない）
  return ovr(player) > d.bestOvr
}

/**
 * 穴の深さ（チーム平均 − そのポジションの平均）。大きいほど優先度が高い。
 * 「どこに金をかけるか」を決めるときに使う。穴でなければ0。
 *
 * **不在のタイプはチーム平均をそのまま返す**（＝どの穴より深い）ので、
 * これで並べると「0人のタイプが最優先、次に平均を下回っているタイプが深い順」になります。
 * `needsPlayer` の②の穴と**同じ物差し**なので、「欲しいタイプの一覧」を出すときは
 * ここを使ってください（ドラフト会場の表示が `engine/draft.ts` 経由でこれを使っています）。
 */
export function needDepth(roster: readonly Player[], spec: Specialty): number {
  const active = roster.filter(p => p.status === 'active')
  if (active.length === 0) return 0
  const teamAvg = active.reduce((s, p) => s + ovr(p), 0) / active.length
  const same = active.filter(p => p.specialty === spec)
  if (same.length === 0) return teamAvg
  const specAvg = same.reduce((s, p) => s + ovr(p), 0) / same.length
  return Math.max(0, teamAvg - specAvg)
}

/**
 * そのクラブに入ったら、走れる人数（RUNNING_SLOTS）に入るか。
 *
 * ■なぜ needsPlayer とは別に要るのか
 *   needsPlayer は「穴が空いているか」を見る。**移籍金を払って獲るとき**はそれでいい
 *   （必要でもないのに金を出さない）。だがFAは移籍金がかからないので、穴でなくても
 *   スタメンに入る選手なら取らない理由がない。2部・3部にとってOVR77がタダなら破格。
 *   ここを needsPlayer だけで判断していたため、良いFAが誰にも取られず市場に残っていた。
 */
export function wouldMakeLineup(roster: readonly Player[], player: Player, slots: number = RUNNING_SLOTS): boolean {
  return squadRankOf(roster, player) <= slots
}

/**
 * そのクラブに入ったら何番手になるか（1が最上位）。**序列の数え方はここ1本。**
 * 移籍の判断（transferDecision の buildDestination）も、FAを取るかの判断もこれを使う。
 */
export function squadRankOf(roster: readonly Player[], player: Player): number {
  const my = ovr(player)
  return roster.filter(p => p.status === 'active' && ovr(p) > my).length + 1
}
