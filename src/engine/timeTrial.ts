// 記録会（individualEvent）の本体。`raceSlice` の `simulateIndividualEvent` から切り出した（挙動不変）。
// 歴代1位の更新だけは別ファイル（`engine/timeTrialRecords.ts`）。
//
// ■ここに置いたもの
//   ・誰が走るか（国内・海外・スカウト候補の絞り込み）
//   ・走らせて順位を付ける
//   ・出走と休養の疲労
//   ・カード報酬（自チームだけ）
//   ・チーム歴代記録
//
// ■乱数について
//   `runTimeTrial`（1人につき1回）と `timeTrialRewardCards`（報酬1枚につき1回）が
//   `Math.random()` を使う。**呼ばれる回数と順番が変わると結果が変わる**ので、
//   走者の並び順も、順位表をなめる順も変えないこと。
import { CARD_UNIT_EXP } from '../data/cardShop'
import { simulateIndividualTime } from './individualRace'
import { domesticTeamIdSet, foreignClubIdSet } from '../utils/clubs'
import type { CardRarity, CardStatKey, ForeignLeague, IndividualEvent, Player, Team, TrainingCard } from '../types'
import type { EventDistKey } from '../types'

/**
 * **海外クラブの選手も走れる記録会**（この4つだけ）。
 * それ以外は国内リーグ所属だけ。IDの頭で見るので、年が付いていても当たる。
 */
export const FOREIGN_TT_KEYS = ['tt-5k-1', 'tt-10k-2', 'tt-mara', 'tt-half-2']

/** 疲れていると自動で休む線（自チームだけはプレイヤーの選択に従うので効かない） */
const AUTO_REST_FATIGUE = 40
/** 出走で増える疲労（距離ごと）。表に無い距離は5 */
const FAT_GAIN: Record<number, number> = { 5000: 3, 10000: 5, 21097: 8, 42195: 14 }
/** 休んだ現役選手が回復するぶん */
export const TT_REST_RECOVERY = -8
/** 自チームで士気と調子が上がる順位 */
const TT_BOOST_RANK = 3

export type TimeTrialResult = { playerId: string; teamId: string; timeSec: number; rank: number }

export function timeTrialFatigueGain(distance: number): number {
  return FAT_GAIN[distance] ?? 5
}

/**
 * その記録会に出る人を集める。
 *
 * ★**自チームだけは疲労で自動的に外れない**（出る／休むはプレイヤーが決めるので、
 *   `skip` に入っていなければ疲れていても走る）。
 * ★スカウト候補（大学・高校のドラフト候補）も走らせて実力タイムを残す。まだどこにも
 *   所属していないので `teamId` は空。**名簿にも居る候補は二重に数えない**。
 * ★返す順番がそのまま乱数を引く順番になる。並べ替えないこと。
 */
export function timeTrialRunners(
  w: {
    players: Player[]
    teams: Team[]
    foreignLeagues: ForeignLeague[]
    playerTeamId: string
    prospects: Player[]
  },
  event: Pick<IndividualEvent, 'id'>,
  skip: Set<string>,
): Player[] {
  const domesticIds = domesticTeamIdSet(w.teams)
  const foreignAllowed = FOREIGN_TT_KEYS.some(k => event.id.startsWith(k))
  const foreignIds = foreignAllowed ? foreignClubIdSet(w.foreignLeagues) : new Set<string>()
  const prospects = w.prospects.filter(p =>
    (p.status === 'active' || p.status === 'draft_eligible')
    && !skip.has(p.id)
    && !w.players.some(pl => pl.id === p.id))
  return [
    ...w.players.filter(p =>
      p.status === 'active' && !skip.has(p.id)
      && (
        (domesticIds.has(p.teamId) && (p.teamId === w.playerTeamId || (p.fatigue ?? 0) < AUTO_REST_FATIGUE))
        || (foreignIds.has(p.teamId) && (p.fatigue ?? 0) < AUTO_REST_FATIGUE)
      )),
    ...prospects,
  ]
}

/** 走らせて、速い順に順位を付ける */
export function runTimeTrial(runners: readonly Player[], event: Pick<IndividualEvent, 'distance' | 'weather'>): TimeTrialResult[] {
  const results = runners.map(p => ({
    playerId: p.id,
    teamId: p.teamId,
    timeSec: simulateIndividualTime(p, event.distance, event.weather) }))
  results.sort((a, b) => a.timeSec - b.timeSec)
  return results.map((r, i) => ({ ...r, rank: i + 1 }))
}

/** 自チームで士気と調子が上がる人（上位3人） */
export function timeTrialBoosted(ranked: readonly TimeTrialResult[], myTeamId: string): Set<string> {
  return new Set(ranked.filter(r => r.teamId === myTeamId && r.rank <= TT_BOOST_RANK).map(r => r.playerId))
}

/**
 * カード報酬（**自チームだけ**）。総合1位＝レジェンダリー／2〜10位＝エピック／
 * 11〜100位＝レア を各1枚。101位以下は無し。
 * ★どの能力のカードになるかは乱数。**順位表を上から順になめること**（引く順が変わる）。
 */
const CARD_STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
export function timeTrialRewardCards(
  ranked: readonly TimeTrialResult[], myTeamId: string, eventId: string,
): TrainingCard[] {
  const cards: TrainingCard[] = []
  for (const r of ranked) {
    if (r.teamId !== myTeamId) continue
    const rarity: CardRarity | null = r.rank === 1 ? 'legendary' : r.rank <= 10 ? 'epic' : r.rank <= 100 ? 'rare' : null
    if (!rarity) continue
    cards.push({
      id: `tt_${eventId}_${r.playerId}`,
      statKey: CARD_STAT_KEYS[Math.floor(Math.random() * CARD_STAT_KEYS.length)],
      rarity,
      value: CARD_UNIT_EXP[rarity] })
  }
  return cards
}

/** チームの歴代記録に残す人数（種目ごと） */
const TEAM_EVENT_RECORD_MAX = 30

/**
 * チーム歴代記録。走った選手のタイムを**そのとき所属していたクラブ**に残す（選手ごと最速）。
 * 名前と国籍も焼き込む——選手データが長期整理で消えても、記録が名前ごと残るように。
 */
export function updateTeamEventRecords(
  teams: Team[],
  ranked: readonly TimeTrialResult[],
  playerById: Map<string, Player>,
  key: EventDistKey,
  year: number,
): Team[] {
  const byTeam = new Map<string, { playerId: string; timeSec: number }[]>()
  for (const r of ranked) {
    const arr = byTeam.get(r.teamId) ?? []
    arr.push({ playerId: r.playerId, timeSec: r.timeSec })
    byTeam.set(r.teamId, arr)
  }
  return teams.map(t => {
    const ups = byTeam.get(t.id)
    if (!ups || ups.length === 0) return t
    const byPlayer = new Map((t.eventRecords?.[key] ?? []).map(e => [e.playerId, e]))
    for (const u of ups) {
      const prev = byPlayer.get(u.playerId)
      const pl = playerById.get(u.playerId)
      if (!prev || u.timeSec < prev.timeSec) {
        byPlayer.set(u.playerId, { playerId: u.playerId, playerName: pl?.name, nationality: pl?.nationality, timeSec: u.timeSec, year })
      }
    }
    const merged = [...byPlayer.values()].sort((a, b) => a.timeSec - b.timeSec).slice(0, TEAM_EVENT_RECORD_MAX)
    return { ...t, eventRecords: { ...t.eventRecords, [key]: merged } }
  })
}
