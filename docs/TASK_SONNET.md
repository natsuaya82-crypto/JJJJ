# 作業指示（並行タスク・ビュー層とガードレール）

このタスクは**別のセッションが同時に進めている P5（store/slices と engine の分解）と並行して**進める。
**ファイルが重ならないように範囲を区切ってある。下の「触ってはいけないファイル」を必ず守ること。**

読む順: ①リポジトリ直下 `CLAUDE.md` → ②この文書。
（`docs/REFACTORING_DESIGN.md` と `docs/HANDOFF_P5-P7.md` は背景。急ぐなら §7 の落とし穴だけ読めばよい）

---

## 0. 触ってはいけないファイル（並行作業中・コンフリクトするため）

- `src/store/` 配下すべて（gameStore.ts / slices/ / persistence/ / marketOps.ts）
- `src/engine/` 配下すべて
- `scripts/check-action-golden.ts` と `scripts/fixtures/`
- `package.json`

**上のどれかを変更したくなったら、手を止めて報告すること。**（勝手に触らない）

触ってよいのは `src/components/` `src/utils/` `src/data/` `src/lib/` と、新規に作る `scripts/check-layers.ts` だけ。

---

## 1. 大前提（3つとも必須）

1. **挙動を変えない。** 表示される文字・数値・色・並び順を1文字も変えない。
   これは「同じ処理があちこちに手書きされている」のを1本にまとめる作業であって、仕様変更ではない
2. **コミット前に必ず両方 green にする**
   ```bash
   npx tsc -b; echo $?      # ← パイプにつながないこと。`tsc | head` だと head の終了コードを見てしまう
   npm run check; echo $?
   ```
   `npm run check` は3〜5分かかる。`&&` でつないで一気に確認するとよい:
   ```bash
   npx tsc -b >/dev/null 2>&1 && npm run check >/dev/null 2>&1 && echo GREEN || echo RED
   ```
3. **ESLintのエラーを増やさない。** 触ったファイルは変更前後で件数を比べる
   ```bash
   npx eslint <触ったファイル>   # 変更前の件数を控えてから作業する
   ```

作業ブランチは `origin/main` から切る。1タスク＝1コミット。コミットメッセージは日本語。

---

## 2. タスクA: 選手詳細の「在籍履歴」の組み立てを utils へ出す（本命・最初にやる）

### 何が問題か

`src/components/shared/PlayerSheet.tsx`（1,194行）の L336〜L404 あたりに、
**「その選手が何年にどのクラブで何戦走り、区間賞を何回取ったか」を集計する処理**が
画面の中に直接書かれている。約70行あり、`historyMap` というMapに
`年|チームID|大会種別` をキーとして積んでいく。

これは表示ではなく**データの集計**なので、画面の外（`src/utils/careerStats.ts`）に置く。
`careerStats.ts` には既に同じ family の関数（`buildCareerCounts` / `careerCountsOf` /
`foreignSeasonApps`）があるので、その隣に置くのが正しい。

### やること

`src/utils/careerStats.ts` に次の関数を1つ追加する（名前はこの通りに）:

```ts
export type HistComp = 'main' | 'second' | 'ecl' | 'foreign'
export type HistoryRow = { year: number; teamId: string; comp: HistComp; races: number; wins: number; rankSum: number; rankedRaces: number }

/** その選手の在籍履歴（年 × クラブ × 大会）を作る。PlayerSheet から移設 */
export function buildPlayerHistory(params: {...}): Map<string, HistoryRow>
```

引数は PlayerSheet が今その処理に渡している値をそのまま受け取る形にする。具体的には:

- `playerId` / `playerTeamId` / `isRetired`
- `ranRows`（`utils/raceHistory` の `ranRaces` の戻り値。L308 で作っている）
- `pastSeasons` / `currentSeason`
- `isForeignClub`（`clubIndex.byId(player.teamId)?.isDomestic === false` の結果。
  **clubIndex は画面側の都合なので、真偽値だけ渡す**）

移す範囲は L336 の `// 在籍履歴（移籍情報）集計：` のコメントから、
L404 の `if (!isRetired) { ... }` ブロックの終わりまで（`historyMap` が完成するところまで）。
**その次の「年×チームの親行へ集約」以降は表示の都合なので画面に残す。**

### 守ること

- **コメントを1行も落とさない。** 特に「★在籍履歴も ranRows から積む」「以前ここが 'second' だったため
  廃止済みのリザーブリーグが出ていた」といった経緯のコメントは、同じバグを防いでいるので必ず一緒に運ぶ
- ロジックは1文字も変えない（順序・条件・0埋めの扱いを含む）
- `foreignSeasonApps` は既に careerStats にあるので、移した先では import ではなく同ファイル内の呼び出しになる
- PlayerSheet 側は `const historyMap = buildPlayerHistory({...})` の1行になる

### 確認

型チェックと `npm run check` に加えて、**目視でも確かめること**（このタスクは画面の表示に関わる）:
選手詳細の在籍履歴に、年・チーム・出場数・区間賞・平均区間順位が今までどおり出ていればよい。
実行方法が分からなければ確認できた範囲を正直に報告する（憶測で「確認した」と書かない）。

---

## 3. タスクB: 移籍金の「適正／やや高／高値」の判定を1本にする

### 何が問題か

`src/components/notifications/NotificationsPage.tsx` に、
**移籍金が相場に対して高いか安いかを 0.95 / 0.75 の2つの線で判定する式**が2箇所ある。

| 行 | 立場 | ラベル |
|---|---|---|
| L69 | 買う側（自分が払う） | 適正 / やや高 / 高値 |
| L867 | 売る側（自分が受け取る） | 適正 / やや安 / 安値 |

同じ 0.95 / 0.75 なのに片方だけ直すと食い違う。閾値は `src/data/economy.ts` に出す。

### やること

`src/data/economy.ts` に閾値を追加する（**値は変えない**）:

```ts
// 提示された移籍金が相場（市場価値）に対してどのくらいか、の線。
// 買う側は「高い／安い」、売る側は逆向きに読むが、線は同じ1組。
export const FEE_FAIR_RATIO = 0.95   // これ以上なら「適正」
export const FEE_SOFT_RATIO = 0.75   // これ以上なら「やや高／やや安」、下回れば「高値／安値」
```

NotificationsPage の2箇所はこの定数を使う形に直す。**ラベルと色は今のまま**
（買う側は 適正/やや高/高値、売る側は 適正/やや安/安値。立場で言葉が違うのは意図的）。

余裕があれば、ラベルまで含めて `data/economy.ts` に小さな関数
（例: `feeRatingLabel(ratio, side: 'buy' | 'sell')`）にまとめてもよい。
ただし**色（`C.green` など）は `styles/tokens` のものなので data 層に持ち込まない**。
色は画面側で決め、data 層は「適正／やや高／高値」の区分だけを返すこと。

---

## 4. タスクC: レイヤーの依存ルールを機械チェックにする

### 背景

このリポジトリは層が決まっている。**下から上へは import しない**。

```
components/  ← 画面
store/       ← 状態（slices / persistence）
engine/ utils/  ← 純粋な計算
data/ types/ ← 定数・型
```

いまは人が気をつけているだけなので、`npm run check` で機械的に落とすようにする。
（同じ発想の見張りが `scripts/check-single-source.ts` にある。**書き方はそれを真似すること**）

### やること

`scripts/check-layers.ts` を新規に作り、次の違反を見つけたら `process.exit(1)` する:

1. `src/engine/` `src/utils/` `src/data/` の中から `src/store/` `src/components/` `src/lib/` を import している
   - **既知の例外が1つある**: `src/utils/ads.ts` が `store/loadingStore` を import している。
     これは許可リストに入れて、コメントで「解消は別途」と書いておく
2. `src/store/slices/` の中から他の `slices/` を import している
   - ただし `import type` だけの行は許可（型は循環しない）
3. `src/store/slices/` の中から `../gameStore` を**値として** import している
   - `import type { GameStore, SetGame } from '../gameStore'` は正しい形なので許可。
     値の import（`useGameStore` など）は禁止
4. `src/data/` `src/types/` の中から `src/engine/` `src/utils/` を import している

出力は `check-single-source.ts` と同じ体裁にする（`ok` / `NG` を並べ、最後に件数と直し方）。

**注意**: 作ったら必ず、いまのコードで**通ること**を確かめる。
もし既存コードが違反していたら、**勝手に直さず**「どこが違反しているか」を報告すること
（並行作業中のファイルかもしれないため）。

`package.json` への登録は**しないこと**（並行作業とコンフリクトする）。
代わりに、スクリプトの冒頭コメントに単体実行のコマンドを書いておく:

```bash
npx esbuild --bundle --platform=node --format=cjs scripts/check-layers.ts --outfile=node_modules/.cache/check-ly.cjs --log-level=error && node node_modules/.cache/check-ly.cjs
```

登録は並行作業が一段落してからこちらでやる。

---

## 5. 進め方

1. タスクA → B → C の順。**1つ終わるごとにコミット**（まとめてやらない）
2. 各タスクの後で `npx tsc -b` と `npm run check` を通す
3. 全部終わったら `git push -u origin <ブランチ名>` して、何をやったか報告する
   - **プルリクエストは作らないこと**（頼まれていない）

---

## 6. 迷ったら止まる

- ロジックを移していて「これは今の書き方だとバグでは？」と気づいたら、**直さずに報告**する。
  直すかどうかはオーナーが決める（`CLAUDE.md`「勝手に決めないこと」）
- バランスの数字（0.95 / 0.75 など）は**変えない**。移すだけ
- 指示に無いUIの改善・リファクタを足さない

---

## 7. 実際に踏んだ落とし穴（同じ穴に落ちないため）

1. **`npx tsc -b | head` の終了コードを見ない。** head のものになる。必ず単独で走らせて `echo $?`
2. import を機械的に編集すると `import {, X } from ...` という壊れ方をする。`tsc` が
   「Identifier expected」を出したらこれを疑う
3. コードのブロックを切り出すとき、**次の関数の前置きコメントまで巻き込みやすい**。
   切った後の両側を必ず目で確認する
4. `npm run check` が落ちたら、まず `scripts/check-single-source.ts` の**許可リスト**を疑う
   （ファイルを移動すると、そのルールが「移動先で新しく違反が増えた」と判断することがある）。
   ただし今回のタスクではファイル移動は無いので、落ちたら素直にロジックのズレを疑うこと
