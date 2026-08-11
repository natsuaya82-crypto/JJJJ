// 通報のダイアログ。走友会のメンバー・掲示板・走友会そのもの・フレンド詳細から開く。
//
// App Store の審査基準 1.2 で「不適切な内容を通報できること」が要る。
// 送り先は Supabase の reports テーブルで、他の利用者からは見えない。
// 相手が利用者の場合は、ここから同時にブロックもできるようにしてある。
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { REPORT_REASONS, REPORT_DETAIL_MAX, sendReport, blockUser, invalidateBlocked, type ReportReason } from '../../lib/moderationApi'


export type ReportTarget = {
  /** 相手の利用者id。走友会だけを通報するときは省く */
  userId?: string
  /** 走友会id。利用者だけを通報するときは省く */
  clubId?: string
  /** ダイアログに出す名前（チーム名や走友会名） */
  name: string
}

export default function ReportSheet({ target, onClose, onDone }: {
  target: ReportTarget
  onClose: () => void
  /** 送り終わったときに、画面に出す文言を返す */
  onDone: (message: string, blocked: boolean) => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [detail, setDetail] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(!!target.userId)
  const [busy, setBusy] = useState(false)

  const canSend = !!reason && !busy

  const onSend = async () => {
    if (!reason) return
    setBusy(true)
    const r = await sendReport({ userId: target.userId, clubId: target.clubId }, reason, detail)
    if (r === 'offline') { setBusy(false); onDone('通信できませんでした', false); return }
    if (r === 'too_many') { setBusy(false); onDone('通報が多すぎます。時間をおいてください', false); return }
    if (r !== 'ok') { setBusy(false); onDone('通報できませんでした', false); return }

    let blocked = false
    if (alsoBlock && target.userId) {
      blocked = await blockUser(target.userId)
      invalidateBlocked()
    }
    setBusy(false)
    onDone(blocked ? '通報してブロックしました' : '通報しました', blocked)
  }

  return createPortal((
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 340, maxHeight: '86svh', overflowY: 'auto',
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${alpha(C.red, 0.5)}`,
          borderRadius: 18,
          boxShadow: `0 0 40px ${alpha(C.red, 0.2)}, 0 8px 32px rgba(0,0,0,0.6)`,
          padding: '22px 20px 18px',
        }}
      >
        <div style={{ fontSize: 9, color: C.red, letterSpacing: '2px', fontWeight: 900, marginBottom: 8, fontFamily: SAIRA }}>通報</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4, lineHeight: 1.4 }}>
          {target.name}
        </div>
        <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6, marginBottom: 14 }}>
          いただいた通報は24時間以内に確認し、必要な対応を行います。相手には通知されません。
        </div>

        <div style={{ fontSize: 10, color: alpha(C.gold, 0.7), fontWeight: 900, letterSpacing: '1px', marginBottom: 6 }}>
          理由をえらぶ
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {REPORT_REASONS.map(r => {
            const on = reason === r.key
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setReason(r.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  background: on ? alpha(C.red, 0.14) : alpha('#000', 0.22),
                  border: `1px solid ${on ? alpha(C.red, 0.6) : C.border}`,
                  color: C.text, fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: 8, flexShrink: 0,
                  border: `1.5px solid ${on ? C.red : C.border3}`,
                  background: on ? C.red : 'transparent',
                }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</span>
              </button>
            )
          })}
        </div>

        <textarea
          value={detail}
          onChange={e => setDetail(e.target.value.slice(0, REPORT_DETAIL_MAX))}
          placeholder="くわしく（任意）"
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 10,
            border: `1px solid ${C.border3}`, background: alpha('#000', 0.25),
            color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'none',
          }}
        />

        {target.userId && (
          <div
            onClick={() => setAlsoBlock(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, cursor: 'pointer' }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              border: `1.5px solid ${alsoBlock ? C.red : C.border3}`,
              background: alsoBlock ? C.red : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1,
            }}>
              {alsoBlock ? '✓' : ''}
            </div>
            <div style={{ fontSize: 12, color: C.textSub, fontWeight: 700 }}>あわせてブロックする</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontFamily: SAIRA, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            やめる
          </button>
          <button
            onClick={onSend}
            disabled={!canSend}
            style={{
              flex: 1.4, padding: '12px', borderRadius: 12,
              border: `2px solid ${canSend ? C.red : C.border2}`,
              background: canSend ? `linear-gradient(180deg, ${alpha(C.red, 0.25)}, ${alpha(C.red, 0.1)})` : 'transparent',
              color: canSend ? C.red : C.textGhost,
              fontFamily: SAIRA, fontSize: 15, fontWeight: 900,
              cursor: canSend ? 'pointer' : 'default',
            }}
          >
            {busy ? '送信中…' : '通報する'}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}
