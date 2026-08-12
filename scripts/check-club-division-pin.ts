/**
 * 【クラブの部はクラブのもの】監督が去っても、そのクラブの部が元へ引き戻されないこと。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-club-division-pin.ts \
 *     --outfile=node_modules/.cache/check-cdp.cjs --log-level=error && node node_modules/.cache/check-cdp.cjs
 *
 * ■何が起きていたか（オーナー・2026-08-12）
 *   > クラブの成績なのに監督の成績がひっついてくるの意味わからん
 *
 *   プレイヤーのクラブは、どのクラブを選んでも列の最後尾（3部）から始まる。そのため
 *   「データどおりの部へ戻す」修復から**外して固定**している。その固定が長いあいだ
 *   `playerTeamId` **1つだけ**に付いていたので、監督が別のクラブへ移った瞬間に
 *   前のクラブの固定が外れ、**元の部（例：千葉なら1部）へ引き戻されていた**。
 *
 *   実機で「2031年 3部11位 → 2032年 1部1位」と出ていたのがこれ。
 *   **部を2つ飛ぶ昇格は起きない**ので、昇格ではなく引き戻し。
 *
 * ■固定は `utils/gmTenure` の `managedTeamIds` 1本（一度でも指揮したクラブ全部）
 */
import { backfillDomesticClubs, originalDivisionOf } from '../src/utils/domesticClubs'
import { managedTeamIds } from '../src/utils/gmTenure'
import { ALL_DOMESTIC_TEAMS } from '../src/utils/domesticClubs'
import type { GmTenure, Player, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

// ★元の部が3部でないクラブを選ぶ。3部のクラブだと「戻されても3部のまま」で
//   引き戻しが起きても気づけない（空振りの緑になる）
const OLD = ALL_DOMESTIC_TEAMS.find(t => originalDivisionOf(t.id) === 1)!
const NEW = ALL_DOMESTIC_TEAMS.find(t => originalDivisionOf(t.id) === 1 && t.id !== OLD.id)!

console.log(`[前提] ${OLD.id} の元の部は ${originalDivisionOf(OLD.id)}部`)
check('元の部が3部ではないクラブを選べた', originalDivisionOf(OLD.id) !== 3)

// 「プレイヤーが指揮していて3部まで落ちた」状態を作る。
// ★クラブを1つ抜いておく（backfill は欠けが無いと何もしないので、抜かないと素通りする）
const teams: Team[] = ALL_DOMESTIC_TEAMS
  .filter(t => t.id !== ALL_DOMESTIC_TEAMS[ALL_DOMESTIC_TEAMS.length - 1].id)
  .map(t => ({ ...t, division: t.id === OLD.id ? 3 : t.division })) as Team[]
const players: Player[] = []

const divOf = (out: { teams: Team[] }, id: string) => out.teams.find(t => t.id === id)?.division

console.log('')
console.log('[1] 指揮している間は3部のまま（今までどおり）')
{
  const tenures: GmTenure[] = [{ teamId: OLD.id, fromYear: 2030 }]
  const out = backfillDomesticClubs({ teams, players, year: 2032,
    pinnedTeamIds: managedTeamIds(tenures, OLD.id) })
  check('自チームの部は3部のまま', divOf(out, OLD.id) === 3, `${divOf(out, OLD.id)}部`)
  // ★母数の確認：固定していないクラブは実際に戻されている世界か
  const other = ALL_DOMESTIC_TEAMS.find(t => t.id !== OLD.id && t.id !== NEW.id)!
  check('固定していないクラブはデータどおりに戻る（空振りではない）',
    divOf(out, other.id) === originalDivisionOf(other.id))
}

console.log('')
console.log('[2] **監督が別のクラブへ移っても、前のクラブは3部のまま**')
{
  const tenures: GmTenure[] = [
    { teamId: OLD.id, fromYear: 2030, toYear: 2031 },
    { teamId: NEW.id, fromYear: 2032 },
  ]
  const out = backfillDomesticClubs({ teams, players, year: 2032,
    pinnedTeamIds: managedTeamIds(tenures, NEW.id) })
  check('**前のクラブが元の部へ引き戻されていない**', divOf(out, OLD.id) === 3,
    `${divOf(out, OLD.id)}部（元は${originalDivisionOf(OLD.id)}部）`)
  check('いまのクラブも固定されている', divOf(out, NEW.id) === teams.find(t => t.id === NEW.id)?.division)
}

console.log('')
console.log('[3] 固定は「一度でも指揮したクラブ」全部')
{
  const tenures: GmTenure[] = [
    { teamId: OLD.id, fromYear: 2030, toYear: 2031 },
    { teamId: NEW.id, fromYear: 2032 },
  ]
  const ids = managedTeamIds(tenures, NEW.id)
  check('前のクラブが入っている', ids.has(OLD.id))
  check('いまのクラブが入っている', ids.has(NEW.id))
  check('指揮していないクラブは入っていない',
    !ids.has(ALL_DOMESTIC_TEAMS.find(t => t.id !== OLD.id && t.id !== NEW.id)!.id))
  check('履歴が無くても今のクラブは入る', managedTeamIds(undefined, NEW.id).has(NEW.id))
}

console.log('')
console.log(failed === 0 ? '\n✓ クラブの部はクラブのもの（監督が去っても引き戻されない）\n' : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
