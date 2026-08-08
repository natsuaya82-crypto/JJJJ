/**
 * 【セーブ破壊ガードの確認】中身が消し飛んだ状態を書き込ませない。
 *
 * ■なぜ要るのか
 *   これまでのガードは `isInitialized` しか見ていなかった。
 *   「開始済みのまま、選手だけ0人」という壊れ方はそのまま保存が通り、
 *   本物のセーブが物理的に消える。build 106 の事故でいちばんありそうな筋がこれ。
 *
 *   npm run check に入っている（scripts/ls-shim.cjs で localStorage を用意してから走らせる）
 */
const KEY = 'jpel-manager-save'

// 進行中のセーブを模したものを自前で組み立てる（外のファイルに依存させない＝毎回走らせられる）。
// 見ているのは「選手1人につき1つ出る印」の数だけなので、中身は本物でなくてよい。
const PLAYERS = 2000
const mkSave = (n: number) => JSON.stringify({
  state: {
    isInitialized: true,
    playerTeamId: 'tokyo',
    teams: [{ id: 'tokyo', name: '東京' }],
    players: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`, name: `選手${i}`, age: 22, specialty: 'ace', teamId: 'tokyo', status: 'active',
    })),
  },
  version: 40,
})
const raw = mkSave(PLAYERS)

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

async function main() {
  const { saveStorage } = await import('../src/store/saveStorage')
  const { getSaveHealth } = await import('../src/store/saveHealth')

  // 進行中のセーブがある状態にする
  localStorage.setItem(KEY, raw)
  await saveStorage.getItem(KEY)
  const before = localStorage.getItem(KEY)!
  const players = (before.match(/"specialty":/g) ?? []).length
  console.log(`読み込んだセーブ: ${(before.length / 1024 / 1024).toFixed(2)} MB / 選手の記録 ${players}件`)
  console.log('')

  // ① まず、ふつうの増減が通ることを確かめる（ガードが厳しすぎないか）。
  //    ガードは一度止まると**その起動中は二度と書かない**ので、必ずこちらを先に見る。
  // 1シーズンで引退するのは数%。5%減らしたものは通らないといけない
  const normal = mkSave(Math.floor(PLAYERS * 0.95))
  await saveStorage.setItem(KEY, normal)
  check('ふつうの増減（5%減）は通る', localStorage.getItem(KEY) === normal)

  // ② 開始済みのまま中身が空 ＝ 今回の事故の形
  const keep = localStorage.getItem(KEY)!
  const emptied = mkSave(0)
  await saveStorage.setItem(KEY, emptied)
  check('中身が空のセーブで上書きされない', localStorage.getItem(KEY) === keep,
    `${(localStorage.getItem(KEY)!.length / 1024 / 1024).toFixed(2)} MB になった`)
  check('止めたあとは復旧画面に回る（saveHealth=failed）', getSaveHealth() === 'failed', getSaveHealth())

  // ③ 一度止まったら、その起動中は正常なものでも書かない（本物が無事なうちに再起動させる）
  await saveStorage.setItem(KEY, normal)
  check('止まったあとは書き込みを一切通さない', localStorage.getItem(KEY) === keep)

  console.log('')
  if (problems.length > 0) {
    console.log(`✗ ガードが効いていません（${problems.length}件）`)
    process.exit(1)
  }
  console.log('✓ 中身が消し飛んだセーブは書き込まれない。ふつうの増減は通る')
}

void main()
