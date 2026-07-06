import { Capacitor, registerPlugin } from '@capacitor/core'

interface IAPPlugin {
  purchase(): Promise<{ result: 'purchased' | 'cancelled' | 'pending' }>
  restore(): Promise<{ restored: boolean }>
}

const IAP = registerPlugin<IAPPlugin>('IAP')

export type PurchaseResult = 'purchased' | 'cancelled' | 'error' | 'unavailable'

const isIOS = () => Capacitor.getPlatform() === 'ios'

export async function purchaseAdFree(): Promise<PurchaseResult> {
  if (!isIOS()) return 'purchased'
  // iOSでもネイティブのIAPプラグインが未登録なら購入不可（準備中）
  if (!Capacitor.isPluginAvailable('IAP')) return 'unavailable'
  try {
    const { result } = await IAP.purchase()
    return result === 'purchased' ? 'purchased' : 'cancelled'
  } catch (e) {
    console.warn('[iap] purchase failed', e)
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
