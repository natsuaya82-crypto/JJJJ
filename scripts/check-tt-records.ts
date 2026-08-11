/**
 * 記録会の歴代1位（`engine/timeTrialRecords.ts` の `updateBestRecord`）の網。
 *
 * ■なぜ golden とは別に要るのか
 *   タイム計算は連続値なので、**同じタイムの走者は golden の世界では出ません**。
 *   つまりタイ記録（同着）の枝は `race-timetrial` を何度走らせても1行も通らない。
 *   ここでは順位表を手で作って、同着を必ず起こします。
 *
 * ■確かめること
 *   ・記録更新／更新しない
 *   ・**同じレースの中で並んだ** … 1位が保持者、残りが共同保持者
 *   ・**後日、既存の記録に並んだ** … 既存の保持者はそのままで共同保持者に足す
 *   ・すでに載っている人は二重に足さない
 *   ・日本記録は JPN だけを見る（世界記録より遅いタイムが日本記録になる）
 *   ・ニュースは並んだ人ぶん出る
 */
import { updateBestRecord, withEventBest, eventDistKey } from '../src/engine/timeTrialRecords'
import type { EventTimeRecord } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
const NAMES: Record<string, string> = { a: 'Aさん', b: 'Bさん', c: 'Cさん', d: 'Dさん' }
const JPN = new Set(['a', 'c'])
const base = {
  nameOf: (id: string) => NAMES[id],
  year: YEAR, date: `${YEAR}-04-26`, distance: 10000,
}
const world = (cur: EventTimeRecord | undefined, ranked: { playerId: string; timeSec: number }[]) =>
  updateBestRecord(cur, ranked, { ...base, scope: 'world', eligible: () => true })
const japan = (cur: EventTimeRecord | undefined, ranked: { playerId: string; timeSec: number }[]) =>
  updateBestRecord(cur, ranked, { ...base, scope: 'japan', eligible: r => JPN.has(r.playerId) })

console.log('[1] 記録の更新')
{
  const r = world(undefined, [{ playerId: 'a', timeSec: 1700 }, { playerId: 'b', timeSec: 1710 }])
  check('記録が無ければ1位が記録になる', r.record?.playerId === 'a' && r.record?.timeSec === 1700)
  check('  名前も一緒に焼き込む（選手が消えても記録が残る）', r.record?.playerName === 'Aさん')
  check('  ニュースが1件', r.news.length === 1, `${r.news.length}件`)

  const cur: EventTimeRecord = { playerId: 'b', playerName: 'Bさん', timeSec: 1700, year: YEAR - 1 }
  const slower = world(cur, [{ playerId: 'a', timeSec: 1705 }])
  check('遅ければ記録は変わらない', slower.record === cur && slower.news.length === 0)

  const faster = world(cur, [{ playerId: 'a', timeSec: 1690 }])
  check('速ければ入れ替わる', faster.record?.playerId === 'a' && faster.record?.timeSec === 1690)
  check('  前の共同保持者は残らない（丸ごと入れ替わる）', faster.record?.coHolders === undefined)
}

console.log('')
console.log('[2] タイ記録（同着）')
{
  // 同じレースで3人が並ぶ
  const r = world(undefined, [
    { playerId: 'a', timeSec: 1700 }, { playerId: 'b', timeSec: 1700 },
    { playerId: 'c', timeSec: 1700 }, { playerId: 'd', timeSec: 1720 }])
  check('同じレースで並んだら、1位が保持者で残りが共同保持者',
    r.record?.playerId === 'a' && (r.record?.coHolders ?? []).map(c => c.playerId).join(',') === 'b,c',
    JSON.stringify(r.record))
  check('  共同保持者の名前も焼き込む', (r.record?.coHolders ?? []).every(c => c.playerName !== ''))
  check('  ニュースは並んだ人ぶん出る（3件）', r.news.length === 3, `${r.news.length}件`)

  // 後日、既存の記録に並ぶ
  const cur: EventTimeRecord = { playerId: 'a', playerName: 'Aさん', timeSec: 1700, year: YEAR - 1 }
  const tie = world(cur, [{ playerId: 'b', timeSec: 1700 }, { playerId: 'd', timeSec: 1730 }])
  check('後日並んだら、元の保持者はそのままで共同保持者に足す',
    tie.record?.playerId === 'a' && (tie.record?.coHolders ?? []).map(c => c.playerId).join(',') === 'b',
    JSON.stringify(tie.record))
  check('  ニュースは足された人ぶん（1件）', tie.news.length === 1, `${tie.news.length}件`)

  // すでに共同保持者になっている人が、また同じタイムで走った
  const cur2: EventTimeRecord = { ...cur, coHolders: [{ playerId: 'b', playerName: 'Bさん', year: YEAR - 1 }] }
  const again = world(cur2, [{ playerId: 'b', timeSec: 1700 }])
  check('すでに載っている人は二重に足さない', again.record === cur2 && again.news.length === 0,
    JSON.stringify(again.record))
}

console.log('')
console.log('[3] 日本記録は JPN だけを見る')
{
  // 1位は外国籍の b。日本記録は3位の c ではなく、JPN で一番速い a になる
  const ranked = [{ playerId: 'b', timeSec: 1680 }, { playerId: 'a', timeSec: 1700 }, { playerId: 'c', timeSec: 1710 }]
  const w = world(undefined, ranked)
  const j = japan(undefined, ranked)
  check('世界記録は全体の1位', w.record?.playerId === 'b')
  check('日本記録はJPNで一番速い人（世界記録より遅い）', j.record?.playerId === 'a' && j.record?.timeSec === 1700)
  check('  外国籍は共同保持者にもならない',
    (j.record?.coHolders ?? []).every(x => JPN.has(x.playerId)))

  // JPN同士で並ぶ
  const tie = japan(undefined, [{ playerId: 'b', timeSec: 1680 }, { playerId: 'a', timeSec: 1700 }, { playerId: 'c', timeSec: 1700 }])
  check('JPN同士が並べば共同保持者になる', (tie.record?.coHolders ?? []).map(x => x.playerId).join(',') === 'c')

  // JPN が1人も走っていない
  const none = japan(undefined, [{ playerId: 'b', timeSec: 1680 }, { playerId: 'd', timeSec: 1690 }])
  check('JPNが1人も走っていなければ何も起きない', none.record === undefined && none.news.length === 0)
}

console.log('')
console.log('[4] 自己ベストと種目キー')
{
  const p = { eventBests: { d10000: { timeSec: 1700, year: YEAR - 1 } } }
  check('速ければ書き換わる', withEventBest(p, 'd10000', 1690, YEAR).eventBests?.d10000?.timeSec === 1690)
  check('遅ければそのまま（同じ実体を返す）', withEventBest(p, 'd10000', 1710, YEAR) === p)
  check('同じタイムでも書き換えない', withEventBest(p, 'd10000', 1700, YEAR) === p)
  check('別の種目は初回でも入る', withEventBest(p, 'half', 3600, YEAR).eventBests?.half?.timeSec === 3600)
  check('元の種目は消えない', withEventBest(p, 'half', 3600, YEAR).eventBests?.d10000?.timeSec === 1700)

  check('距離→種目キー',
    eventDistKey(5000) === 'd5000' && eventDistKey(10000) === 'd10000'
    && eventDistKey(21097) === 'half' && eventDistKey(42195) === 'marathon')
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
