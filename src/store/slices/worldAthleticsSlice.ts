// 世界選手権（World Athletics）まわりのアクション（gameStore から分割）。
// レース進行の本体は engine/worldAthletics.ts。ここは状態への適用だけ。

import type { GameStore, SetGame } from '../gameStore'
import { courseRegionOfNation } from '../../data/courseNames'
import { HOME_NATION, natLabel } from '../../data/nationalities'
import { runBackgroundRace } from '../../engine/backgroundRace'
import { WA_CLOSING_DATE, WA_HOST_CITY, advanceContinentalQualifiers, autoSelectEkiden, composeMainResult, composeQualifierResult, contRacesOf, ekidenCandidates, ekidenSegmentPoints, finishContinentalQualifiers, hostForYear, hostTerrain, qualHostForYear, qualifierNations, qualifyNations, runContinentalQualifiers, selectIndividualFields, simulateIndividuals, startContinentalQualifiers, stripContRaces, waRaceDate } from '../../engine/worldAthletics'
import { type Nationality, type Player } from '../../types'
import { type NewsItem, continentalQualifierHeadline, nationalCallUpHeadline, worldChampHeadline } from '../../utils/newsItems'
import { worldRace, worldRaceName, worldRacePlans } from '../../utils/worldCourses'

type Slice = Pick<GameStore,
  'setWorldSquad' | 'startWorldTournament' | 'advanceWorldRace' | 'markWorldIndividualsSeen' | 'markWorldIndividualRevealed' | 'ensureWorldRacePlans'>

export const createWorldAthleticsSlice = (set: SetGame, get: () => GameStore): Slice => ({
  setWorldSquad: (playerIds: string[]) => {
    set(state => ({ worldSquad: { year: state.currentSeason.year, playerIds: playerIds.slice(0, 20) } }))
  },

  // 世界選手権トーナメント開始：出場国・各国の駅伝代表20・3戦のコースを確定。
  // 予選＝アジア＋オセアニア（最大20カ国）／本番＝20カ国（前年予選の通過国でアジア＋オセ枠を決定）。
  // 本番は個人種目の結果もここで確定（発表は画面側で段階表示）。
  startWorldTournament: () => {
    set(state => {
      const year = state.currentSeason.year
      if ((state.worldAthleticsResults ?? []).some(r => r.year === year)) return state
      if (state.worldTournament && state.worldTournament.year === year && !state.worldTournament.finished) return state
      const isMain = (year - 2028) % 2 === 0
      // 予選も開催国ローテーション（アジア＋オセアニアの国で持ち回り。コースも開催国の地形）
      const host = isMain ? hostForYear(year) : qualHostForYear(year)
      let nations: import('../../types').Nationality[]
      if (isMain) {
        const prevQual = (state.worldAthleticsResults ?? []).find(r => r.kind === 'qualifier' && r.year === year - 1)
        const pq = prevQual?.kind === 'qualifier' ? prevQual : undefined
        // アジアは実レース予選、欧州・アフリカ・アメリカは前年に裏で回した大陸予選の通過国から
        nations = qualifyNations(state.players, year, host!, pq?.advanced, pq?.continentals)
      } else {
        // 予選の出場国は engine/worldAthletics の qualifierNations 1本（自国は必ず入る）
        nations = qualifierNations(state.players, year, host)
      }
      const japanIn = nations.includes('JPN')
      // 駅伝優先：まず各国が最強20人を駅伝代表に投入（日本は手動選考があればそれ）。
      // 個人種目は駅伝に入らなかった選手から選考する（標準突破優先＋ランキング補充・国別3・マラソン専任）
      const japanManual = japanIn && state.worldSquad?.year === year && state.worldSquad.playerIds.length > 0
        ? state.worldSquad.playerIds : undefined
      // コースは選考画面で公開したものをそのまま使う（無ければここで生成）。他国の選抜もこの地形を見る
      const plans = state.worldRacePlans?.year === year ? state.worldRacePlans.plans : worldRacePlans(year)
      const squads: Record<string, string[]> = {}
      for (const nat of nations) {
        if (nat === 'JPN' && japanManual) {
          squads[`nat_${nat}`] = japanManual
          continue
        }
        // 他国も日本と同じく「持ちタイム14人＋コース適性6人」の混成で20人を選抜する
        // （タイム上位だけだと山岳コースで登り・下り専門が居ない適当な代表になるため）
        const cands = ekidenCandidates(state.players, nat, year, 20)
        squads[`nat_${nat}`] = autoSelectEkiden(cands, new Set<string>(), 20).map(p => p.id)
      }
      const ekidenIds = new Set(Object.values(squads).flat())
      const fields = isMain ? selectIndividualFields(state.players, nations, year, ekidenIds) : undefined
      // 国旗色はその国の先頭クラブのカラーを流用（日本は金）
      const clubColor = (nat: string) => {
        if (nat === 'JPN') return { primary: '#C9A84C', secondary: '#14121F' }
        for (const l of state.foreignLeagues ?? []) { const c = l.clubs.find(c => c.country === nat); if (c) return c.colors }
        return { primary: '#4B5563', secondary: '#FFFFFF' }
      }
      const participants = nations.map(nat => ({
        id: `nat_${nat}`, nat, name: natLabel(nat), shortName: natLabel(nat).slice(0, 5),
        colors: clubColor(nat), isPlayerTeam: nat === 'JPN' && japanIn }))
      // レースの組み立ては utils/worldCourses の worldRace 1本（本戦・アジア予選・大陸予選で共通）。
      // 「世界選手権 出雲開幕戦」のようにコース名で呼ぶ。年と開催地を名前に入れると
      // 毎年別の記録表になって区間記録が1年で使い捨てになる。
      // コース名を持っていない古いセーブだけ、これまでどおり年つきの名前で出す
      const meetName = isMain ? '世界選手権' : '世界選手権アジア予選'
      // コース名は開催国の地域のもの（日本開催なら国内の名前のまま）
      const courseRegion = courseRegionOfNation(host)
      const races: import('../../types').Race[] = plans.map((plan, i) => worldRace(plan, {
        id: `wa-${year}-r${i + 1}`,
        name: worldRaceName(plan, meetName, `${year} ${meetName} ${WA_HOST_CITY[host!] ?? natLabel(host!)} 第${i + 1}戦`, courseRegion),
        // JPELグランドファイナル(12/27)の後、オフシーズンの1月開催。年をまたぐので year+1 になる
        date: waRaceDate(year, i) }))
      const individuals = fields ? simulateIndividuals(fields) : undefined
      // 代表は選出された時点で代表：駅伝20人＋個人種目エントリーをここで代表記録に積む
      // （予選年も本戦年も、大会結果を待たずに「◯◯年 駅伝 [国旗]代表」パッチ・代表履歴が付く）
      const repsAtStart = [...(state.worldRepresentatives ?? [])]
      const repKey = (r: { playerId: string; year: number; label: string; rank?: number }) => `${r.playerId}|${r.year}|${r.label}|${r.rank ?? ''}`
      const repSeen = new Set(repsAtStart.map(repKey))
      const pushRep = (r: { playerId: string; year: number; nat: import('../../types').Nationality; label: string; rank?: number }) => {
        const k = repKey(r)
        if (!repSeen.has(k)) { repsAtStart.push(r); repSeen.add(k) }
      }
      for (const [pid, ids] of Object.entries(squads)) {
        const nat = pid.slice(4) as import('../../types').Nationality
        for (const id of ids) pushRep({ playerId: id, year, nat, label: '駅伝' })
      }
      if (individuals) {
        const EV: Record<string, string> = { d5000: '5000m', d10000: '10000m', marathon: 'マラソン' }
        for (const ir of individuals) for (const pl of ir.placings) pushRep({ playerId: pl.playerId, year, nat: pl.nat, label: EV[ir.event] ?? ir.event })
      }
      // 予選年は欧州・アフリカ・アメリカの大陸予選も同時に裏開催。
      // **アジア予選と同じコース・同じ3戦を実際に走る**（advanceWorldRace で一緒に進む）。
      // 各国の代表はここで確定＝アジア予選と同じタイミングで「駅伝 [国旗]代表」パッチが付く。
      // 代表20人は continentals.squads にまとめて持つ（worldRepresentativesへは重複保存しない＝セーブ肥大を回避）
      const continentals = !isMain ? startContinentalQualifiers(state.players, year, plans) : undefined
      return {
        worldTournament: {
          year, kind: isMain ? 'main' as const : 'qualifier' as const, host,
          participants, squads, races, raceIndex: 0, points: {},
          individuals, individualsSeen: !isMain, continentals, japanIn, finished: false },
        worldRepresentatives: repsAtStart }
    })
  },

  // 駅伝1戦を実レースで走らせる（日本は手動配置可）。3戦目で最終結果を確定して記録へ積む
  advanceWorldRace: (japanLineup?: Record<number, string>) => {
    set(state => {
      const t = state.worldTournament
      if (!t || t.finished || t.raceIndex >= t.races.length) return state
      const race = t.races[t.raceIndex]
      const byId = new Map(state.players.map(p => [p.id, p]))
      // 走らせるのは engine/backgroundRace の1本（裏の部・海外リーグ・ECLと同じ）。
      // 日本だけ監督の配置を差し込む
      const out = runBackgroundRace({
        race, players: state.players, seasonProgress: 0.7,
        entrants: t.participants.map(pt => ({
          id: pt.id,
          roster: (t.squads[pt.id] ?? []).map(id => byId.get(id)).filter((p): p is Player => !!p && p.status !== 'retired'),
          lineup: (pt.isPlayerTeam && japanLineup && Object.keys(japanLineup).length > 0) ? japanLineup : undefined })) })
      const newRaces = t.races.map((r, i) => i === t.raceIndex ? out.race : r)
      const points = { ...t.points }
      for (const [id, pt] of Object.entries(out.points)) points[id] = (points[id] ?? 0) + pt
      // 大陸予選も同じ第◯戦を裏で走らせる（同じ年・同じコース・同じ得点）
      const contsNow = t.continentals ? advanceContinentalQualifiers(t.continentals, t.raceIndex, state.players) : undefined
      // 世界大会の走行記録はシーズンの側へ置く（海外リーグ・裏の部と同じ。別ファイルへ archive される）。
      // 本戦・アジア予選・大陸予選を分けない。**worldAthleticsResults の側には順位だけ残す**
      const waRaces = {
        ...(state.currentSeason.waRaces ?? {}),
        [t.kind === 'main' ? 'main' : 'asia']: newRaces.filter(r => r.results),
        ...(contsNow ? contRacesOf(contsNow) : {}) }
      const seasonWithWa = { ...state.currentSeason, waRaces }
      const nextIdx = t.raceIndex + 1
      const finished = nextIdx >= t.races.length
      if (!finished) {
        return {
          worldTournament: { ...t, races: newRaces, raceIndex: nextIdx, points, continentals: contsNow, finished },
          currentSeason: seasonWithWa }
      }
      // 最終戦消化 → 3戦合計ポイントで最終結果を確定
      const runnersOf = (pid: string) => {
        const set = new Set<string>()
        for (const r of newRaces) for (const sr of r.results?.segmentResults ?? []) for (const run of sr.runners) if (run.teamId === pid) set.add(run.playerId)
        return [...set]
      }
      const rows = t.participants.map(pt => ({ nat: pt.nat, points: points[pt.id] ?? 0, runnerIds: runnersOf(pt.id) }))
      // 年間アジア最優秀選手（予選のみ）: 3戦すべてに出走した選手のうち区間順位平均が最良。同率は合計タイムが速い方
      const bestPlayer = (() => {
        if (t.kind !== 'qualifier') return undefined
        const perf = new Map<string, { nat: Nationality; ranks: number[]; time: number }>()
        for (const r of newRaces) for (const sr of r.results?.segmentResults ?? []) for (const run of sr.runners) {
          if (!run.teamId.startsWith('nat_')) continue
          const e = perf.get(run.playerId) ?? { nat: run.teamId.slice(4) as Nationality, ranks: [], time: 0 }
          e.ranks.push(run.rank ?? 99)
          e.time += run.timeSec
          perf.set(run.playerId, e)
        }
        let best: { playerId: string; nat: Nationality; avgRank: number; time: number } | undefined
        for (const [pid, e] of perf) {
          if (e.ranks.length < newRaces.length) continue
          const avg = e.ranks.reduce((a, b) => a + b, 0) / e.ranks.length
          if (!best || avg < best.avgRank || (avg === best.avgRank && e.time < best.time)) best = { playerId: pid, nat: e.nat, avgRank: avg, time: e.time }
        }
        return best ? { playerId: best.playerId, nat: best.nat, avgRank: best.avgRank } : undefined
      })()
      // 大陸予選は開幕時に始まり、上でアジア予選と一緒にここまで走ってきている。
      // 3戦の合計得点で通過国を確定する。
      // 大陸予選を持っていない旧セーブだけ、ここで開幕から決着までを一度に回す（判定は同じ1本）
      const continentals = t.kind === 'qualifier'
        ? finishContinentalQualifiers(contsNow ?? runContinentalQualifiers(state.players, t.year, worldRacePlans(t.year)))
        : undefined
      // 駅伝3戦のレース詳細も結果に残す（ECLのeclSeriesと同じ扱い。選手詳細の駅伝データ等で使う）
      // 駅伝の区間ポイント（全3戦の各区間で区間順位1位3/2位2/3位1）を国別に集計
      const segPts = t.kind === 'main' ? ekidenSegmentPoints(newRaces) : undefined
      const result = {
        ...(t.kind === 'qualifier'
          // 大陸予選は通過国と代表20人だけを恒久保存する。走行記録は Season.waRaces（別ファイル行き）
          ? { ...composeQualifierResult(t.year, rows, 3, t.host), bestPlayer, continentals: continentals && stripContRaces(continentals) }
          : composeMainResult(t.year, t.host!, t.participants.map(p => p.nat), t.individuals ?? [], rows, segPts)),
        // 走行記録はここには入れない（Season.waRaces へ。読むのは utils/waRaces の1本）。
        // ここは普段のセーブに入りっぱなしなので、置くと大会のたびに数十KBずつ増え続ける
        // 選出された駅伝代表20人を恒久保存（チームタブの代表表示・0走でも代表履歴に残すための元データ）
        squads: t.squads }
      // 代表出場記録（パッチ・代表履歴の元）。
      // 選出時点の記録（rank無し）は startWorldTournament で積み済み。ここでは成績付き（rank）を追加する。
      // 同一エントリーの重複はキーで排除（旧セーブで選出時記録が無い場合もここで補完される）
      const reps = [...(state.worldRepresentatives ?? [])]
      const endRepKey = (r: { playerId: string; year: number; label: string; rank?: number }) => `${r.playerId}|${r.year}|${r.label}|${r.rank ?? ''}`
      const endRepSeen = new Set(reps.map(endRepKey))
      const pushEndRep = (r: { playerId: string; year: number; nat: Nationality; label: string; rank?: number }) => {
        const k = endRepKey(r)
        if (!endRepSeen.has(k)) { reps.push(r); endRepSeen.add(k) }
      }
      if (result.kind === 'main') {
        const EV: Record<string, string> = { d5000: '5000m', d10000: '10000m', marathon: 'マラソン' }
        for (const ir of result.meet.individuals) for (const pl of ir.placings) pushEndRep({ playerId: pl.playerId, year: t.year, nat: pl.nat, label: EV[ir.event] ?? ir.event, rank: pl.rank })
        for (const ek of result.meet.ekiden) {
          const squad = t.squads[`nat_${ek.nat}`] ?? []
          const ran = new Set(ek.runnerIds)
          for (const pid of squad) pushEndRep({ playerId: pid, year: t.year, nat: ek.nat, label: '駅伝', rank: ran.has(pid) ? ek.rank : undefined })
          for (const rid of ek.runnerIds) if (!squad.includes(rid)) pushEndRep({ playerId: rid, year: t.year, nat: ek.nat, label: '駅伝', rank: ek.rank })
        }
      } else {
        for (const pt of t.participants) for (const pid of t.squads[pt.id] ?? []) pushEndRep({ playerId: pid, year: t.year, nat: pt.nat, label: '駅伝' })
      }
      // 大会が終わったときのニュース。**日付は WA_CLOSING_DATE 1本**（閉幕＝最終戦の翌日）。
      // 以前これは呼び出し元の無い関数の中にだけ書かれていて、しかも日付が 2/15・2/10 と
      // 直書きされていた。生きている側からは世界選手権のニュースが1件も出ていなかった。
      const waNews: NewsItem[] = []
      const closing = `${t.year + 1}${WA_CLOSING_DATE}`
      if (result.kind === 'qualifier' && result.continentals) {
        waNews.push({
          date: closing,
          headline: continentalQualifierHeadline({
            regions: result.continentals.map(c => ({ region: c.region, nations: c.advanced.map(n => natLabel(n)) })) }),
          category: 'race', relatedIds: [] })
      }
      if (result.kind === 'main') {
        const jpRank = result.meet.ekiden.find(e => e.nat === HOME_NATION)?.rank
        for (const ek of result.meet.ekiden.filter(e => e.rank === 1)) {
          waNews.push({
            date: closing,
            headline: worldChampHeadline({ year: t.year, eventName: '駅伝', winner: natLabel(ek.nat), japanRank: jpRank }),
            category: 'race', relatedIds: [], major: true })
        }
        const EVN: Record<string, string> = { d5000: '5000m', d10000: '10000m', marathon: 'マラソン' }
        for (const ir of result.meet.individuals) {
          const top = ir.placings.find(x => x.rank === 1)
          if (!top) continue
          waNews.push({
            date: closing,
            headline: worldChampHeadline({
              year: t.year, eventName: EVN[ir.event] ?? ir.event, winner: natLabel(top.nat),
              japanRank: ir.placings.find(x => x.nat === HOME_NATION)?.rank }),
            category: 'race', relatedIds: [], major: false })
        }
        // 代表の顔ぶれ。自チームから選ばれていたら大ニュース
        const jpIds = [...new Set(reps.filter(r => r.year === t.year && r.nat === HOME_NATION).map(r => r.playerId))]
        if (jpIds.length > 0) {
          const mine = jpIds.filter(id => state.players.find(p => p.id === id)?.teamId === state.playerTeamId).length
          waNews.push({
            date: closing,
            headline: nationalCallUpHeadline({
              year: t.year,
              names: jpIds.map(id => state.players.find(p => p.id === id)?.name ?? '').filter(Boolean),
              mineCount: mine }),
            category: 'race', relatedIds: jpIds, major: mine > 0 })
        }
      }
      return {
        worldTournament: { ...t, races: newRaces, raceIndex: nextIdx, points, finished: true },
        worldAthleticsResults: [result, ...(state.worldAthleticsResults ?? [])],
        worldRepresentatives: reps,
        currentSeason: waNews.length > 0
          ? { ...seasonWithWa, newsFeed: [...waNews, ...seasonWithWa.newsFeed].slice(0, 30) }
          : seasonWithWa }
    })
  },

  markWorldIndividualsSeen: () => {
    set(state => state.worldTournament ? { worldTournament: { ...state.worldTournament, individualsSeen: true } } : state)
  },

  // 個人種目の結果発表を1つ消化（駅伝第N戦後にN種目目を発表するインターリーブ進行）
  markWorldIndividualRevealed: () => {
    set(state => state.worldTournament ? { worldTournament: { ...state.worldTournament, individualsRevealed: (state.worldTournament.individualsRevealed ?? 0) + 1 } } : state)
  },

  // その年の駅伝3戦のコースを（未生成なら）確定する。選考画面が地形を表示するために呼ぶ。
  // 大会開始(startWorldTournament)も同じコースを使うので、選考時に見た地形どおりのレースになる
  ensureWorldRacePlans: () => {
    set(state => {
      const year = state.currentSeason.year
      if (state.worldRacePlans?.year === year) return state
      // コースは開催国の地形で作る（本番＝世界選手権の開催国、予選＝アジア予選の開催国）
      const isMain = (year - 2028) % 2 === 0
      const host = isMain ? hostForYear(year) : qualHostForYear(year)
      return { worldRacePlans: { year, plans: worldRacePlans(year, hostTerrain(host)) } }
    })
  },

})
