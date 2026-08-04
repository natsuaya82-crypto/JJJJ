import { C, alpha } from '../../styles/tokens'
import type { OfferResultRow } from './useOfferResults'

// 「他クラブから来たオファーに返事をした結果」の見せ方。
//
// 返事をするとオファーの札はストアから消えるので、結果はこの一時的な行で見せて「確認」で閉じる。
// 同じ仕組みがチャット画面と移籍画面に丸ごと2つ手書きされていて、3つめのオファー一覧には
// そもそも無かった（＝下限15人で売れないとき、ボタンを押しても何も起きない死んだボタンだった）。
// 状態(useOfferResults)も見た目(ここ)も1本にして、使う側は置くだけにする。
export function OfferResultList({ results, dismiss, spacing = 8 }: {
  results: OfferResultRow[]
  dismiss: (id: string) => void
  spacing?: number
}) {
  return <>{results.map(r => (
    <div key={r.id} style={{ borderRadius: 12, background: alpha(r.ok ? C.green : C.red, 0.08), border: `1.5px solid ${alpha(r.ok ? C.green : C.red, 0.45)}`, padding: '10px 12px', marginBottom: spacing, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, fontSize: 12, color: C.text, lineHeight: 1.6 }}>{r.text}</div>
      <button onClick={() => dismiss(r.id)} style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 9, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>確認</button>
    </div>
  ))}</>
}
