/**
 * 【ホームの「チャット」の数字】
 *
 * ■なぜ要るのか（オーナー・2026-08-16）
 *   「チャットに通知機能つけて欲しい。チャット見ないとその数字消えないみたいな。
 *     フレンド横にあった3みたいな感じ」
 *
 * ■この点検が守るもの
 *   ①ホームに出す数字と、チャットに並ぶ用件が**同じものを数える**
 *     （別々に数えると「数字は3なのに開いたら1件」というズレが必ず出る。
 *      ベルとチャットで実際に起きて直した）
 *   ②**チャットを開くまで消えない**（用件を片付けたかどうかではない）
 *   ③開いたら消える（見た用件は数えない）
 *   ④新しい用件が来たらまた出る
 */
import { readFileSync } from 'node:fs'
import { chatTopicIds, chatUnseenCount } from '../src/utils/notifItems'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const MY = 'me'
const P = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `名${id}`, teamId: MY, age: 26, specialty: 'pacemaker', nationality: 'JPN', status: 'active',
  ratings: { speed: 70, stamina: 70, mountainUp: 70, mountainDown: 70, pacing: 70, mental: 70, recovery: 70 },
  potential: 80, growthCurve: 'normal', morale: 60, fatigue: 0, draftYear: 2020,
  contract: { annualSalary: 10_000_000, yearsLeft: 3 }, ...over,
})
const world = (season: Record<string, unknown>) => ({
  currentSeason: { year: 2030, races: [], currentRaceIndex: 0, ...season },
  players: [P('p1'), P('p2'), P('p3')],
  teams: [{ id: MY, name: '自', shortName: '自', sponsors: [] }],
  playerTeamId: MY,
} as never)

console.log('[1] 用件があれば数える（空振りの緑ではない）')
const withTopics = world({
  retirementRequests: [{ playerId: 'p1' }],
  transferRequests: [{ playerId: 'p2' }],
})
{
  const ids = chatTopicIds(withTopics)
  console.log(`      用件の id: ${ids.join(' / ') || '(なし)'}`)
  check('用件が拾えている', ids.length >= 2, `${ids.length}件`)
  check('まだ見ていないので数字が出る', chatUnseenCount(withTopics, []) === ids.length,
    String(chatUnseenCount(withTopics, [])))
  // 用件ごとに別の id（同じ id だと1件に潰れて数が合わない）
  check('id が用件ごとに違う', new Set(ids).size === ids.length)
}

console.log('\n[2] チャットを開いたら消える')
{
  const ids = chatTopicIds(withTopics)
  check('見た用件は数えない', chatUnseenCount(withTopics, ids) === 0,
    String(chatUnseenCount(withTopics, ids)))
  // ★片付けたかどうかではない。**用件が残っていても、見たなら0**
  check('用件が残っていても、見たなら0', chatUnseenCount(withTopics, ids) === 0)
}

console.log('\n[3] 新しい用件が来たらまた出る')
{
  const seen = chatTopicIds(withTopics)
  const more = world({
    retirementRequests: [{ playerId: 'p1' }],
    transferRequests: [{ playerId: 'p2' }],
    overseasRequests: [{ playerId: 'p3' }],
  })
  check('増えたぶんだけ出る', chatUnseenCount(more, seen) === 1, String(chatUnseenCount(more, seen)))
}

console.log('\n[4] 用件が無ければ0')
{
  check('0件', chatUnseenCount(world({}), []) === 0, String(chatUnseenCount(world({}), [])))
}

console.log('\n[5] 数え方は1本（画面で数えていない）')
{
  const dash = readFileSync('src/components/dashboard/Dashboard.tsx', 'utf8')
  const chat = readFileSync('src/components/team/ChatPage.tsx', 'utf8')
  check('ホームが chatUnseenCount を通る', /chatUnseenCount\(/.test(dash))
  check('チャットが chatTopicIds を通る', /chatTopicIds\(/.test(chat))
  // ★ここが本体。画面で用件を数え直したら落とす
  check('ホームが用件を自分で数えていない',
    !/retirementRequests[\s\S]{0,80}length/.test(dash) && !/transferRequests[\s\S]{0,80}length/.test(dash))
  check('チャットを開いたら見た扱いにする', /markChatSeen\(/.test(chat))
  const meta = readFileSync('src/store/slices/metaSlice.ts', 'utf8')
  check('見た用件はセーブに残す（開き直しても出直さない）', /seenChatTopicIds/.test(meta))
}

console.log('\n[6] 数字は溜まる。上限は99で、超えたら 99+')
{
  const badge = readFileSync('src/components/ui/CountBadge.tsx', 'utf8')
  check('上限は99', /max = 99/.test(badge))
  check('超えたら + を付ける', /\$\{max\}\+/.test(badge))
  // ★9で頭打ちに戻ったら落とす（オーナー・2026-08-16「99で+になる」）
  check('9で頭打ちに戻っていない', !/max = 9\b/.test(badge))
  // 溜まること自体：用件が増えれば数字も増える
  const many = world({
    retirementRequests: [{ playerId: 'p1' }],
    transferRequests: [{ playerId: 'p2' }],
    overseasRequests: [{ playerId: 'p3' }],
  })
  check('用件が増えれば数字も増える', chatUnseenCount(many, []) === 3, String(chatUnseenCount(many, [])))
}

console.log('\n[7] 赤い丸は1本／下タブ「オンライン」にも出る')
{
  const layout = readFileSync('src/components/layout/Layout.tsx', 'utf8')
  const dash2 = readFileSync('src/components/dashboard/Dashboard.tsx', 'utf8')
  const hook = readFileSync('src/components/notifications/useOnlineBadge.ts', 'utf8')
  check('下タブのオンラインに数字が出る', /to === '\/online' && <CountBadge/.test(layout))
  check('数え方は useOnlineBadge 1本', /useOnlineBadge\(\)/.test(layout))
  check('走友会の差し入れとフレンド申請を数えている',
    /useClubGifts\(\)/.test(hook) && /useFriendRequests\(\)/.test(hook))
  // ★赤い丸を画面ごとに書き写したら落とす
  for (const [name, src] of [['Layout', layout], ['Dashboard', dash2]] as const) {
    check(`${name} が CountBadge を使っている`, /<CountBadge/.test(src))
    check(`${name} が赤い丸を書き写していない`,
      !/borderRadius: '50%'[\s\S]{0,120}background(Color)?: C\.red/.test(src))
  }
}

console.log('')
if (failed > 0) { console.log(`✗ チャットの数字が合いません（${failed}件）`); process.exit(1) }
console.log('✓ ホームの数字とチャットの用件は同じもの。開くまで消えない')
