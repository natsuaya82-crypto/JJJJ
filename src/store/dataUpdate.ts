// アプデ後の初回起動で「データ更新中」の画面を出すかどうかを持つだけの小さなモジュール。
//
// 2.0.1 で、区間記録・チームの成績・年度表彰・ECLの記録・選手の通算成績を
// セーブに持たず、保存してあるレース結果から数え直す形に変えた。
// 変換そのものは読み込み時に毎回・自動でやっているので放っておいても直るのだが、
// 古いセーブの初回起動だけは
//   ・数え直しの結果を先に作っておく（記録室を最初に開いたときに固まらないように）
//   ・新しい形でセーブを書き直す（古い重いセーブをそのまま残さない）
// をまとめて済ませたいので、そのあいだ画面を出す。
//
// 判定は persist の migrate（＝保存されているバージョンが古いときだけ走る）から立てる。
// ストア本体に持たせないのは、この状態自体はセーブに書きたくないため。
let needed = false

/** 古いセーブを読み込んだ。次の起動画面で「データ更新中」を出す */
export function markDataUpdateNeeded(): void { needed = true }

export function isDataUpdateNeeded(): boolean { return needed }

/** 更新画面を出し終えた */
export function clearDataUpdateNeeded(): void { needed = false }
