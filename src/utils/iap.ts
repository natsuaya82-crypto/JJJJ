// 買い切り版（広告なし）のアプリ内課金(IAP)ラッパー。
//
// アプリ側の挙動（広告除去・ログインボーナス2倍）は store の adsRemoved フラグで完結している。
// ここは「実際に課金する」部分だけを担当する。
//
// ネイティブのIAPプラグイン（例: RevenueCat / community IAP）は未導入のため、
// 現状 iOS 実機では 'unavailable'（準備中）を返す。プラグイン導入後にこのファイルだけ差し替えれば有効化できる。
// ブラウザ/開発中はモック購入（即成功）でアプリ側の挙動を確認できる。

import { Capacitor } from '@capacitor/core'

// App Store Connect で作成する非消費型プロダクトID（要・ストア側設定）
export const AD_FREE_PRODUCT_ID = 'jpel_adfree'

export type PurchaseResult = 'purchased' | 'cancelled' | 'unavailable' | 'error'

const isIOS = () => Capacitor.getPlatform() === 'ios'

// 広告なし版を購入する。
export async function purchaseAdFree(): Promise<PurchaseResult> {
  if (!isIOS()) {
    // ブラウザ/開発：モック購入（アプリ側挙動の確認用）
    return 'purchased'
  }
  // TODO: ネイティブIAPプラグイン導入後にここで購入フローを呼ぶ。
  //   例) const { Purchases } = await import('@revenuecat/purchases-capacitor')
  //       ... 購入 → 成功で 'purchased' を返す
  // 未導入のうちは購入不可（準備中）。
  return 'unavailable'
}

// 過去の購入を復元する。所有していれば true。
export async function restoreAdFree(): Promise<boolean> {
  if (!isIOS()) return false
  // TODO: プラグイン導入後、復元APIを呼んで所有状態を返す。
  return false
}
