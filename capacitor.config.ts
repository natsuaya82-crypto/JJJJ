import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tokinets.jpelmanager',
  appName: 'JPEL Manager',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
  plugins: {
    // OTA（Capgo）: 起動/復帰時に新バンドルを自動チェックして適用する
    CapacitorUpdater: {
      autoUpdate: true,
    },
  },
}

export default config
