-- ============================================================
-- JPEL Manager — Supabase のスキーマ **全部**（これ1本だけ）
--
-- Supabase ダッシュボード → SQL Editor に全文を貼って Run。
-- 順番も、前に何を流したかも、覚える必要はありません。
--
-- ■ このファイルはデータを消しません
--   `drop table` を1行も書いていません。表は「無ければ作る」、列は「無ければ足す」、
--   関数とポリシーだけを作り直します。**何回流してもデータは残ります。**
--
--   以前は schema.sql / clubs.sql / rooms.sql が先頭で
--       drop table if exists public.profiles cascade;
--   のように**表ごと落として**いました。エラーが出るたびに流し直す運用だったので、
--   流すたびに全ユーザーのプロフィール（＝フレンドコード）・フレンド関係・走友会が
--   消えていました。**あの3本はもう存在しません。復活させないこと。**
--
-- ■ 機能を足すときも、このファイルを直す
--   新しい .sql を増やさないでください。同じ関数が複数のファイルに書かれていたせいで
--   「後から流したものが前の列を消す」事故が実際に起きています（club_feed は4か所にあった）。
--   `npm run check` の `supabase-sql` が、
--     ・同じ関数が2回定義されていないか
--     ・アプリが呼ぶ rpc / テーブルがこのファイルに全部あるか
--     ・`drop table` が混ざっていないか
--   を見張ります。
--
-- ■ 中の並び（依存の順）
--   1. 表・列・制約・索引       … 作るだけ。消さない
--   2. ポリシーとトリガーを外す … 3で関数を作り直すため
--   3. 関数（最終版を1回だけ）
--   4. 既定値・トリガー・ポリシーを付け直す
--   5. 権限
--   6. PostgREST にスキーマを読み直させる
-- ============================================================

begin;

-- ============================================================
-- 1. 表・列・制約・索引（消さない）
-- ============================================================

-- ── プロフィール（フレンド一覧・詳細のヘッダーに出る情報） ──
create table if not exists public.profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  code            text        not null,                      -- フレンドコード（数字10桁）
  team_name       text        not null default '',
  short_name      text        not null default '',
  gm_name         text        not null default '',
  logo_id         text        not null default 'logo_01',
  color_primary   text        not null default '#122440',
  color_secondary text        not null default '#f5c842',
  champs          integer     not null default 0,            -- 通算優勝
  avg_ovr         integer     not null default 0,            -- 平均OVR（一覧の並べ替え用）
  updated_at      timestamptz not null default now(),        -- 「最終ログイン」表示にも使う
  constraint profiles_code_unique unique (code),
  constraint profiles_code_format check (code ~ '^[0-9]{10}$')
);

-- 部ごとの通算優勝。{"1部":2,"3部":1} の形（0の部は入れない）。
-- champs（合計）は古いアプリが読んでいるので、作り変えず**両方入れ続ける**。
alter table public.profiles add column if not exists titles jsonb not null default '{}'::jsonb;

-- オンライン対戦の通算戦績（表示用のカウンタ。集計元は match_results）
alter table public.profiles add column if not exists mp_played   integer not null default 0;
alter table public.profiles add column if not exists mp_wins     integer not null default 0;
alter table public.profiles add column if not exists mp_forfeits integer not null default 0;

-- ── ロスター（相手に見せる選手スナップショット） ──────────
-- 一覧の読み込みが重くならないよう profiles とは別表にする。
create table if not exists public.rosters (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  players    jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 殿堂入り。見せたい相手が rosters とまったく同じ（フレンド／同じ走友会）なので、
-- 新しい表を作らず同じ行に相乗りさせる（読み取りの決まりを二重に書かないため）。
alter table public.rosters add column if not exists hof jsonb not null default '[]'::jsonb;

-- ── フレンド関係（成立後。双方向に2行入れる） ──────────────
create table if not exists public.friendships (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  friend_id  uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

-- ── フレンド申請（承認待ちのものだけが残る） ────────────────
create table if not exists public.friend_requests (
  from_user  uuid        not null references auth.users(id) on delete cascade,
  to_user    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  constraint friend_requests_not_self check (from_user <> to_user)
);
create index if not exists friend_requests_to_idx on public.friend_requests (to_user);

-- ── 走友会 ────────────────────────────────────────────
create table if not exists public.clubs (
  id         uuid        primary key default gen_random_uuid(),
  code       text        not null,                     -- 数字10桁。フレンドコードと同じ採番を使う
  name       text        not null,
  note       text        not null default '',          -- ひとこと紹介
  logo_id    text        not null default 'club_01',
  join_type  text        not null default 'open',      -- 'open' 誰でも歓迎 / 'approval' 承認制 / 'closed' 募集停止
  min_ovr    integer     not null default 0,           -- 入会条件（平均OVRがこれ以上）
  owner      uuid        not null references auth.users(id) on delete cascade,
  members    integer     not null default 0,           -- 人数。トリガーが数える（検索の並べ替え用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_code_unique unique (code),
  constraint clubs_code_format check (code ~ '^[0-9]{10}$'),
  constraint clubs_name_len    check (char_length(name) between 1 and 16),
  constraint clubs_note_len    check (char_length(note) <= 40),
  constraint clubs_join_type   check (join_type in ('open', 'approval', 'closed')),
  constraint clubs_min_ovr     check (min_ovr between 0 and 99)
);
create index if not exists clubs_members_idx on public.clubs (members desc);

-- ── 所属（1人1走友会なので user_id が主キー） ──────────────
create table if not exists public.club_members (
  user_id   uuid        primary key references auth.users(id) on delete cascade,
  club_id   uuid        not null references public.clubs(id) on delete cascade,
  role      text        not null default 'member',    -- 'owner' | 'admin'（副会長） | 'member'
  joined_at timestamptz not null default now()
);
create index if not exists club_members_club_idx on public.club_members (club_id);

-- 副会長（admin）を足したときに帯が変わっている。制約は付け直す
alter table public.club_members drop constraint if exists club_members_role;
alter table public.club_members add  constraint club_members_role
  check (role in ('owner', 'admin', 'member'));

-- ── 加入申請（承認制の走友会だけ使う） ──────────────────────
create table if not exists public.club_requests (
  club_id    uuid        not null references public.clubs(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists club_requests_user_idx on public.club_requests (user_id);

-- ── 掲示板 ────────────────────────────────────────────
-- 書き込みは定型文（12種）から選ぶだけ。自由入力は無い。
create table if not exists public.club_posts (
  id         uuid        primary key default gen_random_uuid(),
  club_id    uuid        not null references public.clubs(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)   on delete cascade,
  kind       text        not null,                       -- 'msg' 書き込み / 'req' カードください / 'room' 対戦の募集
  phrase     integer     not null default 0,             -- 定型文の番号（kind='msg'）
  rarity     text        not null default '',            -- 欲しいレアリティ（kind='req'）
  filled     integer     not null default 0,             -- 集まった枚数
  created_at timestamptz not null default now(),
  constraint club_posts_phrase check (phrase between 0 and 11),
  constraint club_posts_rarity check (rarity in ('', 'normal', 'rare', 'epic'))
);
create index if not exists club_posts_club_idx on public.club_posts (club_id, created_at desc);

-- 書き込みの本文（kind='msg'）。100字までで切る。**伏せ字はここではやらない**
-- （保存するのは書かれたそのまま。画面に出す直前にアプリ側で伏せる＝src/utils/wordFilter.ts。
--   通報が来たときに何が書かれたのか分からないと処理のしようがないため）
alter table public.club_posts add column if not exists body      text not null default '';
-- 対戦の募集（kind='room'）。6桁の部屋番号
alter table public.club_posts add column if not exists room_code text not null default '';

alter table public.club_posts drop constraint if exists club_posts_kind;
alter table public.club_posts add  constraint club_posts_kind
  check (kind in ('msg', 'req', 'room'));

-- お願い1件まるごとの種類指定（旧）。いまは stats を見るが、古いアプリ向けに残す
alter table public.club_posts add column if not exists stat  text     not null default '';
-- お願い1件のなかの「1枚ずつの希望」。長さは枚数ぶん。'' は「その枠はおまかせ」
alter table public.club_posts add column if not exists stats text[]   not null default '{}';
-- 埋まった枠。カードは受け取られると行ごと消えるので、埋まりはお願いの側に持たせる
alter table public.club_posts add column if not exists taken integer[] not null default '{}';

alter table public.club_posts drop constraint if exists club_posts_stat;
alter table public.club_posts add  constraint club_posts_stat
  check (stat in ('', 'speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery'));

-- 既にあるぶんは、集まった枚数ぶんだけ先頭から埋まっていたことにする
update public.club_posts
   set taken = coalesce((select array_agg(g) from generate_series(0, filled - 1) g), '{}')
 where kind = 'req' and filled > 0 and cardinality(taken) = 0;

-- ── 渡したカード ──────────────────────────────────────
-- 投稿が消えても受け取れるよう post_id は null 可にしてある
create table if not exists public.club_gifts (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        references public.club_posts(id) on delete set null,
  to_user    uuid        not null references auth.users(id) on delete cascade,
  from_user  uuid        not null references auth.users(id) on delete cascade,
  card       jsonb       not null,
  created_at timestamptz not null default now()
);
create index if not exists club_gifts_to_idx on public.club_gifts (to_user);

-- 何枚目の枠を埋めたかの控え
alter table public.club_gifts add column if not exists slot integer not null default 0;

-- 既にあるぶんに通し番号を振る（1人1枚の縛りを外す前に、順番を確定させる）
with n as (
  select id, (row_number() over (partition by post_id order by created_at, id) - 1) as k
  from public.club_gifts
)
update public.club_gifts g set slot = n.k from n where n.id = g.id and g.slot <> n.k;

-- 「1つのお願いに1人1枚まで」は廃止（まとめて渡せるようにしたため）
alter table public.club_gifts drop constraint if exists club_gifts_once;

-- ── 掲示板の反応スタンプ ───────────────────────────────
-- 1人1投稿につき1種類だけ。番号と絵文字の対応はアプリ側（clubsApi の CLUB_REACTIONS）。
create table if not exists public.club_reactions (
  post_id  uuid    not null references public.club_posts(id) on delete cascade,
  user_id  uuid    not null references auth.users(id)        on delete cascade,
  emoji    integer not null,
  primary key (post_id, user_id)
);
create index if not exists club_reactions_post_idx on public.club_reactions (post_id);

-- ── オンライン対戦の部屋 ───────────────────────────────
create table if not exists public.rooms (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null,                    -- 6桁の数字
  host        uuid        not null references auth.users(id) on delete cascade,
  status      text        not null default 'lobby',    -- lobby / playing / closed
  rules       jsonb       not null default '{}'::jsonb,-- レース数・メンバー範囲・コース・CPU設定
  max_players integer     not null default 20,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '3 hours',
  constraint rooms_code_format  check (code ~ '^[0-9]{6}$'),
  constraint rooms_status_valid check (status in ('lobby', 'playing', 'closed')),
  constraint rooms_max_valid    check (max_players between 3 and 20)
);
-- 「生きている部屋の中では番号がユニーク」。閉じた部屋の番号は再利用できる
create unique index if not exists rooms_live_code_idx on public.rooms (code) where status <> 'closed';
create index if not exists rooms_host_idx on public.rooms (host);

-- seat は入室順の席番号（1始まり）。left_at が入っている＝離脱（＝不戦敗）。行は残す
create table if not exists public.room_members (
  room_id   uuid        not null references public.rooms(id) on delete cascade,
  user_id   uuid        not null references auth.users(id)   on delete cascade,
  seat      integer     not null,
  ready     boolean     not null default false,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (room_id, user_id),
  constraint room_members_seat_valid check (seat between 1 and 20)
);
create index if not exists room_members_user_idx on public.room_members (user_id);

-- ── 試合結果（戦績・履歴） ──────────────────────────────
create table if not exists public.matches (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        references public.rooms(id) on delete set null,
  host        uuid        not null references auth.users(id) on delete cascade,
  rules       jsonb       not null default '{}'::jsonb,
  summary     jsonb       not null default '{}'::jsonb,  -- レースごとの区間・タイム（表示用）
  finished_at timestamptz not null default now()
);
create index if not exists matches_host_idx on public.matches (host);

create table if not exists public.match_results (
  match_id uuid    not null references public.matches(id) on delete cascade,
  user_id  uuid    not null references auth.users(id)     on delete cascade,
  rank     integer not null,
  points   integer not null default 0,
  forfeit  boolean not null default false,   -- 切断による不戦敗
  primary key (match_id, user_id)
);
create index if not exists match_results_user_idx on public.match_results (user_id);

-- 詳細は1試合で数十KBになるので別の表に置き、その試合を開いたときだけ読む
create table if not exists public.match_details (
  match_id uuid primary key references public.matches(id) on delete cascade,
  -- 形は src/lib/matchSim.ts の MatchDetail（v:1）
  detail   jsonb not null default '{}'::jsonb
);

-- ── 通報・ブロック（App Store 審査基準 1.2） ────────────────
create table if not exists public.reports (
  id          uuid        primary key default gen_random_uuid(),
  reporter    uuid        not null references auth.users(id) on delete cascade,
  target_user uuid        references auth.users(id) on delete cascade,
  target_club uuid        references public.clubs(id)  on delete cascade,
  reason      text        not null,
  detail      text        not null default '',
  created_at  timestamptz not null default now(),
  constraint reports_reason     check (reason in ('harass', 'sexual', 'impersonate', 'spam', 'other')),
  constraint reports_detail_len check (char_length(detail) <= 200),
  constraint reports_target     check (target_user is not null or target_club is not null)
);
create index if not exists reports_created_idx     on public.reports (created_at desc);
create index if not exists reports_target_user_idx on public.reports (target_user);
create index if not exists reports_target_club_idx on public.reports (target_club);

create table if not exists public.blocks (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  blocked_id uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  constraint blocks_not_self check (user_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

-- ── RLS を入れる（何回やっても同じ） ────────────────────
alter table public.profiles        enable row level security;
alter table public.rosters         enable row level security;
alter table public.friendships     enable row level security;
alter table public.friend_requests enable row level security;
alter table public.clubs           enable row level security;
alter table public.club_members    enable row level security;
alter table public.club_requests   enable row level security;
alter table public.club_posts      enable row level security;
alter table public.club_gifts      enable row level security;
alter table public.club_reactions  enable row level security;
alter table public.rooms           enable row level security;
alter table public.room_members    enable row level security;
alter table public.matches         enable row level security;
alter table public.match_results   enable row level security;
alter table public.match_details   enable row level security;
alter table public.reports         enable row level security;
alter table public.blocks          enable row level security;

-- ============================================================
-- 2. ポリシー・トリガー・既定値を外す
--
--   関数を作り直すために先に外す。**ここで消えるのは決まりごとだけで、行は消えない。**
--   4 で全部付け直す。
-- ============================================================

drop policy if exists profiles_select_own       on public.profiles;
drop policy if exists profiles_select_friend    on public.profiles;
drop policy if exists profiles_select_pending   on public.profiles;
drop policy if exists profiles_select_clubmate  on public.profiles;
drop policy if exists profiles_select_room      on public.profiles;
drop policy if exists profiles_insert_own       on public.profiles;
drop policy if exists profiles_update_own       on public.profiles;

drop policy if exists rosters_select_own        on public.rosters;
drop policy if exists rosters_select_friend     on public.rosters;
drop policy if exists rosters_select_clubmate   on public.rosters;
drop policy if exists rosters_select_room       on public.rosters;
drop policy if exists rosters_insert_own        on public.rosters;
drop policy if exists rosters_update_own        on public.rosters;

drop policy if exists friendships_select_own    on public.friendships;
drop policy if exists friendships_delete_own    on public.friendships;
drop policy if exists friend_requests_select    on public.friend_requests;
drop policy if exists friend_requests_insert    on public.friend_requests;
drop policy if exists friend_requests_delete    on public.friend_requests;

drop policy if exists clubs_select_mine         on public.clubs;
drop policy if exists club_members_select_mine  on public.club_members;
drop policy if exists club_requests_select_mine on public.club_requests;
drop policy if exists club_reactions_select     on public.club_reactions;

drop policy if exists rooms_select_member       on public.rooms;
drop policy if exists room_members_select_same  on public.room_members;
drop policy if exists room_members_update_own   on public.room_members;
drop policy if exists matches_select_mine       on public.matches;
drop policy if exists match_results_select_mine on public.match_results;
drop policy if exists match_details_select_mine on public.match_details;

drop policy if exists reports_insert_mine       on public.reports;
drop policy if exists reports_select_mine       on public.reports;
drop policy if exists blocks_select_mine        on public.blocks;
drop policy if exists blocks_insert_mine        on public.blocks;
drop policy if exists blocks_delete_mine        on public.blocks;

drop trigger if exists profiles_touch          on public.profiles;
drop trigger if exists rosters_touch           on public.rosters;
drop trigger if exists clubs_touch             on public.clubs;
drop trigger if exists rooms_touch             on public.rooms;
drop trigger if exists club_members_count_trg  on public.club_members;

-- コードの採番関数を作り直すので、それを使っている既定値を先に外す
alter table public.profiles alter column code drop default;
alter table public.clubs    alter column code drop default;

-- ============================================================
-- 3. 関数（最終版を1回だけ）
--
--   引数が変わったものは古い形も落とす（同じ名前で別の形が並ぶと
--   PostgREST がどれを呼べばいいか決められず、関数が無いのと同じ扱いになる）。
--   **関数を落としてもデータは消えない。**
-- ============================================================

drop function if exists public.touch_updated_at()                            cascade;
drop function if exists public.new_friend_code()                             cascade;
drop function if exists public.new_club_code()                               cascade;  -- 旧版。new_friend_code に一本化した
drop function if exists public.find_by_code(text)                            cascade;
drop function if exists public.send_friend_request(text)                     cascade;
drop function if exists public.accept_friend_request(uuid)                   cascade;
drop function if exists public.remove_friend(uuid)                           cascade;

drop function if exists public.my_club_id()                                  cascade;
drop function if exists public.my_club_role()                                cascade;
drop function if exists public.can_edit_club()                               cascade;
drop function if exists public.club_members_count()                          cascade;
drop function if exists public.club_member_cap()                             cascade;
drop function if exists public.club_req_cap(text)                            cascade;
drop function if exists public.club_open_stats(uuid, text, text[], text)     cascade;  -- 旧い形
drop function if exists public.club_open_stats(text, text[], text, integer[]) cascade;
drop function if exists public.search_clubs(text, integer)                   cascade;
drop function if exists public.find_club_by_code(text)                       cascade;
drop function if exists public.create_club(text, text)                       cascade;  -- 旧い形
drop function if exists public.create_club(text, text, text, text, integer)  cascade;
drop function if exists public.rename_club(text, text)                       cascade;  -- 廃止。update_club に一本化
drop function if exists public.join_club(text)                               cascade;  -- 旧い形
drop function if exists public.join_club(uuid)                               cascade;
drop function if exists public.cancel_club_request(uuid)                     cascade;
drop function if exists public.my_club_requests()                            cascade;
drop function if exists public.list_club_requests()                          cascade;
drop function if exists public.approve_club_request(uuid)                    cascade;
drop function if exists public.reject_club_request(uuid)                     cascade;
drop function if exists public.set_club_role(uuid, text)                     cascade;
drop function if exists public.leave_club()                                  cascade;
drop function if exists public.kick_club_member(uuid)                        cascade;
drop function if exists public.update_club(text, text, text, text, integer)  cascade;
drop function if exists public.clubs_of_users(uuid[])                        cascade;
drop function if exists public.post_club_message(integer)                    cascade;
drop function if exists public.post_club_text(text)                          cascade;
drop function if exists public.post_club_room(text)                          cascade;
drop function if exists public.post_club_request(text)                       cascade;  -- 旧い形
drop function if exists public.post_club_request(text, text)                 cascade;  -- 旧い形
drop function if exists public.post_club_request(text, text, text[])         cascade;
drop function if exists public.donate_club_card(uuid, jsonb)                 cascade;
drop function if exists public.donate_club_cards(uuid, jsonb)                cascade;
drop function if exists public.club_feed()                                   cascade;
drop function if exists public.list_club_posts()                             cascade;  -- 旧名
drop function if exists public.club_gift_count()                             cascade;
drop function if exists public.claim_club_gifts()                            cascade;
drop function if exists public.club_gift_list()                              cascade;
drop function if exists public.claim_club_gift(uuid)                         cascade;
drop function if exists public.react_club_post(uuid, integer)                cascade;
drop function if exists public.list_club_reactions()                         cascade;

drop function if exists public.new_room_code()                               cascade;
drop function if exists public.is_room_member(uuid)                          cascade;
drop function if exists public.shares_room_with(uuid)                        cascade;
drop function if exists public.close_stale_rooms()                           cascade;
drop function if exists public.create_room(jsonb, integer)                   cascade;
drop function if exists public.join_room(text)                               cascade;
drop function if exists public.leave_room(uuid)                              cascade;
drop function if exists public.kick_member(uuid, uuid)                       cascade;
drop function if exists public.start_room(uuid, jsonb)                       cascade;
drop function if exists public.finish_match(uuid, jsonb)                     cascade;  -- 旧い形
drop function if exists public.finish_match(uuid, jsonb, jsonb)              cascade;
drop function if exists public.match_retention_days()                        cascade;
drop function if exists public.prune_old_matches()                           cascade;
drop function if exists public.list_my_matches(integer)                      cascade;
drop function if exists public.save_match_detail(uuid, jsonb)                cascade;

drop function if exists public.delete_me()                                   cascade;
drop function if exists public.send_report(uuid, uuid, text, text)           cascade;
drop function if exists public.block_user(uuid)                              cascade;
drop function if exists public.unblock_user(uuid)                            cascade;
drop function if exists public.my_blocks()                                   cascade;

-- ── 共通の小道具 ──────────────────────────────────────
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- フレンドコードと走友会コードの採番（10桁）。どちらとも重ならない値が出るまで引き直す。
-- **走友会用の採番関数は作らない**（2本あると、片方だけ直したときに番号がぶつかる）。
create function public.new_friend_code() returns text
language plpgsql
security definer
set search_path = public
as $$
declare c text;
begin
  loop
    c := lpad((floor(random() * 10000000000))::bigint::text, 10, '0');
    exit when not exists (select 1 from public.profiles where code = c)
          and not exists (select 1 from public.clubs    where code = c);
  end loop;
  return c;
end $$;

-- ============================================================
-- フレンド
--   コード検索を関数に限定することで、名簿の総当たり取得を防ぐ。
-- ============================================================

-- コード完全一致で1件だけ返す（ロスターは返さない）
create function public.find_by_code(p_code text)
returns table (
  user_id uuid, code text, team_name text, short_name text, gm_name text,
  logo_id text, color_primary text, color_secondary text, champs integer, avg_ovr integer
)
language sql
security definer
set search_path = public
as $$
  select p.user_id, p.code, p.team_name, p.short_name, p.gm_name,
         p.logo_id, p.color_primary, p.color_secondary, p.champs, p.avg_ovr
  from public.profiles p
  where p.code = regexp_replace(p_code, '\s', '', 'g')
    and p.user_id <> auth.uid()
  limit 1;
$$;

-- 申請を送る。相手から既に申請が来ていた場合はその場で成立させる。
create function public.send_friend_request(p_code text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare target uuid;
begin
  select user_id into target from public.profiles
   where code = regexp_replace(p_code, '\s', '', 'g');
  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  if exists (select 1 from public.friendships
              where user_id = auth.uid() and friend_id = target) then
    return 'already_friends';
  end if;
  -- 相手からの申請が既にある＝相互申請なので成立
  if exists (select 1 from public.friend_requests
              where from_user = target and to_user = auth.uid()) then
    insert into public.friendships (user_id, friend_id)
      values (auth.uid(), target), (target, auth.uid())
      on conflict do nothing;
    delete from public.friend_requests
      where (from_user = target and to_user = auth.uid())
         or (from_user = auth.uid() and to_user = target);
    return 'accepted';
  end if;
  insert into public.friend_requests (from_user, to_user)
    values (auth.uid(), target) on conflict do nothing;
  return 'sent';
end $$;

-- 受け取った申請を承認する
create function public.accept_friend_request(p_from uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.friend_requests
                  where from_user = p_from and to_user = auth.uid()) then
    return 'not_found';
  end if;
  insert into public.friendships (user_id, friend_id)
    values (auth.uid(), p_from), (p_from, auth.uid())
    on conflict do nothing;
  delete from public.friend_requests
    where (from_user = p_from and to_user = auth.uid())
       or (from_user = auth.uid() and to_user = p_from);
  return 'accepted';
end $$;

-- フレンド解除（双方向まとめて消す）
create function public.remove_friend(p_friend uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships
   where (user_id = auth.uid() and friend_id = p_friend)
      or (user_id = p_friend   and friend_id = auth.uid());
  return 'removed';
end $$;

-- ============================================================
-- 走友会
-- ============================================================

-- 自分の所属先。ポリシーの中から club_members を直接見ると
-- 「ポリシーが自分の表を見る」形になって無限再帰になるため、
-- security definer の関数にして RLS を通さずに引く。
create function public.my_club_id() returns uuid
language sql
security definer
set search_path = public
stable
as $$ select club_id from public.club_members where user_id = auth.uid() $$;

create function public.my_club_role() returns text
language sql
security definer
set search_path = public
stable
as $$ select role from public.club_members where user_id = auth.uid() $$;

-- 会長か副会長か（＝走友会をいじれる人）
create function public.can_edit_club() returns boolean
language sql
security definer
set search_path = public
stable
as $$ select coalesce(public.my_club_role() in ('owner', 'admin'), false) $$;

-- 人数は clubs.members に持たせておく（検索のたびに数え直さないため）
create function public.club_members_count() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.clubs set members = members + 1 where id = new.club_id;
  else
    update public.clubs set members = greatest(members - 1, 0) where id = old.club_id;
  end if;
  return null;
end $$;

-- 走友会の人数の上限。**線はここ1本だけ**。
-- 以前は join_club と search_clubs が 30、approve_club_request だけ 50 で、
-- 「自分からは30人で止まるのに、承認制なら50人まで入れる」状態だった。
create function public.club_member_cap() returns integer
language sql immutable
as $$ select 30 $$;

-- 要求1件で集められる枚数
create function public.club_req_cap(p_rarity text) returns integer
language sql immutable
as $$ select case p_rarity when 'normal' then 5 when 'rare' then 3 when 'epic' then 1 else 0 end $$;

-- まだ埋まっていない枠が欲しい種類。返すのは枠の並び順。
-- 例：{speed,'',stamina} なら「スピード1枚・おまかせ1枚・スタミナ1枚がまだ空いている」
create function public.club_open_stats(
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

-- ── 検索 ─────────────────────────────────────────────
-- 名前の一部でもコードでも引ける。空なら「おすすめ」。
-- 入れない走友会（満員・募集停止）も出す。画面側に「満員」「停止中」の出し分けがあるので、
-- 消してしまうと「作った走友会が他のアカウントから見えない」になる。
create function public.search_clubs(p_q text default '', p_limit integer default 30)
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
  order by (c.join_type <> 'closed' and c.members < public.club_member_cap()) desc,
           c.members desc, c.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
$$;

-- コードちょうど1件（コード入力欄から使う）
create function public.find_club_by_code(p_code text)
returns table (
  id uuid, code text, name text, note text, logo_id text,
  join_type text, min_ovr integer, members integer, avg_ovr integer
)
language sql
security definer
set search_path = public
stable
as $$ select * from public.search_clubs(p_code, 1) $$;

-- ── 作る ─────────────────────────────────────────────
create function public.create_club(
  p_name text, p_note text default '', p_logo text default 'club_01',
  p_join_type text default 'open', p_min_ovr integer default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then return null; end if;
  if exists (select 1 from public.club_members where user_id = me) then
    return null;                                   -- すでにどこかに入っている
  end if;
  insert into public.clubs (name, note, logo_id, join_type, min_ovr, owner)
    values (trim(p_name), coalesce(p_note, ''), coalesce(p_logo, 'club_01'),
            coalesce(p_join_type, 'open'), coalesce(p_min_ovr, 0), me)
    returning id into new_id;
  insert into public.club_members (user_id, club_id, role) values (me, new_id, 'owner');
  delete from public.club_requests where user_id = me;   -- 出しっぱなしの申請は捨てる
  return new_id;
end $$;

-- ── 入る ─────────────────────────────────────────────
-- 'joined' その場で加入 / 'requested' 承認待ち / 'already' すでに所属
-- 'full' 満員 / 'closed' 募集停止 / 'low_ovr' 条件に届かない / 'not_found'
create function public.join_club(p_club uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); c public.clubs%rowtype; my_ovr integer;
begin
  if me is null then return 'not_found'; end if;
  if exists (select 1 from public.club_members where user_id = me) then return 'already'; end if;
  select * into c from public.clubs where id = p_club;
  if not found then return 'not_found'; end if;
  if c.members >= public.club_member_cap() then return 'full'; end if;

  select coalesce(avg_ovr, 0) into my_ovr from public.profiles where user_id = me;
  if coalesce(my_ovr, 0) < c.min_ovr then return 'low_ovr'; end if;

  if c.join_type = 'closed' then return 'closed'; end if;

  if c.join_type = 'approval' then
    insert into public.club_requests (club_id, user_id) values (c.id, me) on conflict do nothing;
    return 'requested';
  end if;

  insert into public.club_members (user_id, club_id, role) values (me, c.id, 'member');
  delete from public.club_requests where user_id = me;
  return 'joined';
end $$;

-- 出した申請を取り消す
create function public.cancel_club_request(p_club uuid) returns void
language sql
security definer
set search_path = public
as $$ delete from public.club_requests where club_id = p_club and user_id = auth.uid() $$;

-- 自分が申請中の走友会（一覧のボタン表示を切り替えるため）
create function public.my_club_requests() returns table (club_id uuid)
language sql
security definer
set search_path = public
stable
as $$ select club_id from public.club_requests where user_id = auth.uid() $$;

-- ── 承認（会長と副会長） ───────────────────────────────
create function public.list_club_requests()
returns table (
  user_id uuid, code text, team_name text, short_name text, gm_name text,
  logo_id text, color_primary text, color_secondary text, champs integer,
  avg_ovr integer, updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, p.code, p.team_name, p.short_name, p.gm_name, p.logo_id,
         p.color_primary, p.color_secondary, p.champs, p.avg_ovr, p.updated_at
  from public.club_requests r
  join public.profiles p on p.user_id = r.user_id
  where public.can_edit_club() and r.club_id = public.my_club_id()
  order by r.created_at
$$;

create function public.approve_club_request(p_user uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare c public.clubs%rowtype;
begin
  if not public.can_edit_club() then return 'not_found'; end if;
  select * into c from public.clubs where id = public.my_club_id();
  if not found then return 'not_found'; end if;
  if not exists (select 1 from public.club_requests where club_id = c.id and user_id = p_user) then
    return 'not_found';
  end if;
  delete from public.club_requests where club_id = c.id and user_id = p_user;
  if c.members >= public.club_member_cap() then return 'full'; end if;
  if exists (select 1 from public.club_members where user_id = p_user) then return 'already'; end if;
  insert into public.club_members (user_id, club_id, role) values (p_user, c.id, 'member');
  delete from public.club_requests where user_id = p_user;   -- 他所への申請も消す
  return 'joined';
end $$;

create function public.reject_club_request(p_user uuid) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.club_requests
  where user_id = p_user
    and public.can_edit_club()
    and club_id = public.my_club_id()
$$;

-- ── 副会長の任命・解任（会長だけ） ─────────────────────
-- 'ok' / 'not_owner' / 'not_member' / 'too_many'（副会長は3人まで） / 'bad_role'
create function public.set_club_role(p_user uuid, p_role text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare my_club uuid; now_role text; n integer;
begin
  if coalesce(p_role, '') not in ('admin', 'member') then return 'bad_role'; end if;
  select id into my_club from public.clubs where owner = auth.uid();
  if my_club is null then return 'not_owner'; end if;
  if p_user = auth.uid() then return 'bad_role'; end if;

  select role into now_role from public.club_members
    where user_id = p_user and club_id = my_club;
  if now_role is null or now_role = 'owner' then return 'not_member'; end if;
  if now_role = p_role then return 'ok'; end if;

  if p_role = 'admin' then
    select count(*) into n from public.club_members
      where club_id = my_club and role = 'admin';
    if n >= 3 then return 'too_many'; end if;
  end if;

  update public.club_members set role = p_role
    where user_id = p_user and club_id = my_club;
  return 'ok';
end $$;

-- ── 抜ける（会長は副会長へ引き継ぐ） ───────────────────
-- 'left' 抜けた / 'disbanded' 最後の1人だったので解散 / 'not_in_club'
create function public.leave_club() returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid; next_user uuid;
begin
  select club_id into my_club from public.club_members where user_id = me;
  if my_club is null then return 'not_in_club'; end if;

  delete from public.club_members where user_id = me;

  if exists (select 1 from public.clubs where id = my_club and owner = me) then
    -- まず副会長のいちばん古い人へ。いなければ最古参へ。
    select user_id into next_user from public.club_members
      where club_id = my_club and role = 'admin' order by joined_at limit 1;
    if next_user is null then
      select user_id into next_user from public.club_members
        where club_id = my_club order by joined_at limit 1;
    end if;
    if next_user is null then
      delete from public.clubs where id = my_club;                       -- 誰もいなくなったら解散
      return 'disbanded';
    end if;
    update public.clubs set owner = next_user where id = my_club;
    update public.club_members set role = 'owner' where user_id = next_user;
  end if;
  return 'left';
end $$;

-- ── メンバーを外す ─────────────────────────────────────
-- 会長：会長以外なら誰でも外せる。副会長：一般だけ外せる。
create function public.kick_club_member(p_user uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare my_club uuid; my_role text; his_role text;
begin
  my_club := public.my_club_id();
  my_role := public.my_club_role();
  if my_club is null or p_user = auth.uid() then return; end if;
  if coalesce(my_role, '') not in ('owner', 'admin') then return; end if;

  select role into his_role from public.club_members
    where user_id = p_user and club_id = my_club;
  if his_role is null or his_role = 'owner' then return; end if;
  if my_role = 'admin' and his_role = 'admin' then return; end if;

  delete from public.club_members where user_id = p_user and club_id = my_club;
end $$;

-- ── 設定の変更（会長と副会長） ─────────────────────────
create function public.update_club(
  p_name text, p_note text default '', p_logo text default 'club_01',
  p_join_type text default 'open', p_min_ovr integer default 0
) returns void
language sql
security definer
set search_path = public
as $$
  update public.clubs set
    name      = trim(p_name),
    note      = coalesce(p_note, ''),
    logo_id   = coalesce(p_logo, 'club_01'),
    join_type = coalesce(p_join_type, 'open'),
    min_ovr   = coalesce(p_min_ovr, 0)
  where id = public.my_club_id() and public.can_edit_club()
$$;

-- ── フレンドの所属走友会（名前とロゴだけ） ─────────────
-- 走友会の名前はもともと検索で誰でも見えるので、隠す情報ではない。
create function public.clubs_of_users(p_ids uuid[])
returns table (user_id uuid, club_id uuid, club_name text, club_logo text, club_code text)
language sql
security definer
set search_path = public
stable
as $$
  select m.user_id, c.id, c.name, c.logo_id, c.code
  from public.club_members m
  join public.clubs c on c.id = m.club_id
  where m.user_id = any(coalesce(p_ids, '{}'::uuid[]))
$$;

-- ── 定型文を書く ───────────────────────────────────────
-- 'ok' / 'not_in_club' / 'too_fast'（連投防止：1分に1回まで）
create function public.post_club_message(p_phrase integer) returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); my_club uuid;
begin
  if me is null then return 'not_in_club'; end if;
  my_club := public.my_club_id();
  if my_club is null then return 'not_in_club'; end if;
  if exists (
    select 1 from public.club_posts
    where user_id = me and kind = 'msg' and created_at > now() - interval '1 minute'
  ) then return 'too_fast'; end if;

  insert into public.club_posts (club_id, user_id, kind, phrase)
    values (my_club, me, 'msg', greatest(least(coalesce(p_phrase, 0), 11), 0));
  return 'ok';
end $$;

-- ── 自由入力で書く ─────────────────────────────────────
-- 'ok' / 'not_in_club' / 'too_fast'（連投防止：1分に1回まで）/ 'empty'
-- ★`post_club_message`（定型文の番号）は残す。build 126 までのアプリは番号しか
--   送れないので、消すとその人の掲示板が丸ごと動かなくなる。
create function public.post_club_text(p_body text) returns text
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
-- 部屋そのものは create_room で作る。ここは「その番号を掲示板に貼る」だけで、
-- 部屋の生き死にはアプリが入るときに確かめる。
create function public.post_club_room(p_code text) returns text
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

-- ── カードをお願いする（1枚ずつ種類を指定できる） ────────
-- 'ok' / 'not_in_club' / 'today_done'（今日はもう出した） / 'bad_rarity'
create function public.post_club_request(
  p_rarity text, p_stat text default '', p_stats text[] default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); my_club uuid; cap integer; ss text[] := '{}'; v text; i integer;
begin
  if me is null then return 'not_in_club'; end if;
  my_club := public.my_club_id();
  if my_club is null then return 'not_in_club'; end if;
  if coalesce(p_rarity, '') not in ('normal', 'rare', 'epic') then return 'bad_rarity'; end if;

  cap := public.club_req_cap(p_rarity);
  for i in 1..cap loop
    v := coalesce(case when p_stats is null then null else p_stats[i] end, coalesce(p_stat, ''));
    if v not in ('', 'speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery') then
      v := '';
    end if;
    ss := ss || v;
  end loop;

  if exists (
    select 1 from public.club_posts
    where user_id = me and kind = 'req'
      and (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date
  ) then return 'today_done'; end if;

  -- stat（1件まるごとの指定）は使わなくなったので空にしておく。
  -- 古いアプリが読んでも「おまかせ」に見えるだけで、実際の判定は stats を見る。
  insert into public.club_posts (club_id, user_id, kind, rarity, stat, stats)
    values (my_club, me, 'req', p_rarity, '', ss);
  return 'ok';
end $$;

-- ── カードをまとめて渡す ───────────────────────────────
-- 返り値は {"status":"ok","given":3,"ids":["...","..."]}。
-- ids は実際に渡せたカードのid。渡せたぶんだけ手元から減らすために返す。
-- status は ok / not_found / mine / full / bad_card。
create function public.donate_club_cards(p_post uuid, p_cards jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); t public.club_posts%rowtype; cap integer;
  free_slots integer[] := '{}'; want text[] := '{}';
  c jsonb; i integer; k integer; picked integer; ids text[] := '{}';
begin
  if me is null then return jsonb_build_object('status', 'not_found', 'given', 0, 'ids', '[]'::jsonb); end if;

  select * into t from public.club_posts where id = p_post and club_id = public.my_club_id();
  if not found or t.kind <> 'req' then
    return jsonb_build_object('status', 'not_found', 'given', 0, 'ids', '[]'::jsonb);
  end if;
  if t.user_id = me then
    return jsonb_build_object('status', 'mine', 'given', 0, 'ids', '[]'::jsonb);
  end if;

  cap := public.club_req_cap(t.rarity);
  for i in 1..cap loop
    if not (i - 1 = any (coalesce(t.taken, '{}'::integer[]))) then
      free_slots := free_slots || (i - 1);
      want := want || coalesce(t.stats[i], nullif(t.stat, ''), '');
    end if;
  end loop;
  if array_length(free_slots, 1) is null then
    return jsonb_build_object('status', 'full', 'given', 0, 'ids', '[]'::jsonb);
  end if;

  for c in select * from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) loop
    -- レジェンドや完全休養は渡せない。レアリティ違いもここで弾く。
    if coalesce(c->>'rarity', '') <> t.rarity or (c->>'kind') is not null then continue; end if;

    -- 種類の指定がある枠から先に埋める。
    -- おまかせ枠を先に潰すと、指定枠に合うカードの行き場が無くなって渡せる枚数が減る。
    picked := null;
    for k in 1..coalesce(array_length(free_slots, 1), 0) loop
      if want[k] <> '' and want[k] = coalesce(c->>'statKey', '') then picked := k; exit; end if;
    end loop;
    if picked is null then
      for k in 1..coalesce(array_length(free_slots, 1), 0) loop
        if want[k] = '' then picked := k; exit; end if;
      end loop;
    end if;
    if picked is null then continue; end if;

    insert into public.club_gifts (post_id, to_user, from_user, card, slot)
      values (t.id, t.user_id, me, c, free_slots[picked]);
    ids := ids || (c->>'id');
    t.taken := coalesce(t.taken, '{}'::integer[]) || free_slots[picked];

    free_slots := free_slots[1:picked - 1] || free_slots[picked + 1:];
    want := want[1:picked - 1] || want[picked + 1:];
    if array_length(free_slots, 1) is null then exit; end if;
  end loop;

  -- 埋まった枠はお願いの側に残す。カードは受け取られると消えるので、
  -- カードの行を数えると受け取ったとたんに枠が空きに戻ってしまう。
  update public.club_posts
     set taken = t.taken, filled = coalesce(cardinality(t.taken), 0)
   where id = t.id;

  return jsonb_build_object(
    'status', case when array_length(ids, 1) is null then 'bad_card' else 'ok' end,
    'given',  coalesce(array_length(ids, 1), 0),
    'ids',    to_jsonb(ids)
  );
end $$;

-- 1枚だけ渡す古い窓口（古いアプリ向け）。中身はまとめて渡す方に任せる。
create function public.donate_club_card(p_post uuid, p_card jsonb) returns text
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb;
begin
  r := public.donate_club_cards(p_post, jsonb_build_array(p_card));
  return r->>'status';
end $$;

-- ── 掲示板を読む ───────────────────────────────────────
-- **club_feed の定義はここ1か所だけ。** 以前は4つのファイルに書いてあり、
-- 後から流したものが前の列を消していた（open_stats が返らなくなり、カードの
-- 差し入れが「あと0枚まで入ります」で押せなくなる事故がこれ）。
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

  -- ── 掃除（読みに来たときだけ。cron を増やさないため） ──
  -- 集まったお願いを下ろす。ただし「今日はもうお願いした」の判定
  -- （post_club_request）はこの行を見ているので、当日ぶんは消さない。
  delete from public.club_posts t
   where t.club_id = my_club
     and t.kind = 'req'
     and t.filled >= public.club_req_cap(t.rarity)
     and (t.created_at at time zone 'Asia/Tokyo')::date
       < (now() at time zone 'Asia/Tokyo')::date;

  -- 古い書き込みを落とす。
  -- ★別名（old）は必須。返り値の列名にも created_at があるので、付けないと
  --   column reference "created_at" is ambiguous でこの関数ごと落ちる。
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

-- ── 反応スタンプ ───────────────────────────────────────
-- 同じ絵文字をもう一度送ったら取り消し、違う絵文字なら付け替え。
create function public.react_club_post(p_post uuid, p_emoji integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); v_club uuid; v_cur integer;
begin
  if me is null then raise exception 'not signed in'; end if;

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

-- 投稿ごとに「番号 → 人数」と「自分が押した番号」。
-- 投稿の一覧とは別に引く（club_feed の返り値を変えると古いアプリが壊れるため）。
create function public.list_club_reactions()
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

-- ── 届いたカードを受け取る ─────────────────────────────
create function public.club_gift_count() returns integer
language sql
security definer
set search_path = public
stable
as $$ select count(*)::integer from public.club_gifts where to_user = auth.uid() $$;

-- 「誰から・何のカードか」付きで読む（通知用）
create function public.club_gift_list()
returns table (id uuid, card jsonb, from_name text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select g.id, g.card, coalesce(nullif(p.team_name, ''), '走友会のなかま'), g.created_at
  from public.club_gifts g
  left join public.profiles p on p.user_id = g.from_user
  where g.to_user = auth.uid()
  order by g.created_at
  limit 100
$$;

-- 1枚だけ受け取る。受け取れたらそのカードを返す（無ければ null）。
create function public.claim_club_gift(p_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c jsonb;
begin
  delete from public.club_gifts where id = p_id and to_user = auth.uid() returning card into c;
  return c;
end $$;

-- まとめて受け取る（受け取ると同時に消える。二重に受け取らないため）
create function public.claim_club_gifts() returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return query delete from public.club_gifts where to_user = auth.uid() returning card;
end $$;

-- ============================================================
-- オンライン対戦
--   部屋は6桁の数字。番号を知っている人だけが入れる（総当たり防止で検索はRPC限定）。
--   試合中のやりとりは Realtime のブロードキャストで行い、DBは
--   「部屋の在席」と「終わった試合の戦績」だけを持つ。
-- ============================================================

-- 6桁の部屋番号を採番。生きている部屋と重複しない値が出るまで引き直す。
create function public.new_room_code() returns text
language plpgsql
security definer
set search_path = public
as $$
declare c text;
begin
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.rooms where code = c and status <> 'closed');
  end loop;
  return c;
end $$;

-- ポリシーの中から room_members を直接 select すると自己参照で無限再帰になるため、
-- 判定は security definer 関数（RLSを迂回する）に逃がしている。
create function public.is_room_member(p_room uuid) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.room_members m
                  where m.room_id = p_room and m.user_id = auth.uid());
$$;

-- 相手と同じ部屋にいるか（プロフィール／ロスターの相互閲覧に使う）
create function public.shares_room_with(p_user uuid) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.room_members me
      join public.room_members other on other.room_id = me.room_id
      join public.rooms r            on r.id = me.room_id
     where me.user_id = auth.uid()
       and other.user_id = p_user
       and r.status <> 'closed'
  );
$$;

-- 期限切れ・空になった部屋を閉じる。入室や作成のたびに軽く呼ぶ。
create function public.close_stale_rooms() returns void
language sql
security definer
set search_path = public
as $$
  update public.rooms set status = 'closed'
   where status <> 'closed'
     and (expires_at < now()
          or not exists (select 1 from public.room_members m
                          where m.room_id = rooms.id and m.left_at is null));
$$;

-- 部屋を作る。作った人がホストで、席1に入る。
-- 自分が持っていた古い部屋は閉じる（部屋の乱立防止）。
create function public.create_room(p_rules jsonb default '{}'::jsonb, p_max integer default 20)
returns table (room_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_code text; v_max integer;
begin
  perform public.close_stale_rooms();
  v_max := least(greatest(coalesce(p_max, 20), 3), 20);

  update public.rooms set status = 'closed' where host = auth.uid() and status <> 'closed';

  v_code := public.new_room_code();
  insert into public.rooms (code, host, rules, max_players)
    values (v_code, auth.uid(), coalesce(p_rules, '{}'::jsonb), v_max)
    returning id into v_id;
  insert into public.room_members (room_id, user_id, seat) values (v_id, auth.uid(), 1);

  return query select v_id, v_code;
end $$;

-- 番号で入室する。戻り値の status は joined / not_found / full / started / closed
create function public.join_room(p_code text)
returns table (status text, room_id uuid, seat integer)
language plpgsql
security definer
set search_path = public
as $$
declare r public.rooms%rowtype; v_seat integer; v_count integer;
begin
  perform public.close_stale_rooms();

  -- ※ この関数の戻り値の列名（status / room_id / seat）と、表の列名が同じなので、
  --   中の SQL では必ず表の別名を付けること。付け忘れると Postgres が
  --   どちらを指すのか判断できず、実行時にエラー（＝アプリでは通信エラー）になる。
  select * into r from public.rooms rm
   where rm.code = regexp_replace(coalesce(p_code, ''), '\D', '', 'g') and rm.status <> 'closed'
   limit 1;
  if r.id is null then return query select 'not_found'::text, null::uuid, null::integer; return; end if;
  if r.status = 'playing' then
    -- すでに参加している人の再入室（アプリを閉じて戻ってきた場合）は通す
    if exists (select 1 from public.room_members m where m.room_id = r.id and m.user_id = auth.uid()) then
      update public.room_members m set left_at = null
       where m.room_id = r.id and m.user_id = auth.uid()
       returning m.seat into v_seat;
      return query select 'joined'::text, r.id, v_seat; return;
    end if;
    return query select 'started'::text, null::uuid, null::integer; return;
  end if;

  -- 既に入っている場合はそのまま席を返す
  select m.seat into v_seat from public.room_members m
   where m.room_id = r.id and m.user_id = auth.uid();
  if v_seat is not null then
    update public.room_members m set left_at = null
     where m.room_id = r.id and m.user_id = auth.uid();
    return query select 'joined'::text, r.id, v_seat; return;
  end if;

  select count(*) into v_count from public.room_members m
   where m.room_id = r.id and m.left_at is null;
  if v_count >= r.max_players then
    return query select 'full'::text, null::uuid, null::integer; return;
  end if;

  -- 空いている最小の席番号を取る
  select min(s) into v_seat from generate_series(1, r.max_players) s
   where not exists (select 1 from public.room_members m where m.room_id = r.id and m.seat = s);

  insert into public.room_members (room_id, user_id, seat) values (r.id, auth.uid(), v_seat);
  return query select 'joined'::text, r.id, v_seat;
end $$;

-- 退室する。ホストが抜けたら部屋ごと解散。
create function public.leave_room(p_room uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid; v_status text;
begin
  select host, status into v_host, v_status from public.rooms where id = p_room;
  if v_host is null then return 'not_found'; end if;

  if v_status = 'playing' then
    -- 試合中の離脱は「不戦敗」の記録が要るので行は残す
    update public.room_members set left_at = now(), ready = false
     where room_id = p_room and user_id = auth.uid();
  else
    delete from public.room_members where room_id = p_room and user_id = auth.uid();
  end if;

  if v_host = auth.uid() then
    update public.rooms set status = 'closed' where id = p_room;
    return 'closed';
  end if;
  perform public.close_stale_rooms();
  return 'left';
end $$;

-- ホストが参加者を退出させる（キック）
create function public.kick_member(p_room uuid, p_user uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid;
begin
  select host into v_host from public.rooms where id = p_room;
  if v_host is null then return 'not_found'; end if;
  if v_host <> auth.uid() then return 'not_host'; end if;
  if p_user = auth.uid() then return 'self'; end if;
  delete from public.room_members where room_id = p_room and user_id = p_user;
  return 'kicked';
end $$;

-- ホストが試合を開始する。以後この部屋には新規入室できない。
create function public.start_room(p_room uuid, p_rules jsonb default '{}'::jsonb) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid; v_count integer;
begin
  select host into v_host from public.rooms where id = p_room;
  if v_host is null then return 'not_found'; end if;
  if v_host <> auth.uid() then return 'not_host'; end if;

  select count(*) into v_count from public.room_members
   where room_id = p_room and left_at is null;
  if v_count < 1 then return 'empty'; end if;

  update public.rooms
     set status = 'playing', rules = coalesce(p_rules, rules),
         expires_at = now() + interval '3 hours'
   where id = p_room;
  return 'started';
end $$;

-- 試合結果を確定する（ホストのみ）。同じ部屋で二重に確定はできない。
-- p_results は [{ "user_id": "...", "rank": 1, "points": 34, "forfeit": false }, ...]
create function public.finish_match(p_room uuid, p_summary jsonb, p_results jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid; v_rules jsonb; v_match uuid;
begin
  select host, rules into v_host, v_rules from public.rooms where id = p_room;
  if v_host is null then raise exception 'room not found'; end if;
  if v_host <> auth.uid() then raise exception 'not host'; end if;
  if exists (select 1 from public.matches where room_id = p_room) then
    raise exception 'already finished';
  end if;

  insert into public.matches (room_id, host, rules, summary)
    values (p_room, auth.uid(), v_rules, coalesce(p_summary, '{}'::jsonb))
    returning id into v_match;

  -- 部屋にいた人のぶんだけ記録する（部外者のIDを混ぜられないようにする）
  insert into public.match_results (match_id, user_id, rank, points, forfeit)
  select v_match,
         (e->>'user_id')::uuid,
         coalesce((e->>'rank')::integer, 99),
         coalesce((e->>'points')::integer, 0),
         coalesce((e->>'forfeit')::boolean, false)
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) e
   where exists (select 1 from public.room_members m
                  where m.room_id = p_room and m.user_id = (e->>'user_id')::uuid)
  on conflict do nothing;

  -- 通算戦績
  update public.profiles p set
    mp_played   = p.mp_played + 1,
    mp_wins     = p.mp_wins     + (case when mr.rank = 1 and not mr.forfeit then 1 else 0 end),
    mp_forfeits = p.mp_forfeits + (case when mr.forfeit then 1 else 0 end)
   from public.match_results mr
  where mr.match_id = v_match and mr.user_id = p.user_id;

  update public.rooms set status = 'closed' where id = p_room;
  return v_match;
end $$;

-- ── 対戦記録の掃除（60日） ─────────────────────────────
-- 定期実行の仕組み（pg_cron 等）を増やさずに済むよう、読みに来たついでに消す。
-- 通算戦績（profiles.mp_*）は別カウンタなので、履歴を消しても減らない。
create function public.match_retention_days() returns integer
language sql immutable as $$ select 60 $$;

create function public.prune_old_matches() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.matches
   where finished_at < now() - (public.match_retention_days() || ' days')::interval;
end $$;

-- 自分の対戦履歴を返す。呼ばれたついでに古いものを消す。
create function public.list_my_matches(p_limit integer default 20)
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

-- 詳細を保存する。ホストが finish_match() の直後に1回だけ呼ぶ。
-- 詳細はあくまで「あると嬉しいもの」なので、失敗しても対戦の記録自体は残る。
create function public.save_match_detail(p_match uuid, p_detail jsonb)
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

-- ============================================================
-- 通報・ブロック
-- ============================================================

-- 返り値：'ok' | 'self' | 'bad' | 'too_many'（荒らし対策で1日20件まで）
create function public.send_report(p_user uuid, p_club uuid, p_reason text, p_detail text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then return 'bad'; end if;
  if p_user is null and p_club is null then return 'bad'; end if;
  if p_user = me then return 'self'; end if;
  if p_reason not in ('harass', 'sexual', 'impersonate', 'spam', 'other') then return 'bad'; end if;

  select count(*) into n from public.reports
    where reporter = me and created_at > now() - interval '1 day';
  if n >= 20 then return 'too_many'; end if;

  insert into public.reports (reporter, target_user, target_club, reason, detail)
    values (me, p_user, p_club, p_reason, left(coalesce(p_detail, ''), 200));
  return 'ok';
end $$;

-- ブロックする。ついでにフレンド関係と申請も消す
-- （ブロックしたのに一覧に残るのは不自然なので）。'ok' | 'self' | 'bad'
create function public.block_user(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user is null then return 'bad'; end if;
  if p_user = me then return 'self'; end if;

  insert into public.blocks (user_id, blocked_id) values (me, p_user)
    on conflict (user_id, blocked_id) do nothing;

  delete from public.friendships
    where (user_id = me and friend_id = p_user) or (user_id = p_user and friend_id = me);
  delete from public.friend_requests
    where (from_user = me and to_user = p_user) or (from_user = p_user and to_user = me);

  return 'ok';
end $$;

create function public.unblock_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.blocks where user_id = auth.uid() and blocked_id = p_user;
end $$;

-- ブロックした相手の一覧。profiles の select ポリシーはフレンド／同じ走友会しか
-- 通さないので、ブロック後も名前を出せるようこの関数で読む。
create function public.my_blocks()
returns table (
  user_id uuid, code text, team_name text, short_name text, gm_name text,
  logo_id text, color_primary text, color_secondary text, champs integer, avg_ovr integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  return query
    select p.user_id, p.code, p.team_name, p.short_name, p.gm_name,
           p.logo_id, p.color_primary, p.color_secondary, p.champs, p.avg_ovr, p.updated_at
    from public.blocks b
    join public.profiles p on p.user_id = b.blocked_id
    where b.user_id = me
    order by b.created_at desc;
end $$;

-- ============================================================
-- アカウント削除（App Store の要件）
-- ============================================================

create function public.delete_me() returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;

  -- 1. 走友会。会長のまま消すと clubs.owner の cascade で走友会ごと消えてしまうので、
  --    先に「退会」と同じ処理を通す（会長は副会長／最古参へ引き継ぎ、誰もいなければ解散）。
  perform public.leave_club();

  -- 2. 参加中の部屋。行は残す仕様（結果表示に出す）ので、離脱扱いにしておく。
  update public.room_members set left_at = now()
    where user_id = me and left_at is null;

  -- 3. 本体。auth.users を消せば、この下の表は全部 on delete cascade で一緒に消える。
  begin
    delete from auth.users where id = me;
    return;
  exception when insufficient_privilege then
    null;   -- auth スキーマを触る権限が無い環境向け。下の手動削除に落ちる。
  end;

  -- 4. 3が権限で弾かれたときの保険。ログイン情報（auth.users の行）だけは残るが、
  --    個人のデータはここで全部消える。
  delete from public.friendships     where user_id  = me or friend_id = me;
  delete from public.friend_requests where from_user = me or to_user  = me;
  delete from public.club_requests   where user_id  = me;
  delete from public.club_gifts      where to_user  = me or from_user = me;
  delete from public.club_posts      where user_id  = me;
  delete from public.rosters         where user_id  = me;
  delete from public.profiles        where user_id  = me;
end $$;

-- ============================================================
-- 4. 既定値・トリガー・ポリシーを付け直す
-- ============================================================

alter table public.profiles alter column code set default public.new_friend_code();
alter table public.clubs    alter column code set default public.new_friend_code();

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger rosters_touch before update on public.rosters
  for each row execute function public.touch_updated_at();
create trigger clubs_touch before update on public.clubs
  for each row execute function public.touch_updated_at();
create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();
create trigger club_members_count_trg after insert or delete on public.club_members
  for each row execute function public.club_members_count();

-- ── profiles ──────────────────────────────────────────
-- 書けるのは自分の行だけ。読めるのは 自分 / フレンド / 申請中の相手 /
-- 同じ走友会の人 / 同じ部屋にいる人。
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy profiles_select_friend on public.profiles
  for select to authenticated using (
    exists (select 1 from public.friendships f
            where f.user_id = auth.uid() and f.friend_id = profiles.user_id)
  );
-- 申請中の相手（承認・申請タブにチーム名とロゴを出すため）
create policy profiles_select_pending on public.profiles
  for select to authenticated using (
    exists (select 1 from public.friend_requests r
            where (r.from_user = auth.uid() and r.to_user   = profiles.user_id)
               or (r.to_user   = auth.uid() and r.from_user = profiles.user_id))
  );
create policy profiles_select_clubmate on public.profiles
  for select to authenticated using (
    user_id in (select user_id from public.club_members where club_id = public.my_club_id())
  );
-- 同じ部屋にいる相手（フレンドでなくてもロビーに名前が出る・対戦できる）
create policy profiles_select_room on public.profiles
  for select to authenticated using (public.shares_room_with(profiles.user_id));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── rosters ───────────────────────────────────────────
-- 殿堂入り（hof 列）も同じ行なので、この決まりがそのまま効く。
-- 申請中の相手には見せない（profiles とここだけ範囲が違う）。
create policy rosters_select_own on public.rosters
  for select to authenticated using (user_id = auth.uid());
create policy rosters_select_friend on public.rosters
  for select to authenticated using (
    exists (select 1 from public.friendships f
            where f.user_id = auth.uid() and f.friend_id = rosters.user_id)
  );
create policy rosters_select_clubmate on public.rosters
  for select to authenticated using (
    user_id in (select user_id from public.club_members where club_id = public.my_club_id())
  );
create policy rosters_select_room on public.rosters
  for select to authenticated using (public.shares_room_with(rosters.user_id));
create policy rosters_insert_own on public.rosters
  for insert to authenticated with check (user_id = auth.uid());
create policy rosters_update_own on public.rosters
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── フレンド関係 ──────────────────────────────────────
-- 自分の行だけ見える／消せる（追加は関数経由のみ）
create policy friendships_select_own on public.friendships
  for select to authenticated using (user_id = auth.uid());
create policy friendships_delete_own on public.friendships
  for delete to authenticated using (user_id = auth.uid());

-- 自分が関わるものだけ。送信は自分名義のみ。取消・拒否は両者可。
create policy friend_requests_select on public.friend_requests
  for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
create policy friend_requests_insert on public.friend_requests
  for insert to authenticated with check (from_user = auth.uid());
create policy friend_requests_delete on public.friend_requests
  for delete to authenticated using (from_user = auth.uid() or to_user = auth.uid());

-- ── 走友会 ────────────────────────────────────────────
-- 直接読めるのは「自分が入っている走友会」だけ。他所は search_clubs 越しに見る。
create policy clubs_select_mine on public.clubs
  for select to authenticated using (id = public.my_club_id());
create policy club_members_select_mine on public.club_members
  for select to authenticated using (club_id = public.my_club_id());
-- 自分が出した申請は自分で見られる（一覧の「申請中」表示用）
create policy club_requests_select_mine on public.club_requests
  for select to authenticated using (user_id = auth.uid());

-- club_posts / club_gifts にはポリシーを作らない＝RPC越しでしか触れない。

-- 反応は同じ走友会の人だけ見える（投稿本体と同じ範囲）。書き込みは RPC のみ。
create policy club_reactions_select on public.club_reactions
  for select to authenticated using (
    exists (select 1 from public.club_posts p
             where p.id = club_reactions.post_id and p.club_id = public.my_club_id())
  );

-- ── 対戦 ─────────────────────────────────────────────
-- 部屋の中身が見えるのは、その部屋にいる人だけ。
-- 番号での検索は join_room() だけに許し、総当たりで他人の部屋を覗けないようにする。
create policy rooms_select_member on public.rooms
  for select to authenticated using (public.is_room_member(rooms.id));
create policy room_members_select_same on public.room_members
  for select to authenticated using (public.is_room_member(room_members.room_id));
create policy room_members_update_own on public.room_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 自分が出た試合だけ見える。書き込みは finish_match() / save_match_detail() のみ。
create policy matches_select_mine on public.matches
  for select to authenticated using (
    exists (select 1 from public.match_results mr
             where mr.match_id = matches.id and mr.user_id = auth.uid())
  );
create policy match_results_select_mine on public.match_results
  for select to authenticated using (
    exists (select 1 from public.match_results mine
             where mine.match_id = match_results.match_id and mine.user_id = auth.uid())
  );
create policy match_details_select_mine on public.match_details
  for select to authenticated using (
    exists (select 1 from public.match_results mr
             where mr.match_id = match_details.match_id and mr.user_id = auth.uid())
  );

-- ── 通報・ブロック ────────────────────────────────────
-- 通報が読めるのは出した本人だけ。中身の確認は Supabase のダッシュボードから。
create policy reports_insert_mine on public.reports
  for insert to authenticated with check (reporter = auth.uid());
create policy reports_select_mine on public.reports
  for select to authenticated using (reporter = auth.uid());
create policy blocks_select_mine on public.blocks
  for select to authenticated using (user_id = auth.uid());
create policy blocks_insert_mine on public.blocks
  for insert to authenticated with check (user_id = auth.uid());
create policy blocks_delete_mine on public.blocks
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- 5. 権限
--   RPC は authenticated（＝匿名サインイン済みの端末）だけが実行できる。
--   anon のままだと 42501（permission denied）になる。
-- ============================================================

grant select, insert         on public.reports to authenticated;
grant select, insert, delete on public.blocks  to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'find_by_code(text)',
    'send_friend_request(text)',
    'accept_friend_request(uuid)',
    'remove_friend(uuid)',
    'search_clubs(text, integer)',
    'find_club_by_code(text)',
    'create_club(text, text, text, text, integer)',
    'join_club(uuid)',
    'cancel_club_request(uuid)',
    'my_club_requests()',
    'list_club_requests()',
    'approve_club_request(uuid)',
    'reject_club_request(uuid)',
    'set_club_role(uuid, text)',
    'leave_club()',
    'kick_club_member(uuid)',
    'update_club(text, text, text, text, integer)',
    'clubs_of_users(uuid[])',
    'club_open_stats(text, text[], text, integer[])',
    'post_club_message(integer)',
    'post_club_text(text)',
    'post_club_room(text)',
    'post_club_request(text, text, text[])',
    'donate_club_card(uuid, jsonb)',
    'donate_club_cards(uuid, jsonb)',
    'club_feed()',
    'react_club_post(uuid, integer)',
    'list_club_reactions()',
    'club_gift_count()',
    'club_gift_list()',
    'claim_club_gift(uuid)',
    'claim_club_gifts()',
    'create_room(jsonb, integer)',
    'join_room(text)',
    'leave_room(uuid)',
    'kick_member(uuid, uuid)',
    'start_room(uuid, jsonb)',
    'finish_match(uuid, jsonb, jsonb)',
    'list_my_matches(integer)',
    'prune_old_matches()',
    'save_match_detail(uuid, jsonb)',
    'delete_me()',
    'send_report(uuid, uuid, text, text)',
    'block_user(uuid)',
    'unblock_user(uuid)',
    'my_blocks()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;

-- ============================================================
-- 6. PostgREST にスキーマを読み直させる
--
--   REST 層はスキーマをキャッシュしている。これを送らないと、足したばかりの
--   列や関数が「そんなものは無い」と返ることがある（＝アプリではオフライン表示）。
--   トランザクションの外で送る。
-- ============================================================
notify pgrst, 'reload schema';
