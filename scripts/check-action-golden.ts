/**
 * 【巨大アクションの分解用ゴールデン検査】runRace / endSeason を**同じ入力・同じ乱数**で走らせ、
 * 実行後の状態が前回確認したものと1バイトも変わっていないことを見る。
 *
 *   npm run check の一部として実行される。単体では:
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-action-golden.ts \
 *     --outfile=node_modules/.cache/check-ag.cjs --log-level=error \
 *     && node -r ./scripts/ls-shim.cjs node_modules/.cache/check-ag.cjs
 *
 * ■ 何のためにあるか
 *   runRace（約1,150行）と endSeason（約1,230行）を工程ごとの関数へ切り出す作業
 *   （docs/REFACTORING_DESIGN.md の P5）は、**挙動を1ミリも変えずに**構造だけを変える。
 *   目で見て確かめられる規模ではないので、機械に「前と同じ結果か」を言わせる。
 *
 *   1工程切り出すたびにこれを走らせ、差分ゼロを確認してからコミットすること。
 *
 * ■ 乱数について
 *   Math.random をシード固定のPRNGに差し替えてある（このファイルの冒頭で、
 *   ゲーム側のモジュールを import するより先に差し替わる）。
 *   したがって **Math.random() の呼ばれる回数と順序が変わると結果が変わる**。
 *   分解でそれが起きたら、それは「工程の切り方を間違えた」というサインなので、
 *   ゴールデンを引き直して誤魔化さず、切り方を直すこと。
 *
 * ■ 意図してゲームの挙動を変えたとき（バランス調整など）だけ、
 *   UPDATE_GOLDEN=1 を付けて実行し、差分をレビューしてからコミットする。
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

// ── 乱数のシード固定（他の import より先に効かせる） ──────────────────
let rngSeed = 20260811
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}
const resetRng = () => { rngSeed = 20260811 }

import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { generateIndividualEvents, generateSeasonRaces } from '../src/data/races'
import { newSeasonStandings, DIVISIONS, DIVISION_RACES, divisionOf } from '../src/utils/league'
import { assignLineupByTerrain } from '../src/engine/raceEngine'
import { stripEphemeral } from '../src/store/ephemeralState'
import { calcTransferValue, faMarketSalary, ovr } from '../src/utils/playerUtils'
import { draftPickValue } from '../src/data/economy'
import { teamRosterSize } from '../src/data/rosterRules'
import type { SeasonStanding, Team, Player, Race } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2030
const MY = 'tokyo'
const DIR = 'scripts/fixtures'

// ── シナリオ同士を隔離する ──────────────────────────────────────────
// **1シナリオ＝1プロセス**で走らせる（下の「振り分け」）。
//
// 同じプロセスで続けて走らせると、シナリオを1つ足しただけで後ろのシナリオの
// ゴールデンが変わった。zustand の状態を素に戻すだけでは足りず（setState は書いた
// キーしか置き換えない）、状態を丸ごと戻しても直らなかった＝**ストアの外にある
// モジュールの値**（カードIDの連番など）が持ち越されていた。
//
// 順序に依存する検査は、シナリオを足すたびに全部を引き直すことになり、
// **その引き直しに本物の差分が紛れる**。それでは安全網の意味が無いので、
// プロセスごと分ける。下の「素の状態」は同一プロセス内での念のための備え。
const PRISTINE_JSON: string = (() => {
  const s = useGameStore.getState() as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) if (typeof v !== 'function') out[k] = v
  return JSON.stringify(out)
})()
// **毎回作り直す**（同じ実体を配ると、どこかで中身を書き換えられたときに素の状態まで汚れる）
const pristine = (): Record<string, unknown> => JSON.parse(PRISTINE_JSON)

// ── 同じ初期状態を作る（毎回この関数から作り直す） ─────────────────────
function buildState(phase: 'regular' | 'postseason', racesDone: number) {
  resetRng()
  const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const cpu = generateCpuRosters(base, YEAR)
  const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
  let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
  // 契約年数をばらけさせる（満了が出ないと契約更新の枝を通らない）
  players = players.map((p, i) => ({ ...p, contract: { ...p.contract, yearsLeft: 1 + (i % 3) } }))

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

  const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
  const myTeam = teams.find(t => t.id === MY)!
  const allRaces = generateSeasonRaces(YEAR, divisionOf(myTeam))
  // racesDone 本だけ「消化済み」にする
  const races: Race[] = allRaces.map((r, i) => i < racesDone
    ? { ...r, results: { teamResults: [], segmentResults: [] } } as Race
    : r)

  useGameStore.setState({
    // 前のシナリオの残りを持ち越さないよう、素の状態へ戻してから組む（上の PRISTINE）
    ...pristine(),
    isInitialized: true,
    playerTeamId: MY,
    teams,
    players,
    foreignLeagues: fgen.updatedLeagues,
    currentSeason: {
      year: YEAR, phase, currentRaceIndex: racesDone,
      races, standings, foreignStandings, newsFeed: [], objectives: [],
      incomingOffers: [], transferListings: [], contractRequests: [],
    },
    pastSeasons: [],
    worldAthleticsResults: [],
    worldRepresentatives: [],
  } as never)
  return { players, races }
}

// ── ドラフトのシナリオ用：去年の順位表 ─────────────────────────────────
// ドラフト順（standingsPickNumbers / draftLotteryOrder）は pastSeasons が無いと
// 「開幕年」の枝（全チーム横並び・履歴なしの抽選）しか通らない。
// 「2年目以降」の枝（前年順位に基づく抽選・末尾は逆順）を実際に通すには、
// year-1 の順位表を持つ pastSeasons が1件要る。
function pastSeasonStandings(base: Team[]) {
  const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
  for (const d of DIVISIONS) {
    const rows = standings[d]
    // 今年の buildState とは逆順にする（順位が入れ替わっている、という自然な状態を作る）
    rows.forEach((row, i) => { row.totalPoints = (i + 1) * DIVISION_RACES[d] })
  }
  return standings
}

// ── 実行後の状態を安定した形で写し取る ────────────────────────────────
// 時刻など「走らせるたびに変わるのが当たり前」のものだけ落とす。
const VOLATILE = new Set(['saveTimestamp'])
// ID の一部に `Date.now()` を使っている場所が多い（card_ / evt_ / cr_ / ao_ / bid_ ほか）。
// その数字だけを伏せる。**IDの他の部分（誰の・何番目の札か）は伏せない**ので、
// 「札が増えた・順番が変わった」は今までどおり差分として出る。
const maskTime = (s: string) => s.replace(/(^|[_a-zA-Z])1[6-9]\d{11}(?=$|[_\W])/g, '$1<T>')

/** 状態を「トップレベルのキーごとのJSON文字列」に開く（丸ごとの本文も $all に入れる） */
function snapshotParts(): Record<string, string> {
  const s = stripEphemeral(useGameStore.getState() as never) as Record<string, unknown>
  const stable = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'string' ? maskTime(x) : x))
  const out: Record<string, string> = {}
  for (const k of Object.keys(s).sort()) {
    if (typeof s[k] === 'function' || VOLATILE.has(k)) continue
    out[k] = stable(s[k]) ?? 'undefined'
  }
  out.$all = Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n')
  return out
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

function compare(name: string, produce: () => void) {
  const file = `${DIR}/golden-${name}.json`
  let threw: string | null = null
  try {
    produce()
  } catch (e) {
    threw = (e as Error).stack ?? (e as Error).message
  }
  check(`${name} が例外なく走り切る`, threw === null, threw ? threw.split('\n').slice(0, 3).join(' / ') : '')
  if (threw) return

  const parts = snapshotParts()
  // 状態そのものは数MBあるのでリポジトリには置かず、キーごとのハッシュだけ保存する。
  // どのキーが変わったかはこれで分かる。中身を目で見たいときは下の dump を開く
  const hashes: Record<string, string> = {}
  for (const [k, v] of Object.entries(parts)) hashes[k] = `${sha(v)} (${v.length}B)`

  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(DIR, { recursive: true })
    writeFileSync(file, JSON.stringify(hashes, null, 1))
    console.log(`  ゴールデンを引き直した → ${file}（差分をレビューしてからコミット）`)
    return
  }
  let golden: Record<string, string>
  try {
    golden = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    console.log(`✗ ${file} が無い。UPDATE_GOLDEN=1 で生成してコミットすること`)
    problems.push(`${name}: ゴールデンが無い`)
    return
  }
  const changed = [...new Set([...Object.keys(golden), ...Object.keys(hashes)])]
    .filter(k => k !== '$all' && golden[k] !== hashes[k])
  const same = golden.$all === hashes.$all && changed.length === 0
  check(`${name} の実行後の状態が前回と同一`, same, same ? '' : `変わったのは ${changed.join(', ') || '(全体のみ)'}`)
  if (!same) {
    // 中身を見比べたいとき用に、いまの状態をキャッシュへ書き出す（コミット対象外）
    const dump = `node_modules/.cache/golden-${name}-actual.json`
    writeFileSync(dump, parts.$all)
    console.log(`      いまの状態: ${dump}`)
    console.log(`      前の状態を作るには: git stash && UPDATE_GOLDEN=1 <このスクリプト> で引き直して比較`)
    for (const k of changed) console.log(`      ${k}: ${golden[k] ?? '(無し)'} → ${hashes[k] ?? '(無し)'}`)
  }
}

const SCENARIOS: Record<string, () => void> = {}

SCENARIOS['runRace'] = () => {
  console.log('[runRace] 第1戦を走らせる')
  const { players } = buildState('regular', 0)
  const st = useGameStore.getState()
  const race = st.currentSeason.races[0]
  const roster = players.filter(p => p.teamId === MY && p.status === 'active')
  const lineup = assignLineupByTerrain(roster, race)
  compare('runRace', () => { useGameStore.getState().runRace(lineup) })
}

SCENARIOS['runRace-final'] = () => {
  console.log('[runRace-final] 最終戦。表彰と引退表明の発表が乗る')
  // 最終戦だけを通る枝がある（engine/seasonFinaleNews の表彰・引退表明）。
  // 開幕戦のシナリオだけだとそこが1行も動かないので、最終戦ぶんも見る
  const my = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].find(t => t.id === MY) as Team
  const n = generateSeasonRaces(YEAR, divisionOf(my)).length
  const { players } = buildState('regular', n - 1)
  const st = useGameStore.getState()
  const race = st.currentSeason.races[n - 1]
  const roster = players.filter(p => p.teamId === MY && p.status === 'active')
  const lineup = assignLineupByTerrain(roster, race)
  compare('runRace-final', () => { useGameStore.getState().runRace(lineup) })
}

SCENARIOS['endSeason'] = () => {
  console.log('[endSeason] 全戦消化後のオフシーズン')
  const my = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].find(t => t.id === MY) as Team
  const n = generateSeasonRaces(YEAR, divisionOf(my)).length
  buildState('postseason', n)
  compare('endSeason', () => { useGameStore.getState().endSeason() })
}

SCENARIOS['market-contract'] = () => {
  console.log('[market-contract] 契約更新の要求づくり → 提示 → 逆提示を受ける')
  // marketSlice の契約まわり（generateContractRequests / submitContractRenewalOffer /
  // acceptContractCounter）を一続きで通す。**分解の前に張る網。**
  buildState('regular', 3)
  const g = () => useGameStore.getState()
  compare('market-contract', () => {
    g().generateContractRequests()
    // **3つの返事（承諾・逆提示・拒否）を1回で全部通す**ように、提示額を変えて入れる。
    // 同じ倍率で3件出しても同じ枝しか動かない（実測：×0.95 承諾／×0.8 逆提示／×0.6 拒否）
    const RATIOS = [0.95, 0.8, 0.6]
    ;(g().currentSeason.contractRequests ?? []).slice(0, 3).forEach((r, i) => {
      g().submitContractRenewalOffer(r.id, Math.round(r.demandSalary * RATIOS[i]), r.demandYears)
    })
    for (const r of (g().currentSeason.contractRequests ?? []).slice(0, 3)) {
      if (r.status === 'countered') g().acceptContractCounter(r.id)
    }
  })
}

SCENARIOS['market-transfer'] = () => {
  console.log('[market-transfer] 買い取り打診 → 一斉逆提示 → 承諾')
  // marketSlice の売る側（counterAllIncomingOffers / acceptIncomingOffer）。
  // 打診は自分で差し込む（CPUの打診はレースを進めないと出ないため）。
  const { players } = buildState('regular', 3)
  const g = () => useGameStore.getState()
  // 自チームで一番強い選手に、2クラブから打診が来ている状態を作る
  const mine = players.filter(p => p.teamId === MY && p.status === 'active')
  const target = [...mine].sort((a, b) => ovr(b) - ovr(a))[0]
  const buyers = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].filter(t => t.id !== MY).slice(0, 2)
  const price = calcTransferValue(target)
  useGameStore.setState({
    currentSeason: {
      ...g().currentSeason,
      incomingOffers: buyers.map((t, i) => ({
        id: `io-${i}`, fromTeamId: t.id, playerId: target.id,
        offeredPrice: Math.round(price * (0.9 + i * 0.2)), expiresAtRace: 9, round: 1,
      })),
    },
  } as never)
  compare('market-transfer', () => {
    // 一斉逆提示 → 払えるクラブだけが残る
    g().counterAllIncomingOffers(target.id, Math.round(price * 1.3))
    // 残っていれば先頭を承諾する
    const rest = g().currentSeason.incomingOffers ?? []
    if (rest.length > 0) g().acceptIncomingOffer(rest[0].id, true)
  })
}

SCENARIOS['draft-flow'] = () => {
  console.log('[draft-flow] オフのドラフト：CPU整理 → 指名を最後まで進める → 未指名を後始末')
  // draftSlice の中核（beginSeasonDraft/playerPick/cpuPick/advanceDraft）を一続きで通す。
  // beginSeasonDraft は CPUの解雇・移籍・レンタル・FA補強もここで一気に走る（911行の大半）。
  const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const n = generateSeasonRaces(YEAR, divisionOf(base.find(t => t.id === MY))).length
  buildState('postseason', n)
  const g = () => useGameStore.getState()
  // ★2年目以降の枝（前年順位に基づく指名順）を実際に通すため、去年の順位表を入れておく。
  //   これが無いと「開幕年」の枝（全チーム横並びの抽選）しか通らない
  useGameStore.setState({ pastSeasons: [{ year: YEAR - 1, races: [], collegeRaces: [], standings: pastSeasonStandings(base) }] } as never)
  compare('draft-flow', () => {
    g().beginSeasonDraft()
    // 指名を最後まで進める。自チームの番は先頭候補を指名、それ以外はCPU任せ。
    // pool は指名のたびに減るので、上限は pickOrder の長さで十分に足りる（無限ループの保険）
    const cap = (g().draftState?.pickOrder.length ?? 0) + 5
    for (let i = 0; i < cap; i++) {
      const ds = g().draftState
      if (!ds || ds.isComplete) break
      if (ds.pickOrder[ds.currentPick] === MY) g().playerPick(ds.pool[0]?.id ?? '')
      else g().cpuPick()
    }
    // 未指名の候補をFAへ落とし、来年ぶんの指名権を配る
    g().advanceDraft()
  })
}

SCENARIOS['draft-dev-prospect'] = () => {
  console.log('[draft-dev-prospect] 育成候補の獲得：予算内は成立、予算超過は不成立')
  buildState('regular', 3)
  const g = () => useGameStore.getState()
  const mk = (id: string, fee: number): import('../src/types').DevProspect => ({
    id, name: `育成${id}`, age: 18, origin: '', nationality: 'JPN',
    specialty: 'allrounder', potential: 75,
    trueRatings: { speed: 60, stamina: 60, mountainUp: 60, mountainDown: 60, pacing: 60, mental: 60, recovery: 60 },
    signingFee: fee, scouted: false,
  })
  // 1人目は予算内（成立）、2人目はチーム予算(4億)を超える額（不成立）にして両方の枝を通す
  useGameStore.setState({
    currentSeason: { ...g().currentSeason, devProspects: [mk('dp-ok', 10_000_000), mk('dp-over', 500_000_000)] },
  } as never)
  compare('draft-dev-prospect', () => {
    const before = teamRosterSize(g().players, MY)
    g().signDevProspect('dp-ok')
    g().signDevProspect('dp-over')
    console.log(`      在籍 ${before} → ${teamRosterSize(g().players, MY)}`)
  })
}

SCENARIOS['draft-pick-sale'] = () => {
  console.log('[draft-pick-sale] 指名権の売却：成立／価格超過で不成立／買い手の予算不足で不成立')
  buildState('regular', 3)
  const g = () => useGameStore.getState()
  const BUYER_OK = 'yokohama'
  const BUYER_POOR = 'sendai'
  const picks = [
    { year: YEAR + 1, round: 1, pickNumber: 3, originallyOwnedBy: MY },
    { year: YEAR + 1, round: 2, pickNumber: 5, originallyOwnedBy: MY },
    { year: YEAR + 2, round: 1, pickNumber: 7, originallyOwnedBy: MY },
  ]
  const keyOf = (p: typeof picks[number]) => `${p.year}-R${p.round}-${p.pickNumber}`
  useGameStore.setState({
    teams: g().teams.map(t => {
      if (t.id === MY) return { ...t, draftPicks: picks }
      // 買い手の1人をわざと予算不足にして「払えない」の枝も通す
      if (t.id === BUYER_POOR) return { ...t, finance: { ...t.finance, budget: 1_000_000 } }
      return t
    }),
  } as never)
  compare('draft-pick-sale', () => {
    const okResult = g().sellDraftPick(keyOf(picks[0]), BUYER_OK, draftPickValue(picks[0].round, picks[0].pickNumber))
    const overpriced = g().sellDraftPick(keyOf(picks[1]), BUYER_OK, Math.round(draftPickValue(picks[1].round, picks[1].pickNumber) * 1.5))
    const cantAfford = g().sellDraftPick(keyOf(picks[2]), BUYER_POOR, 50_000_000)
    console.log(`      成立=${okResult} 価格超過で不成立=${!overpriced} 予算不足で不成立=${!cantAfford}`)
  })
}

SCENARIOS['market-trade'] = () => {
  console.log('[market-trade] トレードの打診→逆提示→承諾／相手からの打診を飲む・飲めない')
  // marketSlice のトレード（proposeTrade 73 / acceptTradeCounter / tradePlayer 138 /
  // acceptTradeOffer 103）。分解の前に張る網。
  //
  // ★**枝を通していることを出力で確かめること。** 最初に書いた版は
  //   「相手が手放すものに見合わない」で全部はじかれ、成立側を1行も通っていなかった。
  //   どの組み合わせがどの枝に落ちるかは総当たりで数えて選んである（釣り合いの判定は
  //   utils/tradeValue なので、序列が1つ違うだけで枝が変わる）
  const { players } = buildState('regular', 3)
  const gg = () => useGameStore.getState()
  const P1 = 'osaka', P2 = 'nagoya'
  const byOvr = (teamId: string) => players.filter(p => p.teamId === teamId && p.status === 'active').sort((a, b) => ovr(b) - ovr(a))
  const mine = byOvr(MY), t1 = byOvr(P1), t2 = byOvr(P2)
  const at = (id: string) => gg().players.find(p => p.id === id)?.teamId
  compare('market-trade', () => {
    // 1) 相手から届いた打診を飲む（成立）と、飲めない打診（釣り合わない＝通知に残す）。
    //    **先にこれをやる。** あとの proposeTrade で選手が動くと、要求された選手が
    //    もう自分のところに居なくなり、成立の枝を通れなくなる
    useGameStore.setState({ currentSeason: { ...gg().currentSeason, pendingTradeOffers: [
      { id: 'tx-ok', fromTeamId: P2, offeredPlayerIds: [t2[3].id], requestedPlayerIds: [mine[1].id], expiresAtRace: 9, message: 'm' },
      { id: 'tx-ng', fromTeamId: P2, offeredPlayerIds: [t2[15].id], requestedPlayerIds: [mine[2].id], expiresAtRace: 9, message: 'm' },
    ] } } as never)
    gg().acceptTradeOffer('tx-ok')
    gg().acceptTradeOffer('tx-ng')
    // 2) 打診 → 逆提示（「これも付けてくれ」）→ 承諾で成立
    gg().proposeTrade(P1, [mine[0].id], [], [t1[0].id], [])
    const neg = (gg().currentSeason.tradeNegotiations ?? []).find(n => n.targetTeamId === P1)
    const negStatus = neg?.status ?? '(無し)'
    const demanded = neg?.demandAddIds?.length ?? 0
    if (neg && neg.status === 'countered') gg().acceptTradeCounter(neg.id)
    // 3) 話にならない条件（rejected の枝）：控え1人でエース2人を要求する
    gg().proposeTrade(P2, [mine[19].id], [], [t2[0].id, t2[1].id], [])
    const neg2 = (gg().currentSeason.tradeNegotiations ?? []).find(n => n.targetTeamId === P2)
    // 4) 指名権と現金をつけたトレード（engine/tradeExecution の指名権の交換と、現金の受け渡し）
    const myPick = { year: YEAR + 1, round: 1, pickNumber: 3, originallyOwnedBy: MY }
    const theirPick = { year: YEAR + 1, round: 2, pickNumber: 5, originallyOwnedBy: P2 }
    const keyOf = (pk: typeof myPick) => `${pk.year}-R${pk.round}-${pk.pickNumber}`
    useGameStore.setState({ teams: gg().teams.map(t =>
      t.id === MY ? { ...t, draftPicks: [myPick] } : t.id === P2 ? { ...t, draftPicks: [theirPick] } : t) } as never)
    const withPick = gg().tradePlayer([mine[18].id], [t2[6].id], P2, 30_000_000, [keyOf(myPick)], [keyOf(theirPick)])
    const myPicksAfter = (gg().teams.find(t => t.id === MY)?.draftPicks ?? []).map(keyOf).join(',')
    console.log(`      飲んだ=${at(t2[3].id) === MY} 飲めなかった=${at(t2[15].id) === P2}`
      + ` / 打診の返事=${negStatus}(要求追加${demanded}人) 成立=${at(t1[0].id) === MY}`
      + ` / 話にならない打診=${neg2?.status ?? '(無し)'}`
      + ` / 指名権つき=${withPick.ok}${withPick.reason ? `(${withPick.reason})` : ''} 手持ちの指名権=${myPicksAfter || 'なし'}`)
  })
}

SCENARIOS['market-acquisition'] = () => {
  console.log('[market-acquisition] 獲得オファー（FA・引き抜き／通る額と通らない額）')
  // marketSlice の submitAcquisitionOffer（111行）。**4枝とも通す**。
  //   FA で加入する／FAだが本人が納得しない（not_convinced）
  //   引き抜きで加入する／額が足りない（low_offer）
  // 「納得しない」は年俸をいくら積んでも変わらない（そのクラブで走れるかを見ているため）。
  // 額で落とす枝は引き抜き側で作る
  const { players } = buildState('regular', 3)
  const gg = () => useGameStore.getState()
  const byOvr = (teamId: string) => players.filter(p => p.teamId === teamId && p.status === 'active').sort((a, b) => ovr(b) - ovr(a))
  const fas = byOvr('sapporo'), poach = byOvr('osaka')
  const faOk = fas[0].id, faNo = fas[6].id           // 走れる／走れない
  const poachOk = poach[6].id, poachLow = poach[12].id
  // この世界には無所属が居ないので、2人だけ FA にする
  useGameStore.setState({ players: gg().players.map(p => (p.id === faOk || p.id === faNo) ? { ...p, teamId: '' } : p) } as never)
  const ask = (id: string) => Math.round(faMarketSalary(gg().players.find(p => p.id === id)!))
  const offer = (id: string, src: 'fa' | 'scout', mult: number) => {
    gg().startAcquisitionOffer(id, src)
    const o = (gg().currentSeason.acquisitionOffers ?? []).find(x => x.playerId === id)
    if (o) gg().submitAcquisitionOffer(o.id, Math.round(ask(id) * mult), 3, 'standard')
  }
  compare('market-acquisition', () => {
    offer(faOk, 'fa', 1.0)
    offer(faNo, 'fa', 2.5)
    offer(poachOk, 'scout', 1.0)
    offer(poachLow, 'scout', 0.4)
    const st = (id: string) => {
      const o = (gg().currentSeason.acquisitionOffers ?? []).find(x => x.playerId === id)
      return `${o?.status ?? '(無し)'}${o?.rejectReason ? `/${o.rejectReason}` : ''}`
    }
    console.log(`      FA成立=${st(faOk)} FA不成立=${st(faNo)} 引き抜き成立=${st(poachOk)} 額不足=${st(poachLow)}`)
  })
}

SCENARIOS['race-event'] = () => {
  console.log('[race-event] シーズン中のイベント：全19種 × 全選択肢を順に決着させる')
  // resolveEvent（178行）は「イベントの種類 × 選んだ肢」の巨大な if-else。
  // 実際に出るイベントは runRace の中で確率で選ばれるので、golden 任せにすると
  // **通る枝が引き次第**になる。ここでは札を自分で並べて**全部の枝を必ず通す**。
  //
  // ★選択肢の数は種類ごとに違うが、3つ渡しても存在しない肢は else に落ちるだけ。
  //   「肢2は何も起きない」という枝も、起きないことを含めて記録に残る。
  const { players } = buildState('regular', 3)
  const g = () => useGameStore.getState()
  const TYPES = [
    'player_fatigue', 'player_morale_low', 'player_form_up', 'player_wants_renewal',
    'young_breakout', 'sponsor_offer', 'media_interview', 'press_conference',
    'playing_time_demand', 'transfer_request', 'board_warning', 'player_milestone',
    'budget_boost', 'player_retirement', 'veteran_ambition', 'rival_provocation',
    'ai_poaching', 'team_chemistry', 'budget_crisis',
  ] as const
  // 対象の選手は毎回変える（同じ人に19種を当てると士気が上下限に張り付いて、
  // 上げ下げの差が消えてしまう＝壊しても差分が出なくなる）
  const mine = players.filter(p => p.teamId === MY && p.status === 'active')
  const events: unknown[] = []
  TYPES.forEach((type, ti) => {
    for (let c = 0; c < 3; c++) {
      events.push({
        id: `ev-${type}-${c}`, raceIndex: 3, type,
        playerId: mine[(ti * 3 + c) % mine.length].id,
        title: type, body: '', resolved: false,
        choices: [{ label: 'a', desc: '' }, { label: 'b', desc: '' }, { label: 'c', desc: '' }] })
    }
  })
  useGameStore.setState({ currentSeason: { ...g().currentSeason, events } } as never)
  compare('race-event', () => {
    for (const e of events as { id: string }[]) {
      const c = Number(e.id.slice(-1))
      g().resolveEvent(e.id, c)
    }
    // 決着済みの札をもう一度押しても何も起きない（二度押しガード）
    g().resolveEvent('ev-sponsor_offer-0', 1)
    // 知らないIDは無視
    g().resolveEvent('ev-nothing', 0)
    const resolved = (g().currentSeason.events ?? []).filter(e => e.resolved).length
    const escalated = (g().currentSeason.events ?? []).length - events.length
    console.log(`      決着 ${resolved}/${events.length}件 / 追加で湧いた札（移籍要求の硬化）${escalated}件`
      + ` / 評判=${g().gmRep} 資金=${g().teams.find(t => t.id === MY)?.finance.budget}`)
  })
}

SCENARIOS['race-timetrial'] = () => {
  console.log('[race-timetrial] 記録会：国内だけの回と、海外も出る回')
  // simulateIndividualEvent（194行）。走る人の絞り込み・自己ベスト・疲労・カード報酬・
  // 世界記録／日本記録・チーム歴代記録・ニュースが1本に入っている。
  //
  // ★2本走らせるのは、**海外クラブの選手が出る回と出ない回で対象が変わる**ため。
  //   海外も出るのは指定4記録会（tt-5k-1 / tt-10k-2 / tt-mara / tt-half-2）だけなので、
  //   国内だけの回はそれ以外から選ぶ。距離も分けて、自己ベストの種目キーと
  //   疲労の増え方（10000m=5 / マラソン=14）を両方通す。
  // ★自チームの選手を最強にする。そうしないと5,800人中の順位が100位より下になり、
  //   **カード報酬も世界記録も1行も通らない**（最初に書いた版が実際にそうだった）。
  buildState('regular', 3)
  const g = () => useGameStore.getState()
  const evts = generateIndividualEvents(YEAR)
  const domesticOnly = evts.find(e => e.id.startsWith('tt-10k-1'))!
  const withForeign = evts.find(e => e.id.startsWith('tt-mara'))!
  const mine = g().players.filter(p => p.teamId === MY && p.status === 'active')
  const cpuOne = g().players.find(p => p.teamId === 'osaka' && p.status === 'active')!
  useGameStore.setState({
    players: g().players.map(p => {
      // 自チームは1位〜上位を取れる強さに（カード報酬 legendary/epic/rare と記録の枝）。
      // ★**自チームの1人はわざと疲労40以上にする。** 出るか休むかを決めるのは
      //   プレイヤーなので、自チームだけは疲れていても自動的には外れない——という
      //   決まりを通すため。疲れた自チームの選手が1人も居なかったころは、
      //   その除外を消しても golden が緑のままだった（＝壊しても落ちない網）
      if (p.teamId === MY) return { ...p, fatigue: p.id === mine[1].id ? 55 : (p.fatigue ?? 0),
        ratings: Object.fromEntries(Object.keys(p.ratings).map(k => [k, 99])) as typeof p.ratings }
      // CPUの1人は疲労40以上で自動的に休む枝へ
      return p.id === cpuOne.id ? { ...p, fatigue: 55 } : p
    }),
    currentSeason: { ...g().currentSeason, individualEvents: [domesticOnly, withForeign],
      // ★スカウト候補（大学・高校のドラフト候補）も記録会を走る。まだどこにも所属して
      //   いないので teamId は空で、疲労も士気も報酬も付かず記録だけ残る。
      //   3人目は**わざと名簿の選手と同じID**にしてある。二重に走らせない除外を通すため
      //   （候補が1人も居なかったころは、その除外を消しても golden が緑のままだった）
      scoutProspects: [
        { ...mine[2], id: 'prospect-1', name: '候補1', teamId: '', status: 'draft_eligible', eventBests: undefined },
        { ...mine[3], id: 'prospect-2', name: '候補2', teamId: '', status: 'active', eventBests: undefined },
        { ...mine[4], teamId: '', status: 'draft_eligible' },
        // 引退した候補は走らない（status の絞り込みを通すため）
        { ...mine[5], id: 'prospect-retired', name: '候補引退', teamId: '', status: 'retired', eventBests: undefined },
      ] } } as never)
  compare('race-timetrial', () => {
    // 自チームの1人は「休む」を指定（skipPlayerIds の枝）
    g().simulateIndividualEvent(domesticOnly.id, [mine[0].id])
    g().simulateIndividualEvent(withForeign.id)
    // 済んだ記録会をもう一度押しても走り直さない
    g().simulateIndividualEvent(domesticOnly.id)
    const done = (g().currentSeason.individualEvents ?? []).filter(e => e.results)
    const r0 = done[0]?.results ?? [], r1 = done[1]?.results ?? []
    const myTop = r0.filter(r => r.teamId === MY && r.rank <= 10).length
    console.log(`      出走 ${r0.length}人（国内だけ） / ${r1.length}人（海外も出る回）`
      + ` / 休ませた=${!r0.some(r => r.playerId === mine[0].id)}`
      + ` 疲労で外れたCPU=${!r0.some(r => r.playerId === cpuOne.id)}`
      + ` 疲れていても走る自チーム=${r0.some(r => r.playerId === mine[1].id)}`
      + ` / 候補が走った=${r0.some(x => x.playerId === 'prospect-1')}`
      + ` 二重登録は1回だけ=${r0.filter(x => x.playerId === mine[4].id).length}`
      + ` 引退した候補は走らない=${!r0.some(x => x.playerId === 'prospect-retired')}`
      + ` 候補に自己ベスト=${!!(g().currentSeason.scoutProspects ?? []).find(x => x.id === 'prospect-1')?.eventBests}`
      + ` / 自チームの10位以内 ${myTop}人 カード${(g().trainingCards ?? []).length}枚`
      + ` 世界記録${Object.keys(g().worldRecords ?? {}).length}種目`
      + ` 日本記録${Object.keys(g().japanRecords ?? {}).length}種目`)
  })
}

// ── 振り分け ────────────────────────────────────────────────────────
// GOLDEN_ONLY があればそのシナリオだけを走らせる（子プロセス側）。
// 無ければ、シナリオごとに自分自身を1回ずつ呼び直す（親プロセス側）。
const only = process.env.GOLDEN_ONLY
if (only) {
  const run = SCENARIOS[only]
  if (!run) { console.log(`✗ 知らないシナリオ: ${only}`); process.exit(1) }
  run()
  console.log('')
  if (problems.length === 0) process.exit(0)
  for (const p of problems) console.log(`  ${p}`)
  process.exit(1)
}

console.log('巨大アクションのゴールデン検査（シード固定・1シナリオ1プロセス）')
console.log('')
let failed = 0
for (const name of Object.keys(SCENARIOS)) {
  const r = spawnSync(process.execPath, ['-r', './scripts/ls-shim.cjs', process.argv[1]], {
    env: { ...process.env, GOLDEN_ONLY: name },
    stdio: 'inherit',
  })
  if (r.status !== 0) failed++
}
console.log('')
if (failed === 0) {
  console.log('✓ 分解しても、レースもオフシーズンも前とまったく同じ結果になる')
  process.exit(0)
}
console.log(`✗ ${failed}シナリオが落ちました`)
process.exit(1)
