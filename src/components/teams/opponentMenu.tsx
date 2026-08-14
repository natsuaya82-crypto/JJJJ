import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { SPECIALTY_LABELS } from '../../types'
import type { Player } from '../../types'
import { ovr, ratingColor } from '../../utils/playerUtils'
import { C, SAIRA, F } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import ActionSheet from '../ui/ActionSheet'
import BidSheet from '../transfer/BidSheet'
import LoanSheet from '../transfer/LoanSheet'


function PlayerHead({ player }: { player: Player }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <PlayerFace playerId={player.id} nationality={player.nationality} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: F.subLg, fontWeight: 800, color: C.text }}>{player.name}</div>
        <div style={{ fontSize: F.caption, color: C.textDim }}>
          {SPECIALTY_LABELS[player.specialty]} · {player.age}歳 · 残{player.contract.yearsLeft}年
        </div>
      </div>
      <div style={{ fontFamily: SAIRA, fontSize: F.hero, fontWeight: 900, color: ratingColor(ovr(player)) }}>{ovr(player)}</div>
    </div>
  )
}

// 他チーム選手：タップ＝吹き出しメニュー / 長押し＝詳細。移籍オファー・レンタルのオファーが可能。
export function useOpponentMenu() {
  const { players, teams, playerTeamId, currentSeason } = useGameStore()
  const submitTransferBid = useGameStore(s => s.submitTransferBid)
  const submitLoanRequest = useGameStore(s => s.submitLoanRequest)

  const [menuId, setMenuId] = useState<string | null>(null)
  const [offerId, setOfferId] = useState<string | null>(null)
  const [loanId, setLoanId] = useState<string | null>(null)
  // 長押し＝詳細 / タップ＝メニュー。判定は共有フック1本（player/usePlayerLongPress）
  const longPress = usePlayerLongPress()
  const rowHandlers = (pid: string) => longPress(pid, () => {
    const tp = players.find(x => x.id === pid)
    if (tp && tp.teamId === playerTeamId) return  // 自チーム選手の詳細は長押しに統一（タップでは開かない）
    setMenuId(pid)
  })

  const menuPlayer = menuId ? players.find(x => x.id === menuId) : undefined
  const menuItems = (() => {
    if (!menuPlayer) return []
    const items = [
      { label: '移籍オファーを出す', color: C.gold, onClick: () => setOfferId(menuPlayer.id) },
      { label: 'レンタルのオファー', color: C.blue, onClick: () => setLoanId(menuPlayer.id) },
    ]
    return items
  })()

  const overlay = (
    <>
      <ActionSheet
        open={!!menuPlayer}
        onClose={() => setMenuId(null)}
        header={menuPlayer ? <PlayerHead player={menuPlayer} /> : undefined}
        items={menuItems.map(it => ({ ...it, onClick: () => { it.onClick(); setMenuId(null) } }))}
      />

      {offerId && (() => {
        const p = players.find(x => x.id === offerId); if (!p) return null
        const budget = teams.find(t => t.id === playerTeamId)?.finance.budget ?? 0
        const listing = (currentSeason.transferListings ?? []).find(l => l.playerId === p.id)
        return <BidSheet player={p} budget={budget} listing={listing} onSubmit={fee => { submitTransferBid(p.id, fee); setOfferId(null) }} onClose={() => setOfferId(null)} />
      })()}

      {loanId && (() => {
        const p = players.find(x => x.id === loanId); if (!p) return null
        const slots = players.filter(pl => pl.teamId === playerTeamId && pl.loan && pl.loan.ownerTeamId !== playerTeamId).length
        const pending = (currentSeason.loanRequests ?? []).some(r => r.playerId === p.id)
        return <LoanSheet player={p} slots={slots} pending={pending} onSubmit={y => { submitLoanRequest(p.id, y); setLoanId(null) }} onClose={() => setLoanId(null)} />
      })()}
    </>
  )

  return { rowHandlers, overlay }
}
