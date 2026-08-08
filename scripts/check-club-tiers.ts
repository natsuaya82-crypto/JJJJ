/**
 * 格（クラブの規模）の初期値が、毎年の更新に使う式と食い違っていないかを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-club-tiers.ts --outfile=/tmp/cct.cjs && node /tmp/cct.cjs
 *
 * ■なぜ要るのか
 *   初期値（data/clubTiers.ts）は手で振ってあり、毎年の更新は順位から式で引き直す。
 *   この2つがズレていると、**1シーズン終えた瞬間に初期値が上書きされて消える**。
 *   実際に国内52件中36件がズレていたことがある（初期値 1部5〜12 / 更新側 5〜11 など）。
 *
 * ■確かめること
 *   1. 国内52件が tierFromDomesticRank(initialRank) と一致する
 *   2. 海外180件が tierFromForeignRank(リーグ, 初期順位, クラブ数) と一致する
 *   3. 帯（DOMESTIC_TIER_BAND / FOREIGN_TIER_BAND）の外に出ているクラブが無い
 *   4. 部の境目が重なっている（昇格したのに格が下がる、が起きない）
 */
import { CLUB_TIER_BY_ID } from '../src/data/clubTiers'
import {
  tierFromDomesticRank, tierFromForeignRank, tierOfClubId,
  DOMESTIC_TIER_BAND, FOREIGN_TIER_BAND, DOMESTIC_CLUB_COUNT,
} from '../src/utils/clubTier'
import { DIVISIONS, DIVISION_SIZE, divisionOf, domesticThroughRank } from '../src/utils/league'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import type { Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]

console.log('[1] 国内52件：初期値 = tierFromDomesticRank(初期順位)')
{
  const bad: string[] = []
  for (const t of teams) {
    const want = tierFromDomesticRank(t.initialRank)
    const got = CLUB_TIER_BY_ID[t.id]
    if (got !== want) bad.push(`${t.shortName}(順位${t.initialRank}) 表${got} ≠ 式${want}`)
  }
  console.log(`  ${teams.length}クラブを突き合わせ`)
  for (const b of bad.slice(0, 8)) console.log(`    ${b}`)
  check('1件もズレていない', bad.length === 0, `${bad.length}件ズレ`)
}

console.log('')
console.log('[2] 海外180件：初期値の並びと、毎年の更新の配り方が同じか')
{
  // 海外クラブに「初期順位」の項目は無く、初期値は scripts/draft-club-tiers.ts の
  // CITY_ORDER（手で振った強さ順）で配ってある。順位そのものは比べられないが、
  // **配り方（カーブ）が同じなら、リーグ内に出てくる格の顔ぶれは一致するはず**。
  // 一致しなければ、1シーズン終えた瞬間に初期値が別の分布へ塗り替わる。
  // 格1は初期の数クラブ固定で、順位で1に上がることはない（tierFromForeignRank が最低2を返す）。
  // これは仕様なので、格1のクラブは両側から同じ数だけ外して比べる。
  let bad = 0
  for (const l of FOREIGN_LEAGUES) {
    const all = l.clubs.map(c => tierOfClubId(c.id)).sort((a, b) => a - b)
    const tier1 = all.filter(v => v === 1).length
    const stored = all.slice(tier1)
    const byRule = l.clubs.map((_, i) => tierFromForeignRank(l.id, i + 1, l.clubs.length)).sort((a, b) => a - b).slice(tier1)
    const same = stored.length === byRule.length && stored.every((v, i) => v === byRule[i])
    if (!same) {
      bad++
      console.log(`    ${l.id}（格1のクラブ ${tier1}件を除く）`)
      console.log(`      初期値 ${stored.join(',')}`)
      console.log(`      更新式 ${byRule.join(',')}`)
    }
  }
  check('全9リーグで配り方が一致する', bad === 0, `${bad}リーグが食い違い`)
}

console.log('[3] 帯の外に出ているクラブが無い')
{
  const badD = teams.filter(t => {
    const [lo, hi] = DOMESTIC_TIER_BAND[divisionOf(t)]
    const tier = tierOfClubId(t.id)
    return tier < lo || tier > hi
  })
  const badF: string[] = []
  for (const l of FOREIGN_LEAGUES) {
    const band = FOREIGN_TIER_BAND[l.id]
    if (!band) { badF.push(`${l.id} に帯が無い`); continue }
    for (const c of l.clubs) {
      const tier = tierOfClubId(c.id)
      if (tier < band[0] || tier > band[1]) badF.push(`${c.shortName}(${l.id}) 格${tier} は帯[${band[0]}-${band[1]}]の外`)
    }
  }
  for (const b of badF.slice(0, 5)) console.log(`    ${b}`)
  check('国内が部の帯に収まっている', badD.length === 0, `${badD.length}件`)
  check('海外がリーグの帯に収まっている', badF.length === 0, `${badF.length}件`)
  check('全9リーグに帯がある', Object.keys(FOREIGN_TIER_BAND).length === FOREIGN_LEAGUES.length)
}

console.log('')
console.log('[4] 部の境目が重なっている（昇格したのに格が下がる、が起きない）')
{
  console.log('  部  帯        最下位の格 → 次の部の首位の格')
  let ok = true
  for (let i = 0; i < DIVISIONS.length; i++) {
    const d = DIVISIONS[i]
    const [lo, hi] = DOMESTIC_TIER_BAND[d]
    const lastRank = domesticThroughRank(d, DIVISION_SIZE[d])
    const lastTier = tierFromDomesticRank(lastRank)
    const nextTop = i + 1 < DIVISIONS.length ? tierFromDomesticRank(domesticThroughRank(DIVISIONS[i + 1], 1)) : null
    console.log(`  ${d}部  [${lo}-${hi}]     ${lastTier}${nextTop != null ? ` → ${nextTop}` : ''}`)
    if (nextTop != null && nextTop < lastTier) ok = false
  }
  check('下の部の首位が、上の部の最下位より格上にならない', ok)
  // 1部1位が国内の頂点
  check('1部1位が国内で一番格上', tierFromDomesticRank(1) === Math.min(...teams.map(t => tierFromDomesticRank(t.initialRank))))
  check('通し順位の最大が3部最下位', tierFromDomesticRank(DOMESTIC_CLUB_COUNT) === 20)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 232クラブの格は初期値も毎年の更新も同じ式から出ている')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
