import { createPortal } from 'react-dom'
import { useGameStore } from '../../store/gameStore'
import { C, alpha, SAIRA, F } from '../../styles/tokens'
import { JewelIcon } from '../icons/Icons'
import GlassButton from './GlassButton'
import { panelStyle } from './Panel'

const JEWEL = C.jewel

/**
 * レース・シーズン終了で獲得したジュエルの内訳をホームで知らせるポップアップ。
 * 結果画面ではヘッダーのジュエル表示自体が隠れていて増減が見えないため、
 * ストアの jewelGains にためておき、ホームに戻ったこの画面でまとめて出す。
 * ジュエル自体はレース時点で加算済みなので、ここは表示と既読化（dismissJewelGains）だけを行う。
 *
 * ★呼び出し元がどのページの中にいても、必ず document.body 直下（<main> の外）に
 *   出すこと。理由は ConfirmDialog.tsx / BottomSheet.tsx と同じ。
 */
export default function JewelGainPopup() {
  const gains = useGameStore(s => s.jewelGains) ?? []
  const dismiss = useGameStore(s => s.dismissJewelGains)
  if (gains.length === 0) return null

  const total = gains.reduce((s, g) => s + g.amount, 0)
  // 同じ内訳が複数レース分たまったときは1行にまとめる（「区間賞×2」が2行並ばないように）
  const merged: { label: string; amount: number }[] = []
  for (const g of gains) {
    const hit = merged.find(m => m.label === g.label)
    if (hit) hit.amount += g.amount
    else merged.push({ ...g })
  }

  return createPortal((
    <div onClick={dismiss} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...panelStyle(JEWEL), padding: 24, maxWidth: 320, width: '100%', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 40px ${alpha(JEWEL, 0.25)}` }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.body, color: JEWEL, letterSpacing: 3, fontWeight: 900, marginBottom: 6 }}>JEWEL</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
            <JewelIcon size={22} />
            <span style={{ fontFamily: SAIRA, fontSize: 30, fontWeight: 900, color: JEWEL, textShadow: `0 0 20px ${alpha(JEWEL, 0.6)}`, lineHeight: 1 }}>+{total}</span>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${alpha(JEWEL, 0.2)}`, padding: '6px 12px', marginBottom: 16 }}>
          {merged.map((g, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: i === 0 ? 'none' : `1px solid ${alpha(JEWEL, 0.12)}` }}>
              <span style={{ fontSize: F.body, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
              <span style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 900, color: JEWEL, flexShrink: 0 }}>+{g.amount}</span>
            </div>
          ))}
        </div>

        <GlassButton full color={JEWEL} onClick={dismiss} style={{ padding: 13, fontFamily: SAIRA, fontSize: F.sub }}>OK</GlassButton>
      </div>
    </div>
  ), document.body)
}
