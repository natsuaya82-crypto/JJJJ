// AdMob 広告の初期化・追跡許可(ATT)・バナー表示。
// iOS（Capacitorネイティブ）でのみ動作。Web/ブラウザでは何もしない。

import { Capacitor } from '@capacitor/core'

const BANNER_AD_ID = 'ca-app-pub-7463045893100088/8946193510'

let started = false

export async function initAds(): Promise<void> {
  if (started) return
  if (Capacitor.getPlatform() !== 'ios') return
  started = true

  try {
    const { AdMob, BannerAdSize, BannerAdPosition } = await import('@capacitor-community/admob')

    await AdMob.initialize()

    // ATT（App Tracking Transparency）：トラッキングに使うデータを集める前に許可を求める。
    // 未決定のときだけダイアログを出す。拒否されても広告は出る（非パーソナライズ化されるだけ）。
    try {
      const tracking = await AdMob.trackingAuthorizationStatus()
      if (tracking.status === 'notDetermined') {
        await AdMob.requestTrackingAuthorization()
      }
    } catch {
      // ATT非対応端末などは無視
    }

    await AdMob.showBanner({
      adId: BANNER_AD_ID,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
    })
  } catch (e) {
    console.warn('[ads] init failed', e)
  }
}
