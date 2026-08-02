// 走友会から届いたカードの控え。
//
// 通知のベルの数字（Layout）と通知パネルの中身の、両方から同じものを見たい。
// 画面ごとに読みに行くと同じ問い合わせが二重に走るので、
// 中身はここに1つだけ置いて、見ている画面へまとめて配る。
import { useEffect, useState } from 'react'
import { clubGiftList, type ClubGift } from './clubsApi'
import { ONLINE_ENABLED } from '../data/featureFlags'

/** 続けて読みに行かない間隔 */
const COOL_MS = 3 * 60 * 1000

let gifts: ClubGift[] = []
let loadedAt = 0
let inflight = false
const listeners = new Set<(g: ClubGift[]) => void>()

function emit() {
  for (const f of listeners) f(gifts)
}

/**
 * 届いているカードを読み直す。
 * force を付けないと、しばらくのあいだは読みに行かない（通信を増やしすぎないため）。
 */
export function loadClubGifts(force = false): void {
  if (!ONLINE_ENABLED || inflight) return
  if (!force && loadedAt > 0 && Date.now() - loadedAt < COOL_MS) return
  inflight = true
  clubGiftList()
    .then(list => { gifts = list; loadedAt = Date.now(); emit() })
    .catch(() => { /* 通信できないときは前の中身のままにしておく */ })
    .finally(() => { inflight = false })
}

/** 1枚受け取ったので控えから外す */
export function dropClubGift(id: string): void {
  gifts = gifts.filter(g => g.id !== id)
  emit()
}

/** まとめて受け取ったので控えを空にする */
export function clearClubGifts(): void {
  gifts = []
  loadedAt = Date.now()
  emit()
}

/** いま届いているカード。開いたときに一度だけ読みに行く。 */
export function useClubGifts(): ClubGift[] {
  const [list, setList] = useState<ClubGift[]>(gifts)
  useEffect(() => {
    listeners.add(setList)
    loadClubGifts()
    return () => { listeners.delete(setList) }
  }, [])
  return list
}
