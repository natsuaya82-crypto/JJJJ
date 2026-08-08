/**
 * 【既存セーブの読み込み確認】build 105（persist v39）のセーブを、いまのコードで読ませる。
 *
 * ■なぜ要るのか
 *   build 106 で 30シーズン遊んだセーブが失われた。原因は「セーブ形式を変える変更を、
 *   既存のセーブで一度も読ませずに実機へ出した」こと。新規データでの起動確認しかしていなかった。
 *   **セーブ形式（persist の version）を上げるときは、必ずこれを通すこと。**
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-load-v39.ts --outfile=/tmp/clv.cjs \
 *     && node -e "require('/tmp/shim.cjs'); require('/tmp/clv.cjs')"
 */
import { readFileSync } from 'node:fs'

const SAVE = process.env.V39_SAVE ?? '/tmp/v39-save.json'
const raw = readFileSync(SAVE, 'utf8')
const before = JSON.parse(raw).state as Record<string, unknown>

// persist が読む場所へ先に置いてから store を読み込む（import した瞬間に hydration が走る）。
// 過去シーズンのアーカイブ等、セーブ本体の外に書かれているものも一緒に戻す。
const LS = process.env.V39_LS ?? '/tmp/v39-localstorage.json'
try {
  const dump = JSON.parse(readFileSync(LS, 'utf8')) as Record<string, string>
  for (const [k, v] of Object.entries(dump)) localStorage.setItem(k, v)
} catch { /* 無ければセーブ本体だけで見る */ }
localStorage.setItem('jpel-manager-save', raw)

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

async function main() {
  const { useGameStore } = await import('../src/store/gameStore')
  const { getSaveHealth, getSaveHealthReason } = await import('../src/store/saveHealth')
  await new Promise(r => setTimeout(r, 500))

  const s = useGameStore.getState()
  const bp = before.players as { teamId?: string; status?: string }[]
  const myId = before.playerTeamId as string
  const myBefore = bp.filter(p => p.teamId === myId && p.status === 'active').length
  const myAfter = s.players.filter(p => p.teamId === myId && p.status === 'active').length

  console.log(`読み込み状態: ${getSaveHealth()}${getSaveHealthReason() ? ` (${getSaveHealthReason()})` : ''}`)
  console.log('')
  check('読み込みが失敗していない', getSaveHealth() !== 'failed', getSaveHealthReason())
  check('ゲーム開始済みのまま', s.isInitialized === true, `isInitialized=${s.isInitialized}`)
  check('指揮チームが残っている', s.playerTeamId === myId, `${myId} → ${s.playerTeamId}`)
  check('チーム数が減っていない', s.teams.length === (before.teams as unknown[]).length,
    `${(before.teams as unknown[]).length} → ${s.teams.length}`)
  check('選手が減っていない', s.players.length === bp.length, `${bp.length} → ${s.players.length}`)
  check('自チームの在籍が減っていない', myAfter === myBefore, `${myBefore}人 → ${myAfter}人`)
  check('シーズンの年が変わっていない',
    s.currentSeason.year === (before.currentSeason as { year: number }).year,
    `${(before.currentSeason as { year: number }).year} → ${s.currentSeason.year}`)
  const stBefore = (before.currentSeason as { standings?: Record<string, unknown[]> }).standings ?? {}
  const stAfter = s.currentSeason.standings ?? {}
  const cntBefore = Object.values(stBefore).reduce((n, r) => n + (r?.length ?? 0), 0)
  const cntAfter = Object.values(stAfter).reduce((n, r) => n + (r?.length ?? 0), 0)
  check('順位表が残っている', cntAfter === cntBefore, `${cntBefore}行 → ${cntAfter}行`)
  check('過去シーズンが減っていない',
    (s.pastSeasons?.length ?? 0) >= ((before.pastSeasons as unknown[])?.length ?? 0),
    `${(before.pastSeasons as unknown[])?.length ?? 0} → ${s.pastSeasons?.length ?? 0}`)

  console.log('')
  if (problems.length > 0) {
    console.log(`✗ 既存セーブの読み込みで ${problems.length}件おかしくなっています`)
    problems.forEach(p => console.log(`   - ${p}`))
    process.exit(1)
  }
  console.log('✓ build 105 のセーブを、いまのコードで失わずに読める')
}

void main()
