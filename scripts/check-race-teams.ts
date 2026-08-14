/**
 * **中継に並ぶのは「そのレースを走っているクラブだけ」か。**
 *
 * ■何が起きていたか（実機で見つかった・2026-08-14）
 *   レース中継の総合順位に、走っていないクラブまで並んでいました。走者が居ないので
 *   顔は「?」・名前は空、しかも区間タイムが無い＝自分と同じタイム扱いになるため
 *   **タイム差0のまま上位を占め**、実際に走っている20クラブが下へ押し出されていました。
 *
 *   原因は、誰が走るか（`buildCpuLineups`＝自分と同じ部）と、画面に並べるクラブ
 *   （`teams` をそのまま渡す＝全52クラブ）が**別々だった**こと。
 *
 * ■ここで見ること
 *   1. `racingTeams` が返すのは自チーム＋同じ部の相手だけ（＝部の人数ぴったり）
 *   2. 部の違うクラブが1つも混ざらない
 *   3. 返ってきたクラブは**全員が全区間に走者を持つ**（＝「?」が出ない）
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { buildCpuLineups, racingTeams } from '../src/engine/raceEngine'
import { divisionOf, teamsInDivision } from '../src/utils/league'
import type { Player, Team } from '../src/types'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const players: Player[] = generateCpuRosters(teams, YEAR).cpuPlayers as Player[]

// 1部・2部・3部それぞれに自チームを置いて見る（部で人数が違うため）
for (const div of [1, 2, 3] as const) {
  const me = teams.find(t => divisionOf(t) === div)
  if (!me) { check(`${div}部のクラブがある`, false); continue }
  const race = generateSeasonRaces(YEAR, div)[0]
  const cpuLineups = buildCpuLineups(teams, players, race, me.id)
  const shown = racingTeams(teams, cpuLineups, me.id)
  const divTeams = teamsInDivision(teams, div)

  console.log(`\n${div}部（${me.shortName}）: 全クラブ ${teams.length} / 同じ部 ${divTeams.length} / 中継に並ぶ ${shown.length}`)

  check('中継に並ぶのは同じ部のクラブだけ', shown.length === divTeams.length,
    `同じ部 ${divTeams.length} に対して ${shown.length} 並んでいる`)

  const otherDiv = shown.filter(t => divisionOf(t) !== div)
  check('部の違うクラブが混ざっていない', otherDiv.length === 0,
    otherDiv.slice(0, 5).map(t => `${t.shortName}(${divisionOf(t)}部)`).join(' / '))

  check('自チームが入っている', shown.some(t => t.id === me.id))

  // 走者が引けないクラブが1つでもあると、その行は「?」＋名前なしで出る
  const byId = new Map(players.map(p => [p.id, p]))
  const noRunner: string[] = []
  for (const t of shown) {
    if (t.id === me.id) continue          // 自チームの走者は監督が決める
    for (const seg of race.segments) {
      const pid = cpuLineups[t.id]?.[seg.index]
      if (!pid || !byId.get(pid)) noRunner.push(`${t.shortName}の${seg.index}区`)
    }
  }
  check('並んだクラブは全区間に走者が居る（「?」が出ない）', noRunner.length === 0,
    `${noRunner.length}件: ${noRunner.slice(0, 5).join(' / ')}`)
}

// ★中継の画面が、この1本を通って並べているか（helper だけ正しくても、画面が
//   全クラブを渡していたら同じ事故が戻る。実際それが原因だった）
{
  const src = readFileSync('src/components/race/RacePage.tsx', 'utf8')
  const simProps = src.slice(src.indexOf('<SimPhase'), src.indexOf('<SimPhase') + 400)
  console.log('')
  check('中継の画面が racingTeams を通している', /teams=\{raceTeams\}/.test(simProps) && src.includes('racingTeams('),
    `SimPhase へ渡している行: ${(simProps.match(/teams=\{[^}]*\}/) ?? ['(見つからない)'])[0]}`)
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
