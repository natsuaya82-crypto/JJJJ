import PlayerFace from '../../player/PlayerFace'
import { ovr, ratingColor } from '../../../utils/playerUtils'
import type { Player } from '../../../types'
import { C, alpha, SAIRA } from '../../../styles/tokens'

// 相手から来た移籍オファーのカード（承諾／カウンター＝ダイアル／拒否）
// 相手クラブから来た打診の1行。返事は会話（ChatView）でするので、ここはタップして開くだけ。
export function OfferChatRow({ player, accent, badge, title, sub, onOpen }: {
  player: Player; accent: string; badge?: string; title: string; sub: string; onOpen: () => void
}) {
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1.5px solid ${alpha(accent, 0.4)}`, padding: '10px 12px', marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(accent, 0.4)}` }}>
          <PlayerFace playerId={player.id} nationality={player.nationality} size={40} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            {badge && <span style={{ fontFamily: SAIRA, fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: alpha(accent, 0.18), color: accent, flexShrink: 0 }}>{badge}</span>}
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{sub}</div>
        </div>
        <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(ovr(player)) }}>{ovr(player)}</span>
      </div>
    </button>
  )
}
