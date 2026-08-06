import { useRef, useState } from 'react'
import BackButton from '../ui/BackButton'
import PlayerRow, { type RowHandlers } from '../player/PlayerRow'
import PlayerFace from '../player/PlayerFace'
import ActionSheet from '../ui/ActionSheet'
import SortSelect from '../ui/SortSelect'
import { useGameStore } from '../../store/gameStore'
import { usePreviewStore } from '../../store/previewStore'
import { HOF_MAX } from '../../utils/hofRoster'
import { comparePlayers, PLAYER_SORT_LABEL, type PlayerSortKey } from '../../utils/playerSort'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const SORT_OPTIONS: { value: PlayerSortKey; label: string }[] = [
  { value: 'ovr', label: PLAYER_SORT_LABEL.ovr },
  { value: 'age', label: PLAYER_SORT_LABEL.age },
  { value: 'specialty', label: PLAYER_SORT_LABEL.specialty },
  { value: 'name', label: PLAYER_SORT_LABEL.name },
]

// 殿堂入りチーム。登録した瞬間の選手を凍らせて貯める（utils/hofRoster.ts）。
// 見た目・操作はロスター（TeamManagement / NoSalePage）と同じものを使う。
//   一覧    PlayerRow
//   並び替え SortSelect + comparePlayers
//   タップ  シート / 長押し 詳細
export default function HofTeamPage() {
  const hof = useGameStore(s => s.hofRoster) ?? []
  const remove = useGameStore(s => s.removeHofPlayer)
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const setPreview = usePreviewStore(s => s.setPlayers)
  const [sortKey, setSortKey] = useState<PlayerSortKey>('ovr')
  const [sheetId, setSheetId] = useState<string | null>(null)
  const lp = useRef<{ t?: number; long: boolean }>({ long: false })

  const sorted = [...hof].sort((a, b) => comparePlayers(sortKey, sortKey === 'age' ? 'asc' : 'desc')(a.player, b.player))
  const target = sorted.find(h => h.player.id === sheetId)

  // 詳細は「登録した時点の姿」を見せる。いまの本人を開くと能力が違って混乱するので、
  // フレンドのロスターと同じ仕組み（previewStore）に凍らせたコピーを載せてから開く
  const openFrozenDetail = (playerId: string) => {
    setPreview(hof.map(h => h.player))
    openPlayerSheet(playerId)
  }

  // タップ＝シート / 長押し＝詳細。ロスターと同じ操作にそろえる
  const rowHandlers = (pid: string): RowHandlers => ({
    onPointerDown: () => { lp.current.long = false; lp.current.t = window.setTimeout(() => { lp.current.long = true; openFrozenDetail(pid) }, 450) },
    onPointerUp: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onPointerLeave: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onPointerMove: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onClick: () => { if (!lp.current.long) setSheetId(pid) },
  })

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 90, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900 }}>HALL OF FAME</div>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>殿堂入りチーム</div>
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: hof.length >= HOF_MAX ? C.gold : C.textSub }}>
          {hof.length}<span style={{ fontSize: 11, color: C.textDim }}>/{HOF_MAX}</span>
        </div>
      </div>

      <div style={{ padding: '0 12px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 11, color: C.textDim }}>登録した時点の能力で固定</div>
        <SortSelect options={SORT_OPTIONS} value={sortKey} onChange={setSortKey} style={{ flexShrink: 0 }} />
      </div>

      <div style={{ margin: '0 12px', borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {sorted.map(h => (
          <PlayerRow
            key={h.player.id}
            player={h.player}
            handlers={rowHandlers(h.player.id)}
            hideStatusBadges
            extra={
              <span style={{
                fontSize: 8, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
                backgroundColor: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.3)}`, color: C.gold,
              }}>{h.year}年 {h.teamName}</span>
            }
          />
        ))}
        {sorted.length === 0 && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: C.textGhost, fontSize: 13, lineHeight: 1.8 }}>
            まだ誰もいません<br />
            <span style={{ fontSize: 11 }}>選手のページから登録できます</span>
          </div>
        )}
      </div>

      {target && (
        <ActionSheet
          open={!!target}
          onClose={() => setSheetId(null)}
          header={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                <PlayerFace playerId={target.player.id} nationality={target.player.nationality} customFace={target.player.customFace} size={44} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{target.player.name}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{target.year}年 · {target.teamName} · OVR{target.ovr} で固定</div>
              </div>
            </div>
          }
          items={[
            { label: '選手の詳細', onClick: () => { const id = target.player.id; setSheetId(null); openFrozenDetail(id) } },
            { label: '殿堂入りから外す', color: C.red, onClick: () => { remove(target.player.id); setSheetId(null) } },
          ]}
        />
      )}
    </div>
  )
}
