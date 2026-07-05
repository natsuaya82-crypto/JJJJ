import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import NumberDial from '../ui/NumberDial'
import { useGameStore } from '../../store/gameStore'
import { ovr, ratingColor, SPEC_COLOR, FORM_LABELS, FORM_COLORS, calcTransferValue, careerStage, CAREER_STAGE_LABEL, CAREER_STAGE_COLOR, buildScoutReport } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import type { Player } from '../../types'
import { playerStatusLabel } from '../../data/rosterRules'
import { formatTime } from '../../engine/raceEngine'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from './PlayerFace'
import { MAIN_RACE_NAMES, RESERVE_RACE_POOL_NAMES } from '../../data/races'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type RatingKey = keyof Player['ratings']

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

const STAT_KEYS: { key: RatingKey; label: string }[] = [
  { key: 'speed', label: '速度' },
  { key: 'stamina', label: 'スタミナ' },
  { key: 'mountainUp', label: '山登り' },
  { key: 'mountainDown', label: '山下り' },
  { key: 'pacing', label: 'ペース配分' },
  { key: 'mental', label: 'メンタル' },
  { key: 'recovery', label: '回復力' },
]

const RADAR_AXES: { key: RatingKey; abbr: string }[] = [
  { key: 'speed', abbr: '速' },
  { key: 'stamina', abbr: '持' },
  { key: 'mountainUp', abbr: '登' },
  { key: 'mountainDown', abbr: '下' },
  { key: 'pacing', abbr: 'ペ' },
  { key: 'mental', abbr: '精' },
  { key: 'recovery', abbr: '回' },
]

function RadarChart({ ratings, color }: { ratings: Player['ratings']; color: string }) {
  const cx = 120, cy = 120, R = 80, labelR = 106
  const n = RADAR_AXES.length
  const ang = (i: number) => ((-90 + (360 / n) * i) * Math.PI) / 180
  const px = (i: number, r: number) => cx + r * Math.cos(ang(i))
  const py = (i: number, r: number) => cy + r * Math.sin(ang(i))
  const polyPts = (r: number) => RADAR_AXES.map((_, i) => `${px(i,r)},${py(i,r)}`).join(' ')
  const dataPts = RADAR_AXES.map((a, i) => {
    const ratio = (ratings[a.key] ?? 50) / 100
    return `${px(i, R * ratio)},${py(i, R * ratio)}`
  }).join(' ')
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240"
      style={{ display: 'block', margin: '0 auto' }}>
      {[0.25, 0.5, 0.75, 1].map(lv => (
        <polygon key={lv} points={polyPts(R * lv)}
          fill="none" stroke={color} strokeWidth={lv === 1 ? 1 : 0.5} opacity={lv === 1 ? 0.4 : 0.1} />
      ))}
      {RADAR_AXES.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={px(i,R)} y2={py(i,R)}
          stroke={color} strokeWidth={0.75} opacity={0.25} />
      ))}
      <polygon points={dataPts}
        fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {RADAR_AXES.map((a, i) => {
        const ratio = (ratings[a.key] ?? 50) / 100
        return <circle key={i} cx={px(i,R*ratio)} cy={py(i,R*ratio)} r={3} fill={color} />
      })}
      {RADAR_AXES.map((a, i) => {
        const val = ratings[a.key] ?? 50
        const valCol = val >= 80 ? C.gold : val >= 65 ? C.textSub : C.textDim
        return (
          <g key={i}>
            <text x={px(i,labelR)} y={py(i,labelR)-7}
              textAnchor="middle" dominantBaseline="middle" fill={color} opacity={0.85}
              fontSize="9" fontWeight="700" fontFamily="'Saira Condensed',system-ui,sans-serif">{a.abbr}</text>
            <text x={px(i,labelR)} y={py(i,labelR)+7}
              textAnchor="middle" dominantBaseline="middle" fill={valCol}
              fontSize="12" fontWeight="900" fontFamily="'Saira Condensed',system-ui,sans-serif">{val}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate = useNavigate()
  const { players, teams, currentSeason, pastSeasons, foreignLeagues, playerTeamId } = useGameStore()
  const starredOpponents = useGameStore(s => s.starredOpponents ?? [])
  const toggleStarOpponent = useGameStore(s => s.toggleStarOpponent)
  const scoutOpponentPlayer = useGameStore(s => s.scoutOpponentPlayer)
  const submitTransferBid = useGameStore(s => s.submitTransferBid)
  const loanOutPlayer = useGameStore(s => s.loanOutPlayer)
  const submitLoanRequest = useGameStore(s => s.submitLoanRequest)

  const player = players.find(p => p.id === playerId)
  if (!player) {
    return (
      <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", padding: '40px', textAlign: 'center', color: C.textDim, background: C.bg, minHeight: '100dvh' }}>
        選手が見つかりません
        <br/>
        <BackButton/>
      </div>
    )
  }

  const isMyPlayer = player.teamId === playerTeamId
  const scoutEntry = (currentSeason.scoutedOpponents ?? []).find(s => s.playerId === player.id)
  const isScouted = isMyPlayer || (scoutEntry != null && currentSeason.year - scoutEntry.year <= 1)
  const isStarred = starredOpponents.includes(player.id)
  const scoutPoints = currentSeason.scoutPoints ?? 0

  // 他チーム選手の獲得：視察なしでもオファー可。まず相手クラブへ移籍金オファー（チーム合意）→ 合意後に選手と契約交渉
  const isFA = player.teamId === ''
  const canSendOffer = !isMyPlayer && !isFA
  const existingBid = (currentSeason.transferBids ?? []).find(
    b => b.playerId === player.id && ['pending', 'fee_accepted', 'countered', 'player_neg'].includes(b.status)
  )
  const marketFee = Math.max(1_000_000, Math.round(calcTransferValue(player) / 1_000_000) * 1_000_000)
  const [offerFee, setOfferFee] = useState(marketFee)
  const myBudget = teams.find(t => t.id === playerTeamId)?.finance.budget ?? 0
  const sendOffer = () => {
    submitTransferBid(player.id, offerFee)
    navigate('/transfer/offers')
  }

  const playerOvr = ovr(player)
  const specCol = SPEC_COLOR[player.specialty] ?? C.textSub
  const team = teams.find(t => t.id === player.teamId)
  const formLabel = FORM_LABELS[Math.round(player.form ?? 0)] ?? '普通'
  const formColor = FORM_COLORS[Math.round(player.form ?? 0)] ?? C.textDim

  let foreignClub: { leagueName: string; clubName: string } | null = null
  for (const l of foreignLeagues ?? []) {
    for (const c of l.clubs) {
      if (c.playerIds.includes(player.id)) {
        foreignClub = { leagueName: l.name, clubName: c.name }
      }
    }
  }

  // Race data — all seasons
  type RaceEntry = { year: number; segIdx: number; rank: number; timeSec: number }
  const raceGroupMap = new Map<string, RaceEntry[]>()
  const addEntry = (name: string, e: RaceEntry) => {
    if (!raceGroupMap.has(name)) raceGroupMap.set(name, [])
    raceGroupMap.get(name)!.push(e)
  }
  const processRaces = (raceList: typeof currentSeason.races, year: number) => {
    for (const race of raceList) {
      if (!race.results) continue
      const sr = race.results.segmentResults.find(s => s.runners.some(r => r.playerId === player.id))
      if (!sr) continue
      const runner = sr.runners.find(r => r.playerId === player.id)!
      addEntry(race.name, { year, segIdx: sr.segmentIndex, rank: runner.rank, timeSec: runner.timeSec })
    }
  }
  for (const ps of pastSeasons) {
    processRaces(ps.races, ps.year)
    processRaces(ps.collegeRaces ?? [], ps.year)
  }
  processRaces(currentSeason.races, currentSeason.year)
  processRaces(currentSeason.collegeRaces ?? [], currentSeason.year)

  const seenReserveNames = new Set<string>()
  for (const r of [...(currentSeason.collegeRaces ?? []), ...pastSeasons.flatMap(ps => ps.collegeRaces ?? [])]) {
    seenReserveNames.add(r.name)
  }
  const reserveRaceNames = RESERVE_RACE_POOL_NAMES.filter(n => seenReserveNames.has(n))

  const ovrHistory = player.ovrHistory ?? []
  const fat = player.fatigue ?? 0
  const mor = player.morale ?? 70
  const frm = Math.round(player.form ?? 0)
  const fatCol = fat >= 70 ? C.red : fat >= 40 ? C.gold : C.green
  const morCol = mor >= 70 ? C.green : mor >= 40 ? C.gold : C.red
  const frmCol = FORM_COLORS[frm] ?? C.textDim

  const card = {
    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
    border: `2px solid ${C.goldDark}`,
    borderRadius: 14 as const,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
  }
  const cardInset = { position: 'absolute' as const, inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none' as const, zIndex: 0 }
  const cardBody = { position: 'relative' as const, zIndex: 1, padding: '12px 14px' }

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh', color: C.text }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, ${alpha(specCol, 0.15)} 0%, ${C.bg} 60%)`, padding: '12px 16px 16px', borderBottom: `1px solid ${C.border}` }}>
        <BackButton/>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `2px solid ${alpha(specCol, 0.5)}`, boxShadow: `0 4px 0 rgba(0,0,0,0.4)`, background: `linear-gradient(135deg, ${alpha(specCol, 0.25)}, ${alpha(specCol, 0.08)})` }}>
              <PlayerFace playerId={player.id} nationality={player.nationality} size={72} />
            </div>
            <div style={{ position: 'absolute', bottom: -4, right: -4, background: C.bg, border: `1px solid ${alpha(specCol, 0.5)}`, borderRadius: 8, padding: '2px 5px', textAlign: 'center' }}>
              <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: isScouted ? ratingColor(playerOvr) : C.textGhost, lineHeight: 1 }}>{isScouted ? playerOvr : '?'}</div>
              <div style={{ fontSize: 6, color: C.textGhost, fontFamily: SAIRA, letterSpacing: '1px' }}>OVR</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '2px' }}>
              <div style={{ fontSize: '20px', fontWeight: '900', color: C.text }}>{player.name}</div>
              {!isMyPlayer && (
                <button
                  onClick={() => toggleStarOpponent(player.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: isStarred ? C.gold : C.textGhost, fontSize: 20, lineHeight: 1, flexShrink: 0 }}
                >
                  {isStarred ? '★' : '☆'}
                </button>
              )}
            </div>
            <div style={{ fontSize: '11px', color: C.textSub, marginBottom: '6px' }}>{player.nameKana}</div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '6px', backgroundColor: alpha(specCol, 0.2), color: specCol, fontWeight: '800', border: `1px solid ${alpha(specCol, 0.3)}` }}>
                {SPECIALTY_LABELS[player.specialty]}
              </span>
              <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '6px', backgroundColor: alpha(formColor, 0.15), color: formColor, fontWeight: '700' }}>
                {formLabel}
              </span>
              {(() => {
                const stage = careerStage(player)
                const stageCol = CAREER_STAGE_COLOR[stage]
                return (
                  <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '6px', backgroundColor: alpha(stageCol, 0.15), color: stageCol, fontWeight: '700', border: `1px solid ${alpha(stageCol, 0.25)}` }}>
                    {CAREER_STAGE_LABEL[stage]}
                  </span>
                )
              })()}
            </div>
          </div>
        </div>
      </div>

<div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* 基本情報 */}
        <div style={card}>
          <div style={cardInset}/>
          <div style={cardBody}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 8 }}>基本情報</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: 8 }}>
              {[
                { label: '所属', value: team ? team.shortName : foreignClub ? foreignClub.clubName : 'FA', color: team ? team.colors.primary : C.textDim },
                { label: '年齢', value: `${player.age}歳`, color: C.textSub },
                { label: '年俸', value: fmt(player.contract.annualSalary), color: C.gold },
                { label: '契約', value: playerStatusLabel(player).label, color: player.transferListed ? C.orange : player.teamId === '' ? C.green : C.textSub },
                { label: '契約残', value: `${player.contract.yearsLeft}年`, color: player.contract.yearsLeft <= 1 ? C.red : C.textSub },
                { label: 'ポテ', value: isScouted ? `${player.potential}` : '?', color: (isScouted && player.potential >= 85) ? C.gold : isScouted ? C.textSub : C.textGhost },
                { label: '市場価値', value: fmt(calcTransferValue(player)), color: C.green },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: '7px 9px', borderRadius: '9px', background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`, border: `1px solid ${C.border2}` }}>
                  <div style={{ fontSize: '8px', color: C.textGhost, marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color, fontFamily: SAIRA }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 9px', borderRadius: '9px', background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`, border: `1px solid ${C.border2}` }}>
              <div style={{ fontSize: '8px', color: C.textGhost }}>ドラフト</div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: player.draftRound ? C.gold : C.textGhost, fontFamily: SAIRA }}>
                {player.draftRound && player.draftPick != null ? `${player.draftYear}年度 全体${(player.draftRound - 1) * 20 + player.draftPick}位` : 'ドラフト外'}
              </div>
            </div>
            {foreignClub && (
              <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '8px', backgroundColor: alpha(C.blue, 0.12), border: `1px solid ${alpha(C.blue, 0.3)}` }}>
                <span style={{ fontSize: '9px', color: C.blue }}>{foreignClub.leagueName} — {foreignClub.clubName}</span>
              </div>
            )}
          </div>
        </div>

        {/* 視察ゲート */}
        {!isMyPlayer && !isScouted && (
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={cardInset}/>
            <div style={{ ...cardBody, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 11, color: C.textGhost }}>能力値・詳細情報を見るには視察が必要です</div>
              <button
                onClick={() => { if (scoutPoints > 0) scoutOpponentPlayer(player.id, 1) }}
                style={{
                  padding: '7px 20px', borderRadius: 10,
                  cursor: scoutPoints > 0 ? 'pointer' : 'not-allowed',
                  backgroundColor: scoutPoints > 0 ? '#7986CB18' : C.surface,
                  border: `1px solid ${scoutPoints > 0 ? '#7986CB40' : C.border}`,
                  color: scoutPoints > 0 ? '#7986CB' : C.textGhost,
                  fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                }}
              >
                視察する (-1PT) 残{scoutPoints}PT
              </button>
            </div>
          </div>
        )}

        {/* スカウトレポート */}
        {isScouted && (() => {
          const report = buildScoutReport(player)
          const stage = careerStage(player)
          const stageCol = CAREER_STAGE_COLOR[stage]
          const trendCol = report.valueTrend === 'up' ? C.green : report.valueTrend === 'flat' ? C.gold : C.textSub
          const trendArrow = report.valueTrend === 'up' ? '↑' : report.valueTrend === 'flat' ? '→' : '↓'
          const trendLabel = report.valueTrend === 'up' ? '上昇中' : report.valueTrend === 'flat' ? '安定' : '下降中'
          return (
            <div style={card}>
              <div style={cardInset}/>
              <div style={cardBody}>
                <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 8 }}>スカウトレポート</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                  {[
                    { label: 'キャリア', value: CAREER_STAGE_LABEL[stage], color: stageCol },
                    { label: '得意コース', value: report.bestTerrain, color: C.textSub },
                    { label: '市場価値', value: `${trendArrow} ${trendLabel}`, color: trendCol },
                    { label: '獲得窓口', value: report.buyWindow.length > 22 ? report.buyWindow.slice(0, 22) + '…' : report.buyWindow, color: C.textDim },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: '6px 8px', borderRadius: '8px', background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`, border: `1px solid ${C.border2}` }}>
                      <div style={{ fontSize: '7px', color: C.textGhost, marginBottom: '2px' }}>{label}</div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color, fontFamily: SAIRA }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '7px 9px', borderRadius: '8px', background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`, border: `1px solid ${C.border2}` }}>
                  <div style={{ fontSize: '7px', color: C.textGhost, marginBottom: '3px' }}>成長見通し</div>
                  <div style={{ fontSize: '10px', color: C.textSub, lineHeight: 1.6 }}>{report.growthOutlook}</div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* レンタルに出す（自チームの選手を他チームへ貸し出し＝出場機会で成長） */}
        {isMyPlayer && !player.loan && (
          <div style={card}>
            <div style={cardInset}/>
            <div style={{ ...cardBody, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.blue, letterSpacing: '3px', fontWeight: 900 }}>レンタル移籍に出す</div>
              <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>他クラブに貸し出して出場機会を与えます（給与は借り手負担・期間後に自動復帰）。</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2].map(y => (
                  <button key={y} onClick={() => {
                    const others = teams.filter(t => t.id !== playerTeamId)
                    const target = others[Math.floor((ovr(player) + y) % Math.max(1, others.length))]
                    if (target && loanOutPlayer(player.id, target.id, y)) navigate('/team')
                  }}
                    style={{ flex: 1, padding: 11, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${alpha(C.blue, 0.5)}`, background: alpha(C.blue, 0.12), color: C.blue, fontSize: 13, fontWeight: 800, fontFamily: 'inherit' }}>
                    {y}シーズン貸す
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* レンタル中の表示 */}
        {player.loan && (
          <div style={card}>
            <div style={cardInset}/>
            <div style={{ ...cardBody }}>
              <div style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}>
                {player.loan.ownerTeamId === playerTeamId ? 'この選手を他クラブへレンタル中' : 'レンタルで加入中（保有元へ返却予定）'}
                <span style={{ color: C.textDim, marginLeft: 6 }}>〜{player.loan.untilYear}年</span>
              </div>
            </div>
          </div>
        )}

        {/* 獲得オファー（他チーム選手／FA選手・視察不要） */}
        {canSendOffer && (
          <div style={card}>
            <div style={cardInset}/>
            <div style={{ ...cardBody, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900 }}>移籍金オファー（チーム合意）</div>
              {existingBid ? (
                <>
                  <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
                    {existingBid.status === 'fee_accepted' ? 'クラブが移籍金に合意しました。次は選手と契約交渉です。' : existingBid.status === 'countered' ? 'クラブが対抗の移籍金を提示しています。' : 'クラブに移籍金を打診中です。'}
                  </div>
                  <button onClick={() => navigate(existingBid.status === 'fee_accepted' ? `/transfer/negotiate/transfer/${existingBid.id}` : '/transfer/offers')}
                    style={{ padding: '11px', borderRadius: 10, cursor: 'pointer', backgroundColor: alpha(C.blue, 0.12), border: `1.5px solid ${alpha(C.blue, 0.5)}`, color: C.blue, fontSize: 13, fontWeight: 800, fontFamily: 'inherit' }}>
                    {existingBid.status === 'fee_accepted' ? '選手と契約交渉へ →' : 'オファー一覧で確認 →'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
                    まず相手クラブへ<b>移籍金</b>を提示してチーム合意を得ます。合意後に選手と契約交渉します。
                    {(player.teamRole === 'ace' || player.teamRole === 'sub_ace') && (
                      <span style={{ color: C.red }}>（主力級のためクラブが手放さない可能性が高い）</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 10, color: C.textDim }}>
                    <span>市場価値 <span style={{ color: C.gold, fontFamily: SAIRA }}>{fmt(marketFee)}</span></span>
                    <span>予算 <span style={{ color: offerFee > myBudget ? C.red : C.textSub, fontFamily: SAIRA }}>{fmt(myBudget)}</span></span>
                  </div>
                  <div style={{ padding: '6px 0' }}>
                    <NumberDial value={offerFee} onChange={setOfferFee} min={1_000_000} max={myBudget} />
                  </div>
                  <button onClick={sendOffer} disabled={offerFee > myBudget}
                    style={{ padding: '12px', borderRadius: 10, cursor: offerFee > myBudget ? 'not-allowed' : 'pointer', opacity: offerFee > myBudget ? 0.5 : 1, background: `linear-gradient(180deg, ${alpha(C.gold, 0.14)}, ${alpha(C.gold, 0.06)})`, border: `1.5px solid ${alpha(C.gold, 0.5)}`, color: C.gold, fontSize: 14, fontWeight: 900, fontFamily: 'inherit' }}>
                    {offerFee > myBudget ? '予算不足' : `${fmt(offerFee)}を移籍金としてオファー`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* レンタル要請（他チーム選手・視察不要） */}
        {canSendOffer && !player.loan && (() => {
          const slots = players.filter(pl => pl.teamId === playerTeamId && pl.loan && pl.loan.ownerTeamId !== playerTeamId).length
          const reqPending = (currentSeason.loanRequests ?? []).some(r => r.playerId === player.id)
          return (
            <div style={card}>
              <div style={cardInset}/>
              <div style={{ ...cardBody, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.blue, letterSpacing: '3px', fontWeight: 900 }}>レンタル要請</div>
                <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>買わずに1〜2年借りる要請。相手が次レースで回答します（枠 {slots}/3）。</div>
                {reqPending ? (
                  <div style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}>レンタル要請中 — 次レースで回答</div>
                ) : slots >= 3 ? (
                  <div style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>レンタル枠が満杯です（3/3）</div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[1, 2].map(y => (
                      <button key={y} onClick={() => submitLoanRequest(player.id, y)}
                        style={{ flex: 1, padding: 11, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${alpha(C.blue, 0.5)}`, background: alpha(C.blue, 0.12), color: C.blue, fontSize: 13, fontWeight: 800, fontFamily: 'inherit' }}>
                        {y}年レンタルで要請
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* コンディション */}
        {isScouted && <div style={card}>
          <div style={cardInset}/>
          <div style={cardBody}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 10 }}>コンディション</div>
            {([
              { label: '疲労', value: fat, color: fatCol, status: fat >= 70 ? '要休養' : fat >= 40 ? '注意' : '良好' },
              { label: 'モラル', value: mor, color: morCol, status: mor >= 70 ? '高い' : mor >= 40 ? '普通' : '低い' },
            ] as { label: string; value: number; color: string; status: string }[]).map(({ label, value, color, status }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8 }}>
                <div style={{ width: '40px', fontSize: '10px', color: C.textSub, flexShrink: 0 }}>{label}</div>
                <div style={{ flex: 1, height: '6px', background: C.border, borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: '3px' }}/>
                </div>
                <div style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: 800, color, width: '22px', textAlign: 'right', flexShrink: 0 }}>{value}</div>
                <div style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '6px', background: alpha(color, 0.15), color, fontWeight: 700, flexShrink: 0, minWidth: '32px', textAlign: 'center' }}>{status}</div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '40px', fontSize: '10px', color: C.textSub, flexShrink: 0 }}>フォーム</div>
              <div style={{ display: 'flex', gap: '3px', flex: 1 }}>
                {([-2, -1, 0, 1, 2] as const).map(f => {
                  const active = frm === f
                  const col = FORM_COLORS[f]
                  return (
                    <div key={f} style={{ flex: 1, height: '20px', borderRadius: '4px', background: active ? col : alpha(col, 0.12), border: `1px solid ${active ? col : alpha(col, 0.2)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SAIRA, fontSize: '8px', fontWeight: active ? 800 : 400, color: active ? C.bg : alpha(col, 0.5) }}>
                      {f > 0 ? `+${f}` : f}
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '6px', background: alpha(frmCol, 0.15), color: frmCol, fontWeight: 700, flexShrink: 0, minWidth: '36px', textAlign: 'center' }}>{FORM_LABELS[frm] ?? '普通'}</div>
            </div>
          </div>
        </div>}

        {/* 能力値 */}
        {isScouted && <div style={card}>
          <div style={cardInset}/>
          <div style={cardBody}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 10 }}>能力値</div>
            <RadarChart ratings={player.ratings} color={specCol} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: 10 }}>
              {STAT_KEYS.map(({ key, label }) => {
                const val = player.ratings[key as keyof typeof player.ratings] as number
                const col = ratingColor(val)
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '56px', fontSize: '10px', color: C.textSub, flexShrink: 0 }}>{label}</div>
                    <div style={{ flex: 1, height: '5px', background: C.border, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${val}%`, background: col, borderRadius: '3px' }}/>
                    </div>
                    <div style={{ width: '26px', fontSize: '12px', fontWeight: '800', color: col, fontFamily: SAIRA, textAlign: 'right', flexShrink: 0 }}>{val}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>}

        {/* 駅伝履歴 */}
        {!foreignClub && <div style={card}>
          <div style={cardInset}/>
          <div style={cardBody}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 10 }}>駅伝履歴</div>

            {/* Career stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: 14 }}>
              {[
                { label: '通算出走', val: player.career.totalRaces },
                { label: '区間賞', val: player.career.segmentWins },
                { label: '優勝', val: player.career.championships },
                { label: 'MVP', val: player.career.mvpAwards },
              ].map(({ label, val }) => (
                <div key={label} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: '8px', background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`, border: `1px solid ${C.border2}` }}>
                  <div style={{ fontFamily: SAIRA, fontSize: '18px', fontWeight: '900', color: val > 0 ? C.gold : C.textGhost, lineHeight: 1 }}>{val}</div>
                  <div style={{ fontSize: '8px', color: C.textGhost, marginTop: '3px' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* 1軍 */}
            <div style={{ fontSize: '9px', fontWeight: '800', color: C.textDim, letterSpacing: '2px', marginBottom: '8px' }}>1軍駅伝</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: 14 }}>
              {MAIN_RACE_NAMES.map(name => {
                const entries = (raceGroupMap.get(name) ?? []).slice().sort((a, b) => b.year - a.year)
                return (
                  <div key={name} style={{ borderRadius: '10px', overflow: 'hidden', border: `1px solid ${entries.length > 0 ? C.border2 : C.border}` }}>
                    <div style={{ padding: '8px 12px', background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`, borderBottom: entries.length > 0 ? `1px solid ${C.border}` : 'none' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: entries.length > 0 ? C.text : C.textGhost }}>{name}</span>
                      {entries.length === 0 && <span style={{ fontSize: '10px', color: C.textGhost, marginLeft: 8 }}>未出走</span>}
                    </div>
                    {entries.map((e, i) => {
                      const rankCol = e.rank === 1 ? C.gold : e.rank <= 3 ? C.textSub : C.textDim
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', borderBottom: i < entries.length - 1 ? `1px solid ${C.border}` : 'none', backgroundColor: i % 2 === 0 ? alpha(C.surface, 0.5) : 'transparent' }}>
                          <span style={{ fontSize: '11px', color: C.textGhost, fontFamily: SAIRA, flexShrink: 0, width: '44px' }}>{e.year}年</span>
                          <span style={{ fontSize: '11px', color: C.textDim, flexShrink: 0 }}>第{e.segIdx + 1}区</span>
                          <span style={{ fontFamily: SAIRA, fontSize: '14px', fontWeight: '900', color: rankCol, width: '30px', textAlign: 'center', flexShrink: 0 }}>{e.rank}位</span>
                          <span style={{ flex: 1 }} />
                          <span style={{ fontSize: '11px', fontWeight: '700', color: C.textSub, fontFamily: SAIRA, flexShrink: 0 }}>{formatTime(e.timeSec)}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* 2軍 */}
            {reserveRaceNames.length > 0 && (
              <>
                <div style={{ fontSize: '9px', fontWeight: '800', color: C.textDim, letterSpacing: '2px', marginBottom: '8px' }}>2軍駅伝</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {reserveRaceNames.map(name => {
                    const entries = (raceGroupMap.get(name) ?? []).slice().sort((a, b) => b.year - a.year)
                    return (
                      <div key={name} style={{ borderRadius: '10px', overflow: 'hidden', border: `1px solid ${entries.length > 0 ? C.border2 : C.border}` }}>
                        <div style={{ padding: '8px 12px', background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`, borderBottom: entries.length > 0 ? `1px solid ${C.border}` : 'none' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: entries.length > 0 ? C.text : C.textGhost }}>{name}</span>
                          {entries.length === 0 && <span style={{ fontSize: '10px', color: C.textGhost, marginLeft: 8 }}>未出走</span>}
                        </div>
                        {entries.map((e, i) => {
                          const rankCol = e.rank === 1 ? C.gold : e.rank <= 3 ? C.textSub : C.textDim
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', borderBottom: i < entries.length - 1 ? `1px solid ${C.border}` : 'none', backgroundColor: i % 2 === 0 ? alpha(C.surface, 0.5) : 'transparent' }}>
                              <span style={{ fontSize: '11px', color: C.textGhost, fontFamily: SAIRA, flexShrink: 0, width: '44px' }}>{e.year}年</span>
                              <span style={{ fontSize: '11px', color: C.textDim, flexShrink: 0 }}>第{e.segIdx + 1}区</span>
                              <span style={{ fontFamily: SAIRA, fontSize: '14px', fontWeight: '900', color: rankCol, width: '30px', textAlign: 'center', flexShrink: 0 }}>{e.rank}位</span>
                              <span style={{ flex: 1 }} />
                              <span style={{ fontSize: '11px', fontWeight: '700', color: C.textSub, fontFamily: SAIRA, flexShrink: 0 }}>{formatTime(e.timeSec)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>}

        {/* OVR推移 */}
        {isScouted && ovrHistory.length > 0 && (
          <div style={card}>
            <div style={cardInset}/>
            <div style={cardBody}>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 8 }}>OVR推移</div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '40px' }}>
                {ovrHistory.map((h, i) => {
                  const maxOvr = Math.max(...ovrHistory.map(x => x.ovr))
                  const minOvr = Math.min(...ovrHistory.map(x => x.ovr))
                  const range = maxOvr - minOvr || 1
                  const heightPct = ((h.ovr - minOvr) / range) * 70 + 30
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <div style={{ fontSize: '8px', color: C.textDim, fontFamily: SAIRA }}>{h.ovr}</div>
                      <div style={{ width: '100%', height: `${heightPct}%`, background: alpha(C.gold, 0.3), border: `1px solid ${alpha(C.gold, 0.5)}`, borderRadius: '3px' }}/>
                      <div style={{ fontSize: '7px', color: C.textGhost, fontFamily: SAIRA }}>{h.year}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 区間PB */}
        {(player.segmentPBs ?? []).length > 0 && (
          <div style={card}>
            <div style={cardInset}/>
            <div style={cardBody}>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 8 }}>区間PB（コース別自己ベスト）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(player.segmentPBs ?? []).sort((a, b) => (parseInt(a.key) || 0) - (parseInt(b.key) || 0)).map((pb, i) => {
                  const [kmPart, upPart, dnPart] = pb.key.split('-')
                  const km = kmPart?.replace('km', '') ?? '?'
                  const up = parseInt(upPart?.replace('up', '') ?? '0')
                  const dn = parseInt(dnPart?.replace('dn', '') ?? '0')
                  const terrainTag = up >= 30 ? '山岳↑' : dn >= 30 ? '山岳↓' : up + dn > 20 ? '起伏' : 'フラット'
                  const terrainCol = up >= 30 ? C.red : dn >= 30 ? C.green : up + dn > 20 ? C.gold : C.blue
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px', background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`, border: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '4px', backgroundColor: alpha(terrainCol, 0.18), color: terrainCol, fontWeight: '700', flexShrink: 0 }}>{terrainTag}</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: C.textSub, flexShrink: 0, fontFamily: SAIRA }}>{km}km</span>
                      <span style={{ flex: 1, fontSize: '9px', color: C.textGhost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pb.raceName}</span>
                      <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: C.gold, flexShrink: 0 }}>{formatTime(pb.timeSec)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
