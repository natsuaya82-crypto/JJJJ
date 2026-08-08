/**
 * 【部と順位表の一致】走る部と、順位表に載っている部がズレないこと。
 *
 * ■なぜ要るのか
 *   「そのチームがどの部か」の出どころが2つある。
 *     ・Team.division（divisionOf）      … レースを走らせる・裏の部を決める・結果を書き込む
 *     ・順位表のキー（divisionInSeason） … 順位表・通し順位・チーム画面
 *   順位表は部ごとに分けて持つ設計なので、部そのものがキーになっている。片方だけ動かすと
 *   「走った結果の書き込み先に自分の行が無い」＝点がどこにも入らない、という状態になる。
 *
 *   実際 build 110 まで、チーム選択（startSetup）がこれだった。選んだクラブを列の最後尾へ
 *   回して部を動かすのに順位表は元の部のまま。2部のクラブを選ぶと
 *     ・自チームは teams では3部／順位表では2部
 *     ・走った点は standings[3] へ書きに行くが自分の行が無いので 0pt のまま
 *     ・自分の部(3部)は裏レースの対象外なので、順位表側の2部だけが裏で走り続ける
 *   となり、1年目から自分だけ0pt・他15クラブだけ点が増えていた。
 *
 *   いまは utils/league の syncSeasonStandings 1本に通す（起動時とチーム選択の両方）。
 *   点は保存済みのレース結果から数え直すので、何度呼んでも同じ結果になる＝
 *   すでに壊れているセーブも開き直すだけで直る。
 */
import { ALL_DOMESTIC_TEAMS } from '../src/utils/domesticClubs'
import { divisionOf, divisionInSeason, newSeasonStandings, syncSeasonStandings } from '../src/utils/league'
import type { Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const zero = (teamId: string) => ({ teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [] })

// ── チーム選択と同じ「列の最後尾へ回す」置き換えを再現する ──
// （gameStore の startSetup と同じ手順。選んだクラブを抜いて最後尾へ、下は全部ひとつ繰り上がる）
function placeLikeSetup(teams: Team[], pickedId: string): Team[] {
  const ordered = [...teams].sort((a, b) => (a.initialRank ?? 999) - (b.initialRank ?? 999))
  const slots = ordered.map(t => ({ division: divisionOf(t) }))
  const reordered = [...ordered.filter(t => t.id !== pickedId), ordered.find(t => t.id === pickedId)!]
  const placement = new Map(reordered.map((t, i) => [t.id, slots[i]]))
  return teams.map(t => ({ ...t, ...(placement.get(t.id) ?? { division: divisionOf(t) }) }))
}

const base = ALL_DOMESTIC_TEAMS as Team[]
// 1部・2部・3部それぞれから1クラブずつ選んで試す（2部を選んだときが実際に起きた事故）
const picks = [1, 2, 3].map(d => base.find(t => divisionOf(t) === d)!.id)

for (const pickedId of picks) {
  const before = divisionOf(base.find(t => t.id === pickedId))
  const teams = placeLikeSetup(base, pickedId)
  // 順位表は「元の部」で作られている＝チーム選択の前の状態
  const stale = newSeasonStandings(base, zero)
  const synced = syncSeasonStandings({ standings: stale, races: [], teams, playerTeamId: pickedId })

  const season = { standings: synced }
  const mismatched = teams.filter(t => divisionInSeason(season, t.id) !== divisionOf(t))
  check(`${before}部のクラブを選んでも、全52クラブで走る部と順位表の部が一致する`,
    mismatched.length === 0, mismatched.map(t => t.name).join('・'))

  const myDiv = divisionOf(teams.find(t => t.id === pickedId))
  check(`  選んだクラブは3部の順位表に載る（走る部＝${myDiv}部）`,
    myDiv === 3 && divisionInSeason(season, pickedId) === 3)

  const sizes = [1, 2, 3].map(d => synced[d as 1 | 2 | 3].length)
  check('  各部の人数は 20 / 16 / 16 のまま', sizes.join('/') === '20/16/16', sizes.join('/'))
}

// ── 走った結果から点を数え直せること（＝壊れたセーブが開き直すだけで直る） ──
{
  const pickedId = base.find(t => divisionOf(t) === 2)!.id
  const teams = placeLikeSetup(base, pickedId)
  const myDivTeams = teams.filter(t => divisionOf(t) === 3)
  // 3戦ぶんの結果をでっち上げる（自チームは 10位 → 4位 → 6位）
  const ranksByRace = [10, 4, 6]
  const races = ranksByRace.map((myRank, i) => ({
    id: `r${i}`,
    results: {
      teamRankings: myDivTeams.map((t, j) => {
        const rank = t.id === pickedId ? myRank : (j < myRank - 1 ? j + 1 : j + 2)
        return { teamId: t.id, rank, positionPoints: myDivTeams.length - rank + 1, segmentPoints: 0 }
      }),
    },
  }))
  // 事故と同じ状態：順位表は元の部のまま＝自分の行は2部側にあり、3部側には無い
  const broken = newSeasonStandings(base, zero)
  const fixed = syncSeasonStandings({ standings: broken, races, teams, playerTeamId: pickedId })
  const me = fixed[3].find(r => r.teamId === pickedId)
  const expected = ranksByRace.reduce((s, r) => s + (myDivTeams.length - r + 1), 0)
  check('走ったレースの結果から、消えていた自チームの点が戻る',
    me?.totalPoints === expected, `${me?.totalPoints} / 期待 ${expected}`)
  check('  消化試合も戻る（3戦）', me?.raceResults.length === 3, `${me?.raceResults.length}戦`)
  // 何度通しても同じ数字になること（起動のたびに呼ぶので、増えたら二重加算）
  const again = syncSeasonStandings({ standings: fixed, races, teams, playerTeamId: pickedId })
  check('  何度読み込んでも点が増えない（二重加算しない）',
    again[3].find(r => r.teamId === pickedId)?.totalPoints === expected)
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ 走る部と順位表の部がズレます（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ どの部のクラブを選んでも、走る部と順位表の部は一致し、点は結果から数え直せる')
