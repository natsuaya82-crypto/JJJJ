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
| 年1回の成長 | `gameStore.ts` の `growPlayer`（CPU・海外） |
| 初期生成の焼き込み | `playerGenerator.ts` の `bakeAgeGrowth` |
| ランクから能力値を作る | `playerGenerator.ts` の `buildRatingsForRank`（生成4経路すべてがここを通る） |

`ageMultiplier` / `growPlayer` / `bakeAgeGrowth` / `careerStage` は全部 `peakAgeOf` を呼びます。
**ピークの式を変えるときは `peakAgeOf` だけを触ってください。**

成長速度そのもの（`rnd(1,3)` とピーク後3年の窓）は `growPlayer` と `bakeAgeGrowth` の
2箇所に同じ係数があります。片方だけ変えると、初期生成と年次成長でカーブがずれます。
どちらのコメントにも「必ず一緒に変えること」と書いてあります。

---

## 勝手に決めないこと（オーナーの指示）

**バランスの数字と設計の方針は、実装する前にオーナーに確認すること。**
「分からないなら確認しろ」ではなく「決めるのはオーナー」。以下は実際に勝手に決めて怒られた例。

- 格の帯をどう切るか（どのクラブが格いくつか）
- 格を「クラブの総額」で持つか「1人あたりの年俸」で持つか
- 頼まれていないUIを足す（順位表の★、ヘッダーの丸チップ、代表の並び替えボタン）

事実の調査・原因の特定・選択肢の提示までが仕事。数字を決めるのはオーナー。

### 「進めていい」と言われるまで手を動かさないこと

草案を出したあとに来る次の発言は、**ほぼ全部が質問か条件の追加**であって、着手の合図ではない。
実際にこれで5回怒られている。直近の例：

- 草案に対して「なんでチャットと移籍方針消すの？」と聞かれた
  → 質問に答えたあと、そのまま実装を始めた。**答えるだけで止めるのが正解**

着手していいのは、オーナーが「やっていい」「進めて」「それでいい」と**はっきり言ったときだけ**。
「いいね」「わかった」「そうだね」は合図ではない。迷ったら手を止めて聞くこと。

---

## クラブの格

**格は「クラブごと」に決めます。リーグ単位・地域単位ではありません。**

格1に相当するのは世界で数クラブ（サッカーで言えばレアル・バルサの位置）。
国内52＋海外180の全232クラブに個別の格（1〜20）を振ってあります。
`src/data/clubTiers.ts` の `CLUB_TIER_BY_ID` が初期値です。

「アジアは格5〜8」「中南米は格7〜10」のようなリーグ単位の帯は**間違い**。
一度そう実装しかけて差し戻しています。

**格はプレイヤーに見せない内部データです。画面に出さないこと。**

### 格から降りてくるもの

`src/utils/clubTier.ts` が唯一の決まりです。国内も海外も同じ入口を通ります。

    格 → 年間予算 → 使える年俸 → ロスターのランク構成 → 選手の強さ
     └→ 成長の上限 ・ 成長の速さ ・ スポンサー収入

| 何 | どこ |
|---|---|
| 格（1〜20）と年間予算 | `clubTier.ts` の `TIER_BUDGET` |
| そのクラブの格を読む | `tierOf(team)` / `tierOfClubId(id)` / `tierOfPlayerClub(teamId, teams)`。`team.tier` を直接見ないこと |
| そのクラブの予算 | `tierBudget(team)` |
| 成長の上限（OVR） | `TIER_POTENTIAL_CAP` / `tierPotentialCap(team)` |
| 成長の速さ（CPU・海外） | `tierGrowthRate(tier)` |
| ロスターのランク構成 | `tierRankComposition(tier)`（25人ぶん） |
| スポンサー収入 | `tierSponsorIncome(tier)`（3枠を埋めた合計） |
| 運営費 | `operatingCostOf(総年俸)`（年俸の1割） |
| 国内の順位→格 | `tierFromDomesticRank(通し順位)`。通し順位は `utils/league.ts` の `domesticThroughRank` |

予算は 21.1億（格1）から 4.2億（格20）。**格1〜4は海外クラブだけ**で、
国内の頭打ちは格5（1部優勝＝16.8億）です。3部最下位（格20）から4倍。

### 格は毎年動きます

国内クラブの格は**前年の国内通し順位1本**で決まります（`endSeason`）。
1部1位＝格5、2部1位＝格11、3部最下位＝格20。
通し順位は「部 → 部内順位」の順で数えます。**順位表の得点で52チームを直接
並べてはいけません**（部ごとにレース数が10/8/7と違うので3部が2部を追い抜く）。

昇降格は各部の上位2・下位2。プレーオフなし。格は「今季走った部での順位」で
決まり、部の入れ替えはそのあとです。

### 予算は格1本

    収入 = 格の年間予算 + スポンサー + 区間賞 + 目標達成ボーナス
    支出 = 総年俸 + 運営費(総年俸の1割) + 出来高ボーナス

`src/data/economy.ts` の `computeNextSeasonBudget` 1本。自チームもCPUも海外も同じです。
**次のものは廃止済みです。復活させないこと。**

- `RANK_BUDGET`（前年順位→グラント）— 1〜20位ぶんしか無く、52チーム制では
  21位以降が全部3.90億になって2部と3部の区別が消えていた
- 順位別のレース賞金・観客収入（自チーム／CPU双方）
- CPUへのグラント10%補填
- 連続赤字のグラント減額 — 減るのは収入なのに脱出手段は年俸削減だけの一方通行。
  赤字のペナルティは補強禁止だけ
- 育成義務ペナルティ（在籍22人以下で-20%）
- 施設維持費（施設レベルそのものは残る）
- `generateCpuRosters` の `RANK_UP`（国内CPUのランクを一段引き上げ）

### 値段も1本

    年齢カーブ → OVR → 市場年俸 → 移籍金

| 何 | どこ |
|---|---|
| 年齢→OVR | `src/engine/ageCurve.ts` の `curveOvr` / `ratingAt` |
| 市場年俸 | `playerUtils.ts` の `faMarketSalary`（`SALARY_ANCHORS` × 実績倍率0.55〜1.45） |
| 移籍金 | `playerUtils.ts` の `calcTransferValue`（市場年俸 × 年齢倍率 × 契約年数係数） |
| 移籍金の年齢倍率 | `transferFeeAgeMultiplier`（〜22歳×5／23〜27×4／28〜31×3／32〜×2） |

年俸に年齢係数は掛けません（衰えは年齢カーブでOVRが下がることだけで表す）。
移籍金に実績倍率を掛け直しません（年俸の中で既に効いている）。
ポテンシャル係数は廃止（伸びしろは年齢倍率で表す）。

### 移籍の同意も格で決まる

`playerConsentToMove(p, 行き先の格, 今の格, …)`。行き先の魅力は**格差**です。
順位は国内52チームの物差ししか無く、海外クラブは常に0.5固定でした。

- 同格で0.5、約8段上で1.0、8段下で0
- ピークを過ぎた選手は格へのこだわりが薄れる（格差の効きを6割に圧縮）
- 今のクラブの成長上限に達していて行き先の上限が高いと +0.25
  （下位クラブで頭打ちになった若手が上へ出て行く動きはこれが作る）

### 他の部も裏で走ります

レースに出るのは自分と同じ部のチームだけです。そのため2部・3部の順位表は
0ptのまま動かず、昇降格も通算成績も決まりませんでした。
`src/engine/domesticLeague.ts` が、海外8リーグ（`engine/foreignLeague.ts`）と
同じ形で自分の部以外も裏で走らせます。順位表も通算成績も本編と同じだけ動きます。

### まだ無いもの

**自チームの2チーム参加**（Bチーム・同一リーグ禁止・選出はリザーブの転用）が
未着手です。

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
