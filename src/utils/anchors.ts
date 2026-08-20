/**
 * **アンカー表を引く唯一の関数。**
 *
 * 「x が増えると y が変わる」という表（OVR→年俸、score→秒/km、種目適性値→タイム）を
 * 区分線形で引く。もとは**同じループが3か所に写されていて、下端の扱いだけが3通り**に
 * 割れていた。
 *
 *   engine/raceEngine  `scoreToBasePace`     … 下端はクランプ
 *   utils/playerUtils  `ovrSalary`           … 下端はクランプ
 *   utils/eventTime    `individualBaseTime`  … 下端は**最下段の傾きで延長**
 *
 * 表を伸ばすときに1か所だけ直し忘れる、という事故が起きる形なので1本にした。
 * **違いは消していない**——下端をどう扱うかは表ごとの決め事なので、
 * `belowFirst` で**名前を付けて**渡す（3通りが隠れているのと、1つの関数に
 * 名前付きの選択肢があるのは別のこと）。
 *
 * ★**上端は必ずクランプ**。表の外へ外挿すると、能力を伸ばしたぶんだけ
 *   際限なく速く／高くなる。伸ばしたいときは**表そのものを伸ばすこと**。
 */
export type Anchors = readonly (readonly [number, number])[]

export function lerpAnchors(
  anchors: Anchors,
  x: number,
  opts?: { belowFirst?: 'clamp' | 'extend' },
): number {
  const pts = anchors
  const [x0, y0] = pts[0]
  const last = pts[pts.length - 1]
  if (x >= last[0]) return last[1]
  if (x <= x0) {
    if (opts?.belowFirst !== 'extend') return y0
    // 最下段の傾きでそのまま下へ延長する
    const [x1, y1] = pts[1]
    return y0 + (x0 - x) * (y0 - y1) / (x1 - x0)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, ya] = pts[i], [b, yb] = pts[i + 1]
    if (x >= a && x <= b) return ya + (x - a) * (yb - ya) / (b - a)
  }
  return last[1]
}
