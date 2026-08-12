/**
 * 【ドラフト会場のAI】`engine/draft.ts` の3本を釘で留める。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-draft-ai.ts \
 *     --outfile=node_modules/.cache/check-da.cjs --log-level=error && node node_modules/.cache/check-da.cjs
 *
 * ■なぜ要るのか
 *   `getTeamNeeds` / `getAIBuzz` / `draftSalaryFloor` は **画面（DraftRoom.tsx）の中**に
 *   書かれていて、どの点検からも見えていませんでした。ゴールデン検査は store の
 *   アクションを叩くので、画面の中の関数には届きません。
 *   `engine/draft.ts` へ移すにあたって、**移す前の実装をそのまま写して総当たり446件を
 *   突き合わせ**、差分ゼロを確認しています。この点検はその結果を固定するものです。
 *
 * ■「何が足りないか」の判定が2つあることについて
 *   ここは **`utils/squadNeeds` の `needsPlayer` とは別の答えを出します。**
 *
 *     squadNeeds  … そのタイプが0人か、チーム平均を下回っているか。**強さを見る**
 *     ここ        … そのタイプの**人数が少ない順に2つ**。強さを見ない
 *
 *   どちらが正かは**オーナー判断**（`docs/OWNER_DECISIONS.md`）なので、移設では
 *   揃えていません。**勝手に `needsPlayer` へ寄せると、指名の傾向が変わります。**
 *
 * ■数字は定数を読まずリテラルで打つこと
 *   `SALARY_DIAL_MIN` を読んで比べると、その定数を変えたときに一緒に動いて永遠に緑になります
 *   （`CPU_SELL_FLOOR` で実際にそうなっていました）。
 */
import { readFileSync } from 'node:fs'
import { draftBuzz, draftSalaryFloor, draftTeamNeeds } from '../src/engine/draft'
import { SALARY_DIAL_MIN, SALARY_DIAL_STEP } from '../src/data/economy'
import { faMarketSalary } from '../src/utils/playerUtils'
import { SPECIALTIES } from '../src/utils/squadNeeds'
import type { Player, Specialty, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const team = (id: string): Team => ({ id, shortName: id }) as unknown as Team
const P = (id: string, teamId: string, specialty: Specialty, ovrish = 60): Player => ({
  id, name: id, teamId, age: 24, status: 'active', specialty,
  nationality: 'JPN', joinedYear: 2030, growthCurve: 'normal',
  contract: { annualSalary: 5_000_000, yearsLeft: 2 },
  career: { totalRaces: 20, segmentWins: 0, championships: 0, mvpAwards: 0 },
  ratings: Object.fromEntries(['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
    .map(k => [k, ovrish])),
  potential: 75,
} as unknown as Player)

const [S0, S1, S2] = SPECIALTIES

console.log('[1] 欲しいタイプは「人数が少ない順に2つ」')
{
  // t1 … S0が3人 / S1が2人 / S2が1人 / 残りは0人
  const roster = [
    P('a1', 't1', S0), P('a2', 't1', S0), P('a3', 't1', S0),
    P('b1', 't1', S1), P('b2', 't1', S1),
    P('c1', 't1', S2),
  ]
  const got = draftTeamNeeds('t1', [], roster)
  // 0人のタイプが SPECIALTIES の並び順で先に来る
  const zeros = SPECIALTIES.filter(s => s !== S0 && s !== S1 && s !== S2)
  check('0人のタイプが優先される', got.length === 2 && got[0] === zeros[0] && got[1] === zeros[1],
    `${got.join(',')} / 期待 ${zeros.slice(0, 2).join(',')}`)

  // 全タイプに1人ずついる＝同数。並び順の先頭2つが返る
  const flat = SPECIALTIES.map((s, i) => P(`f${i}`, 't2', s))
  const gotFlat = draftTeamNeeds('t2', [], flat)
  check('同数なら SPECIALTIES の並び順で先の2つ', gotFlat[0] === SPECIALTIES[0] && gotFlat[1] === SPECIALTIES[1],
    gotFlat.join(','))

  // ★人数だけを見る（強さを見ない）。弱い選手を足しても「足りている」になる
  const weakFilled = [...flat, P('w', 't2', SPECIALTIES[0], 20)]
  check('強さは見ない（弱い1人でも頭数として数える）',
    !draftTeamNeeds('t2', [], weakFilled).includes(SPECIALTIES[0]),
    draftTeamNeeds('t2', [], weakFilled).join(','))
}

console.log('')
console.log('[2] その会場で指名済みのぶんも数える')
{
  const roster = [P('x1', 't1', S1), P('x2', 't1', S1)]
  const pool = [P('d0', '', S0), P('d1', '', S0)]
  const all = [...roster, ...pool]
  const before = draftTeamNeeds('t1', [], all)
  check('指名前は S0 が欲しい', before.includes(S0), before.join(','))
  // S0 を2人指名したら、S0 は「足りている」側へ回る
  const after = draftTeamNeeds('t1', [{ teamId: 't1', playerId: 'd0' }, { teamId: 't1', playerId: 'd1' }], all)
  check('指名した2人ぶんが数に入る（S0 が外れる）', !after.includes(S0), after.join(','))
  // よそのチームの指名は自分の数に入らない
  const other = draftTeamNeeds('t1', [{ teamId: 't9', playerId: 'd0' }, { teamId: 't9', playerId: 'd1' }], all)
  check('よそのチームの指名は数に入らない', other.includes(S0), other.join(','))
}

console.log('')
console.log('[3] 注目度は「欲しがっている他チームの数」')
{
  // t1 と t2 は S0 が欲しい（S0 が0人）。t3 は S0 が一番多いので欲しがらない。
  // ★t3 を「全タイプ1人ずつ＋一部を2人」にすると、S0 も最少タイのままで t3 も欲しがってしまう。
  //   欲しがらせないためには **S0 を他より多くする**必要がある（最初に書いた版がこれで落ちた）
  const roster = [
    ...SPECIALTIES.filter(s => s !== S0).map((s, i) => P(`p1${i}`, 't1', s)),
    ...SPECIALTIES.filter(s => s !== S0).map((s, i) => P(`p2${i}`, 't2', s)),
    ...SPECIALTIES.map((s, i) => P(`p3${i}`, 't3', s)),
    P('p3x', 't3', S0), P('p3y', 't3', S0),
  ]
  const teams = [team('t1'), team('t2'), team('t3')]
  const cand = P('cand', '', S0)
  check('自チームを t3 にすると t1・t2 の2件', draftBuzz(cand, teams, 't3', [], roster) === 2,
    `${draftBuzz(cand, teams, 't3', [], roster)}件`)
  // ★自チームは数えない。t1 から見れば残るのは t2 だけ
  check('自チームは数えない', draftBuzz(cand, teams, 't1', [], roster) === 1,
    `${draftBuzz(cand, teams, 't1', [], roster)}件`)
}

console.log('')
console.log('[4] 新人の年俸の下限')
{
  // ★リテラルで釘を打つ（定数を読んで比べると、定数を変えたとき一緒に動いて緑のままになる）
  check('下限そのものは300万', SALARY_DIAL_MIN === 3_000_000, `${SALARY_DIAL_MIN}`)
  check('刻みは100万', SALARY_DIAL_STEP === 1_000_000, `${SALARY_DIAL_STEP}`)

  const weak = P('weak', '', S0, 20)
  check('相場が安い選手でも300万を下回らない', draftSalaryFloor(weak) >= 3_000_000, `${draftSalaryFloor(weak)}`)

  const strong = P('strong', '', S0, 95)
  const half = Math.round(faMarketSalary(strong) / 2 / 1_000_000) * 1_000_000
  check('相場が高い選手は市場相場の半分（100万刻み）', draftSalaryFloor(strong) === Math.max(3_000_000, half),
    `${draftSalaryFloor(strong)} / 相場 ${faMarketSalary(strong)}`)
  check('強い選手の下限は300万より上（＝下限に張り付いていない世界で見ている）',
    draftSalaryFloor(strong) > 3_000_000, `${draftSalaryFloor(strong)}`)
}

console.log('')
console.log('[5] 画面に写しを作り直していないか')
{
  const view = readFileSync('src/components/draft/DraftRoom.tsx', 'utf-8')
  check('DraftRoom は engine/draft を通す', /from '\.\.\/\.\.\/engine\/draft'/.test(view))
  check('画面に needs の数え直しが無い', !/function getTeamNeeds|function getAIBuzz/.test(view))
  check('画面に年俸の下限の式が無い', !/faMarketSalary\(\w+\)\s*\/\s*2/.test(view))
}

console.log('')
console.log(failed === 0 ? '\n✓ ドラフト会場のAIは engine/draft 1本\n' : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
