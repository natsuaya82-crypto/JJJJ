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
import { useParams } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { clubPreview, searchClubs, type ClubBrief, type ClubMember } from '../../lib/clubsApi'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from './friendsUi'
import { MemberRow, SectionLabel, ClubHeaderCard } from './FriendClubPage'
import { FONT } from '../../styles/tokens'

export default function ClubViewPage() {
  const { id = '' } = useParams<{ id: string }>()
  // 走友会そのものの中身（名前・紹介文・人数）は、一覧を引くのと同じ口から取る。
  // ここへは一覧から来るので、たいてい覚えているぶんがそのまま出る
  const clubs = useFriendsQuery(() => searchClubs(''), [], 'clubReco')
  const members = useFriendsQuery(() => clubPreview(id), [id], `clubPeek:${id}`)
  const club: ClubBrief | undefined = (clubs.data ?? []).find(c => c.id === id)

  return (
    <div style={{ fontFamily: FONT, paddingBottom: 80, minHeight: '100%' }}>
      <PageHeader eyebrow="CLUB" title={club?.name ?? '走友会'} />

      {/* ★走友会カードは**自分の走友会のページとまったく同じもの**（ClubHeaderCard）。
          オーナー・2026-08-15「普通にこの画面のメンバーだけ出せばいいじゃん」 */}
      {club && <div style={{ padding: '0 12px 12px' }}><ClubHeaderCard club={club} /></div>}

      <div style={{ padding: '0 12px' }}>
        <SectionLabel>メンバー {members.data ? `${members.data.length}人` : ''}</SectionLabel>
        {members.loading ? <LoadingBox /> :
         members.error ? <ErrorBox onRetry={members.reload} /> :
         (members.data ?? []).length === 0 ? <EmptyBox label="まだ誰もいません" /> : (
           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
             {(members.data ?? []).map((m: ClubMember) => (
               <MemberRow
                 key={m.id}
                 m={m}
                 // ★**見るだけ**（オーナー・2026-08-15「通報ボタンと長押しはいらんやろ」）。
                 //   入っていない走友会なので、外すことも自分の行もフレンド申請もない
                 //   （コードはサーバーが返していない）。
                 readOnly
                 canKick={false}
                 isMe={false}
                 friendState="unknown"
                 onKick={() => {}}
                 onMenu={() => {}}
                 onOpen={() => {}}
                 onAddFriend={() => {}}
               />
             ))}
           </div>
         )}
      </div>
    </div>
  )
}
