import { strHash } from '../utils/hash'
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

// ── チームの持ち物としてのロゴ ────────────────────────────
// logoId には2つの形を入れられる。
//   'logo_07'     … プレイヤーが選んだプリセット画像
//   'team:tokyo'  … そのチームがもともと持っているロゴ（JPEL20チームは専用PNGがある）
// 後者を許しているのは、ロゴを未選択のままオンラインに出たときに
// 「自分の画面では東京のロゴなのに、相手からはプリセットの絵に見える」というズレを消すため。
// 解釈するのは TeamLogoSVG 1箇所だけ。
const TEAM_LOGO_PREFIX = 'team:'

/** 'team:tokyo' ならチームIDを返す。プリセットIDなら undefined。 */
export function teamLogoIdOf(logoId: string | undefined | null): string | undefined {
  return logoId?.startsWith(TEAM_LOGO_PREFIX) ? logoId.slice(TEAM_LOGO_PREFIX.length) : undefined
}

/**
 * ロゴを選んでいないチームを、サーバーへ送るときのロゴIDに直す。
 *
 * もとは `team.logoId ?? 'logo_01'` としていたため、ロゴ未選択のプレイヤーが
 * オンライン上で全員 logo_01（鶴）になっていた。ローカルの TeamLogoSVG は
 * logoId が無いときチーム専用ロゴ→ハッシュの順で絵を出すので、
 * 「自分の画面と相手の画面で絵が違う」という食い違いにもなっていた。
 *
 * 未選択なら 'team:<チームID>' を送り、相手の画面でもそのチームのロゴが出るようにする。
 * チームIDが無いときだけ、ハッシュでプリセットを散らす（全員同じ絵になるのを避ける）。
 */
export function defaultLogoIdFor(teamId: string | undefined): string {
  if (!teamId) return LOGO_PRESET_DEFAULT
  return `${TEAM_LOGO_PREFIX}${teamId}`
}

/** 表示側でチームIDが手に入らないときの保険。IDのハッシュでプリセットを1つ選ぶ。 */
export function hashedLogoIdFor(seed: string | undefined): string {
  if (!seed) return LOGO_PRESET_DEFAULT
  // 式は utils/hash の1本（`| 0` で畳むのは既に割り当たっているロゴを変えないため）
  return LOGO_PRESETS[Math.abs(strHash(seed) | 0) % LOGO_PRESETS.length]
}
