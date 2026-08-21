import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import IntroModal from './IntroModal'
import { C, SAIRA, F, alpha } from '../../styles/tokens'
import { RANK_ART } from '../rated/rankArt'
import logo from '../../assets/logo.png'
import { TrophyIcon, RunnerIcon } from '../icons/StatIcons'
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
 * **月桂冠のロゴ。** 中の数字は呼ぶ側から。葉は円弧に沿って並べる。
 * ★色は3つだけ（金・紺・白）。ここに新しい色を足さないこと。
 */
/**
 * アップデートのお知らせポップ。**枠は `IntroModal` 1本**（公式Xの案内と同じ形）。
 * 中身は `data/newsPopups` の配列から来る——ここに文面を書かないこと。
 */
export default function NewsModal(
  { news, onClose }: { news: NewsPopup; onClose: (stopShowing: boolean) => void },
) {
  // ★このモーダルは `<BrowserRouter>` の中に出しているので、行き先へは
  //   ここから飛べる（App.tsx はルータの外なので navigate を持てない）
  const navigate = useNavigate()
  // ★`repeat` のお知らせは、チェックを入れたときだけ二度と出ない
  //   （期間が短いものを毎回見せるため。既定は今までどおり閉じたら終わり）
  const [stop, setStop] = useState(false)
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
      hero={news.hero ? (
        <div>
          {/* ★絵は無加工でそのまま見せる。ロゴと見出しは**絵の下**
              （オーナー・2026-08-21「せっかくの絵が隠れちゃうね」） */}
          <div style={{ position: 'relative' }}>
            <img src={news.hero} alt="" style={{ display: 'block', width: '100%', height: 'auto' }} />
            {/* ★タイトルロゴは**走者に被らない右上**へ（オーナー・2026-08-21）。
                絵は暗く落とさない */}
            {news.logo === 'title' && (
              <img src={logo} alt="" style={{
                position: 'absolute', right: '3%', top: '8%', width: '33%',
                filter: `drop-shadow(0 3px 10px ${alpha(C.bg, 0.75)})`,
              }} />
            )}
          </div>
          <div style={{ padding: '12px 20px 0' }}>
            {news.lead && (
              <div style={{
                fontFamily: "'Anton', sans-serif", fontSize: 62, lineHeight: 0.92,
                letterSpacing: '0.02em',
                backgroundImage: `linear-gradient(180deg, #fff6d0 6%, ${C.gold} 48%, #a9761a 100%)`,
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent', color: C.gold,
                filter: `drop-shadow(0 2px 0 ${C.bg})`,
              }}>{news.lead}</div>
            )}
            <div style={{
              fontSize: F.subLg, fontWeight: 900, color: C.text,
              letterSpacing: '0.3em', textIndent: '0.3em', marginTop: 2,
            }}>{news.title}</div>
          </div>
        </div>
      ) : undefined}
      lead={news.lead && !news.hero ? (
        <div style={{
          fontFamily: SAIRA, fontSize: 64, fontWeight: 900, color: C.cyan,
          lineHeight: 0.95, letterSpacing: '-2px', marginBottom: 2,
        }}>{news.lead}</div>
      ) : undefined}
      title={news.hero ? '' : news.title}
      body={news.hero ? undefined : news.body}
      extraTop={news.hero ? (
        <>
          {news.rewards && (
            <div style={{ display: 'flex', gap: 8, marginBottom: news.event ? 10 : 18 }}>
              {news.rewards.map(r => (
                <div key={r.label} style={{
                  flex: 1, padding: '12px 6px', background: alpha(C.gold, 0.08),
                  border: `1px solid ${alpha(C.gold, 0.35)}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}>
                  {r.icon === 'trophy' ? <TrophyIcon size={22} /> : <RunnerIcon size={22} />}
                  <div style={{ fontSize: F.label, fontWeight: 800, color: C.gold }}>{r.label}</div>
                </div>
              ))}
            </div>
          )}
          {news.event && (
            <div style={{
              padding: '10px 12px', marginBottom: 10,
              background: alpha(C.cyan, 0.1), border: `1px solid ${alpha(C.cyan, 0.4)}`,
            }}>
              <div style={{ fontSize: F.bodyLg, fontWeight: 900, color: C.cyan }}>{news.event.label}</div>
              <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginTop: 2 }}>{news.event.period}</div>
            </div>
          )}
          {news.body && (
            <div style={{ fontSize: F.label, color: C.textDim, marginBottom: 18 }}>{news.body}</div>
          )}
        </>
      ) : undefined}
      actionLabel={news.actionLabel}
      onAction={() => { onClose(stop); navigate(news.to) }}
      onClose={() => onClose(stop)}
      extra={news.repeat ? (
        <button
          onClick={() => setStop(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', background: 'transparent', border: 'none', padding: '4px 0',
            color: C.textDim, fontSize: F.body, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{
            width: 16, height: 16, flexShrink: 0,
            border: `1px solid ${stop ? C.cyan : alpha(C.textDim, 0.6)}`,
            background: stop ? C.cyan : 'transparent',
            color: C.bg, fontSize: F.micro, lineHeight: '15px', textAlign: 'center', fontWeight: 900,
          }}>{stop ? '✓' : ''}</span>
          もう表示しない
        </button>
      ) : undefined}
    />
  )
}
