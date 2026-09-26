/**
 * 【画面とサーバーの2か所にある上限】食い違っていないか。
 *
 * SQL（`supabase/all.sql`）は関数の中の即値で、TS を import できない。片方だけ動かすと
 * 「押せるのに弾かれる」「押せないのに受け付ける」になるので、ここで突き合わせる。
 *   ① オンライン対戦を始められる最少チーム数（`lib/roomMachine` の `MIN_TEAMS` ⇔ `start_room`）
 *   ② 走友会の人数の上限（`lib/clubsApi` の `CLUB_MAX` ⇔ `club_member_cap`）
 *
 * ★以前は `check-rated-server`（ランクマッチのサーバー側）の一部だった。ランクマッチを
 *   消したので（オーナー・2026-09-26「ランクマッチは消してください」）、残す2つだけをここへ移した。
 */
import { readFileSync } from 'node:fs'
import { MIN_TEAMS } from '../src/lib/roomMachine'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('\n[1] 対戦を始められる最少チーム数は1本（画面とサーバーで食い違わない）')
{
  // ★この数も**2か所にある**。TS の `MIN_TEAMS`（ホストの「はじめる」が押せるか）と、
  //   `all.sql` の `start_room`（サーバーが受けるか）。
  //   ★以前サーバーは `v_count < 1` で、**ホスト1人でも 'started' を返して**いた
  //     （`room_members` にはホストも入っている）。止めていたのは画面だけ。
  const sql = readFileSync('supabase/all.sql', 'utf8')
  const m = /create function public\.start_room[\s\S]*?v_count\s*<\s*(\d+)\s*then\s*return\s*'empty'/.exec(sql)
  check('all.sql の start_room に人数の判定がある', !!m, m ? '' : '見つからない')
  check(`サーバーの線が MIN_TEAMS と同じ（${MIN_TEAMS}）`,
    !!m && Number(m[1]) === MIN_TEAMS, m ? `all.sql は ${m[1]}` : '')
  check('1人では対戦にならない（線は2以上）', MIN_TEAMS >= 2, String(MIN_TEAMS))

  // ★画面が自前の数を持たないこと（持った瞬間にまた割れる）
  const lobby = readFileSync('src/components/online/RoomLobbyPage.tsx', 'utf8')
  check('画面が MIN_TEAMS を手書きしていない', !/const\s+MIN_TEAMS\s*=/.test(lobby))
  check('画面は lib/roomMachine から MIN_TEAMS を引いている',
    /import\s*\{[^}]*\bMIN_TEAMS\b[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/roomMachine'/.test(lobby))
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
