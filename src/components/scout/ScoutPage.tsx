import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { Specialty } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, ratingColor, SPEC_COLOR, statCapBand } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

function potentialStars(potential: number): string {
  if (potential >= 90) return '★★★★★'
  if (potential >= 75) return '★★★★'
  if (potential >= 60) return '★★★'
  if (potential >= 45) return '★★'
  return '★'
}

function potentialColor(potential: number): string {
  if (potential >= 90) return C.gold
  if (potential >= 75) return C.gold
  if (potential >= 60) return C.green
  if (potential >= 45) return C.blue
  return C.textDim
}

function collegeRaceScore(p: { id: string; ratings: { speed: number; stamina: number; pacing: number; mental: number } }): number {
  const base = p.ratings.speed * 0.3 + p.ratings.stamina * 0.3 + p.ratings.pacing * 0.2 + p.ratings.mental * 0.2
  const seed = parseInt(p.id.slice(-6), 16)
  return base + ((seed % 200) - 100) * 0.04
}

function format10kTime(score: number): string {
  const sec = Math.max(1620, Math.round(1860 - (score - 50) * 5.0))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ScoutPage() {
  const navigate = useNavigate()
  const {
    currentSeason, scoutDraftProspect, initScoutPool,
    generateDevProspects, scoutDevProspect, signDevProspect,
    teams, playerTeamId,
    toggleStarProspect,
  } = useGameStore()
  const starredProspects = useGameStore(s => s.starredProspects ?? [])
  const scoutPoints = currentSeason.scoutPoints ?? 5

  const [pageTab, setPageTab] = useState<'draft' | 'dev'>('draft')

  useEffect(() => { initScoutPool() }, [])
  useEffect(() => { if (pageTab === 'dev') generateDevProspects() }, [pageTab])

  const prospects = currentSeason.scoutProspects
  const devProspects = currentSeason.devProspects ?? []
  const scoutedProspects = currentSeason.scoutedProspects ?? []
  const currentRaceIndex = currentSeason.currentRaceIndex

  const myTeam = teams.find(t => t.id === playerTeamId)
  const myBudget = myTeam?.finance.budget ?? 0

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'ovr' | 'specialty' | 'age'>('ovr')
  const [filterSpec, setFilterSpec] = useState<Specialty | null>(null)

  function getScoutEntry(prospectId: string) {
    return scoutedProspects.find(s => s.prospectId === prospectId && currentSeason.year - s.year <= 1)
  }
  function isScouted(_prospectId: string) { return true }   // スカウト廃止＝ドラフト候補も全公開
  function isReady(prospectId: string) {
    const e = getScoutEntry(prospectId)
    return e != null && currentRaceIndex > e.raceIndex
  }

  const sorted = [...prospects]
    .filter(p => filterSpec === null || p.specialty === filterSpec)
    .sort((a, b) => {
      if (sortBy === 'ovr') return ovr(b) - ovr(a)
      if (sortBy === 'specialty') return a.specialty.localeCompare(b.specialty)
      return a.age - b.age
    })

  const scoutedCount = scoutedProspects.filter(s => currentSeason.year - s.year <= 1).length

  return (
    <div style={{
      paddingTop: '4px', paddingBottom: '80px',
      fontFamily: SAIRA,
      background: C.bg,
      minHeight: '100dvh',
    }}>
      <div style={{ padding: '8px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '8px' }}>
          <BackButton/>
          <div style={{ fontSize: '22px', fontWeight: '900', color: C.text }}>スカウト</div>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          {([
            { key: 'draft' as const, label: 'ドラフト候補' },
            { key: 'dev' as const, label: '育成有望株' },
          ]).map(t => (
            <button key={t.key} onClick={() => setPageTab(t.key)} style={{
              flex: 1, padding: '8px', borderRadius: '10px', cursor: 'pointer',
              fontFamily: SAIRA, fontSize: '11px', fontWeight: '700',
              background: pageTab === t.key
                ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`
                : `linear-gradient(180deg, ${C.surface}, ${C.bg})`,
              color: pageTab === t.key ? C.gold : C.textDim,
              border: pageTab === t.key ? `2px solid ${C.goldDark}` : `1px solid ${C.border}`,
              boxShadow: pageTab === t.key ? `0 3px 0 #5a3500, 0 4px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
            }}>{t.label}</button>
          ))}
        </div>

        {pageTab === 'draft' && (
          <div style={{ padding: '8px 12px', borderRadius: '10px', background: alpha(C.blue, 0.08), border: `1px solid ${alpha(C.blue, 0.2)}`, marginBottom: '10px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: '9px', color: C.blue, fontWeight: '700', marginBottom: '4px', letterSpacing: '1px' }}>スカウトとドラフトの仕組み</div>
            <div style={{ fontSize: '10px', color: C.textDim, lineHeight: 1.5 }}>
              候補選手を視察(PT消費)するとレース後に詳細能力が解放される。シーズン終了後のドラフトでこの情報を元に指名判断ができる。
            </div>
          </div>
        )}

        {pageTab === 'draft' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: C.textDim }}>
              {prospects.length}名の候補選手
              {scoutedCount > 0 && <span style={{ color: C.gold, marginLeft: '4px' }}>• {scoutedCount}名視察済</span>}
            </span>
            <div style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', borderRadius: '20px',
              background: scoutPoints > 0 ? alpha(C.gold, 0.1) : C.surface,
              border: `1px solid ${scoutPoints > 0 ? alpha(C.gold, 0.35) : C.border}`,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke={scoutPoints > 0 ? C.gold : C.textDim} strokeWidth="2"/>
                <path d="M21 21l-4-4" stroke={scoutPoints > 0 ? C.gold : C.textDim} strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '700', color: scoutPoints > 0 ? C.gold : C.textDim }}>{scoutPoints}</span>
              <span style={{ fontSize: '9px', color: C.textDim }}>PT</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as 'ovr' | 'specialty' | 'age')} style={{
              flex: 1, padding: '7px 10px', borderRadius: '10px',
              background: C.surface2, border: `1px solid ${C.border2}`,
              color: C.textSub, fontSize: '11px', fontFamily: SAIRA, outline: 'none',
            }}>
              <option value="ovr">評価順</option>
              <option value="specialty">タイプ順</option>
              <option value="age">年齢順</option>
            </select>
            <select value={filterSpec ?? 'all'} onChange={e => setFilterSpec(e.target.value === 'all' ? null : e.target.value as Specialty)} style={{
              flex: 1, padding: '7px 10px', borderRadius: '10px',
              background: C.surface2, border: `1px solid ${C.border2}`,
              color: C.textSub, fontSize: '11px', fontFamily: SAIRA, outline: 'none',
            }}>
              <option value="all">全タイプ</option>
              {(Object.keys(SPECIALTY_LABELS) as Specialty[]).map(spec => (
                <option key={spec} value={spec}>{SPECIALTY_LABELS[spec]}</option>
              ))}
            </select>
          </div>
        </>}
      </div>

      {pageTab === 'dev' && (
        <div style={{ padding: '0 12px', paddingBottom: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', color: C.textDim }}>{devProspects.length}名の有望株</span>
            <div style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', borderRadius: '20px',
              background: scoutPoints > 0 ? alpha(C.gold, 0.1) : C.surface,
              border: `1px solid ${scoutPoints > 0 ? alpha(C.gold, 0.35) : C.border}`,
            }}>
              <span style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '700', color: scoutPoints > 0 ? C.gold : C.textDim }}>{scoutPoints}</span>
              <span style={{ fontSize: '9px', color: C.textDim }}>PT</span>
            </div>
          </div>
          <div style={{ padding: '7px 12px', borderRadius: '9px', background: alpha(C.cyan, 0.08), border: `1px solid ${alpha(C.cyan, 0.2)}`, fontSize: '9px', color: C.textDim, marginBottom: '10px', lineHeight: 1.5 }}>
            ドラフト外の無名若手を発掘。契約すればリザーブに育成契約で加入。
          </div>
          {devProspects.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: C.textGhost, fontSize: '13px' }}>有望株なし</div>
          )}
          {devProspects.map(p => {
            const specCol = SPEC_COLOR[p.specialty]
            const canAfford = myBudget >= p.signingFee
            const canSign = (myTeam?.roster.second.length ?? 0) < 20
            const devScore = p.trueRatings.speed * 0.3 + p.trueRatings.stamina * 0.3 + p.trueRatings.pacing * 0.2 + p.trueRatings.mental * 0.2
            return (
              <div key={p.id} style={{ marginBottom: '8px' }}>
                <div style={{
                  position: 'relative', overflow: 'hidden',
                  borderRadius: true ? '14px 14px 0 0' : '14px',
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `2px solid ${C.goldDark}`,
                  boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}>
                  <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }}/>
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specCol, 0.35)}` }}>
                        <PlayerFace playerId={p.id} nationality={p.nationality} size={52} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontFamily: SAIRA, fontSize: true ? 13 : 18, fontWeight: 900, color: true ? C.gold : C.textGhost }}>{true ? `~${statCapBand(p.potential).lo}-${statCapBand(p.potential).hi}` : '?'}</span>
                          <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{p.age}歳</span>
                          <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>{p.origin}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ padding: '1px 6px', borderRadius: '8px', background: alpha(specCol, 0.15), color: specCol, fontSize: '9px', fontWeight: '700' }}>{SPECIALTY_LABELS[p.specialty]}</span>
                          <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>{p.nationality === 'FOREIGN' ? '外国籍' : '日本人'}</span>
                          {true && <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>10km {format10kTime(devScore)}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        {!true ? (
                          <button
                            onClick={() => scoutDevProspect(p.id)}
                            style={{
                              padding: '5px 10px', borderRadius: '8px', border: 'none',
                              background: scoutPoints >= 1 ? `linear-gradient(135deg, ${C.gold}, #E8C86A)` : C.surface2,
                              color: scoutPoints >= 1 ? '#0A0912' : C.textGhost,
                              fontSize: '11px', fontWeight: '800',
                              cursor: scoutPoints >= 1 ? 'pointer' : 'not-allowed', fontFamily: SAIRA,
                            }}
                          >
                            調査
                          </button>
                        ) : (
                          <button
                            onClick={() => signDevProspect(p.id)}
                            disabled={!canAfford || !canSign}
                            style={{
                              padding: '5px 10px', borderRadius: '8px',
                              cursor: canAfford && canSign ? 'pointer' : 'not-allowed',
                              background: canAfford && canSign
                                ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`
                                : C.surface,
                              border: `2px solid ${canAfford && canSign ? alpha(C.green, 0.5) : C.border}`,
                              boxShadow: canAfford && canSign ? `0 3px 0 #0d3d22, inset 0 1px 0 rgba(255,255,255,0.06)` : 'none',
                              color: canAfford && canSign ? C.green : C.textGhost,
                              fontSize: '9px', fontWeight: '700', fontFamily: SAIRA, flexShrink: 0,
                            }}
                          >
                            契約 {fmt(p.signingFee)}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {true && (
                  <div style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '12px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                      {([
                        ['速力', p.trueRatings.speed], ['持久', p.trueRatings.stamina],
                        ['登り', p.trueRatings.mountainUp], ['下り', p.trueRatings.mountainDown],
                        ['ペース', p.trueRatings.pacing], ['精神', p.trueRatings.mental], ['回復', p.trueRatings.recovery],
                      ] as [string, number][]).map(([label, val]) => (
                        <div key={label} style={{ padding: '5px 4px', borderRadius: '7px', background: C.surface, textAlign: 'center', border: `1px solid ${alpha(ratingColor(val), 0.2)}` }}>
                          <div style={{ fontFamily: SAIRA, fontSize: '7px', color: C.textDim, marginBottom: '2px' }}>{label}</div>
                          <div style={{ fontFamily: SAIRA, fontSize: '14px', fontWeight: '800', color: ratingColor(val), lineHeight: 1 }}>{val}</div>
                        </div>
                      ))}
                      <div style={{ padding: '5px 4px', borderRadius: '7px', background: C.surface, textAlign: 'center', border: `1px solid ${alpha(potentialColor(p.potential), 0.2)}` }}>
                        <div style={{ fontFamily: SAIRA, fontSize: '7px', color: C.textDim, marginBottom: '2px' }}>将来性</div>
                        <div style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '800', color: potentialColor(p.potential), lineHeight: 1.2, letterSpacing: '-1px' }}>{potentialStars(p.potential)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {pageTab === 'draft' && <div style={{ padding: '0 12px' }}>
        {sorted.map(p => {
          const rating = ovr(p)
          const specCol = SPEC_COLOR[p.specialty]
          const scouted = isScouted(p.id)
          const ready = isReady(p.id)
          const expanded = expandedId === p.id
          const r = p.ratings
          const score = collegeRaceScore(p)
          const isStarred = starredProspects.includes(p.id)

          return (
            <div key={p.id} style={{ marginBottom: '7px' }}>
              <div style={{
                position: 'relative', overflow: 'hidden',
                borderRadius: expanded ? '14px 14px 0 0' : '14px',
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${isStarred ? C.gold : C.goldDark}`,
                boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}>
                <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }}/>
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div
                    onClick={() => { if (ready) setExpandedId(prev => prev === p.id ? null : p.id) }}
                    style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: '10px', cursor: ready ? 'pointer' : 'default' }}
                  >
                    <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specCol, 0.35)}` }}>
                      <PlayerFace playerId={p.id} nationality={p.nationality} size={52} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ready ? ratingColor(rating) : C.textGhost }}>
                          {ready ? rating : '?'}
                        </span>
                        {scouted && !ready && (
                          <span style={{ fontFamily: SAIRA, fontSize: 9, color: C.blue, fontWeight: '700', padding: '1px 6px', borderRadius: '6px', background: alpha(C.blue, 0.12), border: `1px solid ${alpha(C.blue, 0.3)}` }}>
                            次レース後に解放
                          </span>
                        )}
                        <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{p.age}歳</span>
                        <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>{p.origin}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ padding: '1px 6px', borderRadius: '8px', background: alpha(specCol, 0.15), color: specCol, fontSize: '9px', fontWeight: '700' }}>{SPECIALTY_LABELS[p.specialty]}</span>
                        <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>{p.nationality === 'FOREIGN' ? '外国籍' : '日本人'}</span>
                        <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>10km {format10kTime(score)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleStarProspect(p.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: isStarred ? C.gold : C.textGhost, fontSize: 18, lineHeight: 1 }}
                      >
                        {isStarred ? '★' : '☆'}
                      </button>
                      {ready ? (
                        <>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {([['速', r.speed], ['持', r.stamina], ['精', r.mental]] as [string, number][]).map(([l, v]) => (
                              <div key={l} style={{ textAlign: 'center', minWidth: '20px' }}>
                                <div style={{ fontFamily: SAIRA, fontSize: '7px', color: C.textGhost }}>{l}</div>
                                <div style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '700', color: v >= 75 ? C.gold : C.textDim, textShadow: v >= 75 ? `0 0 8px ${alpha(C.gold, 0.5)}` : 'none' }}>{v}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ color: C.textGhost, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </div>
                        </>
                      ) : !scouted ? (
                        <button
                          onClick={e => { e.stopPropagation(); if (scoutPoints > 0) scoutDraftProspect(p.id) }}
                          disabled={scoutPoints <= 0}
                          style={{
                            padding: '5px 10px', borderRadius: '8px', border: 'none',
                            background: scoutPoints > 0 ? `linear-gradient(135deg, ${C.gold}, #E8C86A)` : C.surface2,
                            color: scoutPoints > 0 ? '#0A0912' : C.textGhost,
                            fontSize: '11px', fontWeight: '800',
                            cursor: scoutPoints > 0 ? 'pointer' : 'not-allowed', fontFamily: SAIRA,
                          }}
                        >
                          視察
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {expanded && ready && (
                <div style={{
                  background: C.surface2,
                  border: `1px solid ${C.border2}`,
                  borderTop: 'none',
                  borderRadius: '0 0 14px 14px',
                  padding: '12px 14px',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {([
                      ['速力', r.speed], ['持久', r.stamina], ['登り', r.mountainUp], ['下り', r.mountainDown],
                      ['ペース', r.pacing], ['精神', r.mental], ['回復', r.recovery],
                    ] as [string, number][]).map(([label, val]) => (
                      <div key={label as string} style={{
                        textAlign: 'center', padding: '8px 4px', borderRadius: '8px',
                        background: C.surface,
                        border: `1px solid ${alpha(ratingColor(val as number), 0.2)}`,
                      }}>
                        <div style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textDim, marginBottom: '3px' }}>{label}</div>
                        <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '800', color: ratingColor(val as number), lineHeight: 1, textShadow: `0 0 10px ${alpha(ratingColor(val as number), 0.5)}` }}>{val}</div>
                      </div>
                    ))}
                    <div style={{
                      textAlign: 'center', padding: '8px 4px', borderRadius: '8px',
                      background: C.surface, border: `1px solid ${alpha(potentialColor(p.potential), 0.2)}`,
                    }}>
                      <div style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textDim, marginBottom: '3px' }}>将来性</div>
                      <div style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '800', color: potentialColor(p.potential), lineHeight: 1.2, letterSpacing: '-1px' }}>{potentialStars(p.potential)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>}
    </div>
  )
}
