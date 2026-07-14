// プレイヤーが自チームロゴに選べるプリセット画像（30種）。
// 画像は public/logos/preset/logo_01.png 〜 logo_30.png に配置。
// Team.logoId にこのIDを保存し、TeamLogoSVG が最優先で表示する。

export const LOGO_PRESETS: string[] = Array.from(
  { length: 27 },
  (_, i) => `logo_${String(i + 1).padStart(2, '0')}`,
)

export const logoPresetSrc = (logoId: string) => `/logos/preset/${logoId}.png`
