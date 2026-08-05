import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { clubRoutePath } from '../../utils/clubs'
import { LeagueLogoSVG } from '../icons/Icons'
import BackButton from '../ui/BackButton'
import StandingsTable, { type StandRow } from './StandingsTable'
import { C, alpha } from '../../styles/tokens'
import { rankedStandings } from '../../utils/league'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 順位表のページ。JPEL／リザーブ／ECL をタブで切り替える。
//
// もとは JpelStandingsPage.tsx と EclStandingsPage.tsx が、ヘッダーも自チーム順位の出し方も
// ほぼ同じ中身で2本あり、リザーブの年間順位はどこからも見られなかった。
// 表そのものは StandingsTable の1本なので、リーグごとに違うのは「行の作り方」だけ。
// ここで行の作り方だけを出し分けて、見た目と枠組みは1本にする。
export type StandingsLeague = 'jpel' | 'ecl'

const TABS: { key: StandingsLeague; label: string }[] = [
  { key: 'jpel', label: 'JPEL' },
  { key: 'ecl', label: 'ECL' },
]

export default function StandingsPage() {
  const navigate = useNavigate()
  const { league } = useParams<{ league: string }>()
  // URLはどのリーグから入ったかだけ。タブの切り替えはこの中で持つ
  // （URLを書き換えるとページごと切り替わる扱いになり、毎回ページの出現アニメが走る）
  const [tab, setTab] = useState<StandingsLeague>(league === 'ecl' ? league : 'jpel')
  const { teams, currentSeason, playerTeamId } = useGameStore()
  const clubIndex = useClubIndex()

  // 国内チームは詳細ページへ。ECLは海外クラブが混ざるので clubRoutePath で出し分ける
  const goDomestic = (id: string) => navigate(`/teams/detail/${id}`)
  const goClub = (id: string) => {
    const path = clubRoutePath(clubIndex.byId(id))
    if (path) navigate(path)
  }

  const domesticRows = (
    standings: { teamId: string; totalPoints: number; raceResults: { rank: number }[] }[],
  ): StandRow[] =>
    rankedStandings(standings).map(s => {
      const team = teams.find(t => t.id === s.teamId)
      return {
        id: s.teamId, name: team?.name ?? '?', shortName: team?.shortName ?? '?',
        primary: team?.colors.primary ?? C.blue, secondary: team?.colors.secondary ?? '#777', teamId: team?.id,
        points: s.totalPoints, recentForm: (s.raceResults ?? []).map(r => r.rank),
        isMe: s.teamId === playerTeamId,
      }
    })

  // タブごとに違うのは「行・消化数・空のときの文言」だけ
  const view: { eyebrow: string; title: string; logoId: string; rows: StandRow[]; progress: string; onRowClick: (id: string) => void; empty?: string } = (() => {
    if (tab === 'ecl') {
      const series = currentSeason.eclSeries
      if (!series) return {
        eyebrow: `${currentSeason.year} ECL`, title: 'ECL 順位表', logoId: 'ecl',
        rows: [], progress: '—', onRowClick: goClub,
        empty: '今シーズンのECLは開催されません。前年の各リーグ上位2チームに出場権が与えられます。',
      }
      const sorted = series.participants
        .map(pt => ({ ...pt, points: series.points[pt.id] ?? 0 }))
        .sort((a, b) => b.points - a.points)
      return {
        eyebrow: `${currentSeason.year} ECL`, title: 'ECL 順位表', logoId: 'ecl',
        rows: sorted.map(s => ({
          id: s.id, name: s.name, shortName: s.shortName,
          primary: s.colors.primary, secondary: s.colors.secondary, teamId: s.id,
          points: s.points,
          recentForm: series.races.filter(r => r.results).map(r => r.results!.teamRankings.find(tr => tr.teamId === s.id)?.rank ?? 99),
          isMe: s.isPlayerTeam,
        })),
        progress: `${series.raceIndex}/${series.races.length}戦`,
        onRowClick: goClub,
      }
    }
    return {
      eyebrow: `${currentSeason.year} LEAGUE`, title: 'JPEL 順位表', logoId: 'jpel',
      rows: domesticRows(currentSeason.standings),
      progress: `${currentSeason.races.filter(r => r.results).length}戦`,
      onRowClick: goDomestic,
    }
  })()

  const myRank = view.rows.findIndex(r => r.isMe) + 1
  const myRankColor = myRank === 1 ? C.gold : myRank > 0 && myRank <= 3 ? C.green : myRank > 0 && myRank <= 6 ? C.textSub : C.textDim

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '10px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <BackButton />
          <LeagueLogoSVG leagueId={view.logoId} size={36} />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900' }}>{view.eyebrow}</div>
            <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: C.text, lineHeight: 1 }}>{view.title}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            {myRank > 0 && (
              <div style={{ padding: '4px 10px', borderRadius: '20px', background: alpha(myRankColor, 0.12), border: `1px solid ${alpha(myRankColor, 0.28)}`, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '9px', color: C.textDim }}>自チーム</span>
                <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: myRankColor }}>{myRank}</span>
                <span style={{ fontSize: '9px', color: C.textDim }}>位</span>
              </div>
            )}
            <div style={{ padding: '4px 10px', borderRadius: '20px', background: C.surface2, border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: C.textDim }}>消化</span>
              <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '700', color: C.textSub }}>{view.progress}</span>
            </div>
          </div>
        </div>

        {/* リーグ切り替え */}
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(t => {
            const on = t.key === tab
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800,
                  background: on ? alpha(C.gold, 0.14) : C.surface2,
                  border: `1.5px solid ${on ? alpha(C.gold, 0.5) : C.border2}`,
                  color: on ? C.gold : C.textDim }}>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {view.empty
        ? <div style={{ padding: '50px 24px', textAlign: 'center', fontSize: 13, color: C.textDim, lineHeight: 1.8 }}>{view.empty}</div>
        : <StandingsTable rows={view.rows} onRowClick={view.onRowClick} />}
    </div>
  )
}
