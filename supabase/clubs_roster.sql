-- 走友会のメンバーのロスターを見られるようにする。
--
-- rosters は schema.sql で「自分」と「フレンド」しか読めない。
-- 走友会のメンバーはフレンドとは限らないので、メンバー一覧を長押ししても
-- ロスターが空で返ってきてしまう。同じ走友会の相手ぶんだけ読めるようにする。
--
-- profiles には同じ形の profiles_select_clubmate が clubs.sql に既にあるので、
-- 判定はそれと同じ my_club_id()（security definer）を使い回す。新しい関数は作らない。
--
-- テーブルは作らない・消さない。何回流しても大丈夫。
-- ただし clubs.sql / schema.sql を流し直したときは、この決まりごとも道連れで消える
-- （clubs.sql は my_club_id() を、schema.sql は rosters ごと作り直すため）。そのときはこれも流し直す。

drop policy if exists rosters_select_clubmate on public.rosters;

create policy rosters_select_clubmate on public.rosters
  for select to authenticated using (
    user_id in (select user_id from public.club_members where club_id = public.my_club_id())
  );
