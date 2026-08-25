/**
 * 【下限を割ったら埋める】開幕できない状態を残さない
 *
 * ■なぜ要るのか（オーナー・2026-08-23）
 *   「15人以下だと開幕できないけど、これって塞げてないけどどうなんの？」
 *   「開幕できないは防ぎたいからもし15人以下だった場合60くらいの弱い選手が
 *     足りない分追加されて15人になるのは？」
 *
 *   下限を割ると `utils/seasonStart` が開幕を止めるが、そこから抜ける道が
 *   画面に無い。ドラフトで獲れるのは1部だけ（`joinsDraft`）で、2部・3部は
 *   FAと移籍しか無く、FAが尽きると詰む（2026-08-16 に実際に起きた）。
 *
 * ■わざと壊して落ちることを確かめた
 *   ・`fillRosterToMin` の `need` を `0` にする              → ①②
 *   ・ランクを 'A' にする（弱い選手にならない）              → ③
 *   ・15人ちょうどでも入れる（`need <= 0` を外す）           → ④
 */
import { readFileSync } from 'node:fs'
import { fillRosterToMin } from '../src/engine/playerGenerator'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { ROSTER_MIN } from '../src/data/rosterRules'
import { canStartSeason } from '../src/utils/seasonStart'
import { ovr } from '../src/utils/playerUtils'
import type { Player } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const team = INITIAL_TEAMS[0]
// そのクラブの選手を n 人だけ持つ世界を作る（中身は本物の生成器から）
const madeAll = generateCpuRosters([{ id: team.id, tier: 5 }], 2030).cpuPlayers
const worldOf = (n: number): Player[] => madeAll.slice(0, n).map(p => ({ ...p, teamId: team.id }))

console.log(`[1] 足りないぶんだけ入れて、ちょうど ${ROSTER_MIN} 人にする`)
{
  for (const have of [0, 3, 5, 10, 13, 14]) {
    const add = fillRosterToMin(team, 2030, worldOf(have))
    check(`${have}人 → ${add.length}人足して ${have + add.length}人`,
      have + add.length === ROSTER_MIN, `${have + add.length}人`)
  }
  // ★入れすぎない
  for (const have of [15, 16, 25]) {
    const add = fillRosterToMin(team, 2030, worldOf(have))
    check(`${have}人なら1人も足さない`, add.length === 0, `${add.length}人足した`)
  }
}

console.log('\n[1-b] 選手の作り方は1本（ベタ書きしていない）')
{
  const src = readFileSync('src/engine/playerGenerator.ts', 'utf8')
  // ★**若手の補充と救済が同じ幹から分岐しているか。** 片方だけ手組みに戻すと落ちる
  check('幹（makeNewPlayersFor）がある', /function makeNewPlayersFor\(/.test(src))
  const uses = (src.match(/makeNewPlayersFor\(/g) ?? []).length
  check('幹を使っているのは2か所（若手の補充・下限の救済）＋定義', uses === 3, `${uses} か所`)
  // ★`buildRatingsForRank` は初期ロスター・ドラフト・海外も通る**世界共通の幹**なので、
  //   ここで数を縛らない（縛ると関係ない生成を足しただけで落ちる）。
  //   見るのは「補充と救済が同じ幹から出ているか」だけ。
  check('年俸は faMarketSalary（手で決めていない）', /fresh\.contract\.annualSalary = faMarketSalary\(fresh\)/.test(src))
}

console.log(`\n[2] 入るのは弱い選手（OVR60くらい）`)
{
  const add = fillRosterToMin(team, 2030, worldOf(10))
  const ovrs = add.map(p => ovr(p))
  const max = Math.max(...ovrs)
  console.log(`      OVR ${Math.min(...ovrs)}〜${max}（平均 ${(ovrs.reduce((a, b) => a + b, 0) / ovrs.length).toFixed(1)}）`)
  check('全員がOVR70未満', max < 70, `いちばん高い ${max}`)
  check('ちゃんと選手になっている（年俸・所属・IDがある）',
    add.every(p => p.teamId === team.id && p.contract.annualSalary > 0 && !!p.id))
  check('IDが重ならない', new Set(add.map(p => p.id)).size === add.length)
  check('若手として入る（19〜22歳）', add.every(p => p.age >= 19 && p.age <= 22))
}

console.log(`\n[3] 埋めたあとは開幕できる`)
{
  // 人数以外の用件（カード・ドラフト）は済ませた状態で見る
  const before = { campDone: true, draftDone: true, rosterCount: 11 }
  check('11人のままでは開幕できない', !canStartSeason(before))
  const add = fillRosterToMin(team, 2030, worldOf(11))
  check('埋めたあとは開幕できる',
    canStartSeason({ ...before, rosterCount: 11 + add.length }))
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
