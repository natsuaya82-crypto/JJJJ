// 走友会の掲示板の「まだ見ていない書き込み」の数。
//
// ■なぜ要るのか（オーナー・2026-08-23
//   「走友会の掲示板の通知が来ないせいで誰も開かないからオンラインやらないのよ」）
//   届いたカード（`useClubGifts`）とフレンド申請（`useFriendRequests`）は数えて
//   出しているのに、**掲示板だけ何の合図も無かった**ので、書き込んでも誰も気づけない。
//
// ■置き方は `useClubGifts` とまったく同じ
//   中身はここに1つだけ置いて、見ている画面へまとめて配る（下タブの数字と
//   走友会の「掲示板」タブの両方が同じものを見る）。画面ごとに読みに行くと
//   同じ問い合わせが二重に走る。
//
// ★**数だけ返す関数はサーバーに足していません。** 足すと `all.sql` を流し直して
//   もらう必要があるため、いまある `club_feed` をそのまま使います。
//   3分に1回までしか読まないので、通信は届いたカードと同じ頻度です。
import { useEffect, useState } from 'react'
import { clubFeed } from './clubsApi'
import { clubFeedSeenAt, markClubFeedSeen } from '../store/deviceFlags'
import { ONLINE_ENABLED } from '../data/featureFlags'

/** 続けて読みに行かない間隔（`useClubGifts` と同じ） */
const COOL_MS = 3 * 60 * 1000

let unread = 0
let newestAt = ''
let loadedAt = 0
let inflight = false
const listeners = new Set<(n: number) => void>()

function emit() {
  for (const f of listeners) f(unread)
}

/**
 * 未読を数え直す。
 * ★**自分の書き込みは数えない**（自分で書いて自分に数字が付くのはおかしい）。
 */
export function loadClubFeedUnread(force = false): void {
  if (!ONLINE_ENABLED || inflight) return
  if (!force && loadedAt > 0 && Date.now() - loadedAt < COOL_MS) return
  inflight = true
  clubFeed()
    .then(posts => {
      const seen = clubFeedSeenAt()
      newestAt = posts.reduce((mx, p) => (p.createdAt > mx ? p.createdAt : mx), '')
      unread = posts.filter(p => !p.mine && p.createdAt > seen).length
      loadedAt = Date.now()
      emit()
    })
    .catch(() => { /* 通信できないときは前の数のままにしておく */ })
    .finally(() => { inflight = false })
}

/**
 * 掲示板を開いたので既読にする。**いちばん新しい書き込みの時刻**を覚える
 * （「いま」を覚えると、読み込みと表示のあいだに来た1件を読み飛ばす）。
 */
export function markClubFeedRead(latestISO?: string): void {
  const at = latestISO ?? newestAt
  if (at) markClubFeedSeen(at)
  unread = 0
  emit()
}

/** いまの未読数。開いたときに一度だけ読みに行く。 */
export function useClubFeedUnread(): number {
  const [n, setN] = useState(unread)
  useEffect(() => {
    listeners.add(setN)
    loadClubFeedUnread()
    return () => { listeners.delete(setN) }
  }, [])
  return n
}
