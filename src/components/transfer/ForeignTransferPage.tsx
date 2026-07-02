import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore, calcTransferValue } from '../../store/gameStore'
import type { Player } from '../../types'
import { ovr, faMarketSalary } from '../../utils/playerUtils'
import { nationalityToForeignCategory } from '../../engine/playerGenerator'
import PlayerFace from '../player/PlayerFace'

const NAT_FLAG: Record<string, string> = {
  KOR: '🇰🇷', CHN: '🇨🇳', TWN: '🇹🇼',
  ETH: '🇪🇹', KEN: '🇰🇪', UGA: '🇺🇬', TAN: '🇹🇿',
  EUR: 'EU', USA: 'US', JPN: 'JP', FOREIGN: 'GL',
}

const SPEC_LABELS: Record<string, string> = {
  ace: 'エース', mountain_up: '山登り', mountain_down: '山下り',
  sprinter: 'スプリンター', long: '長距離', allrounder: 'オールラウンダー',
  kick: 'スパート型', grinder: '粘り型',
}
const SPEC_COLOR: Record<string, string> = {
  ace: '#C9A84C', mountain_up: '#4CAF50', mountain_down: '#26C6DA',
  sprinter: '#EC407A', long: '#7986CB', allrounder: '#9B97A8',
  kick: '#FF6B35', grinder: '#AB8ED6',
}

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

type NegoState = 'idle' | 'accepted' | 'countered' | 'rejected'

export default function ForeignTransferPage() {
  const navigate = useNavigate()
  const { foreignLeagues, players, teams, playerTeamId, signForeignPlayer } = useGameStore()

  const [leagueFilter, setLeagueFilter] = useState('all')
  const [specFilter, setSpecFilter] = useState('all')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [offerSalary, setOfferSalary] = useState(0)
  const [offerYears, setOfferYears] = useState(2)
  const [negoState, setNegoState] = useState<NegoState>('idle')
  const [counterSalary, setCounterSalary] = useState(0)
  const [error, setError] = useState('')

  const myTeam = teams.find(t => t.id === playerTeamId)
  const budget = myTeam?.finance.budget ?? 0

  const mainIds = new Set(myTeam?.roster.main ?? [])
  const myMain = players.filter(p => mainIds.has(p.id))
  const foreignCount = myMain.filter(p => (p.foreignCategory ?? nationalityToForeignCategory(p.nationality)) === 'foreign').length
  const asianCount = myMain.filter(p => (p.foreignCategory ?? nationalityToForeignCategory(p.nationality)) === 'asian').length

  const allForeignPlayerIds = new Set((foreignLeagues ?? []).flatMap(l => l.clubs.flatMap(c => c.playerIds)))
  const allForeignPlayers = players.filter(p => allForeignPlayerIds.has(p.id))

  let filtered = allForeignPlayers
  if (leagueFilter !== 'all') {
    const league = (foreignLeagues ?? []).find(l => l.id === leagueFilter)
    if (league) {
      const ids = new Set(league.clubs.flatMap(c => c.playerIds))
      filtered = filtered.filter(p => ids.has(p.id))
    }
  }
  if (specFilter !== 'all') {
    filtered = filtered.filter(p => p.specialty === specFilter)
  }
  const sorted = [...filtered].sort((a, b) => ovr(b) - ovr(a))

  function getClub(playerId: string) {
    for (const l of foreignLeagues ?? []) {
      for (const c of l.clubs) {
        if (c.playerIds.includes(playerId)) return c
      }
    }
    return null
  }

  function selectPlayer(p: Player) {
    if (selectedPlayer?.id === p.id) {
      setSelectedPlayer(null)
      return
    }
    setSelectedPlayer(p)
    setOfferSalary(faMarketSalary(p))
    setOfferYears(2)
    setNegoState('idle')
    setCounterSalary(0)
    setError('')
  }

  function handleOffer() {
    if (!selectedPlayer) return
    const demand = faMarketSalary(selectedPlayer)
    if (offerSalary >= demand) {
      setNegoState('accepted')
    } else if (offerSalary >= Math.round(demand * 0.8)) {
      setCounterSalary(demand)
      setNegoState('countered')
    } else {
      setNegoState('rejected')
    }
  }

  function handleSign() {
    if (!selectedPlayer) return
    setError('')
    const fee = calcTransferValue(selectedPlayer)
    if (budget < fee) {
      setError(`予算不足 (移籍金: ${fmt(fee)})`)
      return
    }
    const cat = selectedPlayer.foreignCategory ?? nationalityToForeignCategory(selectedPlayer.nationality)
    if (cat === 'foreign' && foreignCount >= 3) {
      setError('海外枠(3名)が満員です')
      return
    }
    if (cat === 'asian' && asianCount >= 5) {
      setError('アジア枠(5名)が満員です')
      return
    }
    const ok = signForeignPlayer(selectedPlayer.id, offerSalary, offerYears)
    if (ok) {
      setSelectedPlayer(null)
      setNegoState('idle')
    } else {
      setError('獲得に失敗しました')
    }
  }

  const selFee = selectedPlayer ? calcTransferValue(selectedPlayer) : 0
  const selDemand = selectedPlayer ? faMarketSalary(selectedPlayer) : 0

  const selectStyle: React.CSSProperties = {
    flex: 1, padding: '8px 10px', borderRadius: '9px',
    border: '1px solid #2E2B42', backgroundColor: '#14121F',
    color: '#F0EDE8', fontSize: '11px',
    fontFamily: "'Noto Sans JP', system-ui, sans-serif",
    cursor: 'pointer', outline: 'none',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%235C5870' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    paddingRight: '28px',
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #14121F, #0A0912)', padding: '12px 16px 12px', borderBottom: '1px solid #2E2B42' }}>
        <BackButton onClick={() => navigate('/transfer')}/>
        <div style={{ fontSize: '9px', color: '#6B7BE8', letterSpacing: '3px', fontWeight: '800', marginBottom: '2px' }}>FOREIGN TRANSFER</div>
        <div style={{ fontSize: '20px', fontWeight: '900', color: '#F0EDE8', marginBottom: '10px' }}>海外移籍市場</div>

        {/* Slot indicators */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
          <div style={{ padding: '8px 10px', borderRadius: '10px', backgroundColor: '#0D0C18', border: '1px solid #E8462A25' }}>
            <div style={{ fontSize: '9px', color: '#5C5870', marginBottom: '2px' }}>海外枠</div>
            <div style={{ fontSize: '15px', fontWeight: '900', color: foreignCount >= 3 ? '#E8462A' : '#E8462A', fontFamily: 'monospace', lineHeight: 1 }}>{foreignCount}/3</div>
          </div>
          <div style={{ padding: '8px 10px', borderRadius: '10px', backgroundColor: '#0D0C18', border: '1px solid #7986CB25' }}>
            <div style={{ fontSize: '9px', color: '#5C5870', marginBottom: '2px' }}>アジア枠</div>
            <div style={{ fontSize: '15px', fontWeight: '900', color: asianCount >= 5 ? '#E8462A' : '#7986CB', fontFamily: 'monospace', lineHeight: 1 }}>{asianCount}/5</div>
          </div>
          <div style={{ padding: '8px 10px', borderRadius: '10px', backgroundColor: '#0D0C18', border: '1px solid #C9A84C25' }}>
            <div style={{ fontSize: '9px', color: '#5C5870', marginBottom: '2px' }}>予算残高</div>
            <div style={{ fontSize: '13px', fontWeight: '900', color: '#C9A84C', fontFamily: 'monospace', lineHeight: 1 }}>{fmt(budget)}</div>
          </div>
        </div>

        {/* Filter dropdowns */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={leagueFilter} onChange={e => { setLeagueFilter(e.target.value); setSelectedPlayer(null) }} style={selectStyle}>
            <option value="all">全リーグ ({allForeignPlayers.length})</option>
            {(foreignLeagues ?? []).map(l => {
              const cnt = l.clubs.reduce((s, c) => s + c.playerIds.length, 0)
              return <option key={l.id} value={l.id}>{l.name} ({cnt})</option>
            })}
          </select>
          <select value={specFilter} onChange={e => { setSpecFilter(e.target.value); setSelectedPlayer(null) }} style={selectStyle}>
            <option value="all">全ポジション</option>
            {Object.entries(SPEC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Player list */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {sorted.map(p => {
          const pOvr = ovr(p)
          const club = getClub(p.id)
          const cat = p.foreignCategory ?? nationalityToForeignCategory(p.nationality)
          const catColor = cat === 'asian' ? '#7986CB' : '#E8462A'
          const catLabel = cat === 'asian' ? 'アジア' : '海外'
          const specCol = SPEC_COLOR[p.specialty] ?? '#9B97A8'
          const isSelected = selectedPlayer?.id === p.id
          const fee = calcTransferValue(p)
          const canAfford = budget >= fee

          return (
            <div
              key={p.id}
              onClick={() => selectPlayer(p)}
              style={{
                padding: '10px 12px', borderRadius: '12px',
                background: isSelected ? 'linear-gradient(135deg, #6B7BE815, #141220)' : '#141220',
                border: `1.5px solid ${isSelected ? '#6B7BE860' : '#1E1B2E'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ textAlign: 'center', width: '32px', flexShrink: 0 }}>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: pOvr >= 80 ? '#C9A84C' : '#9B97A8', fontFamily: 'monospace', lineHeight: 1 }}>{pOvr}</div>
                  <div style={{ fontSize: '7px', color: '#5C5870' }}>OVR</div>
                </div>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={32} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#F0EDE8' }}>{p.name}</span>
                    <span style={{ fontSize: '11px' }}>{NAT_FLAG[p.nationality] ?? 'GL'}</span>
                    <span style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '4px', backgroundColor: `${catColor}20`, color: catColor, fontWeight: '800' }}>{catLabel}</span>
                    <span style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '4px', backgroundColor: `${specCol}18`, color: specCol, fontWeight: '700' }}>{SPEC_LABELS[p.specialty] ?? p.specialty}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#5C5870' }}>
                    {p.age}歳 · {club?.shortName ?? p.origin}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: canAfford ? '#C9A84C' : '#E8462A', fontFamily: 'monospace' }}>{fmt(fee)}</div>
                  <div style={{ fontSize: '8px', color: '#5C5870' }}>移籍金</div>
                </div>
              </div>

              {/* Negotiation panel */}
              {isSelected && (
                <div
                  style={{ marginTop: '10px', padding: '12px', borderRadius: '10px', background: '#0A0912', border: '1px solid #1E1B2E' }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Fee + demand summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                    <div style={{ padding: '7px 10px', borderRadius: '8px', backgroundColor: '#14121F', border: `1px solid ${canAfford ? '#C9A84C30' : '#E8462A30'}` }}>
                      <div style={{ fontSize: '8px', color: '#5C5870', marginBottom: '2px' }}>移籍金(一括)</div>
                      <div style={{ fontSize: '14px', fontWeight: '900', color: canAfford ? '#C9A84C' : '#E8462A', fontFamily: 'monospace' }}>{fmt(selFee)}</div>
                    </div>
                    <div style={{ padding: '7px 10px', borderRadius: '8px', backgroundColor: '#14121F', border: '1px solid #2E2B42' }}>
                      <div style={{ fontSize: '8px', color: '#5C5870', marginBottom: '2px' }}>選手要求年俸</div>
                      <div style={{ fontSize: '14px', fontWeight: '900', color: '#9B97A8', fontFamily: 'monospace' }}>{fmt(selDemand)}</div>
                    </div>
                  </div>

                  {negoState === 'idle' && (
                    <>
                      <div style={{ fontSize: '9px', color: '#5C5870', letterSpacing: '2px', marginBottom: '8px' }}>オファー条件を設定</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontSize: '9px', color: '#5C5870', marginBottom: '4px' }}>年俸 (万円)</div>
                          <input
                            type="number"
                            value={Math.round(offerSalary / 10000)}
                            onChange={e => setOfferSalary(Number(e.target.value) * 10000)}
                            style={{
                              width: '100%', padding: '7px 9px', borderRadius: '8px',
                              backgroundColor: '#14121F', border: '1px solid #2E2B42',
                              color: '#F0EDE8', fontSize: '14px', fontFamily: 'monospace',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', color: '#5C5870', marginBottom: '4px' }}>契約年数</div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {[1, 2, 3].map(y => (
                              <button
                                key={y}
                                onClick={() => setOfferYears(y)}
                                style={{
                                  flex: 1, padding: '7px', borderRadius: '7px', border: 'none',
                                  backgroundColor: offerYears === y ? '#6B7BE825' : '#14121F',
                                  color: offerYears === y ? '#6B7BE8' : '#5C5870',
                                  fontSize: '12px', fontWeight: offerYears === y ? '800' : '400',
                                  cursor: 'pointer', fontFamily: 'inherit',
                                  outline: offerYears === y ? '1px solid #6B7BE850' : '1px solid #1E1B2E',
                                }}
                              >
                                {y}年
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {error && <div style={{ fontSize: '11px', color: '#E8462A', marginBottom: '8px' }}>⚠ {error}</div>}
                      <button
                        onClick={handleOffer}
                        style={{
                          width: '100%', padding: '11px', borderRadius: '9px', border: 'none',
                          background: 'linear-gradient(135deg, #6B7BE8, #4A5AD0)',
                          color: '#FFFFFF', fontSize: '13px', fontWeight: '900',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        交渉開始
                      </button>
                    </>
                  )}

                  {negoState === 'accepted' && (
                    <>
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#4CAF5015', border: '1px solid #4CAF5040', marginBottom: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '13px', color: '#4CAF50', fontWeight: '800' }}>✓ 合意成立</div>
                        <div style={{ fontSize: '11px', color: '#9B97A8', marginTop: '4px' }}>年俸 {fmt(offerSalary)} · {offerYears}年契約</div>
                      </div>
                      {error && <div style={{ fontSize: '11px', color: '#E8462A', marginBottom: '8px' }}>⚠ {error}</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                          onClick={() => { setNegoState('idle'); setError('') }}
                          style={{ padding: '10px', borderRadius: '8px', border: '1px solid #2E2B42', backgroundColor: '#14121F', color: '#9B97A8', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          やり直す
                        </button>
                        <button
                          onClick={handleSign}
                          disabled={!canAfford}
                          style={{
                            padding: '10px', borderRadius: '8px', border: 'none',
                            background: canAfford ? 'linear-gradient(135deg, #4CAF50, #2E7D32)' : '#1E1B2E',
                            color: canAfford ? '#FFFFFF' : '#3A3758',
                            fontSize: '11px', fontWeight: '900',
                            cursor: canAfford ? 'pointer' : 'default', fontFamily: 'inherit',
                          }}
                        >
                          {canAfford ? `加入確定 (${fmt(selFee)})` : '予算不足'}
                        </button>
                      </div>
                    </>
                  )}

                  {negoState === 'countered' && (
                    <>
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#C9A84C12', border: '1px solid #C9A84C40', marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', color: '#C9A84C', fontWeight: '800', marginBottom: '4px' }}>↩ カウンターオファー</div>
                        <div style={{ fontSize: '11px', color: '#9B97A8' }}>「年俸 <strong style={{ color: '#F0EDE8' }}>{fmt(counterSalary)}</strong> なら移籍を検討する」</div>
                      </div>
                      {error && <div style={{ fontSize: '11px', color: '#E8462A', marginBottom: '8px' }}>⚠ {error}</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                          onClick={() => { setNegoState('idle'); setError('') }}
                          style={{ padding: '10px', borderRadius: '8px', border: '1px solid #2E2B42', backgroundColor: '#14121F', color: '#9B97A8', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          断る
                        </button>
                        <button
                          onClick={() => { setOfferSalary(counterSalary); setNegoState('accepted') }}
                          style={{
                            padding: '10px', borderRadius: '8px', border: 'none',
                            background: 'linear-gradient(135deg, #C9A84C, #A07A30)',
                            color: '#0A0912', fontSize: '11px', fontWeight: '900',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          受け入れる ({fmt(counterSalary)})
                        </button>
                      </div>
                    </>
                  )}

                  {negoState === 'rejected' && (
                    <>
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#E8462A12', border: '1px solid #E8462A40', marginBottom: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '13px', color: '#E8462A', fontWeight: '800' }}>✗ オファー拒否</div>
                        <div style={{ fontSize: '10px', color: '#5C5870', marginTop: '4px' }}>
                          最低ライン: {fmt(Math.round(selDemand * 0.8))} 以上
                        </div>
                      </div>
                      <button
                        onClick={() => { setNegoState('idle'); setError('') }}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #2E2B42', backgroundColor: '#14121F', color: '#9B97A8', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        条件を変える
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {sorted.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: '#3A3758', fontSize: '13px' }}>
            該当する選手がいません
          </div>
        )}
      </div>
    </div>
  )
}
