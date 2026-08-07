-- おすすめ・検索に「入れない走友会」も出すようにする。
--
-- これまでは空検索（＝おすすめ）のときだけ
--     c.join_type <> 'closed' and c.members < 30
-- で絞っていた。つまり**募集を止めている走友会と満員の走友会は一覧から消えていた**。
--
-- 画面側（FriendClubPage の ClubCard）は、この2つのために
-- 「満員」「停止中」というボタンの出し分けを最初から持っている。
-- 出し分けを書いてあるのに、サーバーがその行を返していなかった＝噛み合っていなかった。
-- 作った走友会が他のアカウントから見えない、という症状はここが原因になりうる。
--
-- 探す側から見ても、あるはずのものが消えるより「あるけど今は入れない」と分かる方がよい
-- （コード検索と名前検索は前から絞っていない。空検索だけが違う扱いになっていた）。
--
-- 並び順は「入れるものが先、そのあと人数の多い順」。
-- 入れないものを混ぜても、上に来るのは入れるものになる。
--
-- 返す列は変わらないので create or replace で差し替わる（drop は要らない）。
-- 何回流しても大丈夫。

create or replace function public.search_clubs(p_q text default '', p_limit integer default 30)
returns table (
  id uuid, code text, name text, note text, logo_id text,
  join_type text, min_ovr integer, members integer, avg_ovr integer
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.code, c.name, c.note, c.logo_id, c.join_type, c.min_ovr, c.members,
         coalesce((
           select avg(p.avg_ovr) from public.club_members m
           join public.profiles p on p.user_id = m.user_id
           where m.club_id = c.id
         ), 0)::integer as avg_ovr
  from public.clubs c
  where
    case
      when coalesce(trim(p_q), '') = '' then true      -- おすすめ：全部出す
      when trim(p_q) ~ '^[0-9]{10}$'    then c.code = trim(p_q)
      else c.name ilike '%' || trim(p_q) || '%'
    end
  -- 入れるものが先（true が先に来る）。そのあとは人数の多い順・新しい順
  order by (c.join_type <> 'closed' and c.members < 30) desc,
           c.members desc, c.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
$$;
