import { Capacitor, registerPlugin } from '@capacitor/core'

interface IAPPlugin {
  purchase(): Promise<{ result: 'purchased' | 'cancelled' | 'pending' }>
  restore(): Promise<{ restored: boolean }>
  available(): Promise<{ available: boolean }>
}

const IAP = registerPlugin<IAPPlugin>('IAP')

export type PurchaseResult = 'purchased' | 'cancelled' | 'pending' | 'error' | 'unavailable' | 'timeout'
// 復元の結果。「持っていない」と「通信できなかった」を必ず区別する。
// 一緒くたにすると、購入済みの人に「購入が見つかりません」と嘘の案内を出してしまう。
export type RestoreResult = 'restored' | 'none' | 'timeout' | 'error'

const isIOS = () => Capacitor.getPlatform() === 'ios'

// ネイティブ側が何も返してこないと「処理中…」のまま固まってしまう。
// 一定時間で必ず打ち切って、理由を画面に出せるようにする。
class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError('timeout')), ms)
    p.then(
      v => { clearTimeout(t); resolve(v) },
      e => { clearTimeout(t); reject(e) },
    )
  })
}

// 購入シートを閉じずに放置される場合もあるので長めに取る
const PURCHASE_TIMEOUT_MS = 90_000
const RESTORE_TIMEOUT_MS = 30_000
// 商品が取れるかの下見。画面を開いたときに待たせたくないので短め。
const AVAILABLE_TIMEOUT_MS = 10_000

// App Store（StoreKit）から返ってきた元のメッセージ。ほぼ英語。
// 失敗したときに画面へそのまま出す。日本語に言い換えると原因が分からなくなるので加工しない。
let lastError = ''

/** 直前の購入・復元でApp Storeが返した原文。無ければ空文字。 */
export function lastIapError(): string {
  return lastError
}

function remember(e: unknown): void {
  const m = e instanceof Error ? e.message : String(e)
  lastError = m.slice(0, 300)
}

export async function purchaseAdFree(): Promise<PurchaseResult> {
  if (!isIOS()) return 'purchased'
  lastError = ''
  try {
    const { result } = await withTimeout(IAP.purchase(), PURCHASE_TIMEOUT_MS)
    if (result === 'purchased') return 'purchased'
    if (result === 'pending') return 'pending'  // ペアレンタルコントロール等の承認待ち
    return 'cancelled'
  } catch (e) {
    console.warn('[iap] purchase failed', e)
    remember(e)
    if (e instanceof TimeoutError) {
      // 90秒を過ぎても購入シートは開いたままなので、そのあと購入が成立していることがある。
      // 権利を黙って確認し、買えていればそのまま有効にする（課金だけ取られる事故を防ぐ）。
      if (await hasAdFree()) return 'purchased'
      return 'timeout'
    }
    // 「Product not found」＝App Store Connect側で商品が取得できない（商品未設定・契約未署名など）
    const m = e instanceof Error ? e.message : String(e)
    if (m.includes('Product not found')) return 'unavailable'
    return 'error'
  }
}

export async function restoreAdFree(): Promise<RestoreResult> {
  if (!isIOS()) return 'none'
  lastError = ''
  try {
    const { restored } = await withTimeout(IAP.restore(), RESTORE_TIMEOUT_MS)
    return restored ? 'restored' : 'none'
  } catch (e) {
    console.warn('[iap] restore failed', e)
    remember(e)
    if (e instanceof TimeoutError) return 'timeout'
    return 'error'
  }
}

/**
 * 購入済みかどうかを黙って確認する（購入シートもパスワード入力も出ない）。
 * 端末に残っている権利を読むだけなので、起動時に呼んでも邪魔にならない。
 * 家族の承認が下りた場合や、購入が途中で切れてしまった場合を自動で拾うために使う。
 */
/**
 * GMパスの商品情報がApp Storeから取れるかを、購入シートを出さずに先に確かめる。
 *
 * 取れないまま購入ボタンを押させると「商品情報を取得できませんでした」が出るだけで、
 * ユーザーには何もできない。だからボタンを押させないために事前に見ておく。
 * 判断がつかないとき（通信中・iOS以外）は true を返す。
 * ここで false を返して押せなくするのは「確かに取れなかった」ときだけにする。
 */
export async function isAdFreePurchasable(): Promise<boolean> {
  if (!isIOS()) return true
  try {
    const { available } = await withTimeout(IAP.available(), AVAILABLE_TIMEOUT_MS)
    return available
  } catch (e) {
    console.warn('[iap] available check failed', e)
    return true   // 調べられなかっただけ。ボタンは押せるままにする
  }
}

export async function hasAdFree(): Promise<boolean> {
  if (!isIOS()) return false
  try {
    const { restored } = await withTimeout(IAP.restore(), RESTORE_TIMEOUT_MS)
    return restored
  } catch {
    return false
  }
}
