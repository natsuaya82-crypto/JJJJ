import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { greatSuccessChance, activeEvents } from '../../data/events'
import { comparePlayers } from '../../utils/playerSort'
import PageHeader from '../ui/PageHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import type { CardStatKey } from '../../types'
import { ovr, isStatMaxed, getStatPotentials, limitBreakCost } from '../../utils/playerUtils'
import {
  CARD_STAT_LABELS,
  detectCombo, MAX_FUSION_CARDS,
} from '../../utils/cardCombo'
import { C, alpha, glassStyle, SAIRA, FONT, PURPLE, F, insideMainBottom } from '../../styles/tokens'
import { CardTrainingHeaderSVG } from '../icons/StatIcons'
import PlayerFace from '../player/PlayerFace'
import PlayerRow from '../player/PlayerRow'
import TrainingCardSVG from './TrainingCardSVG'
import { audio } from '../../utils/audio'
import { showRewardAd, getAdDay } from '../../utils/ads'
import ConfirmDialog from '../ui/ConfirmDialog'
import { GmPassSheet, IAP_ENABLED } from '../shared/GmPassSheet'
import { requiredExpForLevel } from '../../engine/growth'
import GlassButton from '../ui/GlassButton'
import { panelStyle } from '../ui/Panel'
import PlayerList from '../player/PlayerList'
import { useCoversScreen } from '../../lib/screenCover'

const statKeys: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
// 種類数 → メニュー倍率（表示用。実効値は cardCombo.ts と一致）
const MENU_MULT_LABEL: Record<number, string> = { 2: '1.2', 3: '1.4', 4: '1.6', 5: '1.8' }

export default function CardTrainingPage() {
  const navigate = useNavigate()
  const {
    trainingCards, players, playerTeamId, applyTrainingCards, dismissDroppedCards,
    fusionPlayerId, fusionCardIds, setFusionPlayer, removeFusionCard, clearFusion,
    openPlayerSheet, jewels, breakStatLimit, claimDailyGreatSuccess,
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

  const [applied, setApplied] = useState<{ combo: NonNullable<ReturnType<typeof detectCombo>>; greatSuccess: boolean; preRatings: Partial<Record<CardStatKey, number>>; preExp: Partial<Record<CardStatKey, number>> } | null>(null)
  useCoversScreen(!!applied)
  const [adWatched, setAdWatched] = useState(false)
  const [adConfirmOpen, setAdConfirmOpen] = useState(false)
  const [gmPassOpen, setGmPassOpen] = useState(false)   // GMパス購入シート（未購入者向けの案内から開く）
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
    () => players.filter(p => p.teamId === playerTeamId && p.status !== 'retired' && !p.loan).sort(comparePlayers('ovr')),
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
    const freeUsed = !adWatched && useFreeGreat && claimDailyGreatSuccess()
    // 大成功の確率は data/events の1本（期間限定イベント中は100%になる）
    const greatSuccess = adWatched || freeUsed || Math.random() < greatSuccessChance()
    const multiplier = greatSuccess ? 1.5 : 1.0
    applyTrainingCards(targetPlayer.id, cardIds, multiplier)
    setApplied({ combo, greatSuccess, preRatings, preExp })
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
      {/* 開催中のイベント（data/events の1本。終わったら自動的に消える） */}
      {activeEvents().map(ev => (
        <div key={ev.id} style={{
          marginBottom: 8, padding: '6px 10px',
          background: `linear-gradient(180deg, ${alpha(C.gold, 0.18)}, ${alpha(C.gold, 0.08)})`,
          border: `1px solid ${alpha(C.gold, 0.5)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ fontSize: F.label, fontWeight: 900, color: C.gold }}>{ev.title}</span>
          <span style={{ fontSize: F.tiny, color: C.textDim }}>{ev.to.slice(5).replace('-', '/')}まで</span>
        </div>
      ))}
      <PageHeader
        eyebrow={backLabel ? `CARD TRAINING — ${backLabel}` : 'CARD TRAINING'}
        title="カード練習"
        icon={<CardTrainingHeaderSVG width={60} height={43} />}
        onBack={onBack}
        right={<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            padding: '4px 10px',
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `1px solid ${alpha(PURPLE, 0.5)}`,
          }}>
            <span style={{ fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 900, color: PURPLE }}>{trainingCards.length}</span>
            <span style={{ fontFamily: SAIRA, fontSize: F.tiny, color: C.textSub }}> 枚</span>
          </div>
          <GlassButton size="sm" style={{ padding: '6px 12px' }} onClick={() => navigate('/cards/list')}>一覧</GlassButton>
        </div>}
      />
    </div>
  )

  // ── STEP 1: Player selection ──────────────────────────────────
  if (!targetPlayer) {
    return (
      <div style={{ minHeight: '100dvh', fontFamily: FONT, color: C.text, paddingBottom: 80 }}>
        {sharedHeader(() => navigate(-1))}

        <div style={{ padding: '14px 14px 6px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.tiny, color: PURPLE, letterSpacing: '3px', fontWeight: 900, marginBottom: 2 }}>STEP 1</div>
          <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: 900, color: C.text }}>練習する選手を選ぶ</div>
        </div>

        <PlayerList style={{ padding: '6px 12px' }}>
          {mainPlayers.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', fontSize: F.bodyLg, color: C.textDim }}>選手がいません</div>
          )}
          {mainPlayers.map(p => (
            <PlayerRow
              key={p.id}
              player={p}
              handlers={selectHandlers(p.id)}
            />
          ))}
        </PlayerList>
      </div>
    )
  }

  // ── STEP 2: Fusion (パズドラ風) ────────────────────────────────
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: FONT, color: C.text }}>
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
      {gmPassOpen && <GmPassSheet onClose={() => setGmPassOpen(false)} />}
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
      <div style={{ ...panelStyle(C.gold), margin: '12px 14px 0', padding: '10px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ flexShrink: 0,overflow: 'hidden', border: `1px solid ${alpha(C.gold, 0.4)}` }}>
            <PlayerFace playerId={targetPlayer.id} nationality={targetPlayer.nationality} size={60} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: F.subLg, fontWeight: 700, color: C.text }}>{targetPlayer.name}</div>
            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textDim }}>{targetPlayer.age}歳 · OVR {ovr(targetPlayer)}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
          {statKeys.map(k => {
            const current = targetPlayer.ratings[k] ?? 0
            const maxed = isStatMaxed(targetPlayer, k)
            const delta = combo?.statDeltas[k] ?? 0
            const curExp = targetPlayer.exp?.[k] ?? 0
            const req = requiredExpForLevel(current)
            const basePct = req > 0 ? Math.min(curExp / req, 1) : 1
            const gainExp = Math.min(curExp + delta, req)
            const gainPct = req > 0 ? Math.max(0, gainExp / req - basePct) : 0
            const levelUp = req > 0 && curExp + delta >= req
            const cap = (getStatPotentials(targetPlayer) as Record<string, number>)[k]
            const canBreak = maxed && cap < 99
            return (
              <div key={k} onClick={canBreak ? () => setLimitBreakStat(k) : undefined} style={{
                padding: '5px 6px',textAlign: 'center',
                background: maxed ? alpha(C.gold, 0.1) : delta > 0 ? alpha('#9FE88D', 0.12) : alpha(C.surface, 0.8),
                border: `1px solid ${maxed ? alpha(C.gold, 0.4) : delta > 0 ? alpha('#9FE88D', 0.35) : C.border}`,
                cursor: canBreak ? 'pointer' : 'default',
              }}>
                <div style={{ fontFamily: SAIRA, fontSize: F.micro, color: C.textDim, marginBottom: 2 }}>{CARD_STAT_LABELS[k]}</div>
                <div style={{ fontFamily: SAIRA, fontSize: F.body, fontWeight: 700, color: maxed ? C.gold : delta > 0 ? '#9FE88D' : C.textSub, marginBottom: 4 }}>
                  {current}{maxed ? <span style={{ fontSize: F.micro, color: C.gold, marginLeft: 2 }}>MAX</span> : levelUp && <span style={{ fontSize: F.micro, color: '#9FE88D', marginLeft: 2 }}>↑</span>}
                </div>
                <div style={{ height: 3,background: alpha(C.border, 0.8), overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${maxed ? 100 : basePct * 100}%`, background: maxed ? alpha(C.gold, 0.6) : alpha(C.textSub, 0.5),transition: 'width 0.25s ease' }}/>
                  <div style={{ position: 'absolute', left: `${basePct * 100}%`, top: 0, height: '100%', width: `${maxed ? 0 : gainPct * 100}%`, background: '#9FE88D',transition: 'left 0.25s ease, width 0.25s ease' }}/>
                </div>
                {canBreak && <div style={{ fontFamily: SAIRA, fontSize: F.micro, color: C.gold, marginTop: 3 }}>タップで上限解放</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Fusion slots */}
      <div style={{ ...panelStyle(isMenu ? combo!.color : C.border3), margin: '12px 14px 0', padding: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.tiny, color: PURPLE, letterSpacing: '2px', fontWeight: 900 }}>
            合成スロット <span style={{ color: C.textSub }}>{selectedCards.length}/{MAX_FUSION_CARDS}</span>
          </div>
          {isMenu && (
            <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: combo!.color, textShadow: `0 0 12px ${alpha(combo!.color, 0.5)}` }}>
              {combo!.name}
              {distinctCount >= 2 && (
                <span style={{ marginLeft: 8, fontSize: F.body, background: `${combo!.color}33`, padding: '1px 7px',}}>×{MENU_MULT_LABEL[distinctCount] ?? '1.0'}</span>
              )}
              {fatigueDelta > 0 && (
                <span style={{ marginLeft: 8, fontSize: F.body, background: `${combo!.color}33`, padding: '1px 7px',}}>疲労 -{fatigueDelta}</span>
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
border: `2px dashed ${C.border2}`,
                  background: alpha(C.surface, 0.5),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.textGhost, fontSize: F.head, fontFamily: SAIRA, cursor: 'pointer',
                }}>+</button>
            )
          })}
        </div>

        <div style={{ marginTop: 8, textAlign: 'center', fontSize: F.caption, color: C.textDim }}>
          {selectedCards.length === 0
            ? '空きスロットをタップしてカードを選ぶ'
            : distinctCount === 0 && fatigueDelta > 0
            ? <>疲労を <span style={{ color: combo!.color, fontWeight: 800 }}>-{fatigueDelta}</span> 回復</>
            : combo?.name === '超回復'
            ? <>回復力EXP・疲労回復が <span style={{ color: combo!.color, fontWeight: 800 }}>×1.2</span>（疲労 -{fatigueDelta}）</>
            : isMenu
            ? <>能力EXPが <span style={{ color: combo!.color, fontWeight: 800 }}>×{MENU_MULT_LABEL[distinctCount] ?? '1.0'}</span> で入る{fatigueDelta > 0 ? `・疲労 -${fatigueDelta}` : ''}</>
            : <>レシピ未成立 — 通常合成（ボーナスなし）{fatigueDelta > 0 ? `・疲労 -${fatigueDelta}` : ''}</>}
        </div>
      </div>

      {/* Ad option */}
      {canApply && (
        <div style={{ margin: '14px 14px 0', textAlign: 'center' }}>
          {adWatched ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 4px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold }} />
              <span style={{ fontSize: F.label, color: C.gold }}>広告視聴済み — 大成功確定</span>
            </div>
          ) : useFreeGreat ? (
            // 買い切り版の無料確約をこの合成に使う（実行するまでは取り消せる）
            <button
              onClick={() => setUseFreeGreat(false)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                padding: '7px 14px',
                background: `linear-gradient(180deg, ${alpha(C.gold, 0.22)}, ${alpha(C.gold, 0.08)})`,
                border: `1px solid ${alpha(C.gold, 0.5)}`,
                boxShadow: `0 2px 10px ${alpha(C.gold, 0.18)}`,
                fontFamily: 'inherit',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold }} />
              <span style={{ fontSize: F.label, fontWeight: 800, color: C.gold }}>大成功確定（GMパス・本日1回）</span>
              <span style={{ fontSize: F.caption, color: alpha(C.gold, 0.85) }}>取消</span>
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {freeGreatReady && (
                <GlassButton style={{ gap: 7, padding: '8px 16px', marginBottom: 2 }} onClick={() => { setUseFreeGreat(true); audio.playSe('tap') }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M12 3l2.4 5.6 6 .5-4.6 3.9 1.4 5.9L12 15.8 6.8 18.9l1.4-5.9L3.6 9.1l6-.5z" fill={C.gold} />
                  </svg>
                  <span style={{ fontSize: F.body, fontWeight: 900, color: C.gold }}>無料で大成功にする（本日1回）</span>
                </GlassButton>
              )}
              {!adsRemoved && IAP_ENABLED && (
                <button
                  onClick={() => { setGmPassOpen(true); audio.playSe('tap') }}
                  className="btn-press"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                    padding: '8px 16px',marginBottom: 2,
                    background: `linear-gradient(180deg, ${alpha(C.gold, 0.14)}, ${alpha(C.gold, 0.04)})`,
                    border: `1.5px dashed ${alpha(C.gold, 0.5)}`,
                    fontFamily: 'inherit',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <rect x="4.5" y="10.5" width="15" height="10" rx="2" stroke={C.gold} strokeWidth="1.8"/>
                    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke={C.gold} strokeWidth="1.8"/>
                  </svg>
                  <span style={{ fontSize: F.label, fontWeight: 800, color: C.gold }}>GMパスなら毎日1回、無料で大成功確定</span>
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
                <span style={{ fontSize: F.label, color: C.textSub, textDecoration: 'underline', textUnderlineOffset: 2 }}>
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
        // ★下端に貼るものの位置は `bottomStack` 1本（下タブ＋広告＋セーフエリア）
        padding: '12px 14px',
        paddingBottom: insideMainBottom(14),
        background: `linear-gradient(180deg, ${alpha(C.bg, 0)}, ${C.bg} 24%)`,
        borderTop: `1px solid ${C.border}`,
      }}>
        <GlassButton
          full
          color={isMenu ? combo!.color : PURPLE}
          disabled={!canApply}
          onClick={handleApply}
          style={{ padding: '15px', fontSize: F.sub, fontFamily: SAIRA, letterSpacing: '1px' }}
        >
          {selectedCards.length === 0 ? 'カードを選んでください' : '練習実行'}
        </GlassButton>
      </div>

      {/* Result overlay */}
      {applied && createPortal((
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
            ...panelStyle(applied.combo.color),
            padding: 28, maxWidth: 340, width: '100%', textAlign: 'center',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 40px ${alpha(applied.combo.color, 0.25)}`,
          }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: applied.combo.color, letterSpacing: 3, marginBottom: 4, fontWeight: 900 }}>
              {applied.combo.isSpecial ? 'COMBO CLEAR' : '合成完了'}
            </div>
            {applied.greatSuccess && (
              <div style={{
                marginBottom: 14,
                background: `linear-gradient(180deg, ${alpha(C.amber, 0.2)}, ${alpha(C.amber, 0.08)})`,
                border: `1px solid ${C.amber}`,
                padding: '8px 16px',
                fontFamily: SAIRA, fontSize: F.headLg, fontWeight: 900,
                color: C.amber, letterSpacing: 3,
                textShadow: `0 0 20px ${alpha(C.amber, 0.6)}`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 20px ${alpha(C.amber, 0.15)}`,
              }}>
                大成功！
              </div>
            )}
            <div style={{ fontFamily: SAIRA, fontSize: F.hero, fontWeight: 900, color: applied.combo.color, marginBottom: 18, textShadow: `0 0 20px ${alpha(applied.combo.color, 0.6)}` }}>
              {applied.combo.name}
            </div>
            {/* Animated exp bars */}
            <div style={{ width: '100%', marginBottom: 14 }}>
              {statKeys.filter(k => (applied.combo.statDeltas[k] ?? 0) > 0).map(k => {
                const preLevel = applied.preRatings[k] ?? 0
                const preExpVal = applied.preExp[k] ?? 0
                const rawDelta = applied.combo.statDeltas[k] ?? 0
                const effectiveDelta = applied.greatSuccess ? Math.round(rawDelta * 1.5) : rawDelta
                const preReq = requiredExpForLevel(preLevel)
                const levelUp = preReq > 0 && (preExpVal + effectiveDelta >= preReq)
                const prePct = preReq > 0 ? Math.min(preExpVal / preReq, 1) : 1
                const targetPct = levelUp ? 1 : (preReq > 0 ? Math.min((preExpVal + effectiveDelta) / preReq, 1) : 1)
                const postLevel = (targetPlayer?.ratings as Record<CardStatKey, number> | undefined)?.[k] ?? (levelUp ? preLevel + 1 : preLevel)
                return (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textSub }}>{CARD_STAT_LABELS[k]}</span>
                      <span style={{ fontFamily: SAIRA, fontSize: F.body, fontWeight: 800, color: levelUp ? '#9FE88D' : C.text }}>
                        {levelUp ? `${preLevel} → ${postLevel}` : preLevel}
                        {levelUp && <span style={{ fontFamily: SAIRA, fontSize: F.micro, color: '#9FE88D', marginLeft: 4, letterSpacing: 1 }}>LV UP</span>}
                      </span>
                    </div>
                    <div style={{ height: 6,background: alpha(C.border, 0.9), overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${prePct * 100}%`, background: alpha(C.textSub, 0.4),}} />
                      <div style={{
                        position: 'absolute', left: `${prePct * 100}%`, top: 0, height: '100%',
                        width: barAnimated ? `${Math.max(0, targetPct - prePct) * 100}%` : '0%',
                        background: levelUp ? '#9FE88D' : PURPLE,
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
padding: '9px 16px',
              }}>
                <span style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textSub }}>疲労回復</span>
                <span style={{ fontFamily: SAIRA, fontSize: F.titleLg, fontWeight: 900, color: applied.combo.color, textShadow: `0 0 10px ${alpha(applied.combo.color, 0.5)}` }}>
                  -{applied.greatSuccess ? Math.round((applied.combo.fatigueDelta ?? 0) * 1.5) : (applied.combo.fatigueDelta ?? 0)}
                </span>
              </div>
            )}
            <button
              onClick={() => setApplied(null)}
              style={{
                marginTop: 8, width: '100%',
                ...glassStyle(C.textSub),
padding: '12px',
                fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 800, color: C.text, cursor: 'pointer',
                letterSpacing: '2px',
              }}
            >閉じる</button>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
