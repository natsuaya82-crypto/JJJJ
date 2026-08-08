/**
 * 【起動時のつじつま合わせ】壊したセーブが、開き直すだけで直ること。
 *
 * セーブを直す場所は store/bootRepair.ts の repairLoadedSave 1本。版でゲートせず毎回通す。
 * ここでは実際に壊したデータを作って、1回通せば直ること・2回通しても増えないことを見る。
 */
import { repairLoadedSave } from '../src/store/bootRepair'
import { ALL_DOMESTIC_TEAMS } from '../src/utils/domesticClubs'
import { divisionOf, divisionInSeason, newSeasonStandings, DIVISIONS } from '../src/utils/league'
import type { Season, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const zero = (teamId: string) => ({ teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [] })
const base = ALL_DOMESTIC_TEAMS as Team[]

// ── チーム選択と同じ「列の最後尾へ回す」置き換え（gameStore の startSetup と同じ手順）──
function placeLikeSetup(teams: Team[], pickedId: string): Team[] {
  const ordered = [...teams].sort((a, b) => (a.initialRank ?? 999) - (b.initialRank ?? 999))
  const slots = ordered.map(t => ({ division: divisionOf(t) }))
  const reordered = [...ordered.filter(t => t.id !== pickedId), ordered.find(t => t.id === pickedId)!]
  const placement = new Map(reordered.map((t, i) => [t.id, slots[i]]))
  return teams.map(t => ({ ...t, ...(placement.get(t.id) ?? { division: divisionOf(t) }) }))
}

// ── 実際に起きた壊れ方を作る ──
// 2部のクラブを選んだ状態。teams は3部だが、順位表は元の部（2部）のまま。
// 自チームは3部の順位表に居ないので、3戦走っても点がどこにも入らない。
const pickedId = base.find(t => divisionOf(t) === 2)!.id
const teams = placeLikeSetup(base, pickedId)
const myDivTeams = teams.filter(t => divisionOf(t) === 3)
const ranks = [10, 4, 6]
const races = ranks.map((myRank, i) => ({
  id: `r${i}`, name: `第${i + 1}戦`, date: `2027-0${i + 3}-08`, location: '', type: 'league', segments: [], conditions: {},
  results: {
    teamRankings: myDivTeams.map((t, j) => {
      const rank = t.id === pickedId ? myRank : (j < myRank - 1 ? j + 1 : j + 2)
      return { teamId: t.id, rank, positionPoints: myDivTeams.length - rank + 1, segmentPoints: 0, totalTime: 0 }
    }),
    segmentResults: [],
  },
}))

const broken = {
  isInitialized: true,
  teams,
  players: [{ id: 'ghost', name: '消えたクラブの選手', teamId: 'no-such-club', status: 'active' }],
  playerTeamId: pickedId,
  currentSeason: { year: 2027, races, standings: newSeasonStandings(base, zero), currentRaceIndex: 3 },
  pastSeasons: [],
  foreignLeagues: [],
} as never

// 壊れていることの確認（ここが ok にならないと、以降の検証が成立しない）
{
  const s = (broken as { currentSeason: Season }).currentSeason
  check('前提：壊れた状態を作れている（自チームが順位表では別の部）',
    divisionInSeason(s, pickedId) !== divisionOf(teams.find(t => t.id === pickedId)))
}

// ── 1回通す ──
const once = repairLoadedSave(broken)
const s1 = once.currentSeason as Season

const mismatched = (once.teams ?? []).filter(t => divisionInSeason(s1, t.id) !== divisionOf(t))
check('1回の起動で、全52クラブの走る部と順位表の部が一致する', mismatched.length === 0, mismatched.map(t => t.name).join('・'))

const me = s1.standings[3].find(r => r.teamId === pickedId)
const expected = ranks.reduce((sum, r) => sum + (myDivTeams.length - r + 1), 0)
check('消えていた自チームの点が、走ったレースの結果から戻る', me?.totalPoints === expected, `${me?.totalPoints} / 期待 ${expected}`)
check('  消化試合も戻る（3戦）', me?.raceResults.length === 3, `${me?.raceResults.length}戦`)

const sizes = DIVISIONS.map(d => (once.teams ?? []).filter(t => divisionOf(t) === d).length)
check('各部の人数は 20 / 16 / 16 のまま', sizes.join('/') === '20/16/16', sizes.join('/'))

const ghost = (once.players ?? []).find(p => p.id === 'ghost')
check('存在しないクラブに所属していた選手が無所属になる', ghost?.teamId === '')

check('直したものが記録に残る', once.repairs.length > 0, once.repairs.join(' / '))
console.log(`      （${once.repairs.join(' / ')}）`)

// ── 2回通しても変わらない（起動のたびに走るので、増えたら二重加算）──
const twice = repairLoadedSave(once as never)
const s2 = twice.currentSeason as Season
check('2回目の起動で点が増えない（冪等）',
  s2.standings[3].find(r => r.teamId === pickedId)?.totalPoints === expected)
check('  2回目は直すものが無い', twice.repairs.length === 0, twice.repairs.join(' / '))

// ── 壊れていないセーブは何も変えない ──
{
  const healthy = {
    isInitialized: true, teams, players: [], playerTeamId: pickedId,
    currentSeason: s1, pastSeasons: [], foreignLeagues: [],
  } as never
  const out = repairLoadedSave(healthy)
  check('壊れていないセーブには手を出さない', out.repairs.length === 0, out.repairs.join(' / '))
}

// ── 各部の人数が狂ったセーブは、開き直すと 20/16/16 に戻る ──────────────
// 部を持たないチームは divisionOf の既定値で全部1部に入る。domesticThroughRank に
// 上限は無いので、膨らんだ1部では21位・22位…が出て、3部のクラブが
// 「通し順位23位」のように別の部の順位で表示される（実際にそう出ていた）。
{
  // 3部の8クラブから部を落とす（旧セーブや変換の取りこぼしと同じ形）
  const dropped = new Set(teams.filter(t => divisionOf(t) === 3 && t.id !== pickedId).slice(0, 8).map(t => t.id))
  const bent = teams.map(t => (dropped.has(t.id) ? { ...t, division: undefined } : t)) as Team[]
  const sizesBefore = DIVISIONS.map(d => bent.filter(t => divisionOf(t) === d).length)
  check('前提：人数が狂った状態を作れている', sizesBefore.join('/') !== '20/16/16', sizesBefore.join('/'))

  const out = repairLoadedSave({
    isInitialized: true, teams: bent, players: [], playerTeamId: pickedId,
    currentSeason: { year: 2027, races: [], standings: newSeasonStandings(bent, zero) } as never,
    pastSeasons: [], foreignLeagues: [],
  })
  const sizes = DIVISIONS.map(d => (out.teams ?? []).filter(t => divisionOf(t) === d).length)
  check('人数が狂ったセーブは 20/16/16 に戻る', sizes.join('/') === '20/16/16', sizes.join('/'))
  check('  自チームは3部のまま（別の部へ吸い上げられない）',
    divisionOf((out.teams ?? []).find(t => t.id === pickedId)) === 3
    && divisionInSeason(out.currentSeason as Season, pickedId) === 3)
  const again = repairLoadedSave(out as never)
  check('  2回目は直すものが無い（冪等）', again.repairs.length === 0, again.repairs.join(' / '))
}

// ── クラブが足りない旧セーブを補っても、自チームは元の部へ引き戻されない ────
// backfillDomesticClubs は既存クラブの部をデータどおりに戻す（降格先が無いまま
// 落ちたぶんの取り消し）。**自チームまで戻すと、選んだクラブの元の部へ帰ってしまう。**
// プレイヤーはどのクラブを選んでも3部・格20から始まるので、これは必ず誤り。
{
  const upper = teams.filter(t => divisionOf(t) === 1 || t.id === pickedId)
  const out = repairLoadedSave({
    isInitialized: true, teams: upper, players: [], playerTeamId: pickedId,
    currentSeason: { year: 2027, races: [], standings: newSeasonStandings(upper, zero) } as never,
    pastSeasons: [], foreignLeagues: [],
  })
  check('クラブを補ったあとも、自チームは3部のまま',
    divisionOf((out.teams ?? []).find(t => t.id === pickedId)) === 3,
    `${divisionOf((out.teams ?? []).find(t => t.id === pickedId))}部になった`)
  const sizes = DIVISIONS.map(d => (out.teams ?? []).filter(t => divisionOf(t) === d).length)
  check('  補ったあとの人数も 20/16/16', sizes.join('/') === '20/16/16', sizes.join('/'))
}

// ── 過去シーズンの部は「実際に走った日程」から直る ──────────────────
// 在籍履歴のラベル（「JPEL 3部」）も通算成績もその年の順位も、順位表のキー＝部で決まる。
// build 110 までのズレで、3部を走った年が「JPEL 2部」と記録され、
// 部が引けない年は出場0の「JPEL」として出ていた。過去の年は Team.division では直せない
// （いまの部なので昇降格したあとの年に当てはめると記録が動く）。走った日程だけが手がかり。
{
  const my3 = teams.filter(t => divisionOf(t) === 3)
  const past = {
    year: 2027,
    // 自分は3部の日程を走った（結果入り）
    races: races.map(r => ({ ...r, id: `d3-${r.id}` })),
    divisionRaces: {
      1: [{ id: 'd1-0', name: '1部戦', results: undefined }],
      2: [{ id: 'd2-0', name: '2部戦', results: undefined }],
      3: races.map(r => ({ ...r, id: `d3-${r.id}`, results: undefined })),
    },
    // ところが順位表は自分を2部に置いている（＝在籍履歴が「JPEL 2部」になる）
    standings: {
      1: teams.filter(t => divisionOf(t) === 1).map(t => zero(t.id)),
      2: [...teams.filter(t => divisionOf(t) === 2).map(t => zero(t.id)), zero(pickedId)],
      3: my3.filter(t => t.id !== pickedId).map(t => zero(t.id)),
    },
  }
  check('前提：過去シーズンの部がズレている（3部を走ったのに順位表は2部）',
    divisionInSeason(past as never, pickedId) === 2)

  const out = repairLoadedSave({
    isInitialized: true, teams, players: [], playerTeamId: pickedId,
    currentSeason: { year: 2028, races: [], standings: newSeasonStandings(teams, zero) } as never,
    pastSeasons: [past] as never, foreignLeagues: [],
  })
  const fixed = (out.pastSeasons ?? [])[0]
  check('過去シーズンの部が、実際に走った部（3部）へ直る',
    divisionInSeason(fixed as never, pickedId) === 3)
  check('  2部の側から消えている（両方に居ない）',
    !(fixed?.standings?.[2] ?? []).some(r => r.teamId === pickedId))
  const again = repairLoadedSave(out as never)
  check('  2回目は直すものが無い（冪等）', again.repairs.length === 0, again.repairs.join(' / '))
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ 起動時に直りきらないものがあります（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ 壊れたセーブは開き直すだけで直り、何度開いても数字は変わらない')
