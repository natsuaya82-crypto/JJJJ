import { C, alpha, F } from '../../../styles/tokens'

// ============================================================================
// **チャットの吹き出しの見た目。ここ1本。**
//
// 監督（自分）＝右・青／相手（選手・GM・代理人）＝左・灰。
// ★吹き出しを新しい画面で描き直さないこと。中身（顔・名前・ボタン）は画面ごとに
//   違ってよいが、**面の色と枠と字**はここから引く。
// ============================================================================

export function bubbleStyle(from: 'player' | 'gm'): React.CSSProperties {
  return {
    padding: '10px 13px',
    background: from === 'player'
      ? `linear-gradient(135deg, ${C.surface3}, ${C.surface2})`
      : `linear-gradient(135deg, ${alpha(C.blue, 0.25)}, ${alpha(C.blue, 0.15)})`,
    border: `1px solid ${from === 'player' ? C.border : alpha(C.blue, 0.35)}`,
    fontSize: F.bodyLg,
    color: C.text,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  }
}

/** 1行ぶんの並び（顔・名前・吹き出し）。顔は呼ぶ側から渡す */
export default function ChatBubble({ from, name, avatar, children }: {
  from: 'player' | 'gm'
  /** 吹き出しの上に出す差出人。代理人など名前を出さないときは省略 */
  name?: string
  avatar?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: from === 'player' ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
      {from === 'player' && avatar}
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: from === 'player' ? 'flex-start' : 'flex-end', gap: 3 }}>
        {from === 'player' && name && (
          <span style={{ fontSize: F.caption, color: C.textDim, fontWeight: 700, padding: '0 2px' }}>{name}</span>
        )}
        <div style={bubbleStyle(from)}>{children}</div>
      </div>
    </div>
  )
}
