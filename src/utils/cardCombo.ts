import type { CardStatKey, CardRarity, TrainingCard, ComboResult } from '../types'

// 能力（ステータス）の名前。選手の能力表示・EXPプレビュー・結果画面はこちらを使う。
export const CARD_STAT_LABELS: Record<CardStatKey, string> = {
  speed: 'スピード',
  stamina: 'スタミナ',
  mountainUp: '山登り',
  mountainDown: '山下り',
  pacing: 'ペース配分',
  mental: 'メンタル',
  recovery: '回復力',
}

// カードの名前（実際の練習名）。カードの絵・カード絞り込み・カードのラベルだけこちらを使う。
export const CARD_NAMES: Record<CardStatKey, string> = {
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

// ─── 完全休養カード（疲労回復専用の特殊カード） ───
// EXPは付与せず、疲労を回復する。value＝疲労回復量。statKey は 'recovery' のプレースホルダ（EXPには使わない）。
export const REST_FATIGUE: Record<CardRarity, number> = { normal: 10, rare: 30, epic: 60, legendary: 90 }
export const REST_CARD_NAME = '完全休養'

export function generateRestCard(rarity: CardRarity): TrainingCard {
  return {
    id: newCardId(),
    kind: 'rest',
    statKey: 'recovery',
    rarity,
    value: REST_FATIGUE[rarity],
  }
}

// レア度ランダム抽選：ノーマル60% / レア30% / エピック9% / レジェンド1%
function randomRarity(): CardRarity {
  const r = Math.random()
  return r < 0.60 ? 'normal' : r < 0.90 ? 'rare' : r < 0.99 ? 'epic' : 'legendary'
}

// カードドロップ。土台3枚(ランダム) ＋ 区間賞ごと1枚(ランダム) ＋ 順位ボーナス ＋ 25%で完全休養。
// 順位で枚数・レア度に差をつけつつ、全員に土台3枚を配って低迷時も育成が進むようにする。
export function generateDropCards(rank: number, _totalTeams: number, segWinCount = 0): TrainingCard[] {
  const cards: TrainingCard[] = []
  // 全員：土台3枚（レア度ランダム）
  for (let i = 0; i < 3; i++) cards.push(generateTrainingCard(randomRarity()))
  // 区間賞：取った区の数だけ+1枚（レア度ランダム）
  for (let i = 0; i < Math.max(0, segWinCount); i++) cards.push(generateTrainingCard(randomRarity()))
  // 順位ボーナス
  if (rank === 1) { cards.push(generateTrainingCard('epic'), generateTrainingCard('epic')) }
  else if (rank <= 5) { cards.push(generateTrainingCard('epic'), generateTrainingCard('rare')) }
  else if (rank <= 10) { cards.push(generateTrainingCard('rare'), generateTrainingCard('rare')) }
  else if (rank <= 15) { cards.push(generateTrainingCard('rare'), generateTrainingCard('normal')) }
  else { cards.push(generateTrainingCard('normal'), generateTrainingCard('normal')) }
  // 完全休養カード：毎レース必ず1枚（別枠）。レア度は固定確率（順位に依存しない）
  const rr = Math.random()
  const restRarity: CardRarity = rr < 0.50 ? 'normal' : rr < 0.80 ? 'rare' : rr < 0.95 ? 'epic' : 'legendary'
  cards.push(generateRestCard(restRarity))
  return cards
}

// ─── 練習メニュー（レシピ） ───
// 使ったカードの「種類（statKey）」の組み合わせが下のレシピと一致した時だけメニュー成立。
// レシピ外はボーナスなし（通常合成 ×1.0）。同じカードを何枚重ねても種類は増えないのでボーナスにならない。
// 倍率は種類数で決まる: 2種×1.2 / 3種×1.4 / 4種×1.6 / 5種×1.8。
// スキル付与は廃止。レシピは「メニュー名・色・倍率」だけを決める
type Recipe = { types: CardStatKey[]; name: string; color: string }

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
  { types: ['speed', 'mountainUp'], name: '飛脚', color: '#3B82F6' },
  { types: ['speed', 'mountainDown'], name: '突風', color: '#3B82F6' },
  { types: ['speed', 'recovery'], name: 'バネ', color: '#3B82F6' },
  { types: ['stamina', 'mental'], name: '忍耐', color: '#3B82F6' },
  { types: ['stamina', 'mountainDown'], name: '雪崩', color: '#3B82F6' },
  { types: ['mountainUp', 'pacing'], name: '登り巧者', color: '#3B82F6' },
  { types: ['mountainUp', 'mental'], name: '克己', color: '#3B82F6' },
  { types: ['mountainUp', 'recovery'], name: '山籠もり', color: '#3B82F6' },
  { types: ['mountainDown', 'pacing'], name: '滑空', color: '#3B82F6' },
  { types: ['mountainDown', 'mental'], name: '度胸', color: '#3B82F6' },
  { types: ['mountainDown', 'recovery'], name: '軽業', color: '#3B82F6' },
  { types: ['pacing', 'recovery'], name: '省エネ', color: '#3B82F6' },
  // 3種 ×1.4
  { types: ['stamina', 'pacing', 'recovery'], name: '鉄人', color: '#8B5CF6' },
  { types: ['mountainUp', 'mountainDown', 'stamina'], name: '山神', color: '#8B5CF6' },
  { types: ['speed', 'pacing', 'mental'], name: '韋駄天', color: '#8B5CF6' },
  { types: ['speed', 'stamina', 'mountainUp'], name: '怪物', color: '#8B5CF6' },
  { types: ['speed', 'stamina', 'pacing'], name: '三拍子', color: '#8B5CF6' },
  { types: ['speed', 'stamina', 'recovery'], name: 'エンジン', color: '#8B5CF6' },
  { types: ['speed', 'mountainDown', 'pacing'], name: '下り名人', color: '#8B5CF6' },
  { types: ['speed', 'mental', 'recovery'], name: '闘志', color: '#8B5CF6' },
  { types: ['stamina', 'pacing', 'mental'], name: '走り職人', color: '#8B5CF6' },
  { types: ['stamina', 'mental', 'recovery'], name: '胆力', color: '#8B5CF6' },
  { types: ['mountainUp', 'mountainDown', 'mental'], name: '山伏', color: '#8B5CF6' },
  // 4種 ×1.6
  { types: ['speed', 'stamina', 'pacing', 'mental'], name: '無双', color: '#EF4444' },
  { types: ['mountainUp', 'mountainDown', 'stamina', 'pacing'], name: '縦横無尽', color: '#EF4444' },
  { types: ['speed', 'stamina', 'mountainUp', 'mountainDown'], name: '万能', color: '#EF4444' },
  { types: ['stamina', 'pacing', 'mental', 'recovery'], name: '鉄壁', color: '#EF4444' },
  { types: ['speed', 'pacing', 'mental', 'recovery'], name: '策士', color: '#EF4444' },
  { types: ['speed', 'mountainUp', 'mountainDown', 'mental'], name: '山岳スプリンター', color: '#EF4444' },
  { types: ['mountainUp', 'mountainDown', 'stamina', 'recovery'], name: '山の鉄人', color: '#EF4444' },
  // 5種 ×1.8
  { types: ['speed', 'stamina', 'pacing', 'mental', 'recovery'], name: '絶対王者', color: '#F59E0B' },
  { types: ['mountainUp', 'mountainDown', 'stamina', 'pacing', 'mental'], name: '山岳王者', color: '#F59E0B' },
  { types: ['speed', 'mountainUp', 'mountainDown', 'pacing', 'recovery'], name: '野生児', color: '#F59E0B' },
  { types: ['speed', 'stamina', 'mountainUp', 'mountainDown', 'recovery'], name: '荒武者', color: '#F59E0B' },
]

function recipeKey(types: CardStatKey[]): string {
  return [...types].sort().join('+')
}

const RECIPE_MAP = new Map(RECIPES.map(r => [recipeKey(r.types), r]))

// 選択中のカードから成立するメニューを事前に判定（UI表示用）。カード未選択でも呼べる。

// 能力（ステータス）カードだけの合成結果を判定する（従来のレシピ判定）。rest混在時は statCards を渡す。
function detectStatCombo(cards: TrainingCard[]): ComboResult {
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
    return {
      name: recipe.name,
      color: recipe.color,
      statDeltas: deltas,
      isSpecial: distinct.length >= 3,
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

const REST_COLOR = '#5EC8B8'

export function detectCombo(cards: TrainingCard[]): ComboResult | null {
  if (cards.length === 0) return null

  const restCards = cards.filter(c => c.kind === 'rest')
  const statCards = cards.filter(c => c.kind !== 'rest')

  // rest カードが無ければ従来通り
  if (restCards.length === 0) {
    return detectStatCombo(statCards)
  }

  const fatigueBase = restCards.reduce((s, c) => s + c.value, 0)

  // 超回復コンボ: 完全休養＋回復力（ジョグ）カード → 疲労回復・回復力EXPが ×1.2
  if (statCards.length > 0 && statCards.every(c => c.statKey === 'recovery')) {
    const recoverySum = statCards.reduce((s, c) => s + c.value, 0)
    return {
      name: '超回復',
      color: REST_COLOR,
      statDeltas: { recovery: Math.round(recoverySum * 1.2) },
      isSpecial: true,
      fatigueDelta: Math.round(fatigueBase * 1.2),
    }
  }

  // 完全休養のみ
  if (statCards.length === 0) {
    return {
      name: REST_CARD_NAME,
      color: REST_COLOR,
      statDeltas: {},
      isSpecial: false,
      fatigueDelta: fatigueBase,
    }
  }

  // rest＋その他の能力カード混在（recovery以外も含む）: 能力側は従来レシピ判定、疲労回復は等倍で付与
  const statResult = detectStatCombo(statCards)
  return {
    ...statResult,
    fatigueDelta: fatigueBase,
  }
}
