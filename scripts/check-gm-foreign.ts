/**
 * 【海外クラブの監督になる】本物の手順で世界を作って、就任してから1年走り切るまでを確かめる。
 *
 *   npx esbuild --bundle --platform=node --format=cjs --loader:.png=dataurl scripts/check-gm-foreign.ts \
 *     --outfile=node_modules/.cache/check-gmf.cjs --log-level=error \
 *     && node -r ./scripts/ls-shim.cjs node_modules/.cache/check-gmf.cjs
 *
 * ■仕様（オーナー・2026-09-25）
 *   監督オファーは自チーム以外の231クラブから来る。受けたら来季から海外クラブの監督になり、
 *   引き継ぐもの（予算・施設・選手）は国内と同じ applyGmMove 1本。就任したクラブのリーグを
 *   本編で走り、評判・在任の記録・次のオファーも国内と同じ1本で動く。
 *   1人連れて行くのも国内と同じ判定（移籍金は payBetween）。
 *
 * ■世界の作り方
 *   startSetup → 初回ドラフト → 開幕 → 自分の部の全戦 と本物の手順で1年回す。
 *   声の掛かる範囲は順位で決まる（最下位は格下にしか範囲が無い）ので、**3部で優勝した**ことに
 *   して順位表だけ差し替える（範囲＝3部の一番高い格から格上へ5段。海外のクラブが入る）。
 *   就任から3シーズンの縛りは、在任の記録を古くして外す（退任の打診で行き先を選ぶため）。
 *
 * ■見ること
 *   [1] 退任の打診に海外クラブがある・受けると予約になり、endSeason で移る
 *   [2] 連れて行った選手が海外クラブへ移る（移籍金は新しいクラブが払う）
 *   [3] 海外リーグの日程を本編で全部走れる・順位表に自チームが載る
 *   [4] 次のオファー：走り終えた海外リーグの順位から、範囲どおり＋日本の1件
 *   [5] シーズン末を通る：予算は自チームの精算1本・格とリーグは動かない（海外）・
 *       トロフィー（頂点のリーグの優勝＝海外リーグも）は優勝したときだけ出る・GMキャリアの順位が引ける
 *   [6] 海外クラブから日本のクラブへ戻れる（離れた海外クラブは国の名前プールの監督へ）
 *
 * ■壊して確かめたこと
 *   ・resignOffers の候補を日本のリーグに絞る            → [1] が落ちる
 *   ・endSeason の予約の行き先を jpelClubById で引く      → [1] が落ちる（移らない）
 *   ・トロフィーを divisionOf(myClub) === 1 に戻す        → [5] が落ちる
 *   ・applyGmMove で旧クラブの監督名を '新監督' に戻す     → [6] が落ちる
 *   ・applyGmMove で movePlayer の clubs を受け取らない    → [2] が落ちる
 */
let rngSeed = 20260925
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

import { useGameStore } from '../src/store/gameStore'
import { assignLineupByTerrain } from '../src/engine/raceEngine'
import { clubById, isJpelLeague, myClub, myLeagueId, myLeagueRaces } from '../src/utils/world'
import { rankOfTeam, seasonLeagueStandings } from '../src/utils/league'
import { ovr, retirementAgeOf } from '../src/utils/playerUtils'
import { tierBudget, tierOf } from '../src/utils/clubTier'
import { appraiseGmInvite } from '../src/utils/gmInvite'
import { offerTierRange } from '../src/utils/gmOffer'
import { gmSeasonRanks } from '../src/utils/gmTenure'
import { clubGmName } from '../src/utils/clubs'
import { clubsInLeague } from '../src/utils/world'

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
/** 自チームをいまのリーグの首位にする（順位表の得点だけ差し替える） */
const finishFirst = () => {
  const st = g()
  const lid = myLeagueId(st.currentSeason, st.playerTeamId)!
  const lg = st.currentSeason.leagues[lid]
  const top = Math.max(...lg.standings.map(r => r.totalPoints)) + 1
  useGameStore.setState({ currentSeason: { ...st.currentSeason, leagues: { ...st.currentSeason.leagues,
    [lid]: { ...lg, standings: lg.standings.map(r => (r.teamId === st.playerTeamId ? { ...r, totalPoints: top } : r)) } } } } as never)
}
/** 在任の記録を古くして、退任の縛り（3シーズン）を外す */
const ageTenure = () => {
  const st = g()
  useGameStore.setState({ gmTenures: (st.gmTenures ?? []).map(t => (t.toYear == null ? { ...t, fromYear: st.currentSeason.year - 5 } : t)) } as never)
}

// ── 1年目：日本のクラブ（3部）で走る ──
g().startSetup({ teamName: '点検', teamShortName: '点検', teamId: 'tokyo', gmName: 'GM' })
g().beginInauguralDraft()
runDraft()
g().startRegularSeason()
runSeason()
finishFirst()
ageTenure()
const firstYear = g().currentSeason.year
const homeId = g().playerTeamId

console.log('[1] 退任の打診に海外クラブがあり、受けると来季から移る')
g().resignAsGm()
const offers = g().gmOffers ?? []
for (const o of offers) {
  const c = clubById(g().clubs, o.teamId)
  console.log(`    ${o.kind}  ${c?.shortName}（${c?.leagueId}・格${tierOf(c)}）`)
}
const foreignOffer = offers.find(o => !isJpelLeague(clubById(g().clubs, o.teamId)?.leagueId))
check('海外クラブからの打診が届いている', !!foreignOffer, offers.map(o => o.teamId).join(','))
check('日本のクラブからの打診も1件ある', offers.some(o => isJpelLeague(clubById(g().clubs, o.teamId)?.leagueId)))
const destId = foreignOffer?.teamId ?? ''
const destLeague = clubById(g().clubs, destId)?.leagueId ?? ''

// 連れて行く選手：海外クラブへ「行く」と答える選手（今季で引退・満了しない人から）
const ctx = () => ({ players: g().players, clubs: g().clubs, currentSeason: g().currentSeason,
  fromTeamId: homeId, destinationOf: g().destinationOf, playerTierOf: g().playerTierOf })
const willing = g().players
  .filter(p => p.teamId === homeId && p.status === 'active' && p.contract.yearsLeft >= 2 && p.age + 1 < retirementAgeOf(p))
  .sort((a, b) => ovr(b) - ovr(a))
  .find(p => destId && appraiseGmInvite(ctx(), p.id, destId)?.ok)
check('海外クラブへ「ついて行く」と答える選手がいる（空振りの緑ではない）', !!willing)
g().acceptGmOffer(destId, willing?.id)
check('受けてもその場では移らない（予約）', g().playerTeamId === homeId && g().pendingGmMove?.teamId === destId)

g().endSeason()
check('**endSeason で海外クラブへ移った**', g().playerTeamId === destId, g().playerTeamId)
check('自チームのリーグが海外リーグになった', myLeagueId(g().currentSeason, g().playerTeamId) === destLeague,
  `${myLeagueId(g().currentSeason, g().playerTeamId)} / ${destLeague}`)
check('在任の記録が海外クラブで始まる',
  (g().gmTenures ?? []).slice(-1)[0]?.teamId === destId && (g().gmTenures ?? []).slice(-1)[0]?.fromYear === firstYear + 1)
check('新しいクラブが自チーム扱い・前のクラブはCPUへ',
  !!myClub(g())?.isPlayerControlled && !clubById(g().clubs, homeId)?.isPlayerControlled)

console.log('')
console.log('[2] 連れて行った選手は海外クラブへ移る（移籍金は新しいクラブが払う）')
{
  const p = g().players.find(x => x.id === willing?.id)
  check('選手が海外クラブにいる', p?.teamId === destId, `${p?.teamId}`)
  const rec = (g().transferHistory ?? []).find(r => r.playerId === willing?.id && r.toTeamId === destId && r.year === firstYear + 1)
  check('移籍の記録に残っている', !!rec)
  const fee = rec?.fee ?? 0
  check('移籍金が今季の移籍金支出に入っている', fee > 0 && g().currentSeason.transferSpend === fee, `${fee} / ${g().currentSeason.transferSpend}`)
  check('新しいクラブの手元資金から払われている（予算 − 移籍金）',
    myClub(g())?.finance?.budget === (g().currentSeason.initialBudget ?? 0) - fee,
    `${myClub(g())?.finance?.budget} / ${g().currentSeason.initialBudget} − ${fee}`)
}

console.log('')
console.log('[3] 海外リーグの日程を本編で全部走る')
g().beginSeasonDraft()
runDraft()
g().startRegularSeason()
const myRaces = myLeagueRaces(g().currentSeason, g().playerTeamId)
check('自チームの日程が海外リーグの日程', myRaces.length > 0 && myRaces.length === (g().currentSeason.leagues[destLeague]?.races.length ?? -1),
  `${myRaces.length}本`)
check('走れる人数がいる', g().players.filter(p => p.teamId === g().playerTeamId && p.status === 'active').length >= 7)
runSeason()
{
  const ran = myLeagueRaces(g().currentSeason, g().playerTeamId)
  check('全戦に結果が入った', ran.length > 0 && ran.every(r => !!r.results), `${ran.filter(r => r.results).length}/${ran.length}`)
  const row = g().currentSeason.leagues[destLeague]?.standings.find(r => r.teamId === g().playerTeamId)
  check('海外リーグの順位表に自チームが載り、全戦ぶん数えられている', row?.raceResults.length === ran.length,
    `${row?.raceResults.length}/${ran.length}`)
  // ★相手も同じリーグのクラブが全戦を走っていること。出走を部（divisionOf）で組んでいたころは
  //   海外クラブの監督でも日本1部が相手になり、リーグのほかの19クラブは1戦も走っていなかった
  const rows = g().currentSeason.leagues[destLeague]?.standings ?? []
  check('海外リーグのほかのクラブも全戦を走っている', rows.length > 1 && rows.every(r => r.raceResults.length === ran.length),
    rows.map(r => r.raceResults.length).join(','))
}

console.log('')
console.log('[4] 次のオファー：走り終えた海外リーグの順位から、範囲どおり＋日本の1件')
const yearAbroad = g().currentSeason.year
const rankAbroad = rankOfTeam(seasonLeagueStandings(g().currentSeason, g().playerTeamId), g().playerTeamId)
const rangeAbroad = offerTierRange(clubsInLeague(g().clubs, destLeague).map(c => tierOf(c)), rankAbroad)!
/** 範囲の外から来た栄転・再起（再建は範囲を問わない） */
const outOfRange = (list: { teamId: string; kind?: string }[]) => list.filter(o => {
  const t = tierOf(clubById(g().clubs, o.teamId))
  return o.kind !== 'rebuild' && (t < rangeAbroad.top || t > rangeAbroad.bottom)
})
ageTenure()
g().resignAsGm()
{
  const next = g().gmOffers ?? []
  console.log(`    ${yearAbroad}年 ${destLeague} ${rankAbroad}位・範囲 格${rangeAbroad.top}〜${rangeAbroad.bottom}：`
    + next.map(o => `${o.kind} ${clubById(g().clubs, o.teamId)?.shortName}(格${tierOf(clubById(g().clubs, o.teamId))})`).join(' / '))
  check('打診が届く', next.length > 0)
  const last = next[next.length - 1]
  check('最後の1件は日本のクラブ', !!last && isJpelLeague(clubById(g().clubs, last.teamId)?.leagueId))
  check('範囲ぶんは範囲の中の格', next.length > 1 && outOfRange(next.slice(0, -1)).length === 0,
    `${next.length - 1}件 ` + outOfRange(next.slice(0, -1)).map(o => o.teamId).join(','))
}
g().declineGmOffer()

console.log('')
console.log('[5] シーズン末を通る')
const tierBefore = tierOf(myClub(g()))
const trophiesBefore = g().trophies ?? 0
g().endSeason()
{
  check('年が進んだ（落ちずに締まった）', g().currentSeason.year === yearAbroad + 1, `${g().currentSeason.year}`)
  check('自チームのまま', g().playerTeamId === destId)
  const me = myClub(g())
  check('海外クラブはリーグも格も動かない', me?.leagueId === destLeague && tierOf(me) === tierBefore, `${me?.leagueId} 格${tierOf(me)}`)
  check('予算は自チームの精算（期首予算＝手元資金）', me?.finance?.budget === g().currentSeason.initialBudget,
    `${me?.finance?.budget} / ${g().currentSeason.initialBudget}`)
  check('クラブ予算は格の年間予算', g().currentSeason.budgetBreakdown?.grant === tierBudget(me), `${g().currentSeason.budgetBreakdown?.grant}`)
  check('来季予算のお知らせが出る', g().seasonBudgetNotice?.budget === g().currentSeason.initialBudget)
  // 海外リーグは下に部が無い＝頂点のリーグ。優勝したときだけ1個（日本1部と同じ決まり・utils/league の titleTier）
  check('優勝トロフィーは頂点のリーグで優勝したときだけ（海外リーグも同じ）', (g().trophies ?? 0) === trophiesBefore + (rankAbroad === 1 ? 1 : 0), `${rankAbroad}位 ${trophiesBefore}→${g().trophies}`)
  check('来季の日程も海外リーグ', myLeagueId(g().currentSeason, g().playerTeamId) === destLeague)
  const ranks = gmSeasonRanks(g().pastSeasons, g().gmTenures, g().playerTeamId)
  const abroad = ranks.find(r => r.year === yearAbroad)
  check('GMキャリアにその年の順位が残る（海外クラブ）', abroad?.teamId === destId && abroad?.rank === rankAbroad,
    JSON.stringify(abroad))
  const home = ranks.find(r => r.year === firstYear)
  check('前の年は前のクラブの順位のまま', home?.teamId === homeId && (home?.rank ?? 0) > 0, JSON.stringify(home))
  // 在任が古い（縛りを外した）ので、年に1回のオファーが出ることもある。出たら範囲どおり
  const annual = g().gmOffers ?? []
  check('年に1回のオファーが出たなら範囲どおり', outOfRange(annual).length === 0, annual.map(o => o.teamId).join(','))
}

console.log('')
console.log('[6] 海外クラブから日本のクラブへ戻れる')
{
  g().declineGmOffer()
  ageTenure()
  g().resignAsGm()
  const jp = (g().gmOffers ?? []).find(o => isJpelLeague(clubById(g().clubs, o.teamId)?.leagueId))
  check('日本のクラブの打診がある', !!jp)
  g().acceptGmOffer(jp?.teamId ?? '')
  // 走らずに締める（戻る道だけを見る。ほかのリーグは endSeason が走り切る）
  g().endSeason()
  check('日本のクラブへ戻れた', g().playerTeamId === jp?.teamId && isJpelLeague(myClub(g())?.leagueId), g().playerTeamId)
  const left = clubById(g().clubs, destId)
  check('離れた海外クラブはCPUに戻る', !!left && !left.isPlayerControlled)
  check('離れた海外クラブの監督名は国の名前プールへ戻る（前の監督の名前を残さない）',
    !!left && left.gmName === undefined && clubGmName(left) !== clubGmName(myClub(g())!), `${left?.gmName}`)
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ 海外クラブの監督就任が通っていません（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ 海外クラブの打診を受けて1年走り切り、シーズン末と次のオファーまで通る')
