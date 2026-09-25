import { INITIAL_FOREIGN_CLUBS } from '../data/leagues'
import { ALL_DOMESTIC_TEAMS } from '../utils/domesticClubs'
import { tierBudget } from '../utils/clubTier'
import type { WorldClub } from '../types'

/**
 * **新しいゲームの世界のクラブ232**（日本のリーグ52 → 海外180）。1つの並び（utils/world）。
 *
 * 初期予算はクラブの格から算出（teams.ts の旧ハードコード値に依存しない）。
 * 施設は焼き込まない。自チーム以外のレベルは格から出す（utils/facilities の facilitiesOf）。
 *
 * 使うのは2か所：store の初期状態と、旧い形のセーブで入れ物が片方しか無いときの補い
 * （store/persistence/legacyWorld。旧い形では、無い側は初期状態のものが入っていた）。
 */
export function initialWorldClubs(): WorldClub[] {
  return [
    ...ALL_DOMESTIC_TEAMS.map(t => ({ ...t, finance: { ...t.finance, budget: tierBudget(t) } })),
    ...INITIAL_FOREIGN_CLUBS,
  ]
}
