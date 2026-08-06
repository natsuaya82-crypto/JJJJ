import { useEffect, useState } from 'react'
import BackButton from '../ui/BackButton'
import PlayerRow from '../player/PlayerRow'
import SortSelect from '../ui/SortSelect'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { useGameStore } from '../../store/gameStore'
import { usePreviewStore } from '../../store/previewStore'
import { HOF_MAX } from '../../utils/hofRoster'
import { comparePlayers, PLAYER_SORT_LABEL, type PlayerSortKey } from '../../utils/playerSort'
import type { HofPlayer } from '../../types'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
// 未登録セーブ用の空配列。ここで [] を書くと毎回別物になり、下の useEffect が回り続ける
const EMPTY: HofPlayer[] = []

// 「登録順」は選手の中身では決まらない（殿堂入りした順番＝配列の並び）ので、
// comparePlayers のキーではなくこの画面だけの並びとして持つ
type HofSortKey = 'registered' | PlayerSortKey
const SORT_OPTIONS: { value: HofSortKey; label: string }[] = [
  { value: 'registered', label: '登録順' },
  { value: 'ovr', label: PLAYER_SORT_LABEL.ovr },
  { value: 'age', label: PLAYER_SORT_LABEL.age },
  { value: 'specialty', label: PLAYER_SORT_LABEL.specialty },
  { value: 'name', label: PLAYER_SORT_LABEL.name },
]

// 殿堂入りチーム。登録した瞬間の選手を凍らせて貯める（utils/hofRoster.ts）。
// 見た目・操作はロスターと同じものを使う。
//   一覧    PlayerRow
//   並び替え SortSelect + comparePlayers
//   長押し  選手詳細（usePlayerLongPress）/ タップ  殿堂入りを解除
export default function HofTeamPage() {
  const hof = useGameStore(s => s.hofRoster) ?? EMPTY
  const remove = useGameStore(s => s.removeHofPlayer)
  const setPreview = usePreviewStore(s => s.setPlayers)
  const [sortKey, setSortKey] = useState<HofSortKey>('registered')

  // 詳細は「登録した時点の姿」を見せる。いまの本人を開くと能力が違って混乱するので、
  // フレンドのロスターと同じ仕組み（previewStore）に凍らせたコピーを載せる
  useEffect(() => {
    setPreview(hof.map(h => h.player))
    return () => setPreview([])
  }, [hof, setPreview])

  const longPress = usePlayerLongPress()

  const sorted = sortKey === 'registered'
    ? hof
    : [...hof].sort((a, b) => comparePlayers(sortKey, sortKey === 'age' ? 'asc' : 'desc')(a.player, b.player))

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
        <div style={{ flex: 1, fontSize: 11, color: C.textDim }}>タップで解除（長押しで詳細）</div>
        <SortSelect options={SORT_OPTIONS} value={sortKey} onChange={setSortKey} style={{ flexShrink: 0 }} />
      </div>

      <div style={{ margin: '0 12px', borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {sorted.map(h => (
          <PlayerRow
            key={h.player.id}
            player={h.player}
            handlers={longPress(h.player.id, () => remove(h.player.id))}
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
    </div>
  )
}
