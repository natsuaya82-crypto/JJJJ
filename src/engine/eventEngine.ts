import type { Player, Season, Team, GameEvent, GameEventType, AITradeOffer } from '../types'
import { ovr, calcTransferValue } from '../utils/playerUtils'

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
      body: `${p.name}（疲労度${p.fatigue}）がトレーニング後に「少し体が重い」とコメント。次のレース前に対処しますか？`,
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
      body: `${p.name}のモチベーション低下をスタッフが懸念しています。何か手を打ちますか？`,
      choices: [
        { label: '個別面談で激励する', desc: '士気+25。' },
        { label: 'ボーナスを支給する', desc: '士気+15。予算-200万。' },
        { label: '様子を見る', desc: '対処なし。状況が悪化する恐れあり。' },
      ],
      resolved: false,
    })
  }

  // Player in hot form
  const goodFormPlayers = mainPlayers.filter(p => (p.form ?? 0) >= 1 && !recentPlayerIds.has(p.id))
  if (goodFormPlayers.length > 0 && !recentTypes.has('player_form_up') && Math.random() < 0.65) {
    const p = pickRandom(goodFormPlayers)
    candidates.push({
      id: uid(), raceIndex, type: 'player_form_up', playerId: p.id,
      title: `${p.name}が絶好調！`,
      body: `${p.name}の練習タイムが軒並み自己ベスト水準。このまま強化練習を積みますか？`,
      choices: [
        { label: '強化メニューを組む', desc: 'ランダム能力値+1。疲労+8。' },
        { label: '試合に向けて温存する', desc: '士気+10。' },
      ],
      resolved: false,
    })
  }

  // Young player breakthrough
  const youngPlayers = mainPlayers.filter(p => p.age <= 24 && p.yearsPro <= 3 && !recentPlayerIds.has(p.id))
  if (youngPlayers.length > 0 && !recentTypes.has('young_breakout') && Math.random() < 0.4) {
    const p = pickRandom(youngPlayers)
    candidates.push({
      id: uid(), raceIndex, type: 'young_breakout', playerId: p.id,
      title: `${p.name}が急成長の兆し`,
      body: `${p.name}（${p.age}歳）の練習での動きが別人のよう。才能が開花しつつあります。`,
      choices: [
        { label: '特別強化メニューを組む', desc: 'ランダム能力値+2。疲労+10。' },
        { label: '通常メニューを維持', desc: '無理させない。' },
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

  // Sponsor offer — シーズン1回限り
  if (!seasonTypes.has('sponsor_offer') && raceIndex >= 1 && Math.random() < 0.20) {
    candidates.push({
      id: uid(), raceIndex, type: 'sponsor_offer',
      title: 'スポンサーから追加支援の申し出',
      body: '大手スポーツメーカーからウェア提供とチーム強化費500万円の協力申し出が届いています。',
      choices: [
        { label: '受け入れる', desc: '予算+500万。GM評判+1。' },
        { label: '断る（独立性重視）', desc: 'GM評判+3。' },
      ],
      resolved: false,
    })
  }

  // Media interview
  if (!recentTypes.has('media_interview') && Math.random() < 0.5) {
    const rank = [...(season.standings ?? [])]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .findIndex(s => s.teamId === playerTeamId) + 1
    const ctx = rank <= 5 ? '快進撃' : rank >= 15 ? '苦しい状況' : 'チームの現状'
    candidates.push({
      id: uid(), raceIndex, type: 'media_interview',
      title: `メディア取材: ${ctx}についてコメントを`,
      body: `スポーツメディアから${ctx}について見解を求められています。どう対応しますか？`,
      choices: [
        { label: '強気のコメント', desc: 'GM評判+4。全員士気+5。' },
        { label: '冷静な分析コメント', desc: 'GM評判+2。' },
        { label: '選手を称えるコメント', desc: '全員士気+8。GM評判変化なし。' },
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
      body: `${p.name}が「もっとレースに起用してほしい」と直訴してきました。どう対応しますか？`,
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

  // Board warning (when gmRep is critically low)
  if (typeof gmRep === 'number' && gmRep < 35 && !recentTypes.has('board_warning')) {
    candidates.push({
      id: uid(), raceIndex, type: 'board_warning',
      title: '理事会から警告書',
      body: `GM評判${gmRep}は許容水準を下回っています。理事会はシーズン目標の達成とチーム立て直しを強く求めています。`,
      choices: [
        { label: '改善計画を提示する', desc: 'GM評判+5。理事会の信頼を部分回復。' },
        { label: '「結果で示す」と返答', desc: 'GM評判変化なし。プレッシャーが高まる。' },
      ],
      resolved: false,
    })
  }

  // Player career milestones
  const MILESTONE_THRESHOLDS = [25, 50, 75, 100, 150, 200]
  const milestonePlayers = mainPlayers.filter(p =>
    MILESTONE_THRESHOLDS.includes(p.career.totalRaces) && !recentPlayerIds.has(p.id)
  )
  if (milestonePlayers.length > 0 && !recentTypes.has('player_milestone')) {
    const p = milestonePlayers[0]
    candidates.push({
      id: uid(), raceIndex, type: 'player_milestone', playerId: p.id,
      title: `${p.name}がキャリア${p.career.totalRaces}レース達成`,
      body: `${p.name}が通算${p.career.totalRaces}レース出場を達成しました。節目を迎えた選手をどう祝いますか？`,
      choices: [
        { label: '個人祝福コメントを出す', desc: `${p.name}の士気+15。GM評判+2。` },
        { label: 'チーム全員でお祝いする', desc: '全員士気+8。一体感が生まれる。' },
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
      body: `${p.age}歳の${p.name}はまだ一度も優勝を経験していません。「このチームで頂点に立ちたい。全力を出し切る」と宣言しています。`,
      choices: [
        { label: '全面バックアップを約束する', desc: `${p.name}の士気+30・疲労+5。チーム全員も奮起する。` },
        { label: '「チームで掴み取ろう」と激励', desc: '全員士気+12。一体感向上。' },
        { label: '静かに見守る', desc: '対処なし。本人はやる気を燃やし続ける。' },
      ],
      resolved: false,
    })
  }

  // Rival provocation — rival team's GM makes headlines
  if (!recentTypes.has('rival_provocation') && Math.random() < 0.30) {
    const taunts = [
      'ライバルチームが強化合宿の成果を公開、「今年こそ優勝」と宣言',
      'ライバルが有力選手を補強、戦力強化が各所で話題に',
      'ライバルチームGMが「今季は優勝候補筆頭」と自信のコメント',
    ]
    candidates.push({
      id: uid(), raceIndex, type: 'rival_provocation',
      title: pickRandom(taunts),
      body: 'ライバルチームの強化ぶりが注目されています。選手への影響が出る前に手を打ちますか？',
      choices: [
        { label: '強烈な返答を出す', desc: 'チーム士気+15。GM評判+3。ライバル意識が高まる。' },
        { label: '冷静に結果で示すと語る', desc: 'GM評判+4。品格を保つ。' },
        { label: '無視する', desc: '何も変化なし。選手は独自に燃え上がるかも。' },
      ],
      resolved: false,
    })
  }

  // CPU team tries to poach your young prospect
  const youngStars = mainPlayers.filter(p => p.age <= 25 && ovr(p) >= 70 && !recentPlayerIds.has(p.id))
  if (youngStars.length > 0 && !recentTypes.has('ai_poaching') && Math.random() < 0.25) {
    const p = pickRandom(youngStars)
    candidates.push({
      id: uid(), raceIndex, type: 'ai_poaching', playerId: p.id,
      title: `他チームが${p.name}に接触`,
      body: `複数のチームが${p.name}（${p.age}歳 OVR${ovr(p)}）への関心を示し、代理人に接触してきました。`,
      choices: [
        { label: '即座に契約延長を提示する', desc: '予算-300万。士気+20。確実に引き留め。' },
        { label: '「移籍は考えていない」と一蹴する', desc: '士気+5。交渉はしないが意思を示す。' },
        { label: '様子を見る', desc: '放置すると士気低下と移籍志向が高まるリスク。' },
      ],
      resolved: false,
    })
  }

  // Team chemistry moment
  const avgMorale = mainPlayers.length > 0 ? mainPlayers.reduce((s, p) => s + p.morale, 0) / mainPlayers.length : 60
  if (avgMorale >= 72 && !recentTypes.has('team_chemistry') && Math.random() < 0.35) {
    candidates.push({
      id: uid(), raceIndex, type: 'team_chemistry',
      title: 'チームの絆が最高潮に',
      body: '選手たちの連帯感が高まっており、練習での動きも活き活きしています。このタイミングで何か仕掛けますか？',
      choices: [
        { label: 'チームミーティングで士気を高める', desc: '全員士気+10・疲労+3。集中力UP。' },
        { label: '特別合宿を組む', desc: '予算-200万。全員士気+20・疲労+8。' },
        { label: '自然の流れに任せる', desc: 'そのままキープ。費用なし。' },
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

export function generatePressConference(params: {
  playerTeamId: string
  raceIndex: number
  teamRank: number
  totalTeams: number
  segWins: number
}): GameEvent {
  const { raceIndex, teamRank, totalTeams, segWins } = params
  const isGood = teamRank <= 5
  const isBad = teamRank >= totalTeams - 4

  let title: string
  let body: string
  if (isGood) {
    title = 'レース後プレスカンファレンス — 好成績'
    body = `${teamRank}位という好成績について記者から質問が集中しています。どう語りますか？`
  } else if (isBad) {
    title = 'レース後プレスカンファレンス — 低迷'
    body = `${teamRank}位という成績を受け、記者から厳しい質問が続いています。`
  } else {
    title = 'レース後プレスカンファレンス'
    body = `レースの結果（${teamRank}位${segWins > 0 ? `・区間賞${segWins}回` : ''}）についてコメントを求められています。`
  }

  return {
    id: uid(),
    raceIndex,
    type: 'press_conference',
    title,
    body,
    choices: [
      { label: '前向きなコメント', desc: isGood ? 'GM評判+3。全員士気+6。' : 'GM評判+2。チームの雰囲気を守る。' },
      { label: '冷静・現実的なコメント', desc: 'GM評判+1。信頼感を高める。' },
      { label: '選手を全面的に称える', desc: '全員士気+10。個人の評判変化なし。' },
    ],
    resolved: false,
  }
}

function pickKey(pk: { year: number; round: number; pickNumber: number }): string {
  return `${pk.year}-R${pk.round}-${pk.pickNumber}`
}

function pickLabel(pk: { year: number; round: number; pickNumber: number }): string {
  return `${pk.year}年${pk.round}巡${pk.pickNumber}位指名権`
}

export function generateCpuTradeOffer(params: {
  players: Player[]
  teams: Team[]
  playerTeamId: string
  raceIndex: number
}): AITradeOffer | null {
  const { players, teams, playerTeamId, raceIndex } = params
  if (Math.random() > 0.65) return null

  const otherTeams = teams.filter(t => t.id !== playerTeamId && !t.isPlayerControlled)
  if (otherTeams.length === 0) return null

  const myMain = players.filter(p => p.teamId === playerTeamId && p.rosterTier === 'main' && p.status === 'active')
  const myPicks = teams.find(t => t.id === playerTeamId)?.draftPicks ?? []
  if (myMain.length === 0) return null

  // Pick initiating team weighted toward teams with actual needs
  const ALL_SPECS = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const teamWithNeed = otherTeams.find(t => {
    const roster = players.filter(p => p.teamId === t.id && p.rosterTier === 'main' && p.status === 'active')
    const counts: Record<string, number> = {}
    for (const p of roster) counts[p.specialty] = (counts[p.specialty] ?? 0) + 1
    return ALL_SPECS.some(s => (counts[s] ?? 0) < 2)
  })
  const fromTeam = (teamWithNeed && Math.random() < 0.6) ? teamWithNeed : pickRandom(otherTeams)

  const theirMain = players.filter(p => p.teamId === fromTeam.id && p.rosterTier === 'main' && p.status === 'active')
  const theirPicks = fromTeam.draftPicks ?? []

  // Determine what the AI team actually needs
  const theirCounts: Record<string, number> = {}
  for (const p of theirMain) theirCounts[p.specialty] = (theirCounts[p.specialty] ?? 0) + 1
  const theirNeeds = ALL_SPECS.filter(s => (theirCounts[s] ?? 0) < 2)

  // Determine what specialty the AI team has surplus in (3+ players)
  const theirSurplusSpecs = ALL_SPECS.filter(s => (theirCounts[s] ?? 0) >= 3)

  const roll = Math.random()

  // 15%: pick-for-pick
  if (roll < 0.15 && myPicks.length > 0 && theirPicks.length > 0) {
    const myPick = pickRandom(myPicks)
    const theirPick = pickRandom(theirPicks)
    return {
      id: uid(),
      fromTeamId: fromTeam.id,
      offeredPlayerIds: [],
      requestedPlayerIds: [],
      offeredPickKeys: [pickKey(theirPick)],
      requestedPickKeys: [pickKey(myPick)],
      expiresAtRace: raceIndex + 3,
      message: `${fromTeam.name}から指名権交換の提案：${pickLabel(theirPick)} ↔ ${pickLabel(myPick)}`,
    }
  }

  // 20%: pick-for-player (AI wants a player that fills their need)
  if (roll < 0.35 && theirPicks.length > 0) {
    // Prefer targeting a player that fills AI team's need
    let targets = theirNeeds.length > 0
      ? myMain.filter(p => theirNeeds.includes(p.specialty))
      : myMain
    if (targets.length === 0) targets = myMain
    targets = [...targets].sort((a, b) => ovr(b) - ovr(a))
    // Don't always target the absolute best — vary between mid-tier players
    const maxIdx = Math.min(5, targets.length - 1)
    const target = targets[Math.floor(Math.random() * (maxIdx + 1))]
    const targetVal = calcTransferValue(target)
    const r1Picks = theirPicks.filter(pk => pk.round === 1)
    const usePick = targetVal >= 60000000 && r1Picks.length > 0
      ? pickRandom(r1Picks)
      : theirPicks.length > 0 ? pickRandom(theirPicks) : null
    if (!usePick) return null
    return {
      id: uid(),
      fromTeamId: fromTeam.id,
      offeredPlayerIds: [],
      requestedPlayerIds: [target.id],
      offeredPickKeys: [pickKey(usePick)],
      requestedPickKeys: [],
      expiresAtRace: raceIndex + 3,
      message: `${fromTeam.name}から${target.name}に対し${pickLabel(usePick)}での獲得打診`,
    }
  }

  // Remaining 65%: player-for-player — need-based matching
  if (theirMain.length === 0) return null

  // AI targets a player from player's team that fills their need
  let myTargets = theirNeeds.length > 0
    ? myMain.filter(p => theirNeeds.includes(p.specialty))
    : myMain
  if (myTargets.length === 0) myTargets = myMain
  myTargets = [...myTargets].sort((a, b) => ovr(b) - ovr(a))
  const maxTargetIdx = Math.min(4, myTargets.length - 1)
  const target = myTargets[Math.floor(Math.random() * (maxTargetIdx + 1))]
  const targetVal = calcTransferValue(target)

  // AI offers a player from their surplus specialty (or best comparable)
  let offerPool = theirSurplusSpecs.length > 0
    ? theirMain.filter(p => theirSurplusSpecs.includes(p.specialty) && ovr(p) >= 65)
    : theirMain.filter(p => ovr(p) >= 65)
  // Match by value range (within ±40%)
  const comparable = offerPool.filter(p => {
    const v = calcTransferValue(p)
    return v >= targetVal * 0.6 && v <= targetVal * 1.6
  })
  if (comparable.length > 0) offerPool = comparable
  const offer = pickRandom(offerPool)
  if (!offer) return null

  const offerVal = calcTransferValue(offer)
  const valDiffM = Math.round((offerVal - targetVal) / 1000000)

  // Sweeten with a pick if AI player is worth less
  let offeredPickKeys: string[] | undefined
  let pickNote = ''
  if (offerVal < targetVal * 0.8 && theirPicks.length > 0 && Math.random() < 0.65) {
    const sweetener = pickRandom(theirPicks)
    offeredPickKeys = [pickKey(sweetener)]
    pickNote = ` + ${pickLabel(sweetener)}`
  }

  const valueNote = valDiffM >= 10 ? `（市場価格+${valDiffM}M有利）` : valDiffM <= -10 ? `（市場価格${valDiffM}M）` : ''

  return {
    id: uid(),
    fromTeamId: fromTeam.id,
    offeredPlayerIds: [offer.id],
    requestedPlayerIds: [target.id],
    ...(offeredPickKeys ? { offeredPickKeys } : {}),
    expiresAtRace: raceIndex + 3,
    message: `${fromTeam.name}から${offer.name}${pickNote}↔${target.name}の交換提案${valueNote}`,
  }
}

