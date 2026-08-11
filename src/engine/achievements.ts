// 実績（ジュエル報酬）とシーズン目標の判定（gameStore から移設）。

import { type Achievement, type Player } from '../types'
import { ovr } from '../utils/playerUtils'

export const ACHIEVEMENT_JEWELS: Record<string, number> = {
  bronze: 10, silver: 20, gold: 50, legendary: 100 }

/**
 * 年間の表彰台に立ったときのジュエル。**国内の最終順位もECLの年間総合も同じ表。**
 * 同じ 200/100/50 が2か所に書かれていたので、片方だけ変えるとどちらかがズレる。
 */
export function podiumJewels(rank: number): number {
  return rank === 1 ? 200 : rank === 2 ? 100 : rank === 3 ? 50 : 0
}

export function checkRaceAchievements(params: {
  playerRank: number
  mySegWinCount: number
  totalSegments: number
  year: number
  raceName: string
  existing: Achievement[]
}): Achievement[] {
  const { playerRank, mySegWinCount, totalSegments, year, raceName, existing } = params
  const newAchievements: Achievement[] = []
  const has = (id: string) => existing.some(a => a.id === id)

  if (playerRank <= 3 && !has('top3_first')) {
    newAchievements.push({ id: 'top3_first', name: '初TOP3', desc: 'レースで初めてトップ3に入賞', earnedAtYear: year, earnedAtRace: raceName, rarity: 'bronze' })
  }
  if (playerRank === 1 && !has('first_win')) {
    newAchievements.push({ id: 'first_win', name: '初勝利', desc: 'レースで初めて1位を獲得', earnedAtYear: year, earnedAtRace: raceName, rarity: 'bronze' })
  }
  if (mySegWinCount >= 1 && !has('first_seg_win')) {
    newAchievements.push({ id: 'first_seg_win', name: '初区間賞', desc: '初めて区間賞を獲得', earnedAtYear: year, earnedAtRace: raceName, rarity: 'bronze' })
  }
  if (mySegWinCount >= 3 && !has('hat_trick')) {
    newAchievements.push({ id: 'hat_trick', name: 'ハットトリック', desc: '1レースで3区間以上を制覇', earnedAtYear: year, earnedAtRace: raceName, rarity: 'silver' })
  }
  if (totalSegments > 0 && mySegWinCount === totalSegments && !has('segment_sweep')) {
    newAchievements.push({ id: 'segment_sweep', name: '区間完全制覇', desc: '1レースで全区間1位を獲得', earnedAtYear: year, earnedAtRace: raceName, rarity: 'gold' })
  }
  return newAchievements
}

export function checkSeasonAchievements(params: {
  finalRank: number
  year: number
  totalChamps: number
  curStreak: number
  seasonSegWins: number
  totalSeasons: number
  players: Player[]
  playerTeamId: string
  existing: Achievement[]
}): Achievement[] {
  const { finalRank, year, totalChamps, curStreak, seasonSegWins, totalSeasons, players, playerTeamId, existing } = params
  const newAchievements: Achievement[] = []
  const has = (id: string) => existing.some(a => a.id === id)

  if (totalSeasons >= 1 && !has('season_complete')) {
    newAchievements.push({ id: 'season_complete', name: 'シーズン完走', desc: '初めてのシーズンを完走した', earnedAtYear: year, rarity: 'bronze' })
  }
  if (finalRank === 2 && !has('runner_up')) {
    newAchievements.push({ id: 'runner_up', name: '準優勝', desc: 'シーズン2位フィニッシュ', earnedAtYear: year, rarity: 'bronze' })
  }
  if (finalRank === 1 && !has('champion')) {
    newAchievements.push({ id: 'champion', name: 'リーグ王者', desc: 'シーズン1位を獲得', earnedAtYear: year, rarity: 'gold' })
  }
  if (curStreak >= 2 && !has('back_to_back')) {
    newAchievements.push({ id: 'back_to_back', name: '2連覇', desc: '2シーズン連続で優勝', earnedAtYear: year, rarity: 'gold' })
  }
  if (curStreak >= 3 && !has('dynasty')) {
    newAchievements.push({ id: 'dynasty', name: '王朝の始まり', desc: '3連覇を達成', earnedAtYear: year, rarity: 'legendary' })
  }
  if (totalChamps >= 5 && !has('dynasty_5')) {
    newAchievements.push({ id: 'dynasty_5', name: '黄金王朝', desc: '通算5回の優勝を達成', earnedAtYear: year, rarity: 'legendary' })
  }
  if (seasonSegWins >= 5 && !has('segment_hunter')) {
    newAchievements.push({ id: 'segment_hunter', name: '区間賞ハンター', desc: '1シーズンで5区間賞以上を獲得', earnedAtYear: year, rarity: 'silver' })
  }
  if (seasonSegWins >= 10 && !has('segment_king')) {
    newAchievements.push({ id: 'segment_king', name: '区間賞の帝王', desc: '1シーズンで10区間賞以上を獲得', earnedAtYear: year, rarity: 'gold' })
  }
  const myPlayers = players.filter(p => p.teamId === playerTeamId)
  const myMainPlayers = myPlayers
  if (myPlayers.some(p => ovr(p) >= 85) && !has('ace_breeder')) {
    newAchievements.push({ id: 'ace_breeder', name: 'エース育成者', desc: 'OVR85以上の選手を育成', earnedAtYear: year, rarity: 'silver' })
  }
  if (myMainPlayers.filter(p => ovr(p) >= 80).length >= 2 && !has('ace_factory')) {
    newAchievements.push({ id: 'ace_factory', name: 'エース工場', desc: 'OVR80以上の選手を2人以上保有', earnedAtYear: year, rarity: 'gold' })
  }
  if (myPlayers.some(p => p.career.mvpAwards >= 1) && !has('mvp_maker')) {
    newAchievements.push({ id: 'mvp_maker', name: 'MVP輩出', desc: 'チームからMVP選手を輩出', earnedAtYear: year, rarity: 'silver' })
  }
  if (myMainPlayers.filter(p => p.age <= 22).length >= 3 && !has('youth_wave')) {
    newAchievements.push({ id: 'youth_wave', name: '若手の台頭', desc: '22歳以下の選手を3人以上1軍に起用', earnedAtYear: year, rarity: 'bronze' })
  }
  if (myMainPlayers.some(p => p.age >= 35) && !has('veteran_pride')) {
    newAchievements.push({ id: 'veteran_pride', name: 'ベテランの意地', desc: '35歳以上の選手が1軍で活躍', earnedAtYear: year, rarity: 'bronze' })
  }
  if (myMainPlayers.length >= 18 && !has('deep_squad')) {
    newAchievements.push({ id: 'deep_squad', name: '選手層充実', desc: '1軍登録選手が18名以上', earnedAtYear: year, rarity: 'silver' })
  }
  return newAchievements
}

// シーズン目標。チーム目標＝順位で、前年順位からスケール（初年度は緩め、強くなるほど厳しく）。
export function selectSeasonObjectives(hasRival: boolean, teamsLen: number, prevRank?: number) {
  type ObjTemplate = { id: string; desc: string; target: number; rewardJewels: number }
  // 順位目標：初年度はリーグ中位あたりの緩い目標。以降は前年順位から1つ上を狙う（優勝後は優勝維持）。
  const targetRank = prevRank == null
    ? Math.max(6, Math.round(teamsLen * 0.6))
    : Math.max(1, prevRank - 1)
  const rankObj: ObjTemplate = {
    id: 'topN',
    desc: targetRank <= 1 ? '総合優勝' : `トップ${targetRank}フィニッシュ`,
    target: targetRank,
    rewardJewels: targetRank <= 1 ? 150 : targetRank <= 3 ? 80 : targetRank <= 5 ? 50 : 30 }
  const pool: ObjTemplate[] = [
    { id: 'segWins', desc: '区間賞1回獲得', target: 1, rewardJewels: 20 },
    { id: 'segWins', desc: '区間賞3回獲得', target: 3, rewardJewels: 50 },
    { id: 'segWins', desc: '区間賞5回獲得', target: 5, rewardJewels: 80 },
    { id: 'winRace', desc: 'レース優勝1回', target: 1, rewardJewels: 40 },
    { id: 'winRace', desc: 'レース優勝2回', target: 2, rewardJewels: 70 },
    { id: 'noInjury', desc: 'シーズン通じて主力選手の怪我なし', target: 0, rewardJewels: 40 },
    { id: 'budgetMaintain', desc: 'シーズン終了時に1000万以上残す', target: 10000000, rewardJewels: 20 },
    { id: 'budgetMaintain', desc: 'シーズン終了時に3000万以上残す', target: 30000000, rewardJewels: 40 },
    { id: 'budgetMaintain', desc: 'シーズン終了時に5000万以上残す', target: 50000000, rewardJewels: 60 },
  ]
  if (hasRival) {
    pool.push(
      { id: 'rivalBeat', desc: 'ライバルに1回勝利', target: 1, rewardJewels: 30 },
      { id: 'rivalBeat', desc: 'ライバルに2回以上勝利', target: 2, rewardJewels: 50 },
    )
  }
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const selected: ObjTemplate[] = [rankObj]   // 順位目標は常に含める
  const usedIds = new Set<string>(['topN'])
  for (const o of shuffled) {
    if (!usedIds.has(o.id) && selected.length < 5) {
      selected.push(o)
      usedIds.add(o.id)
    }
  }
  return selected.map(o => ({
    id: o.id, desc: o.desc, target: o.target,
    current: o.id === 'topN' ? 99 : 0,
    rewardPts: 0, rewardBudget: 0, rewardJewels: o.rewardJewels, done: false }))
}

// set に渡せる形（zustand と同じ）。replace の第2引数はこの store では一度も使っていない
