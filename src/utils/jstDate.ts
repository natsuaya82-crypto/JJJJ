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
