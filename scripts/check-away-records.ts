/**
 * ほかのリーグ（国内の他の部・海外）を**日付の順に**走らせたとき、
 *   ・走行記録から数え直した通算成績が、選手に足した通算と一致する（旧い集計は積まない）
 *   ・自チームのリーグは1本も走らせない（本編で走るので二重になる）
 *   ・どのリーグの記録にも、そのリーグの順位表に載っているクラブしか混ざらない
 *   ・その日までの開催が全部走り、その日より後は1本も走らない
 * を確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-away-records.ts --outfile=/tmp/car.cjs && node /tmp/car.cjs
 *
 * 走らせるのは engine/leagueDay の runLeaguesThrough 1本（本番と同じ入口）。
 * 通算成績は走行記録から数え直す（utils/careerStats）ので、数が変わると年俸も移籍金も動く。
 */
import { runLeaguesThrough } from '../src/engine/leagueDay'
import { leagueMakesRecordNews } from '../src/engine/raceRecords'
import { buildCareerCounts } from '../src/utils/careerStats'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUE_DEFS, INITIAL_FOREIGN_CLUBS } from '../src/data/leagues'
import { drawSeasonSchedules } from '../src/data/races'
import { DIVISIONS, divisionLeagueId, newSeasonStandings } from '../src/utils/league'
import { seasonLeaguesFixture } from './seasonFixture'
import type { Season, SeasonStanding, Team, WorldClub } from '../src/types'

let seed = 20260925
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

const YEAR = 2028
const MY = 'yonago'   // 3部（7戦）。ほかのリーグのほうが戦数が多い側で見る
const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const fgen = generateForeignLeaguePlayers(INITIAL_FOREIGN_CLUBS, YEAR)
const clubs: WorldClub[] = [...teams, ...INITIAL_FOREIGN_CLUBS]
const players = [...generateCpuRosters(teams, YEAR).cpuPlayers, ...fgen.players]
const schedules = drawSeasonSchedules(YEAR, Math.random)
const standings = newSeasonStandings<SeasonStanding>(clubs, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
const season = {
  year: YEAR, currentRaceIndex: 0,
  leagues: seasonLeaguesFixture({ schedules, standings }),
} as unknown as Season
const myLeague = divisionLeagueId(3)

// 6月末まで（途中の日付で止まることも見る）
const THROUGH = `${YEAR}-06-30`
const out = runLeaguesThrough({ season, players, clubs, through: THROUGH, skip: myLeague, playerTeamId: "", pastSeasons: [] })
if (!out) { console.log('✗ 空振り（1本も走らなかった）'); process.exit(1) }
const L = out.season.leagues

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

console.log('[0] 裏のリーグの選手も疲れ、怪我をする（本編の1戦と同じ・オーナー・2026-09-28「同じ」）')
{
  // 以前は疲労と怪我が自チームのリーグのレースでしか起きず、ほかの11リーグの選手は1度も疲れなかった
  // 戻し方：engine/leagueDay の runLeaguesThrough から applyRaceFatigue / rollRaceInjuries を消す
  const inOther = new Set(Object.entries(L).filter(([id]) => id !== myLeague).flatMap(([, lg]) => lg.standings.map(s => s.teamId)))
  const tired = out.players.filter(p => inOther.has(p.teamId) && (p.fatigue ?? 0) > 0).length
  check('裏のリーグの選手に疲労が溜まる', tired > 0, `${tired}人`)
  // 怪我は疲労65を超えてから（raceInjury）。ふつうの1年ではCPUはそこまで疲れないので、
  // 裏のリーグの選手を最初から疲れさせた世界で、走った選手が怪我をするかを見る
  const tiredWorld = players.map(p => inOther.has(p.teamId) ? { ...p, fatigue: 100 } : p)
  const t = runLeaguesThrough({ season, players: tiredWorld, clubs, through: THROUGH, skip: myLeague, playerTeamId: "", pastSeasons: [] })
  const hurt = (t?.players ?? []).filter(p => inOther.has(p.teamId) && p.status === 'injured').length
  check('裏のリーグの選手も怪我をする（疲れた世界）', hurt > 0, `${hurt}人`)
}

console.log('[1] その日までの開催が全部走り、その日より後は走らない')
{
  let early = 0, late = 0, ran = 0
  for (const [id, lg] of Object.entries(L)) {
    if (id === myLeague) continue
    for (const r of lg.races) {
      if (r.date <= THROUGH && !r.results) early++
      if (r.date > THROUGH && r.results) late++
      if (r.results) ran++
    }
  }
  console.log(`      走った ${ran}本`)
  check('その日までの開催に走り残しが無い', early === 0, `${early}本`)
  check('その日より後の開催は走っていない', late === 0, `${late}本`)
  check('自チームのリーグは1本も走らせていない', L[myLeague].races.every(r => !r.results))
  const fl = L[FOREIGN_LEAGUE_DEFS[0].id]
  check('海外リーグの日程は日本1部と同じ10日', fl.races.length === 10
    && fl.races.every((r, i) => r.date === L[divisionLeagueId(1)].races[i].date))
}

console.log('[1b] 開催日ちょうどまで走らせると、その日の開催も走る（「その日を含む」）')
{
  // 1部の開幕日。海外9リーグも同じ日に開幕する
  const day = season.leagues[divisionLeagueId(1)].races[0].date
  const o = runLeaguesThrough({ season, players, clubs, through: day, skip: myLeague, playerTeamId: "", pastSeasons: [] })
  const onDay = Object.entries(o?.season.leagues ?? {}).filter(([id]) => id !== myLeague)
    .flatMap(([, lg]) => lg.races.filter(r => r.date === day))
  check('その日の開催が全部走っている', onDay.length > 0 && onDay.every(r => !!r.results), `${onDay.filter(r => !r.results).length}本残り／${onDay.length}本`)
}

console.log('[2] どのリーグの記録にも、そのリーグのクラブしか混ざらない')
{
  const mixed: string[] = []
  for (const [id, lg] of Object.entries(L)) {
    const members = new Set(lg.standings.map(s => s.teamId))
    const ok = lg.races.every(r => (r.results?.teamRankings ?? []).every(tr => members.has(tr.teamId)))
    if (!ok) mixed.push(id)
  }
  check('混ざっていない', mixed.length === 0, mixed.join('・'))
}

console.log('[3] 順位表は走行記録から数え直したものと同じ')
{
  let bad = 0
  for (const lg of Object.values(L)) {
    for (const s of lg.standings) {
      let pts = 0
      for (const r of lg.races) {
        const tr = r.results?.teamRankings?.find(x => x.teamId === s.teamId)
        if (tr) pts += tr.positionPoints + tr.segmentPoints
      }
      if (pts !== s.totalPoints) bad++
    }
  }
  check('全クラブの勝ち点が走行記録と一致', bad === 0, `${bad}クラブ`)
}

console.log('[4] 通算成績は走行記録から数え直す（日本の部と海外で置き場所を分けた集計は積まない）')
{
  const fromRecords = buildCareerCounts([out.season])
  // ★以前は国内の部＝awayAppearances、海外＝foreignAppearances に別々に積んでいた。
  //   走行記録が12リーグ全部に残るので、もう積まない（オーナー・2026-09-26「日本とか関係ない」）
  check('国内の部の集計（awayAppearances）を積んでいない', Object.keys(out.season.awayAppearances ?? {}).length === 0)
  check('海外の集計（foreignAppearances）を積んでいない', Object.keys(out.season.foreignAppearances ?? {}).length === 0)
  console.log(`      走った選手 ${fromRecords.size}人`)
  // ★空振り除け。走った選手が0人だと食い違いも0件になって緑になる
  check('空振りしていない（走った選手がいる）', fromRecords.size > 0)
  // 通算成績（選手に持たせている数）も走行記録と同じだけ増えている（日本の部の選手も海外の選手も）
  const before = new Map(players.map(p => [p.id, p.career.totalRaces]))
  const beforeWins = new Map(players.map(p => [p.id, p.career.segmentWins]))
  const grew = out.players.filter(p => (p.career.totalRaces - (before.get(p.id) ?? 0)) !== (fromRecords.get(p.id)?.totalRaces ?? 0)).length
  const grewWins = out.players.filter(p => (p.career.segmentWins - (beforeWins.get(p.id) ?? 0)) !== (fromRecords.get(p.id)?.segmentWins ?? 0)).length
  check('選手の通算出走も走行記録と同じだけ増えている', grew === 0, `${grew}人`)
  check('選手の通算区間賞も走行記録と同じだけ増えている', grewWins === 0, `${grewWins}人`)
}

console.log('[5] 日付の順に走る（同じリーグの2戦目は1戦目のあと）')
{
  // 走る順は結果の中に残らないので、同じリーグの中で「後の日付だけ走って前が残る」が無いことで見る
  let bad = 0
  for (const lg of Object.values(L)) {
    let seenUnrun = false
    for (const r of [...lg.races].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!r.results) seenUnrun = true
      else if (seenUnrun && r.date <= THROUGH) bad++
    }
  }
  check('前の日付を飛ばして走ったレースが無い', bad === 0, `${bad}本`)
  // 同じ日付にもう一度呼んでも何も走らない（二重に走らせない）
  const again = runLeaguesThrough({ season: out.season, players: out.players, clubs, through: THROUGH, skip: myLeague, playerTeamId: "", pastSeasons: [] })
  check('同じ日まで2回呼んでも2回目は何も走らない', again === null)
}

console.log('[6] ほかのリーグの区間新記録もニュースになる（オーナー・2026-09-28「直します」）')
{
  // 以前は区間新のニュースが自分のリーグ（本編の1戦）だけだった。
  // 戻し方：engine/leagueDay の runLeaguesThrough から detectSegmentRecords を消す
  // 同じ半年を「去年」として持たせ、もう一度走らせる＝どのコースにも前の記録がある
  const past = [{ ...out.season, year: YEAR - 1 }]
  seed = 7
  const again = runLeaguesThrough({ season, players, clubs, through: THROUGH, skip: myLeague, playerTeamId: '', pastSeasons: past })
  const news = again?.news ?? []
  const foreignIds = new Set(players.filter(p => FOREIGN_LEAGUE_DEFS.some(l => clubs.find(c => c.id === p.teamId)?.leagueId === l.id)).map(p => p.id))
  const foreignNews = news.filter(n => (n.relatedIds ?? []).some(id => foreignIds.has(id))).length
  console.log(`      区間新 ${news.length}件（海外リーグ ${foreignNews}件）`)
  check('ほかのリーグの区間新がニュースになる', news.length > 0 && news.every(n => n.headline.startsWith('【区間新記録】')), `${news.length}件`)
  check('海外リーグの区間新もニュースになる', foreignNews > 0, `${foreignNews}件`)
  // ★ニュースにするのは平均の格が SEGMENT_NEWS_MAX_AVG_TIER(9) 以下のリーグだけ（オーナー・2026-09-28「オセアニアまでやな」）
  //   戻し方：engine/leagueDay の `if (newsLeagues.get(d.leagueId))` を外す
  const leagueOfPlayer = new Map(players.map(p => [p.id, clubs.find(c => c.id === p.teamId)?.leagueId]))
  const newsFrom = new Set(news.map(n => leagueOfPlayer.get((n.relatedIds ?? [])[0] ?? '')))
  const want = new Set(Object.keys(L).filter(id => id !== myLeague && leagueMakesRecordNews(id, clubs)))
  console.log(`      ニュースを出すリーグ ${[...want].join('・')}`)
  check('線より下のリーグ（アジア・中米・南米・2部）の区間新はニュースにしない', [...newsFrom].every(id => id && want.has(id)),
    [...newsFrom].filter(id => !id || !want.has(id)).join('・'))
  check('線はオセアニアまで（平均の格9以下が7リーグ・自チームの3部を除く）',
    want.size === 7 && want.has('oceania') && !want.has(divisionLeagueId(2)), [...want].join('・'))
  // 過去のシーズンが無くても、同じ呼び名のコースを先に走ったリーグの記録が「前の記録」になる
  console.log(`      （過去のシーズン無しでも、同じ半年のうちに ${out.news.length}件）`)
}

console.log('')
if (problems.length === 0) {
  console.log(`✓ ほかのリーグは日付の順に走り、記録と集計は1つも食い違わない（${DIVISIONS.length}部＋海外${FOREIGN_LEAGUE_DEFS.length}リーグ）`)
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
