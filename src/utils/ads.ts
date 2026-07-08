// AdMob 広告の初期化・追跡許可(ATT)・バナー表示。
// iOS（Capacitorネイティブ）でのみ動作。Web/ブラウザでは何もしない。

import { Capacitor } from '@capacitor/core'
import { useLoadingStore } from '../store/loadingStore'

const BANNER_AD_ID = 'ca-app-pub-7463045893100088/8946193510'
const REWARD_AD_ID = 'ca-app-pub-7463045893100088/5817804007'

// 広告の「1日」の区切り（朝10時締め）。store と画面表示で同じ日付を使うために共通化する。
export function getAdDay(): string {
  const now = new Date()
  const base = new Date(now)
  if (base.getHours() < 10) base.setDate(base.getDate() - 1)
  return base.toISOString().slice(0, 10)
}

export const ADS_PER_DAY = 3

let started = false
let bannerShown = false

// バナーを表示する（買い切り版では呼ばない）。
export async function showBanner(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  if (bannerShown) return
  try {
    const { AdMob, BannerAdSize, BannerAdPosition } = await import('@capacitor-community/admob')
    await AdMob.showBanner({
      adId: BANNER_AD_ID,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
    })
    bannerShown = true
  } catch (e) {
    console.warn('[ads] showBanner failed', e)
  }
}

// バナーを消す（買い切り購入時）。
export async function removeBanner(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  try {
    const { AdMob } = await import('@capacitor-community/admob')
    await AdMob.removeBanner()
    bannerShown = false
  } catch (e) {
    console.warn('[ads] removeBanner failed', e)
  }
}

// adsRemoved=true（買い切り版）のときはバナーを出さない。
export async function initAds(adsRemoved: boolean): Promise<void> {
  if (started) return
  if (Capacitor.getPlatform() !== 'ios') return
  started = true

  try {
    const { AdMob } = await import('@capacitor-community/admob')

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

    if (!adsRemoved) await showBanner()
  } catch (e) {
    console.warn('[ads] init failed', e)
  }
}

// リワード動画を表示する。
// 最後まで見て報酬を得たら true、途中で閉じた/失敗したら false を返す。
// iOS以外（ブラウザ開発時）は実広告が無いので true を返す（従来のモック挙動を維持）。
export async function showRewardAd(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'ios') return true

  useLoadingStore.getState().show('広告を読み込み中…')
  try {
    const { AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob')
    // prepare が settle しない端末・回線でも進行が止まらないよう、12秒で諦めて先へ進む
    await Promise.race([
      AdMob.prepareRewardVideoAd({ adId: REWARD_AD_ID }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ad prepare timeout')), 12000)),
    ])
    useLoadingStore.getState().hide()  // 準備完了→動画表示へ

    return await new Promise<boolean>((resolve) => {
      let rewarded = false
      const handles: Array<Promise<{ remove: () => void }>> = []
      const cleanup = () => handles.forEach(h => h.then(l => l.remove()))

      handles.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { rewarded = true }))
      handles.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, () => { cleanup(); resolve(rewarded) }))
      handles.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => { cleanup(); resolve(false) }))

      AdMob.showRewardVideoAd().catch(() => { cleanup(); resolve(false) })
    })
  } catch (e) {
    useLoadingStore.getState().hide()
    console.warn('[ads] reward failed', e)
    return false
  }
}
