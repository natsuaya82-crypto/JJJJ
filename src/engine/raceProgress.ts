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
import type { CardStatKey, ForeignLeague, Player, RaceResults, Season, Team } from '../types'
import { withFatigue } from '../utils/condition'
import { ANNUAL_BASE_EXP, allTieredClubs, tierOfPlayerClub } from '../utils/clubTier'
import { GROW_STAT_KEYS, applyGrowth, growWorldPlayer } from './growth'
import { facilitiesOf } from '../utils/facilities'
import { applyRaceMorale, standingOf, type RaceStanding } from './raceMorale'

export function applyRaceProgress(params: {
  players: Player[]
  results: RaceResults
  /** そのレースを走った選手 */
  racingIds: Set<string>
  teams: Team[]
  /** 海外リーグ。CPU・海外の成長の速さ（クラブの格）を引くのに要る */
  foreignLeagues?: ForeignLeague[]
  playerTeamId: string
  currentSeason: Season
  /** 裏で走った部の通算成績の増分（engine/domesticLeague の結果） */
  awayCareerAdd: Record<string, { races: number; segWins: number }>
  /** 裏で走った部の着順（クラブID → 着順と出走数）。士気に使う */
  awayStanding?: Map<string, RaceStanding>
  rng?: () => number
}): { players: Player[]; raceExpGains: Record<string, Partial<Record<CardStatKey, number>>> } {
  const { players, results, racingIds, teams, foreignLeagues, playerTeamId, currentSeason, awayCareerAdd, awayStanding, rng = Math.random } = params
  // ★チームトーク（レース前に「楽しくいこう／勝ちにいく」で士気 +5／+10）は**廃止**
  //   （オーナー・2026-08-12「チームトークは無くした」）。
  //   選ぶ画面がどこにも無く、build 121 から一度も効いていなかった枝。
  const raceExpGainsMap: Record<string, Partial<Record<CardStatKey, number>>> = {}
  // 強化合宿: 自チームのレース獲得EXP ×(1 + Lv×6%)
  // ★施設は `facilitiesOf` を通す（格から出る土台＋自分で建てたぶん）。
  //   `facilities` を直接読むと、建てていない施設が0になって**維持費だけ払う**形になる
  const campLv = facilitiesOf(teams.find(t => t.id === playerTeamId)).trainingCamp
  // ★CPU・海外の成長の速さはそのクラブの格から（`tierGrowthRate`）。
  //   **232クラブの配列は1回だけ組み、格はクラブごとに1回だけ引くこと**——
  //   5,800人ぶん引き直すと1レースが数秒になります
  const tieredClubs = allTieredClubs(teams, foreignLeagues ?? [])
  const tierCache = new Map<string, number>()
  const tierOfClub = (id: string) => {
    const hit = tierCache.get(id)
    if (hit != null) return hit
    const v = tierOfPlayerClub(id, tieredClubs) ?? 20
    tierCache.set(id, v)
    return v
  }
  const seasonRaces = Math.max(1, (currentSeason.races ?? []).length)
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
        if (planStat && rng() < 0.30) {
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
  //   自分の部の着順に、裏で走った部のぶんを重ねる（同じ日に走った全クラブが対象）。
  const standing = new Map(standingOf(results.teamRankings))
  if (awayStanding) for (const [id, st] of awayStanding) standing.set(id, st)
  const segWinIds = new Set<string>([
    ...results.segmentResults.map(sr => sr.runners[0]?.playerId).filter((v): v is string => !!v),
    ...Object.entries(awayCareerAdd).filter(([, a]) => a.segWins > 0).map(([id]) => id),
  ])
  const ranAll = new Set<string>([...racingIds, ...Object.keys(awayCareerAdd)])
  const withMoraleApplied = applyRaceMorale({ players: finalPlayers, standing, segWinIds, racingIds: ranAll })

  return { players: withMoraleApplied, raceExpGains: raceExpGainsMap }
}
