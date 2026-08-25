// 下タブ「オンライン」に出す未読の数。
//
// ■なぜ要るのか（オーナー・2026-08-16）
//   「走友会の通知の件なんだけど、下タブのオンラインのとこに1とかつけて欲しいし、
//     チャットのとこにもつけて欲しいのよ」
//
// ★数えるのは**オンラインの下にぶら下がっているもの**だけ（フレンド・走友会）。
//   ベル（useNotifCount）はゲーム内の用件も混ぜて数えるので、そちらを流用しない。
// ★中身は既にある2本をそのまま使う。ここで通信しないこと
//   （`useClubGifts` / `useFriendRequests` が読み込みと間引きを持っている）。
import { useClubGifts } from '../../lib/useClubGifts'
import { useFriendRequests } from '../../lib/useFriendRequests'
import { useClubFeedUnread } from '../../lib/useClubFeedUnread'

export function useOnlineBadge(): number {
  // 走友会からのカードの差し入れ
  const clubGifts = useClubGifts()
  // フレンド申請
  const friendReqs = useFriendRequests()
  // 走友会の掲示板の未読（オーナー・2026-08-23「オンラインの文字と掲示板にもつけて」）
  const feedUnread = useClubFeedUnread()
  return clubGifts.length + friendReqs.length + feedUnread
}
