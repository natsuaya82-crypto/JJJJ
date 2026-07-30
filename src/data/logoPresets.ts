// プレイヤーが自チームロゴに選べるプリセット画像（27種）。
// 画像は public/logos/preset/logo_01.png 〜 logo_27.png に配置。
// Team.logoId にこのIDを保存し、TeamLogoSVG が最優先で表示する。

export const LOGO_PRESETS: string[] = Array.from(
  { length: 27 },
  (_, i) => `logo_${String(i + 1).padStart(2, '0')}`,
)

export const LOGO_PRESET_DEFAULT = 'logo_01'

/**
 * 保存されているロゴIDを、いま実際に存在する画像のIDに直す。
 *
 * ロゴは昔30種あったが 27種に作り直したときに 28〜30 の画像を消した。
 * 古いセーブにはその28〜30が残っているので、そのままURLにすると404になり、
 * ロゴが何も出ない（走友会ロゴ側の normalizeClubLogoId と同じ役目）。
 */
export function normalizeLogoPresetId(logoId: string | undefined | null): string {
  return logoId && LOGO_PRESETS.includes(logoId) ? logoId : LOGO_PRESET_DEFAULT
}

export const logoPresetSrc = (logoId: string) => `/logos/preset/${normalizeLogoPresetId(logoId)}.png`
