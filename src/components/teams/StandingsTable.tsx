import { TeamLogoSVG } from '../icons/Icons'
import Flag from '../ui/Flag'
import { C, alpha, rankColor, SAIRA } from '../../styles/tokens'
import type { Nationality } from '../../types'
import { panelStyle } from '../ui/Panel'


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
  flagCode?: Nationality // 国別対抗（世界選手権など）ではロゴの代わりに国旗を出す
}

// 全リーグ共通の順位表（JPELと同じ見た目）。
// onRowLongPress: チーム行の長押しでチーム詳細へ（レース結果画面など、タップを他用途に使わない画面用）
// promote / relegate: 昇格・降格の枠数。渡すと上位n・下位nに色と境目の線を出す
//   （1部は降格だけ、3部は昇格だけ。海外リーグは入れ替えが無いので渡さない）
export default function StandingsTable({ rows, onRowClick, onRowLongPress, promote = 0, relegate = 0 }: {
  rows: StandRow[]
  onRowClick?: (id: string) => void
  onRowLongPress?: (id: string) => void
  promote?: number
  relegate?: number
}) {
  const relegateFrom = relegate > 0 ? rows.length - relegate : -1
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  const lpHandlers = (id: string) => onRowLongPress ? {
    onPointerDown: () => { pressTimer = setTimeout(() => onRowLongPress(id), 450) },
    onPointerUp: () => { if (pressTimer) clearTimeout(pressTimer) },
    onPointerLeave: () => { if (pressTimer) clearTimeout(pressTimer) },
    onPointerMove: () => { if (pressTimer) clearTimeout(pressTimer) },
  } : {}
  return (
    <div style={{ ...panelStyle(C.gold), margin: '0 12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 44px 60px', gap: '4px', padding: '7px 12px', background: C.surface3, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700' }}>#</span>
        <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', letterSpacing: '1px' }}>チーム</span>
        <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', textAlign: 'center' }}>直近</span>
        <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', textAlign: 'right' }}>ポイント</span>
      </div>

      {rows.map((r, i) => {
        const recentForm = r.recentForm.slice(-4)
        const isPromote  = promote > 0 && i < promote
        const isRelegate = relegateFrom >= 0 && i >= relegateFrom
        // 枠の色。自チームの行の色より弱くして、どちらも読めるようにする
        const zoneTint = isPromote ? alpha(C.green, 0.10) : isRelegate ? alpha(C.red, 0.10) : null
        const zoneEdge = isPromote ? C.green : isRelegate ? C.red : null
        // 境目の線。昇格枠の最後の行の下と、降格枠の最初の行の上に引く
        const lineBelow = promote > 0 && i === promote - 1
        const lineAbove = relegateFrom > 0 && i === relegateFrom
        return (
          <div key={r.id} onClick={() => onRowClick?.(r.id)} {...lpHandlers(r.id)}
            style={{ display: 'grid', gridTemplateColumns: '28px 1fr 44px 60px', gap: '4px', padding: '9px 12px',
              background: r.isMe ? alpha(r.primary, 0.1) : zoneTint ?? (i % 2 === 0 ? C.surface2 : C.surface),
              borderTop: lineAbove ? `2px dashed ${alpha(C.red, 0.75)}` : 'none',
              borderBottom: lineBelow ? `2px dashed ${alpha(C.green, 0.75)}`
                : i < rows.length - 1 ? `1px solid ${C.border}` : 'none',
              cursor: (onRowClick || onRowLongPress) ? 'pointer' : 'default',
              borderLeft: r.isMe ? `3px solid ${r.primary}` : zoneEdge ? `3px solid ${zoneEdge}` : '3px solid transparent',
              alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* 順位表なので1位も数字で出す。以前は1位だけ★に置き換えていたが、
                  順位を見に来た画面で先頭の順位が読めないのは本末転倒 */}
              <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: rankColor(i + 1), textShadow: i === 0 ? `0 0 6px ${alpha(C.gold, 0.5)}` : 'none' }}>{i + 1}</span>
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
