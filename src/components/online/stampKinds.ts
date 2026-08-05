// 応援スタンプの種類。
// 番号（配列の位置）を broadcast で送るので、順番は変えないこと。
// 画面の部品（StampLayer / StampBar）と送り手の両方から読むので、定数だけを別に置く。

/** 押せる絵文字 */
export const RACE_EMOJI = ['📣', '🔥', '💪', '👏', '😱', '🙏'] as const

/** 選手を指して送る応援の言葉 */
export const RACE_CHEERS = ['がんばれ！', 'いける！', 'ナイスラン！', 'まだいける！'] as const

/** 送られてくるスタンプ1つぶん。roomChannel をそのまま流れる形 */
export type StampPayload = {
  /** 絵文字の番号。選手スタンプのときは省略 */
  e?: number
  /** 選手スタンプ：選手ID・名前・国籍・応援の言葉の番号 */
  p?: { id: string; name: string; nat: string; c: number }
  /** 送った人のチーム略称。誰からか分かるように添える */
  from?: string
}
