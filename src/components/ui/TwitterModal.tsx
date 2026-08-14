import { C, alpha, F } from '../../styles/tokens'

const X_URL = 'https://x.com/JPEL_MANAGER'

// 初回起動時に一度だけ表示する公式Xフォロー案内。App.tsx が表示制御する。
export default function TwitterModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(4,12,26,0.97)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '360px',
        background: C.surface,
        border: `1px solid ${C.border2}`,
        padding: '32px 26px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56,margin: '0 auto 18px',
          background: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
        <div style={{ fontSize: F.titleLg, fontWeight: 800, color: C.text, marginBottom: '10px' }}>
          公式Xをフォロー
        </div>
        <div style={{ fontSize: F.bodyLg, color: C.textDim, lineHeight: 1.7, marginBottom: '26px', whiteSpace: 'pre-line' }}>
          {'アップデート情報やお得なお知らせを\nいち早くお届けします。'}
        </div>
        <a
          href={X_URL}
          onClick={onClose}
          style={{
            display: 'block',
            background: `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${alpha(C.gold, 0.04)})`,
            border: `1px solid ${alpha(C.gold, 0.65)}`,
            color: C.gold,
            fontWeight: 800,
            fontSize: F.subLg,
            padding: '14px 0',
            textDecoration: 'none',
            letterSpacing: '0.05em',
            marginBottom: '10px',
          }}
        >
          @JPEL_MANAGER をフォロー
        </a>
        <button
          onClick={onClose}
          style={{
            display: 'block', width: '100%',
            background: 'transparent', border: 'none',
            color: C.textDim, fontSize: F.bodyLg, padding: '8px 0',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          あとで
        </button>
      </div>
    </div>
  )
}
