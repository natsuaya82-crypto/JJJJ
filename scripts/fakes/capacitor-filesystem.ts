// 点検スクリプト用の偽 @capacitor/filesystem（メモリ上の疑似ファイル）
export const Directory = { Data: 'DATA' } as const
export const Encoding = { UTF8: 'utf8' } as const

export const __files = new Map<string, { data: string; mtime: number }>()
let clock = 1_000_000

// ── 途中でアプリが落ちたことにする（`check-save-crash` 用）──
// 何回目の書き込み・削除で落とすかを指定すると、そこで例外を投げる。
// **実際に落として、完全なセーブが1本以上残っているかを見る**ために使う。
let opsUntilCrash = -1
export function __crashAfter(n: number): void { opsUntilCrash = n }
export function __noCrash(): void { opsUntilCrash = -1 }
export class FakeCrash extends Error {}
function tick(): void {
  if (opsUntilCrash < 0) return
  if (opsUntilCrash-- === 0) throw new FakeCrash('crash')
}

export const Filesystem = {
  stat: async ({ path }: { path: string }) => {
    const f = __files.get(path)
    if (!f) throw new Error(`not found: ${path}`)
    return { size: f.data.length, mtime: f.mtime, type: 'file', uri: path }
  },
  readdir: async () => ({
    files: [...__files.entries()].map(([name, f]) => ({ name, size: f.data.length, mtime: f.mtime, type: 'file', uri: name })),
  }),
  readFile: async ({ path }: { path: string }) => {
    const f = __files.get(path)
    if (!f) throw new Error(`not found: ${path}`)
    return { data: f.data }
  },
  writeFile: async ({ path, data }: { path: string; data: string }) => {
    tick()
    __files.set(path, { data, mtime: ++clock })
    return { uri: path }
  },
  deleteFile: async ({ path }: { path: string }) => {
    tick()
    if (!__files.delete(path)) throw new Error(`not found: ${path}`)
  },
  copy: async ({ from, to }: { from: string; to: string }) => {
    tick()
    const f = __files.get(from)
    if (!f) throw new Error(`not found: ${from}`)
    __files.set(to, { data: f.data, mtime: ++clock })
  },
  rename: async ({ from, to }: { from: string; to: string }) => {
    tick()
    const f = __files.get(from)
    if (!f) throw new Error(`not found: ${from}`)
    __files.set(to, { data: f.data, mtime: ++clock })
    __files.delete(from)
  },
}
