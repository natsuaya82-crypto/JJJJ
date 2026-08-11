// 「チャット画面のソース全部」を取り出す唯一の入口。storeSource.ts と同じ考え方。
//
// ■なぜ要るのか
//   点検スクリプトの多くが `readFileSync('src/components/team/ChatPage.tsx')` で本文を読み、
//   「この処理が判定を通っているか」を文字列で確かめている。
//   ところが ChatPage.tsx は画面の部品ごとに src/components/team/chat/*.tsx へ分割中で、
//   会話の本体（ChatView）を出しただけで**3本の点検が同時に落ちた**
//   （chat-log / contract-talk / offer-result）。中身は1行も変わっていない。
//
//   部品を切り出すたびに点検を直して回るのは同じ事故の元なので、
//   「チャット画面の本文」はここ1本から取る。**新しく chat/ 配下へ部品を足しても直す場所は無い**
//   （ディレクトリを実際に数えるため）。
//
// ■注意
//   返すのは ChatPage.tsx と chat/ 配下を繋いだ1本の文字列。行番号は意味を持たない。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CHAT_PAGE = join('src', 'components', 'team', 'ChatPage.tsx')
const CHAT_DIR = join('src', 'components', 'team', 'chat')

/** ChatPage.tsx と、その下の chat/ 部品のファイル一覧 */
export function chatFiles(): string[] {
  const out = [CHAT_PAGE].filter(existsSync)
  if (existsSync(CHAT_DIR)) {
    for (const f of readdirSync(CHAT_DIR).sort()) {
      if (f.endsWith('.tsx') || f.endsWith('.ts')) out.push(join(CHAT_DIR, f))
    }
  }
  return out
}

/** ChatPage.tsx ＋ chat/ 配下の全部品を繋いだ本文 */
export function chatSource(): string {
  return chatFiles().map(f => readFileSync(f, 'utf-8')).join('\n')
}
