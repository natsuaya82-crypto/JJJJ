import type { CardStatKey, CardRarity, TrainingCard, ComboResult, TraitId } from '../types'

export const CARD_STAT_LABELS: Record<CardStatKey, string> = {
  speed: 'スピード',
  stamina: 'スタミナ',
  mountainUp: '山登り',
  mountainDown: '山下り',
  pacing: 'ペース配分',
  mental: 'メンタル',
  recovery: '回復力',
}

export const RARITY_COLORS: Record<CardRarity, string> = {
  normal: '#7A7A8C',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
}

export const RARITY_LABELS: Record<CardRarity, string> = {
  normal: 'ノーマル',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンダリー',
}

export const RARITY_BG: Record<CardRarity, string> = {
  normal: '#1E1E2E',
  rare: '#1E2A3E',
  epic: '#2A1E3E',
  legendary: '#3E2E1E',
}

const STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

// 設計書準拠: カードはEXPを付与（ノーマル300 / レア1200 / エピック4000 / レジェンド10000）
export const RARITY_EXP: Record<CardRarity, number> = {
  normal: 300,
  rare: 1200,
  epic: 4000,
  legendary: 10000,
}

const RARITY_VALUE: Record<CardRarity, number> = RARITY_EXP

let _cardIdCounter = 0
function newCardId(): string {
  return `card_${Date.now()}_${_cardIdCounter++}`
}

export function generateTrainingCard(rarity: CardRarity): TrainingCard {
  const statKey = STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)]
  return {
    id: newCardId(),
    statKey,
    rarity,
    value: RARITY_VALUE[rarity],
  }
}

// 設計書準拠: 全チーム2枚 / 区間賞→+レア / 3位以内→+エピック / 優勝→+レジェンド（エピックの代わり）
export function generateDropCards(rank: number, _totalTeams: number, segmentWon = false): TrainingCard[] {
  const cards: TrainingCard[] = []
  cards.push(generateTrainingCard('normal'))
  cards.push(generateTrainingCard('normal'))
  cards.push(generateTrainingCard('normal'))
  if (segmentWon) cards.push(generateTrainingCard('rare'))
  if (rank === 1) cards.push(generateTrainingCard('legendary'))
  else if (rank <= 3) cards.push(generateTrainingCard('epic'))
  else if (rank <= 6) cards.push(generateTrainingCard('rare'))
  return cards
}

function isRarePlus(r: CardRarity): boolean {
  return r === 'rare' || r === 'epic' || r === 'legendary'
}

export function detectCombo(cards: TrainingCard[]): ComboResult | null {
  if (cards.length === 0) return null

  const statCounts: Partial<Record<CardStatKey, number>> = {}
  const statValues: Partial<Record<CardStatKey, number>> = {}
  for (const c of cards) {
    statCounts[c.statKey] = (statCounts[c.statKey] ?? 0) + 1
    statValues[c.statKey] = (statValues[c.statKey] ?? 0) + c.value
  }

  const allRarePlus = cards.every(c => isRarePlus(c.rarity))
  const anyRarePlus = cards.some(c => isRarePlus(c.rarity))
  const statKeys = Object.keys(statCounts) as CardStatKey[]

  // 究極覚醒: 5枚同じステータス
  for (const key of statKeys) {
    if ((statCounts[key] ?? 0) >= 5) {
      const base = statValues[key] ?? 0
      const boosted = Math.round(base * 2.2)
      const traitMap: Partial<Record<CardStatKey, TraitId>> = {
        mountainUp: 'mountain_ace',
        speed: 'sprint_burst',
        stamina: 'iron_will',
        mental: 'clutch',
      }
      return {
        name: '究極覚醒',
        color: '#F59E0B',
        statDeltas: { [key]: boosted },
        traitGrant: traitMap[key],
        traitChance: 0.40,
        isSpecial: true,
      }
    }
  }

  // 山岳覚醒: mountainUp + mountainDown + stamina, 全部レア以上
  if (
    (statCounts.mountainUp ?? 0) >= 1 &&
    (statCounts.mountainDown ?? 0) >= 1 &&
    (statCounts.stamina ?? 0) >= 1 &&
    allRarePlus
  ) {
    return {
      name: '山岳覚醒',
      color: '#10B981',
      statDeltas: { mountainUp: 5000, mountainDown: 5000, stamina: 3000 },
      traitGrant: 'mountain_ace',
      traitChance: 0.25,
      isSpecial: true,
    }
  }

  // スプリンター覚醒: speed×2 + pacing, 2枚以上レア
  if (
    (statCounts.speed ?? 0) >= 2 &&
    (statCounts.pacing ?? 0) >= 1 &&
    cards.filter(c => c.statKey === 'speed' && isRarePlus(c.rarity)).length >= 2
  ) {
    return {
      name: 'スプリンター覚醒',
      color: '#EF4444',
      statDeltas: { speed: 5000, pacing: 3000 },
      traitGrant: 'sprint_burst',
      traitChance: 0.25,
      isSpecial: true,
    }
  }

  // 鉄壁メンタル覚醒: mental×2 + recovery, 全部レア以上
  if (
    (statCounts.mental ?? 0) >= 2 &&
    (statCounts.recovery ?? 0) >= 1 &&
    allRarePlus
  ) {
    return {
      name: '鉄壁メンタル覚醒',
      color: '#8B5CF6',
      statDeltas: { mental: 6000, recovery: 4000 },
      traitGrant: 'iron_will',
      traitChance: 0.20,
      isSpecial: true,
    }
  }

  // 特別特訓: 3枚同じ、全部レア以上
  for (const key of statKeys) {
    if ((statCounts[key] ?? 0) >= 3 && cards.filter(c => c.statKey === key).every(c => isRarePlus(c.rarity))) {
      const base = statValues[key] ?? 0
      return {
        name: '特別特訓',
        color: '#3B82F6',
        statDeltas: { [key]: Math.round(base * 1.8) },
        isSpecial: true,
      }
    }
  }

  // 特訓: 3枚同じ
  for (const key of statKeys) {
    if ((statCounts[key] ?? 0) >= 3) {
      const base = statValues[key] ?? 0
      return {
        name: '特訓',
        color: '#6366F1',
        statDeltas: { [key]: Math.round(base * 1.3) + 1 },
        isSpecial: false,
      }
    }
  }

  // 総合特訓: 7種類すべて
  if (statKeys.length >= 7) {
    const deltas: Partial<Record<CardStatKey, number>> = {}
    for (const key of statKeys) {
      deltas[key] = (statValues[key] ?? 0) + 2
    }
    return {
      name: '総合特訓',
      color: '#F59E0B',
      statDeltas: deltas,
      isSpecial: true,
    }
  }

  // コンボなし: 通常合成
  if (cards.length >= 1 && anyRarePlus) {
    const deltas: Partial<Record<CardStatKey, number>> = {}
    for (const key of statKeys) {
      deltas[key] = statValues[key] ?? 0
    }
    return {
      name: '通常合成',
      color: '#4B5563',
      statDeltas: deltas,
      isSpecial: false,
    }
  }

  // 1枚だけ通常
  if (cards.length >= 1) {
    const deltas: Partial<Record<CardStatKey, number>> = {}
    for (const key of statKeys) {
      deltas[key] = statValues[key] ?? 0
    }
    return {
      name: '通常合成',
      color: '#4B5563',
      statDeltas: deltas,
      isSpecial: false,
    }
  }

  return null
}
