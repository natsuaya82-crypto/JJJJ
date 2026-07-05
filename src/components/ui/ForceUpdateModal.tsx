const APP_STORE_URL = 'https://apps.apple.com/jp/app/jpel-manager/id6779638017'

export default function ForceUpdateModal() {
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
        background: '#12101e',
        border: '1px solid #2E2B42',
        borderRadius: '18px',
        padding: '36px 28px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '32px', marginBottom: '16px',
        }}>
          🔄
        </div>
        <div style={{
          fontSize: '18px', fontWeight: 700,
          color: '#F5C842', letterSpacing: '0.05em',
          marginBottom: '12px',
        }}>
          アップデートが必要です
        </div>
        <div style={{
          fontSize: '13px', color: '#8B879E', lineHeight: 1.7,
          marginBottom: '28px',
        }}>
          新しいバージョンが配信されました。{'\n'}
          引き続きプレイするにはアップデートしてください。
        </div>
        <a
          href={APP_STORE_URL}
          style={{
            display: 'block',
            background: '#F5C842',
            color: '#0a0818',
            fontWeight: 700,
            fontSize: '15px',
            padding: '14px 0',
            borderRadius: '12px',
            textDecoration: 'none',
            letterSpacing: '0.05em',
          }}
        >
          App Store でアップデート
        </a>
      </div>
    </div>
  )
}
