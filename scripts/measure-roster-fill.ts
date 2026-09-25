/**
 * 【計測】選手が世界に入ってくる口を変えるときに、世界を数年回して
 *   名簿の人数・年齢・OVRの分布が崩れないか（痩せる・老ける・インフレ／デフレ）を見る。
 *   npx esbuild --bundle --platform=node --format=cjs --log-level=error --loader:.png=dataurl scripts/measure-roster-fill.ts --outfile=/tmp/mrf.cjs && node -r ./scripts/ls-shim.cjs /tmp/mrf.cjs [年数]
 *
 * 新しいゲームを本物の手順（startSetup → 初回ドラフト → 開幕）で作り、毎年
 *   自分の部の全戦を走る（CPU・海外の成長はレースごとに配られるので、走らないと誰も育たない）
 *   → endSeason → ドラフト → 開幕
 * を回す。数えるのは**開幕した時点**。入口の関数名を使っていないので、入口を変える前と
 * 後のコードで同じまま走る（git stash で前のコードを組んで並べて比べる）。
 * 種は MRF_SEED で振り直せる。
 */
let rngSeed = Number(process.env.MRF_SEED ?? 20260925)
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

import { useGameStore } from '../src/store/gameStore'
import { assignLineupByTerrain } from '../src/engine/raceEngine'
import { myLeagueRaces, clubsWhere, isJpelLeague } from '../src/utils/world'
import { divisionOf } from '../src/utils/league'
import { ovr } from '../src/utils/playerUtils'
import type { Player, WorldClub } from '../src/types'

const YEARS = Number(process.argv[2] ?? 6)
const g = () => useGameStore.getState()

const runDraft = () => {
  for (let i = 0; i < 400 && g().draftState && !g().draftState!.isComplete; i++) {
    const st = g()
    const cur = st.draftState!.pickOrder[st.draftState!.currentPick]
    if (cur === st.playerTeamId) {
      const top = [...st.draftState!.pool].filter(p => p.teamId === '__pool__' || !p.teamId).sort((a, b) => ovr(b) - ovr(a))[0]
      if (top) st.playerPick(top.id); else st.cpuPick()
    } else st.cpuPick()
  }
  g().advanceDraft()
}

const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0 }
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)

function snapshot(label: string) {
  const st = g()
  const act = st.players.filter(p => p.status !== 'retired' && p.teamId && p.teamId !== '__pool__')
  const byClub = new Map<string, Player[]>()
  for (const p of act) { const l = byClub.get(p.teamId); if (l) l.push(p); else byClub.set(p.teamId, [p]) }
  const groups: [string, (c: WorldClub) => boolean][] = [
    ['1部', c => isJpelLeague(c.leagueId) && divisionOf(c) === 1],
    ['2部', c => isJpelLeague(c.leagueId) && divisionOf(c) === 2],
    ['3部', c => isJpelLeague(c.leagueId) && divisionOf(c) === 3],
    ['海外', c => !isJpelLeague(c.leagueId)],
  ]
  const rows: string[] = []
  for (const [name, pred] of groups) {
    const cs = clubsWhere(st.clubs, pred)
    const sizes = cs.map(c => (byClub.get(c.id) ?? []).length)
    const ps = cs.flatMap(c => byClub.get(c.id) ?? [])
    const ages = ps.map(p => p.age)
    const ovrs = ps.map(p => ovr(p))
    rows.push(`${name} 人数 中央${pct(sizes, 0.5)} 最小${Math.min(...sizes)} 20未満${sizes.filter(n => n < 20).length}`
      + ` ｜ 年齢 平均${mean(ages).toFixed(1)} 23以下${(100 * ages.filter(a => a <= 23).length / ages.length).toFixed(0)}% 30以上${(100 * ages.filter(a => a >= 30).length / ages.length).toFixed(0)}%`
      + ` ｜ OVR 平均${mean(ovrs).toFixed(1)} 上位10%${pct(ovrs, 0.9)}`)
  }
  const all = act.map(p => ovr(p))
  const fa = st.players.filter(p => p.status !== 'retired' && p.teamId === '').length
  const newThisYear = act.filter(p => p.joinedYear === st.currentSeason.year && p.yearsPro === 0).length
  // 開幕の床で足された人（IDの頭が `fill-<年>-`）。前と後のコードで同じ頭を使う
  const filled = act.filter(p => p.id.startsWith(`fill-${st.currentSeason.year}-`))
  const filledOvr = filled.map(p => ovr(p))
  console.log(`\n[${label}] ${st.currentSeason.year}年 開幕  在籍 ${act.length}人（FA ${fa}人）  OVR85+ ${all.filter(v => v >= 85).length} / 90+ ${all.filter(v => v >= 90).length}  今年入った新人 ${newThisYear}人`
    + `  床で足した ${filled.length}人${filled.length ? `（OVR 平均${mean(filledOvr).toFixed(1)} 最高${Math.max(...filledOvr)}）` : ''}`)
  for (const r of rows) console.log('   ' + r)
}

// ── 新しいゲーム（本物の手順）──
g().startSetup({ teamName: '計測', teamShortName: '計測', teamId: 'tokyo', gmName: 'GM' })
g().beginInauguralDraft()
runDraft()
g().startRegularSeason()
snapshot('0年目')

for (let y = 1; y <= YEARS; y++) {
  const races = myLeagueRaces(g().currentSeason, g().playerTeamId)
  for (let i = g().currentSeason.currentRaceIndex; i < races.length; i++) {
    const st = g()
    const race = myLeagueRaces(st.currentSeason, st.playerTeamId)[st.currentSeason.currentRaceIndex]
    if (!race) break
    const roster = st.players.filter(p => p.teamId === st.playerTeamId && p.status === 'active')
    st.runRace(assignLineupByTerrain(roster, race))
  }
  g().endSeason()
  g().beginSeasonDraft()
  runDraft()
  g().startRegularSeason()
  snapshot(`${y}年目`)
}
