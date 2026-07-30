import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore, fmtTime, WEC_CITIES } from '../../store/gameStore'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import type { Player, WECRacePlan } from '../../types'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 世界選手権は2年に1度（シーズン終わりに開催）
function isWorldEkidenYear(year: number) { return (year - 2027) % 2 === 0 }
function nextWorldEkidenYear(year: number) { let y = year + 1; while (!isWorldEkidenYear(y)) y++; return y }

const rankColor = (rank: number) =>
  rank === 1 ? C.gold : rank === 2 ? '#9B97A8' : rank === 3 ? '#CD7F32' : rank <= 5 ? C.textSub : C.textDim

const medalLabel = (rank: number) =>
  rank === 1 ? '金メダル' : rank === 2 ? '銀メダル' : rank === 3 ? '銅メダル' : null

const WEATHER_LABEL: Record<string, string> = {
  sunny: '晴れ',
  cloudy: '曇り',
  rainy: '雨',
  windy: '強風',
}

const PRIZE: Record<number, string> = {
  1: 'GM評判+15 / 賞金2000万',
  2: 'GM評判+10 / 賞金1200万',
  3: 'GM評判+7 / 賞金800万',
  4: 'GM評判+3 / 賞金300万',
  5: 'GM評判+3 / 賞金300万',
  6: 'GM評判+3 / 賞金300万',
}

function CoachBanner({ gmName, isPlayerCoach }: { gmName: string; isPlayerCoach: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: alpha(C.gold, 0.08), border: `1px solid ${alpha(C.gold, 0.25)}`, marginBottom: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '2px' }}>NATIONAL TEAM COACH</div>
        <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.gold }}>{gmName}</div>
      </div>
      {isPlayerCoach && (
        <div style={{ fontFamily: SAIRA, fontSize: 9, padding: '3px 8px', borderRadius: 5, background: alpha(C.gold, 0.15), color: C.gold, border: `1px solid ${alpha(C.gold, 0.35)}`, fontWeight: 700 }}>代表監督 / コーチボーナス</div>
      )}
    </div>
  )
}

function CityBar({ cityInfo }: { cityInfo: { city: string; courseChar: string } }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 12px', borderRadius: 9, background: C.surface2, border: `1px solid ${C.border}`, marginBottom: 12 }}>
      <div>
        <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>HOST CITY</div>
        <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 700, color: C.text }}>{cityInfo.city}</div>
      </div>
      <div>
        <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>COURSE</div>
        <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textSub }}>{cityInfo.courseChar}</div>
      </div>
    </div>
  )
}

function RaceTabs({ interactive, racePlan, racePlayerIds, activeRace, onSetActiveRace }: {
  interactive: boolean
  racePlan: WECRacePlan[]
  racePlayerIds: string[][]
  activeRace: number
  onSetActiveRace: (i: number) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {[0, 1, 2].map(i => {
        const plan = racePlan[i]
        const ids = racePlayerIds[i] ?? []
        const ready = plan && ids.length >= plan.segments.length
        const active = activeRace === i
        return (
          <button key={i} onClick={() => onSetActiveRace(i)} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1px solid ${active ? (ready && interactive ? C.goldDark : C.border2) : C.border}`, background: active ? alpha(ready && interactive ? C.gold : C.blue, 0.08) : C.surface2, cursor: 'pointer', fontFamily: SAIRA }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: active ? (ready && interactive ? C.gold : C.text) : C.textSub }}>第{i + 1}レース</div>
            {plan && (
              <div style={{ fontSize: 9, color: ready && interactive ? C.gold : C.textDim }}>
                {interactive ? `${ids.length}/${plan.segments.length}名` : `${plan.segments.length}区間`}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function RaceCard({ raceIdx, interactive, racePlan, racePlayerIds, players, squadPlayers, onToggleRacePlayer, onAutoSelectRace }: {
  raceIdx: number
  interactive: boolean
  racePlan: WECRacePlan[]
  racePlayerIds: string[][]
  players: Player[]
  squadPlayers: Player[]
  onToggleRacePlayer: (raceIdx: number, playerId: string) => void
  onAutoSelectRace: (raceIdx: number) => void
}) {
  const plan = racePlan[raceIdx]
  if (!plan) return null
  const currentIds = racePlayerIds[raceIdx] ?? []
  const isFull = currentIds.length >= plan.segments.length
  const totalDist = plan.segments.reduce((s, seg) => s + seg.distanceKm, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '2px' }}>{plan.segments.length}区間 / 合計{totalDist.toFixed(1)}km</div>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textGhost }}>
            {plan.segments.map((s, i) => `${i + 1}区:${s.distanceKm}km`).join(' ')}
          </div>
        </div>
        {interactive && (
          <button onClick={() => onAutoSelectRace(raceIdx)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${alpha(C.blue, 0.4)}`, background: alpha(C.blue, 0.1), color: C.blue, fontFamily: SAIRA, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>自動選出</button>
        )}
      </div>

      {interactive && currentIds.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {currentIds.map((id, legIdx) => {
            const p = players.find(x => x.id === id)
            return (
              <button key={id} onClick={() => onToggleRacePlayer(raceIdx, id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 8, background: alpha(C.gold, 0.1), border: `1px solid ${alpha(C.gold, 0.3)}`, cursor: 'pointer', fontFamily: SAIRA }}>
                <span style={{ fontSize: 9, fontWeight: 900, color: C.gold }}>{legIdx + 1}区</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{p?.name ?? '?'}</span>
                <span style={{ fontSize: 9, color: C.textDim }}>✕</span>
              </button>
            )
          })}
          {!isFull && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', borderRadius: 8, border: `1px dashed ${C.border}`, fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>
              {currentIds.length + 1}区 空き
            </div>
          )}
        </div>
      )}

      <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.surface2 }}>
        {squadPlayers.map((p, i) => {
          const legIdx = currentIds.indexOf(p.id)
          const isSelected = legIdx >= 0
          const disabled = !interactive || (!isSelected && isFull)
          return (
            <button
              key={p.id}
              onClick={() => !disabled && onToggleRacePlayer(raceIdx, p.id)}
              disabled={disabled}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderBottom: i < squadPlayers.length - 1 ? `1px solid ${C.border}` : 'none',
                border: 'none', background: isSelected ? alpha(C.gold, 0.07) : 'transparent',
                cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, fontFamily: SAIRA,
              }}
            >
              {isSelected ? (
                <div style={{ width: 26, height: 26, borderRadius: 6, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: SAIRA, fontSize: 10, fontWeight: 900, color: '#1a1630' }}>{legIdx + 1}区</span>
                </div>
              ) : (
                <div style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }} />
              )}
              <div style={{ width: 3, height: 26, borderRadius: 2, background: SPEC_COLOR[p.specialty], flexShrink: 0 }} />
              <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={28} /></div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: isSelected ? 700 : 400, color: isSelected ? C.text : C.textSub }}>{p.name}</div>
                <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim }}>{SPECIALTY_LABELS[p.specialty]}</div>
              </div>
              <div style={{ fontFamily: SAIRA, fontSize: 17, fontWeight: 900, color: ratingColor(ovr(p)) }}>{ovr(p)}</div>
            </button>
          )
        })}
      </div>
      {interactive && (
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, marginTop: 6, textAlign: 'center' }}>{currentIds.length}/{plan.segments.length}名選出</div>
      )}
    </div>
  )
}

export default function WorldEkidenPage() {
  const navigate = useNavigate()
  const [activeResultRace, setActiveResultRace] = useState(-1)
  const [revealed, setRevealed] = useState(0)
  const [started, setStarted] = useState(false)

  const { currentSeason, pastSeasons, players, teams, nationalTeam, playerTeamId,
    simulateWorldEkiden, updateNationalTeam, toggleWorldRacePlayer, autoSelectWorldRace, setWorldCoachDeclined } = useGameStore()
  const gmName = teams.find(t => t.id === playerTeamId)?.gmName ?? ''
  // 区間記録に保存された名前ではなく今の名前を出す（改名しても過去の結果に反映される）
  const legName = (leg: { playerId?: string; playerName: string }) =>
    (leg.playerId ? players.find(p => p.id === leg.playerId)?.name : undefined) ?? leg.playerName

  const year = currentSeason.year
  const isWEYear = isWorldEkidenYear(year)
  const isPostseason = currentSeason.phase === 'postseason'
  const racesPlayed = currentSeason.currentRaceIndex
  const result = currentSeason.worldEkidenResult

  const thisYearNT = (nationalTeam?.year === year) ? nationalTeam : null
  const isPlayerCoach = thisYearNT?.isPlayerCoach ?? false
  const coachDeclined = thisYearNT?.coachDeclined ?? false

  const cityIdx = Math.max(0, Math.floor((year - 2027) / 2) % WEC_CITIES.length)
  const cityInfo = WEC_CITIES[cityIdx]

  const pastWEResults = pastSeasons
    .map(s => s.worldEkidenResult).filter(Boolean).reverse() as NonNullable<typeof pastSeasons[0]['worldEkidenResult']>[]

  const squadIds = thisYearNT?.squadIds ?? []
  const squadPlayers = squadIds.map(id => players.find(p => p.id === id)).filter(Boolean) as typeof players
  const racePlan = thisYearNT?.racePlan ?? []
  const racePlayerIds = thisYearNT?.racePlayerIds ?? []
  const [activeRace, setActiveRace] = useState(0)
  const toggleRacePlayer = (raceIdx: number, playerId: string) => toggleWorldRacePlayer(raceIdx, playerId)
  const autoSelectRace = (raceIdx: number) => autoSelectWorldRace(raceIdx)

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 0' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <BackButton />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.blue, letterSpacing: '3px', fontWeight: 900 }}>INTERNATIONAL</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>世界選手権</div>
          </div>
          <div style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 8, background: isWEYear ? alpha(C.gold, 0.12) : C.surface2, border: `1px solid ${isWEYear ? alpha(C.gold, 0.3) : C.border}` }}>
            <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: isWEYear ? C.gold : C.textDim }}>{year}年{isWEYear ? ' 開催年' : ''}</span>
          </div>
        </div>

        {/* Not WE year */}
        {!isWEYear && (
          <div style={{ padding: '32px 20px', textAlign: 'center', borderRadius: 14, background: C.surface2, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, letterSpacing: '2px', marginBottom: 8 }}>NEXT WORLD EKIDEN</div>
            <div style={{ fontFamily: SAIRA, fontSize: 40, fontWeight: 900, color: C.text, lineHeight: 1 }}>{nextWorldEkidenYear(year)}</div>
            <div style={{ fontFamily: SAIRA, fontSize: 12, color: C.textDim, marginTop: 6 }}>あと{nextWorldEkidenYear(year) - year}年</div>
          </div>
        )}

        {/* WE year, before race 10 */}
        {isWEYear && !thisYearNT && racesPlayed < 10 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', borderRadius: 14, background: C.surface2, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, letterSpacing: '2px', marginBottom: 8 }}>SQUAD ANNOUNCEMENT</div>
            <div style={{ fontFamily: SAIRA, fontSize: 26, fontWeight: 900, color: C.text }}>第10戦後に代表20名発表</div>
            <div style={{ fontFamily: SAIRA, fontSize: 12, color: C.textDim, marginTop: 6 }}>現在 {racesPlayed} / 10戦</div>
          </div>
        )}

        {/* WE year, race 10+, no NT (recovery) */}
        {isWEYear && !thisYearNT && racesPlayed >= 10 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 12, color: C.textDim, marginBottom: 10 }}>代表スカッドが未発表です</div>
            <button onClick={updateNationalTeam} style={{ width: '100%', padding: '12px', borderRadius: 10, border: `1px solid ${alpha(C.blue, 0.4)}`, background: alpha(C.blue, 0.1), color: C.blue, fontFamily: SAIRA, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              代表スカッド選考を実行
            </button>
          </div>
        )}

        {/* WE year, NT exists, regular season (read-only) */}
        {isWEYear && thisYearNT && !isPostseason && !result && (
          <>
            <CoachBanner gmName={gmName} isPlayerCoach={isPlayerCoach} />
            <CityBar cityInfo={cityInfo} />
            <RaceTabs interactive={false} racePlan={racePlan} racePlayerIds={racePlayerIds} activeRace={activeRace} onSetActiveRace={setActiveRace} />
            <RaceCard raceIdx={activeRace} interactive={false} racePlan={racePlan} racePlayerIds={racePlayerIds} players={players} squadPlayers={squadPlayers} onToggleRacePlayer={toggleRacePlayer} onAutoSelectRace={autoSelectRace} />
            <div style={{ padding: '12px 16px', borderRadius: 10, background: C.surface2, border: `1px solid ${C.border}`, marginTop: 12, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: C.textDim }}>先発選出・シミュレートはシーズン終了後</div>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textGhost, marginTop: 4 }}>開催期間：11月〜3月（シーズンオフ）</div>
            </div>
          </>
        )}

        {/* Postseason, no result — 代表発表 */}
        {isWEYear && thisYearNT && isPostseason && !result && (
          <div style={{ paddingBottom: 16 }}>

            {/* 発表ヘッダー */}
            <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 14, border: `1px solid ${alpha(C.gold, 0.4)}`, background: `linear-gradient(160deg, ${alpha(C.gold, 0.1)} 0%, ${C.surface2} 100%)` }}>
              <div style={{ padding: '16px 16px 12px', textAlign: 'center', borderBottom: `1px solid ${alpha(C.gold, 0.15)}` }}>
                <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.gold, letterSpacing: '4px', fontWeight: 900, marginBottom: 4 }}>JAPAN NATIONAL TEAM</div>
                <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 2 }}>{year} 世界選手権</div>
                <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textSub }}>代表メンバー発表</div>
              </div>
              <div style={{ display: 'flex' }}>
                <div style={{ flex: 1, padding: '10px 16px', borderRight: `1px solid ${alpha(C.gold, 0.12)}` }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>COACH</div>
                  <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: C.gold }}>{gmName}</div>
                </div>
                <div style={{ flex: 1, padding: '10px 16px', borderRight: `1px solid ${alpha(C.gold, 0.12)}` }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>HOST CITY</div>
                  <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: C.text }}>{cityInfo.city}</div>
                </div>
                <div style={{ flex: 1.4, padding: '10px 16px' }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>COURSE</div>
                  <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textSub }}>{cityInfo.courseChar}</div>
                </div>
              </div>
            </div>

            {!started ? (
              <button
                onClick={() => { setStarted(true); setRevealed(1) }}
                className="btn-game btn-game--gold"
                style={{ width: '100%' }}
              >
                <span className="btn-game__inner">代表メンバー発表を開始する</span>
              </button>
            ) : (
              <>
                <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '2px', marginBottom: 10 }}>
                  {revealed < squadPlayers.length ? `発表中 ${revealed} / ${squadPlayers.length}名` : `代表${squadPlayers.length}名 選考完了`}
                </div>

                {/* 発表済み選手カード */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {squadPlayers.slice(0, revealed).map((p, i) => {
                    const specColor = SPEC_COLOR[p.specialty]
                    const team = teams.find(t => t.id === p.teamId)
                    const rating = ovr(p)
                    const isElite = rating >= 80
                    return (
                      <div key={p.id} style={{
                        borderRadius: 12, overflow: 'hidden', position: 'relative',
                        background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                        border: `1px solid ${alpha(C.gold, 0.3)}`,
                        boxShadow: `0 2px 0 rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.35)`,
                      }}>
                        <div style={{ width: '100%', height: 3, background: `linear-gradient(90deg, ${specColor}, ${alpha(specColor, 0.3)})` }} />
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={32} /></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px', marginBottom: 3 }}>No.{i + 1}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                              <span style={{ fontFamily: SAIRA, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: alpha(specColor, 0.15), color: specColor, border: `1px solid ${alpha(specColor, 0.3)}`, fontWeight: 700 }}>
                                {SPECIALTY_LABELS[p.specialty]}
                              </span>
                              {team && <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, marginTop: 3 }}>{team.shortName}</div>}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{
                                fontFamily: SAIRA, fontSize: 22, fontWeight: 900, lineHeight: 1,
                                background: isElite ? `linear-gradient(180deg, ${C.goldHi}, ${C.gold})` : `linear-gradient(180deg, ${C.textSub}, ${C.textDim})`,
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                              }}>{rating}</div>
                              <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim }}>OVR</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* 未発表スロット */}
                  {Array.from({ length: squadPlayers.length - revealed }).map((_, i) => (
                    <div key={`hidden-${i}`} style={{
                      borderRadius: 12, border: `1px dashed ${alpha(C.gold, 0.2)}`,
                      background: alpha(C.gold, 0.02), padding: '10px 12px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 88,
                    }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>No.{revealed + i + 1}</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: alpha(C.gold, 0.2) }}>?</div>
                    </div>
                  ))}
                </div>

                {revealed < squadPlayers.length ? (
                  <button
                    onClick={() => setRevealed(r => r + 1)}
                    className="btn-game btn-game--gold"
                    style={{ width: '100%' }}
                  >
                    <span className="btn-game__inner">次の選手を発表</span>
                  </button>
                ) : (
                  <>
                    {/* 監督采配：自分で組む or おまかせ */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <button onClick={() => setWorldCoachDeclined(false)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontFamily: SAIRA, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: `1px solid ${!coachDeclined ? C.gold : C.border}`, background: !coachDeclined ? alpha(C.gold, 0.12) : C.surface2, color: !coachDeclined ? C.gold : C.textDim }}>監督として采配する</button>
                      <button onClick={() => setWorldCoachDeclined(true)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontFamily: SAIRA, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: `1px solid ${coachDeclined ? C.blue : C.border}`, background: coachDeclined ? alpha(C.blue, 0.12) : C.surface2, color: coachDeclined ? C.blue : C.textDim }}>おまかせ（監督を断る）</button>
                    </div>
                    {!coachDeclined && (
                      <div style={{ marginBottom: 12 }}>
                        <RaceTabs interactive racePlan={racePlan} racePlayerIds={racePlayerIds} activeRace={activeRace} onSetActiveRace={setActiveRace} />
                        <RaceCard raceIdx={activeRace} interactive racePlan={racePlan} racePlayerIds={racePlayerIds} players={players} squadPlayers={squadPlayers} onToggleRacePlayer={toggleRacePlayer} onAutoSelectRace={autoSelectRace} />
                      </div>
                    )}
                    <button
                      onClick={() => { simulateWorldEkiden(); navigate('/international/sim') }}
                      className="btn-game btn-game--gold"
                      style={{ width: '100%' }}
                    >
                      <span className="btn-game__inner">{coachDeclined ? 'おまかせで世界選手権へ' : '采配確定 — 世界選手権へ'}</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Result display */}
        {isWEYear && result && result.races && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: '8px 12px', borderRadius: 9, background: C.surface2, border: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>HOST CITY</div>
                <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 700, color: C.text }}>{result.hostCity}</div>
                <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textGhost }}>{result.courseChar}</div>
              </div>
              <div style={{ flex: 1, padding: '8px 12px', borderRadius: 9, background: C.surface2, border: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>FINAL RANK</div>
                <div style={{ fontFamily: SAIRA, fontSize: 28, fontWeight: 900, color: rankColor(result.japanFinalRank), lineHeight: 1 }}>{result.japanFinalRank}位</div>
                {medalLabel(result.japanFinalRank) && <div style={{ fontFamily: SAIRA, fontSize: 10, color: rankColor(result.japanFinalRank) }}>{medalLabel(result.japanFinalRank)}</div>}
              </div>
            </div>

            {PRIZE[result.japanFinalRank] && (
              <div style={{ padding: '8px 14px', borderRadius: 9, background: result.japanFinalRank <= 3 ? alpha(C.gold, 0.08) : C.surface2, border: `1px solid ${result.japanFinalRank <= 3 ? alpha(C.gold, 0.3) : C.border}`, marginBottom: 12, fontFamily: SAIRA, fontSize: 11, color: result.japanFinalRank <= 3 ? C.gold : C.textDim, textAlign: 'center' }}>
                {PRIZE[result.japanFinalRank]}
              </div>
            )}

            {/* Result tabs */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
              <button onClick={() => setActiveResultRace(-1)} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1px solid ${activeResultRace === -1 ? C.goldDark : C.border}`, background: activeResultRace === -1 ? alpha(C.gold, 0.08) : C.surface2, color: activeResultRace === -1 ? C.gold : C.textSub, fontFamily: SAIRA, fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>
                総合
              </button>
              {result.races.map((r, i) => (
                <button key={i} onClick={() => setActiveResultRace(i)} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1px solid ${activeResultRace === i ? C.goldDark : C.border}`, background: activeResultRace === i ? alpha(C.gold, 0.08) : C.surface2, cursor: 'pointer', fontFamily: SAIRA }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: activeResultRace === i ? C.gold : C.textSub }}>第{i + 1}</div>
                  <div style={{ fontSize: 9, color: rankColor(r.japanRank) }}>{r.japanRank}位</div>
                </button>
              ))}
            </div>

            {/* Final standings */}
            {activeResultRace === -1 && (
              <>
                <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '2px', marginBottom: 6 }}>3レース合計ポイント</div>
                <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.surface2, marginBottom: 14 }}>
                  {result.finalStandings.map((s, idx) => {
                    const isJapan = s.country === 'JPN'
                    return (
                      <div key={s.country} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: idx < result.finalStandings.length - 1 ? `1px solid ${C.border}` : 'none', background: isJapan ? alpha(C.gold, 0.05) : 'transparent' }}>
                        <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: rankColor(s.finalRank), textAlign: 'center' }}>{s.finalRank}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {isJapan && <span style={{ fontFamily: SAIRA, fontSize: 8, padding: '1px 5px', borderRadius: 4, background: alpha(C.gold, 0.15), color: C.gold, fontWeight: 700, border: `1px solid ${alpha(C.gold, 0.35)}` }}>日本</span>}
                          <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: isJapan ? 800 : 400, color: isJapan ? C.text : C.textSub }}>{s.name}</span>
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 700, color: s.finalRank <= 3 ? C.gold : C.textDim, textAlign: 'right' }}>{s.totalPoints}pt</div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Individual race result */}
            {activeResultRace >= 0 && result.races[activeResultRace] && (() => {
              const r = result.races[activeResultRace]
              return (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1, padding: '8px 12px', borderRadius: 9, background: C.surface2, border: `1px solid ${C.border}` }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>WEATHER</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: C.text }}>{WEATHER_LABEL[r.weather]}</div>
                    </div>
                    <div style={{ flex: 1, padding: '8px 12px', borderRadius: 9, background: C.surface2, border: `1px solid ${C.border}` }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '2px' }}>JAPAN</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: rankColor(r.japanRank), lineHeight: 1 }}>{r.japanRank}位</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '2px', marginBottom: 6 }}>日本 区間タイム</div>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.surface2, marginBottom: 10 }}>
                    {r.legResults.map((leg, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: i < r.legResults.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.gold, width: 28, flexShrink: 0 }}>{leg.segmentIndex}区</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: SAIRA, fontSize: 13, color: C.text }}>{legName(leg)}</div>
                          <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim }}>{leg.distanceKm}km</div>
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 700, color: C.textSub }}>{fmtTime(leg.timeSec)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '2px', marginBottom: 6 }}>第{r.raceNumber}レース 国別順位</div>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.surface2, marginBottom: 14 }}>
                    {r.countryResults.map((c, idx) => {
                      const isJapan = c.country === 'JPN'
                      return (
                        <div key={c.country} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 50px 40px', alignItems: 'center', gap: 6, padding: '7px 12px', borderBottom: idx < r.countryResults.length - 1 ? `1px solid ${C.border}` : 'none', background: isJapan ? alpha(C.gold, 0.05) : 'transparent' }}>
                          <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: rankColor(c.rank), textAlign: 'center' }}>{c.rank}</div>
                          <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: isJapan ? 800 : 400, color: isJapan ? C.text : C.textSub }}>{c.name}</div>
                          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, textAlign: 'right' }}>{fmtTime(c.totalTimeSec)}</div>
                          <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 700, color: c.rank <= 3 ? C.gold : C.textDim, textAlign: 'right' }}>+{c.points}pt</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </>
        )}

        {/* Past results */}
        {pastWEResults.length > 0 && (
          <>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '2px', marginBottom: 6 }}>過去の大会</div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.surface2 }}>
              {pastWEResults.map((r, idx) => {
                const finalRank = r.japanFinalRank ?? r.japanRank ?? 0
                const rc = rankColor(finalRank)
                const medal = medalLabel(finalRank)
                return (
                  <div key={r.year} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: idx < pastWEResults.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, width: 44, flexShrink: 0 }}>{r.year}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: rc }}>{finalRank}位 {medal && <span style={{ fontSize: 10, marginLeft: 4 }}>{medal}</span>}</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, marginTop: 1 }}>{r.hostCity}{r.courseChar ? ` / ${r.courseChar}` : ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
