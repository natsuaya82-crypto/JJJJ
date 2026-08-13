import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { clubRoutePath } from '../../utils/clubs'
import { LeagueLogoSVG } from '../icons/Icons'
import PageHeader from '../ui/PageHeader'
import PillTabs from '../ui/PillTabs'
import StandingsTable, { type StandRow } from './StandingsTable'
import { C, FONT } from '../../styles/tokens'
import { rankedStandings, divisionStandings, DIVISIONS, DIVISION_LABEL, divisionOf, PROMOTION_SLOTS } from '../../utils/league'
import type { Division } from '../../types'


// 順位表のページ。
//
// もとは JpelStandingsPage.tsx と EclStandingsPage.tsx が、ヘッダーも自チーム順位の出し方も
// ほぼ同じ中身で2本あった。表そのものは StandingsTable の1本なので、リーグごとに違うのは
// 「行の作り方」だけ。ここで行の作り方だけを出し分けて、見た目と枠組みは1本にする。
//
// ★横並びの切り替えを置くのは JPEL の 1部・2部・3部だけ。
// 同じJPELの中を行き来するのは頻繁なのでページ内で切り替える。ECLは別のリーグなので
// ここには混ぜず、チームタブのハブから入る（前は JPEL/リザーブ/ECL を1列に並べていた）。
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
  // 部の切り替えはページ内で持つ（URLを書き換えるとページごと切り替わる扱いになり、
  // 毎回ページの出現アニメが走る）。ECLで開いたときは切り替えを出さない
  const isEcl = league === 'ecl'
  const [division, setDivision] = useState<Division>(divisionOfLeague(league) ?? myDivision)
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

  // リーグごとに違うのは「行・空のときの文言」だけ
  // 昇格・降格の枠（utils/league の PROMOTION_SLOTS）。1部に上は無く、3部に下は無い
  const view: { eyebrow: string; title: string; logoId: string; rows: StandRow[]; onRowClick: (id: string) => void; empty?: string; promote?: number; relegate?: number } = (() => {
    if (isEcl) {
      const series = currentSeason.eclSeries
      if (!series) return {
        eyebrow: `${currentSeason.year} ECL`, title: 'ECL 順位表', logoId: 'ecl',
        rows: [], onRowClick: goClub,
        // ECLは毎年開催。出場チームを前年の順位で決めるので、1年目だけ前年成績が無くて開催できない。
        // 前は「今シーズンのECLは開催されません」だけで、毎年やらない大会に読めた
        empty: 'ECLは前年の各リーグ上位2チームで争います。1年目は前年の成績が無いため開催されません（2年目から毎年開催）。',
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
        onRowClick: goClub,
      }
    }
    // 部の順位表。順位表は全52チームぶんを1本で持っているので、所属の部だけに絞る（utils/league）
    const div = division
    return {
      eyebrow: `${currentSeason.year} JPEL ${DIVISION_LABEL[div]}`, title: `${DIVISION_LABEL[div]} 順位表`, logoId: 'jpel',
      rows: domesticRows(divisionStandings(currentSeason, div)),
      onRowClick: goDomestic,
      promote: div === 1 ? 0 : PROMOTION_SLOTS,
      relegate: div === DIVISIONS[DIVISIONS.length - 1] ? 0 : PROMOTION_SLOTS,
    }
  })()

  return (
    <div style={{ fontFamily: FONT, paddingBottom: '80px', minHeight: '100dvh' }}>
      <PageHeader
        icon={<LeagueLogoSVG leagueId={view.logoId} size={36} />}
        eyebrow={view.eyebrow}
        title={view.title}
      />
      <div style={{ padding: '0 12px 10px' }}>
        {/* JPELの中の部の切り替え（1部・2部・3部）。ECLは別リーグなので混ぜない */}
        {!isEcl && (
          <PillTabs
            labels={DIVISIONS.map(d => DIVISION_LABEL[d])}
            value={DIVISIONS.indexOf(division)}
            onChange={i => setDivision(DIVISIONS[i])}
            fill
            style={{ marginTop: 10 }}
          />
        )}
      </div>

      {view.empty
        ? <div style={{ padding: '50px 24px', textAlign: 'center', fontSize: 13, color: C.textDim, lineHeight: 1.8 }}>{view.empty}</div>
        : <>
            <StandingsTable rows={view.rows} onRowClick={view.onRowClick} promote={view.promote} relegate={view.relegate} />
            {(view.promote || view.relegate) ? (
              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', padding: '10px 12px 0', fontSize: 10, color: C.textDim }}>
                {view.promote ? <span><span style={{ color: C.green, fontWeight: 900 }}>■</span> 昇格（上位{view.promote}）</span> : null}
                {view.relegate ? <span><span style={{ color: C.red, fontWeight: 900 }}>■</span> 降格（下位{view.relegate}）</span> : null}
              </div>
            ) : null}
          </>}
    </div>
  )
}
