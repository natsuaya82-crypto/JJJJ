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
