// セーブ読み込み（hydration）の状態を1か所で持つ小さなモジュール。
//
// zustand の persist は読み込み処理の中で起きた例外を内部の .catch で握り潰し、
// そのとき hasHydrated を true にせず onFinishHydration も発火しない。
// つまり「読み込みが失敗した」ことは外から一切分からない。
// ここで状態を持ち、onRehydrateStorage（失敗時に呼ばれる唯一のフック）から更新することで、
//  ・失敗したまま新規ゲーム画面（Onboarding）を出して既存セーブを上書きする事故を防ぐ
//  ・失敗した起動では一切書き込まない
// の2点を成立させる。
export type SaveHealth = 'loading' | 'ok' | 'failed'

let status: SaveHealth = 'loading'
let reason = ''
const listeners = new Set<(s: SaveHealth) => void>()

export function getSaveHealth(): SaveHealth { return status }
export function getSaveHealthReason(): string { return reason }

export function setSaveHealth(next: SaveHealth, why = ''): void {
  if (why) reason = why
  else if (next === 'ok') reason = ''
  if (status === next) return
  status = next
  // リスナー側の例外で他のリスナーが止まらないようにする（ここは絶対に落ちてはいけない）
  for (const l of listeners) {
    try { l(next) } catch (e) { console.error('[save] health listener failed', e) }
  }
}

export function onSaveHealthChange(cb: (s: SaveHealth) => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
