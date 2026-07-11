import { Capacitor, registerPlugin } from '@capacitor/core'

interface IAPPlugin {
  purchase(): Promise<{ result: 'purchased' | 'cancelled' | 'pending' }>
  restore(): Promise<{ restored: boolean }>
}

const IAP = registerPlugin<IAPPlugin>('IAP')

export type PurchaseResult = 'purchased' | 'cancelled' | 'pending' | 'error' | 'unavailable'

const isIOS = () => Capacitor.getPlatform() === 'ios'

export async function purchaseAdFree(): Promise<PurchaseResult> {
  if (!isIOS()) return 'purchased'
  try {
    const { result } = await IAP.purchase()
    if (result === 'purchased') return 'purchased'
    if (result === 'pending') return 'pending'  // ペアレンタルコントロール等の承認待ち
    return 'cancelled'
  } catch (e) {
    console.warn('[iap] purchase failed', e)
    // 「Product not found」＝App Store Connect側で商品が取得できない（商品未設定・契約未署名など）
    const m = e instanceof Error ? e.message : String(e)
    if (m.includes('Product not found')) return 'unavailable'
    return 'error'
  }
}

export async function restoreAdFree(): Promise<boolean> {
  if (!isIOS()) return false
  try {
    const { restored } = await IAP.restore()
    return restored
  } catch (e) {
    console.warn('[iap] restore failed', e)
    return false
  }
}
