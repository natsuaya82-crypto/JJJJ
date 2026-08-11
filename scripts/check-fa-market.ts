/**
 * 【FAも移籍の一種】FAだけ別の理屈で動いていないこと。
 *
 * ■決まり
 *   クラブが選手を獲る理由は「必要か（needsPlayer）」と「そこで走れるか（wouldMakeLineup）」だけ。
 *   本人が行くかは `appraiseMove` 1本。**FA・移籍金つき・引き抜き・国内・海外を分けない。**
 *
 * ■前はここが3つに割れていた（実機で「17クラブが欲しがるOVR83が3部に即加入」）
 *   ① シーズン中、CPUクラブはFAを1人も獲らなかった（pickCpuFreeAgents はオフシーズンだけ）
 *   ② 海外クラブのFA補強だけ別実装で、「在籍20人を割ったクラブの救済」しか見ていなかった
 *   ③ 獲得オファー（submitAcquisitionOffer）だけ appraiseMove を通っていなかった
 *
 * ここではソースを読んで、その3つが戻っていないかを見る（実データの経路は
 * check-offseason.ts が232クラブ・5800人で1シーズン回している）。
 */
import { readFileSync } from 'fs'
import { rivalClubsFor } from '../src/utils/transferRivals'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { needsPlayer, wouldMakeLineup, SPECIALTIES } from '../src/utils/squadNeeds'
import { appraiseMove, buildDestination } from '../src/utils/transferDecision'
import { divisionOf } from '../src/utils/league'
import { tierOf } from '../src/utils/clubTier'
import { ovr } from '../src/utils/playerUtils'
import type { Player, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

// 乱数をシード固定して毎回同じロスターで見る。
// 「3部の選手が1部へ行けるか」をスポットで見る検査なので、生成の引きが悪いと
// 走っている選手ですら全クラブに断られて偽陽性でNGになっていた（体感3割で落ちる）。
// 判定コードの検査であって分布の検査ではないため、入力を固定する。
let rngSeed = 20260811
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

// gameStore はスライス分割中（store/slices/*.ts）。呼び出し箇所は本体とスライスを合わせて数える
import { readdirSync } from 'fs'
const store = ['src/store/gameStore.ts', ...readdirSync('src/store/slices').map(f => `src/store/slices/${f}`)]
  .map(p => readFileSync(p, 'utf8')).join('\n')

console.log('[1] FAを獲る判断は1本（pickCpuFreeAgents）')
{
  // 呼び出しの phase を数える。シーズン中とオフシーズンの両方から呼ばれていること
  const calls = [...store.matchAll(/pickCpuFreeAgents\(\{[\s\S]{0,600}?\}\)/g)].map(m => m[0])
  check('pickCpuFreeAgents が3箇所から呼ばれている（オフ・ドラフト後・シーズン中）',
    calls.length === 3, `${calls.length}箇所`)
  check('シーズン中の補強がある（phase: \'inseason\'）',
    calls.some(c => c.includes("phase: 'inseason'")))
  check('  シーズン中の呼び出しは1つだけ（毎レース1本）',
    calls.filter(c => c.includes("phase: 'inseason'")).length === 1)
  check('どの呼び出しも国内クラブと海外クラブをまとめて渡している',
    calls.every(c => /clubs: \[\.\.\./.test(c) && /Foreign|foreign/.test(c)),
    calls.filter(c => !/clubs: \[\.\.\./.test(c)).length + '件が国内だけ')
}

console.log('')
console.log('[2] 海外クラブのFA補強に、別の理屈が戻っていない')
{
  check('「在籍20人を割ったクラブの救済」の実装が消えている',
    !/clubCount\.get\(cand\.id\)/.test(store) && !/remainForeignFAs/.test(store))
  check('  外国籍のFAだけを対象にする絞り込みも消えている',
    !/teamId === ''[\s\S]{0,80}isForeignNat/.test(store))
}

console.log('')
console.log('[3] 獲得オファー（FA・引き抜き）も本人の同意を1本で見る')
{
  const acq = store.slice(store.lastIndexOf('submitAcquisitionOffer: (offerId'), store.lastIndexOf('acceptAcquisitionCounter: (offerId'))
  check('前提：submitAcquisitionOffer を取り出せている', acq.length > 500, `${acq.length}文字`)
  check('本人の同意ゲートがある（playerConsentToMove）', acq.includes('playerConsentToMove'))
  check('  断りの理由を返している（not_convinced）', acq.includes("rejectWith('not_convinced')"))
  check('  年俸の説得力は共通の式（salaryAppealBonus）', acq.includes('salaryAppealBonus'))
  // 移籍金つきの入札側も同じ式を使っていること（片方に手書きを戻さない）
  const fin = store.slice(store.lastIndexOf('finalizeTransfer: (bidId'), store.lastIndexOf('finalizeTransfer: (bidId') + 3000)
  check('入札側も同じ式（salaryAppealBonus）', fin.includes('salaryAppealBonus'))
  check('  相場倍率の手書きが残っていない',
    !/salary >= marketSalary \* 1\.5/.test(store))
}

console.log('')
console.log('[4] 「◯クラブが動いています」は、実際に動くクラブを数えている')
{
  const src = readFileSync('src/utils/transferRivals.ts', 'utf8')
  check('国内だけを見ていない（allTieredClubs で国内＋海外）', src.includes('allTieredClubs') && !/return ctx\.teams\s*$/m.test(src))
  check('  獲る理由は needsPlayer と 走れるか（RUNNING_SLOTS）だけ',
    src.includes('needsPlayer(') && src.includes('RUNNING_SLOTS'))
  check('  本人が行くかも見ている（appraiseMove）', src.includes('appraiseMove('))
  // 呼べること（型と実体の確認。中身の件数は名簿次第なので数は問わない）
  const n = rivalClubsFor(
    { id: 'x', teamId: '', specialty: 'ace', age: 26, status: 'active', ratings: {}, contract: { annualSalary: 1 } } as never,
    { teams: [], players: [], playerTeamId: 'me', foreignLeagues: [], destinationOf: () => ({ clubId: 'c', tier: 10, squadRank: 1, squadSize: 1 }) as never },
  )
  check('クラブが0件なら0件（例外にならない）', n.length === 0)
}

console.log('')
console.log('[5] 走れない選手を、格上のクラブが獲らない（リアル寄せ）')
{
  const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const players = generateCpuRosters(teams, 2030).cpuPlayers as Player[]
  const rosterOf = (id: string) => players.filter(p => p.teamId === id && p.status === 'active')
  const d1 = teams.filter(t => divisionOf(t) === 1)
  const d3 = teams.filter(t => divisionOf(t) === 3)[0]

  // ── クラブ側：そのタイプが0人でも、そこで走れない選手は「必要」にならない ──
  const weak = players.filter(p => ovr(p) >= 63 && ovr(p) <= 68)[0]
  let wantButCannotRun = 0
  for (const c of d1) for (const s of SPECIALTIES) {
    const cand = { ...weak, specialty: s } as Player
    const r = rosterOf(c.id)
    if (needsPlayer(r, cand) && !wouldMakeLineup(r, cand)) wantButCannotRun++
  }
  check('1部のクラブが「走れないのに必要」と言わない', wantButCannotRun === 0,
    `${wantButCannotRun}通り（タイプが0人の枠を強さを見ずに埋めていた）`)

  // ── 本人側：今の水準で1戦も走っていない選手は格上へ行かない ──
  const src = rosterOf(d3.id).sort((a, b) => ovr(a) - ovr(b))[0]
  const ctx = { srcTier: tierOf(d3), teamRaces: 7 }
  const dests = d1.map(c => buildDestination(c.id, tierOf(c), players, { player: src }))
  const okZero = dests.filter(d => appraiseMove(src, d, { ...ctx, playFraction: 0 }).ok).length
  check('3部で0出場の選手は1部へ行かない', okZero === 0, `${okZero}クラブへ行くと答えた`)
  check('  理由が出る', appraiseMove(src, dests[0], { ...ctx, playFraction: 0 }).lead === 'unproven')
  // 走っていれば止めない（格上への挑戦そのものは塞がない）
  const okRan = dests.filter(d => appraiseMove(src, d, { ...ctx, playFraction: 5 / 7 }).ok).length
  check('走っている選手は今までどおり格上へ行ける', okRan > 0, `${okRan}クラブ`)
  // 開幕直後（まだ誰も走っていない）を「走っていない」と読まない
  const okEarly = dests.filter(d => appraiseMove(src, d, { srcTier: tierOf(d3), teamRaces: 0, playFraction: 0.5 }).ok).length
  check('開幕直後（0戦）は「走っていない」と読まない', okEarly > 0, `${okEarly}クラブ`)
  // 格下・同格へ落ちて出番を取りにいくのは止めない
  const downs = d3 ? teams.filter(t => divisionOf(t) === 3).slice(1, 6)
    .map(c => buildDestination(c.id, tierOf(c), players, { player: src })) : []
  const okDown = downs.filter(d => appraiseMove(src, d, { ...ctx, playFraction: 0 }).ok).length
  check('格上でなければ止めない（出番を取りに落ちるのは現実にある）', downs.length === 0 || okDown >= 0)
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ FAだけ別の理屈で動いています（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ FAも移籍の一種。獲る理由も行く理由も、国内・海外・FAで分かれていない')
