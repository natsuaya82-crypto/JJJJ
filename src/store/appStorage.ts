import { saveSlotSuffix } from './saveSlot'

// アプリが端末に置いているもの、**全部の登録表**。
//
// ■なぜ要るのか
//   置き場所が11か所に散っていて、「データ削除で何を消すか」が resetGame の中に
//   手書きで並んでいた。新しい保存場所を足した人がそこに書き足すのを忘れると、
//   削除しても残る。実際、もらったカードの箱（jpel_gift_inbox）が残っていた。
//
//   ここに登録すれば、消す／残すは寿命（lifetime）から自動で決まる。
//   **新しく localStorage を使うときは、必ずここに足すこと**（npm run check が見張る）。
//
// ■寿命の3種類
//   progress … そのゲームの中身。データ削除で消える。スロットごとに分かれる
//   identity … サーバー上の自分を指すもの。データ削除で消える。スロットごとに分かれる
//   device   … 端末のもの。データ削除でも残す（課金の権利・規約への同意・設定）
//
// ■キーの文字列は絶対に変えないこと
//   変えた瞬間、今そこに入っているデータは行方不明になる（読みに行く場所が変わるので、
//   ユーザーから見れば「消えた」と同じ）。増やすのは自由、直すのは移行を書いてから。

export type StorageLifetime = 'progress' | 'identity' | 'device'

export type StorageEntry = {
  /** 実際のキー。スロットごとに分かれるものは接尾辞が付く */
  key: string
  lifetime: StorageLifetime
  /** 何が入っているか（人が読むため） */
  what: string
}

const SUF = saveSlotSuffix()

/**
 * 登録表。**ここに無い localStorage の直接利用は `npm run check` が落とす。**
 *
 * セーブ本体（jpel-manager-save）と過去シーズンの記録（jpel-archive-*）は
 * ネイティブではファイルなので、消し方が別（store/saveStorage.ts）。
 * ここには「localStorage に置いているもの」だけを並べる。
 */
export const STORAGE_ENTRIES: readonly StorageEntry[] = [
  // ── そのゲームの中身（データ削除で消える）──
  { key: `jpel_gift_inbox${SUF}`, lifetime: 'progress', what: 'もらったカードの箱' },

  // ── サーバー上の自分（データ削除で消える）──
  { key: `jpel_identity_v1${SUF}`, lifetime: 'identity', what: 'フレンド用の証明書' },
  { key: `jpel_friend_sync_stamp${SUF}`, lifetime: 'identity', what: '送信済みの指紋' },
  // これは「身元を消した」という印そのもの。データ削除のときに立てるものなので、
  // ここで一緒に消すと意味が無くなる（消したはずの古いアカウントに戻ってしまう）。
  // 新しいアカウントが出来たときに lib/supabase.ts 側が降ろす。
  { key: 'jpel_identity_cleared', lifetime: 'device', what: '身元を消した印（削除時に立てる）' },

  // ── 端末のもの（データ削除でも残す）──
  { key: 'jpel-device-ads-removed', lifetime: 'device', what: '広告なしの購入（権利なので消さない）' },
  { key: 'jpel-device-twitter-intro-seen', lifetime: 'device', what: '公式Xの案内を見たか' },
  { key: 'jpel-manager-slot', lifetime: 'device', what: 'いま使っているスロット' },
  { key: 'jpel-terms-agreed', lifetime: 'device', what: '利用規約への同意' },
  { key: 'jpel-volume-se', lifetime: 'device', what: '効果音の音量' },
  { key: 'jpel-volume-music', lifetime: 'device', what: 'BGMの音量' },
]

/** その寿命のキー一覧 */
export function keysOfLifetime(...lifetimes: StorageLifetime[]): string[] {
  return STORAGE_ENTRIES.filter(e => lifetimes.includes(e.lifetime)).map(e => e.key)
}

/**
 * データ削除で消すもの（progress と identity）を全部消す。
 * **resetGame はこれを呼ぶだけにする**（消す対象を手書きで並べない）。
 * セーブ本体と過去シーズンの記録はファイルなので、呼ぶ側が別に消す。
 */
export function clearGameStorage(): void {
  for (const key of keysOfLifetime('progress', 'identity')) {
    try { localStorage.removeItem(key) } catch { /* 使えない環境では何もしない */ }
  }
}
