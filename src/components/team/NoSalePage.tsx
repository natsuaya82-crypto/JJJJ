import { useRef } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ovr } from '../../utils/playerUtils'
import PlayerRow from '../player/PlayerRow'
import BackButton from '../ui/BackButton'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 非売リスト：指定した選手には他クラブ（国内・海外）からの買い取りオファーが一切来なくなる。
// タップでON/OFF、長押しで選手詳細。レンタル・フリー接触（契約切れ間近の勧誘）は対象外。
export default function NoSalePage() {
  const { players, playerTeamId, toggleNoSale, openPlayerSheet } = useGameStore()

  const myPlayers = players
    .filter(p => p.teamId === playerTeamId && p.status === 'active' && !p.loan)
    .sort((a, b) => (b.noSale ? 1 : 0) - (a.noSale ? 1 : 0) || ovr(b) - ovr(a))
  const noSaleCount = myPlayers.filter(p => p.noSale).length

  // 長押しで詳細（PlayerRowの押下と両立させる）
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpFired = useRef(false)
  const rowHandlers = (pid: string) => ({
    onPointerDown: () => { lpFired.current = false; lpTimer.current = setTimeout(() => { lpFired.current = true; openPlayerSheet(pid) }, 450) },
    onPointerUp: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerLeave: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerMove: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onClick: () => { if (lpFired.current) { lpFired.current = false; return } toggleNoSale(pid) },
  })

  return (
    <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100%' }}>
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <BackButton />
          <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>非売リスト</div>
        </div>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
          タップで非売指定のON/OFF（長押しで詳細）。指定した選手には他クラブからの買い取りオファーが一切来なくなります。
          レンタルの打診と、契約切れ間近のフリー移籍の勧誘（本人の意思）は止められません。
        </div>
        <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, color: noSaleCount > 0 ? C.red : C.textDim }}>
          非売指定 {noSaleCount}名
        </div>
      </div>

      <div style={{ margin: '0 12px', borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {myPlayers.map(p => (
          <PlayerRow
            key={p.id}
            player={p}
            handlers={rowHandlers(p.id)}
            extra={p.noSale ? (
              <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(C.red, 0.15), border: `1px solid ${alpha(C.red, 0.45)}`, color: C.red, fontWeight: 800, flexShrink: 0 }}>非売</span>
            ) : undefined}
            selected={!!p.noSale}
          />
        ))}
        {myPlayers.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: C.textGhost, fontSize: 13 }}>対象の選手がいません</div>
        )}
      </div>
    </div>
  )
}
