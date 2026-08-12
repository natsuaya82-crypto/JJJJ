/**
 * 【代表候補と予選出場国の確認】選考が「できない」状態を作らない。
 *
 * ■なぜ要るのか
 *   v2.0.1 のユーザーから「日本代表20人を選考できず、結果だけが見れる」という報告があった。
 *   当時の候補は**記録会の持ちタイム順**で、タイムが無い選手は候補にすら入らなかった。
 *   記録会に出られる回数は所属で違う（国内7回／海外4回・しかも疲労40未満）ので、
 *     ・海外クラブに出した主力が代表に選ばれない
 *     ・国単位では「持ちタイムを持つ選手が0人」→ 国力0 → 予選の出場国から丸ごと消える
 *   というところまで繋がっていた。出場国から消えれば、当然その国の代表は選べない。
 *
 *   いまは候補＝**OVR上位100人**（ekidenCandidates 1本）。OVRは全選手が必ず持っているので、
 *   記録会を1回も走っていなくても候補は埋まり、国力も0にならない。
 *   さらにアジア予選には**自国を必ず入れる**（qualifierNations）。
 *
 *   ここでは「記録会を1度も走っていない世界」を作って、それでも
 *     ・候補が埋まる  ・国力が0にならない  ・日本が必ず予選に出る
 *   ことを確かめる。npm run check に入っている。
 */
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { ekidenCandidates, nationStrength, qualifierNations, qualHostForYear, NATIONAL_POOL } from '../src/engine/worldAthletics'
import { HOME_NATION, natGeoRegion, NATIONALITY_META } from '../src/data/nationalities'
import type { Nationality, Player, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}
const label = (n: Nationality) => NATIONALITY_META[n as keyof typeof NATIONALITY_META]?.label ?? n

const YEAR = 2039   // 奇数年＝アジア予選の年
const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const domestic = generateCpuRosters(teams, YEAR).cpuPlayers
const { players: foreign } = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
// ★生成直後の選手は eventBests を1つも持たない＝「記録会を一度も走っていない」状態そのもの
const players: Player[] = [...domestic, ...foreign]
const hasAnyTime = players.some(p => p.eventBests && Object.keys(p.eventBests).length > 0)
check('前提：記録会の持ちタイムを誰も持っていない状態で試す', !hasAnyTime)

// ── 候補 ──
//
// ★この節は「定数をそのまま読んで緑になる」形にしないこと。
//   以前は  check(`候補が ${NATIONAL_POOL} 人埋まる`, cands.length === NATIONAL_POOL)
//   と書いてあり、**NATIONAL_POOL を 100 から何に変えても緑のまま**だった。
//   `CPU_SELL_FLOOR` の点検が 16→15 に下げても緑だったのとまったく同じ形
//   （CLAUDE.md「点検が実装の定数をそのまま読んで緑になっていないか」）。
//   分けて釘を打つ:
//     ①仕様の釘   … 下限をリテラルで打つ（下げたら落ちる）
//     ②ふるまい   … limit を外から振って、実際にその人数だけ返ることを見る
//                    （定数を上げても候補が増えない、を捕まえる）
const jpAll = players.filter(p => p.nationality === HOME_NATION && p.status !== 'retired')

// ①仕様の釘。**リテラルで書くこと。**NATIONAL_POOL と比較しないこと
check('代表候補の枠は100人以上（仕様）', NATIONAL_POOL >= 100, `いま ${NATIONAL_POOL}`)

// ②ふるまい：候補の人数 = min(日本人の有効人数, limit)。limit を外から振って確かめる。
//   ここで定数を使わないので、NATIONAL_POOL を変えてもこの3件の期待値は動かない
const overCount = jpAll.length + 50
for (const [limit, want] of [[100, 100], [300, 300], [overCount, jpAll.length]] as const) {
  const n = ekidenCandidates(players, HOME_NATION, YEAR, limit).length
  check(`limit=${limit} を渡すと候補は ${want} 人（日本人の有効人数 ${jpAll.length}）`, n === want, `${n}人`)
}

// 既定（＝NATIONAL_POOL）で呼んだときも同じ決まりに乗っていること
const cands = ekidenCandidates(players, HOME_NATION, YEAR)
check('既定で呼ぶと min(日本人の有効人数, NATIONAL_POOL) 人',
  cands.length === Math.min(jpAll.length, NATIONAL_POOL), `${cands.length}人`)
check('候補はOVRの高い順', cands.every((c, i) => i === 0 || cands[i - 1].score >= c.score))

// 海外クラブに居る日本人が候補に入るか（旧仕様で落ちていたのがここ）
const foreignClubIds = new Set(FOREIGN_LEAGUES.flatMap(l => l.clubs).map(c => c.id))
const jpAbroad = players.filter(p => p.nationality === HOME_NATION && foreignClubIds.has(p.teamId ?? ''))
const jpAbroadIn = jpAbroad.filter(p => cands.some(c => c.player.id === p.id))
check('海外クラブの日本人も候補に入る', jpAbroad.length === 0 || jpAbroadIn.length > 0,
  `海外在籍の日本人 ${jpAbroad.length}人 / 候補入り ${jpAbroadIn.length}人`)

// ── 国力 ──
check('日本の国力が0にならない', nationStrength(players, HOME_NATION, YEAR) > 0)
const asia = ([...new Set(players.map(p => p.nationality))] as Nationality[])
  .filter(n => natGeoRegion(n) === 'アジア' || natGeoRegion(n) === 'オセアニア')
const zero = asia.filter(n => nationStrength(players, n, YEAR) === 0)
check('選手が居るアジア・オセアニアの国はどこも国力0にならない', zero.length === 0, zero.map(label).join('・'))

// ── 予選の出場国 ──
// 開催国が持ち回りでも、日本が枠から溢れないこと
const missed: number[] = []
for (let y = YEAR; y < YEAR + 20; y += 2) {
  const nations = qualifierNations(players, y, qualHostForYear(y))
  if (!nations.includes(HOME_NATION)) missed.push(y)
}
check('開催国が一巡しても日本は必ずアジア予選に出る', missed.length === 0, missed.join('・'))
console.log(`      （出場国は ${qualifierNations(players, YEAR, qualHostForYear(YEAR)).length} カ国／候補は ${asia.length} カ国）`)

// 日本を極端に弱くしても外れないこと（3部で低迷しても代表選考はできる、が要件）
const weakened = players.map(p => p.nationality === HOME_NATION
  ? { ...p, ratings: Object.fromEntries(Object.entries(p.ratings).map(([k]) => [k, 1])) as Player['ratings'] }
  : p)
const weakNations = qualifierNations(weakened, YEAR, qualHostForYear(YEAR))
check('日本が最弱でもアジア予選には出られる', weakNations.includes(HOME_NATION))

console.log('')
if (problems.length > 0) {
  console.log(`✗ 代表選考にたどり着けない状態があります（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ 記録会を走っていなくても候補は埋まり、日本は必ずアジア予選に出られる')
