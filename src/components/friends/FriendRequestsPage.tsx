// 「申請」と「承認」を1画面にまとめたページ。
// 分けていた頃は申請を送るたびに承認ページへ戻る必要があって面倒だったため、
// 自分のコード・コード入力・届いた申請・送った申請を縦に並べて1画面で完結させる。
import { useState, useRef } from 'react'
import BackButton from '../ui/BackButton'
import ConfirmDialog from '../ui/ConfirmDialog'
import NoticeDialog from '../ui/NoticeDialog'
import { TeamLogoSVG } from '../icons/Icons'
import { useGameStore } from '../../store/gameStore'
import GmShareCard from './GmShareCard'
import { shareElementAsImage } from '../../utils/shareImage'
import {
  myCode, listSent, listReceived, findByCode, sendRequest,
  cancelRequest, acceptRequest, rejectRequest, SEND_RESULT_TEXT,
} from '../../lib/friendsApi'
import type { FriendRequest } from '../../lib/friendsApi'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox, invalidateFriendsCache } from './friendsUi'
import { C, alpha, SAIRA } from '../../styles/tokens'


function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: alpha(C.gold, 0.6), letterSpacing: '2px', fontWeight: 900, margin: '20px 0 8px' }}>
      {children}
    </div>
  )
}

/** ダイアログの中に出す相手のチームカード（誰に申請するのかを目で確認する用） */
function TargetCard({ r }: { r: FriendRequest }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, background: alpha(C.bg, 0.5), border: `1px solid ${C.border2}` }}>
      <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.shortName} logoId={r.logoId} size={44} />
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.gold, marginTop: 2 }}>GM {r.gmName}</div>
      </div>
    </div>
  )
}

/** 申請の一覧に出す1行 */
function RequestRow({ r, dim, right }: { r: FriendRequest; dim?: boolean; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}`, opacity: dim ? 0.5 : 1 }}>
      <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.shortName} logoId={r.logoId} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.gold, marginTop: 2 }}>GM {r.gmName}</div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>{right}</div>
    </div>
  )
}

export default function FriendRequestsPage() {
  const { teams, playerTeamId } = useGameStore()
  const myTeam = teams.find(t => t.id === playerTeamId)

  const code = useFriendsQuery(myCode, [], 'myCode')
  const recvQ = useFriendsQuery(listReceived, [], 'received')
  const sentQ = useFriendsQuery(listSent, [], 'sent')
  const myCodeText = code.data ?? (code.error ? '— — — — —' : '·····  ·····')
  const received = recvQ.data ?? []
  const sent = sentQ.data ?? []

  const [addCode, setAddCode] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  // 自前のポップアップ（端末標準の alert / confirm は使わない）
  const [notice, setNotice] = useState<{ title: string; message?: string; target?: FriendRequest } | null>(null)
  const [confirmSend, setConfirmSend] = useState<FriendRequest | null>(null)

  const offline = () => setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' })

  const shareCode = async () => {
    if (!shareRef.current || sharing || !code.data) return
    setSharing(true)
    try { await shareElementAsImage(shareRef.current, { filename: 'jpel-gm-card.png', title: 'フレンド申請', text: `GM ${myTeam?.gmName ?? ''} フレンドコード ${myCodeText} #JPELManager` }) }
    catch { /* noop */ } finally { setSharing(false) }
  }

  // 申請ボタン：いきなり送らず、まず相手を引いて確認ダイアログを出す
  const onCheck = async () => {
    if (sending || addCode.length !== 10) return
    setSending(true)
    try {
      const found = await findByCode(addCode)
      if (!found) setNotice({ title: 'そのコードのGMは見つかりませんでした', message: 'コードの数字10桁をもう一度確かめてください' })
      else if (sent.some(s => s.id === found.id)) setNotice({ title: 'すでに申請中です', target: found })
      else setConfirmSend(found)
    } catch { offline() }
    finally { setSending(false) }
  }

  const onSend = async () => {
    const target = confirmSend
    setConfirmSend(null)
    if (!target) return
    setSending(true)
    try {
      const res = await sendRequest(addCode)
      // 送れた／成立したときだけ入力を消して一覧を引き直す。言い方は SEND_RESULT_TEXT 1本
      if (res === 'accepted' || res === 'sent') {
        setAddCode('')
        invalidateFriendsCache('friends', 'sent', 'received')
        recvQ.reload(); sentQ.reload()
      }
      setNotice({ ...SEND_RESULT_TEXT[res], target: res === 'not_found' || res === 'self' ? undefined : target })
    } catch { offline() }
    finally { setSending(false) }
  }

  const onAccept = async (r: FriendRequest) => {
    if (busy) return
    setBusy(r.id)
    try {
      await acceptRequest(r.id)
      recvQ.setData(received.filter(x => x.id !== r.id))
      invalidateFriendsCache('friends')
      setNotice({ title: 'フレンドになりました', target: r })
    } catch { offline() }
    finally { setBusy(null) }
  }

  const onReject = async (r: FriendRequest) => {
    if (busy) return
    setBusy(r.id)
    try { await rejectRequest(r.id); recvQ.setData(received.filter(x => x.id !== r.id)) }
    catch { offline() }
    finally { setBusy(null) }
  }

  const onCancel = async (r: FriendRequest) => {
    if (busy) return
    setBusy(r.id)
    try { await cancelRequest(r.id); sentQ.setData(sent.filter(x => x.id !== r.id)) }
    catch { offline() }
    finally { setBusy(null) }
  }

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 80, minHeight: '100%', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 4px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>申請・承認</div>
      </div>

      {/* 自分のフレンドコード（相手に渡して申請してもらう用） */}
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${alpha(C.gold, 0.4)}` }}>
          <TeamLogoSVG primary={myTeam?.colors.primary ?? '#333'} secondary={myTeam?.colors.secondary ?? '#777'} shortName={myTeam?.shortName ?? '—'} teamId={playerTeamId} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: alpha(C.gold, 0.7), letterSpacing: '1px', fontWeight: 900 }}>あなたのID</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: code.data ? C.text : C.textGhost, letterSpacing: '3px' }}>{myCodeText}</div>
          </div>
          {code.error ? (
            <button onClick={code.reload} style={{ flexShrink: 0, padding: '9px 12px', borderRadius: 9, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 11, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>再取得</button>
          ) : (
            <button onClick={shareCode} disabled={sharing || !code.data} style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 9, border: 'none', background: C.gold, color: '#1a0d00', fontSize: 12, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer', opacity: sharing || !code.data ? 0.6 : 1 }}>{sharing ? '作成中' : '共有'}</button>
          )}
        </div>
      </div>

      <div style={{ padding: '4px 16px 0' }}>
        <SectionLabel>コードで申請</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={addCode} onChange={e => setAddCode(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="コード（数字10桁）"
            style={{ flex: 1, padding: '11px 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.surface2, color: C.text, fontSize: 15, fontFamily: SAIRA, letterSpacing: '3px', outline: 'none' }} />
          <button onClick={onCheck} disabled={sending || addCode.length !== 10}
            style={{ padding: '0 18px', borderRadius: 10, border: `2px solid ${C.cyan}`, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, color: C.cyan, fontSize: 13, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer', opacity: sending || addCode.length !== 10 ? 0.45 : 1 }}>{sending ? '確認中' : '申請'}</button>
        </div>

        {/* 届いた申請（承認・拒否） */}
        <SectionLabel>届いた申請 {recvQ.loading || recvQ.error ? '' : received.length}</SectionLabel>
        {recvQ.loading ? <LoadingBox /> : recvQ.error ? <ErrorBox onRetry={recvQ.reload} /> : received.length === 0 ? (
          <EmptyBox label="新しい申請はありません" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {received.map(r => (
              <RequestRow key={r.id} r={r} dim={busy === r.id} right={<>
                <button onClick={() => onAccept(r)} disabled={!!busy} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: C.gold, color: '#1a0d00', fontSize: 12, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>承認</button>
                <button onClick={() => onReject(r)} disabled={!!busy} style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 12, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>拒否</button>
              </>} />
            ))}
          </div>
        )}

        {/* 送った申請（取消） */}
        <SectionLabel>送った申請 {sentQ.loading || sentQ.error ? '' : sent.length}</SectionLabel>
        {sentQ.loading ? <LoadingBox /> : sentQ.error ? <ErrorBox onRetry={sentQ.reload} /> : sent.length === 0 ? (
          <EmptyBox label="送信中の申請はありません" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sent.map(r => (
              <RequestRow key={r.id} r={r} dim={busy === r.id} right={<>
                <span style={{ fontSize: 10, color: C.textDim, fontWeight: 700 }}>承認待ち</span>
                <button onClick={() => onCancel(r)} disabled={!!busy} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 11, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>取消</button>
              </>} />
            ))}
          </div>
        )}
      </div>

      {/* 共有用カード（オフスクリーン） */}
      <div ref={shareRef} style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }}>
        <GmShareCard team={myTeam} code={myCodeText} />
      </div>

      {confirmSend && (
        <ConfirmDialog
          title="このGMに申請しますか？"
          confirmLabel="申請する"
          accent={C.cyan}
          onConfirm={onSend}
          onCancel={() => setConfirmSend(null)}
        >
          <TargetCard r={confirmSend} />
        </ConfirmDialog>
      )}

      {notice && (
        <NoticeDialog title={notice.title} message={notice.message} onClose={() => setNotice(null)}>
          {notice.target && <TargetCard r={notice.target} />}
        </NoticeDialog>
      )}
    </div>
  )
}
