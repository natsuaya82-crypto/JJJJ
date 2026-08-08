import { useGameStore } from '../../store/gameStore'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { JewelIcon } from '../icons/Icons'

const JEWEL = '#6dd5fa'

/**
 * レース・シーズン終了で獲得したジュエルの内訳をホームで知らせるポップアップ。
 * 結果画面ではヘッダーのジュエル表示自体が隠れていて増減が見えないため、
 * ストアの jewelGains にためておき、ホームに戻ったこの画面でまとめて出す。
 * ジュエル自体はレース時点で加算済みなので、ここは表示と既読化（dismissJewelGains）だけを行う。
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

  return (
    <div onClick={dismiss} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${JEWEL}`, borderRadius: 20, padding: 24, maxWidth: 320, width: '100%', boxShadow: `0 6px 0 ${alpha(JEWEL, 0.35)}, 0 10px 40px ${alpha(JEWEL, 0.25)}` }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 12, color: JEWEL, letterSpacing: 3, fontWeight: 900, marginBottom: 6 }}>JEWEL</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
            <JewelIcon size={22} />
            <span style={{ fontFamily: SAIRA, fontSize: 30, fontWeight: 900, color: JEWEL, textShadow: `0 0 20px ${alpha(JEWEL, 0.6)}`, lineHeight: 1 }}>+{total}</span>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${alpha(JEWEL, 0.2)}`, borderRadius: 12, padding: '6px 12px', marginBottom: 16 }}>
          {merged.map((g, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: i === 0 ? 'none' : `1px solid ${alpha(JEWEL, 0.12)}` }}>
              <span style={{ fontSize: 12, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
              <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: JEWEL, flexShrink: 0 }}>+{g.amount}</span>
            </div>
          ))}
        </div>

        <button onClick={dismiss} style={{ width: '100%', padding: 13, borderRadius: 12, background: `linear-gradient(135deg, ${JEWEL}, #a8e4ff)`, border: 'none', color: '#062033', fontFamily: SAIRA, fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>OK</button>
      </div>
    </div>
  )
}
