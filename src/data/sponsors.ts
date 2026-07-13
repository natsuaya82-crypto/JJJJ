import type { SponsorTier, SponsorOffer, SponsorTarget } from '../types'

type SponsorTemplate = {
  id: string
  name: string
  tier: SponsorTier
  annualPayment: number
  logoColor: string
  target: SponsorTarget
  minRankRequired: number
  contractYearsOptions: number[]
}

const TEMPLATES: SponsorTemplate[] = [
  // ---- title (5社) ----
  {
    id: 'tpl_megabank',
    name: '第一ランナーズ銀行',
    tier: 'title',
    annualPayment: 50000000,
    logoColor: '#1A4E8C',
    target: { type: 'rank', value: 3, description: '3位以内' },
    minRankRequired: 2,
    contractYearsOptions: [2, 3],
  },
  {
    id: 'tpl_auto',
    name: 'ジャパンオートモーター',
    tier: 'title',
    annualPayment: 45000000,
    logoColor: '#CC0000',
    target: { type: 'championship', value: 1, description: '優勝' },
    minRankRequired: 1,
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_airline',
    name: '大和スカイライン航空',
    tier: 'title',
    annualPayment: 48000000,
    logoColor: '#005BAC',
    target: { type: 'rank', value: 2, description: '2位以内' },
    minRankRequired: 1,
    contractYearsOptions: [2, 3],
  },
  {
    id: 'tpl_telecom',
    name: 'ネクストモバイル通信',
    tier: 'title',
    annualPayment: 46000000,
    logoColor: '#6A1B9A',
    target: { type: 'rank', value: 3, description: '3位以内' },
    minRankRequired: 2,
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_railway',
    name: '首都圏レールウェイズ',
    tier: 'title',
    annualPayment: 42000000,
    logoColor: '#00695C',
    target: { type: 'championship', value: 1, description: '優勝' },
    minRankRequired: 2,
    contractYearsOptions: [2, 3],
  },
  // ---- large (7社) ----
  {
    id: 'tpl_sportswear',
    name: 'アスリートプロ株式会社',
    tier: 'large',
    annualPayment: 25000000,
    logoColor: '#E8462A',
    target: { type: 'rank', value: 5, description: '5位以内' },
    minRankRequired: 5,
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_energy',
    name: 'エナジーブースト飲料',
    tier: 'large',
    annualPayment: 20000000,
    logoColor: '#F5A623',
    target: { type: 'segmentWins', value: 5, description: '区間賞5回以上' },
    minRankRequired: 6,
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_gear_maker',
    name: 'ランギア工業',
    tier: 'large',
    annualPayment: 18000000,
    logoColor: '#C9A84C',
    target: { type: 'rank', value: 4, description: '4位以内' },
    minRankRequired: 4,
    contractYearsOptions: [2, 3],
  },
  {
    id: 'tpl_game',
    name: 'スターゲート・ゲームス',
    tier: 'large',
    annualPayment: 22000000,
    logoColor: '#3949AB',
    target: { type: 'rank', value: 5, description: '5位以内' },
    minRankRequired: 5,
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_electronics',
    name: '富士見電機',
    tier: 'large',
    annualPayment: 21000000,
    logoColor: '#455A64',
    target: { type: 'rank', value: 5, description: '5位以内' },
    minRankRequired: 5,
    contractYearsOptions: [2, 3],
  },
  {
    id: 'tpl_pharma',
    name: '健光製薬',
    tier: 'large',
    annualPayment: 19000000,
    logoColor: '#2E7D32',
    target: { type: 'segmentWins', value: 4, description: '区間賞4回以上' },
    minRankRequired: 6,
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_securities',
    name: 'あおぞら総合証券',
    tier: 'large',
    annualPayment: 17000000,
    logoColor: '#0288D1',
    target: { type: 'rank', value: 6, description: '6位以内' },
    minRankRequired: 7,
    contractYearsOptions: [1, 2],
  },
  // ---- medium (8社) ----
  {
    id: 'tpl_tv',
    name: 'JRN放送局',
    tier: 'medium',
    annualPayment: 10000000,
    logoColor: '#7986CB',
    target: { type: 'rank', value: 7, description: '7位以内' },
    minRankRequired: 10,
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_insurance',
    name: '日本スポーツ保険',
    tier: 'medium',
    annualPayment: 8000000,
    logoColor: '#4CAF50',
    target: { type: 'segmentWins', value: 3, description: '区間賞3回以上' },
    minRankRequired: 10,
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_food',
    name: 'スポーツフード株式会社',
    tier: 'medium',
    annualPayment: 7000000,
    logoColor: '#FF7043',
    target: { type: 'rank', value: 8, description: '8位以内' },
    minRankRequired: 12,
    contractYearsOptions: [1],
  },
  {
    id: 'tpl_housing',
    name: 'サンライズ住宅',
    tier: 'medium',
    annualPayment: 9000000,
    logoColor: '#EF6C00',
    target: { type: 'rank', value: 7, description: '7位以内' },
    minRankRequired: 10,
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_conveni',
    name: 'マルエキマート',
    tier: 'medium',
    annualPayment: 8500000,
    logoColor: '#00897B',
    target: { type: 'rank', value: 8, description: '8位以内' },
    minRankRequired: 11,
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_energydrink',
    name: '雷神エナジー',
    tier: 'medium',
    annualPayment: 7500000,
    logoColor: '#D32F2F',
    target: { type: 'segmentWins', value: 3, description: '区間賞3回以上' },
    minRankRequired: 12,
    contractYearsOptions: [1],
  },
  {
    id: 'tpl_outdoor',
    name: '山彦アウトドア',
    tier: 'medium',
    annualPayment: 8000000,
    logoColor: '#558B2F',
    target: { type: 'rank', value: 8, description: '8位以内' },
    minRankRequired: 10,
    contractYearsOptions: [1, 2, 3],
  },
  {
    id: 'tpl_beverage',
    name: '清流堂ビバレッジ',
    tier: 'medium',
    annualPayment: 9500000,
    logoColor: '#0097A7',
    target: { type: 'rank', value: 7, description: '7位以内' },
    minRankRequired: 10,
    contractYearsOptions: [1, 2],
  },
  // ---- small (5社) ----
  {
    id: 'tpl_local',
    name: 'ローカル商事',
    tier: 'small',
    annualPayment: 3000000,
    logoColor: '#9B97A8',
    target: { type: 'rank', value: 12, description: 'シーズン完走' },
    minRankRequired: 20,
    contractYearsOptions: [1],
  },
  {
    id: 'tpl_local2',
    name: '地域スポンサー連合',
    tier: 'small',
    annualPayment: 2000000,
    logoColor: '#78909C',
    target: { type: 'rank', value: 15, description: 'シーズン参加' },
    minRankRequired: 20,
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_onsen',
    name: '湯けむり旅館グループ',
    tier: 'small',
    annualPayment: 2500000,
    logoColor: '#8D6E63',
    target: { type: 'rank', value: 15, description: 'シーズン参加' },
    minRankRequired: 20,
    contractYearsOptions: [1, 2],
  },
  {
    id: 'tpl_printing',
    name: '桜井印刷所',
    tier: 'small',
    annualPayment: 3000000,
    logoColor: '#5C6BC0',
    target: { type: 'rank', value: 12, description: 'シーズン完走' },
    minRankRequired: 20,
    contractYearsOptions: [1],
  },
  {
    id: 'tpl_taxi',
    name: '光丘タクシー',
    tier: 'small',
    annualPayment: 2000000,
    logoColor: '#F9A825',
    target: { type: 'rank', value: 15, description: 'シーズン参加' },
    minRankRequired: 20,
    contractYearsOptions: [1],
  },
]

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

export function generateSponsorOffers(rank: number, year: number, excludeIds?: string[]): SponsorOffer[] {
  const eligible = TEMPLATES.filter(t => rank <= t.minRankRequired)
  const excluded = new Set(excludeIds ?? [])

  // 除外idを避けて枠数分選ぶ。不足時は除外分で補填してオファーゼロを防ぐ
  const pick = (tier: SponsorTier, count: number): SponsorTemplate[] => {
    if (count <= 0) return []
    const pool = eligible.filter(t => t.tier === tier)
    const preferred = shuffle(pool.filter(t => !excluded.has(t.id)))
    const fallback = shuffle(pool.filter(t => excluded.has(t.id)))
    return [...preferred, ...fallback].slice(0, count)
  }

  const picked: SponsorTemplate[] = []

  if (rank <= 2) picked.push(...pick('title', 1))
  picked.push(...pick('large', rank <= 4 ? 2 : rank <= 7 ? 1 : 0))
  picked.push(...pick('medium', 2))
  picked.push(...pick('small', rank <= 4 ? 1 : 2))

  return picked.map((t, i) => {
    const years = t.contractYearsOptions[Math.floor(Math.random() * t.contractYearsOptions.length)]
    return {
      id: `offer_${t.id}_${year}_${i}`,
      name: t.name,
      tier: t.tier,
      annualPayment: t.annualPayment,
      contractYears: years,
      target: t.target,
      logoColor: t.logoColor,
    }
  })
}

export const AVAILABLE_SPONSORS = []
