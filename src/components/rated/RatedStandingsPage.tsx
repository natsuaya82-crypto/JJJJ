import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLongPress } from '../../lib/useLongPress'
import { TeamLogoSVG } from '../icons/Icons'
import { DeltaText, MoveArrow, RankBadge, RatedShell } from './ratedUi'
import { fetchStandings, STANDINGS_TOP, type RatedRow, type RatedStandings } from '../../lib/ratedApi'
import { C, alpha, SAIRA, F } from '../../styles/tokens'

// 大会全体の順位表。**トップ100と自分だけ**（オーナー判断）。
// 前日からの上下（矢印）とレートの増減も出す（オーナー判断・2026-08-14）。
/**
 * 1行ぶん。**自分の部屋（`RatedGroupPage`）も同じ行を使う**（新しく作らない）。
 * `started` が false なら前日からの上下は出さない（まだ順位が無いので全員「–」になる）。
 */
export function Row({ r, rank, started }: { r: RatedRow; rank: number; started: boolean }) {
  const navigate = useNavigate()
  // ★長押しで相手のチーム（ロスター・殿堂入り）。**フレンド一覧・走友会のメンバー行と
  //   まったく同じ操作・同じ行き先**（オーナー・2026-08-19「参加者一覧や順位表など全部」）。
  //   自分の行は開いても意味が無いので付けない。
  //   ★見える範囲はサーバー側の `shares_rated_event_with`（同じ大会に出ている相手）。
  //     これが無いと開いても中身が取れない。
  const longPress = useLongPress()
  return (
    <div
      {...(r.mine ? {} : longPress(() => navigate(`/friends/team/${r.userId}`)))}
      style={{
      cursor: r.mine ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px',
      background: r.mine ? alpha(C.gold, 0.14) : C.surface2,
      borderBottom: `1px solid ${C.border}`,
    }}>
      {/* ★開催前は番号を出さない（オーナー・2026-08-19「何も無しで行こう」）。
          まだ1本も走っていないので全員同じレートで、この数字は**ただの並び順**。
          順位に見えるものを、順位が無いときに出さない */}
      {started && (
        <span style={{ width: 22, textAlign: 'center', fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 900, color: C.textDim, flexShrink: 0 }}>{rank}</span>
      )}
      {/* 前日からの上下。数え直さずサーバーが出したものを出す（ratedUi の MoveArrow）。
          ★開催前は順位そのものが無いので出さない（全員「–」が並ぶだけ） */}
      {started && <MoveArrow move={r.move} />}
      {/* ★ロゴは必ず logoId を渡すこと。**teamId（＝サーバーのユーザーUUID）を渡さない**——
          TeamLogoSVG は logoId が無いと `s.teams.find(t => t.id === teamId)` で自分のセーブから
          探すが、UUID はそこに居ないので必ず外れ、ハッシュで作った適当な紋章が出る
          （オーナー・2026-08-22「ここなんでアイコン適当なの？」）。中身は remoteLogoId 1本で
          フレンド一覧・走友会と同じ絵になる */}
      <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.teamName} logoId={r.logoId} size={24} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: F.body, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</div>
        <div style={{ fontSize: F.tiny, color: C.textDim }}>GM {r.gmName}</div>
      </div>
      {/* 段位は**紋章**。カタカナで書かない（絵が7枚あるのだから絵を出す） */}
      <RankBadge rating={r.rating} size={22} />
      <span style={{ width: 40, textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: C.text }}>{r.rating}</span>
        <DeltaText delta={r.delta} />
      </span>
    </div>
  )
}

export default function RatedStandingsPage() {
  const [st, setSt] = useState<RatedStandings | null>(null)
  useEffect(() => { void fetchStandings().then(setSt) }, [])
  if (!st) return null

  const inTop = st.meRank > 0 && st.meRank <= STANDINGS_TOP

  return (
    // ★開催前は「参加者」。まだ1本も走っていないので順位表ではない
    <RatedShell title={st.started ? '順位表' : '参加者'}>
      <div style={{overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: 10 }}>
        {st.top.map((r, i) => <Row key={r.userId} r={r} rank={i + 1} started={st.started} />)}
      </div>

      {/* トップ100に入っていないときだけ、自分の行を下に足す */}
      {st.me && !inTop && (
        <div style={{overflow: 'hidden', border: `1px solid ${alpha(C.gold, 0.4)}` }}>
          <Row r={st.me} rank={st.meRank} started={st.started} />
        </div>
      )}

      <div style={{ textAlign: 'right', marginTop: 8, fontFamily: SAIRA, fontSize: F.caption, color: C.textDim }}>
        {st.entrants}人が{st.started ? '参加中' : 'エントリー中'}
      </div>
    </RatedShell>
  )
}
