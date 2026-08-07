-- 走友会の掲示板を読む関数。**club_feed の定義はこのファイルだけ。**
--
-- ■なぜこのファイルを作ったのか（実際に起きた事故）
--   club_feed が4つのファイルに別々に書いてあった。
--     clubs.sql          … 最初の版
--     clubs_roles.sql    … stat を足した版
--     clubs_cards.sql    … stat / stats / open_stats を足した版
--     club_posts_cap.sql … 掲示板の掃除を足した版（**列は古いまま**）
--   どれも `drop function` してから作り直すので、**後から流したものが前の列を消す**。
--   build 88 のまとめ（bundle/build88_all.sql）には club_posts_cap.sql が入っていて
--   clubs_cards.sql は入っていなかったため、これを流した走友会では open_stats が
--   返らなくなった。アプリ側は「空いている枠が0」と受け取るので、
--   カードの差し入れで**全部のカードが薄いまま押せず、「あと0枚まで入ります」**になる。
--
-- ■決まり
--   club_feed を変えたくなったら**このファイルだけ**を直して流す。
--   他のファイルに書かないこと。列を1つ足すだけでも、書く場所が2つあれば必ず片方が消える。
--
-- 先に流しておくもの: clubs.sql / clubs_roles.sql
-- clubs_cards.sql をまだ流していなくても動くよう、この関数が要る列と club_open_stats も
-- 下に同梱してある（すでにあれば何も起きない）。
-- テーブルは作らない・消さない。何回流しても大丈夫。

-- ── この関数が要るもの（clubs_cards.sql と同じ。すでにあれば何も起きない）──
-- お願い1件のなかの「1枚ずつの希望」。長さは枚数ぶん。'' は「その枠はおまかせ」
alter table public.club_posts add column if not exists stats text[] not null default '{}';
-- 埋まった枠。カードは受け取られると行ごと消えるので、埋まりはお願いの側に持たせる
alter table public.club_posts add column if not exists taken integer[] not null default '{}';
-- 既にあるぶんは、集まった枚数ぶんだけ先頭から埋まっていたことにする
update public.club_posts
   set taken = coalesce((select array_agg(g) from generate_series(0, filled - 1) g), '{}')
 where kind = 'req' and filled > 0 and cardinality(taken) = 0;

-- まだ埋まっていない枠が欲しい種類。返すのは枠の並び順。
-- 例：{speed,'',stamina} なら「スピード1枚・おまかせ1枚・スタミナ1枚がまだ空いている」
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
revoke all     on function public.club_open_stats(text, text[], text, integer[]) from public, anon;
grant  execute on function public.club_open_stats(text, text[], text, integer[]) to authenticated;

-- ── 本体 ────────────────────────────────────────────
-- 返す列が変わるので、いったん落としてから作り直す（42P13 を避ける）。
-- 関数を落としてもデータは消えない。
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

  -- ── 掃除 ──────────────────────────────────────────
  -- 集まったお願いを下ろす。
  -- ただし「今日はもうお願いした」の判定（post_club_request）はこの行を見ているので、
  -- 当日ぶんは消さない。消すと、集まった人だけ同じ日にもう一度お願いできてしまう。
  delete from public.club_posts t
   where t.club_id = my_club
     and t.kind = 'req'
     and t.filled >= public.club_req_cap(t.rarity)
     and (t.created_at at time zone 'Asia/Tokyo')::date
       < (now() at time zone 'Asia/Tokyo')::date;

  -- 古い書き込みを落とす（別名 old は必須。返り値の列名にも created_at があるので、
  -- 付けないと column reference "created_at" is ambiguous でこの関数ごと落ちる）
  delete from public.club_posts old
   where old.club_id = my_club
     and old.created_at < now() - interval '3 days';

  -- 新しい順に300件だけ残す
  delete from public.club_posts t
   where t.id in (
     select x.id from (
       select p.id, row_number() over (order by p.created_at desc, p.id desc) as rn
         from public.club_posts p
        where p.club_id = my_club
     ) x
     where x.rn > 300
   );

  -- ── 本体 ──────────────────────────────────────────
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
    limit 100;
end $$;

revoke all     on function public.club_feed() from public, anon;
grant  execute on function public.club_feed() to authenticated;
