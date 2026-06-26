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
]

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

export function generateSponsorOffers(rank: number, year: number): SponsorOffer[] {
  const eligible = TEMPLATES.filter(t => rank <= t.minRankRequired)

  const byTier = (tier: SponsorTier) => eligible.filter(t => t.tier === tier)

  const picked: SponsorTemplate[] = []

  if (rank <= 2) picked.push(...shuffle(byTier('title')).slice(0, 1))
  picked.push(...shuffle(byTier('large')).slice(0, rank <= 4 ? 2 : rank <= 7 ? 1 : 0))
  picked.push(...shuffle(byTier('medium')).slice(0, 2))
  picked.push(...shuffle(byTier('small')).slice(0, rank <= 4 ? 1 : 2))

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
