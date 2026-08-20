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
import { C, SAIRA, F } from '../../styles/tokens'

export default function ClubBrowsePage() {
  return (
    <div style={{ fontFamily: SAIRA, minHeight: '100%', paddingBottom: 80 }}>
      <PageHeader eyebrow="CLUB" title="走友会をさがす" />
      <div style={{ padding: '2px 16px 10px' }}>
        {/* ★長押しは見えない操作なので必ず書いておく（走友会・ランクマッチと同じ） */}
        <div style={{ fontSize: F.label, color: C.textDim, lineHeight: 1.6 }}>
          押すとメンバーと紹介文を見られます。入るには、いまの走友会を抜ける必要があります。
        </div>
      </div>
      <ClubSearch readOnly />
    </div>
  )
}
