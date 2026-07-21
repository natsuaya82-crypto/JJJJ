import { TeamLogoSVG } from '../icons/Icons'
import Flag from '../ui/Flag'
import { C, alpha } from '../../styles/tokens'
import type { Nationality } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export type StandRow = {
  id: string
  name: string
  shortName: string
  primary: string
  secondary: string
  teamId?: string
  points: number
  recentForm: number[]   // 直近レースの順位（新しいほど末尾）
  isMe?: boolean
  flagCode?: Nationality // 国別対抗（世界陸上など）ではロゴの代わりに国旗を出す
}

// 全リーグ共通の順位表（JPELと同じ見た目）。
// onRowLongPress: チーム行の長押しでチーム詳細へ（レース結果画面など、タップを他用途に使わない画面用）
export default function StandingsTable({ rows, onRowClick, onRowLongPress }: {
  rows: StandRow[]
  onRowClick?: (id: string) => void
  onRowLongPress?: (id: string) => void
}) {
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  const lpHandlers = (id: string) => onRowLongPress ? {
    onPointerDown: () => { pressTimer = setTimeout(() => onRowLongPress(id), 450) },
    onPointerUp: () => { if (pressTimer) clearTimeout(pressTimer) },
    onPointerLeave: () => { if (pressTimer) clearTimeout(pressTimer) },
    onPointerMove: () => { if (pressTimer) clearTimeout(pressTimer) },
  } : {}
  return (
    <div style={{ margin: '0 12px', borderRadius: '14px', overflow: 'hidden', border: `2px solid ${C.goldDark}`, boxShadow: `0 6px 0 #5a3500, 0 10px 28px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.08)`, position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.25)', borderRadius: 10, pointerEvents: 'none', zIndex: 1 }}/>
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 44px 60px', gap: '4px', padding: '7px 12px', background: C.surface3, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700' }}>#</span>
        <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', letterSpacing: '1px' }}>チーム</span>
        <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', textAlign: 'center' }}>直近</span>
        <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', textAlign: 'right' }}>ポイント</span>
      </div>

      {rows.map((r, i) => {
        const rankColor = i === 0 ? C.gold : i <= 2 ? C.textSub : C.textGhost
        const recentForm = r.recentForm.slice(-4)
        return (
          <div key={r.id} onClick={() => onRowClick?.(r.id)} {...lpHandlers(r.id)}
            style={{ display: 'grid', gridTemplateColumns: '28px 1fr 44px 60px', gap: '4px', padding: '9px 12px',
              background: r.isMe ? alpha(r.primary, 0.1) : i % 2 === 0 ? C.surface2 : C.surface,
              borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none', cursor: (onRowClick || onRowLongPress) ? 'pointer' : 'default',
              borderLeft: r.isMe ? `3px solid ${r.primary}` : '3px solid transparent', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i === 0 ? (
                <span style={{ fontFamily: SAIRA, fontSize: '12px', color: C.gold, textShadow: `0 0 6px ${alpha(C.gold, 0.5)}` }}>★</span>
              ) : (
                <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: rankColor }}>{i + 1}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
              {r.flagCode
                ? <Flag code={r.flagCode} width={24} radius={3} />
                : <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.shortName} teamId={r.teamId} size={24} />}
              <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: r.isMe ? '800' : '500', color: r.isMe ? C.text : C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}{r.isMe && <span style={{ marginLeft: '4px', fontSize: '8px', color: r.primary }}>自</span>}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', alignItems: 'center' }}>
              {recentForm.map((rank, fi) => {
                const col = rank === 1 ? C.gold : rank <= 3 ? C.green : rank <= 6 ? C.textDim : C.border2
                return <div key={fi} style={{ width: '6px', height: '6px', borderRadius: '50%', background: col, flexShrink: 0 }} />
              })}
              {recentForm.length === 0 && <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.border2 }}>—</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: i === 0 ? C.gold : r.isMe ? C.text : C.textSub, textShadow: i === 0 ? `0 0 8px ${alpha(C.gold, 0.5)}` : 'none' }}>{r.points}</span>
              <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, marginLeft: '2px' }}>pt</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
