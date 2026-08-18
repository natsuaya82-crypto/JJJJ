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
`clubs.sql`（**削除済み**）も同じで、走友会・所属・掲示板・寄付されたカードを落としていました。

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

レート戦の表を足したとき（2026-08-14）も同じやり方で確かめました。
参加者・提出・結果を入れたDBに `all.sql` を2回流して、エラー0・行数の変化0です。

| | rated_events | rated_entries | rated_rounds | rated_lineups | rated_results | rated_races |
|---|---|---|---|---|---|---|
| 流す前 | 2 | 3 | 1 | 2 | 2 | 1 |
| 2回流した後 | 2 | 3 | 1 | 2 | 2 | 1 |

走友会のプレビュー（`club_preview`）を足したとき（2026-08-15）も同じやり方です。
走友会1つ・メンバー3人（会長/副会長/一般）・入っていない人1人を入れたDBに
`all.sql` を2回流して、エラー0・行数の変化0（profiles 4 / clubs 1 / club_members 3）。

**入っていない人から実際に引けることまで見ました。**

| 誰が | 何をした | 結果 |
|---|---|---|
| 入っていない人 | `club_preview(走友会)` | **3人ぶん返る**（会長→副会長→一般の順） |
| 同じ人 | `club_members` を直接 select | **permission denied**（ポリシーは効いたまま） |
| — | 返す列に `code` があるか | **無い**（フレンドコードは渡さない） |

走友会に入ると掲示板に「参加しました」が出るようにしたとき（2026-08-15）も同じやり方です。
`all.sql` を2回、エラー0・行数の変化0（profiles 3 / clubs 2 / club_members 3 /
club_posts 2 / club_reactions 1）。

| 何を | 結果 |
|---|---|
| 誰でも歓迎の会に入る（`join_club`） | 掲示板に `join` が1件 |
| 承認制の会に申請 → 会長が承認（`approve_club_request`） | こちらも `join` が1件（**入る道は2つある**） |
| その投稿にスタンプ（`react_club_post`） | 押せる（種類を見ていないので、投稿があれば押せる） |
| 掲示板（`club_feed`）に出るか | 出る |
| アプリから `post_club_join` を直接呼ぶ | **permission denied**（`join_club` などの中からだけ） |
| 同じ人がもう一度入る | 増えない（1日1件） |

★このとき **`INSERT has more target columns than expressions` で1回落ちました**
（`select p_club, p_user` に `'join'` を書き忘れていた）。
**流さなければ気づけないもの**です。

このとき見つけて直したものが3つあります（**流さなければ気づけないもの**でした）。

- `rated_standings` が一時表を作っていて、`stable` な関数では
  `CREATE TABLE is not allowed in a non-volatile function` で落ちた → CTE に書き換え
- `rated_hof_count` が、まだ一度もロスターを上げていない人に **null** を返していた。
  `null < 30` は真でも偽でもないので、`rated_join` の
  **殿堂入り30人の関門を素通り**していた → 必ず数を返すようにした
- レート戦の表に grant が無かった（Supabase の既定の権限に頼る形になっていた）
  → `select` だけを `authenticated` に明示して、`insert` / `update` は取り上げた

`authenticated` として実際に触って、次のとおりになることも確かめています。

| やったこと | 結果 |
|---|---|
| 順位表・結果・回・大会を読む | 読める |
| **他人の提出**を読む | 見えない（自分の1件だけ） |
| **自分のレート**を直に書き換える | `permission denied` |
| **順位**を直に書き換える | `permission denied` |
| **提出**を表へ直に insert する | `permission denied` |
| `rated_me` / `rated_standings` を呼ぶ | 通る |
| `rated_submit` に区間数の違うものを渡す | `bad`（1件・0始まり・11区混じり、全部） |
| 締め切り後（回が昨日）に `rated_submit` | `closed` |
| 殿堂入り 0人 / 29人 / 30人 で `rated_join` | `hof` / `hof` / `ok` |

---

## レート戦の Edge Function（`rated-tick`）

毎日 **日本時間 10:00** に、前日ぶんを締めて・走らせて・レートを書き、その日のコースを出します。

```bash
npm run build:edge                    # engine.js を作り直す（src を変えたら必ず）
supabase functions deploy rated-tick  # 上げる
```

毎日の起動は **ダッシュボード → Edge Functions → `rated-tick` → Schedules** で
`0 1 * * *`（UTC 01:00 ＝ 日本時間 10:00）。

手で流すこともできます（締め忘れの取り戻しにも使えます。何度流しても同じ結果です）。

```bash
curl -X POST "$SUPABASE_URL/functions/v1/rated-tick" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

**計算はアプリとまったく同じ1本**（`src/lib/ratedTick.ts`）です。Deno は拡張子なしの
相対 import を解決できないので、`npm run build:edge` で1枚にまとめた `engine.js` を
置いてあります。**古いまま気づかない**のが唯一の危険なので、`npm run check` の
`edge-bundle` が毎回「いま作り直したものと同じか」を突き合わせます。

大会の日程は `all.sql` の `rated_events` への insert 1行です（いまは 2026-09-01 から14日）。
**名前で見て無いときだけ作る**ので、2回流しても始まっている大会は動きません（日付で見ると、日程をずらしたときに同じ大会がもう1つできます）。

---

## 何かおかしいときに、まず流すSQL

**`all.sql` を流してください。それだけです。**

`all.sql` は最後に確認の一覧を出すので、流し終わると下にこう出ます
（ローカルの PostgreSQL に流した実測。2回流しても同じ）。

| 表の数 | ポリシーの数 | 関数の数 | RLSが無い表 | ランクマッチ |
|---|---|---|---|---|
| 24 | 40 | 105 | **0** | 第一回ベータ版ランクマッチ｜2026-09-01｜14日 |

**見るのは3つだけです。**

- **表の数 24**。足りなければ表が作られていない
- **RLSが無い表 0**。**0 以外なら危険**（誰でも読み書きできる表がある）
- **ランクマッチ**。`(大会なし)` と出たら大会の行が入っていない

★**関数の数は環境で変わります。** 上の105はローカルの数で、ローカルは `pgcrypto` を
`public` に入れるぶんだけ多く数えます（Supabase は `extensions` に置くので少なくなる）。
**この数を期待値として使わないこと。**

★ここに確認用のSQLを別で置かないこと。以前は README に手書きの一覧
（`to_regclass('public.profiles')` …）があり、**表を足しても直されないので
「全部そろっています」と嘘をつく**状態でした。いまは数え上げなので、
表を足せば「表の数」が勝手に増えます。

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
