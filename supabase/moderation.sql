-- ============================================================
-- JPEL Manager 通報・ブロック（Supabase / PostgreSQL）
-- Supabaseダッシュボード → SQL Editor に全文貼り付けて Run。
--
-- ※ schema.sql → clubs.sql を流したあとに実行すること
--   （friendships / friend_requests / clubs を参照しているため）。
--
-- このファイルは表を「無ければ作る」だけで、drop table を一切しない。
-- 何度流してもデータは消えない。
--
-- なぜ必要か
--   App Store の審査基準 1.2（ユーザー投稿があるアプリ）は
--   「不適切な内容を通報できること」と「迷惑な相手をブロックできること」を求めている。
--   走友会の掲示板は定型文だけだが、チーム名・監督名・走友会名は自由入力なので対象になる。
-- ============================================================

-- ── 通報 ──────────────────────────────────────────────
-- 相手（target_user）か走友会（target_club）のどちらか、または両方を指す。
-- 読めるのは出した本人だけ。中身の確認は Supabase のダッシュボードから行う。
create table if not exists public.reports (
  id          uuid        primary key default gen_random_uuid(),
  reporter    uuid        not null references auth.users(id) on delete cascade,
  target_user uuid        references auth.users(id) on delete cascade,
  target_club uuid        references public.clubs(id)  on delete cascade,
  reason      text        not null,
  detail      text        not null default '',
  created_at  timestamptz not null default now(),
  constraint reports_reason     check (reason in ('harass', 'sexual', 'impersonate', 'spam', 'other')),
  constraint reports_detail_len check (char_length(detail) <= 200),
  constraint reports_target     check (target_user is not null or target_club is not null)
);
create index if not exists reports_created_idx     on public.reports (created_at desc);
create index if not exists reports_target_user_idx on public.reports (target_user);
create index if not exists reports_target_club_idx on public.reports (target_club);

-- ── ブロック ──────────────────────────────────────────
-- user_id が blocked_id をブロックしている、という1行。
create table if not exists public.blocks (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  blocked_id uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  constraint blocks_not_self check (user_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.reports enable row level security;
alter table public.blocks  enable row level security;

-- ── ポリシー（作り直しても中身は消えない） ────────────────
drop policy if exists reports_insert_mine on public.reports;
create policy reports_insert_mine on public.reports
  for insert to authenticated with check (reporter = auth.uid());

drop policy if exists reports_select_mine on public.reports;
create policy reports_select_mine on public.reports
  for select to authenticated using (reporter = auth.uid());

drop policy if exists blocks_select_mine on public.blocks;
create policy blocks_select_mine on public.blocks
  for select to authenticated using (user_id = auth.uid());

drop policy if exists blocks_insert_mine on public.blocks;
create policy blocks_insert_mine on public.blocks
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists blocks_delete_mine on public.blocks;
create policy blocks_delete_mine on public.blocks
  for delete to authenticated using (user_id = auth.uid());

grant select, insert         on public.reports to authenticated;
grant select, insert, delete on public.blocks  to authenticated;

-- ── 通報を出す ─────────────────────────────────────────
-- 返り値：'ok' | 'self' | 'bad' | 'too_many'
-- 荒らし対策で1日20件まで。
drop function if exists public.send_report(uuid, uuid, text, text) cascade;
create function public.send_report(p_user uuid, p_club uuid, p_reason text, p_detail text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then return 'bad'; end if;
  if p_user is null and p_club is null then return 'bad'; end if;
  if p_user = me then return 'self'; end if;
  if p_reason not in ('harass', 'sexual', 'impersonate', 'spam', 'other') then return 'bad'; end if;

  select count(*) into n from public.reports
    where reporter = me and created_at > now() - interval '1 day';
  if n >= 20 then return 'too_many'; end if;

  insert into public.reports (reporter, target_user, target_club, reason, detail)
    values (me, p_user, p_club, p_reason, left(coalesce(p_detail, ''), 200));
  return 'ok';
end $$;

-- ── ブロックする ───────────────────────────────────────
-- ついでにフレンド関係と申請も消す（ブロックしたのに一覧に残るのは不自然なので）。
-- 返り値：'ok' | 'self' | 'bad'
drop function if exists public.block_user(uuid) cascade;
create function public.block_user(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user is null then return 'bad'; end if;
  if p_user = me then return 'self'; end if;

  insert into public.blocks (user_id, blocked_id) values (me, p_user)
    on conflict (user_id, blocked_id) do nothing;

  delete from public.friendships
    where (user_id = me and friend_id = p_user) or (user_id = p_user and friend_id = me);
  delete from public.friend_requests
    where (from_user = me and to_user = p_user) or (from_user = p_user and to_user = me);

  return 'ok';
end $$;

-- ── ブロックを外す ─────────────────────────────────────
drop function if exists public.unblock_user(uuid) cascade;
create function public.unblock_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.blocks where user_id = auth.uid() and blocked_id = p_user;
end $$;

-- ── ブロックした相手の一覧（表示に必要な分だけ返す） ────────
-- profiles の select ポリシーはフレンド／同じ走友会しか通さないので、
-- ブロック後も名前を出せるようこの関数で読む。
drop function if exists public.my_blocks() cascade;
create function public.my_blocks()
returns table (
  user_id uuid, code text, team_name text, short_name text, gm_name text,
  logo_id text, color_primary text, color_secondary text, champs integer, avg_ovr integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  return query
    select p.user_id, p.code, p.team_name, p.short_name, p.gm_name,
           p.logo_id, p.color_primary, p.color_secondary, p.champs, p.avg_ovr, p.updated_at
    from public.blocks b
    join public.profiles p on p.user_id = b.blocked_id
    where b.user_id = me
    order by b.created_at desc;
end $$;

revoke all     on function public.send_report(uuid, uuid, text, text) from public, anon;
revoke all     on function public.block_user(uuid)                    from public, anon;
revoke all     on function public.unblock_user(uuid)                  from public, anon;
revoke all     on function public.my_blocks()                         from public, anon;
grant  execute on function public.send_report(uuid, uuid, text, text) to authenticated;
grant  execute on function public.block_user(uuid)                    to authenticated;
grant  execute on function public.unblock_user(uuid)                  to authenticated;
grant  execute on function public.my_blocks()                         to authenticated;
