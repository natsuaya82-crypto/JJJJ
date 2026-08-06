import { currentSaveSlot } from '../store/saveSlot'

// 機能のオン・オフをまとめて管理する場所。
//
// ONLINE_ENABLED … フレンド／走友会／オンライン対戦をまとめて出すかどうか。
//   true のあいだは下タブ「オンライン」も、/online・/friends の画面も、
//   起動時のサーバー接続（アカウント作成・チーム情報の送信）も動く。
//   false にすると入口ごとまとめて消える（コードは残るので戻すのは true にするだけ）。
export const ONLINE_ENABLED = true

// CLUB_CHAT_ENABLED … 走友会の「ひとこと書く」（定型文の書き込み）を出すかどうか。
//   false のあいだは、書き込みのボタンも、書き込みの表示も消える。
//   カードのお願いと差し入れはそのまま動く（走友会はチーム機能として残す）。
//   コードもサーバー側もそのまま残してあるので、戻すのは true にするだけ。
//   書けるのは定型文12種と定型の反応スタンプだけで、自由入力は無い。
//   通報・ブロックは ReportSheet / moderationApi で用意してある。
export const CLUB_CHAT_ENABLED = true

// オンラインを使えるのはスロット1だけ（store/saveSlot.ts）。
//
// フレンドコード・プロフィール・走友会の在籍は「端末に1つのアカウント」に紐づいていて、
// スロットごとには分かれない。運営用のスロットでオンラインに入ると、
//   ・フレンド一覧に出る自分のチームがそのスロットのものに置き換わる
//   ・相手がロスターを見ると運営用の選手が並ぶ
//   ・対戦にもそのチームで出てしまう
// ので、本編のデータ以外では入口ごと閉じる。同期そのものは lib/useFriendSync.ts でも止めてある。
export function onlineAvailable(): boolean {
  return ONLINE_ENABLED && currentSaveSlot() === 1
}
