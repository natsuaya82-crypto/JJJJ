import type { Player, Team } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, ratingColor, SPEC_COLOR, isStatMaxed } from '../../utils/playerUtils'
import { useGameStore } from '../../store/gameStore'
import { getPlayerBadges } from '../../utils/badges'
import BadgeContent, { badgeColor } from '../player/BadgeContent'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const STATS: { key: keyof Player['ratings']; label: string }[] = [
  { key: 'speed', label: '速力' },
  { key: 'stamina', label: '持久' },
  { key: 'mountainUp', label: '登り' },
  { key: 'mountainDown', label: '下り' },
  { key: 'pacing', label: 'ペース' },
  { key: 'mental', label: '精神' },
  { key: 'recovery', label: '回復' },
]

// SNS共有用の選手カード（固定幅・オフスクリーンで描画してhtml2canvasでキャプチャ）。
export default function ShareCard({ player, team }: { player: Player; team?: Team }) {
  const rating = ovr(player)
  const specCol = SPEC_COLOR[player.specialty]
  const GOLD = '#C9A84C'
  // 記録パッチ（世界記録・日本記録・MVP・区間記録など）。選択中があればそれ、無ければ優先順の最上位を1個
  const worldRecords = useGameStore(s => s.worldRecords)
  const japanRecords = useGameStore(s => s.japanRecords)
  const seasonAwards = useGameStore(s => s.seasonAwards)
  const segmentRecords = useGameStore(s => s.segmentRecords)
  const eclHistory = useGameStore(s => s.eclHistory)
  const worldRepresentatives = useGameStore(s => s.worldRepresentatives)
  const eventSeasonTops = useGameStore(s => s.eventSeasonTops)
  const worldAthleticsResults = useGameStore(s => s.worldAthleticsResults)
  const badgeList = getPlayerBadges(player, { worldRecords, japanRecords, seasonAwards, segmentRecords, eclHistory, worldRepresentatives, eventSeasonTops, worldAthleticsResults }, 99)
  const shareBadge = (player.displayBadge ? badgeList.find(b => b.key === player.displayBadge) : undefined) ?? badgeList[0]

  return (
    <div style={{
      width: 480, boxSizing: 'border-box',
      background: 'linear-gradient(165deg, #14263f 0%, #0a1220 55%, #070c15 100%)',
      border: `3px solid ${GOLD}`,
      padding: 24,
      fontFamily: SAIRA, color: '#F0EDE8', position: 'relative', overflow: 'hidden',
    }}>
      {/* 斜めのタスキ風アクセント */}
      <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, background: `linear-gradient(135deg, transparent 46%, ${specCol}22 50%, transparent 54%)`, transform: 'rotate(12deg)' }} />

      {/* ブランド行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, position: 'relative' }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 3, color: GOLD }}>JPEL MANAGER</span>
        {team && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={20} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#C9C6D0' }}>{team.name}</span>
          </span>
        )}
      </div>

      {/* 顔＋名前＋OVR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, position: 'relative' }}>
        <div style={{ flexShrink: 0, borderRadius: 12, overflow: 'hidden', border: `2px solid ${specCol}66` }}>
          <PlayerFace playerId={player.id} nationality={player.nationality} size={104} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05, marginBottom: 6 }}>{player.name}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 900, color: specCol }}>{SPECIALTY_LABELS[player.specialty]}</span>
            <span style={{ fontSize: 14, color: '#8C93A5' }}>{player.age}歳</span>
            {shareBadge && (
              <span style={{ fontSize: 11, fontWeight: 900, padding: '2px 8px', borderRadius: 6, background: `${badgeColor(shareBadge)}26`, border: `1px solid ${badgeColor(shareBadge)}88`, color: badgeColor(shareBadge) }}>
                <BadgeContent badge={shareBadge} iconSize={11} />
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#8C93A5', letterSpacing: 2 }}>OVR</div>
          <div style={{ fontSize: 58, fontWeight: 900, lineHeight: 1, color: ratingColor(rating), fontFamily: 'monospace' }}>{rating}</div>
        </div>
      </div>

      {/* 能力バー */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', position: 'relative' }}>
        {STATS.map(({ key, label }) => {
          const v = player.ratings[key] ?? 0
          const maxed = isStatMaxed(player, key)
          const col = ratingColor(v, maxed)
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#8C93A5', width: 40, flexShrink: 0 }}>{label}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#1c2a3d', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, v)}%`, height: '100%', background: col, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 900, color: col, width: 26, textAlign: 'right', fontFamily: 'monospace' }}>{v}</span>
            </div>
          )
        })}
      </div>

      {/* フッタ */}
      <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${GOLD}33`, textAlign: 'center', fontSize: 11, color: '#6B7488', letterSpacing: 2, position: 'relative' }}>
        #JPELManager ｜ 駅伝マネージャー
      </div>
    </div>
  )
}
