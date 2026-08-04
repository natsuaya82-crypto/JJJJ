import { useState } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { CardRarity, CardStatKey } from '../../types'
import {
  RARITY_LABELS, RARITY_COLORS, REST_CARD_NAME, STAT_KEYS, CARD_NAMES,
  CARD_EXCHANGES, canPickStat, exchangeSource, type CardExchange,
} from '../../utils/cardCombo'
import { C, alpha } from '../../styles/tokens'
import TrainingCardSVG from './TrainingCardSVG'
import ConfirmDialog from '../ui/ConfirmDialog'
import { audio } from '../../utils/audio'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const REST_ACCENT = '#5EC8B8'

// カード変換ページ。
// レート（何枚で何枚か）はページにも store にも手書きせず、utils/cardCombo.ts の
// CARD_EXCHANGES だけを見る。上＝余りカードを上位レアへ、下＝完全休養の引き換え。
export default function CardConvertPage() {
  const { trainingCards, exchangeCards } = useGameStore()
  // 交換の確認中。完全休養からの交換だけ「もらう種類」を一緒に選ぶ
  const [confirming, setConfirming] = useState<{ ex: CardExchange; statKey: CardStatKey } | null>(null)
  const [lastResult, setLastResult] = useState<{ to: CardRarity; n: number } | null>(null)

  const upgrades = CARD_EXCHANGES.filter(ex => !ex.fromRest)
  const restTrades = CARD_EXCHANGES.filter(ex => ex.fromRest)

  const bundlesOf = (ex: CardExchange) => Math.floor(exchangeSource(trainingCards, ex).length / ex.need)

  const runExchange = (ex: CardExchange, statKey: CardStatKey) => {
    const n = exchangeCards(ex, statKey)
    if (n > 0) {
      audio.playSe('levelup')
      setLastResult({ to: ex.toRarity, n })
    }
    setConfirming(null)
  }

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
        {upgrades.map(ex => {
          const count = exchangeSource(trainingCards, ex).length
          const bundles = bundlesOf(ex)
          const fromCol = RARITY_COLORS[ex.fromRarity]
          const toCol = RARITY_COLORS[ex.toRarity]
          return (
            <div key={ex.fromRarity} style={{
              borderRadius: 16, padding: '14px 16px', position: 'relative', overflow: 'hidden',
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${alpha(toCol, 0.5)}`,
              boxShadow: `0 4px 0 ${alpha(toCol, 0.25)}, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(toCol, 0.15)}`, borderRadius: 12, pointerEvents: 'none' }}/>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, position: 'relative' }}>
                <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900 }}>
                  <span style={{ color: fromCol }}>{RARITY_LABELS[ex.fromRarity]}</span>
                  <span style={{ color: C.textGhost, margin: '0 6px' }}>→</span>
                  <span style={{ color: toCol }}>{RARITY_LABELS[ex.toRarity]}</span>
                </div>
                <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>所持 <span style={{ color: C.text, fontWeight: 800 }}>{count}</span>枚</div>
              </div>

              {/* 変換イメージ：元カード×need → 先カード×produce */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrainingCardSVG statKey="speed" rarity={ex.fromRarity} width={44} />
                  <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: fromCol }}>×{ex.need}</span>
                </div>
                <svg width="22" height="14" viewBox="0 0 24 16" fill="none"><path d="M2 8h17M14 2l6 6-6 6" stroke={C.textDim} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrainingCardSVG statKey="speed" rarity={ex.toRarity} width={44} />
                  <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: toCol }}>×{ex.produce}</span>
                </div>
              </div>

              <button
                onClick={() => bundles > 0 && setConfirming({ ex, statKey: 'speed' })}
                disabled={bundles === 0}
                className={bundles > 0 ? 'btn-game btn-game--gold' : undefined}
                style={bundles > 0
                  ? { width: '100%', padding: '12px', fontFamily: SAIRA, fontSize: 13, fontWeight: 800 }
                  : { width: '100%', padding: '12px', borderRadius: 12, background: C.surface2, border: `1px solid ${C.border2}`, color: C.textGhost, fontFamily: SAIRA, fontSize: 12, fontWeight: 700, cursor: 'not-allowed' }}
              >
                {bundles > 0
                  ? `まとめて変換（${bundles * ex.need}枚 → ${bundles * ex.produce}枚）`
                  : `あと${ex.need - count % ex.need}枚で変換できます`}
              </button>
            </div>
          )
        })}
      </div>

      {/* 完全休養は疲労回復にしか使えず余るので、同じレア度の好きなカードと引き換えられる */}
      <div style={{ padding: '20px 16px 8px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: REST_ACCENT }}>{REST_CARD_NAME}の引き換え</div>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6, marginTop: 4 }}>
          {REST_CARD_NAME}カード{restTrades[0].need}枚で、同じレア度の好きな練習カード1枚と交換できます。
        </div>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {restTrades.map(ex => {
          const count = exchangeSource(trainingCards, ex).length
          const bundles = bundlesOf(ex)
          const col = RARITY_COLORS[ex.fromRarity]
          return (
            <div key={`rest_${ex.fromRarity}`} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              borderRadius: 14, padding: '10px 12px',
              background: C.surface2, border: `1px solid ${alpha(col, bundles > 0 ? 0.45 : 0.18)}`,
            }}>
              <TrainingCardSVG statKey="recovery" rarity={ex.fromRarity} kind="rest" width={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: col }}>{RARITY_LABELS[ex.fromRarity]}</div>
                <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>所持 <span style={{ color: C.text, fontWeight: 800 }}>{count}</span>枚</div>
              </div>
              <button
                onClick={() => bundles > 0 && setConfirming({ ex, statKey: STAT_KEYS[0] })}
                disabled={bundles === 0}
                style={bundles > 0
                  ? { padding: '9px 14px', borderRadius: 11, background: alpha(col, 0.16), border: `2px solid ${alpha(col, 0.55)}`, color: col, fontFamily: SAIRA, fontSize: 12, fontWeight: 800, cursor: 'pointer' }
                  : { padding: '9px 14px', borderRadius: 11, background: 'transparent', border: `1px solid ${C.border2}`, color: C.textGhost, fontFamily: SAIRA, fontSize: 11, fontWeight: 700, cursor: 'not-allowed' }}
              >
                {bundles > 0 ? `交換（${bundles}枚ぶん）` : `あと${ex.need - count % ex.need}枚`}
              </button>
            </div>
          )
        })}
      </div>

      {confirming && (() => {
        const { ex, statKey } = confirming
        const bundles = bundlesOf(ex)
        const pick = canPickStat(ex)
        const accent = RARITY_COLORS[ex.toRarity]
        return (
          <ConfirmDialog
            title={pick ? 'もらうカードを選んでください' : 'カードを変換しますか？'}
            message={pick
              ? `${REST_CARD_NAME}（${RARITY_LABELS[ex.fromRarity]}）${bundles * ex.need}枚を消費して、${CARD_NAMES[statKey]}（${RARITY_LABELS[ex.toRarity]}）を${bundles * ex.produce}枚もらいます。`
              : `${RARITY_LABELS[ex.fromRarity]}${bundles * ex.need}枚を消費して、${RARITY_LABELS[ex.toRarity]}${bundles * ex.produce}枚（種類はランダム）に変換します。EXP合計は変わりません。`}
            confirmLabel={pick ? '交換する' : '変換する'}
            accent={accent}
            onConfirm={() => runExchange(ex, statKey)}
            onCancel={() => setConfirming(null)}
          >
            {pick && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, justifyItems: 'center' }}>
                {STAT_KEYS.map(k => (
                  <button key={k} onClick={() => setConfirming({ ex, statKey: k })}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}>
                    <TrainingCardSVG statKey={k} rarity={ex.toRarity} width={62} selected={k === statKey} dimmed={k !== statKey} />
                  </button>
                ))}
              </div>
            )}
          </ConfirmDialog>
        )
      })()}
    </div>
  )
}
