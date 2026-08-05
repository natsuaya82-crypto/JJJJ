import { useState } from 'react'
import { useParams } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { getMatchDetail } from '../../lib/roomsApi'
import type { MatchDetail } from '../../lib/matchSim'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from '../friends/friendsUi'
import { courseById } from '../../data/matchCourses'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 対戦履歴の詳細。誰が何区を何秒で走ったか。
// 一覧（MatchHistoryPage）は match_results だけを読み、この画面に来たときだけ
// match_details を読む。詳細は1試合で数十KBあるので一覧のクエリに混ぜない。

/** 秒 → 「1:23:45」または「23:45.6」 */
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const p = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${h}:${p(m)}:${p(Math.floor(s))}`
  return `${m}:${p(Math.floor(s))}.${Math.round((s % 1) * 10)}`
}

function rankColor(rank: number): string {
  if (rank === 1) return C.gold
  if (rank <= 3) return C.textSub
  return C.textDim
}

function RaceBlock({ d, raceIdx }: { d: MatchDetail; raceIdx: number }) {
  const race = d.r[raceIdx]
  const [open, setOpen] = useState(raceIdx === 0)
  const course = courseById(race.c)
  const teamName = (i: number) => d.t[i]?.s ?? '—'

  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden', marginBottom: 8,
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      border: `1px solid ${C.border2}`,
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', border: 'none', cursor: 'pointer',
          background: 'transparent', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{
          fontFamily: SAIRA, fontSize: 10, fontWeight: 900, color: C.cyan,
          padding: '2px 7px', borderRadius: 6, background: alpha(C.cyan, 0.12), flexShrink: 0,
        }}>
          RACE {raceIdx + 1}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {course?.name ?? race.c}
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{
          flexShrink: 0, color: C.textDim, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s',
        }}>
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding: '0 10px 10px' }}>
          {/* 総合順位 */}
          <div style={{ marginBottom: 8 }}>
            {[...race.s].sort((a, b) => a[1] - b[1]).map(([ti, rank, total]) => (
              <div key={ti} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                borderBottom: `1px solid ${alpha(C.border, 0.6)}`,
              }}>
                <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: rankColor(rank), width: 18, textAlign: 'right' }}>{rank}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.t[ti]?.n ?? '—'}
                </span>
                <span style={{ fontFamily: SAIRA, fontSize: 12, color: C.textDim }}>{fmtTime(total)}</span>
              </div>
            ))}
          </div>

          {/* 区間ごと */}
          {race.g.map((seg, si) => (
            <div key={si} style={{ marginBottom: 6 }}>
              <div style={{
                fontFamily: SAIRA, fontSize: 10, fontWeight: 900, color: C.gold,
                letterSpacing: '1px', padding: '4px 8px 2px',
              }}>
                第{si + 1}区
              </div>
              {[...seg].sort((a, b) => a[3] - b[3]).map(([ti, name, time, rank], i) => (
                <div key={`${ti}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px',
                  background: rank === 1 ? alpha(C.gold, 0.06) : 'transparent', borderRadius: 6,
                }}>
                  <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 800, color: rankColor(rank), width: 16, textAlign: 'right' }}>{rank}</span>
                  <span style={{ fontSize: 11, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </span>
                  <span style={{ fontSize: 10, color: C.textGhost, flexShrink: 0, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {teamName(ti)}
                  </span>
                  <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, flexShrink: 0 }}>{fmtTime(time)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const q = useFriendsQuery(
    () => (matchId ? getMatchDetail(matchId) : Promise.resolve(undefined)),
    [matchId], `matchDetail:${matchId}`,
  )
  const d = q.data

  return (
    <div style={{
      fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif",
      paddingBottom: 80, background: C.bg, minHeight: '100dvh',
    }}>
      <div style={{ padding: '10px 12px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <BackButton />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.cyan, letterSpacing: '3px', fontWeight: 900 }}>RACE DETAIL</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1 }}>レース内容</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 12px' }}>
        {q.loading && <LoadingBox />}
        {q.error && <ErrorBox onRetry={q.reload} />}
        {/* 詳細を残す前の試合と、保存に失敗した試合はここに来る。順位は一覧に残っている */}
        {!q.loading && !q.error && !d && (
          <EmptyBox label="この対戦のレース内容は残っていません" />
        )}
        {d?.r.map((_, i) => <RaceBlock key={i} d={d} raceIdx={i} />)}
      </div>
    </div>
  )
}
