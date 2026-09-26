// App Store の「最新情報（What's New）」の文。**中身は `src/data/appMeta.ts` の CHANGELOG 1本**。
//
// ★文を2か所に持たないこと。お知らせ（アプリ内）とストアの「最新情報」は同じ差分なので、
//   ストア用の文を別のファイルに写すと、ビルドのたびにお知らせを直したときに片方だけ古くなる。
//   `docs/appstore-v*.md` は「出したものの控え」で、提出の材料ではない。
//
// Apple が断る文は、鍵を使う前にここで見る（`scripts/check-store-text.ts` と
// `scripts/store-submit.ts` が同じここを通る）。
//   長さ … 最新情報は 4000 文字まで
//   文字 … Apple は許す文字の一覧を出していない。断られた実績があるのは記号（罫線 U+2500・✓・絵文字）と、
//          合成されていない結合記号。だから一文字ずつではなく類で断る：ASCII の外の
//          「記号」(S*)・「制御/書式/私用/未割当」(C*)・囲み記号 (Me)・行/段落区切り (Zl/Zp)、そして NFC でない文。
//          Apple より厳しい側に倒している（要るものが出たらそのときに決める）
import { APP_VERSION, CHANGELOG } from '../src/data/appMeta'

export const WHATS_NEW_MAX = 4000

/** App Store Connect の版の文字（`v2.0.8` → `2.0.8`） */
export const storeVersion = (v: string = APP_VERSION): string => v.replace(/^v/, '')

/** いまの版の「最新情報」＝ CHANGELOG の同じ版の本文そのもの */
export function whatsNewText(version: string = APP_VERSION): string {
  const entry = CHANGELOG.find(e => e.version === version)
  if (!entry) throw new Error(`CHANGELOG に ${version} のエントリがありません`)
  return entry.body
}

const APPLE_NO = /[\p{S}\p{C}\p{Me}\p{Zl}\p{Zp}]/u

/** Apple が断る理由（無ければ空） */
export function storeTextProblems(text: string, max: number = WHATS_NEW_MAX): string[] {
  const out: string[] = []
  if (text.length > max) out.push(`${text.length} 文字（上限 ${max}）`)
  const bad = new Set<string>()
  for (const ch of text) {
    if (ch === '\n' || (ch >= ' ' && ch <= '~')) continue
    if (APPLE_NO.test(ch)) bad.add(ch)
  }
  for (const ch of bad) out.push(`断られる文字 ${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)
  if (text !== text.normalize('NFC')) out.push('NFC でない（結合記号が合成されていない）')
  return out
}
