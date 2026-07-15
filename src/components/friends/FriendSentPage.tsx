import { useState, useRef } from 'react'
import BackButton from '../ui/BackButton'
import { TeamLogoSVG } from '../icons/Icons'
import { useGameStore } from '../../store/gameStore'
import GmShareCard from './GmShareCard'
import { shareElementAsImage } from '../../utils/shareImage'
import { MOCK_SENT, mockMyCode } from '../../data/mockFriends'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function FriendSentPage() {
  const { teams, playerTeamId } = useGameStore()
  const myTeam = teams.find(t => t.id === playerTeamId)
  const myCode = mockMyCode(playerTeamId || 'me')
  const [addCode, setAddCode] = useState('')
  const [sent, setSent] = useState(MOCK_SENT)
  const [sharing, setSharing] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  const shareCode = async () => {
    if (!shareRef.current || sharing) return
    setSharing(true)
    try { await shareElementAsImage(shareRef.current, { filename: 'jpel-gm-card.png', title: 'フレンド申請', text: `GM ${myTeam?.gmName ?? ''} フレンドコード ${myCode} #JPELManager` }) }
    catch { /* noop */ } finally { setSharing(false) }
  }

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 80, minHeight: '100%', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 4px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>申請</div>
      </div>

      {/* 自分のフレンドコード（相手に渡して申請してもらう用） */}
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${alpha(C.gold, 0.4)}` }}>
          <TeamLogoSVG primary={myTeam?.colors.primary ?? '#333'} secondary={myTeam?.colors.secondary ?? '#777'} shortName={myTeam?.shortName ?? '—'} teamId={playerTeamId} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: alpha(C.gold, 0.7), letterSpacing: '1px', fontWeight: 900 }}>あなたのID</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text, letterSpacing: '3px' }}>{myCode}</div>
          </div>
          <button onClick={shareCode} disabled={sharing} style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 9, border: 'none', background: C.gold, color: '#1a0d00', fontSize: 12, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer', opacity: sharing ? 0.6 : 1 }}>{sharing ? '作成中' : '共有'}</button>
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ fontSize: 10, color: alpha(C.gold, 0.6), letterSpacing: '2px', fontWeight: 900, marginBottom: 8 }}>コードで申請</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={addCode} onChange={e => setAddCode(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="コード（数字10桁）"
            style={{ flex: 1, padding: '11px 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.surface2, color: C.text, fontSize: 15, fontFamily: SAIRA, letterSpacing: '3px', outline: 'none' }} />
          <button onClick={() => { if (addCode.length >= 8) { alert(`「${addCode}」に申請を送りました（※UIモック）`); setAddCode('') } }}
            style={{ padding: '0 18px', borderRadius: 10, border: `2px solid ${C.cyan}`, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, color: C.cyan, fontSize: 13, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>申請</button>
        </div>

        <div style={{ fontSize: 10, color: alpha(C.gold, 0.6), letterSpacing: '2px', fontWeight: 900, margin: '20px 0 8px' }}>承認待ち {sent.length}</div>
        {sent.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textGhost, fontSize: 12, padding: '28px 0', background: C.surface2, borderRadius: 12, border: `1px solid ${C.border2}` }}>送信中の申請はありません</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sent.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}` }}>
                <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.shortName} logoId={r.logoId} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.gold, marginTop: 2 }}>GM {r.gmName}</div>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: C.textDim, fontWeight: 700 }}>承認待ち</span>
                  <button onClick={() => setSent(s => s.filter(x => x.id !== r.id))} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 11, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>取消</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 共有用カード（オフスクリーン） */}
      <div ref={shareRef} style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }}>
        <GmShareCard team={myTeam} code={myCode} />
      </div>
    </div>
  )
}
