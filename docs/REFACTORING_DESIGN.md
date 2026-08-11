# リファクタリング設計書 — 「1本の太い幹」をドメイン別の枝に分解する

作成日: 2026-08-11 / 対象バージョン: v1.0.8 (build 36)

## 決定事項(2026-08-11 オーナー確認済み)

| 論点 | 決定 |
|---|---|
| カウンター価格の係数 | **×1.3 に統一**(TransferPage方式: 50万円単位丸め・下限50万を正とする) |
| 金額表示 | **「万」表示に統一**(億表示は使わない。例: 1.2億 → 12000万) |
| 給与上限のズレ(交渉8000万/ドラフト6000万) | コード上に「1億」の上限は存在せず、1億は市場相場テーブルの最大値(OVR99→1億, playerUtils.ts:98)。ダイヤル上限をどうするかは**挙動変更になるためリファクタとは切り離し**、当面は現行値を定数名付きで維持 |
| フレンド機能の下書き | **削除**(ルート済みの Coming Soon ページのみ残す) |
| WECシミュレータ | **全削除**(wec-sim.html / wec-sim-entry.tsx / vite第2エントリ / WECSimPage / App.tsx の `/international/sim` ルート。アプリ内から遷移する導線も存在しない)。ゲーム内機能の世界駅伝(WorldEkidenPage)は対象外・存続 |
| AchievementsPage / ForceUpdateModal / 旧ForeignClubDetailPage | **削除**(いずれも未使用) |

## 0. この文書の目的

現在のコードは、機能追加を `src/store/gameStore.ts`(7,746行・144アクション)に積み増し続けた結果、
**幹が1本しかなく、その1本にすべてが絡みついた状態**になっている。

この文書は、それを **「動かせる単位(ドメイン)」に分類・分解するための設計** を定義する。
実装の順序・完了条件・やってはいけないことまで含め、リファクタリング作業はこの文書を正とする。

### ゴール

- gameStore.ts を **ドメイン別のスライス(枝)** に分割し、1ファイル=1ドメインにする
- ビジネスロジック(成長・交渉・CPU AI・タイム計算)を **純粋関数として `engine/` に降ろす**
- 重複実装(金額フォーマット17箇所、formatTime 3箇所、給与定数のズレ等)を一本化する
- どの枝も **単体でテスト・修正・差し替えできる** 状態にする

### 非ゴール(やらないこと)

- **セーブデータ(永続化JSON)の形を変えること。** persist される `GameState` のキー構造は維持する。
  分割はあくまで「コードの置き場所」の再編であり、データ再設計は本リファクタの範囲外
- UIデザイン・ゲームバランスの変更(挙動は1ミリも変えない)
- Zustand や React Router 等のライブラリ差し替え

---

## 1. 現状の構造と問題(調査結果の要約)

```
現状の依存方向(これ自体は健全。循環参照なし)
components ──→ store(gameStore 7,746行) ──→ engine / utils / data ──→ types
     └────────────(一部が engine を直接参照)──────┘
```

| 問題 | 実態 |
|---|---|
| 神オブジェクト | gameStore.ts に144アクション。`runRace` 単体で約970行(L943–1913)、`endSeason` 約951行(L4955–5906)、`beginSeasonDraft` 約477行 |
| エンジンの店子化 | 選手成長(`processExpGains` L7613〜)・記録会タイム計算(`simulateIndividualTime` L7234〜)・CPU移籍AI(`generateTransferActivity` L7394〜)など**約560行の純粋関数がストア末尾に居候**。`engine/` に該当モジュールが無い |
| 逆流 | `fmtTime`・`WEC_CITIES` 等をビューが gameStore から import しており、7,746行のモジュールがほぼ全画面の依存に入る |
| セーブ移行の二重系統 | persist `version: 13` だが migrate に v3・v12 が欠番。`merge`(L7135〜)が「毎回走る無版数の第2マイグレーション」になっており、ECLリネームが migrate と merge の両方に存在 |
| コピペ重複 | 金額フォーマット17ファイル、`formatTime` 3実装、フォント定数 `SAIRA` 73ファイル、距離リテラル8箇所、給与定数が画面ごとに別値(ChatPage 上限8000万 vs DraftRoom 6000万) |
| ロジック入りビュー | ChatPage(1,518行)に交渉ロジック、DraftRoom(1,057行)にドラフトAI、RacePage(847行)にシミュレーション本体 |
| デッドコード | friends/ 配下6ファイル・previewStore・AchievementsPage・ForeignClubDetailPage・wec-sim-entry 等 約1,000行 |
| テスト | ゼロ(tsc はクリーン、ESLint 132件) |

---

## 2. 目指すアーキテクチャ

### 2.1 レイヤー定義(4層・依存は下向きのみ)

```
┌────────────────────────────────────────────────┐
│ components/   ビュー。表示とユーザー操作のみ         │
│               ロジック禁止・getState()ポーリング禁止   │
├────────────────────────────────────────────────┤
│ store/        状態の持ち主 + オーケストレーター        │
│   slices/     ドメイン別の枝(下記 2.3)              │
│   persistence/ セーブ・移行(migrate/normalize)      │
├────────────────────────────────────────────────┤
│ engine/       純粋関数のみ。(入力, 乱数) → 結果        │
│ utils/        汎用ヘルパー(format等)。状態を持たない    │
├────────────────────────────────────────────────┤
│ data/ types/  定数・マスタデータ・型                  │
└────────────────────────────────────────────────┘
```

**依存ルール(ESLintで機械的に強制する):**

1. `engine/`・`utils/`・`data/` から `store/`・`components/` を import してはならない
2. `components/` は `store/` の公開フック(selector)と `engine/` の純粋関数・`utils/` のみ import 可。
   ただし「storeを経由すべき状態変更」をengine直呼びで再実装するのは禁止
3. `store/slices/` 同士は直接 import しない(共有ロジックは engine/ へ降ろす)
4. ビューでの `useGameStore.getState()` は原則禁止(イベントハンドラ内の1回読みのみ許可)

### 2.2 新ディレクトリ構成

```
src/
├─ engine/                    # 純粋ロジック(このリファクタで大きく増える)
│  ├─ race/
│  │  ├─ raceEngine.ts        # 既存
│  │  ├─ interactiveRace.ts   # 既存 + RacePage から buildSegmentState 等を移管
│  │  └─ eventEngine.ts       # 既存
│  ├─ growth.ts               # ★新設: processExpGains, growPlayer, requiredExpForLevel,
│  │                          #   potMultiplier, ageMultiplier, segTypeExpGain (gameStore L7569–7712)
│  ├─ individualRace.ts       # ★新設: individualEventAbility, simulateIndividualTime,
│  │                          #   IND_ANCHORS, IND_STAT_WEIGHTS (gameStore L7196–7253)
│  ├─ cpuMarket.ts            # ★新設: cpuStrategy, cpuTeamTier, cpuSpecialtyNeeds,
│  │                          #   generateForeignAndLoanOffers, generateTransferActivity (L7296–7469)
│  ├─ negotiation.ts          # ★新設: 給与算定・カウンター価格・交渉遷移
│  │                          #   (ChatPage / TransferPage / NotificationsPage の三つ巴実装を統一)
│  ├─ draftAI.ts              # ★新設: draftLotteryOrder, pickKeyValue (gameStore L102–168)
│  │                          #   + DraftRoom の getTeamNeeds / getAIBuzz / draftSalaryFloor
│  ├─ achievements.ts         # ★新設: checkRaceAchievements, checkSeasonAchievements,
│  │                          #   selectSeasonObjectives, ACHIEVEMENT_JEWELS (gameStore L555–695)
│  ├─ ecl.ts / foreignLeague.ts / foreignTransfers.ts / playerGenerator.ts   # 既存のまま
├─ store/
│  ├─ index.ts                # ★useGameStore の組み立てのみ(persist + スライス合成)。100行以下厳守
│  ├─ slices/                 # ★ドメイン別の枝(2.3参照)
│  ├─ persistence/
│  │  ├─ migrate.ts           # ★バージョン移行(現 migrate を移設・欠番を明文化)
│  │  ├─ normalize.ts         # ★毎回走る冪等補正(現 merge 内の暗黙修正を集約)
│  │  └─ saveStorage.ts       # 既存
│  ├─ selectors.ts            # ★頻出セレクタ(myTeam, currentRace 等)
│  └─ loadingStore.ts         # 既存
├─ utils/
│  ├─ format.ts               # ★新設: formatMoney(億/万), formatTime を唯一の実装に
│  └─ (既存の各ファイル)
├─ data/
│  ├─ constants.ts            # ★新設: 距離(EVENT_DISTANCES再利用)・給与レンジ・移籍刻み等の統一定数
│  ├─ wec.ts                  # ★新設: WEC_CITIES, generateWECRacePlan (gameStore L7254–7284)
│  └─ (既存の各ファイル)
├─ components/
│  ├─ ui/                     # PageHeader・SheetBase を追加(既存 ConfirmDialog/ActionSheet と統一)
│  └─ (既存の各ディレクトリ)
└─ types/
   ├─ index.ts                # 分割 re-export のハブ(既存 import を壊さない)
   └─ (player.ts / team.ts / season.ts / market.ts / meta.ts に分割)
```

### 2.3 ストアの枝(スライス)設計 — 本設計の中核

Zustand の slice パターンで分割する。**永続化される状態はいまと同じ1つのフラットな `GameState`**
のままにし(セーブ互換のため)、コード上の所有権だけをスライスに割り当てる。

```ts
// store/index.ts のイメージ
export const useGameStore = create<GameStore>()(
  persist(
    (...a) => ({
      ...createCoreSlice(...a),
      ...createRaceSlice(...a),
      ...createSeasonSlice(...a),
      ...createMarketSlice(...a),
      ...createDraftSlice(...a),
      ...createCompetitionSlice(...a),
      ...createCardsSlice(...a),
      ...createEconomySlice(...a),
      ...createMetaSlice(...a),
    }),
    { name: 'jpel-manager-save', version: 13, storage, migrate, merge }
  )
)
// GameStore = CoreSlice & RaceSlice & ... (型もスライス単位で分割)
```

| スライス | 責務(所有する状態) | 移設するアクション(現 gameStore の行) | 目安行数 |
|---|---|---|---|
| `coreSlice` | セットアップ、リセット、`isInitialized`、チーム/選手の基本CRUD | startSetup 等 L702–938、resetGame | ~350 |
| `raceSlice` | 駅伝レース実行、レース中UI状態(`activeRaceSim`)、2軍レース、記録会 | runRace L943–1913、2軍 L3945–4107、記録会 L6185–6380・L6663–6816 | ~600(分解後) |
| `seasonSlice` | シーズン締め・開始、目標、表彰、成長レポート | endSeason L4955–5906、シーズン遷移 L4450–4955 | ~700(分解後) |
| `marketSlice` | 移籍入札・リスト、ローン、トレード、獲得交渉、契約更改、引き抜き対応 | L2554–3945(交渉4系統+市場) | ~900 |
| `draftSlice` | ドラフト進行(初回+毎年) | 初回 L800台、beginSeasonDraft L4478〜 | ~400(分解後) |
| `competitionSlice` | ECL、海外リーグ、海外間移籍、世界駅伝、代表 | L4107–4450、L6039–6185、L6380–6550 | ~450 |
| `cardsSlice` | トレーニングカード(付与・合成・使用) | L6550–6663 | ~150 |
| `economySlice` | スポンサー、予算、施設 | L5928–6039、施設 L6131–6185 | ~200 |
| `metaSlice` | ジュエル、広告、ログインボーナス、ギフト、通知既読、各種フラグ | L6816–6936 ほか約20個の1行系アクション | ~200 |

分割後は **1スライス900行以下・1アクション150行以下** を上限ルールとする
(超えたら engine への抽出が足りないサイン)。

### 2.4 巨大アクションの分解方針(runRace を例に)

現在の `runRace`(970行)は「レース進行」と「その結果の波及」が1関数に融合している。
これを **「engine が結果を計算し、store は適用するだけ」** に分ける:

```ts
// raceSlice.ts — オーケストレーターに痩せた runRace(イメージ)
runRace: (raceId) => set(state => {
  const race    = selectRace(state, raceId)
  const sim     = simulateRace(...)                      // 既存 engine/race
  const finance = settleRaceFinance(state, race, sim)    // engine: 賞金・観客収入
  const growth  = applyRaceExp(state.players, sim)       // engine/growth
  const injuries= rollInjuries(sim, state.players)       // engine
  const news    = buildRaceNews(race, sim)               // engine
  const achieved= checkRaceAchievements(state, sim)      // engine/achievements
  const requests= generateTransferRequests(state, sim)   // engine/cpuMarket
  return mergePatches(state, [sim.patch, finance, growth, injuries, news, achieved, requests])
})
```

- 各フェーズ関数は `(必要な入力) => 部分的な状態パッチ` の純粋関数
- **乱数は `rng: () => number` を引数で受ける**(デフォルト `Math.random`)。
  これによりエンジン関数が seed 固定でテスト可能になる
- `endSeason`(951行)も同様に「引退判定 / ボーナス精算 / 赤字ペナルティ / 王朝マイルストーン /
  セーブ縮小」の5フェーズ関数に分解する

---

## 3. セーブ互換戦略(このリファクタ最大のリスク管理)

**原則: persist される JSON の形・キー名は一切変えない。**

現状の問題と対処:

1. **migrate の欠番(v3, v12)** — 動作している現状を正として欠番はそのまま残し、
   `persistence/migrate.ts` にコメントで「欠番。merge が吸収していた」と明文化する。番号詰め替えはしない
2. **merge の二重移行** — 現 `merge`(L7135〜)にある「毎回走る冪等補正」
   (ECL戦名リネーム、欠損配列のバックフィル等)を `normalize.ts` の `normalizeSave(state)` に移し、
   merge は「normalize を呼んでからマージする」だけの薄い関数にする。**補正内容自体は変えない**
3. **v11 がマイグレーション内で選手生成している問題** — 今回は触らない(挙動維持)。
   ただし `migrate.ts` に「generator の出力を変えると旧セーブの移行結果が変わる」旨の警告コメントを残す
4. **回帰テスト** — 着手前に、実セーブ相当のフィクスチャ(v2/v9/v13 の各 JSON)を
   `src/store/persistence/__fixtures__/` に用意し、
   「migrate + normalize を通した結果のスナップショットテスト」を作る。
   **このテストが green であることが全フェーズの完了条件に含まれる**

---

## 4. 重複の一本化(仕様のズレはバグとして扱う)

| 重複 | 統一先 | 備考 |
|---|---|---|
| 金額フォーマット(17ファイル) | `utils/format.ts` の `formatMoney(yen)` | **「万」表示に統一**(決定済み。億表示は廃止) |
| `formatTime` ×3(raceEngine L165 / gameStore `fmtTime` L7285 / eventTime `formatRaceTime` L24) | `utils/format.ts` の `formatTime(sec)` | 出力は3実装とも同一なので安全 |
| フォント定数 `SAIRA`(73ファイル) | `styles/tokens.ts` に追加(既存の `C`/`R` の隣) | 機械的置換 |
| 距離リテラル `5000\|10000\|21097\|42195`(8箇所) | `data/constants.ts`(既存 `utils/eventTime.ts` の `EVENT_DISTANCES` を昇格) | 型 `EventDistKey` と対で管理 |
| 給与定数: ChatPage `SALARY_MAX` 8000万 vs DraftRoom `DC_SALARY_MAX` 6000万 | `data/constants.ts` に **用途別の名前で両方定義**(`NEGOTIATION_SALARY_MAX` / `DRAFT_SALARY_MAX`) | 値の変更(例: 1億への引き上げ)はリファクタ完了後に別コミットで |
| カウンター価格係数: ChatPage×1.2 / NotificationsPage×1.2 / TransferPage×1.3 | `engine/negotiation.ts` の `counterPrice(offeredPrice, player)` | **×1.3・50万円単位丸め・下限50万に統一**(決定済み)。フリー移籍(提示0円)は市場価値ベース |
| `segmentType`(gameStore L7593)と `terrainLabel`(raceUtils L8) | `engine/race/` に1実装 | 同じ40/40/15閾値 |

---

## 5. ビュー層の再編(ロジックの引き剥がし)

| コンポーネント | 現状 | 分解後 |
|---|---|---|
| `ChatPage.tsx` 1,518行 | 交渉ロジック+4画面+ポーリング(`getState()`×9) | `engine/negotiation.ts`(台詞生成 buildMessages 系・給与アンカー・トレード評価) + `ChatView` / `TradeChatView` / カード類の4ファイル。ストア購読(selector)に置換 |
| `DraftRoom.tsx` 1,057行 | ドラフトAIが useEffect 内、670行の選手シート内蔵 | AI→`engine/draftAI.ts`、内蔵シートは `shared/PlayerSheet` に統合(差分はprops化) |
| `RacePage.tsx` 847行 | `buildSegmentState`・`startInteractiveSim` 等シミュレーション本体約200行 | → `engine/race/interactiveRace.ts` へ。ページは「表示+開始/次へ操作」だけに |
| `NotificationsPage.tsx` 1,021行 | ChatPage の交渉UIを再実装 | 交渉カードを共通コンポーネント化し ChatPage 系と共有 |
| `TransferPage.tsx` 833行 | 20個の useState | 既存ルート `/transfer/:section` に沿って市場/オファー/自チームの3ファイルに分割 |
| 共通UI | モーダル/シート手書き25ファイル、stickyヘッダー手書き24箇所 | `ui/SheetBase`・`ui/PageHeader` を新設し、**新規・変更するファイルから順次**置き換え(全画面一斉置換はしない) |

`PlayerSheet` / `Dashboard` / `StandingsTable` は健全なので触らない
(PlayerSheet の `formatTime` import 先を utils に変えるのみ)。

---

## 6. デッドコードの削除(最初にやる・すべてオーナー承認済み)

- `src/components/friends/` の未到達6ファイル(FriendListPage/FriendDetailPage/FriendSentPage/FriendReceivedPage/FriendClubPage/GmShareCard)+ `data/mockFriends.ts` + `store/previewStore.ts`
  ※ `FriendsPage.tsx`(Coming Soon 表示)自体はルートされているので残す
- **WECシミュレータ一式**: `wec-sim.html` + `src/wec-sim-entry.tsx` + `vite.config.ts` の第2エントリ設定
  + `components/international/WECSimPage.tsx` + `App.tsx` の `/international/sim` 分岐(L146–148)
  ※ ゲーム内機能の `WorldEkidenPage`(世界駅伝)は**残す**
- `components/records/AchievementsPage.tsx`(未ルート)
- `components/teams/ForeignClubDetailPage.tsx`(TeamDetailPage に置換済み)
- `ui/ForceUpdateModal`・未使用アイコン(`StatIcons` 全7点ほか)・`types/index.ts` の未使用型 約20個

削除は1コミットにまとめ、`git revert` 一発で全部戻せるようにする。

---

## 7. 実施フェーズと完了条件

**すべてのフェーズに共通の完了条件: `tsc -b` エラー0 / セーブ移行スナップショットテスト green / アプリの挙動不変**

| フェーズ | 内容 | 完了条件 | リスク |
|---|---|---|---|
| **P0 足場** | vitest 導入 / セーブ移行フィクスチャ+スナップショットテスト作成 / デッドコード削除(§6) / ESLint 132件を0に | テスト基盤が回る。lint 0 | 低 |
| **P1 一本化** | `utils/format.ts`・`data/constants.ts`・`SAIRA`統一(§4)。値が割れている定数は**仕様確認の上で**処理 | 重複実装の grep がヒット0 | 低 |
| **P2 エンジン抽出** | gameStore 末尾の純関数群(L555–695, L7196–7746)を `engine/growth.ts` 等へ移動(§2.2)。当面 gameStore から re-export して import 元を段階的に更新 | gameStore が約6,600行に減。engine 関数に単体テスト | 低〜中 |
| **P3 スライス分割** | GameStore 型と144アクションを9スライスへ機械的に移動(§2.3)。**ロジック変更なし、移動のみ** | gameStore.ts 消滅、store/index.ts は100行以下。永続化JSONはバイト単位で不変 | 中 |
| **P4 巨大アクション分解** | runRace / endSeason / beginSeasonDraft をフェーズ関数化(§2.4)。rng 注入 | 1アクション150行以下。フェーズ関数に seed 固定テスト | **高**(最も慎重に) |
| **P5 セーブ整理** | merge → normalizeSave 集約(§3) | 移行スナップショット不変 | 中 |
| **P6 ビュー分割** | ChatPage → engine/negotiation + 分割、DraftRoom、RacePage、NotificationsPage(§5) | 対象4ファイルが各500行以下、`getState()` ポーリング0 | 中 |
| **P7 ガードレール** | ESLint に依存ルール(§2.1)と行数上限を追加し、逆戻りを機械的に防ぐ | CI で強制 | 低 |

- 順序は P0→P1→P2→P3 まで直列(それぞれ前提)。P4/P5/P6 は P3 完了後なら並行可
- 各フェーズは独立した PR/コミット単位とし、途中で止めても本番に出せる状態を保つ
- P4 だけは「1アクションずつ」小さく刻む(runRace 分解だけで1PR)

## 8. リファクタ後の姿(再掲)

```
太い幹1本                          分類された枝
─────────────                     ─────────────────────────────
gameStore.ts (7,746行)      →     store/index.ts (~100行, 組み立てのみ)
  ├ 144アクション                    ├ slices/ 9ファイル (各~150-900行)
  ├ 成長エンジン                     ├ persistence/ migrate + normalize
  ├ 記録会シミュ                    engine/ growth / individualRace / cpuMarket
  ├ CPU移籍AI               →              / negotiation / draftAI / achievements
  ├ 実績判定                       utils/format.ts (金額・タイムの唯一の実装)
  └ セーブ移行×2系統                data/constants.ts (距離・給与・移籍刻み)
```

どの枝も「入力→出力」が閉じた純粋関数の集まりを土台に持つため、
**バランス調整・新機能はまず engine にテスト付きで書き、スライスが適用する**という
開発フローに移行できる。
