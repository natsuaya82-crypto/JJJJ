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
  /** 直し方 */
  fix: string
}

const RULES: Rule[] = [
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
    name: '4大リーグのIDの直書き',
    pattern: /'africa_east'\s*,\s*'africa_ns'/,
    allow: ['src/utils/clubs.ts'],
    fix: 'clubs.ts の ELITE_LEAGUE_IDS / isEliteLeague を使う',
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
  allow: ['src/store/gameStore.ts'],
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
    'src/store/gameStore.ts',        // 書く側と旧セーブの移行
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

const SKIP_DIRS = new Set(['node_modules', 'dist', 'ios', '.git', 'public'])

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
