// 読み込んだセーブへの補正を1本に並べる場所（mergeSave から毎回呼ばれる）。
//
// ここにあるのは2種類だけ:
//   ・冪等な補正 … 何度通しても同じ結果（名前の同期・壊れデータの修復・日付の再配置）
//   ・一回きりのパッチ … セーブ内のフラグ（balancePatch / deficitRescue）で1回だけ適用
//
// ★バージョン番号でゲートしたい変換は migrateSave.ts へ。ここは版を見ない。
//   migrate が版だけ進めて段に届かなかったセーブも、ここは毎回通るので拾える。

import type { GameStore } from '../gameStore'
import { ECL_COURSES } from '../../data/eclCourses'
import { DEFICIT_RESCUE_BUDGET } from '../../data/economy'
import { FOREIGN_LEAGUES } from '../../data/foreignLeagues'
import { natStrengthRegion } from '../../data/nationalities'
import { eclDateBetweenLeagueRaces } from '../../engine/eclSeries'
import { WA_HOST_CITY } from '../../engine/worldAthletics'
import { type Nationality, type Player } from '../../types'
import { allForeignClubs } from '../../utils/clubs'
import { fmtYen } from '../../utils/money'
import { deficitRescueHeadline } from '../../utils/newsItems'

export function normalizeLoadedSave(p: Partial<GameStore>): void {
  // 監督の在任履歴が無い旧セーブは「最初のシーズンからずっと今のチーム」として1件だけ入れる。
  // これまで出ていたキャリアの数字がそのまま出るので、既存プレイヤーの見た目は変わらない。
  if (p.isInitialized && p.playerTeamId && !(Array.isArray(p.gmTenures) && p.gmTenures.length > 0)) {
    const firstYear = p.pastSeasons?.[0]?.year ?? p.currentSeason?.year
    if (typeof firstYear === 'number') p.gmTenures = [{ teamId: p.playerTeamId, fromYear: firstYear }]
  }
  // ECL戦名「ECL 第X戦」→「ECL コース名」（migrateはバージョンスタンプ済みだと走らないので、毎回ここで冪等に直す）
  const renameEcl = <T extends { eclSeries?: { races: { name: string; location: string }[] } }>(season: T): T => {
    if (!season?.eclSeries?.races?.some(r => /^ECL 第\d+戦$/.test(r.name))) return season
    return {
      ...season,
      eclSeries: {
        ...season.eclSeries,
        races: season.eclSeries.races.map(r => {
          if (!/^ECL 第\d+戦$/.test(r.name)) return r
          const course = ECL_COURSES.find(c => c.location === r.location)
          return course ? { ...r, name: `ECL ${course.name}` } : r
        }) } }
  }
  // ECL開催日を「リーグ戦の中間日」へ再配置（生成時の修正は来季からしか効かないので、既存セーブもここで直す。消化済みの戦は動かさない）
  const fixEclDates = (season: GameStore['currentSeason']): GameStore['currentSeason'] => {
    const series = season.eclSeries
    if (!series?.races?.length || !season.races?.length) return season
    const leagueDates = season.races.map(r => r.date)
    const midDate = (target: string) => eclDateBetweenLeagueRaces(target, leagueDates)
    let changed = false
    const races = series.races.map(r => {
      if (r.results) return r
      const d = midDate(r.date)
      if (d === r.date) return r
      changed = true
      return { ...r, date: d }
    })
    return changed ? { ...season, eclSeries: { ...series, races } } : season
  }
  if (p.currentSeason) p.currentSeason = fixEclDates(renameEcl(p.currentSeason))
  if (Array.isArray(p.pastSeasons)) p.pastSeasons = p.pastSeasons.map(renameEcl)
  // 世界選手権の旧レース名（「アジア＋オセアニア予選 駅伝 第1戦」等）を現行形式へ冪等に直す。
  // 旧セーブは大会生成時の名前で凍結されているため、コード側のリネームだけでは直らない
  {
    const OLD_WA = /アジア[＋+]オセアニア予選/
    const fixWaName = (name: string, year: number, kind: 'qualifier' | 'main', host: Nationality | undefined, i: number): string => {
      if (!OLD_WA.test(name) && !/^世界選手権 駅伝 第\d+戦$/.test(name)) return name
      const city = host ? (WA_HOST_CITY[host] ?? '') : ''
      return kind === 'main'
        ? `${year} 世界選手権${city ? ` ${city}` : ''} 第${i + 1}戦`
        : `${year} 世界選手権アジア予選${city ? ` ${city}` : ''} 第${i + 1}戦`
    }
    if (p.worldTournament?.races) {
      const t = p.worldTournament
      p.worldTournament = { ...t, races: t.races.map((r, i) => ({ ...r, name: fixWaName(r.name, t.year, t.kind, t.host, i) })) }
    }
    if (Array.isArray(p.worldAthleticsResults)) {
      p.worldAthleticsResults = p.worldAthleticsResults.map(res => res.races
        ? { ...res, races: res.races.map((r, i) => ({ ...r, name: fixWaName(r.name, res.year, res.kind, res.kind === 'qualifier' ? res.host : res.host, i) })) }
        : res)
    }
  }
  // 既存セーブのアジア/その他圏の海外選手を新生成レンジへ一括ブースト（1回だけ適用・balancePatch=1）。
  // 生成側の強化（ASIA上限84→90等）は新規選手にしか効かないため、現存選手も同じ水準へ引き上げて
  // アジア予選を即座に接戦化する。日本人と、日本リーグ所属の外国人（国内バランス維持）は対象外
  if (Array.isArray(p.players) && ((p as { balancePatch?: number }).balancePatch ?? 0) < 1) {
    const jpelTeamIds = new Set((p.teams ?? []).map(t => t.id))
    p.players = p.players.map(pl => {
      if (!pl.ratings || pl.nationality === 'JPN' || pl.status === 'retired') return pl
      const region = natStrengthRegion(pl.nationality)
      if (region !== 'ASIA' && region !== 'OTHER') return pl
      if (pl.teamId && jpelTeamIds.has(pl.teamId)) return pl
      const f = region === 'ASIA' ? 0.18 : 0.10
      const cap = region === 'ASIA' ? 92 : 88
      const up = (v: number) => Math.min(cap, Math.max(v, Math.round(v + Math.max(0, v - 50) * f)))
      const r = pl.ratings
      return {
        ...pl,
        ratings: { speed: up(r.speed), stamina: up(r.stamina), mountainUp: up(r.mountainUp), mountainDown: up(r.mountainDown), pacing: up(r.pacing), mental: up(r.mental), recovery: up(r.recovery) },
        potential: Math.max(pl.potential ?? 0, Math.min(region === 'ASIA' ? 90 : 87, (pl.potential ?? 0) + (region === 'ASIA' ? 6 : 3))) }
    })
    ;(p as { balancePatch?: number }).balancePatch = 1
  }
  // 海外クラブ名を静的データ（foreignLeagues.ts）の最新名に同期する（冪等）。
  // 「〜AC」ばかりに平坦化された旧名を、既存セーブでも個性名へ差し替えるための処理
  if (Array.isArray(p.foreignLeagues)) {
    const staticClub = new Map(allForeignClubs(FOREIGN_LEAGUES).map(c => [c.id, c]))
    p.foreignLeagues = p.foreignLeagues.map(l => ({
      ...l,
      clubs: l.clubs.map(c => {
        const sc = staticClub.get(c.id)
        return sc && (sc.name !== c.name || sc.shortName !== c.shortName) ? { ...c, name: sc.name, shortName: sc.shortName } : c
      }) }))
  }
  // ── 旧仕様の赤字判定バグで詰んだセーブの救済（1回だけ・deficitRescue=1）──
  // 旧 seasonOperatingResult は連続赤字ペナルティ適用「後」の減額グラントで黒字/赤字を判定していたため、
  // 一度赤字になると判定ラインが毎年上がり続け、年俸を削っても連続赤字が解除されない＝
  // 補強禁止が永久に続き、さらに毎年ドラフト最上位指名権を失う状態に陥っていた。
  // 修正版の判定に切り替えるだけでは既に積み上がったカウントと借金は消えないため、
  // 全チームの連続赤字カウントをリセットし、残高マイナスのチームを救済ラインまで戻す。
  if (Array.isArray(p.teams) && ((p as { deficitRescue?: number }).deficitRescue ?? 0) < 1) {
    let rescuedMe = false
    let myStreak = 0
    let myOldBudget = 0
    p.teams = p.teams.map(t => {
      const streak = t.finance?.deficitStreak ?? 0
      const bal = t.finance?.budget ?? 0
      if (streak === 0 && bal >= 0) return t
      if (t.id === p.playerTeamId) {
        rescuedMe = true
        myStreak = streak
        myOldBudget = bal
      }
      return {
        ...t,
        finance: {
          ...t.finance,
          deficitStreak: 0,
          budget: bal < 0 ? DEFICIT_RESCUE_BUDGET : bal } }
    })
    ;(p as { deficitRescue?: number }).deficitRescue = 1
    if (rescuedMe && p.currentSeason) {
      const y = p.currentSeason.year ?? 2046
      const parts: string[] = []
      if (myStreak > 0) parts.push(`連続赤字${myStreak}年をリセット`)
      if (myOldBudget < 0) parts.push(`残高を${fmtYen(DEFICIT_RESCUE_BUDGET)}へ補填`)
      p.currentSeason = {
        ...p.currentSeason,
        newsFeed: [
          {
            date: `${y}-01-01`,
            headline: deficitRescueHeadline(parts),
            category: 'finance' as const,
            relatedIds: [],
            major: true },
          ...(p.currentSeason.newsFeed ?? []),
        ] }
    }
  }
  // ── 壊れた選手データの自動修復（毎回・冪等）──
  // ratings や contract が欠けた選手が1人でも混ざると、一覧や出走メンバー選択の描画中に
  // 例外が飛んでルートごとアンマウントされ「画面が真っ白・タップは効く」状態になる。
  // 描画側にも防御を入れてあるが、元データもここで直しておく（正常時は同じ配列をそのまま返す）。
  if (Array.isArray(p.players)) {
    let repaired = 0
    const players = p.players.map(pl => {
      if (!pl || typeof pl !== 'object') return pl
      // 引退選手は能力値を「わざと」消してセーブを軽くしているので、壊れている扱いにしない。
      // ここで埋め戻すと毎回の起動でセーブが元の大きさに戻り、さらに引退時の総合値(finalOvr)ではなく
      // でっちあげた数値が歴代ドラフト等に表示されてしまう。契約(contract)の修復は引退選手にも要る。
      const badRatings = pl.status !== 'retired' && (!pl.ratings || typeof pl.ratings !== 'object'
        || !['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
          .every(k => Number.isFinite((pl.ratings as unknown as Record<string, number>)[k])))
      const badContract = !pl.contract || typeof pl.contract !== 'object'
        || !Number.isFinite(pl.contract.yearsLeft) || !Number.isFinite(pl.contract.annualSalary)
      if (!badRatings && !badContract) return pl
      repaired++
      const base = Math.max(40, Math.min(80, Math.round(pl.potential ?? 60)))
      const c = (pl.contract ?? {}) as Partial<Player['contract']>
      return {
        ...pl,
        // 生きている能力値はそのまま残し、欠けている分だけ potential 基準で埋める
        ratings: badRatings ? (() => {
          const src = (pl.ratings ?? {}) as Record<string, number>
          const out = {} as Record<string, number>
          for (const k of ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']) {
            out[k] = Number.isFinite(src[k]) ? src[k] : base
          }
          return out as unknown as Player['ratings']
        })() : pl.ratings,
        contract: badContract ? {
          yearsLeft: Number.isFinite(c.yearsLeft) ? c.yearsLeft as number : 2,
          annualSalary: Number.isFinite(c.annualSalary) ? c.annualSalary as number : 5_000_000,
          faEligibleYear: Number.isFinite(c.faEligibleYear) ? c.faEligibleYear as number : (p.currentSeason?.year ?? 2027) + 2,
          ...(c.contractType ? { contractType: c.contractType } : {}) } : pl.contract }
    })
    if (repaired > 0) {
      console.error(`[save] repaired ${repaired} broken player record(s)`)
      p.players = players
    }
  }
}
