// 点検用の「今シーズン」を組む。**点検が世界を作るときの `Season.leagues` はここ1本。**
//
// 日程・結果・順位表はリーグIDで引く1つの形（`Season.leagues`）。点検ごとに
// 部のリーグと海外リーグの入れ物を手で組むと、形を変えたときに点検の数だけ直すことになる。
import type { Division, LeagueSeason, Race, SeasonStanding } from '../src/types'
import { divisionLeagues } from '../src/utils/league'

export function seasonLeaguesFixture(o: {
  /** 自チームの部と、その日程（結果の入り具合は呼ぶ側で決める） */
  myDivision?: Division
  races?: Race[]
  /** ほかの部の日程（無ければ空） */
  schedules?: Partial<Record<Division, Race[]>>
  standings: Record<Division, SeasonStanding[]>
  /** 海外リーグの順位表（リーグID → 行） */
  foreignStandings?: Record<string, SeasonStanding[]>
}): Record<string, LeagueSeason> {
  const schedules = { ...(o.schedules ?? {}), ...(o.myDivision != null ? { [o.myDivision]: o.races ?? [] } : {}) }
  return {
    ...divisionLeagues(schedules, o.standings),
    ...Object.fromEntries(Object.entries(o.foreignStandings ?? {}).map(([lid, st]) => [lid, { races: [] as Race[], standings: st }])),
  }
}
