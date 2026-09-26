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
 * ★`to` は**その日を含む**（`from <= 今日 <= to`）。8/23〜8/25 で3日間。
 */
export const EVENTS: GameEvent[] = [
  // ★**いま開催中のイベントはありません。**
  //   1000DL記念（大成功確定・2026-08-24〜26）は終わったので消しました（2026-09-17）。
  //   終わったイベントを置いたままにすると、`greatSuccessChance` は日付で外れるので
  //   何も起きないように見えますが、**期間の文字がお知らせとポップに残り続けます**
  //   （実際にそれで、9月に「8月24日10:00から…」を出すところでした）。
  //   足すときは `data/newsPopups` の `event.period` と `from`/`until`、
  //   `data/appMeta` のお知らせ本文も一緒に。`check-event-window` の[2-b]が突き合わせます。
]

/**
 * **イベント中の大成功確率。** いまは 1＝確定（オーナー・2026-08-22）。
 *
 * ★**倍率で持たないこと。** 以前は `GREAT_SUCCESS_EVENT_MULT = 2` という倍率で、
 *   確定にするには「20倍にして 1 でクランプ」という読めない形になっていました。
 *   イベント中の確率そのものを置きます。
 */
export const GREAT_SUCCESS_EVENT_CHANCE = 1

/**
 * その日に開催中のイベント。
 *
 * ★**`today` は呼ぶ側から渡すこと**（`utils/jstDate` の `jstGameDayISO()`）。
 *   `data/` は `utils/` を import できない（`check-layers`）。お知らせポップの
 *   `nextNewsPopup(seenIds, today)` と同じ形。
 * ★**端末のローカル日付で決めないこと。** 日本時間の朝10時区切りで揃える
 *   （オーナー・2026-08-20「日本時間やね」「22の10時から25日の9:59まで」）。
 */
export function activeEvents(today: string): GameEvent[] {
  return EVENTS.filter(e => e.from <= today && today <= e.to)
}

/**
 * いまの合成の大成功確率。**画面はこれを呼ぶ（0.05 と書かない）。**
 * 広告視聴・GMパスの確約はイベントとは別で、呼ぶ側が確定させる。
 *
 * ★**1 を超えないこと。** 倍率を上げていったときに 1 を超えると、
 *   「確定」との区別が付かなくなります（画面は `< 1` で広告のボタンを出す）。
 */
export function greatSuccessChance(today: string): number {
  // ★**特定の id で引かないこと。** 以前は `isEventActive('dl1000-great', …)` と
  //   書いてあり、そのイベントを EVENTS から消しても**この行だけが消えた id を
  //   指したまま**残りました（2026-09-17）。何も起きないので気づけません。
  //   `EVENTS` はいまのところ「合成の大成功が確定する期間」だけを持ちます。
  //   **別の種類のイベントを足すときは、`GameEvent` に種類を持たせること**
  //   （でないと、その期間も大成功が確定します）。
  const c = activeEvents(today).length > 0 ? GREAT_SUCCESS_EVENT_CHANCE : GREAT_SUCCESS_CHANCE
  return Math.min(1, c)
}
