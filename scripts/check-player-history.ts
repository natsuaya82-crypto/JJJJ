/**
 * 【選手詳細に出る「年ごとの記録」の確認】年をまたぐ表で、その年の事実がその年のまま出るか。
 *
 * ■なぜ要るのか
 *   年をまたいで並ぶ表は、うっかり「いまの値」で書いてしまうと過去が書き換わる。
 *   実際に2件あった。
 *
 *     ①在籍履歴の部  … `divisionOf(いまのチーム)` で引いていたので、降格した瞬間に
 *                       2部で走った年まで「JPEL 3部」に化けていた
 *     ②表彰のパッチ  … 部ごとに選んでいる（1部MVP・2部MVP・3部MVP）のに、
 *                       ラベルはどれも「2030年度MVP」で区別が付かなかった
 *
 *   どちらも「その年の事実は、その年のデータから引く」という同じ決まりで直る。
 *   この先も年ごとの表は増えるので、ここで釘を打っておく。
 *
 * ■節を2つに分けてある
 *   ①は utils/league の divisionInYear、②は utils/badges の getPlayerBadges。
 *   直す場所が違うので、落ちたときにどちらの話か分かるようにしている。
 */
import { divisionInYear, divisionOf, DIVISIONS } from '../src/utils/league'
import { getPlayerBadges } from '../src/utils/badges'
import type { Division, Player, SeasonAward, SeasonStanding, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const MY = 'tokyo'

// ───────────────────────────────────────────────────────────────
// ① 在籍履歴の部は「その年」から引く（divisionInYear）
//
//   1部 → 2部 → 3部 と2年つづけて降格したチームを作る。
//   いまの Team.division は 3部なので、現在値で引くと過去2年も3部になる。
// ───────────────────────────────────────────────────────────────
console.log('\n① 年ごとの部（utils/league の divisionInYear）')

/** その年、MY が div に居た、という順位表を1年ぶん作る */
const seasonOf = (year: number, div: Division) => ({
  year,
  standings: Object.fromEntries(DIVISIONS.map(d => [
    d,
    (d === div ? [{ teamId: MY, totalPoints: 0, raceResults: [] }] : []) as SeasonStanding[],
  ])) as Record<Division, SeasonStanding[]>,
})

const seasons = [seasonOf(2030, 1), seasonOf(2031, 2), seasonOf(2032, 3)]
const nowTeam = { id: MY, division: 3 } as Team   // いまは3部（2年で2つ落ちた）
const nowDiv = divisionOf(nowTeam)

check('前提：いまのチームの部は3部', nowDiv === 3, `${nowDiv}部`)
for (const [year, want] of [[2030, 1], [2031, 2], [2032, 3]] as const) {
  const got = divisionInYear(seasons, year, MY, nowDiv)
  check(`${year}年の部は ${want}部（いまの部ではなく、その年の順位表から）`, got === want, `${got}部`)
}

// 順位表を持たない年（古いセーブ）は、これまでどおり今の部で代用する
check('順位表に無い年は、渡した既定値（いまの部）に倒れる',
  divisionInYear(seasons, 2029, MY, nowDiv) === nowDiv)
check('順位表はあるが載っていないチームも、渡した既定値に倒れる',
  divisionInYear(seasons, 2030, 'sendai', nowDiv) === nowDiv)

// ★ここが本題。3年ぶんが全部同じ部になっていたら、現在値で引いている
const perYear = [2030, 2031, 2032].map(y => divisionInYear(seasons, y, MY, nowDiv))
check('降格した3年ぶんが同じ部にならない（現在値で引いていない）',
  new Set(perYear).size === 3, perYear.map(d => `${d}部`).join(' / '))

// ───────────────────────────────────────────────────────────────
// ② 表彰のパッチには部が入る（getPlayerBadges）
//
//   表彰は部ごとに選ばれる（utils/awards.ts の racesByDivision）。
//   同じ年に3人のMVPが居るので、ラベルで部が分からないと区別が付かない。
// ───────────────────────────────────────────────────────────────
console.log('\n② 表彰パッチの部（utils/badges の getPlayerBadges）')

const player = (id: string) => ({ id, nationality: 'JPN' } as Player)
const award = (year: number, division: Division | undefined, mvpId: string, rookieId: string): SeasonAward =>
  ({ year, ...(division != null ? { division } : {}), mvpId, rookieId })

const awards: SeasonAward[] = [
  award(2030, 1, 'p1', 'r1'),
  award(2030, 2, 'p2', 'r2'),
  award(2030, 3, 'p3', 'r3'),
  award(2029, undefined, 'p9', 'r9'),   // 部を持たない旧データの年
]
const src = { worldRecords: {}, japanRecords: {}, seasonAwards: awards } as Parameters<typeof getPlayerBadges>[1]
const labelOf = (id: string) => getPlayerBadges(player(id), src, 99)[0]?.label ?? ''
const keyOf = (id: string) => getPlayerBadges(player(id), src, 99)[0]?.key ?? ''

for (const [id, want] of [['p1', '1部'], ['p2', '2部'], ['p3', '3部']] as const) {
  check(`${want}MVPのラベルに「${want}」が入る`, labelOf(id).includes(want), labelOf(id))
}
for (const [id, want] of [['r1', '1部'], ['r2', '2部'], ['r3', '3部']] as const) {
  check(`${want}新人王のラベルに「${want}」が入る`, labelOf(id).includes(want), labelOf(id))
}
// ★同じ年の3人が全部同じ字なら、部を出していない
const mvpLabels = ['p1', 'p2', 'p3'].map(labelOf)
check('同じ年の1部・2部・3部MVPが同じ字にならない',
  new Set(mvpLabels).size === 3, mvpLabels.join(' / '))

// 部を持たない旧データの年は、これまでどおり部なしの字のまま
check('部を持たない旧データの年は「2029年度MVP」のまま', labelOf('p9') === '2029年度MVP', labelOf('p9'))
check('部を持たない旧データの年の新人王も部なしのまま', labelOf('r9') === '2029年度新人王', labelOf('r9'))

// ★key は Player.displayBadge に保存されている値なので、形を変えないこと。
//   変えると「名前の横に出すパッチ」に選んであったものが黙って消える
check('MVPの key は年だけのまま（displayBadge の保存値なので形を変えない）',
  keyOf('p2') === 'mvp-2030', keyOf('p2'))
check('新人王の key も年だけのまま', keyOf('r2') === 'rookie-2030', keyOf('r2'))

console.log('')
if (problems.length > 0) {
  console.log(`✗ 年ごとの記録が、その年のまま出ていません（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ 在籍履歴の部も表彰パッチの部も、その年のデータから出ている')
