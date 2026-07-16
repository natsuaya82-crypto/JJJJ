import { useState } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { CardRarity } from '../../types'
import { RARITY_LABELS, RARITY_COLORS } from '../../utils/cardCombo'
import { C, alpha } from '../../styles/tokens'
import TrainingCardSVG from './TrainingCardSVG'
import ConfirmDialog from '../ui/ConfirmDialog'
import { audio } from '../../utils/audio'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 一括変換のレート（EXP等価・ロスなし。store側convertCardsと一致させる）
const CONVERT_RATE = {
  normal: { need: 4, produce: 1, to: 'rare' as CardRarity },
  rare:   { need: 10, produce: 3, to: 'epic' as CardRarity },
  epic:   { need: 5, produce: 2, to: 'legendary' as CardRarity },
} as const
type ConvertRarity = keyof typeof CONVERT_RATE

// カード変換ページ：余ったカードをEXP等価で上位レアにまとめて変換する
export default function CardConvertPage() {
  const { trainingCards, convertCards } = useGameStore()
  const [convertTarget, setConvertTarget] = useState<ConvertRarity | null>(null)
  const [lastResult, setLastResult] = useState<{ to: CardRarity; n: number } | null>(null)

  const countOf = (r: ConvertRarity) => trainingCards.filter(c => c.rarity === r && c.kind !== 'rest').length

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: SAIRA, color: C.text, paddingBottom: 80 }}>
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackButton/>
        <div>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: '#A855F7', letterSpacing: 3, fontWeight: 900 }}>CARD CONVERT</div>
          <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900 }}>カード変換</div>
        </div>
      </div>
      <div style={{ padding: '0 16px 14px', fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
        余ったカードをEXP等価で上位レアにまとめて変換します（変換後の種類はランダム・完全休養は対象外）。
      </div>

      {lastResult && (
        <div style={{ margin: '0 14px 12px', padding: '10px 14px', borderRadius: 12, textAlign: 'center', background: alpha(RARITY_COLORS[lastResult.to], 0.12), border: `1px solid ${alpha(RARITY_COLORS[lastResult.to], 0.45)}`, fontSize: 12, fontWeight: 800, color: RARITY_COLORS[lastResult.to] }}>
          {RARITY_LABELS[lastResult.to]}カードを{lastResult.n}枚獲得しました
        </div>
      )}

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(Object.keys(CONVERT_RATE) as ConvertRarity[]).map(r => {
          const rate = CONVERT_RATE[r]
          const count = countOf(r)
          const bundles = Math.floor(count / rate.need)
          const fromCol = RARITY_COLORS[r]
          const toCol = RARITY_COLORS[rate.to]
          return (
            <div key={r} style={{
              borderRadius: 16, padding: '14px 16px', position: 'relative', overflow: 'hidden',
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${alpha(toCol, 0.5)}`,
              boxShadow: `0 4px 0 ${alpha(toCol, 0.25)}, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(toCol, 0.15)}`, borderRadius: 12, pointerEvents: 'none' }}/>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, position: 'relative' }}>
                <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900 }}>
                  <span style={{ color: fromCol }}>{RARITY_LABELS[r]}</span>
                  <span style={{ color: C.textGhost, margin: '0 6px' }}>→</span>
                  <span style={{ color: toCol }}>{RARITY_LABELS[rate.to]}</span>
                </div>
                <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>所持 <span style={{ color: C.text, fontWeight: 800 }}>{count}</span>枚</div>
              </div>

              {/* 変換イメージ：元カード×need → 先カード×produce */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrainingCardSVG statKey="speed" rarity={r} width={44} />
                  <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: fromCol }}>×{rate.need}</span>
                </div>
                <svg width="22" height="14" viewBox="0 0 24 16" fill="none"><path d="M2 8h17M14 2l6 6-6 6" stroke={C.textDim} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrainingCardSVG statKey="speed" rarity={rate.to} width={44} />
                  <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: toCol }}>×{rate.produce}</span>
                </div>
              </div>

              <button
                onClick={() => bundles > 0 && setConvertTarget(r)}
                disabled={bundles === 0}
                className={bundles > 0 ? 'btn-game btn-game--gold' : undefined}
                style={bundles > 0
                  ? { width: '100%', padding: '12px', fontFamily: SAIRA, fontSize: 13, fontWeight: 800 }
                  : { width: '100%', padding: '12px', borderRadius: 12, background: C.surface2, border: `1px solid ${C.border2}`, color: C.textGhost, fontFamily: SAIRA, fontSize: 12, fontWeight: 700, cursor: 'not-allowed' }}
              >
                {bundles > 0
                  ? `まとめて変換（${bundles * rate.need}枚 → ${bundles * rate.produce}枚）`
                  : `あと${rate.need - count % rate.need}枚で変換できます`}
              </button>
            </div>
          )
        })}
      </div>

      {convertTarget && (() => {
        const rate = CONVERT_RATE[convertTarget]
        const count = countOf(convertTarget)
        const bundles = Math.floor(count / rate.need)
        return (
          <ConfirmDialog
            title="カードを変換しますか？"
            message={`${RARITY_LABELS[convertTarget]}${bundles * rate.need}枚を消費して、${RARITY_LABELS[rate.to]}${bundles * rate.produce}枚（種類はランダム）に変換します。EXP合計は変わりません。`}
            confirmLabel="変換する"
            accent={RARITY_COLORS[rate.to]}
            onConfirm={() => {
              const n = convertCards(convertTarget)
              if (n > 0) {
                audio.playSe('levelup')
                setLastResult({ to: rate.to, n })
              }
              setConvertTarget(null)
            }}
            onCancel={() => setConvertTarget(null)}
          />
        )
      })()}
    </div>
  )
}
