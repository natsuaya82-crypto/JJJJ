// ログインボーナス・広告の回数・ベルが見る「ゲームの中の今日」。
//
// ★**中身は `utils/jstDate` の `jstGameDayISO` 1本**（日本時間の朝10時区切り）。
//   ここは `getHours()`＝**端末のローカル時刻**で前日補正していたので、
//   日本国外（や時計をずらした端末）では、ログインボーナス・広告3回の「1日」と、
//   イベント・お知らせポップ・ランクマッチの「1日」が**別の日付**になっていました。
//   `jstDate.ts` 自身が「★端末のローカル時刻ではなく日本時間で決めること」と書き、
//   `data/events.ts` も「★端末のローカル日付で決めないこと」と書いているのに、
//   この1本だけが逆でした。
//
// 名前は残します（呼ぶ側は「ログインの今日」を聞いていて、意味が読みやすいため）。
import { jstGameDayISO } from './jstDate'

export function loginTodayKey(): string {
  return jstGameDayISO()
}

/** その「ゲームの中の今日」の前日（連続ログインの判定に使う） */
export function loginPrevKey(today: string = loginTodayKey()): string {
  return new Date(Date.parse(today + 'T00:00:00Z') - 86400_000).toISOString().slice(0, 10)
}
