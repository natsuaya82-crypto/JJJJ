import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// OTA（Capgo）: 新しいバンドルが正常に起動したことを通知。
// これを呼ばないと次回起動で前バージョンへ自動ロールバックされる。Web環境では no-op。
CapacitorUpdater.notifyAppReady().catch(() => { /* web/未対応環境では無視 */ })
