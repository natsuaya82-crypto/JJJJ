/**
 * 【年度表彰の選び方の確認】MVPと新人王が、部ごとに・決めた出走数の線で選ばれているか。
 *
 * ■なぜ要るのか
 *   新人王が**1部だけ空欄**になっていた。選び方が
 *     pickBest(rookieIds, 6) ?? pickBest(rookieIds, 3)
 *   と6戦の網を先に当てる形で、6戦に届くかどうかが**部で決まってしまう**ため。
 *   CPUの区間配置（engine/raceEngine の bgLineup）は能力だけで7人を選ぶので、
 *   名簿の強い1部では新人が7人枠に入れない。オーナー判断で3戦の1本にした。
 *
 *   MVPの6戦は別の線で、**触っていない**。ここで一緒に釘を打っておく
 *   （片方を動かすときにもう片方まで動かさないため）。
 *
 * ■ここで見ること
 *   ・新人王は3戦以上（2戦は選ばれない）
 *   ・該当ゼロの年は新人王なしで通る（例外にしない）
 *   ・MVPは6戦以上のまま
 *   ・**部ごとに別々に選ぶ**（1部MVP・2部MVP・3部MVP）
 */
import { computeSeasonAwards } from '../src/utils/awards'
import type { Division, Player, Race, SeasonAward } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2030

/** 新人（その年のドラフト指名選手）。draftRound が入っていることが条件 */
const rookie = (id: string): Player =>
  ({ id, name: id, teamId: 'a', status: 'active', age: 22, draftYear: YEAR, draftRound: 1, draftPick: 1 }) as unknown as Player
/** 新人ではない選手（前年のドラフト） */
const vet = (id: string): Player =>
  ({ id, name: id, teamId: 'a', status: 'active', age: 27, draftYear: YEAR - 5, draftRound: 1, draftPick: 1 }) as unknown as Player

/**
 * 「この選手が この順位で n 戦走った」だけを持つレースを n 本作る。
 * 区間は1つでよい（seasonStats は区間の走者を数えるだけ）。
 */
const racesFor = (rows: { id: string; races: number; rank: number }[]): Race[] => {
  const n = Math.max(0, ...rows.map(r => r.races))
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, name: `駅伝${i}`, date: `${YEAR}-03-01`, segments: [],
    results: {
      segmentResults: [{
        segmentIndex: 1,
        runners: rows.filter(r => r.races > i)
          .map(r => ({ playerId: r.id, teamId: 'a', rank: r.rank, timeSec: 1000 + r.rank })),
      }],
    },
  }) as unknown as Race)
}

// ───────────────────────────────────────────────────────────────
// ① 新人王は3戦以上
// ───────────────────────────────────────────────────────────────
console.log('\n① 新人王は3戦以上（オーナー判断・2026-08-12）')
{
  // 2戦しか走っていない新人と、3戦走った新人。2戦のほうが**成績は良い**
  // （「走った数が足りないから選ばれない」を見るので、順位で勝たせないと意味がない）
  const players = [rookie('r2'), rookie('r3')]
  const races = racesFor([
    { id: 'r2', races: 2, rank: 1 },   // 平均1.0 だが2戦
    { id: 'r3', races: 3, rank: 5 },   // 平均5.0 だが3戦
  ])
  const a = computeSeasonAwards(races, players, YEAR, 1)
  check('2戦の新人は選ばれない（成績が上でも）', a.rookieId !== 'r2', `${a.rookieId}`)
  check('3戦の新人が選ばれる', a.rookieId === 'r3', `${a.rookieId}`)
}
{
  // 全員2戦以下＝該当なしの年。**新人は居るが誰も届かない**世界を作ること
  // （新人が1人も居ない世界だと、この枝を通らずに素通りする）
  const players = [rookie('r1'), rookie('r2')]
  const races = racesFor([{ id: 'r1', races: 2, rank: 1 }, { id: 'r2', races: 1, rank: 1 }])
  const a = computeSeasonAwards(races, players, YEAR, 1)
  check('全員2戦以下なら新人王は該当なし', a.rookieId === undefined, `${a.rookieId}`)
  check('該当なしでも年の行は作られる（落とさない）', a.year === YEAR && a.division === 1)
}
{
  // 新人ではない選手（前年以前のドラフト）は、何戦走っても新人王にならない
  const players = [vet('v1'), rookie('r1')]
  const races = racesFor([{ id: 'v1', races: 10, rank: 1 }, { id: 'r1', races: 3, rank: 8 }])
  const a = computeSeasonAwards(races, players, YEAR, 1)
  check('その年のドラフト以外は新人王にならない', a.rookieId === 'r1', `${a.rookieId}`)
}
{
  // ★同じ年に入ったが**指名されていない**選手（draftRound が null）。
  //   育成契約（signDevProspect）は draftYear=その年 / draftRound=null で入るので、
  //   `draftYear === year` だけで数えると新人王の候補に混ざる。
  //   この枝を通す世界を作っていなかったので、判定から draftRound を外しても緑のままだった
  //   （逆向きに壊して初めて分かった。CLAUDE.md「壊しても落ちない網」）。
  const dev = ({ id: 'd1', name: 'd1', teamId: 'a', status: 'active', age: 18,
    draftYear: YEAR, draftRound: null, draftPick: null }) as unknown as Player
  const players = [dev, rookie('r1')]
  const races = racesFor([{ id: 'd1', races: 8, rank: 1 }, { id: 'r1', races: 3, rank: 9 }])
  const a = computeSeasonAwards(races, players, YEAR, 1)
  check('育成契約（指名されていない）は新人王にならない', a.rookieId === 'r1', `${a.rookieId}`)
}

// ───────────────────────────────────────────────────────────────
// ② MVPは6戦以上のまま（新人王を下げたついでに動かしていないこと）
// ───────────────────────────────────────────────────────────────
console.log('\n② MVPは6戦以上のまま')
{
  const players = [vet('v5'), vet('v6')]
  const races = racesFor([
    { id: 'v5', races: 5, rank: 1 },   // 平均1.0 だが5戦
    { id: 'v6', races: 6, rank: 9 },   // 平均9.0 だが6戦
  ])
  const a = computeSeasonAwards(races, players, YEAR, 1)
  check('5戦のMVP候補は選ばれない（成績が上でも）', a.mvpId !== 'v5', `${a.mvpId}`)
  check('6戦なら選ばれる', a.mvpId === 'v6', `${a.mvpId}`)
}
{
  // 3戦しか走っていない選手だけの年は、新人王は出てもMVPは出ない。
  // ここが「6と3が同じ線になっていないこと」の釘
  const players = [rookie('r3')]
  const races = racesFor([{ id: 'r3', races: 3, rank: 1 }])
  const a = computeSeasonAwards(races, players, YEAR, 1)
  check('3戦だけの年：新人王は出る', a.rookieId === 'r3', `${a.rookieId}`)
  check('3戦だけの年：MVPは出ない（6戦の線は別）', a.mvpId === undefined, `${a.mvpId}`)
}

// ───────────────────────────────────────────────────────────────
// ③ 部ごとに別々に選ぶ（分け方を壊していないこと）
// ───────────────────────────────────────────────────────────────
console.log('\n③ 部ごとに別々に選ぶ')
{
  // 同じ選手集合でも、渡す division が違えば別の表彰になる。
  // 1部・2部・3部それぞれで、その部のレースだけを渡す形（racesByDivision がやること）
  const awards: SeasonAward[] = []
  for (const [d, ids] of [[1, ['r1a', 'v1a']], [2, ['r2a', 'v2a']], [3, ['r3a', 'v3a']]] as [Division, string[]][]) {
    const players = [rookie(ids[0]), vet(ids[1])]
    const races = racesFor([{ id: ids[0], races: 6, rank: 2 }, { id: ids[1], races: 6, rank: 1 }])
    awards.push(computeSeasonAwards(races, players, YEAR, d))
  }
  check('3つの部それぞれで表彰が出る', awards.length === 3 && awards.every(a => a.mvpId && a.rookieId))
  check('部ごとに受賞者が違う', new Set(awards.map(a => a.mvpId)).size === 3,
    awards.map(a => a.mvpId).join(' / '))
  check('部の番号がそのまま入る', awards.map(a => a.division).join(',') === '1,2,3',
    awards.map(a => a.division).join(','))
}
{
  // 部を渡さない旧データの経路は、これまでどおり division を持たない
  const players = [rookie('r1')]
  const a = computeSeasonAwards(racesFor([{ id: 'r1', races: 6, rank: 1 }]), players, YEAR)
  check('部を渡さなければ division は入らない（旧データの経路）', a.division === undefined)
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ 年度表彰の選び方が変わっています（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ 新人王は3戦・MVPは6戦・部ごとに別々に選ばれている')
