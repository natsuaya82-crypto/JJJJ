import { useNavigate } from 'react-router-dom'
import IntroModal from './IntroModal'
import { C, SAIRA } from '../../styles/tokens'
import { RANK_ART } from '../rated/rankArt'
import type { NewsPopup } from '../../data/newsPopups'

/** 段位の紋章を横に並べる。**絵は `rated/rankArt` の7枚1組**（別に持たないこと） */
function RankRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
      {Object.values(RANK_ART).map((a, i) => (
        <img
          key={i}
          src={a.img}
          alt=""
          width={i === 3 ? 56 : 40}
          height={i === 3 ? 56 : 40}
          style={{ display: 'block', opacity: i === 3 ? 1 : 0.85 }}
        />
      ))}
    </div>
  )
}

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
      icon={news.art === 'ranks' ? <RankRow /> : (
        <div style={{ width: 56, height: 56, background: C.cyan, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 3l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 8.5l5.2-.8L12 3z"
              stroke={C.bg} strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      lead={news.lead ? (
        <div style={{
          fontFamily: SAIRA, fontSize: 64, fontWeight: 900, color: C.cyan,
          lineHeight: 0.95, letterSpacing: '-2px', marginBottom: 2,
        }}>{news.lead}</div>
      ) : undefined}
      title={news.title}
      body={news.body}
      actionLabel={news.actionLabel}
      onAction={() => { onClose(); navigate(news.to) }}
      onClose={onClose}
    />
  )
}
