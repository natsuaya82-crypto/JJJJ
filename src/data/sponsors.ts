import type { SponsorTier, SponsorOffer, SponsorTarget } from '../types'
import { tierSponsorIncome, type ClubTier } from '../utils/clubTier'

// テンプレは「名前・色・達成目標・契約年数の候補」だけを持つ。金額は持たない。
// tier は名前の格付け（どの金額帯のときにこの名前が出るか）で、金額そのものではない。
type SponsorTemplate = {
  id: string
  name: string
  tier: SponsorTier
  logoColor: string
  target: SponsorTarget
  contractYearsOptions: number[]
}

const TEMPLATES: SponsorTemplate[] = [
  // ---- title (5社) ----
  {
    id: 'tpl_megabank',
    name: '第一ランナーズ銀行',
    tier: 'title',
    logoColor: '#1A4E8C',
    target: { type: 'rank', value: 3, description: '3位以内' },
    contractYearsOptions: [2, 3],
  },
  {
    id: 'tpl_auto',
    name: 'ジャパンオートモーター',
    tier: 'title',
    logoColor: '#CC0000',
    target: { type: 'championship', value: 1, description: '優勝' },
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_airline',
    name: '大和スカイライン航空',
    tier: 'title',
    logoColor: '#005BAC',
    target: { type: 'rank', value: 2, description: '2位以内' },
    contractYearsOptions: [2, 3],
  },
  {
    id: 'tpl_telecom',
    name: 'ネクストモバイル通信',
    tier: 'title',
    logoColor: '#6A1B9A',
    target: { type: 'rank', value: 3, description: '3位以内' },
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_railway',
    name: '首都圏レールウェイズ',
    tier: 'title',
    logoColor: '#00695C',
    target: { type: 'championship', value: 1, description: '優勝' },
    contractYearsOptions: [2, 3],
  },
  // ---- large (7社) ----
  {
    id: 'tpl_sportswear',
    name: 'アスリートプロ株式会社',
    tier: 'large',
    logoColor: '#E8462A',
    target: { type: 'rank', value: 5, description: '5位以内' },
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_energy',
    name: 'エナジーブースト飲料',
    tier: 'large',
    logoColor: '#F5A623',
    target: { type: 'segmentWins', value: 5, description: '区間賞5回以上' },
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_gear_maker',
    name: 'ランギア工業',
    tier: 'large',
    logoColor: '#C9A84C',
    target: { type: 'rank', value: 4, description: '4位以内' },
    contractYearsOptions: [2, 3],
  },
  {
    id: 'tpl_game',
    name: 'スターゲート・ゲームス',
    tier: 'large',
    logoColor: '#3949AB',
    target: { type: 'rank', value: 5, description: '5位以内' },
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_electronics',
    name: '富士見電機',
    tier: 'large',
    logoColor: '#455A64',
    target: { type: 'rank', value: 5, description: '5位以内' },
    contractYearsOptions: [2, 3],
  },
  {
    id: 'tpl_pharma',
    name: '健光製薬',
    tier: 'large',
    logoColor: '#2E7D32',
    target: { type: 'segmentWins', value: 4, description: '区間賞4回以上' },
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_securities',
    name: 'あおぞら総合証券',
    tier: 'large',
    logoColor: '#0288D1',
    target: { type: 'rank', value: 6, description: '6位以内' },
    contractYearsOptions: [1, 2],
  },
  // ---- medium (8社) ----
  {
    id: 'tpl_tv',
    name: 'JRN放送局',
    tier: 'medium',
    logoColor: '#7986CB',
    target: { type: 'rank', value: 7, description: '7位以内' },
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_insurance',
    name: '日本スポーツ保険',
    tier: 'medium',
    logoColor: '#4CAF50',
    target: { type: 'segmentWins', value: 3, description: '区間賞3回以上' },
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_food',
    name: 'スポーツフード株式会社',
    tier: 'medium',
    logoColor: '#FF7043',
    target: { type: 'rank', value: 8, description: '8位以内' },
    contractYearsOptions: [1],
  },
  {
    id: 'tpl_housing',
    name: 'サンライズ住宅',
    tier: 'medium',
    logoColor: '#EF6C00',
    target: { type: 'rank', value: 7, description: '7位以内' },
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_conveni',
    name: 'マルエキマート',
    tier: 'medium',
    logoColor: '#00897B',
    target: { type: 'rank', value: 8, description: '8位以内' },
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_energydrink',
    name: '雷神エナジー',
    tier: 'medium',
    logoColor: '#D32F2F',
    target: { type: 'segmentWins', value: 3, description: '区間賞3回以上' },
    contractYearsOptions: [1],
  },
  {
    id: 'tpl_outdoor',
    name: '山彦アウトドア',
    tier: 'medium',
    logoColor: '#558B2F',
    target: { type: 'rank', value: 8, description: '8位以内' },
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_beverage',
    name: '清流堂ビバレッジ',
    tier: 'medium',
    logoColor: '#0097A7',
    target: { type: 'rank', value: 7, description: '7位以内' },
    contractYearsOptions: [1, 2],
  },
  // ---- small (5社) ----
  {
    id: 'tpl_local',
    name: 'ローカル商事',
    tier: 'small',
    logoColor: '#9B97A8',
    target: { type: 'rank', value: 12, description: 'シーズン完走' },
    contractYearsOptions: [1],
  },
  {
    id: 'tpl_local2',
    name: '地域スポンサー連合',
    tier: 'small',
    logoColor: '#78909C',
    target: { type: 'rank', value: 15, description: 'シーズン参加' },
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_onsen',
    name: '湯けむり旅館グループ',
    tier: 'small',
    logoColor: '#8D6E63',
    target: { type: 'rank', value: 15, description: 'シーズン参加' },
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_printing',
    name: '桜井印刷所',
    tier: 'small',
    logoColor: '#5C6BC0',
    target: { type: 'rank', value: 12, description: 'シーズン完走' },
    contractYearsOptions: [1],
  },
  {
    id: 'tpl_taxi',
    name: '光丘タクシー',
    tier: 'small',
    logoColor: '#F9A825',
    target: { type: 'rank', value: 15, description: 'シーズン参加' },
    contractYearsOptions: [1],
  },
]

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

// ── 協賛金の決まり ────────────────────────────────────────────────
//
// スポンサー収入の元は「クラブの格」1本（utils/clubTier.ts の tierSponsorIncome）。
// 前はテンプレごとの annualPayment が固定額で、順位(minRankRequired)で出る/出ないが決まっていた。
// 順位は毎年の格に反映されるので、格を見れば足りる。テンプレは名前・色・達成目標だけを持つ。
//
// 枠は3つ（SponsorPage の MAX_SPONSORS）。良い順に3社埋めたときの合計が
// ちょうど tierSponsorIncome(tier) になるよう配分する。4社目以降は選択肢用の下振れ。
const OFFER_SHARES = [0.45, 0.33, 0.22, 0.18, 0.12]

/** 協賛額から会社の格付けラベルを決める（ラベルは金額の言い換え。別の物差しを持たない） */
function tierOfPayment(yen: number): SponsorTier {
  return yen >= 30_000_000 ? 'title' : yen >= 15_000_000 ? 'large' : yen >= 5_000_000 ? 'medium' : 'small'
}

/**
 * その年のスポンサーオファー。
 * @param clubTier クラブの格（1〜20）。順位ではない
 */
export function generateSponsorOffers(clubTier: ClubTier, year: number, excludeIds?: string[]): SponsorOffer[] {
  const total = tierSponsorIncome(clubTier)
  const excluded = new Set(excludeIds ?? [])
  const used = new Set<string>()

  // 金額 → その額に見合うラベル → そのラベルのテンプレから名前を借りる。
  // 該当ラベルが品切れなら隣のラベルへ落とす（オファーが0件にならないように）
  const pickTemplate = (label: SponsorTier): SponsorTemplate | undefined => {
    const order: SponsorTier[] = ['title', 'large', 'medium', 'small']
    const from = order.indexOf(label)
    for (const step of [0, 1, -1, 2, -2, 3, -3]) {
      const l = order[from + step]
      if (!l) continue
      const pool = TEMPLATES.filter(t => t.tier === l && !used.has(t.id))
      const preferred = shuffle(pool.filter(t => !excluded.has(t.id)))
      const fallback = shuffle(pool.filter(t => excluded.has(t.id)))
      const hit = [...preferred, ...fallback][0]
      if (hit) return hit
    }
    return undefined
  }

  return OFFER_SHARES.map((share, i) => {
    // 10万円単位に丸める（下位の格でも0円にならないよう下限20万）
    const pay = Math.max(200_000, Math.round(total * share / 100_000) * 100_000)
    const label = tierOfPayment(pay)
    const t = pickTemplate(label)
    if (!t) return undefined
    used.add(t.id)
    const years = t.contractYearsOptions[Math.floor(Math.random() * t.contractYearsOptions.length)]
    return {
      id: `offer_${t.id}_${year}_${i}`,
      name: t.name,
      tier: label,
      annualPayment: pay,
      contractYears: years,
      target: t.target,
      logoColor: t.logoColor,
    }
  }).filter((o): o is SponsorOffer => o != null)
}
