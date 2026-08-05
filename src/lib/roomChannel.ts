// 対戦中のリアルタイム通信（Supabase Realtime のブロードキャスト）。
//
// 考え方
//   ・DBに残すのは「誰がどの部屋にいるか」と「終わった試合の戦績」だけ（roomsApi.ts）。
//     ルール決め・選手選び・レース再生のやりとりは全部ここを流れて、記録には残さない。
//   ・イベントは必ず送り主（from）が付く。受け手は「ホストからのものか」を見て信用する。
//   ・自分が送ったイベントも自分に返ってくる（self: true）。ホストも他の人とまったく同じ
//     コードで同じタイミングに進めるようにするため。
//   ・presence で「今つながっている人」が分かる。ここから消えた＝切断＝不戦敗の判定に使う。
//
// チャンネル名は部屋のUUID。番号（6桁）ではなく推測できないIDを使っている。
import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

/** イベント名。文字列の打ち間違いを防ぐためここにまとめる。 */
export const RoomEvent = {
  /** ロビーの人が増減した → 各自 listMembers() を引き直す */
  LOBBY: 'lobby',
  /** ホスト → ルール確定＆選択フェーズ開始（deadline付き） */
  RULES: 'rules',
  /** ホスト → 今回走るコースの発表（deadline付き） */
  COURSE: 'course',
  /** ホスト → 選手選択フェーズ開始（deadline付き） */
  PICK: 'pick',
  /** 参加者 → 自分のオーダー提出 */
  ENTRY: 'entry',
  /** ホスト → レース結果＋走り出す時刻（startAt）。全員これを同じタイミングで再生する */
  RACE: 'race',
  /** 参加者 → この区間を見終わった（「次の区間へ」を押した） */
  SEG: 'seg',
  /** ホスト → 全員そろったので次の区間へ */
  SEGGO: 'seggo',
  /** 参加者 → このレースを見終わった（「次へ」を押した） */
  NEXT: 'next',
  /** ホスト → シリーズ終了 */
  FINISH: 'finish',
  /** ホスト → 中止（ホスト落ち・人数不足など） */
  ABORT: 'abort',
  /** 参加者 → 応援スタンプ。記録には残さず、その場に居た人の画面に出るだけ */
  STAMP: 'stamp',
} as const

export type RoomEventName = typeof RoomEvent[keyof typeof RoomEvent]

export type ChannelStatus = 'connecting' | 'online' | 'offline'

export type RoomChannel = {
  roomId: string
  /** イベントを部屋全員へ送る（自分にも返ってくる） */
  send(event: RoomEventName, payload?: unknown): Promise<void>
  /** 受信登録。戻り値を呼ぶと解除。 */
  on<T = unknown>(event: RoomEventName, cb: (payload: T, from: string) => void): () => void
  /** 接続中のユーザーID一覧が変わったときに呼ばれる */
  onPresence(cb: (userIds: string[]) => void): () => void
  /** 接続状態が変わったときに呼ばれる */
  onStatus(cb: (status: ChannelStatus) => void): () => void
  /** 今つながっている人 */
  online(): string[]
  close(): void
}

type Envelope = { from: string; data: unknown }

/**
 * 部屋のチャンネルを開く。subscribe が終わる（＝送受信できる状態になる）まで待つ。
 * 接続できなくても例外は投げず、status が 'offline' のまま返る。
 */
export function openRoomChannel(roomId: string, userId: string): Promise<RoomChannel> {
  const ch: RealtimeChannel = supabase.channel(`room:${roomId}`, {
    config: {
      broadcast: { self: true },        // ホストも他人と同じ経路・同じ間で受け取る
      presence: { key: userId },
    },
  })

  const handlers = new Map<string, Set<(payload: unknown, from: string) => void>>()
  const presenceCbs = new Set<(ids: string[]) => void>()
  const statusCbs = new Set<(s: ChannelStatus) => void>()
  let onlineIds: string[] = []
  let closed = false

  for (const event of Object.values(RoomEvent)) {
    ch.on('broadcast', { event }, msg => {
      const env = (msg as { payload?: Envelope }).payload
      if (!env) return
      handlers.get(event)?.forEach(cb => {
        try { cb(env.data, env.from) } catch (e) { console.warn('[room] handler failed', event, e) }
      })
    })
  }

  const syncPresence = () => {
    onlineIds = Object.keys(ch.presenceState())
    presenceCbs.forEach(cb => cb(onlineIds))
  }
  ch.on('presence', { event: 'sync' }, syncPresence)
  ch.on('presence', { event: 'join' }, syncPresence)
  ch.on('presence', { event: 'leave' }, syncPresence)

  // 接続できたのは openRoomChannel が返る前なので、あとから onStatus を付けた側にも
  // 現在の状態をすぐ渡す（そうしないと画面が「接続中…」のまま固まる）
  let status: ChannelStatus = 'connecting'
  const emitStatus = (s: ChannelStatus) => { status = s; statusCbs.forEach(cb => cb(s)) }

  const api: RoomChannel = {
    roomId,
    async send(event, payload) {
      if (closed) return
      const env: Envelope = { from: userId, data: payload ?? null }
      await ch.send({ type: 'broadcast', event, payload: env })
    },
    on(event, cb) {
      const set = handlers.get(event) ?? new Set()
      handlers.set(event, set)
      set.add(cb as (p: unknown, f: string) => void)
      return () => { set.delete(cb as (p: unknown, f: string) => void) }
    },
    onPresence(cb) {
      presenceCbs.add(cb)
      if (onlineIds.length) cb(onlineIds)
      return () => { presenceCbs.delete(cb) }
    },
    onStatus(cb) {
      statusCbs.add(cb)
      cb(status)
      return () => { statusCbs.delete(cb) }
    },
    online() { return onlineIds },
    close() {
      if (closed) return
      closed = true
      handlers.clear(); presenceCbs.clear(); statusCbs.clear()
      supabase.removeChannel(ch)
    },
  }

  return new Promise<RoomChannel>(resolve => {
    let settled = false
    const done = () => { if (!settled) { settled = true; resolve(api) } }

    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        emitStatus('online')
        ch.track({ user_id: userId, at: Date.now() }).catch(() => {})
        done()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        emitStatus('offline')
        done()   // つながらなくても画面は進める（オフライン表示にする）
      } else {
        emitStatus('connecting')
      }
    })

    // 保険：subscribe のコールバックが来ないまま固まったときのために10秒で打ち切る
    setTimeout(done, 10000)
  })
}
