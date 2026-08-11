# savePruning の逆方向の監査（2026-08-11・点検基盤セッション）

**結論を先に**: クラッシュする穴は見つからなかった。理由は2つの土台があるため
（下の「先に分かった2つの前提」）。ただし土台の外側で1件、**仕様確認が要る**
静かなデータ損失を見つけた（③-1 continentals.squads）。

**このファイルは調査結果のメモです。何も直していません。** 直すかどうかは統括判断。

---

## やったこと

1. `src/types/index.ts`（GameState / Season / ArchivedSeason / Team / ForeignClub /
   HofPlayer）と `src/engine/worldAthletics.ts` を上から読み、選手IDを持っている
   フィールドを全部拾った
2. `src/engine/savePruning.ts` の `protectedIds` が拾っている出どころと突き合わせた
3. 拾えていないものについて、**実際に読んでいる場所**まで遡って
   「消えたら何が起きるか」を確かめた（クラッシュ／自然に劣化／実害なし、の3通り）

---

## 先に分かった2つの前提（これが無いと個々の判定が読めない）

### 前提1: `currentSeason` はシーズン終了で**まるごと新しいオブジェクトに差し替わる**

`src/store/slices/seasonSlice.ts:644-719` の `endSeason` の戻り値を見ると、
`currentSeason: { ...state.currentSeason, ... }` ではなく、**新しいリテラル**を
組み立てている。つまりここに明示的に書かれていない項目は、旧シーズンに何が
入っていても**新シーズンでは無条件に undefined になる**。

`pruneSaveData` は「今season自チームに居た選手」を守るために `state`（旧
currentSeason を含む）を読むが、`pruneSaveData` が返す `cleanedPlayers` が乗るのは
**新しい GameState**であり、新しい `currentSeason` は上記のとおり作り直されている。

これにより、Season型が持つ「交渉・打診・チャット・通知」系のほぼ全項目
（`tradeNegotiations` / `incomingOffers` / `transferBids` / `contractRequests` /
`acquisitionOffers` / `retirementRequests` / `transferRequests` / `overseasRequests` /
`loanRequests` / `loanResponses` / `incomingLoanOffers` / `pendingSales` /
`pendingSale` / `chatLogs` / `expiredNegotiations` / `freeTransferNotices` /
`seenFreeContactIds` / `stayOrLeave` / `awayAppearances` / `eclResult` / `eclRace` /
`eclCourseId` / `trainingAssignments` / `scoutMissions` / `faVisits`）は、
**pruneSaveData が選手を消した直後に読み手ごと消える。** 中身に選手IDが入って
いても、二度と読まれないので実害が無い。

例外は3つだけ、明示的にフィルタして引き継いでいる:
- `scoutedOpponents` / `scoutedProspects`（年で絞って持ち越し）
- `events`（このシーズンで新しく作った引退・更新イベントだけ積み直す）

なので監査で本当に見るべきは「GameState 直下（シーズンをまたいで残る）」と、
上の3つの例外だけ。

### 前提2: 選手が消えても、名前解決はほぼ全部の画面で1本の安全網を通っている

`dropPlayer`（savePruning.ts:148-151）は**保護の有無に関わらず**必ず
`removedPlayers[p.id] = [名前, 国籍]` を残す。表示側は
`src/utils/playerUtils.ts` の `playerLabel(players, removedPlayers, id)` を通せば

- 生きている選手 → 本体から
- 消えた選手 → `removedPlayers` から名前・国籍
- どちらにも無い → `undefined`

が返る。実装を確認した範囲（`ChampionsHistoryPage.tsx` の区間配置・記録会
トップ10、`TeamDetailPage.tsx` の移籍履歴）はどれも `pl ? tapHandler : {}` の形で
「無ければタップ不可・名前だけ表示」にしていて、クラッシュしない。
これがファイル冒頭コメントの言う「選手詳細だけが開けなくなる」の実体。

**結論**: 「選手IDを持っているが protectedIds に無い」だけでは壊れない。
壊れるとしたら (a) 前提1の3つの例外、(b) `removedPlayers` を経由しない
読み方をしている場所、のどちらか。以下はその線で仕分けた。

---

## ① 問題なし（protectedIds で守られている）

| フィールド | 出どころ |
|---|---|
| `worldRecords` / `japanRecords`（世界記録・日本記録） | savePruning.ts:97-101 |
| `eventSeasonTops`（記録会シーズン別トップ10・**過去ぶん**） | savePruning.ts:102 |
| `Team.eventRecords`（チーム歴代記録） | savePruning.ts:103-105 |
| `SeasonAward`（MVP・新人王） | savePruning.ts:107-110（`utils/awards.ts` 経由） |
| `EclHistoryEntry`（ECL歴代優勝・MVP） | savePruning.ts:112-115（`utils/eclHistory.ts` 経由） |
| `worldRepresentatives` | savePruning.ts:116 |
| `worldSquad.playerIds` | savePruning.ts:117 |
| `worldTournament.squads` / `worldAthleticsResults[].squads`（**アジア予選・本戦の代表**） | savePruning.ts:121-126 |
| `starredOpponents` / `starredProspects` | savePruning.ts:127 |
| 自チーム在籍歴（`wasPlayerTeam`） | savePruning.ts:154。**契約更新・引退イベントの playerId はここで守られる**（イベント生成が `p.teamId === playerTeamId` にしか絞っていないため。`engine/eventEngine.ts:22`・`engine/retirement.ts:61` で確認） |
| `segmentRecords`（区間記録） | `segmentRecordsOf` の出力がそのまま protectedIds の元なので、定義上ズレない（自己無矛盾） |
| `raceNewSegmentRecords`（結果画面の「区間新！」バッジ） | 本物の新記録なら `segmentRecordsOf` にも載るので上と同じ理由で守られる |

## ② 直すべき

**無し。** クラッシュする経路は見つからなかった。

## ③ 仕様確認が要る

### ③-1. `worldAthleticsResults[].continentals[].squads`（欧州・アフリカ・アメリカ大陸予選の代表20人）が protectedIds に入っていない

**現状**: `worldAthletics.ts` のコメント（`worldAthleticsSlice.ts:104`）に
「代表20人は continentals.squads にまとめて持つ（worldRepresentativesへは
**重複保存しない**＝セーブ肥大を回避）」とある。つまり **欧州・アフリカ・
アメリカの大陸代表20人×3地域ぶんの「代表だった」という記録は、
`worldAthleticsResults[].continentals[].squads` だけにしか無い。**

savePruning.ts の該当ループ（121-126行）は

```js
for (const squads of [
    st.worldTournament?.squads,
    ...(st.worldAthleticsResults ?? []).map(r => r.squads),
  ]) { ... }
```

`r.squads`（アジア予選・本戦）は拾うが、`r.continentals?.[].squads` は拾わない。
**アジア代表・本戦代表と同じ仕組みなのに、大陸代表だけ保護が無い。**

**実際に何が起きるか（確認済み）**:
`src/utils/badges.ts:118-134` が「駅伝代表」バッジの判定にこの `squads` を読む。
読み方は「**既存の選手 `p` について、squad に `p.id` が含まれるか**」という
存在チェックであって、squad から選手を検索する向きではない。したがって
選手が消えていれば単にそのチェックが一致しなくなるだけで、**クラッシュはしない。
静かに「大陸代表だったという事実」と「駅伝代表バッジ」が消える。**

`src/components/international/NationalResultPage.tsx:76-93` の
「他地域の予選結果」表示は `advanced`（通過国の国名）だけを見せており、
20人の名簿そのものは画面に出していない（**「20人選ばれたはずが18人」は
起きない** — この画面には元から代表の頭数を数えて出す機能が無いため）。

**確認したいこと**: これは「大陸代表のバッジは消えてもよい」という割り切りで
意図的に据え置かれているのか、それとも `worldTournament.squads` と同じ扱いに
揃えるべきなのか。直すなら savePruning.ts の該当ループに
`r.kind === 'qualifier' ? r.continentals : undefined` を足すだけで済む
（実装はしていない）。

## ④ 現状維持でよい（実害の無い残骸）

これらは**「消えた選手のIDを持ったまま残る」ことはあるが、既存の選手を起点に
参照する向きでしか読まれない**（辞書を全件なめて選手を探しに行く経路が無い）ため、
無害なゴミとして残るだけで表示にもロジックにも影響しない。

| フィールド | 理由 |
|---|---|
| `foreignAppearances` / `foreignAppsC` / `awayAppearances`（出場記録） | `careerStats.ts` / `playerUtils.ts` の `foreignAppsOf` はレコードを作るだけで、既存選手側から `record[player.id]` を引く形でしか消費されない（`PlayerSheet` 等） |
| `worldAthleticsResults[].bestPlayer`（年間アジア最優秀選手） | `badges.ts:96` が `wr.bestPlayer?.playerId === p.id` という存在チェック。continentals と同じ理由で「静かに消える」だけ |
| `scoutedOpponents`（今季スカウト済みの相手選手） | `src/components/` のどこからも読まれていない（`marketSlice.ts` が自分自身の重複チェックにだけ使う内部ログ）。season 境界をまたいで持ち越されるが実質不可視 |

---

## 点検にする案（実装はしていません）

`scripts/check-offseason.ts` が既に232クラブ・5800人でオフシーズンを1回
走らせている。そこに1つ assert を足す案:

> **endSeason を1回通したあと、GameState 直下（`currentSeason` の外）に残る
> すべての `playerId` 参照が `players ∪ Object.keys(removedPlayers)` に含まれる
> ことを確認する。**

具体的には `worldRepresentatives` / `worldSquad.playerIds` /
`worldAthleticsResults[].{squads, continentals[].squads, bestPlayer.playerId}` /
`eventSeasonTops[].top[].playerId` / `Team.eventRecords[].playerId` /
`transferHistory[].playerId` / `achievements` の類を機械的に列挙して比較する。
これなら③-1のような「保護ループに1行足し忘れる」を今後も拾える
（`storeSource()` の穴を `run-checks.mjs` の取りこぼし監視が拾うのと同じ発想）。

範囲は `currentSeason` を除く（前提1のとおり、そこは意図的に毎年リセットされる
ので拾うと誤検知になる）。
