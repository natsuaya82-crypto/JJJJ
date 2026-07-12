import { useState } from 'react'
import { useAdHeight } from '../layout/Layout'
import NumberDial from '../ui/NumberDial'
import { calcTransferValue } from '../../utils/playerUtils'
import { transferBidBase, transferAcceptChance } from '../../data/economy'
import { C } from '../../styles/tokens'
import type { Player, TransferListing } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
function fmt(yen: number) { return yen >= 100000000 ? `${(yen / 100000000).toFixed(1)}億` : `${Math.round(yen / 10000)}万` }

// 移籍金オファーの下部シート（成立確率つき）。移籍市場・他チームタブ共通。
export default function BidSheet({ player, budget, listing, onSubmit, onClose }: {
  player: Player
  budget: number
  listing?: TransferListing
  onSubmit: (fee: number) => void
  onClose: () => void
}) {
  const adH = useAdHeight()
  const val = calcTransferValue(player)
  const initFee = listing
    ? Math.round(listing.askingPrice * 0.82 / 500000) * 500000
    : Math.round(val * 0.85 / 500000) * 500000
  const [fee, setFee] = useState(Math.max(1_000_000, initFee))
  const base = transferBidBase(val, !!listing, player.contract.yearsLeft <= 1)
  const chancePct = Math.round(transferAcceptChance(fee, base) * 100)
  const over = fee > budget

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div className="sheet-up" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '85vh', overflowY: 'auto', background: C.surface, borderRadius: '18px 18px 0 0', border: `1px solid ${C.border2}`, borderBottom: 'none', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)', paddingTop: 8, paddingLeft: 16, paddingRight: 16, paddingBottom: `calc(16px + env(safe-area-inset-bottom) + ${adH + 50}px)` }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: C.border3, margin: '4px auto 12px' }} />
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 8 }}>{player.name} へ入札</div>
        <div style={{ fontSize: '10px', color: C.textSub, marginBottom: '8px', fontFamily: SAIRA }}>
          入札金額 — 市場価値: <span style={{ color: C.gold, fontFamily: SAIRA }}>{fmt(val)}</span>
          {listing && <span style={{ marginLeft: '8px', color: C.orange, fontFamily: SAIRA }}>クラブ希望: {fmt(listing.askingPrice)}</span>}
          <span style={{ marginLeft: '8px', color: over ? C.red : C.textDim, fontFamily: SAIRA }}>予算: {fmt(budget)}</span>
        </div>
        <div style={{ padding: '4px 0 10px' }}>
          <NumberDial value={fee} onChange={v => setFee(Math.max(1000000, v))} min={1000000} accent={C.gold} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: 11, color: C.textSub, fontFamily: SAIRA }}>成立見込み</span>
          <span style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: chancePct >= 70 ? C.green : chancePct >= 35 ? C.gold : C.red }}>{chancePct}%</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => onSubmit(fee)} disabled={over}
            style={{ flex: 1, padding: '13px', borderRadius: '11px', border: 'none', background: over ? C.surface2 : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, color: over ? C.textGhost : C.gold, fontSize: '14px', fontWeight: '900', cursor: over ? 'default' : 'pointer', fontFamily: SAIRA, boxShadow: over ? 'none' : '0 4px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.08)' } as React.CSSProperties}>
            {over ? '予算不足' : '入札する'}
          </button>
          <button onClick={onClose} style={{ padding: '13px 16px', borderRadius: '10px', border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, fontSize: '13px', cursor: 'pointer', fontFamily: SAIRA }}>取消</button>
        </div>
      </div>
    </div>
  )
}
