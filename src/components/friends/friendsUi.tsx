// フレンド系画面で共通の「読み込み中／通信失敗」表示と、取得用の小さなフック。
// 見た目は既存の空状態（薄い箱＋中央テキスト）に合わせてある。
import { useCallback, useEffect, useState } from 'react'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export type QueryState<T> = {
  data: T | undefined
  loading: boolean
  error: boolean
  reload: () => void
  setData: (v: T) => void
}

/** 非同期取得の状態管理。マウント時に1回走り、reload() で再取得できる。 */
export function useFriendsQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)

  // fn は毎レンダー新しくなるので依存に入れない（deps と tick で制御する）
  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    fn()
      .then(v => { if (alive) { setData(v); setLoading(false) } })
      .catch(() => { if (alive) { setError(true); setLoading(false) } })
    return () => { alive = false }
  }, [tick, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setTick(t => t + 1), [])
  return { data, loading, error, reload, setData }
}

const boxStyle: React.CSSProperties = {
  textAlign: 'center', color: C.textGhost, fontSize: 12, padding: '28px 16px',
  background: C.surface2, borderRadius: 12, border: `1px solid ${C.border2}`,
  fontFamily: SAIRA,
}

export function LoadingBox({ label = '読み込み中…' }: { label?: string }) {
  return <div style={boxStyle}>{label}</div>
}

export function ErrorBox({ onRetry }: { onRetry?: () => void }) {
  return (
    <div style={boxStyle}>
      <div>通信できませんでした</div>
      <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>電波の良い場所で、もう一度お試しください</div>
      {onRetry && (
        <button onClick={onRetry} className="btn-press" style={{
          marginTop: 12, padding: '8px 18px', borderRadius: 9, cursor: 'pointer',
          border: `2px solid ${alpha(C.gold, 0.5)}`, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          color: C.gold, fontSize: 12, fontWeight: 900, fontFamily: SAIRA,
        }}>再読み込み</button>
      )}
    </div>
  )
}

export function EmptyBox({ label }: { label: string }) {
  return <div style={boxStyle}>{label}</div>
}
