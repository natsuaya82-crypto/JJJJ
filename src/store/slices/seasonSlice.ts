// season ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
import { FOREIGN_LEAGUES } from '../../data/foreignLeagues'
import { drawSeasonSchedules, generateIndividualEvents, generateSeasonRaces } from '../../data/races'
import { INITIAL_TEAMS } from '../../data/teams'
import { ACHIEVEMENT_JEWELS, checkSeasonAchievements, podiumJewels, selectSeasonObjectives } from '../../engine/achievements'
import { buildEclParticipants, buildEclRaces } from '../../engine/eclSeries'
import { initForeignStandings } from '../../engine/foreignLeague'
import { growPlayer } from '../../engine/growth'
import { generateDraftPool, generateForeignLeaguePlayers, refreshForeignLeagues } from '../../engine/playerGenerator'
import { type Division, type GmOffer, type Player, SPECIALTY_LABELS, type SeasonAward } from '../../types'
import { archiveSeason } from '../../utils/archiveSeason'
import { computeSeasonAwards } from '../../utils/awards'
import { processContractExpiry } from '../../engine/contractExpiry'
import { applySeasonCareerRecords } from '../../engine/careerRecords'
import { computeDynastyMilestones } from '../../engine/dynastyMilestones'
import { collectEventSeasonTops } from '../../engine/eventSeasonTops'
import { settleSeasonObjectives } from '../../engine/seasonObjectives'
import { catchUpAwayDivisions } from '../../engine/catchUpDivisions'
import { collectDepartures } from '../../engine/departureNotices'
import { processForeignSeason } from '../../engine/foreignSeason'
import { prepareSeasonArchive } from '../../engine/seasonArchivePrep'
import { pruneSaveData } from '../../engine/savePruning'
import { issueDraftPicks } from '../../engine/draftPicks'
import { computePromotion } from '../../engine/promotion'
import { processRetirements } from '../../engine/retirement'
import { processSeasonSponsors } from '../../engine/sponsorSeason'
import { settleBonusClauses } from '../../engine/bonusPayout'
import { computeSeasonBudgets } from '../../engine/seasonBudget'
import { allTieredClubs, tierBudget, tierOf, tierOfClubId, tierOfPlayerClub } from '../../utils/clubTier'
import { foreignClubIdSet } from '../../utils/clubs'
import { MORALE_DEFAULT, setMorale } from '../../utils/condition'
import { backfillDomesticClubs } from '../../utils/domesticClubs'
import { makeGmOffer, resignOffers } from '../../utils/gmOffer'
import { startTenure } from '../../utils/gmTenure'
import { DIVISIONS, TOP_DIVISION, divisionOf, divisionStandings, myDivSize, newSeasonStandings, rankOfTeam, seasonDivisionStandings } from '../../utils/league'
import { divisionChampionHeadline, divisionsFoundedHeadline, growthHeadline, massFreeAgentHeadline, objectiveBonusHeadline, retiredHeadline, seasonBudgetHeadline, seasonOpenHeadline } from '../../utils/newsItems'
import { comparePlayers } from '../../utils/playerSort'
import { faMarketSalary, ovr, packForeignApps, perfOf } from '../../utils/playerUtils'
import { squadIdsOf } from '../../utils/rosterSync'
import { needsPlayer } from '../../utils/squadNeeds'
import { teamHistoryOf } from '../../utils/teamHistory'
import { hasNoPlayingTime } from '../../utils/transferDecision'
import { writeSeasonArchive } from '../seasonArchive'

type Slice = Pick<GameStore,
  'startRegularSeason' | 'initObjectivesIfEmpty' | 'endSeason' | 'acceptGmOffer' | 'declineGmOffer' | 'resignAsGm'>

export const createSeasonSlice = (set: SetGame, get: () => GameStore): Slice => ({

  startRegularSeason: () => set(state => {
    // ロスター下限ガード：15人未満では開幕できない（UI側でもブロックするが、最終防衛線としてここでも弾く）
    const myCount = state.players.filter(p => p.teamId === state.playerTeamId && p.status !== 'retired').length
    if (myCount < 15) return state
    // プレシーズンのドラフト（今季スカウトした代）が終わったので、
    // 今季スカウトする「翌年の代」を新規生成する。前回ドラフト済みの代の残りを置き換える。
    // これで endSeason 側で引き継いだ視察済みプールがドラフトに使われ、シーズン中の視察は常に新しい代になる。
    const freshScoutPool = generateDraftPool(state.currentSeason.year + 1, new Set(state.players.map(pl => pl.name)))
    if ((state.currentSeason.objectives ?? []).length === 0) {
      const firstObjectives = selectSeasonObjectives(!!state.rivalTeamId, myDivSize(state))
      return { currentSeason: { ...state.currentSeason, phase: 'regular', objectives: firstObjectives, scoutProspects: freshScoutPool } }
    }
    return { currentSeason: { ...state.currentSeason, phase: 'regular', scoutProspects: freshScoutPool } }
  }),


  initObjectivesIfEmpty: () => set(state => {
    const objs = state.currentSeason.objectives
    if (objs.length === 0) {
      return { currentSeason: { ...state.currentSeason, objectives: selectSeasonObjectives(!!state.rivalTeamId, myDivSize(state)) } }
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
    // ECLの残り戦が未消化ならAI配置で自動開催してからシーズンを締める
    {
      let guard = 0
      while (guard++ < 8) {
        const es = get().currentSeason.eclSeries
        if (!es || es.raceIndex >= es.races.length) break
        try { get().advanceEclRace() } catch (e) { console.error('advanceEclRace failed', e); break }
      }
    }
    // 他の部の残り日程の消化は engine/catchUpDivisions 1本
    // （自分の部の戦数が少ないと、他の部の日程が残ったままシーズンが終わる）
    set(state => catchUpAwayDivisions({
      currentSeason: state.currentSeason, teams: state.teams,
      players: state.players, playerTeamId: state.playerTeamId }) ?? state)
    set(state => {
      const newYear = state.currentSeason.year + 1

      // Record OVR before growth for history
      const ovrSnapshot: Record<string, number> = {}
      state.players.forEach(p => { ovrSnapshot[p.id] = ovr(p) })

      // CPUチーム：予算ベースの契約更新（今季満了の主力を予算内で延長）
      // CPUの契約更新も自チームと同じ市場カーブ（faMarketSalary）で。
      // 旧式(ovr×110000)は約1000万で頭打ちになり、OVR90の主力が激安になる不具合があった。
      const cpuRenewalSalary = (p: Player) => faMarketSalary(p, perfOf(state.currentSeason, p.id))
      const cpuRenewIds = new Set<string>()
      {
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
          const renewRoster = [...state.players.filter(p => p.teamId === teamId && p.status === 'active')].sort(comparePlayers('ovr'))
          const ongoingCommitted = state.players
            .filter(p => p.teamId === teamId && p.status === 'active' && p.contract.yearsLeft > 1)
            .reduce((s, p) => s + p.contract.annualSalary, 0)
          // 更新に使える原資も「格ぶんの予算 − 既存の年俸」。順位ではない
          let budget = Math.max(0, tierBudget(state.teams.find(t => t.id === teamId)) - ongoingCommitted)
          const expiring = state.players
            .filter(p => p.teamId === teamId && p.contract.yearsLeft === 1 && p.status === 'active')
            .sort(comparePlayers('ovr'))
          for (const p of expiring) {
            const renewRank = renewRoster.findIndex(x => x.id === p.id) + 1
            if (hasNoPlayingTime(renewRank) && !needsPlayer(renewRoster, p)) continue
            const sal = cpuRenewalSalary(p)
            if (budget < sal) continue
            cpuRenewIds.add(p.id)
            budget -= sal
          }
        }
      }

      // 格を引くクラブ一覧。国内だけ渡すと海外の格が初期値のままになるので必ず両方入れる
      const tieredClubsForGrowth = allTieredClubs(state.teams, state.foreignLeagues)
      // 加齢処理 + 契約更新適用
      const grownPlayers = state.players.map(pRaw => {
        // オフシーズンで負傷は全快（負傷状態と復帰カウントを持ち越さない）
        const p = pRaw.status === 'injured' ? { ...pRaw, status: 'active' as const, injuredUntilRace: undefined, injuryName: undefined } : pRaw
        // 自チーム以外(CPU・海外)は毎年ポテンシャルへ向けて成長させる。自チームはレース/カードEXPで成長。
        const allowAnnualGrowth = p.teamId !== state.playerTeamId
        // 伸びる量はそのクラブの格で決まる。国内・海外を問わず**いまの格**を引く。
        // 以前は海外だけ tierOfClubId＝clubTiers.ts の初期値を読んでいたので、
        // 海外の格が毎年動くようになったあとも、育つ速さだけが初期値のまま固定だった
        // （最下位を続けて格20まで落ちたクラブの選手が、格1の速さで伸び続ける）。
        const growTier = tierOfPlayerClub(p.teamId, tieredClubsForGrowth)
        const grown = p.status === 'active' || p.status === 'injured'
          ? growPlayer(p, allowAnnualGrowth, growTier)
          : p
        const snap = ovrSnapshot[p.id]
        const withHistory = snap == null ? grown : { ...grown, ovrHistory: [...(p.ovrHistory ?? []), { year: state.currentSeason.year, ovr: snap }].slice(-8) }
        if (cpuRenewIds.has(p.id)) {
          const newSalary = cpuRenewalSalary(withHistory)
          return { ...withHistory, contract: { ...withHistory.contract, yearsLeft: 2, annualSalary: newSalary, faEligibleYear: newYear + 2 } }
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
        grownPlayers, teams: state.teams, playerTeamId: state.playerTeamId, year: state.currentSeason.year })
      const expiredIds = expiry.expiredIds
      const playersAfterFA = expiry.players
      // 行き先が決まらなかった退団予定の選手（新シーズンの stayOrLeave に積む）
      const undecidedIds = expiry.undecidedIds

      // ── RETIREMENT SYSTEM ──
      // 引退の年度処理は engine/retirement 1本（引退年齢・引退の反映・引退考慮イベント）
      const retire = processRetirements({
        grownPlayers, playersAfterFA, expiredIds, year: state.currentSeason.year, playerTeamId: state.playerTeamId })
      const retiringIds = retire.retiringIds
      const retirementEvents = retire.events
      const playersAfterRetire = retire.players

      // 海外クラブの年次入れ替え（引退を外し、若手を新加入させる）。
      // ただし旧セーブの大再編が保留中なら、この年度更新で新9リーグへ丸ごと置換し旧海外選手は退場させる。
      const pendingRestructure = (state.currentSeason as unknown as { pendingForeignRestructure?: boolean }).pendingForeignRestructure === true
      const oldForeignClubIds = foreignClubIdSet(state.foreignLeagues)
      const removedForeignPlayerIds = pendingRestructure
        ? new Set(state.players.filter(p => oldForeignClubIds.has(p.teamId)).map(p => p.id))
        : new Set<string>()
      const foreignRefresh = pendingRestructure
        ? (() => { const g = generateForeignLeaguePlayers(FOREIGN_LEAGUES, state.currentSeason.year + 1); return { newPlayers: g.players, updatedLeagues: g.updatedLeagues } })()
        : refreshForeignLeagues(state.foreignLeagues ?? [], retiringIds, state.currentSeason.year + 1, grownPlayers)

      // Auto contract renewal events for player-team players with yearsLeft === 1 after growth
      const renewalCandidates = playersAfterRetire.filter(p =>
        p.teamId === state.playerTeamId &&
        p.status === 'active' &&
        p.contract.yearsLeft === 1 &&
        !retiringIds.has(p.id) &&
        !expiredIds.has(p.id)
      )
      const renewalEvents: typeof state.currentSeason.events = renewalCandidates.slice(0, 4).map(p => ({
        id: `renewal-${p.id}-${state.currentSeason.year + 1}`,
        type: 'player_wants_renewal' as const,
        raceIndex: 1,
        title: `${p.name}が契約更新を希望`,
        body: `${p.name}（${p.age}歳・OVR${ovr(p)}）の契約が今季終了予定です。シーズン中に延長交渉を進めてください。`,
        playerId: p.id,
        choices: [
          { label: '交渉を開始する', desc: '延長交渉ページで条件を確認' },
          { label: '後で対応する', desc: '通知を閉じる。後でも交渉可能。' },
        ],
        resolved: false }))

      // Morale streak system: apply morale bonus/penalty to player team based on season finish
      const myFinalRank = rankOfTeam(seasonDivisionStandings(state.currentSeason, state.playerTeamId), state.playerTeamId)
      const myDivRows = seasonDivisionStandings(state.currentSeason, state.playerTeamId)

      // 来季の格と昇降格は engine/promotion 1本
      // （格は「今季走った部」での順位から。部の入れ替えはそのあと）
      const promo = computePromotion({ teams: state.teams, currentSeason: state.currentSeason, playerTeamId: state.playerTeamId })
      const nextTierOf = promo.nextTierOf
      const nextDivisionOf = promo.nextDivisionOf
      const myNextTier = promo.myNextTier
      const divisionMoveNews = promo.divisionMoveNews

      // スポンサー契約の年度処理は engine/sponsorSeason 1本
      const sponsorResult = processSeasonSponsors({
        sponsors: state.sponsors ?? [], teams: state.teams, currentSeason: state.currentSeason,
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
            // 連勝・連敗の効き。連敗でも10は下回らせない（上下限は condition.ts）
            return setMorale(p, Math.max(10, (p.morale ?? MORALE_DEFAULT) + streakMoraleDelta))
          })
        : playersAfterRetire

      // チームの成績（順位・勝ち点・優勝回数・連続上位）はセーブに書き足さない。
      // 今季の順位表は下で過去シーズンに保存されるので、成績はそこから数え直せる（utils/teamHistory.ts）
      const updatedTeams = state.teams

      // 来季の日程も部ごとに引き直す（25コースのうちファイナル3本は固定、22本を3部で取り合う）。
      // 自分の部は昇降格のあとの部で引く
      const nextSchedules = drawSeasonSchedules(newYear)
      const myNextDivision = nextDivisionOf(state.teams.find(t => t.id === state.playerTeamId) ?? { id: state.playerTeamId })
      const newRaces = nextSchedules[myNextDivision] ?? generateSeasonRaces(newYear)
      // 王者は「部ごと」。52チームを得点で並べた先頭ではない（部ごとにレース数が違う）。
      // 表に出すのは1部の王者だが、2部・3部の優勝も同じ形でニュースに出す
      const championOfDiv = (d: Division) => {
        const top = divisionStandings(state.currentSeason, d)[0]
        return updatedTeams.find(t => t.id === top?.teamId)
      }
      const divisionChampionNews = DIVISIONS.map(d => {
        const c = championOfDiv(d)
        return c ? { date: `${state.currentSeason.year}-10-25`, headline: divisionChampionHeadline(state.currentSeason.year, d, c.name), category: 'race' as const, relatedIds: [] } : null
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
      const teamsWithFA = updatedTeams.map(t => (
        t.id === state.playerTeamId && expiredSponsorIds.size > 0
          ? { ...t, sponsors: (t.sponsors ?? []).filter(id => !expiredSponsorIds.has(id)) }
          : t
      ))

      // CPU teams do NOT sign FA players here — user gets the FA window during preseason
      // AI will sign remaining FAs when beginSeasonDraft is called

      // Check objectives + award scout points + budget rewards
      // 目標の順位は自分の部の中での順位（「3位以内」は自分の部での3位）
      const finalRank = rankOfTeam(myDivRows, state.playerTeamId)
      const playerBudgetAtSeasonEnd = teamsWithFA.find(t => t.id === state.playerTeamId)?.finance.budget ?? 0

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
        playerBudgetAtSeasonEnd, hasRival: !!state.rivalTeamId, divSize: myDivSize(state), gmRep: state.gmRep })
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
      const newSeasonAward: SeasonAward = computeSeasonAwards(state.currentSeason.races, grownPlayers, state.currentSeason.year, divisionOf(state.teams.find(t => t.id === state.playerTeamId)))

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

      const playerTeamObj = teamsWithFA.find(t => t.id === state.playerTeamId)
      // スポンサー収入は myActiveSponsorIds（契約満了を反映する前のリスト）が基準。
      // teamsWithFA からだと今季で満了したスポンサーが既に外れていて、
      // 最終年ぶんの協賛金をまるごと受け取れていなかった。
      const sponsorAnnual = myActiveSponsorIds
        .map(id => (state.sponsors ?? []).find(s => s.id === id))
        .filter(Boolean)
        .reduce((s, sp) => s + sp!.annualPayment, 0)
      const prevRaceIncome = state.currentSeason.seasonRaceIncome ?? 0   // 区間賞のみ
      const prevStreakMe = playerTeamObj?.finance.deficitStreak ?? 0

      // 来季予算の精算は engine/seasonBudget 1本（自チームもCPUも同じ式）
      const budgets = computeSeasonBudgets({
        players: playersAfterMorale, teams: state.teams, sponsors: state.sponsors ?? [], teamsWithFA,
        currentSeason: state.currentSeason, playerTeamId: state.playerTeamId,
        myNextTier, nextTierOf, nextDivisionOf,
        playerSalaryTotal, playerBudgetAtSeasonEnd, prevRaceIncome, sponsorAnnual,
        objBudgetBonus, bonusTotalPayout, prevStreakMe })
      const newBudget = budgets.newBudget
      const newBudgetBreakdown = budgets.newBudgetBreakdown
      const newStreakMe = budgets.newStreakMe
      const cpuNextBudgets = budgets.cpuNextBudgets
      const teamsWithSeasonRewards = budgets.teamsWithSeasonRewards

      // 指名権の発行・期限切れの掃除・赤字ペナルティは engine/draftPicks 1本
      const picks = issueDraftPicks({
        teams: teamsWithSeasonRewards, numTeams: state.teams.length, currentSeason: state.currentSeason,
        playerTeamId: state.playerTeamId, newYear, deficitStreak: newStreakMe })
      const teamsWithCleanedPicks = picks.teams
      const pickPenaltyNews = picks.pickPenaltyNews

      const seasonPrizeNews = {
        date: `${state.currentSeason.year}-10-30`,
        headline: seasonBudgetHeadline({ year: state.currentSeason.year, finalRank, budget: newBudget, prize: prevRaceIncome, sponsor: sponsorAnnual }),
        category: 'race' as const,
        relatedIds: [] }

      // 監督の通算成績と節目のニュースは engine/dynastyMilestones 1本
      const dynasty = computeDynastyMilestones({
        pastSeasons: state.pastSeasons, currentSeason: state.currentSeason, gmTenures: state.gmTenures,
        teams: state.teams, playerTeamId: state.playerTeamId, finalRank,
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

      // 海外リーグの年度処理（優勝+1・格の更新・来季予算・海外内の移籍・日本↔海外の移籍）は
      // engine/foreignSeason 1本。**国内と扱いを分けないこと**という決まりもそちら側
      const fSeason = processForeignSeason({
        players: playersWithLoanHistory, foreignLeagues: state.foreignLeagues ?? [],
        foreignStandings: state.currentSeason.foreignStandings ?? {},
        refreshedLeagues: foreignRefresh.updatedLeagues, newForeignPlayers: foreignRefresh.newPlayers,
        removedForeignPlayerIds, teams: teamsWithCleanedPicks,
        playerTeamId: state.playerTeamId, newYear })
      // ★移籍はここでは起きません（`engine/transferMarket.ts` の1本を `beginSeasonDraft` で回す）。
      //   ここは格と来季予算を更新し終えた世界を受け取るだけ
      const market = fSeason

      // セーブの肥大化対策（在籍上限の整理・引退選手の軽量化・出番の無い選手の削除）は
      // engine/savePruning 1本。**実績のある選手は絶対に消さない**という決まりもそちら側
      const pruned = pruneSaveData({
        players: market.players, foreignLeagues: market.foreignLeagues, state, newYear })
      const cleanedPlayers = pruned.players
      const removedPlayers = pruned.removedPlayers
      const cappedForeignLeagues = market.foreignLeagues

      // 退団のお知らせ（黙って消えるのを防ぐ）は engine/departureNotices 1本
      const dep = collectDepartures({
        before: state.players, cleanedPlayers, teams: state.teams, foreignLeagues: cappedForeignLeagues,
        playerTeamId: state.playerTeamId, year: state.currentSeason.year, newYear })
      const departureNotices = dep.notices
      const departureRecords = dep.records

      // 今季の記録を保存する形に整える（出場0の選手も埋める）のは engine/seasonArchivePrep 1本
      const arcPrep = prepareSeasonArchive({
        currentSeason: state.currentSeason, before: state.players, teams: state.teams,
        prevForeignLeagues: state.foreignLeagues ?? [] })
      const archivedForeignApps = arcPrep.archivedForeignApps
      const archivedForeignStandings = arcPrep.archivedForeignStandings
      const zeroAppearances = arcPrep.zeroAppearances

      // 国内チームの名簿もteamId起点で毎年完全に同期する（海外クラブと同じ自動修復）。
      // 契約満了のFA化（teamId=''）や長期整理での選手削除がroster配列に残存し、
      // 「名簿に居るのにteamIdが違う/存在しない」不整合になるのを根治する
      // レンタル中（loanあり）の選手は名簿外が正規仕様（teamId=借り手だが借り手の名簿には載せない）
      const syncedTeams0 = market.teams

      // 下部リーグのクラブが入っていない古いセーブに、足りない32クラブを補う。
      // 補うのは来季の器を組んだこの時点＝**次の年から**参加する（今季の順位表は触らない）。
      // そろっているセーブでは何もしない（utils/domesticClubs.ts）
      // ★自チームのIDを渡すこと。渡さないと自チームの部まで「データどおり」に戻され、
      //   3部から始めたはずのクラブが選んだクラブの元の部（1部・2部）へ引き戻される
      const backfilled = backfillDomesticClubs({
        teams: syncedTeams0, players: cleanedPlayers, year: newYear, playerTeamId: state.playerTeamId })
      const syncedTeams = backfilled.teams
      const playersWithBackfill = backfilled.players
      const backfillNews = backfilled.addedTeams.length === 0 ? [] : [{
        date: `${newYear}-01-05`,
        headline: divisionsFoundedHeadline(backfilled.addedTeams.length, syncedTeams.length),
        category: 'race' as const,
        relatedIds: [] }]

      // 他チームから監督の声がかかるか。来季の予算と評判が決まったあとに判定する。
      // 出るのは1シーズンに最大1件で、答えるまでホームに出続ける（utils/gmOffer.ts）
      const gmOffer = makeGmOffer({
        season: state.currentSeason,
        playerTeamId: state.playerTeamId,
        finalRank,
        gmRep: newGmRep,
        teamCount: myDivSize(state),
        nextYear: newYear,
        teams: syncedTeams,
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
        foreignStandings: archivedForeignStandings,
        zeroAppearances })
      void writeSeasonArchive(archivedThisSeason).then(ok => {
        if (!ok) return
        set(st => ({
          archivedYears: [...new Set([...(st.archivedYears ?? []), archivedThisSeason.year])] }))
      })

      return {
        players: playersWithBackfill,
        removedPlayers,
        teams: syncedTeams,
        // 1件でも複数でも同じ入れ物（退任したときは3件まで一度に届く）
        gmOffers: gmOffer ? [gmOffer] : [],
        // 出た年を控えて、次のオファーまで間隔を空ける
        lastGmOfferYear: gmOffer ? newYear : state.lastGmOfferYear,
        foreignLeagues: cappedForeignLeagues,
        worldTournament: undefined,  // 世界選手権トーナメントは年度で完結（翌年は新規に開催）
        worldRacePlans: undefined,   // コースも毎年引き直し
        // 退団（FA流出・移籍）と海外移籍（クラブ間・日本↔海外）を移籍履歴に記録（移籍ページの日付・移籍金表示用）
        transferHistory: [...(state.transferHistory ?? []), ...departureRecords].slice(-800),
        jewels: state.jewels + objJewels + seasonAchievementJewels + rankJewels,
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
          races: newRaces,
          divisionRaces: nextSchedules,
          collegeRaces: [],
          draftPool: [],
          scoutPoints: 5 + objBonus + (state.teams.find(t => t.id === state.playerTeamId)?.facilities?.scoutOffice ?? 0),
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
          events: [...retirementEvents, ...renewalEvents],
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
          foreignStandings: initForeignStandings(foreignRefresh.updatedLeagues),
          foreignRaceIndex: 0,
          foreignAppearances: {},
          pendingForeignRestructure: false,  // 再編を適用したのでフラグ解除
          // 来季のECL：今季（＝前年）の各リーグ上位2チームで開催。4/6/7/9/11月の5戦、コースは10種から重複なし抽選。
          // 初年度は前年成績が無いためこの経路でしか生成されない＝1年目は開催なし
          eclSeries: (() => {
            const parts = buildEclParticipants({
              // ECLの枠は1部の上位2クラブ
              standings: divisionStandings(state.currentSeason, TOP_DIVISION),
              teams: state.teams,
              playerTeamId: state.playerTeamId,
              leagues: foreignRefresh.updatedLeagues,
              foreignStandings: state.currentSeason.foreignStandings ?? {},
              players: market.players })
            if (parts.length < 4) return undefined
            return {
              participants: parts,
              races: buildEclRaces(newYear, newRaces.map(r => r.date)),
              raceIndex: 0,
              points: {} }
          })(),
          // 補ったクラブぶんも来季の順位表に並ぶよう、state.teams ではなく補完後を使う。
          // 部の割り振りは昇降格を通したあとの部（＝来季走る部）で決まる
          standings: newSeasonStandings(syncedTeams, teamId => ({
            teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [] })),
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
    })
  },


  acceptGmOffer: (teamId) => {
    set(state => {
      // 届いている中から選ぶ。1件しか無いときは指定なしでもよい
      const offer = teamId ? (state.gmOffers ?? []).find(o => o.teamId === teamId) : (state.gmOffers ?? [])[0]
      if (!offer) return {}
      const dest = state.teams.find(t => t.id === offer.teamId)
      if (!dest) return { gmOffers: [] }
      const oldTeamId = state.playerTeamId
      // 監督名は人について回る。前のチームには元のGM名を戻す
      const myGmName = state.teams.find(t => t.id === oldTeamId)?.gmName
        ?? state.setupData?.gmName ?? '監督'
      const oldOriginalGm = INITIAL_TEAMS.find(t => t.id === oldTeamId)?.gmName ?? '新監督'
      const teams = state.teams.map(t => {
        if (t.id === offer.teamId) return { ...t, isPlayerControlled: true, gmName: myGmName }
        if (t.id === oldTeamId) return { ...t, isPlayerControlled: false, gmName: oldOriginalGm }
        return t
      })
      // 移籍方針（非売・貸出歓迎）は監督が付けた指示。CPUに戻るチームに残すと
      // 「絶対に売られない選手」がずっと居座って移籍市場が固まるので外す
      const players = state.players.map(p => (
        p.teamId === oldTeamId && (p.noSale || p.loanListed || p.transferListed)
          ? { ...p, noSale: false, loanListed: false, transferListed: false }
          : p
      ))
      // ECLの「どれが自チームか」の印は前季の終わりに焼き付けてある。
      // 移籍したらここを付け替えないと、来季のECLで前のチームが自チーム扱いになり
      // オーダーを組む相手と自動シミュの対象がずれる
      const ecl = state.currentSeason.eclSeries
      const eclSeries = ecl
        ? { ...ecl, participants: ecl.participants.map(pt => ({ ...pt, isPlayerTeam: pt.id === offer.teamId })) }
        : ecl
      return {
        playerTeamId: offer.teamId,
        teams,
        players,
        gmOffers: [],
        // 前のチームのオーダーは「前回のオーダー」として残さない
        lastRaceLineup: {},
        gmTenures: startTenure(state.gmTenures, offer.teamId, offer.year, oldTeamId),
        // 移籍先が因縁のチームだったらライバル設定は解除する
        rivalTeamId: state.rivalTeamId === offer.teamId ? null : state.rivalTeamId,
        seasonBudgetNotice: { year: offer.year, budget: offer.budget },
        currentSeason: {
          ...state.currentSeason,
          eclSeries,
          initialBudget: offer.budget,
          seasonGrant: offer.budgetBreakdown.grant,
          budgetBreakdown: offer.budgetBreakdown,
          scoutPoints: offer.scoutPoints,
          // 目標は移籍先の前季順位で引き直す
          // 目標は移籍先の部の人数と、その部での前季順位で引き直す。
          // 52を渡すと「52チーム中◯位」の目標になり、16チームの部では達成不能になる
          objectives: selectSeasonObjectives(
            state.rivalTeamId === offer.teamId ? false : !!state.rivalTeamId,
            offer.divisionSize ?? myDivSize(state),
            offer.prevRank,
          ),
          trainingAssignments: {},
          scoutMissions: [] },
        raceLineup: {} }
    })
  },


  declineGmOffer: () => set({ gmOffers: [] }),


  // 自分から退任する（設定から）。行き先の候補が一度に届く。
  // シーズン途中でも押せて、受けたその日から新しいクラブを指揮する。
  // 声がかかるかの抽選はしない（辞めると決めた以上、行き先0件では詰むため）。
  resignAsGm: () => {
    set(state => {
      if ((state.gmOffers ?? []).length > 0) return {}   // すでに届いている
      // 候補クラブの「いま使えるお金」をそのまま持って行く（年度更新を待たない）。
      // 予算は格1本（utils/clubTier）なので、内訳のグラントもそこから出す
      const tiered = allTieredClubs(state.teams, state.foreignLeagues ?? [])
      const nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }> = {}
      for (const t of state.teams) {
        nextBudgets[t.id] = {
          budget: t.finance.budget,
          carryover: 0, grant: tierBudget(t), raceIncome: 0, sponsor: 0, objBonus: 0, expenses: 0 }
      }
      const offers = resignOffers({
        season: state.currentSeason,
        playerTeamId: state.playerTeamId,
        finalRank: rankOfTeam(seasonDivisionStandings(state.currentSeason, state.playerTeamId), state.playerTeamId),
        nextYear: state.currentSeason.year,
        teams: state.teams,
        nextBudgets,
        rng: Math.random,
        tierNow: id => tierOf(tiered.find(c => c.id === id)),
        tierSeed: id => tierOfClubId(id) })
      return { gmOffers: offers }
    })
  } })
