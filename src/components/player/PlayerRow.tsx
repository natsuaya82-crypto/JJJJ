import type { ReactNode } from 'react'
import type { Player, Team, CardStatKey } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, ratingColor, SPEC_COLOR, formColor, isStatMaxed } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import { TeamLogoSVG } from '../icons/Icons'
import PlayerFace from './PlayerFace'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// カードの押下ハンドラ。長押し検出用の pointer 系は任意（タップだけの用途では onClick のみでOK）。
export type RowHandlers = {
  onPointerDown?: () => void
  onPointerUp?: () => void
  onPointerLeave?: () => void
  onPointerMove?: () => void
  onClick: () => void
}

function StatNum({ label, value, maxed }: { label: string; value: number; maxed: boolean }) {
  const col = ratingColor(value, maxed)
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: '8px', color: C.textDim, marginBottom: '1px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: '800', color: col, fontFamily: SAIRA, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

// ロスター画面・カード練習の選手選択などで共通利用する選手パネル。
// selected を渡すと選択中ハイライト（金枠）を表示する。
export default function PlayerRow({ player, handlers, loanOwner, selected, extra }: {
  player: Player
  handlers: RowHandlers
  loanOwner?: Team
  selected?: boolean
  extra?: ReactNode   // 名前行の末尾に差し込む追加バッジ（区間ピッカーの「最適」等）
}) {
  const rating = ovr(player)
  const specColor = SPEC_COLOR[player.specialty]
  const fatigue = player.fatigue ?? 0
  const pForm = player.form ?? 0
  const fColor = formColor(pForm)
  const isLastYear = player.contract.yearsLeft <= 1
  const isElite = rating >= 80
  const r = player.ratings
  const ctType = player.contract.contractType

  return (
    <div style={{
      background: selected ? `linear-gradient(180deg, ${alpha(C.gold, 0.14)}, ${C.surface2})` : `linear-gradient(180deg, ${C.surface}, ${C.bg})`,
      borderBottom: `1px solid ${C.border}`,
      boxShadow: selected ? `inset 0 0 0 2px ${C.gold}` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 3, alignSelf: 'stretch', background: `linear-gradient(180deg, ${specColor}, ${alpha(specColor, 0.6)})`, flexShrink: 0 }}/>
        <button
          {...handlers}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px 6px 12px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specColor, 0.35)}` }}>
            <PlayerFace playerId={player.id} nationality={player.nationality} size={50} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: player.status === 'injured' ? C.red : C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {player.name}
              </span>
              {player.nationality === 'FOREIGN' && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.blue, 0.08), border: `1px solid ${alpha(C.blue, 0.25)}`, color: C.blue, fontWeight: 700, flexShrink: 0 }}>外</span>}
              {player.status === 'injured' && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.red, 0.09), border: `1px solid ${alpha(C.red, 0.25)}`, color: C.red, fontWeight: 700, flexShrink: 0 }}>負傷</span>}
              {player.dualRegistered && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.green, 0.08), border: `1px solid ${alpha(C.green, 0.25)}`, color: C.green, fontWeight: 700, flexShrink: 0 }}>両方</span>}
              {ctType === 'development' && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.cyan, 0.08), border: `1px solid ${alpha(C.cyan, 0.25)}`, color: C.cyan, fontWeight: 700, flexShrink: 0 }}>育成</span>}
              {loanOwner && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, padding: '1px 5px 1px 3px', borderRadius: 3, backgroundColor: alpha('#AB8ED6', 0.14), border: `1px solid ${alpha('#AB8ED6', 0.45)}`, color: '#C4AEE8', fontWeight: 700, flexShrink: 0 }}><TeamLogoSVG primary={loanOwner.colors.primary} secondary={loanOwner.colors.secondary} shortName={loanOwner.shortName} teamId={loanOwner.id} size={11} />レンタル</span>}
              {extra}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(specColor, 0.08), border: `1px solid ${alpha(specColor, 0.25)}`, color: specColor, fontWeight: 700, flexShrink: 0 }}>
                {SPECIALTY_LABELS[player.specialty]}
              </span>
              <span style={{ fontSize: 10, color: C.textDim }}>{player.age}歳</span>
              {isLastYear && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.red, 0.08), border: `1px solid ${alpha(C.red, 0.25)}`, color: C.red, fontWeight: 700, flexShrink: 0 }}>FA間近</span>}
              {pForm !== 0 && <span style={{ fontSize: 9, color: fColor, fontWeight: 800 }}>{pForm > 0 ? '↑' : '↓'}</span>}
              {fatigue > 0 && <span style={{ fontSize: 9, color: fatigue > 70 ? C.red : fatigue > 40 ? C.gold : C.textSub, fontFamily: SAIRA }}>疲{fatigue}</span>}
              {(player.morale ?? 70) < 50 && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.red, 0.08), border: `1px solid ${alpha(C.red, 0.25)}`, color: C.red, fontWeight: 700, flexShrink: 0 }}>士気{player.morale ?? 0}</span>}
            </div>
          </div>
          <div style={{
            fontSize: 22, fontWeight: 900, fontFamily: SAIRA, lineHeight: 1, flexShrink: 0,
            background: isElite ? 'linear-gradient(180deg, #FFD700, #C9A84C)' : `linear-gradient(180deg, ${C.textSub}, ${C.textDim})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {rating}
          </div>
        </button>
      </div>
      <div style={{ display: 'flex', padding: '0 12px 8px 72px' }}>
        {([
          ['速力', 'speed'], ['持久', 'stamina'], ['登り', 'mountainUp'], ['下り', 'mountainDown'],
          ['ペース', 'pacing'], ['精神', 'mental'], ['回復', 'recovery'],
        ] as [string, CardStatKey][]).map(([label, key]) => (
          <StatNum key={label} label={label} value={r[key]} maxed={isStatMaxed(player, key)}/>
        ))}
      </div>
    </div>
  )
}
