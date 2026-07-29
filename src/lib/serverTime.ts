// サーバー時刻オフセット
//
// オンライン対戦は「◯時◯分◯秒に締め切り」という絶対時刻を全員で共有して進める。
// ところが端末の時計は平気で数十秒ズレているので、そのまま Date.now() を使うと
// 「自分だけ先にカウントが終わる／終わらない」が起きる。
//
// そこで Supabase の HTTP レスポンスヘッダ Date（＝サーバーの時計）を読んで、
// 端末時計との差を覚えておき、以後は serverNow() を時刻の基準にする。
// Date ヘッダは CORS のセーフリストなので追加設定なしで読める。精度は1秒だが、
// 往復時間の半分を足して中点を取っているので実用上は±0.5秒程度に収まる。

import { SUPABASE_URL, SUPABASE_KEY } from './supabase'

let offsetMs = 0          // serverNow() = Date.now() + offsetMs
let synced = false
let syncing: Promise<void> | null = null
let lastSyncAt = 0

const RESYNC_INTERVAL = 10 * 60 * 1000   // 10分たったら測り直す

async function measure(): Promise<void> {
  const t0 = Date.now()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'HEAD',
    headers: { apikey: SUPABASE_KEY },
    cache: 'no-store',
  })
  const t1 = Date.now()
  const header = res.headers.get('date')
  if (!header) return
  const server = new Date(header).getTime()
  if (!Number.isFinite(server)) return

  // 往復のうち半分がレスポンスの帰り道だと仮定して、受信時点のサーバー時刻を推定する
  offsetMs = server + (t1 - t0) / 2 - t1
  synced = true
  lastSyncAt = t1
}

/**
 * サーバー時刻に合わせる。対戦に入る前に一度呼ぶ。
 * 失敗しても例外は投げない（オフセット0＝端末時計のまま動く）。
 */
export function syncServerTime(force = false): Promise<void> {
  if (!force && synced && Date.now() - lastSyncAt < RESYNC_INTERVAL) return Promise.resolve()
  if (!syncing) {
    syncing = measure().catch(e => { console.warn('[serverTime] sync failed', e) })
      .then(() => { syncing = null })
  }
  return syncing
}

/** サーバー基準の現在時刻（ミリ秒）。同期前でも端末時計を返すので必ず値は返る。 */
export function serverNow(): number {
  return Date.now() + offsetMs
}

/** 同期済みかどうか（未同期なら締め切り表示に注意書きを出す等に使う） */
export function isServerTimeSynced(): boolean {
  return synced
}

/** 端末時計とサーバーのズレ（ミリ秒）。デバッグ表示用。 */
export function serverTimeOffset(): number {
  return offsetMs
}

/** 締め切りまでの残り秒（0未満にはならない） */
export function secondsLeft(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - serverNow()) / 1000))
}

/** 「今から◯秒後」の締め切り時刻を作る */
export function deadlineIn(seconds: number): number {
  return serverNow() + seconds * 1000
}
