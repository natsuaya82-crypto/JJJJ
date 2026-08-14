import { C, alpha } from '../../styles/tokens'

// ============================================================================
// **画面から画面へ渡る一覧の行（ガラスのボタン）。**
//
// ★ホーム・チーム・移籍・記録・オンライン・フレンドの「メニューの並び」は
//   全部これを使うこと。**同じ見た目を各画面で手書きしないこと**（金枠2px＋
//   下に影、というほぼ同じ塊が6画面にコピーされていた）。
// ★見た目は `index.css` の `.premium-menu-button`（ガラス・丸角・細い金枠）1本。
// ★足りない口があったら**ここに足すこと**。画面側で className を手書きすると、
//   見た目を変えたときにその画面だけ取り残される（TeamsHub が実際にそうなっていた）。
// ★色は `color` で渡す（金／シアンの2択にしないこと。オーナー・2026-08-13
//   「元の色を尊重して欲しい」＝橙も青もその画面の色のまま出す）。
// ============================================================================

export default function MenuButton({ icon, label, en, badge = 0, badgeColor = C.gold, note, right, color = C.gold, compact, disabled, onClick }: {
  icon?: React.ReactNode
  label: string
  /** 上に出る英字。無ければ出さない */
  en?: string
  badge?: number
  badgeColor?: string
  /** 「準備中」のような状態。説明文は置かないこと */
  note?: string
  /** 行の右端（矢印の手前）に置くもの。順位・人数など */
  right?: React.ReactNode
  /** その行の色。**もとの画面で使っていた色をそのまま渡すこと**（金は金、シアンはシアン） */
  color?: string
  /** 一覧の中で並べる低い行（72px）。高さは CSS 側に持たせてある */
  compact?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={() => { if (!disabled) onClick() }}
      className={[
        'premium-menu-button',
        compact ? 'premium-menu-button--compact' : '',
        disabled ? 'is-off' : '',
      ].filter(Boolean).join(' ')}
      style={disabled ? undefined : {
        // ガラスをその行の色に染める
        ['--tint-edge' as string]: alpha(color, 0.55),
        ['--tint-fill' as string]: alpha(color, 0.07),
      }}
    >
      {icon && <span className="premium-menu-button__icon" style={disabled ? undefined : { color }}>{icon}</span>}
      <span className="premium-menu-button__content">
        {en && <span className="premium-menu-button__english" style={disabled ? undefined : { color: alpha(color, 0.85) }}>{en}</span>}
        <span className="premium-menu-button__japanese">
          {label}
          {badge > 0 && (
            <span style={{
              marginLeft: 7, padding: '1px 7px',
              background: badgeColor, color: C.bg, fontSize: 10, fontWeight: 900,
              verticalAlign: 'middle',
            }}>{badge}</span>
          )}
          {note && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginLeft: 8 }}>{note}</span>
          )}
        </span>
      </span>
      {right && <span style={{ position: 'relative', zIndex: 1, marginLeft: 'auto' }}>{right}</span>}
      {!disabled && (
        <span className="premium-menu-button__arrow" style={{ color: alpha(color, 0.8), ...(right ? { marginLeft: 10 } : null) }}>›</span>
      )}
    </button>
  )
}
