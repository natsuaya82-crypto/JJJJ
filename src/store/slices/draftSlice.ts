// draft ドメインのアクション（gameStore から分割）。

import type { DraftState, GameStore, SetGame } from '../gameStore'
import { playRateOf, prevSeasonOf } from '../../utils/playRate'
import { tradeValueCtxOf } from '../marketOps'
import { draftPickValue } from '../../data/economy'
import { SEASON_2027_RACES, generateIndividualEvents } from '../../data/races'
import { ROSTER_MAX, rosterCapOf, teamRosterSize } from '../../data/rosterRules'
import { pickCpuFreeAgents } from '../../engine/cpuMarket'
import { CPU_TICK_TRANSFERS, runCpuLoans, runCpuReleases, runCpuTrades } from '../../engine/cpuOffseason'
import { runTransferMarket } from '../../engine/transferMarket'
import { draftLotteryOrder, draftOrderTeams, pickExistsAnywhere, standingsPickNumbers } from '../../engine/draftOrder'
import { buildDraftOrder, generateCpuRosters, generateDraftPool, generateForeignLeaguePlayers, generateJpelForeignName, generatePlayerInitialRoster } from '../../engine/playerGenerator'
import { type ForeignClub, type Player, type Team, type TransferRecord, type WorldClub } from '../../types'
import { tierBudget, tierOf, tierOfPlayerClub } from '../../utils/clubTier'
import { clubById, clubsWhere, isJpelLeague, jpelClubs, mapClubs, myClub, otherClubs, withMyClub, myLeagueId, myLeagueRaces, withLeagueRaces } from '../../utils/world'
import { findClub } from '../../utils/clubs'
import { draftPickHolders, draftRoundOf, joinsDraft } from '../../utils/league'
import { holdsDraftPicks } from '../../data/leagueRules'
import { movePlayer } from '../../utils/movePlayer'
import { payBetween } from '../../utils/clubMoney'
import { cpuSignedHeadline, draftPickSoldHeadline, initialNews, type NewsItem } from '../../utils/newsItems'
import { faMarketSalary, ovr, playerConsentToMove, newContractYears } from '../../utils/playerUtils'
import { SPECIALTIES } from '../../utils/squadNeeds'
import { teamHistoriesOf } from '../../utils/teamHistory'

type Slice = Pick<GameStore,
  'beginInauguralDraft' | 'playerPick' | 'cpuPick' | 'advanceDraft' | 'setDraftContract' | 'scoutDraftProspect' | 'initScoutPool' | 'generateDevProspects' | 'scoutDevProspect' | 'signDevProspect' | 'ensureFuturePicks' | 'sellDraftPick' | 'beginSeasonDraft'>

export const createDraftSlice = (set: SetGame, get: () => GameStore): Slice => ({

  beginInauguralDraft: () => {
    const state = get()
    const pool = generateDraftPool(state.currentSeason.year, new Set(state.players.map(pl => pl.name)))
    // 初年度は前シーズンが無いので「初期予算の逆順（貧乏なチームから）」で指名順を決める。
    // 2巡目はスネークで逆順（1位から）。
    //
    // ★指名できるのは1部のクラブだけ（utils/league の joinsDraft）。
    //   プレイヤーはどのクラブを選んでも3部から始まるので、初年度は必ず観戦になる。
    //   代わりに選手を1人自分で作って加入させる（createMyPlayer）。
    //   指名されなかった候補はFAになるので、2部・3部はそこから拾う。
    const inauguralRound1 = clubsWhere(state.clubs, joinsDraft)
      .sort((a, b) => tierBudget(a) - tierBudget(b))
      .map(t => t.id)
    const pickOrder = [...inauguralRound1, ...[...inauguralRound1].reverse()]
    const draftState: DraftState = {
      pool,
      pickOrder,
      currentPick: 0,
      picks: [],
      isComplete: false }

    // Pre-populate AI team rosters and player team initial roster
    const { cpuPlayers } = generateCpuRosters(
      otherClubs(jpelClubs(state.clubs), state.playerTeamId),
      state.currentSeason.year,
    )
    // 自チームの初期ロスターも「格」から作る。CPU・海外と同じ tierRankComposition を通るので、
    // 3部のクラブを選べば3部相当の顔ぶれで始まる（前はどのクラブでも同じ固定の強さだった）
    const myTeamForRoster = myClub(state)
    const { players: prPlayers } = generatePlayerInitialRoster(state.currentSeason.year, tierOf(myTeamForRoster))
    const prPlayersWithTeam = prPlayers.map(p => ({ ...p, teamId: state.playerTeamId }))

    const seededClubs = withMyClub(state, t => ({
      ...t,
      // 最弱スタート：予算はそのクラブの格ぶん、施設は0から自分で建てる
      facilities: {},
      finance: { ...t.finance, budget: tierBudget(t) } }))

    // Generate foreign league players
    // 海外のクラブ（日本のリーグでないクラブ）。並びの順に作る＝乱数を引く順
    const { players: foreignPlayers } = generateForeignLeaguePlayers(
      clubsWhere(state.clubs, c => !isJpelLeague(c.leagueId)) as ForeignClub[],
      state.currentSeason.year,
    )

    // startSetup で teamId を付与した BASE_PLAYERS を除外し、prPlayersWithTeam に置き換える
    const players = [
      ...state.players.filter(p => p.teamId !== state.playerTeamId),
      ...cpuPlayers, ...pool, ...foreignPlayers, ...prPlayersWithTeam,
    ]
    // 最初の名簿は人数が多いので1人ずつ通さず、所属から一気に組み直す。
    // 決まり（引退とレンタル中は載せない）は movePlayer と同じ1つなのでズレない
    set({ draftState, players, clubs: seededClubs })
  },


  playerPick: (playerId) => {
    const state = get()
    if (!state.draftState) return
    const { draftState, playerTeamId } = state
    const { currentPick, pool, pickOrder, picks } = draftState

    // 連打・二重指名ガード：今が自チームの指名番でなければ無視（CPU番の横取り防止）
    if (currentPick >= pickOrder.length) return
    if (pickOrder[currentPick] !== playerTeamId) return

    const player = pool.find(p => p.id === playerId)
    if (!player) return

    const newPicks = [...picks, { pickNumber: currentPick + 1, teamId: playerTeamId, playerId, playerName: player.name }]
    const newPool = pool.filter(p => p.id !== playerId)

    // ドラフトも入手経路が違うだけで「クラブに入る」は同じなので movePlayer を通す。
    // ★契約（新人契約はドラフト候補を作るときに決まっている）を渡すこと。渡さないと movePlayer が
    //   「加入したときの契約」の印（signedOnJoin）を付けず、移籍ロックが効かない
    const moved = movePlayer(state, playerId, playerTeamId, { year: state.currentSeason.year, history: false, contract: {} })
    if (!moved.ok) return
    const clubs = moved.clubs
    const players = moved.players.map(p => p.id === playerId
      ? { ...p, ...(({ round, pickInRound }) => ({ draftRound: round, draftPick: pickInRound }))(draftRoundOf(currentPick, pickOrder.length)) }
      : p)

    const nextPick = currentPick + 1
    const isComplete = nextPick >= pickOrder.length

    set({
      draftState: { ...draftState, pool: newPool, picks: newPicks, currentPick: nextPick, isComplete },
      clubs,
      players })
  },


  cpuPick: () => {
    const state = get()
    if (!state.draftState) return
    const { draftState } = state
    const { currentPick, pool, pickOrder, picks } = draftState
    if (currentPick >= pickOrder.length || pool.length === 0) return

    const teamId = pickOrder[currentPick]
    const team = clubById(state.clubs, teamId)
    if (!team) return

    // ★**在籍上限に届いているクラブは指名を見送る**（2026-09-15）。
    //   上限の数え方は `rosterRules` の `rosterCapOf` 1本（他所で 30 と書かないこと）。
    //
    //   ここには上限の確かめが**1つもありませんでした**。枠は「ドラフトで入る人数ぶんを
    //   先に差し引いておく」（`rosterCapFor` ＝ 30 − 保有指名権数）で空けているつもりでしたが、
    //   それは**市場が買うのを止めるだけ**で、すでに 30 − 指名権数 を超えているクラブを
    //   減らしはしません。指名権はトレードで集められるので、28人のクラブが4枚持っていると
    //   そのまま32人になります。実測（世界を10年）で上限超えが0 → 20クラブ、最多37人。
    //
    //   見送ったぶんは**プールに残って次のクラブへ回り**、最後まで残れば `advanceDraft` が
    //   FAへ流します（「指名漏れはFAへ」と同じ道）。指名の順番だけ進めること——
    //   進めないと会場が止まります。
    if (teamRosterSize(state.players, teamId) >= rosterCapOf(0)) {
      const skipped = currentPick + 1
      set({ draftState: { ...draftState, currentPick: skipped, isComplete: skipped >= pickOrder.length } })
      return
    }

    // 外国人枠は廃止したので国籍による指名制限は無い（誰でも指名できる）
    const scored = pool.map(p => {
      return { p, score: ovr(p) * (0.97 + Math.random() * 0.06) }
    })
    scored.sort((a, b) => b.score - a.score)
    const picked = scored[0].p

    const newPicks = [...picks, { pickNumber: currentPick + 1, teamId, playerId: picked.id, playerName: picked.name }]
    const newPool = pool.filter(p => p.id !== picked.id)
    // 自チームの指名と同じ入口を通す（加入年・名簿・移籍ロックの印が指名する側で変わらないように）。
    // ★以前はここだけ契約を渡しておらず、CPUが指名した新人には移籍ロックが付かなかった（2026-09-26）
    const moved = movePlayer(state, picked.id, teamId, { year: state.currentSeason.year, history: false, contract: {} })
    // ★**指名の順番だけは必ず進めること。** ここは何もせず抜けていたので、
    //   `movePlayer` が失敗すると `DraftRoom` のタイマーが同じ指名を呼び続けて
    //   **会場が止まります**（22行上の「見送り」の枝はちゃんと進めているのに、
    //   その直下のここだけ取り残されていた）。見送りと同じく順番を進めて次へ回す。
    if (!moved.ok) {
      const skipped = currentPick + 1
      set({ draftState: { ...draftState, currentPick: skipped, isComplete: skipped >= pickOrder.length } })
      return
    }
    const clubs = moved.clubs
    const players = moved.players.map(p => p.id === picked.id
      ? { ...p, ...(({ round, pickInRound }) => ({ draftRound: round, draftPick: pickInRound }))(draftRoundOf(currentPick, pickOrder.length)) }
      : p)
    const nextPick = currentPick + 1
    const isComplete = nextPick >= pickOrder.length

    set({
      draftState: { ...draftState, pool: newPool, picks: newPicks, currentPick: nextPick, isComplete },
      clubs,
      players })
  },


  advanceDraft: () => {
    const state = get()
    if (state.draftState?.isComplete) {
      // Undrafted players become free agents.
      // Check both status field AND draftState.pool membership for robustness.
      const remainingPoolIds = new Set((state.draftState.pool ?? []).map(p => p.id))
      const undraftedIds = state.players
        .filter(p => (remainingPoolIds.has(p.id)
          || (p.status === 'draft_eligible' && (p.teamId === '' || p.teamId === '__pool__')))
          && p.teamId !== state.playerTeamId)
        .map(p => p.id)
      // 未指名は無所属(FA)になるだけ。放出と同じ扱いなので同じ入口を通す
      let undraftedApplied: Player[] = state.players
      for (const id of undraftedIds) {
        const m = movePlayer({ players: undraftedApplied, clubs: [] }, id, '', { year: state.currentSeason.year })
        if (m.ok) undraftedApplied = m.players
      }
      const undraftedSet = new Set(undraftedIds)
      let updatedPlayers = undraftedApplied.map(p =>
        undraftedSet.has(p.id) && p.status === 'draft_eligible' ? { ...p, status: 'active' as const } : p)

      // ★指名漏れが出たこのタイミングで、CPUのFA補強をもう一度回す。
      //   FA補強は beginSeasonDraft（ドラフトの前）でしか走っていなかったので、
      //   指名されなかった候補は**丸1年FA市場に置き去り**になっていた。
      //   「指名されなかった候補はFAになるので、2部・3部はそこから拾う」（CLAUDE.md）が
      //   一度も起きていなかった。判断は pickCpuFreeAgents 1本（ドラフト前と同じ）
      {
        // ドラフトは終わっているので空けておく枠は無い。数え方は同じ rosterCapOf
        const postSignings = pickCpuFreeAgents({
          players: updatedPlayers, clubs: state.clubs,
          playerTeamId: state.playerTeamId, season: state.currentSeason,
          // 上限は `rosterCapOf` 1本（海外だけ `ROSTER_MAX` にする三項は、
          // `rosterCapOf(0) === ROSTER_MAX` なので**両側とも同じ数**の残骸だった）
          capFor: () => rosterCapOf(0),
          // ④本人が行くか。**ここだけ聞いていなかった**（ドラフト後の拾い直し）。
          // 同じFAでも、ドラフト前の一括処理では聞いていて、ここでは聞いていない
          // ＝経路で判断が割れている状態だった（A-9）
          consents: (fa, clubId) => {
            const { fraction, teamRaces } = playRateOf(fa.id, fa.teamId, state.currentSeason,
              state.clubs, prevSeasonOf(state.pastSeasons, state.currentSeason.year))
            return playerConsentToMove(fa, get().destinationOf(clubId, fa),
              tierOfPlayerClub(fa.teamId, state.clubs),
              fraction, teamRaces, 0, true, get().playerTierOf(fa)).ok
          } })
        for (const sg of postSignings) {
          const before = updatedPlayers.find(x => x.id === sg.playerId)
          if (!before) continue
          // ★**契約を結び直すこと。** 同じ「CPUのFA加入」は3か所（ドラフト前の一括処理・
          //   シーズン中の `engine/inSeasonFa`・ここ）あり、**ここだけ契約を触って**
          //   いませんでした。拾われた選手は前の契約（残0年・前クラブの年俸）のまま加入し、
          //   次のオフにまた満了でFAへ戻ります。年数は `newContractYears`、
          //   年俸は `faMarketSalary` 1本。
          const m = movePlayer({ players: updatedPlayers, clubs: [] }, sg.playerId, sg.clubId, {
            year: state.currentSeason.year, kind: 'free', history: false,
            contract: {
              yearsLeft: newContractYears(before, state.currentSeason.year),
              annualSalary: faMarketSalary(before),
              contractType: 'standard' } })
          if (m.ok) updatedPlayers = m.players
        }
      }
      // Generate future draft picks for all teams (yr+1, yr+2, rounds 1-2)
      // 指名権番号は前年順位の逆順（最下位＝全体1位）で振る。
      const currentYear = state.currentSeason.year
      // 指名権を持てるクラブ（utils/league の draftPickHolders）
      const holders = draftPickHolders(state.clubs)
      const pickNumMap = standingsPickNumbers(holders, teamHistoriesOf(state.pastSeasons))
      const clubsWithPicks = mapClubs(state.clubs, (c): WorldClub => {
        if (!holdsDraftPicks(c)) return c
        const t = c as Team
        const pickNum = pickNumMap.get(t.id) ?? 1
        const newPicks: typeof t.draftPicks = []
        for (const yr of [currentYear + 1, currentYear + 2]) {
          for (const round of [1, 2]) {
            if (!pickExistsAnywhere(holders, t.id, yr, round)) {
              newPicks.push({ year: yr, round, pickNumber: pickNum, originallyOwnedBy: t.id })
            }
          }
        }
        return newPicks.length > 0 ? { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] } : t
      })
      // ドラフト/オフの流れから来た時だけプレシーズンに戻す。
      // すでに開幕後なら巻き戻さない（保険）。
      const nextPhase = (state.currentSeason.phase === 'regular' || state.currentSeason.phase === 'postseason')
        ? state.currentSeason.phase : 'preseason'
      set({
        isInitialized: true,
        players: updatedPlayers,
        clubs: clubsWithPicks,
        draftState: { ...state.draftState, contractsDone: true },
        currentSeason: {
          // 自チームのリーグの日程が空なら既定の10戦で埋める（日程を引く前のセーブの保険）
          ...(myLeagueRaces(state.currentSeason, state.playerTeamId).length > 0 ? state.currentSeason
            : withLeagueRaces(state.currentSeason, myLeagueId(state.currentSeason, state.playerTeamId), SEASON_2027_RACES)),
          phase: nextPhase,
          individualEvents: (state.currentSeason.individualEvents ?? []).length > 0 ? state.currentSeason.individualEvents : generateIndividualEvents(state.currentSeason.year),
          newsFeed: (state.currentSeason.newsFeed ?? []).length > 0 ? state.currentSeason.newsFeed : initialNews() } })
    }
  },


  generateDevProspects: () => {
    set(state => {
      if ((state.currentSeason.devProspects ?? []).length > 0) return state
      const NAMES = ['村上 蒼', '橋本 颯', '田中 悠馬', '小林 煌', '中村 海斗', '伊藤 涼', '山田 蓮', '佐藤 翔', '加藤 健', '鈴木 碧', '松本 楓', '渡辺 律', '井上 光', '木村 颯太', '高橋 凌', '石川 仁', '林 優斗', '近藤 葵', '前田 空', '岡田 風']
      const CITIES = ['東京', '神奈川', '大阪', '愛知', '福岡', '北海道', '宮城', '広島', '静岡', '千葉']
      const SPECS = SPECIALTIES
      const usedForeignNames = new Set<string>()
      const prospects: import('../../types').DevProspect[] = Array.from({ length: 12 }, (_, i) => {
        const potential = 50 + Math.floor(Math.random() * 45)
        const base = 40 + Math.floor(Math.random() * 30)
        // 15%は外国人。国籍だけ「外国」ではなく、実際の国籍・出身国・現地名を持たせる
        const foreign = Math.random() < 0.15 ? generateJpelForeignName(usedForeignNames) : null
        return {
          id: `dev_${state.currentSeason.year}_${i}`,
          name: foreign ? foreign.name : NAMES[i % NAMES.length],
          age: 18 + Math.floor(Math.random() * 4),
          origin: foreign ? foreign.origin : CITIES[Math.floor(Math.random() * CITIES.length)],
          nationality: foreign ? foreign.nat : 'JPN',
          specialty: SPECS[Math.floor(Math.random() * SPECS.length)],
          potential,
          trueRatings: {
            speed: base + Math.floor(Math.random() * 20),
            stamina: base + Math.floor(Math.random() * 20),
            mountainUp: base + Math.floor(Math.random() * 20),
            mountainDown: base + Math.floor(Math.random() * 20),
            pacing: base + Math.floor(Math.random() * 20),
            mental: base + Math.floor(Math.random() * 20),
            recovery: base + Math.floor(Math.random() * 20) },
          signingFee: (20 + Math.floor(Math.random() * 60)) * 1000000,
          scouted: false }
      })
      return { currentSeason: { ...state.currentSeason, devProspects: prospects } }
    })
  },


  scoutDevProspect: (prospectId) => {
    set(state => {
      const pts = state.currentSeason.scoutPoints ?? 0
      if (pts < 1) return state
      return {
        currentSeason: {
          ...state.currentSeason,
          scoutPoints: pts - 1,
          devProspects: (state.currentSeason.devProspects ?? []).map(p =>
            p.id === prospectId ? { ...p, scouted: true } : p
          ) } }
    })
  },


  signDevProspect: (prospectId) => {
    set(state => {
      const team = myClub(state)
      if (!team) return state
      const prospect = (state.currentSeason.devProspects ?? []).find(p => p.id === prospectId)
      if (!prospect) return state
      if ((team.finance?.budget ?? 0) < prospect.signingFee) return state
      // 2軍の区分は廃止済み。人数は総在籍(ROSTER_MAX)で見る
      if (teamRosterSize(state.players, team.id) >= ROSTER_MAX) return state


      const newPlayer: import('../../types').Player = {
        id: prospect.id,
        name: prospect.name,
        nameKana: '',
        age: prospect.age,
        yearsPro: 0,
        draftYear: state.currentSeason.year,
        draftRound: null,
        draftPick: null,
        ratings: { ...prospect.trueRatings },
        specialty: prospect.specialty,
        potential: prospect.potential,
        growthCurve: 'normal',
        // 所属はこのあと movePlayer で入れる（名簿と支度金の後始末をまとめて任せるため）
        teamId: '',
        joinedYear: state.currentSeason.year,
        // 契約は movePlayer に渡す（年数は newContractYears 1本＝若いほど長い。加入の契約なので移籍ロックも付く）。
        // 以前は `yearsLeft: 2` の固定で、movePlayer に契約を渡さないのでロックも付かなかった（オーナー・2026-09-26「2」）
        contract: {
          yearsLeft: 0,
          annualSalary: 15000000,
          faEligibleYear: state.currentSeason.year + 2,
          contractType: 'development' },
        nationality: prospect.nationality,
        origin: prospect.origin,

        status: 'active',
        fatigue: 0,
        morale: 70,
        form: 0,
        career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 } }

      // 名簿入りと支度金の引き落としは movePlayer に任せる（獲得・移籍と同じ後始末）。
      // 移籍ではないので履歴には残さない
      const moved = movePlayer(
        { players: [...state.players, newPlayer], clubs: state.clubs },
        newPlayer.id, state.playerTeamId,
        { year: state.currentSeason.year, fee: prospect.signingFee, history: false,
          contract: { yearsLeft: newContractYears(newPlayer, state.currentSeason.year) } },
      )
      if (!moved.ok) return state
      return {
        players: moved.players,
        clubs: moved.clubs,
        currentSeason: {
          ...state.currentSeason,
          devProspects: (state.currentSeason.devProspects ?? []).filter(p => p.id !== prospectId) } }
    })
  },


  scoutDraftProspect: (prospectId) => {
    set(state => {
      if (state.currentSeason.scoutPoints <= 0) return state
      const already = (state.currentSeason.scoutedProspects ?? []).some(s => s.prospectId === prospectId)
      if (already) return state
      return {
        currentSeason: {
          ...state.currentSeason,
          scoutPoints: state.currentSeason.scoutPoints - 1,
          scoutedProspects: [
            ...(state.currentSeason.scoutedProspects ?? []),
            { prospectId, year: state.currentSeason.year, raceIndex: state.currentSeason.currentRaceIndex },
          ] } }
    })
  },


  initScoutPool: () => {
    set(state => {
      const cur = state.currentSeason.scoutProspects ?? []
      // 加入済み（players に居る）候補を除去。残りがあればそれを維持し、空になったら翌年のドラフト候補を新規生成。
      // （既存セーブで候補が加入者で埋まり、翌年候補が出てこないのを解消）
      const remaining = cur.filter(p => !state.players.some(pl => pl.id === p.id))
      if (remaining.length > 0) {
        return remaining.length === cur.length
          ? state
          : { currentSeason: { ...state.currentSeason, scoutProspects: remaining } }
      }
      const pool = generateDraftPool(state.currentSeason.year + 1, new Set(state.players.map(pl => pl.name)))
      return { currentSeason: { ...state.currentSeason, scoutProspects: pool } }
    })
  },


  setDraftContract: (playerId, salary, years, contractType, teamRole) => {
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      if (!player || player.teamId !== state.playerTeamId) return state
      return {
        players: state.players.map(p => p.id === playerId ? {
          ...p,
          teamRole: teamRole ?? p.teamRole,
          // rookieDeal: ドラフト初回契約は相場の半分まで下げられるが、次の更新では相場基準の要求になる
          // ドラフトの初回契約も「加入したときの契約」＝その間は動かせない（レンタルは通る）。
          // 印（signedOnJoin）は指名のときに movePlayer が付けている（契約を渡しているので）。
          // ここで書き足さないこと（印を付けるのは movePlayer 1本）
          contract: { ...p.contract, annualSalary: salary, yearsLeft: years, contractType, rookieDeal: true } } : p),
        // 名簿はここで並べ替えない。所属から組み直す決まりに任せる（指名の時点で入っている）
      }
    })
  },


  sellDraftPick: (pickKey, targetTeamId, price) => {
    const state = get()
    const myTeam = myClub(state)
    // 指名権を買えるのは指名権を持てるクラブ（data/leagueRules の holdsDraftPicks。画面の買い手の一覧と同じ）
    const buyTeam = clubById(draftPickHolders(state.clubs), targetTeamId)
    if (!myTeam || !buyTeam) return false
    const pick = (myTeam.draftPicks ?? []).find(p => `${p.year}-R${p.round}-${p.pickNumber}` === pickKey)
    if (!pick) return false
    const fairVal = draftPickValue(pick.round, pick.pickNumber)
    if (price > fairVal * 1.3) return false
    if (buyTeam.finance.budget < price) return false  // 買い手が払えない額では成立しない
    const date = myLeagueRaces(state.currentSeason, state.playerTeamId)[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`
    set(s => ({
      // 指名権は同一性で動かす（同じキーの札が2枚あっても、見つけた1枚だけ）。お金は payBetween 1本
      clubs: payBetween(mapClubs(s.clubs, (c): WorldClub => {
        if (!holdsDraftPicks(c)) return c
        const t = c as Team
        if (t.id === s.playerTeamId) return { ...t, draftPicks: t.draftPicks.filter(p => p !== pick) }
        if (t.id === targetTeamId) return { ...t, draftPicks: [...t.draftPicks, pick] }
        return t
      }), targetTeamId, s.playerTeamId, price),
      currentSeason: {
        ...s.currentSeason,
        transferIncome: (s.currentSeason.transferIncome ?? 0) + price,
        newsFeed: [{
          date,
          headline: draftPickSoldHeadline({ fromShort: myTeam.shortName, toShort: buyTeam.shortName, year: pick.year, round: pick.round, price }),
          category: 'trade' as const,
          relatedIds: [] }, ...s.currentSeason.newsFeed].slice(0, 30) } }))
    return true
  },


  ensureFuturePicks: () => {
    const state = get()
    const yr = state.currentSeason.year
    // 指名権を持てるクラブ（utils/league の draftPickHolders）
    const holders = draftPickHolders(state.clubs)
    const anyMissingPicks = holders.some(t =>
      !(t.draftPicks ?? []).some(pk => pk.year > yr)
    )
    if (!anyMissingPicks) return
    // 指名権番号は前年順位の逆順（最下位＝全体1位）で振る。
    const pickNumMap = standingsPickNumbers(holders, teamHistoriesOf(state.pastSeasons))
    const updatedClubs = mapClubs(state.clubs, (c): WorldClub => {
      if (!holdsDraftPicks(c)) return c
      const t = c as Team
      const newPicks: typeof t.draftPicks = []
      for (const year of [yr + 1, yr + 2]) {
        for (const round of [1, 2]) {
          if (!pickExistsAnywhere(holders, t.id, year, round)) {
            newPicks.push({ year, round, pickNumber: pickNumMap.get(t.id) ?? 1, originallyOwnedBy: t.id })
          }
        }
      }
      return newPicks.length > 0 ? { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] } : t
    })
    set({ clubs: updatedClubs })
  },

  beginSeasonDraft: () => {
    const state = get()
    // 二度押し/再入ガード：ドラフト進行中に再度呼ばれてもプール選手をID二重登録しない。
    if (state.draftState && !state.draftState.isComplete) return
    // スカウト画面で見せた候補（scoutProspects）をそのままドラフトプールにする。
    // 空のとき（旧セーブ等）だけ従来通り新規生成にフォールバック。
    const scouted = state.currentSeason.scoutProspects ?? []
    const pool = scouted.length > 0 ? scouted : generateDraftPool(state.currentSeason.year, new Set(state.players.map(pl => pl.name)))
    const yr = state.currentSeason.year

    // ドラフト順は「当年分の指名権の所有」で決める：指名スロットの並びは各指名権の
    // 【元保有チームの抽選順】で決まり、現在の保有チームがそこで指名する。
    // 2年目以降は前年下位5チームの加重抽選で1巡目の順を決定。2巡目はスネーク（逆順＝1位から）。
    // 指名権を持てるクラブ（utils/league の draftPickHolders）
    const holders = draftPickHolders(state.clubs)
    const lotteryPos = draftLotteryOrder(holders, teamHistoriesOf(state.pastSeasons)) // teamId → 全体指名順位(1=全体1位)
    const teamCount = holders.length
    const ownedYearPicks = holders
      .flatMap(t => (t.draftPicks ?? []).filter(pk => pk.year === yr).map(pk => {
        const basePos = lotteryPos.get(pk.originallyOwnedBy ?? t.id) ?? pk.pickNumber
        // 2巡目はスネーク：1巡目の逆順にする（最後に指名したチームが2巡目の先頭）
        const orderKey = pk.round === 2 ? teamCount + 1 - basePos : basePos
        return { round: pk.round, orderKey, ownerId: t.id }
      }))
      .sort((a, b) => a.round - b.round || a.orderKey - b.orderKey)
    // 指名するのは1部のクラブだけ（joinsDraft）。指名権を持っていても、
    // その年に1部にいなければ使えない
    const draftTeams = clubsWhere(holders, t => joinsDraft(t))
    const draftTeamIds = new Set(draftTeams.map(t => t.id))
    const yearPicksInTop = ownedYearPicks.filter(pk => draftTeamIds.has(pk.ownerId))
    const pickOrder = yearPicksInTop.length >= draftTeams.length
      ? yearPicksInTop.map(pk => pk.ownerId)
      : buildDraftOrder(draftOrderTeams(draftTeams, state.pastSeasons), state.currentSeason.year, state.playerTeamId)

    // Ensure all teams have future draft picks (backfill for existing saves)
    // 消化した当年分の指名権はここで名簿から外す（順は上のpickOrderに確定済み）
    // 指名権番号は前年順位の逆順（最下位＝全体1位）。既存の将来指名権も"元保有チームの順位"で振り直し、
    // 初回に配列順で焼き込まれた古い番号を都度上書きして正す（表示と実際の指名順を一致させる）。
    const pickNumMap = standingsPickNumbers(holders, teamHistoriesOf(state.pastSeasons))
    const clubsWithPicks = mapClubs(state.clubs, (c): WorldClub => {
      if (!holdsDraftPicks(c)) return c
      const t = c as Team
      const newPicks: typeof t.draftPicks = []
      for (const year of [yr + 1, yr + 2]) {
        for (const round of [1, 2]) {
          if (!pickExistsAnywhere(holders, t.id, year, round)) {
            newPicks.push({ year, round, pickNumber: pickNumMap.get(t.id) ?? 1, originallyOwnedBy: t.id })
          }
        }
      }
      const keptFuture = (t.draftPicks ?? []).filter(pk => pk.year > yr)
        .map(pk => ({ ...pk, pickNumber: pickNumMap.get(pk.originallyOwnedBy ?? t.id) ?? pk.pickNumber }))
      return { ...t, draftPicks: [...keptFuture, ...newPicks] }
    })

    // 今年のドラフトで各チームに入る人数（保有指名権数）。総在籍30の上限は
    // ドラフト加入分を先に差し引いておき、ドラフト後に30を超えないようにする（32人問題の修正）
    const draftPickCounts = new Map<string, number>()
    for (const tid of pickOrder) draftPickCounts.set(tid, (draftPickCounts.get(tid) ?? 0) + 1)
    // 上限の数え方は rosterRules の rosterCapOf 1本（未消化の指名権ぶんを空けておく）
    const rosterCapFor = (teamId: string) => rosterCapOf(draftPickCounts.get(teamId) ?? 0)

    // ①CPUの解雇（余剰をFAへ）。中身は engine/cpuOffseason の runCpuReleases 1本。
    // ★**国内52＋海外180を同じ列で回します**（オーナー・2026-09-16「全部海外も全部1本」）。
    //   以前は「対象は国内リーグのCPUチームのみ（ロスター概念の無い海外側との取引で
    //   国内名簿が壊れる）」と書いて国内だけに絞っていましたが、その前提はもうありません
    //   ——海外クラブの上限も同じ `ROSTER_MAX` で、この数行下にもそう書いてあります。
    //   海外は `engine/savePruning` の中で**別の線・別の出口**で切られていたので、
    //   そちらは消しました（同じ問いに2実装を残さない）。
    const releasedWorld = runCpuReleases(
      { players: state.players, clubs: clubsWithPicks },
      { playerTeamId: state.playerTeamId, year: yr, rosterCapFor })
    const playersAfterCpuRelease = releasedWorld.players
    const clubsAfterCpuRelease = releasedWorld.clubs

    // ②移籍市場（メイン）：**経路は engine/transferMarket.ts の1本だけ**。
    // 国内52クラブと海外180クラブが同じ1つの市場に並ぶ（国内CPU間・海外↔海外・
    // 日本↔海外という区別は無い。違うのはリーグだけ）。
    // ★解雇のあとに回すこと。在籍25人のままでは買う枠が無い
    const offseasonTxRecords: TransferRecord[] = []   // チーム詳細の移籍ページ用
    // オフの市場の動きをニュースに出す。「1部の控えが下位クラブへ」「若手がレンタルで
    // 走りに出る」が見えないと、市場が効いているかを確かめられない
    const offseasonTxNews: NewsItem[] = []
    const cpuTransferIds = new Set<string>()
    let playersAfterCpuTransfer = playersAfterCpuRelease
    let clubsAfterCpuTransfer = clubsAfterCpuRelease
    {
      const bought = runTransferMarket(
        { players: playersAfterCpuRelease, clubs: clubsAfterCpuRelease },
        { playerTeamId: state.playerTeamId, year: state.currentSeason.year,
          // ★**走り終わったシーズン**を渡す。この時点の currentSeason は来季の空っぽの器で、
          //   それを渡すと全員が「出場0」になり移籍金も年俸も一律に潰れる
          season: state.pastSeasons[state.pastSeasons.length - 1] ?? state.currentSeason,
          pastSeasons: state.pastSeasons.slice(0, -1),
          // 上限は `rosterCapFor` 1本。指名権を持たないクラブ（海外）は `rosterCapOf(0)`＝`ROSTER_MAX`
          rosterCapFor,
          destinationOf: get().destinationOf, excludeIds: cpuTransferIds,
          // ★**ここも「ただの1回」**。オフシーズンという考えは無いので、
          //   レース中の1回とまったく同じ件数にする（以前はここだけ上限なしで、
          //   実測 413件 対 39件 ＝ 年に一度だけ10倍の勢いだった）。
          //   日付は日程の空いている1〜2月（レースは 3/8〜12/27）
          maxMoves: CPU_TICK_TRANSFERS, date: `${state.currentSeason.year}-02-01` })
      playersAfterCpuTransfer = bought.players
      clubsAfterCpuTransfer = bought.clubs
      offseasonTxRecords.push(...bought.records)
      offseasonTxNews.push(...bought.news)
    }

    // ⑤ CPU間トレード（予算不足でも価値が近い選手同士を交換）。
    // 同じオフに移籍済みの選手（cpuTransferIds）は対象外＝移籍→トレードの連鎖を防ぐ。
    // 中身は engine/cpuOffseason.ts の runCpuTrades 1本（cpuTransferIds はその中で書き足される）
    {
      const traded = runCpuTrades(
        { players: playersAfterCpuTransfer, clubs: clubsAfterCpuTransfer },
        { playerTeamId: state.playerTeamId, year: state.currentSeason.year,
          tradeValueCtx: tradeValueCtxOf(state), excludeIds: cpuTransferIds,
          // ④本人の同意（現金の移籍と同じ入口）
          destinationOf: get().destinationOf,
          season: state.currentSeason, pastSeasons: state.pastSeasons })
      playersAfterCpuTransfer = traded.players
      clubsAfterCpuTransfer = traded.clubs
      offseasonTxRecords.push(...traded.records)
    }

    // ④ CPU間レンタル（出番の無い若手を、走らせてくれるクラブが借りる）。
    // 中身は engine/cpuOffseason の runCpuLoans 1本
    // （cpuTransferIds を渡すので、同じオフに移籍・トレードした選手は貸し出さない）
    {
      const loaned = runCpuLoans(
        { players: playersAfterCpuTransfer, clubs: clubsAfterCpuTransfer },
        { playerTeamId: state.playerTeamId, year: state.currentSeason.year, excludeIds: cpuTransferIds,
          // ④本人が行くか（レンタルの基準で）
          destinationOf: get().destinationOf })
      playersAfterCpuTransfer = loaned.players
      clubsAfterCpuTransfer = loaned.clubs
      offseasonTxNews.push(...loaned.news)
    }

    // FA補強（受け皿）：移籍市場で動けなかった選手・クラブの補完。判断は pickCpuFreeAgents 1本。
    // ★国内クラブと海外クラブをまとめて渡す。以前は海外だけ endSeason の中に別実装があり、
    //   「在籍20人を割ったクラブの救済」しか見ていなかった（必要かどうかを見ていない）。
    //   海外クラブのロスター上限も国内と同じ ROSTER_MAX
    // ★海外クラブは**市場を回す前の姿**（資金）で渡している（いまの振る舞い）。
    //   国内は市場・トレード・レンタルのあとの姿
    const clubsForFa = mapClubs(clubsAfterCpuTransfer, c =>
      isJpelLeague(c.leagueId) ? c : (clubById(state.clubs, c.id) ?? c))
    const cpuSignings = pickCpuFreeAgents({
      players: playersAfterCpuTransfer,
      clubs: clubsForFa,
      playerTeamId: state.playerTeamId, season: state.currentSeason,
      // 上限は `rosterCapFor` 1本。海外クラブはドラフトの指名権を持たないので
      // `rosterCapOf(0) === ROSTER_MAX` になり、**分けても答えは同じ**です
      // （「海外は別扱い」に見えるだけの三項を残すと、片方だけ動いたときに割れる）
      capFor: (id) => rosterCapFor(id),
      // ④本人が行くか（現金の移籍・トレードと同じ入口）。
      // 無所属は「クラブが無い」状態と較べるので基本は断らないが、
      // 憧れの地域と出番の良し悪しはここで効く
      consents: (fa, clubId) => {
        const { fraction, teamRaces } = playRateOf(fa.id, fa.teamId, state.currentSeason,
          state.clubs, prevSeasonOf(state.pastSeasons, state.currentSeason.year))
        return playerConsentToMove(fa, get().destinationOf(clubId, fa),
          tierOfPlayerClub(fa.teamId, state.clubs),
          fraction, teamRaces, 0, true, get().playerTierOf(fa)).ok
      } })
    const newYear = state.currentSeason.year
    // CPUのFA契約も movePlayer に通す（所属・名簿・加入年をまとめて。名簿に入れるので契約種別も本契約に揃える）
    let playersWithCpuSigns: Player[] = playersAfterCpuTransfer
    let clubsWithCpuSigns = clubsAfterCpuTransfer
    for (const sg of cpuSignings) {
      const before = playersWithCpuSigns.find(x => x.id === sg.playerId)
      if (!before) continue
      const m = movePlayer({ players: playersWithCpuSigns, clubs: clubsWithCpuSigns }, sg.playerId, sg.clubId, {
        year: newYear,
        date: `${newYear}-02-01`,
        kind: 'free',
        history: false,
        contract: { yearsLeft: newContractYears(before, state.currentSeason.year), annualSalary: faMarketSalary(before), contractType: 'standard' } })
      if (!m.ok) continue
      playersWithCpuSigns = m.players.map(p =>
        p.id !== sg.playerId ? p : { ...p, contract: { ...p.contract, faEligibleYear: newYear + 2 } })
      clubsWithCpuSigns = m.clubs
    }

    // ロスターは1つだけ。「2軍を15人まで埋める」数合わせのFA大量署名は廃止済み。
    // 総在籍24人（下限）まではメインの補強パス(Pass3)が保証する
    const playersWithAllCpuSigns = playersWithCpuSigns

    // ★海外クラブのFA補強は、もう上の pickCpuFreeAgents に入っている。
    //   ここに別実装（在籍20人を割ったクラブの救済／外国籍FAだけ）があったのを畳んだ。
    //   救済は「必要か」を見ていないので、必要でもないクラブが頭数だけ埋め、
    //   逆に必要としているクラブは20人居ると1人も獲れなかった。日本と海外で
    //   獲る理由が違う状態になっていたのがここ。
    const playersWithForeignSigns: Player[] = playersWithAllCpuSigns

    // FA契約の成立日をオフシーズン期間（1/12〜3/21）に分散させる（全員同日に5人契約のような不自然さを消す）
    const OFF_DAYS = ['01-12', '01-16', '01-21', '01-25', '01-30', '02-03', '02-07', '02-10', '02-14', '02-18', '02-21', '02-25', '03-01', '03-05', '03-09', '03-13', '03-17', '03-21']
    const offDate = (i: number) => `${newYear}-${OFF_DAYS[i % OFF_DAYS.length]}`
    const cpuSigningNewsItems = cpuSignings
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => {
        const p = playersAfterCpuTransfer.find(x => x.id === s.playerId)
        return p && ovr(p) >= 65
      })
      .slice(0, 10)
      .map(({ s, i }) => {
        const p = playersAfterCpuTransfer.find(x => x.id === s.playerId)!
        const team = findClub(clubsAfterCpuTransfer, s.clubId)
        return {
          date: offDate(i),
          headline: cpuSignedHeadline({ clubShort: team?.shortName ?? '', playerName: p.name, playerOvr: ovr(p) }),
          category: 'fa' as const,
          relatedIds: [p.id] }
      })

    // isInitialized は true のまま維持する。以前ここで false に落としていたため、
    // セーブ破壊ガード（進行中セーブの上に初期状態を書かない仕組み）が全ての保存を拒否し、
    // ドラフト中は一切セーブされず、落ちるとドラフト前まで巻き戻っていた。
    // ドラフト画面への遷移は App.tsx 側で draftState を見て判定する。
    set({
      draftState: { pool, pickOrder, currentPick: 0, picks: [], isComplete: false },
      players: [...playersWithForeignSigns, ...pool],
      // 市場で海外クラブの資金も動く（買えば減り、売れば増える）ので必ず書き戻す
      clubs: clubsWithCpuSigns,
      // 直近10シーズン分だけ残して古い移籍記録は捨てる
      transferHistory: [
        ...(state.transferHistory ?? []).filter(r => r.year >= newYear - 10),
        ...offseasonTxRecords,
        // 年数は実際に結んだ契約から（utils/movePlayer の years と同じ決まり。手書きの 2 は嘘になる）
        ...cpuSignings.flatMap((s, i) => {
          const signed = playersWithCpuSigns.find(x => x.id === s.playerId)
          if (!signed || signed.teamId !== s.clubId) return []
          return [{ year: newYear, date: offDate(i), playerId: s.playerId, fromTeamId: '', toTeamId: s.clubId, fee: 0, kind: 'free' as const, years: signed.contract.yearsLeft }]
        }),
      ].slice(-800),
      currentSeason: {
        ...state.currentSeason,
        newsFeed: [...offseasonTxNews, ...cpuSigningNewsItems, ...state.currentSeason.newsFeed].slice(0, 30) } })
  },
})
