import IntroModal from './IntroModal'

const X_URL = 'https://x.com/JPEL_MANAGER'

// 初回起動時に一度だけ表示する公式Xフォロー案内。App.tsx が表示制御する。
// ★枠は `IntroModal` 1本（アップデートのお知らせポップと同じ形）。
export default function TwitterModal({ onClose }: { onClose: () => void }) {
  return (
    <IntroModal
      icon={
        <div style={{ width: 56, height: 56, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
      }
      title="公式Xをフォロー"
      body={'アップデート情報やお得なお知らせを\nいち早くお届けします。'}
      actionLabel="@JPEL_MANAGER をフォロー"
      onAction={() => { window.open(X_URL, '_blank'); onClose() }}
      onClose={onClose}
    />
  )
}
