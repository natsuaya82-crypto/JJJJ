import { hasNoPlayingTime, isSurplus } from '../utils/transferDecision'
import type { ForeignClub, ForeignLeague, Player, Team, TransferRecord } from '../types'
import { comparePlayers } from '../utils/playerSort'
import { ovr, transferFeeFor } from '../utils/playerUtils'
// 「どのタイプが足りていないか」は国内・海外で共通の1本（utils/squadNeeds.ts）
import { weakestSpecialty, bestOvrInSpecialty, needsPlayer, wouldMakeLineup } from '../utils/squadNeeds'
import { ROSTER_MAX, ROSTER_MIN, CPU_SELL_FLOOR } from '../data/rosterRules'
// 所属は player.teamId が唯一の持ち場。クラブ側に名簿は無いのでここから引く
import { clubMembersByClub, squadIdsOf } from '../utils/rosterSync'
// 海外クラブの引き場所は utils/clubs 1本。「4大リーグ」は廃止（強さは格で言う）
import { allForeignClubs } from '../utils/clubs'
// 選手がクラブを移るときの後始末は movePlayer.ts に一本化（所属・名簿・移籍金・移籍履歴）
import { movePlayer } from '../utils/movePlayer'
// 海外クラブの年間予算（クラブIDとリーグから毎回同じ額が出る）
import { tierBudget, tierOf, tierStrength, isBigClub, isStepUp, MAJOR_NEWS_OVR } from '../utils/clubTier'


// 「そのリーグが受け入れるOVRの下限」と「年齢を加味した実効OVR」は
// utils/foreignClubProfile.ts の1本（gameStore の打診生成も同じ物差しを使う）

// ニュースの形と文面は utils/newsItems 1本（ここで別の型・別の文面を作らない）
import type { NewsItem } from '../utils/newsItems'
import { transferHeadline, seekPlayingTimeHeadline, crossBorderHeadline, overseasBreakthroughHeadline } from '../utils/newsItems'

// 移籍履歴（transferHistory）に積む成立記録。チーム詳細の移籍ページで日付・移籍金を表示するために返す。
// movePlayer が作る記録をそのまま積むので、型は本体の TransferRecord に合わせる
type TxRecord = TransferRecord

// シーズンオフに海外クラブ間の移籍（引き抜き）を発生させる。強いクラブが他クラブの
// 主力を引き抜き、選手が国境・リーグを越えて移動する。プレイヤーは干渉しない（結果のみ）。
// maxMoves/includeDecline/date はシーズン中の少量発生用（省略時はオフの一括想定）
export function simulateForeignTransferMarket(params: {
  foreignLeagues: ForeignLeague[]
  players: Player[]
  year: number
  maxMoves?: number        // 引き抜き件数の上書き（省略時はクラブ数比例）
  includeDecline?: boolean // 都落ち移籍も回すか（省略時true。シーズン中はfalse）
  date?: string            // ニュース・履歴の日付（省略時は1/20）
  /**
   * ④本人が行くか（`appraiseMove`）。**省略すると聞かない**（呼び出し側の移行用）。
   *
   * ★**海外を特別扱いしない**（CLAUDE.md）。国内とまったく同じ関門で、
   *   違うのは「どの順位表で序列を引くか」だけ——それは `destinationOf` の中の話。
   *   候補を絞るところで通すこと。あとから弾くと「動かない」だけになり、
   *   本人が納得する別の相手が選ばれない。
   */
  consents?: (player: Player, toClubId: string, fromClubId: string) => boolean
}): { foreignLeagues: ForeignLeague[]; players: Player[]; news: NewsItem[]; records: TxRecord[] } {
  const { foreignLeagues, players, year } = params
  const txDate = params.date ?? `${year}-01-20`
  const allClubs = allForeignClubs(foreignLeagues)
  if (allClubs.length < 2) return { foreignLeagues, players, news: [], records: [] }

  const nameById = new Map(allClubs.map(c => [c.id, c.name]))
  const playerById = new Map(players.map(p => [p.id, p]))

  // 各クラブの現在の在籍（可変コピー）
  const roster: Record<string, string[]> = {}
  const membersByClub = clubMembersByClub(players)
  for (const club of allClubs) roster[club.id] = [...(membersByClub.get(club.id) ?? [])]

  // 海外クラブの手元資金。**国内チームと同じで finance.budget が唯一の置き場所**
  //（`simulateCrossBorderTransfers` とまったく同じ引き方。格から作り直さない）。
  //
  // ★以前ここには**お金が1円も無かった**。海外↔海外の移籍は `fee: 0` で記録され、
  //   他クラブの1番手を無条件・無料で引き抜けた。実測20件すべてが出す側の1〜4番手。
  //   国内CPU間には「余剰は市場価値どおり／主力は割増＋本人同意」があるのに、
  //   海外だけ払わずに主力を取れるので、強いクラブに一方的に集まっていた。
  const fBudget: Record<string, number> = {}
  for (const c of allClubs) fBudget[c.id] = c.finance?.budget ?? tierBudget(c)

  // 「どちらが格上か」はクラブの格1本（tierOf）。以前はロスターの平均OVRで比べていたが、
  // それだと強い名簿だから引き抜ける→だから強い名簿のまま、と循環する。
  // 格は前年の順位で外から決まるので循環しない。

  const moves: { playerId: string; fromClubId: string; toClubId: string; fee: number }[] = []
  const movedPlayers = new Set<string>()
  // 件数はクラブ数に比例（移籍を活発化：180クラブなら約72〜108件/年）。
  const MOVE_BASE = Math.max(12, Math.round(allClubs.length * 0.4))
  const MOVE_COUNT = params.maxMoves ?? (MOVE_BASE + Math.floor(Math.random() * (MOVE_BASE * 0.5)))
  // どれだけ積極的に引き抜くかは**そのクラブの格**で決まる（格1が一番動く）。
  // 以前は「4大リーグかどうか」で見ていたが、格は毎年動くのにリーグは動かないので、
  // 格2から格9まで落ちたクラブがいつまでも最上位と同じ勢いで引き抜いていた。
  // ★格はクラブの実体から引く（tierOf）。tierOfClubId は clubTiers.ts の**初期値**しか見ないので、
  //   同じ関数の中で資金は今の値を見ているのに積極性だけ初期値、という食い違いになっていた。
  const aggression = (c: ForeignClub) => 1 + 1.4 * tierStrength(tierOf(c))
  const weightedPick = <U,>(arr: U[], w: (x: U) => number): U => {
    const total = arr.reduce((s, x) => s + Math.max(1, w(x)), 0)
    let r = Math.random() * total
    for (const x of arr) { r -= Math.max(1, w(x)); if (r <= 0) return x }
    return arr[arr.length - 1]
  }

  for (let i = 0; i < MOVE_COUNT; i++) {
    // 引き抜く側：上限(30)未満のクラブ。引退等で人数が減ったクラブほど動く（穴埋め型の補強）
    const buyerPool = allClubs.filter(c => roster[c.id].length < ROSTER_MAX)
    if (buyerPool.length === 0) continue
    // 格上のクラブほど積極的に引き抜く（世界のスターが集まる）
    const buyer = weightedPick(buyerPool, c => (ROSTER_MAX - roster[c.id].length) * (roster[c.id].length < 22 ? 3 : 1) * aggression(c))
    // 売る側：buyer 以外で下限(18)超のクラブから、buyer と同格以下の相手を優先（放出しても18で止まる）
    const sellers = allClubs.filter(c => c.id !== buyer.id && roster[c.id].length > CPU_SELL_FLOOR)
    if (sellers.length === 0) continue
    const weaker = sellers.filter(c => tierOf(c) >= tierOf(buyer))
    const seller = (weaker.length > 0 ? weaker : sellers)[Math.floor(Math.random() * (weaker.length > 0 ? weaker.length : sellers.length))]

    // 引き抜く選手：seller の中位〜上位（未移動）から1人
    const sellRoster = roster[seller.id]
      .map(id => playerById.get(id))
      .filter((p): p is Player => !!p && p.status === 'active')
      .sort(comparePlayers('ovr'))
    const candidates = sellRoster.filter(p => !movedPlayers.has(p.id)).slice(0, 10)   // 上位10人が引き抜き対象
    if (candidates.length === 0) continue
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    // ★関門は「必要か」と「そのクラブで走れるか」だけ（utils/squadNeeds 1本）。
    //   格1のクラブは名簿が強いので弱い選手は自動的に序列の下に沈み、ここで落ちる。
    //   OVRの下限表は要らない（16番手になる選手をわざわざ獲るクラブはいない）。
    const buyerRoster = roster[buyer.id].map(id => playerById.get(id)).filter((x): x is Player => !!x)
    if (!needsPlayer(buyerRoster, target) && !wouldMakeLineup(buyerRoster, target)) continue
    // ②出す側にとって余剰か（国内CPU間とまったく同じ1本）→ ③対価も同じ1本。
    //   余剰は市場価値どおり、主力の引き抜きは割増。**払えないクラブは引き抜けない**
    const surplus = isSurplus({ squadRank: sellRoster.findIndex(x => x.id === target.id) + 1 })
    const fee = transferFeeFor(target, surplus)
    if (fBudget[buyer.id] < fee) continue
    // ④本人が行くか（国内とまったく同じ関門）
    if (params.consents && !params.consents(target, buyer.id, seller.id)) continue

    // 実行
    roster[seller.id] = roster[seller.id].filter(id => id !== target.id)
    roster[buyer.id] = [...roster[buyer.id], target.id]
    fBudget[buyer.id] -= fee
    fBudget[seller.id] += fee
    movedPlayers.add(target.id)
    moves.push({ playerId: target.id, fromClubId: seller.id, toClubId: buyer.id, fee })
  }

  // 都落ち移籍：30歳以上でクラブ内序列が上位10から陥落した元スター/中堅が、
  // 出場機会を求めて自クラブより平均OVRの低いクラブへ移る（年2〜4件）。
  // 「若手台頭→ベテラン序列陥落→格下へ移籍 or 日本行き」のキャリア循環を作る
  const declineMoved = new Set<string>()
  const DECLINE_MOVES = params.includeDecline === false ? 0 : 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < DECLINE_MOVES; i++) {
    const sellers = allClubs.filter(c => roster[c.id].length > CPU_SELL_FLOOR)
    if (sellers.length === 0) break
    const seller = sellers[Math.floor(Math.random() * sellers.length)]
    const sorted = roster[seller.id]
      .map(id => playerById.get(id))
      .filter((p): p is Player => !!p && p.status === 'active' && !movedPlayers.has(p.id))
      .sort(comparePlayers('ovr'))
    // 出番が無い＝序列が「走れる人数の2倍」より下（utils/transferDecision 1本）。
    // 11番手の直書きをやめた。国内CPUもこの判定を通す
    const fallen = sorted.filter((p, i) => hasNoPlayingTime(i + 1) && p.age >= 30)
    if (fallen.length === 0) continue
    const target = fallen[Math.floor(Math.random() * fallen.length)]
    // ②③ここへ来る選手は序列が「走れる人数の2倍」より下＝余剰なので、対価は市場価値どおり。
    //   それでも**タダではない**（払えないクラブは受け取れない）
    const fee = transferFeeFor(target, isSurplus({ squadRank: sorted.findIndex(x => x.id === target.id) + 1 }))
    // 行き先は自クラブより格下の（＝出番を得やすい）空きのあるクラブ。
    // 「そこで走れるか」が条件（出場機会を求めて動くのだから、走れない先へは行かない）
    const dests = allClubs.filter(c => {
      if (c.id === seller.id || roster[c.id].length >= ROSTER_MAX || tierOf(c) <= tierOf(seller)) return false
      if (fBudget[c.id] < fee) return false
      if (!wouldMakeLineup(roster[c.id].map(id => playerById.get(id)).filter((x): x is Player => !!x), target)) return false
      // ④本人が行くか（国内とまったく同じ関門）
      return !params.consents || params.consents(target, c.id, seller.id)
    })
    if (dests.length === 0) continue
    const dest = dests[Math.floor(Math.random() * dests.length)]
    roster[seller.id] = roster[seller.id].filter(id => id !== target.id)
    roster[dest.id] = [...roster[dest.id], target.id]
    fBudget[dest.id] -= fee
    fBudget[seller.id] += fee
    movedPlayers.add(target.id)
    declineMoved.add(target.id)
    moves.push({ playerId: target.id, fromClubId: seller.id, toClubId: dest.id, fee })
  }

  if (moves.length === 0) return { foreignLeagues, players, news: [], records: [] }

  // 国内の名簿・お金は動かない。それでも同じ movePlayer を通すことで、
  // 所属・加入年・移籍金・移籍リストの札はがしが国内の移籍とまったく同じ後始末になる
  let updatedPlayers: Player[] = players
  const records: TxRecord[] = []
  for (const m of moves) {
    const r = movePlayer({ players: updatedPlayers, teams: [] }, m.playerId, m.toClubId, {
      year, date: txDate, fee: m.fee,
      years: playerById.get(m.playerId)?.contract.yearsLeft,
      toName: nameById.get(m.toClubId) ?? '',
    })
    if (!r.ok) continue
    updatedPlayers = r.players
    if (r.record) records.push(r.record)
  }

  // クラブ側の名簿は持たない（所属は上で更新した players の teamId が唯一の記録）。
  // 動くのはお金だけ：買えば減り、売れば増える。**書き戻さないと使っても減らない**
  const updatedLeagues = foreignLeagues.map(l => ({
    ...l,
    clubs: l.clubs.map(c => (
      fBudget[c.id] === undefined || fBudget[c.id] === (c.finance?.budget ?? tierBudget(c))
        ? c
        : { ...c, finance: { ...c.finance, budget: fBudget[c.id] } }
    )),
  }))

  // 目立つ移籍（OVR高め）をニュース化（最大6件）
  const news: NewsItem[] = moves
    .map(m => ({ m, p: playerById.get(m.playerId) }))
    .filter((x): x is { m: typeof moves[0]; p: Player } => !!x.p)
    .sort((a, b) => ovr(b.p) - ovr(a.p))
    .slice(0, 6)
    .map(({ m, p }) => ({
      date: txDate,
      headline: declineMoved.has(p.id)
        ? seekPlayingTimeHeadline({
            playerName: p.name, age: p.age, squadRank: 0,
            fromLabel: nameById.get(m.fromClubId) ?? '', toLabel: nameById.get(m.toClubId) ?? '',
          })
        : transferHeadline({
            playerName: p.name, playerOvr: ovr(p), fee: m.fee,
            fromLabel: nameById.get(m.fromClubId) ?? '', toLabel: nameById.get(m.toClubId) ?? '',
          }),
      category: 'trade' as const,
      relatedIds: [p.id],
    }))

  return { foreignLeagues: updatedLeagues, players: updatedPlayers, news, records }
}

// シーズンオフの日本↔海外クロスボーダー移籍（CPU同士）。
// 海外→日本CPU（獲得）と 日本CPU→海外（引き抜き）を数件ずつ発生させる。
// プレイヤーのチームは対象外（プレイヤーの選手は「海外クラブからのオファー」で来る）。
export function simulateCrossBorderTransfers<T extends Team>(params: {
  teams: T[]
  foreignLeagues: ForeignLeague[]
  players: Player[]
  playerTeamId: string
  year: number
  maxIn?: number   // 海外→日本の件数（省略時はオフシーズン想定で2〜4）
  maxOut?: number  // 日本→海外の件数（省略時はオフシーズン想定で2〜4）
  excludeIds?: Set<string>   // このオフに既に移籍済みの選手（1オフ1移動を守るため対象外にする）
  /**
   * ④本人が行くか（`appraiseMove`）。**省略すると聞かない**（呼び出し側の移行用）。
   *
   * ★**海外を特別扱いしない**（CLAUDE.md）。国内とまったく同じ関門で、
   *   違うのは「どの順位表で序列を引くか」だけ——それは `destinationOf` の中の話。
   *   候補を絞るところで通すこと。あとから弾くと「動かない」だけになり、
   *   本人が納得する別の相手が選ばれない。
   */
  consents?: (player: Player, toClubId: string, fromClubId: string) => boolean
}): { teams: T[]; foreignLeagues: ForeignLeague[]; players: Player[]; news: NewsItem[]; records: TxRecord[] } {
  const { teams, foreignLeagues, players, playerTeamId, year, excludeIds } = params
  const foreignClubs = allForeignClubs(foreignLeagues)
  const cpuTeams = teams.filter(t => t.id !== playerTeamId)
  if (foreignClubs.length === 0 || cpuTeams.length === 0) return { teams, foreignLeagues, players, news: [], records: [] }

  // 上限・下限はフラットロスターの共通定数（30/20）。旧40のハードコードは
  // 総在籍31人・名簿残存（secondに居る選手の除去漏れ）の原因だった
  const MIN_BUY_BUDGET = 30_000_000   // これ未満の予算では獲得に動かない
  const playerById = new Map(players.map(p => [p.id, p]))
  // 同じオフに移籍済み（joinedYear=今オフの年）の選手は動かさない＝1オフ1移動
  const runnable = (p: Player | undefined): p is Player =>
    !!p && p.status !== 'retired' && p.status !== 'injured' && !p.loan && !excludeIds?.has(p.id) && p.joinedYear !== year

  const jpnRoster: Record<string, string[]> = {}
  const budget: Record<string, number> = {}
  for (const t of cpuTeams) {
    jpnRoster[t.id] = squadIdsOf(players, t.id)   // 在籍は player.teamId 1本
    budget[t.id] = t.finance?.budget ?? 0
  }
  // 人数はroster配列でなくplayers基準で数える。レンタル返却直後などはplayers側（teamId）に
  // 反映済みでもroster配列が未反映のことがあり、配列基準だと過小評価して30人チームに獲得を許してしまう
  const sizeCount: Record<string, number> = {}
  for (const t of cpuTeams) sizeCount[t.id] = 0
  for (const p of players) if (p.status === 'active' && sizeCount[p.teamId] !== undefined) sizeCount[p.teamId]++
  const jpnSize = (teamId: string) => sizeCount[teamId] ?? 0
  const fRoster: Record<string, string[]> = {}
  const fMembersByClub = clubMembersByClub(players)
  for (const c of foreignClubs) fRoster[c.id] = [...(fMembersByClub.get(c.id) ?? [])]
  // 海外クラブの手元資金。**国内チームと同じで finance.budget が唯一の置き場所**。
  //
  // 以前はここで毎回 tierBudget(c) に戻していた。つまり海外クラブは
  // 「毎年きっかり年間予算ぶんだけ使えて、使っても翌年には満タン」という別のお金で動いていて、
  // 繰越の上限も施設維持費も年俸も効いていなかった。国内が節約して買えないときに
  // 海外だけが必ず買える状態だったので、日本の主力が一方的に抜けていた。
  // 精算は endSeason（computeNextSeasonBudget）が国内CPUとまったく同じ式でやる。
  // finance が無い古いセーブは、その年だけ格の年間予算から始める。
  const fBudget: Record<string, number> = {}
  for (const c of foreignClubs) fBudget[c.id] = c.finance?.budget ?? tierBudget(c)

  const nameById = new Map<string, string>()
  for (const t of teams) nameById.set(t.id, t.shortName)
  for (const c of foreignClubs) nameById.set(c.id, c.name)

  const pick = <U,>(arr: U[]): U => arr[Math.floor(Math.random() * arr.length)]
  const weightedPick = <U,>(arr: U[], w: (x: U) => number): U => {
    const total = arr.reduce((s, x) => s + Math.max(1, w(x)), 0)
    let r = Math.random() * total
    for (const x of arr) { r -= Math.max(1, w(x)); if (r <= 0) return x }
    return arr[arr.length - 1]
  }
  const rosterPlayers = (ids: string[]) => ids.map(id => playerById.get(id)).filter(runnable)
  // チームが最も弱いタイプ（そのタイプの最高OVRが最小＝穴）。判定は utils/squadNeeds.ts の1本
  const weakestSpec = (ids: string[]) => weakestSpecialty(rosterPlayers(ids))
  const bestOvrInSpec = (ids: string[], spec: ReturnType<typeof weakestSpec>) =>
    bestOvrInSpecialty(rosterPlayers(ids), spec)
  /**
   * 出す側の名簿を序列順に並べて、**エース(1番手)だけ保護**した放出候補を返す。
   * 序列から「余剰か」を言うのは `transferDecision.isSurplus` 1本
   * （＝国内CPU間の移籍とまったく同じ）。
   *
   * ★以前ここには `surplusTarget` という**4つ目の「余剰」の数え方**があった
   *   （トップ2を保護し、層が厚いタイプの中位以下からランダム）。名前は同じ「余剰」でも
   *   国内CPU間の定義（序列・名簿の厚さ・干され）とは別物で、しかも
   *   **その選手が主力かどうかに関係なく移籍金が素の市場価値**だった。
   */
  const sellPoolOf = (ids: string[]): { p: Player; surplus: boolean }[] => {
    const ps = rosterPlayers(ids).sort(comparePlayers('ovr'))
    if (ps.length <= ROSTER_MIN) return []
    return ps.slice(1).map((p, i) => ({
      p, surplus: isSurplus({ squadRank: i + 2 }),
    }))
  }

  const moves: { playerId: string; fromId: string; toId: string; dir: 'in' | 'out'; fee: number }[] = []
  const moved = new Set<string>()

  // 件数を増やして移籍市場を活性化（2〜4件→4〜7件。動くチームが毎年2〜3チームに偏る問題の緩和）
  const N_IN = params.maxIn ?? (4 + Math.floor(Math.random() * 4))   // 海外→日本CPU（省略時4〜7件）
  const N_OUT = params.maxOut ?? (4 + Math.floor(Math.random() * 4))  // 日本CPU→海外（省略時4〜7件）

  // 海外→日本CPU：予算に余裕のあるチームが、自分の弱いタイプ（穴）を海外から補強。移籍金を支払う。
  for (let i = 0; i < N_IN; i++) {
    const buyers = cpuTeams.filter(t => jpnSize(t.id) < ROSTER_MAX && budget[t.id] >= MIN_BUY_BUDGET)
    const sellers = foreignClubs.filter(c => fRoster[c.id].length > CPU_SELL_FLOOR)
    if (buyers.length === 0 || sellers.length === 0) break
    const buyer = weightedPick(buyers, t => budget[t.id])   // 予算が多いほど動く
    const spec = weakestSpec(jpnRoster[buyer.id])
    const threshold = bestOvrInSpec(jpnRoster[buyer.id], spec)
    // 全海外クラブから、その穴タイプ・現有戦力超・予算内の候補。
    // ②③出す側での序列から「余剰か」を出し、対価もそこから出す（国内CPU間と同じ1本）。
    // ★以前は序列を見ず、移籍金も一律 `calcTransferValue`（割増なし）だった。
    //   海外の主力を素の市場価値で買えるので、国内CPU同士より安く強い選手が手に入っていた
    const cands = sellers.flatMap(c => sellPoolOf(fRoster[c.id])
        .filter(({ p }) => !moved.has(p.id) && p.specialty === spec && ovr(p) > threshold)
        .map(({ p, surplus }) => ({ p, clubId: c.id, surplus, fee: transferFeeFor(p, surplus) }))
        .filter(x => x.fee <= budget[buyer.id])
        // ④本人が行くか。**候補を絞るところで通す**ので、納得する選手が別にいればそちらが選ばれる
        .filter(x => !params.consents || params.consents(x.p, buyer.id, x.clubId)))
      .sort((a, b) => ovr(b.p) - ovr(a.p))
      .slice(0, 8)
    if (cands.length === 0) continue
    const { p: target, clubId, fee } = pick(cands)
    fRoster[clubId] = fRoster[clubId].filter(id => id !== target.id)
    jpnRoster[buyer.id] = [...jpnRoster[buyer.id], target.id]
    sizeCount[buyer.id] = (sizeCount[buyer.id] ?? 0) + 1
    budget[buyer.id] -= fee
    fBudget[clubId] += fee   // 売った海外クラブが移籍金を受け取る（国内が売ったときと同じ）
    moved.add(target.id)
    moves.push({ playerId: target.id, fromId: clubId, toId: buyer.id, dir: 'in', fee })
  }

  // 日本CPU→海外：海外クラブが、最低人数超のCPUチームの余剰・準主力を引き抜く。売り手は移籍金を得る。
  // 売り手は完全ランダムではなくニーズベース：在籍が多い（余剰を抱える）チームほど売りやすい
  for (let i = 0; i < N_OUT; i++) {
    const sellers = cpuTeams.filter(t => jpnSize(t.id) > ROSTER_MIN)
    if (sellers.length === 0) break
    const seller = weightedPick(sellers, t => Math.max(1, jpnSize(t.id) - ROSTER_MIN))
    // ②出せる選手か。エース(1番手)だけ保護し、余剰かどうかは序列と人数から（国内CPU間と同じ1本）
    const pool = sellPoolOf(jpnRoster[seller.id]).filter(x => !moved.has(x.p.id))
    if (pool.length === 0) continue
    const { p: target, surplus } = pick(pool)
    // ③対価も同じ1本。余剰は市場価値どおり、主力の引き抜きは割増
    const fee = transferFeeFor(target, surplus)
    // 買うのは「必要か、そのクラブで走れるか」で決まる（国やリーグの下限表は持たない）
    const buyerPool = foreignClubs.filter(c => {
      if (fRoster[c.id].length >= ROSTER_MAX || fBudget[c.id] < fee) return false
      const r = fRoster[c.id].map(id => playerById.get(id)).filter((x): x is Player => !!x)
      if (!needsPlayer(r, target) && !wouldMakeLineup(r, target)) return false
      // ④本人が行くか（国内とまったく同じ関門）
      return !params.consents || params.consents(target, c.id, seller.id)
    })
    if (buyerPool.length === 0) continue
    const buyer = weightedPick(buyerPool, c => fBudget[c.id])   // 予算が多いクラブほど動く
    jpnRoster[seller.id] = jpnRoster[seller.id].filter(id => id !== target.id)
    sizeCount[seller.id] = Math.max(0, (sizeCount[seller.id] ?? 0) - 1)
    fRoster[buyer.id] = [...fRoster[buyer.id], target.id]
    fBudget[buyer.id] -= fee
    budget[seller.id] += fee
    moved.add(target.id)
    moves.push({ playerId: target.id, fromId: seller.id, toId: buyer.id, dir: 'out', fee })
  }

  // スター引き抜き：海外クラブがJPELの世界レベル
  // （32歳以下）を高額移籍金で年1〜2人強奪する。「世界レベルは世界レベルに集まる」の実現。
  // 従来のN_OUTは余剰・準主力しか動かさないため、日本代表クラスが国内に固定される問題への対策。
  // ★「世界レベル」の線は clubTier の MAJOR_NEWS_OVR 1本。以前ここだけ82で、
  //   大ニュースの85・海外挑戦の見出しの76と3つに割れていた
  {
    const N_STAR = Math.random() < 0.55 ? 1 : 2
    for (let i = 0; i < N_STAR; i++) {
      const sellers = cpuTeams.filter(t => jpnSize(t.id) > ROSTER_MIN)
      if (sellers.length === 0) break
      const starPool = sellers.flatMap(t => jpnRoster[t.id]
        .map(id => playerById.get(id)).filter(runnable)
        .filter(p => !moved.has(p.id) && ovr(p) >= MAJOR_NEWS_OVR && p.age <= 32)
        .map(p => ({ p, sellerId: t.id })))
      if (starPool.length === 0) break
      const { p: target, sellerId } = weightedPick(starPool, x => ovr(x.p) - (MAJOR_NEWS_OVR - 5))
      // ③対価は同じ1本。世界レベルの選手はどのクラブでも主力＝余剰ではないので割増。
      // ★以前ここだけ**2つ目の割増**（海外専用の1.25倍）を使っていて、
      //   国内CPU間の引き抜き(1.4倍)より**安く**日本のエースを買えた
      const fee = transferFeeFor(target, false)
      // スターの行き先も「必要か・走れるか」と払えるかだけ。リーグでは絞らない
      // （名簿が強いクラブほどスターしか序列に入れないので、結果的に上位クラブへ集まる）
      const buyerPool = foreignClubs.filter(c => {
        if (fRoster[c.id].length >= ROSTER_MAX || fBudget[c.id] < fee) return false
        const r = fRoster[c.id].map(id => playerById.get(id)).filter((x): x is Player => !!x)
        if (!needsPlayer(r, target) && !wouldMakeLineup(r, target)) return false
        // ④本人が行くか（国内とまったく同じ関門）。スターだけ素通りさせない
        return !params.consents || params.consents(target, c.id, sellerId)
      })
      if (buyerPool.length === 0) break
      const buyer = weightedPick(buyerPool, c => fBudget[c.id])
      jpnRoster[sellerId] = jpnRoster[sellerId].filter(id => id !== target.id)
      sizeCount[sellerId] = Math.max(0, (sizeCount[sellerId] ?? 0) - 1)
      fRoster[buyer.id] = [...fRoster[buyer.id], target.id]
      fBudget[buyer.id] -= fee
      budget[sellerId] += fee
      moved.add(target.id)
      moves.push({ playerId: target.id, fromId: sellerId, toId: buyer.id, dir: 'out', fee })
    }
  }

  if (moves.length === 0) return { teams, foreignLeagues, players, news: [], records: [] }

  // クラブ側の名簿は持たない（所属は players の teamId が唯一の記録）。
  // 動くのはお金だけ：買えば減り、売れば増える。**書き戻さないと使っても減らない**ので、
  // ここを飛ばすと海外クラブだけが実質無限の資金で買い続けることになる。
  const updatedLeagues = foreignLeagues.map(l => ({
    ...l,
    clubs: l.clubs.map(c => (
      fBudget[c.id] === (c.finance?.budget ?? tierBudget(c))
        ? c
        : { ...c, finance: { ...c.finance, budget: fBudget[c.id] } }
    )),
  }))

  // 移籍の大きさは2つの線で言う。**どちらも utils/clubTier の1本**（自チームの見出しと同じ）。
  //   ・ビッグクラブ（格2以上）へ … 世界最高峰。列島が沸くやつ
  //   ・送り出したクラブより格上へ … ステップアップ
  // 以前はここだけ「格1〜4（DOMESTIC_TOP_TIER より上）」という絶対の線で、
  // 自チームが送り出したときの見出し（4大リーグのID）とも major の判定（格1）とも
  // 基準が違っていた。3つの物差しが同じ問いに答えていた。
  // 相対にすると、3部（格18）の選手が格12のクラブへ渡るのも拾える（以前は素通りだった）。
  // ★格はクラブの実体から引く。海外の格は毎年動くので、初期値で引くと
  //   格9まで落ちたクラブへの移籍がいつまでも「世界へ挑戦」の大ニュースになる。
  const clubById = new Map(foreignClubs.map(c => [c.id, c]))
  const teamById = new Map(cpuTeams.map(t => [t.id, t]))
  const isBigDest = (toId: string) => isBigClub(clubById.get(toId))
  const isStepUpDest = (fromId: string, toId: string) => {
    const to = clubById.get(toId)
    return !!to && isStepUp(teamById.get(fromId), to)
  }
  // 成立日をオフシーズン期間に分散（全部同日に見える不自然さの解消）
  const XB_DAYS = ['01-14', '01-19', '01-24', '01-29', '02-02', '02-08', '02-13', '02-19', '02-24', '03-02', '03-08', '03-14']
  const xbDate = (i: number) => `${year}-${XB_DAYS[i % XB_DAYS.length]}`
  const news: NewsItem[] = moves
    .map(m => ({ m, p: playerById.get(m.playerId) }))
    .filter((x): x is { m: typeof moves[0]; p: Player } => !!x.p)
    .sort((a, b) => ovr(b.p) - ovr(a.p))
    .slice(0, 8)
    .map(({ m, p }, ni) => {
      const stepUp = m.dir === 'out' && isStepUpDest(m.fromId, m.toId)
      if (m.dir === 'out' && isBigDest(m.toId) && ovr(p) >= MAJOR_NEWS_OVR) {
        return {
          date: xbDate(ni),
          headline: overseasBreakthroughHeadline({ playerName: p.name, playerOvr: ovr(p), toName: nameById.get(m.toId) ?? '', fee: m.fee }),
          category: 'trade' as const,
          relatedIds: [p.id],
          major: true,
        }
      }
      return {
        date: xbDate(ni),
        headline: crossBorderHeadline({
          playerName: p.name, playerOvr: ovr(p), fee: m.fee, dir: m.dir, stepUp,
          fromName: nameById.get(m.fromId) ?? '', toName: nameById.get(m.toId) ?? '',
        }),
        category: 'trade' as const,
        relatedIds: [p.id],
      }
    })

  // 反映は movePlayer に一本化。国内チームだけが teams に居るので、
  // 海外へ売れば国内側が受け取り、海外から買えば国内側が払う——片側だけ動くのが正しい
  let updatedPlayers: Player[] = players
  let updatedTeams: Team[] = teams
  const records: TxRecord[] = []
  moves.forEach((m, i) => {
    const r = movePlayer({ players: updatedPlayers, teams: updatedTeams }, m.playerId, m.toId, {
      year, date: xbDate(i), fee: m.fee,
      years: playerById.get(m.playerId)?.contract.yearsLeft,
      toName: nameById.get(m.toId) ?? '',
    })
    if (!r.ok) return
    updatedPlayers = r.players
    updatedTeams = r.teams
    if (r.record) records.push(r.record)
  })
  return { teams: updatedTeams as T[], foreignLeagues: updatedLeagues, players: updatedPlayers, news, records }
}
