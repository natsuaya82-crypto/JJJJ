import { useNavigate } from 'react-router-dom'
import { audio } from '../../utils/audio'
import { C, SAIRA } from '../../styles/tokens'

// ============================================================================
// **画面の見出し。「‹ タイトル」を横一列で出す。**
//
// ★戻る矢印を別の行に置かないこと（画面ごとに位置がバラけていた）。
// ★英字の小見出し（eyebrow）は**1画面に1つまで**。無ければ出さない。
// ★**画面で見出しを手書きしないこと。** 「戻る＋（英字）＋タイトル」の塊が
//   **44画面に51か所**あり、大きさが 16／18／19／20／21／22px の6通りに割れていました
//   （同じ「戻る＋タイトル」なのに画面ごとに別物）。足りない口はここに足すこと。
// ============================================================================

export default function PageHeader({ title, eyebrow, icon, right, onBack }: {
  title: string
  /** タイトルの上に出す英字。要らなければ渡さない */
  eyebrow?: string
  /** 戻る矢印とタイトルのあいだに置くもの（リーグのロゴなど） */
  icon?: React.ReactNode
  /** 右端に出すもの（件数・切り替えなど） */
  right?: React.ReactNode
  /** 既定は1つ戻る */
  onBack?: () => void
}) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '10px 14px 12px' }}>
      <button
        data-se="back"
        onClick={() => { audio.markBack(); audio.playSe('back'); if (onBack) onBack(); else navigate(-1) }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: C.textSub,
          padding: '8px 6px 8px 0', display: 'flex', alignItems: 'center',
          minHeight: 44, flexShrink: 0,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {icon && <span style={{ display: 'flex', flexShrink: 0, marginRight: 8 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div style={{ fontFamily: SAIRA, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: '3px' }}>
            {eyebrow}
          </div>
        )}
        <div style={{
          fontSize: 21, fontWeight: 900, color: C.text, lineHeight: 1.15,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
      </div>
      {right}
    </div>
  )
}
