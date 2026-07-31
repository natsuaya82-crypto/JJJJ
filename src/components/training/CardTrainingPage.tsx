import { useState, useMemo, useEffect, useRef } from 'react'
import BackButton from '../ui/BackButton'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import type { CardStatKey } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, ratingColor, SPEC_COLOR, isStatMaxed, getStatPotentials, limitBreakCost } from '../../utils/playerUtils'
import {
  CARD_STAT_LABELS,
  detectCombo, MAX_FUSION_CARDS,
} from '../../utils/cardCombo'
import { C, alpha } from '../../styles/tokens'
import { CardTrainingHeaderSVG } from '../icons/StatIcons'
import PlayerFace from '../player/PlayerFace'
import PlayerRow from '../player/PlayerRow'
import TrainingCardSVG from './TrainingCardSVG'
import { audio } from '../../utils/audio'
import { showRewardAd, getAdDay } from '../../utils/ads'
import ConfirmDialog from '../ui/ConfirmDialog'
import { useAdHeight } from '../layout/Layout'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const PURPLE = '#A855F7'
const statKeys: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
// 種類数 → メニュー倍率（表示用。実効値は cardCombo.ts と一致）
const MENU_MULT_LABEL: Record<number, string> = { 2: '1.2', 3: '1.4', 4: '1.6', 5: '1.8' }

function requiredExp(level: number): number {
  const dull = level < 80 ? 1 : level < 90 ? 2 : 4   // gameStoreのrequiredExpForLevelと常に一致させる
  return Math.floor(0.5 * level * level * dull)
}

export default function CardTrainingPage() {
  const navigate = useNavigate()
  const adH = useAdHeight()
  const {
    trainingCards, players, playerTeamId, applyTrainingCards, dismissDroppedCards,
    fusionPlayerId, fusionCardIds, setFusionPlayer, removeFusionCard, clearFusion,
    openPlayerSheet, jewels, breakStatLimit, useDailyGreatSuccess,
  } = useGameStore()
  // 買い切り版の「大成功確約 1日1回」が今日まだ残っているか（区切りは朝10時）
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  const premiumGreatDate = useGameStore(s => s.premiumGreatDate)
  const freeGreatReady = adsRemoved && premiumGreatDate !== getAdDay()

  const [searchParams] = useSearchParams()

  // 長押しで選手詳細を表示。タップは選手選択。
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpFired = useRef(false)
  const selectHandlers = (pid: string) => ({
    onPointerDown: () => {
      lpFired.current = false
      lpTimer.current = setTimeout(() => { lpFired.current = true; openPlayerSheet(pid) }, 450)
    },
    onPointerUp: () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } },
    onPointerLeave: () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } },
    onPointerMove: () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } },
    onClick: () => { if (lpFired.current) { lpFired.current = false; return } selectPlayer(pid) },
  })

  useEffect(() => {
    dismissDroppedCards()
    // カード練習を直接開いたら前回の選手選択/合成状態をリセット（?player ディープリンク時は除く）
    if (!searchParams.get('player')) clearFusion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // URLの ?player とストアの合成状態を同期。履歴で戻って ?player が消えたら合成状態を破棄する。
  useEffect(() => {
    const pid = searchParams.get('player')
    if (pid) {
      if (mainPlayers.some(p => p.id === pid)) {
        if (pid !== fusionPlayerId) setFusionPlayer(pid)
      } else {
        navigate('/cards', { replace: true }) // 無効なidは選手選択へ
      }
    } else if (fusionPlayerId) {
      clearFusion()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const [applied, setApplied] = useState<{ combo: NonNullable<ReturnType<typeof detectCombo>>; traitGranted: boolean; greatSuccess: boolean; preRatings: Partial<Record<CardStatKey, number>>; preExp: Partial<Record<CardStatKey, number>> } | null>(null)
  const [adWatched, setAdWatched] = useState(false)
  const [adConfirmOpen, setAdConfirmOpen] = useState(false)
  // 買い切り版の無料確約を「この合成に使う」と選んだ状態（実行時に消費）
  const [useFreeGreat, setUseFreeGreat] = useState(false)
  // 上限解放：MAXの能力をタップ→確認ダイアログでジュエル消費して上限+1
  const [limitBreakStat, setLimitBreakStat] = useState<CardStatKey | null>(null)
  const [barAnimated, setBarAnimated] = useState(false)

  useEffect(() => {
    if (!applied) { setBarAnimated(false); return }
    const t = setTimeout(() => setBarAnimated(true), 80)
    return () => clearTimeout(t)
  }, [applied])

  const mainPlayers = useMemo(
    // レンタル加入選手(loan付き＝他チーム所有)は育成対象外。カード合成できないように除外する。
    () => players.filter(p => p.teamId === playerTeamId && p.status !== 'retired' && !p.loan).sort((a, b) => ovr(b) - ovr(a)),
    [players, playerTeamId]
  )

  // 選択順を保ったカード配列（合成スロット表示用）。存在しないid（stale）は除外。
  const selectedCards = useMemo(
    () => fusionCardIds.map(id => trainingCards.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c),
    [trainingCards, fusionCardIds]
  )

  const combo = useMemo(() => detectCombo(selectedCards), [selectedCards])
  // 画面遷移(STEP1↔STEP2)はURLの ?player で表す＝戻るボタンが履歴ベースで自然に効く
  const targetPlayer = useMemo(() => {
    const pid = searchParams.get('player')
    return pid ? players.find(p => p.id === pid) : undefined
  }, [players, searchParams])
  const isMenu = !!combo && combo.name !== '通常合成'
  const fatigueDelta = combo?.fatigueDelta ?? 0
  // レシピ倍率バッジは能力カード（rest以外）の種類数で決まる。完全休養/超回復はEXP倍率を出さない。
  const distinctCount = useMemo(() => new Set(selectedCards.filter(c => c.kind !== 'rest').map(c => c.statKey)).size, [selectedCards])

  function selectPlayer(id: string) {
    setApplied(null)
    setFusionPlayer(id)
    navigate(`/cards?player=${id}`) // 履歴に積む → 戻るで選手選択へ戻れる
  }

  function removeCard(id: string) {
    setApplied(null)
    removeFusionCard(id)
  }

  function handleApply() {
    const cardIds = selectedCards.map(c => c.id)
    if (!targetPlayer || cardIds.length === 0 || !combo) return
    const preRatings: Partial<Record<CardStatKey, number>> = {}
    const preExp: Partial<Record<CardStatKey, number>> = {}
    statKeys.forEach(k => {
      preRatings[k] = (targetPlayer.ratings as Record<CardStatKey, number>)[k] ?? 0
      preExp[k] = (targetPlayer.exp ?? {})[k] ?? 0
    })
    // 広告視聴済みならそちらで確約。無料確約(買い切り版1日1回)は選んだときだけ消費する
    const freeUsed = !adWatched && useFreeGreat && useDailyGreatSuccess()
    const greatSuccess = adWatched || freeUsed || Math.random() < 0.05
    const multiplier = greatSuccess ? 1.5 : 1.0
    const willTrait = !!(combo.traitGrant && combo.traitChance && Math.random() < combo.traitChance)
    applyTrainingCards(targetPlayer.id, cardIds, willTrait, multiplier)
    setApplied({ combo, traitGranted: willTrait, greatSuccess, preRatings, preExp })
    setAdWatched(false)
    setUseFreeGreat(false)
    // 選手は残してカードだけクリア（合成完了オーバーレイを表示し続けるため。選手を消すとSTEP1に戻って結果が消える）
    setFusionPlayer(targetPlayer.id)
    audio.playSe(greatSuccess ? 'great_success' : 'levelup')
  }

  const canApply = !!targetPlayer && selectedCards.length > 0 && !!combo

  const sharedHeader = (onBack: () => void, backLabel?: string) => (
    <div style={{
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      padding: '12px 16px 12px',
      borderBottom: `2px solid ${C.border2}`,
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(PURPLE, 0.3)}, transparent)`, pointerEvents: 'none' }}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton onClick={onBack}/>
        {backLabel && <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 700, color: C.textSub }}>{backLabel}</div>}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: PURPLE, letterSpacing: '3px', fontWeight: 900, marginBottom: 1 }}>CARD TRAINING</div>
            <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.text }}>カード練習</div>
          </div>
          <CardTrainingHeaderSVG width={60} height={43} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            padding: '4px 10px', borderRadius: 20,
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${alpha(PURPLE, 0.5)}`,
            boxShadow: `0 2px 0 ${alpha(PURPLE, 0.3)}`,
          }}>
            <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: PURPLE }}>{trainingCards.length}</span>
            <span style={{ fontFamily: SAIRA, fontSize: 9, color: C.textSub }}> 枚</span>
          </div>
          <button
            onClick={() => navigate('/cards/list')}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${C.goldDark}`,
              boxShadow: `0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.08)`,
              color: C.gold, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >一覧</button>
        </div>
      </div>
    </div>
  )

  // ── STEP 1: Player selection ──────────────────────────────────
  if (!targetPlayer) {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", color: C.text, paddingBottom: 80 }}>
        {sharedHeader(() => navigate(-1))}

        <div style={{ padding: '14px 14px 6px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: PURPLE, letterSpacing: '3px', fontWeight: 900, marginBottom: 2 }}>STEP 1</div>
          <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text }}>練習する選手を選ぶ</div>
        </div>

        <div style={{ padding: '6px 12px' }}>
          {mainPlayers.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: C.textDim }}>選手がいません</div>
          )}
          {mainPlayers.map(p => (
            <PlayerRow
              key={p.id}
              player={p}
              handlers={selectHandlers(p.id)}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── STEP 2: Fusion (パズドラ風) ────────────────────────────────
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", color: C.text }}>
      {adConfirmOpen && (
        <ConfirmDialog
          title="動画を見ますか？"
          message="動画を最後まで見ると、今回の合成が必ず大成功になります（通常5%）。"
          confirmLabel="動画を見る"
          accent={PURPLE}
          onConfirm={async () => { setAdConfirmOpen(false); if (await showRewardAd()) setAdWatched(true) }}
          onCancel={() => setAdConfirmOpen(false)}
        />
      )}
      {limitBreakStat && (() => {
        const cap = (getStatPotentials(targetPlayer) as Record<string, number>)[limitBreakStat]
        if (cap >= 99) return null
        const cost = limitBreakCost(cap + 1)
        const enough = (jewels ?? 0) >= cost
        return (
          <ConfirmDialog
            title={enough ? '上限解放' : 'ジュエルが足りません'}
            message={enough
              ? `${CARD_STAT_LABELS[limitBreakStat]}の上限を ${cap} から ${cap + 1} に解放します。${cost}ジュエルを消費します（所持 ${jewels}）。`
              : `${CARD_STAT_LABELS[limitBreakStat]}の上限解放には ${cost}ジュエル必要です（所持 ${jewels ?? 0}）。`}
            confirmLabel={enough ? '解放する' : '閉じる'}
            accent={C.gold}
            onConfirm={() => {
              if (enough) {
                breakStatLimit(targetPlayer.id, limitBreakStat)
                audio.playSe('levelup')
              }
              setLimitBreakStat(null)
            }}
            onCancel={() => setLimitBreakStat(null)}
          />
        )
      })()}
      {sharedHeader(() => navigate(-1))}

      {/* 本文はスクロール領域に入れる：カード選択で下部が伸びても選手バナー（EXPバー）が潰れて隠れないように。
          縦が足りない端末ではこの領域だけスクロールし、実行バーは常に下部に固定 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

      {/* Selected player banner */}
      <div style={{
        margin: '12px 14px 0',
        padding: '10px 14px', borderRadius: 12,
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${C.goldDark}`,
        boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`,
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{ position: 'absolute', inset: 3, border: `1px solid rgba(245,200,66,0.18)`, borderRadius: 9, pointerEvents: 'none' }}/>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(C.gold, 0.4)}, transparent)`, pointerEvents: 'none' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ flexShrink: 0, borderRadius: 10, overflow: 'hidden', border: `1px solid ${alpha(C.gold, 0.4)}` }}>
            <PlayerFace playerId={targetPlayer.id} nationality={targetPlayer.nationality} size={60} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{targetPlayer.name}</div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{targetPlayer.age}歳 · OVR {ovr(targetPlayer)}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
          {statKeys.map(k => {
            const current = targetPlayer.ratings[k] ?? 0
            const maxed = isStatMaxed(targetPlayer, k)
            const delta = combo?.statDeltas[k] ?? 0
            const curExp = targetPlayer.exp?.[k] ?? 0
            const req = requiredExp(current)
            const basePct = req > 0 ? Math.min(curExp / req, 1) : 1
            const gainExp = Math.min(curExp + delta, req)
            const gainPct = req > 0 ? Math.max(0, gainExp / req - basePct) : 0
            const levelUp = req > 0 && curExp + delta >= req
            const cap = (getStatPotentials(targetPlayer) as Record<string, number>)[k]
            const canBreak = maxed && cap < 99
            return (
              <div key={k} onClick={canBreak ? () => setLimitBreakStat(k) : undefined} style={{
                padding: '5px 6px', borderRadius: 6, textAlign: 'center',
                background: maxed ? alpha(C.gold, 0.1) : delta > 0 ? alpha('#9FE88D', 0.12) : alpha(C.surface, 0.8),
                border: `1px solid ${maxed ? alpha(C.gold, 0.4) : delta > 0 ? alpha('#9FE88D', 0.35) : C.border}`,
                cursor: canBreak ? 'pointer' : 'default',
              }}>
                <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, marginBottom: 2 }}>{CARD_STAT_LABELS[k]}</div>
                <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: maxed ? C.gold : delta > 0 ? '#9FE88D' : C.textSub, marginBottom: 4 }}>
                  {current}{maxed ? <span style={{ fontSize: 7, color: C.gold, marginLeft: 2 }}>MAX</span> : levelUp && <span style={{ fontSize: 8, color: '#9FE88D', marginLeft: 2 }}>↑</span>}
                </div>
                <div style={{ height: 3, borderRadius: 2, background: alpha(C.border, 0.8), overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${maxed ? 100 : basePct * 100}%`, background: maxed ? alpha(C.gold, 0.6) : alpha(C.textSub, 0.5), borderRadius: 2, transition: 'width 0.25s ease' }}/>
                  <div style={{ position: 'absolute', left: `${basePct * 100}%`, top: 0, height: '100%', width: `${maxed ? 0 : gainPct * 100}%`, background: '#9FE88D', borderRadius: 2, transition: 'left 0.25s ease, width 0.25s ease' }}/>
                </div>
                {canBreak && <div style={{ fontFamily: SAIRA, fontSize: 7, color: C.gold, marginTop: 3 }}>タップで上限解放</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Fusion slots */}
      <div style={{
        margin: '12px 14px 0', padding: '12px', borderRadius: 12,
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: isMenu ? `2px solid ${combo!.color}` : `2px solid ${C.border2}`,
        boxShadow: isMenu
          ? `0 4px 0 ${alpha(combo!.color, 0.4)}, 0 6px 16px ${alpha(combo!.color, 0.15)}`
          : `0 4px 0 rgba(0,0,0,0.5)`,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: PURPLE, letterSpacing: '2px', fontWeight: 900 }}>
            合成スロット <span style={{ color: C.textSub }}>{selectedCards.length}/{MAX_FUSION_CARDS}</span>
          </div>
          {isMenu && (
            <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: combo!.color, textShadow: `0 0 12px ${alpha(combo!.color, 0.5)}` }}>
              {combo!.name}
              {distinctCount >= 2 && (
                <span style={{ marginLeft: 8, fontSize: 12, background: `${combo!.color}33`, padding: '1px 7px', borderRadius: 5 }}>×{MENU_MULT_LABEL[distinctCount] ?? '1.0'}</span>
              )}
              {fatigueDelta > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, background: `${combo!.color}33`, padding: '1px 7px', borderRadius: 5 }}>疲労 -{fatigueDelta}</span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
          {Array.from({ length: MAX_FUSION_CARDS }).map((_, i) => {
            const card = selectedCards[i]
            if (card) {
              return (
                <button key={i} onClick={() => removeCard(card.id)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <TrainingCardSVG statKey={card.statKey} rarity={card.rarity} width={58} selected kind={card.kind} value={card.value} />
                </button>
              )
            }
            return (
              <button key={i} onClick={() => navigate('/cards/select')}
                style={{
                  flex: 1, aspectRatio: '58 / 81', maxWidth: 58, margin: '0 auto',
                  borderRadius: 9, border: `2px dashed ${C.border2}`,
                  background: alpha(C.surface, 0.5),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.textGhost, fontSize: 20, fontFamily: SAIRA, cursor: 'pointer',
                }}>+</button>
            )
          })}
        </div>

        <div style={{ marginTop: 8, textAlign: 'center', fontSize: 10, color: C.textDim }}>
          {selectedCards.length === 0
            ? '空きスロットをタップしてカードを選ぶ'
            : distinctCount === 0 && fatigueDelta > 0
            ? <>疲労を <span style={{ color: combo!.color, fontWeight: 800 }}>-{fatigueDelta}</span> 回復</>
            : combo?.name === '超回復'
            ? <>回復力EXP・疲労回復が <span style={{ color: combo!.color, fontWeight: 800 }}>×1.2</span>（疲労 -{fatigueDelta}）</>
            : isMenu
            ? <>能力EXPが <span style={{ color: combo!.color, fontWeight: 800 }}>×{MENU_MULT_LABEL[distinctCount] ?? '1.0'}</span> で入る{combo!.traitGrant ? `・${Math.round((combo!.traitChance ?? 0) * 100)}%でスキル付与` : ''}{fatigueDelta > 0 ? `・疲労 -${fatigueDelta}` : ''}</>
            : <>レシピ未成立 — 通常合成（ボーナスなし）{fatigueDelta > 0 ? `・疲労 -${fatigueDelta}` : ''}</>}
        </div>
      </div>

      {/* Ad option */}
      {canApply && (
        <div style={{ margin: '14px 14px 0', textAlign: 'center' }}>
          {adWatched ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 4px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold }} />
              <span style={{ fontSize: 11, color: C.gold }}>広告視聴済み — 大成功確定</span>
            </div>
          ) : useFreeGreat ? (
            // 買い切り版の無料確約をこの合成に使う（実行するまでは取り消せる）
            <button
              onClick={() => setUseFreeGreat(false)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                padding: '7px 14px', borderRadius: 999,
                background: `linear-gradient(180deg, ${alpha(C.gold, 0.22)}, ${alpha(C.gold, 0.08)})`,
                border: `1px solid ${alpha(C.gold, 0.5)}`,
                boxShadow: `0 2px 10px ${alpha(C.gold, 0.18)}`,
                fontFamily: 'inherit',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: C.gold }}>大成功確定（GMパス・本日1回）</span>
              <span style={{ fontSize: 10, color: alpha(C.gold, 0.55) }}>取消</span>
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {freeGreatReady && (
                <button
                  onClick={() => { setUseFreeGreat(true); audio.playSe('tap') }}
                  className="btn-press"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                    padding: '8px 16px', borderRadius: 999, marginBottom: 2,
                    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                    border: `1.5px solid ${alpha(C.gold, 0.6)}`,
                    boxShadow: `0 3px 0 #5a3500, 0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)`,
                    fontFamily: 'inherit',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M12 3l2.4 5.6 6 .5-4.6 3.9 1.4 5.9L12 15.8 6.8 18.9l1.4-5.9L3.6 9.1l6-.5z" fill={C.gold} />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 900, color: C.gold }}>無料で大成功にする（本日1回）</span>
                </button>
              )}
              <button
                onClick={() => setAdConfirmOpen(true)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 4px',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <rect x="2" y="4" width="20" height="16" rx="2.5" stroke={C.textDim} strokeWidth="1.8"/>
                  <path d="M10 9.5l5 2.5-5 2.5z" fill={C.textDim}/>
                </svg>
                <span style={{ fontSize: 11, color: C.textSub, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  広告を見て大成功（通常5%）
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* スクロール領域ここまで */}
      </div>

      {/* 下部固定の実行バー（スクロール領域の外・下タブ＋広告の上に常に表示） */}
      <div style={{
        padding: '12px 14px calc(14px + env(safe-area-inset-bottom, 0px))',
        background: `linear-gradient(180deg, ${alpha(C.bg, 0)}, ${C.bg} 24%)`,
        borderTop: `1px solid ${C.border}`,
      }}>
        <button
          onClick={handleApply}
          disabled={!canApply}
          style={{
            width: '100%', position: 'relative', overflow: 'hidden',
            background: !canApply
              ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`
              : isMenu
              ? `linear-gradient(180deg, ${alpha(combo!.color, 0.9)}, #7e22ce)`
              : `linear-gradient(180deg, #9333ea, #7e22ce)`,
            color: !canApply ? C.textGhost : '#fff',
            border: canApply ? `2px solid #c084fc` : `2px solid ${C.border2}`,
            borderRadius: 12, padding: '15px',
            boxShadow: canApply
              ? `0 5px 0 #4c1d95, 0 7px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.15)`
              : `0 3px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
            fontSize: 14, fontWeight: 800, cursor: canApply ? 'pointer' : 'not-allowed',
            fontFamily: SAIRA, letterSpacing: '1px',
          }}
        >
          {canApply && <span style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '40%', background: 'linear-gradient(180deg,rgba(255,255,255,0.18),transparent)', borderRadius: '6px 6px 50% 50%', pointerEvents: 'none' }} />}
          {selectedCards.length === 0 ? 'カードを選んでください' : '練習実行'}
        </button>
      </div>

      {/* Result overlay */}
      {applied && (
        <div
          onClick={() => setApplied(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 24,
          }}
        >
          <div style={{
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${applied.combo.color}`,
            borderRadius: 20, padding: 28,
            maxWidth: 340, width: '100%',
            textAlign: 'center',
            boxShadow: `0 6px 0 ${alpha(applied.combo.color, 0.35)}, 0 10px 40px ${alpha(applied.combo.color, 0.25)}, inset 0 1px 0 rgba(255,255,255,0.1)`,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(applied.combo.color, 0.2)}`, borderRadius: 16, pointerEvents: 'none' }}/>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(applied.combo.color, 0.6)}, transparent)`, pointerEvents: 'none' }}/>
            <div style={{ position: 'absolute', top: 2, left: 8, right: 8, height: '25%', background: `linear-gradient(180deg, rgba(255,255,255,0.07), transparent)`, borderRadius: '12px 12px 50% 50%', pointerEvents: 'none' }}/>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: applied.combo.color, letterSpacing: 3, marginBottom: 4, fontWeight: 900 }}>
              {applied.combo.isSpecial ? 'COMBO CLEAR' : '合成完了'}
            </div>
            {applied.greatSuccess && (
              <div style={{
                marginBottom: 14,
                background: `linear-gradient(180deg, ${alpha('#F59E0B', 0.2)}, ${alpha('#F59E0B', 0.08)})`,
                border: `2px solid #F59E0B`,
                borderRadius: 12, padding: '8px 16px',
                fontFamily: SAIRA, fontSize: 22, fontWeight: 900,
                color: '#F59E0B', letterSpacing: 3,
                textShadow: `0 0 20px ${alpha('#F59E0B', 0.6)}`,
                boxShadow: `0 4px 0 ${alpha('#F59E0B', 0.3)}, 0 6px 20px ${alpha('#F59E0B', 0.15)}`,
              }}>
                大成功！
              </div>
            )}
            <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: applied.combo.color, marginBottom: 18, textShadow: `0 0 20px ${alpha(applied.combo.color, 0.6)}` }}>
              {applied.combo.name}
            </div>
            {/* Animated exp bars */}
            <div style={{ width: '100%', marginBottom: 14 }}>
              {statKeys.filter(k => (applied.combo.statDeltas[k] ?? 0) > 0).map(k => {
                const preLevel = applied.preRatings[k] ?? 0
                const preExpVal = applied.preExp[k] ?? 0
                const rawDelta = applied.combo.statDeltas[k] ?? 0
                const effectiveDelta = applied.greatSuccess ? Math.round(rawDelta * 1.5) : rawDelta
                const preReq = requiredExp(preLevel)
                const levelUp = preReq > 0 && (preExpVal + effectiveDelta >= preReq)
                const prePct = preReq > 0 ? Math.min(preExpVal / preReq, 1) : 1
                const targetPct = levelUp ? 1 : (preReq > 0 ? Math.min((preExpVal + effectiveDelta) / preReq, 1) : 1)
                const postLevel = (targetPlayer?.ratings as Record<CardStatKey, number> | undefined)?.[k] ?? (levelUp ? preLevel + 1 : preLevel)
                return (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>{CARD_STAT_LABELS[k]}</span>
                      <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: levelUp ? '#9FE88D' : C.text }}>
                        {levelUp ? `${preLevel} → ${postLevel}` : preLevel}
                        {levelUp && <span style={{ fontFamily: SAIRA, fontSize: 8, color: '#9FE88D', marginLeft: 4, letterSpacing: 1 }}>LV UP</span>}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: alpha(C.border, 0.9), overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${prePct * 100}%`, background: alpha(C.textSub, 0.4), borderRadius: 3 }} />
                      <div style={{
                        position: 'absolute', left: `${prePct * 100}%`, top: 0, height: '100%',
                        width: barAnimated ? `${Math.max(0, targetPct - prePct) * 100}%` : '0%',
                        background: levelUp ? '#9FE88D' : PURPLE,
                        borderRadius: 3,
                        transition: 'width 0.55s cubic-bezier(0.34,1.56,0.64,1)',
                        boxShadow: barAnimated ? `0 0 6px ${levelUp ? alpha('#9FE88D', 0.6) : alpha(PURPLE, 0.6)}` : 'none',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {(applied.combo.fatigueDelta ?? 0) > 0 && (
              <div style={{
                marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: alpha(applied.combo.color, 0.12),
                border: `1.5px solid ${alpha(applied.combo.color, 0.5)}`,
                borderRadius: 10, padding: '9px 16px',
              }}>
                <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textSub }}>疲労回復</span>
                <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: applied.combo.color, textShadow: `0 0 10px ${alpha(applied.combo.color, 0.5)}` }}>
                  -{applied.greatSuccess ? Math.round((applied.combo.fatigueDelta ?? 0) * 1.5) : (applied.combo.fatigueDelta ?? 0)}
                </span>
              </div>
            )}
            {applied.traitGranted && applied.combo.traitGrant && (
              <div style={{
                background: `linear-gradient(180deg, ${alpha(C.gold, 0.18)}, ${alpha(C.gold, 0.08)})`,
                border: `2px solid ${C.goldDark}`,
                boxShadow: `0 3px 0 #5a3500, 0 5px 14px ${alpha(C.gold, 0.2)}`,
                borderRadius: 10, padding: '9px 16px',
                fontFamily: SAIRA, fontSize: 14, color: C.gold, fontWeight: 900, marginBottom: 14,
                textShadow: `0 0 10px ${alpha(C.gold, 0.5)}`,
              }}>
                スキル獲得！
              </div>
            )}
            <button
              onClick={() => setApplied(null)}
              style={{
                marginTop: 8, width: '100%',
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${C.border2}`,
                borderRadius: 10, padding: '12px',
                boxShadow: `0 3px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)`,
                fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.text, cursor: 'pointer',
                letterSpacing: '2px',
              }}
            >閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
