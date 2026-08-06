// ベルの数字。通知ページの「N件」と必ず同じになるよう、数え方は
// utils/notifItems.ts の collectNotifications 1本だけを使う（以前はここに数え方が
// まるごとコピーされていて、片方だけ直すとベルとページの件数がズレていた）
import { useGameStore } from '../../store/gameStore'
import { useClubGifts } from '../../lib/useClubGifts'
import { collectNotifications } from '../../utils/notifItems'

const EMPTY_IDS: string[] = []

export function useNotifCount(): number {
  const { currentSeason, players, teams, playerTeamId, lastLoginDate } = useGameStore()
  const clubGifts = useClubGifts()
  // ※セレクタで `?? []` すると毎回新しい配列になり無限レンダリングするので、フィールドをそのまま取る
  const pendingGifts = useGameStore(s => s.pendingGifts)
  const seenJoinIds = useGameStore(s => s.seenJoinIds)
  const seenInjuryIds = useGameStore(s => s.seenInjuryIds)

  return collectNotifications({
    currentSeason, players, teams, playerTeamId, lastLoginDate,
    seenJoinIds: seenJoinIds ?? EMPTY_IDS,
    seenInjuryIds: seenInjuryIds ?? EMPTY_IDS,
    pendingGiftsCount: (pendingGifts ?? []).length,
    clubGiftsCount: clubGifts.length,
  }).total
}
