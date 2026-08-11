# 作業指示 その2（ビュー層・ChatPage の分解）

前回の3タスク（在籍履歴の集計移設／移籍金判定の一本化／check-layers.ts）は
**すべて main に取り込み済み**。良い仕事だった。特に `check-layers.ts` は
「型だけの import は違反ではない」を正しく直してあった。

この指示は前回と同じ流儀で進める。**まず `git fetch origin && git checkout -b <新しいブランチ名> origin/main`
から始めること**（前のブランチの続きにしない）。

読む順: ①`CLAUDE.md` → ②`docs/COORDINATION.md`（担当の線引き）→ ③この文書。

---

## 0. 触ってはいけないファイル（並行作業中）

| 誰の担当か | ファイル |
|---|---|
| 本線（統括） | `src/engine/**` ／ `src/store/**` |
| 点検基盤 | `scripts/**` ／ `package.json` ／ `CLAUDE.md` ／ `src/components/ui/ErrorBoundary.tsx` |
| **あなた** | `src/components/**`（ErrorBoundary を除く） ／ `src/utils/**` ／ `src/data/**` |

**前回と違う点: `scripts/**` は触らないこと。** 前回 `check-layers.ts` を新規作成したが、
いまは点検基盤の担当が `scripts/run-checks.mjs` で一覧を組み直している最中で、衝突する。

---

## 1. 今回の目標: `src/components/team/ChatPage.tsx`（1,901行）を分解する

このリポジトリで**いちばん大きいビューのファイル**。中身は3種類が混ざっている。

1. **会話の組み立て**（データ→発言の配列）… ビューではない。`src/utils/` へ出す ← **今回やる**
2. 画面の部品（ChatView / TradeChatView / 各種カード）… 分割は次回
3. 交渉の操作（ボタンを押したときの store 呼び出し）… そのまま残す

**今回は 1 だけをやる。** 2 と 3 には手を付けない（一度に動かすと壊れたとき原因が分からない）。

---

## 2. やること

### 2-1. 会話の組み立て6関数を `src/utils/chatTalk.ts`（新規）へ移す

| 関数 | 行 | 何を作るか |
|---|---|---|
| `buildMessages` | 63 | 契約更新・引退・移籍希望・海外挑戦の会話 |
| `buildAcqMessages` | 150 | 獲得オファー（FA・引き抜き）の会話 |
| `buildTransferMessages` | 172 | 移籍金合意後の契約交渉の会話 |
| `buildIncomingOfferMessages` | 199 | 他クラブから買い取り打診が来たときの会話 |
| `buildIncomingLoanMessages` | 234 | レンタル打診の会話 |
| `buildStayOrLeaveMessages` | 247 | 「残ってくれ／契約解除」の会話 |

置き場所は **`src/utils/chatTalk.ts`**。既にある `src/utils/chatLines.ts`（2か所以上に出る
**1行ぶんの文面**）の隣に置く。役割の違いは:

- `chatLines.ts` … 「ありがとうございます」など**1つの発言**の文面
- `chatTalk.ts` … その発言を**どういう順で並べるか**（会話の組み立て）

`chatTalk.ts` の冒頭にこの2つの違いをコメントで書くこと。

### 2-2. 型の書き方を直す（移すついでに必ず）

`buildMessages` の引数がこうなっている:

```ts
player: ReturnType<typeof useGameStore.getState>['players'][0],
contractReq: NonNullable<ReturnType<typeof useGameStore.getState>['currentSeason']['contractRequests']>[0] | undefined,
```

**store から型を逆算している。** これだと `utils/` が `store/` を参照することになり、
`check-layers.ts`（あなたが作った点検）に引っかかる。`src/types` の型を直接書くこと:

```ts
player: Player,
contractReq: ContractRequest | undefined,
```

型が合わない場合は、**合わせるために処理を変えないこと。** 詰まったら報告する。

### 2-3. 発言には必ず `kind` が付いていることを確認する

移した先でも `{ from, kind, text }` の `kind` を落とさないこと。
`kind` が無いと重複した発言を潰せない（`npm run check` の `chat-dup` が見張っている）。
**新しい文面を書かない・既存の文面を1文字も変えないこと。**

### 2-4. ChatPage 側

`import { buildMessages, ... } from '../../utils/chatTalk'` に置き換えるだけ。
呼び出し方は変えない。

---

## 3. 確認（必須）

```bash
npx tsc -b; echo $?      # ← パイプに繋がないこと。0 であること
npm run check; echo $?   # 0 であること（3〜5分かかる）
npx eslint src/components/team/ChatPage.tsx src/utils/chatTalk.ts
```

`npm run check` の中の **`chat-dup` と `chat-lines`** が今回いちばん効く点検。
落ちたら「文面を変えてしまった」か「`kind` を落とした」なので、素直に戻すこと。

**目視でも確かめること**: 選手をタップしてチャットを開き、契約更新・移籍希望・
買い取り打診の会話が今までどおり出ること。実行できなければ「確認できていない」と正直に報告する。

---

## 4. 終わったら

1. コミット（1タスク＝1コミット。日本語のメッセージ）
2. `git push -u origin <ブランチ名>`
3. **プルリクエストは作らない。** 統括が検証して main に入れる
4. **何をしたか・確認できたこと/できなかったことを報告する**

---

## 5. 迷ったら止まる

- 移していて「これはバグでは？」と気づいたら、**直さずに報告**する
- 会話の文面・順番・条件を1文字も変えない（今回は「引っ越し」であって改善ではない）
- 指示に無いUIの改善を足さない

---

## 6. 落とし穴（実際に踏んだもの）

1. **`npx tsc -b | head` の終了コードを見ない。** head のものになる（統括も1度踏んだ）
2. import を機械的に編集すると `import {, X } from ...` という壊れ方をする。
   `tsc` が「Identifier expected」を出したらこれを疑う
3. 関数を切り出すとき、**次の関数の前置きコメントまで巻き込みやすい**。切った後の両側を目で見る
4. コメントを落とさない。特に「以前ここが◯◯だったため△△が起きた」という経緯は
   同じバグを防いでいるので、関数と一緒に運ぶこと
