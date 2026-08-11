// season ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
import { domesticTeamIdSet as domesticTeamIdSet_ } from '../../utils/clubs'
import { computeNextSeasonBudget, draftPickValue, operatingCostOf } from '../../data/economy'
import { FOREIGN_LEAGUES } from '../../data/foreignLeagues'
import { drawSeasonSchedules, generateIndividualEvents, generateSeasonRaces } from '../../data/races'
import { ROSTER_MAX } from '../../data/rosterRules'
import { generateSponsorOffers } from '../../data/sponsors'
import { INITIAL_TEAMS } from '../../data/teams'
import { ACHIEVEMENT_JEWELS, checkSeasonAchievements, podiumJewels, selectSeasonObjectives } from '../../engine/achievements'
import { applyAwayDivisionRound, applyRacedToSchedule, simulateAwayDivisions } from '../../engine/domesticLeague'
import { pickExistsAnywhere } from '../../engine/draftOrder'
import { buildEclParticipants, buildEclRaces } from '../../engine/eclSeries'
import { applyForeignChampions, initForeignStandings } from '../../engine/foreignLeague'
import { simulateCrossBorderTransfers, simulateForeignTransferMarket } from '../../engine/foreignTransfers'
import { growPlayer } from '../../engine/growth'
import { generateDraftPool, generateForeignLeaguePlayers, refreshForeignLeagues } from '../../engine/playerGenerator'
import { type Division, type GameState, type GmOffer, type Nationality, type Player, SPECIALTY_LABELS, type SeasonAward, type SeasonStanding, type TransferRecord } from '../../types'
import { archiveSeason } from '../../utils/archiveSeason'
import { computeSeasonAwards, seasonAwardsOf } from '../../utils/awards'
import { allTieredClubs, tierBudget, tierFromDomesticRank, tierFromForeignRank, tierOf, tierOfClubId, tierOfPlayerClub } from '../../utils/clubTier'
import { findClub, foreignClubIdSet } from '../../utils/clubs'
import { MORALE_DEFAULT, setMorale } from '../../utils/condition'
import { backfillDomesticClubs, domesticClubsComplete, originalDivisionOf } from '../../utils/domesticClubs'
import { eclHistoryOf } from '../../utils/eclHistory'
import { facilityUpkeepOf } from '../../utils/facilities'
import { makeGmOffer, resignOffers } from '../../utils/gmOffer'
import { gmCareerTotals, gmSeasonRanks, startTenure } from '../../utils/gmTenure'
import { DIVISIONS, PROMOTION_SLOTS, TOP_DIVISION, divisionOf, divisionStandings, domesticThroughRank, domesticThroughRankOfTeam, myDivSize, newSeasonStandings, rankOfTeam, rankedStandings, seasonDivisionStandings, teamsInDivision } from '../../utils/league'
import { movePlayer } from '../../utils/movePlayer'
import { type NewsItem, bonusPayoutHeadline, deficitPickPenaltyHeadline, divisionChampionHeadline, divisionMoveHeadline, divisionsFoundedHeadline, dynastyHeadlines, growthHeadline, massFreeAgentHeadline, objectiveBonusHeadline, retiredHeadline, seasonBudgetHeadline, seasonOpenHeadline, sponsorEndHeadline } from '../../utils/newsItems'
import { comparePlayers } from '../../utils/playerSort'
import { faMarketSalary, ovr, packForeignApps, perfOf, retirementAgeOf } from '../../utils/playerUtils'
import { clubMembersByClub, squadIdsOf } from '../../utils/rosterSync'
import { segmentRecordsOf } from '../../utils/segmentRecords'
import { needsPlayer } from '../../utils/squadNeeds'
import { teamHistoryOf } from '../../utils/teamHistory'
import { hasNoPlayingTime } from '../../utils/transferDecision'
import { writeSeasonArchive } from '../seasonArchive'
import { createEconomySlice } from '../slices/economySlice'

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
    // ── 他の部の残り日程を消化してから締める ─────────────────────────
    // 裏の部（engine/domesticLeague）は「自分の部で何戦目か」で進むので、
    // 自分の部のほうが戦数が少ないと他の部の日程が残ったままシーズンが終わる。
    // 3部（7戦）で遊ぶと1部（10戦）は7戦しか走らず、順位表も昇降格も通算成績も
    // 3戦ぶん足りない状態で確定していた。残りをここで全部走らせる。
    set(state => {
      const divRaces = state.currentSeason.divisionRaces
      if (!divRaces) return state
      const myDivision = divisionOf(state.teams.find(t => t.id === state.playerTeamId))
      const doneRounds = state.currentSeason.races.length
      const maxRounds = Math.max(...Object.values(divRaces).map(rs => rs.length))
      if (maxRounds <= doneRounds) return state
      let standings = state.currentSeason.standings
      let catchUpSchedule = state.currentSeason.divisionRaces
      const careerAdd: Record<string, { races: number; segWins: number }> = {}
      const segPrize: Record<string, number> = { ...(state.currentSeason.seasonSegPrize ?? {}) }
      for (let r = doneRounds; r < maxRounds; r++) {
        const round = simulateAwayDivisions(
          state.currentSeason.races[state.currentSeason.races.length - 1],
          state.teams, state.players, myDivision, 1, divRaces, r,
        )
        // 順位表へ足すときの raceId は、その回に実際に走った部のコースを使う
        const anyRace = DIVISIONS.map(d => (d === myDivision ? undefined : divRaces[d]?.[r])).find(Boolean)
        if (!anyRace) continue
        standings = applyAwayDivisionRound(standings, myDivision, round, anyRace)
        // 走行記録も日程へ書き戻す（レース中の反映と同じ関数を通す）
        catchUpSchedule = applyRacedToSchedule(catchUpSchedule, round.raced)
        for (const [pid, v] of Object.entries(round.careerAdd)) {
          const cur = careerAdd[pid] ?? { races: 0, segWins: 0 }
          careerAdd[pid] = { races: cur.races + v.races, segWins: cur.segWins + v.segWins }
        }
        for (const [tid, v] of Object.entries(round.segPrize)) segPrize[tid] = (segPrize[tid] ?? 0) + v
      }
      const awayApps2: Record<string, { races: number; wins: number }> = { ...(state.currentSeason.awayAppearances ?? {}) }
      for (const [pid, v] of Object.entries(careerAdd)) {
        const cur = awayApps2[pid] ?? { races: 0, wins: 0 }
        awayApps2[pid] = { races: cur.races + v.races, wins: cur.wins + v.segWins }
      }
      return {
        currentSeason: { ...state.currentSeason, standings, divisionRaces: catchUpSchedule, seasonSegPrize: segPrize, awayAppearances: awayApps2 },
        players: state.players.map(p => {
          const add = careerAdd[p.id]
          return add
            ? { ...p, career: { ...p.career, totalRaces: p.career.totalRaces + add.races, segmentWins: p.career.segmentWins + add.segWins } }
            : p
        }) }
    })
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

      // Expired contracts → FA (yearsLeft=0 after growth)
      // CPU team players go to FA automatically; player-team players wait for renewal decision
      // レンタル中の選手は保有元チーム基準で判定する（借り手チーム基準だと、貸し出した自チーム選手が勝手にFA化し、
      // 借りている他人の選手の更新判断をユーザーがさせられる）
      // レンタル中の選手は契約満了によるFA化の対象外（レンタル期間を必ず全うさせる）。
      // これが無いと「元契約残り1年の選手を2年レンタル」した場合に、1年目の終わりでFA化して
      // 借り手からも保有元からも消える（＝2年契約が1年で消える）バグになる。
      // 満了は返却後、保有元チーム側で改めて処理される
      // 契約満了FA化は「国内リーグ所属」だけが対象。海外クラブの選手を含めると
      // クラブ名簿に残ったまま teamId だけ '' になり「未所属」表示のバグになる（海外の名簿は海外リーグ側の更新で管理）
      const domesticIdsFA = domesticTeamIdSet_(state.teams)
      // 契約満了＝自チームもCPUと同じく自動FA。
      // シーズン中に半年切り通知・チャット催促・終了カードの契約未解決警告で警告済みで、
      // 退団は繰越時の退団通知（reason:'fa'）に載る＝気づかず消えることはない。
      // （旧実装は自チームだけ「判断待ちキュー」に積んでいたが、判断UIが存在せず契約切れのまま残り続けるバグだった）
      const expiredIds = new Set(
        grownPlayers
          .filter(p => p.contract.yearsLeft === 0 && !p.loan && p.teamId && domesticIdsFA.has(p.teamId) && p.status === 'active')
          .map(p => p.id)
      )

      // レンタル期間終了で保有元へ返却される選手（後段でロスター配列にも戻す）
      let playersAfterFA: Player[] = grownPlayers
      // 行き先が決まらなかった退団予定の選手（新シーズンの stayOrLeave に積む）
      let undecidedIds: string[] = []
      {
        // 契約満了・売れ残りの強制FA・レンタル満了の返却。どれも movePlayer に通して同じ後始末にする。
        // 名簿は下の teamsWithFA で所属から組み直すので、ここでは選手側だけ動かす
        const yearNow = state.currentSeason.year
        // 「移籍を認める」でリスト入りしたのに、どこからもオファーが来なかった選手。
        // ★以前は問答無用で強制FA（移籍金0で流出）だったが、行き先が無かっただけで
        //   クラブから追い出すのはおかしい。GMが「FAで出す／残留させる」を選ぶ（stayOrLeave）。
        //   選ぶまではロスターに残る＝既定は残留。残しても移籍希望は続く（transferListed のまま）
        undecidedIds = grownPlayers
          .filter(p => !expiredIds.has(p.id) && p.transferListed && p.teamId === state.playerTeamId && p.status === 'active')
          .map(p => p.id)
        const listedOutIds: string[] = []
        const listedOutSet = new Set(listedOutIds)
        // レンタル期間終了 → 保有元チームへ自動返却
        const loanReturns = grownPlayers
          .filter(p => !expiredIds.has(p.id) && !listedOutSet.has(p.id) && p.loan && p.loan.untilYear <= yearNow + 1)
        const runFA = (pid: string, to: string, lock?: number) => {
          const m = movePlayer({ players: playersAfterFA, teams: [] }, pid, to, {
            year: yearNow,
            ...(lock != null ? { lockUntilYear: lock } : {}) })
          if (m.ok) playersAfterFA = m.players
        }
        for (const id of expiredIds) runFA(id, '')
        for (const id of listedOutIds) runFA(id, '', yearNow + 2)
        for (const p of loanReturns) runFA(p.id, p.loan!.ownerTeamId)
      }

      // ── RETIREMENT SYSTEM ──
      // 引退年齢は utils/playerUtils の retirementAgeOf 1本（最終戦後の引退表明ニュースと同じ式）
      const retiringIds = new Set(
        grownPlayers
          .filter(p => p.status === 'active' && p.teamId && p.teamId !== '__pool__' && !expiredIds.has(p.id))
          .filter(p => p.age >= retirementAgeOf(p))
          .map(p => p.id)
      )
      // 引退承認済み（今季限りで引退フラグ）はここで確実に引退させる（承認時は即引退しない仕様）
      for (const p of grownPlayers) if (p.pendingRetirementYear != null && p.status === 'active') retiringIds.add(p.id)

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

      // Pre-retirement consideration events (age 34-36, didn't retire, active on player team)
      const considerRetirement = grownPlayers.filter(p =>
        p.teamId === state.playerTeamId &&
        p.status === 'active' &&
        !retiringIds.has(p.id) &&
        !expiredIds.has(p.id) &&
        p.age >= 34 && p.age <= 37 &&
        ovr(p) >= 60
      ).slice(0, 1)

      const retirementEvents = considerRetirement.map(p => ({
        id: `retire-consid-${p.id}-${state.currentSeason.year + 1}`,
        type: 'player_retirement' as const,
        raceIndex: 0,
        title: `${p.name}が引退を考慮`,
        body: `${p.age}歳になった${p.name}が今後のキャリアについて考えています。特別ボーナスで続投を要請するか、引退を受け入れますか？`,
        playerId: p.id,
        choices: [
          { label: '続投ボーナス2000万で要請', desc: '来季も戦力になるが予算圧迫' },
          { label: '引退を受け入れる（感謝の式）', desc: 'GM評判+3、チームの士気UP' },
        ],
        resolved: false }))

      // 引退を反映する。引退も「所属が無くなる」だけなので movePlayer の分岐を通す
      // （引退時の所属の控え・レンタル解除・名簿からの外しがまとめて付いてくる）。
      // クラブ側に名簿は無い（在籍は player.teamId 1本）ので、ここは選手だけ触る
      let playersAfterRetire: Player[] = playersAfterFA
      for (const id of retiringIds) {
        const m = movePlayer({ players: playersAfterRetire, teams: [] }, id, '', { year: state.currentSeason.year, retire: true })
        if (m.ok) playersAfterRetire = m.players
      }

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

      // ── 来季の格 ────────────────────────────────────────────────
      // 国内クラブの格は「今季の国内通し順位」1本で決まる。1部1位＝格5、3部最下位＝格20。
      // 通し順位は 部 → 部内順位 の順（domesticThroughRank）。順位表の得点で52チームを
      // 直接並べてはいけない（部ごとにレース数が違うので3部が2部を追い抜く）。
      // 予算もスポンサーもロスターの強さも、全部この格から降りてくる。
      //
      // ★下部リーグのクラブが入っていない古いセーブ（build 88 より前に始めたもの）は、
      //   降格先が存在しないまま落ちたチームが「2チームしかいない2部」にいる。
      //   その部で数えると通し順位21位＝格11相当になり、本来1部のクラブが1年ぶん
      //   不当に低い予算を受け取ってしまう。補完する年はデータどおりの部で数える。
      const clubsIncomplete = !domesticClubsComplete(state.teams)
      const effDivisionOf = (t: { id: string; division?: Division }): Division =>
        clubsIncomplete ? originalDivisionOf(t.id) : divisionOf(t)
      // 効き目のある部でまとめ直す。補完が要らない年は、順位表のキーとまったく同じ組になる
      const rowsByEffDiv = (() => {
        const m = new Map<Division, SeasonStanding[]>()
        for (const d of DIVISIONS) {
          for (const r of state.currentSeason.standings[d] ?? []) {
            const e = effDivisionOf(state.teams.find(x => x.id === r.teamId) ?? { id: r.teamId })
            const list = m.get(e)
            if (list) list.push(r); else m.set(e, [r])
          }
        }
        return m
      })()
      const divisionRankOf = (t: { id: string; division?: Division }) =>
        rankOfTeam(rowsByEffDiv.get(effDivisionOf(t)), t.id)
      const nextTierOf = (t: { id: string; division?: Division }) =>
        tierFromDomesticRank(domesticThroughRank(effDivisionOf(t), divisionRankOf(t)))
      const myNextTier = nextTierOf(state.teams.find(t => t.id === state.playerTeamId) ?? { id: state.playerTeamId })

      // ── 昇降格 ──────────────────────────────────────────────────
      // 各部の上位2チームが昇格、下位2チームが降格。プレーオフなし。
      // 1部に上は無く、3部に下は無い。上下2ずつなので各部の人数は変わらない。
      // ★格は「今季走った部」での順位で決まる（nextTierOf）。部の入れ替えはその後。
      //
      // ★クラブが足りていないセーブでは、このシーズン終わりに32クラブを補う（下の backfill）。
      //   降格先が存在しないまま落ちていたぶんは取り消してデータどおりの 20/16/16 に戻し、
      //   **次の年から**通常の昇降格に戻す。ここで昇降格を通すと、補ったばかりのクラブが
      //   走ってもいない順位で動いてしまう。
      const nextDivisionOf = (t: { id: string; division?: Division }): Division => {
        if (clubsIncomplete) return originalDivisionOf(t.id)
        const d = divisionOf(t)
        const r = divisionRankOf(t)
        const size = teamsInDivision(state.teams, d).length
        if (d > DIVISIONS[0] && r <= PROMOTION_SLOTS) return (d - 1) as Division
        if (d < DIVISIONS[DIVISIONS.length - 1] && r > size - PROMOTION_SLOTS) return (d + 1) as Division
        return d
      }
      const divisionMoveNews = clubsIncomplete ? [] : state.teams
        .map(t => ({ t, from: divisionOf(t), to: nextDivisionOf(t) }))
        .filter(x => x.from !== x.to)
        .map(({ t, from, to }) => ({
          date: `${state.currentSeason.year}-12-01`,
          headline: divisionMoveHeadline({ clubName: t.name, from, to }),
          category: 'race' as const,
          relatedIds: [t.id] }))

      // Sponsor contract processing
      const myActiveSponsorIds = state.teams.find(t => t.id === state.playerTeamId)?.sponsors ?? []
      const mySegWins = state.currentSeason.races
        .filter(r => r.results)
        .flatMap(r => r.results!.segmentResults)
        .filter(sr => sr.runners[0]?.teamId === state.playerTeamId)
        .length
      const expiredSponsorIds = new Set<string>()
      const sponsorNews: typeof state.currentSeason.newsFeed = []
      const renewalOffers: import('../../types').SponsorOffer[] = []
      const updatedSponsors = (state.sponsors ?? []).map(sp => {
        if (!myActiveSponsorIds.includes(sp.id)) return sp
        const newYearsLeft = sp.yearsLeft - 1
        if (newYearsLeft <= 0) {
          expiredSponsorIds.add(sp.id)
          let targetMet = true
          if (sp.target) {
            if (sp.target.type === 'rank') targetMet = myFinalRank > 0 && myFinalRank <= sp.target.value
            else if (sp.target.type === 'segmentWins') targetMet = mySegWins >= sp.target.value
            else if (sp.target.type === 'championship') targetMet = myFinalRank === 1
          }
          if (targetMet) {
            renewalOffers.push({
              id: `offer_renewal_${sp.id}_${newYear}`,
              name: sp.name,
              tier: sp.tier,
              annualPayment: Math.round(sp.annualPayment * 1.05 / 500000) * 500000,
              contractYears: Math.min((sp.contractYears ?? 1) + 1, 3),
              target: sp.target ?? { type: 'rank', value: 5, description: '5位以内' },
              logoColor: sp.logoColor })
          }
          sponsorNews.push({
            date: `${state.currentSeason.year}-10-27`,
            headline: sponsorEndHeadline({ sponsorName: sp.name, met: targetMet, targetDesc: sp.target?.description }),
            category: 'finance' as const,
            relatedIds: [] })
        }
        return { ...sp, yearsLeft: Math.max(0, newYearsLeft) }
      })
      // 前年にオファーが来た会社・契約中の会社は翌年の新規候補から除外（毎年同じ顔ぶれになるのを防ぐ）
      const tplIdOf = (id: string) => /^(?:sp_)?offer_(.+)_\d+_\d+$/.exec(id)?.[1]
      const excludeTplIds = [
        ...(state.currentSeason.sponsorOffers ?? []).map(o => tplIdOf(o.id)),
        ...updatedSponsors.filter(sp => sp.yearsLeft > 0).map(sp => tplIdOf(sp.id)),
      ].filter((x): x is string => !!x)
      const newSponsorOffers = [...renewalOffers, ...generateSponsorOffers(myNextTier, newYear, excludeTplIds)]
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
      const completedObjs = (state.currentSeason.objectives ?? []).map(obj => {
        if (obj.done) return obj
        if (obj.id === 'topN' && finalRank > 0 && finalRank <= obj.target) return { ...obj, current: finalRank, done: true }
        if (obj.id === 'noInjury' && obj.current === 0) return { ...obj, done: true }
        if (obj.id === 'budgetMaintain' && playerBudgetAtSeasonEnd >= obj.target) return { ...obj, current: playerBudgetAtSeasonEnd, done: true }
        return obj
      })
      const newlyCompletedObjs = completedObjs.filter(o => o.done && !state.currentSeason.objectives.find(x => x.id === o.id)?.done)
      const objBonus = newlyCompletedObjs.reduce((s, o) => s + o.rewardPts, 0)
      const objBudgetBonus = newlyCompletedObjs.reduce((s, o) => s + (o.rewardBudget ?? 0), 0)

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

      // 来季の目標：今季の最終順位を基準にスケール（順位が上がるほど翌年の目標も厳しく）
      const newObjectives = selectSeasonObjectives(!!state.rivalTeamId, myDivSize(state), finalRank)

      // GM評判＝今季の目標達成率で少しずつ変動（±5以内）
      const objAchieved = completedObjs.filter(o => o.done).length
      const objTotalCount = completedObjs.length || 1
      const objAchieveRate = objAchieved / objTotalCount
      const repDelta = objAchieveRate >= 1 ? 5 : objAchieveRate >= 0.6 ? 3 : objAchieveRate >= 0.4 ? 1 : objAchieveRate >= 0.2 ? -1 : -3
      const newGmRep = Math.max(1, Math.min(100, (state.gmRep ?? 50) + repDelta))

      // ── BONUS CLAUSE PAYOUTS (item 16) ──
      // ここは teamsWithFA の名簿を見る（シーズン開始時の state.players ではなく）。
      // teamsWithFA は契約切れ・引退・強制FAを反映したあとの所属から組み直してあるので、
      // 退団が決まった選手にボーナスを払ってしまう事故を防げる
      // 在籍は player.teamId が唯一の持ち場（utils/rosterSync の squadIdsOf）。
      // teamsWithFA はこの playersAfterRetire から組み直したものなので、直接数えても同じ
      const playerTeamRosterIds = squadIdsOf(playersAfterRetire, state.playerTeamId)

      // Count segment wins per player this season from race results
      const playerSegWinsSeason: Record<string, number> = {}
      const leagueSegWinsSeason: Record<string, number> = {}
      for (const race of state.currentSeason.races) {
        if (!race.results) continue
        for (const seg of race.results.segmentResults) {
          const winner = seg.runners.find(r => r.rank === 1)
          if (winner) {
            leagueSegWinsSeason[winner.playerId] = (leagueSegWinsSeason[winner.playerId] ?? 0) + 1
            if (winner.teamId === state.playerTeamId) {
              playerSegWinsSeason[winner.playerId] = (playerSegWinsSeason[winner.playerId] ?? 0) + 1
            }
          }
        }
      }

      // League MVP・新人王（選出ルールは utils/awards.ts に一元化。画面表示側と同じ実装を使う）
      const newSeasonAward: SeasonAward = computeSeasonAwards(state.currentSeason.races, grownPlayers, state.currentSeason.year, divisionOf(state.teams.find(t => t.id === state.playerTeamId)))

      // 記録会のシーズン別トップ10を軽量アーカイブ（記録会の全結果はこの後破棄されるため、
      // 歴代優勝ページ用に種目ごとの上位だけ名前焼き込みで残す）
      const DIST_TO_KEY: Record<number, 'd5000' | 'd10000' | 'half' | 'marathon'> = { 5000: 'd5000', 10000: 'd10000', 21097: 'half', 42195: 'marathon' }
      const newEventTops: NonNullable<GameState['eventSeasonTops']> = []
      {
        const byDist = new Map<'d5000' | 'd10000' | 'half' | 'marathon', Map<string, { playerId: string; teamId: string; timeSec: number }>>()
        for (const ev of state.currentSeason.individualEvents ?? []) {
          const key = DIST_TO_KEY[ev.distance]
          if (!key || !ev.results) continue
          if (!byDist.has(key)) byDist.set(key, new Map())
          const best = byDist.get(key)!
          for (const r of ev.results) {
            const cur = best.get(r.playerId)
            if (!cur || r.timeSec < cur.timeSec) best.set(r.playerId, { playerId: r.playerId, teamId: r.teamId, timeSec: r.timeSec })
          }
        }
        for (const [dist, best] of byDist) {
          // 記録会にはドラフト候補も出るため、名前はプレイヤー→候補の順で解決して焼き込む
          const top = [...best.values()].sort((a, b) => a.timeSec - b.timeSec).slice(0, 10)
            .map(e => ({ ...e, playerName: (state.players.find(p => p.id === e.playerId) ?? (state.currentSeason.scoutProspects ?? []).find(p => p.id === e.playerId))?.name ?? '' }))
          if (top.length > 0) newEventTops.push({ year: state.currentSeason.year, dist, top })
        }
      }
      const leagueMvpId = newSeasonAward.mvpId

      let bonusTotalPayout = 0
      const bonusPayoutNews: { date: string; headline: string; category: 'race'; relatedIds: string[] }[] = []

      for (const pid of playerTeamRosterIds) {
        const p = playersAfterRetire.find(x => x.id === pid)
        if (!p?.contract.bonusClauses?.length) continue
        for (const clause of p.contract.bonusClauses) {
          if (clause.type === 'champion' && finalRank === 1) {
            bonusTotalPayout += clause.amount
            bonusPayoutNews.push({ date: `${state.currentSeason.year}-10-26`, headline: bonusPayoutHeadline({ playerName: p.name, kind: 'champion', amount: clause.amount }), category: 'race', relatedIds: [p.id] })
          } else if (clause.type === 'segment_win') {
            const wins = playerSegWinsSeason[p.id] ?? 0
            if (wins > 0) {
              const payout = clause.amount * wins
              bonusTotalPayout += payout
              bonusPayoutNews.push({ date: `${state.currentSeason.year}-10-26`, headline: bonusPayoutHeadline({ playerName: p.name, kind: 'segment_win', amount: payout, count: wins }), category: 'race', relatedIds: [p.id] })
            }
          } else if (clause.type === 'mvp' && p.career.mvpAwards > 0) {
            bonusTotalPayout += clause.amount
            bonusPayoutNews.push({ date: `${state.currentSeason.year}-10-26`, headline: bonusPayoutHeadline({ playerName: p.name, kind: 'mvp', amount: clause.amount }), category: 'race', relatedIds: [p.id] })
          }
        }
      }

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

      // ── 来季予算 ────────────────────────────────────────────────
      // 収入は「来季の格の年間予算」＋スポンサー＋目標ボーナス。支出は年俸＋運営費(年俸の1割)。
      // 順位グラント・レース賞金・観客収入・CPU補填・連続赤字ペナルティ・育成義務ペナルティは
      // 全部この1本に畳んだ（data/economy.ts の computeNextSeasonBudget）。
      const myBaseGrant = tierBudget({ tier: myNextTier })
      const myOpCost = operatingCostOf(playerSalaryTotal)
      const newBudget = computeNextSeasonBudget({
        baseGrant: myBaseGrant,
        prevBalance: playerBudgetAtSeasonEnd,
        sponsorAnnual,
        raceIncome: prevRaceIncome,
        objBudgetBonus,
        bonusPayout: bonusTotalPayout,
        salaryTotal: playerSalaryTotal,
        facilityUpkeep: facilityUpkeepOf(state.teams.find(t => t.id === state.playerTeamId)) })
      // 初期予算の内訳（財務ページで「何が合わさって初期予算か」を表示）。
      // 繰越は「前季の最終収支」＝期末残高から年俸・運営費・ボーナスを精算した後の額。
      const newBudgetBreakdown = {
        carryover: playerBudgetAtSeasonEnd - (bonusTotalPayout + playerSalaryTotal + myOpCost),
        grant: myBaseGrant,
        raceIncome: prevRaceIncome,
        sponsor: sponsorAnnual,
        objBonus: objBudgetBonus,
        expenses: 0,  // 精算済みのためcarryoverに織り込み（旧セーブの表示互換のためフィールドは残す）
      }
      // シーズンを終えた時点の残高がマイナスなら連続赤字+1、プラスなら0にリセット。
      // 連続赤字でグラントを削る仕掛けは廃止したので、これは補強禁止の判定にだけ使う。
      const newStreakMe = newBudget < 0 ? prevStreakMe + 1 : 0

      // 全チームの来季予算（自チームと同じ computeNextSeasonBudget）。
      const teamSalaryTotal = (teamId: string) => playersAfterMorale
        .filter(p => p.teamId === teamId)
        .reduce((s, p) => s + p.contract.annualSalary, 0)
      const teamSponsorAnnual = (t: typeof teamsWithFA[0]) => (t.sponsors ?? [])
        .map(id => (state.sponsors ?? []).find(s => s.id === id))
        .filter(Boolean)
        .reduce((s, sp) => s + sp!.annualPayment, 0)
      // 監督オファーを受けたときに移籍先の予算へ丸ごと入れ替えるので、
      // 他チームの来季予算の内訳もここで控えておく（あとからは計算し直せない）
      const cpuNextBudgets: Record<string, typeof newBudgetBreakdown & { budget: number }> = {}
      const teamsWithSeasonRewards = teamsWithFA.map(t => {
        if (t.id === state.playerTeamId) {
          return { ...t, tier: myNextTier, division: nextDivisionOf(t), finance: { ...t.finance, budget: newBudget, deficitStreak: newStreakMe } }
        }
        const cpuTier = nextTierOf(t)
        const sal = teamSalaryTotal(t.id)
        const prevStreak = t.finance.deficitStreak ?? 0
        const cpuBaseGrant = tierBudget({ tier: cpuTier })
        const cpuSponsor = teamSponsorAnnual(t)
        // 区間賞は自チームと同じ数え方で積んである（currentSeason.seasonSegPrize）
        const cpuSegPrize = (state.currentSeason.seasonSegPrize ?? {})[t.id] ?? 0
        const b = computeNextSeasonBudget({
          baseGrant: cpuBaseGrant,
          prevBalance: t.finance.budget,
          sponsorAnnual: cpuSponsor,
          raceIncome: cpuSegPrize,
          objBudgetBonus: 0,
          bonusPayout: 0,
          salaryTotal: sal,
          // 施設の維持費は全クラブが払う（自チームと同じ1本。レベルは格から出る）
          facilityUpkeep: facilityUpkeepOf({ ...t, tier: cpuTier }) })
        // 自チームと同じ判定：精算後の残高がマイナスなら連続赤字+1、プラスなら0
        const cpuStreak = b < 0 ? prevStreak + 1 : 0
        cpuNextBudgets[t.id] = {
          budget: b,
          carryover: t.finance.budget - (sal + operatingCostOf(sal)),
          grant: cpuBaseGrant,
          raceIncome: cpuSegPrize,
          sponsor: cpuSponsor,
          objBonus: 0,
          expenses: 0 }
        return { ...t, tier: cpuTier, division: nextDivisionOf(t), finance: { ...t.finance, budget: b, deficitStreak: cpuStreak } }
      })

      // Generate future draft picks (next 2 seasons) for each team based on final rank
      const numTeams = state.teams.length
      const teamsWithFuturePicks = teamsWithSeasonRewards.map(t => {
        // 部をまたいで並べるので国内通し順位（1〜52）。下位ほど早い番号になる
        const teamFinalRank = domesticThroughRankOfTeam(state.currentSeason, t.id)
        const pickNum = Math.max(1, numTeams - teamFinalRank + 1)
        const newPicks: typeof t.draftPicks = []
        for (const yr of [newYear, newYear + 1]) {
          for (const round of [1, 2]) {
            const alreadyHas = pickExistsAnywhere(teamsWithSeasonRewards, t.id, yr, round)
            if (!alreadyHas) newPicks.push({ year: yr, round, pickNumber: pickNum, originallyOwnedBy: t.id })
          }
        }
        return { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] }
      })

      // Remove expired draft picks (older than the upcoming draft year)
      let teamsWithCleanedPicks = teamsWithFuturePicks.map(t => ({
        ...t,
        draftPicks: (t.draftPicks ?? []).filter(pk => pk.year >= newYear) }))

      // ── 赤字ペナルティ：3年以上連続赤字はドラフト制限 ──
      // 来季ドラフトの自チーム最上位指名権が、資金力のあるチームへ強制売却される（売却額は補填として入金）
      const pickPenaltyNews: { date: string; headline: string; category: 'finance'; relatedIds: string[] }[] = []
      if (newStreakMe >= 3) {
        const meT = teamsWithCleanedPicks.find(t => t.id === state.playerTeamId)
        const myNextPicks = (meT?.draftPicks ?? []).filter(pk => pk.year === newYear)
        const soldPick = [...myNextPicks].sort((a, b) => a.round - b.round || a.pickNumber - b.pickNumber)[0]
        const buyer = [...teamsWithCleanedPicks].filter(t => t.id !== state.playerTeamId).sort((a, b) => b.finance.budget - a.finance.budget)[0]
        if (soldPick && buyer) {
          const price = draftPickValue(soldPick.round, soldPick.pickNumber)
          const samePick = (pk: typeof soldPick) => pk.year === soldPick.year && pk.round === soldPick.round && pk.originallyOwnedBy === soldPick.originallyOwnedBy
          teamsWithCleanedPicks = teamsWithCleanedPicks.map(t => {
            if (t.id === state.playerTeamId) return { ...t, finance: { ...t.finance, budget: t.finance.budget + price }, draftPicks: (t.draftPicks ?? []).filter(pk => !samePick(pk)) }
            if (t.id === buyer.id) return { ...t, finance: { ...t.finance, budget: t.finance.budget - price }, draftPicks: [...(t.draftPicks ?? []), soldPick] }
            return t
          })
          pickPenaltyNews.push({
            date: `${state.currentSeason.year}-10-31`,
            headline: deficitPickPenaltyHeadline({ streak: newStreakMe, year: newYear, round: soldPick.round, buyerShort: buyer.shortName, price }),
            category: 'finance' as const,
            relatedIds: [] })
        }
      }

      const seasonPrizeNews = {
        date: `${state.currentSeason.year}-10-30`,
        headline: seasonBudgetHeadline({ year: state.currentSeason.year, finalRank, budget: newBudget, prize: prevRaceIncome, sponsor: sponsorAnnual }),
        category: 'race' as const,
        relatedIds: [] }

      // ── DYNASTY MILESTONES ──
      // 通算成績は「今季を足したあと」で見たいので、過去シーズンに今季の順位表を足して数え直す
      // 称号と連覇は「監督個人の通算」で数える。チームの通算（球団史）で数えると、
      // 優勝の多いチームへ移った瞬間に前任者の優勝で連覇・王朝の称号が解除されてしまう（utils/gmTenure.ts）
      const gmRanksAfter = gmSeasonRanks([
        ...state.pastSeasons,
        { year: state.currentSeason.year, standings: state.currentSeason.standings },
      ], state.gmTenures, state.playerTeamId)
      const gmTotalsAfter = gmCareerTotals(gmRanksAfter)
      const totalChamps = gmTotalsAfter.championships
      const totalSeasons = gmTotalsAfter.seasons
      const curStreak = gmTotalsAfter.currentStreak
      const segWinsAfter = playersAfterMorale.filter(p => p.teamId === state.playerTeamId).reduce((s, p) => s + p.career.segmentWins, 0)
      const segWinsBefore = state.players.filter(p => p.teamId === state.playerTeamId).reduce((s, p) => s + p.career.segmentWins, 0)
      // 節目の条件も文面も utils/newsItems の dynastyHeadlines 1本
      const dynastyNews: NewsItem[] = dynastyHeadlines({
        finalRank, championships: totalChamps, seasons: totalSeasons, currentStreak: curStreak,
        division: divisionOf(state.teams.find(t => t.id === state.playerTeamId)),
        segWinsAfter, segWinsBefore }).map(headline => ({ date: `${state.currentSeason.year}-10-26`, headline, category: 'race' as const, relatedIds: [] }))

      // Update MVP player's career.mvpAwards
      const playersWithMVP = leagueMvpId
        ? playersAfterMorale.map(p =>
            p.id === leagueMvpId ? { ...p, career: { ...p.career, mvpAwards: p.career.mvpAwards + 1 } } : p
          )
        : playersAfterMorale

      // Update championship team players' career.championships
      // 優勝は部ごとに1クラブ（1部の優勝も3部の優勝も、その部の優勝として数える）
      const champTeamIds = new Set(DIVISIONS.map(d => divisionStandings(state.currentSeason, d)[0]?.teamId).filter(Boolean))
      const playersWithChamp = champTeamIds.size > 0
        ? playersWithMVP.map(p =>
            champTeamIds.has(p.teamId)
              ? { ...p, career: { ...p.career, championships: p.career.championships + 1 } }
              : p
          )
        : playersWithMVP

      const seasonTotalSegWins = Object.values(playerSegWinsSeason).reduce((s, v) => s + v, 0)
      const seasonAchievements = checkSeasonAchievements({
        finalRank,
        year: state.currentSeason.year,
        totalChamps,
        curStreak,
        seasonSegWins: seasonTotalSegWins,
        totalSeasons,
        players: playersWithChamp,
        playerTeamId: state.playerTeamId,
        existing: state.achievements ?? [] })

      // MVP/新人王ニュースはシーズン最終戦の直後（そのシーズンのニュース）で流すため、ここでは出さない（二重表示防止）

      // 在籍履歴（(L)レンタル）用：現在レンタル中の選手について、この年その所属チームでの出場記録を追記
      const seasonYear = state.currentSeason.year
      const playersWithLoanHistory = playersWithChamp.map(p => {
        if (!p.loan) return p
        const existing = p.loanTeamYears ?? []
        if (existing.some(l => l.year === seasonYear && l.teamId === p.teamId)) return p
        return { ...p, loanTeamYears: [...existing, { year: seasonYear, teamId: p.teamId }] }
      })

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

      // 海外リーグの優勝クラブ所属選手に championships +1（今季の順位表を確定してから）
      const playersWithForeignChamp = applyForeignChampions(
        state.foreignLeagues ?? [], playersWithLoanHistory, state.currentSeason.foreignStandings ?? {},
      )

      // 海外クラブの格も今季のリーグ順位で動かす。国内（Team.tier）とまったく同じ扱いで、
      // 違うのは「どの順位表で決まるか」だけ。順位表はあるのに格へ返していなかったので、
      // 海外クラブの格は初期値のまま一生固定だった（最下位を続けても格1のまま）。
      const foreignStandingsFinal = state.currentSeason.foreignStandings ?? {}
      const leaguesWithTier = foreignRefresh.updatedLeagues.map(lg => {
        const rows = rankedStandings(foreignStandingsFinal[lg.id] ?? [])
        if (rows.length === 0) return lg   // 1戦もしていないリーグは触らない
        const rankOf = new Map(rows.map((r, i) => [r.teamId, i + 1]))
        return {
          ...lg,
          clubs: lg.clubs.map(c => {
            const rank = rankOf.get(c.id)
            return rank == null ? c : { ...c, tier: tierFromForeignRank(lg.id, rank, rows.length) }
          }) }
      })

      // シーズンオフの海外クラブ間移籍（引き抜き）。選手がクラブ・国境を越えて移動する。
      // 万一エラーが出てもシーズン更新自体は壊さないよう、失敗時は移籍なしにフォールバック。
      const foreignBasePlayers = [
        ...(removedForeignPlayerIds.size > 0 ? playersWithForeignChamp.filter(p => !removedForeignPlayerIds.has(p.id)) : playersWithForeignChamp),
        ...foreignRefresh.newPlayers,
      ]
      // 海外クラブの来季予算。**国内CPUとまったく同じ computeNextSeasonBudget 1本**を通す。
      //   収入 = 格の年間予算   支出 = 総年俸 + 運営費(年俸の1割) + 施設維持費
      // これまで海外クラブには資金の置き場所（finance）が無く、移籍の処理に入るたびに
      // tierBudget へ満タンに戻っていた。使っても減らないので、
      //   ・繰越の上限（CARRYOVER_CAP_SHARE）が効かない
      //   ・施設維持費も年俸も払わない
      //   ・格を上げても下げても手元の額が変わらない
      // という状態で、国内だけが資金のやりくりをしていた。
      // 総年俸は補充・引退を反映した後の名簿（foreignBasePlayers）から数える。
      const foreignSalaryTotal = new Map<string, number>()
      for (const p of foreignBasePlayers) {
        if (p.status === 'retired') continue
        foreignSalaryTotal.set(p.teamId, (foreignSalaryTotal.get(p.teamId) ?? 0) + p.contract.annualSalary)
      }
      const leaguesWithFinance = leaguesWithTier.map(lg => ({
        ...lg,
        clubs: lg.clubs.map(c => {
          const sal = foreignSalaryTotal.get(c.id) ?? 0
          return {
            ...c,
            finance: {
              ...c.finance,
              budget: computeNextSeasonBudget({
                baseGrant: tierBudget(c),
                // 古いセーブには finance が無い。その年は「格の年間予算ちょうど」から始める
                prevBalance: c.finance?.budget ?? tierBudget(c),
                sponsorAnnual: 0,   // 海外クラブはスポンサー契約を結ばない（国内CPUも同じ）
                raceIncome: 0,      // 区間賞は国内のレースだけ
                objBudgetBonus: 0,
                bonusPayout: 0,
                salaryTotal: sal,
                facilityUpkeep: facilityUpkeepOf(c) }) } }
        }) }))

      let foreignTx: { foreignLeagues: typeof foreignRefresh.updatedLeagues; players: typeof foreignBasePlayers; news: NewsItem[]; records: TransferRecord[] }
      try {
        foreignTx = simulateForeignTransferMarket({
          foreignLeagues: leaguesWithFinance,
          players: foreignBasePlayers,
          year: newYear })
      } catch (e) {
        console.error('simulateForeignTransferMarket failed', e)
        foreignTx = { foreignLeagues: leaguesWithFinance, players: foreignBasePlayers, news: [], records: [] }
      }

      // シーズンオフの日本↔海外クロスボーダー移籍（CPU同士）。プレイヤーのチームは対象外。
      let crossTx: { teams: typeof teamsWithCleanedPicks; foreignLeagues: typeof foreignTx.foreignLeagues; players: typeof foreignTx.players; news: typeof foreignTx.news; records: TransferRecord[] }
      try {
        crossTx = simulateCrossBorderTransfers({
          teams: teamsWithCleanedPicks,
          foreignLeagues: foreignTx.foreignLeagues,
          players: foreignTx.players,
          playerTeamId: state.playerTeamId,
          year: newYear })
      } catch (e) {
        console.error('simulateCrossBorderTransfers failed', e)
        crossTx = { teams: teamsWithCleanedPicks, foreignLeagues: foreignTx.foreignLeagues, players: foreignTx.players, news: [], records: [] }
      }

      // ── 長期プレイでの肥大化対策（記録は名前焼き込みで残るため消えない） ──
      // 1) 海外クラブの在籍上限(30人)をここで適用する。所属は選手側の teamId だけが記録なので、
      //    クラブごとに数えて、はみ出したぶん（能力の低い順）を下の整理で外す
      const playerByIdCl = new Map(crossTx.players.map(p => [p.id, p]))
      const foreignDropIds = new Set<string>()
      {
        // 数えるのは現役だけ。負傷中の選手まで数に入れると、怪我をしただけで
        // 上限からはみ出して引退させられてしまう
        const membersByClub = clubMembersByClub(crossTx.players.filter(p => p.status === 'active'))
        for (const l of crossTx.foreignLeagues) {
          for (const c of l.clubs) {
            const ids = membersByClub.get(c.id) ?? []
            // 人数上限は data/rosterRules の ROSTER_MAX 1本。30 と書かない
            if (ids.length <= ROSTER_MAX) continue
            const sorted = [...ids].sort((a, b) => {
              const pa = playerByIdCl.get(a); const pb = playerByIdCl.get(b)
              return (pb ? ovr(pb) : 0) - (pa ? ovr(pa) : 0)
            })
            sorted.slice(ROSTER_MAX).forEach(id => foreignDropIds.add(id))
          }
        }
      }
      const cappedForeignLeagues = crossTx.foreignLeagues
      // 2) 引退選手の軽量化（能力履歴・特性などを落として名前と実績だけ残す）
      //    ＋整理のルールは国内・海外で共通：「実績（出走・区間賞・記録会ベスト）のある選手は絶対に消さず引退として残す」。
      //    実績ゼロの選手だけ削除する。これでニュース・記録・歴代優勝から選手詳細が必ず開ける
      //    引退後の選手詳細は1ページ目（能力レーダー・契約・市場価値）を表示しないので、
      //    能力値・EXP・上限解放などは持たせない。セーブ容量の節約。
      //    ratings は型上は必須だが、読む側は safeRatings/ovr で欠損に耐える作りにしてある。
      //    contract は残す（引退ニュースのカードが p.contract.annualSalary を直接読むため）
      const LEAN_DROP_KEYS = ['ratings', 'exp', 'potentialBoosts', 'customCaps', 'segmentPBs', 'personalSponsors', 'predictedPick', 'ovrHistory', 'traits'] as const
      // 引退そのものは movePlayer の分岐に任せる（上の引退処理を通っていない経路もここに来るため）。
      // ここに残すのはセーブを軽くするためのデータ削りだけ
      const leanRetired = (p: Player, retiredYear = state.currentSeason.year): Player => {
        const moved = movePlayer({ players: [p], teams: [] }, p.id, '', { year: retiredYear, retire: true })
        const q: Record<string, unknown> = { ...(moved.ok ? moved.players[0] : p) }
        for (const k of LEAN_DROP_KEYS) delete q[k]
        return q as unknown as Player
      }
      // 3) 「二度と名前が出ない選手」は選手データごと削除してセーブを軽くする。
      //    残すのは画面のどこかで名前が出る可能性がある選手だけ：
      //      ・一度でも自チームに所属した
      //      ・区間賞を取ったことがある（通算区間賞ランキング）
      //      ・区間記録／記録会の歴代記録（世界記録・日本記録・種目別トップ10・チーム歴代記録）の保持者
      //      ・駅伝代表に選ばれたことがある（全出場国の代表20人ぶんが worldRepresentatives に入る）
      //      ・MVP・新人王・ECL優勝メンバー・ECL MVP
      //      ・ドラフト指名歴がある（歴代ドラフトの一覧が歯抜けになる）
      //      ・スター（★）を付けている
      //    削除した選手は removedPlayers に「名前・国籍」だけ残すので、過去レースの区間配置や
      //    移籍履歴では名前も顔もそのまま出る（選手詳細だけ開けなくなる）。
      const protectedIds = new Set<string>()
      for (const list of Object.values(segmentRecordsOf(state.pastSeasons, state.currentSeason))) {
        for (const r of list) protectedIds.add(r.playerId)
      }
      for (const rec of [...Object.values(state.worldRecords ?? {}), ...Object.values(state.japanRecords ?? {})]) {
        if (!rec) continue
        protectedIds.add(rec.playerId)
        for (const co of rec.coHolders ?? []) protectedIds.add(co.playerId)
      }
      for (const g of state.eventSeasonTops ?? []) for (const t of g.top) protectedIds.add(t.playerId)
      for (const t of state.teams) {
        for (const list of Object.values(t.eventRecords ?? {})) for (const r of list ?? []) protectedIds.add(r.playerId)
      }
      // 年度MVP・新人王はセーブに持たず、過去シーズンのレース結果から選び直す（utils/awards.ts）
      for (const a of seasonAwardsOf(state.pastSeasons, state.players, state.removedPlayers)) {
        if (a.mvpId) protectedIds.add(a.mvpId)
        if (a.rookieId) protectedIds.add(a.rookieId)
      }
      // ECLの歴代優勝もセーブに持たず、保存してあるECLのレース結果から数え直す（utils/eclHistory.ts）
      for (const e of eclHistoryOf(state.pastSeasons, state.currentSeason)) {
        if (e.mvpPlayerId) protectedIds.add(e.mvpPlayerId)
        for (const id of e.winnerPlayerIds ?? []) protectedIds.add(id)
      }
      for (const r of state.worldRepresentatives ?? []) protectedIds.add(r.playerId)
      for (const id of state.worldSquad?.playerIds ?? []) protectedIds.add(id)
      // 各国代表に選ばれた20人。代表タブはこの20人をそのまま出すので、
      // ここで守らないと引退した選手が名簿から消えて「20人選ばれたはずが18人」になる。
      // 次の選出で入れ替わるまでは、引退していても20人のまま見せる
      for (const squads of [
        state.worldTournament?.squads,
        ...(state.worldAthleticsResults ?? []).map(r => r.squads),
      ]) {
        for (const ids of Object.values(squads ?? {})) for (const id of ids ?? []) protectedIds.add(id)
      }
      for (const id of [...(state.starredOpponents ?? []), ...(state.starredProspects ?? [])]) protectedIds.add(id)
      // 自チーム在籍歴：過去シーズンの出走記録・0出走記録から拾う（印が無い旧セーブぶんの救済）
      // 監督は移籍できるので、今のチームだけでなく過去に指揮したチーム全部を見る。
      // ここを今のチームだけにすると、移籍した瞬間に前のチームのOBが消える
      const myTeamIdsEver = new Set<string>([state.playerTeamId, ...(state.gmTenures ?? []).map(t => t.teamId)])
      for (const season of [...state.pastSeasons, state.currentSeason]) {
        for (const race of [...(season.races ?? []), ...(season.secondTeamRaces ?? [])]) {
          if (!race.results) continue
          for (const sr of race.results.segmentResults) {
            for (const r of sr.runners) if (myTeamIdsEver.has(r.teamId)) protectedIds.add(r.playerId)
          }
        }
        for (const z of season.zeroAppearances ?? []) if (myTeamIdsEver.has(z.teamId)) protectedIds.add(z.playerId)
      }
      const isWorthKeeping = (p: Player) =>
        p.wasPlayerTeam === true
        || p.isMyPlayer === true
        || protectedIds.has(p.id)
        || p.career.segmentWins > 0
        || p.draftRound != null
      const removedPlayers: Record<string, [string, Nationality]> = { ...(state.removedPlayers ?? {}) }
      const dropPlayer = (p: Player): Player[] => {
        removedPlayers[p.id] = [p.name, p.nationality]
        return []
      }
      const cleanedPlayers = crossTx.players
        // 今season自チームに居た選手には在籍歴の印を付ける（以後の整理で絶対に消えない）
        .map(p => (p.teamId === state.playerTeamId && p.wasPlayerTeam !== true ? { ...p, wasPlayerTeam: true } : p))
        .flatMap((p): Player[] => {
          // 海外クラブの名簿から溢れた選手
          if (foreignDropIds.has(p.id)) {
            return isWorthKeeping(p) ? [leanRetired(p)] : dropPlayer(p)
          }
          if (p.status === 'retired') return isWorthKeeping(p) ? [leanRetired(p)] : dropPlayer(p)
          if (p.status === 'active' && p.teamId === '') {
            const since = p.faSinceYear ?? state.currentSeason.year
            if (newYear - since >= 2) {
              return isWorthKeeping(p)
                ? [leanRetired(p, since)]
                : dropPlayer(p)
            }
            return [{ ...p, faSinceYear: since }]
          }
          return [p.faSinceYear != null ? { ...p, faSinceYear: undefined } : p]
        })

      // 自チームから居なくなった選手の退団通知（契約満了のFA流出・他クラブへの移籍）。
      // ロスターから黙って消えるのを防ぐ。引退は別途セレモニー・ニュースがあるため除外
      const departureClubName = (teamId: string) =>
        findClub(state.teams, cappedForeignLeagues, teamId)?.shortName
        ?? null
      const departureNotices = state.players
        .filter(p => p.teamId === state.playerTeamId && p.status !== 'retired')
        .flatMap((oldP): { id: string; playerId: string; playerName: string; toTeamName: string; reason: 'transfer' | 'fa' }[] => {
          const now = cleanedPlayers.find(p => p.id === oldP.id)
          if (!now || now.status === 'retired' || now.teamId === state.playerTeamId) return []
          const to = now.teamId === '' ? null : departureClubName(now.teamId)
          return [{ id: `dep-${oldP.id}-${newYear}`, playerId: oldP.id, playerName: oldP.name, toTeamName: to ?? '', reason: to ? 'transfer' : 'fa' }]
        })
      // 退団（FA流出・移籍）を移籍履歴にも記録する（移籍ページの「出」に日付付きで出るように）
      const departureRecords: TransferRecord[] = departureNotices.map(n => {
        const now = cleanedPlayers.find(p => p.id === n.playerId)
        return { year: newYear, date: `${state.currentSeason.year}-11-05`, playerId: n.playerId, fromTeamId: state.playerTeamId, toTeamId: now?.teamId ?? '', fee: 0, kind: 'free' as const }
      })

      // 海外クラブ在籍で今季出場ゼロの選手にも0戦のエントリを埋めて保存する。
      // 在籍履歴（選手詳細）は出場記録から行を作るため、これが無いと出なかった年の所属が消える
      const archivedForeignApps = { ...(state.currentSeason.foreignAppearances ?? {}) }
      {
        const foreignClubIds = foreignClubIdSet(state.foreignLeagues)
        for (const p of state.players) {
          if (!foreignClubIds.has(p.teamId)) continue
          if (!archivedForeignApps[p.id]) archivedForeignApps[p.id] = { clubId: p.teamId, races: 0, wins: 0 }
        }
      }
      // 過去シーズンの海外リーグ順位表は「合計ポイント」しか読まれない（チーム詳細の歴代成績・
      // リーグ優勝回数）。1戦ごとの結果は今季ぶんだけ（直近フォーム・消化数）なので保存時に落とす。
      // セーブ容量の節約：1シーズンあたり約120KB
      const archivedForeignStandings = Object.fromEntries(
        Object.entries(state.currentSeason.foreignStandings ?? {})
          .map(([lid, st]) => [lid, st.map(s2 => ({ teamId: s2.teamId, totalPoints: s2.totalPoints, raceResults: [] }))]),
      )
      // 国内も同様：今季1度も出走しなかった在籍選手の所属を記録して保存（在籍履歴の空白防止）
      const appearedIds = new Set<string>()
      for (const race of [...state.currentSeason.races, ...(state.currentSeason.secondTeamRaces ?? [])]) {
        if (!race.results) continue
        for (const sr of race.results.segmentResults) for (const r of sr.runners) appearedIds.add(r.playerId)
      }
      const domesticTeamIds = domesticTeamIdSet_(state.teams)
      const zeroAppearances = state.players
        .filter(p => p.status === 'active' && domesticTeamIds.has(p.teamId) && !appearedIds.has(p.id))
        .map(p => ({ playerId: p.id, teamId: p.teamId }))

      // 国内チームの名簿もteamId起点で毎年完全に同期する（海外クラブと同じ自動修復）。
      // 契約満了のFA化（teamId=''）や長期整理での選手削除がroster配列に残存し、
      // 「名簿に居るのにteamIdが違う/存在しない」不整合になるのを根治する
      // レンタル中（loanあり）の選手は名簿外が正規仕様（teamId=借り手だが借り手の名簿には載せない）
      const syncedTeams0 = crossTx.teams

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
        transferHistory: [...(state.transferHistory ?? []), ...departureRecords, ...foreignTx.records, ...crossTx.records].slice(-800),
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
              players: foreignTx.players })
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
            ...crossTx.news,
            ...foreignTx.news,
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
  ...createEconomySlice(set, get),


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
  },
})
