// season ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
import type { ForeignClub, WorldClub } from '../../types'
import { INITIAL_FOREIGN_CLUBS, leagueRules } from '../../data/leagues'
import { drawSeasonSchedules, generateIndividualEvents, generateSeasonRaces } from '../../data/races'
import { ACHIEVEMENT_JEWELS, checkSeasonAchievements, podiumJewels, selectSeasonObjectives } from '../../engine/achievements'
import { buildEclParticipants, buildEclRaces } from '../../engine/eclSeries'
import { growPlayer } from '../../engine/growth'
import { generateDraftPool, generateForeignLeaguePlayers, refreshForeignLeagues, refreshDomesticYouth, fillRostersForSeason } from '../../engine/playerGenerator'
import { type GmOffer, type Player, SPECIALTY_LABELS, type SeasonAward, type TransferRecord } from '../../types'
import { archiveSeason } from '../../utils/archiveSeason'
import { computeSeasonAwards } from '../../utils/awards'
import { processContractExpiry, settleZeroContracts } from '../../engine/contractExpiry'
import { applySeasonCareerRecords } from '../../engine/careerRecords'
import { computeDynastyMilestones } from '../../engine/dynastyMilestones'
import { collectEventSeasonTops } from '../../engine/eventSeasonTops'
import { settleSeasonObjectives } from '../../engine/seasonObjectives'
import { collectDepartures } from '../../engine/departureNotices'
import { prepareSeasonArchive } from '../../engine/seasonArchivePrep'
import { pruneSaveData } from '../../engine/savePruning'
import { issueDraftPicks } from '../../engine/draftPicks'
import { computePromotion } from '../../engine/promotion'
import { processRetirements } from '../../engine/retirement'
import { processSeasonSponsors } from '../../engine/sponsorSeason'
import { settleBonusClauses } from '../../engine/bonusPayout'
import { computeSeasonBudgets } from '../../engine/seasonBudget'
import { tierBudget } from '../../utils/clubTier'
import { appraiseGmInvite, gmInviteFeeFor } from '../../utils/gmInvite'
import { clubById, clubIdSet, clubMap, clubsWhere, isJpelLeague, jpelClubs, mapClubs, myClub, myLeagueId, myLeagueRaces, otherClubs, withAddedClubs, withMyClub } from '../../utils/world'
import { MORALE_DEFAULT, setMorale } from '../../utils/condition'
import { ALL_DOMESTIC_TEAMS, backfillDomesticClubs } from '../../utils/domesticClubs'
import { buildOffer, canResignAsGm, makeGmOffer, resignOffers } from '../../utils/gmOffer'
import { managedTeamIds, startTenure } from '../../utils/gmTenure'
import { standingsByLeague, titleKeyOf, titleTier, TOP_DIVISION, draftPickHolders, myLeagueSize, newSeasonStandings, rankOfTeam, seasonLeagueStandings, divisionLeagues } from '../../utils/league'
import { leagueChampionHeadline, divisionsFoundedHeadline, growthHeadline, massFreeAgentHeadline, objectiveBonusHeadline, retiredHeadline, seasonBudgetHeadline, seasonOpenHeadline } from '../../utils/newsItems'
import { comparePlayers } from '../../utils/playerSort'
import { faMarketSalary, newContractYears, ovr, packForeignApps, perfOf } from '../../utils/playerUtils'
import { movePlayer } from '../../utils/movePlayer'
import { squadIdsOf, clubIndexOf } from '../../utils/rosterSync'
import { needsPlayer, squadRankOf } from '../../utils/squadNeeds'
import { teamHistoryOf } from '../../utils/teamHistory'
import { hasNoPlayingTime } from '../../utils/transferDecision'
import { writeSeasonArchive } from '../seasonArchive'
import { facilitiesOf, facilityScoutPoints } from '../../utils/facilities'
import { withCopiedSchedules } from '../../engine/leagueDay'

type Slice = Pick<GameStore,
  'startRegularSeason' | 'initObjectivesIfEmpty' | 'endSeason' | 'acceptGmOffer' | 'declineGmOffer' | 'resignAsGm'>

/**
 * **指揮するクラブを入れ替える。移る処理はこの1本だけ。**
 *
 * 通る入口は2つあるが、やることは同じ。
 *   ① `acceptGmOffer` … シーズン終わりに向こうから届いたオファーを受けたとき（もう来季）
 *   ② `endSeason`     … 自分から退任して**来季から**と決まっていたのが実行されるとき
 *
 * ★呼ぶ側で「どっちの入口か」を書き分けないこと。以前ここが `acceptGmOffer` の中に
 *   直接書いてあったので、来季からの就任を足すときに2本目を書く形になっていた。
 *
 * ★渡す `state` は**入れ替えたあとの世界の土台**。`endSeason` から呼ぶときは、
 *   来季を組み立て終えた状態（`{ ...state, ...next }`）を渡すこと。
 *   予算・目標・スカウトP は `offer` が持っているものへ差し替えるので、
 *   **`offer` は移る直前の数字で作り直す**（`buildOffer` を endSeason 側で呼び直す）。
 */
function applyGmMove(state: GameStore, offer: GmOffer, inviteId?: string): Partial<GameStore> {
  const oldTeamId = state.playerTeamId
  // 監督名は人について回る。前のチームには元のGM名を戻す
  const myGmName = myClub(state)?.gmName
    ?? state.setupData?.gmName ?? '監督'
  // もともとの監督名はクラブの初期データから（1部も2部・3部も）。持たないクラブ（海外）は
  // gmName を外して utils/clubs の clubGmName（国の名前プールから固定で1つ）に戻す
  const oldOriginalGm = ALL_DOMESTIC_TEAMS.find(t => t.id === oldTeamId)?.gmName
  let clubs = mapClubs(state.clubs, (t): WorldClub => {
    if (t.id === offer.teamId) return { ...t, isPlayerControlled: true, gmName: myGmName }
    // ★施設は**置いていく**。オファー画面のとおり移籍先のものを引き継ぐので
    //   （施設のレベルは `utils/facilities` の `facilitiesOf`＝格の土台＋建てたぶん）、
    //   前のクラブに自分が建てたぶんを残すと、CPUに戻ったあとも格に合わない施設を持ち続ける
    if (t.id === oldTeamId) {
      const left = { ...t, isPlayerControlled: false, facilities: {} }
      if (oldOriginalGm) return { ...left, gmName: oldOriginalGm }
      delete (left as { gmName?: string }).gmName
      return left
    }
    return t
  })
  // 移籍方針（非売・貸出歓迎）は監督が付けた指示。CPUに戻るチームに残すと
  // 「絶対に売られない選手」がずっと居座って移籍市場が固まるので外す
  let players = state.players.map(p => (
    p.teamId === oldTeamId && (p.noSale || p.loanListed || p.transferListed)
      ? { ...p, noSale: false, loanListed: false, transferListed: false }
      : p
  ))

  // ── 1人だけ連れて行く（オーナー判断・2026-08-13）────────────────────
  //
  // 声はかけられるが、**行くかどうかは選手が決める**。
  // 判定は `utils/gmInvite` の `appraiseGmInvite` 1本（中身は移籍と同じ
  // `appraiseMove` で、変わるのは愛着の向き先だけ）。**ここで判定を書かないこと。**
  //
  // ★`inviteId` が入っているのは「チャットで頷いてもらった相手」だけ
  //   （関門は `acceptGmOffer`。頷いていない相手はそこで落ちるので予約に入らない）。
  //   **ここで聞き直さないこと。** 退任からの就任は動くのが来季の入れ替わりのときで、
  //   そのあいだに年を取り名簿も変わる。聞き直すと「ついて行きます」と言った選手が
  //   来なくなる（実測で12人中4人）。引き直すのは移籍金だけ。
  const invited = inviteId ? players.find(p => p.id === inviteId) : undefined
  // ★**ふつうの移籍とまったく同じ扱いにする**。移籍金が動くだけでなく、
  //   移籍の記録（`transferHistory`＝チーム詳細の移籍ページ）と、
  //   新しいクラブの今季の移籍金支出（`transferSpend`＝予算ページ）にも残す。
  //   以前は `movePlayer` の戻り値の record を捨てていて、**お金は動くのに
  //   どこにも移籍として出てこない**状態だった
  let inviteRecord: TransferRecord | null = null
  let inviteSpend = 0
  if (invited) {
    const fee = gmInviteFeeFor({
      players, clubs: state.clubs,
      currentSeason: state.currentSeason, fromTeamId: oldTeamId,
      destinationOf: state.destinationOf,
      playerTierOf: state.playerTierOf,
    }, invited.id)
    if (fee != null) {
      const m = movePlayer({ players, clubs }, invited.id, offer.teamId, {
        year: offer.year, date: `${offer.year}-02-01`, fee, myTeamId: offer.teamId })
      // ★お金は movePlayer の中で両側が動く（utils/clubMoney の payBetween）。
      //   返ってきた clubs を受け取らないと、新しいクラブが払っていないことになる
      if (m.ok) { players = m.players; clubs = m.clubs; inviteRecord = m.record; inviteSpend = m.spend }
    }
  }

  // ECLの「どれが自チームか」の印は前季の終わりに焼き付けてある。
  // 移籍したらここを付け替えないと、来季のECLで前のチームが自チーム扱いになり
  // オーダーを組む相手と自動シミュの対象がずれる
  const ecl = state.currentSeason.eclSeries
  const eclSeries = ecl
    ? { ...ecl, participants: ecl.participants.map(pt => ({ ...pt, isPlayerTeam: pt.id === offer.teamId })) }
    : ecl
  return {
    playerTeamId: offer.teamId,
    clubs,
    // 連れて来た選手の契約が残り0年なら1年足す（endSeason と同じ settleZeroContracts 1本）
    players: settleZeroContracts(players, offer.teamId, offer.year),
    gmOffers: [],
    // 予約は使い切る（残すと毎年ここへ来る）
    pendingGmMove: null,
    // 前のチームのオーダーは「前回のオーダー」として残さない
    lastRaceLineup: {},
    gmTenures: startTenure(state.gmTenures, offer.teamId, offer.year, oldTeamId),
    // 移籍先が因縁のチームだったらライバル設定は解除する
    rivalTeamId: state.rivalTeamId === offer.teamId ? null : state.rivalTeamId,
    transferHistory: [...(state.transferHistory ?? []), ...(inviteRecord ? [inviteRecord] : [])].slice(-400),
    seasonBudgetNotice: { year: offer.year, budget: offer.budget },
    currentSeason: {
      ...state.currentSeason,
      eclSeries,
      initialBudget: offer.budget,
      seasonGrant: offer.budgetBreakdown.grant,
      budgetBreakdown: offer.budgetBreakdown,
      scoutPoints: offer.scoutPoints,
      // 目標は移籍先の部の人数と、その部での前季順位で引き直す。
      // 52を渡すと「52チーム中◯位」の目標になり、16チームの部では達成不能になる
      objectives: selectSeasonObjectives(
        state.rivalTeamId === offer.teamId ? false : !!state.rivalTeamId,
        offer.divisionSize ?? myLeagueSize(state),
        offer.prevRank,
      ),
      // ★日程は差し替えない。自チームの日程は「自チームが順位表に載っているリーグ」から引く
      //   （utils/world の myLeagueRaces）ので、playerTeamId が移籍先に変わった瞬間に
      //   移籍先のリーグの日程になる。
      trainingAssignments: {},
      transferSpend: inviteSpend,
      scoutMissions: [] },
    raceLineup: {} }
}

export const createSeasonSlice = (set: SetGame, get: () => GameStore): Slice => ({

  startRegularSeason: () => set(state => {
    // ★**在籍が `SEASON_START_ROSTER`(20) に満たないクラブを、ここで20人まで埋めて開幕する**
    //   （オーナー・2026-09-25「20人以下の場合は20人になるまで自動補填」「格によって初期値が違う」）。
    //   開幕の直前なら、満了も引退もドラフトも全部終わったあとの**確定した人数**を見られます。
    //   足すのは `fillRostersForSeason` 1本で、**2か所で足さないこと**（`endSeason` 側には置かない）。
    //   自チームだけでなく世界中のクラブを見ます（出口は232クラブ全部にあるので、床も全部に要る）。
    const rescued = fillRostersForSeason(state.clubs, state.currentSeason.year, state.players)
    const players = rescued.length > 0 ? [...state.players, ...rescued] : state.players
    // プレシーズンのドラフト（今季スカウトした代）が終わったので、
    // 今季スカウトする「翌年の代」を新規生成する。前回ドラフト済みの代の残りを置き換える。
    // これで endSeason 側で引き継いだ視察済みプールがドラフトに使われ、シーズン中の視察は常に新しい代になる。
    const freshScoutPool = generateDraftPool(state.currentSeason.year + 1, new Set(players.map(pl => pl.name)))
    if ((state.currentSeason.objectives ?? []).length === 0) {
      const firstObjectives = selectSeasonObjectives(!!state.rivalTeamId, myLeagueSize(state))
      return { players, currentSeason: { ...state.currentSeason, phase: 'regular', objectives: firstObjectives, scoutProspects: freshScoutPool } }
    }
    return { players, currentSeason: { ...state.currentSeason, phase: 'regular', scoutProspects: freshScoutPool } }
  }),


  initObjectivesIfEmpty: () => set(state => {
    const objs = state.currentSeason.objectives
    if (objs.length === 0) {
      return { currentSeason: { ...state.currentSeason, objectives: selectSeasonObjectives(!!state.rivalTeamId, myLeagueSize(state)) } }
    }
    const hasJewels = objs.some(o => (o.rewardJewels ?? 0) > 0)
    if (!hasJewels) {
      const migrated = objs.map(o => ({
        ...o,
        rewardJewels: o.id === 'topN' ? 50 : o.id === 'segWins' ? 40 : o.id === 'noInjury' ? 30 : o.id === 'budgetMaintain' ? 40 : 30 }))
      return { currentSeason: { ...state.currentSeason, objectives: migrated } }
    }
    return state
  }),


  endSeason: () => {
    // ★**その年の世界選手権／アジア予選が終わっていなければ、シーズンを終わらせない。**
    //   （2026-08-12・オーナー「誰でも確実に参加できるようにしてくれ」）
    //
    //   記録を積むのは大会が終わった1か所（worldAthleticsSlice の advanceWorldRace）だけなので、
    //   「勝手に開催済みになる」ことは起きない。**穴は「開催しないまま年が進む」ほう**で、
    //   一度その年を跨ぐと**二度と開催されない**（過去の年の大会は開けない）。
    //   画面の分岐だけに頼っていると、経路が1つ増えただけで静かに飛ばせてしまうので、
    //   ここで構造的に止める。ECLの残り戦と同じ「先に消化してから締める」形。
    {
      const st = get()
      const y = st.currentSeason.year
      const held = (st.worldAthleticsResults ?? []).some(r => r.year === y)
      if (!held) {
        // まだなら、その場で開催して締める（代表が未選考ならおまかせで組まれる）
        try {
          get().startWorldTournament()
          let guard = 0
          while (guard++ < 12) {
            const t = get().worldTournament
            if (!t || t.year !== y || t.finished) break
            get().advanceWorldRace()
          }
        } catch (e) {
          console.error('world athletics auto-run failed', e)
        }
        // それでも積まれなかったら、**シーズンを終わらせない**（黙って年を飛ばさない）
        if (!(get().worldAthleticsResults ?? []).some(r => r.year === y)) {
          console.error(`[wa] ${y}年の世界選手権が開催できなかったのでシーズンを締めません`)
          return
        }
      }
    }
    // ECLの残り戦が未消化ならAI配置で自動開催してからシーズンを締める
    {
      let guard = 0
      while (guard++ < 8) {
        const es = get().currentSeason.eclSeries
        if (!es || es.raceIndex >= es.races.length) break
        try { get().advanceEclRace() } catch (e) { console.error('advanceEclRace failed', e); break }
      }
    }
    // ほかのリーグ（国内の他の部・海外）の残り日程を全部走らせる（engine/leagueDay 1本）。
    // 自分のリーグの戦数が少ない（3部は7戦）と、ほかのリーグの日程が残ったままシーズンが終わる
    get().advanceLeaguesTo(`${get().currentSeason.year}-12-31`)
    set(state => {
      const newYear = state.currentSeason.year + 1

      // Record OVR before growth for history
      const ovrSnapshot: Record<string, number> = {}
      state.players.forEach(p => { ovrSnapshot[p.id] = ovr(p) })

      // CPUチーム：予算ベースの契約更新（今季満了の主力を予算内で延長）
      // CPUの契約更新も自チームと同じ市場カーブ（faMarketSalary）で。
      // 旧式(ovr×110000)は約1000万で頭打ちになり、OVR90の主力が激安になる不具合があった。
      const cpuRenewalSalary = (p: Player) => faMarketSalary(p, perfOf(p, state))
      const cpuRenewIds = new Set<string>()
      {
        // 格を引くクラブ一覧は**国内52＋海外180**（`allTieredClubs`）。
        // ★以前ここは `state.teams.find(...)` で引いていて、**海外クラブには必ず
        //   `undefined` が返り**、`tierOf(undefined)` が最下位の格（20）に落ちていました。
        //   下のループは選手の `teamId` から作るので海外180クラブも入っているのに、
        //   **海外は全部 4.2億（格20）で更新判定**＝本来 21.1億の格1が1/5の原資で、
        //   満了した主力が更新されずFAへ流れていました。
        const renewalClubById = clubMap(state.clubs, c => c)
        const cpuTeamIdsRenewal = [...new Set(
          state.players
            .filter(p => p.teamId && p.teamId !== '' && p.teamId !== '__pool__' && p.teamId !== state.playerTeamId && p.status === 'active')
            .map(p => p.teamId)
        )]
        for (const teamId of cpuTeamIdsRenewal) {
          // 誰を更新するかは「そのクラブで出番があるか」（transferDecision の hasNoPlayingTime）と
          // 「穴が空いているか」（squadNeeds の needsPlayer）だけ。
          // 以前はここに平均OVRから作った下限表（72/65/58）があり、格とは別の物差しだった。
          // 下限はクラブの平均に連動するので、弱いクラブほど下限も下がって実質全員が通っていた
          // 在籍の数え方は `utils/rosterSync` の索引1本（引退していない人は全員＝怪我も在籍）。
          // 以前は `status === 'active'` で怪我人が落ち、原資からその年俸が抜けていた
          const renewRoster = [...(clubIndexOf(state.players).get(teamId) ?? [])].sort(comparePlayers('ovr'))
          const ongoingCommitted = renewRoster
            .filter(p => p.contract.yearsLeft > 1)
            .reduce((s, p) => s + p.contract.annualSalary, 0)
          // 更新に使える原資も「格ぶんの予算 − 既存の年俸」。順位ではない
          let budget = Math.max(0, tierBudget(renewalClubById.get(teamId)) - ongoingCommitted)
          const expiring = renewRoster.filter(p => p.contract.yearsLeft === 1)
            .sort(comparePlayers('ovr'))
          for (const p of expiring) {
            // 序列は `utils/squadNeeds` の `squadRankOf` 1本（すぐ下の `needsPlayer` と同じ物差し）。
            // `findIndex` で数え直すと、同じOVRが並んだときに答えが割れる
            const renewRank = squadRankOf(renewRoster, p)
            if (hasNoPlayingTime(renewRank) && !needsPlayer(renewRoster, p)) continue
            const sal = cpuRenewalSalary(p)
            if (budget < sal) continue
            cpuRenewIds.add(p.id)
            budget -= sal
          }
        }
      }

      // 加齢処理 + 契約更新適用
      const grownPlayers = state.players.map(pRaw => {
        // オフシーズンで負傷は全快（負傷状態と復帰カウントを持ち越さない）
        const p = pRaw.status === 'injured' ? { ...pRaw, status: 'active' as const, injuredUntilRace: undefined, injuryName: undefined } : pRaw
        // 自チーム以外(CPU・海外)は毎年ポテンシャルへ向けて成長させる。自チームはレース/カードEXPで成長。
        // ★成長（EXP）は `engine/raceProgress` がレースごとに配ります。
        //   ここは加齢と衰えだけ（2026-08-20 に自チームとCPUで形を揃えた）
        const grown = p.status === 'active' || p.status === 'injured' ? growPlayer(p) : p
        const snap = ovrSnapshot[p.id]
        const withHistory = snap == null ? grown : { ...grown, ovrHistory: [...(p.ovrHistory ?? []), { year: state.currentSeason.year, ovr: snap }].slice(-8) }
        if (cpuRenewIds.has(p.id)) {
          const newSalary = cpuRenewalSalary(withHistory)
          const years = newContractYears(withHistory, newYear)
          // 契約を更新したら「加入したときの契約」の印を消す＝そこから動けるようになる
          return { ...withHistory, contract: { ...withHistory.contract, yearsLeft: years, annualSalary: newSalary, faEligibleYear: newYear + years, signedOnJoin: false } }
        }
        return withHistory
      })

      // Build growth report for player team
      const mainIds = squadIdsOf(state.players, state.playerTeamId)
      const growthEntries = mainIds
        .map(id => {
          const before = state.players.find(p => p.id === id)
          const after = grownPlayers.find(p => p.id === id)
          if (!before || !after) return null
          return {
            playerId: id,
            name: before.name,
            age: after.age,
            specialty: before.specialty,
            ovrBefore: ovr(before),
            ovrAfter: ovr(after) }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => Math.abs(b.ovrAfter - b.ovrBefore) - Math.abs(a.ovrAfter - a.ovrBefore))

      // 契約満了 → FA、レンタル満了 → 保有元へ返却。engine/contractExpiry 1本
      const expiry = processContractExpiry({
        grownPlayers, clubs: state.clubs,
        playerTeamId: state.playerTeamId, year: state.currentSeason.year })
      const expiredIds = expiry.expiredIds
      const playersAfterFA = expiry.players
      // 行き先が決まらなかった退団予定の選手（新シーズンの stayOrLeave に積む）
      const undecidedIds = expiry.undecidedIds

      // ── RETIREMENT SYSTEM ──
      // 引退の年度処理は engine/retirement 1本（引退年齢・引退の反映）
      const retire = processRetirements({
        grownPlayers, playersAfterFA, year: state.currentSeason.year })
      const retiringIds = retire.retiringIds
      const playersAfterRetire = retire.players

      // 毎年の新しい選手の入口はリーグの決まり（data/leagueRules の newcomers）。
      // 'refresh'（海外9リーグ）は引退を外し、若手を新加入させる。
      // ただし旧セーブの大再編が保留中なら、この年度更新で新9リーグへ丸ごと置換し旧海外選手は退場させる。
      const pendingRestructure = (state.currentSeason as unknown as { pendingForeignRestructure?: boolean }).pendingForeignRestructure === true
      const oldForeignClubIds = clubIdSet(clubsWhere(state.clubs, c => !isJpelLeague(c.leagueId)))
      const removedForeignPlayerIds = pendingRestructure
        ? new Set(state.players.filter(p => oldForeignClubIds.has(p.teamId)).map(p => p.id))
        : new Set<string>()
      const foreignRefresh = pendingRestructure
        ? { newPlayers: generateForeignLeaguePlayers(INITIAL_FOREIGN_CLUBS, state.currentSeason.year + 1).players }
        : refreshForeignLeagues(clubsWhere(state.clubs, c => leagueRules(c.leagueId).newcomers === 'refresh') as ForeignClub[],
          retiringIds, state.currentSeason.year + 1, grownPlayers)
      // 来季の世界の土台。大再編のときだけ、海外のクラブを新しい9リーグへ丸ごと入れ替える
      const refreshedClubs: WorldClub[] = pendingRestructure
        ? withAddedClubs<WorldClub>(jpelClubs(state.clubs), INITIAL_FOREIGN_CLUBS)
        : state.clubs

      // ★**'youth'（日本の2部・3部）にも若手を入れる**（オーナー・2026-08-16「2.3部にも若手補強しよう。
      //   2人。レベル帯はドラフト外レベル」）。
      //   海外は `refreshForeignLeagues` で毎年1クラブ最大3人入るのに、国内は
      //   **ドラフト（1部20クラブだけ）しか口が無く**、6年で国内の在籍が
      //   1300→729人まで痩せて FA も尽きていた。1部はドラフトで獲るので入れない。
      const domesticYouth = refreshDomesticYouth(state.clubs, state.currentSeason.year + 1, grownPlayers)

      // Morale streak system: apply morale bonus/penalty to player team based on season finish
      const myFinalRank = rankOfTeam(seasonLeagueStandings(state.currentSeason, state.playerTeamId), state.playerTeamId)
      const myLeagueNow = myLeagueId(state.currentSeason, state.playerTeamId)
      const myDivRows = seasonLeagueStandings(state.currentSeason, state.playerTeamId)

      // 来季の格と昇降格は engine/promotion 1本
      // （格は「今季走った部」での順位から。部の入れ替えはそのあと）
      const promo = computePromotion({ clubs: state.clubs, currentSeason: state.currentSeason, playerTeamId: state.playerTeamId })
      const nextTierOf = promo.nextTierOf
      const nextDivisionOf = promo.nextDivisionOf
      const myNextTier = promo.myNextTier
      const divisionMoveNews = promo.divisionMoveNews

      // スポンサー契約の年度処理は engine/sponsorSeason 1本
      const sponsorResult = processSeasonSponsors({
        sponsors: state.sponsors ?? [], clubs: state.clubs, currentSeason: state.currentSeason,
        playerTeamId: state.playerTeamId, myFinalRank, myNextTier, newYear })
      const updatedSponsors = sponsorResult.sponsors
      const expiredSponsorIds = sponsorResult.expiredIds
      const sponsorNews = sponsorResult.news
      const newSponsorOffers = sponsorResult.offers
      const myActiveSponsorIds = sponsorResult.activeIds

      // 連続上位はセーブに持たないので、過去シーズン（＝今季を入れる前）の順位表から数え直す。
      // 昔ここで読んでいた値も「今季を足す前」の連続数だったので、意味は同じ
      const myTeamStreak = teamHistoryOf(state.pastSeasons, state.playerTeamId).currentStreak
      const streakMoraleDelta = myFinalRank <= 3
        ? Math.min(12, 4 + myTeamStreak * 2)   // up to +12 for long winning streak
        : myFinalRank >= myDivRows.length - 2
        ? Math.max(-12, -4 - myTeamStreak * 2) // down to -12 for losing streak
        : 0
      const playersAfterMorale = streakMoraleDelta !== 0
        ? playersAfterRetire.map(p => {
            if (p.teamId !== state.playerTeamId || p.status === 'retired') return p
            // 連勝・連敗の効き。★**ここで下限を書かないこと**（上下限は condition.ts の 0〜100 だけ）
            return setMorale(p, (p.morale ?? MORALE_DEFAULT) + streakMoraleDelta)
          })
        : playersAfterRetire

      // チームの成績（順位・勝ち点・優勝回数・連続上位）はセーブに書き足さない。
      // 今季の順位表は下で過去シーズンに保存されるので、成績はそこから数え直せる（utils/teamHistory.ts）

      // 来季の日程も部ごとに引き直す（25コースのうちファイナル3本は固定、22本を3部で取り合う）。
      // 自分の部は昇降格のあとの部で引く
      const nextSchedules = drawSeasonSchedules(newYear)
      const myNextDivision = nextDivisionOf(myClub(state) ?? { id: state.playerTeamId })
      const newRaces = nextSchedules[myNextDivision] ?? generateSeasonRaces(newYear)
      // 王者は「リーグごと」（12リーグ。日本の部も海外も同じ形でニュースに出す）。
      // 52チームを得点で並べた先頭ではない（部ごとにレース数が違う）
      const divisionChampionNews = standingsByLeague(state.currentSeason).map(({ leagueId, rows }) => {
        const c = clubById(state.clubs, rows[0]?.teamId)
        return c ? { date: `${state.currentSeason.year}-10-25`, headline: leagueChampionHeadline(state.currentSeason.year, leagueId, c.name), category: 'race' as const, relatedIds: [] } : null
      }).filter((x): x is NonNullable<typeof x> => !!x)
      // 翌季のプレシーズンで指名される新人はその年(newYear)に加入するので draftYear=newYear にする。
      // （+1 にすると加入年より1年多い年度で記録され、歴代ドラフトが1年ズレる）
      const nextScoutPool = generateDraftPool(newYear, new Set(state.players.map(pl => pl.name)))

      // FA news
      const faNews = expiredIds.size > 0
        ? [{
            date: `${state.currentSeason.year}-10-30`,
            headline: massFreeAgentHeadline(expiredIds.size),
            category: 'fa' as const,
            relatedIds: [...expiredIds] }]
        : []

      // Growth news
      const bigGrowth = growthEntries.filter(e => e.ovrAfter - e.ovrBefore >= 3).slice(0, 2)
      const growthNews = bigGrowth.map(e => ({
        date: `${state.currentSeason.year}-11-01`,
        headline: growthHeadline({ playerName: e.name, specialtyLabel: SPECIALTY_LABELS[e.specialty], gain: e.ovrAfter - e.ovrBefore }),
        category: 'draft' as const,
        relatedIds: [e.playerId] }))

      // Remove expired + retired players from team rosters; remove expired sponsor contracts
      // レンタル返却された選手は保有元チームのロスターへ戻す
      // 名簿は所属(player.teamId)から組み直す。契約満了・引退・売れ残りの強制FAで抜けた選手が消え、
      // レンタルから返ってきた選手が戻る。どこか1ヶ所を書き忘れて食い違うことが無くなる
      const clubsWithFA = expiredSponsorIds.size > 0
        ? withMyClub({ clubs: refreshedClubs, playerTeamId: state.playerTeamId },
          t => ({ ...t, sponsors: (t.sponsors ?? []).filter(id => !expiredSponsorIds.has(id)) }))
        : refreshedClubs

      // CPU teams do NOT sign FA players here — user gets the FA window during preseason
      // AI will sign remaining FAs when beginSeasonDraft is called

      // Check objectives + award scout points + budget rewards
      // 目標の順位は自分の部の中での順位（「3位以内」は自分の部での3位）
      const finalRank = rankOfTeam(myDivRows, state.playerTeamId)
      const playerBudgetAtSeasonEnd = myClub({ clubs: clubsWithFA, playerTeamId: state.playerTeamId })?.finance?.budget ?? 0

      const aiSigningNews: typeof faNews = []  // AI signing happens at draft start now

      // Retirement news
      const retirementNews = [...retiringIds].slice(0, 4).map(id => {
        const p = grownPlayers.find(x => x.id === id)
        return p ? {
          date: `${state.currentSeason.year}-10-25`,
          headline: retiredHeadline({ playerName: p.name, age: p.age, segmentWins: p.career.segmentWins }),
          category: 'fa' as const,
          relatedIds: [p.id] } : null
      }).filter(Boolean) as typeof faNews

      // 目標の達成判定・来季の目標・GM評判は engine/seasonObjectives 1本
      const objs = settleSeasonObjectives({
        currentSeason: state.currentSeason, playerTeamId: state.playerTeamId, finalRank,
        playerBudgetAtSeasonEnd, hasRival: !!state.rivalTeamId, divSize: myLeagueSize(state), gmRep: state.gmRep })
      const newlyCompletedObjs = objs.newlyCompletedObjs
      const objBonus = objs.objBonus
      const objBudgetBonus = objs.objBudgetBonus
      const newObjectives = objs.newObjectives
      const newGmRep = objs.newGmRep

      // ── BONUS CLAUSE PAYOUTS (item 16) ──
      // ここは teamsWithFA の名簿を見る（シーズン開始時の state.players ではなく）。
      // teamsWithFA は契約切れ・引退・強制FAを反映したあとの所属から組み直してあるので、
      // 退団が決まった選手にボーナスを払ってしまう事故を防げる
      // 在籍は player.teamId が唯一の持ち場（utils/rosterSync の squadIdsOf）。
      // teamsWithFA はこの playersAfterRetire から組み直したものなので、直接数えても同じ
      const playerTeamRosterIds = squadIdsOf(playersAfterRetire, state.playerTeamId)

      // League MVP・新人王（選出ルールは utils/awards.ts に一元化。画面表示側と同じ実装を使う）
      const newSeasonAward: SeasonAward = computeSeasonAwards(myLeagueRaces(state.currentSeason, state.playerTeamId), grownPlayers, state.currentSeason.year, myLeagueId(state.currentSeason, state.playerTeamId))

      // 記録会のシーズン別トップ10は engine/eventSeasonTops 1本（全結果は保存時に捨てるため）
      const newEventTops = collectEventSeasonTops({ currentSeason: state.currentSeason, players: state.players })

      // 出来高ボーナスの精算は engine/bonusPayout 1本（区間賞の集計も一緒に返る）
      const bonus = settleBonusClauses({
        players: playersAfterRetire, rosterIds: playerTeamRosterIds,
        currentSeason: state.currentSeason, playerTeamId: state.playerTeamId,
        finalRank, seasonAward: newSeasonAward })
      const bonusTotalPayout = bonus.totalPayout
      const bonusPayoutNews = bonus.news
      const playerSegWinsSeason = bonus.playerSegWins
      const leagueMvpId = bonus.leagueMvpId

      // 在籍選手の年俸を予算から控除。
      // 集計元は state.players（契約満了・引退を処理する前）。playersAfterMorale だと
      // 今季で退団する選手の teamId が空になっているため、今季1年ぶんの年俸が請求されず消えていた。
      const playerSalaryTotal = state.players
        .filter(p => p.teamId === state.playerTeamId)
        .reduce((s, p) => s + p.contract.annualSalary, 0)

      const playerTeamObj = myClub({ clubs: clubsWithFA, playerTeamId: state.playerTeamId })
      // スポンサー収入は myActiveSponsorIds（契約満了を反映する前のリスト）が基準。
      // teamsWithFA からだと今季で満了したスポンサーが既に外れていて、
      // 最終年ぶんの協賛金をまるごと受け取れていなかった。
      const sponsorAnnual = myActiveSponsorIds
        .map(id => (state.sponsors ?? []).find(s => s.id === id))
        .filter(Boolean)
        .reduce((s, sp) => s + sp!.annualPayment, 0)
      const prevRaceIncome = state.currentSeason.seasonRaceIncome ?? 0   // 区間賞のみ
      const prevStreakMe = playerTeamObj?.finance?.deficitStreak ?? 0

      // 来季予算の精算は engine/seasonBudget 1本（232クラブ全部。自チームかどうかは id で見る）
      const budgets = computeSeasonBudgets({
        players: playersAfterMorale, sponsors: state.sponsors ?? [], clubsWithFA,
        currentSeason: state.currentSeason, playerTeamId: state.playerTeamId,
        nextTierOf, nextPlaceOf: promo.nextPlaceOf,
        playerSalaryTotal, playerBudgetAtSeasonEnd, sponsorAnnual,
        objBudgetBonus, bonusTotalPayout, prevStreakMe })
      const newBudget = budgets.newBudget
      const newBudgetBreakdown = budgets.newBudgetBreakdown
      const newStreakMe = budgets.newStreakMe
      const cpuNextBudgets = budgets.cpuNextBudgets
      const clubsWithSeasonRewards = budgets.clubsWithSeasonRewards

      // 指名権の発行・期限切れの掃除・赤字ペナルティは engine/draftPicks 1本
      const picks = issueDraftPicks({
        clubs: clubsWithSeasonRewards, numTeams: draftPickHolders(state.clubs).length, currentSeason: state.currentSeason,
        playerTeamId: state.playerTeamId, newYear, deficitStreak: newStreakMe })
      const clubsWithCleanedPicks = picks.clubs
      const pickPenaltyNews = picks.pickPenaltyNews

      const seasonPrizeNews = {
        date: `${state.currentSeason.year}-10-30`,
        headline: seasonBudgetHeadline({ year: state.currentSeason.year, finalRank, budget: newBudget, prize: prevRaceIncome, sponsor: sponsorAnnual }),
        category: 'race' as const,
        relatedIds: [] }

      // 監督の通算成績と節目のニュースは engine/dynastyMilestones 1本
      const dynasty = computeDynastyMilestones({
        pastSeasons: state.pastSeasons, currentSeason: state.currentSeason, gmTenures: state.gmTenures,
        clubs: state.clubs, playerTeamId: state.playerTeamId, finalRank,
        playersAfter: playersAfterMorale, playersBefore: state.players })
      const totalChamps = dynasty.totalChamps
      const totalSeasons = dynasty.totalSeasons
      const curStreak = dynasty.curStreak
      const dynastyNews = dynasty.news

      // MVP・優勝・レンタル在籍履歴を通算成績へ書き込む。engine/careerRecords 1本
      const playersWithLoanHistory = applySeasonCareerRecords({
        players: playersAfterMorale, leagueMvpId, currentSeason: state.currentSeason })

      const seasonTotalSegWins = Object.values(playerSegWinsSeason).reduce((s, v) => s + v, 0)
      const seasonAchievements = checkSeasonAchievements({
        finalRank,
        year: state.currentSeason.year,
        totalChamps,
        curStreak,
        seasonSegWins: seasonTotalSegWins,
        totalSeasons,
        players: playersWithLoanHistory,
        playerTeamId: state.playerTeamId,
        existing: state.achievements ?? [] })

      // MVP/新人王ニュースはシーズン最終戦の直後（そのシーズンのニュース）で流すため、ここでは出さない（二重表示防止）

      const objJewels = newlyCompletedObjs.reduce((s, o) => s + (o.rewardJewels ?? 30), 0)
      const seasonAchievementJewels = seasonAchievements.reduce((s, a) => s + (ACHIEVEMENT_JEWELS[a.rarity] ?? 0), 0)
      const rankJewels = podiumJewels(finalRank)

      // シーズン終了ぶんのジュエル内訳（ホームに戻ったときのポップアップ用）。加算は下の jewels: が担当
      const seasonJewelGains: { label: string; amount: number }[] = []
      if (rankJewels > 0) seasonJewelGains.push({ label: `シーズン${finalRank}位`, amount: rankJewels })
      if (objJewels > 0) seasonJewelGains.push({ label: '目標達成', amount: objJewels })
      for (const a of seasonAchievements) {
        const j = ACHIEVEMENT_JEWELS[a.rarity] ?? 0
        if (j > 0) seasonJewelGains.push({ label: `実績「${a.name}」`, amount: j })
      }

      // 来季の世界の選手。旧セーブの大再編で退場する選手を外し、新しく入る選手を足す。
      // ★入れ口は1本（CLAUDE.md「選手が世界に入ってくる口」）。海外の補充も2部・3部の若手も
      //   ここで一緒に足す（入れ方を2本に増やさない）。
      // ★下限の救済はここではなく `startRegularSeason`（開幕の直前）。ここで足すと、
      //   契約満了と引退を当てる**前**の人数を見ることになり、いちばん普通の経路（満了で割る）で
      //   ちょうど発火しない
      // ★移籍はここでは起きません（`engine/transferMarket.ts` の1本を `beginSeasonDraft` で回す）
      const nextWorldPlayers = [
        ...(removedForeignPlayerIds.size > 0 ? playersWithLoanHistory.filter(p => !removedForeignPlayerIds.has(p.id)) : playersWithLoanHistory),
        ...foreignRefresh.newPlayers, ...domesticYouth,
      ]

      // セーブの肥大化対策（在籍上限の整理・引退選手の軽量化・出番の無い選手の削除）は
      // engine/savePruning 1本。**実績のある選手は絶対に消さない**という決まりもそちら側
      const pruned = pruneSaveData({
        players: nextWorldPlayers, state, newYear })
      const cleanedPlayers = pruned.players
      const removedPlayers = pruned.removedPlayers

      // 退団のお知らせ（黙って消えるのを防ぐ）は engine/departureNotices 1本
      const dep = collectDepartures({
        before: state.players, cleanedPlayers, clubs: clubsWithCleanedPicks,
        playerTeamId: state.playerTeamId, year: state.currentSeason.year, newYear })
      const departureNotices = dep.notices
      const departureRecords = dep.records

      // 今季の記録を保存する形に整える（出場0の選手も埋める）のは engine/seasonArchivePrep 1本
      const arcPrep = prepareSeasonArchive({
        currentSeason: state.currentSeason, before: state.players, clubs: state.clubs })
      const archivedForeignApps = arcPrep.archivedForeignApps
      const zeroAppearances = arcPrep.zeroAppearances

      // 国内チームの名簿もteamId起点で毎年完全に同期する（海外クラブと同じ自動修復）。
      // 契約満了のFA化（teamId=''）や長期整理での選手削除がroster配列に残存し、
      // 「名簿に居るのにteamIdが違う/存在しない」不整合になるのを根治する
      // レンタル中（loanあり）の選手は名簿外が正規仕様（teamId=借り手だが借り手の名簿には載せない）

      // 下部リーグのクラブが入っていない古いセーブに、足りない32クラブを補う。
      // 補うのは来季の器を組んだこの時点＝**次の年から**参加する（今季の順位表は触らない）。
      // そろっているセーブでは何もしない（utils/domesticClubs.ts）
      // ★**一度でも指揮したクラブ全部**を渡すこと（utils/gmTenure の managedTeamIds）。
      //   渡さないと自チームの部まで「データどおり」に戻され、3部から始めたはずのクラブが
      //   選んだクラブの元の部（1部・2部）へ引き戻される。**いまの自チームだけでは足りない**——
      //   監督が移った瞬間に前のクラブが元の部へ戻り、1年で部を2つ飛ぶ「昇格」になる
      const backfilled = backfillDomesticClubs({
        clubs: clubsWithCleanedPicks, players: cleanedPlayers, year: newYear,
        pinnedTeamIds: managedTeamIds(state.gmTenures, state.playerTeamId) })
      const syncedClubs = backfilled.clubs
      const playersWithBackfill = backfilled.players
      const backfillNews = backfilled.addedTeams.length === 0 ? [] : [{
        date: `${newYear}-01-05`,
        headline: divisionsFoundedHeadline(backfilled.addedTeams.length, jpelClubs(syncedClubs).length),
        category: 'race' as const,
        relatedIds: [] }]

      // 他チームから監督の声がかかるか。来季の予算と評判が決まったあとに判定する。
      // 出るのは1シーズンに最大1件で、答えるまでホームに出続ける（utils/gmOffer.ts）
      //
      // ★**来季の行き先が決まっているときは出さない**（★13-b）。受けたら取り消せない以上、
      //   受けられない話をホームに並べても選べないだけ。
      const gmOffer = state.pendingGmMove ? null : makeGmOffer({
        season: state.currentSeason,
        playerTeamId: state.playerTeamId,
        gmRep: newGmRep,
        nextYear: newYear,
        clubs: syncedClubs,
        nextBudgets: cpuNextBudgets,
        objBonus,
        rng: Math.random,
        lastOfferYear: state.lastGmOfferYear,
        tenureStartYear: (state.gmTenures ?? []).slice(-1)[0]?.fromYear })

      // 終わったシーズンを別ファイルへ書き出す。**書けて読み戻せた年だけ**を archivedYears に足し、
      // その年の走行記録は次のセーブから外れる（store/seasonArchive.ts）。
      // 書けなければ何も起きない＝セーブに残ったままになるだけで、記録は消えない
      const archivedThisSeason = archiveSeason(state.currentSeason, {
        foreignAppsC: packForeignApps(archivedForeignApps),
        leagues: arcPrep.archivedLeagues,
        zeroAppearances })
      void writeSeasonArchive(archivedThisSeason).then(ok => {
        if (!ok) return
        set(st => ({
          archivedYears: [...new Set([...(st.archivedYears ?? []), archivedThisSeason.year])] }))
      })

      const next: Partial<GameStore> = {
        // 残り0年のまま居残る選手を片付ける（engine/contractExpiry の settleZeroContracts 1本）
        players: settleZeroContracts(playersWithBackfill, state.playerTeamId, newYear),
        removedPlayers,
        clubs: syncedClubs,
        // 1件でも複数でも同じ入れ物（退任したときは3件まで一度に届く）
        gmOffers: gmOffer ? [gmOffer] : [],
        // 出た年を控えて、次のオファーまで間隔を空ける
        lastGmOfferYear: gmOffer ? newYear : state.lastGmOfferYear,
        worldTournament: undefined,  // 世界選手権トーナメントは年度で完結（翌年は新規に開催）
        worldRacePlans: undefined,   // コースも毎年引き直し
        // 退団（FA流出・移籍）と海外移籍（クラブ間・日本↔海外）を移籍履歴に記録（移籍ページの日付・移籍金表示用）
        transferHistory: [...(state.transferHistory ?? []), ...departureRecords].slice(-800),
        jewels: state.jewels + objJewels + seasonAchievementJewels + rankJewels,
        // 優勝トロフィー：**頂点のリーグの優勝で1個**（日本1部と、部の無い海外リーグ。ECL優勝ぶんは competitionSlice が足す）。
        // ★2部・3部の優勝では出ない（オーナー・2026-08-20「1部優勝で1個でしょ」）。
        //   段は utils/league の titleTier 1本（海外リーグは下に部が無いので頂点。オーナー・2026-09-26
        //   「日本だけになってるやつは全部バグ」）
        trophies: (state.trophies ?? 0)
          + (myLeagueNow != null && titleTier(titleKeyOf(myLeagueNow)) === TOP_DIVISION && myFinalRank === 1 ? 1 : 0),
        // 最終戦ぶんがまだ未表示なので上書きせず足す
        jewelGains: [...(state.jewelGains ?? []), ...seasonJewelGains].slice(-20),
        gmRep: newGmRep,
        achievements: [...(state.achievements ?? []), ...seasonAchievements],
        eventSeasonTops: [...(state.eventSeasonTops ?? []), ...newEventTops],
        draftState: null,
        sponsors: updatedSponsors,
        // 過去シーズンは archiveSeason() が「残す項目」だけを書き出す（許可リスト方式）。
        // 何を残すかは types の ArchivedSeason と archiveSeason() の2箇所だけを見ればよい
        pastSeasons: [...state.pastSeasons, archivedThisSeason],
        raceLineup: {},
        raceStrategy: 'balanced' as const,
        growthReport: { year: state.currentSeason.year, entries: growthEntries },
        // シーズン終了で確定した来期予算（ホームでポップ表示 → 確認で消える）
        seasonBudgetNotice: { year: newYear, budget: newBudget },
        currentSeason: {
          year: newYear,
          currentRaceIndex: 0,
          phase: 'preseason',
          // 国内3部の日程と順位表。補ったクラブぶんも来季の順位表に並ぶよう、いまのクラブではなく
          // 補完後を使う。部の割り振りは昇降格を通したあとの部（＝来季走る部）で決まる
          // 海外リーグは日本1部と同じ10日を走る（engine/leagueDay）
          leagues: withCopiedSchedules(
            divisionLeagues(nextSchedules, newSeasonStandings(syncedClubs, teamId => ({
              teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [] }))),
            syncedClubs),
          collegeRaces: [],
          // スカウトPTの効き目は `utils/facilities` の1本（画面の効き目の表示と同じ式）
          scoutPoints: 5 + objBonus + facilityScoutPoints(facilitiesOf(myClub(state)).scoutOffice),
          initialBudget: newBudget,   // 来期の開始予算（＝繰越+クラブ予算+スポンサー）。収支表示の基準。
          seasonGrant: newBudgetBreakdown.grant,   // 来期のクラブ予算（＝来季の格の年間予算）。内訳表示と一致させる。
          budgetBreakdown: newBudgetBreakdown,       // 初期予算の内訳（財務ページで表示）
          // 今季スカウトした候補（＝来季プレシーズンで指名する代）をそのまま引き継ぐ。
          // 視察した選手がそのままドラフトに並ぶようにする。空のとき（一度もスカウトを開いていない等）だけ新規生成。
          scoutProspects: (state.currentSeason.scoutProspects?.length ?? 0) > 0 ? state.currentSeason.scoutProspects : nextScoutPool,
          objectives: newObjectives,
          trainingAssignments: {},
          scoutMissions: [],
          faVisits: [],
          pendingRenewalDecisions: [],  // 廃止：満了は自動FA（旧セーブの残キューもここで消える）
          pendingTradeOffers: [],
          scoutedOpponents: (state.currentSeason.scoutedOpponents ?? []).filter(s => s.year >= state.currentSeason.year),
          scoutedProspects: (state.currentSeason.scoutedProspects ?? []).filter(s => s.year >= state.currentSeason.year),
          trainingPlan: null,
          individualEvents: generateIndividualEvents(newYear),
          departureNotices,
          // 行き先が決まらなかった退団予定の選手。preseason にチャットで「FAで出す／残留させる」を選ぶ
          stayOrLeave: undecidedIds.map(id => ({ playerId: id })),
          sponsorOffers: newSponsorOffers,
          seasonRaceIncome: 0,
          seasonSegPrize: {},
          foreignAppearances: {},
          pendingForeignRestructure: false,  // 再編を適用したのでフラグ解除
          // 来季のECL：今季（＝前年）の各リーグ上位2チームで開催。4/6/7/9/11月の5戦、コースは10種から重複なし抽選。
          // 初年度は前年成績が無いためこの経路でしか生成されない＝1年目は開催なし
          eclSeries: (() => {
            const parts = buildEclParticipants({
              // ECLの枠は頂点のリーグ（日本1部・海外9）それぞれの上位2クラブ（走り終えた今季の順位表）
              clubs: refreshedClubs,
              playerTeamId: state.playerTeamId,
              seasonLeagues: state.currentSeason.leagues,
              players: nextWorldPlayers })
            if (parts.length < 4) return undefined
            return {
              participants: parts,
              races: buildEclRaces(newYear, newRaces.map(r => r.date)),
              raceIndex: 0,
              points: {} }
          })(),
          newsFeed: [
            ...backfillNews,
            { date: `${newYear}-03-01`, headline: seasonOpenHeadline(newYear, newRaces.length), category: 'race' as const, relatedIds: [] },
            ...divisionChampionNews,
            ...divisionMoveNews,
            seasonPrizeNews,
            ...pickPenaltyNews,
            ...(objBonus > 0 ? [{ date: `${state.currentSeason.year}-11-01`, headline: objectiveBonusHeadline({ points: objBonus, budget: objBudgetBonus }), category: 'draft' as const, relatedIds: [] }] : []),
            ...dynastyNews,
            ...retirementNews,
            ...bonusPayoutNews,
            ...faNews,
            ...aiSigningNews,
            ...growthNews,
            ...sponsorNews,
          ] } }

      // ★**来季から指揮すると決まっていたクラブへ、ここで移る**（★13）。
      //   今季ぶんは旧チームの監督として全部処理し終えているので（★13-c）、
      //   進行中の用件は上で組み立てた「来季の器」がそのまま新チームのものになる。
      //   **移る処理は applyGmMove 1本**（受けたその場で移る経路と同じものを通す）。
      const booked = state.pendingGmMove
      if (!booked || booked.year !== newYear) return next
      const moved: GameStore = { ...state, ...next } as GameStore
      if (!clubById(syncedClubs, booked.teamId)) return { ...next, pendingGmMove: null }
      // ★お金と順位は**移る直前の数字で作り直す**。予約したときの額をそのまま使うと、
      //   1シーズンぶん古い予算で就任してしまう
      const freshOffer = buildOffer({
        teamId: booked.teamId, kind: 'promotion',
        season: { ...state.currentSeason },
        clubs: syncedClubs, nextBudgets: cpuNextBudgets,
        nextYear: newYear, objBonus: 0, finalRank })
      return { ...next, ...applyGmMove(moved, freshOffer, booked.inviteId) }
    })
  },


  acceptGmOffer: (teamId, inviteId) => {
    set(state => {
      // 届いている中から選ぶ。1件しか無いときは指定なしでもよい
      const offer = teamId ? (state.gmOffers ?? []).find(o => o.teamId === teamId) : (state.gmOffers ?? [])[0]
      if (!offer) return {}
      const dest = clubById(state.clubs, offer.teamId)
      if (!dest) return { gmOffers: [] }
      // ★**頷いた相手だけを連れて行く関門はここ1つ。**
      //   画面はチャットで同じ関数の答えを見せているだけなので、
      //   ここを通っていない相手（断られた・そもそも聞いていない）は落ちる
      const agreed = inviteId && appraiseGmInvite({
        players: state.players, clubs: state.clubs,
        currentSeason: state.currentSeason, fromTeamId: state.playerTeamId,
        destinationOf: state.destinationOf,
        playerTierOf: state.playerTierOf,
      }, inviteId, offer.teamId)?.ok ? inviteId : undefined
      // ★**就任するのは来季**（オーナー判断★13・2026-08-12「次シーズンの開始になるからね」）。
      //   分岐の材料は「そのオファーが何年のものか」1つだけ。
      //     ・自分から退任して届いた打診 … offer.year は来季 → **予約するだけ**。
      //       入れ替わるのは endSeason が来季を組み立てたあと（applyGmMove）
      //     ・シーズン終わりに向こうから届くオファー … 答える時点でもう来季に入っている
      //       （endSeason が year を進めたあとに出る）ので offer.year === 今季 → その場で入れ替える
      //   **「退任からの話かどうか」で分けないこと。**それだと入口が増えるたびに分岐が増える
      if (offer.year > state.currentSeason.year) {
        // ★受けたら取り消せない（★13-a）。gmOffers を空にして予約だけ残す。
        //   連れて行きたい選手も予約に入れる（実際に聞くのは来季の入れ替わりのとき）
        return { gmOffers: [], pendingGmMove: { teamId: offer.teamId, year: offer.year, inviteId: agreed } }
      }
      return applyGmMove(state, offer, agreed)
    })
  },


  declineGmOffer: () => set({ gmOffers: [] }),


  // 自分から退任する（設定から）。行き先の候補が一度に届く。
  //
  // ★**就任するのは来季**（オーナー判断★13・2026-08-12「次シーズンの開始になるからね」）。
  //   打診はその場で届くが、受けても動くのは `pendingGmMove` に予約が入るところまで。
  //   実際に入れ替わるのは `endSeason` が来季を組み立てたあと。
  //   **ここで渡す年を今季に戻さないこと**（`scripts/check-gm-resign.ts` が見張る）。
  //
  // 声がかかるかの抽選はしない（辞めると決めた以上、行き先0件では詰むため）。
  resignAsGm: () => {
    set(state => {
      if ((state.gmOffers ?? []).length > 0) return {}   // すでに届いている
      // ★受けたら取り消せない（★13-a）。来季の行き先が決まっている間は押せない
      if (state.pendingGmMove) return {}
      // 在任が短いうちは辞められない（utils/gmOffer の GM_RESIGN_MIN_TENURE）。
      // ★止めるのは**入口**。resignOffers 側で0件を返す形にはしないこと——
      //   あちらは「辞めると決めた以上、行き先0件では詰む」ので抽選をしない設計なので、
      //   そこで止めると「押せたのに何も来ない」になる
      if (!canResignAsGm(state.gmTenures, state.currentSeason.year).ok) return {}
      // 候補クラブ（自チーム以外の231クラブ）の「いま使えるお金」をそのまま持って行く
      // （年度更新を待たない）。予算は格1本（utils/clubTier）なので、内訳のグラントもそこから出す
      const nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }> = {}
      for (const t of otherClubs(state.clubs, state.playerTeamId)) {
        nextBudgets[t.id] = {
          // 古いセーブの海外クラブには finance が無い（engine/seasonBudget と同じ扱い）
          budget: t.finance?.budget ?? tierBudget(t),
          carryover: 0, grant: tierBudget(t), raceIncome: 0, sponsor: 0, objBonus: 0, expenses: 0 }
      }
      const offers = resignOffers({
        season: state.currentSeason,
        playerTeamId: state.playerTeamId,
        // ★来季（＋1）。就任は次のシーズン開始時（★13）
        nextYear: state.currentSeason.year + 1,
        clubs: state.clubs,
        nextBudgets,
        rng: Math.random })
      return { gmOffers: offers }
    })
  } })
