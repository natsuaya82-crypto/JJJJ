import { useEffect } from 'react'
import { C, alpha } from '../../styles/tokens'
import { audio } from '../../utils/audio'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function TitleScreen({ onStart }: { onStart: () => void }) {
  // unlock済み（ゲームから戻った場合）なら開いた瞬間にBGMを再開
  useEffect(() => {
    audio.playBgm('home')
  }, [])

  const start = () => { audio.unlock(); audio.playBgm('home'); audio.playSe('title'); onStart() }

  return (
    <div
      onClick={start}
      style={{
        height: '100svh', maxWidth: '480px', margin: '0 auto',
        background: `radial-gradient(ellipse at 30% 35%, #0b2550 0%, #040c1a 70%)`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', cursor: 'pointer',
        fontFamily: "'Noto Sans JP', system-ui, sans-serif",
        userSelect: 'none',
      }}>
      <style>{`
        @keyframes em-glow   { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes em-fadeup { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes em-shimmer {
          0%   { background-position: -200% center }
          100% { background-position: 200%  center }
        }
        @keyframes em-roadpulse { 0%,100%{opacity:.06} 50%{opacity:.12} }
      `}</style>

      {/* Mountain silhouette */}
      <svg style={{ position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', opacity: 0.12 }}
        viewBox="0 0 480 220" preserveAspectRatio="xMidYMax meet">
        <defs>
          <linearGradient id="mtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.text} stopOpacity="0.9"/>
            <stop offset="100%" stopColor={C.text} stopOpacity="0.2"/>
          </linearGradient>
        </defs>
        <path d="M0,220 L60,140 L110,165 L170,80 L220,120 L280,30 L330,85 L390,55 L440,100 L480,70 L480,220 Z"
          fill="url(#mtGrad)"/>
        <path d="M0,220 L40,175 L90,195 L150,155 L200,170 L260,130 L310,150 L370,115 L420,140 L480,120 L480,220 Z"
          fill={alpha(C.text, 0.18)} />
      </svg>

      {/* Road perspective lines */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', animation: 'em-roadpulse 4s ease infinite' }}
        viewBox="0 0 480 900" preserveAspectRatio="xMidYMid slice">
        {[0, 60, 120, 200, 300].map((spread, i) => (
          <line key={i}
            x1={240 - spread} y1={900}
            x2={240 - spread * 0.25} y2={300}
            stroke="white" strokeWidth="0.6" opacity={0.5 - i * 0.08}/>
        ))}
        {[60, 120, 200, 300].map((spread, i) => (
          <line key={`r${i}`}
            x1={240 + spread} y1={900}
            x2={240 + spread * 0.25} y2={300}
            stroke="white" strokeWidth="0.6" opacity={0.5 - i * 0.08}/>
        ))}
        {[580, 680, 760, 830, 880].map((y, i) => {
          const t = (y - 300) / 600
          const hw = t * 300
          return <line key={`h${i}`} x1={240 - hw} y1={y} x2={240 + hw} y2={y}
            stroke="white" strokeWidth="0.4" opacity={0.3 - i * 0.04}/>
        })}
      </svg>

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 10, textAlign: 'center',
        padding: '0 32px', animation: 'em-fadeup 0.9s ease forwards',
      }}>
        {/* League label */}
        <div style={{
          fontSize: '9px', letterSpacing: '6px', color: alpha(C.gold, 0.65),
          fontFamily: SAIRA, fontWeight: '700', marginBottom: '28px',
          animation: 'em-glow 3s ease infinite',
        }}>
          JPEL OFFICIAL SIMULATION
        </div>

        {/* JPEL */}
        <div style={{
          fontSize: '72px', fontWeight: '900', lineHeight: 0.85,
          fontFamily: SAIRA, color: C.text, letterSpacing: '2px',
        }}>
          JPEL
        </div>

        {/* MANAGER with shimmer */}
        <div style={{
          fontSize: '72px', fontWeight: '900', lineHeight: 0.85,
          fontFamily: SAIRA, letterSpacing: '2px',
          background: `linear-gradient(90deg, ${C.goldDark} 0%, ${C.gold} 30%, ${C.goldHi} 50%, ${C.gold} 70%, ${C.goldDark} 100%)`,
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          animation: 'em-shimmer 4s linear infinite',
          marginBottom: '24px',
        }}>
          MANAGER
        </div>

        {/* Separator */}
        <div style={{
          width: '80px', height: '1px',
          background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)`,
          margin: '0 auto 18px',
        }}/>

        {/* Tagline */}
        <div style={{
          fontSize: '11px', color: C.textDim, letterSpacing: '2px',
          marginBottom: '44px', lineHeight: 1.8,
        }}>
          プロ駅伝リーグの総監督になれ
        </div>

        {/* TAP TO START */}
        <div style={{
          fontSize: '13px', letterSpacing: '5px', color: alpha(C.gold, 0.85),
          fontFamily: SAIRA, fontWeight: '900',
          animation: 'em-glow 1.8s ease infinite',
        }}>
          TAP TO START
        </div>
      </div>

      {/* Bottom */}
      <div style={{
        position: 'absolute', bottom: '20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      }}>
        <div style={{ fontSize: '8px', color: C.textGhost, letterSpacing: '3px', fontFamily: SAIRA }}>
          EKIDEN MANAGER
        </div>
      </div>
    </div>
  )
}
