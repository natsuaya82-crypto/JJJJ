-- ============================================================
-- 走友会の追加ぶん（2.0.1）
--
-- clubs.sql を流したあとに、この1本を流す。
-- ここには drop table が一切無いので、間違って流し直してもデータは消えない。
--
-- 足すもの
--  ・役割「副会長」（admin）。1つの走友会に3人まで。
--    走友会の設定を変える／加入申請の承認・却下／メンバーを外す ができる。
--    副会長は、会長と他の副会長を外せない。任命と解任は会長だけ。
--  ・会長が抜けたときは副会長へ引き継ぐ（副会長がいなければ今まで通り最古参へ）。
--  ・カードのお願いに「どの種類が欲しいか」を足す（club_posts.stat）。
--    空文字＝おまかせ。指定があると、その種類のカードしか渡せない。
--  ・フレンドの所属走友会を、名前とロゴだけ引ける窓口（clubs_of_users）。
-- ============================================================

begin;

-- ── 役割に admin（副会長）を足す ───────────────────────
alter table public.club_members drop constraint if exists club_members_role;
alter table public.club_members add  constraint club_members_role
  check (role in ('owner', 'admin', 'member'));

-- ── お願いするカードの種類 ─────────────────────────────
-- '' は「種類はおまかせ」。それ以外はアプリ側の statKey と同じ文字を入れる。
alter table public.club_posts add column if not exists stat text not null default '';
alter table public.club_posts drop constraint if exists club_posts_stat;
alter table public.club_posts add  constraint club_posts_stat
  check (stat in ('', 'speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery'));

-- ── 役割を引く小道具 ───────────────────────────────────
-- RLS を通さずに引きたいので security definer。中からしか呼ばない。
create or replace function public.my_club_role() returns text
language sql
security definer
set search_path = public
stable
as $$ select role from public.club_members where user_id = auth.uid() $$;

-- 会長か副会長か（＝走友会をいじれる人）
create or replace function public.can_edit_club() returns boolean
language sql
security definer
set search_path = public
stable
as $$ select coalesce(public.my_club_role() in ('owner', 'admin'), false) $$;

-- ── 副会長の任命・解任（会長だけ） ─────────────────────
-- 'ok' / 'not_owner' / 'not_member' / 'too_many'（副会長は3人まで） / 'bad_role'
create or replace function public.set_club_role(p_user uuid, p_role text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare my_club uuid; now_role text; n integer;
begin
  if coalesce(p_role, '') not in ('admin', 'member') then return 'bad_role'; end if;
  select id into my_club from public.clubs where owner = auth.uid();
  if my_club is null then return 'not_owner'; end if;
  if p_user = auth.uid() then return 'bad_role'; end if;

  select role into now_role from public.club_members
    where user_id = p_user and club_id = my_club;
  if now_role is null or now_role = 'owner' then return 'not_member'; end if;
  if now_role = p_role then return 'ok'; end if;

  if p_role = 'admin' then
    select count(*) into n from public.club_members
      where club_id = my_club and role = 'admin';
    if n >= 3 then return 'too_many'; end if;
  end if;

  update public.club_members set role = p_role
    where user_id = p_user and club_id = my_club;
  return 'ok';
end $$;

-- ── 設定の変更を副会長にも開ける ───────────────────────
create or replace function public.update_club(
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
  where id = public.my_club_id() and public.can_edit_club()
$$;

-- ── 加入申請の一覧・承認・却下も副会長にも開ける ───────
create or replace function public.list_club_requests()
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
  where public.can_edit_club() and r.club_id = public.my_club_id()
  order by r.created_at
$$;

create or replace function public.approve_club_request(p_user uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare c public.clubs%rowtype;
begin
  if not public.can_edit_club() then return 'not_found'; end if;
  select * into c from public.clubs where id = public.my_club_id();
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

create or replace function public.reject_club_request(p_user uuid) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.club_requests
  where user_id = p_user
    and public.can_edit_club()
    and club_id = public.my_club_id()
$$;

-- ── メンバーを外す ─────────────────────────────────────
-- 会長：会長以外なら誰でも外せる。副会長：一般だけ外せる。
create or replace function public.kick_club_member(p_user uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare my_club uuid; my_role text; his_role text;
begin
  my_club := public.my_club_id();
  my_role := public.my_club_role();
  if my_club is null or p_user = auth.uid() then return; end if;
  if coalesce(my_role, '') not in ('owner', 'admin') then return; end if;

  select role into his_role from public.club_members
    where user_id = p_user and club_id = my_club;
  if his_role is null or his_role = 'owner' then return; end if;
  if my_role = 'admin' and his_role = 'admin' then return; end if;

  delete from public.club_members where user_id = p_user and club_id = my_club;
end $$;

-- ── 抜ける（会長は副会長へ引き継ぐ） ───────────────────
create or replace function public.leave_club() returns text
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
    -- まず副会長のいちばん古い人へ。いなければ今まで通り最古参へ。
    select user_id into next_user from public.club_members
      where club_id = my_club and role = 'admin' order by joined_at limit 1;
    if next_user is null then
      select user_id into next_user from public.club_members
        where club_id = my_club order by joined_at limit 1;
    end if;
    if next_user is null then
      delete from public.clubs where id = my_club;                       -- 誰もいなくなったら解散
      return 'disbanded';
    end if;
    update public.clubs set owner = next_user where id = my_club;
    update public.club_members set role = 'owner' where user_id = next_user;
  end if;
  return 'left';
end $$;

-- ── お願いに「種類」を足す ─────────────────────────────
-- 引数が増えるので古いほうは消す。p_stat には既定値があるので、
-- 古いアプリ（p_rarity だけ送る）からもそのまま呼べる。
drop function if exists public.post_club_request(text);

create function public.post_club_request(p_rarity text, p_stat text default '') returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid; s text;
begin
  if me is null then return 'not_in_club'; end if;
  my_club := public.my_club_id();
  if my_club is null then return 'not_in_club'; end if;
  if coalesce(p_rarity, '') not in ('normal', 'rare', 'epic') then return 'bad_rarity'; end if;

  s := coalesce(p_stat, '');
  if s not in ('', 'speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery') then
    s := '';
  end if;

  if exists (
    select 1 from public.club_posts
    where user_id = me and kind = 'req'
      and (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date
  ) then return 'today_done'; end if;

  insert into public.club_posts (club_id, user_id, kind, rarity, stat)
    values (my_club, me, 'req', p_rarity, s);
  return 'ok';
end $$;

-- ── 渡すときに種類も見る ───────────────────────────────
create or replace function public.donate_club_card(p_post uuid, p_card jsonb) returns text
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
  if t.stat <> '' and coalesce(p_card->>'statKey', '') <> t.stat then return 'bad_card'; end if;

  insert into public.club_gifts (post_id, to_user, from_user, card)
    values (t.id, t.user_id, me, p_card);
  update public.club_posts set filled = filled + 1 where id = t.id;
  return 'ok';
end $$;

-- ── 掲示板に種類を出す ─────────────────────────────────
-- ★★ club_feed について ★★
--   この下の club_feed の定義は**古い**。列が足りないので、このファイルを流したあとは
--   必ず supabase/club_feed.sql を流し直すこと。
--   （club_feed は4つのファイルに書いてあり、後から流したものが前の列を消す。
--     カードの差し入れが「あと0枚」になって使えなくなる事故がこれで起きた）
-- 返す列が増えるので、いったん消してから作り直す（権限も付け直す）。
drop function if exists public.club_feed();

create function public.club_feed()
returns table (
  id uuid, user_id uuid, kind text, phrase integer, rarity text, stat text,
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

  -- ここは必ず別名（old）を付ける。返り値の列名にも created_at があるので、
  -- 別名なしだと column reference "created_at" is ambiguous でこの関数ごと落ちる。
  -- これが今まで掲示板が読めなかった原因。
  delete from public.club_posts old where old.created_at < now() - interval '3 days';

  return query
    select t.id, t.user_id, t.kind, t.phrase, t.rarity, t.stat,
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

-- ── フレンドの所属走友会（名前とロゴだけ） ─────────────
-- 走友会の名前はもともと検索で誰でも見えるので、隠す情報ではない。
-- 返す列が増えたので、いったん消してから作り直す。
-- （create or replace だけだと「戻り値の型が違う」と怒られる）
drop function if exists public.clubs_of_users(uuid[]);

create or replace function public.clubs_of_users(p_ids uuid[])
returns table (user_id uuid, club_id uuid, club_name text, club_logo text, club_code text)
language sql
security definer
set search_path = public
stable
as $$
  select m.user_id, c.id, c.name, c.logo_id, c.code
  from public.club_members m
  join public.clubs c on c.id = m.club_id
  where m.user_id = any(coalesce(p_ids, '{}'::uuid[]))
$$;

-- ── 権限 ───────────────────────────────────────────────
revoke all on function public.my_club_role()                    from public, anon;
revoke all on function public.can_edit_club()                   from public, anon;
revoke all on function public.set_club_role(uuid, text)         from public, anon;
revoke all on function public.post_club_request(text, text)     from public, anon;
revoke all on function public.club_feed()                       from public, anon;
revoke all on function public.clubs_of_users(uuid[])            from public, anon;

grant execute on function public.set_club_role(uuid, text)      to authenticated;
grant execute on function public.post_club_request(text, text)  to authenticated;
grant execute on function public.club_feed()                    to authenticated;
grant execute on function public.clubs_of_users(uuid[])         to authenticated;

commit;
