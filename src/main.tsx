import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ピンチズーム無効化（iOSは viewport の user-scalable=no を無視するため、gestureイベントを塞ぐ）。
// ダブルタップズームは index.css の touch-action: manipulation で無効化済み。
document.addEventListener('gesturestart', e => e.preventDefault())
document.addEventListener('gesturechange', e => e.preventDefault())
document.addEventListener('gestureend', e => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
