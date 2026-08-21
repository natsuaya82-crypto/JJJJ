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
  // 1000DL突破記念（オーナー・2026-08-20「3日間大成功2倍」）。
  // ★はじめ「大成功100%」で組みましたが、**2倍**に変わりました。
  // ★「3日だけ」なので 8/23〜8/25。日付の区切りは日本時間の朝10時（`jstGameDayISO`）
  // ★**8/22〜8/24 からずらしました**（オーナー・2026-08-21「23〜26」＝ 8/23 10:00 〜 8/26 9:59）。
  //   審査に出したものをいったん取り下げたため、開始が1日ずれた。
  //   **期間を動かしたら、次の3つも一緒に直すこと**（日付が3か所に文字で出ます）
  //     ・`data/newsPopups` の `event.period`（ポップに出る文字）と `from` / `until`
  //     ・`data/appMeta` の v2.0.5 のお知らせの本文
  //     ・`scripts/check-event-window.ts` の[3]（前日・当日・翌日をここから引きます）
  { id: 'dl1000-great', title: '1000DL記念 大成功2倍', from: '2026-08-23', to: '2026-08-25' },
]

/** イベント中の大成功確率の倍率 */
export const GREAT_SUCCESS_EVENT_MULT = 2

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

/** そのイベントが開催中か */
export function isEventActive(id: string, today: string): boolean {
  return activeEvents(today).some(e => e.id === id)
}

/**
 * いまの合成の大成功確率。**画面はこれを呼ぶ（0.05 と書かない）。**
 * 広告視聴・GMパスの確約はイベントとは別で、呼ぶ側が確定させる。
 *
 * ★**1 を超えないこと。** 倍率を上げていったときに 1 を超えると、
 *   「確定」との区別が付かなくなります（画面は `< 1` で広告のボタンを出す）。
 */
export function greatSuccessChance(today: string): number {
  const mult = isEventActive('dl1000-great', today) ? GREAT_SUCCESS_EVENT_MULT : 1
  return Math.min(1, GREAT_SUCCESS_CHANCE * mult)
}
