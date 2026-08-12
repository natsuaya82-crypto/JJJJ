// レース1本ぶんの「選手の変化」（store/slices/raceSlice の runRace から切り出し）。
//
// 1人ずつ順に、調子の引き直し → 通算成績 → モラル → 成長(EXP) → 練習プラン
// までを一度に見る。**この5つは1周のループの中で順番が決まっている**ので、
// 分けて何周もしないこと（乱数を引く順が変わって結果が変わる）。
//
// ★成長は「所属していれば全員同じだけ」。走ったかどうかで分けない。
//   分けていた頃は、出場機会の差がそのまま育成の差になっていた。
// ★裏で走った部の選手も通算成績が増える（awayCareerAdd）。抜くと2部3部のCPUだけ
//   実績が伸びず、年俸・移籍金の実績倍率が上がらない。
//
// ★乱数は引数で受ける（既定は Math.random）。1人につき「調子の引き直し」1回、
//   練習プランが効く条件のときだけもう1回。順序は切り出し前と同じ。
import type { CardStatKey, Player, RaceResults, Season, Team } from '../types'
import { withFatigue } from '../utils/condition'
import { ANNUAL_BASE_EXP } from '../utils/clubTier'
import { GROW_STAT_KEYS, applyGrowth } from './growth'
import { DIVISION_SIZE } from '../utils/league'
import type { Division } from '../types'

export function applyRaceProgress(params: {
  players: Player[]
  results: RaceResults
  /** そのレースを走った選手 */
  racingIds: Set<string>
  teams: Team[]
  playerTeamId: string
  myDivision: Division
  currentSeason: Season
  /** 裏で走った部の通算成績の増分（engine/domesticLeague の結果） */
  awayCareerAdd: Record<string, { races: number; segWins: number }>
  rng?: () => number
}): { players: Player[]; raceExpGains: Record<string, Partial<Record<CardStatKey, number>>> } {
  const { players, results, racingIds, teams, playerTeamId, myDivision, currentSeason, awayCareerAdd, rng = Math.random } = params
  const teamRank = results.teamRankings.find(r => r.teamId === playerTeamId)?.rank ?? 0
  // teamRank はそのレースの着順＝自分の部の中での順位。比べる相手も部のチーム数
  const baseMoraleDelta = teamRank === 1 ? 8 : teamRank <= 3 ? 3 : teamRank >= DIVISION_SIZE[myDivision] - 2 ? -5 : 0
  // ★チームトーク（レース前に「楽しくいこう／勝ちにいく」で士気 +5／+10）は**廃止**
  //   （オーナー・2026-08-12「チームトークは無くした」）。
  //   選ぶ画面がどこにも無く、build 121 から一度も効いていなかった枝。
  //   既定が 'best'（どの枝にも当たらない）だったので、外しても士気は1も変わらない。
  const moraleDelta = baseMoraleDelta
  const raceExpGainsMap: Record<string, Partial<Record<CardStatKey, number>>> = {}
  // 強化合宿: 自チームのレース獲得EXP ×(1 + Lv×6%)
  const campLv = teams.find(t => t.id === playerTeamId)?.facilities?.trainingCamp ?? 0
  const finalPlayers = players.map(p => {
    // Form: 設計書準拠 レース後再抽選（絶好調10%/好調25%/普通40%/不調20%/最悪5%）
    const fr = rng()
    const newForm = fr < 0.10 ? 2 : fr < 0.35 ? 1 : fr < 0.75 ? 0 : fr < 0.95 ? -1 : -2
    // Career stats: increment totalRaces and segmentWins for all racers
    const isRacer = racingIds.has(p.id)
    const segWinsThisRace = isRacer
      ? results.segmentResults.filter(sr => sr.runners[0]?.playerId === p.id).length
      : 0
    // 裏で走った部（自分の部以外）の選手も同じだけ通算成績が増える。
    // ここを抜くと2部3部のCPUだけ実績が伸びず、年俸・移籍金の実績倍率が上がらない
    const away = awayCareerAdd[p.id]
    const careerUpdate = isRacer
      ? { career: { ...p.career, totalRaces: p.career.totalRaces + 1, segmentWins: p.career.segmentWins + segWinsThisRace } }
      : away
        ? { career: { ...p.career, totalRaces: p.career.totalRaces + away.races, segmentWins: p.career.segmentWins + away.segWins } }
        : {}

    if (p.teamId !== playerTeamId) return { ...p, form: newForm, ...careerUpdate }

    const segWin = results.segmentResults.some(sr => sr.runners[0]?.playerId === p.id)
    // 役割ミスマッチ：エース/主力を任命したのにベンチだとモラル低下（口約束の代償）
    const roleBenchPenalty = (!isRacer && (p.teamRole === 'ace' || p.teamRole === 'key_player'))
      ? (p.teamRole === 'ace' ? 4 : 2) : 0
    const newMorale = Math.max(10, Math.min(100, (p.morale ?? 70) + moraleDelta + (segWin ? 5 : 0) - roleBenchPenalty))

    // 成長は「所属していれば全員同じだけ」。走ったかどうかで分けない。
    // 1レースぶんの一律EXP＝年間ぶん ÷ レース数 ÷ 能力数。
    // 前は「走った選手＝走った区間の地形別EXP／走らなかった選手＝全能力50EXP」と
    // 分かれていて、出場機会の差がそのまま育成の差になっていた。
    //
    // ★能力数で割るのを忘れないこと。ANNUAL_BASE_EXP は「1年ぶんの合計」であって
    //   1能力あたりではない（CPU側の growPlayer も / GROW_KEYS.length している）。
    //   割らずに7能力それぞれへ配っていたため、自チームだけ7倍もらっていた。
    let newRatings = { ...p.ratings }
    let newExp = { ...(p.exp ?? {}) } as Partial<Record<CardStatKey, number>>
    if (p.status === 'active') {
      const races = Math.max(1, (currentSeason.races ?? []).length)
      const perRace = Math.round(ANNUAL_BASE_EXP / races / GROW_STAT_KEYS.length)
      const seasonGains: Partial<Record<CardStatKey, number>> = {
        speed: perRace, stamina: perRace, mountainUp: perRace, mountainDown: perRace,
        pacing: perRace, mental: perRace, recovery: perRace }
      const outcome = applyGrowth({ player: { ...p, ratings: newRatings, exp: newExp }, source: 'season', baseGains: seasonGains, campLv })
      newRatings = outcome.ratings
      newExp = outcome.exp
      if (racingIds.has(p.id)) raceExpGainsMap[p.id] = outcome.gained
    }

    // Training plan effect (team-wide)
    const plan = currentSeason.trainingPlan
    let planFatigueDelta = 0
    if (plan && p.status === 'active') {
      if (plan === '回復調整') {
        planFatigueDelta = -8
      } else {
        const planStatMap: Record<string, keyof typeof newRatings> = {
          '持久重視': 'stamina', 'スピード重視': 'speed', '精神強化': 'mental', '登り強化': 'mountainUp' }
        const planStat = planStatMap[plan]
        if (planStat && rng() < 0.30) {
          // 練習プランはEXPボーナスとして追加（直接+1ではなく）
          const bonusGain: Partial<Record<CardStatKey, number>> = { [planStat as CardStatKey]: 600 }
          const outcome = applyGrowth({ player: { ...p, ratings: newRatings, exp: newExp }, source: 'plan', baseGains: bonusGain, campLv })
          newRatings = outcome.ratings
          newExp = outcome.exp
        }
      }
    }
    return { ...p, form: newForm, morale: newMorale, ratings: newRatings, exp: newExp, fatigue: withFatigue(p, planFatigueDelta).fatigue, ...careerUpdate }
  })

  return { players: finalPlayers, raceExpGains: raceExpGainsMap }
}
