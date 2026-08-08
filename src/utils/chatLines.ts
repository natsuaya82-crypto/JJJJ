import type { ChatMessage, Player } from '../types'
import { settledPath } from './talkSync'
// 憧れの地域の呼び名は transferDecision の DREAM_LABEL 1本（ここに表を持たない）
import { dreamLabelOf } from './transferDecision'

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

/** 海外挑戦を認めたあとの本人の返事。地域の呼び名は transferDecision の DREAM_LABEL 1本 */
export function overseasApprovedLine(region: string | undefined): ChatMessage {
  return {
    from: 'player',
    kind: 'overseas_ok',
    text: `海外挑戦を認めていただき、ありがとうございます。${dreamLabelOf(region)}のクラブからの話を待ちます。`,
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

// ── 2か所以上に同じ文面が書かれていたもの ──────────────────────
// 同じ話を別の場所で書き直すと、片方だけ言い回しや金額の書き方が変わる。
// 実際に数えたら7種類が2〜3か所に重複していた。ここに出して呼ぶ側は組み立てない。

/** 契約の提示（更新・獲得・引き抜き。3か所で同じ文面だった） */
export function offerTermsLine(salaryText: string, years: number): ChatMessage {
  return { from: 'gm', text: `年俸${salaryText}、${years}年契約でいかがでしょうか。` }
}

/** 提示を飲んでもらえたとき（獲得・引き抜きの2か所で同じ文面だった） */
export function joinAcceptedLine(): ChatMessage {
  return { from: 'player', text: 'ありがとうございます。その条件で加入します！よろしくお願いします。' }
}

/** ロスターがいっぱいで契約できない（2か所で同じ文面だった） */
export function rosterFullLine(max: number): ChatMessage {
  return { from: 'gm', text: `（ロスターが上限${max}人です。誰かを放出してから改めて提示してください）` }
}

/** 逆提示を持ち帰る（2か所で同じ文面だった） */
export function reconsiderLine(): ChatMessage {
  return { from: 'gm', text: '条件を再考させてください。' }
}

/** 引き留めたあとに契約更新の話へ戻る（2か所で同じ文面だった） */
export function stillWantsRenewalLine(salaryText: string, years: number): ChatMessage {
  return { from: 'player', text: `ただ、契約の件なのですが…年俸${salaryText}・${years}年での更新を希望しています。ご検討ください。` }
}

/** 移籍希望を引き留める（2か所で同じ文面だった） */
export function stayPleaLine(): ChatMessage {
  return { from: 'gm', text: 'まだあなたの力が必要です。残ってください。' }
}

/** 合意したときの短い礼（2か所で同じ文面だった） */
export function thanksLine(): ChatMessage {
  return { from: 'player', text: 'ありがとうございます。よろしくお願いします。' }
}

// ── 組み立て側とボタン側で二重に書かれていたもの ────────────────
//
// チャットの発言は2系統から積まれる。
//   ・組み立て（buildMessages）… いまの状態から作り直す。kind が付いている
//   ・ボタン（append）        … 押した瞬間にその場で足す
// 同じ用件を両方が別々に書いていたので、**片方の書き方が変わった瞬間に2行並ぶ**。
// 実際に4件が重なっていた（承諾の礼・逆提示・合意・断りの受け）。
// 文面をここに出して、どちらもこれを呼ぶ。

/** 契約更新を本人が承諾した（組み立て L130 とボタン L611 で二重だった） */
export function contractAcceptLine(): ChatMessage {
  return { from: 'player', kind: 'contract_accept', text: 'ありがとうございます。その条件で合意します。よろしくお願いします。' }
}

/** 本人からの逆提示（組み立て L135 とボタン L613 で二重だった） */
export function contractCounterLine(salaryText: string, years: number | undefined): ChatMessage {
  return {
    from: 'player', kind: 'contract_counter',
    text: `考えましたが、年俸${salaryText}、${years}年であれば合意できます。これ以上は難しいです。`,
  }
}

/** GMが相手の逆提示を飲む（契約更新と獲得の2か所で同じ文面だった） */
export function agreeTermsLine(salaryText: string, years: number | undefined): ChatMessage {
  return { from: 'gm', kind: 'agree_terms', text: `了解しました。年俸${salaryText}、${years}年で合意します。` }
}

/**
 * 断られた相手クラブGMの受け（買い取りの断りとレンタルの断りの2か所で同じ文面だった）。
 * 買い取りとレンタルは同時に来るので、**クラブ名を kind に入れて別々の用件として扱う**
 * （1つの kind にすると、両方断ったときに片方が消える）。
 */
export function clubDeclinedAckLine(clubName: string): ChatMessage {
  return { from: 'player', kind: `club_declined_ack:${clubName}`, text: `（${clubName}GM）承知しました。またの機会にお願いします。` }
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
