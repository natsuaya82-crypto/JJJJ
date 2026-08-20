import { useEffect } from 'react'
import { C, F } from '../../styles/tokens'
import { useAdHeight } from '../layout/Layout'
import ScreenCover from './ScreenCover'

// 画面下から出るシートの入れもの。中身だけを渡す。
//
// ★必ずこれを使うこと。ページの中に position:fixed で自前のシートを書くと、実機で下タブに
//   食われて操作できなくなる。
//
//   Layout の <main> は -webkit-overflow-scrolling:touch のスクロール領域で、iOS の WebView は
//   これを position:fixed の基準（包含ブロック兼スタック文脈）にしてしまう。そのため main の中に
//   書いた fixed は
//     ・inset:0 にしても画面全体ではなく main の内側しか覆わない（ヘッダーと下タブが暗くならない）
//     ・z-index をいくつにしても、外にいる下タブ(z:50)より上に来られない
//   という状態になる。build 87 の走友会「反応する」シートは、これで見出ししか見えなかった。
//
//   createPortal で <main> の外（document.body）に出せば、fixed が本来の viewport 基準に戻る。
//   下端は広告バナーの高さ(adH)とセーフエリアぶんだけ持ち上げる。ここは ActionSheet と同じ扱い。
export default function BottomSheet({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  /** シートの見出し。省略するとつまみだけ */
  title?: string
  children: React.ReactNode
}) {
  const adH = useAdHeight()

  // 表示中は後ろのページのスクロールを止める
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return (
    <ScreenCover level="sheet" onBackdrop={onClose}>
      <div
        className="sheet-up"
        onClick={e => e.stopPropagation()}
        style={{
          // ★覆い(ScreenCover)が inset:0 の基準なので、中身は absolute で置く（位置は同じ）
          position: 'absolute', bottom: adH, left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: 480,
          background: C.surface,
          border: `1px solid ${C.border2}`, borderBottom: 'none',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
          // border-box を付けないと width:100% に左右14pxのpaddingが足され、
          // 中身が画面の右へ28pxはみ出す（2列に並べたボタンの右列が切れる）
          boxSizing: 'border-box',
          padding: '8px 14px calc(18px + env(safe-area-inset-bottom))',
          // ★**高さの上限と、中身のスクロール。**
          //   これが無いと、中身が長いシートは**画面の上へ突き抜ける**。実機では
          //   見出しがステータスバーに潜り込み、上のほうは指で出すこともできなかった
          //   （ランクマッチの遊びかたで実際に起きた）。fixed で下から生えているので、
          //   背が伸びるぶんは全部上へ出ていく。**シートを増やすたびに起きる**ので、
          //   画面側ではなくここで止める。
          //   ★**広告の高さ(adH)を引くのを忘れないこと。** シートは bottom:adH から
          //     生えるので、上限に adH を入れないとそのぶん上へはみ出す。
          //   上に残す余白はステータスバー（safe-area）＋24px。
          maxHeight: `calc(100dvh - ${adH}px - env(safe-area-inset-top) - 24px)`,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ width: 38, height: 4,background: C.border3, margin: '4px auto 10px', flexShrink: 0 }} />
        {title && (
          <div style={{ fontSize: F.body, fontWeight: 800, color: C.textSub, marginBottom: 10, flexShrink: 0 }}>{title}</div>
        )}
        {/* つまみと見出しは動かさず、中身だけスクロールさせる */}
        <div style={{
          minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}>{children}</div>
      </div>
    </ScreenCover>
  )
}
