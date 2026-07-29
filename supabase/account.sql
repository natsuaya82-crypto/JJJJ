-- ============================================================
-- JPEL Manager アカウント削除（Supabase / PostgreSQL）
-- Supabaseダッシュボード → SQL Editor に全文貼り付けて Run。
--
-- ※ schema.sql → clubs.sql → rooms.sql を流したあとに実行すること
--   （走友会の leave_club() を呼んでいるため）。
--
-- このファイルは関数を1つ作り直すだけなので、何度流しても安全。
-- データは一切消えない（走友会やフレンドが消えるのは clubs.sql / schema.sql の方）。
--
-- なぜ必要か
--   アプリの「データ削除」は端末の中を消しているだけで、サーバーに残った
--   プロフィール・フレンド関係・走友会の在籍はそのままだった。
--   相手のフレンド一覧に消えたはずの自分が残り続けるし、
--   「アプリ内からアカウントを削除できること」というApp Storeの要件も満たせない。
-- ============================================================

drop function if exists public.delete_me() cascade;

-- 自分のアカウントを消す。呼べるのは本人だけ（引数が無く、常に auth.uid() を消す）。
create function public.delete_me() returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;

  -- 1. 走友会。会長のまま消すと clubs.owner の cascade で走友会ごと消えてしまうので、
  --    先に「退会」と同じ処理を通す（会長は最古参へ引き継ぎ／誰もいなければ解散）。
  perform public.leave_club();

  -- 2. 参加中の部屋。行は残す仕様（結果表示に出す）ので、離脱扱いにしておく。
  update public.room_members set left_at = now()
    where user_id = me and left_at is null;

  -- 3. 本体。auth.users を消せば、profiles / rosters / friendships / friend_requests /
  --    club_members / club_requests / club_posts / club_gifts / rooms / room_members /
  --    matches / match_results は全部 on delete cascade で一緒に消える。
  --    ※ 通算戦績（profiles.mp_*）は相手ごとに持っているので、相手の戦績は減らない。
  begin
    delete from auth.users where id = me;
    return;
  exception when insufficient_privilege then
    null;   -- auth スキーマを触る権限が無い環境向け。下の手動削除に落ちる。
  end;

  -- 4. 3が権限で弾かれたときの保険。ログイン情報（auth.users の行）だけは残るが、
  --    個人のデータはここで全部消える。
  delete from public.friendships     where user_id  = me or friend_id = me;
  delete from public.friend_requests where from_user = me or to_user  = me;
  delete from public.club_requests   where user_id  = me;
  delete from public.club_gifts      where to_user  = me or from_user = me;
  delete from public.club_posts      where user_id  = me;
  delete from public.rosters         where user_id  = me;
  delete from public.profiles        where user_id  = me;
end $$;

revoke all     on function public.delete_me() from public;
grant  execute on function public.delete_me() to authenticated;
