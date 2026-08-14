/**
 * 【画面の一本化】色・下タブまわりの数字・共通クラスの手書きを見張る。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-ui-tokens.ts \
 *     --outfile=node_modules/.cache/check-ui.cjs --log-level=error && node node_modules/.cache/check-ui.cjs
 *
 * ■なぜ要るか（2026-08-13 の UI 作業で実際に起きた3件）
 *   点検は76本あるが、**どれも `src/components` の見た目を見ていない**
 *   （`check-size` も対象は `src/store` と `src/engine` だけ）。ロジックは守られて
 *   いるのに画面は無防備で、UIを触るたびに一本化が静かに割れていた。
 *
 *     ① 下タブを浮かせた（NAV_FLOAT）とき、`NAV_H + ...` を手書きしていた
 *        2画面が追随せず **20px ずれた**（FriendClubPage / LoginBonusPage）
 *     ② メニュー行だけ金が #dab543・#d9b63f、水色が #55d9ff になり、
 *        **金が3種類・水色が2種類**になった（トークンは #f5c842 / #5ed4ff）
 *     ③ `premium-menu-button` のクラスを TeamsHub が手書きしていた
 *        （MenuButton の冒頭に「手書きしないこと」と書いてあるのに）
 *
 * ■線は決めない（`check-size` と同じ「今日より増えたら落ちる」）
 *   「画面に色を直書きするな」は決めた瞬間に何十ファイルも違反になり、
 *   全部が赤いルールは誰も直さずそのうち外される。いまの数を fixture に焼いて、
 *   **増えたら落ちる**だけにする。意図して増やすときは引き直してコミットするので、
 *   増えたことが差分に残る。
 *
 *   引き直し： UPDATE_GOLDEN=1 npx ... check-ui-tokens.ts（この点検だけを走らせること）
 *
 * ■ただし「トークンとほぼ同じ色」は増加ゼロ
 *   まったく違う色が1つ増えるより、**ほぼ同じだが違う色が2つある**ほうがたちが悪い。
 *   どちらが正なのか誰にも分からなくなり、片方を直してももう片方が残る。
 *   ここだけは fixture を持たず、1件でもあったら落とす。
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`)
  if (!ok) failed++
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name))

const files = walk('src').filter(f => /\.(tsx?|css)$/.test(f))
const read = (f: string) => readFileSync(f, 'utf8')

/**
 * **画面を描いているファイル。`src` 直下の App.tsx も必ず入れること。**
 *
 * ここを `src/components` だけにしていたせいで、**App.tsx が丸ごと見えていなかった**。
 * 監督オファー・来季予算・同行の返事という3つのモーダルは App.tsx にあり、
 * 「角丸を全部やめる（675→0件）」も「ボタンを GlassButton へ寄せる」も届いていない。
 * それでも点検はずっと緑で、**実機を見たオーナーが気づくまで分からなかった**
 * （「角丸無くしてんのになんでオファーのところは変えてないの？」）。
 *
 * ★`.tsx` だけを見る。`src/data/*.ts` のクラブカラーや `src/utils/badges.ts` の
 *   称号の色は**識別のためのデータ**で、見た目の段の話ではない。
 */
const screens = files.filter(f => f.endsWith('.tsx'))

// ── 色を数える道具 ────────────────────────────────────
type RGB = [number, number, number]
const hexRgb = (h: string): RGB => {
  const s = h.length === 4 ? h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h.slice(1)
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}
/** 目で見たときの近さ。0なら同じ色 */
const dist = (a: RGB, b: RGB) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

// ── トークンの色（tokens.ts の C と index.css の :root）─────────
const tokensSrc = read('src/styles/tokens.ts')
const cssSrc = read('src/index.css')
const tokenColors = new Map<string, RGB>()
for (const m of tokensSrc.matchAll(/^\s*(\w+):\s*'(#[0-9a-fA-F]{3,6})'/gm)) tokenColors.set(m[1], hexRgb(m[2]))
const rootVars = new Map<string, RGB>()
const rootBlock = cssSrc.slice(cssSrc.indexOf(':root'), cssSrc.indexOf('}', cssSrc.indexOf(':root')))
for (const m of rootBlock.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})/g)) rootVars.set(m[1], hexRgb(m[2]))

console.log(`① トークン（tokens.ts の ${tokenColors.size}色 と :root の ${rootVars.size}色）が一致している`)
{
  // 同じ役割の色が2か所にある。**値がずれたら落とす**
  const pairs: [string, string][] = [
    ['bg', 'bg'], ['surface', 'surface'], ['surface2', 'surface2'], ['surface3', 'surface3'],
    ['border', 'border'], ['border2', 'border2'], ['border3', 'border3'],
    ['text', 'text'], ['textSub', 'text-sub'], ['textDim', 'text-dim'], ['textGhost', 'text-ghost'],
    ['gold', 'gold'], ['goldHi', 'gold-hi'], ['goldDark', 'gold-dark'], ['cyan', 'accent-cyan'],
  ]
  const bad = pairs.filter(([t, v]) => {
    const a = tokenColors.get(t), b = rootVars.get(v)
    return a && b && dist(a, b) > 0
  })
  check('tokens.ts と :root で同じ色になっている', bad.length === 0,
    bad.map(([t, v]) => `C.${t} と --${v} が違う`).join(' / '))

  // rgba() 用に置いてあるRGBが、元の色とずれていないか（②の再発防止の要）
  const rgbVars: [string, string][] = [
    ['gold-rgb', 'gold'], ['accent-cyan-rgb', 'accent-cyan'],
    // 大きい行動ボタン（.btn-game）が5色ぶんの rgba を使うので、その元も見る
    ['red-rgb', 'red'], ['green-rgb', 'green'], ['purple-rgb', 'purple'],
  ]
  const badRgb = rgbVars.filter(([r, base]) => {
    const m = rootBlock.match(new RegExp(`--${r}:\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`))
    const b = rootVars.get(base)
    if (!m || !b) return true
    return dist([+m[1], +m[2], +m[3]], b) > 0
  })
  check('rgba() 用のRGB（金・水色・赤・緑・紫）が元の色と同じ', badRgb.length === 0,
    badRgb.map(([r]) => `--${r}`).join(' / '))
}

console.log('\n② 共通の土台に「ほぼ同じだが違う色」が混ざっていない')
{
  // 見張るのはブランド色（金と水色）だけ。灰や黒の濃淡まで見ると、
  // 影や幕の rgba が全部引っかかって使いものにならない。
  //
  // ★見る範囲は**みんなが使う土台だけ**（index.css と styles/）。
  //   画面ごとの装飾（グラデーションの #6dd5fa など）まで見ると81件が即座に赤くなり、
  //   全部が赤いルールは誰も直さずそのうち外される。画面側の直書きは⑤の「増えたら落ちる」で見る。
  //   ②が守るのは「**その画面だけでなく全部に効く場所**に、金や水色の別版を置かないこと」。
  const brands: [string, RGB][] = [['金', tokenColors.get('gold')!], ['水色', tokenColors.get('cyan')!]]
  const NEAR = 42          // これより近いのに違う色＝取り違えたもの
  const hits: string[] = []
  for (const f of files.filter(f => f === 'src/index.css' || f.startsWith('src/styles/'))) {
    // コメントの中の色は数えない（「#dab543 が混ざっていた」と書けなくなるため）。
    // `:root` も見ない——**そこは色に名前を付ける場所**で、明るい版・暗い版を
    // 置くのが仕事。名前が付いていれば取り違えは起きない（一致は①が見ている）。
    const src = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
      .replace(/:root\s*\{[\s\S]*?\n\}/, m => m.replace(/[^\n]/g, ' '))
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      const c: RGB = m[0].startsWith('#') ? hexRgb(m[0]) : [+m[1], +m[2], +m[3]]
      for (const [name, base] of brands) {
        const d = dist(c, base)
        if (d > 0 && d < NEAR) {
          const line = src.slice(0, m.index!).split('\n').length
          hits.push(`${f}:${line} ${m[0]} は${name}（${base.map(n => n).join(',')}）とほぼ同じ`)
        }
      }
    }
  }
  check('ブランド色の取り違えが無い', hits.length === 0,
    hits.slice(0, 8).join('\n      ') + (hits.length > 8 ? `\n      …ほか${hits.length - 8}件` : '') +
    '\n      → トークン（C.gold / var(--gold) / rgba(var(--gold-rgb), …)）を使うこと')
}

console.log('\n③ 下タブまわりの数字を画面で足し算していない')
{
  // NAV_H / NAV_FLOAT / HEADER_H を使った**足し算**は tokens.ts の
  // bottomStack / contentHeight / NAV_STACK だけ。画面で書くと追随しない。
  const hits: string[] = []
  for (const f of screens) {
    read(f).split('\n').forEach((l, i) => {
      if (/(NAV_H|NAV_FLOAT|HEADER_H)\s*\+|\+\s*(NAV_H|NAV_FLOAT|HEADER_H)/.test(l)) {
        hits.push(`${f}:${i + 1} ${l.trim().slice(0, 110)}`)
      }
    })
  }
  check('画面で NAV_H / HEADER_H を足していない', hits.length === 0,
    hits.join('\n      ') + '\n      → tokens の bottomStack / contentHeight / NAV_STACK を使うこと')
}

console.log('\n④ 共通クラスを、担当のファイル以外から書いていない')
{
  // 見た目を1本にするために作ったクラスは、書いていいファイルを1つに決める。
  const OWNER: Record<string, string> = {
    'premium-menu-button': 'src/components/ui/MenuButton.tsx',
  }
  const hits: string[] = []
  for (const [cls, owner] of Object.entries(OWNER)) {
    for (const f of files.filter(f => f.endsWith('.tsx') && f !== owner)) {
      // コメントで名前を出すのは構わない（「手書きしないこと」と書けなくなるため）。
      // 落とすのは実際に className として書いているときだけ
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      if (code.includes(cls)) hits.push(`${f} が ${cls} を書いている（担当は ${owner}）`)
    }
  }
  check('共通クラスの手書きが無い', hits.length === 0, hits.join('\n      '))
}

console.log('\n⑤ 画面に直書きした色の数が、今日より増えていない')
{
  // ここは線を決めない。いまの数を焼いて、増えたら落ちるだけ。
  const counts: Record<string, number> = {}
  for (const f of screens) {
    const n = [...read(f).matchAll(/#[0-9a-fA-F]{3,6}\b/g)].length
    if (n > 0) counts[f] = n
  }
  const FIX = 'scripts/fixtures/ui-color-budget.json'
  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(FIX)) {
    writeFileSync(FIX, JSON.stringify(counts, null, 1) + '\n')
    console.log(`  -- 引き直しました（${Object.keys(counts).length}ファイル / 合計 ${Object.values(counts).reduce((a, b) => a + b, 0)}件）`)
  } else {
    const old: Record<string, number> = JSON.parse(readFileSync(FIX, 'utf8'))
    const grew = Object.entries(counts).filter(([f, n]) => n > (old[f] ?? 0))
    check(`直書きの色が増えていない（${Object.values(counts).reduce((a, b) => a + b, 0)}件）`, grew.length === 0,
      grew.map(([f, n]) => `${f} ${old[f] ?? 0} → ${n}`).join('\n      ') +
      '\n      → 意図して増やすなら UPDATE_GOLDEN=1 でこの点検だけ引き直してコミットすること')
    const shrank = Object.entries(old).filter(([f, n]) => (counts[f] ?? 0) < n)
    if (shrank.length) console.log(`  -- ${shrank.length}ファイルで減りました。引き直すと見張りが強くなります`)
  }
}

console.log('\n⑥ 押すボタンを画面で手書きしていない（今日より増えていない）')
{
  // 「金枠2px ＋ 下に影（0 4px 0 #5a3500）」の塊が32画面に64か所コピーされていた。
  // ボタンの形を変えても、その64か所は追随しない（実際に角丸をやめたとき、
  // 部品を使っている移籍市場だけが変わって、残りは丸いままだった）。
  // 押すボタンは `src/components/ui/GlassButton.tsx` 1本。
  // ここも線は決めず、いまの数を焼いて増えたら落ちるだけ（⑤と同じ）。
  // ★色は16進とは限らない（`${alpha(...)}` / `${C.goldDark}` / `${opt.shadow}`）。
  //   以前は `0 [2-6]px 0 #hex` しか見ておらず、**26か所が網の外**だった
  //   （財務の「今シーズンの予算」が `0 8px 0 #8b6914` で、px も色も外れていた）。
  // ★**行をまたぐものも見ること。** `[^\n]*` にしていたので
  //     boxShadow: news.major
  //       ? `0 4px 0 #5a3500, …`
  //   のように値が次の行にある4件（ニュース・シーズン目標・新規作成・日程）が
  //   丸ごと網の外にいた。**「0件です」と言う前に、その網が何を見ていないかを確かめること。**
  const SLAB = /box-?[Ss]hadow[\s\S]{0,240}?\b0 \d+px 0 (?:#[0-9a-fA-F]{3,6}|\$\{)/g
  const counts: Record<string, number> = {}
  for (const f of screens) {
    // コメントで形を説明するのは構わない。落とすのは実際に書いているときだけ
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const n = [...code.matchAll(SLAB)].length
    if (n > 0) counts[f] = n
  }
  const FIX = 'scripts/fixtures/ui-button-budget.json'
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(FIX)) {
    writeFileSync(FIX, JSON.stringify(counts, null, 1) + '\n')
    console.log(`  -- 引き直しました（${Object.keys(counts).length}ファイル / 合計 ${total}件）`)
  } else {
    const old: Record<string, number> = JSON.parse(readFileSync(FIX, 'utf8'))
    const grew = Object.entries(counts).filter(([f, n]) => n > (old[f] ?? 0))
    check(`手書きのボタンが増えていない（${total}件）`, grew.length === 0,
      grew.map(([f, n]) => `${f} ${old[f] ?? 0} → ${n}`).join('\n      ') +
      '\n      → 押すボタンは components/ui/GlassButton.tsx を使うこと')
    const shrank = Object.entries(old).filter(([f, n]) => (counts[f] ?? 0) < n)
    if (shrank.length) console.log(`  -- ${shrank.length}ファイルで減りました。引き直すと見張りが強くなります`)
  }
}

console.log('\n⑦ 見出し（戻る＋タイトル）を画面で手書きしていない（今日より増えていない）')
{
  // 「戻る矢印 ＋（英字）＋ タイトル」の塊が**44画面に51か所**あり、
  // 同じ見出しなのに大きさが 16／18／19／20／21／22px の6通りに割れていた。
  // 見出しは `src/components/ui/PageHeader.tsx` 1本。
  // 残る `<BackButton>` は、見出しではないもの（シートの上端・チャットの相手・
  // 区間ピッカー・空っぽの画面で戻るだけ）。⑤⑥と同じで、いまの数を焼いて増えたら落ちる。
  const counts: Record<string, number> = {}
  for (const f of screens) {
    if (f.endsWith('ui/BackButton.tsx')) continue
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const n = [...code.matchAll(/<BackButton\b/g)].length
    if (n > 0) counts[f] = n
  }
  const FIX = 'scripts/fixtures/ui-header-budget.json'
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(FIX)) {
    writeFileSync(FIX, JSON.stringify(counts, null, 1) + '\n')
    console.log(`  -- 引き直しました（${Object.keys(counts).length}ファイル / 合計 ${total}件）`)
  } else {
    const old: Record<string, number> = JSON.parse(readFileSync(FIX, 'utf8'))
    const grew = Object.entries(counts).filter(([f, n]) => n > (old[f] ?? 0))
    check(`手書きの見出しが増えていない（${total}件）`, grew.length === 0,
      grew.map(([f, n]) => `${f} ${old[f] ?? 0} → ${n}`).join('\n      ') +
      '\n      → 見出しは components/ui/PageHeader.tsx を使うこと')
    const shrank = Object.entries(old).filter(([f, n]) => (counts[f] ?? 0) < n)
    if (shrank.length) console.log(`  -- ${shrank.length}ファイルで減りました。引き直すと見張りが強くなります`)
  }
}

console.log('\n⑧ 角を丸めていない（丸いのは顔・ロゴ・点だけ）')
{
  // 角丸はアプリ全体でやめている（オーナー・2026-08-13「角丸全部やめて」）。
  // 形は「右下だけ斜めに切る」（ui/Panel・PlayerRow・メニュー行）で出す。
  // ★丸くていいのは**丸いことに意味がある物**だけ＝`50%`（顔・ロゴ・状態の点）と、
  //   細い棒の端（CSS の 2px）。それ以外は1件でも落とす。
  //   2026-08-13 に 675 → 0 件（`R` トークンごと廃止）。
  const hits: string[] = []
  for (const f of screens) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    code.split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/borderRadius:\s*([^,}\n]+)/g)) {
        if (/%/.test(m[1])) continue      // 50% は丸い物
        hits.push(`${f}:${i + 1} ${m[0].trim().slice(0, 60)}`)
      }
    })
  }
  // ★CSS 側も見る。**ここが抜けていたので `index.css` は無防備だった**
  //   （⑧は `src/components` の `.tsx` しか数えていなかった）。
  //   丸くていいのは `50%`（顔・ロゴ・点）と、細い棒の端（2px 以下）と、ピル（999px 以上）。
  for (const f of files.filter(f => f.endsWith('.css'))) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    src.split('\n').forEach((l, i) => {
      const m = l.match(/border-radius:\s*([^;]+);/)
      if (!m) return
      const v = m[1].trim()
      if (/%/.test(v) || v === '0') return
      const px = parseFloat(v)
      if (Number.isFinite(px) && (px <= 2 || px >= 999)) return
      hits.push(`${f}:${i + 1} ${m[0]}`)
    })
  }
  check('画面で角を丸めていない', hits.length === 0,
    hits.slice(0, 10).join('\n      ') + (hits.length > 10 ? `\n      …ほか${hits.length - 10}件` : '') +
    '\n      → 角丸はやめました。形は ui/Panel（右下だけ斜めに切る）で出すこと')
}

console.log('\n⑨ 選手カードの一覧は PlayerList を通している（カード同士のあきは1本）')
{
  // 同じ「選手カードの一覧」が11画面にあり、並べ方が3通りに割れていた
  //   （箱に入れず gap:8／枠の箱に詰める／ただ並べるだけ）。
  // オーナー判断（2026-08-14「ある方に統一して」）であきのある形へ寄せた。
  // **画面で並べ方を書き直せるようにしないこと**——また割れる。
  const OWNER = 'src/components/player/PlayerList.tsx'
  const users = files.filter(f =>
    f.startsWith('src/components') && f.endsWith('.tsx') && f !== OWNER &&
    /<PlayerRow[\s\n]/.test(read(f)))
  const bare = users.filter(f => !/from '.*player\/PlayerList'/.test(read(f)))
  check('選手カードを並べる画面は PlayerList を使っている', bare.length === 0,
    bare.join('\n      ') + '\n      → 一覧は components/player/PlayerList.tsx で包むこと')

  // あきの数字はトークン1本。画面にも PlayerList 以外にも現れない
  const gapUsers = files.filter(f => /PLAYER_CARD_GAP/.test(read(f)))
    .filter(f => f !== OWNER && f !== 'src/styles/tokens.ts')
  check('あきの数字は PlayerList だけが読む', gapUsers.length === 0, gapUsers.join(' '))
}

console.log('\n⑩ 金でベタ塗りして黒い字、を書いていない')
{
  // 「大ニュース」の札や「1部」の切り替えが、金のベタ塗り＋黒い字だった。
  // 他が全部ガラス（透かした面＋その色の字＋細い枠）になったので、そこだけ浮いていた。
  // オーナー判断（2026-08-14「黄色ベタ塗りみたいなのを無くして欲しい」）。
  // 配合は ui/GlassButton 1本（`alpha(色, 0.16)` の面 ＋ その色の字 ＋ `alpha(色, 0.65)` の枠）。
  const FILL = /background(?:Color)?:\s*[^,;\n]*(?:C\.gold|C\.goldHi)/g
  // ★三項演算子を挟む形も見ること（`color: sel ? C.bg : …`）。
  //   `color:\s*` だけだと `sel ? ` に阻まれて、いちばん直したかった切り替えタブを見逃す。
  // ★暗い字は**明るさで見る**こと。16進を並べて書くと必ず漏れる
  //   （`#111` `#1a0d00` `#1a1a1a` を並べていたら、`#0a0818` の公式Xのボタンが素通りした）。
  const DARK_TOKEN = /color:\s*(?:[^,;\n]*\?\s*)?(?:C\.bg|'(#[0-9a-fA-F]{3,6})')/g
  const isDarkHex = (h: string): boolean => {
    const v = h.length === 4 ? h.slice(1).split('').map(c => c + c).join('') : h.slice(1)
    if (v.length !== 6) return false
    const [r, g, bl] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16))
    return (0.299 * r + 0.587 * g + 0.114 * bl) / 255 < 0.35
  }
  const hasDarkText = (w: string): boolean => {
    for (const m of w.matchAll(DARK_TOKEN)) {
      if (!m[1]) return true          // C.bg
      if (isDarkHex(m[1])) return true
    }
    return false
  }
  const hits: string[] = []
  for (const f of files.filter(f => f.startsWith('src/components') && f.endsWith('.tsx'))) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const m of code.matchAll(FILL)) {
      if (m[0].includes('alpha(')) continue        // 透けているものは対象外
      const w = code.slice(Math.max(0, m.index! - 300), m.index! + m[0].length + 300)
      if (hasDarkText(w)) hits.push(`${f}:${code.slice(0, m.index).split('\n').length} ${m[0].slice(0, 60)}`)
    }
  }
  check('金でベタ塗りして黒い字にしていない', hits.length === 0,
    hits.slice(0, 8).join('\n      ') +
    '\n      → 透かした面＋金の字＋細い枠にすること（配合は ui/GlassButton）')

console.log('\n⑪ 本文の文字サイズを数字で書いていない')
{
  // 実測で **1900件・31種類**（7px〜96px）に割れていた。8〜24px のあいだだけで
  // 11・13・15・17・19・21・22 と半端な 9.5・10.5・14.5 が混ざっていて、
  // 「小さい字を少し大きく」と決めてもどれを触ればいいか分からない形だった。
  // 段は `tokens.ts` の `F` 1本。
  //
  // ★**25px 以上は見ない。** 予算の44px・タイムの96px のような「その画面の
  //   見せ場の数字」で、揃える対象ではない（角丸で複数指定を段の話にしなかったのと同じ）。
  const hits: string[] = []
  for (const f of screens) {
    if (f === 'src/styles/tokens.ts') continue
    read(f).split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/fontSize: *(?:'([\d.]+)px'|([\d.]+))(?![\d.])/g)) {
        const v = parseFloat(m[1] ?? m[2])
        if (v > 24) continue
        hits.push(`${f}:${i + 1} ${m[0]}`)
      }
    })
  }
  check('本文の文字サイズが数字で書かれていない', hits.length === 0,
    hits.slice(0, 10).join('\n      ') + (hits.length > 10 ? `\n      …ほか${hits.length - 10}件` : '') +
    '\n      → tokens の F（micro/tiny/caption/label/body/bodyLg/sub/subLg/title/titleLg/head/headLg/hero）を使うこと')
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
