import { useNavigate, useParams } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { clubRoutePath } from '../../utils/clubs'
import { LeagueLogoSVG } from '../icons/Icons'
import BackButton from '../ui/BackButton'
import StandingsTable, { type StandRow } from './StandingsTable'
import { C, alpha } from '../../styles/tokens'
import { rankedStandings, DIVISIONS, DIVISION_LABEL, divisionOf } from '../../utils/league'
import type { Division } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 順位表のページ。どのリーグを出すかはURL（/standings/:league）だけで決まる。
//
// もとは JpelStandingsPage.tsx と EclStandingsPage.tsx が、ヘッダーも自チーム順位の出し方も
// ほぼ同じ中身で2本あった。表そのものは StandingsTable の1本なので、リーグごとに違うのは
// 「行の作り方」だけ。ここで行の作り方だけを出し分けて、見た目と枠組みは1本にする。
//
// ★ページの上にリーグ切り替えのタブを置かないこと。
// リーグを選ぶ入口はチームタブのハブ（TeamsHub の「リーグ」）1つに決めてある。
// ページにもタブを付けると、同じ選択が2箇所にできて「今どこから来たのか」が分からなくなる。
export type StandingsLeague = 'd1' | 'd2' | 'd3' | 'ecl'

/** URLのリーグ指定 → 部。ECL・未指定なら undefined */
const divisionOfLeague = (league: string | undefined): Division | undefined => {
  const d = Number((league ?? '').slice(1))
  return league?.startsWith('d') && DIVISIONS.includes(d as Division) ? (d as Division) : undefined
}

export default function StandingsPage() {
  const navigate = useNavigate()
  const { league } = useParams<{ league: string }>()
  const { teams, currentSeason, playerTeamId } = useGameStore()
  // 部の指定が無いとき（ホームのFULL→）は自チームのいる部。いちばん見たいのは自分の部なので
  const myDivision = divisionOf(teams.find(t => t.id === playerTeamId))
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

  // リーグごとに違うのは「行・消化数・空のときの文言」だけ
  const view: { eyebrow: string; title: string; logoId: string; rows: StandRow[]; progress: string; onRowClick: (id: string) => void; empty?: string } = (() => {
    if (league === 'ecl') {
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
    // 部の順位表。順位表は全52チームぶんを1本で持っているので、ここで所属の部だけに絞る
    const div = divisionOfLeague(league) ?? myDivision
    const idsInDiv = new Set(teams.filter(t => divisionOf(t) === div).map(t => t.id))
    return {
      eyebrow: `${currentSeason.year} JPEL ${DIVISION_LABEL[div]}`, title: `${DIVISION_LABEL[div]} 順位表`, logoId: 'jpel',
      rows: domesticRows(currentSeason.standings.filter(s => idsInDiv.has(s.teamId))),
      progress: `${currentSeason.races.filter(r => r.results).length}戦`,
      onRowClick: goDomestic,
    }
  })()

  const myRank = view.rows.findIndex(r => r.isMe) + 1
  const myRankColor = myRank === 1 ? C.gold : myRank > 0 && myRank <= 3 ? C.green : myRank > 0 && myRank <= 6 ? C.textSub : C.textDim

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '10px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
      </div>

      {view.empty
        ? <div style={{ padding: '50px 24px', textAlign: 'center', fontSize: 13, color: C.textDim, lineHeight: 1.8 }}>{view.empty}</div>
        : <StandingsTable rows={view.rows} onRowClick={view.onRowClick} />}
    </div>
  )
}
