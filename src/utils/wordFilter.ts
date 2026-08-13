// ============================================================================
// **書き込みの伏せ字（※）。唯一の決まり。**
//
// ■どこで効くか
//   走友会の掲示板の本文と、自由入力の名前（チーム名・監督名・走友会名）。
//   **新しく「この言葉はまずい」の判定を書かないこと。** 増やすならこのファイルの表へ。
//
// ■伏せるのは「表示するとき」だけ（オーナー判断）
//   保存するのは書かれたそのままの文。通報が来たときに何が書かれたのか分からないと
//   処理のしようがないため。画面に出す直前に `maskText` を通す。
//
// ■書いた本人の画面でも伏せる
//   自分だけ素で見えると「通っている」と誤解して繰り返す。全員同じ見え方にする。
//
// ■完全にはできない
//   取りこぼしと巻き込みは必ず残る。そこは通報とブロックで拾う前提
//   （`lib/moderationApi.ts`）。ここを厳しくするほど普通の会話が壊れる。
// ============================================================================

/**
 * 比べる前に形を揃える。**元の文は変えない**（当たった位置を探すためだけに使う）。
 *
 * 揃えないと `し ね` `シネ` `ｼﾈ` `Ｌｉｎｅ` が全部すり抜ける。
 * ★1文字が1文字に対応することが絶対条件。**長さの変わる変換を入れないこと**
 *   （位置がずれて、当たった場所と別のところを伏せてしまう）。
 */
function normalizeChar(ch: string): string {
  const c = ch.codePointAt(0) ?? 0
  // 全角英数記号 → 半角（そのあと小文字にするのを忘れないこと。ＬＩＮＥ が抜ける）
  if (c >= 0xFF01 && c <= 0xFF5E) return String.fromCodePoint(c - 0xFEE0).toLowerCase()
  // カタカナ → ひらがな（濁点つきもそのまま1文字で対応する）
  if (c >= 0x30A1 && c <= 0x30F6) return String.fromCodePoint(c - 0x60)
  // 半角カナ → ひらがな（ｼﾈ が抜ける）。濁点は別の1文字なので、ここでは清音だけ揃える
  const HALF = 'ｦぁぃぅぇぉゃゅょっーあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん'
  if (c >= 0xFF66 && c <= 0xFF9D) return HALF[c - 0xFF66] ?? ch
  return ch.toLowerCase()
}

/** 当たり判定から外す文字（空白・記号・繰り返し記号）。位置は覚えておく */
const IGNORED = /[\s　!-/:-@[-`{-~。、・…ー〜「」『』（）【】,.!?"'`^~|_\-=+*/\\]/

/**
 * 揃えた文字列と、「揃えた側の i 文字目が元の文の何文字目か」の対応表を作る。
 * 落とした文字（記号・空白）は対応表に載らないので、`し・ね` が `しね` として当たり、
 * 伏せるのは元の3文字ぶんになる。
 */
function normalize(src: string): { text: string; index: number[] } {
  let text = ''
  const index: number[] = []
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (IGNORED.test(ch)) continue
    text += normalizeChar(ch)
    index.push(i)
  }
  return { text, index }
}

// ── 伏せる言葉 ───────────────────────────────────────────────────────────
//
// 分類ごとに分けてある（`docs/WORD_FILTER_DRAFT.md`）。
// **バカ・アホ・うざい の類は入れない**（日常語として出るほうが多い・オーナー判断）。
// 入れるのは「直接的なもの」だけ。

/**
 * A 攻撃・脅し。直接的なものだけ。
 * ★漢字の形も必ず入れること。揃えるのはかな／英数だけなので `死ね` は `しね` にならない。
 */
const ATTACK = [
  'しね', '死ね', '氏ね', '志ね', 'しねよ', 'しねばいい',
  'ころす', '殺す', '殺し', '殺害', 'ぶっころす', 'ぶっ殺',
  'きえろ', '消えろ', 'うせろ', '失せろ', 'くたばれ',
  'じさつしろ', '自殺しろ', 'じごくにおちろ', '地獄に落ちろ',
  'ぶっとばす', 'なぐるぞ', '殴るぞ',
]

/**
 * B 差別。**この配列だけは中身を docs に書かない**（文書が検索に引っかかるため）。
 * 国籍・出身・障害・性的指向に関する蔑称。外さないこと（App Store 1.1）。
 */
const SLUR = [
  'きちがい', 'きtがい', 'めくら', 'つんぼ', 'おし', 'かたわ', 'びっこ',
  'はくちしょう', 'ちしょう', 'ぶらく', 'えた', 'ひにん',
  'ちょん', 'きむち やろう', 'ちゃんころ', 'とうじん',
  'ほもやろう', 'おかま やろう', 'れず やろう', 'おとこおんな',
]

/** C 性的な語。直接的なものだけ。ほのめかしは拾わない（誤爆が跳ね上がる） */
const SEXUAL = [
  'せっくす', 'sex', 'ちんこ', 'まんこ', 'おっぱい', 'ぱいずり',
  'えろ', 'えっち', 'あへ', 'せいこうい', 'ふうぞく', 'えんこう',
  'ろりこん', 'ぺど', 'av', 'ぬーど',
]

/**
 * D 外部への誘導・連絡先（オーナー判断で入れる）。
 * 「責任が取れない」ので、掲示板から外へ連れ出す道は塞ぐ。
 * ※「LINEのスタンプが」のような普通の話も伏せることは承知のうえ。
 */
const CONTACT = [
  'line', 'らいん', 'kakao', 'かかお', 'discord', 'でぃすこーど', 'でぃすこ',
  'telegram', 'てれぐらむ', 'skype', 'すかいぷ', 'wechat',
  'http', 'https', 'www.', '.com', '.net', '.jp', 'twitter', 'instagram',
  'tiktok', 'youtube', 'ゆーちゅーぶ', 'あいでぃー交換', 'id交換',
]

/** 全部まとめた表。**当たり判定はこの1本しか見ない** */
const NG_WORDS: readonly string[] = [...ATTACK, ...SLUR, ...SEXUAL, ...CONTACT]
  .map(w => normalize(w).text)
  .filter(w => w.length > 0)
  // 長いものから当てる（`しねばいい` を `しね` で切らないため）
  .sort((a, b) => b.length - a.length)

/**
 * 元の文のほうで探すもの。**桁数や並びが意味を持つので、記号を落とした側では見ない。**
 *   ・URL … 途中だけ伏せると `ample.` のような残骸が出るので、ひとかたまりで消す
 *   ・電話番号 … 数字が10桁以上つながっているもの
 */
const PATTERNS: RegExp[] = [
  /(https?:\/\/|www\.)[^\s　]*/gi,
  /[^\s　]+\.(com|net|jp|org|io|me|tv|gg)\b[^\s　]*/gi,
  /[0-9０-９]{10,}/g,
  // 区切りの入った電話番号（090-1234-5678）。上の桁数だけでは当たらない
  /0[0-9０-９]{1,4}[-－ー‐−\s][0-9０-９]{1,4}[-－ー‐−\s][0-9０-９]{3,4}/g,
]

/**
 * **前後が文字なら当てない語。**普通の言葉に埋まって巻き込むものだけをここに挙げる。
 *
 * ★「かな3文字以下は全部」のような広い条件にしないこと。
 *   そうすると `ころすぞ` `えっちだね` `ラインのスタンプ` が軒並みすり抜ける
 *   （実際そうなっていた。守りたいものが全部素通しになる）。
 */
const AMBIGUOUS = new Set(['しね', 'おし', 'えた'])
const IS_LETTER = /[ぁ-んァ-ヶ一-龠a-z0-9]/

export const MASK_CHAR = '※'

/**
 * 伏せ字にした文を返す。当たった部分を**その文字数ぶんの ※** に置き換える。
 * 何も当たらなければ元の文をそのまま返す（新しい文字列を作らない）。
 */
export function maskText(src: string): string {
  if (!src) return src
  const { text, index } = normalize(src)
  if (text.length === 0) return src

  // 元の文の「伏せる文字」に印を付けていく
  const hit = new Array<boolean>(src.length).fill(false)
  let any = false

  const markRange = (from: number, to: number) => {
    // 揃えた側の [from, to) を、元の文の位置へ戻して塗る。
    // 落とした記号も間に挟まっていれば一緒に塗る（`し・ね` が `※※※` になる）
    const s = index[from], e = index[to - 1]
    for (let i = s; i <= e; i++) { hit[i] = true; any = true }
  }

  for (const w of NG_WORDS) {
    const ambiguous = AMBIGUOUS.has(w)
    let at = text.indexOf(w)
    while (at !== -1) {
      const before = at > 0 ? text[at - 1] : ''
      const after = at + w.length < text.length ? text[at + w.length] : ''
      const wrapped = ambiguous && (IS_LETTER.test(before) || IS_LETTER.test(after))
      if (!wrapped) markRange(at, at + w.length)
      at = text.indexOf(w, at + 1)
    }
  }

  // URL・電話番号は元の文のほうで探す（記号を落とすと形が変わるため）
  for (const re of PATTERNS) {
    for (const m of src.matchAll(re)) {
      const s = m.index ?? 0
      for (let i = s; i < s + m[0].length; i++) { hit[i] = true; any = true }
    }
  }

  if (!any) return src
  return src.split('').map((ch, i) => (hit[i] ? MASK_CHAR : ch)).join('')
}

/** 伏せ字になる部分があるか（書く前の注意書きに使う。判定は `maskText` と同じ1本） */
export function hasMaskedWord(src: string): boolean {
  return maskText(src) !== src
}
