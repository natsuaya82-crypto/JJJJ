import type { ChatMessage, Player } from '../types'
import { settledPath } from './talkSync'

// 進路が決まった選手の「本人の返事」を書く唯一の場所。
//
// ■なぜ1本にするのか（実際に起きていたこと）
//   チャットのログは2つの経路で積まれる。
//     ・ボタンを押したときにその場で足す（append）
//     ・次に開いたときに、いまの状態から作り直して足す（buildMessages → mergeChatMessages）
//   同じ「承諾しました」を両方が別の文で書いていたので、**礼が2回並んでいた**。
//
//     ありがとうございます！絶対に結果を出します。オファーが来たらよろしくお願いします！
//     海外挑戦を認めていただき、ありがとうございます。ヨーロッパのクラブからの話を待ちます。
//
//   重複を潰す仕組み（utils/chatLog の mergeChatMessages）は **kind が同じもの**を1つに
//   まとめるが、ボタン側の発言には kind が付いていなかったので素通りしていた。
//
// ■決まり
//   承諾したあとの本人の返事は、**ボタンから足すときも作り直すときも、ここを呼ぶ**。
//   文面を画面に直書きしないこと（`npm run check` が見張る）。

const OVERSEAS_LABEL: Record<string, string> = { africa: 'アフリカ', europe: 'ヨーロッパ', america: '北米' }

/** 海外挑戦を認めたあとの本人の返事 */
export function overseasApprovedLine(region: string | undefined): ChatMessage {
  return {
    from: 'player',
    kind: 'overseas_ok',
    text: `海外挑戦を認めていただき、ありがとうございます。${OVERSEAS_LABEL[region ?? ''] ?? '海外'}のクラブからの話を待ちます。`,
  }
}

/** 引退を承認したあとの本人の返事 */
export function retireApprovedLine(): ChatMessage {
  return {
    from: 'player',
    kind: 'retire_ok',
    text: '今季限りで引退します。最後のシーズン、悔いの残らないように走り切ります。',
  }
}

/**
 * 進路が決まっている選手の返事（決まっていなければ null）。
 * 判定は talkSync の settledPath 1本を通す。
 */
export function settledLineOf(player: Player | undefined): ChatMessage | null {
  switch (settledPath(player)) {
    case 'retiring': return retireApprovedLine()
    case 'overseas': return overseasApprovedLine(player?.overseasListed)
    default: return null
  }
}
