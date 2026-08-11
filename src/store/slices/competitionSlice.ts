// competition ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
import { ACHIEVEMENT_JEWELS, podiumJewels } from '../../engine/achievements'
import { type EclParticipant, simulateEclEvent } from '../../engine/ecl'
import { buildEclParticipants, buildEclRaces } from '../../engine/eclSeries'
import { initForeignStandings, simulateForeignLeagueRound } from '../../engine/foreignLeague'
import { simulateCrossBorderTransfers, simulateForeignTransferMarket } from '../../engine/foreignTransfers'
import { type LoanResponse, type EclStanding, type ExpiredNegotiation, type GameState, type Player } from '../../types'
import { findClub } from '../../utils/clubs'
import { TOP_DIVISION, divisionStandings, rankedStandings } from '../../utils/league'
import { movePlayer } from '../../utils/movePlayer'
import { eclRaceHeadline, eclSeasonEndHeadline, segmentRecordHeadline } from '../../utils/newsItems'
import { keyPlayerStatus } from '../../utils/playerUtils'
import { belongsToClub } from '../../utils/rosterSync'
import { segmentRecordsOf } from '../../utils/segmentRecords'
import { resolveBid } from '../../utils/transferBid'

type Slice = Pick<GameStore,
  'advanceForeignLeagues' | 'runMidSeasonForeignTransfers' | 'advanceMarketOneRace' | 'advanceEclRace' | 'ensureEclSeries'>

export const createCompetitionSlice = (set: SetGame, get: () => GameStore): Slice => ({

  // 海外リーグを1マッチデー進める。本編レースの完走に同期して runRace 末尾から呼ばれる。
  // 本編と同じコース（races[foreignRaceIndex]）を各海外クラブが走り、順位表と選手の記録を積む。
  advanceForeignLeagues: () => set(state => {
    const leagues = state.foreignLeagues ?? []
    if (leagues.length === 0) return {}
    const races = state.currentSeason.races
    const idx = state.currentSeason.foreignRaceIndex ?? 0
    if (idx >= races.length) return {}
    const race = races[idx]
    if (!race) return {}
    const prevStandings = state.currentSeason.foreignStandings ?? initForeignStandings(leagues)
    const seasonProgress = races.length > 0 ? idx / races.length : 0
    const { standingsByLeague, players, appearances, raced } = simulateForeignLeagueRound(race, leagues, state.players, prevStandings, seasonProgress)
    // 走らせた結果をそのまま残す。捨てると区間タイムも順位も戻らない（utils/raceRecord.ts）
    const foreignRaces = { ...(state.currentSeason.foreignRaces ?? {}) }
    for (const [lid, r] of Object.entries(raced)) foreignRaces[lid] = [...(foreignRaces[lid] ?? []), r]
    // 今季の海外出場記録に加算（選手詳細の在籍履歴に海外クラブ行として表示するため）
    const foreignAppearances = { ...(state.currentSeason.foreignAppearances ?? {}) }
    for (const [id, add] of Object.entries(appearances)) {
      const cur = foreignAppearances[id] ?? { clubId: add.clubId, races: 0, wins: 0 }
      foreignAppearances[id] = {
        clubId: add.clubId || cur.clubId, races: cur.races + add.races, wins: cur.wins + add.wins,
        // 平均区間順位用。導入前から積まれたレース分は rankedRaces に入れない（平均が狂わないように）
        rankSum: (cur.rankSum ?? 0) + add.rankSum, rankedRaces: (cur.rankedRaces ?? 0) + add.rankedRaces }
    }
    return {
      players,
      currentSeason: { ...state.currentSeason, foreignStandings: standingsByLeague, foreignRaceIndex: idx + 1, foreignAppearances, foreignRaces } }
  }),


  // 移籍ウィンドウ中、レース毎に低確率で日本↔海外のクロスボーダー移籍を少数だけ発生させる（リーグが年中生きてる感じ）。
  // オフシーズンの一括処理と同じ財務＋補強ポイント連動ロジックを、件数を絞って呼ぶ。
  runMidSeasonForeignTransfers: () => {
    const st = get()
    if ((st.foreignLeagues ?? []).length === 0) return
    // 海外クラブ同士の引き抜きも低確率で1件（オフの一括と同じロジック。OVR下限もそのまま効く）
    if (Math.random() < 0.20) {
      set(state => {
        const raceDate = state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`
        const res = simulateForeignTransferMarket({
          foreignLeagues: state.foreignLeagues ?? [],
          players: state.players,
          year: state.currentSeason.year,
          maxMoves: 1,
          includeDecline: false,
          date: raceDate })
        if (res.records.length === 0) return {}
        return {
          players: res.players,
          foreignLeagues: res.foreignLeagues,
          transferHistory: [...(state.transferHistory ?? []), ...res.records].slice(-800),
          currentSeason: { ...state.currentSeason, newsFeed: [...res.news, ...state.currentSeason.newsFeed].slice(0, 40) } }
      })
    }
    if (Math.random() > 0.30) return   // 発生率 約30%/レース
    const nIn = Math.random() < 0.55 ? 1 : 0
    const nOut = Math.random() < 0.55 ? 1 : 0
    if (nIn === 0 && nOut === 0) return
    set(state => {
      const res = simulateCrossBorderTransfers({
        teams: state.teams,
        foreignLeagues: state.foreignLeagues ?? [],
        players: state.players,
        playerTeamId: state.playerTeamId,
        year: state.currentSeason.year,
        maxIn: nIn,
        maxOut: nOut })
      if (res.news.length === 0) return {}
      return {
        teams: res.teams,
        players: res.players,
        foreignLeagues: res.foreignLeagues,
        // シーズン中の日本↔海外移籍も履歴に記録（移籍ページで日付・移籍金が出るように）
        transferHistory: [...(state.transferHistory ?? []), ...res.records].slice(-800),
        currentSeason: { ...state.currentSeason, newsFeed: [...res.news, ...state.currentSeason.newsFeed].slice(0, 40) } }
    })
  },


  // 本編以外(リザーブ戦/記録会)のレース完了時にも、出した入札(移籍金オファー)とレンタル要請の応答を進める。
  // 本編レースは runRace 内で処理するので、こちらはリザーブ/記録会から呼ぶ。
  advanceMarketOneRace: () => set(state => {
    const cs = state.currentSeason
    const raceIdx = cs.currentRaceIndex ?? 0
    const races = cs.races ?? []
    const playerTeamId = state.playerTeamId
    const expiredNegs: ExpiredNegotiation[] = []
    const lockedIds: string[] = []

    // 入札(移籍金オファー)の応答。判定は本編の1戦と同じ resolveBid 1本
    const bids = (cs.transferBids ?? []).map(bid => {
      const r = resolveBid(bid, {
        players: state.players,
        listings: cs.transferListings ?? [],
        currentSeason: { year: cs.year, races, eclSeries: cs.eclSeries },
        pastSeasons: state.pastSeasons,
        raceIndex: raceIdx })
      if (r.expired) {
        expiredNegs.push(r.expired)
        lockedIds.push(r.expired.playerId)
      }
      return r.bid
    })

    // レンタル要請の応答
    const pendingLoanReqs = cs.loanRequests ?? []
    const newLoanResponses: LoanResponse[] = []
    const acceptedLoans: { playerId: string; ownerId: string; years: number }[] = []
    if (pendingLoanReqs.length > 0) {
      let freeSlots = Math.max(0, 3 - state.players.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId).length)
      for (const req of pendingLoanReqs) {
        const pl = state.players.find(p => p.id === req.playerId)
        if (!pl || pl.teamId !== req.targetTeamId || pl.loan) continue
        const loanable = keyPlayerStatus(pl, { year: cs.year, races, eclSeries: cs.eclSeries }, state.pastSeasons) === 'open'
        const ownerShort = findClub(state.teams, state.foreignLeagues, pl.teamId)?.shortName
          ?? '相手クラブ'
        if (loanable && freeSlots > 0) {
          acceptedLoans.push({ playerId: pl.id, ownerId: pl.teamId, years: req.years }); freeSlots--
          newLoanResponses.push({ id: `lresp_${pl.id}_${raceIdx}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: true, years: req.years })
        } else {
          newLoanResponses.push({ id: `lresp_${pl.id}_${raceIdx}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: false, years: req.years })
        }
      }
    }

    // 変化が無ければ何もしない
    const bidsChanged = bids.some((b, i) => b !== (cs.transferBids ?? [])[i])
    if (!bidsChanged && newLoanResponses.length === 0 && expiredNegs.length === 0) return {}

    let players: Player[] = state.players.map(p =>
      lockedIds.includes(p.id) ? { ...p, transferLockedUntilYear: cs.year + 1 } : p)
    let teams = state.teams
    // 借用成立は movePlayer に通す（保有元を残して、貸した側の名簿から外す）
    for (const a of acceptedLoans) {
      const m = movePlayer({ players, teams }, a.playerId, playerTeamId, {
        year: cs.year,
        until: cs.year + a.years,
        raceIndex: raceIdx,
        years: a.years,
        myTeamId: playerTeamId })
      if (!m.ok) continue
      players = m.players
      teams = m.teams
    }

    return {
      players,
      teams,
      currentSeason: {
        ...cs,
        transferBids: bids,
        loanRequests: pendingLoanReqs.length > 0 ? [] : (cs.loanRequests ?? []),
        loanResponses: [...(cs.loanResponses ?? []), ...newLoanResponses],
        expiredNegotiations: [...(cs.expiredNegotiations ?? []), ...expiredNegs] } }
  }),


  // ECLの次の1戦を開催する。5戦目の消化で最終順位（累計ポイント）・賞金・パッチ・歴代記録を確定
  advanceEclRace: (playerLineup) => set(state => {
    const series = state.currentSeason.eclSeries
    if (!series || series.raceIndex >= series.races.length) return {}
    const race = series.races[series.raceIndex]
    const year = state.currentSeason.year

    // ロスターは開催時点の在籍で解決（シーズン中の移籍・負傷を反映）
    const participants: EclParticipant[] = series.participants.map(pt => ({
      ...pt,
      // 国内チームも海外クラブも同じ数え方。所属は選手側の teamId だけを見る。
      // 負傷者もここには入れる（実際に走らせるかは ecl.ts が決める。健康な選手を先に使い、
      // 区間が埋まらないときだけ負傷者を立てる。ここで外すと空区間や出場取り消しになる）
      playerIds: state.players.filter(p => belongsToClub(p, pt.id)).map(p => p.id) })).filter(pt => pt.playerIds.length >= race.segments.length)
    if (participants.length < 2) {
      // 開催不能（消滅チーム等）でも戦は消化して先へ進める
      return { currentSeason: { ...state.currentSeason, eclSeries: { ...series, raceIndex: series.raceIndex + 1 } } }
    }

    const iAmIn = participants.some(p => p.isPlayerTeam)
    const result = simulateEclEvent({
      year, participants, races: [race], teams: state.teams, players: state.players,
      playerLineup: iAmIn && playerLineup ? { teamId: state.playerTeamId, lineup: playerLineup } : undefined })

    // ポイント累積（順位点＋区間点）
    const newPoints = { ...series.points }
    for (const tr of result.raceResults?.teamRankings ?? []) {
      newPoints[tr.teamId] = (newPoints[tr.teamId] ?? 0) + tr.positionPoints + tr.segmentPoints
    }
    const newRaces = series.races.map((r, i) => i === series.raceIndex ? { ...r, results: result.raceResults } : r)
    const nextIndex = series.raceIndex + 1
    const isFinal = nextIndex >= series.races.length

    // 出走で通算出走数、区間1位で通算区間賞（選手詳細に反映）
    const ranIds = new Set((result.raceResults?.segmentResults ?? []).flatMap(sr => sr.runners.map(r => r.playerId)))
    const segWinIds = new Set((result.raceResults?.segmentResults ?? []).map(sr => [...sr.runners].sort((a, b) => a.timeSec - b.timeSec)[0]?.playerId).filter(Boolean))
    const updatedPlayers = ranIds.size > 0
      ? state.players.map(p => ranIds.has(p.id)
        ? { ...p, career: { ...p.career, totalRaces: p.career.totalRaces + 1, segmentWins: p.career.segmentWins + (segWinIds.has(p.id) ? 1 : 0) } }
        : p)
      : state.players

    // この戦のニュース
    const raceWinner = result.standings[0]
    const myRaceRank = result.standings.findIndex(s => s.isPlayerTeam) + 1
    const newsItems: typeof state.currentSeason.newsFeed = [{
      date: race.date,
      // ECLは部の外の大会なので部は付けない。5戦のポイント制なので何戦目かと通算順位を出す
      headline: eclRaceHeadline({
        raceNo: series.raceIndex + 1, totalRaces: series.races.length,
        raceName: race.name, winnerName: raceWinner?.name ?? '',
        myRank: myRaceRank,
        myTotalRank: rankedStandings(series.participants.map(pt => ({ id: pt.id, totalPoints: series.points[pt.id] ?? 0 }))).findIndex(x => x.id === state.playerTeamId) + 1 }),
      category: 'race' as const,
      relatedIds: [race.id] }]

    // 区間記録の判定（JPELの駅伝と同じ仕組み。コースは固定10種なので年をまたいで記録が競われ、保持者には区間記録パッチが付く）。
    // 歴代記録は保存してあるレース結果から数え直す。今走った結果はまだ入っていないので「走る前の記録」になる
    const prevSegRecordsEcl = segmentRecordsOf(state.pastSeasons, state.currentSeason)
    const newSegRecordMarksEcl: { segmentIndex: number; playerId: string }[] = []
    const shortById = new Map(participants.map(pt => [pt.id, pt.shortName]))
    for (const sr of result.raceResults?.segmentResults ?? []) {
      const prevBest = (prevSegRecordsEcl[`${race.name}-${sr.segmentIndex}`] ?? [])[0]?.timeSec ?? null
      const fastestRunner = sr.runners.length > 0
        ? sr.runners.reduce((min, r) => r.timeSec < min.timeSec ? r : min, sr.runners[0])
        : null
      // 区間新記録が出たらニュースにする（過去記録がある区間で更新された場合のみ）
      if (prevBest != null && fastestRunner && fastestRunner.timeSec < prevBest) {
        const isMine = fastestRunner.teamId === state.playerTeamId
        const plName = state.players.find(x => x.id === fastestRunner.playerId)?.name ?? '不明'
        const tmShort = shortById.get(fastestRunner.teamId) ?? '?'
        newsItems.push({
          date: race.date,
          // ECLは部の外の大会なので部は付けない（division を渡さない）
          headline: segmentRecordHeadline({
            raceName: race.name, segmentIndex: sr.segmentIndex,
            playerName: plName, clubShort: tmShort,
            timeSec: fastestRunner.timeSec, prevTimeSec: prevBest, mine: isMine }),
          category: 'race' as const,
          relatedIds: [fastestRunner.playerId] })
        newSegRecordMarksEcl.push({ segmentIndex: sr.segmentIndex, playerId: fastestRunner.playerId })
      }
    }

    let updatedTeams = state.teams
    let newAch: NonNullable<GameState['achievements']> = []
    let eclResult = state.currentSeason.eclResult
    let eclFinalRank = 0   // 最終戦のみ確定する年間総合順位（ジュエルの総合ボーナス用）

    if (isFinal) {
      // 最終順位＝累計ポイント降順
      const finalStandings: EclStanding[] = series.participants
        .map(pt => ({ ...pt, points: newPoints[pt.id] ?? 0 }))
        .sort((a, b) => b.points - a.points)
      const champion = finalStandings[0]
      const myRank = finalStandings.findIndex(s => s.isPlayerTeam) + 1
      eclFinalRank = myRank
      const prize = myRank === 1 ? 200_000_000 : myRank === 2 ? 100_000_000 : myRank > 0 ? 50_000_000 : 0
      if (prize > 0) {
        updatedTeams = state.teams.map(t => t.id === state.playerTeamId ? { ...t, finance: { ...t.finance, budget: t.finance.budget + prize } } : t)
      }
      const won = champion?.id === state.playerTeamId
      if (won) newAch = [{ id: `ecl-champion-${year}`, name: 'ECL制覇', desc: `${year}年 ECLで優勝`, earnedAtYear: year, rarity: 'legendary' as const }]

      // 優勝チームの出走メンバー（全5戦の延べ）と大会MVP（全戦の区間で最も突出した走り）
      const winnerPlayerIds = champion
        ? [...new Set(newRaces.flatMap(r => (r.results?.segmentResults ?? []).flatMap(sr => sr.runners.filter(x => x.teamId === champion.id).map(x => x.playerId))))]
        : []
      let mvpPlayerId: string | undefined
      let bestGap = -1
      for (const r of newRaces) {
        for (const sr of r.results?.segmentResults ?? []) {
          const sorted = [...sr.runners].sort((a, b) => a.timeSec - b.timeSec)
          const top = sorted[0]
          if (!top) continue
          const gap = (sorted[1]?.timeSec ?? top.timeSec) - top.timeSec
          if (gap > bestGap) { bestGap = gap; mvpPlayerId = top.playerId }
        }
      }

      eclResult = {
        year,
        championId: champion?.id ?? '',
        standings: finalStandings,
        races: newRaces.map(r => ({ name: r.name, raceId: r.id })),
        winnerPlayerIds,
        mvpPlayerId,
        playerRank: myRank > 0 ? myRank : undefined,
        prize }
      newsItems.push({
        date: race.date,
        headline: eclSeasonEndHeadline({ won, championName: champion?.name ?? '', myRank }),
        category: 'race' as const,
        relatedIds: [race.id] })
    }

    // ── ジュエル：国内レース（runRace）の1.5倍。順位20/10/5→30/15/7、区間賞5→7、実績も1.5倍。
    //    7.5は切り捨てて7。年間総合順位のボーナスだけは国内のシーズン終了と同じ200/100/50（1.5倍しない）。
    //    二軍（advanceSecondTeamRace）と世界選手権はこれまで通り付与なし。 ──
    const myEclSegWins = myRaceRank > 0
      ? state.players.filter(p => p.teamId === state.playerTeamId && segWinIds.has(p.id)).length
      : 0
    const eclJewelGains: { label: string; amount: number }[] = []
    if (myRaceRank > 0) {
      const rankJ = myRaceRank === 1 ? 30 : myRaceRank === 2 ? 15 : myRaceRank === 3 ? 7 : 0
      if (rankJ > 0) eclJewelGains.push({ label: `ECL${myRaceRank}位`, amount: rankJ })
      if (myEclSegWins > 0) eclJewelGains.push({ label: `区間賞×${myEclSegWins}`, amount: myEclSegWins * 7 })
      for (const a of newAch) {
        const j = Math.round((ACHIEVEMENT_JEWELS[a.rarity] ?? 0) * 1.5)
        if (j > 0) eclJewelGains.push({ label: `実績「${a.name}」`, amount: j })
      }
    }
    // 年間総合（最終戦時のみ）。自チームが出ていないシリーズでは eclFinalRank が0になるので付かない
    const eclTotalJ = podiumJewels(eclFinalRank)
    if (eclTotalJ > 0) eclJewelGains.push({ label: `ECL年間総合${eclFinalRank}位`, amount: eclTotalJ })
    const eclJewels = eclJewelGains.reduce((s, g) => s + g.amount, 0)

    return {
      teams: updatedTeams,
      players: updatedPlayers,
      // 自チームが出ていない観戦シリーズは裏で自動消化されるので、獲得ゼロのときは
      // 未表示の内訳（前のレースぶん）を消さないようキーごと書かない
      ...(eclJewels > 0 ? {
        jewels: state.jewels + eclJewels,
        jewelGains: [...(state.jewelGains ?? []), ...eclJewelGains].slice(-20) } : {}),
      // このレースで出た区間新に張り替える（前のリーグ戦のバッジ記録が残って誤表示されるのを防ぐ）
      raceNewSegmentRecords: newSegRecordMarksEcl,
      achievements: [...(state.achievements ?? []), ...newAch],
      currentSeason: {
        ...state.currentSeason,
        eclSeries: { ...series, races: newRaces, raceIndex: nextIndex, points: newPoints },
        eclResult,
        newsFeed: [...newsItems, ...state.currentSeason.newsFeed].slice(0, 30) } }
  }),

  // 既存セーブ救済：今シーズンにECLが無ければ後から生成する（起動時に呼ばれる・冪等）。
  // リーグ再編をまたいだ年は旧リーグIDの順位表しか無く、ECLの生成が丸ごとスキップされていた。
  // 参加チームは JPEL=前年順位上位2、海外=各リーグのクラブ戦力（上位10人のOVR合計）上位2で構成する。
  // 補充は日付基準：現在の進行地点より未来の開催回だけ生成し、シーズンが終わっていれば何もしない
  // （4月のレースをシーズン末に出さない。その年のECLはもう開催できなかったものとして来季から通常開催）
  ensureEclSeries: () => {
    set(state => {
      const cs = state.currentSeason
      const seasonDone = cs.races.length > 0 && cs.currentRaceIndex >= cs.races.length
      // 旧救済が日付を無視して終了済みシーズンに補充してしまった未着手のECLを削除する
      // （raceIndex=0かつ全戦結果なし＝日付的にあり得ない生成物。通常のシーズン末のECL残り戦は
      //  シーズン中に日付順で消化が強制されるため、この状態には正規プレイでは到達しない）
      if (cs.eclSeries && seasonDone && cs.eclSeries.raceIndex === 0 && cs.eclSeries.races.every(r => !r.results)) {
        return { currentSeason: { ...cs, eclSeries: undefined } }
      }
      if (cs.eclSeries) return state
      if (seasonDone) return state // 未来の日付が残っていないので今年はもう開催できない
      if ((state.pastSeasons?.length ?? 0) === 0) return state // 初年度は開催なし（仕様）
      const leagues = state.foreignLeagues ?? []
      if (leagues.length === 0) return state
      const last = state.pastSeasons[state.pastSeasons.length - 1]
      const parts = buildEclParticipants({
        standings: last ? divisionStandings(last, TOP_DIVISION) : [],
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        leagues,
        foreignStandings: cs.foreignStandings ?? {},
        players: state.players })
      if (parts.length < 4) return state
      // 日付基準のフィルタ：最後に消化したレースより未来の開催回だけを残す（過ぎた回は開催されなかった扱い）
      const lastPlayedDate = cs.currentRaceIndex > 0 ? cs.races[cs.currentRaceIndex - 1].date : ''
      const races = buildEclRaces(cs.year, cs.races.map(r => r.date)).filter(r => r.date > lastPlayedDate)
      if (races.length === 0) return state
      return {
        currentSeason: {
          ...cs,
          eclSeries: {
            participants: parts,
            races,
            raceIndex: 0,
            points: {} } } }
    })
  },
})
