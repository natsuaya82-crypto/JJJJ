// AdMob 広告の初期化・追跡許可(ATT)・バナー表示。
// iOS（Capacitorネイティブ）でのみ動作。Web/ブラウザでは何もしない。

import { Capacitor } from '@capacitor/core'
import { useLoadingStore } from '../store/loadingStore'
import { loginTodayKey } from './loginDate'

const BANNER_AD_ID = 'ca-app-pub-7463045893100088/8946193510'
const REWARD_AD_ID = 'ca-app-pub-7463045893100088/5817804007'
const INTERSTITIAL_AD_ID = 'ca-app-pub-7463045893100088/6600640316'

// 広告の「1日」の区切り（朝10時締め）。store と画面表示で同じ日付を使うために共通化する。
// 以前はローカル時刻で前日補正したあと toISOString()（UTC）で文字列化していたため、
// 日本時間だと 00:00 / 09:00 / 10:00 の3回キーが変わり、1日3回のはずの回数制限が
// 実質9回になっていた。ログインボーナスと同じローカル日付キーに統一する。
export function getAdDay(): string {
  return loginTodayKey()
}

export const ADS_PER_DAY = 3

let started = false
let bannerShown = false

// GMパス購入者に広告を絶対に出さないための最終防衛線。
// 呼び出し側の分岐だけに任せると、セーブ読み込み(非同期)が終わる前に広告初期化が走った場合に
// 「購入済みなのにバナーが出る」事故が起きる。表示の直前でかならずここを見る。
let adsDisabled = false
export function setAdsDisabled(v: boolean): void {
  adsDisabled = v
  // 初期化の途中で購入済みと判明した場合に備え、すでに出ていれば即座に消す。
  if (v) void removeBanner()
}

// バナーを表示する（買い切り版では呼ばない）。
export async function showBanner(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  if (adsDisabled) return
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
  if (adsRemoved) adsDisabled = true
  if (started) return
  if (Capacitor.getPlatform() !== 'ios') return
  started = true

  try {
    const { AdMob, MaxAdContentRating } = await import('@capacitor-community/admob')

    // 出せる広告を「T（ティーン向け）」までに制限する。
    // ここを指定しないとMA（成人向け）の広告まで流れてしまい、審査で弾かれる
    // （App Store ガイドライン 2.5.18 / build 78 のリジェクト理由）。
    // App Store Connect の年齢レーティングは 13+ にしてある。Tを超える広告を出すと不整合になるので、
    // レーティングを下げるときはここも必ず合わせること。
    // バナー・全画面・リワードはこの設定を共通で見るので、指定はここ1か所でよい。
    // AdMob管理画面側の「広告レーティングを管理」もTにしておくこと（厳しい方が採用される）。
    await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.Teen })

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

// インタースティシャル（全画面）広告を表示する。シーズン終了などの画面転換で使う。
// ロード中はローディングを出し、広告が閉じる（または失敗）まで待ってから解決する。
// iOS以外（ブラウザ開発時）や失敗時は即解決して進行を止めない。
export async function showInterstitialAd(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  if (adsDisabled) return
  // オフラインなら読み込みを試さず即スキップ（12秒待たせない）
  if (!navigator.onLine) return

  useLoadingStore.getState().show('広告を読み込み中…')
  try {
    const { AdMob, InterstitialAdPluginEvents } = await import('@capacitor-community/admob')
    // prepare が settle しない端末・回線でも進行が止まらないよう、12秒で諦めて先へ進む
    await Promise.race([
      AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_ID }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ad prepare timeout')), 12000)),
    ])
    useLoadingStore.getState().hide()  // 準備完了→広告表示へ

    await new Promise<void>((resolve) => {
      // SDKがDismissed/FailedToShowイベントを取りこぼすと永久に待って進行が止まるため、
      // 一定時間でかならず解決する安全弁を入れる（二重解決は done で防ぐ）
      let done = false
      const handles: Array<Promise<{ remove: () => void }>> = []
      const cleanup = () => handles.forEach(h => h.then(l => l.remove()))
      const finish = () => { if (done) return; done = true; clearTimeout(guard); cleanup(); resolve() }
      const guard = setTimeout(finish, 90000)
      handles.push(AdMob.addListener(InterstitialAdPluginEvents.Dismissed, finish))
      handles.push(AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, finish))
      AdMob.showInterstitial().catch(finish)
    })
  } catch (e) {
    useLoadingStore.getState().hide()
    console.warn('[ads] interstitial failed', e)
  }
}

// リワード動画を表示する。
// 最後まで見て報酬を得たら true、途中で閉じた/失敗したら false を返す。
// iOS以外（ブラウザ開発時）は実広告が無いので true を返す（従来のモック挙動を維持）。
export async function showRewardAd(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'ios') return true
  // オフラインなら12秒待たせず、理由を見せてすぐ返す（報酬なし）
  if (!navigator.onLine) {
    const { show, hide } = useLoadingStore.getState()
    show('オフラインのため広告を再生できません')
    setTimeout(hide, 1800)
    return false
  }

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
      // SDKがDismissed/FailedToShowイベントを取りこぼすと永久に待って進行が止まるため、
      // 一定時間でかならず解決する安全弁を入れる（報酬済みなら true のまま返す）
      let rewarded = false
      let done = false
      const handles: Array<Promise<{ remove: () => void }>> = []
      const cleanup = () => handles.forEach(h => h.then(l => l.remove()))
      const finish = (v: boolean) => { if (done) return; done = true; clearTimeout(guard); cleanup(); resolve(v) }
      const guard = setTimeout(() => finish(rewarded), 120000)

      handles.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { rewarded = true }))
      handles.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish(rewarded)))
      handles.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish(false)))

      AdMob.showRewardVideoAd().catch(() => finish(false))
    })
  } catch (e) {
    useLoadingStore.getState().hide()
    console.warn('[ads] reward failed', e)
    return false
  }
}
