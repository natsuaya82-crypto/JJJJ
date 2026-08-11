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
//   「store の本文」はここ1本から取る。**新しくスライスを足しても直す場所は無い**
//   （ディレクトリを実際に数えるため）。
//
// ■注意
//   返すのは全スライスを繋いだ1本の文字列。行番号は意味を持たない。
//   「どのファイルに在るか」まで見たいときは storeFiles() を使うこと。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join('src', 'store')

/** store 本体と、その下のスライスのファイル一覧 */
export function storeFiles(): string[] {
  const out = [join(ROOT, 'gameStore.ts')].filter(existsSync)
  const slices = join(ROOT, 'slices')
  if (existsSync(slices)) {
    for (const f of readdirSync(slices).sort()) {
      if (f.endsWith('.ts')) out.push(join(slices, f))
    }
  }
  return out
}

/** store 本体＋全スライスを繋いだ本文 */
export function storeSource(): string {
  return storeFiles().map(f => readFileSync(f, 'utf-8')).join('\n')
}

/** engine の全ファイル */
export function engineFiles(): string[] {
  const dir = join('src', 'engine')
  if (!existsSync(dir)) return []
  return readdirSync(dir).sort().filter(f => f.endsWith('.ts')).map(f => join(dir, f))
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
