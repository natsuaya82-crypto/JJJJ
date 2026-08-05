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
| `src/components/ui/BottomSheet.tsx` | 画面下から出るシートの入れもの。`ActionSheet` もこれの上に乗っている |

### 画面下から出るものは必ず `BottomSheet` を通すこと

ページの中に `position: fixed` で自前のシートを書くと、**実機でだけ**下タブに食われて操作できなくなります。

`Layout` の `<main>` は `-webkit-overflow-scrolling: touch` のスクロール領域で、iOS の WebView は
これを `position: fixed` の基準にしてしまいます。その結果、main の中に書いた fixed は

- `inset: 0` にしても画面全体ではなく main の内側しか覆わない（ヘッダーと下タブが暗くならない）
- `z-index` をいくつにしても、外にいる下タブ（`z-index: 50`）より上に来られない

という状態になります。build 87 の走友会「反応する」シートがこれで、**見出しの一行しか見えず
絵文字が全部下タブの裏**にありました。ブラウザのプレビューでは再現しません。

`BottomSheet` は `createPortal` で `document.body` に出すので、この問題が起きません。
広告バナーの高さとセーフエリアの処理もこの中にまとまっています。

数字の直書きにも注意してください。人数上限は `ROSTER_MAX` を使い、`30` と書かないこと。

---

## 成長の計算（整理済み・触るときはここから）

以前ここに「ピークの式が3箇所にコピペされている」「倍率が呼び出し元に埋もれている」
「`careerStage` だけ年齢観が違う」と書いてありましたが、**3つとも解消済みです**。
いまの形は次のとおりで、幹と枝が分かれています。

| 何 | どこ |
|---|---|
| ピーク年齢（唯一の決まり） | `src/utils/playerUtils.ts` の `peakAgeOf` |
| 成長の幹 | `src/engine/growth.ts` の `applyGrowth` |
| 倍率の枝 | 同ファイルの `ageExpMultiplier` / `potentialExpMultiplier` / `facilityExpMultiplier` / `nationalityExpMultiplier` |
| EXPの計算 | 同ファイルの `processExpGains`（プレイヤー側） |
| 年次成長の速さ（唯一の決まり） | 同ファイルの `applyAnnualStatGrowth` / `GROWTH_PEAK_WINDOW_YEARS` |
| 年1回の成長 | `gameStore.ts` の `growPlayer`（CPU・海外。中身は `applyAnnualStatGrowth` 呼び出し） |
| 初期生成の焼き込み | `playerGenerator.ts` の `bakeAgeGrowth`（中身は `applyAnnualStatGrowth` 呼び出し） |
| ランクから能力値を作る | `playerGenerator.ts` の `buildRatingsForRank`（生成4経路すべてがここを通る） |

`ageMultiplier` / `growPlayer` / `bakeAgeGrowth` / `careerStage` は全部 `peakAgeOf` を呼びます。
**ピークの式を変えるときは `peakAgeOf` だけを触ってください。**

以前ここに「成長速度（`rnd(1,3)` とピーク後3年の窓）が `growPlayer` と `bakeAgeGrowth` の
2箇所にコピーされている」と書いてありましたが、解消済みです。両方とも
`applyAnnualStatGrowth` / `GROWTH_PEAK_WINDOW_YEARS`（`src/engine/growth.ts`）を呼ぶだけになっています。
**成長速度を変えるときは `applyAnnualStatGrowth` と `GROWTH_PEAK_WINDOW_YEARS` だけを触ってください。**

---

## 未整理で残っている問題（既知）

**`generateCpuRosters` の `RANK_UP`（`playerGenerator.ts`）**

国内CPUの選手ランクを一段引き上げています。これが海外クラブとの予算差（約2倍）を
打ち消していて、JPELが4大リーグと並んでしまいます。

実測（上位10人の平均OVR）: 4大リーグ 87.0 / JPEL1位 86.3 / JPEL20位 83.2 / 欧州西南 80.7

**クラブの格（`src/utils/clubPrestige.ts`）はこれが理由で未接続です。**
`RANK_UP` を外して測り直してから帯を決めてください。先に格を入れると、決めた帯が嘘になります。

---

## 配信（TestFlight）

**バージョンは v2.0.2 で固定です。オーナーがOKを出すまで 2.0.3 に上げないでください。**

実機確認のあいだは、中身を足してもバージョンは上げません。ビルド番号だけを上げて
2.0.2 のまま出し続けます。お知らせも新しいエントリを作らず、v2.0.2 のエントリに追記します。

| 何 | どこが正 | 誰が書く |
|---|---|---|
| バージョン（2.0.2） | `src/data/appMeta.ts` の `APP_VERSION` | `npm run sync:version` と CI |
| ビルド番号（88, 89, …） | git タグ `build-NN` | CI（`ios-deploy.yml`） |

タグを打てば CI がビルド番号を書き込みます。ただし**セッションによってはタグの push が
GitHub に 403 で弾かれます**（ブランチへの push は通るのにタグだけ通らない）。その場合は

1. `ios/App/App.xcodeproj/project.pbxproj` の `CURRENT_PROJECT_VERSION` を次の番号に上げてコミット
2. `ios-deploy.yml` を `workflow_dispatch` で実行する

タグ起動でないとき、CI は pbxproj の値をそのまま使うので、出来上がるビルドはタグ起動と同じです。
**上げ忘れると、ビルドは全部成功したうえで最後のアップロードだけが 409 で落ちます。**

## コマンド

```bash
npm install
npm run dev       # 開発サーバ
npm run build     # tsc -b && vite build
npm run lint      # eslint（既存エラーが多数あります。新規に増やさないこと）
```

テストランナーは導入していません。挙動を変えないリファクタをするときは、
変更前後で計算結果をダンプして差分がゼロであることを確認してください。
