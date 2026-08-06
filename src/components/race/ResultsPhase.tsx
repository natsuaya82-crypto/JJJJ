import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Race, RaceResults, Team, Player, Season } from '../../types'
import { formatDiff } from '../../engine/raceEngine'
import { formatRaceTime } from '../../utils/eventTime'
import { ovr, ratingColor } from '../../utils/playerUtils'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { clubRoutePath } from '../../utils/clubs'
import { useAdHeight } from '../layout/Layout'
import { RARITY_COLORS, RARITY_LABELS, CARD_STAT_LABELS, CARD_NAMES, REST_CARD_NAME } from '../../utils/cardCombo'
import { C, alpha, COMPETITION_BTN, rankColor } from '../../styles/tokens'
import type { Competition } from '../../styles/tokens'
import { TeamLogoSVG } from '../icons/Icons'
import StandingsTable from '../teams/StandingsTable'
import { SegmentDetailCard, SegmentTabs, FaceOrDot } from './SegmentDetailCard'
import { contractTalkCtx, contractMonthsLeft, isUrgentRenewal } from '../../utils/contractTalk'
import { rankedStandings } from '../../utils/league'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function requiredExp(level: number): number {
  const dull = level < 80 ? 1 : level < 90 ? 2 : 4   // gameStoreのrequiredExpForLevelと常に一致させる
  return Math.floor(0.5 * level * level * dull)
}

// tokens.ts の rankColor と同じ色だが、この1箇所だけ4位以下のフォールバックが
// C.textDim（他は全部 C.textGhost）になっている。rankColor に置き換えると色が
// 変わってしまうため、ここだけ意図的にローカル定義のまま残している（挙動維持）。

const RANK_ROW_STYLE = (rank: number, isPlayer: boolean): React.CSSProperties => {
  if (isPlayer) return {
    background: `linear-gradient(90deg, ${alpha(C.cyan, 0.1)}, transparent)`,
    borderLeft: `3px solid ${C.cyan}`,
  }
  if (rank === 1) return {
    background: `linear-gradient(90deg, ${alpha(C.gold, 0.1)}, transparent)`,
    borderLeft: `3px solid ${C.gold}`,
  }
  if (rank === 2) return {
    background: `linear-gradient(90deg, ${alpha('#9B97A8', 0.08)}, transparent)`,
    borderLeft: '3px solid #9B97A8',
  }
  if (rank === 3) return {
    background: `linear-gradient(90deg, ${alpha('#CD7F32', 0.08)}, transparent)`,
    borderLeft: '3px solid #CD7F32',
  }
  return { paddingLeft: 3 }
}

export function ResultsPhase({
  race, results, teams, players, playerTeamId, currentSeason, isLastRace,
  reserveStandings, onContinue, hideCards, standingsLabel, competition,
}: {
  race: Race
  results: RaceResults
  teams: Team[]
  players: Player[]
  playerTeamId: string
  currentSeason: Season
  isLastRace: boolean
  reserveStandings?: Season['secondTeamStandings']
  onContinue?: () => void
  hideCards?: boolean   // ECL等、カード報酬のないレースで前レースの獲得カードが出ないように
  standingsLabel?: string   // 順位表の見出し差し替え（ECL＝「ECL シリーズ順位」等）
  competition: Competition   // ボタン色（大会ごとに1色。COMPETITION_BTNから引く）
}) {
  const navigate = useNavigate()
  const adH = useAdHeight()
  const [view, setView] = useState<'main' | 'segments' | 'exp'>('main')
  const [segView, setSegView] = useState(0)  // 区間タイム詳細で表示中の区間index
  const segTopRef = useRef<HTMLDivElement>(null)

  // 区間タイム詳細を開いた瞬間・タブ切替時は先頭（1位）が見えるようスクロールを戻す。
  // スクロールコンテナはLayoutの<main>なのでwindowでは効かず、要素基準のscrollIntoViewで戻す。
  useEffect(() => {
    if (view === 'segments') segTopRef.current?.scrollIntoView({ block: 'start' })
  }, [view, segView])
  const raceDroppedCards = useGameStore(s => s.raceDroppedCards) ?? []
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const clubIndex = useClubIndex()
  // チーム行の長押しでチーム詳細へ（選手の長押し詳細と同じ操作系）。
  // 国別対抗(nat_)→代表ページ / JPELクラブ→チーム詳細 / 海外クラブ→所属リーグのクラブ詳細
  const teamDest = (id: string): string | null => {
    if (id.startsWith('nat_')) return `/teams/national/${id.slice(4)}`
    return clubRoutePath(clubIndex.byId(id))
  }
  const teamPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const teamLp = (id: string) => ({
    onPointerDown: () => { const d = teamDest(id); if (d) teamPressTimer.current = setTimeout(() => navigate(d), 450) },
    onPointerUp: () => { if (teamPressTimer.current) clearTimeout(teamPressTimer.current) },
    onPointerLeave: () => { if (teamPressTimer.current) clearTimeout(teamPressTimer.current) },
    onPointerMove: () => { if (teamPressTimer.current) clearTimeout(teamPressTimer.current) },
  })
  const raceExpGains = useGameStore(s => s.raceExpGains) ?? {}
  // このレースで出た区間新記録（区間×選手）。「区間新！」バッジ表示用
  const newSegRecords = useGameStore(s => s.raceNewSegmentRecords) ?? []
  const teamMap = new Map(teams.map(t => [t.id, t]))
  const playerMap = new Map(players.map(p => [p.id, p]))
  const playerResult = results.teamRankings.find(r => r.teamId === playerTeamId)
  const leader = results.teamRankings[0]
  const championTextIdx = results.teamRankings.length % 3

  // 経験値を獲得した自チームの出走選手
  const expRacers = (() => {
    if (Object.keys(raceExpGains).length === 0) return [] as Player[]
    const racerIds = results.segmentResults.flatMap(sr => sr.runners.map(r => r.playerId))
    const myRacerIds = [...new Set(racerIds)].filter(id => playerMap.get(id)?.teamId === playerTeamId)
    return myRacerIds.map(id => playerMap.get(id)).filter((p): p is Player => !!p && !!raceExpGains[p.id])
  })()
  const hasExp = expRacers.length > 0

  // 契約満了間近の選手がいれば、レース後に契約対応（通知）へ強制遷移する。
  // 中身の判定は通知ページ・チャット・ホームと同じ contractTalk の1本。
  // ここだけ別の条件で数えていたので、**通知ページには何も出ていないのに強制で飛ばされる**、
  // という空振りが起きていた（退団予定・引退の話・海外挑戦を承認した選手を外していなかった）。
  // ただし飛ばす基準は「要対応(残り6ヶ月)」より狭い残り3ヶ月（isUrgentRenewal）に戻す。
  // 1本化したときに6ヶ月へ広げてしまい、レースのたびに飛ばされるようになっていた
  const urgentRenewalExists = (() => {
    const raceIndex = currentSeason.currentRaceIndex ?? 0
    const totalRaces = currentSeason.races?.length ?? 1
    const ctx = contractTalkCtx(currentSeason, playerTeamId)
    return players.some(p =>
      isUrgentRenewal(p, contractMonthsLeft(p.contract.yearsLeft, raceIndex, totalRaces), ctx))
  })()

  const finish = async () => {
    // 契約満了間近の選手がいる場合は先に対応させる。
    // シーズン最終戦・リザーブリーグ（reserveStandings/onContinue経由）では誘導しない。
    // replace遷移にして、通知から「戻る」を押したときにレース画面（次の記録会等）ではなくホームへ戻す
    if (urgentRenewalExists && !isLastRace && !reserveStandings && !onContinue) { navigate('/notifications', { replace: true }); return }
    // 最終戦直後の広告は廃止（「次シーズン開幕へ」で1回だけ流す。2連続で広告が出るのを防ぐ）
    onContinue ? onContinue() : navigate('/')
  }

  const standingsSource = reserveStandings ?? currentSeason.standings
  const fullSorted = rankedStandings(standingsSource)
  const playerSeasonRank = fullSorted.findIndex(s => s.teamId === playerTeamId) + 1
  // 上位10行。トップ10外なら自チーム行を区切って末尾に追加
  const seasonRows: { s: typeof fullSorted[number]; rank: number; isBreak: boolean }[] =
    fullSorted.map((s, i) => ({ s, rank: i + 1, isBreak: false }))

  // 区間タイム詳細のカードは SegmentDetailCard.tsx に切り出してある（オンライン対戦と共通）
  const segmentDetailCards = results.segmentResults.map((sr, i) => (
    <SegmentDetailCard
      key={sr.segmentIndex}
      segResult={sr}
      race={race}
      teamMap={teamMap}
      playerMap={playerMap}
      myTeamId={playerTeamId}
      newSegRecords={newSegRecords}
      onPlayerTap={openPlayerSheet}
      marginBottom={i < results.segmentResults.length - 1 ? 10 : 0}
    />
  ))

  // 区間タイム詳細：別ビュー（結果画面が長いので分離）
  if (view === 'segments') {
    return (
      <div ref={segTopRef} style={{ fontFamily: SAIRA, paddingBottom: '40px', background: C.bg, minHeight: '100dvh' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.surface2, borderBottom: `1px solid ${C.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setView('main')} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: C.textSub,
            padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <div style={{ fontSize: 9, color: C.gold, letterSpacing: 2, fontWeight: 800 }}>SEGMENTS</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>区間タイム詳細</div>
          </div>
        </div>
        {/* 区間タブ（上部・横スクロール） */}
        <SegmentTabs
          labels={results.segmentResults.map(sr => `${sr.segmentIndex}区`)}
          value={segView}
          onChange={setSegView}
        />
        {/* 選択区間の全順位（1〜最下位） */}
        <div style={{ padding: '6px 12px 14px' }}>
          {segmentDetailCards[segView]}
        </div>
      </div>
    )
  }

  // 経験値獲得：最終結果のあとに表示する専用画面
  if (view === 'exp') {
    return (
      <div style={{ fontFamily: SAIRA, paddingBottom: `calc(88px + env(safe-area-inset-bottom))`, background: C.bg, minHeight: '100dvh' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.surface2, borderBottom: `1px solid ${C.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setView('main')} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: C.textSub,
            padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <div style={{ fontSize: 9, color: '#7986CB', letterSpacing: 2, fontWeight: 800 }}>EXP GAIN</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>経験値獲得</div>
          </div>
        </div>
        <div style={{ padding: '14px 12px' }}>
          <div style={{
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${alpha('#7986CB', 0.6)}`,
            borderRadius: 16, padding: '14px 16px',
            boxShadow: `0 4px 0 #0d1133, 0 6px 16px rgba(0,0,0,0.4)`,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {expRacers.map(p => {
                const gains = raceExpGains[p.id] ?? {}
                const gainedKeys = Object.keys(gains) as import('../../types').CardStatKey[]
                return (
                  <div key={p.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <FaceOrDot playerId={p.id} nationality={p.nationality} size={32} />
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{p.name}</div>
                      <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(ovr(p)) }}>{ovr(p)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {gainedKeys.map(k => {
                        const gained = gains[k] ?? 0
                        const cur = p.ratings[k] ?? 0
                        const curExp = p.exp?.[k] ?? 0
                        const req = requiredExp(cur)
                        const beforeExp = Math.max(0, curExp - gained)
                        const basePct = req > 0 ? Math.min(beforeExp / req, 1) : 1
                        const gainPct = req > 0 ? Math.min(gained / req, 1 - basePct) : 0
                        return (
                          <div key={k} style={{ minWidth: 66 }}>
                            <div style={{ fontSize: 8, color: C.textDim, marginBottom: 3 }}>{CARD_STAT_LABELS[k]}</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#7986CB', fontFamily: SAIRA }}>{cur}</span>
                              <span style={{ fontSize: 9, fontWeight: 700, color: C.green, fontFamily: SAIRA }}>+{gained}</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: alpha(C.border, 0.8), overflow: 'hidden', position: 'relative' }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${basePct * 100}%`, background: alpha(C.textSub, 0.4), borderRadius: 2 }}/>
                              <div style={{ position: 'absolute', left: `${basePct * 100}%`, top: 0, height: '100%', width: `${gainPct * 100}%`, background: '#7986CB', borderRadius: 2, boxShadow: `0 0 6px #7986CB` }}/>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{
          position: 'fixed', bottom: `calc(${adH}px + env(safe-area-inset-bottom))`, left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: '480px', padding: '8px 12px 10px',
          background: `linear-gradient(to top, ${C.bg} 72%, ${alpha(C.bg, 0)})`, zIndex: 35,
        }}>
          {isLastRace ? (
            <button className={`btn-game ${COMPETITION_BTN[competition]}`} onClick={finish} style={{ width: '100%' }}>
              <span className="btn-game__inner">
                {onContinue ? 'シーズン終了 — 戻る' : 'シーズン終了 — ホームへ'}
              </span>
            </button>
          ) : (
            <button className={`btn-game ${COMPETITION_BTN[competition]}`} onClick={finish} style={{ width: '100%' }}>
              <span className="btn-game__inner">
                {onContinue ? '次の試合へ →' : 'ホームへ戻る'}
              </span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: `calc(88px + env(safe-area-inset-bottom))` }}>

      <div style={{
        padding: '12px 16px 11px', textAlign: 'center',
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${C.goldDark}`,
        borderRadius: 12,
        position: 'relative',
        overflow: 'hidden',
        margin: '12px 12px 0',
        boxShadow: `0 3px 0 #5a3500, 0 5px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}>
        <div style={{ fontSize: '9px', color: C.gold, letterSpacing: '3px', marginBottom: '3px', textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
          RACE COMPLETE
        </div>
        <div style={{ fontSize: '17px', fontWeight: '900', color: C.text, marginBottom: '2px' }}>
          {race.name}
        </div>
        <div style={{ fontSize: '11px', color: C.textSub }}>
          優勝：{teamMap.get(leader?.teamId ?? '')?.name ?? '―'}
        </div>
      </div>

      {playerResult && (() => {
        const mySegWinCount = results.segmentResults.filter(sr => sr.runners[0]?.teamId === playerTeamId).length
        const mySegWinPlayer = mySegWinCount > 0
          ? playerMap.get(results.segmentResults.find(sr => sr.runners[0]?.teamId === playerTeamId)!.runners[0].playerId)
          : null
        const totalTeams = results.teamRankings.length
        const isBigComeback = playerResult.rank <= 3 && results.segmentResults.length >= 3 &&
          results.segmentResults.slice(0, Math.floor(results.segmentResults.length / 2))
            .some(sr => (sr.runners.find(r => r.teamId === playerTeamId)?.rank ?? 99) > Math.floor(totalTeams / 2))

        const moment: { label: string; text: string; color: string } | null =
          playerResult.rank === 1 ? {
            label: 'CHAMPION',
            text: ['圧倒的な走りで頂点に立った。', '最後まで諦めない走りが優勝をもたらした。', 'チーム一丸となった完璧なレース。'][championTextIdx],
            color: C.gold,
          }
          : isBigComeback ? {
            label: 'COMEBACK',
            text: '後半で驚異的な追い上げを見せた。チームの底力を証明した一戦。',
            color: C.cyan,
          }
          : mySegWinCount >= 2 ? {
            label: 'SEGMENT ACE',
            text: `${mySegWinPlayer?.name ?? 'チーム'}ら${mySegWinCount}区間で区間賞。個人成績は光る。`,
            color: C.green,
          }
          : playerResult.rank >= totalTeams - 1 ? {
            label: 'TOUGH DAY',
            text: '厳しい結果に終わったが、これが次への糧となる。反省と修正を重ねよう。',
            color: C.textDim,
          }
          : null

        return (
          <>
            <div style={{
              margin: '12px 12px 0',
              padding: '11px 14px',
              borderRadius: 12,
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${C.goldDark}`,
              position: 'relative', overflow: 'hidden',
              boxShadow: `0 3px 0 #5a3500, 0 5px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <div style={{ fontSize: '9px', color: C.gold, letterSpacing: '2px', marginBottom: '6px', textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
                YOUR RESULT
              </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              fontSize: '30px', fontWeight: '900', color: rankColor(playerResult.rank),
              fontFamily: SAIRA, lineHeight: 1,
              textShadow: playerResult.rank === 1 ? `0 0 10px ${alpha(C.gold, 0.5)}` : 'none',
            }}>
              {playerResult.rank}
            </div>
            <div style={{ fontSize: '9px', color: C.textSub, marginTop: '3px' }}>位</div>
            <div style={{ flex: 1, marginLeft: '6px' }}>
              <div style={{ fontSize: '10px', color: C.textDim }}>獲得リーグポイント</div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: C.gold, fontFamily: SAIRA, textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
                +{playerResult.positionPoints + playerResult.segmentPoints}pt
              </div>
              <div style={{ fontSize: '9px', color: C.textDim }}>
                順位 {playerResult.positionPoints} ／ 区間賞 {playerResult.segmentPoints}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: C.textDim }}>タイム</div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: C.text, fontFamily: SAIRA }}>
                {formatRaceTime(playerResult.totalTimeSec)}
              </div>
              {leader && playerResult.rank > 1 && (
                <div style={{ fontSize: '10px', color: C.textDim }}>
                  {formatDiff(playerResult.totalTimeSec - leader.totalTimeSec)}
                </div>
              )}
            </div>
          </div>
        </div>

            {moment && (
              <div style={{
                margin: '10px 12px 16px',
                padding: '12px 16px',
                borderRadius: 12,
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${alpha(moment.color, 0.45)}`,
                boxShadow: `0 4px 0 rgba(0,0,0,0.4), 0 0 20px ${alpha(moment.color, 0.12)}`,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(moment.color, 0.15)}`, borderRadius: 8, pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: moment.color, letterSpacing: '3px', marginBottom: '5px', textShadow: `0 0 10px ${alpha(moment.color, 0.5)}` }}>
                    {moment.label}
                  </div>
                  <div style={{ fontSize: '12px', color: C.textSub, lineHeight: 1.5 }}>
                    {moment.text}
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}

      <div style={{ padding: '0 12px', marginTop: '16px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px' }}>最終順位</div>
          <div style={{ display: 'flex', gap: '10px', fontSize: '9px', fontFamily: SAIRA }}>
            <span style={{ color: C.gold }}>● 順位</span>
            <span style={{ color: C.cyan }}>● 区間賞</span>
          </div>
        </div>
        <div style={{ borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border2}`, background: C.border }}>
          {results.teamRankings.map((tr, i) => {
            const t = teamMap.get(tr.teamId)
            const isPlayer = tr.teamId === playerTeamId
            const rowStyle = RANK_ROW_STYLE(tr.rank, isPlayer)
            return (
              <div key={tr.teamId} {...teamLp(tr.teamId)} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 12px',
                borderBottom: i < results.teamRankings.length - 1 ? `1px solid ${C.surface2}` : 'none',
                ...rowStyle,
              }}>
                <div style={{ width: '20px', textAlign: 'center', flexShrink: 0, fontSize: '12px', fontWeight: '800', fontFamily: SAIRA, color: rankColor(tr.rank), textShadow: tr.rank === 1 ? `0 0 10px ${alpha(C.gold, 0.5)}` : 'none' }}>
                  {tr.rank}
                </div>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={18} />}
                <div style={{ flex: 1, minWidth: 0, fontSize: '12px', color: isPlayer ? C.text : C.textSub, fontWeight: isPlayer ? '700' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t?.name ?? tr.teamId}
                </div>
                <div style={{ fontSize: '12px', color: C.textSub, fontFamily: SAIRA, minWidth: '50px', textAlign: 'right', flexShrink: 0 }}>
                  {formatRaceTime(tr.totalTimeSec)}
                </div>
                <div style={{ flexShrink: 0, minWidth: 66, textAlign: 'right', fontFamily: SAIRA, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.gold }}>{tr.positionPoints}</span>
                  <span style={{ fontSize: 9, color: C.textGhost, margin: '0 1px' }}>/</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.cyan }}>{tr.segmentPoints}</span>
                  <span style={{ fontSize: 9, color: C.textGhost, margin: '0 2px' }}>=</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: C.text }}>{tr.positionPoints + tr.segmentPoints}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '0 12px', marginBottom: '20px' }}>
        <button onClick={() => setView('segments')} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 16px', borderRadius: 14, cursor: 'pointer',
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${C.border2}`,
          boxShadow: '0 4px 0 rgba(0,0,0,0.4), 0 6px 16px rgba(0,0,0,0.3)',
          fontFamily: 'inherit',
        }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h10" stroke={C.bg} strokeWidth="2.4" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>区間タイム詳細</div>
            <div style={{ fontSize: 10, color: C.textDim }}>全{results.segmentResults.length}区間のタイム・順位を見る</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: C.textSub, flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {(() => {
        const segWins = results.segmentResults
          .filter(sr => sr.runners[0]?.teamId === playerTeamId)
          .map(sr => {
            const w = sr.runners[0]
            const margin = sr.runners[1] ? sr.runners[1].timeSec - w.timeSec : 0
            return { ...w, segmentIndex: sr.segmentIndex, margin }
          })
        if (segWins.length === 0) return null
        return (
          <div style={{ margin: '14px 12px 0' }}>
            <div style={{
              padding: '8px 12px', borderRadius: 10,
              background: alpha(C.gold, 0.08), border: `1px solid ${alpha(C.gold, 0.3)}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 10, color: C.textDim, letterSpacing: 1 }}>区間賞</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: C.gold, fontFamily: SAIRA, textShadow: `0 0 8px ${alpha(C.gold, 0.5)}` }}>{segWins.length}</span>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {segWins.map(w => (
                  <span key={w.segmentIndex} style={{ fontSize: 9, fontWeight: 700, color: C.gold, fontFamily: SAIRA, padding: '1px 5px', borderRadius: 4, background: alpha(C.gold, 0.12) }}>{w.segmentIndex}区</span>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      <div style={{ padding: '0 12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px' }}>
            {standingsLabel ?? (reserveStandings ? 'リザーブ順位（暫定）' : 'シーズン順位（暫定）')}
          </span>
          {!reserveStandings && playerSeasonRank > 0 && (
            <span style={{ fontSize: '10px', color: C.textDim }}>
              自チーム
              <span style={{ fontSize: '14px', fontWeight: '900', color: playerSeasonRank === 1 ? C.gold : playerSeasonRank <= 3 ? C.green : C.textSub, fontFamily: SAIRA, margin: '0 3px', textShadow: playerSeasonRank <= 3 ? `0 0 8px ${alpha(C.gold, 0.4)}` : 'none' }}>{playerSeasonRank}</span>
              位 / {fullSorted.length}
            </span>
          )}
        </div>
        {/* 順位表はJPEL順位表と同じ共通コンポーネント（見た目を全画面で統一） */}
        <div style={{ margin: '0 -12px' }}>
          <StandingsTable rows={seasonRows.map(({ s }) => {
            const t = teamMap.get(s.teamId)
            return {
              id: s.teamId, name: t?.name ?? s.teamId, shortName: t?.shortName ?? '?',
              primary: t?.colors.primary ?? C.blue, secondary: t?.colors.secondary ?? '#777', teamId: t?.id,
              points: s.totalPoints,
              recentForm: (s.raceResults ?? []).map(r => r.rank),
              isMe: s.teamId === playerTeamId,
            }
          })} onRowLongPress={id => { const d = teamDest(id); if (d) navigate(d) }} />
        </div>
      </div>

      {!hideCards && raceDroppedCards.length > 0 && (
        <div style={{ margin: '14px 12px 0' }}>
          <div style={{
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${C.green}`,
            borderRadius: 16, padding: '14px 16px',
            position: 'relative', overflow: 'hidden',
            boxShadow: `0 4px 0 #0d3d22, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}>
            <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.green, 0.15)}`, borderRadius: 12, pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: C.green, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 10px ${alpha(C.green, 0.5)}` }}>CARD DROP</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2 }}>
                  {raceDroppedCards.length}枚のカードを獲得
                </div>
              </div>
              <button
                onClick={() => navigate('/cards')}
                style={{
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `2px solid ${C.green}`,
                  borderRadius: 11, color: C.green,
                  fontSize: 11, fontWeight: 700,
                  padding: '11px 18px', cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 0 #0d3d22, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                  position: 'relative', overflow: 'hidden',
                  marginBottom: 8,
                }}
              >
                <span style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '35%', background: 'linear-gradient(180deg,rgba(255,255,255,0.1),transparent)', borderRadius: '5px 5px 50% 50%', pointerEvents: 'none' }} />
                練習する
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {raceDroppedCards.map(card => (
                <div key={card.id} style={{
                  flexShrink: 0,
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `1.5px solid ${RARITY_COLORS[card.rarity]}`,
                  borderRadius: 10, padding: '8px 10px',
                  textAlign: 'center', minWidth: 68,
                }}>
                  <div style={{ fontSize: 8, color: RARITY_COLORS[card.rarity], fontWeight: 700, marginBottom: 4 }}>
                    {RARITY_LABELS[card.rarity]}
                  </div>
                  <div style={{ fontSize: 10, color: C.textSub, marginBottom: 4 }}>
                    {card.kind === 'rest' ? REST_CARD_NAME : CARD_NAMES[card.statKey]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{
        position: 'fixed', bottom: `calc(${adH}px + env(safe-area-inset-bottom))`, left: 0, right: 0, margin: '0 auto',
        width: '100%', maxWidth: '480px', padding: '8px 12px 10px',
        background: `linear-gradient(to top, ${C.bg} 72%, ${alpha(C.bg, 0)})`, zIndex: 35,
      }}>
        {hasExp ? (
          <button className={`btn-game ${COMPETITION_BTN[competition]}`} onClick={() => setView('exp')} style={{ width: '100%' }}>
            <span className="btn-game__inner">経験値を確認 →</span>
          </button>
        ) : isLastRace ? (
          <button className={`btn-game ${COMPETITION_BTN[competition]}`} onClick={finish} style={{ width: '100%' }}>
            <span className="btn-game__inner">
              {onContinue ? 'シーズン終了 — 戻る' : 'シーズン終了 — ホームへ'}
            </span>
          </button>
        ) : (
          <button className={`btn-game ${COMPETITION_BTN[competition]}`} onClick={finish} style={{ width: '100%' }}>
            <span className="btn-game__inner">
              {onContinue ? '次の試合へ →' : 'ホームへ戻る'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
