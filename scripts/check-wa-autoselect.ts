/**
 * 【代表の「自動選出」の確認】おまかせが、CPU・海外国と同じ選び方を通っているか。
 *
 * ■なぜ要るのか
 *   駅伝20人の選び方は engine/worldAthletics の `autoSelectEkiden` 1本のはずだった。
 *   ところが選考画面（NationalSquadSelectPage）の「自動選出」ボタンだけが
 *   **自前で candidates を上から詰めていて**、engine 側が持っている
 *   「個人種目の代表は基本駅伝に入れない」を1行も通っていなかった。
 *
 *   通っていないと、おまかせを押した瞬間に 5000m・10000m・マラソンのエースが駅伝に入り、
 *   そのぶん `selectIndividualFields(excludeIds)` で個人種目から外れる。
 *   自分で自分の首を絞める編成になる。
 *
 *   CLAUDE.md の「候補の出どころが2本あるとズレる」がそのまま起きていた形
 *   （engine 側のコメントに、選考画面50人・CPU20人・国力上位7人と3通りに割れていた
 *     のを1本化した経緯が残っている。**画面だけ元に戻っていた**）。
 *
 * ■何を見るか
 *   ①ふるまい … 標準突破者を混ぜた世界で autoSelectEkiden を呼び、その選手が
 *                駅伝20人に入らないこと。除外を空にすると入る＝判定が効いていること
 *   ②入口     … 選考画面が autoSelectEkiden を呼んでいること（自前で並べ直していない）
 */
import { readFileSync } from 'node:fs'
import {
  autoSelectEkiden, ekidenCandidates, individualStarIds,
  WA_STANDARD, type Candidate,
} from '../src/engine/worldAthletics'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { HOME_NATION } from '../src/data/nationalities'
import { comparePlayers } from '../src/utils/playerSort'
import type { Player, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2039
const SQUAD = 20
const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const base = generateCpuRosters(teams, YEAR).cpuPlayers

// ── 世界を作る ────────────────────────────────────────────────
// 生成直後の選手は eventBests を持たない＝標準突破者が1人も居ない。
// そこで**OVR上位3人に標準突破のタイムを持たせる**（＝個人種目の代表になる）。
// 上位に置くのが肝心で、下位に置くと「そもそも20人に入らない」ので枝を通らない。
const jpTop = base.filter(p => p.nationality === HOME_NATION).sort(comparePlayers('ovr')).slice(0, 3)
const starIdsWanted = new Set(jpTop.map(p => p.id))
const players: Player[] = base.map(p => (starIdsWanted.has(p.id)
  ? { ...p, eventBests: { d10000: { timeSec: WA_STANDARD.d10000 - 10, year: YEAR } } } as Player
  : p))

const candidates: Candidate[] = ekidenCandidates(players, HOME_NATION, YEAR)
const stars = individualStarIds(players, HOME_NATION, YEAR)

// ── 前提（ここが崩れると下の判定が空回りする）──────────────────
check('前提：個人種目の標準突破者が居る', stars.size > 0, `${stars.size}人`)
check('前提：その突破者は駅伝候補の上位に居る（除外が効く位置）',
  jpTop.every(p => candidates.slice(0, SQUAD).some(c => c.player.id === p.id)),
  `候補上位${SQUAD}人に ${jpTop.filter(p => candidates.slice(0, SQUAD).some(c => c.player.id === p.id)).length}/3 人`)

// ── ①ふるまい ────────────────────────────────────────────────
const picked = autoSelectEkiden(candidates, stars, SQUAD)
check(`おまかせは ${SQUAD} 人を選ぶ`, picked.length === SQUAD, `${picked.length}人`)
check('選ばれた20人に重複が無い', new Set(picked.map(p => p.id)).size === picked.length)
const starsInSquad = picked.filter(p => stars.has(p.id))
check('個人種目の代表は駅伝20人に入らない', starsInSquad.length === 0,
  starsInSquad.map(p => p.name).join('・'))

// 除外を空にする＝**画面が自前で並べていたときと同じ状態**。そのときは入ってしまう。
// これが入らないなら、この点検は何も守っていない
const noExclude = autoSelectEkiden(candidates, new Set<string>(), SQUAD)
check('除外を空にすると個人種目の代表が入る（＝除外が効いていることの裏取り）',
  noExclude.some(p => stars.has(p.id)))

// 候補が足りないときはスターも含めて埋める（engine 側の既定のふるまい）
const tiny = candidates.slice(0, SQUAD)   // 上位20人＝ほぼ全員がスター候補を含む
const filled = autoSelectEkiden(tiny, new Set(tiny.map(c => c.player.id)), SQUAD)
check('除外しきると枠が埋まらないときは、除外した選手も入れて埋める',
  filled.length === SQUAD, `${filled.length}人`)

// ── ②入口 ────────────────────────────────────────────────────
// 画面が自前で並べ直していないこと。**このファイル1つだけを名指しで読む**
// （相対パスの字面で判定しない。深さの違うファイルを繋ぐと嘘になる）
const PAGE = 'src/components/international/NationalSquadSelectPage.tsx'
const src = readFileSync(PAGE, 'utf8')
check(`${PAGE} が autoSelectEkiden を呼んでいる`, /autoSelectEkiden\s*\(/.test(src))
check(`${PAGE} が individualStarIds を呼んでいる（除外を渡している）`,
  /individualStarIds\s*\(/.test(src))

console.log('')
if (problems.length > 0) {
  console.log(`✗ おまかせが engine と同じ選び方を通っていません（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ おまかせは autoSelectEkiden 1本を通り、個人種目の代表は駅伝に入らない')
