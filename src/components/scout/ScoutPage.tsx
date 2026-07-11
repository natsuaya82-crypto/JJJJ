import { useState, useEffect } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { Specialty, Player, DevProspect } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerRow from '../player/PlayerRow'

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

// DevProspect は Player 型ではない（trueRatings のみで contract 等が無い）ので、
// PlayerRow に渡すために Player 風のオブジェクトへ写像する。表示に使う項目だけ埋める。
function devToPlayer(dp: DevProspect): Player {
  return {
    id: dp.id,
    name: dp.name,
    age: dp.age,
    nationality: dp.nationality,
    specialty: dp.specialty,
    potential: dp.potential,
    ratings: dp.trueRatings,
    status: 'active',
    fatigue: 0,
    form: 0,
    morale: 70,
    contract: { annualSalary: 0, yearsLeft: 3, contractType: 'development' },
  } as unknown as Player
}

// 将来性バッジ（PlayerRow の名前行 extra に差し込む）
function PotentialBadge({ potential }: { potential: number }) {
  const col = potentialColor(potential)
  return (
    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: alpha(col, 0.12), border: `1px solid ${alpha(col, 0.3)}`, color: col, fontWeight: 700, letterSpacing: '-0.5px', flexShrink: 0 }}>
      将来 {potentialStars(potential)}
    </span>
  )
}

function Time10k({ score }: { score: number }) {
  return <span style={{ fontSize: 9, color: C.textDim, flexShrink: 0 }}>10km {format10kTime(score)}</span>
}

export default function ScoutPage() {
  const {
    currentSeason, initScoutPool,
    generateDevProspects, signDevProspect,
    teams, playerTeamId,
    toggleStarProspect,
  } = useGameStore()
  const starredProspects = useGameStore(s => s.starredProspects ?? [])

  const [pageTab, setPageTab] = useState<'draft' | 'dev'>('draft')

  useEffect(() => { initScoutPool() }, [])
  useEffect(() => { if (pageTab === 'dev') generateDevProspects() }, [pageTab])

  const prospects = currentSeason.scoutProspects
  const devProspects = currentSeason.devProspects ?? []

  const myTeam = teams.find(t => t.id === playerTeamId)
  const myBudget = myTeam?.finance.budget ?? 0

  const [sortBy, setSortBy] = useState<'ovr' | 'specialty' | 'age'>('ovr')
  const [filterSpec, setFilterSpec] = useState<Specialty | null>(null)

  const sorted = [...prospects]
    .filter(p => filterSpec === null || p.specialty === filterSpec)
    .sort((a, b) => {
      if (sortBy === 'ovr') return ovr(b) - ovr(a)
      if (sortBy === 'specialty') return a.specialty.localeCompare(b.specialty)
      return a.age - b.age
    })

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
            <div style={{ fontFamily: SAIRA, fontSize: '9px', color: C.blue, fontWeight: '700', marginBottom: '4px', letterSpacing: '1px' }}>ドラフトの仕組み</div>
            <div style={{ fontSize: '10px', color: C.textDim, lineHeight: 1.5 }}>
              候補選手の能力・将来性はすべて公開。★を付けて指名候補をチェックしておける。シーズン終了後のドラフトで指名する。
            </div>
          </div>
        )}

        {pageTab === 'draft' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: C.textDim }}>
              {prospects.length}名の候補選手
            </span>
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
          </div>
          <div style={{ padding: '7px 12px', borderRadius: '9px', background: alpha(C.cyan, 0.08), border: `1px solid ${alpha(C.cyan, 0.2)}`, fontSize: '9px', color: C.textDim, marginBottom: '10px', lineHeight: 1.5 }}>
            ドラフト外の無名若手を発掘。能力・将来性はすべて公開。契約すればリザーブに育成契約で加入。
          </div>
          {devProspects.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: C.textGhost, fontSize: '13px' }}>有望株なし</div>
          )}
          {devProspects.map(dp => {
            const canAfford = myBudget >= dp.signingFee
            const canSign = (myTeam?.roster.second.length ?? 0) < 20
            const devScore = dp.trueRatings.speed * 0.3 + dp.trueRatings.stamina * 0.3 + dp.trueRatings.pacing * 0.2 + dp.trueRatings.mental * 0.2
            return (
              <div key={dp.id} style={{
                marginBottom: '8px', borderRadius: 14, overflow: 'hidden',
                border: `1px solid ${C.border}`, background: C.bg,
              }}>
                <PlayerRow
                  player={devToPlayer(dp)}
                  handlers={{ onClick: () => {} }}
                  extra={<>
                    <PotentialBadge potential={dp.potential} />
                    <Time10k score={devScore} />
                  </>}
                />
                <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: C.textDim }}>{dp.origin}</span>
                  <button
                    onClick={() => signDevProspect(dp.id)}
                    disabled={!canAfford || !canSign}
                    style={{
                      marginLeft: 'auto',
                      padding: '7px 14px', borderRadius: '9px',
                      cursor: canAfford && canSign ? 'pointer' : 'not-allowed',
                      background: canAfford && canSign
                        ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`
                        : C.surface,
                      border: `2px solid ${canAfford && canSign ? alpha(C.green, 0.5) : C.border}`,
                      boxShadow: canAfford && canSign ? `0 3px 0 #0d3d22, inset 0 1px 0 rgba(255,255,255,0.06)` : 'none',
                      color: canAfford && canSign ? C.green : C.textGhost,
                      fontSize: '11px', fontWeight: '800', fontFamily: SAIRA,
                    }}
                  >
                    契約 {fmt(dp.signingFee)}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {pageTab === 'draft' && (
        <div style={{ margin: '0 12px', borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {sorted.map(p => {
            const score = collegeRaceScore(p)
            const isStarred = starredProspects.includes(p.id)
            return (
              <PlayerRow
                key={p.id}
                player={p}
                handlers={{ onClick: () => toggleStarProspect(p.id) }}
                extra={<>
                  <span style={{ fontSize: 14, color: isStarred ? C.gold : C.textGhost, lineHeight: 1, flexShrink: 0 }}>{isStarred ? '★' : '☆'}</span>
                  <PotentialBadge potential={p.potential} />
                  <Time10k score={score} />
                </>}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
