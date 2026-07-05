import { useLoadingStore } from '../../store/loadingStore'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 全画面ローディング（Tipsなし・スピナーのみ）。App直下に常駐。
export default function LoadingOverlay() {
  const active = useLoadingStore(s => s.active)
  const label = useLoadingStore(s => s.label)
  if (!active) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(6,14,26,0.92)', backdropFilter: 'blur(2px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
      fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        border: `4px solid ${alpha(C.gold, 0.18)}`, borderTopColor: C.gold,
        animation: 'jpel-spin 0.7s linear infinite',
      }}/>
      <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, letterSpacing: '3px', color: C.gold }}>JPEL</div>
      {label && <div style={{ fontSize: 12, color: C.textSub }}>{label}</div>}
    </div>
  )
}
