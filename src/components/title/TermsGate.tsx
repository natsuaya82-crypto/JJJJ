// 初回起動時に出す、利用規約への同意画面。
//
// フレンド・走友会でほかの人に文字が見える以上、App Store の審査基準（1.2）で
// 「不適切な投稿を許容しない規約に同意させること」が求められる。
// 本文を最後まで送ってからチェック、という一般的な形にしてある。
// タイトル画面をタップしたときに、その上へ四角い枠（モーダル）として一度だけ出す。
// 同意するまで先へ進めない（枠の外を押しても閉じない）。

import { useState } from 'react'
import { C, alpha, SAIRA, JP } from '../../styles/tokens'
import { TERMS_UPDATED, TERMS_INTRO, TERMS_HIGHLIGHT, TERMS_SECTIONS } from '../../data/termsText'


export default function TermsGate({ onAgree }: { onAgree: () => void }) {
  const [reachedEnd, setReachedEnd] = useState(false)
  const [checked, setChecked] = useState(false)

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReachedEnd(true)
  }

  // 画面が大きくてスクロールが要らない場合でも進めるようにしておく
  const measure = (el: HTMLDivElement | null) => {
    if (el && el.scrollHeight <= el.clientHeight + 24) setReachedEnd(true)
  }

  const canAgree = reachedEnd && checked

  return (
    // 外側：画面全体を暗く覆う幕。後ろのタイトル画面がうっすら透ける。
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      background: 'rgba(2, 6, 14, 0.62)',
      backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))',
      fontFamily: JP, color: C.text,
    }}>
      {/* 内側：四角い枠。ここに見出し・本文・同意ボタンが入る。 */}
      <div style={{
        width: '100%', maxWidth: '380px', maxHeight: 'min(100%, 600px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: '#050d1c',        border: `1px solid ${alpha(C.gold, 0.3)}`,
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65)',
      }}>

        {/* 上：見出し */}
        <div style={{
          flexShrink: 0, padding: '18px 20px 13px',
          borderBottom: `1px solid ${alpha(C.gold, 0.18)}`, textAlign: 'center',
        }}>
          <div style={{
            fontSize: '9px', letterSpacing: '5px', color: alpha(C.gold, 0.85),
            fontFamily: SAIRA, fontWeight: 700, marginBottom: '8px',
          }}>
            JPEL MANAGER
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '1px' }}>利用規約</div>
          <div style={{ fontSize: '10px', color: C.textGhost, marginTop: '4px' }}>
            最終更新日：{TERMS_UPDATED}
          </div>
        </div>

        {/* 中：本文 */}
        <div
          ref={measure}
          onScroll={onScroll}
          style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px', WebkitOverflowScrolling: 'touch' }}>

          <div style={{ fontSize: '12px', lineHeight: 1.9, color: C.textSub, marginBottom: '16px' }}>
            {TERMS_INTRO}
          </div>

          <div style={{
            border: `1px solid ${alpha(C.gold, 0.3)}`,            background: alpha(C.gold, 0.05), padding: '13px 15px', marginBottom: '8px',
          }}>
            <div style={{ fontSize: '12px', lineHeight: 1.9, color: C.text, fontWeight: 700 }}>
              {TERMS_HIGHLIGHT}
            </div>
          </div>

          {TERMS_SECTIONS.map(sec => (
            <div key={sec.title} style={{ marginTop: '22px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: C.gold, marginBottom: '7px' }}>
                {sec.title}
              </div>
              {sec.body && (
                <div style={{ fontSize: '12px', lineHeight: 1.9, color: C.textSub, whiteSpace: 'pre-line' }}>
                  {sec.body}
                </div>
              )}
              {sec.items && (
                <div style={{ marginTop: sec.body ? '8px' : 0 }}>
                  {sec.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ color: alpha(C.gold, 0.85), fontSize: '12px', lineHeight: 1.9 }}>・</span>
                      <span style={{ fontSize: '12px', lineHeight: 1.9, color: C.textSub, flex: 1 }}>{it}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div style={{
            marginTop: '28px', textAlign: 'center', fontSize: '10px',
            color: C.textGhost, letterSpacing: '2px', fontFamily: SAIRA,
          }}>
            — END OF TERMS —
          </div>
        </div>

        {/* 下：チェックと同意 */}
        <div style={{
          flexShrink: 0, padding: '13px 20px 16px',
          borderTop: `1px solid ${alpha(C.gold, 0.18)}`, background: '#081327',
        }}>
          <div
            onClick={() => { if (reachedEnd) setChecked(v => !v) }}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px',
              cursor: reachedEnd ? 'pointer' : 'default', opacity: reachedEnd ? 1 : 0.4,
            }}>
            <div style={{
              width: '22px', height: '22px',flexShrink: 0,
              border: `1.5px solid ${checked ? C.gold : alpha(C.text, 0.35)}`,
              background: checked ? alpha(C.gold, 0.2) : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.gold, fontSize: '14px', fontWeight: 900, lineHeight: 1,
            }}>
              {checked ? '✓' : ''}
            </div>
            <div style={{ fontSize: '13px', color: C.textSub, fontWeight: 700 }}>
              利用規約に同意します
            </div>
          </div>

          {!reachedEnd && (
            <div style={{ fontSize: '10px', color: C.textGhost, marginBottom: '10px' }}>
              最後まで読むとチェックできます
            </div>
          )}

          <button
            onClick={() => { if (canAgree) onAgree() }}
            disabled={!canAgree}
            style={{
              width: '100%', padding: '15px', border: 'none',
              background: canAgree
                ? `linear-gradient(135deg, ${C.goldDark}, ${C.gold} 55%, ${C.goldHi})`
                : alpha(C.text, 0.08),
              color: canAgree ? '#1a1200' : C.textGhost,
              fontSize: '15px', fontWeight: 900, letterSpacing: '1px',
              fontFamily: JP, cursor: canAgree ? 'pointer' : 'default',
            }}>
            同意して始める
          </button>
        </div>
      </div>
    </div>
  )
}
