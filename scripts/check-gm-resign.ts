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
// ④ **就任は次のシーズンから**（オーナー判断★13・2026-08-12）
//
//   > 次シーズンの開始になるからね（オーナー）
//   > ★13 新チームへの就任は次シーズン開始時。旧チームの途中状態は持ち込まない
//   > ★13-a 受けたら取り消せない（決めたら次シーズンから、で確定）
//
//   実装が長いあいだ「受けたその場で入れ替わる」ままだったので、**画面の文言だけ**を
//   実装に合わせて書き換えかけた（2026-08-12）。決定の側が正なので、
//   **実装・画面の文言・予約の入れ物の3つをまとめて留める。**
// ───────────────────────────────────────────────────────────────
console.log('')
console.log('[④] 就任は次のシーズンから（★13）')
{
  const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const slice = codeOnly(readFileSync('src/store/slices/seasonSlice.ts', 'utf8'))

  // 自分から退任したときの打診は**来季**のもの
  const resign = slice.slice(slice.indexOf('resignAsGm: () => {'))
  const call = resign.slice(resign.indexOf('resignOffers({'), resign.indexOf('resignOffers({') + 700)
  check('resignAsGm は**来季**（year + 1）を渡している',
    /nextYear:\s*state\.currentSeason\.year\s*\+\s*1\s*,/.test(call))

  // 受けてもその場では移らない（予約に入る）
  const accept = slice.slice(slice.indexOf('acceptGmOffer:'), slice.indexOf('declineGmOffer:'))
  check('acceptGmOffer は来季のオファーを予約にする（その場で移らない）',
    /offer\.year\s*>\s*state\.currentSeason\.year/.test(accept)
    && /pendingGmMove:\s*\{\s*teamId:\s*offer\.teamId/.test(accept))

  // 移る処理は1本だけ（入口ごとに書き分けていない）
  const moves = (slice.match(/playerTeamId:\s*offer\.teamId/g) ?? []).length
  check('**指揮するクラブを入れ替える処理は1か所だけ**', moves === 1, `${moves}か所`)
  check('endSeason が予約を実行している',
    /booked\.year\s*!==\s*newYear/.test(slice) && /applyGmMove\(moved/.test(slice))
  // ★13-b 予約中は年1回のランダムなオファーを出さない
  check('予約中は向こうからのオファーが来ない（★13-b）',
    /state\.pendingGmMove\s*\?\s*null\s*:\s*makeGmOffer\(/.test(slice))
  // ★13-a 予約中は退任し直せない
  check('予約中は退任ボタンが押せない（★13-a）',
    /if\s*\(state\.pendingGmMove\)\s*return\s*\{\}/.test(resign))

  // 画面の文言。**実装に合わせて「その場から」に戻したら落とす**
  const page = readFileSync('src/components/more/MorePage.tsx', 'utf8')
  const screen = page.slice(page.indexOf('function ResignScreen'), page.indexOf('function ResignScreen') + 2600)
  check('退任画面が「就任は次のシーズンから」と言っている', /就任は次のシーズンから/.test(screen))
  check('退任画面が「受けたその場から」と言っていない', !/受けたその場から/.test(screen))
  check('退任画面が予約中の行き先を出している', /pendingGmMove/.test(screen))
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ 退任のガードが効いていません（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ 就任から3シーズンは退任できず、判定は canResignAsGm 1本を通っている')
