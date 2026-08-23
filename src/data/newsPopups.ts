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
  /** 見出し。**説明は書かない**（オーナー・2026-08-16「それ以外の説明いらん。
   *  そのページに飛んでみてもらったほうがいい」）*/
  title: string
  /** 見出しの上に大きく出す文字（日付など）。無くてよい */
  lead?: string
  /** 絵。`ranks` は段位の紋章を横に並べる（`components/rated/rankArt` の7枚） */
  art?: 'ranks'
  /**
   * **箱の横いっぱいに敷くキービジュアル**（`src/assets` の画像を import して渡す）。
   * 渡すと見出しは絵の上に重なります。★文字を焼き込んだ絵を入れないこと
   * （見出しはアプリ側から重ねるので二重になります）。
   */
  hero?: string
  /**
   * **絵の上に置くロゴ**。`title` はゲームのタイトルロゴ（`assets/logo.png`）。
   * ★**走者に被らない右上**へ置きます（オーナー・2026-08-21）。
   *   絵を暗く落とさないこと（「せっかくの絵が隠れちゃうね」）。
   */
  logo?: 'title'
  /** もらえるものを絵つきで横に並べる。文字だけで並べない */
  rewards?: { icon: 'trophy' | 'runner'; label: string }[]
  /** 期間つきの催し（大成功確定など）。`label` と `期間` を帯で出す */
  event?: { label: string; period: string }
  /** どうしても要るときだけ。`\n` で改行できる */
  body?: string
  actionLabel: string
  /** 押したときに開く画面（アプリ内のパス） */
  to: string
  /** この日を過ぎたら出さない（日本時間・`YYYY-MM-DD`） */
  until?: string
  /** この日より前は出さない（日本時間・`YYYY-MM-DD`）。無ければ最初から出す */
  from?: string
  /**
   * **閉じても、期間中は毎回出す。** 「もう表示しない」にチェックを入れたときだけ
   * 二度と出ません（オーナー・2026-08-21「3日間ずっと出そうか」）。
   * 既定（無指定）は今までどおり**閉じたら二度と出ない**。
   */
  repeat?: boolean
}

import dl1000 from '../assets/dl1000.png'

export const NEWS_POPUPS: NewsPopup[] = [
  {
    // ★**先頭に置くこと**（オーナー・2026-08-21「1000dl記念→ランクマッチ」）。
    //   ポップは1回に1件しか出さないので、並び順がそのまま出す順番になります。
    id: 'dl1000-2026-08',
    lead: '1000',
    title: 'ダウンロード突破記念',
    hero: dl1000,
    logo: 'title',
    rewards: [
      { icon: 'trophy', label: '優勝トロフィー ×5' },
      { icon: 'runner', label: '選手作成 ×1' },
    ],
    event: { label: 'カード合成の大成功が確定', period: '8/24 10:00 〜 8/27 9:59' },
    body: '受け取りは8/31まで',
    actionLabel: '受け取る',
    to: '/notifications',
    from: '2026-08-24',
    until: '2026-08-26',
    repeat: true,
  },
  {
    // ★**id を変えたので、前のお知らせを見た人にももう一度出ます。**
    //   前は「9/1に開催します」と知らせるだけで、その場でできることが無かった。
    //   開催前からエントリーできるようになったので、**参加の募集**に差し替える
    //   （オーナー・2026-08-19「オンライン対戦の参加募集はもう始めていいって」）。
    id: 'rated-entry-2026-09',
    lead: '9/1 開始',
    title: '第一回ランクマッチβテスト',
    art: 'ranks',
    actionLabel: 'エントリーする',
    to: '/online/rated',
    until: '2026-09-30',
  },
]

/**
 * まだ出していない・期限内のお知らせを1件返す（無ければ null）。
 * **選ぶ判定はここ1本**（画面で配列を絞り込まないこと）。
 *
 * ★`today` は呼ぶ側から渡します（`utils/jstDate` の `jstTodayISO()`）。
 *   ここは `data/` なので `utils/` を import できません（`check-layers` のルール4。
 *   定数・型の側から計算を引っぱると、向きが逆さまの依存が1本ずつ増えていく）。
 */
export function nextNewsPopup(seenIds: readonly string[], today: string): NewsPopup | null {
  const seen = new Set(seenIds)
  return NEWS_POPUPS.find(n =>
    !seen.has(n.id)
    && (!n.until || n.until >= today)
    && (!n.from || n.from <= today)) ?? null
}
