import { useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { myMatchHistory, myMatchStats, type MatchHistoryItem } from '../../lib/roomsApi'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from '../friends/friendsUi'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha, SAIRA, FONT, F } from '../../styles/tokens'


// オンライン対戦の履歴。
// 記録は finish_match() が matches / match_results に残しているものをそのまま読む。
// これまで書き込みだけがあって見る画面が無く、溜まった記録が誰にも見えていなかった。

/**
 * 「08/04 21:30」の形。サーバーはUTCで返すので端末の時刻に直す。
 * 記録は60日で消えるので年は基本いつも今年になる。GM名と1行に並べると
 * 年まで出すと日時が見切れるため、年をまたいだものだけ年を付ける。
 */
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  const md = `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}/${md}`
}

function MatchCard({ m, onOpen }: { m: MatchHistoryItem; onOpen: () => void }) {
  // 一覧では順位も参加者も出さない。「いつ・誰の部屋で・何人で・何レース」だけ分かればよく、
  // 中身は開いた先（FinishPanel）で見る。カードを短く保って一覧を見渡しやすくする狙い。
  //
  // 誰の部屋かはチーム名だけだと分からない（チーム名は自由に付けられて重複もする）。
  // 人を指すのはGM名なので必ずセットで出す。
  const hostName = m.hostIsMe ? '自分' : (m.host?.teamName ?? '—')
  const hostGm = m.hostIsMe ? '' : (m.host?.gmName ?? '—')
  return (
    <div
      role="button" tabIndex={0} className="pressable"
      onClick={onOpen}
      onKeyDown={e => e.key === 'Enter' && onOpen()}
      style={{
        cursor: 'pointer',marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `1px solid ${C.border2}`,
      }}
    >
      {m.host ? (
        <TeamLogoSVG
          primary={m.host.primary} secondary={m.host.secondary}
          shortName={m.host.shortName} logoId={m.host.logoId} size={30}
        />
      ) : (
        <div style={{ width: 30, height: 30,background: C.surface3, flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: F.body, color: C.text, fontWeight: 700,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {hostName}<span style={{ fontSize: F.caption, color: C.textGhost, fontWeight: 400, marginLeft: 4 }}>の部屋</span>
        </div>
        <div style={{
          fontSize: F.caption, color: C.textDim, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {hostGm && <span style={{ color: C.textSub, marginRight: 6 }}>GM {hostGm}</span>}
          {fmtDate(m.finishedAt)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <span style={{
          fontFamily: SAIRA, fontSize: F.label, fontWeight: 800, color: C.textSub,
          padding: '3px 8px',background: alpha(C.textSub, 0.10),
        }}>{m.size}チーム</span>
        <span style={{
          fontFamily: SAIRA, fontSize: F.label, fontWeight: 800, color: C.cyan,
          padding: '3px 8px',background: alpha(C.cyan, 0.10),
        }}>{m.races > 0 ? `${m.races}レース` : '—'}</span>
      </div>

      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.textDim }}>
        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

export default function MatchHistoryPage() {
  const navigate = useNavigate()
  const history = useFriendsQuery(() => myMatchHistory(20), [], 'matchHistory')
  const stats = useFriendsQuery(() => myMatchStats(), [], 'matchStats')

  const s = stats.data
  const winRate = s && s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0

  return (
    <div style={{
      fontFamily: FONT,
      paddingBottom: 80, minHeight: '100dvh',
    }}>
      <PageHeader eyebrow="MATCH HISTORY" title="対戦履歴" />

      {/* 通算成績。履歴が空でもここは出す（対戦したことがあるかが分かる） */}
      {s && (
        <div style={{ padding: '0 12px 10px' }}>
          <div style={{
            display: 'flex',overflow: 'hidden',
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `1px solid ${C.border2}`,
          }}>
            {[
              { label: '対戦', value: s.played, color: C.text },
              { label: '優勝', value: s.wins, color: C.gold },
              { label: '勝率', value: `${winRate}%`, color: C.green },
              { label: '不戦敗', value: s.forfeits, color: s.forfeits > 0 ? C.red : C.textDim },
            ].map((x, i) => (
              <div key={x.label} style={{
                flex: 1, textAlign: 'center', padding: '9px 0',
                borderLeft: i === 0 ? 'none' : `1px solid ${C.border}`,
              }}>
                <div style={{ fontFamily: SAIRA, fontSize: F.titleLg, fontWeight: 900, color: x.color, lineHeight: 1 }}>{x.value}</div>
                <div style={{ fontSize: F.tiny, color: C.textDim, marginTop: 3 }}>{x.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 12px' }}>
        {history.loading && <LoadingBox />}
        {history.error && <ErrorBox onRetry={history.reload} />}
        {!history.loading && !history.error && (history.data?.length ?? 0) === 0 && (
          <EmptyBox label="まだ対戦の記録がありません" />
        )}
        {history.data?.map(m => (
          <MatchCard key={m.matchId} m={m} onOpen={() => navigate(`/online/history/${m.matchId}`)} />
        ))}
      </div>

      {!history.loading && !history.error && (history.data?.length ?? 0) === 0 && (
        <div style={{ padding: '4px 12px' }}>
          <button
            onClick={() => navigate('/online/match')}
            className="btn-game btn-game--gold"
            style={{ width: '100%' }}
          >
            <span className="btn-game__inner">対戦にいく</span>
          </button>
        </div>
      )}
    </div>
  )
}
