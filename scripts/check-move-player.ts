/**
 * 「選手の移動は movePlayer 一本で、どの入口からでも同じ後始末になる」ことを確かめる自己点検。
 *
 *   npx jiti scripts/check-move-player.ts
 *
 * 直したのは、移籍・トレード・レンタル・放出・FA加入がそれぞれ別々に手書きされていて、
 * 名簿から外し忘れる／移籍金を片側しか動かさない／履歴に残らない／加入年が入らない、
 * といった書き忘れが入口ごとにバラバラに起きていたこと。
 */
import { movePlayer } from '../src/utils/movePlayer'
import { rebuildRosters } from '../src/utils/rosterSync'
import { ROSTER_MAX } from '../src/data/rosterRules'
import type { Player, Team } from '../src/types'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const P = (id: string, teamId: string, extra: Partial<Player> = {}) =>
  ({ id, name: id, teamId, status: 'active', form: 50, contract: { annualSalary: 1000, yearsLeft: 2, faEligibleYear: 2030 }, ...extra }) as unknown as Player

const T = (id: string, main: string[], budget = 1_000_000) =>
  ({ id, name: `${id}クラブ`, roster: { main }, finance: { budget } }) as unknown as Team

// a:p1,p2 / b:p3 という素の状態を毎回作る
const world = () => ({
  players: [P('p1', 'a'), P('p2', 'a'), P('p3', 'b')],
  teams: [T('a', ['p1', 'p2']), T('b', ['p3'])],
})
const pl = (r: { players: Player[] }, id: string) => r.players.find(p => p.id === id)!
const tm = (r: { teams: Team[] }, id: string) => r.teams.find(t => t.id === id)!

console.log('\n[1] 金銭移籍：所属・名簿・移籍金・履歴が全部そろう')
{
  const r = movePlayer(world(), 'p1', 'b', { year: 2030, fee: 5000, date: '2030-06-01', raceIndex: 3, myTeamId: 'a' })
  check('移動できた', r.ok)
  check('所属が移動先になる', pl(r, 'p1').teamId === 'b')
  check('元のクラブの名簿から消える', !tm(r, 'a').roster.main.includes('p1'))
  check('移動先の名簿に入る', tm(r, 'b').roster.main.includes('p1'))
  check('移動先が移籍金を払う', tm(r, 'b').finance.budget === 1_000_000 - 5000)
  check('移動元が移籍金を受け取る', tm(r, 'a').finance.budget === 1_000_000 + 5000)
  check('移籍履歴が1件できる', r.record?.playerId === 'p1' && r.record.fromTeamId === 'a' && r.record.toTeamId === 'b' && r.record.fee === 5000)
  check('履歴に日付が入る', r.record?.date === '2030-06-01')
  check('加入年が入る', pl(r, 'p1').joinedYear === 2030)
  check('加入した節が入る', pl(r, 'p1').acquiredRaceIndex === 3)
  check('調子はリセットされる', pl(r, 'p1').form === 0)
  check('自チームの移籍金収入になる', r.income === 5000 && r.spend === 0)
  check('退団のお知らせが出る', r.notice?.playerId === 'p1' && r.notice.reason === 'transfer' && r.notice.fee === 5000)
  check('お知らせに移動先の名前が入る', r.notice?.toTeamName === 'bクラブ')
}

console.log('\n[2] 自チームが買うときは支出になる')
{
  const r = movePlayer(world(), 'p3', 'a', { year: 2030, fee: 7000, myTeamId: 'a' })
  check('移籍金支出になる', r.spend === 7000 && r.income === 0)
  check('退団のお知らせは出ない', r.notice === null)
  check('移籍リスト入りの札ははがれる', pl(r, 'p3').transferListed === undefined)
}

console.log('\n[3] トレード・フリー移籍も同じ後始末になる')
{
  const tr = movePlayer(world(), 'p1', 'b', { year: 2031, kind: 'trade' })
  check('トレードとして履歴に残る', tr.record?.kind === 'trade' && tr.record.fee === 0)
  check('トレードでも加入年が入る', pl(tr, 'p1').joinedYear === 2031)
  const fr = movePlayer({ players: [P('f1', '')], teams: [T('a', [])] }, 'f1', 'a', { year: 2031, kind: 'free' })
  check('FA加入はフリーとして履歴に残る', fr.record?.kind === 'free' && fr.record.fromTeamId === '')
  check('FA加入で名簿に入る', tm(fr, 'a').roster.main.includes('f1'))
}

console.log('\n[4] レンタルは保有元が残り、名簿には載らない')
{
  const out = movePlayer(world(), 'p1', 'b', { year: 2030, until: 2031, myTeamId: 'a' })
  check('借りた側に所属が移る', pl(out, 'p1').teamId === 'b')
  check('保有元は元のクラブのまま', pl(out, 'p1').loan?.ownerTeamId === 'a')
  check('期限が入る', pl(out, 'p1').loan?.untilYear === 2031)
  check('借りた側の名簿には載らない', !tm(out, 'b').roster.main.includes('p1'))
  check('貸した側の名簿からも外れる', !tm(out, 'a').roster.main.includes('p1'))
  check('レンタルは移籍履歴に残さない', out.record === null)
  check('お知らせの理由はレンタル', out.notice?.reason === 'loan')

  // 期限が来て保有元へ戻す
  const back = movePlayer(out, 'p1', 'a', { year: 2031 })
  check('保有元へ戻る', pl(back, 'p1').teamId === 'a')
  check('レンタルの印が消える', pl(back, 'p1').loan === undefined)
  check('戻ったら名簿に載る', tm(back, 'a').roster.main.includes('p1'))
  check('戻りは履歴に残さない', back.record === null)
}

console.log('\n[5] 放出（無所属＝FAへ）')
{
  const r = movePlayer(world(), 'p1', '', { year: 2030, myTeamId: 'a' })
  check('所属が無くなる', pl(r, 'p1').teamId === '')
  check('名簿から消える', !tm(r, 'a').roster.main.includes('p1'))
  check('どこの名簿にも入らない', r.teams.every(t => !t.roster.main.includes('p1')))
  check('お知らせの理由は契約満了', r.notice?.reason === 'fa')
  check('放出は移籍履歴に残さない', r.record === null)
}

console.log('\n[6] 書き忘れが起きない仕掛け')
{
  // 前の処理のせいで名簿に名前が二重に残っていても、通せば直る
  const dirty = {
    players: [P('p1', 'a', { transferListed: true, overseasListed: 'europe' } as Partial<Player>)],
    teams: [T('a', ['p1']), T('b', ['p1'])],
  }
  const r = movePlayer(dirty, 'p1', 'b', { year: 2030 })
  check('よそのクラブに残っていた名前も消える', tm(r, 'a').roster.main.length === 0)
  check('移動先には1回だけ載る', tm(r, 'b').roster.main.filter(id => id === 'p1').length === 1)
  check('海外移籍リストの札もはがれる', pl(r, 'p1').overseasListed === undefined)

  // 引退した選手は動かない
  const dead = movePlayer({ players: [P('x', 'a', { status: 'retired' } as Partial<Player>)], teams: [T('a', [])] }, 'x', 'b', { year: 2030 })
  check('引退選手は動かせない', !dead.ok && dead.players[0].teamId === 'a')

  // 人数上限。checkCapacity を付けたときだけ弾く
  const full = {
    players: [...Array.from({ length: ROSTER_MAX }, (_, i) => P(`m${i}`, 'b')), P('p1', 'a')],
    teams: [T('a', ['p1']), T('b', Array.from({ length: ROSTER_MAX }, (_, i) => `m${i}`))],
  }
  check('上限を超える契約は断れる', !movePlayer(full, 'p1', 'b', { year: 2030, checkCapacity: true }).ok)
  check('上限を見ない移動は通る（CPU同士など）', movePlayer(full, 'p1', 'b', { year: 2030 }).ok)

  // 元のデータは書き換えない
  const src = world()
  movePlayer(src, 'p1', 'b', { year: 2030, fee: 5000 })
  check('元のデータを書き換えない', src.players[0].teamId === 'a' && src.teams[0].roster.main.includes('p1') && src.teams[0].finance.budget === 1_000_000)
}

console.log('\n[7] 引退も「所属が無くなる」だけの分岐')
{
  const r = movePlayer(world(), 'p1', '', { year: 2030, retire: true })
  check('引退の印が付く', pl(r, 'p1').status === 'retired')
  check('所属が無くなる', pl(r, 'p1').teamId === '')
  check('引退時の所属を控える', pl(r, 'p1').retiredTeamId === 'a')
  check('引退年が入る', pl(r, 'p1').retiredYear === 2030)
  check('名簿から外れる', !tm(r, 'a').roster.main.includes('p1'))
  check('引退は移籍履歴に残さない', r.record === null)
  check('引退で退団のお知らせは出さない', movePlayer(world(), 'p1', '', { year: 2030, retire: true, myTeamId: 'a' }).notice === null)
  check('加入年は書き換えない', pl(r, 'p1').joinedYear === undefined)

  // レンタル中に引退したら、引退時の所属は借り手ではなく保有元
  const lent = movePlayer(world(), 'p1', 'b', { year: 2030, until: 2031 })
  const lentRetire = movePlayer(lent, 'p1', '', { year: 2031, retire: true })
  check('レンタル中の引退は保有元を控える', pl(lentRetire, 'p1').retiredTeamId === 'a')
  check('レンタルの印も消える', pl(lentRetire, 'p1').loan === undefined)

  // 何度通しても結果が変わらない（整理の処理は毎シーズン全員に通るため）
  const again = movePlayer(lentRetire, 'p1', '', { year: 2035, retire: true })
  check('もう一度通しても引退年は変わらない', pl(again, 'p1').retiredYear === 2031)
  check('もう一度通しても引退時の所属は変わらない', pl(again, 'p1').retiredTeamId === 'a')

  // 引退した選手は、引退以外の呼び出しでは動かない
  check('引退選手は移籍させられない', !movePlayer(r, 'p1', 'b', { year: 2031 }).ok)
}

console.log('\n[8] 名簿の組み直しと結果が食い違わない')
{
  // rebuildRosters は所属から名簿を作り直す処理。movePlayer の結果がそれと一致していれば、
  // セーブを読み直した瞬間に選手が消えたり増えたりしない
  const cases: { label: string; r: ReturnType<typeof movePlayer> }[] = [
    { label: '移籍のあと', r: movePlayer(world(), 'p1', 'b', { year: 2030, fee: 100 }) },
    { label: 'レンタルのあと', r: movePlayer(world(), 'p1', 'b', { year: 2030, until: 2031 }) },
    { label: '放出のあと', r: movePlayer(world(), 'p1', '', { year: 2030 }) },
    { label: '引退のあと', r: movePlayer(world(), 'p1', '', { year: 2030, retire: true }) },
  ]
  for (const c of cases) {
    const rebuilt = rebuildRosters(c.r.players, c.r.teams)
    const same = rebuilt.every(t => {
      const cur = c.r.teams.find(x => x.id === t.id)!
      return [...cur.roster.main].sort().join(',') === [...t.roster.main].sort().join(',')
    })
    check(`${c.label}も組み直しと同じ名簿になる`, same)
  }
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
