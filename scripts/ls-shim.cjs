// Node には localStorage が無い。セーブまわりの点検スクリプトが使う最小の代替。
// （本番では実機はファイル保存、ブラウザは本物の localStorage）
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: k => { store.delete(k) },
  clear: () => store.clear(),
  key: i => [...store.keys()][i] ?? null,
  get length() { return store.size },
}
