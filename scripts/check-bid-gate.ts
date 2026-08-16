/**
 * 【出せない入札は、押す前に理由が出る（黙って捨てない）】
 *
 * ■なぜ要るのか（オーナー・2026-08-16）
 *   「シーズン中にオファー出したけど、何レース経ってもオファーが来ないし、
 *     チャットに〇〇にオファー中の文字がないって話なんだけど」
 *
 *   `submitTransferBid` に**何も返さずに終わる早期リターンが6つ**ありました。
 *   画面はシートを閉じるだけなので、出したように見えて**札が1枚もできません**。
 *   札が無いので「出したオファー」にも出ず、決着する相手も無いので返事も来ない。
 *   **返事が来ないのではなく、そもそも出ていなかった**という状態です。
 *
 *   入口は2つあって、止め方が食い違っていました。
 *
 *   | 入口 | 押す前に見ていたもの |
 *   |---|---|
 *   | 移籍市場（`TransferPage`） | 入札中・移籍直後だけ（**赤字ペナルティは FA の枝にしか無い**） |
 *   | 他クラブのページ（`opponentMenu`） | **何も見ていない**（常に押せる） |
 *
 * ■この点検が守るもの
 *   ①出せない条件のどれを引いても**必ず理由が返る**（null にならない）
 *   ②`submitTransferBid` が理由を返し、札を1枚も作らない
 *   ③2つの入口が**どちらも `bidGate` を通る**（画面で条件を組み直していない）
 */
import { readFileSync } from 'node:fs'
import { bidBlockReason, loanBlockReason, MAX_BIDS_PER_PLAYER, LOAN_SLOTS } from '../src/utils/bidGate'
import { TRANSFER_LOCK_YEARS } from '../src/utils/transferEligibility'
import type { Player } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
const MY = 'me'
const SEASON = { year: YEAR, retirementRequests: [], pendingSales: [] } as never

const P = (over: Partial<Player> = {}): Player => ({
  id: 'p1', name: '田中 太郎', teamId: 'other', age: 26, specialty: 'pacemaker',
  nationality: 'JPN', status: 'active',
  ratings: { speed: 70, stamina: 70, mountainUp: 70, mountainDown: 70, pacing: 70, mental: 70, recovery: 70 },
  potential: 80, growthCurve: 'normal', morale: 60, fatigue: 0,
  // ★移籍ロックに掛からない加入年を入れること（入れないと全部が「移籍したばかり」で
  //   止まり、他の条件を1つも通らない＝空振りの緑になる）
  joinedYear: YEAR - TRANSFER_LOCK_YEARS,
  contract: { annualSalary: 10_000_000, yearsLeft: 3 },
  ...over,
} as unknown as Player)

const OK_TEAM = { finance: { budget: 1_000_000_000, deficitStreak: 0 } }
const gate = (over: Partial<Parameters<typeof bidBlockReason>[1]> = {}) => ({
  currentSeason: SEASON, myTeam: OK_TEAM, myTeamId: MY, bidsOnPlayer: [], ...over,
} as Parameters<typeof bidBlockReason>[1])

console.log('[1] ふつうの相手には出せる（空振りの緑ではない）')
check('止まらない', bidBlockReason(P(), gate()) === null, String(bidBlockReason(P(), gate())))
check('レンタルも止まらない', loanBlockReason(P(), gate()) === null, String(loanBlockReason(P(), gate())))

console.log('\n[2] 出せない条件は、どれを引いても必ず理由が返る')
{
  const cases: [string, Player, Parameters<typeof bidBlockReason>[1]][] = [
    ['自チームの選手', P({ teamId: MY }), gate()],
    ['FA（契約オファーの相手）', P({ teamId: '' }), gate()],
    ['すでに入札中', P(), gate({ bidsOnPlayer: [{ status: 'pending' }] })],
    ['残高マイナス', P(), gate({ myTeam: { finance: { budget: -1, deficitStreak: 0 } } })],
    ['3年連続赤字', P(), gate({ myTeam: { finance: { budget: 1_000_000_000, deficitStreak: 3 } } })],
    ['交渉決裂で来季まで', P({ transferLockedUntilYear: YEAR + 1 }), gate()],
    ['移籍したばかり', P({ joinedYear: YEAR }), gate()],
    ['レンタル中', P({ loan: { ownerTeamId: 'x', years: 1 } as never }), gate()],
    ['非売', P({ noSale: true }), gate()],
    ['海外挑戦中', P({ overseasListed: true }), gate()],
    ['引退が決まっている', P({ pendingRetirementYear: YEAR }), gate()],
    [`今季${MAX_BIDS_PER_PLAYER}回出しきった`, P(),
      gate({ bidsOnPlayer: Array.from({ length: MAX_BIDS_PER_PLAYER }, () => ({ status: 'rejected' })) })],
  ]
  for (const [name, p, ctx] of cases) {
    const r = bidBlockReason(p, ctx)
    check(`${name} → 理由が返る`, !!r, r === null ? '黙って通した' : '')
    if (r) console.log(`        「${r}」`)
  }
  // 理由の文字はそのままボタンに出る。**理由が1つに潰れていないこと**を見る
  // （残高マイナスと3年連続赤字は同じ「赤字で補強不可」でよい＝遊ぶ側には同じ話）
  const reasons = cases.map(([, p, c]) => bidBlockReason(p, c)).filter((x): x is string => !!x)
  check('理由が条件ごとに分かれている', new Set(reasons).size >= cases.length - 1,
    `${new Set(reasons).size}通り / ${cases.length}条件`)
}

console.log('\n[3] レンタルは入札と条件が違う（移籍したばかりでも借りられる）')
{
  check('移籍したばかりでもレンタルは通る', loanBlockReason(P({ joinedYear: YEAR }), gate()) === null,
    String(loanBlockReason(P({ joinedYear: YEAR }), gate())))
  check('レンタル枠が満杯なら止まる',
    !!loanBlockReason(P(), gate({ loanSlotsUsed: LOAN_SLOTS })))
  check('すでに申請中なら止まる', !!loanBlockReason(P(), gate({ loanRequested: true })))
  check('赤字は止まる', !!loanBlockReason(P(), gate({ myTeam: { finance: { budget: -1 } } })))
}

console.log('\n[4] store は理由を返す（黙って捨てない）')
{
  const src = readFileSync('src/store/slices/marketSlice.ts', 'utf8')
  check('submitTransferBid が bidGate を通る', /submitTransferBid[\s\S]{0,900}?bidBlockReason\(/.test(src))
  check('理由を返している', /return \{ ok: false, reason \}/.test(src))
  check('出せたときは ok を返す', /submitTransferBid[\s\S]{0,1400}?return \{ ok: true \}/.test(src))
  // ★ここが本体。何も返さない早期リターンに戻ったら落とす
  check('submitTransferBid に「何も返さない return」が無い',
    !/submitTransferBid:[\s\S]{0,1400}?\n\s+if \([^)]*\) return\n/.test(src))
  check('submitLoanRequest も bidGate を通る', /submitLoanRequest[\s\S]{0,700}?loanBlockReason\(/.test(src))
  const store = readFileSync('src/store/gameStore.ts', 'utf8')
  check('型も理由を返す形', /submitTransferBid: \(playerId: string, fee: number\) => \{ ok: boolean; reason\?: string \}/.test(store))
}

console.log('\n[5] 入口は2つ。どちらも同じ関門を通る')
{
  const pages = ['src/components/transfer/TransferPage.tsx', 'src/components/teams/opponentMenu.tsx']
  for (const f of pages) {
    const src = readFileSync(f, 'utf8')
    const name = f.split('/').pop()
    check(`${name} が bidGate を通る`,
      /bidBlockReason\(/.test(src) && /loanBlockReason\(/.test(src))
    // ★呼ぶだけでは足りない。**理由をボタンの見出しに出して、押せなくすること。**
    //   呼んで捨てていると、この点検は緑のまま画面は元どおり押せる（実際に空振りした）
    check(`${name} が理由を見出しに出している`,
      (src.match(/label: [A-Za-z]+ \?\?/g) ?? []).length >= 2,
      `${(src.match(/label: [A-Za-z]+ \?\?/g) ?? []).length}件`)
    check(`${name} が理由で押せなくしている`,
      (src.match(/disabled: !![A-Za-z]+/g) ?? []).length >= 2,
      `${(src.match(/disabled: !![A-Za-z]+/g) ?? []).length}件`)
    // 画面で条件を組み直さないこと（組み直した結果、片方だけ緩い状態になっていた）
    check(`${f.split('/').pop()} が条件を手書きしていない`,
      !/deficitStreak[\s\S]{0,40}>=\s*3/.test(src) && !/transferLockedUntilYear != null[\s\S]{0,60}(disabled|label)/.test(src))
  }
}

console.log('')
if (failed > 0) { console.log(`✗ 出せない入札が黙って捨てられます（${failed}件）`); process.exit(1) }
console.log('✓ 出せない入札は、押す前に理由が出る')
