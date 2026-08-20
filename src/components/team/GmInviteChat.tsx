import { useMemo } from 'react'
import type { Player, Team } from '../../types'
import { useGameStore } from '../../store/gameStore'
import PlayerFace from '../player/PlayerFace'
import ChatBubble from './chat/ChatBubble'
import GlassButton from '../ui/GlassButton'
import PageHeader from '../ui/PageHeader'
import { useAdHeight } from '../layout/Layout'
import { appraiseGmInvite } from '../../utils/gmInvite'
import { gmInviteAskLine, gmInviteYesLine, gmInviteNoLine, gmInviteFeeLine } from '../../utils/chatLines'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { C, alpha, SAIRA, bottomStack, F } from '../../styles/tokens'
import { useCoversScreen } from '../../lib/screenCover'

// ============================================================================
// **声をかけた相手との1往復。ここで返事が出る。**
//
//   > 声かける選手を選んだらチャットで向こうが断ったらチャット閉じたら終わり。
//   > ついて行くって言ったらついて行かせればいいだろ（オーナー・2026-08-14）
//
// ★答えを出すのは `utils/gmInvite` の `appraiseGmInvite` 1本。**ここで判定を書かない。**
//   移すときも同じ関数を通る（`seasonSlice` の `applyGmMove`）ので、
//   「頷いたのに移らない」が起きない。
// ★文面は `utils/chatLines`。吹き出しの見た目は `chat/ChatBubble`。
// ★声をかけられるのは1人だけ。断られたら閉じて終わり（かけ直しはできない）。
// ============================================================================

export default function GmInviteChat({ player, dest, onAgreed, onClose }: {
  player: Player
  /** 行き先のクラブ */
  dest: Team
  /** 頷いてもらえたとき。連れて行く相手として確定する */
  onAgreed: () => void
  onClose: () => void
}) {
  useCoversScreen()
  const adH = useAdHeight()
  const store = useGameStore()
  const verdict = useMemo(() => appraiseGmInvite({
    players: store.players, teams: store.teams, foreignLeagues: store.foreignLeagues,
    currentSeason: store.currentSeason, fromTeamId: store.playerTeamId,
    destinationOf: store.destinationOf,
  }, player.id, dest.id), [player.id, dest.id])

  const answer = !verdict ? null
    : verdict.ok ? gmInviteYesLine()
    : verdict.lead === 'fee' ? gmInviteFeeLine(dest.shortName)
    : gmInviteNoLine(verdict.lead, player)
  const agreed = !!verdict?.ok
  const rating = ovr(player)

  return (
    <div style={{
      position: 'fixed', top: 0, bottom: bottomStack(adH), left: 0, right: 0,
      margin: '0 auto', width: '100%', maxWidth: 480, zIndex: 1004,
      background: C.bg, overflowY: 'auto', paddingTop: 'env(safe-area-inset-top)',
    }}>
      <PageHeader title={player.name} eyebrow="INVITE" onBack={onClose}
        right={<span style={{ fontFamily: SAIRA, fontSize: F.headLg, fontWeight: 900, color: ratingColor(rating) }}>{rating}</span>} />

      <div style={{ padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ChatBubble from="gm">{gmInviteAskLine(dest.shortName).text}</ChatBubble>
        {answer && (
          <ChatBubble
            from="player"
            name={player.name}
            avatar={
              <div style={{ width: 32, height: 32, overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${alpha(SPEC_COLOR[player.specialty], 0.35)}` }}>
                <PlayerFace playerId={player.id} nationality={player.nationality} size={32} />
              </div>
            }
          >{answer.text}</ChatBubble>
        )}
      </div>

      <div style={{ padding: '0 14px 32px' }}>
        <GlassButton full size="lg" color={agreed ? C.gold : C.textSub}
          onClick={() => { if (agreed) onAgreed(); onClose() }} style={{ fontFamily: SAIRA }}>
          {agreed ? '一緒に行く' : '閉じる'}
        </GlassButton>
      </div>
    </div>
  )
}
