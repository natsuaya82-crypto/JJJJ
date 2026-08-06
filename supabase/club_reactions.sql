-- 走友会の掲示板に「反応」を付けられるようにする。
--
-- 書き込みは定型文12種だけなので、それだけだと会話が一方通行になる。
-- 短い反応を返せると、返事のために新しく投稿を積まなくて済む（掲示板が流れにくい）。
--
-- 反応の種類も定型（絵文字の番号）にする。自由入力を作らないのは書き込みと同じ理由で、
-- 中身の見張りが要らない形に揃えておくため。番号と絵文字の対応はアプリ側
-- （src/lib/clubsApi.ts の CLUB_REACTIONS）が持つ。順番は変えないこと。
--
-- 1人1投稿につき1種類だけ。押し直しで付け替え、同じものをもう一度押すと取り消し。
--
-- 先に流しておくもの: clubs.sql（club_posts / my_club_id）
-- 何回流しても大丈夫。

create table if not exists public.club_reactions (
  post_id  uuid    not null references public.club_posts(id) on delete cascade,
  user_id  uuid    not null references auth.users(id)        on delete cascade,
  -- 反応の番号。アプリ側の CLUB_REACTIONS の並び順に対応する
  emoji    integer not null,
  primary key (post_id, user_id)
);
create index if not exists club_reactions_post_idx on public.club_reactions (post_id);

alter table public.club_reactions enable row level security;

-- 見えるのは同じ走友会の人だけ（投稿本体と同じ範囲）。
drop policy if exists club_reactions_select on public.club_reactions;
create policy club_reactions_select on public.club_reactions
  for select to authenticated using (
    exists (select 1 from public.club_posts p
             where p.id = club_reactions.post_id and p.club_id = public.my_club_id())
  );

-- 書き込みは下の関数からだけ（ポリシーを作らない＝直接の insert / update は通らない）。

-- 反応を付ける・付け替える・取り消す。
-- 同じ絵文字をもう一度送ったら取り消し、違う絵文字なら付け替え。
-- 戻り値は付けたあとの番号（取り消したときは null）。
create or replace function public.react_club_post(p_post uuid, p_emoji integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); v_club uuid; v_cur integer;
begin
  if me is null then raise exception 'not signed in'; end if;

  -- 自分の走友会の投稿にだけ反応できる
  select club_id into v_club from public.club_posts where id = p_post;
  if v_club is null or v_club <> public.my_club_id() then raise exception 'not your club'; end if;

  select emoji into v_cur from public.club_reactions
   where post_id = p_post and user_id = me;

  if v_cur is not null and v_cur = p_emoji then
    delete from public.club_reactions where post_id = p_post and user_id = me;
    return null;
  end if;

  insert into public.club_reactions (post_id, user_id, emoji)
       values (p_post, me, p_emoji)
  on conflict (post_id, user_id) do update set emoji = excluded.emoji;
  return p_emoji;
end $$;

revoke all on function public.react_club_post(uuid, integer) from public;
grant execute on function public.react_club_post(uuid, integer) to authenticated;

-- 掲示板の反応をまとめて返す。投稿ごとに「番号 → 人数」と「自分が押した番号」。
-- 投稿の一覧（list_club_posts）とは別に引く。投稿側の関数に手を入れると
-- 返り値の形が変わって、古いアプリから呼ばれたときに壊れるため。
-- 返す列が変わるときは create or replace では差し替えられない（42P13）。先に落とす。
-- 関数を落とすだけでデータは消えない
drop function if exists public.list_club_reactions();

create or replace function public.list_club_reactions()
returns table (post_id uuid, emoji integer, count integer, mine boolean)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid;
begin
  if me is null then return; end if;
  my_club := public.my_club_id();
  if my_club is null then return; end if;

  return query
    select r.post_id, r.emoji, count(*)::integer, bool_or(r.user_id = me)
      from public.club_reactions r
      join public.club_posts p on p.id = r.post_id
     where p.club_id = my_club
     group by r.post_id, r.emoji;
end $$;

revoke all on function public.list_club_reactions() from public;
grant execute on function public.list_club_reactions() to authenticated;
