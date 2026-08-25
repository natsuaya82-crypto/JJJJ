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

// オンラインが使えるか。
//
// オンラインの自分（フレンドコード・プロフィール・走友会の在籍）は**スロットごとに別人**。
// アカウントの置き場を lib/durableId.ts と lib/supabase.ts でスロットごとに分けてあるので、
// どのスロットでもオンラインに入ってよい（別スロットの内容が本編のプロフィールを
// 上書きすることはない）。スロット1はこれまでのアカウントをそのまま引き継ぐ。
export function onlineAvailable(): boolean {
  return ONLINE_ENABLED
}

// ランクマッチの「準備中」。**この日から、参加のボタンを押せなくして「準備中」に出す。**
//
// 第一回（9/1）は参加者が10人に届かず中止にした（オーナー・2026-08-23
// 「参加者不足により、ランクマッチを見送ります！」「9/1になったらランクマッチの
// ボタンが準備中でグレーアウトで」）。開催日が来たのに何も起きない、を避けるため。
//
// ★**日付は必ずここ1本**（画面に書かないこと）。`data/` は `utils/` を import
//   できないので、今日は呼ぶ側から渡す（`data/events` の activeEvents と同じ形）。
// ★次の回をやるときは、この日付を次の開催日の**後ろ**へ動かすか、'' にして止める。
export const RATED_PREP_FROM = '2026-09-01'

/** その日、ランクマッチは「準備中」か（`utils/jstDate` の jstTodayISO() を渡す） */
export function ratedPreparing(today: string): boolean {
  return !!RATED_PREP_FROM && today >= RATED_PREP_FROM
}
