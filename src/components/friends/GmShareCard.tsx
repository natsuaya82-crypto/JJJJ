import type { Team } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const GOLD = '#C9A84C'

// SNS共有用のGMカード（固定幅・オフスクリーンで描画して html2canvas でキャプチャ）。
// 選手カードと同じ質感（濃紺グラデ＋金縁＋タスキ）で、フレンドコードを主役に。
export default function GmShareCard({ team, code }: { team?: Team; code: string }) {
  const primary = team?.colors.primary ?? '#122440'
  const secondary = team?.colors.secondary ?? GOLD
  const champs = team?.history?.championships ?? 0
  const seasons = team?.history?.seasonResults?.length ?? 0

  return (
    <div style={{
      width: 480, boxSizing: 'border-box',
      background: 'linear-gradient(165deg, #14263f 0%, #0a1220 55%, #070c15 100%)',
      border: `3px solid ${GOLD}`, padding: 24,
      fontFamily: SAIRA, color: '#F0EDE8', position: 'relative', overflow: 'hidden',
    }}>
      {/* 斜めのタスキ風アクセント */}
      <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, background: `linear-gradient(135deg, transparent 46%, ${secondary}22 50%, transparent 54%)`, transform: 'rotate(12deg)' }} />

      {/* ブランド行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, position: 'relative' }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 3, color: GOLD }}>JPEL MANAGER</span>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 3, color: '#8C93A5' }}>GM CARD</span>
      </div>

      {/* ロゴ＋チーム名＋GM名 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, position: 'relative' }}>
        <div style={{ flexShrink: 0, padding: 6, borderRadius: 14, background: `linear-gradient(180deg, ${GOLD}33, ${GOLD}0d)`, border: `2px solid ${GOLD}66` }}>
          <TeamLogoSVG primary={primary} secondary={secondary} shortName={team?.shortName ?? '—'} teamId={team?.id} size={96} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#C9C6D0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? '自チーム'}</div>
          <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.05, marginTop: 2 }}>GM {team?.gmName ?? '—'}</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginTop: 8 }}>
            <span style={{ fontSize: 13, color: '#8C93A5' }}>通算優勝 <b style={{ color: GOLD, fontSize: 18 }}>{champs}</b></span>
            <span style={{ fontSize: 13, color: '#8C93A5' }}>監督歴 <b style={{ color: '#F0EDE8', fontSize: 18 }}>{seasons}</b>季</span>
          </div>
        </div>
      </div>

      {/* フレンドコード（主役） */}
      <div style={{ position: 'relative', borderRadius: 14, padding: '16px 20px', background: 'linear-gradient(180deg, rgba(201,168,76,0.14), rgba(0,0,0,0.35))', border: `2px solid ${GOLD}88`, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 4, color: GOLD, marginBottom: 6 }}>FRIEND CODE</div>
        <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: 8, color: '#FFE9A8', lineHeight: 1, textShadow: `0 0 18px ${GOLD}66` }}>{code}</div>
      </div>

      {/* フッタ */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${GOLD}33`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#F0EDE8' }}>このコードで <span style={{ color: GOLD }}>フレンド申請</span> してね！</span>
        <span style={{ fontSize: 11, color: '#6B7488', letterSpacing: 2 }}>#JPELManager</span>
      </div>
    </div>
  )
}
