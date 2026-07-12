import type { Player, Season, Team, GameEvent, GameEventType } from '../types'
import { ovr } from '../utils/playerUtils'

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function pickRandom<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error('pickRandom called with empty array')
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateRaceEvents(params: {
  players: Player[]
  playerTeamId: string
  raceIndex: number
  season: Season
  gmRep?: number
  teams?: Team[]
}): GameEvent[] {
  const { players, playerTeamId, raceIndex, season, gmRep } = params
  const mainPlayers = players.filter(
    p => p.teamId === playerTeamId && p.rosterTier === 'main' && p.status === 'active'
  )

  const recentTypes = new Set<GameEventType>(
    (season.events ?? []).filter(e => raceIndex - e.raceIndex < 3).map(e => e.type)
  )
  const recentPlayerIds = new Set<string>(
    (season.events ?? [])
      .filter(e => raceIndex - e.raceIndex < 2 && e.playerId)
      .map(e => e.playerId!)
  )
  // Budget events: check entire season (not just last 3 races)
  const seasonTypes = new Set<GameEventType>(
    (season.events ?? []).map(e => e.type)
  )

  const candidates: GameEvent[] = []

  // Player fatigue warning
  const tiredPlayers = mainPlayers.filter(p => p.fatigue >= 72 && !recentPlayerIds.has(p.id))
  if (tiredPlayers.length > 0 && !recentTypes.has('player_fatigue') && Math.random() < 0.55) {
    const p = pickRandom(tiredPlayers)
    candidates.push({
      id: uid(), raceIndex, type: 'player_fatigue', playerId: p.id,
      title: `${p.name}が疲労を訴えている`,
      body: `監督、正直に言うと少し体が重いんです…。次のレース前に、休ませてもらえませんか？`,
      choices: [
        { label: '休養させる', desc: '疲労-30・フォーム+1。次レース欠場。' },
        { label: '軽め調整に切り替える', desc: '疲労-10。出場は維持。' },
        { label: 'そのまま出場させる', desc: '対処なし。故障リスクがわずかに上昇。' },
      ],
      resolved: false,
    })
  }

  // Low morale
  const lowMoralePlayers = mainPlayers.filter(p => p.morale < 45 && !recentPlayerIds.has(p.id))
  if (lowMoralePlayers.length > 0 && !recentTypes.has('player_morale_low') && Math.random() < 0.35) {
    const p = pickRandom(lowMoralePlayers)
    candidates.push({
      id: uid(), raceIndex, type: 'player_morale_low', playerId: p.id,
      title: `${p.name}の士気が低下`,
      body: `監督…最近どうも気持ちが乗らなくて。すみません、正直に言うと少し参ってます。`,
      choices: [
        { label: '個別面談で激励する', desc: '士気+25。' },
        { label: 'ボーナスを支給する', desc: '士気+15。予算-200万。' },
        { label: '様子を見る', desc: '対処なし。状況が悪化する恐れあり。' },
      ],
      resolved: false,
    })
  }

  // Contract expiry
  const expiringPlayers = mainPlayers.filter(p => p.contract.yearsLeft <= 1 && !recentPlayerIds.has(p.id))
  if (expiringPlayers.length > 0 && !recentTypes.has('player_wants_renewal') && Math.random() < 0.7) {
    const p = expiringPlayers[0]
    candidates.push({
      id: uid(), raceIndex, type: 'player_wants_renewal', playerId: p.id,
      title: `${p.name}が契約更新を要求`,
      body: `${p.name}の代理人から「シーズン終了前に方針を示してほしい」と連絡がありました。`,
      choices: [
        { label: '「交渉する」と伝える', desc: '士気+10。契約タブで更新手続きを。' },
        { label: '今は様子を見る', desc: '士気-5。後回し。' },
      ],
      resolved: false,
    })
  }

  // Playing time demand
  const benchPlayers = mainPlayers.filter(p => p.morale < 55 && p.age <= 28 && !recentPlayerIds.has(p.id))
  if (raceIndex >= 3 && benchPlayers.length > 0 && !recentTypes.has('playing_time_demand') && Math.random() < 0.25) {
    const p = pickRandom(benchPlayers)
    candidates.push({
      id: uid(), raceIndex, type: 'playing_time_demand', playerId: p.id,
      title: `${p.name}が出場機会を要求`,
      body: `監督、最近出番が少なくて…。正直、もっとレースで走りたいです。使ってもらえませんか？`,
      choices: [
        { label: '起用を約束する', desc: '士気+20。次のレースで優先配置することを意識して。' },
        { label: '「状況を見て判断する」と伝える', desc: '士気+5。当たり障りのない対応。' },
        { label: '「実力でつかみとれ」と告げる', desc: '士気-5。ただしモチベーション↑の選手も。' },
      ],
      resolved: false,
    })
  }

  // Transfer request
  const transferCandidates = mainPlayers.filter(p => p.morale < 35 && p.contract.yearsLeft <= 2 && !recentPlayerIds.has(p.id))
  if (transferCandidates.length > 0 && !recentTypes.has('transfer_request') && Math.random() < 0.4) {
    const p = transferCandidates[0]
    candidates.push({
      id: uid(), raceIndex, type: 'transfer_request', playerId: p.id,
      title: `${p.name}が移籍を希望`,
      body: `${p.name}の代理人から「環境を変えたい」との意向が伝えられました。`,
      choices: [
        { label: '引き留める（士気+15/予算-300万）', desc: '残留。士気+15、予算-300万。' },
        { label: '移籍市場に出す', desc: '移籍タブからトレード交渉が可能に。' },
        { label: '様子を見る', desc: '対処なし。士気がさらに下がる可能性。' },
      ],
      resolved: false,
    })
  }

  // Veteran ambition — older high-OVR player with no championship
  const veteranDream = mainPlayers.filter(p =>
    p.age >= 32 && ovr(p) >= 68 && p.career.championships === 0 && !recentPlayerIds.has(p.id)
  )
  if (veteranDream.length > 0 && !recentTypes.has('veteran_ambition') && Math.random() < 0.40) {
    const p = pickRandom(veteranDream)
    candidates.push({
      id: uid(), raceIndex, type: 'veteran_ambition', playerId: p.id,
      title: `${p.name}が「優勝への執念」を語る`,
      body: `監督、俺はこのチームでまだ一度も優勝してない。${p.age}歳になった今、最後にこのチームで頂点に立ちたいんです。`,
      choices: [
        { label: '全面バックアップを約束する', desc: `${p.name}の士気+30・疲労+5。チーム全員も奮起する。` },
        { label: '「チームで掴み取ろう」と激励', desc: '全員士気+12。一体感向上。' },
        { label: '静かに見守る', desc: '対処なし。本人はやる気を燃やし続ける。' },
      ],
      resolved: false,
    })
  }

  // Shuffle and cap at 2 per race
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  return candidates.slice(0, 2)
}


