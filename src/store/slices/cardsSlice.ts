// cards ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
import { CARD_UNIT_EXP, CARD_UNIT_PRICE } from '../../data/cardShop'
import { applyGrowth } from '../../engine/growth'
import { type CardRarity, type CardStatKey, type Player, type TrainingCard } from '../../types'
import { MAX_FUSION_CARDS, detectCombo, planExchange } from '../../utils/cardCombo'
import { rankOfTeam, seasonDivisionStandings } from '../../utils/league'
import { getStatPotentials, limitBreakCost } from '../../utils/playerUtils'

type Slice = Pick<GameStore,
  'claimPreseasonCards' | 'buyTrainingCard' | 'applyTrainingCards' | 'exchangeCards' | 'breakStatLimit' | 'removeTrainingCard' | 'addTrainingCards' | 'dismissDroppedCards' | 'setFusionPlayer' | 'addFusionCard' | 'removeFusionCard' | 'clearFusion' | 'setTrainingFocus' | 'setTrainingPlan'>

export const createCardsSlice = (set: SetGame, get: () => GameStore): Slice => ({

  setFusionPlayer: (id) => set({ fusionPlayerId: id, fusionCardIds: [] }),

  addFusionCard: (id) => set((state) => {
    if (state.fusionCardIds.includes(id) || state.fusionCardIds.length >= MAX_FUSION_CARDS) return {}
    return { fusionCardIds: [...state.fusionCardIds, id] }
  }),

  removeFusionCard: (id) => set((state) => ({ fusionCardIds: state.fusionCardIds.filter(x => x !== id) })),

  clearFusion: () => set({ fusionPlayerId: null, fusionCardIds: [] }),


  setTrainingFocus: (playerId, ratingKey) => {
    set(state => ({
      currentSeason: {
        ...state.currentSeason,
        trainingAssignments: ratingKey === null
          ? Object.fromEntries(Object.entries(state.currentSeason.trainingAssignments ?? {}).filter(([k]) => k !== playerId))
          : { ...(state.currentSeason.trainingAssignments ?? {}), [playerId]: ratingKey } }
    }))
  },


  setTrainingPlan: (plan) => {
    set(state => ({
      currentSeason: { ...state.currentSeason, trainingPlan: plan } }))
  },


  claimPreseasonCards: () => {
    set(state => {
      if (state.currentSeason.campBonus?.applied) return state
      const lastSeason = state.pastSeasons[state.pastSeasons.length - 1]
      let rank = 0
      if (lastSeason) {
        rank = rankOfTeam(seasonDivisionStandings(lastSeason, state.playerTeamId), state.playerTeamId)
      }
      type Dist = { rarity: CardRarity; count: number }
      const dist: Dist[] =
        rank === 1 ? [{ rarity: 'legendary', count: 1 }, { rarity: 'epic', count: 1 }, { rarity: 'rare', count: 2 }, { rarity: 'normal', count: 2 }] :
        rank === 2 ? [{ rarity: 'epic', count: 1 }, { rarity: 'rare', count: 2 }, { rarity: 'normal', count: 3 }] :
        rank === 3 ? [{ rarity: 'epic', count: 1 }, { rarity: 'rare', count: 1 }, { rarity: 'normal', count: 4 }] :
        rank <= 6  ? [{ rarity: 'rare', count: 2 }, { rarity: 'normal', count: 4 }] :
        rank <= 10 ? [{ rarity: 'rare', count: 1 }, { rarity: 'normal', count: 5 }] :
        rank <= 14 ? [{ rarity: 'normal', count: 6 }] :
        rank >= 15 ? [{ rarity: 'epic', count: 1 }, { rarity: 'normal', count: 6 }] :
        [{ rarity: 'rare', count: 1 }, { rarity: 'normal', count: 5 }]
      const STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
      const cards: TrainingCard[] = []
      let idx = 0
      for (const { rarity, count } of dist) {
        for (let i = 0; i < count; i++) {
          cards.push({
            id: `preseason_${state.playerTeamId}_${Date.now()}_${idx++}`,
            statKey: STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)],
            rarity,
            value: CARD_UNIT_EXP[rarity] })
        }
      }
      return {
        trainingCards: [...(state.trainingCards ?? []), ...cards],
        currentSeason: { ...state.currentSeason, campBonus: { type: 'preseason_cards', applied: true } } }
    })
  },


  buyTrainingCard: (rarity, qty = 1) => {
    // 値段とEXPは data/cardShop.ts の1本（画面と同じ数字を見る）
    const STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
    const state = get()
    const price = CARD_UNIT_PRICE[rarity]
    if (price === undefined) return false
    if ((state.jewels ?? 0) < price * qty) return false
    const cards: TrainingCard[] = Array.from({ length: qty }, (_, i) => ({
      id: `shop_${rarity}_${Date.now()}_${i}`,
      statKey: STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)],
      rarity,
      value: CARD_UNIT_EXP[rarity] }))
    set(s => ({
      trainingCards: [...(s.trainingCards ?? []), ...cards],
      jewels: (s.jewels ?? 0) - price * qty }))
    return cards
  },


  applyTrainingCards: (playerId, cardIds, multiplier = 1.0) => {
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      if (!player) return state
      const cards = (state.trainingCards ?? []).filter(c => cardIds.includes(c.id))
      if (cards.length === 0) return state
      const combo = detectCombo(cards)
      if (!combo) return state
      // statDeltas は EXP量（設計書準拠）。ポテ・年齢倍率なし（固定EXP付与）
      const result = applyGrowth({
        player,
        source: 'card',
        baseGains: combo.statDeltas as Partial<Record<CardStatKey, number>>,
        bonusMultiplier: multiplier })
      // 疲労回復（完全休養／超回復）。大成功倍率(multiplier)も疲労に掛ける。
      const fatigueRecovered = combo.fatigueDelta ? Math.round(combo.fatigueDelta * multiplier) : 0
      const newFatigue = Math.max(0, (player.fatigue ?? 0) - fatigueRecovered)
      const remaining = (state.trainingCards ?? []).filter(c => !cardIds.includes(c.id))
      return {
        trainingCards: remaining,
        players: state.players.map(p =>
          p.id === playerId ? { ...p, ratings: result.ratings, exp: result.exp, fatigue: newFatigue } : p
        ) }
    })
  },


  // カードの交換。何を何枚消して何をもらうかは utils/cardCombo.ts の表が決める
  exchangeCards: (ex, statKey) => {
    const plan = planExchange(get().trainingCards ?? [], ex, statKey)
    if (!plan) return 0
    set(s => ({ trainingCards: [...(s.trainingCards ?? []).filter(c => !plan.consumeIds.has(c.id)), ...plan.produced] }))
    return plan.produced.length
  },


  breakStatLimit: (playerId, stat) => {
    set(state => {
      const player = state.players.find(p => p.id === playerId)
      if (!player) return state
      const cap = (getStatPotentials(player) as Record<string, number>)[stat]
      if (cap >= 99) return state
      const cost = limitBreakCost(cap + 1)
      if ((state.jewels ?? 0) < cost) return state
      // 上限が確実に+1されるまでboostを積む（現在値>基礎上限のエッジケースで空振りしないように）
      let np: Player = { ...player, potentialBoosts: { ...(player.potentialBoosts ?? {}), [stat]: (player.potentialBoosts?.[stat] ?? 0) + 1 } }
      let guard = 0
      while ((getStatPotentials(np) as Record<string, number>)[stat] <= cap && guard++ < 30) {
        np = { ...np, potentialBoosts: { ...np.potentialBoosts, [stat]: (np.potentialBoosts?.[stat] ?? 0) + 1 } }
      }
      return {
        jewels: state.jewels - cost,
        players: state.players.map(p => p.id === playerId ? np : p) }
    })
  },


  // 走友会でカードを渡したとき（手元から1枚減らす）
  removeTrainingCard: (cardId) =>
    set(s => ({ trainingCards: (s.trainingCards ?? []).filter(c => c.id !== cardId) })),


  // 走友会でカードをもらったとき。idがぶつかると練習で消えなくなるので付け直す
  addTrainingCards: (cards) =>
    set(s => {
      const have = new Set((s.trainingCards ?? []).map(c => c.id))
      const add = cards.map((c, i) =>
        have.has(c.id) ? { ...c, id: `${c.id}_g${Date.now()}_${i}` } : c)
      return { trainingCards: [...(s.trainingCards ?? []), ...add] }
    }),


  dismissDroppedCards: () => set({ raceDroppedCards: [], raceExpGains: {} }),
})
