import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { SPECIALTY_LABELS } from '../../types'
import type { TeamRole } from '../../types'
import { ovr, ratingColor } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const CONTRACT_TYPE_LABEL: Record<string, string> = {
  standard: '本契約',
  dual: '2way契約',
  development: '育成契約',
}

const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  ace: 'エース',
  sub_ace: 'サブエース',
  key_player: '主力',
  rotation: 'ローテ',
  development: '育成',
}

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: C.surface2, border: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 11, color: C.textDim }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? C.textSub, fontFamily: SAIRA }}>{value}</span>
    </div>
  )
}

// contractInfoPlayerId を見て開くグローバルモーダル（App 直下に常時マウント）
export default function ContractInfoModal() {
  const navigate = useNavigate()
  const contractInfoPlayerId = useGameStore(s => s.contractInfoPlayerId)
  const closeContractInfo = useGameStore(s => s.closeContractInfo)
  const players = useGameStore(s => s.players)

  const player = players.find(p => p.id === contractInfoPlayerId)
  if (!player) return null

  const playerOvr = ovr(player)
  const ct = player.contract.contractType ?? 'standard'

  return (
    <>
      <div onClick={closeContractInfo} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 310 }} />
      <div style={{
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(360px, 92vw)', zIndex: 311,
        background: C.surface, borderRadius: 16, border: `1px solid ${C.border2}`,
        padding: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
        fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif",
      }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 12 }}>契約情報</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flexShrink: 0, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border2}` }}>
            <PlayerFace playerId={player.id} nationality={player.nationality} size={48} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{player.name}</div>
            <div style={{ fontSize: 10, color: C.textDim }}>{SPECIALTY_LABELS[player.specialty]} · {player.age}歳</div>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 26, fontWeight: 900, color: ratingColor(playerOvr), lineHeight: 1 }}>{playerOvr}</div>
            <div style={{ fontSize: 8, color: C.textDim, letterSpacing: '1px' }}>OVR</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          <InfoRow label="契約形態" value={CONTRACT_TYPE_LABEL[ct] ?? '本契約'} color={C.text} />
          <InfoRow label="年俸" value={fmt(player.contract.annualSalary)} color={C.gold} />
          <InfoRow label="契約残り" value={`${player.contract.yearsLeft}年`} color={player.contract.yearsLeft <= 1 ? C.red : C.textSub} />
        </div>

        <button
          onClick={() => { closeContractInfo(); navigate(`/team/chat?player=${player.id}`) }}
          style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', cursor: 'pointer', background: C.gold, color: '#1a0d00', fontSize: 14, fontWeight: 900, fontFamily: SAIRA, marginBottom: 8 }}
        >
          契約更新の交渉
        </button>
        <button
          onClick={closeContractInfo}
          style={{ width: '100%', padding: 11, borderRadius: 12, background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
        >
          閉じる
        </button>

        <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.12)}`, borderRadius: 12, pointerEvents: 'none' }} />
      </div>
    </>
  )
}
