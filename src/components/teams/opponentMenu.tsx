import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { SPECIALTY_LABELS } from '../../types'
import type { Player } from '../../types'
import { ovr, ratingColor, calcTransferValue } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import NumberDial from '../ui/NumberDial'
import ActionSheet from '../ui/ActionSheet'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
function fmt(yen: number) { return yen >= 100000000 ? `${(yen / 100000000).toFixed(1)}億` : `${Math.round(yen / 10000)}万` }

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }} />
      <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(360px, 92vw)', zIndex: 201, background: C.surface, borderRadius: '16px', border: `1px solid ${C.border2}`, padding: '16px', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
        {children}
      </div>
    </>
  )
}

function PlayerHead({ player }: { player: Player }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <PlayerFace playerId={player.id} nationality={player.nationality} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{player.name}</div>
        <div style={{ fontSize: 10, color: C.textDim }}>{SPECIALTY_LABELS[player.specialty]} · {player.age}歳 · 残{player.contract.yearsLeft}年</div>
      </div>
      <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: ratingColor(ovr(player)) }}>{ovr(player)}</div>
    </div>
  )
}

function OfferModal({ player, budget, onSubmit, onClose }: { player: Player; budget: number; onSubmit: (fee: number) => void; onClose: () => void }) {
  const market = Math.max(1_000_000, Math.round(calcTransferValue(player) / 1_000_000) * 1_000_000)
  const [fee, setFee] = useState(market)
  const over = fee > budget
  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 10 }}>移籍金オファー</div>
      <PlayerHead player={player} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textDim, marginBottom: 4 }}>
        <span>市場価値 <span style={{ color: C.gold, fontFamily: SAIRA }}>{fmt(market)}</span></span>
        <span>予算 <span style={{ color: over ? C.red : C.textSub, fontFamily: SAIRA }}>{fmt(budget)}</span></span>
      </div>
      <div style={{ padding: '4px 0 10px' }}><NumberDial value={fee} onChange={setFee} min={1_000_000} max={budget} /></div>
      <button onClick={() => onSubmit(fee)} disabled={over} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', cursor: over ? 'not-allowed' : 'pointer', opacity: over ? 0.5 : 1, background: C.gold, color: '#1a0d00', fontSize: 14, fontWeight: 900, fontFamily: SAIRA, marginBottom: 8 }}>
        {over ? '予算不足' : `${fmt(fee)}を移籍金としてオファー`}
      </button>
      <button onClick={onClose} style={{ width: '100%', padding: 11, borderRadius: 12, background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>キャンセル</button>
    </ModalShell>
  )
}

function LoanModal({ player, slots, pending, onSubmit, onClose }: { player: Player; slots: number; pending: boolean; onSubmit: (years: number) => void; onClose: () => void }) {
  const full = slots >= 3
  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.blue, letterSpacing: '3px', fontWeight: 900, marginBottom: 10 }}>レンタル要請</div>
      <PlayerHead player={player} />
      <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6, marginBottom: 12 }}>買わずに1〜2年借りる要請。相手が次レースで回答します（レンタル枠 {slots}/3・移籍金なし・給与は自チーム負担）。</div>
      {pending ? (
        <div style={{ fontSize: 13, color: C.blue, fontWeight: 700, textAlign: 'center', padding: 8, marginBottom: 8 }}>レンタル要請中 — 次レースで回答</div>
      ) : full ? (
        <div style={{ fontSize: 13, color: C.red, fontWeight: 700, textAlign: 'center', padding: 8, marginBottom: 8 }}>レンタル枠が満杯です（3/3）</div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {[1, 2].map(y => (
            <button key={y} onClick={() => onSubmit(y)} style={{ flex: 1, padding: 13, borderRadius: 12, border: `1px solid ${alpha(C.blue, 0.5)}`, background: alpha(C.blue, 0.13), color: C.blue, fontSize: 14, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>{y}年で要請</button>
          ))}
        </div>
      )}
      <button onClick={onClose} style={{ width: '100%', padding: 11, borderRadius: 12, background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>閉じる</button>
    </ModalShell>
  )
}

// 他チーム選手：タップ＝吹き出しメニュー / 長押し＝詳細。domestic はトレード可、foreign は移籍(海外)＋視察のみ。
export function useOpponentMenu() {
  const navigate = useNavigate()
  const { players, teams, playerTeamId, currentSeason } = useGameStore()
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const scoutOpponentPlayer = useGameStore(s => s.scoutOpponentPlayer)
  const submitTransferBid = useGameStore(s => s.submitTransferBid)
  const submitLoanRequest = useGameStore(s => s.submitLoanRequest)

  const [menuId, setMenuId] = useState<string | null>(null)
  const [offerId, setOfferId] = useState<string | null>(null)
  const [loanId, setLoanId] = useState<string | null>(null)
  const lp = useRef<{ t?: number; long: boolean }>({ long: false })

  const rowHandlers = (pid: string) => ({
    onPointerDown: () => { lp.current.long = false; lp.current.t = window.setTimeout(() => { lp.current.long = true; openPlayerSheet(pid) }, 450) },
    onPointerUp: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onPointerLeave: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onPointerMove: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onClick: () => {
      if (lp.current.long) { lp.current.long = false; return }
      const tp = players.find(x => x.id === pid)
      if (tp && tp.teamId === playerTeamId) { openPlayerSheet(pid); return }  // 自チーム選手は詳細へ
      setMenuId(pid)
    },
  })

  const menuPlayer = menuId ? players.find(x => x.id === menuId) : undefined
  const menuItems = (() => {
    if (!menuPlayer) return []
    const isForeign = !teams.some(t => t.id === menuPlayer.teamId)
    const scouted = !!(currentSeason.scoutedOpponents ?? []).find(s => s.playerId === menuPlayer.id && currentSeason.year - s.year <= 1)
    const scoutPoints = currentSeason.scoutPoints ?? 0
    const items = [
      { label: '移籍オファーを出す', color: C.gold, onClick: () => setOfferId(menuPlayer.id) },
      { label: 'レンタルのオファー', color: C.blue, onClick: () => setLoanId(menuPlayer.id) },
      // トレードは国内チームのみ（海外クラブとはトレード不可）
      ...(!isForeign ? [{ label: 'トレードを提案', color: C.orange, onClick: () => navigate(`/team/chat?trade=${menuPlayer.teamId}&want=${menuPlayer.id}`) }] : []),
      { label: scouted ? '視察済み' : '視察する（-1PT）', color: C.green, disabled: scouted || scoutPoints < 1, onClick: () => scoutOpponentPlayer(menuPlayer.id, 1) },
    ]
    return items
  })()

  const overlay = (
    <>
      <ActionSheet
        open={!!menuPlayer}
        onClose={() => setMenuId(null)}
        items={menuItems.map(it => ({ ...it, onClick: () => { it.onClick(); setMenuId(null) } }))}
      />

      {offerId && (() => {
        const p = players.find(x => x.id === offerId); if (!p) return null
        const budget = teams.find(t => t.id === playerTeamId)?.finance.budget ?? 0
        return <OfferModal player={p} budget={budget} onSubmit={fee => { submitTransferBid(p.id, fee); setOfferId(null) }} onClose={() => setOfferId(null)} />
      })()}

      {loanId && (() => {
        const p = players.find(x => x.id === loanId); if (!p) return null
        const slots = players.filter(pl => pl.teamId === playerTeamId && pl.loan && pl.loan.ownerTeamId !== playerTeamId).length
        const pending = (currentSeason.loanRequests ?? []).some(r => r.playerId === p.id)
        return <LoanModal player={p} slots={slots} pending={pending} onSubmit={y => { submitLoanRequest(p.id, y); setLoanId(null) }} onClose={() => setLoanId(null)} />
      })()}
    </>
  )

  return { rowHandlers, overlay }
}
