-- JPEL: build 102 時点のまとめ（この1本を上から順に流せば2本ぶん全部入ります）
-- drop table は1つも入っていません。既存の走友会・フレンド・対戦履歴のデータは消えません。
-- drop function も入っていません（返す列が変わらないので create or replace で差し替わります）。
-- 中身は下の2本を順番につないだだけです:
--   1. clubs_search_all.sql  おすすめ・検索に「入れない走友会」も出す
--   2. hof_share.sql         殿堂入りチームをフレンド・走友会の人に見せる


-- ==========================================================================
-- 1/2  clubs_search_all.sql
-- ==========================================================================

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

-- ==========================================================================
-- 2/2  hof_share.sql
-- ==========================================================================

-- 殿堂入りチームを、フレンドと同じ走友会の人に見せる。
--
-- ■なぜ rosters に列を足すだけなのか（新しいテーブルを作らない理由）
--   殿堂入りは rosters とまったく同じ形（user_id ごとの選手の配列）で、
--   見せたい相手も rosters と同じ「フレンド」と「同じ走友会の人」。
--   その読み取りの決まりは、もう3つそろっている。
--
--     rosters_select_own       schema.sql        自分
--     rosters_select_friend    schema.sql        フレンド
--     rosters_select_clubmate  clubs_roster.sql  同じ走友会
--
--   新しいテーブルを作ると、この3つを全部もう一度書くことになる。
--   片方だけ直してズレる（＝このリポジトリのバグの最大の原因）ので、同じ行に相乗りさせる。
--   書き込みも rosters_insert_own / rosters_update_own がそのまま効く。
--
-- ■中身
--   アプリ側の HofPlayer[]（types/index.ts）をそのまま入れる。
--   「登録した瞬間の選手を凍らせたコピー」なので、選手まるごと入る。最大30人（HOF_MAX）。
--   まるごと入れるのは、相手の殿堂入りでも長押しで選手詳細を開けるようにするため。
--
-- ■注意
--   schema.sql を流し直すと rosters ごと作り直されるので、この列も道連れで消える
--   （clubs_roster.sql と同じ注意）。そのときはこれも流し直すこと。
--
-- テーブルは作らない・消さない。何回流しても大丈夫。

alter table public.rosters add column if not exists hof jsonb not null default '[]'::jsonb;
