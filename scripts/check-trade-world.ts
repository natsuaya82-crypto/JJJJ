/**
 * 【自分から組むトレードの相手は、自チーム以外の全クラブ】（オーナー・2026-09-25）
 *
 * ■なぜ要るのか
 *   トレードの相手を選ぶ画面は「国内のみ」で、チャットの側も相手を日本のリーグのクラブから
 *   しか引けなかった。海外クラブを相手にできるようにすると、次の2つを確かめないといけない。
 *     ・お金が両側で動くこと（以前は現金が日本のリーグのクラブでしか動かず、相手が海外だと
 *       片側だけ動いていた）
 *     ・指名権が消えないこと（指名権を持てるのは決まり `draftPicks` のあるリーグのクラブだけ。
 *       持てないクラブへ渡すと、こちらから消えて向こうにも入らない）
 *
 * ■見るもの
 *   [1] 画面：トレードの相手の一覧が otherClubs(clubs, …)（231クラブ）で、チャットも clubById で引く
 *   [2] store：海外クラブと現金つきのトレードを実際に成立させ、選手・お金（両側）・指名権を見る
 */
import { readFileSync } from 'node:fs'
import { useGameStore } from '../src/store/gameStore'
import { initialWorldClubs } from '../src/store/initialWorld'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { clubById, clubsWhere, isJpelLeague, jpelClubs } from '../src/utils/world'
import { holdsDraftPicks } from '../src/data/leagueRules'
import { comparePlayers } from '../src/utils/playerSort'
import { tierBudget } from '../src/utils/clubTier'
import type { Player, WorldClub } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[1] 画面：トレードの相手は自チーム以外の全クラブ')
{
  const page = readFileSync('src/components/transfer/TransferPage.tsx', 'utf8')
  const tradeTab = page.slice(page.indexOf("{tab === 'trade' && ("))
  check('相手の一覧は otherClubs(clubs, playerTeamId)', /otherClubs\(clubs, playerTeamId\)\.map\(t =>/.test(tradeTab))
  check('  日本のリーグだけに絞っていない', !/jpelClubs\(/.test(tradeTab))
  const chat = readFileSync('src/components/team/ChatPage.tsx', 'utf8')
  check('チャットの相手は clubById で引く', /tradeTeam = tradeTeamId \? clubById\(clubs, tradeTeamId\)/.test(chat))
  const view = readFileSync('src/components/team/chat/TradeChatView.tsx', 'utf8')
  check('指名権の札は holdsDraftPicks を見て出す（store と同じ）', (view.match(/holdsDraftPicks\(team\)/g) ?? []).length === 2)
}

console.log('\n[2] store：海外クラブと現金・指名権つきのトレードを成立させる')
{
  const YEAR = 2031
  const clubs: WorldClub[] = initialWorldClubs()
  const ME = jpelClubs(clubs)[0].id
  const FC = clubsWhere(clubs, c => !isJpelLeague(c.leagueId))[0]
  const players: Player[] = [
    ...generateCpuRosters(jpelClubs(clubs), YEAR).cpuPlayers,
    ...generateForeignLeaguePlayers([FC] as never, YEAR).players,
  ].map(p => ({ ...p, joinedYear: YEAR - 3 }))
  const myPick = { year: YEAR + 1, round: 1, pickNumber: 3, originallyOwnedBy: ME }
  const withPick = clubs.map(c => (c.id === ME ? { ...c, draftPicks: [myPick] } : c))
  useGameStore.setState({
    isInitialized: true, playerTeamId: ME, clubs: withPick, players,
    currentSeason: {
      year: YEAR, phase: 'regular', currentRaceIndex: 3, leagues: {}, newsFeed: [], objectives: [],
      incomingOffers: [], transferListings: [], contractRequests: [],
    },
    pastSeasons: [],
  } as never)
  const g = () => useGameStore.getState()
  check('前提：相手は指名権を持てないクラブ', !holdsDraftPicks(FC))
  const mine = players.filter(p => p.teamId === ME).sort(comparePlayers('ovr'))
  const theirs = players.filter(p => p.teamId === FC.id).sort(comparePlayers('ovr'))
  // 釣り合う組を総当たりで探す（ここで見たいのは成立したあとの動き）
  const CASH = 10_000_000
  let done: { give: Player; get: Player } | null = null
  // 古いセーブの海外クラブには finance が無い。その年は格の年間予算から始める（utils/clubMoney）
  const budget0 = { me: clubById(withPick, ME)!.finance!.budget, fc: FC.finance?.budget ?? tierBudget(FC) }
  for (const give of mine.slice(3)) {
    for (const get of theirs.slice(5)) {
      const before = useGameStore.getState()
      const r = g().tradePlayer([give.id], [get.id], FC.id, CASH, ['2032-R1-3'], [])
      if (r.ok) { done = { give, get }; break }
      useGameStore.setState(before)
    }
    if (done) break
  }
  check('海外クラブとのトレードが成立する', !!done)
  if (done) {
    const at = (id: string) => g().players.find(p => p.id === id)?.teamId
    check('  出した選手は相手へ', at(done.give.id) === FC.id)
    check('  もらった選手はこちらへ', at(done.get.id) === ME)
    const me1 = clubById(g().clubs, ME)!.finance!.budget
    const fc1 = clubById(g().clubs, FC.id)!.finance?.budget
    check('  現金はこちらから引かれる', me1 === budget0.me - CASH, `${me1 - budget0.me}`)
    check('  相手の資金にも入る（両側が動く）', fc1 === budget0.fc + CASH, `${fc1} / ${budget0.fc}`)
    check('  指名権は持てない相手へ渡らず、こちらに残る',
      (clubById(g().clubs, ME)!.draftPicks ?? []).length === 1 && !(clubById(g().clubs, FC.id)!.draftPicks ?? []).length)
  }
}

if (failed > 0) { console.log(`\n✗ ${failed}件`); process.exit(1) }
console.log('\n✓ トレードの相手は231クラブ・お金は両側で動く・指名権は消えない')
