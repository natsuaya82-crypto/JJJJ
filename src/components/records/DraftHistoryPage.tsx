import { useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { ovr, ratingColor } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import { C, alpha, SAIRA } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import GlassButton from '../ui/GlassButton'
import Panel from '../ui/Panel'


function CardPanel({ children }: { children: React.ReactNode }) {
  return (
    <Panel accent={C.gold}>{children}</Panel>
  )
}

export default function DraftHistoryPage() {
  const { players, playerTeamId, openPlayerSheet } = useGameStore()
  const clubIndex = useClubIndex()
  const navigate = useNavigate()
  const { year } = useParams<{ year?: string }>()
  const selectedYear = year != null ? Number(year) : null

  // 長押しで選手詳細
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lp = (pid: string) => ({
    onPointerDown: () => { timer.current = setTimeout(() => openPlayerSheet(pid), 450) },
    onPointerUp: () => { if (timer.current) clearTimeout(timer.current) },
    onPointerLeave: () => { if (timer.current) clearTimeout(timer.current) },
    onPointerMove: () => { if (timer.current) clearTimeout(timer.current) },
  })

  // ドラフトで指名された選手だけ draftRound/draftPick が入る（初期・自動生成は null）。
  const drafted = players.filter(p => p.draftRound != null)
  const years = [...new Set(drafted.map(p => p.draftYear))].sort((a, b) => b - a)

  // ── その年度のドラフトボード（別ページ相当） ──
  if (selectedYear != null) {
    const list = drafted
      .filter(p => p.draftYear === selectedYear)
      .sort((a, b) => (a.draftRound! - b.draftRound!) || ((a.draftPick ?? 0) - (b.draftPick ?? 0)))

    return (
      <div style={{ fontFamily: SAIRA, paddingBottom: '80px', minHeight: '100dvh' }}>
        <PageHeader eyebrow="DRAFT" title={`${selectedYear}年度 ドラフト`} />

        <div style={{ padding: '12px 16px 0' }}>
          <CardPanel>
            {list.map((p, i) => {
              // 海外クラブへ移籍した選手も所属が出るよう、国内チーム→海外クラブの順で解決
              const team = clubIndex.byId(p.teamId)
              const isRetired = p.status === 'retired'
              const isMine = p.teamId === playerTeamId
              const o = ovr(p)
              const overall = (p.draftRound! - 1) * 20 + (p.draftPick ?? 0)
              return (
                <div key={p.id} {...lp(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: i < list.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', opacity: isRetired ? 0.6 : 1 }}>
                  <span style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: 900, color: overall === 1 ? C.gold : overall <= 3 ? C.green : C.textSub, width: '32px', textAlign: 'center', flexShrink: 0 }}>{overall}<span style={{ fontSize: 8, color: C.textDim, fontWeight: 700 }}>位</span></span>
                  <div style={{ width: '30px', height: '30px',flexShrink: 0, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={30} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontFamily: SAIRA, fontSize: '13px', color: C.text }}>{p.name}</span>
                      {isRetired && <span style={{ fontFamily: SAIRA, fontSize: '8px', padding: '1px 4px',background: alpha(C.textGhost, 0.12), color: C.textGhost }}>引退</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
                      {team && <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={12} />}
                      <span style={{ fontSize: '9px', color: isMine ? C.gold : C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {team?.name ?? (isRetired ? '引退' : '未所属')} / {SPECIALTY_LABELS[p.specialty]} / {p.age}歳
                      </span>
                    </div>
                  </div>
                  <span style={{ fontFamily: SAIRA, fontSize: '18px', fontWeight: '900', color: ratingColor(o) }}>{o}</span>
                </div>
              )
            })}
          </CardPanel>
        </div>
      </div>
    )
  }

  // ── 年度一覧（年度ボタン） ──
  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: '80px', minHeight: '100dvh' }}>
      <PageHeader eyebrow="RECORDS" title="歴代ドラフト" />
      <div style={{ padding: '0 16px' }}>
        <div style={{ fontSize: '11px', color: C.textDim, marginBottom: '14px' }}>年度を選ぶとその年のドラフト（1〜40位）を表示</div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {years.length === 0 ? (
          <CardPanel>
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: 13, padding: '20px 0' }}>まだドラフト指名がありません</div>
          </CardPanel>
        ) : years.map(y => {
          const count = drafted.filter(p => p.draftYear === y).length
          return (
            <GlassButton key={y} full style={{
              justifyContent: 'flex-start', gap: 12, textAlign: 'left', padding: '14px 16px', color: C.text,
            }} onClick={() => navigate(`/records/draft/${y}`)}>
              <span style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.gold, lineHeight: 1 }}>{y}<span style={{ fontSize: 11, color: C.textDim, fontWeight: 700, marginLeft: 2 }}>年度</span></span>
              <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, padding: '2px 8px',background: alpha(C.gold, 0.12) }}>{count}名</span>
              <span style={{ marginLeft: 'auto', color: C.textGhost, fontSize: 18 }}>›</span>
            </GlassButton>
          )
        })}
      </div>
    </div>
  )
}
