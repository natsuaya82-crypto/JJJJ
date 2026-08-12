# Supabase の SQL について

**ここに何があって、どの順で流すのか、いま何が入っているのか**をまとめたメモ。

このディレクトリの SQL は**手で Supabase の SQL エディタに貼って流す**運用です。
マイグレーションの仕組み（`supabase db push` 等）は使っていません。そのため
「流したかどうか」がどこにも残らず、症状が出るたびに毎回ゼロから切り分ける羽目に
なっていたので、その記録をここに置きます。

**流したら §3 の表に日付を書き足してください。**

---

## 1. ファイルと、それが作るもの

土台が3つあり、残りは全部その上への追加です。

| ファイル | 作るもの | 依存 |
|---|---|---|
| `schema.sql` | **フレンドの土台**。`profiles` / `rosters` / `friend_requests` / `friends` | なし |
| `clubs.sql` | **走友会の土台**。`clubs` / `club_members` / `club_posts` | `schema.sql` |
| `rooms.sql` | **オンライン対戦の土台**。`rooms` / `room_members` / `matches` / `match_results` / `finish_match` ／ **`profiles` に `mp_played` `mp_wins` `mp_forfeits` の3列を足す**（L106-108） | `schema.sql` |
| `account.sql` | アカウント削除 | `schema.sql` |
| `moderation.sql` | 通報・ブロック | `schema.sql` |
| `clubs_roles.sql` | 走友会の権限 | `clubs.sql` |
| `clubs_cards.sql` | 走友会のカード | `clubs.sql` |
| `clubs_roster.sql` | 走友会メンバーのロスター閲覧 | `clubs.sql` / `schema.sql` |
| `clubs_search_all.sql` | 入れない走友会も検索に出す | `clubs.sql` |
| `club_reactions.sql` | 掲示板の反応スタンプ | `clubs.sql` |
| `club_posts_cap.sql` | 掲示板を新しい順300件で切る | `clubs.sql` |
| `club_feed.sql` | **`club_feed()` の定義はこのファイルだけ** | `clubs.sql` ほか |
| `hof_share.sql` | 殿堂入りチームの共有（`rosters` に列を足す） | `schema.sql` |
| `matches_detail.sql` | `match_details` テーブルと `save_match_detail` | **`rooms.sql`** |
| `matches_prune.sql` | `list_my_matches` と `prune_old_matches`（60日で掃除） | **`rooms.sql`** |

### 束（bundle）

まとめて流せるようにしたもの。**中身は上のファイルのコピーなので、束を流したなら
個別のファイルは流さなくてよい**（流しても害はない）。

| 束 | 中身 |
|---|---|
| `bundle/build88_all.sql` | `club_reactions` / `club_posts_cap` / `clubs_roster` / `matches_detail` / `matches_prune` |
| `bundle/build102_all.sql` | `clubs_search_all` / `hof_share` |
| `bundle/build103_all.sql` | `club_feed` / `hof_share` |

**★どの束にも `schema.sql` / `clubs.sql` / `rooms.sql` は入っていません。**
土台の3つは単体で流す前提です。

---

## 2. 流す順番と、踏みやすい落とし穴

```
schema.sql  →  clubs.sql  →  rooms.sql        （土台。この順）
                                 ↓
                    matches_detail.sql  →  matches_prune.sql
```

### 落とし穴①　`rooms.sql` を流し直すと対戦履歴の関数が道連れで消える

`matches_prune.sql` の冒頭にも書いてあります。

> ただし rooms.sql を流し直したときは、この関数も道連れで消えるので流し直すこと。

`rooms.sql` を後から流すと `list_my_matches` と `prune_old_matches` が消えます。
**`rooms.sql` を触ったら、必ず `matches_detail.sql` → `matches_prune.sql` を流し直すこと。**

### 落とし穴②　列を足しただけでは PostgREST が気づかない

`rooms.sql` は `alter table ... add column` で `profiles` に3列足します。
**PostgREST（アプリが叩いている REST 層）はスキーマをキャッシュしている**ので、
列を足しただけだとアプリからは「そんな列は無い」と返ることがあります。

```sql
notify pgrst, 'reload schema';
```

を1回流すか、Supabase のダッシュボードで API を再起動してください。
**SQL は全部流したのに画面がオフラインのまま、というときの第一容疑者はこれです。**

### 落とし穴③　`grant execute ... to authenticated`

RPC は `authenticated` にしか実行権を与えていません。アプリが匿名のままだと
`42501`（permission denied）になります。ただしフレンドや走友会も同じ作りなので、
**そちらが動いているならこれは原因ではありません。**

---

## 3. 適用の記録

**流したらここに日付を書き足してください。** 空欄は「記録が無い」であって
「流していない」とは限りません。

| ファイル | 流した日 | メモ |
|---|---|---|
| `schema.sql` | | |
| `clubs.sql` | | |
| `rooms.sql` | | |
| `account.sql` | | |
| `moderation.sql` | | |
| `clubs_roles.sql` | | |
| `clubs_cards.sql` | | |
| `hof_share.sql` | | |
| `matches_detail.sql` | 2026-08-12 | 下の「実際に起きたこと」参照 |
| `matches_prune.sql` | 2026-08-12 | **これが入っていなくて対戦履歴が落ちていた** |
| `bundle/build88_all.sql` | | 束では流していない（上の2つを個別に流した） |
| `bundle/build102_all.sql` | | |
| `bundle/build103_all.sql` | | |
| `club_feed.sql` | | |

---

## 4. いま何が入っているかを1回で見るSQL

SQL エディタに貼って流すと、土台と関数の有無が一覧で出ます。
`null` / `false` が出たところが足りていないものです。

```sql
select
  -- 土台のテーブル
  to_regclass('public.profiles')                as t_profiles,
  to_regclass('public.rosters')                 as t_rosters,
  to_regclass('public.clubs')                   as t_clubs,
  to_regclass('public.rooms')                   as t_rooms,
  to_regclass('public.matches')                 as t_matches,
  to_regclass('public.match_results')           as t_match_results,
  to_regclass('public.match_details')           as t_match_details,
  -- 対戦履歴が使う関数
  to_regproc('public.list_my_matches(integer)') as fn_list_my_matches,
  to_regproc('public.prune_old_matches()')      as fn_prune,
  to_regproc('public.save_match_detail(uuid,jsonb)') as fn_save_detail,
  to_regproc('public.finish_match(uuid,jsonb)') as fn_finish_match,
  -- rooms.sql が profiles に足す3列
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='mp_played')       as col_mp_played;
```

---

## 5. 画面ごとに、何が要るか

「この画面だけオフライン」というときに、どこを見ればいいかの対応表です。

| 画面 | 叩くもの | 要るもの |
|---|---|---|
| フレンド一覧 | `profiles` / `friends` / `friend_requests` | `schema.sql` |
| 走友会 | `clubs` / `club_members` / `club_feed()` | `clubs.sql` ＋ `club_feed.sql` |
| 殿堂入り（フレンドの） | `rosters` の共有列 | `hof_share.sql` |
| 部屋・対戦 | `rooms` / `room_members` / `join_room` ほか | `rooms.sql` |
| **対戦履歴** | **①** `rpc('list_my_matches')` **②** `profiles.select('mp_played, mp_wins, mp_forfeits')` | **①** `rooms.sql` ＋ `matches_prune.sql` ／ **②** `rooms.sql`（L106-108） |
| 対戦のリプレイ | `match_details` | `matches_detail.sql` |

### 対戦履歴だけがオフラインになるとき

**この画面は独立した2本のクエリを投げていて、どちらが落ちてもオフライン表示になります**
（`src/components/online/MatchHistoryPage.tsx:91-92`）。

```
① myMatchHistory → rpc('list_my_matches')                        … 履歴の中身
② myMatchStats   → profiles.select('mp_played, mp_wins, mp_forfeits') … 上に出る通算成績
```

`src/lib/roomsApi.ts` は**どちらの失敗も `RoomsOffline` にまとめてしまう**ので、
画面を見ただけでは①②のどちらが落ちているか分かりません。§4 のSQLで確かめてください。

**②は `profiles` の列を読むだけ**なので、フレンドや走友会が動いていても
ここだけ落ちることがあります（フレンド側は `mp_*` を読まないため）。
SQL を全部流してあるのにここが落ちるなら、**落とし穴②（PostgREST のスキーマキャッシュ）**が
残っている可能性が高いです。

---

## 6. 実際に起きたこと（2026-08-12）

対戦履歴が「通信できませんでした」になり、**「SQLは全部流してある」という前提で
原因を何往復も探した**。答えは単純で、`list_my_matches` がDBに存在しなかった。

```
select * from public.list_my_matches(20);
ERROR:  42883: function public.list_my_matches(integer) does not exist
```

`matches_prune.sql`（と、同じ束に入っている `matches_detail.sql`）だけが未適用だった。
**§4 の確認SQLを最初に流していれば1分で終わっていた。** 次から先にそれをやること。

なぜ「全部流した」のに抜けていたかは断定できないが、§2 の落とし穴①
（`rooms.sql` を流し直すと `list_my_matches` が道連れで消える）が有力。
土台を後から流すと、その上に載っているものが黙って消える。

**この件で分かった、直したほうがいいこと**

`src/lib/roomsApi.ts` は失敗を全部 `RoomsOffline` に畳んでいて、
Supabase が返した `code` / `message` を捨てている（console にも出していない）。
そのため 42883 がアプリ側からは一切見えず、上の往復が起きた。
原因を `detail` に残して console に1行出す変更を用意してあるが、
**入れた**（2026-08-12）。次からは 42883 のような原因がそのまま console に出る。

---

## 7. 直すときの決まり

- **テーブルを消す SQL は書かない。** ここの SQL はどれも `create or replace` /
  `if not exists` / `add column if not exists` で、何回流しても data は消えません
- **返す列が変わる関数は `drop function` してから作り直す**（`42P13` になるため）。
  そのぶん**後から流したものが前の定義を消す**ので、束の中の並び順にも意味があります
- クライアント側の呼び出し（`src/lib/*Api.ts`）と**引数名・戻り値の列名を揃える**こと。
  ずれると PostgREST は関数が無いのと同じ扱いで返します
