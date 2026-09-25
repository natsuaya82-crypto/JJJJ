/**
 * 【世界の層（クラブを探す・書くのは1か所だけ）】
 *
 * ■なぜ要るのか（オーナー・2026-09-25）
 *   「コードが今がんじがらめやから、しっかりはルール作って今後誰がいじっても壊れないように」
 *
 *   クラブは国内の `teams`（52）と海外の `foreignLeagues[].clubs`（180）の2つの入れ物に分かれていて、
 *   自チームを引く `teams.find(t => t.id === playerTeamId)` が**約50か所に手書き**されていた。
 *   自チームが海外クラブになると全部が undefined になり、`divisionOf(undefined)` が1部に倒れる。
 *   引き方を1本（`utils/world.ts` の `myClub` / `withMyClub`）にして、ここで数える。
 *
 * ■何を見るか
 *   [1] 自チームを引く手書き（`.find(t => t.id === …playerTeamId)`）が層の外に**0件**
 *   [2] 自チームへの手書きの書き込み（`.map(t => t.id === …playerTeamId ? …`）が層の外に**0件**
 *   [3] 層の外で入れ物（`clubs`、旧い `teams` / `foreignLeagues`）を直に find / filter / map / for-of /
 *       スプレッド / 添字 … する数が**0件**。1件でもあれば落ちる（予算の fixture は置かない）。
 *       層の外は `utils/world.ts` の関数（`clubById` / `clubsWhere` / `mapClubs` / `clubMap` /
 *       `clubsInLeague` / `jpelClubs` …）を通すこと
 *   [4] 入れ物は1つ——`GameState` に `teams` / `foreignLeagues` が無く、`clubs` がある。
 *       旧い名前を state として読み書きしてよいのは、旧い形を均す2本（`LEGACY`）だけ
 *   [5] 実物で確かめる——232クラブが12リーグにちょうど1回ずつ入っている／海外クラブが自チームでも
 *       `myClub` が引ける（国内だけを探す形に戻ると undefined になる）
 *   [0] 網が死んでいないか——上の正規表現が、わざと書いた違反の見本に**当たる**こと
 *
 * ■層の中
 *   `src/utils/world.ts`（入れ物の核。実行時の import を持たない）と
 *   `src/utils/clubs.ts`（画面用の見た目 Club・索引・海外リーグの引き場所）の2本。
 *   核を分けたのは循環 import のため（league.ts / clubTier.ts からも呼ばれる）。
 *
 * ■あえて外すもの（「漏れた」と「あえて」を区別する）
 *   ファイルごと外すのは `EXEMPT`、式1つだけ外すのは `ALLOWED_EXPR`（どちらも理由つき）。
 *   `ALLOWED_EXPR` は**いまも当たること**も確かめる（当たらない許可は消すこと）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { INITIAL_FOREIGN_CLUBS, WORLD_LEAGUES } from '../src/data/leagues'
import { clubsInLeague, divisionLeagueId, myClub } from '../src/utils/world'
import type { WorldClub } from '../src/types'

const LAYER = new Set(['src/utils/world.ts', 'src/utils/clubs.ts'])
const EXEMPT: Record<string, string> = {
  // 旧セーブの生の形（Record<string, unknown>）を読む凍結コード。
  // 当時の形のまま読むのが仕事なので、いまの層の型は通らない
  'src/store/persistence/migrateSave.ts': '旧セーブの生の形を読む移行コード（当時の形で凍結）',
}
// 旧い形（teams / foreignLeagues）を state として読み書きしてよいのはここだけ
const LEGACY = new Set(['src/store/persistence/migrateSave.ts', 'src/store/persistence/legacyWorld.ts'])
// 式1つだけの許可。**世界のクラブではない `teams`**（オンライン対戦の出場チーム＝サーバーが返す形の
// フィールド名で、変えるとサーバーと食い違う）
const ALLOWED_EXPR: Record<string, Record<string, string>> = {
  'src/components/online/RacePanel.tsx': {
    'payload.teams.map': 'オンライン対戦の出場チーム（MatchRacePayload.teams）',
    'of payload.teams': 'オンライン対戦の出場チーム（MatchRacePayload.teams）',
  },
  'src/components/online/FinishPanel.tsx': {
    'of r.teams': 'オンライン対戦の出場チーム（MatchRacePayload.teams）',
    'payload.teams.map': 'オンライン対戦の出場チーム（MatchRacePayload.teams）',
  },
}

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** コメントを外す（経緯の説明文に当たって落ちないため）。文字列の中の // は雑に残る */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// [1] 自チームを引く手書き。`t.id === playerTeamId` の向きも逆向きも見る
const SELF_FIND = /\.find\(\s*\(?(\w+)\)?\s*=>\s*(?:\1\.id\s*===\s*[\w.()]*\bplayerTeamId\b|[\w.()]*\bplayerTeamId\s*===\s*\1\.id)\s*\)/g
// [2] 自チームだけを書き換える三項
const SELF_WRITE = /\.map\(\s*\(?(\w+)\)?\s*=>\s*(?:\1\.id\s*===\s*[\w.()]*\bplayerTeamId\b|[\w.()]*\bplayerTeamId\s*===\s*\1\.id)\s*\?/g
// [3] 入れ物を直に触る（メソッド・長さ・for-of・スプレッド・添字）
const BOX = '(?:clubs|teams|foreignLeagues)'
// 入れ物までの道筋（`state.` / `get().` / `useGameStore.getState().` …）。関数の引数（`jpelClubs(s.clubs)`）は含めない
const PATH = '(?:\\w+(?:\\(\\))?\\??\\.)*'
const RAW = new RegExp(
  `${PATH}\\b${BOX}\\s*(?:\\?\\.|\\.)\\s*(?:find|filter|map|some|every|flatMap|forEach|reduce|reduceRight|findIndex|findLast|findLastIndex|length|slice|sort|toSorted|includes|indexOf|concat|entries|keys|values|at|join)\\b`
  + `|\\bof\\s+${PATH}${BOX}\\b`
  + `|\\.\\.\\.\\s*${PATH}${BOX}\\b`
  + `|\\b${BOX}\\s*\\[`, 'g')
// [4] 旧い名前を state として読む・書く（`s.teams` / `teams:` / `foreignLeagues` の識別子）
const LEGACY_NAME = /(?<![\w/'"`-])foreignLeagues\b|\b(?:s|st|state|store|get\(\)|getState\(\)|prev|next|draft|current|world|w)\??\.teams\b/g

const count = (re: RegExp, s: string) => (s.match(re) ?? []).length

// ── [0] 網が生きているか ──
console.log('[0] 網が死んでいないか')
const samples = {
  find: [
    'const me = teams.find(t => t.id === playerTeamId)',
    'const me = state.teams.find(t => t.id === state.playerTeamId)',
    'useGameStore(s => s.teams.find((x) => x.id === s.playerTeamId))',
    'const me = teams.find(t => get().playerTeamId === t.id)',
  ],
  write: [
    'teams: s.teams.map(t => t.id === s.playerTeamId ? { ...t } : t)',
    'teams: state.teams.map(t =>\n  t.id === state.playerTeamId\n    ? { ...t } : t)',
  ],
  raw: [
    'state.teams.filter(x => x)', 'for (const c of s.foreignLeagues) {}', 'teams?.map(t => t)',
    'state.clubs.find(c => c.id === id)', 'clubs.filter(c => c)', 'for (const c of get().clubs) {}',
    'const all = [...clubs]', 'const n = world.clubs.length', 'clubs[0]', 'clubs.flatMap(c => [c])',
    'for (const c of useGameStore.getState().clubs) {}', 'const all = [...get().clubs]',
  ],
  legacy: ['const t = s.teams', 'set({ foreignLeagues: x })', 'get().teams', 'const { foreignLeagues } = state'],
}
check('自チームを引く手書きの見本に全部当たる', samples.find.every(s => count(SELF_FIND, s) === 1))
check('自チームへの書き込みの見本に全部当たる', samples.write.every(s => count(SELF_WRITE, s) === 1))
check('入れ物の直読みの見本に全部当たる', samples.raw.every(s => count(RAW, s) === 1),
  samples.raw.filter(s => count(RAW, s) !== 1).join(' ／ '))
check('旧い名前の見本に全部当たる', samples.legacy.every(s => count(LEGACY_NAME, s) === 1),
  samples.legacy.filter(s => count(LEGACY_NAME, s) !== 1).join(' ／ '))
check('層の関数を通す形・画面の道筋には当たらない',
  count(RAW, 'clubById(clubs, id); clubsWhere(clubs, c => c); mapClubs(state.clubs, f); for (const t of jpelClubs(s.clubs)) {}; [...jpelClubs(state.clubs)]') === 0
  && count(LEGACY_NAME, "navigate('/teams/foo'); import x from './foreignLeagues'; import y from '../teams/StandingsTable'") === 0)
check('ほかのクラブを引く形には当たらない',
  count(SELF_FIND, 'teams.find(t => t.id === teamId)') === 0
  && count(SELF_FIND, 'results.teamRankings.find(r => r.teamId === playerTeamId)') === 0)

// ── 数える ──
const selfFind: string[] = []
const selfWrite: string[] = []
const raw: string[] = []
const legacyHits: string[] = []
const allowedHit = new Set<string>()
let layerHasMyClub = false
let myClubCalls = 0
let withMyClubCalls = 0
for (const f of walk('src')) {
  const code = stripComments(readFileSync(f, 'utf8'))
  if (f === 'src/utils/world.ts') {
    layerHasMyClub = /export function myClub\b/.test(code) && /export function withMyClub\b/.test(code)
    // 核は実行時の import を持たない（循環して最上位の定数が未初期化のまま読まれるため）
    check('world.ts は実行時の import を持たない', !/^import (?!type\b)/m.test(code))
  }
  if (LAYER.has(f)) continue
  myClubCalls += count(/\bmyClub\((?!\))/g, code)
  withMyClubCalls += count(/\bwithMyClub\(/g, code)
  if (!LEGACY.has(f)) {
    const nl = count(LEGACY_NAME, code)
    if (nl) legacyHits.push(`${f} ${nl}件`)
  }
  if (EXEMPT[f]) continue
  const nf = count(SELF_FIND, code)
  const nw = count(SELF_WRITE, code)
  if (nf) selfFind.push(`${f} ${nf}件`)
  if (nw) selfWrite.push(`${f} ${nw}件`)
  const hits = (code.match(RAW) ?? []).filter(m => {
    const why = ALLOWED_EXPR[f]?.[m.trim()]
    if (why) allowedHit.add(`${f}|${m.trim()}`)
    return !why
  })
  if (hits.length) raw.push(`${f} ${hits.length}件（${[...new Set(hits)].join(', ')}）`)
}

console.log('[1][2] 自チーム')
check('層に myClub / withMyClub がある', layerHasMyClub)
// 空振り除け：置き換えた先が本当に使われているか（0なら網の前提が崩れている）
check('myClub が使われている', myClubCalls >= 40, `${myClubCalls}件`)
check('withMyClub が使われている', withMyClubCalls >= 9, `${withMyClubCalls}件`)
check('自チームを引く手書きが層の外に無い（myClub を使う）', selfFind.length === 0, selfFind.join(' ／ '))
check('自チームへの手書きの書き込みが層の外に無い（withMyClub を使う）', selfWrite.length === 0, selfWrite.join(' ／ '))

// ── [3] 入れ物の直読み（0件）──
console.log('[3] 層の外で入れ物を直に触っていない')
check('層の外で入れ物（clubs / teams / foreignLeagues）を直に触っていない（utils/world.ts の関数を使う）',
  raw.length === 0, raw.join(' ／ '))
const deadAllow = Object.entries(ALLOWED_EXPR).flatMap(([f, m]) => Object.keys(m).map(e => `${f}|${e}`))
  .filter(k => !allowedHit.has(k))
check('式1つの許可（ALLOWED_EXPR）がいまも当たっている（当たらない許可は消すこと）',
  deadAllow.length === 0, deadAllow.join(' ／ '))

// ── [4] 入れ物は1つ ──
console.log('[4] 入れ物は1つ')
const types = stripComments(readFileSync('src/types/index.ts', 'utf8'))
// 型の本体（`export interface X {` / `export type X = {` から最初の行頭の `}` まで）。見つからなければ null
const typeBody = (name: string): string | null => {
  const m = new RegExp(`^export (?:interface ${name}\\b[^{]*|type ${name}\\s*=\\s*)\\{`, 'm').exec(types)
  if (!m) return null
  const rest = types.slice(m.index)
  return rest.slice(0, rest.indexOf('\n}'))
}
const gsBody = typeBody('GameState')
const teamBody = typeBody('Team')
check('GameState と Team の型を見つけられる（網の前提）', gsBody != null && teamBody != null)
check('GameState に clubs がある', /^\s*clubs\s*:/m.test(gsBody ?? ''))
check('GameState に teams / foreignLeagues が無い', gsBody != null && !/^\s*(?:teams|foreignLeagues)\s*\??:/m.test(gsBody))
check('Team に division が無い（部は所属リーグ leagueId から出す）',
  teamBody != null && !/^\s*division\s*\??:/m.test(teamBody) && /^\s*leagueId\s*:/m.test(teamBody))
check(`旧い名前（teams / foreignLeagues）を state として読み書きするのは ${[...LEGACY].join('・')} だけ`,
  legacyHits.length === 0, legacyHits.join(' ／ '))

// 2つの入れ物を前提にした関数（国内用と海外用の2本立て）。1つにしたので戻さないこと
const TWO_BOX_FNS = ['teamById', 'allTieredClubs', 'allForeignClubs', 'foreignClubIdSet', 'domesticTeamIdSet',
  'leagueOfClub', 'clubOfTeam', 'clubOfForeign', 'teamsInDivision']
const twoBox: string[] = []
for (const f of walk('src')) {
  const code = stripComments(readFileSync(f, 'utf8'))
  for (const fn of TWO_BOX_FNS) if (new RegExp(`\\b${fn}\\b`).test(code)) twoBox.push(`${f}（${fn}）`)
}
check('国内用・海外用の2本立ての関数が戻っていない', twoBox.length === 0, twoBox.join(' ／ '))

// ── [5] 実物で確かめる ──
console.log('[5] 実物で確かめる')
const world: WorldClub[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS, ...INITIAL_FOREIGN_CLUBS]
const perLeague = WORLD_LEAGUES.map(l => clubsInLeague(world, l.id).length)
check('リーグは12本', WORLD_LEAGUES.length === 12)
check('日本のリーグのID（data/leagues の表）が divisionLeagueId と一致する',
  ([1, 2, 3] as const).every(d => WORLD_LEAGUES.find(l => l.division === d)?.id === divisionLeagueId(d)))
check('232クラブが12リーグのどれかにちょうど1回ずつ入っている',
  world.length === 232 && perLeague.reduce((a, b) => a + b, 0) === 232 && new Set(world.map(c => c.id)).size === 232,
  `クラブ${world.length}・リーグ別${perLeague.join('/')}`)
const foreignMe = INITIAL_FOREIGN_CLUBS[INITIAL_FOREIGN_CLUBS.length - 1]
check('自チームが海外クラブでも myClub が引ける',
  myClub({ clubs: world, playerTeamId: foreignMe.id })?.id === foreignMe.id)
check('自チームが国内クラブでも myClub が引ける',
  myClub({ clubs: world, playerTeamId: 'tokyo' })?.id === 'tokyo')

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
process.exit(failed === 0 ? 0 : 1)
