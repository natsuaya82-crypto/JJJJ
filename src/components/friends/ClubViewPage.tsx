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
import { clubPreview, findClubByCode, type ClubMember } from '../../lib/clubsApi'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from './friendsUi'
import { MemberRow, SectionLabel, ClubHeaderCard } from './FriendClubPage'
import { FONT } from '../../styles/tokens'

export default function ClubViewPage() {
  // ★入口の鍵は**走友会コード1本**。フレンド一覧・フレンド詳細・走友会の検索結果の
  //   どこから来ても同じで、`findClubByCode` の1回で名前も人数もidも揃う。
  //   以前は「おすすめ30件を引いて id で探す」形だったので、一覧に載っていない
  //   走友会（満員・募集停止）は名前すら出なかった
  const { code = '' } = useParams<{ code: string }>()
  const found = useFriendsQuery(() => findClubByCode(code), [code], `clubByCode:${code}`)
  const club = found.data
  const members = useFriendsQuery(
    () => (club ? clubPreview(club.id) : Promise.resolve([] as ClubMember[])),
    [club?.id], club ? `clubPeek:${club.id}` : undefined)

  return (
    <div style={{ fontFamily: FONT, paddingBottom: 80, minHeight: '100%' }}>
      <PageHeader eyebrow="CLUB" title={club?.name ?? '走友会'} />

      {/* ★走友会カードは**自分の走友会のページとまったく同じもの**（ClubHeaderCard）。
          オーナー・2026-08-15「普通にこの画面のメンバーだけ出せばいいじゃん」 */}
      {club && <div style={{ padding: '0 12px 12px' }}><ClubHeaderCard club={club} /></div>}

      <div style={{ padding: '0 12px' }}>
        <SectionLabel>メンバー {members.data ? `${members.data.length}人` : ''}</SectionLabel>
        {found.loading || members.loading ? <LoadingBox /> :
         found.error ? <ErrorBox onRetry={found.reload} /> :
         members.error ? <ErrorBox onRetry={members.reload} /> :
         !club ? <EmptyBox label="この走友会は見つかりませんでした" /> :
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
