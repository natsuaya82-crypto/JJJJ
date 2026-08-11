# 引き継ぎ書: リファクタリング残作業（P4残り2件 + P5〜P7）

作成: 2026-08-11 / 前提コミット: main = `d7fc9aa`（P0〜P4完了時点）
読む順: ①リポジトリ直下 `CLAUDE.md` → ②`docs/REFACTORING_DESIGN.md`（全体設計） → ③この文書

この文書は、前セッション（P0〜P4を実施）から次のセッションへの引き継ぎ。
**設計の議論は済んでいる。ここに書いてある作業を、書いてある順・書いてある流儀で実行すること。**

---

## 1. 現在地（何がどこまで終わっているか）

| フェーズ | 状態 | 内容 |
|---|---|---|
| P0 足場 | ✅ | 金額「万」統一（`utils/money.ts fmtYen`・カンマ区切り）/ 給与ダイヤル定数を `data/economy.ts` へ / セーブ移行スナップショット検査 `scripts/check-migrate-snapshot.ts` + fixture（`scripts/fixtures/save-v29.json`・**原則作り直さない**）/ `check-fa-market` シード固定 |
| P1 成長統合 | ✅ | `growPlayer` → `engine/growth.ts`。係数の食い違いは無し（ageCurveで統一済みだった） |
| P2 persist抽出 | ✅ | `store/persistence/` に migrateSave / mergeSave / normalizeSave / saveVersion。migrate失敗時は saveHealth=failed でセーフモード（意図した挙動変更・実施済み） |
| P3 engine抽出 | ✅ | `engine/cpuMarket.ts`(CPU移籍AI) / `achievements.ts` / `draftOrder.ts` / `individualRace.ts` / `raceBoosts.ts`、`perfOf`→`utils/playerUtils` |
| P4 スライス分割 | ✅(残2件) | 9スライス分割済み。**下記2アクションだけ取りこぼし**（§3） |

### 現在のstore構成（行数は d7fc9aa 時点）

```
src/store/
├─ gameStore.ts (1,178行)      GameStore型・emptyState・setラッパー・core系16アクション・組み立て・persist接続
├─ slices/
│  ├─ marketSlice.ts (1,718)   移籍・交渉・トレード・ローン・入札・契約更改 62アクション
│  ├─ raceSlice.ts   (1,663)   runRace(L52〜・約1,150行)・レースUI状態・記録会・resolveEvent
│  ├─ seasonSlice.ts (1,375)   endSeason(L80〜・約1,230行)・開幕・目標・GMオファー
│  ├─ draftSlice.ts  (448)     初回ドラフト・スカウト候補・育成枠・指名権売買
│  ├─ competitionSlice.ts (400) 海外リーグ進行・市場進行・ECL
│  ├─ worldAthleticsSlice.ts (291) 世界選手権
│  ├─ metaSlice.ts (264) / cardsSlice.ts (174) / economySlice.ts (137)
├─ marketOps.ts                取引の実行ヘルパー（willingFeeFor/sellMove/finalizeSale/acquisitionDesiredSalary/tradeValueCtxOf/faAllowedDespiteBan）
├─ persistence/                migrateSave / mergeSave / normalizeSave / saveVersion(SAVE_VERSION=41)
└─ (既存) saveStorage / saveSlot / saveHealth / bootRepair / appStorage / ephemeralState / seasonArchive / dataUpdate / deviceFlags / loadingStore / previewStore
```

### スライスの型パターン（必ず踏襲すること）

```ts
// 戻り型 Pick<GameStore,...> で文脈型を復元する（無いとパラメータが implicit any になる）
export const createXxxSlice = (set: SetGame, get: () => GameStore): Slice => ({ ... })
```
- スライスは gameStore から **型だけ** import する（`import type { GameStore, SetGame }`）。
  **値のimportは禁止**（実行時の循環になる）。スライス内で `useGameStore.getState()/setState()` を
  使いたくなったら `get()` / `set()` に置き換える（seasonSlice の endSeason 内アーカイブ書き込みで実施済み・等価）
- スライスが受け取る `set` は**ラップ済み**（players/currentSeason を書くと `reconcileTalks` が必ず走る）。
  この不変条件を壊さないこと。ラッパー本体は gameStore.ts の creator 冒頭にある

### ブランチ運用

- 本流は `main`。作業は `origin/main` からブランチを切る（CLAUDE.md冒頭のルール）
- 既存の作業ブランチ `claude/code-refactoring-audit-wajp1i` は main と同一位置。続きに使ってよい
- **フェーズ（P5の1アクション分解＝1PR相当）ごとに main へ取り込む**。これまでは
  `git push origin HEAD:main`（fast-forward）で反映してきた

---

## 2. 鉄則（全作業共通）

1. **挙動不変**（P5の乱数注入もデフォルト引数 `rng = Math.random` で等価にする）。
   バランスの数字・判定式・文言は1文字も変えない。変えたくなったらオーナー確認（CLAUDE.md「勝手に決めないこと」）
2. **セーブ（永続化JSON）の形・キー名は不変**。`SAVE_VERSION` も触らない
3. ゲートは2つ。**コミット前に必ず両方green**:
   ```bash
   npx tsc -b; echo $?        # ★パイプ禁止。`tsc | head; echo $?` はheadの終了コードを見てしまう（実際に踏んだ）
   npm run check; echo $?
   ```
   green確認→コミットは `npx tsc -b >/dev/null 2>&1 && npm run check >/dev/null 2>&1 && git add -A && git commit ...` のように**&&で直列に**
4. ESLintの既存エラーは増やさない（触ったファイルは変更前後で `npx eslint <files>` の件数比較）
5. バージョンは **v2.0.2 固定**（CLAUDE.md配信節）。appMeta / package.json を上げない
6. コミットメッセージは日本語・フェーズ記号付き（例: `refactor: runRaceをフェーズ関数に分解（P5-1a・挙動不変）`）

---

## 3. まず最初に: P4の取りこぼし2件（30分仕事）

| アクション | 今の場所 | 移動先 |
|---|---|---|
| `beginSeasonDraft`（約470行） | gameStore.ts | `slices/draftSlice.ts` |
| `refuseFreeContactRetention` | gameStore.ts | `slices/marketSlice.ts` |

移動の作法（P4で9回実施した手順そのまま）:
1. アクション本体＋**直前のコメント行**を切り出す。**ただし切り出し範囲の末尾に「次のアクションの前置きコメント」を巻き込まないこと**（実際に巻き込んで壊した）
2. スライスの `({ ... })` 内に貼り、`type Slice = Pick<GameStore, ...>` に名前を足す
3. 足りないimportは tsc のエラーで拾う。**TS2304だけでなくTS2552（Did you mean）も見る**。
   `domesticTeamIdSet as domesticTeamIdSet_` のような**別名import**は手で合わせる
4. gameStore側で不要になったimportをESLintの no-unused-vars で特定して消す
5. `npm run check` が落ちたら、ほぼ確実に `scripts/check-single-source.ts` の**許可リストが移動前のパスを指している**。
   該当ルールの `allow` に移動先を1行足す（「見張りが移動を検知した」だけで正常。P4で6ルール追随済み）。
   `check-fa-market.ts` は gameStore+slices を連結して走査する形に直してある

---

## 4. P5: 巨大アクションのフェーズ関数分解（本丸・リスク高）

対象は3つ。**1アクション＝独立した一連のコミット**とし、間に他の作業を挟まない。

| # | アクション | 場所 | 規模 |
|---|---|---|---|
| P5-1 | `runRace` | `slices/raceSlice.ts` L52〜 | 約1,150行 |
| P5-2 | `endSeason` | `slices/seasonSlice.ts` L80〜 | 約1,230行 |
| P5-3 | `beginSeasonDraft` | （§3でdraftSliceへ移動後） | 約470行 |

### 目標の形

```ts
// raceSlice.ts（イメージ）。engineが計算し、storeは適用するだけ
runRace: (lineup, segmentTactics, preComputedResults) => set(state => {
  const sim      = ...                                   // 既存: レース本体
  const finance  = settleRaceFinance(state, sim, rng)    // engine: 賞金・観客
  const growth   = applyRaceExp(state, sim, rng)         // engine/growth
  const injuries = rollRaceInjuries(state, sim, rng)     // engine
  const news     = buildRaceNews(state, sim)             // utils/newsItems 経由
  const achieved = checkRaceAchievements(...)            // engine/achievements（既存）
  const requests = buildTransferRequests(state, sim, rng)// engine/cpuMarket 側へ
  return mergePatches(...)                               // 適用順は現状と同一
})
```

### 進め方（厳守）

1. **先に検証器を作る**（分解前）: seed固定で「アクション実行後の状態ダンプ」を取り、分解後と
   バイト一致することを見るスクリプトを `scripts/` に作る。
   - 乱数は `Math.random` をシードPRNGに差し替える（`scripts/check-fa-market.ts` 冒頭の実装をコピー）
   - 状態の準備は `scripts/check-offseason.ts`（232クラブ・5800人で1シーズン回している）を参考に。
     store経由なら `useGameStore.getState().runRace(...)` を呼び、`stripEphemeral` 後の JSON を比較
   - 日付・`Date.now()` 依存があれば固定する
2. アクションの中身を**上から順に**「工程」に切る。**工程の境界で読むstateのタイミングを変えない**
   （後の工程が前の工程の結果を読んでいる場合、素朴に関数化すると入力が変わる。必ず「前の工程の出力を渡す」）
3. 1工程切り出すごとに tsc + 検証器で一致確認。一致したらコミット
4. 全工程が出揃ったら、`rng: () => number = Math.random` を工程関数の引数に通す（デフォルトで挙動不変）。
   **`Math.random()` の呼び出し回数・順序を変えないこと**（順序が変わるとseed固定でも結果が変わり、
   検証器が正しく差を検出する。それは「分解ミス」であって検証器のバグではない）
5. 検証器は使い捨てにせず `npm run check` に接続するか、`scripts/` に残して手順をヘッダに書く

### 各アクションの工程（現物を読んで確定させること。以下は前セッションの調査メモ）

- `runRace`: レースシミュ → 順位・勝ち点 → 賞金/区間賞（`utils/league segmentPrizeByTeam`）→
  EXP付与（`engine/growth processExpGains`）→ 負傷抽選 → ニュース生成 → 実績（`checkRaceAchievements`）→
  CPU移籍要望の発生 → ECL自動進行の連鎖。**ECL連鎖と2軍・裏の部の進行が絡むので、切る順は現物優先**
- `endSeason`: 引退判定（`retirementAgeOf`）→ 出来高・ボーナス精算 → 赤字処理 → 格の更新
  （`tierFromDomesticRank` / 海外は各リーグ順位）→ オフの移籍市場（`pickCpuFreeAgents`）→
  表彰（`utils/awards`）→ シーズンアーカイブ（`writeSeasonArchive`・**非同期。完了後の
  `set(st => ({ archivedYears: ... }))` を壊さない**）→ 翌季の生成
- `beginSeasonDraft`: ドラフト候補生成 → 指名順（`engine/draftOrder`）→ CPU指名 → 契約既定値

---

## 5. P6: ビュー層の分解

対象7ファイル。**1ファイル＝1コミット以上**。ロジックの移動先は「既存の一本化モジュール優先・
新規ファイルは最終手段」（CLAUDE.mdの表と `npm run check` のルールに従う）。

| ファイル | 行数 | 抜くもの → 受け皿 | 注意 |
|---|---|---|---|
| `components/team/ChatPage.tsx` | 1,904 | 会話生成6関数（`buildMessages` L66〜 / `buildAcqMessages` / `buildTransferMessages` / `buildIncomingOfferMessages` / `buildIncomingLoanMessages` / `buildStayOrLeaveMessages`）→ `utils/chatLines.ts` の隣に新設 `utils/chatTalk.ts` | **発言には必ず `kind` を付ける**（`check-chat-dup` が見張る）。`getState()` 再読込 約9箇所は購読(selector)に置換。画面は ChatView / TradeChatView / カード類に分割 |
| `components/draft/DraftRoom.tsx` | 1,031 | ドラフトAI（`getTeamNeeds` L49 / `getAIBuzz` L58 / `draftSalaryFloor` L39・契約既定値 L909）→ `engine/draftAI.ts` 新設 | **`engine/draftOrder.ts`（指名順）と混ぜない**。`getTeamNeeds` は `utils/squadNeeds` を呼ぶ形にできないか先に確認（第2の物差しを作らない） |
| `components/race/RacePage.tsx` | 835 | 区間シミュ進行（`calcCpuTimesForSeg`・セグメント状態 L401〜711）→ `engine/interactiveRace.ts` | storeの `activeRaceSim` 系アクション（raceSlice）は既にある。ページは表示と操作だけに |
| `components/race/SimPhase.tsx` | 787 | 区間タイミング計算（L109-114, L417）→ 同上 | |
| `components/online/RoomLobbyPage.tsx` | 882 | 対戦部屋のステートマシン＋タイマー（L32-55）・広告トリガー → `lib/roomMachine.ts` 新設 | **オンラインは gameStore に入れない**（lib層で完結）。Supabase realtime の購読は `lib/roomChannel.ts` が既にある |
| `lib/matchSim.ts` | 265 | レース計算部分 → engine/（`backgroundRace` の入口を通せるか確認。`simulateRace` 直呼びは check が落ちる） | |
| `components/shared/PlayerSheet.tsx` | 1,194 | 経歴組み立て（`addHistory` L341 / `addForeignHistory` L370）→ `utils/careerStats.ts`（既存） | 表示はタブ別分割。ロジックはほぼ健全 |

補助: `components/notifications/NotificationsPage.tsx`(921) の評価しきい値マジックナンバー（L68-69）を
`data/economy.ts` へ。触ったファイルのESLint既存warning（react-hooks系）はこのタイミングで解消してよい。

---

## 6. P7: ガードレール（逆戻り防止の機械化）

1. **レイヤー依存ルールを `scripts/check-single-source.ts` の隣に新設**（`check-layers.ts` 等）し、
   `npm run check` に接続（package.json の `check` は esbuild で1本ずつ bundle して node 実行する長い&&連結。
   既存エントリをコピーして足す）。ルール:
   - `src/engine/` `src/utils/` `src/data/` から `src/store/` `src/components/` `src/lib/` を import しない
     （例外: 既存の `utils/ads.ts` → `store/loadingStore` が1件ある。現状は許可リストに入れ、解消は別途）
   - `src/store/slices/` 同士の import 禁止（`import type` は許可）
   - スライスから `../gameStore` の **値** import 禁止（`import type` のみ許可）
   - `src/lib/`（オンライン層）から `store/gameStore` への import は現状の接点（resetGame の動的import・
     読み取り5箇所）を数えて凍結（増えたら落とす）
2. **行数上限**: スライス900行・1アクション150行（P5完了後に有効化。当面 market/race/season は超過を許可リストで明示）
3. **checkスクリプトの棚卸し**: 約50本中 `npm run check` 接続は19本。残りを「接続する／
   `measure-*` と同様の手動計測ツールと明示する」に振り分ける。特に:
   - `check-transfer-bid.ts` は**壊れている**（10件NGなのに exit 0。rival検査の経路が古い）。
     market スライスの実態に合わせて検査を書き直し、`process.exit(1)` を入れる
   - 乱数でスポット検証する系は `check-fa-market.ts` 冒頭のシード固定をコピーして決定化
4. **CLAUDE.md の更新**（一本化モジュール表に追記）:
   - `utils/money.ts fmtYen` は**万表示・カンマ区切り**が正（億表示は廃止・オーナー決定）
   - `data/economy.ts` の `SALARY_DIAL_STEP/MIN`・`NEGOTIATION_SALARY_MAX(8000万)`・`DRAFT_SALARY_MAX(6000万)`・`reinforcementBanned`
   - `engine/cpuMarket / achievements / draftOrder / individualRace / raceBoosts / growth(growPlayer含む)`
   - `store/slices/` の構成と「スライスはラップ済みsetを受け取る」不変条件
   - `store/persistence/`（migrate/merge/normalize/SAVE_VERSION）と「冪等補正はnormalizeSave・毎回走る」
   - `utils/chatLog appendChatLog` / `utils/clubs bigClub` / `utils/league myDivSize` / `utils/playerUtils perfOf`
   - 成長節は更新済み（bakeAgeGrowthの記述は削除済み・復活させない）

---

## 7. 実際に踏んだ落とし穴（同じ穴に落ちないこと）

1. **tscの終了コードをパイプ越しに見ない**（`| head` の後の `$?` はheadのもの）。これで壊れたファイルを1度コミットした
2. コード移動のたびに `check-single-source` の許可リスト追随が要る（waRaces・走行記録・期限計算・裏レースの各ルールで実施済み）
3. ブロック切り出しは「次のアクションの前置きコメント」を巻き込みやすい／「}\n の最初の一致」で切ると早すぎる
4. import自動編集は `import {, X }` という壊れ方をする。`import \{,` を機械修復してから tsc
5. `npm run check` は稀に乱数で揺れるスクリプトが残っている可能性がある。**2回連続green**を確認してからコミット
6. fixture（save-v29.json）とスナップショット（snapshot-v29.json）は**作り直さない**。
   意図した形変更のときだけ `UPDATE_SNAPSHOT=1 npm run check`（該当スクリプト）で引き直し、差分をレビューしてコミット
7. `zustand persist` の `getOptions()` から migrate/merge を直接呼べる（check-migrate-snapshot が使用）。
   hydration不要でテストできる

---

## 8. オーナー確認が必要な事項（勝手に進めない）

- **給与ダイヤル上限を1億へ引き上げる案**: オーナーが「上限1億では」と発言したが、コード上の現行値は
  交渉8000万/ドラフト6000万で、**変更は未承認**。変えるなら `data/economy.ts` の定数1箇所ずつ・
  リファクタとは別コミット・オーナーの明示OKを取ってから
- P5で「計算順序に依存した挙動差」（分解すると結果が変わってしまう箇所）が見つかった場合:
  現状の順序を正として維持し、差が出る書き方しかできないなら**止めて報告**
- バランス数値・文言・UIの変更は一切禁止（見つけた不具合は報告のみ。直すかはオーナー判断）
