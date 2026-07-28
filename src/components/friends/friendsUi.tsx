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

// 取得済みの内容をアプリ起動中だけ覚えておく。
// これが無いと、詳細から一覧へ戻るたびに毎回「読み込み中…」に切り替わり、
// フレンド一覧が一瞬消えてから出てくる（＝消えたように見える）。
const cache = new Map<string, unknown>()

/** 覚えている内容を捨てる（フレンドが増減したときなど） */
export function invalidateFriendsCache(...keys: string[]) {
  if (keys.length === 0) cache.clear()
  else keys.forEach(k => cache.delete(k))
}

/**
 * 非同期取得の状態管理。マウント時に1回走り、reload() で再取得できる。
 * cacheKey を渡すと、前回取得した内容を出したまま裏側で更新する（画面が空にならない）。
 */
export function useFriendsQuery<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string): QueryState<T> {
  const cached = cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined
  const [data, setDataState] = useState<T | undefined>(cached)
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)

  const setData = useCallback((v: T) => {
    if (cacheKey) cache.set(cacheKey, v)
    setDataState(v)
  }, [cacheKey])

  // fn は毎レンダー新しくなるので依存に入れない（deps と tick で制御する）
  useEffect(() => {
    let alive = true
    const prev = cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined
    if (prev === undefined) setLoading(true)   // 中身があるうちは「読み込み中」に戻さない
    setError(false)
    fn()
      .then(v => {
        if (!alive) return
        if (cacheKey) cache.set(cacheKey, v)
        setDataState(v); setLoading(false); setError(false)
      })
      .catch(() => {
        if (!alive) return
        setLoading(false)
        // 前回の内容があるならそれを出したままにする（一度の通信失敗で消さない）
        if (prev === undefined) setError(true)
      })
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
