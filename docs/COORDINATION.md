# 並行作業の指示（統括）

最終更新: 2026-08-11 / 統括セッション: リファクタリング本線（P5 分解担当）

**3セッションが同時に動いている。この文書が優先される。** 自分の担当だけを読めばよいが、
§1（担当の線引き）と §2（合流の順番）は全員が読むこと。

---

## 0. いまの状態（事実）

| セッション | ブランチ | 状態 |
|---|---|---|
| **本線**（統括） | `claude/code-refactoring-audit-wajp1i` | main と同一。P0〜P4完了、P5-1（runRace分解）を8工程まで実施 |
| **点検基盤** | `claude/weekly-limit-issues-4kud0v` | **main より40コミット遅れた地点から分岐**。独自2コミット（run-checks.mjs / ErrorBoundary） |
| **ビュー層** | `claude/view-layer-guardrails` | main の少し手前から分岐。独自3コミット（履歴集計移設 / 移籍金判定の一本化 / check-layers.ts） |

`main` の先端は `d2bac2c`。**main が本流**（CLAUDE.md 冒頭の決まり）。

---

## 1. 担当の線引き（触ってよいファイル）

**自分の欄にないファイルは触らない。** どうしても必要なら、手を止めてこの文書の更新を求めること。

| 担当 | 触ってよい |
|---|---|
| **本線**（統括） | `src/engine/**` ／ `src/store/**` |
| **点検基盤** | `scripts/**` ／ `package.json` ／ `CLAUDE.md` ／ `src/components/ui/ErrorBoundary.tsx` |
| **ビュー層** | `src/components/**`（ErrorBoundary を除く） ／ `src/utils/**` ／ `src/data/**` |

**例外**: `scripts/check-single-source.ts` の**許可リストへの1行追加**だけは本線も行う
（ファイルを移動すると、その見張りが移動先を知らずに落ちるため）。追加以外は触らない。

---

## 2. 合流の順番（この順で main に入れる）

1. **ビュー層** → §3 の直しを入れてから
2. **点検基盤** → §4 の直しを入れてから
3. 本線は随時 main へ入れている（他の2つは main を追いかける側）

**合流のやり方は rebase。** merge コミットを作らない。

```bash
git fetch origin
git rebase origin/main          # ← ここでコンフリクトが出たら、勝手に解決せず報告する
npx tsc -b; echo $?             # 0 であること（パイプに繋がないこと）
npm run check; echo $?          # 0 であること
git push -u origin <自分のブランチ>
```

**プルリクエストは作らない。** push まで。合流は統括が行う。

---

## 3. ビュー層への指示

3タスクとも完了を確認した。main の上にリベースして `tsc` と `npm run check` が通ることも確認済み。
**合流前に、下の2点だけ直すこと。**

### 3-1. `scripts/check-layers.ts` が型だけの import を違反として数えている（要修正）

いまの実装だと10件出るが、**そのうち5件は型だけの import なので違反ではない**。
型は実行時に消えるので、層をまたいでも依存が生まれない。

```
src/types/index.ts:466   tier?: import('../utils/clubTier').ClubTier
src/types/index.ts:540   individuals?: import('../engine/worldAthletics').WAIndividualResult[]
src/types/index.ts:543   continentals?: import('../engine/worldAthletics').ContinentalQualResult[]
src/types/index.ts:608   tier?: import('../utils/clubTier').ClubTier
src/types/index.ts:1066  worldAthleticsResults?: import('../engine/worldAthletics').WAYearResult[]
```

**直し方**: 次の2つを違反から外す。
- `import type { X } from '...'` の行
- 型の位置に書かれた `import('...').X`（上のような書き方）

**残る5件（値の import）は直さないこと。** 許可リストに入れて、理由をコメントで残す:

```
src/data/cardShop.ts:31    export { RARITY_EXP as CARD_UNIT_EXP } from '../utils/cardCombo'
src/data/economy.ts:19-20  operatingCostOf / OPERATING_COST_RATE を utils/clubTier から
src/data/logoPresets.ts:1  strHash を utils/hash から
src/data/sponsors.ts:2     tierSponsorIncome を utils/clubTier から
```

コメントには「**data から utils への値の参照が残っている。解消は別途（勝手に動かすと
一本化の決まりが崩れる）**」と書いておく。`src/utils/ads.ts` → `store/loadingStore` の
既知の例外も同じ扱いで残す。

**この4件を「直そう」としないこと。** どれも `utils/clubTier` の一本化に関わるので、
動かすならオーナー確認が要る。見つけた事実として残すのが仕事。

### 3-2. `check-layers.ts` を `npm run check` に登録しない（現状のまま）

登録は点検基盤の担当が §4 でまとめて行う。`package.json` には触らないこと。

### 3-3. 直したら

`npx tsc -b` と `npm run check` を通してから push し、**何を直したか報告する**。
そこで合流する。次の作業はそのあと指示する。

---

## 4. 点検基盤への指示

`scripts/run-checks.mjs` による一本化は方針として正しい。**ただし、いまのままだと
「見張り番が黙って外れる」問題を自分で起こす。** 合流前に下を全部やること。

### 4-1. まず main にリベースする（最優先）

**そのブランチは main より40コミット遅れた地点から分岐している。**
その間に P0〜P5 で次の構造変更が入っている:

- `gameStore.ts` 9,566行 → 706行。アクションは `src/store/slices/*.ts` 9本へ分割
- セーブ移行は `src/store/persistence/`（migrateSave / mergeSave / normalizeSave / saveVersion）へ
- 純粋ロジックは `src/engine/` へ（growth / cpuMarket / achievements / draftOrder / raceNews ほか多数）

```bash
git fetch origin && git rebase origin/main
```

コンフリクトは `CLAUDE.md` と `package.json` で起きる可能性が高い。
**解決に迷ったら手を止めて報告すること**（勝手に片方を捨てない）。

### 4-2. 点検の一覧に3本足りない（必須）

`run-checks.mjs` の `CHECKS` に、**リベース後に存在するはずの次の3本が入っていない**。
このまま合流すると、いま動いている安全網が黙って外れる。

| 足すもの | 何を見ているか | なぜ外してはいけないか |
|---|---|---|
| `migrate-snapshot` | 旧セーブ（v29相当）を migrate+merge に通した後の**形**が変わっていないか | セーブ互換の唯一の自動確認。外すと移行事故に気づけない |
| `action-golden` | `runRace` / `endSeason` を**シード固定**で走らせ、実行後の状態が前と1バイトも変わらないか | **本線がいま進めている分解作業の唯一の安全網**。外すと挙動が変わったことに誰も気づけない |
| `layers` | 層をまたいだ import（下から上）を機械的に落とす | ビュー層が新設。§3 の修正が入ってから登録すること |

`action-golden` と `migrate-snapshot` は `shim: true`（localStorage の差し込み）が要る。
`layers` は不要。

**登録したら、その3本が実際に走って通ることを目で確かめること**（一覧に足しただけで
名前が違って空振り、が一番まずい）。

### 4-3. 「わざと外したもの」の一覧に理由を書く

いまの実装にある「意図して走らせないもの」の考え方は良い。**ただし理由を必ず書くこと。**
34本が黙って抜け落ちたのは、その区別が無かったのが原因。

### 4-4. 壊れている点検が1本ある（見つけたら直す）

`scripts/check-transfer-bid.ts` は **10件 NG を出しているのに終了コード0を返す**。
判定の中身が古く（分割前の `gameStore.ts` を読む前提）、いまは `src/store/slices/marketSlice.ts` に
移っている。次のどちらかにすること:

- 直せるなら、いまの構成に合わせて直したうえで `process.exit(1)` を入れる
- 直せないなら、**一覧から外して「旧仕様のまま。要修正」と理由を書く**（黙って通さない）

判断に迷ったら報告すること。中身の仕様（入札の勝ち負けの決まり）は勝手に変えない。

### 4-5. `ErrorBoundary` の修正はそのままでよい

スタックを捨てていたのを直したのは良い修正。リベース後もそのまま残すこと。

---

## 5. 全員に共通する決まり

1. **挙動を変えない。** 表示・数値・判定・並び順を変えない。
   変えたくなったら、手を止めてオーナーに聞く（`CLAUDE.md`「勝手に決めないこと」）
2. **`npx tsc -b` の終了コードをパイプ越しに見ない。** `tsc | head` だと head の結果になる
3. **バランスの数字は移すだけ。** 値を変えない
4. **見つけた不具合は直さずに報告。** 直すかはオーナーが決める
5. **プルリクエストを作らない。** 頼まれていない
6. 1タスク＝1コミット。コミットメッセージは日本語

---

## 6. 迷ったときの優先順位

1. セーブデータを壊さないこと（`store/persistence/` と `migrate-snapshot`）
2. 挙動を変えないこと（`action-golden`）
3. 構造をきれいにすること

**1と2を犠牲にして3を進めない。**

---

## 7. 追記（2026-08-11 検証結果）

両ブランチを main の上にリベースして実際に走らせた。**指示はよく守られている**が、
取り込み前に直すことが1件ある。

### 7-1. ビュー層 → 合格。取り込んでよい

- 型だけの import を違反から外す修正を確認（`check-layers.ts`）
- main の上で `npx tsc -b` = 0、`npm run check` = 0

### 7-2. 点検基盤 → **1件だけ直すこと（取り込み保留）**

`migrate-snapshot` と `action-golden` を一覧に繋いだことを確認した。ここは良い。
ただし **`load-v39` を一覧に入れたことで、`npm run check` が終了コード1を返す。**

```
    path: '/tmp/v39-save.json'   ← ENOENT
✗ 落ちました: load-v39
```

`scripts/check-load-v39.ts` は **実機から取り出した本物のセーブ**（既定 `/tmp/v39-save.json`、
`V39_SAVE` で差し替え）を読む点検で、リポジトリには入っていない。
ファイルが無い環境では必ず落ちる。**分割作業は全コミットを `npm run check` = 0 で
通しているので、このままだと全員の作業が止まる。**

直し方はどちらか。**勝手に点検の中身（読み込みの検証そのもの）を薄くしないこと。**

- **推奨**: セーブファイルが無いときは「見送り」として扱い、落とさない。
  `SKIP` と同じ列に「実機のセーブが要る。`V39_SAVE=<path> npm run check` で走らせる」と出す
- または `SKIP` に移し、同じ理由を書く（セーブ形式を上げるときは手で走らせる、と添える）

**`?` は付けないこと。** `?` は「壊れているが直していない」印であって、
「環境に依存する」印ではない。混ぜると `?` の意味が薄まる。

直したら、**ファイルが無い状態で `npm run check` が 0 を返すこと**を確かめてから報告する。
そこで取り込む。

### 7-3. 全員へ（今回の実例）

この検証で、統括自身が `npm run check 2>&1 | tail -20; echo $?` と書いて
**見かけ上 0（実際は 1）を一度読み違えた**。パイプの先の `$?` は `tail` のもの。
§5-2 の決まりは本当に守ること。

---

## 8. 追記（統括から点検基盤へ・§1の例外を1つ広げた）

### 8-1. ビュー層は取り込み済み

main に入れた（`e33dd0b`）。**点検基盤はもう一度 `git rebase origin/main` すること。**
`scripts/check-layers.ts` が main に入ったので、`run-checks.mjs` の `CHECKS` に
`layers` を足してよい（§4-2 の3本目）。

### 8-2. `scripts/check-fa-market.ts` を統括が1箇所だけ触った（報告）

**§1 では `scripts/**` は点検基盤の担当としたが、次の1箇所だけ本線が直した。**
理由は、本線の移設でその点検が誤検知を起こし、**全員のコミットが止まる状態**になったため。

- 何をしたか: 走査対象に `src/engine/*.ts` を追加（ファイル冒頭 45行目付近）
- なぜ: この点検は「FA獲得が `pickCpuFreeAgents` 1本を通っているか」を見るもので、
  **置き場所を見る点検ではない**。シーズン中のぶんを `engine/inSeasonFa.ts` へ移した瞬間、
  `src/store/**` だけを見ていたため「3箇所あるはずが2箇所」と誤検知した
- 競合しないこと: そちらの変更は同ファイルの125行目付近（3部のエースを使う修正）なので、
  リベースで素直に合流するはず。**合流時にどちらかを捨てないこと**

### 8-3. §1 の例外を広げる（全員へ）

これまで「`check-single-source.ts` の許可リスト追加だけ本線が触ってよい」としていたが、
**狭すぎた**。次のように改める。

> **本線の移設が原因で落ちた点検は、本線が最小限の追随をさせる。**
> ただし ①追随のみ（点検の中身・厳しさを変えない）②その旨をこの文書に書く
> ③点検の作りそのものを直したいときは点検基盤に渡す。

`scripts/storeSource.ts`（store 本体＋スライスを1本で読む入口）は良い作りだった。
**engine まで見たい点検も出てきた**ので、そちらで扱いを決めてほしい
（`storeSource()` に engine を含めるのか、`engineSource()` を足すのか）。
決まったら check-fa-market もそれに寄せてよい。
