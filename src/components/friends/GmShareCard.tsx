import type { Team } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { useTeamHistory } from '../../lib/useTeamHistory'
import { topTitleCount } from '../../utils/teamHistory'
import { useMyRatedRank } from '../../lib/useRatedRanks'
import { RankBadge } from '../rated/ratedUi'
import { C, SAIRA, CARD, F } from '../../styles/tokens'

const GOLD = CARD.gold

// SNS共有用のGMカード（固定幅・オフスクリーンで描画して html2canvas でキャプチャ）。
// 選手カードと同じ質感（濃紺グラデ＋金縁＋タスキ）で、フレンドコードを主役に。
export default function GmShareCard({ team, code }: { team?: Team; code: string }) {
  const primary = team?.colors.primary ?? '#122440'
  const secondary = team?.colors.secondary ?? GOLD
  // 通算成績はセーブに持たず、過去シーズンの順位表から数え直す（utils/teamHistory.ts）
  const history = useTeamHistory(team?.id)
  const myRank = useMyRatedRank()
  // ★**1部の優勝だけ**（オーナー判断・2026-08-14）。utils/teamHistory の1本
  const champs = `${topTitleCount(history.titles)}`
  const seasons = history.seasonResults.length

  return (
    <div style={{
      width: 480, boxSizing: 'border-box',
      background: 'linear-gradient(165deg, #14263f 0%, #0a1220 55%, #070c15 100%)',
      border: `3px solid ${GOLD}`, padding: 24,
      fontFamily: SAIRA, color: CARD.text, position: 'relative', overflow: 'hidden',
    }}>
      {/* 斜めのタスキ風アクセント */}
      <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, background: `linear-gradient(135deg, transparent 46%, ${secondary}22 50%, transparent 54%)`, transform: 'rotate(12deg)' }} />

      {/* ブランド行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, position: 'relative' }}>
        <span style={{ fontSize: F.bodyLg, fontWeight: 900, letterSpacing: 3, color: GOLD }}>JPEL MANAGER</span>
        <span style={{ fontSize: F.body, fontWeight: 900, letterSpacing: 3, color: C.shareDim }}>GM CARD</span>
      </div>

      {/* ロゴ＋チーム名＋GM名 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, position: 'relative' }}>
        <div style={{ flexShrink: 0, padding: 6,background: `linear-gradient(180deg, ${GOLD}33, ${GOLD}0d)`, border: `2px solid ${GOLD}66` }}>
          <TeamLogoSVG primary={primary} secondary={secondary} shortName={team?.shortName ?? '—'} teamId={team?.id} size={96} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ fontSize: F.subLg, fontWeight: 700, color: '#C9C6D0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? '自チーム'}</div>
            {/* 相手に見せる画像なので段位も入れる。ランクマッチ未参加なら何も出ない */}
            <RankBadge rating={myRank} size={24} />
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.05, marginTop: 2 }}>GM {team?.gmName ?? '—'}</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginTop: 8 }}>
            <span style={{ fontSize: F.bodyLg, color: C.shareDim }}>通算優勝 <b style={{ color: GOLD, fontSize: F.titleLg }}>{champs}</b></span>
            <span style={{ fontSize: F.bodyLg, color: C.shareDim }}>監督歴 <b style={{ color: CARD.text, fontSize: F.titleLg }}>{seasons}</b>季</span>
          </div>
        </div>
      </div>

      {/* フレンドコード（主役） */}
      <div style={{ position: 'relative',padding: '16px 20px', background: 'linear-gradient(180deg, rgba(201,168,76,0.14), rgba(0,0,0,0.35))', border: `2px solid ${GOLD}88`, textAlign: 'center' }}>
        <div style={{ fontSize: F.body, fontWeight: 900, letterSpacing: 4, color: GOLD, marginBottom: 6 }}>FRIEND CODE</div>
        <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: 8, color: '#FFE9A8', lineHeight: 1, textShadow: `0 0 18px ${GOLD}66` }}>{code}</div>
      </div>

      {/* フッタ */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${GOLD}33`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <span style={{ fontSize: F.bodyLg, fontWeight: 800, color: CARD.text }}>このコードで <span style={{ color: GOLD }}>フレンド申請</span> してね！</span>
        <span style={{ fontSize: F.label, color: '#6B7488', letterSpacing: 2 }}>#JPELManager</span>
      </div>
    </div>
  )
}
