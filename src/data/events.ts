// 期間限定イベントの唯一の置き場所。**「いま何をやっているか」はここだけが知っている。**
//
// ■なぜ1本にするのか
//   期間限定の効果を画面の中に書くと、期間が終わったあとに消し忘れる／
//   別の画面だけ効果が残る、という形で必ずズレる。実際、合成の大成功確率(5%)は
//   CardTrainingPage の中に直書きされていて、外から触れなかった。
//   期間も中身もここに集めて、画面は「いまの値」を聞くだけにする。
//
// ■決まり
//   期間限定の数字を画面に直書きしないこと（`npm run check` が見張る）。
//   イベントが終わったら、下の EVENTS から消すか enabled を false にするだけで元に戻る。

/** 期間限定イベント1件 */
export type GameEvent = {
  id: string
  title: string
  /** 開始日（この日の00:00から）。端末の日付で判定する */
  from: string
  /** 終了日（この日の23:59まで） */
  to: string
}

/** 合成の大成功確率（ふだん）。イベント中はここを上書きする */
export const GREAT_SUCCESS_CHANCE = 0.05

/**
 * 開催中のイベント。**終わったら消すこと。**
 *
 * ここに1行足すだけで始まり、消すだけで終わる。
 * 配布のほうは store の `grantUpdateGifts`（`GIFT_VERSION` を変えると全員に配られる）。
 *
 * ★`to` は**その日を含む**（`from <= 今日 <= to`）。8/22〜8/24 で3日間。
 */
export const EVENTS: GameEvent[] = [
  // 1000DL突破記念（オーナー・2026-08-20「8/22〜8/25大成功100パー！3日だけで！」）。
  // ★「3日だけ」を採って 8/22〜8/24 にしてある。4日にするなら to を 2026-08-25 へ
  { id: 'dl1000-great', title: '1000DL記念 大成功100%', from: '2026-08-22', to: '2026-08-24' },
]

/** その日付（既定は今日）に開催中のイベント */
export function activeEvents(now: Date = new Date()): GameEvent[] {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const today = `${y}-${m}-${d}`
  return EVENTS.filter(e => e.from <= today && today <= e.to)
}

/** そのイベントが開催中か */
export function isEventActive(id: string, now?: Date): boolean {
  return activeEvents(now).some(e => e.id === id)
}

/**
 * いまの合成の大成功確率。**画面はこれを呼ぶ（0.05 と書かない）。**
 * 広告視聴・GMパスの確約はイベントとは別で、呼ぶ側が確定させる。
 */
export function greatSuccessChance(now?: Date): number {
  return isEventActive('dl1000-great', now) ? 1 : GREAT_SUCCESS_CHANCE
}
