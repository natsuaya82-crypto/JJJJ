/**
 * 【自分から退任できるようになるまで】在任が短いうちは辞められないこと。
 *
 * ■なぜ要るのか
 *   退任ボタンにガードが1つも無かった（`gmOffers` が空かどうかだけ）。
 *   しかも `resignOffers` は抽選をしないので**押せば必ず3件届く**。
 *   押し続ければ格上のクラブへ無限に登れる状態だった。
 *   オーナー判断で「4年目から」＝就任年を1年目と数えて3シーズン空ける、になった。
 *
 * ■ここで見ること
 *   ①仕様の釘   … GM_RESIGN_MIN_TENURE >= 3 を**リテラル**で（定数と比較しない）
 *   ②ふるまい   … 就任年 2030 として 2030/2031/2032 は不可・**2033 は可**を、
 *                  やはり**定数を読まずに**書く
 *   ③入口       … resignAsGm が canResignAsGm を通っていること。
 *                  resignOffers 側で止める形（0件を返す）に戻っていないこと
 *
 * ★GM_OFFER_COOLDOWN（年1回ランダムで声が掛かる間隔）とは別物。
 *   片方を動かしてももう片方は動かない、も一緒に見ておく。
 */
import { readFileSync } from 'node:fs'
import { canResignAsGm, GM_RESIGN_MIN_TENURE, GM_OFFER_COOLDOWN } from '../src/utils/gmOffer'
import type { GmTenure } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

// ───────────────────────────────────────────────────────────────
// ① 仕様の釘（リテラル）
// ───────────────────────────────────────────────────────────────
console.log('\n① 仕様の釘')
check('自分から退任できるまで3シーズン（オーナー判断・2026-08-12）',
  GM_RESIGN_MIN_TENURE >= 3, `いま ${GM_RESIGN_MIN_TENURE}`)
check('声が掛かる間隔（GM_OFFER_COOLDOWN）とは別の数',
  GM_OFFER_COOLDOWN === 2, `いま ${GM_OFFER_COOLDOWN}`)

// ───────────────────────────────────────────────────────────────
// ② ふるまい（定数を読まずに、年を直接書く）
// ───────────────────────────────────────────────────────────────
console.log('\n② 2030年に就任したら、押せるのは2033年から')
{
  const tenures: GmTenure[] = [{ teamId: 'tokyo', fromYear: 2030 }]
  for (const [year, want] of [[2030, false], [2031, false], [2032, false], [2033, true], [2034, true]] as const) {
    const g = canResignAsGm(tenures, year)
    check(`${year}年は ${want ? '押せる' : '押せない'}`, g.ok === want,
      g.ok ? '押せる' : `あと${g.yearsLeft}年`)
  }
  // 残り年数もそのまま出す（画面がこの数を使う）
  const left = (y: number) => { const g = canResignAsGm(tenures, y); return g.ok ? 0 : g.yearsLeft }
  check('残り年数は 3 / 2 / 1 / 0 と減る',
    [left(2030), left(2031), left(2032), left(2033)].join(',') === '3,2,1,0',
    [left(2030), left(2031), left(2032), left(2033)].join(','))
}

console.log('\n② 履歴が複数あるときは「いま指揮しているチーム」の就任年から数える')
{
  // 前のクラブを2020〜2031、いまのクラブに2032就任。2033 はまだ押せない
  const tenures: GmTenure[] = [
    { teamId: 'fukuoka', fromYear: 2020, toYear: 2031 },
    { teamId: 'tokyo', fromYear: 2032 },
  ]
  check('2033年はまだ押せない（前のクラブの在任は数えない）', !canResignAsGm(tenures, 2033).ok)
  check('2035年なら押せる', canResignAsGm(tenures, 2035).ok)
  // ★一番古い fromYear を見ていたら 2020+3=2023 なのでどの年でも押せてしまう
  check('一番古い在任から数えていない', !canResignAsGm(tenures, 2032).ok)
}

console.log('\n② 履歴が無い・壊れているセーブでも落ちない')
{
  check('履歴なし（undefined）は「今年就任」扱いで押せない', !canResignAsGm(undefined, 2030).ok)
  check('空配列も同じ', !canResignAsGm([], 2030).ok)
  // fromYear を持たない壊れた行が混ざっていても落ちない
  const broken = [{ teamId: 'x' }, { teamId: 'tokyo', fromYear: 2030 }] as unknown as GmTenure[]
  check('壊れた行が混ざっていても数えられる', !canResignAsGm(broken, 2031).ok)
  check('壊れた行が混ざっていても4年目には押せる', canResignAsGm(broken, 2033).ok)
}

// ───────────────────────────────────────────────────────────────
// ③ 入口（呼ぶ側が通っているか）
// ───────────────────────────────────────────────────────────────
console.log('\n③ 入口で止めていること')
{
  // コメントを落としてから見る（見張りたいのは動くコードのほう）
  const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const SLICE = 'src/store/slices/seasonSlice.ts'
  const slice = codeOnly(readFileSync(SLICE, 'utf8'))
  check(`${SLICE} の resignAsGm が canResignAsGm を通っている`, /canResignAsGm\s*\(/.test(slice))
  // resignOffers 側で止める形に戻っていないこと。
  // あちらは「辞めると決めた以上、行き先0件では詰む」ので抽選しない設計
  const OFFER = 'src/utils/gmOffer.ts'
  const offer = codeOnly(readFileSync(OFFER, 'utf8'))
  const resignBody = offer.slice(offer.indexOf('export function resignOffers'))
  check(`${OFFER} の resignOffers は年で止めていない（入口で止める）`,
    !/GM_RESIGN_MIN_TENURE|canResignAsGm/.test(resignBody))
  // 画面が残り年数を自分で計算していないこと
  const PAGE = 'src/components/more/MorePage.tsx'
  const page = codeOnly(readFileSync(PAGE, 'utf8'))
  check(`${PAGE} が canResignAsGm を呼んでいる`, /canResignAsGm\s*\(/.test(page))
  check(`${PAGE} が残り年数を自分で計算していない`, !/GM_RESIGN_MIN_TENURE/.test(page))
}

// ───────────────────────────────────────────────────────────────
// ④ 就任する年。**自分から辞めるのは「今季」、向こうから来るのは「翌年」。**
//
//   `resignAsGm` は `resignOffers` に `currentSeason.year`（今季）を渡し、
//   `acceptGmOffer` はその場で `playerTeamId` を入れ替える＝シーズン途中で就任する。
//   一方 `endSeason` の `makeGmOffer` は翌年。**この2つは時期が違う。**
//
//   実際、退任画面の文言だけが「就任は次のシーズンから」に書き換えられて
//   実装とずれた（2026-08-12）。**文言だけを直せる状態にしておかないこと。**
// ───────────────────────────────────────────────────────────────
console.log('')
console.log('[④] 自分から辞めたときは「今季」就任する（文言と実装を揃える）')
{
  const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const slice = codeOnly(readFileSync('src/store/slices/seasonSlice.ts', 'utf8'))
  const body = slice.slice(slice.indexOf('resignAsGm: () => {'))
  const call = body.slice(body.indexOf('resignOffers({'), body.indexOf('resignOffers({') + 600)
  check('resignAsGm は今季（currentSeason.year）を渡している',
    /nextYear:\s*state\.currentSeason\.year\s*,/.test(call))
  check('**翌年（+ 1）を渡していない**', !/nextYear:[^,]*year\s*\+\s*1/.test(call))
  // 向こうから来るオファーは**翌年**のまま（片方だけ動かしていないこと）。
  // endSeason 側は `newYear`（= currentSeason.year + 1）を渡している
  const end = slice.slice(slice.indexOf('endSeason: () => {'))
  const mk = end.slice(end.indexOf('makeGmOffer({'), end.indexOf('makeGmOffer({') + 600)
  check('endSeason のオファーは翌年（newYear）のまま', /nextYear:\s*newYear\s*,/.test(mk))
  check('newYear は今季の翌年', /const newYear\s*=\s*state\.currentSeason\.year\s*\+\s*1/.test(end))

  // 画面の文言。**「次のシーズンから」と書かれていたら落とす**
  const page = readFileSync('src/components/more/MorePage.tsx', 'utf8')
  const resignScreen = page.slice(page.indexOf('function ResignScreen'),
    page.indexOf('function ResignScreen') + 1800)
  check('退任画面が「就任は次のシーズンから」と言っていない',
    !/就任は次のシーズンから/.test(resignScreen))
  check('退任画面が「受けたその場から」就任すると言っている',
    /受けたその場から/.test(resignScreen))
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ 退任のガードが効いていません（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ 就任から3シーズンは退任できず、判定は canResignAsGm 1本を通っている')
