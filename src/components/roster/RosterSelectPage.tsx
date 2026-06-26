import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'

const MIN_MAIN = 16
const MAX_MAIN = 20
const FOOTER_BOTTOM = 114
const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function RosterSelectPage() {
  const navigate = useNavigate()
  const { players, playerTeamId, currentSeason, submitRoster, getRosterWindow } = useGameStore()
  const rosterWindow = getRosterWindow()

  const eligible = useMemo(() =>
    players
      .filter(p => p.teamId === playerTeamId && p.status !== 'retired')
      .sort((a, b) => ovr(b) - ovr(a)),
    [players, playerTeamId]
  )

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(eligible.filter(p => p.rosterTier === 'main').map(p => p.id))
  )
  const [jerseyMap, setJerseyMap] = useState<Record<string, number>>(
    () => Object.fromEntries(eligible.map(p => [p.id, p.jerseyNumber]))
  )

  const selectedCount = selected.size
  const secondCount = eligible.length - selectedCount
  const canSubmit = rosterWindow.open && selectedCount >= MIN_MAIN && selectedCount <= MAX_MAIN && secondCount <= 18

  function togglePlayer(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size <= MIN_MAIN) return prev
        next.delete(id)
      } else {
        if (next.size >= MAX_MAIN) return prev
        next.add(id)
      }
      return next
    })
  }

  function handleSubmit() {
    if (!canSubmit) return
    submitRoster(Array.from(selected), jerseyMap)
    navigate('/')
  }

  const countColor = selectedCount >= MIN_MAIN && selectedCount <= MAX_MAIN ? C.green : C.red

  return (
    <div style={{
      fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif",
      paddingBottom: `${FOOTER_BOTTOM + 80}px`,
      background: C.bg, minHeight: '100%',
    }}>
      <div style={{ padding: '8px 16px 0' }}>
        <BackButton onClick={() => navigate('/')}/>
      </div>

      <div style={{ padding: '4px 16px 12px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', marginBottom: 4, fontWeight: 700 }}>
          {currentSeason.year} PRE-SEASON
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 4 }}>
          スカッド編成・提出
        </div>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
          1軍 {MIN_MAIN}〜{MAX_MAIN}名を選出して提出。背番号も設定できます。
        </div>
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1px 1fr',
          background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
          border: `2px solid ${C.goldDark}`,
          borderRadius: 14,
          boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`,
          padding: '12px 4px',
          position: 'relative',
        }}>
          <div style={{ position: 'absolute', inset: 3, border: `1px solid rgba(245,200,66,0.2)`, borderRadius: 10, pointerEvents: 'none' }}/>
          <div style={{ textAlign: 'center', padding: '4px 0', position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '0.12em', marginBottom: 2 }}>1軍</div>
            <div style={{ fontFamily: SAIRA, fontSize: 28, fontWeight: 900, color: countColor, lineHeight: 1, textShadow: `0 0 10px ${alpha(countColor, 0.5)}` }}>
              {selectedCount}
              <span style={{ fontFamily: SAIRA, fontSize: 12, color: C.textDim, marginLeft: 2 }}>/{MAX_MAIN}</span>
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: selectedCount < MIN_MAIN ? C.red : C.green, marginTop: 3 }}>
              {selectedCount < MIN_MAIN ? `あと${MIN_MAIN - selectedCount}名` : '選出OK'}
            </div>
          </div>
          <div style={{ width: 1, background: `linear-gradient(180deg, transparent, ${C.goldDark}, transparent)`, alignSelf: 'stretch', margin: '6px 0' }}/>
          <div style={{ textAlign: 'center', padding: '4px 0', position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '0.12em', marginBottom: 2 }}>リザーブ</div>
            <div style={{ fontFamily: SAIRA, fontSize: 28, fontWeight: 900, color: secondCount > 18 ? C.red : C.textSub, lineHeight: 1 }}>
              {secondCount}
              <span style={{ fontFamily: SAIRA, fontSize: 12, color: C.textDim, marginLeft: 2 }}>/18</span>
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: secondCount > 18 ? C.red : C.textDim, marginTop: 3 }}>
              {secondCount > 18 ? '上限超過' : '問題なし'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 12px' }}>
        {eligible.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: C.textDim }}>
            選手がいません
          </div>
        )}
        {eligible.map(p => {
          const isSelected = selected.has(p.id)
          const rating = ovr(p)
          const specCol = SPEC_COLOR[p.specialty]
          const atMax = selected.size >= MAX_MAIN && !isSelected

          return (
            <div
              key={p.id}
              onClick={() => togglePlayer(p.id)}
              style={{
                marginBottom: 6, borderRadius: 14, overflow: 'hidden',
                background: isSelected
                  ? `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`
                  : `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
                border: isSelected ? `2px solid ${C.goldDark}` : `1px solid ${C.border2}`,
                boxShadow: isSelected
                  ? `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)`
                  : `0 1px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)`,
                opacity: atMax ? 0.4 : 1,
                cursor: atMax ? 'not-allowed' : 'pointer',
                padding: '10px 12px 7px',
                position: 'relative',
              }}
            >
              {isSelected && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(C.gold, 0.3)}, transparent)`, pointerEvents: 'none' }}/>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{
                  flexShrink: 0, borderRadius: 8, overflow: 'hidden',
                  border: isSelected ? `1.5px solid ${alpha(C.gold, 0.5)}` : `1px solid ${C.border2}`,
                  boxShadow: isSelected ? `0 0 8px ${alpha(C.gold, 0.3)}` : 'none',
                  opacity: atMax ? 0.5 : 1,
                }}>
                  <PlayerFace playerId={p.id} nationality={p.nationality} size={56} />
                </div>

                {isSelected ? (
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={jerseyMap[p.id] ?? p.jerseyNumber}
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '')
                      const v = Math.min(99, Math.max(1, parseInt(raw) || 1))
                      setJerseyMap(prev => ({ ...prev, [p.id]: v }))
                    }}
                    style={{
                      width: 38, height: 36, borderRadius: 8, flexShrink: 0,
                      background: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.4)}`,
                      color: C.gold, fontSize: 13, fontWeight: 800,
                      textAlign: 'center', fontFamily: SAIRA,
                      outline: 'none', appearance: 'none' as const,
                    }}
                  />
                ) : (
                  <div style={{
                    width: 38, height: 36, borderRadius: 8, flexShrink: 0,
                    background: C.surface, border: `1px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.textDim, fontSize: 13, fontWeight: 800, fontFamily: SAIRA,
                  }}>
                    {jerseyMap[p.id] ?? p.jerseyNumber}
                  </div>
                )}

                <span style={{ padding: '2px 6px', borderRadius: 7, flexShrink: 0, background: alpha(specCol, 0.15), color: specCol, fontSize: 9, fontWeight: 700 }}>
                  {SPECIALTY_LABELS[p.specialty]}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? C.text : C.textSub, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, marginTop: 1 }}>{p.age}歳</div>
                </div>

                <span style={{ fontFamily: SAIRA, fontSize: 10, fontWeight: 700, flexShrink: 0, color: isSelected ? C.gold : C.textDim, minWidth: 42, textAlign: 'right' }}>
                  {isSelected ? '1軍' : 'リザーブ'}
                </span>

                <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: ratingColor(rating), minWidth: 32, textAlign: 'right', flexShrink: 0 }}>
                  {rating}
                </div>
              </div>

              <div style={{ display: 'flex', paddingLeft: 34, paddingBottom: 2, gap: 0 }}>
                {([
                  ['速', p.ratings.speed],
                  ['持', p.ratings.stamina],
                  ['登', p.ratings.mountainUp],
                  ['下', p.ratings.mountainDown],
                  ['ペ', p.ratings.pacing],
                  ['精', p.ratings.mental],
                  ['回', p.ratings.recovery],
                ] as [string, number][]).map(([label, val]) => (
                  <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim }}>{label}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: ratingColor(val), lineHeight: 1.2 }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{
        position: 'fixed', bottom: FOOTER_BOTTOM, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px',
        padding: '10px 16px 12px',
        background: `linear-gradient(180deg, rgba(10,23,41,0.0) 0%, rgba(10,23,41,0.97) 30%)`,
        zIndex: 45,
      }}>
        {canSubmit ? (
          <button className="btn-game btn-game--gold" onClick={handleSubmit} style={{ width: '100%' }}>
            <span className="btn-game__inner">
              1軍{selectedCount}名 · リザーブ{secondCount}名で提出
            </span>
          </button>
        ) : (
          <button disabled style={{
            width: '100%', padding: 15, borderRadius: 14,
            background: C.surface2, color: C.textDim, border: `1px solid ${C.border}`,
            fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'not-allowed',
          }}>
            {selectedCount < MIN_MAIN
              ? `1軍をあと${MIN_MAIN - selectedCount}名選んでください`
              : secondCount > 18
              ? 'リザーブが18名を超えています'
              : '選出数を確認してください'
            }
          </button>
        )}
      </div>
    </div>
  )
}
