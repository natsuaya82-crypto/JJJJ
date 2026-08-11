// シーズン中のイベントで「どの肢を選ぶと何が起きるか」の表。
// `raceSlice` の `resolveEvent`（178行の if-else）から切り出した（挙動不変）。
//
// ■なぜ表にするのか
//   中身は **19種 × 最大3肢 の対応表**なのに、if-else で書いてあったので
//   同じ形が何度も手書きされていた。
//
//     本人の士気を動かす            16回
//     自チーム全員の士気を動かす      9回
//     自チームの資金を動かす         10回
//     評判を上下限つきで動かす       11回
//
//   しかも「何も起きない肢」は**書いていないことでしか表せない**ので、
//   `young_breakout` の肢1が意図して何も起きないのか、書き忘れなのかが読めなかった。
//   表にすると、その肢が表に無い＝何も起きない、と一目で分かる。
//
// ■読み方
//   `EVENT_EFFECTS[種類]` は
//     `needsPlayer` … 対象の選手が要るか（居なければ**何も起きない**）
//     `byChoice`    … 肢の番号ごとの効き目（**ぴったり一致したときだけ**）
//     `fallback`    … それ以外の肢。無ければ何も起きない
//   元の if-else の `else` が `fallback`、`else if (choiceIndex === 2)` のような
//   飛び番が `byChoice` の 2 にあたる。
import { withFatigue, withGmRep, withMorale } from '../utils/condition'
import { getStatPotentials } from '../utils/playerUtils'
import type { GameEvent, GameEventType, Player, Season, Team } from '../types'

/** イベントが書き換えるものだけを集めた世界 */
export type EventWorld = {
  players: Player[]
  teams: Team[]
  gmRep: number
  season: Season
}

/** 効き目1つ。**必ず新しい世界を返す**（渡された世界は書き換えない） */
type Effect = (w: EventWorld, pid: string | undefined, myTeamId: string) => EventWorld

type EventRule = {
  /** 対象の選手が要る。居ないときは何も起きない（元の `&& pid` と同じ） */
  needsPlayer?: true
  /** 肢の番号がぴったり一致したときの効き目 */
  byChoice: Record<number, Effect>
  /** どれにも当たらない肢。無ければ何も起きない */
  fallback?: Effect
}

// ── 効き目の部品 ────────────────────────────────────────────────────
const onPlayer = (f: (p: Player) => Player): Effect =>
  (w, pid) => ({ ...w, players: w.players.map(p => (p.id === pid ? f(p) : p)) })

const onSquad = (f: (p: Player) => Player): Effect =>
  (w, _pid, my) => ({ ...w, players: w.players.map(p => (p.teamId === my ? f(p) : p)) })

/** 自チームのうち、本人を**除いた**全員。`veteran_ambition` だけがこれ */
const onSquadExceptSelf = (f: (p: Player) => Player): Effect =>
  (w, pid, my) => ({ ...w, players: w.players.map(p => (p.teamId === my && p.id !== pid ? f(p) : p)) })

const budget = (delta: number): Effect =>
  (w, _pid, my) => ({ ...w, teams: w.teams.map(t => (t.id === my ? { ...t, finance: { ...t.finance, budget: t.finance.budget + delta } } : t)) })

const rep = (delta: number): Effect =>
  w => ({ ...w, gmRep: withGmRep(w.gmRep, delta) })

/** 順に適用する。**順番は効き目に影響する**（乱数を使う効き目があるため変えないこと） */
const seq = (...fs: Effect[]): Effect =>
  (w, pid, my) => fs.reduce((acc, f) => f(acc, pid, my), w)

const morale = (delta: number): Effect => onPlayer(p => withMorale(p, delta))
const squadMorale = (delta: number): Effect => onSquad(p => withMorale(p, delta))

/**
 * 能力を1つだけ伸ばす（どれが伸びるかは乱数）。ポテンシャルで頭打ち。
 * ★`Math.random()` を1回使う。**呼ばれる回数と順番が変わると結果が変わる**ので、
 *   マップの外で1回引く元の形をそのまま保つこと。
 */
const STATS = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery'] as const
const bumpRandomStat = (amount: number, fatigueGain: number): Effect => (w, pid) => {
  const stat = STATS[Math.floor(Math.random() * STATS.length)]
  return {
    ...w,
    players: w.players.map(p => (p.id === pid
      ? { ...p,
          ratings: { ...p.ratings, [stat]: Math.min((getStatPotentials(p) as Record<string, number>)[stat] ?? 99, p.ratings[stat] + amount) },
          fatigue: withFatigue(p, fatigueGain).fatigue }
      : p)),
  }
}

/**
 * 移籍要求を無視したときに**札がもう1枚増える**（態度が硬化する）。
 * 効き目の中で唯一、イベントそのものを足す。
 */
const escalateTransferRequest: Effect = (w, pid) => {
  const reqPlayer = w.players.find(p => p.id === pid)
  if (!reqPlayer || !pid) return w
  const next = w.players.map(p => (p.id === pid ? withMorale(p, -25) : p))
  const escalation: GameEvent = {
    id: `evt_${Date.now()}`,
    raceIndex: w.season.currentRaceIndex + 1,
    type: 'transfer_request',
    playerId: pid,
    title: `${reqPlayer.name}が移籍を強く要求`,
    body: '無視されたことで態度が硬化。エージェントが正式に移籍要求書を提出しました。これ以上放置すれば士気は底を打ちます。',
    choices: [
      { label: '慰留費を支払う（-500万）', desc: 'モラール+20。今季は残留確定。' },
      { label: '移籍市場に出す', desc: '選手を売却プロセスへ。' },
      { label: '無視する', desc: 'モラール-30。パフォーマンス大幅低下。' },
    ],
    resolved: false }
  return { ...w, players: next, season: { ...w.season, events: [...(w.season.events ?? []), escalation] } }
}

// ── 表 ──────────────────────────────────────────────────────────────
export const EVENT_EFFECTS: Partial<Record<GameEventType, EventRule>> = {
  player_fatigue: {
    needsPlayer: true,
    byChoice: {
      0: onPlayer(p => ({ ...withFatigue(p, -40), form: Math.min(2, (p.form ?? 0) + 1), missNextRace: true })),
      1: onPlayer(p => withFatigue(p, -15)),
    },
    fallback: onPlayer(p => withFatigue(p, 15)),
  },
  player_morale_low: {
    needsPlayer: true,
    byChoice: { 0: morale(25), 1: seq(morale(15), budget(-2_000_000)) },
    fallback: morale(-15),
  },
  player_form_up: {
    needsPlayer: true,
    byChoice: { 0: bumpRandomStat(1, 8) },
    fallback: morale(10),
  },
  young_breakout: {
    needsPlayer: true,
    byChoice: { 0: bumpRandomStat(2, 10) },
    // 肢1は**意図して何も起きない**（元の if-else にも else が無い）
  },
  player_wants_renewal: {
    needsPlayer: true,
    byChoice: { 0: morale(10) },
    fallback: morale(-5),
  },
  sponsor_offer: {
    byChoice: { 0: seq(budget(5_000_000), rep(1)) },
    fallback: rep(3),
  },
  media_interview: {
    byChoice: { 0: seq(rep(4), squadMorale(5)), 1: rep(2) },
    fallback: squadMorale(8),
  },
  press_conference: {
    byChoice: { 0: seq(rep(3), squadMorale(6)), 1: rep(1) },
    fallback: squadMorale(10),
  },
  playing_time_demand: {
    needsPlayer: true,
    byChoice: { 0: morale(20), 1: morale(5) },
    fallback: morale(-15),
  },
  transfer_request: {
    needsPlayer: true,
    // 肢1（移籍市場に出す）はここでは何も起きない＝売却の手続きは別の画面
    byChoice: { 0: seq(morale(15), budget(-3_000_000)), 2: escalateTransferRequest },
  },
  board_warning: {
    byChoice: { 0: rep(5) },
  },
  player_milestone: {
    needsPlayer: true,
    byChoice: { 0: morale(15) },
    fallback: squadMorale(8),
  },
  veteran_ambition: {
    needsPlayer: true,
    byChoice: {
      // ★本人だけ士気+30と疲労+5、**それ以外の**チームメイトが+8。
      //   ここだけ「本人を除く」なので onSquad と混ぜないこと
      0: seq(onPlayer(p => withFatigue(withMorale(p, 30), 5)), onSquadExceptSelf(p => withMorale(p, 8))),
      1: squadMorale(12),
    },
  },
  rival_provocation: {
    byChoice: { 0: seq(squadMorale(15), rep(3)), 1: rep(4) },
  },
  ai_poaching: {
    needsPlayer: true,
    byChoice: { 0: seq(morale(20), budget(-3_000_000)), 1: morale(5) },
    fallback: morale(-20),
  },
  team_chemistry: {
    byChoice: {
      0: onSquad(p => withFatigue(withMorale(p, 10), 3)),
      1: seq(onSquad(p => withFatigue(withMorale(p, 20), 8)), budget(-2_000_000)),
    },
  },
  player_retirement: {
    needsPlayer: true,
    byChoice: { 0: seq(morale(20), budget(-20_000_000)) },
    // 受け入れても**その場では引退しない**。「今季限りで引退」の印を立てるだけで、
    // 実際の引退処理（名簿から外す・レジェンド登録）は endSeason がやる
    fallback: seq(
      (w, pid) => ({ ...w, players: w.players.map(p => (p.id === pid ? { ...p, pendingRetirementYear: w.season.year } : p)) }),
      squadMorale(8)),
  },
  budget_boost: {
    byChoice: { 0: budget(10_000_000), 1: seq(budget(25_000_000), rep(-5)) },
  },
  budget_crisis: {
    byChoice: { 0: seq(budget(30_000_000), rep(-2)), 1: seq(squadMorale(-10), budget(15_000_000)) },
  },
}

/**
 * イベント1件を決着させた世界を返す。**決着の印（resolved）はここでは付けない**
 * （呼び出し側が札の一覧ごと差し替えるため）。
 */
export function applyEventChoice(w: EventWorld, event: GameEvent, choiceIndex: number, myTeamId: string): EventWorld {
  const rule = EVENT_EFFECTS[event.type]
  if (!rule) return w
  if (rule.needsPlayer && !event.playerId) return w
  const effect = rule.byChoice[choiceIndex] ?? rule.fallback
  if (!effect) return w
  return effect(w, event.playerId, myTeamId)
}
