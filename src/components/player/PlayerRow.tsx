import type { ReactNode } from 'react'
import type { Player, Team, CardStatKey } from '../../types'
import { ovr, ratingColor, SPEC_COLOR, formColor, isStatMaxed } from '../../utils/playerUtils'
import { safeRatings } from '../../engine/raceEngine'
import { getPlayerBadges } from '../../utils/badges'
import BadgeContent, { badgeColor } from './BadgeContent'
import { useGameStore } from '../../store/gameStore'
import { useSegmentRecords } from '../../lib/useSegmentRecords'
import { useSeasonAwards } from '../../lib/useSeasonAwards'
import { useEclHistory } from '../../lib/useEclHistory'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { TeamLogoSVG } from '../icons/Icons'
import PlayerFace from './PlayerFace'
import { SpecChip, ForeignChip } from './PlayerChips'


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
export default function PlayerRow({ player, handlers, loanOwner, selected, extra, hideStatusBadges }: {
  player: Player
  handlers: RowHandlers
  loanOwner?: Team
  selected?: boolean
  extra?: ReactNode   // 名前行の末尾に差し込む追加バッジ（区間ピッカーの「最適」等）
  hideStatusBadges?: boolean  // FA/FA間近/疲労を出さない（代表選考など契約・消耗が関係ない画面用）
}) {
  const rating = ovr(player)
  const specColor = SPEC_COLOR[player.specialty]
  // 名前横の記録パッチ（displayBadge）。パッチ持ちは基本自動で優先順（世界記録>日本記録>MVP>新人王>区間記録>代表）
  // の最上位を表示し、自チームの選手は選手詳細1ページ目で好きなパッチに変更できる。
  // 記録を抜かれた等で保持者でなくなったパッチは自動で外れて次の候補に切り替わる
  const worldRecords = useGameStore(s => s.worldRecords)
  const japanRecords = useGameStore(s => s.japanRecords)
  const seasonAwards = useSeasonAwards()
  const segmentRecords = useSegmentRecords()
  const eclHistory = useEclHistory()
  const worldRepresentatives = useGameStore(s => s.worldRepresentatives)
  const eventSeasonTops = useGameStore(s => s.eventSeasonTops)
  const worldAthleticsResults = useGameStore(s => s.worldAthleticsResults)
  const worldTournament = useGameStore(s => s.worldTournament)
  const raceIdx = useGameStore(s => s.currentSeason.currentRaceIndex)
  const badgeList = getPlayerBadges(player, { worldRecords, japanRecords, seasonAwards, segmentRecords, eclHistory, worldRepresentatives, eventSeasonTops, worldAthleticsResults, worldTournament }, 99)
  const displayBadge = (player.displayBadge ? badgeList.find(b => b.key === player.displayBadge) : undefined) ?? badgeList[0]
  const fatigue = player.fatigue ?? 0
  const pForm = player.form ?? 0
  const fColor = formColor(pForm)
  // 無所属（FA）と「所属あり・残り1年（FA間近）」は別物なのでバッジを分ける
  const isFreeAgent = player.teamId === ''
  // contract / ratings が欠けたデータでも一覧描画が落ちないようにする（落ちると画面全体が真っ白になるため）
  const isLastYear = !isFreeAgent && (player.contract?.yearsLeft ?? 99) <= 1
  const isElite = rating >= 80
  const r = safeRatings(player.ratings)
  const ctType = player.contract?.contractType

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
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px 6px 12px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specColor, 0.35)}` }}>
            <PlayerFace playerId={player.id} nationality={player.nationality} size={50} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 1行目: 名前 タイプ 矢印 疲労（+差し込みextra） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, minWidth: 0, overflow: 'hidden' }}>
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: player.status === 'injured' ? C.red : C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {player.name}
              </span>
              <SpecChip specialty={player.specialty} />
              {pForm !== 0 && <span style={{ fontSize: 10, color: fColor, fontWeight: 800, flexShrink: 0 }}>{pForm > 0 ? '↑' : '↓'}</span>}
              {!hideStatusBadges && fatigue > 0 && <span style={{ fontSize: 9, color: fatigue > 70 ? C.red : fatigue > 40 ? C.gold : C.textSub, fontFamily: SAIRA, flexShrink: 0 }}>疲{fatigue}</span>}
              {extra}
            </div>
            {/* 2行目: 年齢 その他情報（FA/FA間近/負傷/レンタル等） パッチ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
              <span style={{ fontSize: 10, color: C.textDim, flexShrink: 0 }}>{player.age}歳</span>
              <ForeignChip nationality={player.nationality} />
              {!hideStatusBadges && isFreeAgent && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.orange, 0.08), border: `1px solid ${alpha(C.orange, 0.25)}`, color: C.orange, fontWeight: 700, flexShrink: 0 }}>FA</span>}
              {!hideStatusBadges && isLastYear && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.red, 0.08), border: `1px solid ${alpha(C.red, 0.25)}`, color: C.red, fontWeight: 700, flexShrink: 0 }}>FA間近</span>}
              {player.status === 'injured' && (() => {
                // 復帰までの残りレース数を明記（injuredUntilRace は「このレース消化後に復帰」のindex）
                const left = player.injuredUntilRace != null ? Math.max(0, player.injuredUntilRace - raceIdx) : null
                return <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.red, 0.09), border: `1px solid ${alpha(C.red, 0.25)}`, color: C.red, fontWeight: 700, flexShrink: 0 }}>負傷{left != null ? ` あと${left}戦` : ''}</span>
              })()}
              {player.pendingRetirementYear != null && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.textSub, 0.08), border: `1px solid ${alpha(C.textSub, 0.3)}`, color: C.textSub, fontWeight: 700, flexShrink: 0 }}>今季引退</span>}
              {ctType === 'development' && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.cyan, 0.08), border: `1px solid ${alpha(C.cyan, 0.25)}`, color: C.cyan, fontWeight: 700, flexShrink: 0 }}>育成</span>}
              {loanOwner && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, padding: '1px 5px 1px 3px', borderRadius: 3, backgroundColor: alpha('#AB8ED6', 0.14), border: `1px solid ${alpha('#AB8ED6', 0.45)}`, color: '#C4AEE8', fontWeight: 700, flexShrink: 0 }}><TeamLogoSVG primary={loanOwner.colors.primary} secondary={loanOwner.colors.secondary} shortName={loanOwner.shortName} teamId={loanOwner.id} size={11} />レンタル</span>}
              {(player.morale ?? 70) < 50 && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, backgroundColor: alpha(C.red, 0.08), border: `1px solid ${alpha(C.red, 0.25)}`, color: C.red, fontWeight: 700, flexShrink: 0 }}>士気{player.morale ?? 0}</span>}
              {displayBadge && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: `linear-gradient(180deg, ${badgeColor(displayBadge)}2E, ${badgeColor(displayBadge)}14)`, border: `1px solid ${alpha(badgeColor(displayBadge), 0.5)}`, color: badgeColor(displayBadge), fontWeight: 900, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}><BadgeContent badge={displayBadge} iconSize={10} /></span>}
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
