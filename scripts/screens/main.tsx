// 【画面の点検の台】check-foreign-screens がブラウザで開くページ（アプリ本体には入らない）。
//
// 新しいゲームを本物の手順（startSetup → 初回ドラフト → 開幕 → 2戦）で作り、
// `?mode=foreign` なら**自チームを海外クラブへ移した世界**、`?mode=jpel` ならそのままの世界で、
// アプリと同じ道すじ（App.tsx の AppRoutes）を1本ずつ開いていく。ドラフト会場（Layout の外）も開く。
// 1枚ごとに「落ちたか」「何が出たか」を window.__screens に書き、終わったら window.__screensDone を立てる。
// 判定は check-foreign-screens.ts（ここは開いて写すだけ）。
/* eslint-disable react-refresh/only-export-components -- 台のページ。開いたまま書き換えることは無い */
import { Component, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import '../../src/index.css'
import { AppRoutes } from '../../src/App'
import PlayerSheet from '../../src/components/shared/PlayerSheet'
import DraftRoom from '../../src/components/draft/DraftRoom'
import { useGameStore } from '../../src/store/gameStore'
import { assignLineupByTerrain } from '../../src/engine/raceEngine'
import { ovr } from '../../src/utils/playerUtils'
import { clubsWhere, isJpelLeague, myClub, myLeagueRaces, otherClubs } from '../../src/utils/world'
import { clubGmName, clubRoutePath, clubView, leagueRoutePath } from '../../src/utils/clubs'
import { rankOfTeam, seasonLeagueStandings } from '../../src/utils/league'
import { leagueById, FOREIGN_LEAGUE_DEFS } from '../../src/data/leagues'
import { CHANGELOG } from '../../src/data/appMeta'
import type { DraftState } from '../../src/types'

type Shot = { name: string; path: string; tag?: string; error?: string; text: string; loc?: string }
declare global {
  interface Window { __screens: Shot[]; __screensDone: boolean; __screensMeta: Record<string, unknown> }
}
const shots: Shot[] = []
window.__screens = shots
window.__screensMeta = {}

const S = () => useGameStore.getState()
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
/** 画面の文字が落ち着くまで待つ（重い画面は1回の待ちでは描き終わらない） */
async function settled(): Promise<string> {
  let prev = ''
  for (let i = 0; i < 40; i++) {
    await wait(120)
    const now = document.body.innerText
    if (i >= 2 && now === prev) return now
    prev = now
  }
  return prev
}

// ── 世界を作る ──
let draftAtStart: DraftState | null = null
function buildWorld(mode: string) {
  const g = S
  g().startSetup({ teamName: '点検', teamShortName: '点検', teamId: 'tokyo', gmName: 'GM' })
  g().beginInauguralDraft()
  draftAtStart = g().draftState
  for (let i = 0; i < 400 && g().draftState && !g().draftState!.isComplete; i++) {
    const st = g()
    const cur = st.draftState!.pickOrder[st.draftState!.currentPick]
    const top = [...st.draftState!.pool].filter(p => p.teamId === '__pool__' || !p.teamId).sort((a, b) => ovr(b) - ovr(a))[0]
    if (cur === st.playerTeamId && top) st.playerPick(top.id); else st.cpuPick()
  }
  g().advanceDraft()
  g().startRegularSeason()
  for (let n = 0; n < 2; n++) {
    const st = g()
    const race = myLeagueRaces(st.currentSeason, st.playerTeamId)[st.currentSeason.currentRaceIndex]
    if (!race) break
    st.runRace(assignLineupByTerrain(st.players.filter(p => p.teamId === st.playerTeamId && p.status === 'active'), race))
  }
  if (mode === 'foreign') {
    // 監督が海外クラブへ移った世界（移った先のクラブの選手・予算・順位表がそのまま自チームになる）
    const to = clubsWhere(g().clubs, c => !isJpelLeague(c.leagueId))[0]
    useGameStore.setState({
      playerTeamId: to.id,
      gmTenures: [...(g().gmTenures ?? []), { teamId: to.id, fromYear: g().currentSeason.year }],
    } as never)
  }
}

// ── 開く画面（パスは自チームのリーグから組む。App.tsx の道すじと突き合わせるのは点検の側） ──
function screens(): { path: string; tag?: string }[] {
  const st = S()
  const me = myClub(st)!
  const other = otherClubs(st.clubs, st.playerTeamId)
  const jpelOther = other.find(c => isJpelLeague(c.leagueId))!
  const foreignOther = other.find(c => !isJpelLeague(c.leagueId))!
  const foreignLeague = FOREIGN_LEAGUE_DEFS.find(l => l.id !== me.leagueId)!
  const year = st.currentSeason.year
  return [
    { path: '/', tag: 'home' },
    { path: '/team', tag: 'mine' },
    { path: '/team/chat' },
    { path: '/team/facilities', tag: 'mine' },
    { path: '/team/nosale' },
    { path: '/team/roster', tag: 'mine' },
    { path: '/team/tactics' },
    { path: '/team/training' },
    { path: '/race' },
    { path: '/scout' },
    { path: '/teams' },
    { path: '/standings' },
    { path: '/standings/ecl' },
    { path: leagueRoutePath(me.leagueId), tag: 'myLeague' },
    { path: clubRoutePath(clubView(me))!, tag: 'myClub' },
    { path: clubRoutePath(clubView(jpelOther))! },
    { path: clubRoutePath(clubView(foreignOther))! },
    { path: `/teams/foreign/${foreignLeague.id}` },
    { path: '/teams/national/JPN' },
    { path: '/teams/coming' },
    { path: '/national/select' },
    { path: '/national/result' },
    { path: '/national/tournament' },
    { path: '/transfer' },
    { path: '/transfer/starred' },
    { path: '/transfer/offers' },
    { path: '/transfer/rental' },
    { path: '/transfer/market' },
    { path: '/transfer/listings' },
    { path: '/transfer/trade' },
    { path: '/objectives', tag: 'mine' },
    { path: '/jewels' },
    { path: '/records', tag: 'mine' },
    { path: '/records/franchise', tag: 'mine' },
    { path: '/records/individual' },
    { path: '/records/gm', tag: 'mine' },
    { path: '/records/season', tag: 'mine' },
    { path: '/records/players' },
    { path: '/records/draft' },
    { path: `/records/draft/${year}` },
    { path: '/records/champions' },
    { path: '/records/coming' },
    { path: '/ecl' },
    { path: '/shop' },
    { path: '/sponsors', tag: 'mine' },
    { path: '/notifications' },
    { path: '/help' },
    { path: '/schedule' },
    { path: '/cards' },
    { path: '/create-player' },
    { path: '/cards/list' },
    { path: '/cards/convert' },
    { path: '/cards/select' },
    { path: '/budget', tag: 'mine' },
    { path: '/login-bonus' },
    { path: '/news' },
    { path: '/more' },
    { path: '/announcements' },
    { path: `/announcements/${CHANGELOG[0]?.version ?? ''}` },
    { path: '/online' },
    { path: '/online/match' },
    { path: '/online/history' },
    { path: '/online/hof' },
    { path: '/online/events' },
    { path: '/online/rated' },
    { path: '/online/rated/lineup' },
    { path: '/online/rated/result' },
    { path: '/online/rated/standings' },
    { path: '/online/rated/group' },
    { path: '/rated/help' },
    { path: '/friends' },
    { path: '/friends/list' },
    { path: '/friends/requests' },
    { path: '/friends/received' },
    { path: '/friends/sent' },
    { path: '/friends/club' },
    { path: '/friends/clubs' },
    // どの道にも当たらない＝Layout だけ。「何も出ていない」の物差しにする
    { path: '/__blank__', tag: 'blank' },
  ]
}

// ── 描く ──
class Catch extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: Error) { this.props.onError(e) }
  render() { return this.state.failed ? null : this.props.children }
}

/** いまの道と、道を変える手（描いた中から受け取る） */
const probe: { nav: NavigateFunction | null; where: string } = { nav: null, where: '' }
function Probe() {
  const nav = useNavigate()
  const l = useLocation()
  useEffect(() => { probe.nav = nav; probe.where = l.pathname + l.search })
  return null
}

let caught: string | undefined
const noop = () => {}
function Shell({ draft }: { draft?: boolean }) {
  return (
    <Catch onError={e => { caught ??= e.message }}>
      <MemoryRouter>
        <Probe />
        {draft ? <DraftRoom /> : <AppRoutes resetGame={noop} onBackToTitle={noop} />}
        <PlayerSheet />
      </MemoryRouter>
    </Catch>
  )
}

async function main() {
  const mode = new URLSearchParams(location.search).get('mode') ?? 'jpel'
  // 乱数を固定する（毎回同じ世界を開く）
  let seed = 20260925
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  buildWorld(mode)
  const st = S()
  const me = myClub(st)!
  window.__screensMeta = {
    mode,
    playerTeamId: st.playerTeamId,
    leagueId: me.leagueId,
    leagueName: leagueById(me.leagueId)?.name,
    leaguePath: leagueRoutePath(me.leagueId),
    rank: rankOfTeam(seasonLeagueStandings(st.currentSeason, st.playerTeamId), st.playerTeamId),
    gmName: clubGmName(me),
    shortName: me.shortName,
    roster: st.players.filter(p => p.teamId === st.playerTeamId).length,
  }

  const host = document.getElementById('root')!
  const root = createRoot(host)
  const onWinErr = (e: ErrorEvent) => { caught ??= String(e.error?.message ?? e.message) }
  window.addEventListener('error', onWinErr)
  let gen = 0
  const mount = async (draft = false) => {
    gen++
    root.render(<Shell key={gen} draft={draft} />)
    await wait(400)
  }

  await mount()
  for (const sc of screens()) {
    caught = undefined
    probe.nav!(sc.path)
    const text = await settled()
    shots.push({ name: sc.path, path: sc.path, tag: sc.tag, error: caught, text, loc: probe.where })
    // 落ちた画面は入れものごと作り直す（次の画面まで道連れにしない）
    if (caught) await mount()
  }

  // ホームの「順位表」を押すと自分のリーグの順位表が開くか
  caught = undefined
  probe.nav!('/')
  await settled()
  const sq = [...document.querySelectorAll('span')].find(el => el.textContent === '順位表')
  sq?.click()
  shots.push({ name: '(ホームの順位表を押す)', path: '/', tag: 'homeStandingsClick', error: caught, text: await settled(), loc: probe.where })

  // 選手詳細（自チームの選手）
  caught = undefined
  S().openPlayerSheet(S().players.find(p => p.teamId === S().playerTeamId)?.id ?? null)
  shots.push({ name: '(選手詳細)', path: '', error: caught, text: await settled() })
  S().openPlayerSheet(null)

  // ドラフト会場（Layout の外）。初年度の会場を開いた時点で開く
  caught = undefined
  useGameStore.setState({ draftState: draftAtStart } as never)
  await mount(true)
  shots.push({ name: '(ドラフト会場)', path: '', error: caught, text: await settled() })

  window.removeEventListener('error', onWinErr)
  window.__screensDone = true
}

main().catch(e => {
  shots.push({ name: '(台)', path: '', error: String(e?.stack ?? e), text: '' })
  window.__screensDone = true
})
