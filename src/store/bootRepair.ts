import type { ArchivedSeason, ForeignLeague, Player, Season, Team } from '../types'
import { ALL_DOMESTIC_TEAMS, domesticClubsComplete, backfillDomesticClubs } from '../utils/domesticClubs'
import {
  syncSeasonStandings, reconcileStandingsDivisions, rebalanceDivisions,
  divisionOf, rankOfTeam, DIVISIONS, DIVISION_SIZE,
} from '../utils/league'
import { normalizeForeignStandings } from '../utils/clubStanding'

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
  teams?: Team[]
  players?: Player[]
  playerTeamId?: string
  currentSeason?: Season
  pastSeasons?: ArchivedSeason[]
  foreignLeagues?: ForeignLeague[]
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
  let { teams, players, currentSeason, pastSeasons } = input
  const { foreignLeagues, playerTeamId, isInitialized } = input

  // ── 1. 国内52クラブがそろっているか ───────────────────────────
  // 部を足す前に始めたセーブは20クラブしか持っていない。2部の順位表に降格組だけ、
  // 3部は空、という状態。以前はシーズン終了時にしか補っていなかったので、
  // 「開いた瞬間から3部が空」のまま1年遊ぶことになっていた。
  if (isInitialized && Array.isArray(teams) && Array.isArray(players) && !domesticClubsComplete(teams)) {
    const before = teams.length
    const out = backfillDomesticClubs({
      teams, players, playerTeamId, year: currentSeason?.year ?? new Date().getFullYear(),
    })
    teams = out.teams
    players = out.players
    repairs.push(`国内クラブを ${before} → ${teams.length} に補完`)
  }

  // ── 2. 各部の人数（20 / 16 / 16）を戻す ──────────────────────
  // 順位表は teams の部に合わせる（次の3）ので、**先に teams 側の部を正しくする**。
  // 人数が狂ったまま合わせると、狂ったほうへ全部そろってしまう。
  // 部を持たないチームは divisionOf の既定値で全部1部に入り、domesticThroughRank には
  // 上限が無いので「3部のクラブが通し順位23位」のような表示になる。
  // 合っているセーブでは何も動かない（並びは いまの部 → その部での順位 を保つ）。
  if (isInitialized && Array.isArray(teams) && teams.length > 0) {
    const before = DIVISIONS.map(d => teams!.filter(t => divisionOf(t) === d).length)
    if (before.some((n, i) => n !== DIVISION_SIZE[DIVISIONS[i]])) {
      const rankOf = (t: Team) => {
        const at = rankOfTeam(currentSeason?.standings?.[divisionOf(t)], t.id)
        return at > 0 ? at : (t.initialRank ?? 999)
      }
      teams = rebalanceDivisions(teams, rankOf, t => t.id === playerTeamId)
      const after = DIVISIONS.map(d => teams!.filter(t => divisionOf(t) === d).length)
      repairs.push(
        after.join('/') === DIVISIONS.map(d => DIVISION_SIZE[d]).join('/')
          ? `各部の人数を ${before.join('/')} → ${after.join('/')} に戻した`
          : `⚠ 各部の人数が ${before.join('/')}（本来 ${DIVISIONS.map(d => DIVISION_SIZE[d]).join('/')}）。クラブ数 ${teams!.length} では戻せない`,
      )
    }
  }

  // ── 3. 順位表の部と、チームの部を合わせる ─────────────────────
  // 順位表は部ごとに分けて持つ＝部がキー。teams の部だけ動くと、走った結果の
  // 書き込み先に自分の行が無い＝点がどこにも入らない状態になる（utils/league の解説を参照）。
  if (isInitialized && Array.isArray(teams) && currentSeason) {
    const before = JSON.stringify(DIVISIONS.map(d => (currentSeason!.standings?.[d] ?? []).map(r => r.teamId)))
    const standings = syncSeasonStandings({
      standings: currentSeason.standings,
      races: currentSeason.races,
      teams,
      playerTeamId,
    }) as Season['standings']
    const after = JSON.stringify(DIVISIONS.map(d => (standings[d] ?? []).map(r => r.teamId)))
    if (before !== after) repairs.push('順位表の部をチームの部に合わせ直した')
    currentSeason = { ...currentSeason, standings }
  }

  // ── 4. 海外の順位表の行の形をそろえる ────────────────────────
  // 旧セーブはキーが clubId、いまは teamId。読む側は国内・海外を区別しないので、
  // ここでそろえておかないと海外だけ順位が引けない（utils/clubStanding の解説を参照）。
  if (currentSeason?.foreignStandings) {
    currentSeason = {
      ...currentSeason,
      foreignStandings: normalizeForeignStandings(currentSeason.foreignStandings as never) as never,
    }
  }
  if (Array.isArray(pastSeasons)) {
    pastSeasons = pastSeasons.map(ps => ps.foreignStandings
      ? { ...ps, foreignStandings: normalizeForeignStandings(ps.foreignStandings as never) as never }
      : ps)
  }

  // ── 5. 存在しないチームに所属している選手をFAへ戻す ──────────
  // クラブが消えた／IDが変わったときに、名簿からも市場からも消えた選手が生まれる。
  // 在籍は player.teamId 1本（utils/rosterSync）なので、指し先が無ければ無所属が正しい。
  if (Array.isArray(players) && Array.isArray(teams)) {
    const known = new Set<string>([
      ...teams.map(t => t.id),
      ...(foreignLeagues ?? []).flatMap(l => l.clubs.map(c => c.id)),
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

  return { ...input, teams, players, currentSeason, pastSeasons, foreignLeagues, repairs }
}

/** 順位表の行だけを整える入口（テストと、順位表を作り直す側から使う） */
export { reconcileStandingsDivisions, zeroRow }
