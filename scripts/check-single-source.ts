/**
 * 一本化の見張り番。**後付けが増えたらここで落とす。**
 *   npm run check
 *
 * ■なぜ要るのか
 *   「同じ判断を2か所に書く」が、このリポジトリのバグの最大の原因。
 *   実際に見つかったものだけでも
 *     ・年齢調整OVRが3か所にあり、基準の年齢が32歳と33歳で食い違っていた
 *     ・ロスター上限の数え方が2通りあり、片方は数えている物が違った
 *     ・移籍金の上限の式が3通りあり、格を見ないものが混ざっていた
 *     ・見出しの文面が82か所に直書きされ、金額の書き方がバラバラだった
 *   人が気をつけるだけでは必ず再発するので、機械が見つける。
 *
 * ■足し方
 *   新しく「唯一の決まり」を作ったら、その式・その文字列が他所に現れないことを
 *   ここに1行足す。ルールは「探す正規表現」と「居ていい場所」だけ。
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

type Rule = {
  name: string
  /** 見つけたら違反になるパターン */
  pattern: RegExp
  /** そこに在ってよいファイル（唯一の決まりの置き場所） */
  allow: string[]
  /** ここで始まるファイルだけを見る（省略すると src 全部） */
  only?: string
  /** 直し方 */
  fix: string
}

const RULES: Rule[] = [
  {
    // 「譲ります」と返した記録は選手ごとに1件（utils/saleAnswer）。
    // 以前はシーズンに1件しか無い `pendingSale` に直接書いていて、2人目に返事をすると
    // 1人目の返事が丸ごと消えた（決着せず、チャットに承諾ボタンが戻る）。
    // 置き場所が新旧2つあるので、直接読むと片方を見落とす。
    name: '売却の返事を直接読み書きしている（pendingSale）',
    pattern: /\.pendingSales?\b|pendingSaleId/,
    allow: ['src/utils/saleAnswer.ts', 'src/types/index.ts'],
    fix: 'utils/saleAnswer.ts の isSaleAnswered / saleAnswers / withSaleAnswer / keepSaleAnswers を使う',
  },
  {
    // 「この選手を対象にしていいか」に渡す材料は eligibilityCtx 1本。
    // 手書きしていたので、材料を足すたびに入れ忘れた場所だけが素通りしていた
    // （返事済みの選手がトレードの候補に残っていたのがこれ）。
    name: '移籍の可否に渡す材料を手書きしている',
    pattern: /retiringIds:\s*new Set\(/,
    allow: ['src/utils/transferEligibility.ts', 'src/utils/contractTalk.ts'],
    fix: 'utils/transferEligibility.ts の eligibilityCtx(season, teamId) を使う',
  },
  {
    // `currentSeason.races` は**自分の部の日程だけ**。ここで出場率を数えると、
    // 1部・2部のクラブの選手は1本も載らないので**必ず0**になる。
    // 出場率0は transferDecision の「今のクラブで干されている」(+0.2)を全員に付けるので、
    // 1部の主力が3部のクラブへの移籍に同意してしまう（実際にそうなっていた）。
    // 分母も `currentRaceIndex`（自分の部の消化数）で、部ごとにレース数が違う。
    name: '出場率を自分の部の日程だけで数えている',
    pattern: /seasonAppearances\([^)]*(currentSeason\.races|currentRaceIndex)|seasonAppearances\(\w+,\s*races\)\s*\/\s*raceIndex/,
    allow: ['src/utils/playRate.ts'],
    fix: 'utils/playRate.ts の playRateOf を使う（そのクラブが走っている日程で数える）',
  },
  {
    // 通し順位（1〜52）は**格を決めるためだけの内部の数**。画面に出すと
    // 「47位」「52位」のような、遊ぶ側にとって意味の無い数になる。
    // あるのは1部・2部・3部それぞれの中での順位だけ（utils/clubStanding の clubSeasonRank）。
    name: '通し順位（1〜52）を画面に出している',
    pattern: /domesticThroughRank/,
    allow: ['src/utils/league.ts', 'src/utils/clubTier.ts', 'src/store/gameStore.ts', 'src/store/bootRepair.ts', 'src/utils/cardCombo.ts'],
    only: 'src/components/',
    fix: 'utils/clubStanding.ts の clubSeasonRank（部内順位＋部）を使う。通し順位は格の計算だけ',
  },
  {
    name: 'ニュースの見出しの直書き',
    pattern: /headline:\s*[`']/,
    allow: ['src/utils/newsItems.ts'],
    fix: 'utils/newsItems.ts に関数を足して、呼ぶ側は出来事のデータだけ渡す',
  },
  {
    name: '年齢調整OVRの写し',
    pattern: /age\s*-\s*3[0-9]\)?\s*\*\s*3/,
    allow: ['src/utils/foreignClubProfile.ts'],
    fix: 'foreignClubProfile.ts の effectiveOvr を使う',
  },
  {
    name: 'ロスター上限の数え直し',
    pattern: /ROSTER_MAX\s*-\s*\(/,
    allow: ['src/data/rosterRules.ts'],
    fix: 'rosterRules.ts の rosterCapOf を使う',
  },
  {
    name: '「そのクラブで何番手か」の数え直し',
    pattern: /filter\(\s*\w+\s*=>\s*ovr\(\w+\)\s*>\s*(ovr\(|my)/,
    allow: ['src/utils/squadNeeds.ts'],
    fix: 'squadNeeds.ts の squadRankOf を使う',
  },
  {
    name: '移籍金の上限の式',
    pattern: /TRANSFER_BUDGET_SHARE\s*\)|\*\s*TRANSFER_BUDGET_SHARE/,
    allow: ['src/data/economy.ts'],
    fix: 'economy.ts の transferCapOf を使う',
  },
  {
    name: '走れる人数の直書き',
    pattern: /RUNNING_SLOTS\s*=\s*\d/,
    allow: ['src/data/rosterRules.ts'],
    fix: 'rosterRules.ts の RUNNING_SLOTS を import する',
  },
  {
    // 「4大リーグ」は廃止した。リーグは動かないがクラブの格は毎年動くので、
    // リーグのIDでは「世界最高峰か」を言えない（格3の欧州北東が最高峰でなく、
    // 格9まで落ちた北南アフリカが最高峰のまま、という逆転が起きる）。
    name: '4大リーグのIDの直書き（廃止済み）',
    pattern: /ELITE_LEAGUE_IDS|isEliteLeague|ELITE_LEAGUES_BY_REGION|'africa_east'\s*,\s*'africa_ns'/,
    allow: [],
    fix: '世界最高峰は clubTier の isBigClub（格2以上）、格上かは isStepUp、憧れの行き先は transferDecision の leaguesOfRegion',
  },
  {
    // 「憧れの地域 ↔ リーグ」の対応は1つの表から両方向を引く。
    // 以前は「満たしたか」と「声が掛かるか」で別々の表を持っていて、
    // 南米へ移れば憧れが満たされるのに、海外挑戦に登録しても南米からは来なかった。
    name: '憧れの地域とリーグの対応表の写し',
    pattern: /'(north_america|south_america|central_america)'\s*(,|\])/,
    allow: ['src/utils/transferDecision.ts', 'src/data/foreignLeagues.ts'],
    fix: 'transferDecision.ts の regionOfLeague / leaguesOfRegion を使う（表は REGION_BY_LEAGUE 1本）',
  },
  {
    // 地域の呼び名が3か所にあり、america だけ「北米」と「北米・南米」に割れていた
    // （chatLines.ts と ChatPage.tsx は同じ表の丸写し）。同じ選手の希望が画面で別名になる。
    name: '憧れの地域の呼び名の写し',
    pattern: /africa:\s*'アフリカ'\s*,\s*europe:/,
    allow: ['src/utils/transferDecision.ts'],
    fix: 'transferDecision.ts の DREAM_LABEL / dreamLabelOf を使う',
  },
  {
    name: '海外クラブの総なめ',
    pattern: /flatMap\(\s*l\s*=>\s*l\.clubs\s*\)/,
    allow: ['src/utils/clubs.ts'],
    fix: 'clubs.ts の allForeignClubs を使う',
  },
  {
    name: '順位表の並べ直し',
    // 変数名は何でも通す。a2/b2 と書いた1件が素通りしていた
    pattern: /sort\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*\2\.totalPoints\s*-\s*\1\.totalPoints\s*\)/,
    allow: ['src/utils/league.ts'],
    fix: 'league.ts の rankedStandings / rankOfTeam を使う',
  },
  {
    name: '画面の中の自前シート（実機で下タブに食われる）',
    pattern: /position:\s*'fixed'[^}]*bottom:\s*0/,
    allow: ['src/components/ui/BottomSheet.tsx', 'src/components/ui/ActionSheet.tsx', 'src/components/layout/Layout.tsx'],
    fix: 'components/ui/BottomSheet を通す（createPortal で body に出す）',
  },
  {
    name: '人数上限の直書き（30）',
    pattern: /(roster|Roster)\w*\.length\s*[<>]=?\s*30\b/,
    allow: ['src/data/rosterRules.ts'],
    fix: 'rosterRules.ts の ROSTER_MAX を使う',
  },
]

// 「あと何レース」を currentRaceIndex で数えないこと。
// ECLと記録会を走ってもそこは増えないので、時間が止まる（打診の期限が減らない・ケガが治らない）。
RULES.push({
  name: '期限・回復を currentRaceIndex で数えている',
  pattern: /(expiresAtRace|injuredUntilRace)[^\n]*currentRaceIndex|currentRaceIndex[^\n]*(expiresAtRace|injuredUntilRace)/,
  allow: ['src/store/gameStore.ts', 'src/store/slices/marketSlice.ts', 'src/store/slices/raceSlice.ts'],   // 書く側の移設先
  fix: 'playerUtils の racesConsumed（ECL・記録会も1本）で数える',
})

// 「このシーズンは記録を全部残してある年か」を、呼ぶ側で自分で判定しないこと。
// 年で分けたりフィールドの有無で分けたりすると、通算出走数が経路によって食い違う。
RULES.push({
  name: '記録の有無の判定を自分で書いている',
  pattern: /recordsFull\s*(===|!==|\?\?|&&|\|\|)|\.recordsFull\b(?!\s*=[^=])/,
  allow: ['src/utils/raceRecord.ts', 'src/types/index.ts'],
  fix: 'raceRecord.ts の seasonHasFullRecords を使う',
})

// 順位表は部ごとに分けて持っている（Season.standings）。1本に戻さないこと。
// 部が違えばレース数が違う（10/8/7戦）ので、勝ち点を部をまたいで比べることに意味が無い。
// 型でほぼ防げるが、平らにしてしまえば通ってしまうのでここでも見る。
RULES.push({
  name: '部ごとの順位表を平らにしている',
  pattern: /Object\.values\([^)]*[Ss]tandings\s*\)|DIVISIONS\.flatMap\([^)]*standings/,
  allow: ['src/utils/league.ts', 'scripts/check-division-rank.ts'],
  fix: 'league.ts の divisionStandings / seasonDivisionStandings で部ごとに取り出す',
})

// 相手のロスターと殿堂入りは同じ行（rosters）に入っている。
// 別々に読みに行くと、読める相手の条件（フレンド／同じ走友会）が経路ごとにズレる。
RULES.push({
  name: 'rosters を直接読み書きしている',
  pattern: /from\(\s*'rosters'\s*\)/,
  allow: ['src/lib/friendsApi.ts'],
  fix: 'friendsApi.ts の getFriendShare / pushMyRoster を通す（supabase/hof_share.sql）',
})

// 裏の部と海外の走行記録は残すようになった（Season.divisionRaces / foreignRaces）。
// ただし**走行記録を残していなかった年**を読むために、古い集計は消せない。
// 消すと、いま遊んでいるデータの過去シーズンで1部・2部・海外の選手が全員「0回出走」になり、
// 実績倍率が下がって年俸と移籍金まで動く。
//
// なので「古い集計を使ってよいのは careerStats の中だけ」を見張る。
// 新しく別の場所で出走数を数え始めたら、そこだけ古い年と新しい年で答えが食い違う。
RULES.push({
  name: '走行記録の別集計を careerStats の外で使っている',
  pattern: /awayAppearances|foreignAppearances|foreignAppsC|foreignAppsOf/,
  allow: [
    'src/utils/careerStats.ts',   // 古い年だけここで使う（分岐は addSeason 1か所）
    'src/utils/playerUtils.ts',   // foreignAppsOf の実体（旧形式と圧縮版の吸収）
    'src/utils/archiveSeason.ts', // 過去シーズンへ書き出すときの詰め替え
    'src/types/index.ts',
    'src/store/gameStore.ts',     // 走らせた年にためる側（読む側ではない）
    'src/utils/retiredTeamBackfill.ts',  // 型が付いていない生データの形を書いているだけ
    'src/store/slices/competitionSlice.ts',   // 書く側（海外リーグ進行の移設先）
    'src/store/slices/raceSlice.ts',   // 書く側（runRaceの移設先）
    'src/store/slices/seasonSlice.ts',   // 書く側（endSeasonの移設先）
    'src/engine/seasonArchivePrep.ts',   // 書く側（保存用の詰め替え。archiveSeason.ts と同じ立場）
  ],
  fix: 'utils/careerStats.ts の buildCareerCounts を通す（走行記録がある年はそこから数える）',
})

// 裏で走るレースは engine/backgroundRace の1本を通す。
//
// プレイヤーが見ていないレースを走らせる場所が4つあり（裏の部・海外リーグ・ECL・世界選手権）、
// 「区間に走者を並べる → simulateRace → 得点と通算成績を数える」を4回書いていた。
// 並べ方だけが3通りに分かれ、海外リーグだけ空区間を埋めていなかった。
// 空区間があると「再生では総合タイムが少なく＝1位、結果画面では最下位」という食い違いが起きる。
// 新しい大会（大陸予選など）を足すたびに同じことが起きるので、入口を1本に固定する。
RULES.push({
  name: '裏レースを自分で組み立てている（simulateRace の直接呼び出し）',
  pattern: /simulateRace\(/,
  allow: [
    'src/engine/backgroundRace.ts',  // 唯一の入口
    'src/engine/raceEngine.ts',      // 実体
    'src/store/gameStore.ts',        // 自チームの本編レース（監督が配置を組む。裏レースではない）
    'src/lib/matchSim.ts',           // オンライン対戦（相手のロスターが手元に無いので別経路）
    'src/store/slices/raceSlice.ts',   // 書く側（runRaceの移設先）
  ],
  fix: 'engine/backgroundRace.ts の runBackgroundRace を呼ぶ（並べ方も数え方もそこ）',
})

// 世界大会の走行記録は置き場所が2つある（新: Season.waRaces / 旧: worldAthleticsResults[].races）。
// 読む側が新しいほうだけを見ると、いま遊んでいるセーブの過去の大会が丸ごと消える。
// 取り出しは utils/waRaces の waRaceRows 1本を通すこと。
RULES.push({
  name: '世界大会の走行記録を直接読んでいる',
  pattern: /\.waRaces/,
  allow: [
    'src/utils/waRaces.ts',          // 唯一の取り出し口（新旧どちらも吸収する）
    'src/store/gameStore.ts',        // 書く側
    'src/store/slices/worldAthleticsSlice.ts',  // 書く側（世界選手権スライス）
    'src/store/persistence/migrateSave.ts',  // 旧セーブの移行（v37の詰め替え）
    'src/store/seasonArchive.ts',    // 別ファイルへの書き出し・読み戻し
    'src/utils/archiveSeason.ts',    // 過去シーズンへの詰め替え
    'src/types/index.ts',
  ],
  fix: 'utils/waRaces.ts の waRaceRows を使う（本戦・アジア予選・大陸予選が年と大会名つきで返る）',
})

// コースの中身は25本しかないが、呼び名は地域ごとに持つ（data/courseNames.ts）。
// 国内の名前をそのまま国外のレースに使うと「ケニアのクラブが出雲開幕戦を走る」
// 「アメリカ予選 大阪カップ」になる。名前を直接書かず courseNameFor / localizeRace を通すこと。
RULES.push({
  name: '国内のコース名を直に書いている',
  pattern: /['"`](出雲開幕戦|富士山岳駅伝|大阪カップ|JPELグランドファイナル)/,
  allow: [
    'src/data/races.ts',        // コースの実体
    'src/data/courseNames.ts',  // 地域ごとの呼び名の対応表
    'src/utils/newsItems.ts',   // ゲーム開始時のニュース（国内の話なので国内の名前でよい）
  ],
  fix: 'data/courseNames.ts の courseNameFor / localizeRace を通す',
})

// 走行記録の置き場所はシーズンの中に7つある（自分の部・他の部・大学・2軍・ECL・海外リーグ・世界大会）。
// 画面が1つずつ拾っていたので、足し忘れたぶんはそのまま表示から消えていた
// （海外リーグの出走が選手ページに1件も出ていなかった）。取り出しは utils/raceHistory 1本。
RULES.push({
  name: '走行記録の置き場所を画面から直接読んでいる',
  pattern: /\.(divisionRaces|foreignRaces)/,
  allow: [
    'src/utils/raceHistory.ts',    // 唯一の取り出し口
    'src/utils/careerStats.ts',    // 通算成績の数え直し
    'src/utils/playerUtils.ts',    // 海外の在籍履歴（圧縮版の吸収）
    'src/utils/archiveSeason.ts',  // 過去シーズンへの詰め替え
    'src/store/seasonArchive.ts',  // 別ファイルへの書き出し・読み戻し
    'src/store/gameStore.ts',      // ためる側
    'src/engine/domesticLeague.ts',
    'src/engine/foreignLeague.ts',
    // 区間記録と年度表彰は「どの部の走りか」を自分で分ける側なので、生の日程を直接読む。
    // 記録は部をまたいで1本（同じコースの最速）、表彰は部ごと（1部MVP・2部MVP・3部MVP）。
    'src/utils/segmentRecords.ts',
    'src/utils/awards.ts',
    'src/store/bootRepair.ts',      // 過去シーズンの部を日程から直す側
    'src/utils/playRate.ts',        // 「そのクラブが走っている日程」を引く側
    'src/store/slices/competitionSlice.ts',   // 書く側（海外リーグ進行の移設先）
    'src/store/slices/raceSlice.ts',   // 書く側（runRaceの移設先）
    'src/store/slices/seasonSlice.ts',   // 書く側（endSeasonの移設先）
  ],
  fix: 'utils/raceHistory.ts の ranRaces を使う（リーグ名つきで全部返る）',
})

// チャットのログは2つの経路で積まれる（ボタンでその場で足す／次に開いて作り直す）。
// 同じ用件を両方が別の文で書くと、重複を潰す仕組み（kind で突き合わせる）を素通りして
// 同じ礼が2回並ぶ。承諾したあとの本人の返事は utils/chatLines の1本から取ること。
RULES.push({
  name: '承諾後の返事を画面に直書きしている',
  pattern: /海外挑戦を認めていただき|今季限りで引退します/,
  allow: ['src/utils/chatLines.ts'],
  fix: 'utils/chatLines.ts の overseasApprovedLine / retireApprovedLine を使う',
})

// 施設のレベルは「自分で建てたぶん」か「格から出す」かの2択で、判定は utils/facilities の1本。
// 以前は自チーム・国内CPU・海外クラブで3通りあり、海外はクラブIDのハッシュから作った
// 飾り（保存も成長もせず、何にも効かない）だった。画面には Lv4 と出るのに中身が無かった。
RULES.push({
  name: '施設のレベルを自分で組み立てている',
  pattern: /trainingCamp:\s*\w/,
  allow: [
    'src/utils/facilities.ts',   // 唯一の決まり
    'src/types/index.ts',
  ],
  fix: 'utils/facilities.ts の facilitiesOf を使う（自分で建てたぶんが無ければ格から出る）',
})

// 期間限定イベントの数字を画面に直書きしないこと。
// 合成の大成功確率(5%)が CardTrainingPage の中に埋まっていて外から触れなかった。
// 期間も中身も data/events.ts に集めて、画面は「いまの値」を聞くだけにする。
RULES.push({
  name: 'イベントの数字を画面に直書きしている',
  pattern: /Math\.random\(\)\s*<\s*0\.05/,
  allow: ['src/data/events.ts'],
  fix: 'data/events.ts の greatSuccessChance() を呼ぶ（イベント中は自動で100%になる）',
})

// クラブの型は1つ（Team = ForeignClub）。海外だけの入れ物・海外だけの決まりを作らないこと。
//
// もとは Team(20項目) と ForeignClub(7項目) に割れていて、海外に無い項目を必要とする
// ルールは共通の関数を呼べず、その場で海外用の偽物を作るしかなかった。
//   予算 → リーグ別 × 順位 × IDのハッシュ／施設 → IDのハッシュ／創設年・監督名 → IDのハッシュ
// 同じ種類のバグが何度も出た原因がこれ。**新しく foreignClub◯◯ を生やさない。**
// 見張るのは「クラブの中身を海外だけ別に作る」もの（予算・施設・都市・創設年・監督名・格）。
// foreignClubIdSet / foreignClubsOf のような**引き場所**は海外リーグという入れ物を辿るだけで、
// クラブの中身を作っていないので対象外。
RULES.push({
  name: '海外クラブの中身を海外だけ別に作っている',
  pattern: /export function foreignClub(Budget|Facilit|City|Founded|Gm|Tier|Salary|Rank|Finance|Sponsor)/,
  allow: [],
  fix: 'utils/clubs.ts に「クラブなら誰でも通る」形で置く（clubCity / clubFounded / clubGmName と同じ）',
})

// 「本人が行く気になるか」を、行き先の姿ぬきで判定していないか。
//
// playerConsentToMove は以前 buildDestination(..., [], {}) ＝ 空のロスター・空の条件で
// 行き先を作っていた。序列・優勝・ECL・憧れの地域・成長上限が全部抜けた答えになるので、
// 入札画面の「意欲」表示と本人の実際の答えが 40.4% 食い違っていた。
// 行き先は必ず store の destinationOf から取ること。
RULES.push({
  name: '空のロスターから行き先を作っている（判定が行き先を見なくなる）',
  pattern: /buildDestination\([^;\n]*?\[\s*\]/,
  allow: ['src/utils/transferDecision.ts'],
  fix: 'store の destinationOf(clubId, player) を使う。格だけで判定しない',
})

// 人数の決まりは data/rosterRules 1本。エンジンや画面に別の数字を置かない。
RULES.push({
  name: 'ロスター人数の数字を直書きしている',
  pattern: /(length\s*[<>=]+\s*30\b|slice\(30\)|ROSTER_MIN\s*=\s*\d|_ROSTER_MIN\s*=)/,
  allow: ['src/data/rosterRules.ts'],
  fix: 'ROSTER_MAX / ROSTER_MIN / CPU_SELL_FLOOR（data/rosterRules.ts）を使う',
})

// 金額の書き方は utils/money の fmtYen 1本。桁を自分で割らない。
RULES.push({
  name: '金額を自分で「億」に直している',
  pattern: /\/\s*100[_0]{6,}\s*\)?\s*\.toFixed/,
  allow: ['src/utils/money.ts'],
  fix: 'utils/money.ts の fmtYen を使う',
})

// 選手の名前の横に出る札は components/player/PlayerChips.tsx 1本で描く。
//
// タイプの札を画面ごとに手書きしていて、同じ札のはずなのに実測で8通りあった
// （角の丸み 4/5/6/7/10、背景の濃さ 0.08〜0.15、枠線あり／なし）。
// 「外」の札も3通りの青（C.blue / #7986CB / #6B7BE8）で、文字まで「外」と「海外」に割れていた。
RULES.push({
  name: '選手の札（タイプ・外国人）を自前で描いている',
  pattern: /SPECIALTY_LABELS\[[^\]]*\][^\n]*(backgroundColor|background):|(backgroundColor|background):[^\n]*SPECIALTY_LABELS\[|>外<\/span>|>海外<\/span>/,
  allow: ['src/components/player/PlayerChips.tsx'],
  fix: 'components/player/PlayerChips.tsx の SpecChip / ForeignChip を使う',
})

// 得点・フォント・コース種別を画面や別のエンジンで作り直さないこと。
RULES.push({
  name: 'レースの得点を自前で書いている',
  pattern: /rank === 1 \? 3 : rank === 2 \? 2 : rank === 3 \? 1|teamCount\s*[-+]\s*rank\s*[+-]\s*1/,
  allow: ['src/utils/league.ts'],
  fix: 'utils/league.ts の positionPointsFor / segmentAwardPoints を使う',
})
RULES.push({
  name: 'フォントの文字列を直書きしている',
  pattern: /['"]'?Saira Condensed'?|['"]'?Zen Kaku Gothic New'?/,
  allow: ['src/styles/tokens.ts', 'index.html'],
  fix: 'styles/tokens.ts の SAIRA / FONT / JP を import する',
})
RULES.push({
  name: 'コースの種別を自前で判定している',
  pattern: /uphillPct \* \w+\.distanceKm/,
  allow: ['src/data/races.ts'],
  fix: 'data/races.ts の courseTypeOf を使う',
})
RULES.push({
  name: '成長に必要なEXPの式を写している',
  pattern: /0\.5 \* level \* level|level < 80 \? 1 : level < 90 \? 2 : 4/,
  allow: ['src/engine/growth.ts'],
  fix: 'engine/growth.ts の requiredExpForLevel を import する',
})

// クラブ側に名簿（roster）を持たせないこと。在籍は player.teamId 1本。
// 写しがある限り「片方だけ更新して食い違う」が起き続ける（片落ちトレードが実際に起きた）。
RULES.push({
  name: 'クラブ側に名簿を持たせている',
  pattern: /roster:\s*\{\s*main|\.roster\.main|\.roster\?\.main|rebuildRosters/,
  allow: ['src/utils/rosterSync.ts', 'src/store/gameStore.ts'],
  fix: 'utils/rosterSync の squadIdsOf / squadPlayersOf で player.teamId から引く',
})

// 格の配り方（帯の中でどう散らすか）を clubTier.ts の外に持たないこと。
// 初期値を作るスクリプトだけが配り方を持っていて、実行時が知らなかったため、
// アジアと中米・カリブの40クラブが1シーズンで別の分布へ塗り替わっていた。
RULES.push({
  name: '格の配り方を clubTier.ts の外に書いている',
  pattern: /Math\.pow\([^)]*,\s*0\.7\)/,
  allow: ['src/utils/clubTier.ts'],
  fix: 'clubTier.ts の tierInBand を使う（帯と配り方は FOREIGN_TIER_BAND 1本）',
})

// クラブの強さは**クラブごとの格**が唯一の物差し。国やリーグの表で判断しないこと。
//
// 「そのクラブが相手にする選手のOVRの下限」を国の表（ETH/KEN 85・USA 80・KOR/CHN 70）と
// リーグの表（4大84・その他74）で持っていた。格とは別の物差しが2本立っている状態で、
// 同じ格3〜9のクラブが74と84に割れ、しかも格は毎年動くのに国もリーグも動かないので、
// 格2から格9まで落ちたクラブがいつまでも「OVR84以上しか獲らない」ままだった。
//
// 獲るかどうかは「必要か」と「そのクラブで走れるか」だけ（utils/squadNeeds）。
// 格1のクラブは名簿が強いので、弱い選手はそこでは序列の下に沈んで自動的に外れる。
RULES.push({
  name: 'クラブの強さを国やリーグの表で判断している',
  pattern: /(ETH|KEN|UGA|TAN):\s*\d{2}|STRONG_COUNTRIES/,
  allow: [
    'src/data/nationalities.ts',
    // 国ごとの「選手の数」（勢力図）。強さはここでは決めていない（そのファイルにも明記）。
    // クラブの強さの話ではないので対象外
    'src/data/nationTalent.ts',
  ],
  fix: '格（utils/clubTier）か、必要かどうか（utils/squadNeeds の needsPlayer / wouldMakeLineup）で判断する',
})

// 「その移籍はどれだけ大きいか」の線を格の数字で直書きしないこと。
// 同じ問いに3つの物差しがあった：4大リーグのID（自チームの見出しと実績）／
// 格1〜4（裏で動いた日本→海外の見出し）／格1（ニュースの大扱い）。
// いまは絶対＝isBigClub（格2以上）、相対＝isStepUp（行き先の格 < 今のクラブの格）の2本だけ。
RULES.push({
  name: '移籍の大きさを格の数字で直書きしている',
  pattern: /tierOf\([^)]*\)\s*(===|<=|<)\s*(1|2|BIG_CLUB_TIER|DOMESTIC_TOP_TIER)\b/,
  allow: ['src/utils/clubTier.ts', 'scripts/'],
  fix: 'clubTier の isBigClub（格2以上）／ isStepUp（行き先の格 < 今のクラブの格）を使う',
})

// 端末に置くものは store/appStorage.ts の登録表に載せる。
// 置き場所が11か所に散っていて、「データ削除で何を消すか」が resetGame の中に
// 手書きで並んでいた。書き足し忘れると消えずに残る（もらったカードの箱が実際そうだった）。
RULES.push({
  name: 'localStorage を登録表の外で直接使っている',
  pattern: /localStorage\.(setItem|removeItem)\(/,
  allow: [
    'src/store/appStorage.ts',   // 登録表そのもの
    'src/store/saveStorage.ts',  // セーブ本体（ネイティブはファイル。ここが唯一の入口）
    'src/store/saveSlot.ts',     // どのスロットか（セーブを読む前に要るので例外）
    'src/store/deviceFlags.ts',  // 端末のもの（登録表に載せてある）
    'src/lib/durableId.ts',      // フレンド用の証明書（登録表に載せてある）
    'src/lib/supabase.ts',       // 身元を消した印（登録表に載せてある）
    'src/lib/giftInbox.ts',      // もらったカードの箱（登録表に載せてある）
    'src/lib/useFriendSync.ts',  // 送信済みの指紋（登録表に載せてある）
    'src/utils/termsConsent.ts', // 規約への同意（登録表に載せてある）
    'src/utils/audio.ts',        // 音量（登録表に載せてある）
    'src/components/more/MorePage.tsx', // 音量の設定画面
  ],
  fix: 'store/appStorage.ts の登録表にキーと寿命を足す（データ削除で消すかどうかが決まる）',
})

// セーブ形式の版は1本。version: NN と、更新画面を出す判定の両方に同じ数字を書かない。
RULES.push({
  name: 'セーブ形式の版の直書き',
  pattern: /version:\s*\d\d\s*,/,
  allow: ['src/store/gameStore.ts'],   // SAVE_VERSION の定義とその使用のみ
  fix: 'gameStore.ts の SAVE_VERSION を使う',
})

const SKIP_DIRS = new Set(['node_modules', 'dist', 'ios', '.git', 'public'])

// ── 今回の一本化ぶん ───────────────────────────────────────────
// 文字列ハッシュ・引退年齢・契約更新の要求額・ランクの並べ方・士気と疲労の上下限。
// どれも「まったく同じ式が2か所以上」で見つかったもの。
RULES.push({
  name: '文字列ハッシュの写し',
  pattern: /charCodeAt\(\w+\)\s*\)\s*(>>>|\|)\s*0/,
  allow: ['src/utils/hash.ts'],
  fix: 'utils/hash.ts の strHash を使う',
})
RULES.push({
  name: '引退年齢の式の写し',
  pattern: /32\s*\+\s*\([^)]*%\s*7\)/,
  allow: ['src/utils/playerUtils.ts'],
  fix: 'playerUtils.ts の retirementAgeOf を使う',
})
RULES.push({
  name: '契約更新の要求額の式の写し',
  pattern: /demandSalary\s*\*[^\n]*0\.03|round\s*-\s*1\)\s*\*\s*0\.03/,
  allow: ['src/utils/contractTalk.ts'],
  fix: 'contractTalk.ts の effectiveDemandSalary を使う',
})
RULES.push({
  name: 'ランク構成のスロット展開の写し',
  pattern: /Object\.entries\(comp\)/,
  allow: ['src/utils/clubTier.ts'],
  fix: 'clubTier.ts の tierRankSlots を使う',
})
RULES.push({
  name: '士気・疲労の上下限の直書き',
  pattern: /(morale|fatigue):\s*Math\.(min|max)\(/,
  allow: ['src/utils/condition.ts'],
  fix: 'utils/condition.ts の withMorale / withFatigue を使う',
})

RULES.push({
  name: '画面下に貼り付けるものの位置の手計算',
  pattern: /px \+ env\(safe-area-inset-bottom\)\)`/,
  allow: ['src/styles/tokens.ts'],
  fix: 'styles/tokens.ts の bottomStack(adH, { aboveNav, extra }) を使う',
})
RULES.push({
  name: '下タブの高さ(58)の直書き',
  pattern: /\b58\b\s*\+\s*adH|adH\s*\+\s*58\b|NAV_H\s*=\s*\d/,
  allow: ['src/styles/tokens.ts'],
  fix: 'styles/tokens.ts の NAV_H を import する（bottomStack の aboveNav でもよい）',
})

// クラブの「強さ・規模」は格1本。平均OVRから elite/mid/weak を作る第2の物差しを戻さない。
RULES.push({
  name: 'クラブの規模を格以外で決めている',
  pattern: /'elite'|'mid'\s*[:?)]|=== *'weak'|avg[Oo]vr\s*>=\s*\d+\s*\?\s*\d/,
  allow: [],
  fix: 'clubTier.ts の tierOf / tierStrength を使う（格1本）',
})
RULES.push({
  name: 'クラブ同士の強弱を平均OVRで比べている',
  pattern: /clubAvg|avgOvr\[[^\]]+\]\s*[<>]/,
  allow: [],
  fix: '格で比べる（tierOf）。平均OVRは循環するので使わない',
})
RULES.push({
  name: 'トレードの釣り合いの直書き',
  pattern: /calcTransferValue\([^)]*\)\s*<=?\s*\w+\s*\*\s*1\.3|TRADE_MAX_RATIO\s*=\s*\d/,
  allow: ['src/utils/tradeValue.ts'],
  fix: 'utils/tradeValue.ts の tradeBalance を使う',
})

// ★セーブの置き場所の一覧。**ここが割れるとデータが消える。**
//   同じ一覧が読み込み・復旧・削除・空き判定の4か所に手書きされていて、全部が食い違っていた。
//   読み込みは版ごとの退避を見ておらず、空き判定は世代バックアップを見ていない。
//   その結果「端末にデータが残っているのに新規ゲーム画面が出る」「世代しか残っていない
//   スロットが空きに見える」という、そのまま上書きにつながる穴が空いていた。
// ★代表候補の出どころ。**ここが割れると「選考できない」が起きる。**
//   以前は選考画面（持ちタイム40＋適性10の50人）・CPUの自動選抜（20人）・国力（上位7人）で
//   出どころが3通りあり、しかも全部が「持ちタイムが無い選手は候補外」だった。
//   記録会に出られる回数は所属で違うので、海外組が落ち、国単位では国力0＝予選の出場国から消えた。
RULES.push({
  name: '代表候補を ekidenCandidates 以外から作っている',
  pattern: /ekidenCandidatesWithFit/,
  allow: [],
  fix: 'engine/worldAthletics.ts の ekidenCandidates（OVR上位100人）1本を使う',
})
RULES.push({
  name: '予選の出場国を自前で組み立てている',
  pattern: /natGeoRegion\([^)]*\)\s*===\s*'(アジア|オセアニア)'/,
  allow: ['src/engine/worldAthletics.ts'],
  fix: 'engine/worldAthletics.ts の qualifierNations を使う（自国が必ず入る）',
})
// ★世界選手権の日程。生きている経路は waRaceDate / WA_CLOSING_DATE だが、
//   呼び出し元の無い関数の中に 2/15・2/10 を直書きした2つ目の日程が残っていた。
RULES.push({
  name: '世界選手権の日付の直書き',
  // 大会の3戦（1/9・1/16・1/23）と閉幕（1/24）、および旧・死にコードの日付（2/10・2/15）。
  // 他の用途の日付（移籍の 1/20、シーズン中の 2/1 など）を巻き込まないよう、この6つだけを見る
  pattern: /-01-(09|16|23|24)\b|-02-(10|15)\b/,
  allow: ['src/engine/worldAthletics.ts'],
  fix: 'engine/worldAthletics.ts の waRaceDate / WA_CLOSING_DATE を使う',
})

RULES.push({
  name: 'セーブファイルの名前の組み立て',
  pattern: /`jpel-manager-save\$\{[^`]*\}\.(json|tmp|bak|v)/,
  allow: ['src/store/saveStorage.ts'],
  fix: 'store/saveStorage.ts の collectSaveSources / describeSave を通す（名前を自分で組み立てない）',
})

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(e)) out.push(full)
  }
  return out
}

const files = walk('src')
let violations = 0

for (const rule of RULES) {
  const hits: string[] = []
  for (const f of files) {
    if (rule.only && !f.startsWith(rule.only)) continue
    if (rule.allow.some(a => f === a || f.endsWith(a))) continue
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      // コメント行は対象外（説明文に式が出てくるのは構わない）
      const t = line.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      if (rule.pattern.test(line)) hits.push(`  ${f}:${i + 1}  ${t.slice(0, 100)}`)
    })
  }
  if (hits.length > 0) {
    violations += hits.length
    console.log(`\n✗ ${rule.name}（${hits.length}件）`)
    console.log(`  → ${rule.fix}`)
    console.log(hits.join('\n'))
  }
}

if (violations === 0) {
  console.log(`一本化の点検：${RULES.length}件のルール、違反なし`)
  process.exit(0)
}
console.log(`\n一本化の点検：合計 ${violations} 件の後付けが見つかりました`)
process.exit(1)
