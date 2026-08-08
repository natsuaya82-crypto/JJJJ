/**
 * 【出場率】他の部・海外のクラブの選手でも、出場率が正しく出ること。
 *
 * ■なぜ要るのか
 *   出場率は `seasonAppearances(id, currentSeason.races) / currentRaceIndex` と
 *   書かれていた。`currentSeason.races` は**自分の部の日程だけ**なので、
 *   1部・2部のクラブの選手はそこに1本も載らず、**出場率が必ず0**になっていた。
 *
 *   これは表示の粗ではなく移籍の判断に直結する。`transferDecision.appraiseMove` は
 *   「今のクラブで干されている」に +0.2 を付けるので、出場率0だと全員に付く。
 *   3部で遊んでいると、1部・2部の主力が全員「干されている」扱いになる。
 *
 *   いまは `utils/playRate.ts` の `playRateOf` 1本。そのクラブが所属する部
 *   （海外ならそのリーグ）の日程で数えるので、置き場所の違いは呼ぶ側に出てこない。
 */
import { playRateOf, clubSeasonRaces, racesDone } from '../src/utils/playRate'
import { ALL_DOMESTIC_TEAMS } from '../src/utils/domesticClubs'
import { divisionOf } from '../src/utils/league'
import { seeksPlayingTime } from '../src/utils/transferDecision'
import type { Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const teams = ALL_DOMESTIC_TEAMS as Team[]
const d1 = teams.find(t => divisionOf(t) === 1)!
const d3 = teams.find(t => divisionOf(t) === 3)!

// 1レース分の器。その選手が走ったことにする
const race = (id: string, ranAs: string[]) => ({
  id, name: id, date: '2027-05-08', location: '', type: 'league', segments: [], conditions: {},
  results: { teamRankings: [], segmentResults: ranAs.map((pid, i) => ({ segmentIndex: i, runners: [{ playerId: pid, teamId: 'x', rank: 1, timeSec: 1000 }] })) },
})

// 自分は3部（7戦）、1部は10戦を裏で走っている。どちらのエースも全戦に出ている
const season = {
  races: Array.from({ length: 7 }, (_, i) => race(`d3-${i}`, ['ace3'])),
  divisionRaces: {
    1: Array.from({ length: 10 }, (_, i) => race(`d1-${i}`, ['ace1'])),
    2: Array.from({ length: 8 }, (_, i) => race(`d2-${i}`, ['ace2'])),
    3: Array.from({ length: 7 }, (_, i) => ({ ...race(`d3-${i}`, ['ace3']), results: undefined })),
  },
} as never

console.log('[1] そのクラブが走っている日程を引ける')
{
  const mine = clubSeasonRaces(season, d3.id, teams)
  const away = clubSeasonRaces(season, d1.id, teams)
  check('自分の部は結果の入っている season.races 側を見る', racesDone(mine) === 7, `${racesDone(mine)}戦`)
  check('他の部は divisionRaces 側を見る', racesDone(away) === 10, `${racesDone(away)}戦`)
}

console.log('')
console.log('[2] 出場率は部が違っても正しく出る')
{
  const me = playRateOf('ace3', d3.id, season, teams)
  const other = playRateOf('ace1', d1.id, season, teams)
  check('自分の部のエースは 7/7', me.races === 7 && me.teamRaces === 7 && me.fraction === 1)
  check('1部のエースも 10/10（0にならない）', other.races === 10 && other.teamRaces === 10 && other.fraction === 1,
    `${other.races}/${other.teamRaces}`)
  const sub = playRateOf('bench1', d1.id, season, teams)
  check('1部の控えは 0/10（走っていない人はちゃんと0）', sub.races === 0 && sub.teamRaces === 10)
}

console.log('')
console.log('[3] 「干されている」が他の部の主力に付かない')
{
  // seeksPlayingTime は序列と出場率の両方を見る。出場率が0だと主力でも「出たい」になる
  const ace = playRateOf('ace1', d1.id, season, teams)
  check('1部のエースは出番を求めない', !seeksPlayingTime({
    squadRank: 1, age: 28, races: ace.races, teamRaces: ace.teamRaces,
  }))
  const deep = playRateOf('bench1', d1.id, season, teams)
  check('1部の序列外の控えは出番を求める', seeksPlayingTime({
    squadRank: 20, age: 28, races: deep.races, teamRaces: deep.teamRaces,
  }))
}

console.log('')
console.log('[4] 分からないときは0ではなく中立（0.5 / 0戦）')
{
  const unknown = playRateOf('x', 'no-such-club', season, teams)
  check('知らないクラブは 0.5 / 0戦', unknown.fraction === 0.5 && unknown.teamRaces === 0)
  check('  0戦なら「干されている」は付かない', !seeksPlayingTime({
    squadRank: 30, age: 30, races: unknown.races, teamRaces: unknown.teamRaces,
  }))
  const noClub = playRateOf('x', undefined, season, teams)
  check('無所属も 0.5 / 0戦', noClub.fraction === 0.5 && noClub.teamRaces === 0)
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ 出場率が部によって狂います（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ どの部・どのリーグのクラブでも、出場率はそのクラブの走った数で出る')
