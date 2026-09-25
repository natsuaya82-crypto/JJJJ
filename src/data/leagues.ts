import type { Division, ForeignClub, LeagueId, Nationality } from '../types'
import { FOREIGN_LEAGUES } from './foreignLeagues'
import { leagueRules, type LeagueRules } from './leagueRules'

// ============================================================================
// 世界のリーグは12本（日本1部・2部・3部＋海外9）。**全部同じ形。**
//
// リーグの ID は `Season.leagues`（日程・結果・順位表）のキーと、クラブの所属
// （`club.leagueId`）の両方に使う。日本の部は `jpel-<部>`（`utils/world` の `divisionLeagueId`。
// data は utils を import できないので、ここでは表として書く。食い違いは check-world-layer が見る）。
//
// ★**リーグの違いは `rules`（`data/leagueRules` の表）だけに書くこと。**
//   コードに「国内なら」「海外なら」を書かず、そのリーグの決まりを引く。
// ============================================================================

export { leagueRules, type LeagueRules } from './leagueRules'

export type WorldLeague = {
  id: LeagueId
  name: string
  country: Nationality
  countryName: string
  /** 日本の部のリーグだけ。海外は undefined */
  division?: Division
  rules: LeagueRules
}

const JPEL: Record<Division, { id: LeagueId; name: string }> = {
  1: { id: 'jpel-1', name: 'JPEL 1部' },
  2: { id: 'jpel-2', name: 'JPEL 2部' },
  3: { id: 'jpel-3', name: 'JPEL 3部' },
}

/** 12リーグ。並びは「日本1部・2部・3部 → 海外9（data/foreignLeagues の順）」 */
export const WORLD_LEAGUES: readonly WorldLeague[] = [
  ...([1, 2, 3] as const).map((d): WorldLeague => ({
    id: JPEL[d].id, name: JPEL[d].name, country: 'JPN', countryName: '日本', division: d,
    rules: leagueRules(JPEL[d].id),
  })),
  ...FOREIGN_LEAGUES.map(({ id, name, country, countryName }): WorldLeague => ({
    id, name, country, countryName,
    rules: leagueRules(id),
  })),
]

const BY_ID = new Map(WORLD_LEAGUES.map(l => [l.id, l]))

/** id でリーグを引く。見つからなければ undefined */
export function leagueById(leagueId: LeagueId | null | undefined): WorldLeague | undefined {
  return leagueId == null ? undefined : BY_ID.get(leagueId)
}

/** 決まりに合うリーグ（12本の並びの順） */
export function leaguesWhere(pred: (l: WorldLeague) => boolean): WorldLeague[] {
  return WORLD_LEAGUES.filter(pred)
}

/** 海外180クラブの初期データ（リーグの並び → クラブの並び）。新しいゲームの世界はここから作る */
export const INITIAL_FOREIGN_CLUBS: readonly ForeignClub[] = FOREIGN_LEAGUES.flatMap(l => l.clubs)

/** 海外9リーグ（日本の部でないリーグ）。並びは data/foreignLeagues の順 */
export const FOREIGN_LEAGUE_DEFS: readonly WorldLeague[] = WORLD_LEAGUES.filter(l => l.division == null)
