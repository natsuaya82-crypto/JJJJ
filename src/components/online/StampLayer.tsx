import { useEffect, useRef, useState } from 'react'
import PlayerFace from '../player/PlayerFace'
import type { Nationality } from '../../types'
import { RACE_EMOJI, RACE_CHEERS, type StampPayload } from './stampKinds'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 対戦中の応援スタンプ。
//
// ・DBには残さない。roomChannel の broadcast で飛ばして、その場に居た人の画面に出るだけ
//   （残す価値のあるものではないし、残すと見張りも要る）。
// ・出る位置は画面内のランダム。整列させるより賑やかしとして楽しいので、あえて散らす。
// ・選手スタンプの顔は PlayerFace が選手IDと国籍から作るので、画像素材は要らない。

/** 画面に出ている1つぶん */
type Live = StampPayload & { key: number; x: number; y: number; rot: number }

/** 出てから消えるまで */
const LIFE_MS = 2600
/** 同時に出す上限。連打されても画面が埋まらないようにする */
const MAX_LIVE = 12

let seq = 0

export default function StampLayer({ feed }: { feed: StampPayload | null }) {
  const [live, setLive] = useState<Live[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!feed) return
    const key = ++seq
    // 位置は画面内のランダム。上下は真ん中寄り（ヘッダーと下のボタンに被らないように）
    const item: Live = {
      ...feed, key,
      x: 6 + Math.random() * 66,
      y: 18 + Math.random() * 54,
      rot: -12 + Math.random() * 24,
    }
    // effect の中で直接 setState すると描画が連鎖するので、次のフレームに回す
    const add = requestAnimationFrame(() => setLive(v => [...v, item].slice(-MAX_LIVE)))
    const t = setTimeout(() => setLive(v => v.filter(x => x.key !== key)), LIFE_MS)
    timers.current.push(t)
    return () => cancelAnimationFrame(add)
  }, [feed])

  // 画面を離れるときに残っているタイマーを片付ける
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = [] }, [])

  if (live.length === 0) return null

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 30 }}>
      <style>{`
        @keyframes stamp-pop {
          0%   { opacity: 0; transform: translateY(14px) scale(0.7); }
          14%  { opacity: 1; transform: translateY(0) scale(1.12); }
          26%  { transform: translateY(0) scale(1); }
          78%  { opacity: 1; transform: translateY(-16px) scale(1); }
          100% { opacity: 0; transform: translateY(-34px) scale(0.94); }
        }
      `}</style>
      {live.map(s => (
        <div key={s.key} style={{
          position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
          animation: `stamp-pop ${LIFE_MS}ms ease-out forwards`,
          transform: `rotate(${s.rot}deg)`,
        }}>
          {s.p ? (
            // 選手スタンプ：顔＋名前＋応援の言葉
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 5px',
              borderRadius: 999, background: alpha('#0b1626', 0.92),
              border: `1.5px solid ${alpha(C.gold, 0.55)}`,
              boxShadow: `0 4px 14px rgba(0,0,0,0.5)`,
            }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                <PlayerFace playerId={s.p.id} nationality={s.p.nat as Nationality} size={26} />
              </div>
              <div style={{ lineHeight: 1.15 }}>
                <div style={{ fontSize: 9, color: C.textGhost, whiteSpace: 'nowrap' }}>{s.p.name}</div>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.gold, whiteSpace: 'nowrap' }}>
                  {RACE_CHEERS[s.p.c] ?? RACE_CHEERS[0]}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, lineHeight: 1, filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.6))' }}>
                {RACE_EMOJI[s.e ?? 0] ?? RACE_EMOJI[0]}
              </div>
              {s.from && (
                <div style={{
                  fontFamily: SAIRA, fontSize: 9, fontWeight: 800, color: C.textSub,
                  marginTop: 1, textShadow: '0 1px 3px rgba(0,0,0,0.9)', whiteSpace: 'nowrap',
                }}>{s.from}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
