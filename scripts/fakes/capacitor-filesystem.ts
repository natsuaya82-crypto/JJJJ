// 点検スクリプト用の偽 @capacitor/filesystem（メモリ上の疑似ファイル）
export const Directory = { Data: 'DATA' } as const
export const Encoding = { UTF8: 'utf8' } as const

export const __files = new Map<string, { data: string; mtime: number }>()
let clock = 1_000_000

export const Filesystem = {
  stat: async ({ path }: { path: string }) => {
    const f = __files.get(path)
    if (!f) throw new Error(`not found: ${path}`)
    return { size: f.data.length, mtime: f.mtime, type: 'file', uri: path }
  },
  readFile: async ({ path }: { path: string }) => {
    const f = __files.get(path)
    if (!f) throw new Error(`not found: ${path}`)
    return { data: f.data }
  },
  writeFile: async ({ path, data }: { path: string; data: string }) => {
    __files.set(path, { data, mtime: ++clock })
    return { uri: path }
  },
  deleteFile: async ({ path }: { path: string }) => {
    if (!__files.delete(path)) throw new Error(`not found: ${path}`)
  },
  copy: async ({ from, to }: { from: string; to: string }) => {
    const f = __files.get(from)
    if (!f) throw new Error(`not found: ${from}`)
    __files.set(to, { data: f.data, mtime: ++clock })
  },
  rename: async ({ from, to }: { from: string; to: string }) => {
    const f = __files.get(from)
    if (!f) throw new Error(`not found: ${from}`)
    __files.set(to, { data: f.data, mtime: ++clock })
    __files.delete(from)
  },
}
