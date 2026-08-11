// 「store のソース全部」を取り出す唯一の入口。
//
// ■なぜ要るのか
//   点検スクリプトの多くが `readFileSync('src/store/gameStore.ts')` で本文を読み、
//   「この処理が判定を通っているか」を文字列で確かめている。
//   ところが gameStore は 9,566行 → 706行に分割され、中身は src/store/slices/*.ts へ移った。
//   その結果、**中身は1行も変わっていないのに6本の点検が同時に落ちた**
//   （contract-talk / offer-result / transfer-eligibility / round-robin / card-exchange / talk-sync）。
//
//   ファイルの置き場所が変わるたびに6本を直して回るのは同じ事故の元なので、
//   「store の本文」はここ1本から取る。**新しくファイルを足しても直す場所は無い**
//   （ディレクトリを実際に数えるため）。
//
// ■範囲は `src/store` 以下**すべて**。除外は1件も置かない
//   最初は `gameStore.ts` ＋ `slices/*.ts` だけを数えていた。**それが穴だった。**
//   分解で `src/store` 直下にもファイルが増えていて（`marketOps.ts` 214行に
//   `counterCeiling` と `tradeValueCtxOf` がある）、**どの点検からも見えていなかった。**
//   「ディレクトリを実際に数えるから直す場所は無い」と書いてあるのに、
//   数えているディレクトリが1つ足りない、という状態。
//
//   除外表（「loadingStore のような画面用の小さな store は外す」など）を置かなかったのは、
//   **除外表そのものが「直す場所」だから**。ファイルが1本増えるたびに表を見直す運用に
//   戻ってしまい、いま塞いだ穴と同じものがまた開く。45行の小さなストアを混ぜても
//   誤検知しないことは下の突き合わせで確かめてある。
//
// ■範囲を広げるときは必ず突き合わせること（広げる＝判定が黙って強くなる）
//   `!store.includes('bidThreshold(')` のような**否定の判定**は、範囲を広げた瞬間に
//   「ここにも書くな」という**別の主張**へ黙って変わる（engine を混ぜなかったのと同じ危険）。
//   広げる前と後で全点検の ok/NG を突き合わせた結果は次のとおり:
//
//     増えた NG … 0件（49本すべて同じ）
//     消えた NG … 2件（trade-value の「ストアが tradeValue を通している」
//                       「値付けの ctx が1箇所（tradeValueCtxOf）」＝どちらも marketOps.ts）
//
//   将来、`persistence/migrateSave.ts` のような「当時の形を凍らせておく」コードと
//   否定の判定がぶつかったら、**範囲ではなく、その点検の側を狭めること。**
//   範囲を削ると、そこに何が入っているかを誰も数えなくなる。
//
// ■注意
//   返すのは全ファイルを繋いだ1本の文字列。行番号は意味を持たない。
//   **相対パスを含む文字列で判定しないこと。** 深さの違うファイル（`gameStore.ts` と
//   `slices/marketSlice.ts`）が混ざるので、`from '../utils/…'` を探す判定は
//   繋いだ瞬間に嘘になる（どちらか片方にしか当たらない）。import を確かめたいなら
//   `from '.*utils/tradeValue'` のように深さを問わない形にすること。
//   「どのファイルに在るか」まで見たいときは storeFiles() を使うこと。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join('src', 'store')

/** そのディレクトリ以下の .ts を全部（並びは固定。**下のディレクトリも数える**） */
function tsFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const f of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, f.name)
    if (f.isDirectory()) out.push(...tsFilesUnder(full))
    else if (f.name.endsWith('.ts')) out.push(full)
  }
  return out
}

/** `src/store` 以下の .ts すべて */
export function storeFiles(): string[] {
  return tsFilesUnder(ROOT)
}

/** store 以下を繋いだ本文 */
export function storeSource(): string {
  return storeFiles().map(f => readFileSync(f, 'utf-8')).join('\n')
}

/** `src/engine` 以下の .ts すべて（store と同じ数え方。いま下のディレクトリは無い） */
export function engineFiles(): string[] {
  return tsFilesUnder(join('src', 'engine'))
}

/** engine を繋いだ本文 */
export function engineSource(): string {
  return engineFiles().map(f => readFileSync(f, 'utf-8')).join('\n')
}

/**
 * store ＋ engine。**「どこかに1本だけあるか」を数える点検はこちらを使う。**
 *
 * ■ storeSource() に engine を混ぜなかった理由
 *   点検の判定には性格の違う2種類がある。
 *
 *     ・**層の話**「store にこれを手書きしてはいけない」
 *         例: `!store.includes('bidThreshold(')`（判定は utils を通せ、という意味）
 *     ・**存在の話**「この決まりはどこかに1本だけある」
 *         例: pickCpuFreeAgents の呼び出しが3箇所あるか
 *
 *   storeSource() に engine を足すと、前者が黙って
 *   「engine も手書きしてはいけない」という**別の主張**に変わる。
 *   いま数えたところ該当する判定は20件あり、今日はたまたま1件も壊れないが、
 *   engine が正当に持つべき式を1つ足した瞬間に、誰もレビューしていない条件で落ちる。
 *
 *   なので範囲は分けたまま、**点検が自分の意味に合うほうを選ぶ**形にする。
 */
export function logicSource(): string {
  return [storeSource(), engineSource()].join('\n')
}

/**
 * アクション1つぶんの**実装の本文**を切り出す。
 *
 * ■ここで踏んだ罠を繰り返さないこと
 *   1. **字下げを決め打ちしない。** 分割前の gameStore は6スペース、いまの slices は2スペース。
 *      `      name: (` を探していた点検は、中身が1行も変わっていないのに全部空振りした
 *   2. **同じ名前が2か所に出る。** gameStore に型の宣言、slices に実装。
 *      「最初に見つかったほう」でも「いちばん長いほう」でも型宣言を掴む
 *      （型宣言のブロックは21,000文字あり、実装1,500文字より長い）
 *   3. **`=> {` だけでは足りない。** 型のほうにも
 *      `finalizeTransfer: (…) => { ok: boolean; reason?: string }` のように戻り値の形が書いてある。
 *      本物のブロックは `=> {` の**直後が改行**、戻り値の型は同じ行で閉じる。ここで見分ける
 *   4. 引数の中に `)` を挟ませない（`[^)]`）。挟ませると、型宣言の行から次の行へまたいで
 *      「あとの方に出てくる `) => {`」に食いつく
 */
export function actionBody(store: string, name: string): string {
  const re = new RegExp(`^([ \\t]*)${name}: \\([^)]{0,300}\\)\\s*=>\\s*(\\{[ \\t]*\\r?\\n|set\\()`, 'gm')
  let best = ''
  for (let m = re.exec(store); m; m = re.exec(store)) {
    const end = store.indexOf(`\n${m[1]}},`, m.index)
    const body = store.slice(m.index, end < 0 ? store.length : end)
    if (body.length > best.length) best = body
  }
  return best
}
