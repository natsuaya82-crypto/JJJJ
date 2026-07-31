import type { GameStore } from './gameStore'

// ============================================================================
// セーブに「書かない」項目を決める唯一の場所。
//
// ■方針：除外リスト（書かない物だけを並べる）
//   過去シーズン（archiveSeason.ts）は逆に「残す物だけ」を並べる許可リストにしてある。
//   こちらを同じ許可リストにすると、ストアに項目を足すたびに書き足さないと保存されず、
//   「新しく足したデータが保存されない」という一番怖い事故が起きる。
//   なので本体側は「既定で全部保存する。下に並べた物だけ書かない」にしてある。
//
// ■ここに並べてよいのは、次のどちらかに当てはまる物だけ
//   1. 画面を開いている状態そのもの（モーダルが開いている等）。アプリを閉じたら閉じているのが正しい。
//   2. どこからも読まれていない残骸。
//   「作りかけだが閉じても残ってほしい物」（出走メンバーの下書き raceLineup など）は入れないこと。
//
// ■入れると何が変わるか
//   セーブから消えるだけで、遊んでいる最中は今まで通り値が入る（メモリ上には残る）。
//   起動時はストアの初期値（emptyState()）に戻る。
// ============================================================================

export const EPHEMERAL_KEYS = [
  // ── 1. 画面を開いている状態 ──
  // 選手シート。起動しただけで前回見ていた選手のシートが開く不具合の原因
  'openPlayerId',
  // 個別契約情報モーダル。同上
  'contractInfoPlayerId',
  // 練習カード合成の選択途中。閉じたら選び直しでよい
  'fusionPlayerId',
  'fusionCardIds',
  // レース画面の進行段階。これが残っていると、レース中に強制終了したあと
  // 起動しても下のタブが消えたままになる
  'activeRacePhase',

  // ── 2. どこからも読まれていない残骸 ──
  // レース実行中の内部シミュレータ。画面遷移をまたぐためだけの物で、読む箇所は無い
  'activeRaceSim',
  'activeRaceResults',
  'activeRaceLockedRace',
  'activeRaceLockedRaceIndex',
  // 新規ゲーム作成時の入力内容。チーム生成に使ったあとは読む箇所が無い
  'setupData',
] as const satisfies readonly (keyof GameStore)[]

// 保存直前にセーブから除外する。persist の partialize から呼ぶ。
export function stripEphemeral<T extends object>(state: T): T {
  const out = { ...state } as Record<string, unknown>
  for (const k of EPHEMERAL_KEYS) delete out[k]
  return out as T
}
