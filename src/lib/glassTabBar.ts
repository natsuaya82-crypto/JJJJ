// **ネイティブの下タブ（iOS 26 のリキッドグラス）への口。**
//
// ■なぜネイティブなのか（オーナー・2026-08-20）
//   「リキッドグラスまがいだよね？本物にしてほしいな」「下タブだけでいいよ」
//
//   本物のガラス（`UIGlassEffect`）は iOS 26 のネイティブAPIで、WebView の CSS では
//   ぼかしと彩度しか掛けられない（縁の屈折も厚みも出ない）。ガラスは「下にある物」を
//   曲げて写すので **WebView より前**に置く必要があり、そうすると Web のアイコンが
//   隠れる。だからタブまるごとネイティブで描く。
//
// ■ここが持つもの
//   **何も持ちません。** どのタブか・どこにいるか・数字がいくつか・レース中か、は
//   全部これまでどおり `Layout` が決めます。ここはそれをネイティブへ渡すだけの管。
//   ★**判断をこちら側に書かないこと。** 書くと「Webの下タブ」と「ネイティブの下タブ」で
//     答えが違う、という一番たちの悪い形になります（走友会の人数の線と同じ）。
//
// ■iOS 以外・iOS 26 未満
//   `available()` が false のときは Web の下タブがそのまま出ます。26未満の実機では
//   プラグインは動きますが、中でガラスがぼかしに落ちます（見た目はいまと同じ）。
import { Capacitor, registerPlugin } from '@capacitor/core'

export type GlassTabItem = { key: string; label: string; icon: string }

type GlassTabBarPlugin = {
  /**
   * 渡したものだけを反映する（省いたものは触らない）。
   * ★`apply({ visible: false })` で隠すのが**唯一の消し方**。ネイティブの下タブは
   *   WebView の外に居るので、React 側が消えても**勝手には消えません**
   */
  apply(o: {
    items?: GlassTabItem[]
    active?: string
    badges?: Record<string, number>
    visible?: boolean
    /** 広告バナーのぶん。下タブはこのぶん上に浮く（`bottomStack` と同じ考え方） */
    bottomInset?: number
  }): Promise<void>
  addListener(e: 'tabTap', cb: (d: { key: string }) => void): Promise<{ remove: () => void }>
}

const plugin = registerPlugin<GlassTabBarPlugin>('GlassTabBar')

/** ネイティブの下タブを使えるか。使えないときは Web の下タブを出す */
export function nativeTabBarAvailable(): boolean {
  return Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('GlassTabBar')
}

export const glassTabBar = plugin
