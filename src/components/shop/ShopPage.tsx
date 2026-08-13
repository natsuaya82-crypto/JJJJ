import { createPortal } from 'react-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { CardRarity, TrainingCard } from '../../types'
import { useState } from 'react'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { cardPackPrice } from '../../data/cardShop'
import { RARITY_COLORS, RARITY_LABELS, CARD_NAMES } from '../../utils/cardCombo'
import { JewelIcon } from '../icons/Icons'
import GlassButton from '../ui/GlassButton'
import { panelStyle } from '../ui/Panel'



// 値段は data/cardShop.ts の1本から出す（1枚あたり × 枚数）。
// 以前はここにパックの値段を直書きしていて、ストア側の1枚あたりの値段と
// 掛け算がたまたま合っているだけだった
const CARD_SHOP: { rarity: CardRarity; labelJP: string; desc: string; price: number; cards: number }[] = [
  { rarity: 'normal',    labelJP: 'ノーマルパック',   desc: '強化カードを5枚獲得',         price: cardPackPrice('normal', 5),    cards: 5 },
  { rarity: 'rare',      labelJP: 'レアパック',       desc: 'レア以上を含む4枚を獲得',     price: cardPackPrice('rare', 4),      cards: 4 },
  { rarity: 'epic',      labelJP: 'エピックパック',   desc: '高コンボ倍率カードを3枚獲得', price: cardPackPrice('epic', 3),      cards: 3 },
  { rarity: 'legendary', labelJP: 'レジェンドパック', desc: '最高レアを2枚確定獲得',       price: cardPackPrice('legendary', 2), cards: 2 },
]

const QTY_OPTIONS = [1, 3, 5, 10] as const

type ShopItem = typeof CARD_SHOP[number]

function CardIcon({ size = 40, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 40 52" fill="none">
      <rect x="2" y="2" width="36" height="48" rx="5" fill={`url(#cg_${color.replace('#', '')})`} stroke={color} strokeWidth="1.5" opacity="0.9"/>
      <defs>
        <linearGradient id={`cg_${color.replace('#', '')}`} x1="2" y1="2" x2="38" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.06"/>
        </linearGradient>
      </defs>
      <rect x="6" y="8" width="28" height="4" rx="2" fill={color} opacity="0.5"/>
      <rect x="6" y="15" width="20" height="3" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="6" y="21" width="16" height="3" rx="1.5" fill={color} opacity="0.3"/>
      <path d="M20 32l2.5 5 5.5.8-4 3.9.95 5.5L20 44.5l-4.95 2.7.95-5.5-4-3.9 5.5-.8z" fill={color} opacity="0.85"/>
    </svg>
  )
}

function ConfirmModal({ item, jewels, onConfirm, onCancel }: {
  item: ShopItem
  jewels: number
  onConfirm: (qty: number) => void
  onCancel: () => void
}) {
  const col = RARITY_COLORS[item.rarity]
  const [qty, setQty] = useState<typeof QTY_OPTIONS[number]>(1)
  const total = item.price * qty
  const after = jewels - total
  const canAfford = after >= 0

  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 20px',
    }} onClick={onCancel}>
      <div style={{
        width: '100%', maxWidth: 360,
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${alpha(col, 0.5)}`,
        borderRadius: 18,
        boxShadow: `0 0 40px ${alpha(col, 0.2)}, 0 8px 32px rgba(0,0,0,0.6)`,
        padding: '22px 20px 18px',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ filter: `drop-shadow(0 0 10px ${alpha(col, 0.6)})` }}>
            <CardIcon size={44} color={col} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: col, letterSpacing: '2px', fontWeight: 900, marginBottom: 4 }}>購入確認</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>{item.labelJP}</div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{item.desc}</div>
          </div>
        </div>

        {/* Qty selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {QTY_OPTIONS.map(q => {
            const affordable = (jewels ?? 0) >= item.price * q
            const selected = qty === q
            return (
              <GlassButton key={q} color={selected ? col : C.textDim} disabled={!affordable} style={{
                flex: 1, padding: '7px 0', fontFamily: SAIRA, fontSize: 13, fontWeight: selected ? 900 : 600,
              }} onClick={() => affordable && setQty(q)}>
                {q}×
              </GlassButton>
            )
          })}
        </div>

        {/* Price breakdown */}
        <div style={{
          background: alpha(C.bg, 0.6), border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.textDim }}>費用（{qty}枚）</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <JewelIcon size={12}/>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#6dd5fa' }}>{total.toLocaleString()}</span>
            </div>
          </div>
          <div style={{ height: 1, background: C.border }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.textDim }}>所持</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <JewelIcon size={12}/>
              <span style={{ fontSize: 13, color: C.textSub }}>{jewels.toLocaleString()}</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: C.textDim }}>購入後</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <JewelIcon size={12}/>
              <span style={{ fontSize: 13, color: canAfford ? C.textSub : C.red }}>{after.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '11px', borderRadius: 10,
            background: C.surface, border: `1px solid ${C.border}`,
            color: C.textDim, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: SAIRA,
          }}>
            キャンセル
          </button>
          <GlassButton color={col} disabled={!canAfford} style={{
            flex: 2, padding: '11px', fontSize: 13, fontFamily: SAIRA,
          }} onClick={() => canAfford && onConfirm(qty)}>
            購入する
          </GlassButton>
        </div>
      </div>
    </div>
  ), document.body)
}

function ResultModal({ cards, onClose }: { cards: TrainingCard[]; onClose: () => void }) {
  const col = cards[0] ? RARITY_COLORS[cards[0].rarity] : C.gold
  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1001,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 20px',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 360,
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${alpha(col, 0.5)}`,
        borderRadius: 18,
        boxShadow: `0 0 40px ${alpha(col, 0.15)}, 0 8px 32px rgba(0,0,0,0.6)`,
        padding: '20px 18px 16px',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ fontSize: 9, color: col, letterSpacing: '3px', fontWeight: 900, marginBottom: 4 }}>RESULT</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: C.text, marginBottom: 14 }}>
          {RARITY_LABELS[cards[0]?.rarity ?? 'normal']} × {cards.length}枚 獲得
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {cards.map(card => {
            const c = RARITY_COLORS[card.rarity]
            return (
              <div key={card.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 10,
                background: alpha(c, 0.07), border: `1px solid ${alpha(c, 0.25)}`,
              }}>
                <div style={{ filter: `drop-shadow(0 0 5px ${alpha(c, 0.5)})` }}>
                  <CardIcon size={24} color={c} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                    {CARD_NAMES[card.statKey]}
                  </span>
                </div>
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 5, fontWeight: 800,
                  background: alpha(c, 0.18), color: c, border: `1px solid ${alpha(c, 0.35)}`,
                }}>
                  {RARITY_LABELS[card.rarity]}
                </span>
              </div>
            )
          })}
        </div>

        <GlassButton full color={col} style={{ padding: '11px', fontSize: 13, fontFamily: SAIRA }} onClick={onClose}>
          閉じる
        </GlassButton>
      </div>
    </div>
  ), document.body)
}

export default function ShopPage() {
  const { buyTrainingCard, jewels } = useGameStore()
  const [pendingItem, setPendingItem] = useState<ShopItem | null>(null)
  const [resultCards, setResultCards] = useState<TrainingCard[] | null>(null)

  const handleConfirm = (qty: number) => {
    if (!pendingItem) return
    const cards = buyTrainingCard(pendingItem.rarity, qty * pendingItem.cards)
    setPendingItem(null)
    if (cards) setResultCards(cards)
  }

  const jewelsColor = jewels > 500 ? '#6dd5fa' : jewels > 0 ? C.gold : C.red

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 80, minHeight: '100dvh' }}>

      {pendingItem && (
        <ConfirmModal
          item={pendingItem}
          jewels={jewels}
          onConfirm={handleConfirm}
          onCancel={() => setPendingItem(null)}
        />
      )}

      {resultCards && (
        <ResultModal cards={resultCards} onClose={() => setResultCards(null)} />
      )}

      {/* Header */}
      <div style={{ background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, padding: '12px 16px 10px', borderBottom: `1px solid ${C.border2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BackButton/>
            <div>
              <div style={{ fontSize: 9, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 2 }}>SHOP</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>ショップ</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, background: alpha('#6dd5fa', 0.08), border: `1px solid ${alpha('#6dd5fa', 0.25)}` }}>
            <JewelIcon size={16}/>
            <span style={{ fontSize: 20, fontWeight: 900, color: jewelsColor, textShadow: `0 0 10px ${alpha(jewelsColor, 0.5)}` }}>
              {jewels.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Training cards */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '3px', fontWeight: 900, marginBottom: 2 }}>
          開封するとランダムなステータスカードが1枚獲得できます
        </div>
        {CARD_SHOP.map(item => {
          const col = RARITY_COLORS[item.rarity]
          const canAfford = (jewels ?? 0) >= item.price
          return (
            <div key={item.rarity} style={panelStyle(col)}>
              <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flexShrink: 0, filter: `drop-shadow(0 0 8px ${alpha(col, 0.5)})` }}>
                  <CardIcon size={40} color={col} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: C.text }}>{item.labelJP}</span>
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 5, background: alpha(col, 0.18), color: col, fontWeight: 800, border: `1px solid ${alpha(col, 0.35)}` }}>
                      {RARITY_LABELS[item.rarity]}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>{item.desc}</div>
                  <div style={{ fontSize: 9, color: C.textGhost }}>
                    対象: {Object.values(CARD_NAMES).join(' / ')}
                  </div>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <JewelIcon size={14}/>
                  <span style={{ fontSize: 18, fontWeight: 900, color: canAfford ? '#6dd5fa' : C.red, textShadow: canAfford ? `0 0 8px ${alpha('#6dd5fa', 0.5)}` : 'none' }}>
                    {item.price.toLocaleString()}
                  </span>
                </div>
              </div>
              <div style={{ padding: '0 10px 10px' }}>
                <GlassButton
                  full color={col} disabled={!canAfford}
                  style={{ padding: '10px', fontSize: 13, fontFamily: SAIRA }}
                  onClick={() => canAfford && setPendingItem(item)}
                >
                  {canAfford ? '購入する' : 'ジュエル不足'}
                </GlassButton>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
