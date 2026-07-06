import type { CardStatKey, CardRarity, TrainingCard, ComboResult, TraitId } from '../types'

export const CARD_STAT_LABELS: Record<CardStatKey, string> = {
  speed: 'インターバル走',
  stamina: 'ロング走',
  mountainUp: '登坂走',
  mountainDown: '下り走',
  pacing: 'ペース走',
  mental: '集中走',
  recovery: 'ジョグ',
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

// カード合成の最大枚数
export const MAX_FUSION_CARDS = 5

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

// ─── 練習メニュー（レシピ） ───
// 使ったカードの「種類（statKey）」の組み合わせが下のレシピと一致した時だけメニュー成立。
// レシピ外はボーナスなし（通常合成 ×1.0）。同じカードを何枚重ねても種類は増えないのでボーナスにならない。
// 倍率は種類数で決まる: 2種×1.2 / 3種×1.4 / 4種×1.6 / 5種×1.8。
type Recipe = { types: CardStatKey[]; name: string; color: string; trait?: TraitId }

const MENU_MULT: Record<number, number> = { 2: 1.2, 3: 1.4, 4: 1.6, 5: 1.8 }

const RECIPES: Recipe[] = [
  // 2種 ×1.2
  { types: ['speed', 'stamina'], name: '重戦車', color: '#3B82F6' },
  { types: ['speed', 'pacing'], name: '快速', color: '#3B82F6' },
  { types: ['stamina', 'pacing'], name: '巡航', color: '#3B82F6' },
  { types: ['mountainUp', 'mountainDown'], name: '峠越え', color: '#3B82F6' },
  { types: ['mountainUp', 'stamina'], name: '山岳魂', color: '#3B82F6' },
  { types: ['speed', 'mental'], name: '勝負師', color: '#3B82F6' },
  { types: ['pacing', 'mental'], name: 'レース巧者', color: '#3B82F6' },
  { types: ['stamina', 'recovery'], name: '不屈', color: '#3B82F6' },
  { types: ['recovery', 'mental'], name: '精神統一', color: '#3B82F6' },
  // 3種 ×1.4
  { types: ['stamina', 'pacing', 'recovery'], name: '鉄人', color: '#8B5CF6' },
  { types: ['mountainUp', 'mountainDown', 'stamina'], name: '山神', color: '#8B5CF6', trait: 'mountain_ace' },
  { types: ['speed', 'pacing', 'mental'], name: '韋駄天', color: '#8B5CF6', trait: 'sprint_burst' },
  { types: ['speed', 'stamina', 'mountainUp'], name: '怪物', color: '#8B5CF6' },
  // 4種 ×1.6
  { types: ['speed', 'stamina', 'pacing', 'mental'], name: '無双', color: '#EF4444' },
  { types: ['mountainUp', 'mountainDown', 'stamina', 'pacing'], name: '縦横無尽', color: '#EF4444' },
  { types: ['speed', 'stamina', 'mountainUp', 'mountainDown'], name: '万能', color: '#EF4444' },
  // 5種 ×1.8
  { types: ['speed', 'stamina', 'pacing', 'mental', 'recovery'], name: '絶対王者', color: '#F59E0B', trait: 'clutch' },
  { types: ['mountainUp', 'mountainDown', 'stamina', 'pacing', 'mental'], name: '山岳王者', color: '#F59E0B', trait: 'iron_will' },
]

function recipeKey(types: CardStatKey[]): string {
  return [...types].sort().join('+')
}

const RECIPE_MAP = new Map(RECIPES.map(r => [recipeKey(r.types), r]))

// 選択中のカードから成立するメニューを事前に判定（UI表示用）。カード未選択でも呼べる。
export function detectMenu(statKeys: CardStatKey[]): Recipe | null {
  return RECIPE_MAP.get(recipeKey(statKeys)) ?? null
}

export function detectCombo(cards: TrainingCard[]): ComboResult | null {
  if (cards.length === 0) return null

  const statValues: Partial<Record<CardStatKey, number>> = {}
  for (const c of cards) {
    statValues[c.statKey] = (statValues[c.statKey] ?? 0) + c.value
  }
  const distinct = Object.keys(statValues) as CardStatKey[]

  const recipe = RECIPE_MAP.get(recipeKey(distinct))
  if (recipe) {
    const mult = MENU_MULT[distinct.length] ?? 1.0
    const deltas: Partial<Record<CardStatKey, number>> = {}
    for (const key of distinct) deltas[key] = Math.round((statValues[key] ?? 0) * mult)
    const allRarePlus = cards.every(c => isRarePlus(c.rarity))
    return {
      name: recipe.name,
      color: recipe.color,
      statDeltas: deltas,
      isSpecial: distinct.length >= 3,
      traitGrant: recipe.trait && allRarePlus ? recipe.trait : undefined,
      traitChance: recipe.trait && allRarePlus ? 0.30 : undefined,
    }
  }

  // レシピ外: 通常合成（ボーナスなし ×1.0）
  const deltas: Partial<Record<CardStatKey, number>> = {}
  for (const key of distinct) deltas[key] = statValues[key] ?? 0
  return {
    name: '通常合成',
    color: '#4B5563',
    statDeltas: deltas,
    isSpecial: false,
  }
}
