import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tokinets.jpelmanager',
  appName: 'JPEL Manager',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    // WKWebView自体のスクロール/バウンドを無効化。ヘッダー・下タブが動く「スライド」を防ぎ、
    // スクロールは中身エリア(<main>のoverflow:auto)だけに限定する。
    scrollEnabled: false,
  },
  plugins: {
    // OTA（Capgo）: 起動/復帰時に新バンドルを自動チェックして適用する
    CapacitorUpdater: {
      autoUpdate: true,
    },
  },
}

export default config
