/**
 * 【海外クラブを指揮しても画面が壊れないか】アプリの画面を実際にブラウザで1枚ずつ開いて確かめる。
 *
 * ■なぜ要るのか
 *   監督は海外クラブにも就任する（utils/gmOffer）。画面は長いあいだ「自チーム＝日本の部のクラブ」を前提に
 *   書かれていて、自チームを海外クラブにすると
 *     ・移籍市場が真っ白（自チームを日本のリーグのクラブとしてしか引いていなかった）
 *     ・ホームの順位・順位表の四角が空（順位表を「日本の部」からしか引いていなかった）
 *     ・ホームの「順位表」を押すと日本の1部が開く（部番号の既定が1部）
 *     ・GM名が空（日本のクラブにしか保存されていない値を直に読んでいた）
 *   になっていた。どれも例外は出ないので、「開けるか」だけを見ても気づけない。
 *
 * ■やること
 *   scripts/screens（台）を dev サーバで開く。台は新しいゲームを本物の手順で作り、
 *   `?mode=jpel`（日本のクラブを指揮）と `?mode=foreign`（本物の就任の道で海外クラブの監督になった）
 *   の2つの世界で、
 *   アプリと同じ道すじ（App.tsx の AppRoutes）を1本ずつ開いて、出た文字を返す。
 *   **両方の世界で同じことを確かめる**（日本の世界で通らない確かめは、海外の世界でも何も守っていない）。
 *
 *   [1] App.tsx の道すじを全部開いている（開いていない道は SKIP に理由を書く）
 *   [2] どの画面も落ちない・例外も console.error も出ない
 *   [3] どの画面も何か出ている（Layout だけの画面より文字が多い）
 *   [4] 自チームを見る画面
 *       ・ホームに自分のリーグでの順位と監督名が出る
 *       ・ホームの「順位表」を押すと自分のリーグの順位表が開き、リーグの名前が出る
 *       ・自チームの詳細に「自チーム」の札が出る
 *       ・海外の世界では、自チームの画面に日本のリーグの字（JPEL・◯部）が出ない
 *
 * ■走らせ方
 *   `npm run check` で走る（ブラウザが無い環境では見送り）。単体では
 *     BOOT_CHROME=<chrome> node <組んだもの>
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { matchPath } from 'react-router'
import { startDev, CONSOLE_NOISE } from './devServer'

const req = createRequire(join(process.cwd(), 'noop.cjs'))

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

/**
 * 開かない道と、その理由。**「漏れた」と「あえて」を区別する**（NOT_A_TAB / OUTSIDE_MAIN と同じ形）。
 * 台の世界にはサーバーの相手（部屋・対戦・走友会・フレンド）がいないので、その相手を開く道は開けない
 */
const SKIP: Record<string, string> = {
  '/online/room/:roomId': 'サーバーの対戦部屋を開く。台の世界に部屋が無い',
  '/online/history/:matchId': 'サーバーの対戦記録を開く。台の世界に記録が無い',
  '/friends/club/:code': 'サーバーの走友会を開く。台の世界に走友会が無い',
  '/friends/team/:id': 'サーバーのフレンドを開く。台の世界に相手がいない',
}

/**
 * Layout だけの画面と同じくらいしか出ないのが正しい道（**どちらの世界でも同じ**）。
 * 台の世界にはランクマッチの札が無いので、札を読む画面は何も出さない
 */
const EMPTY_OK: Record<string, string> = {
  '/online/rated/lineup': 'その日のランクマッチの札が無いと何も出さない',
  '/online/rated/result': 'その日のランクマッチの結果が無いと何も出さない',
}

/** 自チームを見る画面（台の tag）。海外の世界で日本のリーグの字が出てはいけない */
const MINE_TAGS = new Set(['home', 'mine', 'myLeague', 'myClub'])
const JPEL_WORDS = /JPEL|[123]部/

type Shot = { name: string; path: string; tag?: string; error?: string; text: string; loc?: string }
type Meta = { mode: string; leagueId: string; leagueName?: string; leaguePath: string; rank: number; gmName: string; shortName: string }

const CHROME = process.env.BOOT_CHROME
if (!CHROME) {
  console.error('  NG  ブラウザの実行ファイルが渡されていません（BOOT_CHROME）')
  process.exit(1)
}

async function main() {
  const dev = await startDev()
  const { chromium } = req('playwright') as typeof import('playwright')
  const browser = await chromium.launch({ executablePath: CHROME })
  const runs: { mode: string; shots: Shot[]; meta: Meta; errors: string[] }[] = []
  try {
    for (const mode of ['jpel', 'foreign']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      const errors: string[] = []
      page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
      page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 300)}`) })
      await page.goto(`${dev.url}scripts/screens/index.html?mode=${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForFunction(() => (window as unknown as { __screensDone?: boolean }).__screensDone, null, { timeout: 300000 })
      const r = await page.evaluate(() => {
        const w = window as unknown as { __screens: Shot[]; __screensMeta: Meta }
        return { shots: w.__screens, meta: w.__screensMeta }
      })
      runs.push({ mode, ...r, errors })
      await page.close()
    }
  } finally {
    await browser.close()
    dev.stop()
  }

  // [1] App.tsx の道すじを全部開いているか
  console.log('[1] App.tsx の道すじを全部開いている')
  const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const patterns = [...new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]))]
  for (const { mode, shots } of runs) {
    const visited = shots.map(s => s.path).filter(Boolean)
    const missing = patterns.filter(p => !SKIP[p] && !visited.some(v => matchPath(p, v)))
    check(`${mode}: ${patterns.length}本の道を開いた（SKIP ${Object.keys(SKIP).length}本）`, missing.length === 0,
      `開いていない道: ${missing.join(' ')}（開くか、SKIP に理由を書く）`)
  }
  const staleSkip = Object.keys(SKIP).filter(p => !patterns.includes(p))
  check('SKIP に App.tsx に無い道が残っていない', staleSkip.length === 0, staleSkip.join(' '))

  for (const { mode, shots, meta, errors } of runs) {
    console.log(`\n── ${mode === 'jpel' ? '日本のクラブを指揮' : '海外クラブを指揮'}（${meta.leagueName}・${meta.shortName}）`)
    const at = (tag: string) => shots.find(s => s.tag === tag)

    console.log('[2] 落ちない')
    const broken = shots.filter(s => s.error)
    check(`${shots.length}枚とも落ちない`, broken.length === 0, broken.map(s => `${s.name}: ${s.error}`).join(' / '))
    const real = [...new Set(errors)].filter(e => !CONSOLE_NOISE.test(e))
    check('例外も console.error も出ない', real.length === 0, real.slice(0, 5).join(' / '))

    console.log('[3] 何か出ている')
    const blank = at('blank')
    const floor = (blank?.text.trim().length ?? 0) + 5
    const empty = shots.filter(s => s.tag !== 'blank' && s.path && !EMPTY_OK[s.path] && s.text.trim().length <= floor)
    check(`Layout だけの画面（${floor - 5}字）より多く出ている`, !!blank && empty.length === 0,
      empty.map(s => `${s.name}(${s.text.trim().length}字)`).join(' '))

    console.log('[4] 自チームを見る画面')
    const home = at('home')?.text ?? ''
    check(`ホームに自分のリーグでの順位（${meta.rank}位）が出る`, meta.rank > 0 && home.includes(`${meta.rank}位`))
    check(`ホームに監督名（${meta.gmName}）が出る`, home.includes(`GM: ${meta.gmName}`))
    const click = at('homeStandingsClick')
    check(`ホームの「順位表」を押すと自分のリーグの順位表（${meta.leaguePath}）が開く`, click?.loc === meta.leaguePath, click?.loc ?? '押せなかった')
    const league = at('myLeague')?.text ?? ''
    check(`自分のリーグの順位表に「${meta.leagueName}」が出る`, !!meta.leagueName && league.includes(meta.leagueName))
    check('自チームの詳細に「自チーム」の札が出る', (at('myClub')?.text ?? '').includes('自チーム'))
    if (mode === 'foreign') {
      const jpelOnMine = shots.filter(s => s.tag && MINE_TAGS.has(s.tag) && JPEL_WORDS.test(s.text))
      check('自チームの画面に日本のリーグの字（JPEL・◯部）が出ない', jpelOnMine.length === 0,
        jpelOnMine.map(s => `${s.name}「${s.text.match(JPEL_WORDS)?.[0]}」`).join(' '))
    }
  }

  console.log('')
  if (failed > 0) { console.log(`✗ ${failed}件`); process.exit(1) }
  console.log('✓ 海外クラブを指揮しても画面は開けます')
  process.exit(0)
}

main().catch(e => { console.error('  NG  点検そのものが落ちました —', e?.message ?? e); process.exit(1) })
