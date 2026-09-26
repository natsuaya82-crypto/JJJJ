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
  const { jpelClubs } = await import('../src/utils/world')
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
  // v47 からクラブは1つの並び（clubs）。旧い国内の teams は日本のリーグのクラブになる
  check('チーム数が減っていない', jpelClubs(s.clubs).length === (before.teams as unknown[]).length,
    `${(before.teams as unknown[]).length} → ${jpelClubs(s.clubs).length}`)
  check('選手が減っていない', s.players.length === bp.length, `${bp.length} → ${s.players.length}`)
  check('自チームの在籍が減っていない', myAfter === myBefore, `${myBefore}人 → ${myAfter}人`)
  check('シーズンの年が変わっていない',
    s.currentSeason.year === (before.currentSeason as { year: number }).year,
    `${(before.currentSeason as { year: number }).year} → ${s.currentSeason.year}`)
  // v46 から日程・結果・順位表はリーグごと（`Season.leagues`）。旧い入れ物は3つ
  //   国内の順位表 standings（部→行）／海外の順位表 foreignStandings（リーグ→行）／
  //   結果の入った日程 races（自分の部）・divisionRaces（他の部。自分の部は結果の無い写し）・foreignRaces
  // ★旧い名前（currentSeason.standings）を新しい側で読まないこと。移行したあとは必ず空なので、
  //   ここが「52行 → 0行」で落ちるのは移行の失敗ではなく点検の読み違い（2026-09-26 に実際そうなった）
  type Row = { teamId?: string; clubId?: string; totalPoints?: number }
  const oldSeason = before.currentSeason as {
    standings?: Record<string, Row[]>; foreignStandings?: Record<string, Row[]>
    races?: { results?: unknown }[]; divisionRaces?: Record<string, { results?: unknown }[]>
    foreignRaces?: Record<string, { results?: unknown }[]>
  }
  const pointsBefore = new Map<string, number>()
  for (const rows of [...Object.values(oldSeason.standings ?? {}), ...Object.values(oldSeason.foreignStandings ?? {})])
    for (const r of rows ?? []) pointsBefore.set(r.teamId ?? r.clubId ?? '', r.totalPoints ?? 0)
  const pointsAfter = new Map<string, number>()
  for (const lg of Object.values(s.currentSeason.leagues ?? {}))
    for (const r of lg.standings ?? []) pointsAfter.set(r.teamId, r.totalPoints ?? 0)
  check('順位表が残っている', pointsAfter.size === pointsBefore.size, `${pointsBefore.size}行 → ${pointsAfter.size}行`)
  const lostPoints = [...pointsBefore].filter(([id, pt]) => pointsAfter.get(id) !== pt)
  check('順位表の得点が変わっていない', lostPoints.length === 0,
    lostPoints.slice(0, 3).map(([id, pt]) => `${id} ${pt} → ${pointsAfter.get(id)}`).join(' / '))
  const done = (rs: { results?: unknown }[] | undefined) => (rs ?? []).filter(r => r?.results).length
  const doneBefore = done(oldSeason.races)
    + Object.values(oldSeason.divisionRaces ?? {}).reduce((n, rs) => n + done(rs), 0)
    + Object.values(oldSeason.foreignRaces ?? {}).reduce((n, rs) => n + done(rs), 0)
  const doneAfter = Object.values(s.currentSeason.leagues ?? {}).reduce((n, lg) => n + done(lg.races), 0)
  check('走り終えたレースが残っている', doneAfter === doneBefore, `${doneBefore}本 → ${doneAfter}本`)
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
