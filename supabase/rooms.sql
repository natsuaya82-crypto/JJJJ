-- ============================================================
-- JPEL Manager オンライン対戦（部屋番号式） スキーマ
-- Supabaseダッシュボード → SQL Editor に全文貼り付けて Run。
-- 何度流しても壊れないよう、作り直し前提（drop → create）で書いてあります。
--
-- ※ schema.sql（フレンド機能）を流し直したときは、このファイルも流し直すこと。
--    profiles / rosters に「同じ部屋のメンバーなら見える」ポリシーを足しているため、
--    schema.sql の drop ... cascade でそのポリシーだけ巻き添えで消えます。
--
-- 設計メモ
--  ・部屋は6桁の数字。番号を知っている人だけが入れる（総当たり防止で検索はRPC限定）。
--  ・3〜20チーム。人間が足りないぶんはホストのセーブからCPUを入れる（クライアント側の処理）。
--  ・試合中のやりとりは Realtime のブロードキャストで行い、このDBは
--    「部屋の在席」と「終わった試合の戦績」だけを持つ。
-- ============================================================

-- ── 後片付け（再実行用） ────────────────────────────────
drop function if exists public.finish_match(uuid, jsonb, jsonb)  cascade;
drop function if exists public.start_room(uuid, jsonb)           cascade;
drop function if exists public.kick_member(uuid, uuid)           cascade;
drop function if exists public.leave_room(uuid)                  cascade;
drop function if exists public.join_room(text)                   cascade;
drop function if exists public.create_room(jsonb, integer)       cascade;
drop function if exists public.close_stale_rooms()               cascade;
drop function if exists public.is_room_member(uuid)              cascade;
drop function if exists public.shares_room_with(uuid)            cascade;
drop function if exists public.new_room_code()                   cascade;
drop table    if exists public.match_results                     cascade;
drop table    if exists public.matches                           cascade;
drop table    if exists public.room_members                      cascade;
drop table    if exists public.rooms                             cascade;
drop policy   if exists profiles_select_room on public.profiles;
drop policy   if exists rosters_select_room  on public.rosters;

-- ── 部屋 ────────────────────────────────────────────────
create table public.rooms (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null,                    -- 6桁の数字
  host        uuid        not null references auth.users(id) on delete cascade,
  status      text        not null default 'lobby',    -- lobby / playing / closed
  rules       jsonb       not null default '{}'::jsonb,-- レース数・メンバー範囲・コース・CPU設定
  max_players integer     not null default 20,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '3 hours',
  constraint rooms_code_format  check (code ~ '^[0-9]{6}$'),
  constraint rooms_status_valid check (status in ('lobby', 'playing', 'closed')),
  constraint rooms_max_valid    check (max_players between 3 and 20)
);
-- 「生きている部屋の中では番号がユニーク」。閉じた部屋の番号は再利用できる。
create unique index rooms_live_code_idx on public.rooms (code) where status <> 'closed';
create index rooms_host_idx on public.rooms (host);

-- 6桁の部屋番号を採番。生きている部屋と重複しない値が出るまで引き直す。
create function public.new_room_code() returns text
language plpgsql
security definer
set search_path = public
as $$
declare c text;
begin
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.rooms where code = c and status <> 'closed');
  end loop;
  return c;
end $$;

-- ── 参加者 ──────────────────────────────────────────────
-- seat は入室順の席番号（1始まり）。表示順とチームIDの割り当てに使う。
-- left_at が入っている＝離脱（＝不戦敗）。行は残す（結果表示と戦績のため）。
create table public.room_members (
  room_id   uuid        not null references public.rooms(id) on delete cascade,
  user_id   uuid        not null references auth.users(id)   on delete cascade,
  seat      integer     not null,
  ready     boolean     not null default false,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (room_id, user_id),
  constraint room_members_seat_valid check (seat between 1 and 20)
);
create index room_members_user_idx on public.room_members (user_id);

-- ── 試合結果（戦績・履歴） ──────────────────────────────
create table public.matches (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        references public.rooms(id) on delete set null,
  host        uuid        not null references auth.users(id) on delete cascade,
  rules       jsonb       not null default '{}'::jsonb,
  summary     jsonb       not null default '{}'::jsonb,  -- レースごとの区間・タイム（表示用）
  finished_at timestamptz not null default now()
);
create index matches_host_idx on public.matches (host);

create table public.match_results (
  match_id uuid    not null references public.matches(id) on delete cascade,
  user_id  uuid    not null references auth.users(id)     on delete cascade,
  rank     integer not null,
  points   integer not null default 0,
  forfeit  boolean not null default false,   -- 切断による不戦敗
  primary key (match_id, user_id)
);
create index match_results_user_idx on public.match_results (user_id);

-- 通算戦績（表示用のカウンタ。集計元は match_results）
alter table public.profiles add column if not exists mp_played   integer not null default 0;
alter table public.profiles add column if not exists mp_wins     integer not null default 0;
alter table public.profiles add column if not exists mp_forfeits integer not null default 0;

create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();

-- ============================================================
-- RLS
--   部屋の中身が見えるのは、その部屋にいる人だけ。
--   番号での検索は join_room() だけに許し、総当たりで他人の部屋を覗けないようにする。
--
--   ※ ポリシーの中から room_members を直接 select すると自己参照で無限再帰になるため、
--     判定は security definer 関数（RLSを迂回する）に逃がしている。
-- ============================================================
create function public.is_room_member(p_room uuid) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.room_members m
                  where m.room_id = p_room and m.user_id = auth.uid());
$$;

-- 相手と同じ部屋にいるか（プロフィール／ロスターの相互閲覧に使う）
create function public.shares_room_with(p_user uuid) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.room_members me
      join public.room_members other on other.room_id = me.room_id
      join public.rooms r            on r.id = me.room_id
     where me.user_id = auth.uid()
       and other.user_id = p_user
       and r.status <> 'closed'
  );
$$;

alter table public.rooms         enable row level security;
alter table public.room_members  enable row level security;
alter table public.matches       enable row level security;
alter table public.match_results enable row level security;

-- rooms: 自分がいる部屋だけ見える。作成・変更は関数経由のみ。
create policy rooms_select_member on public.rooms
  for select to authenticated using (public.is_room_member(rooms.id));

-- room_members: 同じ部屋のメンバーだけ見える。ready の切り替えは自分の行のみ。
create policy room_members_select_same on public.room_members
  for select to authenticated using (public.is_room_member(room_members.room_id));
create policy room_members_update_own on public.room_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- profiles / rosters: 同じ部屋にいる相手は見える（フレンドでなくてもロビーに名前が出る・対戦できる）
create policy profiles_select_room on public.profiles
  for select to authenticated using (public.shares_room_with(profiles.user_id));
create policy rosters_select_room on public.rosters
  for select to authenticated using (public.shares_room_with(rosters.user_id));

-- matches / match_results: 自分が出た試合だけ見える。書き込みは finish_match() のみ。
create policy matches_select_mine on public.matches
  for select to authenticated using (
    exists (select 1 from public.match_results mr
             where mr.match_id = matches.id and mr.user_id = auth.uid())
  );
create policy match_results_select_mine on public.match_results
  for select to authenticated using (
    exists (select 1 from public.match_results mine
             where mine.match_id = match_results.match_id and mine.user_id = auth.uid())
  );

-- ============================================================
-- 関数（アプリから呼ぶ入口）
-- ============================================================

-- 期限切れ・空になった部屋を閉じる。入室や作成のたびに軽く呼ぶ。
create function public.close_stale_rooms() returns void
language sql
security definer
set search_path = public
as $$
  update public.rooms set status = 'closed'
   where status <> 'closed'
     and (expires_at < now()
          or not exists (select 1 from public.room_members m
                          where m.room_id = rooms.id and m.left_at is null));
$$;

-- 部屋を作る。作った人がホストで、席1に入る。
-- 自分が持っていた古い部屋は閉じる（部屋の乱立防止）。
create function public.create_room(p_rules jsonb default '{}'::jsonb, p_max integer default 20)
returns table (room_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_code text; v_max integer;
begin
  perform public.close_stale_rooms();
  v_max := least(greatest(coalesce(p_max, 20), 3), 20);

  update public.rooms set status = 'closed' where host = auth.uid() and status <> 'closed';

  v_code := public.new_room_code();
  insert into public.rooms (code, host, rules, max_players)
    values (v_code, auth.uid(), coalesce(p_rules, '{}'::jsonb), v_max)
    returning id into v_id;
  insert into public.room_members (room_id, user_id, seat) values (v_id, auth.uid(), 1);

  return query select v_id, v_code;
end $$;

-- 番号で入室する。戻り値の status は
--   joined / not_found / full / started / closed
create function public.join_room(p_code text)
returns table (status text, room_id uuid, seat integer)
language plpgsql
security definer
set search_path = public
as $$
declare r public.rooms%rowtype; v_seat integer; v_count integer;
begin
  perform public.close_stale_rooms();

  -- ※ この関数の戻り値の列名（status / room_id / seat）と、テーブルの列名が同じなので、
  --   中の SQL では必ずテーブルの別名を付けること。付け忘れるとPostgresが
  --   どちらを指すのか判断できず、実行時にエラー（＝アプリでは通信エラー）になる。
  select * into r from public.rooms rm
   where rm.code = regexp_replace(coalesce(p_code, ''), '\D', '', 'g') and rm.status <> 'closed'
   limit 1;
  if r.id is null then return query select 'not_found'::text, null::uuid, null::integer; return; end if;
  if r.status = 'playing' then
    -- すでに参加している人の再入室（アプリを閉じて戻ってきた場合）は通す
    if exists (select 1 from public.room_members m where m.room_id = r.id and m.user_id = auth.uid()) then
      update public.room_members m set left_at = null
       where m.room_id = r.id and m.user_id = auth.uid()
       returning m.seat into v_seat;
      return query select 'joined'::text, r.id, v_seat; return;
    end if;
    return query select 'started'::text, null::uuid, null::integer; return;
  end if;

  -- 既に入っている場合はそのまま席を返す
  select m.seat into v_seat from public.room_members m
   where m.room_id = r.id and m.user_id = auth.uid();
  if v_seat is not null then
    update public.room_members m set left_at = null
     where m.room_id = r.id and m.user_id = auth.uid();
    return query select 'joined'::text, r.id, v_seat; return;
  end if;

  select count(*) into v_count from public.room_members m
   where m.room_id = r.id and m.left_at is null;
  if v_count >= r.max_players then
    return query select 'full'::text, null::uuid, null::integer; return;
  end if;

  -- 空いている最小の席番号を取る
  select min(s) into v_seat from generate_series(1, r.max_players) s
   where not exists (select 1 from public.room_members m where m.room_id = r.id and m.seat = s);

  insert into public.room_members (room_id, user_id, seat) values (r.id, auth.uid(), v_seat);
  return query select 'joined'::text, r.id, v_seat;
end $$;

-- 退室する。ホストが抜けたら部屋ごと解散。
create function public.leave_room(p_room uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid; v_status text;
begin
  select host, status into v_host, v_status from public.rooms where id = p_room;
  if v_host is null then return 'not_found'; end if;

  if v_status = 'playing' then
    -- 試合中の離脱は「不戦敗」の記録が要るので行は残す
    update public.room_members set left_at = now(), ready = false
     where room_id = p_room and user_id = auth.uid();
  else
    delete from public.room_members where room_id = p_room and user_id = auth.uid();
  end if;

  if v_host = auth.uid() then
    update public.rooms set status = 'closed' where id = p_room;
    return 'closed';
  end if;
  perform public.close_stale_rooms();
  return 'left';
end $$;

-- ホストが参加者を退出させる（キック）。
create function public.kick_member(p_room uuid, p_user uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid;
begin
  select host into v_host from public.rooms where id = p_room;
  if v_host is null then return 'not_found'; end if;
  if v_host <> auth.uid() then return 'not_host'; end if;
  if p_user = auth.uid() then return 'self'; end if;
  delete from public.room_members where room_id = p_room and user_id = p_user;
  return 'kicked';
end $$;

-- ホストが試合を開始する。以後この部屋には新規入室できない。
create function public.start_room(p_room uuid, p_rules jsonb default '{}'::jsonb) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid; v_count integer;
begin
  select host into v_host from public.rooms where id = p_room;
  if v_host is null then return 'not_found'; end if;
  if v_host <> auth.uid() then return 'not_host'; end if;

  select count(*) into v_count from public.room_members
   where room_id = p_room and left_at is null;
  if v_count < 1 then return 'empty'; end if;

  update public.rooms
     set status = 'playing', rules = coalesce(p_rules, rules),
         expires_at = now() + interval '3 hours'
   where id = p_room;
  return 'started';
end $$;

-- 試合結果を確定する（ホストのみ）。同じ部屋で二重に確定はできない。
-- p_results は [{ "user_id": "...", "rank": 1, "points": 34, "forfeit": false }, ...]
create function public.finish_match(p_room uuid, p_summary jsonb, p_results jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid; v_rules jsonb; v_match uuid;
begin
  select host, rules into v_host, v_rules from public.rooms where id = p_room;
  if v_host is null then raise exception 'room not found'; end if;
  if v_host <> auth.uid() then raise exception 'not host'; end if;
  if exists (select 1 from public.matches where room_id = p_room) then
    raise exception 'already finished';
  end if;

  insert into public.matches (room_id, host, rules, summary)
    values (p_room, auth.uid(), v_rules, coalesce(p_summary, '{}'::jsonb))
    returning id into v_match;

  -- 部屋にいた人のぶんだけ記録する（部外者のIDを混ぜられないようにする）
  insert into public.match_results (match_id, user_id, rank, points, forfeit)
  select v_match,
         (e->>'user_id')::uuid,
         coalesce((e->>'rank')::integer, 99),
         coalesce((e->>'points')::integer, 0),
         coalesce((e->>'forfeit')::boolean, false)
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) e
   where exists (select 1 from public.room_members m
                  where m.room_id = p_room and m.user_id = (e->>'user_id')::uuid)
  on conflict do nothing;

  -- 通算戦績
  update public.profiles p set
    mp_played   = p.mp_played + 1,
    mp_wins     = p.mp_wins     + (case when mr.rank = 1 and not mr.forfeit then 1 else 0 end),
    mp_forfeits = p.mp_forfeits + (case when mr.forfeit then 1 else 0 end)
   from public.match_results mr
  where mr.match_id = v_match and mr.user_id = p.user_id;

  update public.rooms set status = 'closed' where id = p_room;
  return v_match;
end $$;

-- ── 実行権限（ログイン済み端末のみ） ──────────────────────
revoke all on function public.create_room(jsonb, integer)      from public, anon;
revoke all on function public.join_room(text)                  from public, anon;
revoke all on function public.leave_room(uuid)                 from public, anon;
revoke all on function public.kick_member(uuid, uuid)          from public, anon;
revoke all on function public.start_room(uuid, jsonb)          from public, anon;
revoke all on function public.finish_match(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_room(jsonb, integer)      to authenticated;
grant execute on function public.join_room(text)                  to authenticated;
grant execute on function public.leave_room(uuid)                 to authenticated;
grant execute on function public.kick_member(uuid, uuid)          to authenticated;
grant execute on function public.start_room(uuid, jsonb)          to authenticated;
grant execute on function public.finish_match(uuid, jsonb, jsonb) to authenticated;
