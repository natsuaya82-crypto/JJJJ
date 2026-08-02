-- ============================================================
-- 走友会のカードまわり（2.0.1 追加ぶん・その2）
--
-- clubs.sql → clubs_roles.sql のあとに、この1本を流す。
-- drop table は一切無いので、間違って流し直してもデータは消えない。
--
-- 変えるもの
--  ・お願いする側：5枚（3枚／1枚）を1枚ずつ別々の種類で頼めるようにする。
--    今までは1件につき種類は1つだけだった。club_posts.stats に1枚ぶんずつ入れる。
--  ・渡す側：1人1枚までの縛りを外して、一度に何枚でも渡せるようにする。
--    どの枠が埋まったかは club_posts.taken で持つ。
--  ・届いたカードを「誰から・何のカードか」付きで読めるようにする（通知用）。
--    1枚ずつ受け取れる claim_club_gift も足す。
-- ============================================================

begin;

-- ── お願い1件のなかの「1枚ずつの希望」 ─────────────────
-- 長さは枚数ぶん。'' は「その枠はおまかせ」。
alter table public.club_posts add column if not exists stats text[] not null default '{}';

-- ── 埋まった枠 ─────────────────────────────────────────
-- 「何枚目が埋まったか」は、渡したカードの行ではなくお願いの側に持たせる。
-- カードは受け取られると行ごと消えるので、カード側で数えると
-- 受け取ったとたんに枠が空きに戻り、いつまでも集め続けられてしまう。
alter table public.club_posts add column if not exists taken integer[] not null default '{}';

-- 既にあるぶんは、集まった枚数ぶんだけ先頭から埋まっていたことにする。
update public.club_posts
   set taken = coalesce((select array_agg(g) from generate_series(0, filled - 1) g), '{}')
 where kind = 'req' and filled > 0 and cardinality(taken) = 0;

-- ── 渡したカードが何枚目の枠を埋めたか（控え） ─────────
alter table public.club_gifts add column if not exists slot integer not null default 0;

-- 既にあるぶんに通し番号を振ってから、1人1枚の縛りを外す。
-- （順番を決めないと同じ番号が並んで、このあとの unique が付けられない）
with n as (
  select id, (row_number() over (partition by post_id order by created_at, id) - 1) as k
  from public.club_gifts
)
update public.club_gifts g set slot = n.k from n where n.id = g.id;

alter table public.club_gifts drop constraint if exists club_gifts_once;

-- ── まだ埋まっていない枠が欲しい種類 ───────────────────
-- 返すのは枠の並び順。例：{speed,'',stamina} なら
-- 「スピード1枚・おまかせ1枚・スタミナ1枚がまだ空いている」。
drop function if exists public.club_open_stats(uuid, text, text[], text);

create or replace function public.club_open_stats(
  p_rarity text, p_stats text[], p_stat text, p_taken integer[]
) returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(w.s order by w.i), '{}'::text[])
  from (
    select i, coalesce(p_stats[i], nullif(p_stat, ''), '') as s
    from generate_series(1, case p_rarity when 'normal' then 5 when 'rare' then 3 when 'epic' then 1 else 0 end) as i
  ) w
  where not (w.i - 1 = any (coalesce(p_taken, '{}'::integer[])))
$$;

-- ── お願いを出す（1枚ずつ種類を指定できる） ─────────────
-- 引数が増えるので古いものは消す。p_stats を渡さなければ今まで通り。
drop function if exists public.post_club_request(text, text);
drop function if exists public.post_club_request(text);

create function public.post_club_request(
  p_rarity text, p_stat text default '', p_stats text[] default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); my_club uuid; cap integer; ss text[] := '{}'; v text; i integer;
begin
  if me is null then return 'not_in_club'; end if;
  my_club := public.my_club_id();
  if my_club is null then return 'not_in_club'; end if;
  if coalesce(p_rarity, '') not in ('normal', 'rare', 'epic') then return 'bad_rarity'; end if;

  cap := public.club_req_cap(p_rarity);
  for i in 1..cap loop
    v := coalesce(case when p_stats is null then null else p_stats[i] end, coalesce(p_stat, ''));
    if v not in ('', 'speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery') then
      v := '';
    end if;
    ss := ss || v;
  end loop;

  if exists (
    select 1 from public.club_posts
    where user_id = me and kind = 'req'
      and (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date
  ) then return 'today_done'; end if;

  -- stat（1件まるごとの指定）は使わなくなったので空にしておく。
  -- 古いアプリが読んでも「おまかせ」に見えるだけで、実際の判定は stats を見る。
  insert into public.club_posts (club_id, user_id, kind, rarity, stat, stats)
    values (my_club, me, 'req', p_rarity, '', ss);
  return 'ok';
end $$;

-- ── カードをまとめて渡す ───────────────────────────────
-- 返り値は {"status":"ok","given":3,"ids":["...","..."]}。
-- ids は実際に渡せたカードのid。渡せたぶんだけ手元から減らすために返す。
-- status は ok / not_found / mine / full / bad_card。
create or replace function public.donate_club_cards(p_post uuid, p_cards jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); t public.club_posts%rowtype; cap integer;
  free_slots integer[] := '{}'; want text[] := '{}';
  c jsonb; i integer; k integer; picked integer; ids text[] := '{}';
begin
  if me is null then return jsonb_build_object('status', 'not_found', 'given', 0, 'ids', '[]'::jsonb); end if;

  select * into t from public.club_posts where id = p_post and club_id = public.my_club_id();
  if not found or t.kind <> 'req' then
    return jsonb_build_object('status', 'not_found', 'given', 0, 'ids', '[]'::jsonb);
  end if;
  if t.user_id = me then
    return jsonb_build_object('status', 'mine', 'given', 0, 'ids', '[]'::jsonb);
  end if;

  cap := public.club_req_cap(t.rarity);
  for i in 1..cap loop
    if not (i - 1 = any (coalesce(t.taken, '{}'::integer[]))) then
      free_slots := free_slots || (i - 1);
      want := want || coalesce(t.stats[i], nullif(t.stat, ''), '');
    end if;
  end loop;
  if array_length(free_slots, 1) is null then
    return jsonb_build_object('status', 'full', 'given', 0, 'ids', '[]'::jsonb);
  end if;

  for c in select * from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) loop
    -- レジェンドや完全休養は渡せない。レアリティ違いもここで弾く。
    if coalesce(c->>'rarity', '') <> t.rarity or (c->>'kind') is not null then continue; end if;

    -- 種類の指定がある枠から先に埋める。
    -- おまかせ枠を先に潰すと、指定枠に合うカードの行き場が無くなって渡せる枚数が減る。
    picked := null;
    for k in 1..coalesce(array_length(free_slots, 1), 0) loop
      if want[k] <> '' and want[k] = coalesce(c->>'statKey', '') then picked := k; exit; end if;
    end loop;
    if picked is null then
      for k in 1..coalesce(array_length(free_slots, 1), 0) loop
        if want[k] = '' then picked := k; exit; end if;
      end loop;
    end if;
    if picked is null then continue; end if;

    insert into public.club_gifts (post_id, to_user, from_user, card, slot)
      values (t.id, t.user_id, me, c, free_slots[picked]);
    ids := ids || (c->>'id');
    t.taken := coalesce(t.taken, '{}'::integer[]) || free_slots[picked];

    free_slots := free_slots[1:picked - 1] || free_slots[picked + 1:];
    want := want[1:picked - 1] || want[picked + 1:];
    if array_length(free_slots, 1) is null then exit; end if;
  end loop;

  -- 埋まった枠はお願いの側に残す。カードは受け取られると消えるので、
  -- カードの行を数えると受け取ったとたんに枠が空きに戻ってしまう。
  update public.club_posts
     set taken = t.taken, filled = coalesce(cardinality(t.taken), 0)
   where id = t.id;

  return jsonb_build_object(
    'status', case when array_length(ids, 1) is null then 'bad_card' else 'ok' end,
    'given',  coalesce(array_length(ids, 1), 0),
    'ids',    to_jsonb(ids)
  );
end $$;

-- 1枚だけ渡す古い窓口は、まとめて渡す方に任せる（古いアプリ向け）。
create or replace function public.donate_club_card(p_post uuid, p_card jsonb) returns text
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb;
begin
  r := public.donate_club_cards(p_post, jsonb_build_array(p_card));
  return r->>'status';
end $$;

-- ── 掲示板（1枚ずつの希望と、まだ空いている枠を返す） ───
drop function if exists public.club_feed();

create function public.club_feed()
returns table (
  id uuid, user_id uuid, kind text, phrase integer, rarity text, stat text,
  stats text[], open_stats text[],
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

  -- 別名（old）は必須。返り値の列名にも created_at があるので、
  -- 付けないと column reference "created_at" is ambiguous でこの関数ごと落ちる。
  delete from public.club_posts old where old.created_at < now() - interval '3 days';

  return query
    select t.id, t.user_id, t.kind, t.phrase, t.rarity, t.stat,
           t.stats, public.club_open_stats(t.rarity, t.stats, t.stat, t.taken),
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

-- ── 届いたカードを「誰から」付きで読む（通知用） ────────
create or replace function public.club_gift_list()
returns table (id uuid, card jsonb, from_name text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select g.id, g.card, coalesce(nullif(p.team_name, ''), '走友会のなかま'), g.created_at
  from public.club_gifts g
  left join public.profiles p on p.user_id = g.from_user
  where g.to_user = auth.uid()
  order by g.created_at
  limit 100
$$;

-- 1枚だけ受け取る。受け取れたらそのカードを返す（無ければ null）。
create or replace function public.claim_club_gift(p_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c jsonb;
begin
  delete from public.club_gifts where id = p_id and to_user = auth.uid() returning card into c;
  return c;
end $$;

-- ── 権限 ───────────────────────────────────────────────
revoke all on function public.club_open_stats(text, text[], text, integer[]) from public, anon;
revoke all on function public.post_club_request(text, text, text[])         from public, anon;
revoke all on function public.donate_club_cards(uuid, jsonb)                from public, anon;
revoke all on function public.donate_club_card(uuid, jsonb)                 from public, anon;
revoke all on function public.club_feed()                                   from public, anon;
revoke all on function public.club_gift_list()                              from public, anon;
revoke all on function public.claim_club_gift(uuid)                         from public, anon;

grant execute on function public.club_open_stats(text, text[], text, integer[]) to authenticated;
grant execute on function public.post_club_request(text, text, text[])         to authenticated;
grant execute on function public.donate_club_cards(uuid, jsonb)                to authenticated;
grant execute on function public.donate_club_card(uuid, jsonb)                 to authenticated;
grant execute on function public.club_feed()                                   to authenticated;
grant execute on function public.club_gift_list()                              to authenticated;
grant execute on function public.claim_club_gift(uuid)                         to authenticated;

commit;
