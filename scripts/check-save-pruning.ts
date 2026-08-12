/**
 * **セーブ整理で消してはいけない選手が消えないか。** 守る理由を1つずつ別の世界で試す。
 *
 * ■なぜ要るのか（緑だったのに守っていなかった）
 *   `engine/savePruning` の `protectedIds` は「この記録に名前が載っている選手は消さない」の
 *   集まりで、いま11の出どころがあります。ところが 2026-08-12 に**1件ずつわざと消して
 *   `npm run check` を1周させた**ところ、2つは**消しても55本が1本も落ちませんでした**。
 *
 *     ・`eventSeasonTops`（記録会の年間トップ10）
 *     ・`pastSeasons[].zeroAppearances`（今季1度も走らなかった自チームの選手）
 *
 *   後者は `docs/REFACTORING_DESIGN.md` §11-2 の教訓6 で
 *   「通していたら在籍履歴からその年が丸ごと消えるバグだった」と書いた、まさにその枝です。
 *   **書いておいただけでは守れていませんでした。**
 *
 * ■書き方（golden では届かない形）
 *   世界を1つ作って流す検査（`check-action-golden`）は、その世界に「守る理由が
 *   これ1つだけの選手」が居なければ枝を通りません。実際そうなっていました。
 *   なので**出どころ1つにつき世界を1つ**作り、
 *
 *     ・その記録にだけ名前がある選手（`keep`）… 残ること
 *     ・どこにも名前が無い選手（`drop`）      … **実際に消えること**
 *
 *   の2人を同時に見ます。`drop` が消えない世界では、`keep` が残っても何も言えません
 *   （そもそも刈り取りが起きていない＝空振りの緑）。
 *
 * ■ここで見ていないもの
 *   MVP・新人王（`utils/awards`）とECL優勝メンバー（`utils/eclHistory`）は
 *   過去シーズンのレース結果から選び直すので、この形の小さな世界では作れません。
 *   `check-awards` / `check-action-golden` の側で見ます。
 */
import { pruneSaveData } from '../src/engine/savePruning'
import type { GameState, Player } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
const MY = 'my'

/** 引退済み・実績ゼロ・自チーム在籍歴なし＝**守る理由が1つも無い**選手 */
const bare = (id: string): Player => ({
  id, name: id, teamId: '', age: 34, status: 'retired', specialty: 'long',
  joinedYear: YEAR - 9, nationality: 'KEN', finalOvr: 78,
  contract: { annualSalary: 0, yearsLeft: 0 },
  career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
} as unknown as Player)

/**
 * 世界を1つ作って整理を通し、「keep が残る」と「drop が消える」を同時に見る。
 * patch には**その出どころだけ**を足すこと（2つ足すとどちらが効いたか分からなくなる）。
 */
function pinned(label: string, patch: Partial<GameState>) {
  const keep = bare('keep')
  const drop = bare('drop')
  const state = {
    players: [keep, drop],
    teams: [],
    playerTeamId: MY,
    currentSeason: { year: YEAR, races: [], currentRaceIndex: 0 },
    pastSeasons: [],
    ...patch,
  } as unknown as GameState
  const r = pruneSaveData({ players: [keep, drop], foreignLeagues: [], state, newYear: YEAR + 1 })
  const has = (id: string) => r.players.some(p => p.id === id)
  // ★母数の確認。drop が消えない世界では keep が残っても何の証拠にもならない
  check(`${label} … 守る理由の無い選手は消える`, !has('drop') && !!r.removedPlayers.drop)
  check(`${label} … 名前が載っている選手は残る`, has('keep'))
}

console.log('[1] 記録会の年間トップ10（eventSeasonTops）')
pinned('記録会の年間トップ10', {
  eventSeasonTops: [{ year: YEAR - 1, event: 'd10000', top: [{ playerId: 'keep', timeSec: 1700 }] }],
} as unknown as Partial<GameState>)

console.log('')
console.log('[2] 今季1度も走らなかった自チームの選手（zeroAppearances）')
pinned('0出走の在籍記録', {
  pastSeasons: [{ year: YEAR - 1, races: [], zeroAppearances: [{ playerId: 'keep', teamId: MY }] }],
} as unknown as Partial<GameState>)

console.log('')
console.log('[3] 世界記録・日本記録（共同保持者も）')
pinned('世界記録', {
  worldRecords: { d10000: { playerId: 'keep', timeSec: 1600, year: YEAR - 2 } },
} as unknown as Partial<GameState>)
pinned('日本記録の共同保持者', {
  japanRecords: { d10000: { playerId: 'other', timeSec: 1600, year: YEAR - 2, coHolders: [{ playerId: 'keep', year: YEAR - 1 }] } },
} as unknown as Partial<GameState>)

console.log('')
console.log('[4] クラブの歴代記録（teams[].eventRecords）')
pinned('クラブ歴代記録', {
  teams: [{ id: MY, eventRecords: { d10000: [{ playerId: 'keep', timeSec: 1700, year: YEAR - 1 }] } }],
} as unknown as Partial<GameState>)

console.log('')
console.log('[5] 代表（本戦・大陸予選・世界選抜）')
pinned('駅伝代表20人', {
  worldAthleticsResults: [{ year: YEAR - 1, kind: 'main', squads: { nat_KEN: ['keep'] } }],
} as unknown as Partial<GameState>)
pinned('大陸予選の代表20人', {
  worldAthleticsResults: [{ year: YEAR - 1, kind: 'qualifier', continentals: [{ cont: 'europe', squads: { nat_KEN: ['keep'] } }] }],
} as unknown as Partial<GameState>)
pinned('worldRepresentatives', {
  worldRepresentatives: [{ playerId: 'keep', year: YEAR - 1, nation: 'KEN' }],
} as unknown as Partial<GameState>)

console.log('')
console.log('[6] ★を付けた選手')
pinned('スター（他クラブ）', { starredOpponents: ['keep'] } as unknown as Partial<GameState>)
pinned('スター（ドラフト候補）', { starredProspects: ['keep'] } as unknown as Partial<GameState>)

console.log('')
console.log(failed === 0
  ? '\n✓ 守る理由がある選手はどれも消えない（守る理由が無い選手は消える）\n'
  : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
