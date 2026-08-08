import { useState, useEffect } from 'react'
import { getSaveHealthReason } from '../../store/saveHealth'
import { deleteSaveForRecovery, listRecoverables, restoreFrom, type Recoverable } from '../../store/saveStorage'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { APP_VERSION } from '../../data/appMeta'


// セーブの読み込み（hydration）が正常に完了しなかったときに出す画面。
//
// ここが無かった頃は、読み込み失敗時に「セーブが存在しない」のと同じ初期状態が見えるため
// 新規ゲーム画面（Onboarding）が表示され、ユーザーが新チームを作った瞬間に
// 本物のセーブが上書きされて復元不能になっていた。
// この画面が出ている間はセーブへの書き込みを完全に停止しているので、
// 再読み込みすれば元のデータで復帰できる。
export default function SaveRecoveryScreen({ reason }: { reason?: string } = {}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  // 読み込みが失敗した起動では saveHealth に理由が入る。
  // 「読み込みは通ったのに中身が初期状態」のときは呼ぶ側から理由をもらう（App.tsx）
  const detail = getSaveHealthReason() || reason || ''

  // 端末に残っている復旧の候補（本体・書きかけ・世代バックアップ・アップデート前の退避）。
  // 「戻す先が何も無い」状態を作らないために、必ず一覧で見せて選べるようにする。
  const [saves, setSaves] = useState<Recoverable[] | null>(null)
  useEffect(() => { void listRecoverables().then(setSaves) }, [])

  const reload = () => { setBusy(true); window.location.reload() }
  const restore = (path: string) => {
    setBusy(true)
    void restoreFrom(path).finally(() => window.location.reload())
  }
  const fmtSize = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`
  const fmtWhen = (ms: number) => {
    if (!ms) return ''
    const d = new Date(ms)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const wipe = () => {
    setBusy(true)
    void deleteSaveForRecovery().finally(() => window.location.reload())
  }

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, color: C.text,
      fontFamily: "'Noto Sans JP', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 'calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))',
      textAlign: 'center', gap: 14,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, flexShrink: 0,
        background: alpha(C.gold, 0.12), border: `1.5px solid ${alpha(C.gold, 0.45)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 900, color: C.gold, fontFamily: SAIRA,
      }}>!</div>

      <div style={{ fontSize: 17, fontWeight: 900 }}>セーブデータを読み込めませんでした</div>

      <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.8, maxWidth: 330 }}>
        データは端末に残っています。消えていません。<br />
        この画面が出ている間はセーブへの書き込みを停止しているため、上書きされる心配はありません。<br />
        下のボタンから読み込みをやり直してください。
      </div>

      {detail && (
        <div style={{
          maxWidth: 330, width: '100%', padding: '8px 10px', borderRadius: 8,
          background: C.surface2, border: `1px solid ${C.border2}`,
          fontFamily: SAIRA, fontSize: 10, color: C.textDim,
          wordBreak: 'break-all', textAlign: 'left', maxHeight: 96, overflow: 'hidden',
        }}>
          {detail}
        </div>
      )}

      <button
        disabled={busy}
        onClick={reload}
        style={{
          marginTop: 4, padding: '13px 30px', borderRadius: 12, border: 'none',
          cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
          background: `linear-gradient(180deg, ${C.goldHi}, ${C.gold})`, color: '#2b1d00',
          fontSize: 15, fontWeight: 900, fontFamily: 'inherit',
          boxShadow: `0 4px 0 ${C.goldDark}`,
        }}
      >
        もう一度読み込む
      </button>

      {/* 端末に残っている復旧の候補。選んで戻せる。
          戻す前に、いまの本体も世代バックアップへ逃がすので、選び直しがきく */}
      {saves && saves.length > 0 && (
        <div style={{ width: '100%', maxWidth: 330, marginTop: 6, textAlign: 'left' }}>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, fontFamily: SAIRA, letterSpacing: 1 }}>
            端末に残っているデータ（{saves.length}件）— 選んで戻せます
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {saves.map(s2 => (
              <button
                key={s2.path}
                disabled={busy}
                onClick={() => restore(s2.path)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  padding: '9px 11px', borderRadius: 9, cursor: busy ? 'default' : 'pointer',
                  background: C.surface2, border: `1px solid ${C.border2}`, color: C.text,
                  fontSize: 11, fontWeight: 700, fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <span>{s2.label}</span>
                <span style={{ fontSize: 10, color: C.textDim, fontFamily: SAIRA, whiteSpace: 'nowrap' }}>
                  {fmtWhen(s2.mtime)} / {fmtSize(s2.size)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => {
          const body = `JPEL Manager ${APP_VERSION}\nsave load failed\n${detail}`
          void navigator.clipboard?.writeText(body).catch(() => {})
        }}
        style={{
          padding: '9px 18px', borderRadius: 10, cursor: 'pointer',
          background: 'transparent', border: `1px solid ${C.border3}`, color: C.textDim,
          fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
        }}
      >
        エラー内容をコピー
      </button>

      <div style={{ fontSize: 10, color: C.textGhost, marginTop: 2, lineHeight: 1.7, maxWidth: 330 }}>
        アプリを完全に終了してから開き直しても直らない場合は、
        エラー内容をコピーして公式X（@JPEL_MANAGER）までご連絡ください。
      </div>

      {/* 最後の手段。データを捨てるので必ず2段階の確認を挟む */}
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border2}`, width: '100%', maxWidth: 330 }}>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${C.border2}`, color: C.textGhost,
              fontSize: 10, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            どうしても直らない場合（データを削除して最初から）
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, lineHeight: 1.7 }}>
              セーブデータを完全に削除して最初から始めます。<br />
              削除したデータは元に戻せません。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                  background: C.surface2, border: `1px solid ${C.border3}`, color: C.textSub,
                  fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                }}
              >
                やめる
              </button>
              <button
                disabled={busy}
                onClick={wipe}
                style={{
                  padding: '9px 16px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  background: alpha(C.red, 0.16), border: `1px solid ${alpha(C.red, 0.5)}`, color: C.red,
                  fontSize: 11, fontWeight: 900, fontFamily: 'inherit',
                }}
              >
                削除して最初から
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
