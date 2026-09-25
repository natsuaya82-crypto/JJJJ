import type { ArchivedSeason, Player, Season, Team, WorldClub } from '../types'
import { ALL_DOMESTIC_TEAMS, domesticClubsComplete, backfillDomesticClubs } from '../utils/domesticClubs'
import { managedTeamIds } from '../utils/gmTenure'
import {
  syncSeasonLeagues, reconcileStandingsDivisions, rebalanceDivisions,
  divisionOf, divisionInSeason, rankOfTeam, DIVISIONS, DIVISION_SIZE,
  divisionLeagueId, leagueRaces, leagueStandingRows,
} from '../utils/league'
import type { LeagueSeason } from '../types'
import { normalizeStandingRows } from '../utils/clubStanding'
import { withForeignSchedules } from '../engine/leagueDay'
import { clubIdSet, clubsInLeague, jpelClubs } from '../utils/world'

// ============================================================================
// 起動時のつじつま合わせ。**セーブを直す場所はここ1本。**
//
// ■なぜ「起動時」なのか
//   直し方が3通りに散っていた。
//     ・migrate      … 版でゲートする。一度でも版だけ進むと二度と走らない
//     ・merge        … 毎回走るが、書く人が「毎回・冪等に」と気をつける必要がある
//     ・画面側の防御 … 落ちないだけで、データは壊れたまま
//   版でゲートしたものは「その版を飛ばしたセーブ」「途中で例外が出て版だけ進んだセーブ」に
//   届かない。実際、海外クラブの名簿の取り込み（v22）はこれで取りこぼしていた。
//
//   起動には読み込みを待つ時間（最長1分）がある。**そこで毎回、全部つじつまを合わせる。**
//   ここに書くものは必ず次の2つを満たすこと。
//     1. 冪等（何度通しても同じ結果。二重加算しない）
//     2. 導出（結果や静的データから出せる。「前回いくつだったか」を覚えていない）
//   この2つを満たしていれば、いつどこで壊れても開き直すだけで直る。
//
// ■ここに書かないもの
//   1回だけ効かせたい調整（バランス補正・救済）は版でゲートしたまま migrate に置く。
//   毎回走らせると、遊んでいるあいだ中ずっと効き続けてしまう。
// ============================================================================

export type RepairInput = {
  isInitialized?: boolean
  clubs?: WorldClub[]
  players?: Player[]
  playerTeamId?: string
  currentSeason?: Season
  pastSeasons?: ArchivedSeason[]
}

export type RepairResult = RepairInput & { repairs: string[] }

const zeroRow = (teamId: string) => ({
  teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [],
})

/**
 * 読み込んだセーブのつじつまを合わせる。**毎回の起動で通す。**
 * 直したものは `repairs` に1行ずつ入る（console に出して、原因を追えるようにする）。
 */
export function repairLoadedSave(input: RepairInput): RepairResult {
  const repairs: string[] = []
  let { clubs, players, currentSeason, pastSeasons } = input
  const { playerTeamId, isInitialized } = input
  // ★部を固定するのは「一度でも指揮したクラブ」全部（utils/gmTenure の managedTeamIds）。
  //   いまの自チームだけにすると、監督が移った瞬間に前のクラブが元の部へ戻る
  const pinned = managedTeamIds((input as { gmTenures?: import('../types').GmTenure[] }).gmTenures, playerTeamId ?? '')

  // ── 1. 国内52クラブがそろっているか ───────────────────────────
  // 部を足す前に始めたセーブは20クラブしか持っていない。2部の順位表に降格組だけ、
  // 3部は空、という状態。以前はシーズン終了時にしか補っていなかったので、
  // 「開いた瞬間から3部が空」のまま1年遊ぶことになっていた。
  if (isInitialized && Array.isArray(clubs) && Array.isArray(players) && !domesticClubsComplete(clubs)) {
    const before = jpelClubs(clubs).length
    const out = backfillDomesticClubs({
      clubs, players, pinnedTeamIds: pinned, year: currentSeason?.year ?? new Date().getFullYear(),
    })
    clubs = out.clubs
    players = out.players
    repairs.push(`国内クラブを ${before} → ${jpelClubs(clubs).length} に補完`)
  }

  // ── 2. 各部の人数（20 / 16 / 16）を戻す ──────────────────────
  // 順位表は teams の部に合わせる（次の3）ので、**先に teams 側の部を正しくする**。
  // 人数が狂ったまま合わせると、狂ったほうへ全部そろってしまう。
  // 部を持たないチームは divisionOf の既定値で全部1部に入り、domesticThroughRank には
  // 上限が無いので「3部のクラブが通し順位23位」のような表示になる。
  // 合っているセーブでは何も動かない（並びは いまの部 → その部での順位 を保つ）。
  if (isInitialized && Array.isArray(clubs) && jpelClubs(clubs).length > 0) {
    const before = DIVISIONS.map(d => clubsInLeague(clubs, divisionLeagueId(d)).length)
    if (before.some((n, i) => n !== DIVISION_SIZE[DIVISIONS[i]])) {
      const rankOf = (t: Team) => {
        const at = rankOfTeam(leagueStandingRows(currentSeason, divisionLeagueId(divisionOf(t))), t.id)
        return at > 0 ? at : (t.initialRank ?? 999)
      }
      clubs = rebalanceDivisions(clubs, rankOf, t => pinned.has(t.id))
      const after = DIVISIONS.map(d => clubsInLeague(clubs, divisionLeagueId(d)).length)
      repairs.push(
        after.join('/') === DIVISIONS.map(d => DIVISION_SIZE[d]).join('/')
          ? `各部の人数を ${before.join('/')} → ${after.join('/')} に戻した`
          : `⚠ 各部の人数が ${before.join('/')}（本来 ${DIVISIONS.map(d => DIVISION_SIZE[d]).join('/')}）。クラブ数 ${jpelClubs(clubs).length} では戻せない`,
      )
    }
  }

  // ── 3. 順位表の部と、チームの部を合わせる ─────────────────────
  // 順位表は部ごとに分けて持つ＝部がキー。teams の部だけ動くと、走った結果の
  // 書き込み先に自分の行が無い＝点がどこにも入らない状態になる（utils/league の解説を参照）。
  if (isInitialized && Array.isArray(clubs) && currentSeason) {
    const idsOf = (s: Season) => JSON.stringify(DIVISIONS.map(d => leagueStandingRows(s, divisionLeagueId(d)).map(r => r.teamId)))
    const before = idsOf(currentSeason)
    const leagues = syncSeasonLeagues({ leagues: currentSeason.leagues, clubs, playerTeamId })
    currentSeason = { ...currentSeason, leagues }
    if (before !== idsOf(currentSeason)) repairs.push('順位表の部をチームの部に合わせ直した')
  }

  // ── 4. 過去シーズンの「自分がどの部で走ったか」を直す ────────────
  // 順位表のキー（＝部）は、在籍履歴のラベル・通算成績・その年の順位を全部決めている。
  // build 110 までのズレで、3部を走った年が「JPEL 2部」と記録され、
  // 部が分からない年は出場0の「JPEL」として出ていた。
  //
  // 過去の年は `Team.division`（いまの部）では直せない。走った結果だけが手がかりなので、
  // 「自チームの結果が載っている部のリーグ」を引き、順位表の行をその部へ移す。
  // 導出なので何度通しても同じ結果になる（結果を別ファイルへ出してある年は、読み戻すまで何もしない）。
  if (isInitialized && playerTeamId && Array.isArray(pastSeasons)) {
    let moved = 0
    pastSeasons = pastSeasons.map(ps => {
      const want = DIVISIONS.find(d => leagueRaces(ps, divisionLeagueId(d))
        .some(r => r.results?.teamRankings?.some(tr => tr.teamId === playerTeamId)))
      const have = divisionInSeason(ps, playerTeamId)
      if (want == null || have == null || want === have) return ps
      const haveId = divisionLeagueId(have), wantId = divisionLeagueId(want)
      const row = leagueStandingRows(ps, haveId).find(r => r.teamId === playerTeamId)
      if (!row) return ps
      moved++
      const leagues: Record<string, LeagueSeason> = { ...ps.leagues }
      leagues[haveId] = { races: leagueRaces(ps, haveId), standings: leagueStandingRows(ps, haveId).filter(r => r.teamId !== playerTeamId) }
      leagues[wantId] = { races: leagueRaces(ps, wantId), standings: [...leagueStandingRows(ps, wantId), row] }
      return { ...ps, leagues }
    })
    if (moved > 0) repairs.push(`過去 ${moved}シーズンの自チームの部を、実際に走った部へ直した`)
  }

  // ── 4b. 海外リーグの日程（日本1部と同じ10日）がそろっているか ────────────
  // 旧セーブの海外リーグは自チームの部の日程を借りて走っていたので、自分の日程を持たない。
  // 走り終えた回は残し、足りないぶんだけ足す（engine/leagueDay の withForeignSchedules）
  if (isInitialized && currentSeason?.leagues) {
    const leagues = withForeignSchedules(currentSeason.leagues, clubs)
    if (leagues !== currentSeason.leagues) {
      currentSeason = { ...currentSeason, leagues }
      repairs.push('海外リーグの日程をそろえた')
    }
  }

  // ── 5. 順位表の行の形をそろえる ──────────────────────────────
  // 旧セーブの海外リーグはキーが clubId、いまは teamId。読む側はリーグを区別しないので、
  // ここでそろえておかないと海外だけ順位が引けない（utils/clubStanding の解説を参照）。
  const normalizeLeagues = <S extends { leagues?: Record<string, LeagueSeason> }>(s: S): S => (s?.leagues
    ? { ...s, leagues: Object.fromEntries(Object.entries(s.leagues).map(([id, lg]) =>
        [id, { ...lg, standings: normalizeStandingRows(lg.standings) }])) }
    : s)
  if (currentSeason) currentSeason = normalizeLeagues(currentSeason)
  if (Array.isArray(pastSeasons)) pastSeasons = pastSeasons.map(normalizeLeagues)

  // ── 6. 存在しないチームに所属している選手をFAへ戻す ──────────
  // クラブが消えた／IDが変わったときに、名簿からも市場からも消えた選手が生まれる。
  // 在籍は player.teamId 1本（utils/rosterSync）なので、指し先が無ければ無所属が正しい。
  if (Array.isArray(players) && Array.isArray(clubs)) {
    const known = new Set<string>([
      ...clubIdSet(clubs),
      ...ALL_DOMESTIC_TEAMS.map(t => t.id),
    ])
    let lost = 0
    const fixed = players.map(p => {
      if (!p.teamId || known.has(p.teamId)) return p
      lost++
      return { ...p, teamId: '' }
    })
    if (lost > 0) {
      players = fixed
      repairs.push(`存在しないクラブに所属していた選手 ${lost}人を無所属へ`)
    }
  }

  return { ...input, clubs, players, currentSeason, pastSeasons, repairs }
}

/** 順位表の行だけを整える入口（テストと、順位表を作り直す側から使う） */
export { reconcileStandingsDivisions, zeroRow }
