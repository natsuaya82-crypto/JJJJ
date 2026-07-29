// 走友会だけが使えるロゴのプリセット（9種）。
// チームのロゴ（logoPresets.ts / public/logos/preset）とは別物で、混ざらないようにしている。
// 画像は public/logos/club/club_01.png 〜 club_09.png に配置。

export const CLUB_LOGOS: string[] = Array.from(
  { length: 9 },
  (_, i) => `club_${String(i + 1).padStart(2, '0')}`,
)

export const CLUB_LOGO_DEFAULT = 'club_01'

/** 走友会以外のID（旧 'logo_xx' や空）が来ても必ず有効な画像に落とす */
export function normalizeClubLogoId(id: string | undefined | null): string {
  return id && CLUB_LOGOS.includes(id) ? id : CLUB_LOGO_DEFAULT
}

export const clubLogoSrc = (logoId: string) => `/logos/club/${normalizeClubLogoId(logoId)}.png`
