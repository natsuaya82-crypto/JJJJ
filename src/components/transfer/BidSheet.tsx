import { createPortal } from 'react-dom'
import { useState } from 'react'
import { useAdHeight } from '../layout/Layout'
import NumberDial from '../ui/NumberDial'
import { calcTransferValue, playerConsentToMove, keyPlayerStatus } from '../../utils/playerUtils'
import { bidThreshold, transferAcceptChance, listedAcceptChance, roundFee } from '../../data/economy'
import { useGameStore } from '../../store/gameStore'
import { C, SAIRA, F, bottomStack } from '../../styles/tokens'
import type { Player, TransferListing } from '../../types'
import { fmtYen } from '../../utils/money'
import { tierOfPlayerClub, allTieredClubs } from '../../utils/clubTier'
import GlassButton from '../ui/GlassButton'
import { facilitiesOf } from '../../utils/facilities'


// 移籍金オファーの下部シート（成立確率つき）。移籍市場・他チームタブ共通。
export default function BidSheet({ player, budget, listing, onSubmit, onClose }: {
  player: Player
  budget: number
  listing?: TransferListing
  onSubmit: (fee: number) => void
  onClose: () => void
}) {
  const adH = useAdHeight()
  const val = calcTransferValue(player)
  // 出品中はクラブ希望額(askingPrice)が受諾ライン。デフォルト入札額も希望額に合わせる（満額＝ほぼ成立）。
  const initFee = listing ? roundFee(listing.askingPrice) : roundFee(val * 0.85)
  const [fee, setFee] = useState(Math.max(1_000_000, initFee))
  const over = fee > budget

  // 本人の意向：クラブが合意しても本人が納得しなければ成立しない（契約段階と同じ判定）ので、入札前に見せる
  const { currentSeason, pastSeasons, teams, playerTeamId, foreignLeagues, destinationOf } = useGameStore()
  // 行き先の姿は store の destinationOf 1本。**成立したときに実際に使われるものと同じ**。
  // 以前はここに「格」だけを渡していて、中で空のロスターから行き先が作られていた。
  // そのため序列・優勝・ECL・憧れの地域・成長上限が全部抜けた答えを表示していて、
  // 本人の実際の答えと 40.4% 食い違っていた（「前向き」と出るのに断られる）
  const myDest = destinationOf(playerTeamId, player)
  const srcTier = tierOfPlayerClub(player.teamId, allTieredClubs(teams, foreignLeagues))
  const scoutLv = facilitiesOf(teams.find(t => t.id === playerTeamId)).scoutOffice
  const consentBase = scoutLv * 0.02
  // 年俸ボーナス（相場1.2倍=+0.1 / 1.5倍=+0.2）でどこまで説得できるかを段階表示
  const mind = playerConsentToMove(player, myDest, srcTier, 0.5, 0, consentBase, true).ok ? 'willing'
    : playerConsentToMove(player, myDest, srcTier, 0.5, 0, consentBase + 0.1, true).ok ? 'salary12'
    : playerConsentToMove(player, myDest, srcTier, 0.5, 0, consentBase + 0.2, true).ok ? 'salary15'
    : 'refuse'
  const mindLabel = mind === 'willing' ? '前向き' : mind === 'salary12' ? '高めの年俸なら承諾' : mind === 'salary15' ? '大幅な高年俸なら承諾' : '移籍を望んでいない'
  const mindColor = mind === 'willing' ? C.green : mind === 'refuse' ? C.red : C.gold
  // 引き抜き耐性：出場データ(複数年)＋ECL経験で判定。合否判定(store)と同じ関数を使い、ズレを防ぐ。
  // 出品中は割増を適用しない（クラブが希望額を提示して売りに出しているため open 扱い）。
  const kStatus = listing ? 'open' : keyPlayerStatus(player, currentSeason, pastSeasons)
  const isKeyGuard = kStatus === 'key'  // 主力＝割増1.8倍
  const isLocked = kStatus === 'locked' // 新人・データ不足で獲得不可
  const base = bidThreshold(val, player.contract.yearsLeft <= 1, isKeyGuard)
  const chancePct = listing
    ? Math.round(listedAcceptChance(fee, listing.askingPrice) * 100)
    : isLocked ? 0
    : Math.round(transferAcceptChance(fee, base) * 100)
  // 本人が拒否なら、クラブと金額合意できても成立しない＝成立見込み0%
  const overallPct = mind === 'refuse' ? 0 : chancePct

  // 画面下から出るものは document.body へ出す。<main> の中に position:fixed で書くと
  // iOS の実機では main の内側しか覆えず、下タブ(z-index:50)より上に来られない（CLAUDE.md）
  return createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div className="sheet-up" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '85vh', overflowY: 'auto', background: C.surface,border: `1px solid ${C.border2}`, borderBottom: 'none', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)', paddingTop: 8, paddingLeft: 16, paddingRight: 16, paddingBottom: bottomStack(adH, { aboveNav: true, extra: 16 }) }}>
        <div style={{ width: 38, height: 4,background: C.border3, margin: '4px auto 12px' }} />
        <div style={{ fontSize: F.bodyLg, fontWeight: 800, color: C.text, marginBottom: 8 }}>{player.name} へ入札</div>
        <div style={{ fontSize: F.caption, color: C.textSub, marginBottom: '8px', fontFamily: SAIRA }}>
          入札金額 — 市場価値: <span style={{ color: C.gold, fontFamily: SAIRA }}>{fmtYen(val)}</span>
          {listing && <span style={{ marginLeft: '8px', color: C.orange, fontFamily: SAIRA }}>クラブ希望: {fmtYen(listing.askingPrice)}</span>}
          <span style={{ marginLeft: '8px', color: over ? C.red : C.textDim, fontFamily: SAIRA }}>予算: {fmtYen(budget)}</span>
        </div>
        <div style={{ padding: '4px 0 10px' }}>
          <NumberDial value={fee} onChange={v => setFee(Math.max(1000000, v))} min={1000000} accent={C.gold} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: F.caption, color: C.textDim, fontFamily: SAIRA }}>クラブ合意{isKeyGuard && <span style={{ color: C.orange }}>（主力＝割増が必要）</span>}{isLocked && <span style={{ color: C.red }}>（新人・データ不足で獲得不可）</span>}</span>
          <span style={{ fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 800, color: C.textSub }}>{chancePct}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: F.caption, color: C.textDim, fontFamily: SAIRA }}>本人の意向</span>
          <span style={{ fontSize: F.label, fontWeight: 800, color: mindColor }}>{mindLabel}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingTop: '6px', borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: F.label, color: C.textSub, fontFamily: SAIRA }}>成立見込み</span>
          <span style={{ fontFamily: SAIRA, fontSize: F.headLg, fontWeight: 900, color: overallPct >= 70 ? C.green : overallPct >= 35 ? C.gold : C.red }}>{overallPct}%</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <GlassButton disabled={over} style={{ flex: 1, padding: '13px', fontSize: F.sub, fontFamily: SAIRA }} onClick={() => onSubmit(fee)}>
            {over ? '予算不足' : '入札する'}
          </GlassButton>
          <button onClick={onClose} style={{ padding: '13px 16px',border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, fontSize: F.bodyLg, cursor: 'pointer', fontFamily: SAIRA }}>取消</button>
        </div>
      </div>
    </div>
  ), document.body)
}
