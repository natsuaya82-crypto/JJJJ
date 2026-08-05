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
