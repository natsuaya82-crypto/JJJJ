import { FOREIGN_CLUB_CITY } from '../data/foreignClubCities'
import { hashedGmName } from '../engine/playerGenerator'
import type { ForeignClub, Nationality, Team, WorldClub } from '../types'
import { clubCountryOf, leagueById } from '../data/leagues'
import { strHash } from './hash'
import { isBigClub } from './clubTier'
import { clubById, divisionOfLeague, isJpelLeague } from './world'

// ============================================================================
// 「クラブ」は1種類だけ。ここが唯一の引き場所。
//
// ■なぜ要るのか
//   JPEL(国内)も海外リーグも、やっていることは同じ駅伝リーグで、違うのは国だけ。
//   なのに Team(国内) と ForeignClub(海外) が別物として扱われていたせいで、
//   「まず国内から探して、無ければ海外リーグを全部なめる」という同じ処理が
//   画面と store に30ヶ所以上コピーされていた。
//   1ヶ所でも書き忘れると、そこだけ所属が「—」や「不明」になる。実際そうなっていた。
//
// ■方針
//   実体は国内も海外も1つの並び（`GameState.clubs`・utils/world.ts）。画面用の見た目も
//   Club という1つの形に揃える（`clubView`）。引くのは findClub / makeClubIndex だけ。
//   国内にしかない項目（予算・施設・ドラフト権など）は team に丸ごと入れて任意項目にする。
//   要るときだけ club.team から取り出す。
//
// ■国内か海外か
//   所属リーグ（`club.leagueId`）が日本の部のリーグかを見るだけ（utils/world の isJpelLeague）。
// ============================================================================

// 国内リーグの呼び名。海外リーグの name と同じ場所（Club.leagueName）に入れる
export const JPEL_LEAGUE_NAME = 'JPEL'

export type Club = {
  id: string
  name: string
  shortName: string
  country: Nationality
  colors: { primary: string; secondary: string }
  // 所属リーグ（`club.leagueId` そのもの。国内は部のリーグ `jpel-<部>`）
  leagueId: string
  leagueName: string
  // 日本のリーグ（JPEL）のクラブかどうか（画面の行き先と見出しを選ぶだけに使う）
  isDomestic: boolean
  // ここから下は国内クラブにしかない任意項目
  logoId?: string
  team?: Team
}

/** クラブの実体 → 画面用の見た目。**国内も海外も同じ入口** */
export function clubView(c: WorldClub): Club {
  if (isJpelLeague(c.leagueId)) {
    const t = c as Team
    return {
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      country: 'JPN',
      colors: t.colors,
      leagueId: t.leagueId,
      leagueName: JPEL_LEAGUE_NAME,
      isDomestic: true,
      logoId: t.logoId,
      team: t,
    }
  }
  const f = c as ForeignClub
  return {
    id: f.id,
    name: f.name,
    shortName: f.shortName,
    country: f.country,
    colors: f.colors,
    leagueId: f.leagueId,
    leagueName: leagueById(f.leagueId)?.name ?? '海外リーグ',
    isDomestic: false,
  }
}

// ── クラブの姿。**国内も海外も同じ入口。**
//
// 保存されている値があればそれを返し、無いときだけクラブIDから決め打ちで作る。
// 海外クラブには昔これらの入れ物が無く、IDのハッシュから作った値を
// 「海外専用の関数」で返していた（国内には別の道があった）。
// いまは同じ入れ物を持てるので、埋めた側から本物に変わる。

/** 本拠地（都市名） */
export function clubCity(club: { id: string; shortName: string; city?: string }): string {
  return club.city ?? FOREIGN_CLUB_CITY[club.id] ?? club.shortName
}

/** 創設年。保存が無い海外クラブはIDから 1921〜2000 で固定 */
export function clubFounded(club: { id: string; founded?: number }): number {
  return club.founded ?? 1921 + (hashClubId(club.id) % 80)
}

/** 監督名。保存が無い海外クラブは国の名前プールから固定で1つ */
export function clubGmName(club: { id: string; gmName?: string; country?: string }): string {
  return club.gmName ?? hashedGmName(club.id, club.country ?? '')
}

/**
 * クラブIDから決め打ちの値を作るときのハッシュ。式は utils/hash の1本
 * （`| 0` は既に画面へ出した創設年を変えないため）。
 * ★**GM名はこれではありません**——`engine/playerGenerator` の `hashedGmName`（FNV-1a）で、
 *   そちらへ寄せると遊んでいるセーブのGMが全員別人になります。
 */
function hashClubId(id: string): number {
  return Math.abs(strHash(id) | 0)
}

// クラブ詳細ページの行き先。国内と海外でURLが違うのはここだけにまとめる
export function clubRoutePath(club: Club | null | undefined): string | null {
  if (!club) return null
  return club.isDomestic
    ? `/teams/detail/${club.id}`
    : `/teams/foreign/${club.leagueId}/${club.id}`
}

/**
 * そのリーグの順位表の行き先。**日本の部は順位表の画面（その部を開く）、海外はリーグの画面。**
 * 「自分のリーグを開く」はここを通す（`/standings` を決め打ちすると海外クラブを指揮したときに
 * 日本の順位表が開く）
 */
export function leagueRoutePath(leagueId: string): string {
  return divisionOfLeague(leagueId) != null ? `/standings/${leagueId}` : `/teams/foreign/${leagueId}`
}

export { clubCountryOf }

/**
 * **「海外」の唯一の決まり＝国をまたぐか。** 基準（home）はその選手がいまいるクラブの国
 *（無所属なら本人の国籍）。**日本を基準にしないこと**——海外クラブを指揮していると、
 * 日本のクラブが「海外」で、同じ国のクラブは「国内」になる（オーナー・2026-09-26
 * 「日本だけになってるやつは全部バグ」）。海外挑戦の打診・憧れの地域の加点・「海外クラブからの打診」の印が通る
 */
export function isAbroad(homeCountry: string | null | undefined, to: { country?: string; leagueId?: string } | null | undefined): boolean {
  const dest = clubCountryOf(to)
  return !!homeCountry && !!dest && homeCountry !== dest
}

/** 選手の「国内」の国（いまいるクラブの国。無所属なら国籍） */
export function homeCountryOf(
  p: { teamId?: string | null; nationality?: string } | null | undefined,
  clubs: readonly WorldClub[],
): string | undefined {
  if (!p) return undefined
  return clubCountryOf(clubById(clubs, p.teamId ?? undefined)) ?? p.nationality
}

export type ClubIndex = {
  // IDからクラブを引く。国内・海外どちらでも同じように引ける
  byId: (id: string | null | undefined) => Club | undefined
  // 国内も海外も全部（並びの順＝日本のリーグ → 海外）
  all: Club[]
  // そのIDが日本のリーグのクラブか。知らないIDは false
  isDomestic: (id: string | null | undefined) => boolean
}

// クラブ索引を1回だけ作って使い回す。毎回並びを全部なめないための入り口。
export function makeClubIndex(clubs: readonly WorldClub[] | null | undefined): ClubIndex {
  const byId = new Map<string, Club>()
  const all: Club[] = []
  for (const wc of clubs ?? []) {
    if (!wc?.id) continue
    const c = clubView(wc)
    // 同じIDが二度出てきたら先に入れたほうを残す
    if (byId.has(c.id)) continue
    byId.set(c.id, c)
    all.push(c)
  }
  return {
    byId: (id) => (id ? byId.get(id) : undefined),
    all,
    isDomestic: (id) => (id ? byId.get(id)?.isDomestic === true : false),
  }
}

// 索引を作るほどでもない1回きりの検索用。中身は同じルール。
export function findClub(
  clubs: readonly WorldClub[] | null | undefined,
  id: string | null | undefined,
): Club | undefined {
  const c = clubById(clubs, id)
  return c ? clubView(c) : undefined
}

// ── 「4大リーグ」は廃止しました。戻さないこと ──────────────────
//
// ここには `ELITE_LEAGUE_IDS`（東アフリカ・北南アフリカ・欧州西南・北米の手書き）と
// `ELITE_LEAGUES_BY_REGION` がありました。**リーグでは強さを言えません。**
//
//   ・リーグは動かないが、クラブの格は毎年動く。格3まで上がった欧州北東のクラブが
//     「最高峰ではない」のに、格9まで落ちた北南アフリカのクラブが「最高峰」のままになる
//   ・帯（FOREIGN_TIER_BAND）の下端が9以内、という機械的な線でもあるので、
//     欧州北東（3〜10）が1違いで落ちるだけの紙一重の区別でしかなかった
//
// いまは2つに分かれています。
//   ・世界最高峰か       … utils/clubTier.ts の `isBigClub`（格2以上）
//   ・ステップアップか   … utils/clubTier.ts の `isStepUp`（行き先の格 < 今のクラブの格）
//   ・憧れの地域の行き先 … utils/transferDecision.ts の `regionOfLeague`

// 「そのクラブはビッグクラブか」をIDから引く（実体を探して isBigClub へ）。gameStore から移設
export function bigClub(state: { clubs: readonly WorldClub[] }, clubId: string | undefined): boolean {
  if (!clubId) return false
  return isBigClub(clubById(state.clubs, clubId))
}
