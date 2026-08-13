-- JPEL: v2.0.3 の掲示板まわりで流すもの（この1本だけ）
--
-- drop table はありません。走友会・フレンド・対戦履歴のデータは消えません。
-- 何回流しても同じ状態になります。
--
-- 中身は3本。**この順で入っています。順番に意味があります。**
--   1. club_text.sql        本文と部屋番号の列を足し、書き込みの関数を2つ足す
--   2. club_feed.sql        掲示板を読む関数を、足した列ごと作り直す
--   3. profiles_titles.sql  フレンドの通算優勝を部ごとに持つ（まだ流していないもの）
--
-- 2 を 1 より先に流すと、列が無い状態で読む関数を作ることになります。
-- club_feed は「このファイルだけが定義を持つ」決まりなので、
-- 中身を直すときは supabase/club_feed.sql を直してから、この束を作り直してください。


-- ==========================================================================
-- 1/3  club_text.sql
-- ==========================================================================

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


-- ==========================================================================
-- 2/3  club_feed.sql
-- ==========================================================================

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

-- ── この関数が要るもの（club_text.sql と同じ。すでにあれば何も起きない）──
-- 掲示板の本文と、対戦の募集の部屋番号。club_text.sql を先に流していれば何も起きない
alter table public.club_posts add column if not exists body text not null default '';
alter table public.club_posts add column if not exists room_code text not null default '';

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
  body text, room_code text,
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
           t.body, t.room_code,
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


-- ==========================================================================
-- 3/3  profiles_titles.sql
-- ==========================================================================

-- 通算優勝を「部ごと」に持たせる（1部/2部/3部）。
--
-- ■なぜ足すのか
--   `profiles.champs` は合計1つの整数しか持てないので、フレンドのカードには
--   「通算優勝 3回」としか出せなかった。**3部で3回**と**1部で3回**が同じ数字になる。
--   本編側は既に部ごと（`utils/teamHistory` の `titles`）で出しているので、
--   フレンドに送る側だけが合計のまま取り残されていた。
--
-- ■なぜ列を増やすのか（champs を作り変えないのか）
--   古いアプリを入れたままの人が `champs` を読んでいる。作り変えると、その人の画面から
--   数字が消える。**`champs` は今までどおり合計を入れ続け、内訳はこの列に足すだけ**。
--   新しい版は内訳があればそれを出し、無ければ従来どおり合計を出す。
--
-- ■中身
--   `{"1部": 2, "2部": 0, "3部": 1}` の形。0の部は入れない（無い＝0）。
--   キーは `types` の `Division` そのまま。
alter table public.profiles
  add column if not exists titles jsonb not null default '{}'::jsonb;

comment on column public.profiles.titles is
  '部ごとの通算優勝。{"1部":2,"3部":1} の形。champs（合計）は互換のため残す';
