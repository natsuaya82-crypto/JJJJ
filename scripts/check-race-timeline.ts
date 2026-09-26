/**
 * 中継の時計（`engine/raceTimeline`）の網。
 *
 * ■なぜ要るのか
 *   中継は**画面から見て初めて通る**ので golden からは1行も届かない。
 *   以前の棒グラフは区間ごとに全チームを同時に走り出させていた（区間の頭で全員が横一線に戻る）。
 *   いまは「タスキをつないで途切れずに走る」＝先頭は後ろより先の区間を走っている。
 *   棒グラフも 2.0.9 の3Dもこの1本だけを読むので、ここが嘘をつくと両方が嘘になる。
 *
 * ■何を守るか
 *   [1] 時刻0で全員がスタート地点
 *   [2] 時刻が進むと位置が単調に進む
 *   [3] タスキの受け渡しで次の区間に切り替わる／先頭は先の区間にいる
 *   [4] 最後の時刻で総合の並びが最終結果（`buildTeamRankings`）と一致する（同着も含めて）
 *   [5] 区間の途中でタイムが変わっても位置が跳ばない（残りの距離だけ速さが変わる）
 *   [6] 総合の差・区間の差が定義どおり
 *   [7] 画面がこの1本を読んでいる（位置を画面で計算しない・CPU のタイムはレースの頭で出す）
 *
 * ■壊して確かめたこと（全部が落ちた）
 *   ・`buildTimeline` で区間の頭を毎回 0 に戻す（＝全員同時スタートに戻す）  → [1][3][5][6] が落ちる
 *   ・`withNewLegTime` で `via` を捨てる（＝跳ぶ形にする）                   → [5] が落ちる
 *   ・並びの同着を teamId 順にする                                          → [4] が落ちる
 *   ・総合の差を「総合タイムの差」（先頭が通った時刻を見ない）にする         → [6] が落ちる
 *   ・区間の差を「その地点に着いたチームだけ」と比べる形にする              → [6] が落ちる
 */
import { readFileSync } from 'node:fs'
import {
  buildTimeline, legBoardAt, legEndAt, runnerAt, snapshotAt, withNewLegTime,
  type TimelineTeam,
} from '../src/engine/raceTimeline'
import { buildTeamRankings } from '../src/engine/raceEngine'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

// 決まった乱数（点検のたびに同じ世界）
let seed = 12345
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }

const DIST = [21.3, 8.1, 11.9, 15.0, 11.6, 20.8]
/** 20チーム。タイムは整数秒で狭い幅に寄せて、同着をわざと起こす */
function makeTeams(): TimelineTeam[] {
  return Array.from({ length: 20 }, (_, i) => ({
    teamId: `t${String(19 - i).padStart(2, '0')}`,   // teamId 順と渡す順を逆にしておく
    legs: DIST.map(d => ({ time: Math.round(d * 170 + rnd() * 6) })),
  }))
}

// ── [1] 時刻0 ──
{
  const tl = buildTimeline(DIST, makeTeams())
  const s = snapshotAt(tl, 0)
  check('[1] 時刻0で全員がスタート地点', s.overall.every(r => r.leg === 0 && r.km === 0 && r.raceKm === 0 && r.gap === 0))
}

// ── [2] 単調 ──
{
  const tl = buildTimeline(DIST, makeTeams())
  let bad = 0
  const prev = new Map<string, number>()
  for (let t = 0; t <= tl.endTime + 10; t += 7.3) {
    for (const r of snapshotAt(tl, t).overall) {
      if ((prev.get(r.teamId) ?? 0) > r.raceKm + 1e-9) bad++
      prev.set(r.teamId, r.raceKm)
    }
  }
  check('[2] 時刻が進むと位置が単調に進む', bad === 0, `${bad}件 戻った`)
}

// ── [3] タスキの受け渡し ──
{
  const fast: TimelineTeam = { teamId: 'fast', legs: [{ time: 1000 }, { time: 500 }, { time: 900 }] }
  const slow: TimelineTeam = { teamId: 'slow', legs: [{ time: 1200 }, { time: 600 }, { time: 1000 }] }
  const tl = buildTimeline([10, 5, 9], [fast, slow])
  const at999 = runnerAt(tl, 'fast', 999)!, at1001 = runnerAt(tl, 'fast', 1001)!
  check('[3] 区間を走り終えた瞬間に次の区間へ', at999.leg === 0 && at1001.leg === 1 && near(at1001.km, 5 / 500), `${at999.leg}→${at1001.leg} ${at1001.km}`)
  check('[3] 区間の終わりの時刻', legEndAt(tl, 'fast', 1) === 1500 && legEndAt(tl, 'slow', 2) === 2800)
  const s = snapshotAt(tl, 1100)
  const f = s.overall.find(r => r.teamId === 'fast')!, sl = s.overall.find(r => r.teamId === 'slow')!
  check('[3] 先頭は後ろのチームより先の区間を走っている', f.leg === 1 && sl.leg === 0, `fast ${f.leg}区 / slow ${sl.leg}区`)
  const g = buildTimeline(DIST, makeTeams())
  let spread = 0
  for (let t = 0; t < g.endTime; t += 30) {
    const legs = new Set(snapshotAt(g, t).overall.map(r => r.leg))
    if (legs.size > 1) spread++
  }
  check('[3] 20チームでも区間をまたいで散らばる時刻がある', spread > 0)
}

// ── [4] 最後の時刻＝最終結果 ──
{
  let mismatch = 0, ties = 0
  for (let n = 0; n < 200; n++) {
    const teams = makeTeams()
    const tl = buildTimeline(DIST, teams)
    const cumTime: Record<string, number> = {}
    const segCount: Record<string, number> = {}
    for (const tm of teams) {
      cumTime[tm.teamId] = tm.legs.reduce((a, l) => a + (l?.time ?? 0), 0)
      segCount[tm.teamId] = DIST.length
    }
    const totals = Object.values(cumTime)
    if (new Set(totals).size < totals.length) ties++
    const want = buildTeamRankings({ teamIds: Object.keys(cumTime), cumTime, segCountByTeam: segCount, segPts: {}, totalSegs: DIST.length })
      .map(r => r.teamId).join(',')
    const got = snapshotAt(tl, tl.endTime).overall.map(r => r.teamId).join(',')
    if (want !== got) mismatch++
  }
  check('[4] 同着の起きる世界を用意できている', ties > 20, `${ties}回`)
  check('[4] 最後の時刻で総合の並びが最終結果と一致', mismatch === 0, `${mismatch}/200 回ずれた`)
  const tl = buildTimeline(DIST, makeTeams())
  check('[4] 最後の時刻で全員が止まっている', snapshotAt(tl, tl.endTime).done && snapshotAt(tl, tl.endTime).overall.every(r => r.finished))
}

// ── [5] 途中でタイムが変わっても跳ばない ──
{
  const teams = makeTeams()
  const tl = buildTimeline(DIST, teams)
  const id = teams[3].teamId
  const leg = 2
  const start = legEndAt(tl, id, leg - 1)!
  const tC = start + teams[3].legs[leg]!.time * 0.4
  const before = runnerAt(tl, id, tC)!
  const newTime = teams[3].legs[leg]!.time - 40
  const changed = withNewLegTime(tl, id, leg, tC, newTime)!
  const tl2 = buildTimeline(DIST, teams.map(t => t.teamId !== id ? t : { ...t, legs: t.legs.map((l, j) => j === leg ? changed : l) }))
  const after = runnerAt(tl2, id, tC)!
  check('[5] タイムが変わった瞬間の位置が同じ', near(before.raceKm, after.raceKm), `${before.raceKm} → ${after.raceKm}`)
  check('[5] 区間の終わりは新しいタイムどおり', legEndAt(tl2, id, leg) === start + newTime)
  const slow1 = runnerAt(tl, id, tC + 60)!.raceKm - before.raceKm
  const fast1 = runnerAt(tl2, id, tC + 60)!.raceKm - after.raceKm
  check('[5] そこから先だけ速くなる', fast1 > slow1, `${slow1} / ${fast1}`)
  const earlier = runnerAt(tl2, id, start + 10)!.raceKm === runnerAt(tl, id, start + 10)!.raceKm
  check('[5] それより前の位置は変わらない', earlier)
  // 同じ区間でもう一度変わっても跳ばない
  const t2 = tC + 100
  const b2 = runnerAt(tl2, id, t2)!
  const changed2 = withNewLegTime(tl2, id, leg, t2, newTime + 25)!
  const tl3 = buildTimeline(DIST, teams.map(t => t.teamId !== id ? t : { ...t, legs: t.legs.map((l, j) => j === leg ? changed2 : l) }))
  check('[5] 2回目の変化でも跳ばない', near(b2.raceKm, runnerAt(tl3, id, t2)!.raceKm) && near(after.raceKm, runnerAt(tl3, id, tC)!.raceKm))
}

// ── [6] 差の定義 ──
{
  // 一定の速さ。先頭 100秒/10km、2番手 110秒/10km
  const tl = buildTimeline([10, 10], [
    { teamId: 'a', legs: [{ time: 100 }, { time: 100 }] },
    { teamId: 'b', legs: [{ time: 110 }, { time: 89 }] },
    { teamId: 'c', legs: [{ time: 120 }, { time: 95 }] },
  ])
  const s = snapshotAt(tl, 50)
  const b = s.overall.find(r => r.teamId === 'b')!
  // b は 50/110*10 km。先頭 a はそこを 50/110*100 秒に通った
  check('[6] 総合の差＝先頭がその地点を通ってからの秒', s.overall[0].teamId === 'a' && near(b.gap, 50 - 5000 / 110), `${b.gap}`)
  const end = snapshotAt(tl, tl.endTime).overall
  check('[6] ゴール後の総合の差＝総合タイムの差', end.map(r => `${r.teamId}${r.gap}`).join(' ') === 'b0 a1 c16', end.map(r => `${r.teamId}${r.gap}`).join(' '))
  // 区間（2区）：走り終えたら区間タイムの差
  const board = legBoardAt(tl, tl.endTime, 1)
  check('[6] 区間の差＝区間タイムの差（走り終えたら）', board.map(r => `${r.teamId}${r.gap}`).join(' ') === 'b0 c6 a11', board.map(r => `${r.teamId}${r.gap}`).join(' '))
  // 途中（t=150）：a は2区の 50 秒で 5km（10秒/km）、b は 40 秒で 4.49km（8.9秒/km）、c は 30 秒で 3.16km（9.5秒/km）。
  // いちばん速いペースは b。a は 5km に 50 秒＝b なら 44.5 秒 → +5.5。c は 3.16km に 30 秒＝b なら 28.1 秒 → +1.9
  // ★前にいる a を1位にしないこと（その地点に着いたチームだけと比べると、先頭は必ず1位になる）
  const mid = legBoardAt(tl, 150, 1)
  check('[6] 区間の差（途中）＝同じ地点まで、いちばん速いペースとの差',
    mid.map(r => r.teamId).join('') === 'bca' && near(mid[0].gap!, 0) && near(mid[1].gap!, 30 - 8.9 * (300 / 95)) && near(mid[2].gap!, 5.5),
    mid.map(r => `${r.teamId}${r.gap}`).join(' '))
  check('[6] まだその区間に入っていないチームは差が無い', legBoardAt(tl, 105, 1).find(r => r.teamId === 'c')!.gap === null)
}

// ── [7] 画面がこの1本を読んでいる ──
{
  const engine = readFileSync('src/engine/raceTimeline.ts', 'utf8')
  const sim = readFileSync('src/components/race/SimPhase.tsx', 'utf8')
  const page = readFileSync('src/components/race/RacePage.tsx', 'utf8')
  const online = readFileSync('src/components/online/RacePanel.tsx', 'utf8')
  const panel = readFileSync('src/components/shared/RaceSimPanel.tsx', 'utf8')
  check('[7] raceTimeline は React も store も import しない', !/from ['"](react|\.\.\/store)/.test(engine))
  check('[7] 旧い位置の計算（calcRunnerPositions）が戻っていない',
    ![sim, page, online, panel].some(s => s.includes('calcRunnerPositions') || s.includes('kmRatio')))
  check('[7] 棒グラフは raceTimeline から位置と差を読む', /snapshotAt\(/.test(sim) && /legBoardAt\(/.test(sim))
  check('[7] 本編・オンライン・大会の中継が同じ時計を通る',
    [page, online, panel].every(s => s.includes('buildTimeline(')) && online.includes('useRaceClock('))
  check('[7] CPU の区間タイムはレースの頭で全区間ぶん出す（呼ぶのは1か所）',
    (page.match(/calcCpuTimesForSeg\(/g) ?? []).length === 1 && page.includes('cpuTimesBySeg: cpuTimesByRace('))
}

console.log(failed === 0 ? '✓ 中継の時計: OK' : `✗ ${failed}件`)
process.exit(failed === 0 ? 0 : 1)
