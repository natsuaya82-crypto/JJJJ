/**
 * 【通算のMVP回数】遊んでいる最中（endSeason が足す）と、読み込み直したあと（withCareerCounts が
 * 保存してあるレース結果から数え直す）で、同じ数になること
 *
 * ■なぜ要るのか
 *   年度MVPはリーグごと（12リーグ・utils/awards）。読み込み時の数え直し（careerCountsOf →
 *   seasonAwardsOf）は12リーグ全部の受賞者を数えるのに、endSeason は**自分のリーグの受賞者だけ**を
 *   足していた。遊んでいる間はほかのリーグのMVPが0回のまま、再起動すると回数が増える、という
 *   食い違いになっていた。いまは endSeason も `seasonMvpIds`（全リーグ）を足す。
 *
 * ■見ること（2年回す）
 *   [1] 全リーグの受賞者が居る（2リーグ以上）＝自分のリーグだけの網では通らない世界
 *   [2] 全選手の career.mvpAwards が、withCareerCounts で数え直した値と一致する
 *
 * ■壊して確かめたこと
 *   ・seasonSlice で seasonMvpIds の代わりに自分のリーグの受賞者1人だけを渡す → [2]
 */
let rngSeed = 20260928
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

import { useGameStore } from '../src/store/gameStore'
import { assignLineupByTerrain } from '../src/engine/raceEngine'
import { myLeagueRaces } from '../src/utils/world'
import { ovr } from '../src/utils/playerUtils'
import { seasonAwardsOf } from '../src/utils/awards'
import { withCareerCounts } from '../src/utils/careerStats'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}
const g = () => useGameStore.getState()

const runDraft = () => {
  for (let i = 0; i < 400 && g().draftState && !g().draftState!.isComplete; i++) {
    const st = g()
    const cur = st.draftState!.pickOrder[st.draftState!.currentPick]
    const top = [...st.draftState!.pool].filter(p => p.teamId === '__pool__' || !p.teamId).sort((a, b) => ovr(b) - ovr(a))[0]
    if (cur === st.playerTeamId && top) st.playerPick(top.id); else st.cpuPick()
  }
  g().advanceDraft()
}
const runSeason = () => {
  for (let i = 0; i < 20; i++) {
    const st = g()
    const race = myLeagueRaces(st.currentSeason, st.playerTeamId)[st.currentSeason.currentRaceIndex]
    if (!race) break
    st.runRace(assignLineupByTerrain(st.players.filter(p => p.teamId === st.playerTeamId && p.status === 'active'), race))
  }
}

g().startSetup({ teamName: '点検', teamShortName: '点検', teamId: 'tokyo', gmName: 'GM' })
g().beginInauguralDraft()
runDraft()
g().startRegularSeason()

for (let year = 1; year <= 2; year++) {
  runSeason()
  g().endSeason()
  const st = g()
  console.log(`\n── ${year}年目の終わり`)
  const awards = seasonAwardsOf(st.pastSeasons as never, st.players, st.removedPlayers)
  const mvpLeagues = new Set(awards.filter(a => a.mvpId).map(a => a.leagueId))
  check('[1] 2リーグ以上にMVPが居る', mvpLeagues.size >= 2, `${mvpLeagues.size}リーグ`)
  const recount = withCareerCounts(st.players, st.pastSeasons as never, st.currentSeason as never, st.removedPlayers)
  const byId = new Map(recount.map(p => [p.id, p]))
  const wrong = st.players.filter(p => (p.career?.mvpAwards ?? 0) !== (byId.get(p.id)?.career?.mvpAwards ?? 0))
  const total = st.players.reduce((s, p) => s + (p.career?.mvpAwards ?? 0), 0)
  check(`[2] 遊んでいる最中のMVP回数（合計${total}）が数え直しと一致する`, wrong.length === 0,
    `${wrong.length}人 ${wrong.slice(0, 3).map(p => `${p.id}:${p.career?.mvpAwards}→${byId.get(p.id)?.career?.mvpAwards}`).join(',')}`)
  if (year < 2) {
    g().beginSeasonDraft()
    runDraft()
    g().startRegularSeason()
  }
}

if (problems.length) {
  console.log(`\n  → NG ${problems.length}件`)
  process.exit(1)
}
console.log('\n  → OK')
