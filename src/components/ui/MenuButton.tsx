import { C } from '../../styles/tokens'

// ============================================================================
// **画面から画面へ渡る一覧の行（ガラスのボタン）。**
//
// ★ホーム・チーム・移籍・記録・オンライン・フレンドの「メニューの並び」は
//   全部これを使うこと。**同じ見た目を各画面で手書きしないこと**（金枠2px＋
//   下に影、というほぼ同じ塊が6画面にコピーされていた）。
// ★見た目は `index.css` の `.premium-menu-button`（ガラス・丸角・細い金枠）1本。
// ============================================================================

export default function MenuButton({ icon, label, en, badge = 0, badgeColor = C.gold, note, tone = 'gold', disabled, onClick }: {
  icon: React.ReactNode
  label: string
  /** 上に出る英字。無ければ出さない */
  en?: string
  badge?: number
  badgeColor?: string
  /** 「準備中」のような状態。説明文は置かないこと */
  note?: string
  tone?: 'gold' | 'cyan'
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={() => { if (!disabled) onClick() }}
      className={[
        'premium-menu-button',
        tone === 'cyan' ? 'premium-menu-button--cyan' : '',
        disabled ? 'is-off' : '',
      ].filter(Boolean).join(' ')}
    >
      <span className="premium-menu-button__icon">{icon}</span>
      <span className="premium-menu-button__content">
        {en && <span className="premium-menu-button__english">{en}</span>}
        <span className="premium-menu-button__japanese">
          {label}
          {badge > 0 && (
            <span style={{
              marginLeft: 7, padding: '1px 7px', borderRadius: 6,
              background: badgeColor, color: C.bg, fontSize: 10, fontWeight: 900,
              verticalAlign: 'middle',
            }}>{badge}</span>
          )}
          {note && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginLeft: 8 }}>{note}</span>
          )}
        </span>
      </span>
      {!disabled && <span className="premium-menu-button__arrow">›</span>}
    </button>
  )
}
