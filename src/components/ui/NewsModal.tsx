import { useNavigate } from 'react-router-dom'
import IntroModal from './IntroModal'
import { C } from '../../styles/tokens'
import type { NewsPopup } from '../../data/newsPopups'

/**
 * アップデートのお知らせポップ。**枠は `IntroModal` 1本**（公式Xの案内と同じ形）。
 * 中身は `data/newsPopups` の配列から来る——ここに文面を書かないこと。
 */
export default function NewsModal({ news, onClose }: { news: NewsPopup; onClose: () => void }) {
  // ★このモーダルは `<BrowserRouter>` の中に出しているので、行き先へは
  //   ここから飛べる（App.tsx はルータの外なので navigate を持てない）
  const navigate = useNavigate()
  return (
    <IntroModal
      accent={C.cyan}
      icon={
        <div style={{ width: 56, height: 56, background: C.cyan, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 3l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 8.5l5.2-.8L12 3z"
              stroke={C.bg} strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        </div>
      }
      title={news.title}
      body={news.body}
      actionLabel={news.actionLabel}
      onAction={() => { onClose(); navigate(news.to) }}
      onClose={onClose}
    />
  )
}
