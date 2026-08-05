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

/**
 * ロゴを選んでいないチームの既定ロゴを、チームIDから決める。
 *
 * ローカルの表示（TeamLogoSVG）は logoId が無いときIDのハッシュで見た目を散らすので、
 * 未選択でもチームごとに違う絵になる。ところがサーバーへ送るとき（friendsApi の
 * pushMyProfile）は logo_01 で固定していたため、ロゴを選んでいない人が
 * オンライン上では全員同じ絵（鶴）になっていた。
 * 同じハッシュでプリセットを1つ選び、未選択でもオンラインで見分けがつくようにする。
 *
 * ※ローカルのハッシュ表示とは絵の種類が違う（あちらは組み込みSVG、こちらはプリセット画像）。
 *   完全に一致させるにはロゴ選択を必須にするしかないので、ここは「全員同じにしない」までを担う。
 */
export function defaultLogoIdFor(seed: string | undefined): string {
  if (!seed) return LOGO_PRESET_DEFAULT
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  return LOGO_PRESETS[Math.abs(h) % LOGO_PRESETS.length]
}
