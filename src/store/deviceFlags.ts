// 「セーブではなく端末に紐づくもの」を置く場所。**スロットをまたいで共通**。
//
// GMパス（広告なし）は買った人の権利であって、セーブデータではない。
// resetGame（データリセット）でもわざわざ引き継いでいるのはそのため。
// ところがセーブの中（GameState.adsRemoved）に持っていたので、
// **スロットを増やすと権利までスロットごとになってしまう**：
//   スロット2を開く → adsRemoved は初期値 false → バナー広告が出る
//   → 起動時の購入確認が返ってきてやっと消える（その間ずっと出たまま）
// 権利は端末の持ち物なので、スロットの選択と同じく localStorage に置く。
//
// ここに置いてよいのは「どのスロットで遊んでいても同じであるべきもの」だけ。
// 進行に関わるものは絶対に置かないこと（スロットを分けた意味がなくなる）。

const ADS_REMOVED_KEY = 'jpel-device-ads-removed'
const TWITTER_INTRO_KEY = 'jpel-device-twitter-intro-seen'
const NEWS_SEEN_KEY = 'jpel-device-news-seen'

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}
function writeFlag(key: string, v: boolean): void {
  try { localStorage.setItem(key, v ? '1' : '0') } catch { /* 使えない環境では諦める */ }
}

/** GMパス（広告なし）を持っているか。全スロット共通 */
export function deviceAdsRemoved(): boolean { return readFlag(ADS_REMOVED_KEY) }
export function setDeviceAdsRemoved(v: boolean): void { writeFlag(ADS_REMOVED_KEY, v) }

/** 公式Xの案内を見たか。「この端末で一度見たか」の記録なので全スロット共通 */
export function deviceTwitterIntroSeen(): boolean { return readFlag(TWITTER_INTRO_KEY) }
export function setDeviceTwitterIntroSeen(v: boolean): void { writeFlag(TWITTER_INTRO_KEY, v) }

/**
 * 見たお知らせポップの id。**セーブではなく端末**に持つ（公式Xの案内と同じ扱い）。
 * スロットを変えるたびに同じお知らせが出ると、遊ぶ側には壊れて見えるため。
 */
/**
 * **走友会の掲示板を最後に見た時刻**（ISO文字列）。
 *
 * 端末に持つ（セーブではない）。お知らせポップの既読と同じ考え方で、
 * 「どの端末で見たか」が正しく、セーブを移しても未読が復活しないほうが自然なため。
 */
const CLUB_FEED_SEEN_KEY = 'jpel.clubFeedSeenAt'
export function clubFeedSeenAt(): string {
  try { return localStorage.getItem(CLUB_FEED_SEEN_KEY) ?? '' } catch { return '' }
}
export function markClubFeedSeen(atISO: string): void {
  try { localStorage.setItem(CLUB_FEED_SEEN_KEY, atISO) } catch { /* 使えない環境では諦める */ }
}

export function deviceSeenNewsIds(): string[] {
  try { return JSON.parse(localStorage.getItem(NEWS_SEEN_KEY) ?? '[]') as string[] } catch { return [] }
}
export function markDeviceNewsSeen(id: string): void {
  try {
    const next = [...new Set([...deviceSeenNewsIds(), id])]
    localStorage.setItem(NEWS_SEEN_KEY, JSON.stringify(next))
  } catch { /* 使えない環境では諦める */ }
}
