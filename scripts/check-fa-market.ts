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

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const store = readFileSync('src/store/gameStore.ts', 'utf8')

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
if (problems.length > 0) {
  console.log(`✗ FAだけ別の理屈で動いています（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ FAも移籍の一種。獲る理由も行く理由も、国内・海外・FAで分かれていない')
