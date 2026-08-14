import { useEffect, useRef, useState } from 'react'
import PlayerFace from '../player/PlayerFace'
import type { Player } from '../../types'
import { RACE_EMOJI, RACE_CHEERS, type StampPayload } from './stampKinds'
import { C, alpha } from '../../styles/tokens'

// 応援スタンプを送るボタン。対戦中の画面の右下に出す。
//
// 連打で相手の画面を埋めないよう、送れる間隔をここで絞る（サーバーを介さないので
// 止められるのは自分の端末だけだが、悪意のない連打はこれで十分止まる）。
const COOLDOWN_MS = 1200

export default function StampBar({ myPlayers, onSend, defaultOpen = false }: {
  /** 自分の走者。顔スタンプに使う。走っている順に渡す */
  myPlayers: Player[]
  onSend: (s: StampPayload) => void
  /** 最初から開いた状態にする（見た目の確認用。ふだんは閉じたまま） */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [cool, setCool] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const fire = (s: StampPayload) => {
    if (cool) return
    onSend(s)
    setOpen(false)
    setCool(true)
    timer.current = setTimeout(() => setCool(false), COOLDOWN_MS)
  }

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="応援する"
        style={{
          position: 'absolute', right: 12, bottom: 12, zIndex: 40,
          width: 46, height: 46, borderRadius: '50%', cursor: 'pointer',
          border: `2px solid ${alpha(C.gold, 0.6)}`,
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          fontSize: 20, lineHeight: 1, fontFamily: 'inherit',
          opacity: cool ? 0.45 : 1,
        }}
      >📣</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 39 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', right: 12, bottom: 66, width: 'min(300px, calc(100% - 24px))',
              padding: 10,
              background: alpha('#0b1626', 0.96), border: `1px solid ${C.border2}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', gap: 6, marginBottom: myPlayers.length > 0 ? 9 : 0 }}>
              {RACE_EMOJI.map((e, i) => (
                <button key={e} onClick={() => fire({ e: i })} className="btn-press" style={{
                  flex: 1, padding: '9px 0',cursor: 'pointer', fontSize: 20,
                  border: `1px solid ${C.border3}`, background: alpha('#000', 0.3), fontFamily: 'inherit',
                }}>{e}</button>
              ))}
            </div>

            {/* 選手を指しての応援。顔は PlayerFace が作るので画像素材は要らない */}
            {myPlayers.length > 0 && (
              <>
                <div style={{ fontSize: 9, color: C.textGhost, marginBottom: 5 }}>選手を応援する</div>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                  {myPlayers.slice(0, 8).map(p => (
                    <button
                      key={p.id}
                      onClick={() => fire({
                        p: {
                          id: p.id, name: p.name, nat: p.nationality,
                          c: Math.floor(Math.random() * RACE_CHEERS.length),
                        },
                      })}
                      className="btn-press"
                      style={{
                        flexShrink: 0, width: 52, padding: '5px 0 4px',cursor: 'pointer',
                        border: `1px solid ${C.border3}`, background: alpha('#000', 0.3), fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', margin: '0 auto' }}>
                        <PlayerFace playerId={p.id} nationality={p.nationality} size={30} />
                      </div>
                      <div style={{
                        fontSize: 8, color: C.textSub, marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px',
                      }}>{p.name.split(' ').at(-1) ?? p.name}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
