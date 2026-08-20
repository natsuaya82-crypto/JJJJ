import { C, CARD, F, glassStyle } from '../../styles/tokens'
import ScreenCover from './ScreenCover'
const APP_STORE_URL = 'https://apps.apple.com/jp/app/jpel-manager/id6779638017'

export default function ForceUpdateModal() {
  return (
    <ScreenCover level="blocking" backdrop="opaque"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{
        width: '100%', maxWidth: '360px',
        background: '#12101e',
        border: `1px solid ${CARD.border}`,
        padding: '36px 28px',
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
          {/* 更新アイコン（絵文字禁止のためSVG） */}
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 12a8 8 0 1 1-2.34-5.66"
              stroke={C.gold} strokeWidth="2" strokeLinecap="round"
            />
            <path d="M18.5 2.5v4h-4" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{
          fontSize: F.titleLg, fontWeight: 700,
          color: C.gold, letterSpacing: '0.05em',
          marginBottom: '12px',
        }}>
          アップデートが必要です
        </div>
        <div style={{
          fontSize: F.bodyLg, color: '#8B879E', lineHeight: 1.7,
          marginBottom: '28px',
        }}>
          新しいバージョンが配信されました。{'\n'}
          引き続きプレイするにはアップデートしてください。
        </div>
        {/* ★見た目は `glassStyle` 1本（押すボタンと同じ配合）。
            金でベタ塗りして黒い字、は 2026-08-13 にやめている（`check-ui-tokens` の⑩）。
            ここだけ色を直書きしていたので網に映らず、飴玉のまま残っていた。
            `GlassButton` にしないのは、これが `<a href>`（外部アプリを開く）だから */}
        <a
          href={APP_STORE_URL}
          style={{
            display: 'block',
            fontWeight: 900,
            fontSize: F.subLg,
            padding: '14px 0',
            textDecoration: 'none',
            letterSpacing: '0.05em',
            ...glassStyle(C.gold),
          }}
        >
          App Store でアップデート
        </a>
      </div>
    </ScreenCover>
  )
}
