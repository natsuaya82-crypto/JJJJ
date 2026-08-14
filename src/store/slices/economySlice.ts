// economy ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'

type Slice = Pick<GameStore,
  'signSponsor' | 'terminateSponsor' | 'acceptSponsorOffer' | 'collectSponsorIncome' | 'upgradeFacility' | 'dismissBudgetNotice'>

export const createEconomySlice = (set: SetGame, get: () => GameStore): Slice => ({

  // ── Sponsors ─────────────────────────────────────────────────────
  signSponsor: (sponsorId, targetId) => {
    const state = get()
    const sponsor = state.sponsors.find(s => s.id === sponsorId)
    if (!sponsor) return false

    if (targetId === null) {
      // Team sponsor
      set(s => ({
        teams: s.teams.map(t => t.id === s.playerTeamId
          ? { ...t, sponsors: [...(t.sponsors ?? []), sponsorId] }
          : t
        ) }))
    } else {
      // Personal sponsor
      set(s => ({
        players: s.players.map(p => p.id === targetId
          ? { ...p, personalSponsors: [...(p.personalSponsors ?? []), sponsorId] }
          : p
        ) }))
    }
    return true
  },


  terminateSponsor: (sponsorId, targetId) => {
    if (targetId === null) {
      set(s => ({
        teams: s.teams.map(t => t.id === s.playerTeamId
          ? { ...t, sponsors: (t.sponsors ?? []).filter(id => id !== sponsorId) }
          : t
        ) }))
    } else {
      set(s => ({
        players: s.players.map(p => p.id === targetId
          ? { ...p, personalSponsors: (p.personalSponsors ?? []).filter(id => id !== sponsorId) }
          : p
        ) }))
    }
  },


  acceptSponsorOffer: (offerId) => {
    set(state => {
      const offer = (state.currentSeason.sponsorOffers ?? []).find(o => o.id === offerId)
      if (!offer) return state
      const myTeam = state.teams.find(t => t.id === state.playerTeamId)
      if (!myTeam) return state
      const currentTeamSponsors = myTeam.sponsors ?? []
      if (currentTeamSponsors.length >= 3) return state
      const newSponsor = {
        id: `sp_${offerId}`,
        name: offer.name,
        type: 'team' as const,
        tier: offer.tier,
        annualPayment: offer.annualPayment,
        yearsLeft: offer.contractYears,
        contractYears: offer.contractYears,
        target: offer.target,
        logoColor: offer.logoColor }
      return {
        sponsors: [...(state.sponsors ?? []), newSponsor],
        teams: state.teams.map(t =>
          t.id === state.playerTeamId
            ? { ...t, sponsors: [...currentTeamSponsors, newSponsor.id] }
            : t
        ),
        currentSeason: {
          ...state.currentSeason,
          sponsorOffers: (state.currentSeason.sponsorOffers ?? []).filter(o => o.id !== offerId) } }
    })
  },


  collectSponsorIncome: () => {
    const state = get()
    const myTeam = state.teams.find(t => t.id === state.playerTeamId)
    if (!myTeam) return

    let totalIncome = 0

    // Team sponsors
    for (const sId of myTeam.sponsors ?? []) {
      const sp = state.sponsors.find(s => s.id === sId)
      if (sp) totalIncome += sp.annualPayment
    }

    // Personal sponsors (go to team budget as prize money)
    const myPlayerIds = new Set(state.players.filter(p => p.teamId === state.playerTeamId).map(p => p.id))
    for (const player of state.players) {
      if (!myPlayerIds.has(player.id)) continue
      for (const sId of player.personalSponsors ?? []) {
        const sp = state.sponsors.find(s => s.id === sId)
        if (sp) totalIncome += sp.annualPayment
      }
    }

    if (totalIncome > 0) {
      set(s => ({
        teams: s.teams.map(t => t.id === s.playerTeamId
          ? { ...t, finance: { ...t.finance, budget: t.finance.budget + totalIncome } }
          : t
        ) }))
    }
  },


  // ── Facilities ────────────────────────────────────────────────────
  upgradeFacility: (key) => {
    const state = get()
    const myTeam = state.teams.find(t => t.id === state.playerTeamId)
    if (!myTeam) return false
    const currentLv = myTeam.facilities?.[key] ?? 0
    if (currentLv >= 5) return false
    const UPGRADE_COSTS = [100, 300, 500, 1000, 3000]
    const cost = UPGRADE_COSTS[currentLv]
    if (state.jewels < cost) return false
    set(state => ({
      jewels: state.jewels - cost,
      teams: state.teams.map(t => t.id === state.playerTeamId ? {
        ...t,
        facilities: { ...t.facilities, [key]: currentLv + 1 } } : t) }))
    return true
  },


  dismissBudgetNotice: () => set({ seasonBudgetNotice: null }),

})
