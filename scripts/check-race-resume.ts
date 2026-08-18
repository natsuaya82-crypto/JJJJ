/**
 * 【レースの結果画面から離れて戻っても、行き止まりにならないこと】
 *
 * ■なにが起きていたか（オーナー・2026-08-18）
 *     「シーズン最終戦で区間賞とか詳細見てたらいきなりシーズン終わりましたに飛んで進行不可能」
 *
 *   結果画面（`ResultsPhase`）は順位表のクラブを長押しするとクラブ詳細へ飛びます。
 *   ところが結果は `RacePage` の**ローカルstateにしか無い**ので、戻ってきた時点で消えます。
 *   走り終えたレースは `currentRaceIndex` が既に次を指しているため、
 *
 *     - 途中のレースなら … 次のレースの編成画面が開く（結果は見られないが進める）
 *     - **最終戦なら … `currentRace` が undefined** ＝
 *       「シーズン終了。すべてのレースが完了しました。」の**文字だけの画面**
 *
 *   になります。この画面はレース中なので**下タブが隠れていて**、ボタンも無い。
 *   つまり戻る道が1つも無く、そこで詰みます。
 *
 * ■直し方（ここが見張る形）
 *   結果は store の `activeRace*`（セーブには載らない ephemeral）に置いて、
 *   戻ってきたら復帰させる。用が済んだら `clearActiveRace` で消す。
 *
 * ■なぜ点検が要るのか
 *   結果画面へ入る道は**3本**（イベントを最後まで見る／スキップ／流し見）あります。
 *   道ごとに書くと、また1本だけ写し忘れます。**写すのは1か所**であること、
 *   そして**行き止まりに帰り道があること**を見ます。
 */
import { readFileSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const race = readFileSync('src/components/race/RacePage.tsx', 'utf8')
const results = readFileSync('src/components/race/ResultsPhase.tsx', 'utf8')

// ① 結果へ入る道は3本ある（ここが増えたら②の意味が変わるので数える）
const enters = (race.match(/setPhase\('results'\)/g) ?? []).length
check('結果へ入る道は3本', enters === 3, `${enters}本`)

// ② 写すのは1か所だけ（道ごとに書かない）
const saves = (race.match(/setActiveRaceResults\(/g) ?? []).length
check('結果を store へ写すのは1か所', saves === 1, `${saves}か所`)

// ③ 戻ってきたときに復帰する（読み戻していること）
check('戻ってきたら結果を復帰させる', /activeRaceResults\s*&&/.test(race))

// ④ 復帰させるのは「走り終えた1本ぶん」だけ（次のレースに前の結果を出さない）
check('復帰するのは走り終えた1本ぶんだけ',
  /activeRaceLockedRaceIndex\s*\+\s*1\s*===\s*currentSeason\.currentRaceIndex/.test(race))

// ⑤ 見終わったら消す（消さないと次のレースで前の結果が出る）
check('見終わったら clearActiveRace で消す', /clearActiveRace\(\)/.test(results))

// ⑥ それでも来てしまったときのために、行き止まりに帰り道があること。
//    ★文字だけの画面に戻る道が無いのが「進行不可能」の正体なので、ここは必ず見る
// ★探すのは**画面に出す文字列**（引用符ごと）。ただの indexOf だと、上に書いてある
//   説明のコメントのほうに当たって、ボタンを消しても緑のままになる
const deadEnd = race.indexOf("? 'シーズン終了。すべてのレースが完了しました。'")
check('「シーズン終了」の画面に帰り道がある',
  deadEnd >= 0 && /navigate\('\/'\)/.test(race.slice(deadEnd, deadEnd + 700)))

console.log(failed === 0 ? '✓ レースの結果画面の復帰: OK' : `✗ ${failed}件`)
process.exit(failed === 0 ? 0 : 1)
