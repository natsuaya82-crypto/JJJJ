import { useState } from 'react'
import PlayerRow from '../player/PlayerRow'
import SortSelect from '../ui/SortSelect'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { comparePlayers, PLAYER_SORT_LABEL, type PlayerSortKey } from '../../utils/playerSort'
import type { HofPlayer } from '../../types'
import { C, F } from '../../styles/tokens'
import PlayerList from '../player/PlayerList'

// 殿堂入りチームの一覧の見た目と並び替えはここ1本。
//
// 使うのは2か所。
//   自分の殿堂入りページ            HofTeamPage（タップで解除）
//   相手の殿堂入り（フレンド・走友会） FriendDetailPage の右のページ（タップは何もしない）
// 別々に書くと、並び順の選択肢や行の見た目が片方だけズレる。
//
// 選手詳細（長押し）を開けるようにする登録は**呼ぶ側**がやること。
// 画面ごとに「いま何を見せているか」が違うため（utils/previewStore）。

// 「登録順」は選手の中身では決まらない（殿堂入りした順番＝配列の並び）ので、
// comparePlayers のキーではなくこの一覧だけの並びとして持つ
type HofSortKey = 'registered' | PlayerSortKey
const SORT_OPTIONS: { value: HofSortKey; label: string }[] = [
  { value: 'registered', label: '登録順' },
  { value: 'ovr', label: PLAYER_SORT_LABEL.ovr },
  { value: 'age', label: PLAYER_SORT_LABEL.age },
  { value: 'specialty', label: PLAYER_SORT_LABEL.specialty },
  { value: 'name', label: PLAYER_SORT_LABEL.name },
]

/** 殿堂入りの並び替え。呼ぶ側が「登録順」のままの配列を渡す前提 */
function sortHof(hof: readonly HofPlayer[], key: HofSortKey): HofPlayer[] {
  if (key === 'registered') return [...hof]
  return [...hof].sort((a, b) => comparePlayers(key, key === 'age' ? 'asc' : 'desc')(a.player, b.player))
}

export default function HofList({
  hof, hint, emptyLabel, emptySub, onTap,
}: {
  hof: readonly HofPlayer[]
  /** 左上に出す一行の説明 */
  hint: string
  emptyLabel: string
  emptySub?: string
  /** 行をタップしたとき。渡さなければタップは何もしない（長押しの詳細だけ効く） */
  onTap?: (h: HofPlayer) => void
}) {
  const [sortKey, setSortKey] = useState<HofSortKey>('registered')
  const longPress = usePlayerLongPress()
  const sorted = sortHof(hof, sortKey)

  return (
    <>
      <div style={{ padding: '0 12px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: F.label, color: C.textDim }}>{hint}</div>
        <SortSelect options={SORT_OPTIONS} value={sortKey} onChange={setSortKey} style={{ flexShrink: 0 }} />
      </div>

      <PlayerList>
        {sorted.map(h => (
          <PlayerRow
            key={h.player.id}
            player={h.player}
            handlers={longPress(h.player.id, onTap ? () => onTap(h) : undefined)}
            hideStatusBadges
          />
        ))}
        {sorted.length === 0 && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: C.textGhost, fontSize: F.bodyLg, lineHeight: 1.8 }}>
            {emptyLabel}
            {emptySub && <><br /><span style={{ fontSize: F.label }}>{emptySub}</span></>}
          </div>
        )}
      </PlayerList>
    </>
  )
}
