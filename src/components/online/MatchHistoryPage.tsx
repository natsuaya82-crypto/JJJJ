import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { myMatchHistory, myMatchStats, type MatchHistoryItem, type MatchEntry } from '../../lib/roomsApi'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from '../friends/friendsUi'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// オンライン対戦の履歴。
// 記録は finish_match() が matches / match_results に残しているものをそのまま読む。
// これまで書き込みだけがあって見る画面が無く、溜まった記録が誰にも見えていなかった。

/** 順位に応じた色。1位=金 / 2〜3位=銀 / それ以外=くすんだ色 */
function rankColor(rank: number): string {
  if (rank === 1) return C.gold
  if (rank <= 3) return C.textSub
  return C.textDim
}

/** 「2026/08/04 21:30」の形。サーバーはUTCで返すので端末の時刻に直す */
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function EntryRow({ e }: { e: MatchEntry }) {
  const isMe = e.isMe
  const col = rankColor(e.rank)
  const name = e.profile?.teamName ?? '退会したチーム'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      background: isMe ? alpha(C.gold, 0.07) : 'transparent',
      borderRadius: 8,
    }}>
      <span style={{
        fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: col,
        width: 22, flexShrink: 0, textAlign: 'right',
      }}>{e.rank}</span>
      <span style={{ fontSize: 9, color: C.textGhost, flexShrink: 0 }}>位</span>
      {e.profile ? (
        <TeamLogoSVG
          primary={e.profile.primary} secondary={e.profile.secondary}
          shortName={e.profile.shortName} logoId={e.profile.logoId} size={20}
        />
      ) : (
        <div style={{ width: 20, height: 20, borderRadius: 5, background: C.surface3, flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <span style={{
          display: 'block', fontSize: 12, color: isMe ? C.text : C.textSub,
          fontWeight: isMe ? 700 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}{isMe && <span style={{ marginLeft: 5, fontSize: 9, color: C.gold }}>自分</span>}
        </span>
        <span style={{
          display: 'block', fontSize: 9, color: C.textGhost, marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          GM {e.profile?.gmName ?? '—'}
        </span>
      </span>
      {e.forfeit && (
        <span style={{
          fontSize: 9, fontWeight: 800, color: C.red, flexShrink: 0,
          padding: '1px 5px', borderRadius: 5,
          background: alpha(C.red, 0.12), border: `1px solid ${alpha(C.red, 0.3)}`,
        }}>不戦敗</span>
      )}
      <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: C.textDim, flexShrink: 0 }}>
        {e.points}<span style={{ fontSize: 9, color: C.textGhost, marginLeft: 1 }}>pt</span>
      </span>
    </div>
  )
}

function MatchCard({ m }: { m: MatchHistoryItem }) {
  const col = rankColor(m.myRank)
  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden', marginBottom: 8,
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      border: `2px solid ${m.myRank === 1 ? alpha(C.gold, 0.5) : C.border2}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
        borderBottom: `1px solid ${C.border}`,
        background: m.myRank === 1 ? alpha(C.gold, 0.06) : 'transparent',
      }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: col, lineHeight: 1 }}>
            {m.myRank > 0 ? m.myRank : '—'}
          </div>
          <div style={{ fontSize: 9, color: C.textGhost }}>／{m.size}チーム</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: C.textSub }}>
            {m.races > 0 ? `全${m.races}レース` : 'オンライン対戦'}
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{fmtDate(m.finishedAt)}</div>
        </div>
      </div>
      <div style={{ padding: '5px 6px' }}>
        {m.entries.map(e => <EntryRow key={e.userId} e={e} />)}
      </div>
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
      fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif",
      paddingBottom: 80, background: C.bg, minHeight: '100dvh',
    }}>
      <div style={{ padding: '10px 12px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <BackButton />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.cyan, letterSpacing: '3px', fontWeight: 900 }}>MATCH HISTORY</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1 }}>対戦履歴</div>
          </div>
        </div>
      </div>

      {/* 通算成績。履歴が空でもここは出す（対戦したことがあるかが分かる） */}
      {s && (
        <div style={{ padding: '0 12px 10px' }}>
          <div style={{
            display: 'flex', borderRadius: 12, overflow: 'hidden',
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
                <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: x.color, lineHeight: 1 }}>{x.value}</div>
                <div style={{ fontSize: 9, color: C.textDim, marginTop: 3 }}>{x.label}</div>
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
        {history.data?.map(m => <MatchCard key={m.matchId} m={m} />)}
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
