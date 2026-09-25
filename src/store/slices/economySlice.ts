// economy ドメインのアクション（gameStore から分割）。

import type { GameStore, SetGame } from '../gameStore'
import { SPONSOR_SLOTS } from '../../data/sponsors'
import { facilitiesOf, facilityUpgradeCost } from '../../utils/facilities'
import { myClub, withMyClub } from '../../utils/world'

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
        clubs: withMyClub(s, t => ({ ...t, sponsors: [...(t.sponsors ?? []), sponsorId] })) }))
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
        clubs: withMyClub(s, t => ({ ...t, sponsors: (t.sponsors ?? []).filter(id => id !== sponsorId) })) }))
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
      const myTeam = myClub(state)
      if (!myTeam) return state
      const currentTeamSponsors = myTeam.sponsors ?? []
      if (currentTeamSponsors.length >= SPONSOR_SLOTS) return state
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
        clubs: withMyClub(state, t => ({ ...t, sponsors: [...currentTeamSponsors, newSponsor.id] })),
        currentSeason: {
          ...state.currentSeason,
          sponsorOffers: (state.currentSeason.sponsorOffers ?? []).filter(o => o.id !== offerId) } }
    })
  },


  collectSponsorIncome: () => {
    const state = get()
    const myTeam = myClub(state)
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
        clubs: withMyClub(s, t => ({ ...t, finance: { ...t.finance, budget: (t.finance?.budget ?? 0) + totalIncome } })) }))
    }
  },


  // ── Facilities ────────────────────────────────────────────────────
  upgradeFacility: (key) => {
    const state = get()
    const myTeam = myClub(state)
    if (!myTeam) return false
    // ★いまのレベルは `facilitiesOf`（格の土台＋建てたぶん）。0 から数え直さないこと
    const currentLv = facilitiesOf(myTeam)[key]
    // 値段も上限も `utils/facilities` 1本（画面の「押せるか」と同じところから出す）
    const cost = facilityUpgradeCost(currentLv)
    if (cost === null || state.jewels < cost) return false
    set(state => ({
      jewels: state.jewels - cost,
      clubs: withMyClub(state, t => ({
        ...t,
        facilities: { ...t.facilities, [key]: currentLv + 1 } })) }))
    return true
  },


  dismissBudgetNotice: () => set({ seasonBudgetNotice: null }),

})
