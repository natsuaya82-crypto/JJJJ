import { useAdHeight } from '../layout/Layout'
import { C, alpha, SAIRA, F, bottomStack } from '../../styles/tokens'
import type { Player } from '../../types'
import ScreenCover from '../ui/ScreenCover'


// レンタル要請の下部シート。移籍市場・他チームタブ共通。
export default function LoanSheet({ player, slots, pending, onSubmit, onClose }: {
  player: Player
  slots: number
  pending: boolean
  onSubmit: (years: number) => void
  onClose: () => void
}) {
  const adH = useAdHeight()
  const full = slots >= 3

  return (
    <ScreenCover level="sheet" onBackdrop={onClose}
      style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div className="sheet-up" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '85vh', overflowY: 'auto', background: C.surface,border: `1px solid ${C.border2}`, borderBottom: 'none', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)', paddingTop: 8, paddingLeft: 16, paddingRight: 16, paddingBottom: bottomStack(adH, { aboveNav: true, extra: 16 }) }}>
        <div style={{ width: 38, height: 4,background: C.border3, margin: '4px auto 12px' }} />
        <div style={{ fontSize: F.bodyLg, fontWeight: 800, color: C.text, marginBottom: 4 }}>{player.name} をレンタル</div>
        <div style={{ fontSize: F.caption, color: C.textDim, marginBottom: 14, fontFamily: SAIRA }}>買わずに借りる（レンタル枠 {slots}/3・移籍金なし・給与は自チーム負担）。期間を選んで要請（次レースで回答）。</div>
        {pending ? (
          <div style={{ fontSize: F.bodyLg, color: C.blue, fontWeight: 700, textAlign: 'center', padding: 12 }}>レンタル要請中 — 次レースで回答</div>
        ) : full ? (
          <div style={{ fontSize: F.bodyLg, color: C.red, fontWeight: 700, textAlign: 'center', padding: 12 }}>レンタル枠が満杯です（3/3）</div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            {[1, 2].map(y => (
              <button key={y} onClick={() => onSubmit(y)}
                style={{ flex: 1, padding: '14px',border: `1.5px solid ${alpha(C.blue, 0.5)}`, background: alpha(C.blue, 0.12), color: C.blue, fontSize: F.subLg, fontWeight: 800, cursor: 'pointer', fontFamily: SAIRA }}>
                {y}年契約
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ display: 'block', width: '100%', marginTop: 12, padding: '13px',border: `1px solid ${C.border}`, background: C.surface2, color: C.textDim, fontSize: F.sub, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>キャンセル</button>
      </div>
    </ScreenCover>
  )
}
