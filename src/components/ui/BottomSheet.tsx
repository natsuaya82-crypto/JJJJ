import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../../styles/tokens'
import { useAdHeight } from '../layout/Layout'

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

  return createPortal((
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300 }}
      />
      <div
        className="sheet-up"
        style={{
          position: 'fixed', bottom: adH, left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: 480, zIndex: 301,
          background: C.surface, borderRadius: '18px 18px 0 0',
          border: `1px solid ${C.border2}`, borderBottom: 'none',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
          // border-box を付けないと width:100% に左右14pxのpaddingが足され、
          // 中身が画面の右へ28pxはみ出す（2列に並べたボタンの右列が切れる）
          boxSizing: 'border-box',
          padding: '8px 14px calc(18px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: C.border3, margin: '4px auto 10px' }} />
        {title && (
          <div style={{ fontSize: 12, fontWeight: 800, color: C.textSub, marginBottom: 10 }}>{title}</div>
        )}
        {children}
      </div>
    </>
  ), document.body)
}
