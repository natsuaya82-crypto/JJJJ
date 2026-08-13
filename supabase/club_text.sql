-- 走友会の掲示板を「定型文の番号」から「自由入力の本文」に変える。
-- あわせて、掲示板からオンライン対戦の部屋を募集できるようにする。
--
-- 先に流しておくもの: schema.sql → clubs.sql → rooms.sql（土台）
-- このファイルのあと **必ず supabase/club_feed.sql を流し直すこと**
--   （club_feed の定義はあのファイル1本だけ。ここでは触らない）
--
-- 表は作らない・消さない。何回流しても大丈夫。
--
-- ■なぜ post_club_message を残すのか
--   すでに配っているアプリ（build 126 まで）は定型文の番号しか送れない。
--   関数の形を変えると、古いアプリの掲示板が丸ごと動かなくなる。
--   **古い関数はそのまま残し、新しい関数を足す。**
--
-- ■伏せ字（※）はここでは何もしない
--   保存するのは書かれたそのまま。画面に出す直前にアプリ側で伏せる
--   （src/utils/wordFilter.ts）。通報が来たときに、何が書かれたのか
--   分からないと処理のしようがないため。

-- ── 列を足す ──────────────────────────────────────────
-- 本文（kind='msg'）。100字まではアプリ側で切るが、こちらでも念のため切る
alter table public.club_posts add column if not exists body text not null default '';
-- 対戦の募集（kind='room'）。6桁の部屋番号
alter table public.club_posts add column if not exists room_code text not null default '';

-- kind に 'room' を足す。古い制約は名前で落としてから付け直す
alter table public.club_posts drop constraint if exists club_posts_kind;
alter table public.club_posts add  constraint club_posts_kind
  check (kind in ('msg', 'req', 'room'));

-- ── 自由入力で書く ─────────────────────────────────────
-- 'ok' / 'not_in_club' / 'too_fast'（連投防止：1分に1回まで）/ 'empty'
create or replace function public.post_club_text(p_body text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid; b text;
begin
  if me is null then return 'not_in_club'; end if;
  my_club := public.my_club_id();
  if my_club is null then return 'not_in_club'; end if;

  -- 前後の空白と改行を落としてから空かどうかを見る。
  -- 改行だけの投稿で掲示板が縦に伸びるのを防ぐ（1行にまとめる）
  b := btrim(regexp_replace(coalesce(p_body, ''), '[\r\n\t]+', ' ', 'g'));
  if b = '' then return 'empty'; end if;
  b := left(b, 100);

  if exists (
    select 1 from public.club_posts
    where user_id = me and kind = 'msg' and created_at > now() - interval '1 minute'
  ) then return 'too_fast'; end if;

  insert into public.club_posts (club_id, user_id, kind, phrase, body)
    values (my_club, me, 'msg', 0, b);
  return 'ok';
end $$;

-- ── 対戦の募集を出す ───────────────────────────────────
-- 'ok' / 'not_in_club' / 'too_fast'（募集は5分に1回）/ 'bad_code'
--
-- 部屋そのものは rooms.sql の create_room で作る。ここは
-- 「その番号を掲示板に貼る」だけ。部屋の生き死にはアプリが入るときに確かめる。
create or replace function public.post_club_room(p_code text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid;
begin
  if me is null then return 'not_in_club'; end if;
  my_club := public.my_club_id();
  if my_club is null then return 'not_in_club'; end if;
  if coalesce(p_code, '') !~ '^[0-9]{6}$' then return 'bad_code'; end if;

  if exists (
    select 1 from public.club_posts
    where user_id = me and kind = 'room' and created_at > now() - interval '5 minutes'
  ) then return 'too_fast'; end if;

  insert into public.club_posts (club_id, user_id, kind, room_code)
    values (my_club, me, 'room', p_code);
  return 'ok';
end $$;

revoke all     on function public.post_club_text(text) from public, anon;
grant  execute on function public.post_club_text(text) to authenticated;
revoke all     on function public.post_club_room(text) from public, anon;
grant  execute on function public.post_club_room(text) to authenticated;
