/**
 * 【記録会の系統】日本のリーグのクラブは日本の記録会、海外リーグのクラブは海外の記録会を走る
 *
 *   npx esbuild --bundle --platform=node --format=cjs --loader:.png=dataurl scripts/check-time-trial-circuit.ts \
 *     --outfile=node_modules/.cache/check-ttc.cjs --log-level=error \
 *     && node -r ./scripts/ls-shim.cjs node_modules/.cache/check-ttc.cjs
 *
 * ■仕様（オーナー・2026-09-25）
 *   海外リーグの選手は、日本だけの3本（04-26 10000m・05-24 ハーフ・10-18 5000m）と
 *   **同じ日・同じ距離**の、海外リーグのクラブの選手だけが走る記録会を走る。
 *   誰がどちらを走るかは**選手のクラブのリーグ**で決まる（自チームが海外クラブならそちら）。
 *   判定は `data/races` の `entersTimeTrial` 1本（系統はリーグの決まり `timeTrials`）。
 *   記録（世界記録・日本記録・自己ベスト）は距離で分かれる同じ表に入る。
 *
 * ■世界の作り方
 *   startSetup → 初回ドラフト → 開幕 → 1年（記録会は画面と同じ `getDueIndividualEvent` で
 *   回ってきたものを開く）。そのあと `check-gm-foreign` と同じ本物の就任の道で海外クラブの
 *   監督になり、もう1年回す。
 *
 * ■見ること（1年ごと）
 *   [1] 一覧（データ）：日本だけの3本に、同じ日・同じ距離の海外の1本がある
 *   [2] 自チームに回ってくる記録会は、自チームの系統の7本だけ
 *   [3] 回ってこない側も同じ日に開かれる（10本すべてに結果がある）
 *   [4] 走った人は、所属クラブのリーグがその記録会に出る人だけ（無所属は走らない）
 *   [5] 自チームの選手は自分の系統だけを走る。記録会を走った人は、同じ日のもう1本の「休み」で
 *       回復しない（走ったぶん疲れるだけ）
 *   [6] CPU同士の市場は日付ごとに1回（同じ日に2本開いても2回回さない）
 *   [7] 記録は同じ表：世界記録はその距離の全結果（両方の系統）より遅くない
 *
 * ■壊して確かめたこと
 *   ・`entersTimeTrial` を常に true にする                  → [4][5]
 *   ・`simulateIndividualEvent` の同じ日の記録会を開かない   → [3]
 *   ・同じ日の記録会ごとに `runCpuMarketRound` を回す        → [6]
 *   ・`getDueIndividualEvent` で系統を見ない                 → [2]
 *   ・海外の3本を一覧から消す                                → [1][3]
 *   ・休んで回復する人を「この記録会を走らなかった全員」に戻す → [5]
 */
let rngSeed = 20260925
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { useGameStore } from '../src/store/gameStore'
import { assignLineupByTerrain } from '../src/engine/raceEngine'
import { clubById, isJpelLeague, myLeagueId, myLeagueRaces } from '../src/utils/world'
import { getDueIndividualEvent, eventDistKey } from '../src/utils/eventTime'
import { TIME_TRIALS, entersTimeTrial } from '../src/data/races'
import { leagueRules } from '../src/data/leagueRules'
import { appraiseGmInvite } from '../src/utils/gmInvite'
import { timeTrialFatigueGain } from '../src/engine/timeTrial'
import { ovr, retirementAgeOf } from '../src/utils/playerUtils'
import type { IndividualEvent } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}
const g = () => useGameStore.getState()

console.log('[0] 系統の手書きの表が残っていない（判定は entersTimeTrial 1本）')
{
  const files: string[] = []
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p) } }
  walk('src')
  // コメントを外してから見る（経緯の説明文に旧い名前が出てくるため）
  const all = files.map(f => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).join('\n')
  check('FOREIGN_TT_KEYS が無い', !/FOREIGN_TT_KEYS/.test(all))
  check('記録会の ID の頭で系統を見ていない', !/event\.id\.startsWith\(/.test(all))
  const tt = readFileSync('src/engine/timeTrial.ts', 'utf8')
  check('出る側かは timeTrialFieldOf 1本（中身は entersTimeTrial）', /export function timeTrialFieldOf\([\s\S]{0,200}entersTimeTrial\(event\.id, leagueOf\.get\(teamId\)\)/.test(tt))
  const race = readFileSync('src/store/slices/raceSlice.ts', 'utf8')
  check('走る人（timeTrialRunners）も休む人（記録会の開催）も timeTrialFieldOf を通る',
    /inField\(p\.teamId\)/.test(tt) && /status === 'active' && inField\(p\.teamId\)/.test(race))
}

console.log('\n[1] 一覧（データ）：日本だけの記録会には、同じ日・同じ距離の海外の記録会がある')
{
  const japanOnly = TIME_TRIALS.filter(t => t.circuits.length === 1 && t.circuits[0] === 'japan')
  const overseasOnly = TIME_TRIALS.filter(t => t.circuits.length === 1 && t.circuits[0] === 'overseas')
  check('日本だけの記録会は3本', japanOnly.length === 3, `${japanOnly.length}本`)
  check('海外だけの記録会は3本', overseasOnly.length === 3, `${overseasOnly.length}本`)
  for (const j of japanOnly) {
    check(`${j.date} ${j.distance}m に海外の1本がある`,
      overseasOnly.some(o => o.date === j.date && o.distance === j.distance))
  }
  // どの系統にも、どの日にも1本ずつ（＝どのクラブも年に同じ本数を走る）
  const dates = [...new Set(TIME_TRIALS.map(t => t.date))]
  for (const c of ['japan', 'overseas'] as const) {
    const per = dates.map(d => TIME_TRIALS.filter(t => t.date === d && t.circuits.includes(c)).length)
    check(`${c}：どの日も1本ずつ（年${dates.length}本）`, per.every(n => n === 1), per.join(','))
  }
  check('キーが重ならない', new Set(TIME_TRIALS.map(t => t.key)).size === TIME_TRIALS.length)
  check('日本のリーグは日本の系統・海外は海外の系統',
    leagueRules('jpel-1').timeTrials === 'japan' && leagueRules('jpel-3').timeTrials === 'japan'
    && leagueRules('asia_league').timeTrials === 'overseas')
  check('無所属（リーグ無し）はどの記録会にも出ない', TIME_TRIALS.every(t => !entersTimeTrial(`${t.key}-2030`, undefined)))
}

const runDraft = () => {
  for (let i = 0; i < 400 && g().draftState && !g().draftState!.isComplete; i++) {
    const st = g()
    const cur = st.draftState!.pickOrder[st.draftState!.currentPick]
    const top = [...st.draftState!.pool].filter(p => p.teamId === '__pool__' || !p.teamId).sort((a, b) => ovr(b) - ovr(a))[0]
    if (cur === st.playerTeamId && top) st.playerPick(top.id); else st.cpuPick()
  }
  g().advanceDraft()
}

/** CPU同士の市場を回した日付を数える（本編の1戦からも呼ばれる） */
let marketDates: string[] = []
const watchMarket = () => {
  const orig = g().runCpuMarketRound
  useGameStore.setState({ runCpuMarketRound: (d: string) => { marketDates.push(d); orig(d) } } as never)
}

/** 同じ日のもう1本の「休み」で回復してしまった人 */
let fatigueWrong: string[] = []

/** 画面と同じ道で1年回す：回ってきた記録会を開いてから本編の1戦 */
const runSeasonWithTT = () => {
  const due: IndividualEvent[] = []
  const openDue = () => {
    for (let k = 0; k < 20; k++) {
      const st = g()
      const ev = getDueIndividualEvent(st.currentSeason, myLeagueRaces(st.currentSeason, st.playerTeamId), myLeagueId(st.currentSeason, st.playerTeamId))
      if (!ev) break
      due.push(ev)
      const before = new Map(st.players.map(p => [p.id, p.fatigue ?? 0]))
      st.simulateIndividualEvent(ev.id)
      // 同じ日のどれかを走った人は、走ったぶん疲れるだけ（もう1本の「休み」で回復していない）
      const day = (g().currentSeason.individualEvents ?? []).filter(e => e.date === ev.date)
      const ran = new Map(day.flatMap(e => (e.results ?? []).map(r => [r.playerId, e.distance] as const)))
      for (const p of g().players) {
        const d = ran.get(p.id)
        if (d == null || !before.has(p.id)) continue
        if ((p.fatigue ?? 0) !== Math.min(100, before.get(p.id)! + timeTrialFatigueGain(d))) fatigueWrong.push(`${ev.date}:${p.id}`)
      }
    }
  }
  for (let i = 0; i < 20; i++) {
    openDue()
    const st = g()
    const race = myLeagueRaces(st.currentSeason, st.playerTeamId)[st.currentSeason.currentRaceIndex]
    if (!race) break
    st.runRace(assignLineupByTerrain(st.players.filter(p => p.teamId === st.playerTeamId && p.status === 'active'), race))
  }
  openDue()
  return due
}

/** その年の記録会を見る */
const inspectYear = (label: string, due: IndividualEvent[]) => {
  const st = g()
  const me = st.playerTeamId
  const myLeague = myLeagueId(st.currentSeason, me)
  const myCircuit = leagueRules(myLeague).timeTrials
  const events = st.currentSeason.individualEvents ?? []
  console.log(`\n── ${label}（${st.currentSeason.year}年・自チーム ${clubById(st.clubs, me)?.shortName}／${myLeague}・${myCircuit}）`)

  console.log('[2] 自チームに回ってくる記録会は、自分の系統の7本だけ')
  check('回ってきたのは7本', due.length === 7, `${due.length}本`)
  check('全部が自分の系統', due.every(e => entersTimeTrial(e.id, myLeague)), due.map(e => e.id).join(','))

  console.log('[3] 回ってこない側も同じ日に開かれる')
  check(`${events.length}本すべてに結果がある`, events.length === TIME_TRIALS.length && events.every(e => !!e.results),
    events.filter(e => !e.results).map(e => e.id).join(','))

  console.log('[4] 走った人は、所属クラブのリーグがその記録会に出る人だけ')
  const leagueOf = new Map(st.clubs.map(c => [c.id, c.leagueId]))
  const wrong: string[] = []
  for (const e of events) {
    for (const r of e.results ?? []) {
      if (!r.teamId || r.teamId === '__pool__') { if (!entersTimeTrial(e.id, 'jpel-1')) wrong.push(`${e.id}:候補${r.playerId}`); continue }
      if (!entersTimeTrial(e.id, leagueOf.get(r.teamId))) wrong.push(`${e.id}:${r.teamId}`)
    }
  }
  check('系統の違う人が走っていない', wrong.length === 0, wrong.slice(0, 5).join(','))
  for (const e of events) {
    const teams = (e.results ?? []).filter(r => r.teamId && r.teamId !== '__pool__').map(r => leagueOf.get(r.teamId))
    const jp = teams.filter(l => isJpelLeague(l)).length, os = teams.filter(l => l && !isJpelLeague(l)).length
    const def = TIME_TRIALS.find(t => e.id.startsWith(`${t.key}-`))!
    const want = { japan: def.circuits.includes('japan'), overseas: def.circuits.includes('overseas') }
    check(`${e.name}：日本${jp}人・海外${os}人`, (jp > 0) === want.japan && (os > 0) === want.overseas)
  }

  console.log('[5] 自チームの選手は自分の系統だけを走る')
  const mineIn = events.filter(e => (e.results ?? []).some(r => r.teamId === me))
  check('自分の系統の記録会では走っている', due.every(e => mineIn.some(m => m.id === e.id)), due.filter(e => !mineIn.some(m => m.id === e.id)).map(e => e.id).join(','))
  check('ほかの系統の記録会では走っていない', mineIn.every(e => entersTimeTrial(e.id, myLeague)), mineIn.map(e => e.id).join(','))

  check('記録会を走った人は走ったぶん疲れるだけ（同じ日のもう1本で休み扱いにならない）', fatigueWrong.length === 0,
    `${fatigueWrong.length}人 ${fatigueWrong.slice(0, 3).join(',')}`)
  fatigueWrong = []

  console.log('[6] CPU同士の市場は日付ごとに1回')
  const dates = [...new Set(events.map(e => e.date))]
  // 本編の1戦の日にも市場は回るので、記録会の日だけを数える（記録会は本編と同じ日にしない決まり）
  const thisYear = marketDates.filter(d => dates.includes(d))
  check(`記録会の日の市場は${dates.length}回`, thisYear.length === dates.length && new Set(thisYear).size === thisYear.length,
    `${thisYear.length}回 ${thisYear.join(',')}`)

  console.log('[7] 記録は同じ表（距離ごと）')
  for (const e of events.filter(x => x.results?.length)) {
    const key = eventDistKey(e.distance)
    const wr = st.worldRecords?.[key]?.timeSec ?? Infinity
    check(`${e.name}：世界記録（${key}）はこの記録会の1位より遅くない`, wr <= e.results![0].timeSec)
  }
  const os = events.find(e => (TIME_TRIALS.find(t => e.id.startsWith(`${t.key}-`))?.circuits ?? []).join() === 'overseas' && e.results?.length)
  if (os) {
    const r = os.results![0]
    const p = st.players.find(x => x.id === r.playerId)
    check(`海外の記録会の1位の自己ベスト（${eventDistKey(os.distance)}）に入っている`,
      (p?.eventBests?.[eventDistKey(os.distance)]?.timeSec ?? Infinity) <= r.timeSec)
  }
}

// ── 1年目：日本のクラブ ──
g().startSetup({ teamName: '点検', teamShortName: '点検', teamId: 'tokyo', gmName: 'GM' })
g().beginInauguralDraft()
runDraft()
g().startRegularSeason()
watchMarket()
inspectYear('日本のクラブ', runSeasonWithTT())

// ── 海外クラブの監督になる（check-gm-foreign と同じ本物の道）──
{
  const st = g()
  const lid = myLeagueId(st.currentSeason, st.playerTeamId)!
  const lg = st.currentSeason.leagues[lid]
  const top = Math.max(...lg.standings.map(r => r.totalPoints)) + 1
  useGameStore.setState({ currentSeason: { ...st.currentSeason, leagues: { ...st.currentSeason.leagues,
    [lid]: { ...lg, standings: lg.standings.map(r => (r.teamId === st.playerTeamId ? { ...r, totalPoints: top } : r)) } } } } as never)
  useGameStore.setState({ gmTenures: (g().gmTenures ?? []).map(t => (t.toYear == null ? { ...t, fromYear: g().currentSeason.year - 5 } : t)) } as never)
}
const homeId = g().playerTeamId
g().resignAsGm()
const foreignOffer = (g().gmOffers ?? []).find(o => !isJpelLeague(clubById(g().clubs, o.teamId)?.leagueId))
check('海外クラブからの打診が届いている（就任の道を通れる）', !!foreignOffer)
const destId = foreignOffer?.teamId ?? ''
const ctx = () => ({ players: g().players, clubs: g().clubs, currentSeason: g().currentSeason,
  fromTeamId: homeId, destinationOf: g().destinationOf, playerTierOf: g().playerTierOf })
const willing = g().players
  .filter(p => p.teamId === homeId && p.status === 'active' && p.contract.yearsLeft >= 2 && p.age + 1 < retirementAgeOf(p))
  .sort((a, b) => ovr(b) - ovr(a))
  .find(p => destId && appraiseGmInvite(ctx(), p.id, destId)?.ok)
g().acceptGmOffer(destId, willing?.id)
g().endSeason()
check('海外クラブの監督になった', g().playerTeamId === destId && !isJpelLeague(myLeagueId(g().currentSeason, g().playerTeamId)))
g().beginSeasonDraft()
runDraft()
g().startRegularSeason()

// ── 2年目：海外クラブ ──
inspectYear('海外クラブ', runSeasonWithTT())

if (problems.length) {
  console.log(`\n  → NG ${problems.length}件`)
  process.exit(1)
}
console.log('\n  → OK')
