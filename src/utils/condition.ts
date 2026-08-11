/**
 * 士気と疲労の上げ下げ。**0〜100に収める決まりはここ1本。**
 *
 * ■なぜ1本にしたのか
 *   `morale: Math.min(100, p.morale + 25)` という形が gameStore だけで27か所、
 *   疲労も13か所に手書きされていた。しかも**既定値の扱いが揃っていなかった**：
 *   ほとんどが `p.morale` を直接足していて、士気が未設定の古い選手（`undefined`）だと
 *   `undefined + 25 = NaN` になり、そのまま保存されて士気が壊れる。
 *   `(p.morale ?? 70)` と書いてあるのは5か所だけだった。
 *
 * ここを通せば、未設定は既定値から始まり、上下限も必ず掛かる。
 */

/** 士気の既定値。選手データに士気が入っていないときはここから始める */
export const MORALE_DEFAULT = 70
/** 疲労の既定値（疲れていない） */
export const FATIGUE_DEFAULT = 0

const clamp01to100 = (v: number) => Math.max(0, Math.min(100, v))

/** 士気を delta だけ動かした選手を返す（0〜100に収める。マイナスを渡せば下がる） */
export function withMorale<T extends { morale?: number }>(p: T, delta: number): T {
  return { ...p, morale: clamp01to100((p.morale ?? MORALE_DEFAULT) + delta) }
}

/** 疲労を delta だけ動かした選手を返す（0〜100に収める） */
export function withFatigue<T extends { fatigue?: number }>(p: T, delta: number): T {
  return { ...p, fatigue: clamp01to100((p.fatigue ?? FATIGUE_DEFAULT) + delta) }
}

/**
 * GMの評判を delta だけ動かす（0〜100に収める）。
 *
 * イベントの決着（`resolveEvent`）だけで `Math.min(100, gmRep + n)` /
 * `Math.max(0, gmRep - n)` が11か所に手書きされていた。上げるときは上限しか、
 * 下げるときは下限しか掛かっていない**半分ずつの上下限**だったので、1本にまとめて
 * 両方掛ける（掛かる値は同じ。0〜100の外に出る経路はもともと無い）。
 *
 * ★**下限は0と1の2つがあります**（`docs/BACKLOG.md` A-8）。
 *   シーズン終了時の目標達成率で動かす `engine/seasonObjectives.ts` だけが
 *   `Math.max(1, ...)` で、1で止まります。どちらが正かはオーナーの判断待ちなので、
 *   ここでは触らず、あちら側に「1で止める」を明示的に1行残してあります。
 */
export const GM_REP_DEFAULT = 50
export function withGmRep(cur: number | undefined, delta: number): number {
  return clamp01to100((cur ?? GM_REP_DEFAULT) + delta)
}

/** 士気をその値にそろえる（増減ではなく設定したいとき） */
export function setMorale<T extends { morale?: number }>(p: T, value: number): T {
  return { ...p, morale: clamp01to100(value) }
}
