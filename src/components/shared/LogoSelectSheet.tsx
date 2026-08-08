import { LOGO_PRESETS, logoPresetSrc } from '../../data/logoPresets'
import { TeamLogoSVG } from '../icons/Icons'
import { useAdHeight } from '../layout/Layout'
import { C, alpha, SAIRA, HEADER_H, bottomStack } from '../../styles/tokens'


// チームロゴの選択画面（フルスクリーンのオーバーレイ）。設定・オンボーディング両方から使う。
// タップで即選択して閉じる。value は現在の選択（'' = デフォルト＝元チームロゴ）。
export default function LogoSelectSheet({ team, value, onSelect, onClose }: {
  team: { id: string; colors: { primary: string; secondary: string }; shortName: string }
  value: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const adH = useAdHeight()
  const pick = (id: string) => { onSelect(id); onClose() }

  const tile = (selected: boolean): React.CSSProperties => ({
    aspectRatio: '1', borderRadius: 12, cursor: 'pointer', padding: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: alpha('#000', 0.25),
    border: selected ? `2px solid ${C.gold}` : `1px solid ${alpha(C.gold, 0.14)}`,
  })

  return (
    <div style={{
      position: 'fixed', top: `calc(${HEADER_H}px + env(safe-area-inset-top))`, left: 0, right: 0, bottom: 0, zIndex: 1100,
      backgroundColor: C.bg,
      maxWidth: 480, margin: '0 auto',
      display: 'flex', flexDirection: 'column',
      fontFamily: SAIRA,
    }}>
      {/* ヘッダー */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
        padding: '12px 12px',
        borderBottom: `1px solid ${alpha(C.gold, 0.12)}`,
      }}>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', cursor: 'pointer', color: C.text,
          padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 36, minHeight: 36, flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>チームロゴ</div>
      </div>

      {/* グリッド（下タブ・広告に最終行が隠れないよう、下に余白を確保してスクロールで抜けられるように） */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingBottom: bottomStack(adH, { aboveNav: true, extra: 24 }) }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {/* デフォルト（元チームロゴ） */}
          <button type="button" onClick={() => pick('')} style={tile(value === '')}>
            <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} logoId="" size={40}/>
          </button>
          {LOGO_PRESETS.map(id => (
            <button key={id} type="button" onClick={() => pick(id)} style={tile(value === id)}>
              <img src={logoPresetSrc(id)} width="100%" height="100%" style={{ objectFit: 'contain', display: 'block' }}/>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
