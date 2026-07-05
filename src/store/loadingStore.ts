import { create } from 'zustand'

// ローディング表示は永続化しない（保存すると固まるため）専用の軽量ストア。
interface LoadingState {
  active: boolean
  label: string
  show: (label?: string) => void
  hide: () => void
}

export const useLoadingStore = create<LoadingState>((set) => ({
  active: false,
  label: '',
  show: (label = '') => set({ active: true, label }),
  hide: () => set({ active: false }),
}))

// 重い同期処理の前にオーバーレイを確実に描画してから実行する。
export function runWithLoading(label: string, fn: () => void, minMs = 500) {
  const { show, hide } = useLoadingStore.getState()
  show(label)
  const start = Date.now()
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { fn() } finally {
      const wait = Math.max(0, minMs - (Date.now() - start))
      setTimeout(hide, wait)
    }
  }))
}
