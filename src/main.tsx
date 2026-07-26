import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ui/ErrorBoundary.tsx'

// ピンチズーム無効化（iOSは viewport の user-scalable=no を無視するため、gestureイベントを塞ぐ）。
// ダブルタップズームは index.css の touch-action: manipulation で無効化済み。
document.addEventListener('gesturestart', e => e.preventDefault())
document.addEventListener('gesturechange', e => e.preventDefault())
document.addEventListener('gestureend', e => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 描画中の例外でルートごと消えて真っ白になるのを防ぐ（落ちてもセーブを守って復帰できる） */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
