// CPUクラブの移籍市場AI（gameStore から移設）。
// どのクラブがどれだけ動くかは格（tierStrength）、誰を獲るかは utils/squadNeeds、
// 本人が行くかは utils/transferDecision。ここはそれらを組み合わせる進行役。

import { roundFee, transferCapOf } from '../data/economy'
import { ROSTER_MAX, ROSTER_MIN } from '../data/rosterRules'
import { type ForeignClub, type IncomingLoanOffer, type IncomingOffer, type Player, type Race, type Specialty, type Team, type TransferListing } from '../types'
import { clubSeasonRank } from '../utils/clubStanding'
import { MAJOR_NEWS_OVR, isBigClub, tierBudget, tierOf, tierStrength } from '../utils/clubTier'
import { RENEWAL_ATTENTION_MONTHS, contractMonthsLeft } from '../utils/contractTalk'
import { effectiveOvr } from '../utils/foreignClubProfile'
import { DIVISION_SIZE } from '../utils/league'
import { playRateOf } from '../utils/playRate'
import { comparePlayers } from '../utils/playerSort'
import { calcTransferValue, faMarketSalary, ovr, perfOf } from '../utils/playerUtils'
import { roundRobin } from '../utils/roundRobin'
import { saleAnsweredIds } from '../utils/saleAnswer'
import { needsPlayer, thinSpecialties, wouldMakeLineup } from '../utils/squadNeeds'
import { MAX_OFFERS_PER_PLAYER, hasNoPlayingTime, leaguesOfRegion } from '../utils/transferDecision'
import { canBePoached, canClubApproachAgain, canGoOverseasDream, canLoanOut, canReceiveFreeContact, isOwnedBy } from '../utils/transferEligibility'

export function cpuStrategy(lastRank: number, totalTeams: number, avgAge: number): 'contend' | 'rebuild' | 'balanced' {
  if (avgAge >= 30) return 'contend'          // 主力が高齢＝今のうちに勝負
  if (avgAge <= 24) return 'rebuild'          // 若い核＝育成路線
  if (lastRank > 0 && lastRank <= 4) return 'contend'                 // 上位＝優勝を狙いにいく
  if (lastRank >= totalTeams - 3) return 'rebuild'                     // 下位＝再建
  return 'balanced'
}

// そのチームが頭数の足りていないタイプ（薄い順）。判定は utils/squadNeeds.ts の1本。
// 「どのタイプが足りていないか」は海外の補強（engine/foreignTransfers.ts）でも使うので、
// タイプの一覧も人数の下限もあちらと同じものを見る
/**
 * クラブがFAを獲る判断。**FAを拾う判断はここ1本。国内も海外も同じ入口。**
 *
 * ■獲る理由は1つしかない
 *   「必要か（needsPlayer）」と「そこで走れるか（wouldMakeLineup）」だけ。
 *   FA・移籍金つきの移籍・引き抜き・海外、どれも同じ。**FAを別の話にしないこと。**
 *
 * ■前はここが3つに割れていた
 *   ・国内CPU … この関数。ただし**オフシーズンにしか呼ばれていなかった**ので、
 *     シーズン中のFA市場は自チームの独占だった。17クラブが欲しがっている選手が
 *     誰にも獲られず置きっぱなしになり、前年俸のまま即加入できた
 *   ・海外クラブ … endSeason の中に別実装があり、「在籍20人を割ったクラブの救済」
 *     しか見ていなかった（必要かどうかを見ていない）。しかも外国籍のFAだけが対象
 *   ・自チーム … チャットの獲得オファー（submitAcquisitionOffer）
 *
 * 返すのは「誰がどこと契約するか」だけ。所属の書き換えは呼ぶ側が movePlayer に通す。
 */
/** FAを獲りにいくクラブ。国内チーム（Team）も海外クラブ（ForeignClub）もこの形で渡す */
export type FaClub = { id: string; tier?: import('../utils/clubTier').ClubTier; initialRank?: number; finance?: { budget: number } }

export function pickCpuFreeAgents(a: {
  players: Player[]
  /** 獲りにいくクラブ。**国内と海外を分けて渡さないこと**（区別しないのが決まり） */
  clubs: FaClub[]
  playerTeamId: string
  season: import('../types').Season
  /** そのクラブのロスター上限（指名権ぶんを空けた数） */
  capFor: (clubId: string) => number
  /**
   * いつの補強か。
   *   'offseason' … ロスターを組み直す時期。人数の足りないクラブは頭数も埋める
   *   'inseason'  … シーズン中。**必要な選手だけ**を獲る（頭数合わせはしない）。
   *                 1クラブ1人まで＝1レースのあいだに市場を空にしない
   */
  phase: 'offseason' | 'inseason'
  /**
   * ④本人が行くか（`appraiseMove`）。**省略すると聞かない**（呼び出し側の移行用）。
   *
   * ★無所属は「クラブが無い」状態と較べるので基本は断らない
   *   （`transferDecision` の `FREE_AGENT_TIER`）。ここを通す意味は、
   *   **憧れの地域と出番の良し悪しが行き先の選び方に効く**こと。
   */
  consents?: (player: Player, clubId: string) => boolean
}): { playerId: string; clubId: string }[] {
  const players = a.players
  const clubs = a.clubs
  const inSeason = a.phase === 'inseason'
  // 人数がここまでは年俸を気にせず埋める。これを超えると年俸が払える範囲だけ
  const FA_FREE_FILL = ROSTER_MIN + 9
  const availableFAs = players
    .filter(p => p.teamId === '' && p.status === 'active')
    .sort((a, b) => effectiveOvr(b) - effectiveOvr(a))
  const signedFAIds = new Set<string>()
  const cpuSignings: { playerId: string; clubId: string }[] = []
  // そのクラブが「今どこにいるか」。国内は部内順位、海外はリーグ内順位。
  // 引き方は utils/clubStanding の clubSeasonRank 1本（読む側は国内・海外を区別しない）
  const standingOf = (clubId: string) => {
    const r = clubSeasonRank(a.season, clubId)
    const total = r.total > 0 ? r.total : DIVISION_SIZE[3]
    return { rank: r.rank > 0 ? r.rank : Math.ceil(total / 2), total }
  }
  // 順番は「順位が下のクラブから」。同順の並びは毎回シャッフル（特定クラブだけが毎年得をしないように）
  const tierJitter = new Map(clubs.map(c => [c.id, Math.random()]))
  const cpuTeamsSorted = clubs
    .filter(c => c.id !== a.playerTeamId)
    .sort((a, b) => (standingOf(b.id).rank - standingOf(a.id).rank) || (tierJitter.get(a.id)! - tierJitter.get(b.id)!))

  // クラブごとの補強の事情（枠・予算・欲しい専門）は最初に1回だけ組み立てる
  const faCtxList = cpuTeamsSorted.map(team => {
    // フラットロスター：1軍/2軍の区別なし。総在籍だけで管理する
    const currentRoster = players.filter(p => p.teamId === team.id && p.status === 'active')
    const tier = tierOf(team)
    const totalNow = currentRoster.length
    // 運用方針と予算
    const avgAge = currentRoster.length ? currentRoster.reduce((s, p) => s + p.age, 0) / currentRoster.length : 27
    const st = standingOf(team.id)
    const strat = cpuStrategy(st.rank, st.total, avgAge)
    const committedSalary = players.filter(p => p.teamId === team.id).reduce((s, p) => s + p.contract.annualSalary, 0)
    const spendFactor = strat === 'contend' ? 1.0 : strat === 'rebuild' ? 0.4 : 0.7
    // 補強原資 ＝ 年俸原資の余り（クラブ予算−既存年俸）＋ 実残高の一部。
    // 売却・賞金で貯めた残高が補強に反映され、貧乏チームは予算切れで少人数（下限24）に落ち着く。
    // ★海外クラブの資金も本物（finance.budget 1本）。格から作り直さないこと
    const budget = team.finance?.budget ?? tierBudget(team)
    const grantRoom = Math.max(0, tierBudget(team) - committedSalary)
    const budgetRoom = Math.max(0, budget) * 0.3
    return {
      team, totalNow,
      // シーズン中は1レースにつき1人まで。1回で市場を空にしない
      slotsNeeded: inSeason ? Math.min(1, Math.max(0, a.capFor(team.id) - totalNow)) : Math.max(0, a.capFor(team.id) - totalNow),
      spendable: budget < 0 ? 0 : (grantRoom + budgetRoom) * spendFactor,
      spent: 0, signed: 0,
      needs: cpuSpecialtyNeeds(team.id, players),
      specCounts: {} as Record<string, number>,
      // 高齢FAとは契約しない：優勝狙いでも33歳まで、通常は32歳まで、エリートは若手志向、再建は27歳まで
      // 格が高いクラブほど若手志向（格1で31歳まで、格20で33歳まで）。強さの物差しは格1本
      ageCap: strat === 'contend' ? 34 : strat === 'rebuild' ? 28 : 31 + Math.round(2 * (1 - tierStrength(tier))),
      // 若手再建はポテンシャル・若さ優先、それ以外はOVR優先（availableFAsは既にOVR降順）
      pool: strat === 'rebuild'
        ? [...availableFAs].filter(p => p.age <= 27).sort((a, b) => (b.potential - a.potential) || (a.age - b.age))
        : availableFAs }
  })
  type FaCtx = typeof faCtxList[number]
  const estCost = (fa: Player) => faMarketSalary(fa, perfOf(a.season, fa.id))
  const doSignFA = (c: FaCtx, fa: Player) => {
    signedFAIds.add(fa.id); cpuSignings.push({ playerId: fa.id, clubId: c.team.id })
    c.signed++; c.spent += estCost(fa)
  }
  // 1周につき1人だけ。取れるチームが無くなったら終わり（utils/roundRobin.ts）。
  // 以前は1チームが枠を埋めきってから次に回していたので、良いFAが上位チームに固まっていた
  const signOneFA = (c: FaCtx): boolean => {
    if (c.signed >= c.slotsNeeded) return false
    // 外国人枠は廃止したので国籍による人数制限は無い
    // ④本人が行くか。3つの枝すべてが同じ関門を通る（枝ごとに違う判定を書かない）
    const canSign = (fa: Player) =>
      !signedFAIds.has(fa.id) && fa.age < c.ageCap && (!a.consents || a.consents(fa, c.team.id))
    // 戦力崩壊を防ぐ最低ラインまでは予算に関係なく補強する。それ以上は年俸が払える範囲でのみ。
    // 移籍金はかからないので、止めるのは年俸だけ
    const budgetOk = (fa: Player) => (c.totalNow + c.signed) < FA_FREE_FILL || (c.spent + estCost(fa) <= c.spendable)
    // ① 専門の穴埋め（1つの専門につき2人まで）。
    //    要るかどうかは squadNeeds 1本。以前はここに平均OVRから作った下限（minOvr - 10）が
    //    あったが、「薄い専門は頭数が要るので強さは問わない」という決まりと矛盾していた
    const faRoster = players.filter(p => p.teamId === c.team.id && p.status === 'active')
    for (const spec of c.needs) {
      const have = players.filter(p => p.teamId === c.team.id && p.specialty === spec && p.status === 'active').length
      if (have + (c.specCounts[spec] ?? 0) >= 2) continue
      const fa = c.pool.find(f => f.specialty === spec && canSign(f) && budgetOk(f) && (needsPlayer(faRoster, f) || wouldMakeLineup(faRoster, f)))
      if (!fa) continue
      doSignFA(c, fa)
      c.specCounts[spec] = (c.specCounts[spec] ?? 0) + 1
      return true
    }
    // ② 穴が空いている（needsPlayer）か、**スタメンに入る**（wouldMakeLineup）なら取る。
    //    ★FAは移籍金がかからないので、needsPlayer だけで判断してはいけない。
    //      「必要だから動く」は金を払う移籍の話で、タダなら穴でなくても走れる選手は取る。
    //      2部・3部にとってOVR77がタダなら破格、というのがここ。
    //      needsPlayer だけにしていたので、良いFAが誰にも取られず市場に残り続けていた。
    //    判定は squadNeeds の1本（自チームもCPUも海外も同じ入口）。
    if (c.totalNow + c.signed < ROSTER_MAX) {
      const need = c.pool.find(f => canSign(f) && budgetOk(f) && (needsPlayer(faRoster, f) || wouldMakeLineup(faRoster, f)))
      if (need) { doSignFA(c, need); return true }
    }
    // ③ 頭数の確保 — 年俸/OVRに関係なく、人数が足りていないクラブは埋める。
    //    ★シーズン中はやらない。頭数合わせはロスターを組み直す時期の話で、
    //      シーズン中に走らせると「必要でもない選手」でFA市場が毎レース空になる
    if (inSeason) return false
    if (c.totalNow + c.signed >= FA_FREE_FILL) return false
    const fa = availableFAs.find(canSign)
    if (!fa) return false
    doSignFA(c, fa)
    return true
  }
  roundRobin(faCtxList, signOneFA)
  return cpuSignings
}

export function cpuSpecialtyNeeds(teamId: string, players: Player[]): Specialty[] {
  return thinSpecialties(players.filter(p => p.teamId === teamId && p.status === 'active'))
}

// 海外クラブからの移籍オファー ＋ 相手からのレンタル打診（双方向）を生成。チャットで対応する。
export function generateForeignAndLoanOffers(params: {
  players: Player[]
  teams: Team[]
  foreignClubs: ForeignClub[]
  playerTeamId: string
  raceIndex: number
  existingIncoming: IncomingOffer[]
  existingLoans: IncomingLoanOffer[]
  races?: Race[]   // 出場機会の判定用（borrow_in打診は出番のない選手から選ぶ）
  /** 今シーズン。出場率は「そのクラブが走っている日程」で数える（utils/playRate） */
  season?: import('../utils/playRate').PlayRateSeason & import('../utils/saleAnswer').SaleAnswerSeason
  retiringIds?: Set<string>   // 引退希望中の選手（オファー・打診の対象外）
  currentYear?: number        // 今のシーズン年。加入1年目の選手を引き抜き対象から外す
}): { foreignIncoming: IncomingOffer[]; loanOffers: IncomingLoanOffer[] } {
  const { players, teams, foreignClubs, playerTeamId, raceIndex, existingIncoming, existingLoans, races, season, retiringIds, currentYear } = params
  // 「誰に話を持ちかけていいか」の条件は utils/transferEligibility.ts に集約。
  // 「譲ります」と返事をして決着待ちの選手には、貸出の話も持ちかけない（utils/saleAnswer）
  const eligCtx = { teamId: playerTeamId, currentYear, retiringIds, saleAnsweredIds: saleAnsweredIds(season) }
  const foreignIncoming: IncomingOffer[] = []
  const loanOffers: IncomingLoanOffer[] = []

  const myPlayers = players.filter(p => p.teamId === playerTeamId && p.status === 'active')
  const myMain = myPlayers.filter(p => !p.loan)
  // 貸出歓迎（移籍方針）に設定した選手。年齢・立場の制限なしで打診対象になる。引退希望中は対象外
  const myLoanListed = myPlayers.filter(p => p.loanListed && !p.transferListed && canLoanOut(p, eligCtx))
  const myYoung = myPlayers.filter(p => p.age <= 23 && canLoanOut(p, eligCtx))
  // 1人の選手に何クラブまで同時に話が来るか。取り合いになるのが普通なので複数を許す。
  // 以前は Set で1件目があると2件目を作らせず、構造的に取り合いが起きなかった
  const offerCountOf = (pid: string) => existingIncoming.filter(o => o.playerId === pid && o.offeredPrice > 0).length
  const clubsAlreadyOffering = (pid: string) => new Set(existingIncoming.filter(o => o.playerId === pid).map(o => o.fromTeamId))
  const offeredIds = new Set(existingIncoming.filter(o => offerCountOf(o.playerId) >= MAX_OFFERS_PER_PLAYER).map(o => o.playerId))
  /**
   * 海外クラブが1人に出せる上限。格→年間予算→20% と手元資金の小さい方（economy の transferCapOf）。
   * **国内クラブとまったく同じ引き方**（gameStore の入札側と同じ2引数）。
   *
   * ここが無かったころは、格20のクラブでも世界最高の選手に上限なしで打診できていた。
   * そのあと格は見るようになったが、見ていたのは tierOfClubId ＝ **初期値の格**で、
   * しかも手元資金を渡していなかった。海外の格は毎年動くので、
   *   ・最下位を続けて格が落ちたクラブが、初期値の格のまま大金を出す
   *   ・使い切っていても毎回「年間予算の20%」を出せる
   * という状態だった。クラブをそのまま受け取るようにしたので、両方とも引ける。
   */
  const foreignCapOf = (c: ForeignClub) =>
    // finance が無い古いセーブは、次の endSeason で入るまで格の年間予算ちょうどとみなす
    transferCapOf(tierBudget(c), c.finance?.budget ?? tierBudget(c))
  /** そのクラブがその選手に打診していいか（枠・重複・今季すでに断られた相手） */
  const clubMayOffer = (p: Player, clubId: string, pending: IncomingOffer[]) =>
    offerCountOf(p.id) + pending.filter(o => o.playerId === p.id).length < MAX_OFFERS_PER_PLAYER
    && !clubsAlreadyOffering(p.id).has(clubId)
    && !pending.some(o => o.playerId === p.id && o.fromTeamId === clubId)
    && canClubApproachAgain(p, clubId, currentYear)
  const loanTargetIds = new Set(existingLoans.map(o => o.playerId))
  const aiTeams = teams.filter(t => t.id !== playerTeamId)

  /**
   * そのクラブがその選手に声をかけるか。**海外から自チームへの打診はこの1本だけを見る。**
   *
   * 「必要か（穴が空いている）」と「そこで走れるか（7人に入る）」だけ（utils/squadNeeds）。
   * 国・地域・リーグごとのOVR下限表は持たない。格1のクラブは名簿が強いので、
   * 弱い選手はそこでは序列の下に沈み、自動的に声が掛からなくなる。
   */
  const rosterOfClub = (clubId: string) => players.filter(p => p.teamId === clubId && p.status === 'active')
  const clubWants = (c: ForeignClub, target: Player) => {
    const r = rosterOfClub(c.id)
    if (r.length === 0) return false
    return needsPlayer(r, target) || wouldMakeLineup(r, target)
  }

  // 1a) 海外挑戦リストの選手：希望した地域のリーグから高確率で指名オファー。
  //     ★発生源は transferDecision の `leaguesOfRegion` 1本。移籍の同意で「憧れの地域か」を
  //       見ている表とまったく同じものを裏返して使う。以前は clubs.ts に別の表があり、
  //       欧州北東へ移れば「憧れのヨーロッパへ行けた」と加点されるのに、海外挑戦に
  //       登録しても欧州北東からは一生オファーが来なかった。
  //     以前はここに地域ごとのOVR下限表（アフリカ84／欧州80／北米80）があったが、
  //     それは「必要か・走れるか」を通していないただの後付けだった。clubWants 1本にする。
  for (const target of myMain.filter(p => !offeredIds.has(p.id) && canGoOverseasDream(p, eligCtx))) {
    if (foreignIncoming.length >= 2) break
    const region = target.overseasListed!
    if (Math.random() > 0.75) continue
    const dreamLeagues = new Set(leaguesOfRegion(region))
    const clubs = foreignClubs
      .filter(c => dreamLeagues.has(c.leagueId ?? ''))
      .filter(c => clubWants(c, target))
    if (clubs.length === 0) continue
    const club = clubs[(ovr(target) + raceIndex) % clubs.length]
    if (!clubMayOffer(target, club.id, foreignIncoming)) continue
    const tv = calcTransferValue(target)
    // 夢の移籍は向こうも本気＝市場価値の1.1〜1.4倍を提示。ただし出せる上限まで
    const dreamPrice = roundFee(tv * (1.1 + Math.random() * 0.3), 1_000_000)
    if (dreamPrice > foreignCapOf(club)) continue
    foreignIncoming.push({ id: `finc-${raceIndex}-${club.id}-${target.id}`, fromTeamId: club.id, playerId: target.id, offeredPrice: dreamPrice, expiresAtRace: raceIndex + 5, round: 1, fromForeign: true })
  }

  // 1b) 世界レベル（OVR85+・34歳以下）はリスト設定なしでもビッグクラブが放っておかない。
  //     ★「ビッグクラブか」は格（isBigClub）。4大リーグのIDでは言えない
  if (foreignClubs.length > 0 && Math.random() < 0.6) {
    const star = [...myMain]
      .filter(p => !offeredIds.has(p.id) && ovr(p) >= MAJOR_NEWS_OVR && p.age <= 34 && !foreignIncoming.some(o => o.playerId === p.id) && canBePoached(p, eligCtx))
      .sort(comparePlayers('ovr'))[0]
    const eliteAll = star ? foreignClubs.filter(c => isBigClub(c) && clubWants(c, star)) : []
    const eliteClub = star && eliteAll.length > 0 ? eliteAll[(ovr(star) + raceIndex) % eliteAll.length] : undefined
    if (star && eliteClub && clubMayOffer(star, eliteClub.id, foreignIncoming)) {
      const club = eliteClub
      const tv = calcTransferValue(star)
      const starPrice = roundFee(tv * (1.1 + Math.random() * 0.25), 1_000_000)
      if (starPrice <= foreignCapOf(club)) foreignIncoming.push({ id: `finc-${raceIndex}-${club.id}-${star.id}`, fromTeamId: club.id, playerId: star.id, offeredPrice: starPrice, expiresAtRace: raceIndex + 5, round: 1, fromForeign: true })
    }
  }

  // 1) 海外クラブからの移籍オファー（自チームの選手を狙う）。
  //
  // ★行き先は「その選手を欲しがるクラブ」から選ぶこと。
  //   以前は foreignClubs[(ovr + raceIndex) % 全180クラブ] と、**適当な1クラブ**を
  //   機械的に選んでいた。そのため3部（格20）のOVR70の選手に、世界最高峰のマドリード
  //   （格1）から打診が来ていた。「クラブは必要だから動く」という決まりを通っていない。
  //
  //   2つの物差しで絞る。どちらも既にある1本を使う（ここで新しい条件を書かない）。
  //     ・そのクラブが必要としていて、そこで走れるか … utils/squadNeeds
  //       （海外クラブ同士の移籍が元から使っていたのと同じ物差し）
  //     ・そのクラブが必要としているか … squadNeeds の needsPlayer／wouldMakeLineup
  //       （穴が空いている、またはそのクラブで走れる7人に入る）
  if (foreignClubs.length > 0 && myMain.length > 0 && Math.random() < 0.55) {
    // 高齢選手（34歳以上）・引退希望中は狙わない（移籍金を払ってまで獲得しない）
    // OVRの下限は置かない。欲しがるクラブが1つも無ければ、そのあとの clubWants で自然に外れる
    const targets = [...myMain]
      .filter(p => !offeredIds.has(p.id) && p.age <= 33 && canBePoached(p, eligCtx))
      .sort(comparePlayers('ovr'))
      .slice(0, 4)
    const suitorsFor = (target: Player) => foreignClubs.filter(c => clubWants(c, target))
    const nOffers = targets.length > 0 ? (Math.random() < 0.35 ? 2 : 1) : 0
    for (let oi = 0; oi < Math.min(nOffers, targets.length); oi++) {
      // 1件目は最上位、2件目はそれ以外からランダム（同じ選手に集中させない）
      const target = oi === 0 ? targets[0] : targets[1 + Math.floor(Math.random() * (targets.length - 1))]
      if (!target) continue
      const suitors = suitorsFor(target)
      if (suitors.length === 0) continue
      const club = suitors[(ovr(target) + raceIndex + oi * 7) % suitors.length]
      if (!clubMayOffer(target, club.id, foreignIncoming)) continue
      const tv = calcTransferValue(target)
      const price = roundFee(tv * (0.95 + Math.random() * 0.25), 1_000_000)
      if (price > foreignCapOf(club)) continue
      foreignIncoming.push({ id: `finc-${raceIndex}-${club.id}-${target.id}`, fromTeamId: club.id, playerId: target.id, offeredPrice: price, expiresAtRace: raceIndex + 5, round: 1, fromForeign: true })
    }
  }

  // 2) レンタル打診：相手（国内/海外）が自チームの選手を借りたい（lend_out）。
  // 貸出歓迎に設定した選手がいれば優先的・高確率（70%）でその中から。いなければ従来どおり低確率で若手に
  {
    const listedCands = myLoanListed.filter(p => !loanTargetIds.has(p.id))
    const youngCands = myYoung.filter(p => !loanTargetIds.has(p.id)).sort(comparePlayers('ovr'))
    const target = listedCands.length > 0 && Math.random() < 0.70
      ? listedCands[(raceIndex + listedCands.length) % listedCands.length]
      : (youngCands.length > 0 && Math.random() < 0.25 ? youngCands[0] : null)
    if (target) {
      const pool: { id: string; fromForeign: boolean }[] = [...aiTeams.map(t => ({ id: t.id, fromForeign: false })), ...foreignClubs.map(c => ({ id: c.id, fromForeign: true }))]
      if (pool.length > 0) {
        const from = pool[(ovr(target) + raceIndex) % pool.length]
        loanOffers.push({ id: `loanout-${raceIndex}-${from.id}-${target.id}`, fromTeamId: from.id, playerId: target.id, direction: 'lend_out', years: 1 + (target.age % 2), expiresAtRace: raceIndex + 3, fromForeign: from.fromForeign })
      }
    }
  }

  // 3) レンタル打診：相手が自チームに選手を貸したい（borrow_in・国内チームのみ）。
  // クラブが貸しに出すのは「出番のない選手」：出場率が低い26歳以下から、こちらの補強ニーズに合う選手を優先して提示
  if (aiTeams.length > 0 && Math.random() < 0.20) {
    const myNeedsLoan = cpuSpecialtyNeeds(playerTeamId, players)
    // ★出場率は「そのクラブが走っている日程」で数える（utils/playRate の1本）。
    //   自分の部の日程で数えると、他の部のクラブの選手は全員0＝全員が「干されている」に
    //   なり、1部・2部の選手が丸ごとレンタルの出し手候補になっていた
    const playFrac = (pid: string, clubId: string) =>
      playRateOf(pid, clubId, season ?? { races }, teams).fraction
    const cands = players.filter(p =>
      p.teamId !== playerTeamId && p.teamId !== '' && aiTeams.some(t => t.id === p.teamId)
      && p.status === 'active' && !p.loan && p.age <= 26 && ovr(p) < 76 && !loanTargetIds.has(p.id)
      && playFrac(p.id, p.teamId) < 0.35)   // 出場率3.5割未満＝現所属で干されている選手だけが貸しに出される
    const fits = cands.filter(p => myNeedsLoan.includes(p.specialty))
    // 干され組の中では実力上位を提示（借りる価値のある選手にする）
    const cand = (fits.length > 0 ? fits : cands).sort(comparePlayers('ovr'))[0]
    if (cand) {
      loanOffers.push({ id: `loanin-${raceIndex}-${cand.teamId}-${cand.id}`, fromTeamId: cand.teamId, playerId: cand.id, direction: 'borrow_in', years: 1, expiresAtRace: raceIndex + 3 })
    }
  }

  return { foreignIncoming, loanOffers }
}

export function generateTransferActivity(
  players: Player[],
  teams: Team[],
  playerTeamId: string,
  raceIndex: number,
  existingListings: TransferListing[],
  existingIncoming: IncomingOffer[],
  transferRequests: { playerId: string; reason: string }[] = [],
  retiringIds: Set<string> = new Set(),  // 引退希望中の選手（オファー・接触の対象外にする）
  currentYear = 0,                       // 今のシーズン年。加入1年目の選手をオファー対象から外すのに使う
  totalRaces = 0,                        // 今季のレース数。契約残りの月数を出すのに使う（フリー接触の解禁時期）
): { listings: TransferListing[]; incomingOffers: IncomingOffer[] } {
  const validListings = existingListings.filter(l => l.expiresAtRace > raceIndex)
  const validIncoming = existingIncoming.filter(o => o.expiresAtRace > raceIndex)

  const listedPlayerIds = new Set(validListings.map(l => l.playerId))
  const newListings: TransferListing[] = []
  const newIncoming: IncomingOffer[] = []
  const aiTeams = teams.filter(t => t.id !== playerTeamId)

  for (const team of aiTeams) {
    // 出品できるのは保有権のある選手だけ。ここが抜けていたため、他クラブから借りている選手が
    // 「出品中」として移籍市場に並び、そこから入札で奪われていた
    const teamPlayers = players.filter(p => isOwnedBy(p, team.id))
    if (validListings.filter(l => l.fromTeamId === team.id).length >= 3) continue

    // 「余っている選手」＝そのクラブで出番が無い序列の選手（transferDecision の hasNoPlayingTime 1本、
    // 走れる人数の2倍より下）。以前はここに平均OVRから作った下限表（72/65/58）と、
    // OVR65の下限が4か所にあった。下限はクラブの平均に連動するので、
    // 弱いクラブでは誰も出せず（52クラブ中17クラブが1人も出せなかった）、
    // 強いクラブでは「平均より5低い」だけで走れる主力まで市場に出ていた
    const listRanked = [...teamPlayers.filter(p => p.status === 'active')].sort(comparePlayers('ovr'))
    const spare = (p: Player) =>
      !listedPlayerIds.has(p.id) && hasNoPlayingTime(listRanked.findIndex(x => x.id === p.id) + 1)
    let listed = false

    // Surplus specialist: 3+ players of same specialty → list the weakest
    if (!listed) {
      const specGroups: Record<string, Player[]> = {}
      for (const p of teamPlayers) {
        if (!specGroups[p.specialty]) specGroups[p.specialty] = []
        specGroups[p.specialty].push(p)
      }
      for (const group of Object.values(specGroups)) {
        if (listed || group.length < 3) continue
        const c = [...group].filter(p => spare(p) && p.contract.yearsLeft > 0).sort((a, b) => ovr(a) - ovr(b))[0]
        if (c) {
          const price = roundFee(calcTransferValue(c) * (c.age > 28 ? 0.85 : 1.0))
          newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: price, listedAtRace: raceIndex, expiresAtRace: raceIndex + 6, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.5).slice(0, 3).map(t => t.id) })
          listedPlayerIds.add(c.id); listed = true
        }
      }
    }

    // Surplus roster > 20: list player well below team average
    if (!listed && teamPlayers.length > 20) {
      const c = [...teamPlayers].filter(p => spare(p) && p.contract.yearsLeft > 0).sort((a, b) => ovr(a) - ovr(b))[0]
      if (c) {
        newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: roundFee(calcTransferValue(c)), listedAtRace: raceIndex, expiresAtRace: raceIndex + 5, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.4).slice(0, 3).map(t => t.id) })
        listedPlayerIds.add(c.id); listed = true
      }
    }

    // Aging player (>30) with expiring contract below team average
    if (!listed) {
      const c = [...teamPlayers].filter(p => p.age > 30 && spare(p) && p.contract.yearsLeft <= 1).sort((a, b) => a.age - b.age)[0]
      if (c) {
        newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: roundFee(calcTransferValue(c) * 0.7), listedAtRace: raceIndex, expiresAtRace: raceIndex + 4, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.25).slice(0, 2).map(t => t.id) })
        listedPlayerIds.add(c.id); listed = true
      }
    }

    // 契約満了間近で、走れる7人に入らない選手
    if (!listed) {
      const c = [...teamPlayers].filter(p => p.contract.yearsLeft <= 1 && spare(p)).sort((a, b) => ovr(a) - ovr(b))[0]
      if (c) {
        newListings.push({ id: `lst-${raceIndex}-${c.id}`, playerId: c.id, fromTeamId: team.id, askingPrice: roundFee(calcTransferValue(c) * 0.65), listedAtRace: raceIndex, expiresAtRace: raceIndex + 4, competingTeams: aiTeams.filter(t => t.id !== team.id && Math.random() < 0.25).slice(0, 2).map(t => t.id) })
        listedPlayerIds.add(c.id)
      }
    }
  }

  // 自チームへのオファー対象。「誰に話を持ちかけていいか」の条件は utils/transferEligibility.ts に集約
  const eligCtx = { teamId: playerTeamId, currentYear, retiringIds }
  const playerTeamPlayers = players.filter(p => canBePoached(p, eligCtx))
  const offerTargets = new Set(validIncoming.map(o => o.playerId))
  const offeringTeams = new Set(validIncoming.map(o => o.fromTeamId))
  const wantToLeaveIds = new Set(transferRequests.map(r => r.playerId))

  // ★開幕直後は打診が来ない。51クラブが毎レース抽選するので、何もしないと
  //   1戦目でいきなり5件並ぶ（期待値で13クラブが動く）。
  //   シーズンが少し進んで、その選手の出来が見えてから動き出す形にする。
  const OFFER_START_RACE = 3
  // ★1レースに増える新規の打診はここまで。まとめて来るのではなく少しずつ増える
  const MAX_NEW_OFFERS_PER_RACE = 2

  for (const team of raceIndex < OFFER_START_RACE ? [] : aiTeams) {
    if (newIncoming.length >= MAX_NEW_OFFERS_PER_RACE) break
    if (offeringTeams.has(team.id)) continue
    const teamPlayers = players.filter(p => p.teamId === team.id)
    const teamRoster = teamPlayers.filter(p => p.status === 'active')
    const tier = tierOf(team)
    const needsSlot = teamPlayers.length < 20
    // どれだけ動くかは**そのクラブの格**で決まる（格1が45%、格20が15%）。
    // 海外の引き抜きの積極さ（engine/foreignTransfers の aggression）と同じ形。
    // 以前はロスターの平均OVRから作った elite/mid/weak の3段階だった
    const wantsUpgrade = Math.random() < 0.15 + 0.30 * tierStrength(tier)

    // Teams are also attracted by players who have requested transfers
    const transferWantedPlayers = playerTeamPlayers.filter(p => wantToLeaveIds.has(p.id) && !offerTargets.has(p.id))
    const hasTransferTarget = transferWantedPlayers.length > 0 && Math.random() < 0.60

    if (!needsSlot && !wantsUpgrade && !hasTransferTarget) continue

    // 高齢選手（34歳超）は移籍金オファーの対象外。並びも年齢調整OVR（33歳以上は減点）で若い実力者を優先。
    // ★そのクラブが本当に必要としているタイプだけを狙う（utils/squadNeeds.ts の needsPlayer）。
    //   買う側の取り合い（rivalsFor）と同じ判定で、ここに新しい条件を書かないこと。
    //   以前は cpuSpecialtyNeeds（人数が2人未満のタイプ）を並び替えの優先にしか使っておらず、
    //   足りているタイプのエースにも打診が飛んでいた（買う側と非対称だった）。
    //   OVRの下限表（72/65・78/73）もここにあったが、needsPlayer の直前に置かれた
    //   ただの重複だった。人数が足りないときは走れるかどうかも見る
    let targets = playerTeamPlayers.filter(p =>
      !offerTargets.has(p.id) && p.age <= 34
      && (needsPlayer(teamRoster, p) || (needsSlot && wouldMakeLineup(teamRoster, p))))
    // Prioritize players who want to leave
    const wantLeaveTargets = targets.filter(p => wantToLeaveIds.has(p.id))
    if (wantLeaveTargets.length > 0) targets = wantLeaveTargets
    if (targets.length === 0) continue
    targets.sort((a, b) => effectiveOvr(b) - effectiveOvr(a))
    const target = targets[0]
    const tv = calcTransferValue(target)
    // 相場まで払えないチームはオファーを出さない。
    // 上限は「格の年間予算の20%まで、手元の資金がそれより少なければそちら」の1本
    // （economy の transferCapOf）。以前はここだけ手元の資金しか見ておらず、
    // 格の意味が消えていた（貯金さえあれば格20のクラブが上限なしに出せた）
    if (transferCapOf(tierBudget(team), team.finance?.budget ?? 0) < tv) continue
    // 提示額は相場の80〜105%。格が高いクラブほど強気に出す（格1で85〜105%、格20で80〜97%）
    const ratio = 0.80 + 0.05 * tierStrength(tier) + Math.random() * (0.17 + 0.03 * tierStrength(tier))
    newIncoming.push({ id: `inc-${raceIndex}-${team.id}-${target.id}`, fromTeamId: team.id, playerId: target.id, offeredPrice: roundFee(tv * ratio, 1_000_000), expiresAtRace: raceIndex + 5, round: 1 })
    offerTargets.add(target.id)
    offeringTeams.add(team.id)
  }

  // Competing bids for player-listed players (more likely for high-OVR players)
  // 自チームの出品への入札（オファーチャット）。
  // lst-allow-（移籍を認めた／移籍方針の売出）はチャット対応なしの自動売却専用なのでオファーを生成しない
  const myListings = [...validListings, ...newListings].filter(l => l.fromTeamId === playerTeamId && !l.id.startsWith('lst-allow-'))
  // 出品した選手には複数クラブが入札してくる（取り合い）。上限は MAX_OFFERS_PER_PLAYER
  const allIncomingNow = () => [...validIncoming, ...newIncoming]
  for (const listing of myListings) {
    const p = players.find(pl => pl.id === listing.playerId)
    // 出品が残っていても、そのあと海外挑戦を承認した／引退希望を受けた選手には入札が来ない
    if (!p || !canBePoached(p, eligCtx)) continue
    const cur = allIncomingNow().filter(o => o.playerId === p.id)
    if (cur.length >= MAX_OFFERS_PER_PLAYER) continue
    const already = new Set(cur.map(o => o.fromTeamId))
    const bidChance = ovr(p) >= 80 ? 0.65 : ovr(p) >= 72 ? 0.45 : 0.25
    // 本人が今季断ったクラブは、もう入札してこない
    const biddingTeams = aiTeams
      .filter(t => !already.has(t.id) && canClubApproachAgain(p, t.id, currentYear))
      .filter(() => Math.random() < bidChance)
      .slice(0, MAX_OFFERS_PER_PLAYER - cur.length)
    for (const bTeam of biddingTeams) {
      const tv = calcTransferValue(p)
      newIncoming.push({
        id: `inc-lst-${raceIndex}-${bTeam.id}-${p.id}`,
        fromTeamId: bTeam.id,
        playerId: p.id,
        offeredPrice: Math.max(roundFee(listing.askingPrice * 0.92), roundFee(tv * (0.85 + Math.random() * 0.20))),
        expiresAtRace: raceIndex + 5,
        round: 1 })
    }
  }

  // 契約が切れそうな自チーム選手には、他チームからフリー移籍（移籍金なし）のオファーが来る。
  // レンタルで借りている選手は保有権が無いので対象外。引退希望中の選手は「引退か引き留めか」の話なので勧誘しない。
  //
  // ★解禁は「残り6ヶ月を切ってから」。残1年になった瞬間（＝開幕直後）から来ていたので、
  //   GMが契約更新を切り出す前に他クラブが接触し、更新の窓が実質なかった。
  //   6ヶ月は contractTalk の RENEWAL_ATTENTION_MONTHS＝「契約が切れそう」とGMに知らせ始める
  //   タイミングそのもの。**同じ1本を使う**（片方だけ動かすと窓がまたズレる）。
  //   月数の出し方も contractMonthsLeft 1本（通知・ホーム・チャットと同じ式）。
  const expiringMine = players.filter(p =>
    p.contract.yearsLeft <= 1
    && contractMonthsLeft(p.contract.yearsLeft, raceIndex, Math.max(1, totalRaces)) < RENEWAL_ATTENTION_MONTHS
    && canReceiveFreeContact(p, eligCtx))
  for (const ep of expiringMine) {
    // フリー移籍の接触は本人の話なので1人1件のまま（GMは関与できない）
    if (allIncomingNow().some(o => o.playerId === ep.id)) continue
    const chance = ovr(ep) >= 75 ? 0.5 : ovr(ep) >= 65 ? 0.3 : 0.15
    if (Math.random() >= chance) continue
    const suitor = aiTeams.find(t => !offeringTeams.has(t.id))
    if (!suitor) continue
    newIncoming.push({
      id: `inc-free-${raceIndex}-${suitor.id}-${ep.id}`,
      fromTeamId: suitor.id,
      playerId: ep.id,
      offeredPrice: 0, // フリー移籍（移籍金なし・GMは関与できず、期限が来たら本人が決断する）
      expiresAtRace: raceIndex + 3,
      round: 1 })
    offeringTeams.add(suitor.id)
  }

  return { listings: [...validListings, ...newListings], incomingOffers: [...validIncoming, ...newIncoming] }
}


// ─────────────────────────────────────────────────────────────────────────────

// calcTransferValue は playerUtils に一本化（重複を排除）。この行より上の import から使用する。

