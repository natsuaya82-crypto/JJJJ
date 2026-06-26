import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tsuba.jpelmanager',
  appName: 'JPEL Manager',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
}

export default config
