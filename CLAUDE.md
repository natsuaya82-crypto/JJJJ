# JPELマネージャー

エキデン（駅伝）チームを経営するモバイルゲーム。Vite + React + TypeScript + zustand、
Capacitor で iOS アプリとして配信している。

---

## ⚠️ 最初に読むこと：作業ブランチ

**開発の本体は `feature/world-athletics` です。`main` は使わないでください。**

- `main` は `feature/world-athletics` より **200コミット以上遅れています**
- 新しい作業は必ず `feature/world-athletics` から切ってください
- `main` を基準にすると、既に解決済みの問題を「バグだ」と誤検出し、
  既にある共通関数を二重に実装することになります（実際に起きました）

```bash
git fetch origin
git checkout -b <作業ブランチ名> origin/feature/world-athletics
```

現状を確認したいときは：

```bash
git rev-list --count origin/main..origin/feature/world-athletics   # 0 でなければ main は古い
```

Cowork・Claude Code CLI・Web・GitHub Actions など、どの環境から入っても同じです。

---

## 車輪の再発明をしないこと

「同じ判定があちこちに手書きされていてズレる」という問題を潰した結果、
**判定を1本化した専用モジュール**がいくつもあります。新しく条件式を書く前に、
ここに既にあるかどうかを必ず確認してください。

| モジュール | 何の「唯一の決まり」か |
|---|---|
| `src/utils/rosterSync.ts` | 所属の判定。`belongsToClub` / `isSquadMember`（レンタル中の選手を除く） |
| `src/utils/talkSync.ts` | 選手が動いたときに、その選手についての交渉の札をたたむ処理 |
| `src/utils/contractTalk.ts` | 契約更新の可否と「要対応」。`canRequestRenewal` / `needsRenewalAttention` |
| `src/utils/transferEligibility.ts` | 退団予定・引退予定・海外承認などの「もう出ていく人」判定 |
| `src/utils/reserveSquad.ts` | リザーブ戦に出せる選手（プレイヤー側とCPU側で共通） |
| `src/utils/transferBid.ts` | 移籍金の入札判定 |
| `src/utils/tradeValue.ts` | トレードの釣り合いの判定 |
| `src/utils/notifItems.ts` | 通知の中身の収集（ベルの数字と通知ページの内容を揃える） |
| `src/data/rosterRules.ts` | ロスター人数の上限・下限。`ROSTER_MAX` / `ROSTER_MIN` |

数字の直書きにも注意してください。人数上限は `ROSTER_MAX` を使い、`30` と書かないこと。

---

## 未整理で残っている問題（既知）

`src/store/gameStore.ts` の成長計算まわりは、まだ後付けが散らばっています。

- 年齢によるピークの式が3箇所にコピペされている
  （`ageMultiplier` / `growPlayer` / `playerGenerator.ts` の `bakeAgeGrowth`）
- 経路ごとにどの倍率が掛かるかが、呼び出し元の引数の渡し方に埋もれている
  （練習カードだけポテンシャル倍率も合宿倍率も掛かっていない、など）
- `careerStage`（`playerUtils.ts`）は specialty 基準で、成長計算の growthCurve 基準と別の年齢観

成長のバランス（若手が伸びない・30過ぎが落ちすぎ・90が作れない）を触る前に、
まずこの構造を1本にまとめること。順番を逆にすると、統合で壊れたのか調整で変わったのかが
切り分けられなくなります。

---

## コマンド

```bash
npm install
npm run dev       # 開発サーバ
npm run build     # tsc -b && vite build
npm run lint      # eslint（既存エラーが多数あります。新規に増やさないこと）
```

テストランナーは導入していません。挙動を変えないリファクタをするときは、
変更前後で計算結果をダンプして差分がゼロであることを確認してください。
