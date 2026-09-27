/**
 * 【3D中継の決まり】（components/race/stage3d）
 *
 *   ① three.js を import してよいのは stage3d/scene.ts だけ
 *      ── ほかの所で静的に import すると、three.js（約580KB）がアプリの起動のファイルに入る
 *   ② RaceStage3D は scene を**開いたときにだけ**読む（`import('./scene')`。静的には型だけ）
 *   ③ scene.ts は React も store も import しない（位置は渡されたものをそのまま映す）
 *   ④ 位置は raceTimeline のスナップショットから（RaceTrack の renderStage の口で受ける。本編・大会・オンラインの3つ）
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const walk = (d: string): string[] => readdirSync(d).flatMap(n => {
  const p = join(d, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const SCENE = 'src/components/race/stage3d/scene.ts'
const STAGE = 'src/components/race/stage3d/RaceStage3D.tsx'
const src = walk('src').filter(f => /\.(tsx?)$/.test(f))

console.log('\n[1] three.js を読むのは scene.ts だけ')
{
  const bad = src.filter(f => f !== SCENE && /from ['"]three(\/[^'"]*)?['"]/.test(readFileSync(f, 'utf8').replace(/import type[^\n]*/g, '')))
  check('scene.ts の外で three を import していない（型だけは可）', bad.length === 0, bad.join(', '))
  check('scene.ts は three を読んでいる（網が生きている）', /from 'three'/.test(readFileSync(SCENE, 'utf8')))
}

console.log('\n[2] scene は開いたときだけ読む')
{
  const all = src.map(f => [f, readFileSync(f, 'utf8')] as const)
  const staticScene = all.filter(([f, s]) => f !== SCENE && /^import (?!type )[^\n]*from ['"][./]*(stage3d\/)?scene['"]/m.test(s)).map(([f]) => f)
  check('scene を静的に import している所が無い', staticScene.length === 0, staticScene.join(', '))
  check('RaceStage3D が import(\'./scene\') で読む', readFileSync(STAGE, 'utf8').includes("import('./scene')"))
}

console.log('\n[3] scene.ts は React も store も読まない')
{
  const s = readFileSync(SCENE, 'utf8')
  check('react を import していない', !/from ['"]react['"]/.test(s))
  check('store を import していない', !/from ['"][^'"]*\/store\//.test(s))
}

console.log('\n[4] 位置はスナップショットから')
{
  // 3Dを出す画面は2つ：本編と大会の中継（SimPhase）・オンライン対戦（online/RacePanel）
  for (const f of ['src/components/race/SimPhase.tsx', 'src/components/online/RacePanel.tsx']) {
    const s = readFileSync(f, 'utf8')
    check(`${f} が renderStage の口で RaceStage3D に snap を渡す`, /renderStage=\{snap => \(\s*<RaceStage3D[\s\S]*?snap=\{snap\}/.test(s))
  }
  const stage = readFileSync(STAGE, 'utf8')
  check('RaceStage3D は raceKm をスナップショットから渡す', /raceKm: r\.raceKm/.test(stage))
}

console.log('')
if (failed > 0) { console.log(`✗ 3D中継の決まりと違います（${failed}件）`); process.exit(1) }
console.log('✓ three.js は開いたときだけ読み、位置は中継の時計のスナップショットから')
