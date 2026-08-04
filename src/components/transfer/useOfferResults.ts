import { useState } from 'react'
import type { OfferOutcome } from '../../utils/offerResult'
import { offerResultText } from '../../utils/offerResult'

// 「他クラブから来たオファーに返事をした結果」を溜めておく入れ物。
// 見た目は OfferResultList.tsx。この repo は useNotifCount.ts / usePlayerLongPress.ts と同じく
// フックは単独ファイルに置く決まりなので、画面と同じファイルには置かない。
export type OfferResultRow = { id: string; text: string; ok: boolean }

export function useOfferResults() {
  const [results, setResults] = useState<OfferResultRow[]>([])
  // 同じオファーに結果が二重に積まれないよう、同じidは差し替える
  const push = (id: string, outcome: OfferOutcome, a: { playerName: string; teamName: string; price: number }) => {
    const r = offerResultText(outcome, a)
    setResults(prev => [...prev.filter(x => x.id !== id), { id, text: r.text, ok: r.ok }])
  }
  // レンタルなど、結果の文章が offerResult の対象外のものだけ直に積む
  const pushText = (id: string, text: string, ok: boolean) =>
    setResults(prev => [...prev.filter(x => x.id !== id), { id, text, ok }])
  const dismiss = (id: string) => setResults(prev => prev.filter(x => x.id !== id))
  return { results, push, pushText, dismiss }
}
