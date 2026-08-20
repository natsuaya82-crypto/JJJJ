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
import { C, CARD, alpha, SAIRA, F } from '../../styles/tokens'
import { TeamLogoSVG } from '../icons/Icons'
import PlayerFace from './PlayerFace'
import { SpecChip } from './PlayerChips'


// カードの押下ハンドラ。長押し検出用の pointer 系は任意（タップだけの用途では onClick のみでOK）。
export type RowHandlers = {
  onPointerDown?: () => void
  onPointerUp?: () => void
  onPointerLeave?: () => void
  onPointerMove?: () => void
  onClick: () => void
}

// 能力の1つ。**ラベルは頭1文字だけ**（7個並ぶので、名前を全部出すと行が縦に伸びる）
function StatNum({ label, value, maxed }: { label: string; value: number; maxed: boolean }) {
  const col = ratingColor(value, maxed)
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 3 }}>
      <span style={{ fontSize: F.tiny, color: C.textGhost }}>{label.slice(0, 1)}</span>
      <span style={{ fontSize: F.bodyLg, fontWeight: 800, color: col, fontFamily: SAIRA, lineHeight: 1 }}>{value}</span>
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
  hideStatusBadges?: boolean  // 疲労・調子を出さない（殿堂入りの一覧など、いまの状態が関係ない画面用）
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
  // ratings が欠けたデータでも一覧描画が落ちないようにする（落ちると画面全体が真っ白になるため）
  const isElite = rating >= 80
  const r = safeRatings(player.ratings)

  return (
    <div style={{
      // ★カード。**背景は透かさない**（写真が透けると文字が読めない）。
      //   形は「右下だけ斜めに切る」（オーナー選定・2026-08-13）。
      //   ★clip-path は枠線を切り落とすので、**縁を線で描かないこと**
      //     （斜めの辺だけ線が消える。index.css の premium-menu-button と同じ罠）
      overflow: 'hidden',
      clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)',
      background: selected
        ? `linear-gradient(180deg, ${alpha(C.gold, 0.14)}, ${C.surface2})`
        : `linear-gradient(180deg, ${C.surface}, ${C.bg})`,
      boxShadow: selected
        ? `inset 0 0 0 1.5px ${C.gold}`
        : 'inset 0 1px 0 rgba(255,255,255,0.10)',
    }}>
      {/* 色帯はカードの高さいっぱい。顔は縦の真ん中 */}
      <button
        {...handlers}
        style={{
          width: '100%', display: 'flex', alignItems: 'stretch', gap: 0,
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left', padding: 0,
        }}
      >
        <div style={{ width: 3, alignSelf: 'stretch', background: alpha(specColor, 0.85), flexShrink: 0 }}/>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 12px' }}>
          <div style={{ borderRadius: '50%', overflow: 'hidden' }}>
            <PlayerFace playerId={player.id} nationality={player.nationality} size={52} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '10px 16px 10px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
            {/* 1行目: 名前 年齢（+差し込みextra）。
                ★札の類は2行目へ。名前は長いと詰めるが、幅の決まった札を1行目に置くと
                  行そのものが広がって右端のOVRが画面の外へ出る（実機で実際に起きた） */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3, minWidth: 0, overflow: 'hidden' }}>
              <span style={{
                fontSize: F.subLg, fontWeight: 700,
                color: player.status === 'injured' ? C.red : C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {player.name}
              </span>
              <span style={{ fontSize: F.caption, color: C.textDim, flexShrink: 0 }}>{player.age}歳</span>
              {extra}
            </div>
            {/* 2行目に出す札は**この7つだけ**（オーナー・2026-08-13）。
                タイプ／調子／疲労／負傷／今季引退／レンタル／記録パッチ。
                ★「外」「FA」「FA間近」「育成」「士気」は出さない
                  （契約の話は通知で来るし、FAは検索で絞れる）。増やさないこと */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
              <SpecChip specialty={player.specialty} size="sm" />
              {pForm !== 0 && <span style={{ fontSize: F.caption, color: fColor, fontWeight: 800, flexShrink: 0 }}>{pForm > 0 ? '↑' : '↓'}</span>}
              {!hideStatusBadges && fatigue > 0 && <span style={{ fontSize: F.tiny, color: fatigue > 70 ? C.red : fatigue > 40 ? C.gold : C.textSub, fontFamily: SAIRA, flexShrink: 0 }}>疲{fatigue}</span>}
              {player.status === 'injured' && (() => {
                // 復帰までの残りレース数を明記（injuredUntilRace は「このレース消化後に復帰」のindex）
                const left = player.injuredUntilRace != null ? Math.max(0, player.injuredUntilRace - raceIdx) : null
                return <span style={{ fontSize: F.micro, padding: '1px 4px',backgroundColor: alpha(C.red, 0.09), border: `1px solid ${alpha(C.red, 0.25)}`, color: C.red, fontWeight: 700, flexShrink: 0 }}>負傷{left != null ? ` あと${left}戦` : ''}</span>
              })()}
              {player.pendingRetirementYear != null && <span style={{ fontSize: F.micro, padding: '1px 4px',backgroundColor: alpha(C.textSub, 0.08), border: `1px solid ${alpha(C.textSub, 0.3)}`, color: C.textSub, fontWeight: 700, flexShrink: 0 }}>今季引退</span>}
              {loanOwner && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: F.micro, padding: '1px 5px 1px 3px',backgroundColor: alpha('#AB8ED6', 0.14), border: `1px solid ${alpha('#AB8ED6', 0.45)}`, color: '#C4AEE8', fontWeight: 700, flexShrink: 0 }}><TeamLogoSVG primary={loanOwner.colors.primary} secondary={loanOwner.colors.secondary} shortName={loanOwner.shortName} teamId={loanOwner.id} size={11} />レンタル</span>}
              {displayBadge && <span style={{ fontSize: F.micro, padding: '1px 5px',background: `linear-gradient(180deg, ${badgeColor(displayBadge)}2E, ${badgeColor(displayBadge)}14)`, border: `1px solid ${alpha(badgeColor(displayBadge), 0.5)}`, color: badgeColor(displayBadge), fontWeight: 900, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}><BadgeContent badge={displayBadge} iconSize={10} /></span>}
            </div>
            </div>
            <div style={{
              fontSize: 26, fontWeight: 900, fontFamily: SAIRA, lineHeight: 1, flexShrink: 0,
              background: isElite ? `linear-gradient(180deg, #FFD700, ${CARD.gold})` : `linear-gradient(180deg, ${C.textSub}, ${C.textDim})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {rating}
            </div>
          </div>
          <div style={{ display: 'flex', marginTop: 8 }}>
            {([
              ['速力', 'speed'], ['持久', 'stamina'], ['登り', 'mountainUp'], ['下り', 'mountainDown'],
              ['ペース', 'pacing'], ['精神', 'mental'], ['回復', 'recovery'],
            ] as [string, CardStatKey][]).map(([label, key]) => (
              <StatNum key={label} label={label} value={r[key]} maxed={isStatMaxed(player, key)}/>
            ))}
          </div>
        </div>
      </button>
    </div>
  )
}
