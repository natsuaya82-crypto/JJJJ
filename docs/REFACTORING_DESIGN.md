# リファクタリング設計書 v2 — 「1本の太い幹」をドメイン別の枝に分解する

作成: 2026-08-11 / 基準: **v2.0.2 (build 121) = 現在の main**

> **v1からの重要な変更:** 初版はブランチ分裂により誤って v1.0.8(旧main)を監査して書かれていた。
> 本版は v2.0.2 を再監査して全面改訂したもの。**特に v1 の「デッドコード削除リスト」は大部分が
> 誤りだった（対象はv2.0.2で削除済みか、走友会機能として本実装済み）ので、v1に従った削除を
> 絶対に実行しないこと。**

## 0. 決定事項（オーナー確認済み）

| 論点 | 決定 | 状態 |
|---|---|---|
| ブランチ一本化 | 本流は `main`（build 121で統一、旧ブランチ削除） | ✅ 済（CLAUDE.md更新済み） |
| カウンター価格 ×1.3 | `data/economy.ts` の `COUNTER_OFFER_CAP=1.3` / `counterCeiling` | ✅ v2.0.2で実装済み |
| 金額表示は「万」に統一 | `utils/money.ts` の `fmtYen` から億表示を外す（1行）＋野良実装2箇所を統一 | P0で実施 |
| 給与ダイヤル上限（交渉8000万/ドラフト6000万） | 現行値のまま用途別に定数化。値の変更はリファクタ外 | P0で実施 |
| WECシミュレータ削除 | — | ✅ v2.0.2で削除済み |
| フレンド/実績ページ等の削除（v1の提案） | **撤回**。v2.0.2ではオンライン（走友会・フレンド）が本実装され全ファイル到達可能。`previewStore`・`ForceUpdateModal` も使用中 | 削除しない |

---

## 1. 現状（v2.0.2 再監査の要約）

### 幹の実態

- `src/store/gameStore.ts` = **9,566行・157アクション**（型 `GameStore` は324メンバー）。
  v1.0.8の7,746行からさらに成長。ただし約22%はコメント・空行
- 巨大アクション: **`runRace` ≈1,170行**(L1269–2439)、**`endSeason` ≈1,234行**(L5476–6710)、
  `beginSeasonDraft` ≈470行(L5006–5476)、移籍・交渉ブロック ≈1,250行(L3058–4306)
- ストアに居候する純粋関数: 末尾 ~690行(L8877–9566: `simulateIndividualTime`・`cpuStrategy`・
  `pickCpuFreeAgents`・`generateTransferActivity`・`growPlayer` 等)＋冒頭 ~290行(L147–410)
  ＋実績 ~150行(L798–948)
- persist設定 = L8020–8877 の **~860行**(migrate ~570行 + merge ~250行)

### 前回リファクタで既に良くなっているもの（壊さないこと）

- **エンジン抽出は部分的に進行済み**: `engine/worldAthletics.ts`(740行)・`domesticLeague`・
  `eclSeries`・`backgroundRace`・`foreignTransfers` は本当に抽出されており、store側は薄い呼び出し
- **重複はほぼ解消済み**: `SAIRA`(tokens.tsの1本を97ファイルが参照)・金額(`utils/money.ts fmtYen`)・
  タイム(`utils/eventTime.ts formatRaceTime`)・カウンター価格(`economy.ts counterCeiling`)
- **一本化モジュール群**（CLAUDE.mdの表）と **`npm run check`（scripts/check-*.ts 約50本）**が
  逆戻りを機械的に見張っている。このcheck群が本リファクタ最大の安全網
- **オンライン層は最初から分離されている**: Supabaseクライアントと `lib/*Api.ts` 群は
  gameStoreとほぼ独立（gameStore側の参照は `resetGame` の1箇所だけ）。この形を維持する

### 残っている問題（本リファクタの対象）

1. **幹が太いまま**: 157アクションが1ファイル。runRace/endSeasonは複数ドメインを一撃で書き換える
2. **成長ロジックが2系統**: 自チームは `engine/growth.ts applyGrowth`、CPU・海外は
   `gameStore.ts:9486 growPlayer`（別実装・重複）。さらに `engine/ageCurve.ts` がstore未参照で
   第3のモデルでないか要確認。**スライス分割の前に統合しないと、分割がこのズレを凍結する**
3. **セーブの二重移行が公式化**: `SAVE_VERSION=41`、migrateに**欠番 3,12,14,15,29,41**。
   mergeが「migrateが到達しなくても毎回直す」無版数チャネルとして明文運用されている。
   migrate全体が try/catch で包まれ、**失敗時にrawステートを返すためバージョンだけ進む**危険(L8588)
4. **隠れた不変条件**: L961 の `set` ラッパーが `players`/`currentSeason` への全書き込みで
   `reconcileTalks` を強制実行。スライス分割でここを素通りさせると交渉の札が壊れる
5. **残重複（小粒）**: App.tsx の `fmtYen` 影武者2つ(L156,218・別ルール表示)、
   `offerResult.ts:23`、給与ダイヤル定数(ChatPage/DraftRoom)、`TransferPage.tsx:712` の1.3リテラル、
   `ago()` ×2(FriendClubPage/friendsApi)
6. **ビューにロジック**: ChatPage 1,904行（会話生成6関数）、DraftRoom（ドラフトAI）、
   RacePage/SimPhase（区間シミュレーション）、RoomLobbyPage 882行（オンライン対戦の
   ステートマシン＋タイマー）、`lib/matchSim.ts`（オンライン対戦のレースロジックがengine外）

---

## 2. 目指すアーキテクチャ

### 2.1 レイヤー（依存は下向きのみ）

```
┌─────────────────────────────────────────────────────────┐
│ components/   ビュー。表示と操作のみ                          │
├──────────────────────────────┬──────────────────────────┤
│ store/        本編の状態＋適用   │ lib/    オンライン層(Supabase)│
│   slices/     ドメイン別の枝     │   *Api.ts / 専用小型store    │
│   persistence/ セーブ・移行      │   ※gameStoreに混ぜない       │
├──────────────────────────────┴──────────────────────────┤
│ engine/       純粋関数のみ。(入力, rng) → 結果                │
│ utils/        一本化モジュール群（CLAUDE.mdの表）              │
├─────────────────────────────────────────────────────────┤
│ data/ types/  定数・マスタ・型                               │
└─────────────────────────────────────────────────────────┘
```

ルール（P7で `npm run check` に組み込んで機械的に強制）:

1. `engine/`・`utils/`・`data/` から `store/`・`components/`・`lib/` を import しない
2. `store/slices/` 同士は直接 import しない（共有ロジックは engine/utils へ降ろす）
3. オンライン層は gameStore に入れない。gameStore ⇄ lib の接点（現在5箇所の読み取り＋resetGame）は
   狭いインターフェース1ファイルに集約する
4. 1スライス900行以下・1アクション150行以下（超えたらengine抽出が足りないサイン）

### 2.2 スライス設計（幹→枝の対応表）

永続化されるJSONの形は**一切変えない**。フラットな `GameState` を全スライスで共有し、
コード上の所有権だけを分ける。`store/index.ts` は組み立てのみ（100行以下）。

| # | スライス | 現gameStoreの行 | 内容 | 規模感 |
|---|---|---|---|---|
| 1 | `persistence/`(スライスではなく独立層) | 8020–8877 | partialize/migrate/merge/onRehydrate。既存の saveSlot・saveHealth・bootRepair・appStorage・seasonArchive・dataUpdate が自然な境界 | ~860行 |
| 2 | `worldAthleticsSlice` | 6900–7240 | 世界選手権。engine/worldAthletics が既に受け皿 | ~340行 |
| 3 | `cardsSlice` | 7457–7540 | 練習カード | ~85行 |
| 4 | `economySlice` | 6710–6900, 7240–7300台 | スポンサー・財務・施設 | ~250行 |
| 5 | `metaSlice` | 7540–8020 | 殿堂・ギフト・ログボ・広告・各種フラグ・リセット | ~480行 |
| 6 | `draftSlice` | 975–1264, 5006–5476 | 初回＋毎年のドラフト | ~760行 |
| 7 | `competitionSlice` | 4626–4975 | 海外リーグ・移籍市場進行・ECL | ~350行 |
| 8 | `raceSlice` | 1269–2439, 2674–2681, 7300台(記録会) | レース実行・レースUI状態・記録会 | 分解後~600行 |
| 9 | `marketSlice` | 2439–2604, 3058–4306, 4369–4626 | スカウト・移籍・交渉・トレード・ローン | 分解後~900行 |
| 10 | `seasonSlice` | 4975–5006, 5476–6710 | シーズン締め・開始・表彰 | 分解後~700行 |

分割順は**この番号順**（小さく独立した枝から。market/seasonは巨大アクション分解後）。

### 2.3 `set` ラッパーの扱い（分割前に必須）

現在: L961 のラッパーが全書き込みに `reconcileTalks` を差し込む（選手が動いたら交渉の札をたたむ）。
分割後もこの不変条件を**1箇所で**保つため、zustandミドルウェアとして切り出す:

```ts
// store/middleware/reconcile.ts — 全スライスの set に透過的に適用
const withReconcile = (config) => (set, get, api) =>
  config((partial) => set(applyReconcileTalks(partial, get)), get, api)
```

スライスが増えても、どの枝から書いても札の整合が守られる。

### 2.4 巨大アクションの分解（engineが計算し、storeは適用する）

```ts
// seasonSlice の endSeason（イメージ）— 現在1,234行を順序付きフェーズ関数の列に
endSeason: () => set(state => runSeasonEnd(state, [
  settleFinance,        // engine/economy: 精算・繰越上限
  applyAnnualGrowth,    // engine/growth: 統合後の1本（§3）
  decideRetirements,    // engine
  updateTiers,          // utils/clubTier 経由
  runOffseasonMarket,   // engine/cpuMarket（pickCpuFreeAgents 移設先）
  computeAwards,        // utils/awards
  archiveSeason,        // store/persistence/seasonArchive
  buildSeasonNews,      // utils/newsItems
]))
```

- 各フェーズは `(state, rng) => パッチ` の純粋関数。**乱数は引数で注入**し、seed固定で
  変更前後の結果ダンプを比較できるようにする（CLAUDE.md末尾の「差分ゼロ確認」の機械化）
- `runRace`(1,170行)も同様に: シミュレーション（既存engine）→ 賞金 → EXP → 負傷 → ニュース →
  実績 → 移籍要望、の順序付きパッチ列へ
- `merge`/`bootRepair` は**スライスに割らない**。全状態を跨ぐboot専用ステップとして現状の形を維持

---

## 3. 先行タスク: 成長ロジックの統合（分割より先にやる）

現在の2系統:

| 経路 | 実装 | 対象 |
|---|---|---|
| レース後EXP・年次成長（自チーム） | `engine/growth.ts` の `processExpGains` / `applyGrowth` | プレイヤー |
| 年次成長（CPU・海外） | `gameStore.ts:9486 growPlayer`（別実装、呼び出しはL5591の1箇所） | CPU・海外 |

- `growPlayer` を `engine/growth.ts` へ移し、`applyGrowth` と係数・カーブを突き合わせて1本化する
  （**係数が食い違っていた場合、どちらを正とするかはオーナー判断**。CLAUDE.mdの
  「成長速度の係数はgrowPlayerとbakeAgeGrowthの2箇所を必ず一緒に変える」問題もここで解消）
- `engine/ageCurve.ts`（store未参照）が第3の成長モデルでないか照合し、役割をコメントで確定させる
- 完了条件: 全選手・全年齢で新旧の成長結果ダンプが一致（seed固定）

---

## 4. セーブ戦略（形は変えない・チャネルを整理する）

1. **JSONの形・キー名は不変。** `SAVE_VERSION` も触らない
2. migrateの**欠番(3,12,14,15,29,41)はコメントで明文化**して残す（番号詰め替え禁止）
3. mergeの「毎回走る補正」は既に `bootRepair.ts repairLoadedSave` 等へ寄っている。残りの
   inline補正（gmTenures backfill・ECLリネーム等）も同じ流儀で `bootRepair` に集約し、
   mergeを「normalize群を呼んでマージするだけ」の薄い関数にする。**補正内容は変えない**
4. **migrateのtry/catch問題**(L8588: 失敗時にrawステートを返してバージョンだけ進む)は、
   「失敗したら `saveHealth` をfailedにして既存セーブを上書きしない」流儀に揃える
   （saveHealthの仕組みが既にあるので接続するだけ）。挙動が変わるので独立コミットで
5. 回帰テスト: 既存の `check-migrate-old-save`・`check-load-v39`・`check-save-guard` 系を土台に、
   **主要バージョンのセーブfixtureを追加**し「migrate+merge通過後のスナップショット一致」を
   `npm run check` に組み込む。**全フェーズの完了条件に含める**

---

## 5. テスト・検証の方針

このリポジトリの流儀は「テストランナー」ではなく **`npm run check` の実走行チェック**
（例: check-offseason は232クラブ・5800人でオフシーズンを実際に回す）。これに乗る:

- 新しいengine関数を作るたび、対応する check スクリプト（またはseed固定の新旧ダンプ比較）を追加
- vitestの導入は**しない**（check群で足りており、二重の仕組みを増やさない）
- ESLintの既存エラーは「新規に増やさない」ルール（CLAUDE.md）を維持。ビュー分割(P6)で触った
  ファイルだけ解消していく

**P0で見つかったcheck群の課題（P7で対処）:**

- `npm run check` に接続されているのは約50本中**19本**（P0でmigrate系2本＋snapshot1本を接続済み）。
  残りの孤立スクリプトを棚卸しし、「接続する／手動計測ツールと明示する」に振り分ける
- `check-transfer-bid.ts` は**10件NGのまま exit 0 を返す**（rival検査の経路が古く、問題があっても
  落ちない）。P4のmarketスライス分割時に検査を現行コードに合わせて直し、exit codeも修正する
- 乱数でスポット検証するスクリプトは偽陽性で落ちうる（check-fa-marketはP0でシード固定済み）。
  同型の他スクリプトも接続時にシード固定する

---

## 6. 残っている重複の掃除リスト（P0・小粒）

| 箇所 | 対応 |
|---|---|
| `utils/money.ts fmtYen` | **万表示に統一**（億分岐を外す・決定済み）。コメントの経緯も更新 |
| `App.tsx:156, 218` の `fmtYen` 影武者（`toLocaleString`・億なしの別表示） | utils/money に統一 |
| `utils/offerResult.ts:23 man` | 同上 |
| 給与ダイヤル定数 `ChatPage.tsx:40-42` / `DraftRoom.tsx:36-43` | `data/economy.ts` に `NEGOTIATION_SALARY_MAX`(8000万) / `DRAFT_SALARY_MAX`(6000万) として定数化（値は不変） |
| `TransferPage.tsx:712` の `fairVal * 1.3` リテラル | `economy.ts COUNTER_OFFER_CAP` を参照 |
| `ago()` 重複（`FriendClubPage.tsx:423` / `lib/friendsApi.ts:56`） | libの1本に統一 |
| `engine/raceEngine.ts:212` のタイム差表示 | `utils/eventTime` へ寄せられるか確認して統一 |

---

## 7. ビュー層の分解（P6）

| コンポーネント | 現状 | 分解 |
|---|---|---|
| `ChatPage.tsx` 1,904行 | 会話生成6関数(`buildMessages` 系 L66–250)＋給与定数 | 会話生成→`utils/chatTalk`（`chatLines` の隣）。画面はChatView/TradeChatView等に分割 |
| `DraftRoom.tsx` 1,031行 | `getTeamNeeds`/`getAIBuzz`/`draftSalaryFloor`＋契約既定値 | AI→`engine/draft.ts`。`squadNeeds` と重複しないよう既存の一本化モジュールを呼ぶ形に |
| `RacePage.tsx` 835行 / `SimPhase.tsx` 787行 | 区間シミュ進行・タイム計算がビュー内。gameStoreから `applyRaceBoosts` をimport | →`engine/interactiveRace.ts` に集約。storeの `activeRaceSim` 系で永続 |
| `RoomLobbyPage.tsx` 882行 | オンライン対戦のステートマシン＋タイマー＋広告トリガー | →`lib/roomMachine.ts`（オンライン層内で分離。gameStoreには入れない） |
| `lib/matchSim.ts` 265行 | オンライン対戦のレースロジック・チーム変換 | 計算部分→`engine/`（`backgroundRace` と同じ入口を通す） |
| `PlayerSheet.tsx` 1,194行 | 経歴組み立て(L341–390) | →`utils/careerStats`。表示はタブ別に分割 |
| `NotificationsPage.tsx` 921行 | 評価しきい値のマジックナンバー(L68-69) | →economy.ts。それ以外はほぼ健全 |

---

## 8. 実施フェーズ

**全フェーズ共通の完了条件: `tsc -b` エラー0 / `npm run check` green（セーブfixture含む）/ 挙動不変**
（例外: P0の万表示とP2のmigrate失敗時挙動は「意図した変更」として独立コミット）

| フェーズ | 内容 | リスク |
|---|---|---|
| **P0 足場** ✅完了(2026-08-11) | セーブfixture＋スナップショットをcheckに追加 / §6の残重複掃除（万表示統一含む）/ 給与定数化 / check-fa-marketのシード固定 | 低 |
| **P1 成長統合** | `growPlayer`→engine/growth に1本化、ageCurve照合（§3） | 中 |
| **P2 persist抽出** | L8020–8877 → `store/persistence/`、merge補正のbootRepair集約、migrate失敗時のsaveHealth接続（§4） | 中 |
| **P3 engine抽出** | 末尾~690行・冒頭~290行・実績~150行の純関数を engine/（cpuMarket・individualRace・draft・achievements）へ移動。当面re-exportで互換維持 | 低〜中 |
| **P4 スライス分割** | `set`ラッパーのmiddleware化（§2.3）→ §2.2の番号順に10分割。**ロジック変更なし・移動のみ**。1スライスごとに独立コミット | 中〜高 |
| **P5 巨大アクション分解** | runRace / endSeason / beginSeasonDraft をフェーズ関数列に（§2.4）。rng注入・seed固定ダンプで新旧一致を確認。**1アクション=1PR** | **高** |
| **P6 ビュー分解** | §7 の7ファイル | 中 |
| **P7 ガードレール** | 依存ルール・行数上限を check スクリプト化（§2.1）。CLAUDE.mdに新構成を反映 | 低 |

- P0→P1→P2→P3→P4 は直列。P5/P6 は P4 完了後に並行可
- 各フェーズは「途中で止めてもTestFlightに出せる」状態を保つ（バージョンはv2.0.2固定・
  ビルド番号運用はCLAUDE.mdの配信節に従う）

---

## 9. オーナー確認が必要になったら止まる点（CLAUDE.md「勝手に決めないこと」準拠)

- 成長2系統の係数が食い違っていた場合、どちらを正とするか（§3）
- セーブfixtureに使う実セーブの提供可否（無ければ合成で代用）
- P5でrunRace/endSeasonの計算順序に依存した挙動差が見つかった場合の扱い
- バランスに関わる数字は一切変えない。変えたくなったら必ず確認
