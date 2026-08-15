// 入っていない走友会を見るページ。
//
// ■なぜ「ページ」なのか（オーナー・2026-08-15）
//   「なんでそんな使ってないuiを勝手に実装すんの？使ってるuiで実装しろよ」
//
//   最初に画面下から出るシートで作り、次に一覧のその場で開く形にして、
//   どちらも**このアプリで使っていない見せ方**でした。
//   クラブ詳細・フレンド詳細・記録室と同じ「ページ＋`PageHeader`＋戻る矢印」に揃えます。
//
// ★新しい見た目は1つも作りません。使うのは全部いまあるもの：
//     `PageHeader`（44画面）／`MemberRow`（自分の走友会のメンバー一覧と同じ行）／
//     `SectionLabel` / `ClubLogo` / `Pill` / `LoadingBox` / `ErrorBox` / `EmptyBox`
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import ReportSheet, { type ReportTarget } from './ReportSheet'
import { CLUB_MAX, JOIN_TYPE_LABEL, clubPreview, searchClubs, type ClubBrief, type ClubMember } from '../../lib/clubsApi'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from './friendsUi'
import { MemberRow, SectionLabel, ClubLogo, Pill } from './FriendClubPage'
import { C, alpha, SAIRA, FONT, F } from '../../styles/tokens'

const JOIN_COLOR: Record<string, string> = { open: C.green, approval: C.cyan, closed: C.textDim }

export default function ClubViewPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // 走友会そのものの中身（名前・紹介文・人数）は、一覧を引くのと同じ口から取る。
  // ここへは一覧から来るので、たいてい覚えているぶんがそのまま出る
  const clubs = useFriendsQuery(() => searchClubs(''), [], 'clubReco')
  const members = useFriendsQuery(() => clubPreview(id), [id], `clubPeek:${id}`)
  const [reporting, setReporting] = useState<ReportTarget | null>(null)
  const club: ClubBrief | undefined = (clubs.data ?? []).find(c => c.id === id)

  return (
    <div style={{ fontFamily: FONT, paddingBottom: 80, minHeight: '100%' }}>
      <PageHeader eyebrow="CLUB" title={club?.name ?? '走友会'} />

      {club && (
        <div style={{ padding: '0 12px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClubLogo logoId={club.logoId} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pill color={JOIN_COLOR[club.joinType]}>{JOIN_TYPE_LABEL[club.joinType]}</Pill>
              <span style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textGhost }}>
                {club.members}/{CLUB_MAX}人 ・ 平均OVR {club.avgOvr}
                {club.minOvr > 0 && <span style={{ color: alpha(C.orange, 0.9) }}> ・ 条件OVR{club.minOvr}+</span>}
              </span>
            </div>
            {/* 一覧の行では1行に切れている紹介文を、ここでは全文で出す */}
            <div style={{ fontSize: F.caption, color: C.textDim, marginTop: 3, lineHeight: 1.6 }}>
              {club.note || 'ひとことなし'}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '0 12px' }}>
        <SectionLabel>メンバー {members.data ? `${members.data.length}人` : ''}</SectionLabel>
        <div style={{ fontSize: F.caption, color: C.textDim, margin: '0 4px 6px' }}>長押しでその人のロスターを見られます</div>
        {members.loading ? <LoadingBox /> :
         members.error ? <ErrorBox onRetry={members.reload} /> :
         (members.data ?? []).length === 0 ? <EmptyBox label="まだ誰もいません" /> : (
           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
             {(members.data ?? []).map((m: ClubMember) => (
               <MemberRow
                 key={m.id}
                 m={m}
                 // 入っていない走友会なので、外すことも自分の行もない。
                 // フレンド申請もここからは出さない（コードをサーバーが返していない）
                 canKick={false}
                 isMe={false}
                 friendState="unknown"
                 onKick={() => {}}
                 onMenu={() => setReporting({ userId: m.id, name: m.teamName })}
                 onOpen={() => navigate(`/friends/team/${m.id}`)}
                 onAddFriend={() => {}}
               />
             ))}
           </div>
         )}
      </div>

      {reporting && <ReportSheet target={reporting} onClose={() => setReporting(null)} onDone={() => setReporting(null)} />}
    </div>
  )
}
