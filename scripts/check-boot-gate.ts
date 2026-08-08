/**
 * 【起動の分岐の確認】セーブがあるのに新規ゲーム画面へ行かせない。
 *
 * ■なぜ要るのか
 *   最後まで残っていた穴が「読み込みは成功したのに、中身が初期状態で起動する」だった。
 *   saveHealth は 'ok' なので復旧画面へ回らず、新規ゲーム画面が出る。
 *   そこで新チームを作られると、破壊ガードから見れば「isInitialized:true を書いている」
 *   だけなので素通りし、本物のセーブが物理的に消える。
 *
 *   App.tsx の分岐そのものは画面なのでここでは動かせない。代わりに、分岐の判断材料
 *   （sawSavedGame）が正しく立つ／降りることを見る。
 *
 *   npm run check に入っている。
 */
const KEY = 'jpel-manager-save'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const mkSave = (n: number) => JSON.stringify({
  state: {
    isInitialized: true, playerTeamId: 'tokyo', teams: [{ id: 'tokyo' }],
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, specialty: 'ace', teamId: 'tokyo', status: 'active' })),
  },
  version: 40,
})

async function main() {
  const { saveStorage, sawSavedGame } = await import('../src/store/saveStorage')

  check('セーブが無ければ「あった」にならない（新規ゲームへ進んでよい）', sawSavedGame() === false)

  localStorage.setItem(KEY, mkSave(2000))
  await saveStorage.getItem(KEY)
  check('セーブを読んだら「あった」が立つ', sawSavedGame() === true)

  // ここが今回の穴。読み込みは通ったが、画面に出る状態は初期状態（isInitialized=false）。
  // App.tsx はこのとき Onboarding ではなく復旧画面を出す。
  console.log('  → この状態で App は新規ゲーム画面ではなく復旧画面を出す（App.tsx の分岐）')

  await saveStorage.removeItem(KEY)
  check('データ削除のあとは「あった」が降りる（新規ゲームを作れる）', sawSavedGame() === false)

  // 削除後は新規ゲームが保存できないといけない（ガードで固まらないこと）
  const fresh = mkSave(25)
  await saveStorage.setItem(KEY, fresh)
  check('データ削除のあと、新しいゲームを保存できる', localStorage.getItem(KEY) === fresh)

  console.log('')
  if (problems.length > 0) {
    console.log(`✗ 起動の分岐がおかしい（${problems.length}件）`)
    process.exit(1)
  }
  console.log('✓ セーブがあるのに新規ゲームへ行かせない。削除後はちゃんと作れる')
}

void main()
