/**
 * 【端末内バックアップの確認】クラウドが無くても戻せること。
 *
 * ■なぜ要るのか
 *   以前は .bak が1本だけで、1分ごとに上書きしていた。異変に気づいたときには
 *   本体もバックアップも新しくなっていて、戻す先が無い。
 *   さらに「セーブ形式の版を上げる前の姿」を残していなかったので、移行が壊れると打つ手が無い。
 *   build 106 で30シーズンぶんが失われたとき、退避があれば戻せた。
 *
 *   ここではファイル操作（Capacitor Filesystem）を偽物に差し替えて、次を見る。
 *     ・版を上げる前のセーブが、版ごとに1つ残る（同じ版で何度起動しても増えない）
 *     ・世代バックアップがいちばん古いものから順ぐりに使われる
 *     ・本体が壊れても、世代から読み戻せる
 *     ・データ削除では退避も世代も消える（消したのに戻せる、を作らない）
 *
 *   npm run check に入っている。
 */
const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

// ファイル操作は esbuild の --alias で scripts/fakes/ の偽物に差し替えている
// （package.json の check を参照）。ここではその中身を覗くだけ。
import { __files as files } from './fakes/capacitor-filesystem'

const KEY = 'jpel-manager-save'
const FILE = 'jpel-manager-save.json'
const mkSave = (n: number, version: number) => JSON.stringify({
  state: {
    isInitialized: true, playerTeamId: 'tokyo', teams: [{ id: 'tokyo' }],
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, specialty: 'ace' })),
  },
  version,
})

async function main() {
  const st = await import('../src/store/saveStorage')
  st.setSaveFormatVersion(40)

  // 形式 v39 のセーブが端末に入っている状態から起動する
  files.set(FILE, { data: mkSave(2000, 39), mtime: 1 })
  await st.saveStorage.getItem(KEY)

  const snap = 'jpel-manager-save.v39.json'
  check('版を上げる前のセーブが退避される', files.has(snap))
  check('退避の中身は元のまま', files.get(snap)?.data === mkSave(2000, 39))

  // もう一度起動しても増えない・上書きされない
  const at = files.get(snap)!.mtime
  await st.saveStorage.getItem(KEY)
  check('同じ版で何度起動しても退避は1つだけ', files.get(snap)!.mtime === at)

  // 世代バックアップ：間隔を待たずに何度も書いても1つずつしか増えないので、
  // ここでは「本体が壊れたときに世代から読み戻せる」ことを直接確かめる
  files.set('jpel-manager-save.bak1.json', { data: mkSave(2000, 40), mtime: 2 })
  files.set(FILE, { data: '{壊れたJSON', mtime: 3 })
  const st2 = st
  const got = await st2.saveStorage.getItem(KEY)
  check('本体が壊れていても世代バックアップから読み戻せる', typeof got === 'string' && got.includes('"isInitialized":true'))

  // 復旧の候補が一覧に出る
  const list = await st2.listRecoverables()
  check('復旧の候補が一覧に出る', list.length >= 2, `${list.length}件`)
  check('候補にアップデート前の退避が含まれる', list.some(r => r.label.includes('アップデート前')))

  // ★退避しか残っていなくても読み戻せること。
  //   以前は読み込みが本体・書きかけ・旧bak・世代の4種類しか見ておらず、退避だけが
  //   残った端末では「セーブが1つも無い」と判断して新規ゲーム画面が出ていた。
  //   一覧には出るのにそこへ行けない＝復旧できない、という状態だった。
  for (const k of [...files.keys()]) if (k !== snap) files.delete(k)
  const onlySnap = await st2.saveStorage.getItem(KEY)
  check('アップデート前の退避しか無くても読み戻せる', typeof onlySnap === 'string' && onlySnap.includes('"isInitialized":true'))
  check('読み戻したものが本体に復元される', files.has(FILE))

  // ★スロットの空き判定も同じ一覧を見ること。
  //   以前は本体・書きかけ・旧bak の3つしか見ておらず、世代バックアップだけが残った
  //   スロットが「空き」に見えた。そこに新規作成されると本当に消える。
  for (const k of [...files.keys()]) files.delete(k)
  files.set('jpel-manager-save.bak2.json', { data: mkSave(2000, 40), mtime: 9 })
  check('世代バックアップだけのスロットは「空き」にならない', await st2.slotHasSave(1))

  // データ削除では退避も世代も消える（消したのに戻せる、を作らない）
  await st2.saveStorage.removeItem(KEY)
  const left = [...files.keys()].filter(k => k.startsWith('jpel-manager-save'))
  check('データ削除で退避も世代も残らない', left.length === 0, left.join(', '))

  console.log('')
  if (problems.length > 0) {
    console.log(`✗ 端末内バックアップが効いていません（${problems.length}件）`)
    process.exit(1)
  }
  console.log('✓ 版を上げる前の退避が残り、世代から読み戻せる。削除では全部消える')
}

void main()
