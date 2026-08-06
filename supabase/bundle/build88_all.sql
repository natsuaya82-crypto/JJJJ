-- JPEL: build 88 時点のまとめ（この1本を上から順に流せば5本ぶん全部入ります）
-- drop table は1つも入っていません。既存の走友会・フレンド・対戦履歴のデータは消えません。
-- （drop function は入っています。返す列が変わる関数は落としてから作り直す必要があるため。
--  関数を落としてもデータは消えません）
-- 中身は下の5本を順番につないだだけです:
--   1. club_reactions.sql   掲示板の反応スタンプ
--   2. club_posts_cap.sql   掲示板を新しい順に300件へ
--   3. clubs_roster.sql     走友会からロスターを見る
--   4. matches_detail.sql   対戦履歴の走者・区間タイム
--   5. matches_prune.sql    対戦履歴を60日で消す


-- ==========================================================================
-- 1/5  club_reactions.sql
-- ==========================================================================

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

-- ==========================================================================
-- 2/5  club_posts_cap.sql
-- ==========================================================================

-- 掲示板の残しかたを「3日」から「新しい順に300件」に変える。
--
-- 日数で切ると、走友会の賑わい方で残る量がまるで違う。人が多いところは3日でも
-- 数百件たまって流れが速すぎ、静かなところは3日で全部消えて何も残らない。
-- 件数で切れば、どの走友会でも同じだけさかのぼれる。
--
-- あわせて、枚数が集まったカードのお願いはその場で下ろす。
-- 「集まりました」だけが並んで掲示板が埋まり、いま出ているお願いが見えなくなるため。
-- （アプリ側でも伏せているが、消さないと行が残り続ける）
--
-- 掃除は書き込み時ではなく読み込み時にやる。走友会ごとに誰かが見にきたときだけ
-- 走ればよく、そのために別の仕組み（cron など）を用意しなくて済む。
-- 消すのは自分の走友会のぶんだけ。他所の掲示板を掃除しにいかない。
--
-- 先に流しておくもの: clubs.sql（club_posts / club_feed / my_club_id / club_req_cap）
-- 何回流しても大丈夫。
--
-- 返り値の列は clubs.sql の club_feed と1つも変えていない。
-- 変えると古いアプリから呼ばれたときに壊れる。

-- clubs.sql の club_feed と返す列が違うので、置き換える前に古い定義を落とす（42P13）。
-- 関数を落とすだけでデータは消えない
drop function if exists public.club_feed();

create or replace function public.club_feed()
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

  -- 集まったお願いを下ろす。
  -- ただし「今日はもうお願いした」の判定（post_club_request）はこの行を見ているので、
  -- 当日ぶんは消さない。消すと、集まった人だけ同じ日にもう一度お願いできてしまう。
  -- 画面のほうは埋まった時点で伏せているので、消えるのが翌日でも見え方は変わらない。
  delete from public.club_posts t
   where t.club_id = my_club
     and t.kind = 'req'
     and t.filled >= public.club_req_cap(t.rarity)
     and (t.created_at at time zone 'Asia/Tokyo')::date
       < (now() at time zone 'Asia/Tokyo')::date;

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
    limit 100;
end $$;

revoke all on function public.club_feed() from public;
grant execute on function public.club_feed() to authenticated;

-- ==========================================================================
-- 3/5  clubs_roster.sql
-- ==========================================================================

-- 走友会のメンバーのロスターを見られるようにする。
--
-- rosters は schema.sql で「自分」と「フレンド」しか読めない。
-- 走友会のメンバーはフレンドとは限らないので、メンバー一覧を長押ししても
-- ロスターが空で返ってきてしまう。同じ走友会の相手ぶんだけ読めるようにする。
--
-- profiles には同じ形の profiles_select_clubmate が clubs.sql に既にあるので、
-- 判定はそれと同じ my_club_id()（security definer）を使い回す。新しい関数は作らない。
--
-- テーブルは作らない・消さない。何回流しても大丈夫。
-- ただし clubs.sql / schema.sql を流し直したときは、この決まりごとも道連れで消える
-- （clubs.sql は my_club_id() を、schema.sql は rosters ごと作り直すため）。そのときはこれも流し直す。

drop policy if exists rosters_select_clubmate on public.rosters;

create policy rosters_select_clubmate on public.rosters
  for select to authenticated using (
    user_id in (select user_id from public.club_members where club_id = public.my_club_id())
  );

-- ==========================================================================
-- 4/5  matches_detail.sql
-- ==========================================================================

-- 対戦履歴の詳細（誰が何区を何秒で走ったか）。
--
-- 一覧に要るもの（順位・ポイント）は rooms.sql の match_results にある。
-- 詳細は1試合で数十KBになるので同じ行には入れず、別の表に置いて
-- 「その試合を開いたときだけ」読む。一覧のクエリを重くしないための分割。
--
-- 消えるタイミングは matches に合わせる（on delete cascade）。
-- matches は matches_prune.sql が60日で消すので、詳細も一緒に消えて溜まり続けない。
--
-- 先に流しておくもの: rooms.sql（matches / match_results / is_room_member）
-- 何回流しても大丈夫。

create table if not exists public.match_details (
  match_id uuid primary key references public.matches(id) on delete cascade,
  -- 形は src/lib/matchSim.ts の MatchDetail（v:1）。
  -- チーム名と選手名を配列にして添え字で参照し、キーも1文字にして詰めてある。
  detail   jsonb not null default '{}'::jsonb
);

alter table public.match_details enable row level security;

-- 見えるのは、その試合に出た人だけ（matches / match_results と同じ考え方）。
drop policy if exists match_details_select_mine on public.match_details;
create policy match_details_select_mine on public.match_details
  for select to authenticated using (
    exists (select 1 from public.match_results mr
             where mr.match_id = match_details.match_id and mr.user_id = auth.uid())
  );

-- 書き込みは下の関数からだけ（ポリシーを作らない＝直接の insert / update は通らない）。

-- 詳細を保存する。ホストが finish_match() の直後に1回だけ呼ぶ。
-- 詳細はあくまで「あると嬉しいもの」なので、失敗しても対戦の記録自体は残る
-- （アプリ側もこの呼び出しの失敗は握りつぶす）。
create or replace function public.save_match_detail(p_match uuid, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid;
begin
  select host into v_host from public.matches where id = p_match;
  if v_host is null then raise exception 'match not found'; end if;
  if v_host <> auth.uid() then raise exception 'not host'; end if;

  insert into public.match_details (match_id, detail)
       values (p_match, coalesce(p_detail, '{}'::jsonb))
  on conflict (match_id) do update set detail = excluded.detail;
end $$;

revoke all on function public.save_match_detail(uuid, jsonb) from public;
grant execute on function public.save_match_detail(uuid, jsonb) to authenticated;

-- ==========================================================================
-- 5/5  matches_prune.sql
-- ==========================================================================

-- 対戦記録（matches / match_results）を60日で消す。
--
-- rooms.sql の finish_match() が対戦のたびに matches に1行積むが、消す仕組みが無く
-- 無期限に溜まる状態だった。走者や区間タイムの詳細を後から足すことも考えると、
-- 先に上限を決めておかないと際限なく育つ。
--
-- 掃除の仕方は走友会の掲示板（clubs.sql の list_club_posts が「3日より古い投稿を
-- 読むついでに消す」）と同じ考え方に揃える。定期実行の仕組み（pg_cron 等）を
-- 増やさずに済み、誰も見に来なければ消えないだけで害が無いため。
--
-- match_results は matches への on delete cascade が rooms.sql で張ってあるので、
-- matches を消せば一緒に消える。通算戦績（profiles.mp_played 等）は別カウンタなので
-- 履歴を消しても減らない（これは意図どおり。「通算」は消えないほうが自然）。
--
-- テーブルは作らない・消さない。何回流しても大丈夫。
-- ただし rooms.sql を流し直したときは、この関数も道連れで消えるので流し直すこと。

-- 保持期間。ここだけ見れば何日で消えるか分かるようにしておく。
create or replace function public.match_retention_days() returns integer
language sql immutable as $$ select 60 $$;

-- 古い対戦記録を消す。security definer にしているのは、RLS で「自分が出た試合」しか
-- 見えないため、そのままだと他人の古い記録を消せないため。
create or replace function public.prune_old_matches() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.matches
   where finished_at < now() - (public.match_retention_days() || ' days')::interval;
end $$;

revoke all on function public.prune_old_matches() from public;
grant execute on function public.prune_old_matches() to authenticated;

-- 自分の対戦履歴を返す。呼ばれたついでに古いものを消す。
-- アプリ側（roomsApi.myMatchHistory）はこの関数を呼ぶ。
-- 返す列が変わるときは create or replace では差し替えられない（42P13）。先に落とす。
-- 関数を落とすだけでデータは消えない
drop function if exists public.list_my_matches(integer);

create or replace function public.list_my_matches(p_limit integer default 20)
returns table (
  match_id    uuid,
  finished_at timestamptz,
  summary     jsonb,
  host        uuid,
  user_id     uuid,
  rank        integer,
  points      integer,
  forfeit     boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;

  perform public.prune_old_matches();

  return query
    with mine as (
      select m.id, m.finished_at, m.summary, m.host
        from public.matches m
        join public.match_results r on r.match_id = m.id and r.user_id = me
       order by m.finished_at desc
       limit greatest(1, least(coalesce(p_limit, 20), 100))
    )
    select mine.id, mine.finished_at, mine.summary, mine.host,
           r.user_id, r.rank, r.points, r.forfeit
      from mine
      join public.match_results r on r.match_id = mine.id
     order by mine.finished_at desc, r.rank asc;
end $$;

revoke all on function public.list_my_matches(integer) from public;
grant execute on function public.list_my_matches(integer) to authenticated;
