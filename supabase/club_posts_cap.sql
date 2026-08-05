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
