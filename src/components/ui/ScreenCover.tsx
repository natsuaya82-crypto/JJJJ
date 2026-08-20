import { createPortal } from 'react-dom'
import { useCoversScreen } from '../../lib/screenCover'

/**
 * **画面を覆うものは全部これを通すこと。** 覆う層の決まりはここ1本。
 *
 * ■なぜ1本にしたのか（数えた結果・2026-08-20）
 *   「画面を覆う」という同じことを**24ファイルが全部手書き**していた。
 *
 *     position: fixed ＋ inset: 0 の層   24ファイル
 *     z-index の値                      14種類（45 / 200 / 300 / 310 / 320 / 400 /
 *                                       1000 / 1001 / 1200 / 3000 / 5000 / 9998 / 9999）
 *     黒い幕（rgba(0,0,0,…)）            16件
 *     createPortal(                     18件
 *
 *   z-index の 1000 だけで9ファイルあり、310 と 320 の差が何を意味するのかは
 *   どこにも書いていなかった。さらに**下タブがネイティブになった**ことで、
 *   覆う層には「覆っていると名乗る」仕事（`useCoversScreen`）が増えた。
 *   24か所が忘れずに名乗る形は一本化ではなく**一覧**で、1つ忘れれば
 *   その上に下タブが残って押せてしまう。
 *
 * ■ここが引き受けるもの（呼ぶ側は何も書かない）
 *   ① `createPortal` で `<main>` の外へ（実機で下タブに食われない・`ScreenPortal` と同じ理由）
 *   ② `position: fixed` ＋ `inset: 0`
 *   ③ z-index は**名前の段**（`COVER`）から。数を画面に書かない
 *   ④ 黒い幕と、背景を押したときの閉じ方
 *   ⑤ **覆っていると名乗る**（呼び忘れようがない）
 *
 * ■中身の置き方
 *   この入れものが `inset: 0` の基準になるので、中の板は **`position: absolute`** で置く。
 *   `fixed` を書かないこと（`check-screen-portal` が落とす）。位置は同じになる。
 */

/**
 * 覆う層の**重なりの順**。数を画面に書かず、必ずここから引く。
 * ★増やすときは「何の上に出るのか」を決めてから足すこと。
 */
export const COVER = {
  /** メニューの幕（下タブより下） */
  menu: 45,
  /** 画面いっぱいの板（選手詳細・ドラフトの演出） */
  panel: 200,
  /** 下から出るシート */
  sheet: 300,
  /** 板やシートの上に出す確認 */
  modal: 400,
  /** 確認・お知らせ・報酬 */
  dialog: 1000,
  /** 画面をまるごと差し替える覆い（GMパス・声をかける・ロゴ選び） */
  page: 1200,
  /** 段位が上がった演出 */
  celebration: 3000,
  /** 先へ進めない関門（規約） */
  gate: 5000,
  /** 起動時のデータ更新 */
  boot: 9998,
  /** ローディング・強制アップデート・お知らせ（一番上） */
  blocking: 9999,
} as const

export type CoverLevel = keyof typeof COVER

export default function ScreenCover({
  level, bump = 0, onBackdrop, backdrop = 'dim', style, children,
}: {
  level: CoverLevel
  /**
   * **同じ段のもう1枚を、その上に重ねるとき**だけ使う（0〜9）。
   * 買い物の結果を確認の上に、声をかける相手のチャットを一覧の上に、など。
   * ★段を増やす代わりに使わないこと。役割が違うなら `COVER` に段を足す
   */
  bump?: number
  /** 背景を押したときに閉じる。渡さなければ押しても閉じない */
  onBackdrop?: () => void
  /** 幕の濃さ。`none` は幕なし（板そのものが画面を塗るときは `style` で塗る） */
  backdrop?: 'none' | 'dim' | 'dark' | 'blur' | 'opaque'
  /** 中身の並べ方など。**z-index と position は上書きしないこと** */
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  useCoversScreen()
  const bg =
    backdrop === 'none' ? undefined
    : backdrop === 'dim' ? 'rgba(0,0,0,0.6)'
    : backdrop === 'dark' ? 'rgba(0,0,0,0.85)'
    : backdrop === 'blur' ? 'rgba(0,0,0,0.7)'
    : 'rgba(4,12,26,0.97)'
  return createPortal((
    <div
      onClick={onBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: COVER[level] + bump,
        background: bg,
        ...(backdrop === 'blur' ? { backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' } : null),
        ...style,
      }}
    >
      {children}
    </div>
  ), document.body)
}
