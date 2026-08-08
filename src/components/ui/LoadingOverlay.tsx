import { useEffect, useRef, useState } from 'react'
import { useLoadingStore } from '../../store/loadingStore'
import { useAdHeight } from '../layout/Layout'
import { C, alpha, SAIRA, FONT, bottomStack } from '../../styles/tokens'
import { LOADING_TIPS } from '../../data/tips'
import TipText from './TipText'


// 全画面ローディング。真っ暗＋中央TIPS＋右下ローディングバー（スピナー廃止）。App直下に常駐。
export default function LoadingOverlay() {
  const active = useLoadingStore(s => s.active)
  const label = useLoadingStore(s => s.label)
  const adH = useAdHeight()   // 広告バナー分。広告なし(買い切り)なら0
  const [tip, setTip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)])
  const wasActive = useRef(false)

  useEffect(() => {
    // 表示され始めたタイミングでヒントをランダムに選び直す
    if (active && !wasActive.current) {
      setTip(LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)])
    }
    wasActive.current = active
  }, [active])

  if (!active) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, overflow: 'hidden',
      background: 'radial-gradient(120% 80% at 50% 32%, #12101c 0%, #09070f 46%, #050409 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT,
    }}>
      <style>{`
        @keyframes jpel-lo-breathe {0%,100%{transform:translateY(6%) scale(1);opacity:.7}50%{transform:translateY(-4%) scale(1.15);opacity:1}}
        @keyframes jpel-lo-sweep {0%{transform:translateX(-110%)}100%{transform:translateX(380%)}}
        .jpel-lo-sheen{position:absolute;inset:-40%;pointer-events:none;
          background:radial-gradient(closest-side, ${alpha(C.gold, 0.06)}, transparent 70%);
          animation:jpel-lo-breathe 6s ease-in-out infinite}
        .jpel-lo-bar{width:132px;height:2px;border-radius:2px;position:relative;overflow:hidden;
          background:rgba(255,255,255,0.07)}
        .jpel-lo-bar::before{content:"";position:absolute;top:0;left:0;height:100%;width:38%;border-radius:2px;
          background:linear-gradient(90deg,transparent,${C.gold} 60%,transparent);
          box-shadow:0 0 10px ${alpha(C.gold, 0.7)};
          animation:jpel-lo-sweep 1.25s cubic-bezier(.6,.05,.3,.95) infinite}
        @media (prefers-reduced-motion:reduce){
          .jpel-lo-bar::before{animation:none;width:64%}
          .jpel-lo-sheen{animation:none}
        }
      `}</style>

      {/* 環境光 */}
      <div className="jpel-lo-sheen" />
      {/* ビネット */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 140px 40px rgba(0,0,0,0.75)' }} />

      {/* ワードマーク（上部） */}
      <div style={{ position: 'absolute', top: 'calc(64px + env(safe-area-inset-top))', left: 0, right: 0, textAlign: 'center', zIndex: 2 }}>
        <div style={{ fontFamily: SAIRA, fontWeight: 900, fontSize: 13, letterSpacing: 9, color: C.gold, textShadow: `0 0 18px ${alpha(C.gold, 0.35)}` }}>JPEL MANAGER</div>
        <div style={{ fontFamily: SAIRA, fontSize: 8, letterSpacing: 5, color: C.textDim, marginTop: 5 }}>EKIDEN GM SIMULATION</div>
      </div>

      {/* 中央TIPS */}
      <div style={{ position: 'relative', zIndex: 3, maxWidth: 260, textAlign: 'center', padding: '0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ height: 1, width: 44, background: `linear-gradient(90deg, transparent, ${alpha(C.gold, 0.5)})` }} />
          <span style={{ width: 5, height: 5, background: C.gold, transform: 'rotate(45deg)', boxShadow: `0 0 8px ${alpha(C.gold, 0.7)}` }} />
          <span style={{ fontFamily: SAIRA, fontSize: 10, letterSpacing: 6, fontWeight: 900, color: C.gold }}>TIPS</span>
          <span style={{ width: 5, height: 5, background: C.gold, transform: 'rotate(45deg)', boxShadow: `0 0 8px ${alpha(C.gold, 0.7)}` }} />
          <span style={{ height: 1, width: 44, background: `linear-gradient(90deg, ${alpha(C.gold, 0.5)}, transparent)` }} />
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.85, color: C.text, fontWeight: 500, textWrap: 'balance' as const }}>
          <TipText text={tip} />
        </div>
      </div>

      {/* 右下ローディングバー（広告バナーに隠れないよう広告分だけ上げる。広告なしなら従来位置） */}
      <div style={{ position: 'absolute', right: 16, bottom: bottomStack(adH, { extra: 20 }), zIndex: 4, textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: SAIRA, fontWeight: 900, fontSize: 11, letterSpacing: 4, color: C.textSub }}>
            <span style={{ color: C.gold }}>◆</span> {label || 'NOW LOADING'}
          </span>
        </div>
        <div className="jpel-lo-bar" style={{ marginLeft: 'auto' }} />
      </div>
    </div>
  )
}
