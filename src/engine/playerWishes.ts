// 選手からの直訴を毎レース1件だけ作る（store/slices/raceSlice の runRace から切り出し）。
//
// 出るのは2種類。**どちらも「直訴の札は1人につき1つだけ」**という決まりを共有する。
//   ・移籍したい（契約が残り1年以下・出番や待遇への不満）
//   ・海外でやりたい（OVR80以上・30歳以下。代表帰りは言い出しやすい）
//
// ★「もう何か言っている選手か」の判定は utils/talkSync の openWishIds 1本。
//   3つ（引退・移籍・海外）を別々に抽選していた頃は、同じ選手が「移籍したい」と
//   「海外に行きたい」を同時に持ててしまい、ベルは2件なのにチャットには1行、
//   という数のズレになっていた。
// ★順位の物差しは**自分の部の中**（52で見ると3部が永久に「上位」になる）。
// ★夢の行き先は utils/transferDecision の dreamRegionOf 1本（移籍の判定と同じ表を見る）。
//
// ★乱数は引数で受ける（既定は Math.random）。呼ぶ順は切り出し前と同じで、
//   先に移籍希望、そのあと海外挑戦。
import type { OverseasRegion, Player, Race, Season, SeasonStanding } from '../types'
import { DIVISION_SIZE, rankOfTeam } from '../utils/league'
import type { Division } from '../types'
import { faMarketSalary, ovr, seasonAppearances, seasonPerfProfile } from '../utils/playerUtils'
import { openWishIds } from '../utils/talkSync'
import { canWishTransfer } from '../utils/transferEligibility'
import { dreamRegionOf } from '../utils/transferDecision'
import { MORALE_DEFAULT } from '../utils/condition'

export function generatePlayerWishes(params: {
  players: Player[]
  currentSeason: Season
  standings: Partial<Record<Division, SeasonStanding[]>>
  myDivision: Division
  playerTeamId: string
  races: Race[]
  raceIndex: number
  /** 引退の話がついている選手（移籍の直訴はさせない） */
  retiringWishIds: Set<string>
  worldRepresentatives: { playerId: string; year: number }[] | undefined
  rng?: () => number
}) {
  const { currentSeason, standings, myDivision, playerTeamId, races, raceIndex, retiringWishIds, worldRepresentatives, rng = Math.random } = params
  const players = params.players
  // ── 移籍希望：契約残り2年切った(≤1)選手から毎レース最大1人。理由は出場機会/強豪志向/待遇不満。 ──
  // 直訴（引退したい・移籍したい・海外に行きたい）の札は1人につき1つだけ。
  // 3つを別々に抽選していたので、同じ選手が「移籍したい」と「海外に行きたい」を
  // 同時に持ててしまい、ベルは2件なのにチャットには1行、という数のズレになっていた。
  // 「もう何か言っている選手か」の判定は talkSync の openWishIds 1本に寄せる
  const openWish = openWishIds(currentSeason)
  // 順位の物差しは自分の部の中（52で見ると3部が永久に「上位」になる）
  const trTotalTeams = DIVISION_SIZE[myDivision]
  const myStandRank = (() => {
    const r = rankOfTeam(standings[myDivision], playerTeamId)
    return r > 0 ? r : Math.ceil(trTotalTeams / 2)
  })()
  const trCandidates = players
    // canWishTransfer＝借り物・引退の話をしている・海外挑戦を承認済み、を全部外す。
    // （借り物は保有権が無く「移籍を認める」と他人の選手を消してしまう。
    //   引退を見ていなかったので、引退を承認した選手が数レース後に移籍を直訴してきていた）
    // 既に対応済み（移籍を認めた transferListed / 残ってほしいで説得済み）の選手は同シーズン中に再抽選しない
    .filter(p => canWishTransfer(p, { teamId: playerTeamId, currentYear: currentSeason.year, retiringIds: retiringWishIds })
      && p.status === 'active' && p.contract.yearsLeft <= 1 && !openWish.has(p.id)
      && !p.transferListed && p.transferRequestDismissedYear !== currentSeason.year)
    .map(p => {
      const apps = seasonAppearances(p.id, races)
      const frac = apps / (raceIndex + 1)
      let score = 0
      let reason: 'playing_time' | 'team_performance' | 'unhappy' = 'unhappy'
      if (frac < 0.3) { score = (0.3 - frac) * 40; reason = 'playing_time' }
      // 役割ミスマッチ：任命した役割が期待する出場ラインを下回ると不満（エース/主力ほど強い）
      const roleExpect = p.teamRole === 'ace' ? 0.7 : p.teamRole === 'key_player' ? 0.5 : p.teamRole === 'sub_ace' ? 0.35 : 0
      if (roleExpect > 0 && frac < roleExpect) {
        const rs = (roleExpect - frac) * 55
        if (rs > score) { score = rs; reason = 'playing_time' }
      }
      if (ovr(p) >= 75 && myStandRank > trTotalTeams / 2) {
        const amb = (ovr(p) - 72) + (myStandRank - trTotalTeams / 2) * 1.2
        if (amb > score) { score = amb; reason = 'team_performance' }
      }
      if ((p.morale ?? MORALE_DEFAULT) < 50) {
        const un = (50 - (p.morale ?? MORALE_DEFAULT)) * 0.8
        if (un > score) { score = un; reason = 'unhappy' }
      }
      // 年俸重視の性格：相場の7割未満で使われていると「安すぎる」と不満を持つ（純粋なお金理由の移籍希望）。
      // ドラフト初回契約（rookieDeal）は安いのが前提なので対象外＝更新交渉で適正化する流れに乗せる
      if ((p.personality ?? 'salary') === 'salary' && !p.contract.rookieDeal) {
        const market = faMarketSalary(p, seasonPerfProfile(p.id, races, raceIndex + 1))
        const payRatio = market > 0 ? p.contract.annualSalary / market : 1
        if (payRatio < 0.7) {
          const money = (0.7 - payRatio) * 50
          if (money > score) { score = money; reason = 'unhappy' }
        }
      }
      return { id: p.id, score, reason }
    })
    .filter(c => c.score > 0)
  let newTransferReqs: { playerId: string; reason: 'playing_time' | 'team_performance' | 'unhappy' }[] = []
  if (trCandidates.length > 0 && rng() < 0.45) {
    const totalScore = trCandidates.reduce((s, c) => s + c.score, 0)
    let r = rng() * totalScore
    let picked = trCandidates[0]
    for (const c of trCandidates) { r -= c.score; if (r <= 0) { picked = c; break } }
    newTransferReqs = [{ playerId: picked.id, reason: picked.reason }]
    // この場で移籍希望を出した選手は、続く海外挑戦の抽選から外す
    openWish.add(picked.id)
  }

  // ── 海外挑戦の直訴：世界レベル（OVR80+・30歳以下）が「海外でやりたい」とチャットで言い出す。
  //    代表帰り（前年〜今年に世界選手権代表）は世界を見てきたので言い出しやすい ──
  // 夢の行き先はタイプで変わる：持久系→アフリカ高地／スピード系→欧州トラック／山・万能→北米
  // 夢の行き先は utils/transferDecision.ts の dreamRegionOf 1本（移籍の判定と同じ表を見る）
  const ovCands = players.filter(p => p.teamId === playerTeamId && p.status === 'active' && !p.loan
    && ovr(p) >= 80 && p.age <= 30 && !p.overseasListed && !openWish.has(p.id)
    && p.overseasDeniedYear !== currentSeason.year && !p.transferListed)
  let newOvReqs: { playerId: string; region: OverseasRegion }[] = []
  for (const p of ovCands) {
    const wasRep = (worldRepresentatives ?? []).some(r => r.playerId === p.id && r.year >= currentSeason.year - 1)
    if (rng() < (wasRep ? 0.10 : 0.03)) { newOvReqs = [{ playerId: p.id, region: dreamRegionOf(p.specialty) }]; break }
  }
  return { transferRequests: newTransferReqs, overseasRequests: newOvReqs }
}
