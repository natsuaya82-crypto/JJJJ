import { hasNoPlayingTime } from '../utils/transferDecision'
import type { ForeignLeague, Player, Team, TransferRecord } from '../types'
import { comparePlayers } from '../utils/playerSort'
import { ovr, calcTransferValue } from '../utils/playerUtils'
// 「どのタイプが足りていないか」は国内・海外で共通の1本（utils/squadNeeds.ts）
import { weakestSpecialty, bestOvrInSpecialty, needsPlayer } from '../utils/squadNeeds'
import { ROSTER_MAX, ROSTER_MIN } from '../data/rosterRules'
import { FOREIGN_STAR_PREMIUM } from '../data/economy'
// 所属は player.teamId が唯一の持ち場。クラブ側に名簿は無いのでここから引く
import { clubMembersByClub } from '../utils/rosterSync'
// 海外クラブ・4大リーグの引き場所は utils/clubs 1本
import { allForeignClubs, leagueIdByClub, isEliteLeague } from '../utils/clubs'
// 選手がクラブを移るときの後始末は movePlayer.ts に一本化（所属・名簿・移籍金・移籍履歴）
import { movePlayer } from '../utils/movePlayer'
// 海外クラブの年間予算（クラブIDとリーグから毎回同じ額が出る）
import { foreignClubBudget, foreignMinOvr, effectiveOvr } from '../utils/foreignClubProfile'

const FOREIGN_ROSTER_MIN = 18  // 海外クラブのロスター下限（絶対固定）。上限は ROSTER_MAX(30)

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

  // クラブ平均OVR（引き抜きの向き付けに使う）
  const clubAvg: Record<string, number> = {}
  for (const club of allClubs) {
    const ps = roster[club.id].map(id => playerById.get(id)).filter((p): p is Player => !!p)
    clubAvg[club.id] = ps.length > 0 ? ps.reduce((s, p) => s + ovr(p), 0) / ps.length : 0
  }

  const moves: { playerId: string; fromClubId: string; toClubId: string }[] = []
  const movedPlayers = new Set<string>()
  // 件数はクラブ数に比例（移籍を活発化：180クラブなら約72〜108件/年）。
  const MOVE_BASE = Math.max(12, Math.round(allClubs.length * 0.4))
  const MOVE_COUNT = params.maxMoves ?? (MOVE_BASE + Math.floor(Math.random() * (MOVE_BASE * 0.5)))
  // 4大リーグ（北米/アフリカ東/アフリカ北南/欧州西南）。ここが世界のスターを引き抜く＝サッカー式。
  const isEliteClub = (c: { leagueId?: string }) => isEliteLeague(c.leagueId)
  // 格上リーグへ行ける実効OVRの下限：4大は高く（弱い選手は入れない）、他は緩め
  const leagueFloor = (c: { leagueId?: string }) => isEliteClub(c) ? 84 : 74
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
    // 4大リーグのクラブほど積極的に引き抜く（世界のスターが集まる）
    const buyer = weightedPick(buyerPool, c => (ROSTER_MAX - roster[c.id].length) * (roster[c.id].length < 22 ? 3 : 1) * (isEliteClub(c) ? 2.4 : 1))
    // 売る側：buyer 以外で下限(18)超のクラブから、buyerより平均が低い相手を優先（放出しても18で止まる）
    const sellers = allClubs.filter(c => c.id !== buyer.id && roster[c.id].length > FOREIGN_ROSTER_MIN)
    if (sellers.length === 0) continue
    const weaker = sellers.filter(c => clubAvg[c.id] <= clubAvg[buyer.id])
    const seller = (weaker.length > 0 ? weaker : sellers)[Math.floor(Math.random() * (weaker.length > 0 ? weaker.length : sellers.length))]

    // 引き抜く選手：seller の中位〜上位（未移動）から1人
    const candidates = roster[seller.id]
      .map(id => playerById.get(id))
      .filter((p): p is Player => !!p && !movedPlayers.has(p.id) && p.status === 'active')
      .sort(comparePlayers('ovr'))
      .slice(0, 10)   // 上位10人が引き抜き対象
    if (candidates.length === 0) continue
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    // buyer のリーグの格に実効OVR（年齢加味）が届かない選手は引き抜かない（弱い/高齢の選手が格上へ行かない）
    if (effectiveOvr(target) < leagueFloor(buyer)) continue
    // ★「必要だから動く」の関門。ここが抜けていて、格の下限さえ超えていれば
    //   どのクラブでも誰でも引き抜けた。国内CPUと同じ needsPlayer 1本を通す
    const buyerRoster = roster[buyer.id].map(id => playerById.get(id)).filter((x): x is Player => !!x)
    if (!needsPlayer(buyerRoster, target)) continue

    // 実行
    roster[seller.id] = roster[seller.id].filter(id => id !== target.id)
    roster[buyer.id] = [...roster[buyer.id], target.id]
    movedPlayers.add(target.id)
    moves.push({ playerId: target.id, fromClubId: seller.id, toClubId: buyer.id })
  }

  // 都落ち移籍：30歳以上でクラブ内序列が上位10から陥落した元スター/中堅が、
  // 出場機会を求めて自クラブより平均OVRの低いクラブへ移る（年2〜4件）。
  // 「若手台頭→ベテラン序列陥落→格下へ移籍 or 日本行き」のキャリア循環を作る
  const declineMoved = new Set<string>()
  const DECLINE_MOVES = params.includeDecline === false ? 0 : 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < DECLINE_MOVES; i++) {
    const sellers = allClubs.filter(c => roster[c.id].length > FOREIGN_ROSTER_MIN)
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
    // 行き先は自クラブより平均の低い（＝出番を得やすい）空きのあるクラブ。行き先の格にも届いていること
    const dests = allClubs.filter(c =>
      c.id !== seller.id && roster[c.id].length < ROSTER_MAX && clubAvg[c.id] < clubAvg[seller.id]
      && effectiveOvr(target) >= foreignMinOvr(c.country ?? ''))
    if (dests.length === 0) continue
    const dest = dests[Math.floor(Math.random() * dests.length)]
    roster[seller.id] = roster[seller.id].filter(id => id !== target.id)
    roster[dest.id] = [...roster[dest.id], target.id]
    movedPlayers.add(target.id)
    declineMoved.add(target.id)
    moves.push({ playerId: target.id, fromClubId: seller.id, toClubId: dest.id })
  }

  if (moves.length === 0) return { foreignLeagues, players, news: [], records: [] }

  // 海外クラブ同士なので国内の名簿・お金は動かない。それでも同じ movePlayer を通すことで、
  // 所属・加入年・移籍リストの札はがしが国内の移籍とまったく同じ後始末になる
  let updatedPlayers: Player[] = players
  const records: TxRecord[] = []
  for (const m of moves) {
    const r = movePlayer({ players: updatedPlayers, teams: [] }, m.playerId, m.toClubId, {
      year, date: txDate, kind: 'free',
      years: playerById.get(m.playerId)?.contract.yearsLeft,
      toName: nameById.get(m.toClubId) ?? '',
    })
    if (!r.ok) continue
    updatedPlayers = r.players
    if (r.record) records.push(r.record)
  }

  // クラブ側の名簿は持たない（所属は上で更新した players の teamId が唯一の記録）
  const updatedLeagues = foreignLeagues

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
            playerName: p.name, playerOvr: ovr(p), fee: 0,
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
}): { teams: T[]; foreignLeagues: ForeignLeague[]; players: Player[]; news: NewsItem[]; records: TxRecord[] } {
  const { teams, foreignLeagues, players, playerTeamId, year, excludeIds } = params
  const foreignClubs = allForeignClubs(foreignLeagues)
  const clubCountry = new Map(allForeignClubs(foreignLeagues).map(c => [c.id, c.country as string]))
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
    jpnRoster[t.id] = [...(t.roster?.main ?? [])]
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
  // 海外クラブにも予算を持たせる。これが無いと海外側だけ無限にお金を払えてしまい、
  // 日本の主力がいくらでも引き抜かれる。額はリーグの規模で決まる（utils/foreignClubProfile.ts）
  const fBudget: Record<string, number> = {}
  for (const c of foreignClubs) fBudget[c.id] = foreignClubBudget(c)

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
  // 余剰＝人数の多いタイプの中位選手（エース級は保護）を1人放出候補に
  const surplusTarget = (ids: string[]): Player | null => {
    const ps = rosterPlayers(ids).sort(comparePlayers('ovr'))
    if (ps.length <= ROSTER_MIN) return null
    const protectedIds = new Set(ps.slice(0, 2).map(p => p.id))   // 全体トップ2＝エース級は保護
    const cnt: Record<string, number> = {}
    for (const p of ps) cnt[p.specialty] = (cnt[p.specialty] ?? 0) + 1
    const deep = ps.filter(p => !protectedIds.has(p.id) && (cnt[p.specialty] ?? 0) >= 3)   // 層が厚いタイプ
    const pool = deep.length > 0 ? deep : ps.filter(p => !protectedIds.has(p.id))
    if (pool.length === 0) return null
    const mid = pool.slice(Math.floor(pool.length * 0.25))   // 上澄みは避け中位〜下位から
    return pick(mid.length > 0 ? mid : pool)
  }

  const moves: { playerId: string; fromId: string; toId: string; dir: 'in' | 'out'; fee: number }[] = []
  const moved = new Set<string>()

  // 件数を増やして移籍市場を活性化（2〜4件→4〜7件。動くチームが毎年2〜3チームに偏る問題の緩和）
  const N_IN = params.maxIn ?? (4 + Math.floor(Math.random() * 4))   // 海外→日本CPU（省略時4〜7件）
  const N_OUT = params.maxOut ?? (4 + Math.floor(Math.random() * 4))  // 日本CPU→海外（省略時4〜7件）

  // 海外→日本CPU：予算に余裕のあるチームが、自分の弱いタイプ（穴）を海外から補強。移籍金を支払う。
  for (let i = 0; i < N_IN; i++) {
    const buyers = cpuTeams.filter(t => jpnSize(t.id) < ROSTER_MAX && budget[t.id] >= MIN_BUY_BUDGET)
    const sellers = foreignClubs.filter(c => fRoster[c.id].length > FOREIGN_ROSTER_MIN)
    if (buyers.length === 0 || sellers.length === 0) break
    const buyer = weightedPick(buyers, t => budget[t.id])   // 予算が多いほど動く
    const spec = weakestSpec(jpnRoster[buyer.id])
    const threshold = bestOvrInSpec(jpnRoster[buyer.id], spec)
    // 全海外クラブから、その穴タイプ・現有戦力超・予算内の候補
    const cands = sellers.flatMap(c => fRoster[c.id].map(id => playerById.get(id)).filter(runnable)
        .filter(p => !moved.has(p.id) && p.specialty === spec && ovr(p) > threshold && calcTransferValue(p) <= budget[buyer.id])
        .map(p => ({ p, clubId: c.id })))
      .sort((a, b) => ovr(b.p) - ovr(a.p))
      .slice(0, 8)
    if (cands.length === 0) continue
    const { p: target, clubId } = pick(cands)
    const fee = calcTransferValue(target)
    fRoster[clubId] = fRoster[clubId].filter(id => id !== target.id)
    jpnRoster[buyer.id] = [...jpnRoster[buyer.id], target.id]
    sizeCount[buyer.id] = (sizeCount[buyer.id] ?? 0) + 1
    budget[buyer.id] -= fee
    moved.add(target.id)
    moves.push({ playerId: target.id, fromId: clubId, toId: buyer.id, dir: 'in', fee })
  }

  // 日本CPU→海外：海外クラブが、最低人数超のCPUチームの余剰・準主力を引き抜く。売り手は移籍金を得る。
  // 売り手は完全ランダムではなくニーズベース：在籍が多い（余剰を抱える）チームほど売りやすい
  for (let i = 0; i < N_OUT; i++) {
    const sellers = cpuTeams.filter(t => jpnSize(t.id) > ROSTER_MIN)
    if (sellers.length === 0) break
    const seller = weightedPick(sellers, t => Math.max(1, jpnSize(t.id) - ROSTER_MIN))
    // 候補はmain/second合わせた全在籍から（除去漏れ防止のため両方から外す）
    const target = surplusTarget(jpnRoster[seller.id])
    if (!target || moved.has(target.id)) continue
    // 買う側（海外クラブ）は上限(30)未満＋リーグの格にOVRが届くクラブのみ（弱い選手は格上リーグに行かない）
    const tOvr = effectiveOvr(target)
    const fee = calcTransferValue(target)
    const buyerPool = foreignClubs.filter(c => fRoster[c.id].length < ROSTER_MAX && tOvr >= foreignMinOvr(clubCountry.get(c.id) ?? '') && fBudget[c.id] >= fee)
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

  // スター引き抜き：4大リーグ（アフリカ東/アフリカ北南/欧州西南/北米）がJPELの世界レベル
  // （OVR82+・32歳以下）を高額移籍金で年1〜2人強奪する。「世界レベルは世界レベルに集まる」の実現。
  // 従来のN_OUTは余剰・準主力しか動かさないため、日本代表クラスが国内に固定される問題への対策
  {
    const clubLeague = leagueIdByClub(foreignLeagues)
    const N_STAR = Math.random() < 0.55 ? 1 : 2
    for (let i = 0; i < N_STAR; i++) {
      const sellers = cpuTeams.filter(t => jpnSize(t.id) > ROSTER_MIN)
      if (sellers.length === 0) break
      const starPool = sellers.flatMap(t => jpnRoster[t.id]
        .map(id => playerById.get(id)).filter(runnable)
        .filter(p => !moved.has(p.id) && ovr(p) >= 82 && p.age <= 32)
        .map(p => ({ p, sellerId: t.id })))
      if (starPool.length === 0) break
      const { p: target, sellerId } = weightedPick(starPool, x => ovr(x.p) - 80)
      const fee = Math.round(calcTransferValue(target) * FOREIGN_STAR_PREMIUM)
      const buyerPool = foreignClubs.filter(c => isEliteLeague(clubLeague.get(c.id)) && fRoster[c.id].length < ROSTER_MAX && fBudget[c.id] >= fee)
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

  // クラブ側の名簿は持たない（所属は players の teamId が唯一の記録）
  const updatedLeagues = foreignLeagues

  // 日本より格上のリーグへの移籍は「日本人が世界最高峰へ挑む」大ニュースにする。
  // 国コード（旧判定）に加えて4大リーグ所属クラブも対象（欧州の国コードGBR/GER等が漏れていた）
  const STRONG_COUNTRIES = new Set(['ETH', 'KEN', 'UGA', 'TAN', 'USA'])
  const newsClubLeague = leagueIdByClub(foreignLeagues)
  const isStrongDest = (toId: string) => STRONG_COUNTRIES.has(clubCountry.get(toId) ?? '') || isEliteLeague(newsClubLeague.get(toId))
  // 成立日をオフシーズン期間に分散（全部同日に見える不自然さの解消）
  const XB_DAYS = ['01-14', '01-19', '01-24', '01-29', '02-02', '02-08', '02-13', '02-19', '02-24', '03-02', '03-08', '03-14']
  const xbDate = (i: number) => `${year}-${XB_DAYS[i % XB_DAYS.length]}`
  const news: NewsItem[] = moves
    .map(m => ({ m, p: playerById.get(m.playerId) }))
    .filter((x): x is { m: typeof moves[0]; p: Player } => !!x.p)
    .sort((a, b) => ovr(b.p) - ovr(a.p))
    .slice(0, 8)
    .map(({ m, p }, ni) => {
      const toStrongLeague = m.dir === 'out' && isStrongDest(m.toId)
      if (toStrongLeague && ovr(p) >= 76) {
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
          playerName: p.name, playerOvr: ovr(p), fee: m.fee, dir: m.dir, toStrongLeague,
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
