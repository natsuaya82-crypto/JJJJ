/**
 * 【クラブの優勝と、監督の優勝を混ぜない】
 *
 * ■なぜ要るのか（オーナー・2026-08-14「歴代優勝がチームのじゃなくてGMのがついてきてる」）
 *   記録室の**自チーム記録（FRANCHISE）**が、クラブの優勝ではなく
 *   **監督の通算**（`gmCareerTitles`）を出していました。監督が別のクラブへ移ると、
 *   前のクラブで挙げた優勝がそのままいまのクラブの記録として並びます。
 *
 *   2026-08-12 の「記録室のGMのページならどのチームで優勝したかを書く」は
 *   **GMキャリアのページ（`/records/gm`）の話**で、自チーム記録のことではありません。
 *   記録室にはページが分かれてあるのに、片方の指示をもう片方へ当てていました。
 *
 * ■どちらがどちらか
 *
 *   | 画面 | 何の記録か | 数え方 |
 *   |---|---|---|
 *   | 記録室の見出しの★／自チーム記録 | **クラブ** | `teamHistoryOf` |
 *   | GMキャリア | **監督** | `gmCareerTitles`（どのクラブで何年に、も出す） |
 *   | クラブ詳細ページ | **クラブ** | `teamHistoryOf` |
 *
 * ■空振りの緑にしないために
 *   数え方の関数を叩くだけだと、**画面がどちらを呼んでいても緑**になります。
 *   [2] で実際のソースを読み、どのページがどちらを使っているかを見ます。
 */
import { readFileSync } from 'node:fs'
import { gmCareerTitles, teamHistoryOf } from '../src/utils/teamHistory'
import type { GmTenure } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[1] 監督が移ると、クラブの記録と監督の記録は食い違う')
{
  // A で2回・B で1回優勝した世界。監督は 2032 に A から B へ移った
  const season = (year: number, champ: string) => ({
    year,
    standings: { 1: [{ teamId: champ, totalPoints: 100 }, { teamId: 'zzz', totalPoints: 1 }] },
  } as never)
  const pastSeasons = [season(2030, 'A'), season(2031, 'A'), season(2032, 'B'), season(2033, 'B')]
  const tenures: GmTenure[] = [
    { teamId: 'A', fromYear: 2030, toYear: 2031 },
    { teamId: 'B', fromYear: 2032, toYear: 9999 },
  ] as never

  const club = teamHistoryOf(pastSeasons, 'B')
  const gm = gmCareerTitles(pastSeasons, tenures, 'B')
  console.log(`      クラブBの優勝 ${club.championships}回 / 監督の通算 ${gm.total}回`)
  check('クラブBの優勝は、Bが優勝した年だけ', club.championships === 2, `${club.championships}回`)
  check('監督の通算は、指揮していた年だけ（A2回＋B2回）', gm.total === 4, `${gm.total}回`)
  // ★この2つが同じ値になる世界だと、どちらを呼んでも同じ＝点検が意味を持たない
  check('この世界では2つの数え方が食い違う（点検が空振りしていない）', club.championships !== gm.total)
  check('監督のほうはクラブ別に分かれる', gm.byClub.length === 2, `${gm.byClub.length}クラブ`)
  check('クラブのほうにクラブ別の内訳は無い', !('byClub' in club))
}

console.log('\n[2] 画面がどちらを呼んでいるか')
{
  const recordsPage = readFileSync('src/components/records/RecordsPage.tsx', 'utf8')
  const hub = readFileSync('src/components/records/RecordsHub.tsx', 'utf8')
  const teamDetail = readFileSync('src/components/teams/TeamDetailPage.tsx', 'utf8')

  // 自チーム記録とGMキャリアは同じファイル。**中身は `FranchiseTab` / `GmCareerTab` で、
  // 上のほうにある `FranchiseRecordsPage` などは器だけ**（ここを切り分けの目印にすると、
  // 本体がまるごと片側に寄って点検が意味を失う。実際に一度そう書いた）
  const fStart = recordsPage.indexOf('function FranchiseTab(')
  const pStart = recordsPage.indexOf('function PlayersTab(')
  const gStart = recordsPage.indexOf('function GmCareerTab(')
  check('FranchiseTab と GmCareerTab がある（切り分けの前提）',
    fStart > 0 && pStart > fStart && gStart > pStart)
  const franchise = recordsPage.slice(fStart, pStart)
  const gmPage = recordsPage.slice(gStart)

  check('自チーム記録はクラブで数える（teamHistoryOf）', /teamHistoryOf\(pastSeasons, playerTeamId\)/.test(franchise))
  // ★ここが本体。自チーム記録が gmCareerTitles を呼んだら落とす
  check('自チーム記録は監督の通算を呼んでいない', !/gmCareerTitles\(/.test(franchise))
  check('GMキャリアは監督の通算で数える（gmCareerTitles）', /gmCareerTitles\(/.test(gmPage))
  check('GMキャリアが優勝回数を自前で数え直していない',
    !/pastSeasons\.filter\(s => rankIn\(s, teamIdAt\(s\.year\)\) === 1\)/.test(gmPage))
  check('どのクラブで優勝したかはGMキャリアのページに出す', /byClub\.map/.test(gmPage))
  check('自チーム記録にクラブ別の内訳は出さない', !/byClub/.test(franchise))

  check('記録室の見出しの★はクラブで数える', /teamHistoryOf\(pastSeasons, playerTeamId\)/.test(hub))
  check('記録室の見出しは監督の通算を呼んでいない', !/gmCareerTitles\(/.test(hub))

  check('クラブ詳細ページはクラブで数える', /teamHistoryOf\(pastSeasons, id\)/.test(teamDetail))
  check('クラブ詳細ページは監督の通算を呼んでいない', !/gmCareerTitles\(/.test(teamDetail))
}

console.log('')
if (failed > 0) { console.log(`✗ クラブの優勝と監督の優勝が混ざっています（${failed}件）`); process.exit(1) }
console.log('✓ 自チーム記録とクラブ詳細はクラブ、GMキャリアは監督。混ざっていない')
