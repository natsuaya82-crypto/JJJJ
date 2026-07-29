-- ============================================================
-- JPEL Manager 走友会（所属のみ） スキーマ（Supabase / PostgreSQL）
-- Supabaseダッシュボード → SQL Editor に全文貼り付けて Run。
--
-- ※ schema.sql（フレンド機能）を流したあとに実行すること。
--
-- 「検索して入る」形（クラロワのクランと同じ）。対抗戦などの競技要素はここには無い。
-- ============================================================

drop function if exists public.update_club(text, text, text, text, integer) cascade;
drop function if exists public.kick_club_member(uuid)      cascade;
drop function if exists public.reject_club_request(uuid)   cascade;
drop function if exists public.approve_club_request(uuid)  cascade;
drop function if exists public.list_club_requests()        cascade;
drop function if exists public.my_club_requests()          cascade;
drop function if exists public.cancel_club_request(uuid)   cascade;
drop function if exists public.leave_club()                cascade;
drop function if exists public.join_club(uuid)             cascade;
drop function if exists public.join_club(text)             cascade;
drop function if exists public.create_club(text, text, text, text, integer) cascade;
drop function if exists public.create_club(text, text)     cascade;
drop function if exists public.find_club_by_code(text)     cascade;
drop function if exists public.search_clubs(text, integer) cascade;
drop function if exists public.rename_club(text, text)     cascade;
drop function if exists public.claim_club_gifts()           cascade;
drop function if exists public.club_gift_count()            cascade;
drop function if exists public.donate_club_card(uuid, jsonb) cascade;
drop function if exists public.post_club_request(text)      cascade;
drop function if exists public.post_club_message(integer)   cascade;
drop function if exists public.club_feed()                  cascade;
drop function if exists public.club_req_cap(text)           cascade;
drop policy   if exists profiles_select_clubmate on public.profiles;
drop table    if exists public.club_gifts        cascade;
drop table    if exists public.club_posts        cascade;
drop table    if exists public.club_requests     cascade;
drop table    if exists public.club_members      cascade;
drop table    if exists public.clubs             cascade;
drop function if exists public.club_members_count() cascade;
drop function if exists public.my_club_id()         cascade;
drop function if exists public.new_club_code()      cascade;   -- 旧版。new_friend_code() に一本化した

-- ── 走友会 ────────────────────────────────────────────
create table public.clubs (
  id         uuid        primary key default gen_random_uuid(),
  code       text        not null,                     -- 数字10桁。フレンドコードと同じ採番を使う
  name       text        not null,
  note       text        not null default '',          -- ひとこと紹介
  logo_id    text        not null default 'club_01',
  join_type  text        not null default 'open',      -- 'open' 誰でも歓迎 / 'approval' 承認制 / 'closed' 募集停止
  min_ovr    integer     not null default 0,           -- 入会条件（平均OVRがこれ以上）
  owner      uuid        not null references auth.users(id) on delete cascade,
  members    integer     not null default 0,           -- 人数。下のトリガーが数える（検索の並べ替え用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_code_unique unique (code),
  constraint clubs_code_format check (code ~ '^[0-9]{10}$'),
  constraint clubs_name_len    check (char_length(name) between 1 and 16),
  constraint clubs_note_len    check (char_length(note) <= 40),
  constraint clubs_join_type   check (join_type in ('open', 'approval', 'closed')),
  constraint clubs_min_ovr     check (min_ovr between 0 and 99)
);
create index clubs_members_idx on public.clubs (members desc);

-- ── 所属（1人1走友会なので user_id が主キー） ──────────────
create table public.club_members (
  user_id   uuid        primary key references auth.users(id) on delete cascade,
  club_id   uuid        not null references public.clubs(id) on delete cascade,
  role      text        not null default 'member',    -- 'owner' | 'member'
  joined_at timestamptz not null default now(),
  constraint club_members_role check (role in ('owner', 'member'))
);
create index club_members_club_idx on public.club_members (club_id);

-- ── 加入申請（承認制の走友会だけ使う） ──────────────────────
create table public.club_requests (
  club_id    uuid        not null references public.clubs(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_requests_user_idx on public.club_requests (user_id);

create trigger clubs_touch before update on public.clubs
  for each row execute function public.touch_updated_at();

-- 人数は clubs.members に持たせておく（検索のたびに数え直さないため）
create function public.club_members_count() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.clubs set members = members + 1 where id = new.club_id;
  else
    update public.clubs set members = greatest(members - 1, 0) where id = old.club_id;
  end if;
  return null;
end $$;

create trigger club_members_count_trg after insert or delete on public.club_members
  for each row execute function public.club_members_count();

-- ── コードの採番 ──────────────────────────────────────
-- フレンドコードの new_friend_code() をそのまま使う。走友会のぶんも重ならないよう、
-- 引き直しの条件に clubs を足しただけ（走友会用の採番関数は作らない）。
create or replace function public.new_friend_code() returns text
language plpgsql
security definer
set search_path = public
as $$
declare c text;
begin
  loop
    c := lpad((floor(random() * 10000000000))::bigint::text, 10, '0');
    exit when not exists (select 1 from public.profiles where code = c)
          and not exists (select 1 from public.clubs    where code = c);
  end loop;
  return c;
end $$;

alter table public.clubs alter column code set default public.new_friend_code();

-- 自分の所属先。ポリシーの中から club_members を直接見ると
-- 「ポリシーが自分のテーブルを見る」形になって無限再帰になるため、
-- security definer の関数にして RLS を通さずに引く。
create function public.my_club_id() returns uuid
language sql
security definer
set search_path = public
stable
as $$ select club_id from public.club_members where user_id = auth.uid() $$;

-- ── RLS ──────────────────────────────────────────────
alter table public.clubs         enable row level security;
alter table public.club_members  enable row level security;
alter table public.club_requests enable row level security;

-- 直接読めるのは「自分が入っている走友会」だけ。他所の走友会は下の検索RPC越しに見る。
create policy clubs_select_mine on public.clubs
  for select to authenticated using (id = public.my_club_id());

create policy club_members_select_mine on public.club_members
  for select to authenticated using (club_id = public.my_club_id());

-- 自分が出した申請は自分で見られる（一覧の「申請中」表示用）
create policy club_requests_select_mine on public.club_requests
  for select to authenticated using (user_id = auth.uid());

-- 同じ走友会の人のプロフィールは読める（メンバー一覧に出すため）
create policy profiles_select_clubmate on public.profiles
  for select to authenticated using (
    user_id in (select user_id from public.club_members where club_id = public.my_club_id())
  );

-- ── 検索 ─────────────────────────────────────────────
-- 名前の一部でもコードでも引ける。空なら「おすすめ」（募集中で人数の多い順）。
create function public.search_clubs(p_q text default '', p_limit integer default 30)
returns table (
  id uuid, code text, name text, note text, logo_id text,
  join_type text, min_ovr integer, members integer, avg_ovr integer
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.code, c.name, c.note, c.logo_id, c.join_type, c.min_ovr, c.members,
         coalesce((
           select avg(p.avg_ovr) from public.club_members m
           join public.profiles p on p.user_id = m.user_id
           where m.club_id = c.id
         ), 0)::integer as avg_ovr
  from public.clubs c
  where
    case
      when coalesce(trim(p_q), '') = '' then c.join_type <> 'closed' and c.members < 50
      when trim(p_q) ~ '^[0-9]{10}$'    then c.code = trim(p_q)
      else c.name ilike '%' || trim(p_q) || '%'
    end
  order by c.members desc, c.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
$$;

-- コードちょうど1件（コード入力欄から使う）
create function public.find_club_by_code(p_code text)
returns table (
  id uuid, code text, name text, note text, logo_id text,
  join_type text, min_ovr integer, members integer, avg_ovr integer
)
language sql
security definer
set search_path = public
stable
as $$ select * from public.search_clubs(p_code, 1) $$;

-- ── 作る ─────────────────────────────────────────────
create function public.create_club(
  p_name text, p_note text default '', p_logo text default 'club_01',
  p_join_type text default 'open', p_min_ovr integer default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then return null; end if;
  if exists (select 1 from public.club_members where user_id = me) then
    return null;                                   -- すでにどこかに入っている
  end if;
  insert into public.clubs (name, note, logo_id, join_type, min_ovr, owner)
    values (trim(p_name), coalesce(p_note, ''), coalesce(p_logo, 'club_01'),
            coalesce(p_join_type, 'open'), coalesce(p_min_ovr, 0), me)
    returning id into new_id;
  insert into public.club_members (user_id, club_id, role) values (me, new_id, 'owner');
  delete from public.club_requests where user_id = me;   -- 出しっぱなしの申請は捨てる
  return new_id;
end $$;

-- ── 入る ─────────────────────────────────────────────
-- 'joined' その場で加入 / 'requested' 承認待ち / 'already' すでに所属
-- 'full' 満員 / 'closed' 募集停止 / 'low_ovr' 条件に届かない / 'not_found'
create function public.join_club(p_club uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); c public.clubs%rowtype; my_ovr integer;
begin
  if me is null then return 'not_found'; end if;
  if exists (select 1 from public.club_members where user_id = me) then return 'already'; end if;
  select * into c from public.clubs where id = p_club;
  if not found then return 'not_found'; end if;
  if c.members >= 50 then return 'full'; end if;

  select coalesce(avg_ovr, 0) into my_ovr from public.profiles where user_id = me;
  if coalesce(my_ovr, 0) < c.min_ovr then return 'low_ovr'; end if;

  if c.join_type = 'closed' then return 'closed'; end if;

  if c.join_type = 'approval' then
    insert into public.club_requests (club_id, user_id) values (c.id, me) on conflict do nothing;
    return 'requested';
  end if;

  insert into public.club_members (user_id, club_id, role) values (me, c.id, 'member');
  delete from public.club_requests where user_id = me;
  return 'joined';
end $$;

-- 出した申請を取り消す
create function public.cancel_club_request(p_club uuid) returns void
language sql
security definer
set search_path = public
as $$ delete from public.club_requests where club_id = p_club and user_id = auth.uid() $$;

-- 自分が申請中の走友会（一覧のボタン表示を切り替えるため）
create function public.my_club_requests() returns table (club_id uuid)
language sql
security definer
set search_path = public
stable
as $$ select club_id from public.club_requests where user_id = auth.uid() $$;

-- ── 承認（会長だけ） ───────────────────────────────────
create function public.list_club_requests()
returns table (
  user_id uuid, code text, team_name text, short_name text, gm_name text,
  logo_id text, color_primary text, color_secondary text, champs integer,
  avg_ovr integer, updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, p.code, p.team_name, p.short_name, p.gm_name, p.logo_id,
         p.color_primary, p.color_secondary, p.champs, p.avg_ovr, p.updated_at
  from public.club_requests r
  join public.profiles p on p.user_id = r.user_id
  where r.club_id = (select id from public.clubs where owner = auth.uid())
  order by r.created_at
$$;

create function public.approve_club_request(p_user uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare c public.clubs%rowtype;
begin
  select * into c from public.clubs where owner = auth.uid();
  if not found then return 'not_found'; end if;
  if not exists (select 1 from public.club_requests where club_id = c.id and user_id = p_user) then
    return 'not_found';
  end if;
  delete from public.club_requests where club_id = c.id and user_id = p_user;
  if c.members >= 50 then return 'full'; end if;
  if exists (select 1 from public.club_members where user_id = p_user) then return 'already'; end if;
  insert into public.club_members (user_id, club_id, role) values (p_user, c.id, 'member');
  delete from public.club_requests where user_id = p_user;   -- 他所への申請も消す
  return 'joined';
end $$;

create function public.reject_club_request(p_user uuid) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.club_requests
  where user_id = p_user and club_id = (select id from public.clubs where owner = auth.uid())
$$;

-- ── 抜ける・外す・設定 ─────────────────────────────────
-- 'left' 抜けた / 'disbanded' 最後の1人だったので解散 / 'not_in_club'
create function public.leave_club() returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid; next_user uuid;
begin
  select club_id into my_club from public.club_members where user_id = me;
  if my_club is null then return 'not_in_club'; end if;

  delete from public.club_members where user_id = me;

  if exists (select 1 from public.clubs where id = my_club and owner = me) then
    select user_id into next_user from public.club_members
      where club_id = my_club order by joined_at limit 1;
    if next_user is null then
      delete from public.clubs where id = my_club;                         -- 誰もいなくなったら解散
      return 'disbanded';
    end if;
    update public.clubs set owner = next_user where id = my_club;          -- 会長は最古参へ
    update public.club_members set role = 'owner' where user_id = next_user;
  end if;
  return 'left';
end $$;

create function public.kick_club_member(p_user uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare my_club uuid;
begin
  select id into my_club from public.clubs where owner = auth.uid();
  if my_club is null or p_user = auth.uid() then return; end if;
  delete from public.club_members where user_id = p_user and club_id = my_club;
end $$;

create function public.update_club(
  p_name text, p_note text default '', p_logo text default 'club_01',
  p_join_type text default 'open', p_min_ovr integer default 0
) returns void
language sql
security definer
set search_path = public
as $$
  update public.clubs set
    name      = trim(p_name),
    note      = coalesce(p_note, ''),
    logo_id   = coalesce(p_logo, 'club_01'),
    join_type = coalesce(p_join_type, 'open'),
    min_ovr   = coalesce(p_min_ovr, 0)
  where owner = auth.uid()
$$;

-- ============================================================
-- 掲示板とカード寄付
-- ・書き込みは定型文（12種）から選ぶだけ。自由入力は無い。
-- ・「カードください」は1人1日1回まで。ノーマル5枚／レア3枚／エピック1枚
--   集まったら締め切り。レジェンドと完全休養カードは対象外。
-- ・寄付できるのは1つの要求につき1人1枚まで。お礼は無し。
-- ・投稿は3日で自動的に消える（掲示板を開いたときに古いものを掃除する）。
-- ============================================================

create table public.club_posts (
  id         uuid        primary key default gen_random_uuid(),
  club_id    uuid        not null references public.clubs(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)   on delete cascade,
  kind       text        not null,                       -- 'msg' 定型文 / 'req' カードください
  phrase     integer     not null default 0,             -- 定型文の番号（kind='msg'）
  rarity     text        not null default '',            -- 欲しいレアリティ（kind='req'）
  filled     integer     not null default 0,             -- 集まった枚数
  created_at timestamptz not null default now(),
  constraint club_posts_kind   check (kind in ('msg', 'req')),
  constraint club_posts_phrase check (phrase between 0 and 11),
  constraint club_posts_rarity check (rarity in ('', 'normal', 'rare', 'epic'))
);
create index club_posts_club_idx on public.club_posts (club_id, created_at desc);

-- 渡したカード。投稿が消えても受け取れるよう post_id は null 可にしてある
create table public.club_gifts (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        references public.club_posts(id) on delete set null,
  to_user    uuid        not null references auth.users(id) on delete cascade,
  from_user  uuid        not null references auth.users(id) on delete cascade,
  card       jsonb       not null,
  created_at timestamptz not null default now(),
  constraint club_gifts_once unique (post_id, from_user)
);
create index club_gifts_to_idx on public.club_gifts (to_user);

alter table public.club_posts enable row level security;
alter table public.club_gifts enable row level security;
-- どちらも直接は読み書きさせない（下のRPC越しだけ）

-- 要求1件で集められる枚数
create function public.club_req_cap(p_rarity text) returns integer
language sql immutable
as $$ select case p_rarity when 'normal' then 5 when 'rare' then 3 when 'epic' then 1 else 0 end $$;

-- ── 掲示板を読む ───────────────────────────────────────
create function public.club_feed()
returns table (
  id uuid, user_id uuid, kind text, phrase integer, rarity text,
  filled integer, cap integer, mine boolean, donated boolean, created_at timestamptz,
  team_name text, short_name text, gm_name text,
  logo_id text, color_primary text, color_secondary text
)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid;
begin
  if me is null then return; end if;
  my_club := public.my_club_id();
  if my_club is null then return; end if;

  delete from public.club_posts where created_at < now() - interval '3 days';

  return query
    select t.id, t.user_id, t.kind, t.phrase, t.rarity,
           t.filled, public.club_req_cap(t.rarity), t.user_id = me,
           exists (select 1 from public.club_gifts g where g.post_id = t.id and g.from_user = me),
           t.created_at,
           p.team_name, p.short_name, p.gm_name,
           p.logo_id, p.color_primary, p.color_secondary
    from public.club_posts t
    left join public.profiles p on p.user_id = t.user_id
    where t.club_id = my_club
    order by t.created_at desc
    limit 50;
end $$;

-- ── 定型文を書く ───────────────────────────────────────
-- 'ok' / 'not_in_club' / 'too_fast'（連投防止：1分に1回まで）
create function public.post_club_message(p_phrase integer) returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid;
begin
  if me is null then return 'not_in_club'; end if;
  my_club := public.my_club_id();
  if my_club is null then return 'not_in_club'; end if;
  if exists (
    select 1 from public.club_posts
    where user_id = me and kind = 'msg' and created_at > now() - interval '1 minute'
  ) then return 'too_fast'; end if;

  insert into public.club_posts (club_id, user_id, kind, phrase)
    values (my_club, me, 'msg', greatest(least(coalesce(p_phrase, 0), 11), 0));
  return 'ok';
end $$;

-- ── カードをお願いする ─────────────────────────────────
-- 'ok' / 'not_in_club' / 'today_done'（今日はもう出した） / 'bad_rarity'
create function public.post_club_request(p_rarity text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid;
begin
  if me is null then return 'not_in_club'; end if;
  my_club := public.my_club_id();
  if my_club is null then return 'not_in_club'; end if;
  if coalesce(p_rarity, '') not in ('normal', 'rare', 'epic') then return 'bad_rarity'; end if;
  if exists (
    select 1 from public.club_posts
    where user_id = me and kind = 'req'
      and (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date
  ) then return 'today_done'; end if;

  insert into public.club_posts (club_id, user_id, kind, rarity)
    values (my_club, me, 'req', p_rarity);
  return 'ok';
end $$;

-- ── カードを渡す ───────────────────────────────────────
-- 'ok' / 'not_found' / 'full'（もう集まった） / 'already'（自分はもう渡した）
-- 'mine'（自分の要求） / 'bad_card'（レアリティ違い・完全休養）
create function public.donate_club_card(p_post uuid, p_card jsonb) returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); t public.club_posts%rowtype; cap integer;
begin
  if me is null then return 'not_found'; end if;
  select * into t from public.club_posts where id = p_post and club_id = public.my_club_id();
  if not found or t.kind <> 'req' then return 'not_found'; end if;
  if t.user_id = me then return 'mine'; end if;

  cap := public.club_req_cap(t.rarity);
  if t.filled >= cap then return 'full'; end if;
  if exists (select 1 from public.club_gifts where post_id = t.id and from_user = me) then return 'already'; end if;
  if coalesce(p_card->>'rarity', '') <> t.rarity or (p_card->>'kind') is not null then return 'bad_card'; end if;

  insert into public.club_gifts (post_id, to_user, from_user, card)
    values (t.id, t.user_id, me, p_card);
  update public.club_posts set filled = filled + 1 where id = t.id;
  return 'ok';
end $$;

-- ── 受け取る ──────────────────────────────────────────
create function public.club_gift_count() returns integer
language sql
security definer
set search_path = public
stable
as $$ select count(*)::integer from public.club_gifts where to_user = auth.uid() $$;

-- 受け取ると同時に消える（同じカードを二重に受け取らないため）
create function public.claim_club_gifts() returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return query delete from public.club_gifts where to_user = auth.uid() returning card;
end $$;

-- ── 権限（RPC は全部ログイン済みだけ） ──────────────────────
revoke all on function public.search_clubs(text, integer)                  from public, anon;
revoke all on function public.find_club_by_code(text)                      from public, anon;
revoke all on function public.create_club(text, text, text, text, integer) from public, anon;
revoke all on function public.join_club(uuid)                              from public, anon;
revoke all on function public.cancel_club_request(uuid)                    from public, anon;
revoke all on function public.my_club_requests()                           from public, anon;
revoke all on function public.list_club_requests()                         from public, anon;
revoke all on function public.approve_club_request(uuid)                   from public, anon;
revoke all on function public.reject_club_request(uuid)                    from public, anon;
revoke all on function public.leave_club()                                 from public, anon;
revoke all on function public.kick_club_member(uuid)                       from public, anon;
revoke all on function public.update_club(text, text, text, text, integer) from public, anon;
revoke all on function public.club_feed()                                  from public, anon;
revoke all on function public.post_club_message(integer)                   from public, anon;
revoke all on function public.post_club_request(text)                      from public, anon;
revoke all on function public.donate_club_card(uuid, jsonb)                from public, anon;
revoke all on function public.club_gift_count()                            from public, anon;
revoke all on function public.claim_club_gifts()                           from public, anon;

grant execute on function public.search_clubs(text, integer)                  to authenticated;
grant execute on function public.find_club_by_code(text)                      to authenticated;
grant execute on function public.create_club(text, text, text, text, integer) to authenticated;
grant execute on function public.join_club(uuid)                              to authenticated;
grant execute on function public.cancel_club_request(uuid)                    to authenticated;
grant execute on function public.my_club_requests()                           to authenticated;
grant execute on function public.list_club_requests()                         to authenticated;
grant execute on function public.approve_club_request(uuid)                   to authenticated;
grant execute on function public.reject_club_request(uuid)                    to authenticated;
grant execute on function public.leave_club()                                 to authenticated;
grant execute on function public.kick_club_member(uuid)                       to authenticated;
grant execute on function public.update_club(text, text, text, text, integer) to authenticated;
grant execute on function public.club_feed()                                  to authenticated;
grant execute on function public.post_club_message(integer)                   to authenticated;
grant execute on function public.post_club_request(text)                      to authenticated;
grant execute on function public.donate_club_card(uuid, jsonb)                to authenticated;
grant execute on function public.club_gift_count()                            to authenticated;
grant execute on function public.claim_club_gifts()                           to authenticated;
