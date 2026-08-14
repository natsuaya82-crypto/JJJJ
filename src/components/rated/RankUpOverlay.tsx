import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { rankOf } from '../../engine/rating'
import { rankChangeOf } from './rankArt'
import { RANK_ART } from './rankArt'
import { C, alpha, SAIRA, FONT, F } from '../../styles/tokens'

// ============================================================================
// **段位が変わったときだけ出す全画面。**
//
// ★上がったときも落ちたときも**同じ1枚**（レート戦なので落ちる。片方だけ作らない）。
//   違うのは色と文字だけ。
// ★出す判定は `rankOf(前) !== rankOf(後)` の1本。呼ぶ側で書かないこと。
// ★`document.body` へ出す（画面の中に置くと下タブに食われる。CLAUDE.md の BottomSheet と同じ理由）
// ============================================================================

export default function RankUpOverlay({ before, after, onClose }: {
  before: number
  after: number
  onClose: () => void
}) {
  const dir = rankChangeOf(before, after)
  const [shown, setShown] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShown(true), 30); return () => clearTimeout(t) }, [])
  if (!dir) return null

  const art = RANK_ART[rankOf(after)]
  const up = dir === 'up'
  const accent = up ? art.color : C.textDim

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, fontFamily: FONT,
        backgroundColor: '#04080f',
        backgroundImage: `radial-gradient(circle at 50% 38%, ${alpha(accent, 0.18)} 0%, transparent 62%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, cursor: 'pointer',
      }}
    >
      <div style={{
        fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 900, letterSpacing: '7px',
        color: accent, opacity: shown ? 1 : 0, transition: 'opacity 0.5s ease 0.35s',
      }}>{up ? 'RANK UP' : 'RANK DOWN'}</div>

      <img
        src={art.img} alt=""
        width={210} height={210}
        style={{
          margin: '10px 0 2px',
          transform: shown ? 'scale(1)' : `scale(${up ? 1.5 : 0.85})`,
          opacity: shown ? 1 : 0,
          transition: 'transform 0.55s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease',
          filter: up ? `drop-shadow(0 0 26px ${alpha(art.color, 0.5)})` : 'grayscale(0.35)',
        }}
      />

      <div style={{
        fontFamily: SAIRA, fontSize: 34, fontWeight: 900, letterSpacing: '5px', color: '#fdfdfb',
        opacity: shown ? 1 : 0, transition: 'opacity 0.5s ease 0.45s',
      }}>{RANK_ART[rankOf(after)] && rankOf(after)}</div>

      <div style={{
        fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 900, letterSpacing: '3px', color: accent,
        opacity: shown ? 1 : 0, transition: 'opacity 0.5s ease 0.55s',
      }}>{before} → {after}</div>

      <div style={{
        marginTop: 34, fontSize: F.label, color: C.textGhost,
        opacity: shown ? 1 : 0, transition: 'opacity 0.5s ease 0.8s',
      }}>タップで閉じる</div>
    </div>,
    document.body,
  )
}
