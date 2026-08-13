import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import { playerLabel } from '../../utils/playerUtils'
import { formatRaceTime } from '../../utils/eventTime'
import { useSegmentRecords } from '../../lib/useSegmentRecords'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { useClubIndex } from '../../lib/useClubIndex'
import GlassButton from '../ui/GlassButton'


type Category = 'jpel' | 'ecl' | 'reserve'
const CAT_LABEL: Record<Category, string> = { jpel: 'JPEL', ecl: 'ECL', reserve: 'リザーブ駅伝' }
const CAT_COLOR: Record<Category, string> = { jpel: '#C9A84C', ecl: '#2ECC71', reserve: '#AB8ED6' }

// 区間記録：歴代優勝と同じ構成。カテゴリ（JPEL/リザーブ）→ 大会一覧 → 区間を横に並べて切り替え
export default function PlayersStatsPage() {
  const navigate = useNavigate()
  const { players, openPlayerSheet, removedPlayers } = useGameStore()
  const clubIndex = useClubIndex()
  // 区間記録はセーブに貯めず、保存してあるレース結果から数え直す（utils/segmentRecords.ts）
  const mainRecords = useSegmentRecords()
  const reserveRecords = useSegmentRecords('reserve')

  // 選手行の長押しで選手詳細を開く
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPress = (pid: string) => ({
    onPointerDown: () => { lpTimer.current = setTimeout(() => openPlayerSheet(pid), 450) },
    onPointerUp: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerLeave: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerMove: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
  })

  const [cat, setCat] = useState<Category | null>(null)
  const [selectedRace, setSelectedRace] = useState<string | null>(null)
  const [segIdx, setSegIdx] = useState<number | null>(null)

  // 表示中のカテゴリの記録。キーは `${大会名}-${区番号}`
  const records = cat === 'reserve' ? reserveRecords : mainRecords
  const nameOfKey = (key: string) => key.substring(0, key.lastIndexOf('-'))
  const segOfKey = (key: string) => parseInt(key.substring(key.lastIndexOf('-') + 1))

  // カテゴリ別の大会名一覧（1軍の記録にはJPELとECLが両方入るので名前で振り分ける）
  const allRecordNames = [...new Set(Object.keys(records).map(nameOfKey))]
  const raceNames = cat === 'jpel'
    ? allRecordNames.filter(n => !n.startsWith('ECL')).sort()
    : cat === 'ecl'
    ? allRecordNames.filter(n => n.startsWith('ECL')).sort()
    : cat === 'reserve'
    ? allRecordNames.sort()
    : []

  // 選択中大会の区間一覧
  const segmentIndices = selectedRace == null ? []
    : Object.keys(records).filter(key => nameOfKey(key) === selectedRace).map(segOfKey).sort((a, b) => a - b)
  const activeSeg = segIdx != null && segmentIndices.includes(segIdx) ? segIdx : segmentIndices[0]

  const entriesFor = (idx: number) => records[`${selectedRace}-${idx}`] ?? []

  const goBack = () => {
    if (selectedRace != null) { setSelectedRace(null); setSegIdx(null); return }
    if (cat != null) { setCat(null); return }
    navigate(-1)
  }

  const accent = cat ? CAT_COLOR[cat] : C.blue

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: '80px', minHeight: '100dvh' }}>
      {/* ヘッダー（戻る＋タイトルを横並び・上部固定） */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.bg }}>
        <PageHeader eyebrow="RECORDS" title="区間記録" onBack={goBack} />
        <div style={{ fontSize: '11px', color: C.textDim, padding: '4px 16px 10px' }}>
          {selectedRace ?? (cat != null ? `${CAT_LABEL[cat]} — 大会を選択` : 'カテゴリを選択')}
        </div>
      </div>

      {/* Level 0: カテゴリ（歴代優勝と同じ横長ボタン） */}
      {cat == null && (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['jpel', 'ecl', 'reserve'] as Category[]).map(c => (
            <GlassButton key={c} full style={{
              justifyContent: 'flex-start', gap: 12, textAlign: 'left',
              padding: '14px 16px', color: C.text, fontFamily: SAIRA,
            }} onClick={() => setCat(c)}>
              <span style={{ fontSize: 16, fontWeight: 900, color: CAT_COLOR[c], flex: 1 }}>{CAT_LABEL[c]}</span>
              <span style={{ color: C.textGhost, fontSize: 18 }}>›</span>
            </GlassButton>
          ))}
        </div>
      )}

      {/* Level 1: 大会一覧 */}
      {cat != null && selectedRace == null && (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {raceNames.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: 13, padding: '30px 0' }}>まだ記録がありません</div>
          ) : raceNames.map(name => {
            const segCount = Object.keys(records).filter(key => nameOfKey(key) === name).length
            return (
              <GlassButton key={name} full style={{
                justifyContent: 'flex-start', gap: 12, textAlign: 'left',
                padding: '14px 16px', color: C.text, fontFamily: SAIRA,
              }} onClick={() => { setSelectedRace(name); setSegIdx(null) }}>
                <span style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>{name}</span>
                <span style={{ fontSize: 10, color: C.textDim, padding: '2px 8px', borderRadius: 10, background: alpha(accent, 0.12) }}>{segCount}区間</span>
                <span style={{ color: C.textGhost, fontSize: 16 }}>›</span>
              </GlassButton>
            )
          })}
        </div>
      )}

      {/* Level 2: 区間を横に並べて切り替え → 選んだ区間の歴代記録 */}
      {cat != null && selectedRace != null && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, WebkitOverflowScrolling: 'touch' as never }}>
            {segmentIndices.map(idx => {
              const active = idx === activeSeg
              return (
                <GlassButton key={idx} color={active ? accent : C.textDim} onClick={() => setSegIdx(idx)}
                  style={{ flexShrink: 0, padding: '8px 16px', fontFamily: SAIRA, fontSize: 13 }}>
                  {idx}区
                </GlassButton>
              )
            })}
          </div>

          {activeSeg != null && (() => {
            const top = entriesFor(activeSeg)
            return (
              <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
                {top.map((entry, i) => {
                  // 長期整理で削除された選手は removedPlayers から名前・国籍を引く（顔はIDと国籍から出る）
                  const player = playerLabel(players, removedPlayers, entry.playerId)
                  const team = clubIndex.byId(entry.teamId)
                  const rankCol = i === 0 ? C.gold : i <= 2 ? C.green : C.textSub
                  return (
                    <div key={i} {...(player && !player.isRemoved ? longPress(player.id) : {})}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                        background: i === 0 ? alpha(C.gold, 0.06) : i % 2 === 0 ? C.surface : 'transparent',
                        borderBottom: i < top.length - 1 ? `1px solid ${C.border}` : 'none',
                        cursor: player && !player.isRemoved ? 'pointer' : 'default',
                      }}>
                      <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: rankCol, width: '20px', textAlign: 'center', textShadow: i <= 2 ? `0 0 6px ${alpha(rankCol, 0.5)}` : 'none' }}>{i + 1}</span>
                      {player && (
                        <div style={{ width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0, overflow: 'hidden' }}>
                          <PlayerFace playerId={player.id} nationality={player.nationality} size={28} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: 700, color: C.text }}>{player?.name ?? '—'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
                          {team && <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={12} />}
                          <span style={{ fontSize: '9px', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? ''}{entry.year ? ` / ${entry.year}` : ''}</span>
                        </div>
                      </div>
                      <span style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '900', color: rankCol, textShadow: i <= 2 ? `0 0 8px ${alpha(rankCol, 0.5)}` : 'none' }}>{formatRaceTime(entry.timeSec)}</span>
                    </div>
                  )
                })}
                {top.length === 0 && (
                  <div style={{ textAlign: 'center', color: C.textDim, fontSize: 12, padding: '24px 0' }}>まだ記録がありません</div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
