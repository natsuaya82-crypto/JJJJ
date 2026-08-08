import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import NoticeDialog from '../ui/NoticeDialog'
import { useFriendsQuery, LoadingBox, ErrorBox } from '../friends/friendsUi'
import { createRoom, joinRoom, myMatchStats, DEFAULT_RULES } from '../../lib/roomsApi'
import { syncServerTime } from '../../lib/serverTime'
import { C, alpha, SAIRA, FONT } from '../../styles/tokens'


// オンライン対戦の入口。部屋を立てるか、6桁の番号で入るかだけの画面。
export default function MatchEntryPage() {
  const navigate = useNavigate()
  const stats = useFriendsQuery(myMatchStats, [], 'mpStats')

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)

  const onCreate = async () => {
    if (busy) return
    setBusy('create')
    try {
      await syncServerTime()   // 締め切りを全員で揃えるため、先に時計を合わせておく
      const room = await createRoom(DEFAULT_RULES, 20)
      navigate(`/online/room/${room.id}`)
    } catch {
      setNotice({ title: '部屋を作れませんでした', message: '電波の良い場所で、もう一度お試しください' })
    } finally { setBusy(null) }
  }

  const onJoin = async () => {
    if (busy || code.length !== 6) return
    setBusy('join')
    try {
      await syncServerTime()
      const res = await joinRoom(code)
      if (res.status === 'joined') { navigate(`/online/room/${res.roomId}`); return }
      setNotice({
        title:
          res.status === 'full'    ? '満員です' :
          res.status === 'started' ? 'もう始まっています' :
                                     '部屋が見つかりません',
        message:
          res.status === 'full'    ? 'この部屋は上限まで埋まっています。' :
          res.status === 'started' ? 'その部屋はすでに対戦が始まっているため、途中から入れません。' :
                                     '番号が違うか、部屋が閉じられた可能性があります。',
      })
    } catch {
      setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' })
    } finally { setBusy(null) }
  }

  const s = stats.data

  return (
    <div style={{ fontFamily: FONT, paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '8px 12px 0' }}><BackButton /></div>
      <div style={{ padding: '8px 16px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.cyan, letterSpacing: '3px', fontWeight: 900, marginBottom: 4 }}>ONLINE MATCH</div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>オンライン対戦</div>
      </div>

      {/* 通算成績 */}
      <div style={{ padding: '0 12px' }}>
        {stats.loading ? <LoadingBox /> : stats.error ? <ErrorBox onRetry={stats.reload} /> : (
          <div style={{ display: 'flex', gap: 8 }}>
            {[['対戦数', `${s?.played ?? 0}`], ['優勝', `${s?.wins ?? 0}`], ['不戦敗', `${s?.forfeits ?? 0}`]].map(([k, v]) => (
              <div key={k} style={{ flex: 1, padding: '10px 8px', borderRadius: 10, background: C.surface2, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: C.textDim, marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: C.text, fontFamily: SAIRA }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 部屋を作る */}
      <div style={{ padding: '18px 12px 0' }}>
        <button onClick={onCreate} disabled={!!busy} className="btn-press" style={{
          width: '100%', padding: '16px 14px', borderRadius: 14, border: `2px solid ${C.goldDark}`,
          background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
          boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5)`,
          color: C.gold, fontFamily: SAIRA, fontSize: 17, fontWeight: 900,
          cursor: 'pointer', opacity: busy ? 0.5 : 1,
        }}>
          {busy === 'create' ? '作成中…' : '部屋を作る'}
        </button>
      </div>

      {/* 番号で入る */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: alpha(C.gold, 0.55), letterSpacing: '2px', fontWeight: 900, marginBottom: 8 }}>番号で入る</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            style={{ flex: 1, minWidth: 0, width: 0, padding: '11px 14px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.surface2, color: C.text, fontSize: 20, fontWeight: 900, fontFamily: SAIRA, letterSpacing: '10px', textAlign: 'center', outline: 'none' }}
          />
          <button onClick={onJoin} disabled={!!busy || code.length !== 6} style={{
            flexShrink: 0, minWidth: 72, whiteSpace: 'nowrap',
            padding: '0 16px', borderRadius: 10, border: `2px solid ${C.cyan}`,
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, color: C.cyan,
            fontSize: 13, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer',
            opacity: busy || code.length !== 6 ? 0.45 : 1,
          }}>{busy === 'join' ? '確認中' : '入る'}</button>
        </div>
      </div>

      {notice && <NoticeDialog title={notice.title} message={notice.message} onClose={() => setNotice(null)} />}
    </div>
  )
}
