import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import PlayerFace from '../player/PlayerFace'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

function contractMonths(yearsLeft: number, raceIndex: number, totalRaces: number): number {
  const remaining = Math.max(0, totalRaces - raceIndex)
  return Math.round((yearsLeft - 1 + remaining / Math.max(1, totalRaces)) * 12)
}

function fmtDuration(months: number): string {
  if (months <= 0) return '期限切れ'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}ヶ月`
  if (m === 0) return `${y}年`
  return `${y}年${m}ヶ月`
}

type SortKey = 'contract' | 'ovr' | 'salary' | 'name'

export default function ContractPage() {
  const navigate = useNavigate()
  const { players, playerTeamId, currentSeason, generateContractRequests } = useGameStore()
  const [sortKey, setSortKey] = useState<SortKey>('contract')

  useEffect(() => { generateContractRequests() }, [])

  const totalRaces = currentSeason.races.length
  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const contractRequests = currentSeason.contractRequests ?? []
  const retirementRequests = currentSeason.retirementRequests ?? []
  const transferRequests = currentSeason.transferRequests ?? []

  const myPlayers = players
    .filter(p => p.teamId === playerTeamId && p.status === 'active')
    .sort((a, b) => {
      if (sortKey === 'contract') {
        const ma = contractMonths(a.contract.yearsLeft, raceIndex, totalRaces)
        const mb = contractMonths(b.contract.yearsLeft, raceIndex, totalRaces)
        return ma - mb || ovr(b) - ovr(a)
      }
      if (sortKey === 'ovr') return ovr(b) - ovr(a)
      if (sortKey === 'salary') return b.contract.annualSalary - a.contract.annualSalary
      return a.name.localeCompare(b.name, 'ja')
    })

  const getStatus = (player: typeof myPlayers[0]) => {
    const activeReq = contractRequests.find(r => r.playerId === player.id && r.status !== 'accepted' && r.status !== 'rejected')
    const months = contractMonths(player.contract.yearsLeft, raceIndex, totalRaces)
    const hasRetirement = retirementRequests.some(r => r.playerId === player.id)
    const hasTransfer = transferRequests.some(r => r.playerId === player.id)
    if (hasRetirement) return { label: '引退希望', color: C.textSub }
    if (hasTransfer) return { label: '移籍希望', color: C.orange }
    if (activeReq?.status === 'countered') return { label: '対応中', color: C.gold }
    if (activeReq?.initiatedBy === 'gm' && activeReq.status === 'pending_gm') return { label: '対応中', color: C.gold }
    if (months < 12 || activeReq?.status === 'pending_gm') return { label: '要対応', color: C.red }
    return null
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100%' }}>
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <BackButton onClick={() => navigate('/team')} />
            <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>契約確認</div>
          </div>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            style={{ padding: '6px 10px', borderRadius: 8, backgroundColor: C.surface2, border: `1px solid ${C.border2}`, color: C.textSub, fontSize: 11, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
          >
            <option value="contract">契約残り順</option>
            <option value="ovr">OVR順</option>
            <option value="salary">年俸順</option>
            <option value="name">名前順</option>
          </select>
        </div>
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {myPlayers.map(player => {
          const status = getStatus(player)
          const specCol = SPEC_COLOR[player.specialty]
          const playerOvr = ovr(player)
          const months = contractMonths(player.contract.yearsLeft, raceIndex, totalRaces)
          const durationColor = months < 6 ? C.red : months < 12 ? C.orange : C.textSub
          const borderColor = status ? alpha(status.color, 0.4) : C.border

          return (
            <div
              key={player.id}
              style={{ width: '100%', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${borderColor}`, overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${alpha(specCol, 0.4)}` }}>
                  <PlayerFace playerId={player.id} nationality={player.nationality} size={44} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, backgroundColor: alpha(specCol, 0.15), color: specCol, fontWeight: 700, flexShrink: 0 }}>
                      {SPECIALTY_LABELS[player.specialty]}
                    </span>
                    {status && (
                      <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(status.color, 0.18), border: `1px solid ${alpha(status.color, 0.4)}`, color: status.color, fontWeight: 800, flexShrink: 0 }}>
                        {status.label}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: durationColor }}>
                      残{fmtDuration(months)}{months < 12 ? ` (${months}ヶ月)` : ''}
                    </span>
                    <span style={{ fontSize: 11, color: C.textDim }}>{fmt(player.contract.annualSalary)}</span>
                  </div>
                </div>
                <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: ratingColor(playerOvr), lineHeight: 1, flexShrink: 0 }}>
                  {playerOvr}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
