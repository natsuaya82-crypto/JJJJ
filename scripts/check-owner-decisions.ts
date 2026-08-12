/**
 * オーナーが決めた3つの決まりが、実装のままになっているかを見る（2026-08-12）。
 *
 *   A-5  大陸予選の代表20人も、本戦・アジア予選と同じようにセーブ整理から守る
 *   A-6  「譲ります」を本人が断ったら、**話が乗っていた全クラブ**が今季もう来ない
 *   A-8  GMの評判の底は 0（1で止める経路を作らない）
 *
 * どれも「1行が抜けているだけで静かに戻る」形なので、ここで見張ります。
 */
import { readFileSync } from 'node:fs'
import { pruneSaveData } from '../src/engine/savePruning'
import { withGmRep, GM_REP_DEFAULT } from '../src/utils/condition'
import type { Player } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[A-5] 大陸予選の代表20人がセーブ整理から守られる')
{
  const YEAR = 2030
  const mk = (id: string): Player => ({
    id, name: id, teamId: '', age: 33, status: 'retired', specialty: 'long',
    joinedYear: YEAR - 8, nationality: 'KEN', finalOvr: 80,
    contract: { annualSalary: 0, yearsLeft: 0 },
    career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
  } as unknown as Player)
  // 大陸代表だけが根拠の選手（他に守られる理由が1つも無い）
  const contOnly = mk('cont-1')
  const plain = mk('plain-1')
  const base = {
    players: [contOnly, plain],
    teams: [],
    playerTeamId: 'my',
    currentSeason: { year: YEAR, races: [], currentRaceIndex: 0 },
    pastSeasons: [],
  }
  const state = {
    ...base,
    worldAthleticsResults: [{
      year: YEAR - 1, kind: 'qualifier',
      continentals: [{ region: 'アフリカ', standings: [], advanced: [], squads: { nat_KEN: ['cont-1'] } }],
    }],
  } as never
  const out = pruneSaveData({ players: base.players, foreignLeagues: [], state, newYear: YEAR + 1 })
  const kept = new Set(out.players.map(p => p.id))
  check('大陸代表だった選手は残る', kept.has('cont-1'),
    '大陸予選の squads が protectedIds に入っていない＝代表の記録とバッジが静かに消える')
  // ★網が効いているかの確かめ：**守る理由が無い選手は実際に消える**世界であること。
  //   消えない世界なら、上の ok は「そもそも誰も消えない」だけで何も守っていない
  check('  （前提）守る理由の無い選手は消える世界である', !kept.has('plain-1'),
    '誰も消えないので、上の判定は何も見張っていない')
}

console.log('')
console.log('[A-6] 本人が断ったら、話が乗っていた全クラブが今季もう来ない')
{
  const src = readFileSync('src/store/marketOps.ts', 'utf-8')
  // 本人の拒否は 'refused_by_player'。'refused' は逆提示（クラブが額に応じなかった）でしか起きない
  const m = src.match(/const refusedClubs = ([^\n]*)/)
  console.log(`  ${m?.[1] ?? '(見つからない)'}`)
  check('本人の拒否（refused_by_player）で止める', !!m && m[1].includes('refused_by_player'),
    "'refused' だけを見ていると一度も走らない（逆提示でしか起きない）")
  check('  止めるのは打診していた全クラブ',
    src.includes("(cs0.incomingOffers ?? []).filter(o => o.playerId === ps.playerId).map(o => o.fromTeamId)"))
}

console.log('')
console.log('[A-8] GMの評判の底は 0')
{
  check('0まで落ちる', withGmRep(3, -10) === 0, `${withGmRep(3, -10)}`)
  check('100で止まる', withGmRep(98, 10) === 100)
  check('既定値は50', GM_REP_DEFAULT === 50)
  const src = readFileSync('src/engine/seasonObjectives.ts', 'utf-8')
  check('目標達成の側に「1で止める」が残っていない', !/Math\.max\(1,\s*withGmRep/.test(src))
}

console.log(failed === 0 ? '\n✓ 3つとも決まりどおり\n' : `\n✗ ${failed}件\n`)
if (failed > 0) process.exit(1)
