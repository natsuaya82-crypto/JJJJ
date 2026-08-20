/**
 * 【人の走友会は「見るだけ」。入口は1本】
 *
 * ■なにが起きていたか（オーナー・2026-08-18）
 *     「走友会、入ってないのに通報できてしまうの良くない。人の走友会は観れるだけで
 *       通報とかできないように。あと、自分が走友会入ってる時、人の走友会見ようとすると
 *       自分の走友会に飛ぶの直して。」
 *
 *   フレンド一覧とフレンド詳細の「走友会」の行が `/friends/club?code=…` へ飛ばしていました。
 *   これは**自分の走友会のページ**（`FriendClubPage`）で、走友会に入っていると
 *   `ClubHome`（自分の走友会・通報もキックも設定もある画面）がそのまま出ます。
 *   コードは読まれもしません。つまり
 *
 *     入っている  … 人の走友会を押すと**自分の走友会**が開く
 *     入っていない … 検索画面がそのコードで検索した状態で開く（見るページではない）
 *
 *   人の走友会を見るページ（`ClubViewPage`・見るだけ）は既にあったのに、
 *   そこへ行く道が**走友会の検索結果の長押し1本しか無かった**、というのが正体です。
 *
 * ■いまの決まり
 *   人の走友会へ行く先は `/friends/club/<走友会コード>` の1本だけ（`ClubViewPage`）。
 *   `/friends/club`（クエリ無し）は**自分の走友会専用**。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const files: string[] = []
const walk = (d: string) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p)) files.push(p)
  }
}
walk('src')
const src = files.map(f => readFileSync(f, 'utf8')).join('\n')

// ① 自分の走友会のページへコードを渡す道を作らないこと（これが「自分の走友会に飛ぶ」の正体）
//    ★見るのは**飛ばしている場所**（`navigate(...)`）だけ。ただの字面で見ると、
//      この形を禁止したと書いてあるコメント自身に当たって永久に落ちる
check('`/friends/club?code=` へ飛ばす場所が無い', !/navigate\(`\/friends\/club\?code=/.test(src))

// ② 人の走友会へ行く道は4つ。増えたときに①③を通っているか確かめたいので数える。
//    フレンド一覧・フレンド詳細・走友会の検索結果（長押し）・**同（タップ／見るだけのとき）**
const links = (src.match(/\/friends\/club\/\$\{/g) ?? []).length
check('人の走友会への入口は4つ', links === 4, `${links}つ`)

// ⑤ 入っている人が他所を探せること（テスターの報告・2026-08-20
//    「走友会に入ってる場合、他の走友会を見ることができない」）
const home = readFileSync('src/components/friends/FriendClubPage.tsx', 'utf8')
check('入っているときだけ「さがす」を出す', /right=\{mine\.data \? \(/.test(home))
check('さがすの行き先は専用のページ', /navigate\('\/friends\/clubs'\)/.test(home))
// ★見るだけ＝入る・申請・自分で作るを出さない（オーナー・2026-08-20
//   「脱退しないと入れないし、詳細見れるくらいのやつで」）
check('見るだけのときは入るボタンを出さない', /readOnly \? null :/.test(home))
check('見るだけのときは「自分で作る」も出さない', /\{!readOnly && <SectionLabel>自分で作る/.test(home))
const browse = readFileSync('src/components/friends/ClubBrowsePage.tsx', 'utf8')
check('さがすページは探す画面をそのまま使う（一覧を2枚書かない）',
  /<ClubSearch readOnly \/>/.test(browse) && !/searchClubs\(/.test(browse))

// ③ 見るだけ。メンバーの行は readOnly で出す（「···」も長押しも出ない）
const view = readFileSync('src/components/friends/ClubViewPage.tsx', 'utf8')
check('ClubViewPage は MemberRow を readOnly で出す', /\breadOnly\b/.test(view))

// ④ 見るだけの画面に通報の口を置かないこと
//    ★探すのは**部品の名前**。「通報」の2文字で見ると、置かない理由を書いた
//      コメントに当たる（説明を書けなくなる）
check('ClubViewPage に通報の口が無い', !/ReportSheet|setReporting|ActionSheet/.test(view))

console.log(failed === 0 ? '✓ 人の走友会は見るだけ: OK' : `✗ ${failed}件`)
process.exit(failed === 0 ? 0 : 1)
