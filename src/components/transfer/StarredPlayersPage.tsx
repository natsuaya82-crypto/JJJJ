import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { ovr, ratingColor, SPEC_COLOR, calcTransferValue, faMarketSalary } from '../../utils/playerUtils'
import { fmtYen } from '../../utils/money'
import { SPECIALTY_LABELS } from '../../types'
import { C, alpha, SAIRA } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { useOpponentMenu } from '../teams/opponentMenu'
import { panelStyle } from '../ui/Panel'


export default function StarredPlayersPage() {
  const players = useGameStore(s => s.players)
  const clubIndex = useClubIndex()
  const scoutProspects = useGameStore(s => s.currentSeason.scoutProspects) ?? []
  const starredOpponents = useGameStore(s => s.starredOpponents) ?? []
  const starredProspectIds = useGameStore(s => s.starredProspects) ?? []
  const toggleStarOpponent = useGameStore(s => s.toggleStarOpponent)
  const toggleStarProspect = useGameStore(s => s.toggleStarProspect)
  const playerTeamId = useGameStore(s => s.playerTeamId)
  const longPressP = usePlayerLongPress()
  // 相手チームタブと同じ操作：タップ=契約メニュー(移籍/レンタル)、長押し=詳細
  const { rowHandlers, overlay } = useOpponentMenu()

  // ★は選手詳細から starredOpponents（通常選手）/ starredProspects（ドラフト候補）の
  // 2系統に保存されるため、両方を合流して表示する（候補に★を付けたのに出ない問題の解消）。
  // 外す時に正しいリストへ返すため、どちら由来かを持ち回る
  const starredPlayers = [
    ...starredOpponents.map(id => ({ id, fromProspectList: false })),
    ...starredProspectIds.filter(id => !starredOpponents.includes(id)).map(id => ({ id, fromProspectList: true })),
  ]
    .map(({ id, fromProspectList }) => {
      const p = players.find(pl => pl.id === id) ?? scoutProspects.find(pl => pl.id === id)
      return p ? { p, fromProspectList } : null
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
    // 獲得した（自チームに来た）選手はウォッチリストから消す
    .filter(e => e.p.teamId !== playerTeamId)

  function getTeamName(teamId: string): string {
    if (teamId === '') return '未所属'
    return clubIndex.byId(teamId)?.shortName ?? '—'
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px', minHeight: '100%' }}>
      <PageHeader
        eyebrow="TRANSFER"
        title="WATCHLIST"
        right={starredPlayers.length > 0
          ? <span style={{ fontSize: 14, color: C.textDim }}>{starredPlayers.length}名</span>
          : undefined}
      />

      <div style={{ padding: '4px 16px 16px' }}>
        {starredPlayers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: C.textGhost, fontSize: 12, backgroundColor: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
            選手ページで ☆ を押すとここに表示されます
          </div>
        ) : starredPlayers.map(({ p, fromProspectList }) => {
          const rating   = ovr(p)
          const specCol  = SPEC_COLOR[p.specialty]
          const isProspect = !players.some(pp => pp.id === p.id)
          const teamName = isProspect ? p.origin : getTeamName(p.teamId)
          const isFA     = p.teamId === ''
          const value    = isFA ? faMarketSalary(p) : calcTransferValue(p)
          const valueLabel = isFA ? '市場' : '価値'
          // 他チーム所属の現役選手はタップ=契約メニュー/長押し=詳細。自チーム/FA/ドラフト候補は長押し=詳細のみ
          const isOpp = !isProspect && !isFA && p.teamId !== playerTeamId && p.status === 'active'
          const rowProps = isOpp ? rowHandlers(p.id) : longPressP(p.id)

          return (
            <div key={p.id} style={{ marginBottom: '7px' }}>
              <div style={panelStyle(specCol)}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div {...rowProps} style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <div style={{ flexShrink: 0, position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specCol, 0.35)}` }}>
                      <PlayerFace playerId={p.id} nationality={p.nationality} size={52} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, fontFamily: SAIRA, marginBottom: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(rating) }}>{rating}</span>
                        <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{p.age}歳</span>
                        <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{teamName}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>{valueLabel} <span style={{ color: C.gold }}>{fmtYen(value)}</span></span>
                        <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>年俸 <span style={{ color: C.textSub }}>{fmtYen(p.contract.annualSalary)}</span></span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); if (fromProspectList) toggleStarProspect(p.id); else toggleStarOpponent(p.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: C.gold, fontSize: 18, lineHeight: 1 }}
                      >
                        ★
                      </button>
                      <span style={{ fontFamily: SAIRA, fontSize: 9, color: C.textGhost }}>
                        {SPECIALTY_LABELS[p.specialty]}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {overlay}
    </div>
  )
}
