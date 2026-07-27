-- ============================================================
-- JPEL Manager フレンド機能 スキーマ（Supabase / PostgreSQL）
-- Supabaseダッシュボード → SQL Editor に全文貼り付けて Run。
-- 何度流しても壊れないよう、作り直し前提（drop → create）で書いてあります。
-- ============================================================

-- ── 後片付け（再実行用） ────────────────────────────────
drop function if exists public.remove_friend(uuid);
drop function if exists public.accept_friend_request(uuid);
drop function if exists public.send_friend_request(text);
drop function if exists public.find_by_code(text);
drop table if exists public.friend_requests;
drop table if exists public.friendships;
drop table if exists public.rosters;
drop table if exists public.profiles;
drop function if exists public.new_friend_code();
drop function if exists public.touch_updated_at();

-- ── プロフィール（フレンド一覧・詳細のヘッダーに出る情報） ──
create table public.profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  code            text        not null,                      -- フレンドコード（数字10桁）
  team_name       text        not null default '',
  short_name      text        not null default '',
  gm_name         text        not null default '',
  logo_id         text        not null default 'logo_01',
  color_primary   text        not null default '#122440',
  color_secondary text        not null default '#f5c842',
  champs          integer     not null default 0,            -- 通算優勝
  avg_ovr         integer     not null default 0,            -- 平均OVR（一覧の並べ替え用）
  updated_at      timestamptz not null default now(),        -- 「最終ログイン」表示にも使う
  constraint profiles_code_unique unique (code),
  constraint profiles_code_format check (code ~ '^[0-9]{10}$')
);

-- フレンドコードの採番。10桁の未使用値が出るまで引き直す。
create function public.new_friend_code() returns text
language plpgsql
security definer
set search_path = public
as $$
declare c text;
begin
  loop
    c := lpad((floor(random() * 10000000000))::bigint::text, 10, '0');
    exit when not exists (select 1 from public.profiles where code = c);
  end loop;
  return c;
end $$;

alter table public.profiles alter column code set default public.new_friend_code();

-- ── ロスター（相手に見せる選手スナップショット） ──────────
-- 一覧の読み込みが重くならないよう profiles とは別テーブルにする。
create table public.rosters (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  players    jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── フレンド関係（成立後。双方向に2行入れる） ──────────────
create table public.friendships (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  friend_id  uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
create index friendships_friend_idx on public.friendships (friend_id);

-- ── フレンド申請（承認待ちのものだけが残る） ────────────────
create table public.friend_requests (
  from_user  uuid        not null references auth.users(id) on delete cascade,
  to_user    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  constraint friend_requests_not_self check (from_user <> to_user)
);
create index friend_requests_to_idx on public.friend_requests (to_user);

-- ── updated_at 自動更新 ──────────────────────────────────
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger rosters_touch before update on public.rosters
  for each row execute function public.touch_updated_at();

-- ============================================================
-- RLS（行レベルセキュリティ）
--   書けるのは自分の行だけ。
--   読めるのは 自分 / フレンド / 申請でつながっている相手 だけ。
-- ============================================================
alter table public.profiles        enable row level security;
alter table public.rosters         enable row level security;
alter table public.friendships     enable row level security;
alter table public.friend_requests enable row level security;

-- profiles: 自分
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());
-- profiles: フレンド
create policy profiles_select_friend on public.profiles
  for select to authenticated using (
    exists (select 1 from public.friendships f
            where f.user_id = auth.uid() and f.friend_id = profiles.user_id)
  );
-- profiles: 申請中の相手（承認・申請タブにチーム名とロゴを出すため）
create policy profiles_select_pending on public.profiles
  for select to authenticated using (
    exists (select 1 from public.friend_requests r
            where (r.from_user = auth.uid() and r.to_user   = profiles.user_id)
               or (r.to_user   = auth.uid() and r.from_user = profiles.user_id))
  );
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- rosters: 自分とフレンドだけ（申請中の相手には見せない）
create policy rosters_select_own on public.rosters
  for select to authenticated using (user_id = auth.uid());
create policy rosters_select_friend on public.rosters
  for select to authenticated using (
    exists (select 1 from public.friendships f
            where f.user_id = auth.uid() and f.friend_id = rosters.user_id)
  );
create policy rosters_insert_own on public.rosters
  for insert to authenticated with check (user_id = auth.uid());
create policy rosters_update_own on public.rosters
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- friendships: 自分の行だけ見える／消せる（追加は関数経由のみ）
create policy friendships_select_own on public.friendships
  for select to authenticated using (user_id = auth.uid());
create policy friendships_delete_own on public.friendships
  for delete to authenticated using (user_id = auth.uid());

-- friend_requests: 自分が関わるものだけ。送信は自分名義のみ。取消・拒否は両者可。
create policy friend_requests_select on public.friend_requests
  for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
create policy friend_requests_insert on public.friend_requests
  for insert to authenticated with check (from_user = auth.uid());
create policy friend_requests_delete on public.friend_requests
  for delete to authenticated using (from_user = auth.uid() or to_user = auth.uid());

-- ============================================================
-- 関数（アプリから呼ぶ入口）
--   コード検索を関数に限定することで、名簿の総当たり取得を防ぐ。
-- ============================================================

-- コード完全一致で1件だけ返す（ロスターは返さない）
create function public.find_by_code(p_code text)
returns table (
  user_id uuid, code text, team_name text, short_name text, gm_name text,
  logo_id text, color_primary text, color_secondary text, champs integer, avg_ovr integer
)
language sql
security definer
set search_path = public
as $$
  select p.user_id, p.code, p.team_name, p.short_name, p.gm_name,
         p.logo_id, p.color_primary, p.color_secondary, p.champs, p.avg_ovr
  from public.profiles p
  where p.code = regexp_replace(p_code, '\s', '', 'g')
    and p.user_id <> auth.uid()
  limit 1;
$$;

-- 申請を送る。相手から既に申請が来ていた場合はその場で成立させる。
create function public.send_friend_request(p_code text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare target uuid;
begin
  select user_id into target from public.profiles
   where code = regexp_replace(p_code, '\s', '', 'g');
  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  if exists (select 1 from public.friendships
              where user_id = auth.uid() and friend_id = target) then
    return 'already_friends';
  end if;
  -- 相手からの申請が既にある＝相互申請なので成立
  if exists (select 1 from public.friend_requests
              where from_user = target and to_user = auth.uid()) then
    insert into public.friendships (user_id, friend_id)
      values (auth.uid(), target), (target, auth.uid())
      on conflict do nothing;
    delete from public.friend_requests
      where (from_user = target and to_user = auth.uid())
         or (from_user = auth.uid() and to_user = target);
    return 'accepted';
  end if;
  insert into public.friend_requests (from_user, to_user)
    values (auth.uid(), target) on conflict do nothing;
  return 'sent';
end $$;

-- 受け取った申請を承認する
create function public.accept_friend_request(p_from uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.friend_requests
                  where from_user = p_from and to_user = auth.uid()) then
    return 'not_found';
  end if;
  insert into public.friendships (user_id, friend_id)
    values (auth.uid(), p_from), (p_from, auth.uid())
    on conflict do nothing;
  delete from public.friend_requests
    where (from_user = p_from and to_user = auth.uid())
       or (from_user = auth.uid() and to_user = p_from);
  return 'accepted';
end $$;

-- フレンド解除（双方向まとめて消す）
create function public.remove_friend(p_friend uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships
   where (user_id = auth.uid() and friend_id = p_friend)
      or (user_id = p_friend   and friend_id = auth.uid());
  return 'removed';
end $$;

-- 関数の実行権限（ログイン済み＝匿名サインイン済みの端末のみ）
revoke all on function public.find_by_code(text)            from public, anon;
revoke all on function public.send_friend_request(text)     from public, anon;
revoke all on function public.accept_friend_request(uuid)   from public, anon;
revoke all on function public.remove_friend(uuid)           from public, anon;
grant execute on function public.find_by_code(text)          to authenticated;
grant execute on function public.send_friend_request(text)   to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid)         to authenticated;
