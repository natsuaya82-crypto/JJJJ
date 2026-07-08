import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { fmtTime } from '../../store/gameStore'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function CardPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: '14px', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      border: `2px solid ${C.border2}`,
      boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
    }}>
      <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }}/>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '8px' }}>{children}</div>
  )
}

export default function PlayersStatsPage() {
  const navigate = useNavigate()
  const { segmentRecords, players, teams, openPlayerSheet } = useGameStore()

  // 選手行の長押しで選手詳細を開く
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPress = (pid: string) => ({
    onPointerDown: () => { lpTimer.current = setTimeout(() => openPlayerSheet(pid), 450) },
    onPointerUp: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerLeave: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerMove: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
  })

  const records = segmentRecords ?? {}

  const raceNames = [...new Set(
    Object.keys(records).map(key => key.substring(0, key.lastIndexOf('-')))
  )].sort()

  const [selectedRace, setSelectedRace] = useState(raceNames[0] ?? '')

  const segmentIndices = Object.keys(records)
    .filter(key => key.startsWith(selectedRace + '-'))
    .map(key => parseInt(key.substring(key.lastIndexOf('-') + 1)))
    .sort((a, b) => a - b)

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '8px 16px 4px' }}>
        <BackButton />
      </div>
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.blue, letterSpacing: '3px', fontWeight: '900', marginBottom: '2px' }}>RECORDS</div>
        <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text, marginBottom: '14px' }}>区間記録</div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {raceNames.length === 0 ? (
          <CardPanel>
            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>レース未実施</div>
          </CardPanel>
        ) : (
          <>
            <select
              value={selectedRace}
              onChange={e => setSelectedRace(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '10px',
                background: C.surface2, border: `1px solid ${C.border2}`,
                color: C.text, fontFamily: SAIRA, fontSize: '14px',
                appearance: 'none', cursor: 'pointer',
              }}
            >
              {raceNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            {segmentIndices.map(segIdx => {
              const key = `${selectedRace}-${segIdx}`
              const top = records[key] ?? []
              return (
                <CardPanel key={segIdx}>
                  <SectionLabel>第{segIdx}区 区間記録</SectionLabel>
                  {top.map((entry, i) => {
                    // 旧セーブの記録にはIDが無いので名前・略称から逆引きする
                    const player = entry.playerId
                      ? players.find(p => p.id === entry.playerId)
                      : players.find(p => p.name === entry.playerName)
                    const team = entry.teamId
                      ? teams.find(t => t.id === entry.teamId)
                      : teams.find(t => t.shortName === entry.teamShort)
                    const rankCol = i === 0 ? C.gold : i <= 2 ? C.green : C.textSub
                    return (
                      <div key={i} {...(player ? longPress(player.id) : {})}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: `1px solid ${C.border}`, cursor: player ? 'pointer' : 'default' }}>
                        <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '900', color: rankCol, width: '18px', textAlign: 'center', textShadow: i <= 2 ? `0 0 6px ${alpha(rankCol, 0.5)}` : 'none' }}>{i + 1}</span>
                        {player && (
                          <div style={{ width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0, overflow: 'hidden' }}>
                            <PlayerFace playerId={player.id} nationality={player.nationality} size={28} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{entry.playerName}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
                            {team && <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={12} />}
                            <span style={{ fontSize: '9px', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? entry.teamShort} / {entry.year}</span>
                          </div>
                        </div>
                        <span style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '900', color: rankCol, textShadow: i <= 2 ? `0 0 8px ${alpha(rankCol, 0.5)}` : 'none' }}>{fmtTime(entry.timeSec)}</span>
                      </div>
                    )
                  })}
                </CardPanel>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
