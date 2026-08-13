# Supabase の SQL について

**流すのは `all.sql` 1本だけです。** 順番も、前に何を流したかも、覚える必要はありません。

```
Supabase ダッシュボード → SQL Editor → all.sql を全文貼って Run
```

**何回流してもデータは消えません。** 表は「無ければ作る」、列は「無ければ足す」、
関数とポリシーだけを作り直します。`drop table` は1行も書いてありません。

新しいプロジェクトでも、いま動いているプロジェクトでも、同じものを流します。

---

## 機能を足すとき

**`all.sql` を直してください。新しい `.sql` を作らないこと。**

`npm run check` の `supabase-sql` が、`supabase/` に `.sql` が2本以上あったら落とします。
ほかに見ているのは

- `drop table` / `drop column` / `truncate` が混ざっていないか（＝データが消えないか）
- 同じ関数が2回定義されていないか
- アプリが呼ぶ `rpc(...)` と読む表が `all.sql` に全部あるか
- その `rpc` が `authenticated` に grant されているか（漏れると `42501`）

書き足す場所は、`all.sql` の中の見出しに合わせてください。

```
1. 表・列・制約・索引       … 作るだけ。消さない
2. ポリシーとトリガーを外す … 3で関数を作り直すため
3. 関数（最終版を1回だけ）
4. 既定値・トリガー・ポリシーを付け直す
5. 権限
6. notify pgrst, 'reload schema'
```

関数の**返す列を変えたとき**は、3 の冒頭にある `drop function if exists` に
その形を足してください。`create or replace` だけでは差し替わりません（`42P13`）。
引数を増やしたときも、**古い形の `drop function` を残すこと**。同じ名前で形の違う関数が
並ぶと、PostgREST はどれを呼べばいいか決められず「関数が無い」のと同じ扱いで返します。

---

## 2026-08-13 まで何が起きていたか

**この節は「なぜ1本になったか」の記録です。同じ形に戻さないために残しています。**

`.sql` が14本あり、README には「画面がエラーになったら流し直す」と書いてありました。
ところが土台の3本は、先頭で**表ごと落として**いました。

```sql
-- supabase/schema.sql（旧・削除済み）
drop table if exists public.rosters   cascade;
drop table if exists public.profiles  cascade;
```

`profiles` にフレンドコードが入っています。つまり**流すたびに、オーナーだけでなく
全ユーザーの**プロフィール・ロスター・フレンド関係が消えていました。
`clubs.sql` も同じで、走友会・所属・掲示板・寄付されたカードを落としていました。

しかも `cascade` なので、他のファイルが `profiles` / `rosters` に足した閲覧ポリシーも
道連れになります。

| 消えるもの | 足していた場所 | 壊れる画面 |
|---|---|---|
| `profiles_select_clubmate` | clubs.sql | 走友会（メンバーの名前が引けない） |
| `rosters_select_clubmate` | clubs_roster.sql | 走友会（メンバーのロスター） |
| `profiles_select_room` / `rosters_select_room` | rooms.sql | 対戦（ロビーに名前が出ない） |

**片方を直すともう片方が壊れる**ので、「毎回SQLを流さないとエラーになる」状態から
抜け出せませんでした。

もう1つ、同じ関数が複数のファイルに書いてありました（`club_feed` は4か所、
`post_club_request` は3か所、`donate_club_card` / `update_club` / `search_clubs` は2か所）。
どれが有効かは**流した順**で決まるのに、順番はどこにも書いていませんでした。
build 88 のまとめを流した走友会で `open_stats` が返らなくなり、カードの差し入れが
「あと0枚まで入ります」で押せなくなったのがこれです。

### 確かめ方（この形に戻っていないことの確認）

ローカルの PostgreSQL に Supabase と同じ `auth.users` / `auth.uid()` を用意して、
旧14本で組んだDBにデータを入れてから `all.sql` を流し、行数が変わらないことを見ています。

| | profiles | rosters | friendships | clubs | 掲示板 |
|---|---|---|---|---|---|
| 移行前 | 2 | 2 | 2 | 1 | 1 |
| `all.sql` を流した後 | 2 | 2 | 2 | 1 | 1 |
| （参考）旧 `schema.sql` を流した後 | **0** | **0** | **0** | 1 | 1 |

---

## 何かおかしいときに、まず流すSQL

土台と関数の有無が一覧で出ます。`null` / `false` / `0` が出たところが足りていません。

```sql
select
  to_regclass('public.profiles')                     as t_profiles,
  (select count(*) from public.profiles)             as n_profiles,
  (select count(*) from pg_policies
    where schemaname='public' and tablename='profiles') as n_policies_profiles,
  to_regclass('public.clubs')                        as t_clubs,
  to_regclass('public.rooms')                        as t_rooms,
  to_regclass('public.match_details')                as t_match_details,
  to_regproc('public.club_feed()')                   as fn_club_feed,
  to_regproc('public.list_my_matches(integer)')      as fn_list_my_matches,
  to_regproc('public.finish_match(uuid,jsonb,jsonb)') as fn_finish_match,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='mp_played')            as col_mp_played,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='rosters'
             and column_name='hof')                  as col_hof;
```

足りないものがあれば `all.sql` を流してください。それで全部そろいます。

### それでも画面がオフラインのままなら

`all.sql` の最後に `notify pgrst, 'reload schema';` が入っていますが、届かないことが
あります。PostgREST（アプリが叩いている REST 層）はスキーマをキャッシュしているので、
足したばかりの列や関数が「そんなものは無い」と返ります。

Supabase のダッシュボードから API を再起動するか、これをもう一度流してください。

```sql
notify pgrst, 'reload schema';
```

### 画面ごとに、何を叩いているか

| 画面 | 叩くもの |
|---|---|
| フレンド一覧 | `profiles` / `friendships` / `friend_requests` |
| 走友会 | `clubs` / `club_members` / `club_feed()` / `list_club_reactions()` |
| 殿堂入り（相手の） | `rosters.hof` |
| 部屋・対戦 | `rooms` / `room_members` / `join_room()` ほか |
| 対戦履歴 | ① `list_my_matches()` ② `profiles.mp_played, mp_wins, mp_forfeits` |
| 対戦のリプレイ | `match_details` |

**対戦履歴は独立した2本のクエリを投げていて、どちらが落ちてもオフライン表示になります**
（`src/components/online/MatchHistoryPage.tsx`）。`src/lib/roomsApi.ts` は
Supabase が返した `code` / `message` を console に1行出すので、そちらを見てください
（`42883` なら関数が無い、`42501` なら grant が無い、`PGRST202` ならスキーマキャッシュ）。

---

## データが消えてしまったときは

Supabase ダッシュボード → **Database → Backups**。日次のバックアップから戻せます。
プランによっては Point-in-Time Recovery も使えます。
