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
    pattern: /sort\(\s*\(a,\s*b\)\s*=>\s*b\.totalPoints\s*-\s*a\.totalPoints\s*\)/,
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

// ★走行記録の一本化が終わったら、この見張りを有効にすること（いまは40か所が該当）。
//   裏の部と海外だけ結果を捨てて出走数の集計に置き換えているのが、
//   「1部が試合されていない」「海外クラブを引き継ぐと過去が無い」の原因。
//   utils/raceRecord.ts に寄せ切ったあと、下のコメントを外す。
// RULES.push({
//   name: '走行記録の別集計（結果を捨てている印）',
//   pattern: /awayAppearances|foreignAppearances|foreignAppsC/,
//   allow: ['src/utils/raceRecord.ts'],
//   fix: 'utils/raceRecord.ts の packRace で結果ごと保存する（出走数は careerStats が数え直す）',
// })

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
