/**
 * 【チームのロゴ】相手のロゴは remoteLogoId 1本を通っているか
 *
 * ■なぜ要るのか（オーナー・2026-08-22「ここなんでアイコン適当なの？」）
 *   ランクマッチの順位表と「あなたの部屋」だけ、`TeamLogoSVG` に `logoId` を渡さず
 *   `teamId={r.userId}`（＝サーバーのユーザーUUID）を渡していた。`TeamLogoSVG` は
 *   `logoId` が無いと `s.teams.find(t => t.id === teamId)` で**自分のセーブの中から**
 *   探すが、UUID はそこに居ないので必ず外れ、最後の逃げ道である
 *   「IDのハッシュから作る紋章」に落ちる。だから絵が適当になっていた。
 *
 *   サーバーは `rated_standings` / `rated_my_group` とも `logoId` を返していて、
 *   型（`RatedRow.logoId`）にも入っていた。**取ってきているのに捨てていた**だけ。
 *
 * ■わざと壊して落ちることを確かめた
 *   ・`RatedStandingsPage` の `logoId=` を `teamId={r.userId}` に戻す        → ③④
 *   ・`ratedApi` の `remoteLogoId(` を消す                                    → ②
 *   ・救済の三項を `friendsApi` に書き戻す                                    → ①
 */
import { readFileSync, readdirSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const files: { path: string; src: string }[] = []
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e.name)) files.push({ path: p, src: readFileSync(p, 'utf8') })
  }
}
walk('src')

console.log('[1] 「相手のロゴをどれにするか」の式が1か所しか無い')
{
  // logo_01 のまま保存されている人を散らす救済。**これが2か所に割れると、
  // 同じ人がフレンド一覧と順位表で別の絵になる。**
  const others = files.filter(f =>
    f.path !== 'src/data/logoPresets.ts' && /hashedLogoIdFor\(/.test(f.src))
  check('hashedLogoIdFor を呼ぶのは logoPresets.ts だけ',
    others.length === 0, others.map(f => f.path).join(', '))

  const lit = files.filter(f =>
    f.path !== 'src/data/logoPresets.ts' && /!==\s*'logo_01'/.test(f.src))
  check("'logo_01' との突き合わせを他所に書いていない",
    lit.length === 0, lit.map(f => f.path).join(', '))
}

console.log('\n[2] サーバーから読んだ相手の logoId が remoteLogoId を通る')
{
  // ★**入口の数と、1本を通っている数を両方数える**（CLAUDE.md）。
  //   肯定の includes だけだと、2か所目が別の書き方でも緑になる。
  //   friendsApi … toFriend / toRequest の2つ
  //   ratedApi   … fetchStandings の mark / fetchMyGroup の members の2つ
  const ENTRIES: { file: string; n: number }[] = [
    { file: 'src/lib/friendsApi.ts', n: 2 },
    { file: 'src/lib/ratedApi.ts', n: 2 },
  ]
  for (const { file, n } of ENTRIES) {
    const src = readFileSync(file, 'utf8')
    // プロフィール行 → 画面に出す logoId、を作っている行（型の宣言は数えない）
    const made = (src.match(/^\s*(\.\.\.[a-z]+, )?logoId: (?!string\b)/gm) ?? []).length
    const via = (src.match(/remoteLogoId\(/g) ?? []).length
    check(`${file} は相手の logoId を ${n} か所で作る`, made === n, `${made} か所`)
    check(`${file} はその ${n} か所とも remoteLogoId を通る`, via === n, `${via} か所`)
  }

  // ★まだ通っていないものが2つある（オーナー未判断・2026-08-22 に報告）。
  //   ・src/lib/clubsApi.ts   掲示板の書き込み（`r.logo_id || 'logo_01'`）
  //   ・src/lib/moderationApi.ts  ブロックした人の一覧（同じ）
  //   こちらは「全員同じ鶴になる」で、症状が違うので別に判断してもらう。
  //   **増えていないことだけ見る**（今日より増えたら落ちる）。
  const strays = files.filter(f => /logoId: r\.logo_id \|\| 'logo_01'/.test(f.src))
  check('通っていないものが2つより増えていない', strays.length <= 2,
    strays.map(f => f.path).join(', '))
}

console.log('\n[3] TeamLogoSVG にユーザーUUIDを teamId として渡していない')
{
  // teamId は**自分のセーブの中のチームID**を渡すところ。サーバーのユーザーIDを
  // 渡すと必ず引けず、ハッシュの紋章に落ちる（今回のバグそのもの）。
  const bad: string[] = []
  for (const f of files) {
    for (const tag of f.src.match(/<TeamLogoSVG[\s\S]*?\/>/g) ?? []) {
      if (/teamId=\{[^}]*[uU]serId[^}]*\}/.test(tag)) bad.push(f.path)
    }
  }
  check('teamId={…userId} を渡している画面が無い', bad.length === 0, bad.join(', '))
}

console.log('\n[4] 相手を出す画面は logoId を渡している')
{
  // サーバーから読んだ相手（`userId` を持つ行）を出す画面の一覧。
  // ここに足したら、その画面の TeamLogoSVG も logoId を渡すことになる。
  const REMOTE_SCREENS = [
    'src/components/rated/RatedStandingsPage.tsx',
    'src/components/friends/FriendListPage.tsx',
    'src/components/friends/FriendDetailPage.tsx',
    'src/components/online/RoomLobbyPage.tsx',
  ]
  for (const path of REMOTE_SCREENS) {
    const src = readFileSync(path, 'utf8')
    const tags = src.match(/<TeamLogoSVG[\s\S]*?\/>/g) ?? []
    check(`${path.split('/').pop()} の TeamLogoSVG が全部 logoId を渡す`,
      tags.length > 0 && tags.every(t => /logoId=/.test(t)),
      `${tags.filter(t => !/logoId=/.test(t)).length} か所が渡していない`)
  }
}

console.log(failed === 0 ? '\n  → OK' : `\n  → NG ${failed}件`)
process.exit(failed === 0 ? 0 : 1)
