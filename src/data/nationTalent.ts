import type { Nationality } from '../types'

// 国ごとの「選手の数」。長距離の勢力図をここ1本で表す。
//
// ■ なぜ要るか
// もとは選手の国籍がクラブの所在国と1対1だった（playerGenerator の nat = club.country）。
// その結果、国の選手層＝その国のクラブ数×22 になり、実測でこうなっていた。
//
//   USA 11クラブ=242人 / オーストラリア 242人 / ニュージーランド 220人
//   ケニア 5クラブ=110人 / エチオピア 3クラブ=66人 / ウガンダ 44人
//
// 駅伝のゲームとして転倒している。オセアニア2国で484人、東アフリカ8カ国で396人だった。
// さらに、層の薄い国は代表20人を選ぶときに「クラブの22番目の控え」まで入るので、
// 代表なのにOVR63がいる、という状態になっていた（フィリピン・スリランカなど）。
//
// ■ どう直したか
// 国籍をクラブの所在国から切り離し、ここの数に従って全クラブへ配る。
// クラブ数は1つも動かさないので、リーグ構成・順位表・ECLの枠はそのまま。
//
// ■ 強さはここでは決めない
// 選手の強さは「どのクラブにいるか」（playerGenerator の strengthFor）で決まる。
// 国籍で強さを変えると、弱いリーグのケニア人が全員強い、という形になってリーグの序列が壊れる。
// 国の強さは「人数が多い＝強いクラブに入る人数も多い」という形で自然に出る。
//
// ■ 数の決め方
// 現実の長距離（マラソン・駅伝・トラック長距離）の勢力図に寄せた5段階。
// 下位でも45人あるので、代表20人を選ぶときに上位半分から選べる（＝足切りが要らない）。
export const NATION_TALENT: Record<string, number> = {
  // ── 最上位：世界の長距離を支配する2国 ──
  KEN: 300, ETH: 300,

  // ── 上位：世界大会の表彰台に常時絡む ──
  UGA: 120, ERI: 120, MAR: 120, TAN: 120, BRN: 120,

  // ── 中上位：世界大会の入賞圏 ──
  BDI: 80, RWA: 80, DJI: 80, ALG: 80, TUN: 80,
  USA: 80, GBR: 80, GER: 80, ESP: 80, ITA: 80, NED: 80, NOR: 80,

  // ── 中位：大陸大会の上位 ──
  FRA: 55, CAN: 55, AUS: 55, BEL: 55, POR: 55, SUI: 55, FIN: 55,
  IRL: 55, POL: 55, RSA: 55, NGA: 55, MEX: 55, BRA: 55, CHN: 55, KOR: 55,

  // ── 下位：それ以外。45人あれば代表20人を上位半分から選べる ──
  NZL: 45, SWE: 45, AUT: 45, DEN: 45, SDN: 45, SOM: 45, ZIM: 45,
  QAT: 45, KSA: 45, KAZ: 45, MGL: 45, IND: 45, SRI: 45, NEP: 45,
  THA: 45, VIE: 45, INA: 45, MAS: 45, PHI: 45, SGP: 45, HKG: 45, TWN: 45,
  COL: 45, ECU: 45, PER: 45, ARG: 45, CHI: 45, URU: 45, VEN: 45, BOL: 45,
  CUB: 45, JAM: 45, CRC: 45, GUA: 45,
}

/**
 * 上の人数に従って国籍を並べた袋を作る（多い国ほど多く入っている）。
 * クラブごとに順に引いていくので、全体の人数比がそのまま結果になる。
 * 引く順は呼び出し側でシャッフルすること。
 */
export function buildNationalityBag(): Nationality[] {
  const bag: Nationality[] = []
  for (const [nat, n] of Object.entries(NATION_TALENT)) {
    for (let i = 0; i < n; i++) bag.push(nat as Nationality)
  }
  return bag
}

/** 袋の合計。海外クラブの総席数（クラブ数×22）とだいたい合っているかの確認用 */
export const NATION_TALENT_TOTAL = Object.values(NATION_TALENT).reduce((s, n) => s + n, 0)
