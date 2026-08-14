/**
 * 【セーブの書き込みは1操作に1回】JSON化を set() のたびにやらせない。
 *
 * ■なぜ要るのか
 *   zustand の persist は **set() のたびに** partialize + JSON.stringify を実行する。
 *   createJSONStorage を挟むと、その文字列がそのまま storage.setItem に渡ってくる。
 *   つまり保存側でいくらデバウンスしても、**数MBのJSON化はもう済んでいる**。
 *   実測で、選手6,927人のセーブ（10.29MB）は1回 73ms。ボタンを押すたびに毎回これが走る。
 *   （実機はもっと遅い）
 *
 *   src/store/saveStorage.ts の jsonSaveStorage は「状態そのもの」を受け取り、
 *   JSON化を書き込みと同じデバウンスの中でやる。連続する set() は最後の1つだけが
 *   JSON化される＝1操作1回。set() 1回あたり 73ms → 4ms。
 *
 * ■何を見るか
 *   ① persist が createJSONStorage を使っていないこと（使うと元に戻る）
 *   ② 書き込みの関門が1本（stageWrite）で、判定の写しが他所に無いこと
 *   ③ 連続する set() で JSON化が1回しか走らないこと（実際に動かす）
 *   ④ flushSaveNow が、まだJSON化していないぶんも書くこと
 *      （ここを飛ばすと「レース確定の直後に落ちると1レース消える」）
 *   ⑤ データ削除のあとに、溜めていたぶんが書き戻らないこと
 */
import { readFileSync } from 'node:fs'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const KEY = 'jpel-manager-save'
const src = (p: string) => readFileSync(p, 'utf8')

// ── ①② ソースを読んで確かめる ───────────────────────────────
function sourceChecks() {
  console.log('[1] JSON化を遅らせる形が保たれているか')
  const store = src('src/store/gameStore.ts')
  check('persist が createJSONStorage を使っていない', !/createJSONStorage\s*\(/.test(store),
    'createJSONStorage は set() のたびに数MBをJSON化する')
  check('persist の storage は jsonSaveStorage', /storage:\s*jsonSaveStorage/.test(store))

  console.log('[2] 書き込みの関門は1本')
  const save = src('src/store/saveStorage.ts')
  const guardMarks = [
    ['新規状態で上書きしない判定', /loadedInitialized && !isInit\(/g],
    ['中身が消し飛んだ判定', /loadedPlayerCount \* COLLAPSE_RATIO/g],
  ] as const
  for (const [label, re] of guardMarks) {
    const n = (save.match(re) ?? []).length
    check(`${label}は1か所だけ`, n === 1, `${n}か所ある`)
  }
  check('flushSaveNow が溜めたぶんをJSON化してから書く',
    /export async function flushSaveNow[\s\S]{0,220}serializePending\(\)/.test(save))
  check('デバウンスの待ち時間は1本（WRITE_DELAY_MS）',
    (save.match(/, WRITE_DELAY_MS\)/g) ?? []).length === 2 && !/\}, 400\)/.test(save),
    '待ち時間を書き足すと、JSON化と書き込みで二重に待つ')
}

// ── ③④⑤ 実際に動かして確かめる ─────────────────────────────
const mkState = (n: number, tag: string) => ({
  state: {
    isInitialized: true,
    tag,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, specialty: 'ace' })),
  },
  version: 40,
})

// JSON化が何回走ったかを数える（大きいものだけ）
const realStringify = JSON.stringify
let bigStringifies = 0
JSON.stringify = ((v: unknown, ...rest: unknown[]) => {
  const out = realStringify(v as never, ...(rest as []))
  if (typeof out === 'string' && out.includes('"specialty":')) bigStringifies++
  return out
}) as typeof JSON.stringify

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

async function runtimeChecks() {
  const { jsonSaveStorage, saveStorage, flushSaveNow, deleteSaveForRecovery } = await import('../src/store/saveStorage')

  // 進行中のセーブがある状態にしておく（ガードを本番と同じ向きに効かせる）
  localStorage.setItem(KEY, realStringify(mkState(300, 'loaded')))
  await saveStorage.getItem(KEY)

  console.log('[3] 連続する set() でJSON化は1回だけ')
  bigStringifies = 0
  for (let i = 0; i < 10; i++) jsonSaveStorage.setItem(KEY, mkState(300, `t${i}`) as never)
  check('デバウンス中はまだJSON化していない', bigStringifies === 0, `${bigStringifies}回走った`)
  await wait(700)
  check('10回の set() でJSON化は1回', bigStringifies === 1, `${bigStringifies}回走った`)
  check('書かれたのは最後のもの', (localStorage.getItem(KEY) ?? '').includes('"tag":"t9"'))

  console.log('[4] flushSaveNow は溜めたぶんを書く')
  bigStringifies = 0
  jsonSaveStorage.setItem(KEY, mkState(300, 'urgent') as never)
  await flushSaveNow()
  check('デバウンスを待たずに書かれる', (localStorage.getItem(KEY) ?? '').includes('"tag":"urgent"'))
  check('そのJSON化も1回だけ', bigStringifies === 1, `${bigStringifies}回走った`)
  // 溜めたぶんを吐き出したので、あとから二重に書かれない
  await wait(700)
  check('あとから二重に書かれない', bigStringifies === 1, `${bigStringifies}回走った`)

  console.log('[5] データ削除のあとに書き戻らない')
  // 復旧画面からの削除は saveStorage.removeItem を直に通る（jsonSaveStorage を経由しない）。
  // 溜めてある書きかけを捨てる場所が jsonSaveStorage 側にしか無いと、ここで書き戻る
  jsonSaveStorage.setItem(KEY, mkState(300, 'ghost') as never)
  await deleteSaveForRecovery()
  await wait(700)
  check('復旧画面から消したセーブが復活しない', localStorage.getItem(KEY) === null,
    `${(localStorage.getItem(KEY) ?? '').slice(0, 60)}`)
  jsonSaveStorage.setItem(KEY, mkState(300, 'ghost2') as never)
  await jsonSaveStorage.removeItem(KEY)
  await wait(700)
  check('データ削除から消したセーブも復活しない', localStorage.getItem(KEY) === null,
    `${(localStorage.getItem(KEY) ?? '').slice(0, 60)}`)
}

async function main() {
  sourceChecks()
  await runtimeChecks()
  console.log('')
  if (problems.length > 0) {
    console.log(`✗ セーブの書き込みが1操作1回になっていません（${problems.length}件）`)
    process.exit(1)
  }
  console.log('✓ JSON化は書き込みと同じデバウンスの中で1回だけ。関門も1本')
}

void main()
