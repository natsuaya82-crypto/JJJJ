/**
 * 【日程・結果・順位表はリーグIDで引く／時計は日付1本】を見張る。
 *
 * ■なぜ要るのか（世界の一本化 P2・2026-09-25）
 *   シーズンの日程・結果・順位表が6つの入れ物に割れていた。
 *     国内：自分の部 `races` ／ 他の部 `divisionRaces` ／ 部ごとの `standings`
 *     海外：`foreignRaces` ／ `foreignStandings` ／ `foreignRaceIndex`
 *   読む側は「自分の部か・他の部か・海外か」で書き分け、ほかのリーグは
 *   「自チームの何戦目か」で進んでいた（3部で遊ぶと1部が7戦で止まり、海外は自チームの部の
 *   日程を借りて7戦しか走らない）。いまは `Season.leagues`（リーグID → 日程・順位表）1つで、
 *   ほかのリーグは日付で進む（`engine/leagueDay`）。
 *
 * ■見ること
 *   ① 旧い入れ物の名前が、旧い形を均す2か所（legacySeason / migrateSave）の外に無い
 *   ② Season の型に、自チームの日程・部ごとの順位表を直に持つ項目が戻っていない
 *   ③ 入口の数と、1本を通っている数（ほかのリーグを走らせる・順位表へ足す・自チームのリーグを引く）
 *   ④ 消した2本目（部ごと・海外ごとに進める関数）が戻っていない
 *   ⑤ 海外の日程は日本1部と同じ10日・同じコースの並び・呼び名は地域のもの
 *
 * ★コメントは外してから数える（経緯の説明文に旧い名前が出てくるため）。
 * ■わざと壊して落ちることを確かめた（各項の「戻し方」）
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { withForeignSchedules } from '../src/engine/leagueDay'
import { drawSeasonSchedules } from '../src/data/races'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { INITIAL_FOREIGN_CLUBS } from '../src/data/leagues'
import { divisionLeagueId, divisionLeagues, newSeasonStandings } from '../src/utils/league'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import type { ArchivedSeason, SeasonStanding, Team } from '../src/types'
import { hydratePastSeasons, stripArchivedResults, writeSeasonArchive } from '../src/store/seasonArchive'
import { writeArchive } from '../src/store/saveStorage'
import { saveSlotSuffix } from '../src/store/saveSlot'
import { archiveKeyOf, packRaceResults, type SeasonArchive } from '../src/utils/raceRecord'

const walkTs = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const q = join(dir, f)
  return statSync(q).isDirectory() ? walkTs(q) : /\.tsx?$/.test(q) ? [q] : []
})
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const srcFiles = walkTs('src')
const code = new Map(srcFiles.map(f => [f, strip(readFileSync(f, 'utf8'))]))
const allCode = [...code.values()].join('\n')

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const count = (re: RegExp, s: string) => (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length

// ── ① 旧い入れ物の名前 ─────────────────────────────────────────
console.log('[1] 旧い入れ物の名前は、旧い形を均す2か所の外に無い')
const LEGACY = /\b(?:divisionRaces|foreignRaces|foreignStandings|foreignRaceIndex)\b/
const LEGACY_OWNERS = ['src/store/persistence/legacySeason.ts', 'src/store/persistence/migrateSave.ts']
{
  // 網が死んでいないか：見本に当たる／置き場所でいまも当たる
  check('網：見本に当たる', ['season.divisionRaces', 'cs.foreignStandings ?? {}', 'foreignRaceIndex: 0', "raw['foreignRaces']"]
    .every(s => count(LEGACY, s) === 1))
  for (const f of LEGACY_OWNERS) check(`網：置き場所（${f}）でいまも当たる`, count(LEGACY, code.get(f) ?? '') > 0)
  // 戻し方：どこかの画面に `currentSeason.foreignStandings` と書く
  const leaks = srcFiles.filter(f => !LEGACY_OWNERS.includes(f))
    .flatMap(f => (code.get(f) ?? '').split('\n').filter(l => LEGACY.test(l)).map(l => `${f}: ${l.trim().slice(0, 80)}`))
  check('旧い名前が外に無い', leaks.length === 0, leaks.slice(0, 5).join(' ／ '))
}

// ── ② Season の型 ──────────────────────────────────────────
console.log('[2] Season の型に、日程・順位表を直に持つ項目が戻っていない')
{
  const types = code.get('src/types/index.ts') ?? ''
  const m = /export type Season = \{([\s\S]*?)\n\}/.exec(types)
  check('網：Season の型が見つかる', !!m)
  const body = m?.[1] ?? ''
  // 戻し方：Season に `races: Race[]` か `standings: …` を足す
  const direct = body.split('\n').filter(l => /^\s{2}(races|standings|divisionRaces|foreignRaces|foreignStandings|foreignRaceIndex)\??:/.test(l))
  check('races / standings / 部ごと・海外ごとの入れ物が無い', direct.length === 0, direct.join(' ／ '))
  check('leagues（リーグID → 日程・順位表）がある', /^\s{2}leagues: Record<LeagueId, LeagueSeason>/m.test(body))
  const arch = /export type ArchivedSeason = Pick<Season,([\s\S]*?)>/.exec(types)?.[1] ?? ''
  check('過去シーズンも leagues を残す', /'leagues'/.test(arch))
}

// ── ③ 入口の数と、1本を通っている数 ─────────────────────────────
console.log('[3] 入口の数と、1本を通っている数')
{
  const calls = (name: string) => count(new RegExp(`(?<!function )\\b${name}\\(`), allCode)
  const where = (name: string) => srcFiles.filter(f => new RegExp(`(?<!function )\\b${name}\\(`).test(code.get(f) ?? ''))
  // ほかのリーグを走らせるのは runLeaguesThrough 1本。呼ぶのは store の advanceLeaguesTo だけ
  // 戻し方：raceSlice から runLeaguesThrough を直に呼ぶ
  check('runLeaguesThrough を呼ぶのは1か所（store の advanceLeaguesTo）', calls('runLeaguesThrough') === 1
    && where('runLeaguesThrough')[0] === 'src/store/slices/competitionSlice.ts', where('runLeaguesThrough').join(', '))
  // advanceLeaguesTo を呼ぶのは runRace（ECLの前・本編の前）と endSeason（残り全部）の3回
  const adv = count(/\.advanceLeaguesTo\(/, allCode)
  check('advanceLeaguesTo を呼ぶのは3か所（ECLの前・本編の前・シーズン末）', adv === 3, `${adv}か所`)
  // 順位表へ足すのは utils/league の addRaceToStandings 1本
  //   （ほかのリーグ＝engine/leagueDay・自チームのリーグ＝raceSlice・結果からの数え直し＝divisionStandingsFromRaces）
  // 戻し方：raceSlice の自チームの順位表を手書きの map に戻す
  check('addRaceToStandings を通るのは3か所（ほかのリーグ・自チームのリーグ・数え直し）', calls('addRaceToStandings') === 3,
    `${calls('addRaceToStandings')}か所`)
  const handAdd = srcFiles.filter(f => f !== 'src/utils/league.ts' && /totalPoints:\s*\w+\.totalPoints\s*\+/.test(code.get(f) ?? ''))
  check('網：足し方の見本に当たる', /totalPoints:\s*\w+\.totalPoints\s*\+/.test('totalPoints: s.totalPoints + earned,'))
  check('順位表の行を手で足していない（totalPoints: s.totalPoints + …）', handAdd.length === 0, handAdd.join(', '))
  // 自チームのリーグを引くのは world 層の myLeagueId 1本
  // 戻し方：どこかで divisionLeagueId(divisionOf(myClub(…))) と書く
  check('myLeagueId を定義しているのは utils/world.ts だけ',
    srcFiles.filter(f => /export function myLeagueId\(/.test(code.get(f) ?? '')).join() === 'src/utils/world.ts')
  const bypass = srcFiles.filter(f => /divisionLeagueId\(\s*divisionOf\(\s*myClub/.test(code.get(f) ?? '')
    || (f !== 'src/utils/world.ts' && /leagueIdOfClub\([^)]*playerTeamId/.test(code.get(f) ?? '')))
  check('自チームのリーグを部番号や手書きで引いていない', bypass.length === 0, bypass.join(', '))
}

// ── ④ 消した2本目 ───────────────────────────────────────────
console.log('[4] 部ごと・海外ごとに「自チームの何戦目か」で進める関数が戻っていない')
{
  // 戻し方：engine/domesticLeague.ts を戻す
  const OLD = /\b(?:simulateAwayDivisions|applyAwayDivisionRound|applyRacedToSchedule|catchUpAwayDivisions|simulateForeignLeagueRound|advanceForeignLeagues)\b/
  const back = srcFiles.filter(f => OLD.test(code.get(f) ?? ''))
  check('無い', back.length === 0, back.join(', '))
  check('leagueDay は currentRaceIndex を見ていない（時計は日付）', !/currentRaceIndex/.test(code.get('src/engine/leagueDay.ts') ?? ''))
}

// ── ⑤ 海外の日程 ────────────────────────────────────────────
console.log('[5] 海外の日程は日本1部と同じ10日・同じコースの並び・呼び名は地域のもの')
{
  const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const schedules = drawSeasonSchedules(2031, () => 0.37)
  const leagues = withForeignSchedules(
    divisionLeagues(schedules, newSeasonStandings<SeasonStanding>(teams, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))),
    [...teams, ...INITIAL_FOREIGN_CLUBS])
  const top = leagues[divisionLeagueId(1)].races
  let dates = 0, courses = 0, ids = 0, jpNames = 0, rows = 0
  for (const l of FOREIGN_LEAGUES) {
    const rs = leagues[l.id]?.races ?? []
    if (rs.length !== top.length || rs.some((r, i) => r.date !== top[i].date)) dates++
    if (rs.some((r, i) => JSON.stringify(r.segments) !== JSON.stringify(top[i].segments))) courses++
    if (rs.some((r, i) => r.id !== `${top[i].id}@${l.id}`)) ids++
    if (rs.some((r, i) => r.name === top[i].name)) jpNames++
    if ((leagues[l.id]?.standings ?? []).length !== l.clubs.length) rows++
  }
  // 戻し方：withForeignSchedules の手本を2部（divisionLeagueId(2)）にする
  check('日本1部と同じ日付・同じ本数', top.length === 10 && dates === 0, `${dates}リーグ`)
  check('日本1部と同じコース（区間）', courses === 0, `${courses}リーグ`)
  check('レースIDは <1部のID>@<リーグID>（同じ日に9リーグが走っても分かれる）', ids === 0, `${ids}リーグ`)
  check('呼び名は地域のもの（国内の名前のまま走らない）', jpNames === 0, `${jpNames}リーグ`)
  check('順位表は全クラブぶん', rows === 0, `${rows}リーグ`)
  check('何度通しても同じ（冪等）', withForeignSchedules(leagues, [...teams, ...INITIAL_FOREIGN_CLUBS]) === leagues)
}

// ── ⑥ 別ファイルに出した過去シーズンの走行記録が、新しいキーでも旧いキーでも戻る ─────
// 過去シーズンの結果はセーブの外（store/seasonArchive）に置き、起動時に読み戻す。
// 国内の部がリーグになる前に書いた年は、キーが jpel（自分の部）／div-<部>（裏の部）。
// 読み戻しは packedRacesOfLeague 1本がどちらからでも拾う。
// 戻し方：packedRacesOfLeague から旧いキー（jpel / div-<部>）を外す
async function archiveRoundTrip() {
  console.log('[6] 別ファイルに出した過去シーズンの走行記録が戻る（新しいキーでも旧いキーでも）')
  const race = (id: string, teamId: string, pid: string) => ({
    id, name: id, date: '2029-04-01', location: '', type: 'league' as const, segments: [], conditions: {} as never,
    results: { teamRankings: [{ teamId, rank: 1, totalTimeSec: 3000, positionPoints: 20, segmentPoints: 3 }],
      segmentResults: [{ segmentIndex: 1, runners: [{ playerId: pid, teamId, timeSec: 1500, rank: 1 }] }] },
  })
  const past = {
    year: 2029,
    leagues: {
      [divisionLeagueId(1)]: { races: [race('race-d1-1', 'tokyo', 'p1'), race('race-d1-2', 'tokyo', 'p1')], standings: [] },
      [divisionLeagueId(2)]: { races: [race('race-d2-1', 'hakodate', 'p2')], standings: [] },
      asia_league: { races: [race('race-d1-1@asia_league', 'kor_1', 'p3')], standings: [] },
    },
  } as unknown as ArchivedSeason
  const resultsOf = (s: ArchivedSeason) => Object.values(s.leagues ?? {}).flatMap(l => l.races.map(r => !!r.results))
  // 新しいキーで書いて、外して、戻す
  const ok = await writeSeasonArchive(past)
  check('書き出せる（読み戻して一致）', ok)
  const stripped = stripArchivedResults([past], [2029])
  check('書き出した年は結果が外れる', resultsOf(stripped[0]).every(x => !x))
  const back = (await hydratePastSeasons(stripped, [2029]))[0]
  check('新しいキー（lg-<リーグID>）から全部戻る', resultsOf(back).every(x => x), JSON.stringify(resultsOf(back)))
  // 旧いキーで書いた年（自分の部＝jpel・裏の部＝div-2・海外＝lg-<リーグID>）
  const legacy: SeasonArchive = { year: 2029, races: {
    jpel: past.leagues![divisionLeagueId(1)].races.map(r => packRaceResults(r)!),
    'div-2': past.leagues![divisionLeagueId(2)].races.map(r => packRaceResults(r)!),
    'lg-asia_league': past.leagues!.asia_league.races.map(r => packRaceResults(r)!),
  } }
  await writeArchive(archiveKeyOf(2029, saveSlotSuffix()), JSON.stringify(legacy))
  const back2 = (await hydratePastSeasons(stripped, [2029]))[0]
  check('旧いキー（jpel / div-<部>）で書いた年も全部戻る', resultsOf(back2).every(x => x), JSON.stringify(resultsOf(back2)))
  check('戻った結果は元と同じ', JSON.stringify(back2.leagues) === JSON.stringify(back.leagues))
}

archiveRoundTrip().then(() => {
  console.log('')
  if (failed > 0) { console.log(`✗ 日程・結果・順位表の一本化が崩れています（${failed}件）`); process.exit(1) }
  console.log('✓ 日程・結果・順位表はリーグIDで引く1つの入れ物で、ほかのリーグは日付で進む')
}, e => { console.log(`✗ 例外: ${(e as Error).stack}`); process.exit(1) })
