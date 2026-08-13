import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import FinishPanel from './FinishPanel'
import { getMatchDetail } from '../../lib/roomsApi'
import { racesFromDetail } from '../../lib/matchSim'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from '../friends/friendsUi'
import { ensureAuth } from '../../lib/supabase'
import { FONT } from '../../styles/tokens'


// 対戦履歴から1試合を開く画面。
// 中身は対戦直後とまったく同じ FinishPanel を history モードで出すだけ。
// 履歴のためだけに似た画面を作ると、区間タイムの見せ方が2箇所に増えて必ずズレるため、
// ここは「保存してある結果を読んで渡す」だけに徹する。
export default function MatchReplayPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const q = useFriendsQuery(
    () => (matchId ? getMatchDetail(matchId) : Promise.resolve(undefined)),
    [matchId], `matchDetail:${matchId}`,
  )
  const races = racesFromDetail(q.data)

  // FinishPanel は「自分がどれか」を meId で判定する（自分のチームだけ手元の選手を使う）
  const [meId, setMeId] = useState('')
  useEffect(() => { ensureAuth().then(id => setMeId(id ?? '')).catch(() => {}) }, [])

  return (
    <div style={{
      fontFamily: FONT,
      paddingBottom: 80, minHeight: '100dvh',
    }}>
      <PageHeader eyebrow="MATCH HISTORY" title="この対戦の記録" />

      {q.loading && <div style={{ padding: '0 12px' }}><LoadingBox /></div>}
      {q.error && <div style={{ padding: '0 12px' }}><ErrorBox onRetry={q.reload} /></div>}
      {/* 詳細を残す前の試合と、保存に失敗した試合はここに来る。順位は一覧に残っている */}
      {!q.loading && !q.error && races.length === 0 && (
        <div style={{ padding: '0 12px' }}>
          <EmptyBox label="この対戦のレース内容は残っていません" />
        </div>
      )}
      {races.length > 0 && (
        <FinishPanel
          races={races}
          meId={meId}
          history
          leaveLabel="履歴に戻る"
          onLeave={() => navigate('/online/history')}
        />
      )}
    </div>
  )
}
