/**
 * 【退任のとき1人だけ連れて行く】実際に世界を作って**走らせて**確かめる。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-gm-invite.ts \
 *     --outfile=node_modules/.cache/check-gmi.cjs --log-level=error \
 *     && node -r ./scripts/ls-shim.cjs node_modules/.cache/check-gmi.cjs
 *
 * ■仕様（オーナー判断・2026-08-13）
 *   「退任する時声をかけられる。行くか行かないかは選手が決める」
 *   「移籍と同じでいいよ。愛着がチームから監督に移るだけで」
 *
 * ■見ること
 *   ① 声をかけなければ誰も動かない
 *   ② 声をかけて本人が頷けば、**新しいクラブに移っている**
 *   ③ 断られたら**動かない**（旧クラブに残る）。理由が出る
 *   ④ 愛着の向き先が監督になっている
 *      … 同じ選手・同じ行き先で、`followGm` の有無で loyalty の符号が変わる
 *   ⑤ 判定を2本目に増やしていない（seasonSlice に独自の物差しを書かない）
 *
 * ■壊して確かめたこと（全部落ちた）
 *   ・`followGm` の枝を消して従来の personality に戻す → [④] が落ちる
 *   ・`applyGmMove` の招待ブロックごと消す               → [②] が落ちる
 *   ・断られても移す（`a.ok` を見ない）                  → [③] が落ちる
 */
// ── 乱数のシード固定（他の import より先に効かせる） ──────────────────
let rngSeed = 20260813
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

import { readFileSync } from 'node:fs'
import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { DIVISIONS, DIVISION_RACES, divisionOf, newSeasonStandings } from '../src/utils/league'
import { appraiseMove, buildDestination } from '../src/utils/transferDecision'
import { appraiseGmInvite } from '../src/utils/gmInvite'
import { gmInviteNoLine } from '../src/utils/chatLines'
import { ovr, retirementAgeOf } from '../src/utils/playerUtils'
import type { Player, Race, SeasonStanding, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2030
const MY = 'tokyo'
const TENURE_FROM = YEAR - 9

function buildWorld() {
  const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const cpu = generateCpuRosters(base, YEAR)
  const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
  const players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
    .map((p, i) => ({ ...p, contract: { ...p.contract, yearsLeft: 1 + (i % 3) } }))

  const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
  for (const d of DIVISIONS) {
    const rows = standings[d]
    rows.forEach((row, i) => {
      row.totalPoints = (rows.length - i) * DIVISION_RACES[d]
      for (let r = 0; r < DIVISION_RACES[d]; r++) row.raceResults.push({ raceId: `d${d}-r${r}`, rank: i + 1, points: rows.length - i })
    })
  }
  const foreignStandings: Record<string, SeasonStanding[]> = {}
  for (const l of fgen.updatedLeagues) foreignStandings[l.id] = l.clubs.map((c, i) => ({ teamId: c.id, totalPoints: (20 - i) * 5, raceResults: [] }))

  // ★移籍金を払える世界にしておく。払えないと「断られた」ではなく「金が無い」で
  //   止まり、②が一度も通らないまま緑になる
  const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 2_000_000_000 } })) as Team[]
  const allRaces = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)))
  const races: Race[] = allRaces.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } }) as Race)

  useGameStore.setState({
    isInitialized: true, playerTeamId: MY, teams, players,
    foreignLeagues: fgen.updatedLeagues,
    gmTenures: [{ teamId: MY, fromYear: TENURE_FROM }],
    gmOffers: [], pendingGmMove: null,
    currentSeason: {
      year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
      races, standings, foreignStandings, newsFeed: [], objectives: [],
      incomingOffers: [], transferListings: [], contractRequests: [],
    },
    pastSeasons: [], worldAthleticsResults: [{ year: YEAR }], worldRepresentatives: [],
  } as never)
}

const S = () => useGameStore.getState()
/** 声をかけて、実際に移ったかを返す（打診 → 受ける → endSeason で入れ替わる） */
function runInvite(pickPlayer: (roster: Player[]) => Player | undefined) {
  buildWorld()
  const before = S().players.filter(p => p.teamId === MY && p.status === 'active')
  const target = pickPlayer(before)
  S().resignAsGm()
  const destId = (S().gmOffers ?? [])[0]?.teamId ?? ''
  // ★声をかけた「その場」で返事が決まる（チャットで見せているのと同じ関数・同じ世界）。
  //   実際に動かすのは applyGmMove で、そちらも同じ関数を通る
  const st = S()
  const verdict = target ? appraiseGmInvite({
    players: st.players, teams: st.teams, foreignLeagues: st.foreignLeagues,
    currentSeason: st.currentSeason, fromTeamId: MY, destinationOf: st.destinationOf,
  }, target.id, destId) : null
  S().acceptGmOffer(destId, target?.id)
  S().endSeason()
  const after = S().players.find(p => p.id === target?.id)
  const rec = (S().transferHistory ?? []).find(r => r.playerId === target?.id && r.toTeamId === destId)
  return { destId, target, after, verdict, rec, spend: S().currentSeason.transferSpend ?? 0,
    moved: !!target && after?.teamId === destId }
}

console.log('[①] 声をかけなければ誰も動かない')
{
  const r = runInvite(() => undefined)
  check('行き先が決まっている（前提）', !!r.destId, r.destId)
  check('誰も移っていない', !r.moved)
  const stillOld = S().players.filter(p => p.teamId === MY && p.status === 'active').length
  check('旧クラブの人数が0でない（世界が空でない）', stillOld > 0, `${stillOld}人`)
}

console.log('\n[②③] 声をかけると、選手が自分で決める')
{
  // ★**強い順と弱い順の両方に声をかける。**
  //   名簿の並び順のまま12人に当てた最初の版は、たまたま控えばかりに当たって
  //   **12人全員が「出番がない」で断り**、頷く枝を1行も通していなかった。
  //   移った先で走れる選手（上位）と、走れない選手（下位）の両方が要る。
  let joined = 0, declined = 0
  let declineReason = ''
  for (let i = 0; i < 12; i++) {
    const r = runInvite(roster => {
      // ★**このオフに引退する選手は外す。** 移すのは `endSeason` の中なので、
      //   そこで引退した選手は名簿から消える＝「頷いたのに移っていない」に見える。
      //   引退年齢を 32〜40 から 30〜36 に下げたとき（2026-08-16）に実際に当たった。
      //   ここで外さないと、点検が測りたいこと（頷いた＝移る）から話がずれる
      const alive = roster.filter(p => p.age + 1 < retirementAgeOf(p))
      const sorted = alive.sort((a, b) => ovr(b) - ovr(a))
      // 偶数回は最強のほうから、奇数回は最弱のほうから
      return i % 2 === 0 ? sorted[i >> 1] : sorted[sorted.length - 1 - (i >> 1)]
    })
    if (!r.target) continue
    if (r.verdict?.ok) {
      joined++
      if (joined <= 3) console.log(`      行く例： ${r.target.name}（OVR${ovr(r.target)}）`)
      // ★チャットで「ついて行きます」と言われたら**必ず移る**（オーナー・2026-08-14）
      if (!r.moved) check('頷いたのに移っていない', false, r.target.name)
      // ★ふつうの移籍と同じ扱い：記録が残り、移籍金が新しいクラブの支出に乗る
      if (r.moved && !r.rec) check('移籍の記録が残っていない', false, r.target.name)
      if (r.moved && r.rec && r.rec.fee !== r.spend) {
        check('移籍金が支出に乗っていない', false, `${r.target.name} 記録${r.rec.fee} / 支出${r.spend}`)
      }
    }
    else if (r.verdict) {
      declined++; declineReason = r.verdict.reason
      if (declined <= 3) console.log(`      断った例： ${r.target.name} — ${r.verdict.shortReason}`)
      if (r.moved) check('断ったのに移っている', false, r.target.name)
      // 断り文句はそのままチャットの吹き出しになる。
      // ★引くのは判断（lead）で、一覧向けの説明文を流用しないこと
      //   （「19番手で出番がない」は本人には分からない数字）
      if (r.verdict.lead !== 'fee') {
        const line = gmInviteNoLine(r.verdict.lead, r.target).text
        if (!line.endsWith('。') || /\d+番手/.test(line)) check('断りの文がおかしい', false, line)
      }
    }
  }
  console.log(`      12人に声をかけた結果： 行く ${joined}人 / 断る ${declined}人`)
  // ★母数の確認。どちらかが0だと、その枝を1行も通さずに緑になる
  check('頷いた例がある', joined > 0, `${joined}件`)
  check('断った例がある', declined > 0, `${declined}件`)
  check('断り文句が空でない', declineReason.length > 0, declineReason)
}

console.log('\n[④] 愛着の向き先が監督になっている')
{
  buildWorld()
  const roster = S().players.filter(p => p.teamId === MY && p.status === 'active')
  const loyal = { ...roster[0], personality: 'loyalty' as const }
  const dest = buildDestination('sapporo', 8, S().players, { player: loyal })
  // 同じ選手・同じ行き先で、followGm の有無だけを変える
  const normal = appraiseMove(loyal, dest, { srcTier: 8 })
  const follow = appraiseMove(loyal, dest, { srcTier: 8, followGm: true })
  console.log(`      愛着タイプの personality： ふつうの移籍 ${normal.parts.personality} / 監督について行く ${follow.parts.personality}`)
  check('ふつうの移籍では愛着が引き止める（マイナス）', normal.parts.personality < 0, `${normal.parts.personality}`)
  check('監督について行くときは後押しになる（プラス）', follow.parts.personality > 0, `${follow.parts.personality}`)
  check('大きさは同じ（向きだけが変わる）',
    Math.abs(normal.parts.personality) === Math.abs(follow.parts.personality))
}

console.log('\n[⑤] 判定を2本目に増やしていない')
{
  // 判定の本体は utils/gmInvite の1本だけ。**呼ぶ側（ストア・画面）に書かないこと**
  const src = readFileSync('src/utils/gmInvite.ts', 'utf8')
  check('appraiseMove を通している', /appraiseMove\(/.test(src))
  check('followGm を渡している', /followGm:\s*true/.test(src))
  // 「監督への信頼」のような独自の点数を作っていないこと
  // ★コメントで「監督への信頼」に触れるのは構わない（作るなと書いてある）。
  //   **識別子**が生えていないかを見る（最初の版は自分のコメントに当たって落ちた）
  check('独自の点数表を作っていない', !/\b(gmTrust|loyaltyToGm|trustScore)\b/.test(src))
  check('移籍金は transferFeeFor 1本', /transferFeeFor\(/.test(src))

  // 呼ぶ側が自分で判定していないか（ストアも画面も appraiseGmInvite を呼ぶだけ）
  for (const f of ['src/store/slices/seasonSlice.ts', 'src/components/team/GmInviteChat.tsx']) {
    const t = readFileSync(f, 'utf8')
    check(`${f} は判定を書いていない`, /appraiseGmInvite\(/.test(t) && !/followGm/.test(t))
  }
}

console.log('')
if (problems.length > 0) { console.log(`✗ ${problems.length}件 NG`); process.exit(1) }
console.log('✓ 声をかけられて、行くかどうかは選手が決める')
