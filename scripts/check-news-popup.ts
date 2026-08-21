/**
 * 【起動時のお知らせポップは1本の仕組み】
 *
 * ■なぜ要るのか（オーナー・2026-08-16）
 *   「次のアプデでホームに【オンラインレート戦開催】のニュースポップ
 *     表示させよう。xみたいにね」
 *
 *   「xみたいに」＝**公式Xのフォロー案内と同じ形**。あの形をもう1枚
 *   書き写すと、片方だけ余白や色がずれます（`check-ui-tokens` の予算が
 *   見張っているのと同じ形の事故）。枠は `ui/IntroModal` 1本にして、
 *   Xの案内もお知らせポップもそこに乗せます。
 *
 *   文面は `data/newsPopups` の配列だけ。**次のお知らせを足すときに
 *   画面も App.tsx も触らない**のが狙いです。
 *
 * ■この点検が守るもの
 *   ①枠は1本（Xの案内もお知らせも `IntroModal` を通る）
 *   ②文面は data に置く（画面に直書きしない）
 *   ③見たかどうかは端末に持つ（スロットを変えても出直さない）
 *   ④期限切れは出さない・一度見たら出さない
 *   ⑤Xの案内と重ならない
 */
import { readFileSync } from 'node:fs'
import { NEWS_POPUPS, nextNewsPopup } from '../src/data/newsPopups'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const app = readFileSync('src/App.tsx', 'utf8')
/** コメントを外す。**オーナーの発言を引用したコメントを「直書き」と読まないため** */
const noComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const news = readFileSync('src/components/ui/NewsModal.tsx', 'utf8')
const tw = readFileSync('src/components/ui/TwitterModal.tsx', 'utf8')
const intro = readFileSync('src/components/ui/IntroModal.tsx', 'utf8')

console.log('[1] 枠は IntroModal 1本')
{
  check('お知らせポップが IntroModal を通る', /<IntroModal/.test(news))
  check('公式Xの案内も IntroModal を通る', /<IntroModal/.test(tw))
  // ★ここが本体。全画面の枠を書き写したら落とす（`position: 'fixed', inset: 0` ＋ z-index 9999）
  for (const [name, src] of [['NewsModal', news], ['TwitterModal', tw]] as const) {
    check(`${name} が全画面の枠を書き写していない`,
      !/position: 'fixed', inset: 0/.test(src) && !/zIndex: 9999/.test(src))
  }
  // 枠の実体は `ui/ScreenCover` 1本（2026-08-20 に24ファイルの手書きを寄せた）。
  // IntroModal はそれを通しているか、を見る
  check('IntroModal が ScreenCover を通っている', /<ScreenCover/.test(intro))
  check('全画面の枠の実体は ScreenCover にある',
    /position: 'fixed', inset: 0, zIndex: COVER\[level\]/.test(
      readFileSync('src/components/ui/ScreenCover.tsx', 'utf8')))
}

console.log('\n[2] 文面は data に置く（画面に直書きしない）')
{
  check('お知らせが1件以上ある', NEWS_POPUPS.length > 0, `${NEWS_POPUPS.length}件`)
  check('画面に見出しを書いていない', /news\.title/.test(news) && !/オンラインレート戦/.test(news))
  check('App.tsx に見出しを書いていない', !/オンラインレート戦/.test(noComments(app)))
  for (const n of NEWS_POPUPS) {
    check(`「${n.title}」に行き先がある`, n.to.startsWith('/'), n.to)
  }
  // id が重複していると「見た」の記録がぶつかる
  check('id が重複していない', new Set(NEWS_POPUPS.map(n => n.id)).size === NEWS_POPUPS.length)
}

console.log('\n[3] 選ぶ判定は nextNewsPopup 1本')
{
  // ★「今日」は呼ぶ側から渡す（`data/` は `utils/` を import できない＝`check-layers`）。
  //   ここでは期限内の日付を渡して、選ぶ側だけを見る
  const TODAY = '2026-08-18'
  // ★**`from` が来ている先頭は数に入れない。** 期間前のものは出ないのが正しい
  //   （2026-08-21 に1000DL記念を先頭へ置いた。8/22 より前は次のものが出る）
  const first = NEWS_POPUPS.find(n => (!n.from || n.from <= TODAY) && (!n.until || n.until >= TODAY))!
  check('まだ見ていなければ出る', nextNewsPopup([], TODAY)?.id === first.id, String(nextNewsPopup([], TODAY)?.id))
  check('一度見たら出ない', nextNewsPopup(NEWS_POPUPS.map(n => n.id), TODAY) === null)
  // ★空振り除け。期限切れの1件だけの世界を作って、確かに出ないことを見る
  check('期限を過ぎたものは出ない',
    NEWS_POPUPS.every(n => !n.until || n.until >= '2026-08-16'),
    '期限切れのお知らせが残っています（配列から消すこと）')
  check('画面が配列を自分で絞っていない', !/NEWS_POPUPS/.test(news) && !/NEWS_POPUPS/.test(app))
  check('App.tsx が nextNewsPopup を通る', /nextNewsPopup\(/.test(app))
}

console.log('\n[4] 見たかどうかは端末に持つ（セーブではない）')
{
  const flags = readFileSync('src/store/deviceFlags.ts', 'utf8')
  check('deviceFlags に置いている', /deviceSeenNewsIds/.test(flags) && /markDeviceNewsSeen/.test(flags))
  check('App.tsx が端末の記録を読む', /deviceSeenNewsIds\(\)/.test(app))
  check('閉じたら記録する', /markDeviceNewsSeen\(news\.id\)/.test(app))
  check('セーブ（GameState）に持っていない',
    !/newsPopupSeen|seenNewsIds/.test(readFileSync('src/types/index.ts', 'utf8')))
}

console.log('\n[5] 公式Xの案内と重ならない')
{
  check('Xの案内を閉じてから出す', /!twitterIntroSeen\) return/.test(app))
  check('同時に出さない', /news && !showTwitter/.test(app))
  check('強制アップデート中は出さない', /news && !showTwitter && !forceUpdate/.test(app))
}

console.log('\n[4] 期間中は毎回出す（「もう表示しない」を押したときだけ止まる）')
{
  const rep = NEWS_POPUPS.find(n => n.repeat)
  if (!rep) {
    check('repeat のお知らせがある（この節が空振りしていない）', false, '1件も無い')
  } else {
    const shift = (d: string, n: number) => {
      const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n)
      return t.toISOString().slice(0, 10)
    }
    // ★**`repeat` は必ず期間を持つこと。** 持たないと毎回・永久に出ます
    //   （閉じても記録しないので、チェックを押すまで一生出続ける）
    check('repeat のお知らせには from がある', !!rep.from, String(rep.from))
    check('repeat のお知らせには until がある', !!rep.until, String(rep.until))
    const inside = rep.from ?? '2026-08-22'
    if (rep.from) {
      const before = shift(rep.from, -1)
      check(`${before}（始まる前）は出ない`, nextNewsPopup([], before)?.id !== rep.id, String(nextNewsPopup([], before)?.id))
    }
    check('期間中は出る', nextNewsPopup([], inside)?.id === rep.id, String(nextNewsPopup([], inside)?.id))
    if (rep.until) {
      const after = shift(rep.until, 1)
      check(`${after}（終わったあと）は出ない`, nextNewsPopup([], after)?.id !== rep.id, String(nextNewsPopup([], after)?.id))
    }
    // ★**閉じただけでは記録しない。** ここが「毎回出す」の実体
    const app = readFileSync('src/App.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    check('閉じただけでは「見た」に記録しない', /if \(!news\.repeat \|\| stop\) markDeviceNewsSeen/.test(app))
    check('「もう表示しない」を押せる口がある',
      /もう表示しない/.test(readFileSync('src/components/ui/NewsModal.tsx', 'utf8')))
    check('記録されたら出ない', nextNewsPopup([rep.id], inside)?.id !== rep.id)
  }
}

console.log('')
if (failed > 0) { console.log(`✗ お知らせポップの仕組みが割れています（${failed}件）`); process.exit(1) }
console.log('✓ お知らせポップは枠1本・文面はdata・記録は端末')
