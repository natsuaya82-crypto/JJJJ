/**
 * 【起動時に一度だけ出すお知らせポップ】
 *
 * オーナー・2026-08-16「次のアプデでホームに【オンラインレート戦開催】の
 * ニュースポップ表示させよう。xみたいにね」
 *
 * ★**次のお知らせを足すときは、この配列に1件足すだけ。**
 *   画面（`components/ui/NewsModal`）も出す仕組み（`App.tsx`）も触らないこと。
 *   お知らせのたびに専用のモーダルを作ると、そのぶんだけ形が散らばります。
 *
 * ★`id` は一度出したら変えないこと。**見たかどうかは端末に id で記録**します
 *   （`store/deviceFlags` の `deviceSeenNewsIds`）。変えるともう一度出ます。
 *   セーブではなく端末に持つのは、スロットを変えても同じお知らせを
 *   何度も見せないため（公式Xの案内と同じ扱い）。
 *
 * ★`until` を過ぎたものは出しません（開催が終わったお知らせが居座らないように）。
 *   日付は日本時間の `YYYY-MM-DD` で、その日いっぱいは出ます。
 */
export type NewsPopup = {
  /** 一度出したら変えない */
  id: string
  title: string
  /** `\n` で改行できる */
  body: string
  actionLabel: string
  /** 押したときに開く画面（アプリ内のパス） */
  to: string
  /** この日を過ぎたら出さない（日本時間・`YYYY-MM-DD`） */
  until?: string
}

export const NEWS_POPUPS: NewsPopup[] = [
  {
    id: 'rated-open-2026-09',
    title: 'オンラインレート戦 開催',
    body: '全国の相手と毎日1回、同じコースで戦うモードが始まります。\n'
      + '勝つとレートが上がり、段位が変わります。',
    actionLabel: 'ランクマッチを見る',
    to: '/online/rated',
    until: '2026-09-30',
  },
]

/** 今日（日本時間）の `YYYY-MM-DD` */
function todayISO(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

/**
 * まだ出していない・期限内のお知らせを1件返す（無ければ null）。
 * **選ぶ判定はここ1本**（画面で配列を絞り込まないこと）。
 */
export function nextNewsPopup(seenIds: readonly string[]): NewsPopup | null {
  const today = todayISO()
  const seen = new Set(seenIds)
  return NEWS_POPUPS.find(n => !seen.has(n.id) && (!n.until || n.until >= today)) ?? null
}
