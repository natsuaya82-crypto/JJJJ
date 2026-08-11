// スポンサー契約の年度処理（store/slices/seasonSlice の endSeason から切り出し）。
//
// 契約は1年ずつ減り、切れたときに**目標を達成していれば継続のオファーが来る**
// （順位・区間賞の数・優勝のどれか。年俸は5%増し・最長3年）。
// 新規のオファーは来季の格から出る（utils/data の generateSponsorOffers）。
//
// ★前年にオファーが来た会社と契約中の会社は翌年の新規候補から外す
//   （毎年まったく同じ顔ぶれが並ぶのを防ぐ）。
//
// 乱数は generateSponsorOffers の中だけ。ここでは引かない。
import type { Season, SponsorOffer, Sponsor, Team } from '../types'
import { generateSponsorOffers } from '../data/sponsors'
import type { ClubTier } from '../utils/clubTier'
import { type NewsItem, sponsorEndHeadline } from '../utils/newsItems'

export function processSeasonSponsors(params: {
  sponsors: Sponsor[]
  teams: Team[]
  currentSeason: Season
  playerTeamId: string
  /** 自チームの今季の最終順位（部内） */
  myFinalRank: number
  /** 来季の格。新規オファーの規模がここから決まる */
  myNextTier: ClubTier
  newYear: number
}): { sponsors: Sponsor[]; expiredIds: Set<string>; news: NewsItem[]; offers: SponsorOffer[]; activeIds: string[] } {
  const { sponsors, teams, currentSeason, playerTeamId, myFinalRank, myNextTier, newYear } = params
  // Sponsor contract processing
  const myActiveSponsorIds = teams.find(t => t.id === playerTeamId)?.sponsors ?? []
  const mySegWins = currentSeason.races
    .filter(r => r.results)
    .flatMap(r => r.results!.segmentResults)
    .filter(sr => sr.runners[0]?.teamId === playerTeamId)
    .length
  const expiredSponsorIds = new Set<string>()
  const sponsorNews: NewsItem[] = []
  const renewalOffers: SponsorOffer[] = []
  const updatedSponsors = (sponsors ?? []).map(sp => {
    if (!myActiveSponsorIds.includes(sp.id)) return sp
    const newYearsLeft = sp.yearsLeft - 1
    if (newYearsLeft <= 0) {
      expiredSponsorIds.add(sp.id)
      let targetMet = true
      if (sp.target) {
        if (sp.target.type === 'rank') targetMet = myFinalRank > 0 && myFinalRank <= sp.target.value
        else if (sp.target.type === 'segmentWins') targetMet = mySegWins >= sp.target.value
        else if (sp.target.type === 'championship') targetMet = myFinalRank === 1
      }
      if (targetMet) {
        renewalOffers.push({
          id: `offer_renewal_${sp.id}_${newYear}`,
          name: sp.name,
          tier: sp.tier,
          annualPayment: Math.round(sp.annualPayment * 1.05 / 500000) * 500000,
          contractYears: Math.min((sp.contractYears ?? 1) + 1, 3),
          target: sp.target ?? { type: 'rank', value: 5, description: '5位以内' },
          logoColor: sp.logoColor })
      }
      sponsorNews.push({
        date: `${currentSeason.year}-10-27`,
        headline: sponsorEndHeadline({ sponsorName: sp.name, met: targetMet, targetDesc: sp.target?.description }),
        category: 'finance' as const,
        relatedIds: [] })
    }
    return { ...sp, yearsLeft: Math.max(0, newYearsLeft) }
  })
  // 前年にオファーが来た会社・契約中の会社は翌年の新規候補から除外（毎年同じ顔ぶれになるのを防ぐ）
  const tplIdOf = (id: string) => /^(?:sp_)?offer_(.+)_\d+_\d+$/.exec(id)?.[1]
  const excludeTplIds = [
    ...(currentSeason.sponsorOffers ?? []).map(o => tplIdOf(o.id)),
    ...updatedSponsors.filter(sp => sp.yearsLeft > 0).map(sp => tplIdOf(sp.id)),
  ].filter((x): x is string => !!x)
  const newSponsorOffers = [...renewalOffers, ...generateSponsorOffers(myNextTier, newYear, excludeTplIds)]
  return { sponsors: updatedSponsors, expiredIds: expiredSponsorIds, news: sponsorNews, offers: newSponsorOffers, activeIds: myActiveSponsorIds }
}
