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

console.log('\n[2] 相手の logoId を作る口が全部 remoteLogoId を通る')
{
  // ★**'logo_01' の直書きが、この不具合の共通の形**でした。
  //   「プロフィールが読めなかったときの逃げ」を各所で `?? 'logo_01'` と書くと、
  //   **その人たちが全員おなじ鶴**になる。5か所ありました（2026-08-22 に全部通した）。
  //     src/lib/clubsApi.ts       掲示板の書き込み／メンバーのプロフィールが読めないとき
  //     src/lib/moderationApi.ts  ブロックした人の一覧
  //     src/components/online/RoomLobbyPage.tsx  対戦ロビー（2か所）
  const lit = files.filter(f =>
    f.path !== 'src/data/logoPresets.ts' &&
    f.src.split('\n').some(l => /'logo_01'/.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/\/\/.*'logo_01'/.test(l)))
  check("'logo_01' を他所に直書きしていない", lit.length === 0, lit.map(f => f.path).join(', '))

  // ★**入口の数と、1本を通っている数を両方数える**（CLAUDE.md）。
  //   一覧を手で持たない——`remoteLogoId` を呼んでいるファイルを実際に数えて、
  //   そのファイルの中に「通っていない logoId の作り方」が残っていないかを見る。
  //   自分のセーブの中のチームは別の決まり（defaultLogoIdFor）、
  //   走友会そのもののロゴはさらに別（normalizeClubLogoId）。
  const OK_CALL = /remoteLogoId\(|defaultLogoIdFor\(|normalizeClubLogoId\(/
  const users = files.filter(f => f.path !== 'src/data/logoPresets.ts' && /remoteLogoId\(/.test(f.src))
  check('remoteLogoId を通しているファイルが5つある', users.length === 5,
    `${users.length}: ${users.map(f => f.path.split('/').pop()).join(', ')}`)
  for (const f of users) {
    const made = f.src.split('\n').filter(l =>
      /logoId[:=]/.test(l) && !/logoId\??: string/.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/^import /.test(l))
    const bad = made.filter(l => !OK_CALL.test(l))
    check(`${f.path.split('/').pop()} の logoId が全部きまりを通る（${made.length}か所）`,
      made.length > 0 && bad.length === 0, bad.map(l => l.trim()).join(' / '))
  }
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
