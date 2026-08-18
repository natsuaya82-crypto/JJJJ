/**
 * 【他人の名前が出るところには、必ず段位の紋章を出す】
 *
 * ■オーナーの指示
 *   「フレンドから見えるところ全部だよ。ゴールド（俺が送った絵）がつく。何も出さない。」
 *                                                        （2026-08-14）
 *   「全部です」（2026-08-18・オンライン対戦の結果と履歴も入れるか、の問いに）
 *
 * ■なぜ点検が要るのか
 *   紋章は**画面を1つ作るたびに付け忘れる**類のもので、付け忘れても何も壊れません
 *   （出ないだけ）。実際 2026-08-18 の監査で、フレンド関係の6画面には付いているのに
 *   **オンライン対戦の結果（`FinishPanel`）と対戦履歴（`MatchHistoryPage`）だけ
 *   抜けて**いました。どちらも相手のGM名が出る画面です。
 *
 * ■見方
 *   **他人の名前を出している画面を実際に数えます**（`gmName` を出している .tsx）。
 *   自分のことしか出さない画面は対象外なので、**理由を書いて `MINE_ONLY` に入れる**
 *   （「漏れた」と「あえて」を区別するため。`check-sticky-tab` と同じ形）。
 *
 * ★引くのは `useRatedRanks` 1本（一覧ぶんまとめて1回）。1行ずつ引くと、
 *   20人の一覧で20回通信が飛びます。
 */
import { readFileSync, readdirSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

/** 自分のことしか出さない画面（他人の名前が並ばないので紋章は要らない） */
const MINE_ONLY: Record<string, string> = {
  'src/components/dashboard/HeroCard.tsx': 'ホームの自チームの札。出るのは自分のGM名だけ',
  'src/components/more/MorePage.tsx': '設定。自分のGM名の変更',
  'src/components/onboarding/Onboarding.tsx': '最初にGM名を決める画面。まだ誰とも繋がっていない',
  'src/components/team/TeamHub.tsx': '自チームのハブ。自分のGM名',
  'src/components/team/TeamManagement.tsx': '自チームの名簿。自分のGM名',
  'src/components/teams/TeamDetailPage.tsx': 'クラブ詳細。CPUクラブのGM名（実在の相手ではない）',
}

const files: string[] = []
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.tsx')) files.push(p)
  }
}
walk('src/components')

console.log('[1] 他人の名前が出る画面は全部、段位の紋章を出している')
{
  const shows = files.filter(f => /\bgmName\b/.test(readFileSync(f, 'utf8')))
  const missing = shows.filter(f => !MINE_ONLY[f] && !/RankBadge/.test(readFileSync(f, 'utf8')))
  console.log(`  他人の名前が出る画面 ${shows.length - Object.keys(MINE_ONLY).length}件（自分だけの画面 ${Object.keys(MINE_ONLY).length}件は対象外）`)
  check('紋章の付け忘れが無い', missing.length === 0,
    `${missing.join(' / ')}\n      → <RankBadge rating={ranks.get(userId)} /> を足すか、` +
    '自分のことしか出さない理由を MINE_ONLY に書くこと')

  // ★**除外の名簿が腐っていないか。** 消した画面の言い訳が残っていると、
  //   次に同じ名前で作った画面が黙って通る
  const stale = Object.keys(MINE_ONLY).filter(f => !shows.includes(f))
  check('「自分だけ」の言い訳が全部いまも当たっている', stale.length === 0, stale.join(' / '))
}

console.log('\n[2] 段位はまとめて1回で引いている')
{
  // レートを**もう持っている**画面は引き直さない（引くと、いま出ている数字と
  // 紋章が別々の時点のものになる）。理由を書いておく側の名簿
  const HAS_RATING: Record<string, string> = {
    'src/components/rated/RatedStandingsPage.tsx': '順位表の行がサーバーから rating ごと返ってくる',
    'src/components/friends/GmShareCard.tsx': '共有カード。呼ぶ側からレートを渡してもらう',
  }
  const users = files.filter(f => /RankBadge/.test(readFileSync(f, 'utf8')))
  // 部品そのもの（ratedUi）は引く側ではない
  const callers = users.filter(f => !f.endsWith('ratedUi.tsx') && !HAS_RATING[f])
  const bad = callers.filter(f => !/useRatedRanks?\(/.test(readFileSync(f, 'utf8')))
  check(`紋章を出す画面は useRatedRank(s) を通している（${callers.length}件）`, bad.length === 0, bad.join(' / '))
  const staleHas = Object.keys(HAS_RATING).filter(f => !users.includes(f))
  check('「もう持っている」の言い訳が全部いまも当たっている', staleHas.length === 0, staleHas.join(' / '))

  // ★**1行ずつ引かないこと。** 一覧の中で `useRatedRank(id)` を呼ぶと、
  //   行の数だけフックが増えて通信も行の数だけ飛ぶ（`map` の中でフックは呼べないので
  //   行を部品にすると通ってしまう＝`MemberRow` がその形。あちらは行が部品なので可）
  const lists = ['src/components/friends/FriendListPage.tsx',
    'src/components/online/RoomLobbyPage.tsx', 'src/components/online/FinishPanel.tsx',
    'src/components/online/MatchHistoryPage.tsx']
  for (const f of lists) {
    const src = readFileSync(f, 'utf8')
    check(`${f.split('/').pop()} は一覧ぶんまとめて引く`, /useRatedRanks\(/.test(src))
  }
}

if (failed > 0) { console.log(`\n  → NG ${failed}件`); process.exit(1) }
console.log('\n  → OK')
