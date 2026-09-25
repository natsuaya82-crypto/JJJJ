// レース1本ぶんの「選手の変化」（store/slices/raceSlice の runRace から切り出し）。
//
// 1人ずつ順に、調子の引き直し → 通算成績 → モラル → 成長(EXP) → 練習プラン
// までを一度に見る。**この5つは1周のループの中で順番が決まっている**ので、
// 分けて何周もしないこと（乱数を引く順が変わって結果が変わる）。
//
// ★成長は「所属していれば全員同じだけ」。走ったかどうかで分けない。
//   分けていた頃は、出場機会の差がそのまま育成の差になっていた。
// ★ほかのリーグ（国内の他の部・海外）の選手の通算成績と士気は、そのリーグのレースを
//   走らせたとき（engine/leagueDay の runLeaguesThrough）に動く。ここは自チームのリーグの1戦だけ。
//
// ★乱数は引数で受ける（既定は Math.random）。1人につき「調子の引き直し」1回、
//   練習プランが効く条件のときだけもう1回。順序は切り出し前と同じ。
import type { CardStatKey, Player, RaceResults, Season, WorldClub } from '../types'
import { withFatigue } from '../utils/condition'
import { myClub, myLeagueRaces } from '../utils/world'
import { ANNUAL_BASE_EXP, tierOfPlayerClub } from '../utils/clubTier'
import { GROW_STAT_KEYS, applyGrowth, growWorldPlayer } from './growth'
import { facilitiesOf } from '../utils/facilities'
import { applyRaceMorale, standingOf } from './raceMorale'

/**
 * **練習プランが当たる確率。ここ1本。**
 * 画面（`components/team/TeamManagement` のプラン一覧）も同じこれを出すこと。
 * 以前は engine が `0.30`・画面の文字が「確率35%」で、**遊ぶ人に見える数字だけが嘘**でした。
 */
export const TRAINING_PLAN_CHANCE = 0.30

export function applyRaceProgress(params: {
  players: Player[]
  results: RaceResults
  /** そのレースを走った選手 */
  racingIds: Set<string>
  /** 世界のクラブ。CPU・海外の成長の速さ（クラブの格）を引くのに要る */
  clubs: WorldClub[]
  playerTeamId: string
  currentSeason: Season
  rng?: () => number
}): { players: Player[]; raceExpGains: Record<string, Partial<Record<CardStatKey, number>>> } {
  const { players, results, racingIds, clubs, playerTeamId, currentSeason, rng = Math.random } = params
  // ★チームトーク（レース前に「楽しくいこう／勝ちにいく」で士気 +5／+10）は**廃止**
  //   （オーナー・2026-08-12「チームトークは無くした」）。
  //   選ぶ画面がどこにも無く、build 121 から一度も効いていなかった枝。
  const raceExpGainsMap: Record<string, Partial<Record<CardStatKey, number>>> = {}
  // 強化合宿: 自チームのレース獲得EXP ×(1 + Lv×6%)
  // ★施設は `facilitiesOf` を通す（格から出る土台＋自分で建てたぶん）。
  //   `facilities` を直接読むと、建てていない施設が0になって**維持費だけ払う**形になる
  const campLv = facilitiesOf(myClub({ clubs, playerTeamId })).trainingCamp
  // ★CPU・海外の成長の速さはそのクラブの格から（`tierGrowthRate`）。
  //   **232クラブの配列は1回だけ組み、格はクラブごとに1回だけ引くこと**——
  //   5,800人ぶん引き直すと1レースが数秒になります
  const tierCache = new Map<string, number>()
  const tierOfClub = (id: string) => {
    const hit = tierCache.get(id)
    if (hit != null) return hit
    const v = tierOfPlayerClub(id, clubs) ?? 20
    tierCache.set(id, v)
    return v
  }
  const seasonRaces = Math.max(1, myLeagueRaces(currentSeason, playerTeamId).length)
  const finalPlayers = players.map(p => {
    // Form: 設計書準拠 レース後再抽選（絶好調10%/好調25%/普通40%/不調20%/最悪5%）
    const fr = rng()
    const newForm = fr < 0.10 ? 2 : fr < 0.35 ? 1 : fr < 0.75 ? 0 : fr < 0.95 ? -1 : -2
    // Career stats: increment totalRaces and segmentWins for all racers
    const isRacer = racingIds.has(p.id)
    const segWinsThisRace = isRacer
      ? results.segmentResults.filter(sr => sr.runners[0]?.playerId === p.id).length
      : 0
    const careerUpdate = isRacer
      ? { career: { ...p.career, totalRaces: p.career.totalRaces + 1, segmentWins: p.career.segmentWins + segWinsThisRace } }
      : {}

    // ★**CPU・海外の成長もここで配ります**（2026-08-20。オーナー「レースごとだと
    //   嬉しいけど、重くなるようなら仕方ない」→ 実測 15ms/レース＝runRace の +3%）。
    //   以前は `growPlayer` が年1回まとめて配っていて、**自チームだけがシーズン中に
    //   伸びる**形でした。1年ぶんの量は変えていません（年間ぶん ÷ レース数。実測で
    //   到達点は 91.6% が完全一致・OVRの差の平均 0.02・最大2）。
    //   ★倍率の差は `SOURCE_RULES` の表だけで表します（`world` は年齢・ポテンシャル・
    //     施設が全部 false）。`season` を当てるとCPUだけ年 +1.15 OVR 速くなります。
    if (p.teamId !== playerTeamId) {
      if (p.status !== 'active') return { ...p, form: newForm, ...careerUpdate }
      const grown = growWorldPlayer(p, tierOfClub(p.teamId) as never, seasonRaces)
      return { ...grown, form: newForm, ...careerUpdate }
    }

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
      const perRace = Math.round(ANNUAL_BASE_EXP / seasonRaces / GROW_STAT_KEYS.length)
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
        if (planStat && rng() < TRAINING_PLAN_CHANCE) {
          // 練習プランはEXPボーナスとして追加（直接+1ではなく）
          const bonusGain: Partial<Record<CardStatKey, number>> = { [planStat as CardStatKey]: 600 }
          const outcome = applyGrowth({ player: { ...p, ratings: newRatings, exp: newExp }, source: 'plan', baseGains: bonusGain, campLv })
          newRatings = outcome.ratings
          newExp = outcome.exp
        }
      }
    }
    return { ...p, form: newForm, ratings: newRatings, exp: newExp, fatigue: withFatigue(p, planFatigueDelta).fatigue, ...careerUpdate }
  })

  // ★士気は `engine/raceMorale` 1本。**自チームだけでなく、走ったクラブ全部**が動く
  //   （以前はここで自チームだけを動かしていたので、CPU・海外は一生100のままだった）。
  //   ほかのリーグのぶんは、そのリーグのレースを走らせたとき（engine/leagueDay）に動く。
  const standing = standingOf(results.teamRankings)
  const segWinIds = new Set<string>(
    results.segmentResults.map(sr => sr.runners[0]?.playerId).filter((v): v is string => !!v))
  const withMoraleApplied = applyRaceMorale({ players: finalPlayers, standing, segWinIds, racingIds })

  return { players: withMoraleApplied, raceExpGains: raceExpGainsMap }
}
