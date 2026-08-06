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


export const STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

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

// ─── カードの交換 ───
// レートは store の convertCards と 変換ページの表に別々に手書きされていて、
// 片方だけ直すとズレる形だった。交換の種類も条件も、この表1本だけを見ればいいようにする。
//
//  上3つ … 余ったカードをEXP等価で上位レアへ（もらう種類はランダム）
//  下4つ … 完全休養は疲労回復にしか使えず余るので、10枚で同じレア度の好きなカード1枚と交換
export type CardExchange = {
  fromRarity: CardRarity
  fromRest: boolean      // 消費するのが完全休養カードかどうか
  need: number
  toRarity: CardRarity
  produce: number
}

export const CARD_EXCHANGES: readonly CardExchange[] = [
  { fromRarity: 'normal', fromRest: false, need: 4, toRarity: 'rare', produce: 1 },
  { fromRarity: 'rare', fromRest: false, need: 10, toRarity: 'epic', produce: 3 },
  { fromRarity: 'epic', fromRest: false, need: 5, toRarity: 'legendary', produce: 2 },
  { fromRarity: 'normal', fromRest: true, need: 10, toRarity: 'normal', produce: 1 },
  { fromRarity: 'rare', fromRest: true, need: 10, toRarity: 'rare', produce: 1 },
  { fromRarity: 'epic', fromRest: true, need: 10, toRarity: 'epic', produce: 1 },
  { fromRarity: 'legendary', fromRest: true, need: 10, toRarity: 'legendary', produce: 1 },
]

// もらうカードの種類を自分で選べるのは、完全休養からの交換だけ
export const canPickStat = (ex: CardExchange) => ex.fromRest

// その交換で消費できる手持ち
export function exchangeSource(cards: readonly TrainingCard[], ex: CardExchange): TrainingCard[] {
  return cards.filter(c => c.rarity === ex.fromRarity && (c.kind === 'rest') === ex.fromRest)
}

// 交換1回ぶんの中身（消すカードと、もらうカード）。束が組めなければ null。
// 画面の「何枚→何枚」表示も store の実行もここを通す
export function planExchange(
  cards: readonly TrainingCard[],
  ex: CardExchange,
  statKey?: CardStatKey,
): { consumeIds: Set<string>; produced: TrainingCard[] } | null {
  const pool = exchangeSource(cards, ex)
  const bundles = Math.floor(pool.length / ex.need)
  if (bundles === 0) return null
  const consumeIds = new Set(pool.slice(0, bundles * ex.need).map(c => c.id))
  const produced = Array.from({ length: bundles * ex.produce }, () => {
    const card = generateTrainingCard(ex.toRarity)
    return canPickStat(ex) && statKey ? { ...card, statKey } : card
  })
  return { consumeIds, produced }
}

// レア度ランダム抽選：ノーマル60% / レア30% / エピック9% / レジェンド1%
function randomRarity(): CardRarity {
  const r = Math.random()
  return r < 0.60 ? 'normal' : r < 0.90 ? 'rare' : r < 0.99 ? 'epic' : 'legendary'
}

// カードドロップ。土台3枚(ランダム) ＋ 区間賞ごと1枚(ランダム) ＋ 順位ボーナス ＋ 25%で完全休養。
// 順位で枚数・レア度に差をつけつつ、全員に土台3枚を配って低迷時も育成が進むようにする。
/**
 * レース後にもらえるカード。
 *
 * ★順位は**国内の通し順位**（utils/league の domesticThroughRank）で見る。
 *   部内順位で見ていたので「3部で優勝しても1部で優勝しても同じエピック2枚」だった。
 *   しかも3部は16チームなので5位以内に入りやすく、実質3部のほうが得だった。
 *   通し順位なら 1部20 → 2部16 → 3部16 と自然に落ちる。
 *
 * ただし通し順位だけだと3部優勝がノーマル2枚になってしまうので、
 * **部内1位のときだけ1段上げる**（昇格の年に手ぶらで終わらせない）。
 *   1部1位=通し1位 … レジェンダリー＋エピック＋レア（そのまま最上位）
 *   2部1位=通し21位 … レア×2＋ノーマル → 1段上げて エピック＋レア×2
 *   3部1位=通し37位 … レア＋ノーマル×2 → 1段上げて レア×2＋ノーマル
 */
// 順位ボーナスは全員3枚。中身のレア度だけが順位で変わる（枚数で差を付けない）。
// 頂点だけレジェンダリー。ここが唯一レジェンダリーが順位で出る場所（完全休養カードは別枠）
const RANK_BONUS: { upTo: number; cards: [CardRarity, CardRarity, CardRarity] }[] = [
  { upTo: 1,  cards: ['legendary', 'epic', 'rare'] },
  { upTo: 3,  cards: ['epic', 'epic', 'rare'] },
  { upTo: 10, cards: ['epic', 'rare', 'rare'] },
  { upTo: 26, cards: ['rare', 'rare', 'normal'] },
  { upTo: 99, cards: ['rare', 'normal', 'normal'] },
]

export function generateDropCards(throughRank: number, segWinCount = 0, divisionTop = false): TrainingCard[] {
  const cards: TrainingCard[] = []
  // 全員：土台3枚（レア度ランダム）
  for (let i = 0; i < 3; i++) cards.push(generateTrainingCard(randomRarity()))
  // 区間賞：取った区の数だけ+1枚（レア度ランダム）
  for (let i = 0; i < Math.max(0, segWinCount); i++) cards.push(generateTrainingCard(randomRarity()))
  // 順位ボーナス。部内1位は1段上（配列の1つ手前）を使う
  const at = RANK_BONUS.findIndex(b => throughRank <= b.upTo)
  const idx = Math.max(0, at < 0 ? RANK_BONUS.length - 1 : divisionTop ? at - 1 : at)
  for (const r of RANK_BONUS[idx].cards) cards.push(generateTrainingCard(r))
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
