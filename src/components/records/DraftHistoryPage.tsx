import { useRef } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { ovr, ratingColor } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'

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

export default function DraftHistoryPage() {
  const { players, teams, playerTeamId, openPlayerSheet } = useGameStore()

  // 長押しで選手詳細
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lp = (pid: string) => ({
    onPointerDown: () => { timer.current = setTimeout(() => openPlayerSheet(pid), 450) },
    onPointerUp: () => { if (timer.current) clearTimeout(timer.current) },
    onPointerLeave: () => { if (timer.current) clearTimeout(timer.current) },
    onPointerMove: () => { if (timer.current) clearTimeout(timer.current) },
  })

  // 自チームの歴代ドラフト指名選手（2027年度〜）。指名時に draftYear=当年 が入る。
  const drafted = players.filter(p => (p.draftYear ?? 0) >= 2027)
  const years = [...new Set(drafted.map(p => p.draftYear))].sort((a, b) => b - a)
  const byYear = years.map(y => ({
    year: y,
    list: drafted.filter(p => p.draftYear === y).sort((a, b) => ovr(b) - ovr(a)),
  }))

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '8px 16px 4px' }}>
        <BackButton />
      </div>
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.orange, letterSpacing: '3px', fontWeight: '900', marginBottom: '2px' }}>RECORDS</div>
        <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text, marginBottom: '4px' }}>歴代ドラフト</div>
        <div style={{ fontSize: '11px', color: C.textDim, marginBottom: '14px' }}>2027年度からの自チーム指名選手</div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {byYear.length === 0 ? (
          <CardPanel>
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: 13, padding: '20px 0' }}>
              まだドラフト指名がありません
            </div>
          </CardPanel>
        ) : byYear.map(({ year, list }) => (
          <CardPanel key={year}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900' }}>{year} 年度</span>
              <span style={{ fontFamily: SAIRA, fontSize: '9px', color: C.textDim, padding: '1px 7px', borderRadius: 10, background: alpha(C.gold, 0.12) }}>{list.length}名</span>
            </div>
            {list.map((p, i) => {
              const team = teams.find(t => t.id === p.teamId)
              const isRetired = p.status === 'retired'
              const isMine = p.teamId === playerTeamId
              const o = ovr(p)
              return (
                <div key={p.id} {...lp(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: i < list.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', opacity: isRetired ? 0.6 : 1 }}>
                  <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textGhost, width: '20px', textAlign: 'center' }}>{i + 1}</span>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={30} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontFamily: SAIRA, fontSize: '13px', color: C.text }}>{p.name}</span>
                      {isRetired && <span style={{ fontFamily: SAIRA, fontSize: '8px', padding: '1px 4px', borderRadius: 3, background: alpha(C.textGhost, 0.12), color: C.textGhost }}>引退</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
                      {team && <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={12} />}
                      <span style={{ fontSize: '9px', color: isMine ? C.gold : C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {team?.name ?? (isRetired ? '引退' : 'FA')} / {SPECIALTY_LABELS[p.specialty]} / {p.age}歳
                      </span>
                    </div>
                  </div>
                  <span style={{ fontFamily: SAIRA, fontSize: '18px', fontWeight: '900', color: ratingColor(o) }}>{o}</span>
                </div>
              )
            })}
          </CardPanel>
        ))}
      </div>
    </div>
  )
}
