import { create } from 'zustand'
import type { Player } from '../types'

// 通常のストア(players)に居ない選手（フレンドのロスター等）でも、選手詳細シートを
// 長押しで開けるようにするための一時的なプレビュー登録。永続化しない軽量ストア。
interface PreviewState {
  players: Player[]
  setPlayers: (players: Player[]) => void
  clear: () => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  players: [],
  setPlayers: (players) => set({ players }),
  clear: () => set({ players: [] }),
}))
