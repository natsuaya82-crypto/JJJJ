/**
 * 【日本時間の「今日」】
 *
 * ランクマッチも起動時のお知らせも、日付は**日本時間の `YYYY-MM-DD`**で決まります
 * （サーバー側の `rated_open_round` と同じ物差し）。端末の時計の地域に引きずられると、
 * 海外で遊んでいる人だけ1日ずれます。
 *
 * ★**この式を画面やデータに書かないこと。** 2026-08-18 の監査で、
 *   `components/rated/RatedPage.tsx` と `data/newsPopups.ts` に
 *   **1文字も違わない同じ実装が2つ**ありました。`check-single-source` が見張ります。
 */

/** 日本時間の今日（`YYYY-MM-DD`） */
export function jstTodayISO(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

/**
 * **日本時間の「今日」。ただし朝10時で切り替わる版。**
 *
 * ゲームの中の1日はログインボーナスと同じ朝10時区切り。イベントの期間も
 * それに合わせる（オーナー・2026-08-20「22の10時から25日の9:59まで」）。
 *
 * ★**端末のローカル時刻ではなく日本時間で決めること。** 海外にいる人や
 *   時計をずらしている端末で、始まる時刻がバラバラになる。
 *   （JST = UTC+9。そこから10時間戻すと「10時で日付が変わる」になる）
 */
export function jstGameDayISO(now: number = Date.now()): string {
  return new Date(now - 3600_000).toISOString().slice(0, 10)
}
