import GlassButton from '../ui/GlassButton'
import { C, SAIRA, F } from '../../styles/tokens'
import type { Player } from '../../types'
import BottomSheet from '../ui/BottomSheet'
import { LOAN_SLOTS } from '../../utils/bidGate'


// レンタル要請の下部シート。移籍市場・他チームタブ共通。
export default function LoanSheet({ player, slots, pending, onSubmit, onClose }: {
  player: Player
  slots: number
  pending: boolean
  onSubmit: (years: number) => void
  onClose: () => void
}) {
  const full = slots >= LOAN_SLOTS

  return (
    <BottomSheet open onClose={onClose}>
      <div style={{ fontSize: F.bodyLg, fontWeight: 800, color: C.text, marginBottom: 4 }}>{player.name} をレンタル</div>
      <div style={{ fontSize: F.caption, color: C.textDim, marginBottom: 14, fontFamily: SAIRA }}>買わずに借りる（レンタル枠 {slots}/{LOAN_SLOTS}・移籍金なし・給与は自チーム負担）。期間を選んで要請（次レースで回答）。</div>
      {pending ? (
        <div style={{ fontSize: F.bodyLg, color: C.blue, fontWeight: 700, textAlign: 'center', padding: 12 }}>レンタル要請中 — 次レースで回答</div>
      ) : full ? (
        <div style={{ fontSize: F.bodyLg, color: C.red, fontWeight: 700, textAlign: 'center', padding: 12 }}>レンタル枠が満杯です（{LOAN_SLOTS}/{LOAN_SLOTS}）</div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          {[1, 2].map(y => (
            <GlassButton key={y} onClick={() => onSubmit(y)} color={C.blue} size="lg" style={{ flex: 1 }}>
              {y}年契約
            </GlassButton>
          ))}
        </div>
      )}
      <GlassButton onClick={onClose} color={C.textDim} full style={{ marginTop: 12 }}>キャンセル</GlassButton>
    </BottomSheet>
  )
}
