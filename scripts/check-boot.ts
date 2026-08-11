/**
 * 【起動できるか】アプリを実際にブラウザで開いて、最初の画面が出るところまで見る。
 *
 * ■なぜ要るのか
 *   `seasonAwardsOf` で落ちて「エラーが発生しました」の画面から先へ進めない不具合が、
 *   **点検51本を全部通しても1本も気づけなかった。** どの点検も関数やソースを見ていて、
 *   「開いたら画面が出るか」を誰も見ていなかった。ここだけは実際に描かせて確かめる。
 *
 * ■この点検の限界（必ず読むこと）
 *   見るのは **dev サーバ（vite）** です。
 *   **本番ビルド固有の壊れ方（チャンク分割・minify・動的 import の解決）は拾えません。**
 *   拾いたくなったら `dist` を見る版を足すこと（`npm run build` が35秒かかるので、
 *   そのときも heavy のままにする）。
 *
 * ■走らせ方
 *   `npm run check` で走ります（1本で20秒ほどかかりますが、既定に入れています。
 *   理由は run-checks.mjs の boot の項）。ブラウザが無い環境では「見送り」になります。
 *
 *   ブラウザの実行ファイルは run-checks.mjs が探して BOOT_CHROME で渡します。
 *   単体で走らせるときは自分で指定してください:
 *
 *     BOOT_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node <組んだもの>
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

// playwright は esbuild で束ねない（ネイティブの実行ファイルを抱えているため）。
// createRequire 経由にすると、束ねる側からは中身が見えないので実行時に読み込まれる。
const req = createRequire(join(process.cwd(), 'noop.cjs'))

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const CHROME = process.env.BOOT_CHROME
if (!CHROME) {
  console.error('  NG  ブラウザの実行ファイルが渡されていません（BOOT_CHROME）')
  process.exit(1)
}

// ── dev サーバを立ち上げる ──
// ポートは空きしだいで変わるので、出力から読み取る（5173 と決め打ちしない）
type Dev = { url: string; stop: () => void }
function startDev(): Promise<Dev> {
  return new Promise((resolve, reject) => {
    // ★プロセスグループごと起こす。`npm run dev` は sh → vite と孫が生えるので、
    //   子だけ kill しても vite が生き残り、その stdio がこちらを終わらせない
    //   （結果を出したあと固まる。落ちるときは process.exit で抜けるので、
    //     **緑になって初めて出る**種類の穴だった）
    const child = spawn('npm', ['run', 'dev'], { cwd: process.cwd(), env: process.env, detached: true })
    let buf = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`dev サーバが立ち上がりませんでした:\n${buf.slice(-500)}`)) }, 60000)
    const onData = (d: Buffer) => {
      buf += d.toString()
      const m = buf.match(/http:\/\/localhost:(\d+)/)
      if (m) {
        clearTimeout(timer)
        child.stdout?.off('data', onData)
        resolve({ url: m[0] + '/', stop: () => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* もう死んでいる */ } } })
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', e => { clearTimeout(timer); reject(e) })
  })
}

// CJS に束ねるので top-level await は使えない。本体は async 関数に包む
async function main() {
  // BOOT_URL があればそこを開く（dev サーバを立てない）。
  // 中身を差し替えて「緑になる道」を確かめるときと、将来 dist を見る版に使う
  const dev = process.env.BOOT_URL
    ? { url: process.env.BOOT_URL, stop: () => {} }
    : await startDev()
  console.log(`  開く先: ${dev.url}`)

  const { chromium } = req('playwright') as typeof import('playwright')
  const browser = await chromium.launch({ executablePath: CHROME })
  const errors: string[] = []
  let bodyText: string
  try {
    const page = await browser.newPage()
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 300)}`) })
    await page.goto(dev.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    // 最初の描画と、そのあとに走る効果（persist の復元など）まで待つ
    await page.waitForTimeout(4000)
    bodyText = await page.locator('body').innerText().catch(() => '')
  } finally {
    await browser.close()
    dev.stop()
  }

  // ★合否に使うのは「アプリ自身が投げた例外」だけ。
  //   読み込みに失敗した（404・接続断）は描画の失敗ではないので合否から外す
  //   ——ただし黙って捨てず、下に参考として出す。
  //   （favicon の404が「console.error が出ている」で赤くなっていた）
  const NOISE = /Failed to load resource|ERR_CONNECTION_RESET|favicon|\[vite\]|Download the React DevTools|getSnapshot should be cached/i
  const uniq = [...new Set(errors)]
  const real = uniq.filter(e => !NOISE.test(e))
  const noise = uniq.filter(e => NOISE.test(e))

  console.log('')
  check('画面に何か出ている（真っ白でない）', bodyText.trim().length > 0, `${bodyText.length}文字`)
  check('ErrorBoundary の画面になっていない', !bodyText.includes('エラーが発生しました'))
  check('タイトル画面が出ている（TAP TO START）', bodyText.includes('TAP TO START'))
  check('描画中の例外が出ていない', real.filter(e => e.startsWith('pageerror')).length === 0)
  check('console.error が出ていない', real.filter(e => e.startsWith('console.error')).length === 0)

  if (failed > 0) {
    console.log('')
    console.log('── 画面に出た文字（先頭300字）──')
    console.log(bodyText.slice(0, 300).replace(/^/gm, '    '))
    if (real.length > 0) {
      console.log('── 拾ったエラー ──')
      for (const e of real.slice(0, 5)) console.log('    ' + e)
    }
    if (noise.length > 0) {
      console.log('── 参考（合否には使っていない）──')
      for (const e of noise.slice(0, 3)) console.log('    ' + e)
    }
    console.log('')
    console.log(`✗ 起動できていません（${failed}件）`)
    process.exit(1)
  }
  console.log('')
  console.log('✓ 開いてタイトル画面まで出ました')
  process.exit(0)

}

main().catch(e => { console.error('  NG  点検そのものが落ちました —', e?.message ?? e); process.exit(1) })
