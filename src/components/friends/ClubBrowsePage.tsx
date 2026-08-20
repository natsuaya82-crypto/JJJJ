// **走友会をさがすページ（もう入っている人が他所を見るとき）。**
//
// ■なぜ要るのか（テスターの報告・2026-08-20）
//   「走友会に入ってる場合、他の走友会を見ることができないので見れたら嬉しいです」
//
//   探す画面は「まだどこにも入っていない人」にしか出ない作りで、入った瞬間に
//   自分の走友会のページへ置き換わっていました。**他所を見る道が1本も無い。**
//
// ■形（オーナー・2026-08-20）
//   「走友会の右上とかに検索ボタンおけば？」「おすすめが並んでる状態でいいと思うよ！」
//   「ページ遷移型が基本ね？」「脱退しないと入れないし、詳細見れるくらいのやつで」
//
//   ★**中身は探す画面（`ClubSearch`）そのまま**。似た一覧をもう1枚書かないこと
//     （「おすすめの出し方」が2通りになる）。`readOnly` で入る・申請・自分で作るを外す。
//   ★開いた瞬間におすすめが並びます（何も打っていないときは「おすすめ」を出す作りなので）。
import PageHeader from '../ui/PageHeader'
import { ClubSearch } from './FriendClubPage'
import { SAIRA } from '../../styles/tokens'

export default function ClubBrowsePage() {
  return (
    <div style={{ fontFamily: SAIRA, minHeight: '100%', paddingBottom: 80 }}>
      <PageHeader eyebrow="CLUB" title="走友会をさがす" />
      <ClubSearch readOnly />
    </div>
  )
}
