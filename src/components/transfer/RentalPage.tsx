import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { SPECIALTY_LABELS } from '../../types'
import type { Player } from '../../types'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const MAX_SLOTS = 3

export default function RentalPage() {
  const { players, teams, playerTeamId, foreignLeagues } = useGameStore()

  const clubName = (id: string) =>
    teams.find(t => t.id === id)?.shortName ??
    (foreignLeagues ?? []).flatMap(l => l.clubs).find(c => c.id === id)?.shortName ??
    '他クラブ'

  // 借用中（他クラブから借りている）
  const borrowedIn = players.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId)
  // 貸出中（自チームの選手を他クラブへ貸している）
  const loanedOut = players.filter(p => p.loan && p.loan.ownerTeamId === playerTeamId && p.teamId !== playerTeamId)

  const row = (p: Player, sub: string) => {
    const specCol = SPEC_COLOR[p.specialty]
    return (
      <div key={p.id} style={{
        marginBottom: 6, borderRadius: 12, padding: '9px 12px',
        background: `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
        border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border2}` }}>
          <PlayerFace playerId={p.id} nationality={p.nationality} size={44} />
        </div>
        <span style={{ padding: '2px 6px', borderRadius: 7, flexShrink: 0, background: alpha(specCol, 0.15), color: specCol, fontSize: 9, fontWeight: 700 }}>
          {SPECIALTY_LABELS[p.specialty]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{sub}</div>
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: ratingColor(ovr(p)), minWidth: 30, textAlign: 'right', flexShrink: 0 }}>{ovr(p)}</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 90, background: C.bg, minHeight: '100%' }}>
      <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton/>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.blue, letterSpacing: '3px', fontWeight: 700 }}>LOAN</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>レンタル選手</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '0.1em' }}>レンタル枠</div>
          <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: borrowedIn.length >= MAX_SLOTS ? C.red : C.blue, lineHeight: 1 }}>
            {borrowedIn.length}<span style={{ fontSize: 12, color: C.textDim }}>/{MAX_SLOTS}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '6px 16px 12px', fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
        レンタルの要請は<b>移籍市場</b>から。相手からの打診は<b>チャット</b>に通知が来ます。
      </div>

      {/* 借用中 */}
      <div style={{ padding: '0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px 8px' }}>
          <div style={{ width: 3, height: 14, background: C.blue, borderRadius: 2 }}/>
          <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: C.text, letterSpacing: '0.08em' }}>借用中</span>
          <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{borrowedIn.length}名</span>
        </div>
        {borrowedIn.length === 0
          ? <div style={{ padding: '14px', textAlign: 'center', fontSize: 12, color: C.textDim, border: `1px dashed ${C.border2}`, borderRadius: 12, marginBottom: 12 }}>借りている選手はいません</div>
          : borrowedIn.map(p => row(p, `保有元 ${clubName(p.loan!.ownerTeamId)} · 〜${p.loan!.untilYear}年で返却`))}
      </div>

      {/* 貸出中 */}
      <div style={{ padding: '10px 12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px 8px' }}>
          <div style={{ width: 3, height: 14, background: C.textSub, borderRadius: 2 }}/>
          <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: C.textSub, letterSpacing: '0.08em' }}>貸出中</span>
          <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{loanedOut.length}名</span>
        </div>
        {loanedOut.length === 0
          ? <div style={{ padding: '14px', textAlign: 'center', fontSize: 12, color: C.textDim, border: `1px dashed ${C.border2}`, borderRadius: 12 }}>貸し出している選手はいません</div>
          : loanedOut.map(p => row(p, `貸出先 ${clubName(p.teamId)} · 〜${p.loan!.untilYear}年で復帰`))}
      </div>
    </div>
  )
}
