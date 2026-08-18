# JPELマネージャー

エキデン（駅伝）チームを経営するモバイルゲーム。Vite + React + TypeScript + zustand で作り、
Capacitor で iOS アプリとして配信しています。

**作業を始める前に、リポジトリ直下の [`CLAUDE.md`](./CLAUDE.md) を読んでください。**
どのブランチで作業するか・同じ判断を2か所に書かないための決まり・画面の作り方が全部そこにあります。

## コマンド

```bash
npm install
npm run dev       # 開発サーバ
npm run build     # tsc -b && vite build
npm run lint      # eslint（既存エラーが多数あります。新規に増やさないこと）
npm run check     # 一本化の点検。後付けが増えていたら落ちる（コミット前に必ず）
```

テストランナーは入れていません。代わりに `npm run check` が、世界を実際に作って回した結果を
突き合わせます（`scripts/check-*.ts`）。挙動を変えないリファクタをするときは、変更前後で
計算結果をダンプして差分がゼロであることを確認してください。

## 中身の置き場所

| どこ | 何 |
|---|---|
| `src/store/` | 遊んでいる状態（zustand）。`slices/` にドメインごとの操作、`persistence/` にセーブ |
| `src/engine/` | 純粋な計算（レース・成長・移籍市場・ドラフト・世界選手権） |
| `src/utils/` | 「唯一の決まり」を置く場所（所属・移籍の同意・契約・順位…）。一覧は `CLAUDE.md` |
| `src/components/` | 画面。共通の見た目は `src/styles/tokens.ts` と `components/ui/` |
| `src/lib/` | オンライン（Supabase）。`store/` からは値として import しない |
| `supabase/all.sql` | サーバー側の全部。**流すのはこの1本だけ** |
| `scripts/` | 点検（`check-*.ts`）と計測（`measure-*.ts`）。一覧は `run-checks.mjs` |
| `docs/` | 決めたことと、調べたことの記録。`BACKLOG.md` が「まだ決まっていないこと」 |
