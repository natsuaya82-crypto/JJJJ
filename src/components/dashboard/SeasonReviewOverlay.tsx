import { useGameStore } from '../../store/gameStore'
import { computeSeasonAwards } from '../../utils/awards'
import { ovr } from '../../utils/playerUtils'
import { formatTime } from '../../engine/raceEngine'
import { TeamLogoSVG } from '../icons/Icons'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import BackButton from '../ui/BackButton'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// シーズン終了後（endSeasonを押す前）に今季を振り返る全画面オーバーレイ。
// この時点では currentSeason にレース結果・ニュースが全部残っているので、そこから直接組み立てる
export default function SeasonReviewOverlay({ onClose, onNextSeason }: {
  onClose: () => void
  onNextSeason: () => void
}) {
  const { currentSeason, teams, players, playerTeamId } = useGameStore()
  const transferHistory = useGameStore(s => s.transferHistory ?? [])
  const longPress = usePlayerLongPress()
  const year = currentSeason.year

  const award = computeSeasonAwards(currentSeason.races, players, year)
  const mvpP = award.mvpId ? players.find(p => p.id === award.mvpId) : undefined
  const rookieP = award.rookieId ? players.find(p => p.id === award.rookieId) : undefined

  const teamOf = (id: string) => teams.find(t => t.id === id)

  // 全駅伝: 優勝チーム・優勝タイム・自チーム順位
  const raceRows = currentSeason.races.filter(r => r.results).map(r => {
    const rankings = r.results!.teamRankings
    const winner = rankings.find(x => x.rank === 1)
    const mine = rankings.find(x => x.teamId === playerTeamId)
    return { race: r, winner, mine }
  })

  // ニュースから拾う: 区間新記録・日本/世界新記録
  const news = currentSeason.newsFeed ?? []
  const segRecordNews = news.filter(n => n.headline.startsWith('【区間新記録】'))
  const timeRecordNews = news.filter(n => n.headline.startsWith('【日本新記録】') || n.headline.startsWith('【世界新記録】'))

  // 大型移籍: 今季の移籍成立記録のうち OVR80以上の選手（レンタル除外済みデータ）
  const bigMoves = transferHistory
    .filter(t => t.year === year)
    .map(t => ({ t, p: players.find(p => p.id === t.playerId) }))
    .filter((x): x is { t: typeof x.t; p: NonNullable<typeof x.p> } => !!x.p && ovr(x.p) >= 80)
    .slice(0, 10)

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '2px', fontWeight: 900, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
  const Card = ({ children }: { children: React.ReactNode }) => (
    <div style={{ background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${alpha(C.gold, 0.18)}`, borderRadius: 14, padding: '12px 14px' }}>
      {children}
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: C.bg, overflowY: 'auto', fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '12px 14px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <BackButton onClick={onClose}/>
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900 }}>SEASON REVIEW</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>{year}シーズンの振り返り</div>
          </div>
        </div>

        {/* 表彰 */}
        <Section label="AWARDS">
          <div style={{ display: 'flex', gap: 8 }}>
            {mvpP && (
              <div {...longPress(mvpP.id)} style={{ flex: 1, padding: 12, borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${alpha(C.gold, 0.5)}`, cursor: 'pointer' }}>
                <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.gold, letterSpacing: '2px', marginBottom: 6 }}>MVP</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PlayerFace playerId={mvpP.id} nationality={mvpP.nationality} size={36}/>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mvpP.name}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{teamOf(mvpP.teamId)?.shortName ?? ''}</div>
                  </div>
                </div>
              </div>
            )}
            {rookieP && (
              <div {...longPress(rookieP.id)} style={{ flex: 1, padding: 12, borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${alpha('#4FC3F7', 0.5)}`, cursor: 'pointer' }}>
                <div style={{ fontFamily: SAIRA, fontSize: 9, color: '#4FC3F7', letterSpacing: '2px', marginBottom: 6 }}>新人王</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PlayerFace playerId={rookieP.id} nationality={rookieP.nationality} size={36}/>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rookieP.name}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{teamOf(rookieP.teamId)?.shortName ?? ''}</div>
                  </div>
                </div>
              </div>
            )}
            {!mvpP && !rookieP && <Card><div style={{ fontSize: 12, color: C.textDim }}>該当者なし</div></Card>}
          </div>
        </Section>

        {/* 全駅伝の結果 */}
        <Section label="全駅伝の結果">
          <Card>
            {raceRows.map(({ race, winner, mine }, i) => {
              const wTeam = winner ? teamOf(winner.teamId) : undefined
              const myRankCol = mine?.rank === 1 ? C.gold : (mine?.rank ?? 99) <= 3 ? C.green : C.textSub
              return (
                <div key={race.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < raceRows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{race.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      {wTeam && <TeamLogoSVG primary={wTeam.colors.primary} secondary={wTeam.colors.secondary} shortName={wTeam.shortName} teamId={wTeam.id} size={13}/>}
                      <span style={{ fontSize: 10, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>優勝 {wTeam?.name ?? '—'}</span>
                      {winner && <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.textDim, flexShrink: 0 }}>{formatTime(winner.totalTimeSec)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: myRankCol }}>{mine?.rank ?? '—'}</span>
                    <span style={{ fontSize: 9, color: C.textDim }}>位</span>
                  </div>
                </div>
              )
            })}
          </Card>
        </Section>

        {/* 記録更新（日本新・世界新） */}
        {timeRecordNews.length > 0 && (
          <Section label="記録更新">
            <Card>
              {timeRecordNews.map((n, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: i < timeRecordNews.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: 12, color: n.headline.startsWith('【世界新記録】') ? '#FF5C8A' : C.gold, fontWeight: 700 }}>
                  {n.headline}
                </div>
              ))}
            </Card>
          </Section>
        )}

        {/* 区間新記録 */}
        {segRecordNews.length > 0 && (
          <Section label="区間新記録">
            <Card>
              {segRecordNews.map((n, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: i < segRecordNews.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: 11, color: C.textSub }}>
                  {n.headline.replace('【区間新記録】', '')}
                </div>
              ))}
            </Card>
          </Section>
        )}

        {/* 大型移籍（OVR80以上） */}
        {bigMoves.length > 0 && (
          <Section label="大型移籍">
            <Card>
              {bigMoves.map(({ t, p }, i) => {
                const from = teamOf(t.fromTeamId)
                const to = teamOf(t.toTeamId)
                return (
                  <div key={`${t.playerId}-${i}`} {...longPress(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < bigMoves.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
                    <PlayerFace playerId={p.id} nationality={p.nationality} size={28}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name} <span style={{ fontFamily: SAIRA, color: C.gold }}>OVR{ovr(p)}</span></div>
                      <div style={{ fontSize: 10, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {from?.shortName ?? '—'} → {to?.shortName ?? '—'}{t.fee > 0 ? `（${t.fee >= 100000000 ? `${(t.fee / 100000000).toFixed(1)}億` : `${Math.round(t.fee / 10000)}万`}）` : t.kind === 'trade' ? '（トレード）' : '（フリー）'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </Card>
          </Section>
        )}

        <button className="btn-game btn-game--gold" onClick={onNextSeason} style={{ width: '100%', marginTop: 8 }}>
          <span className="btn-game__inner">{year + 1}シーズン開幕へ →</span>
        </button>
      </div>
    </div>
  )
}
