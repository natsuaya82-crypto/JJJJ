// 届いているフレンド申請の控え。
//
// ■なぜ要るのか（オーナー・2026-08-15）
//   「フレンド申請来てたのに1ってついてなかったから気づかなかった」
//
//   申請の数は**「オンライン」のハブを開いて初めて**出る作りでした。ホームに居る
//   あいだは何の合図も無いので、開かない日は気づけません。
//   走友会から届いたカード（`useClubGifts`）はサーバーから読んでベルに入れているのに、
//   フレンド申請だけ入っていない、という非対称でもありました。
//
// ■置き方は `useClubGifts` とまったく同じ
//   ベルの数字（Layout）と通知ページの中身の両方から同じものを見たいので、
//   中身はここに1つだけ置いて、見ている画面へまとめて配ります。
//   画面ごとに読みに行くと同じ問い合わせが二重に走ります。
import { useEffect, useState } from 'react'
import { listReceived, type FriendRequest } from './friendsApi'
import { ONLINE_ENABLED } from '../data/featureFlags'

/** 続けて読みに行かない間隔（`useClubGifts` と同じ） */
const COOL_MS = 3 * 60 * 1000

let received: FriendRequest[] = []
let loadedAt = 0
let inflight = false
const listeners = new Set<(r: FriendRequest[]) => void>()

function emit() {
  for (const f of listeners) f(received)
}

/**
 * 届いている申請を読み直す。
 * force を付けないと、しばらくのあいだは読みに行かない（通信を増やしすぎないため）。
 */
export function loadFriendRequests(force = false): void {
  if (!ONLINE_ENABLED || inflight) return
  if (!force && loadedAt > 0 && Date.now() - loadedAt < COOL_MS) return
  inflight = true
  listReceived()
    .then(list => { received = list; loadedAt = Date.now(); emit() })
    .catch(() => { /* 通信できないときは前の中身のままにしておく */ })
    .finally(() => { inflight = false })
}

/** 承認・拒否したので控えから外す（読み直しを待たずにベルを減らす） */
export function dropFriendRequest(id: string): void {
  received = received.filter(r => r.id !== id)
  emit()
}

/** いま届いている申請。開いたときに一度だけ読みに行く。 */
export function useFriendRequests(): FriendRequest[] {
  const [list, setList] = useState<FriendRequest[]>(received)
  useEffect(() => {
    listeners.add(setList)
    loadFriendRequests()
    return () => { listeners.delete(setList) }
  }, [])
  return list
}
