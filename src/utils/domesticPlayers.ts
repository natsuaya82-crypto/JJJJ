import type { Player, WorldClub } from '../types'
import { makeClubIndex } from './clubs'
import { samePyramid } from './league'

// ============================================================================
// 「その選手を自分のリーグ（日本なら JPEL）の記録として数えてよいか」を決める唯一の場所。
//
// ■なぜ要るのか
//   引退すると player.teamId は '' になる。記録室の国内限定ランキングは
//   「teamId が空 ＝ FA ＝ 国内扱い」と判定していたため、海外クラブで現役を終えた選手まで
//   通算区間賞・通算MVP・記録会の歴代トップ10に混ざっていた。
//   海外リーグでも区間賞・記録会のタイムは記録されるので、これが国内記録を押しのけていた。
//
// ■方針
//   ・現役の選手は今まで通り「国内チームに居るか、無所属か」で判定する。
//     （ドラフト前の候補選手は teamId が '__pool__' で、どちらでもないので今まで通り外れる）
//   ・引退した選手は、引退時の所属（retiredTeamId）で判定する。
//     この項目が無い旧セーブの選手は今まで通り国内扱いのまま（歴代記録が急に消えるのを避ける）。
//
// ■レンタル中に引退した場合
//   借り手ではなく保有元を引退時の所属とする。海外クラブへレンタル中のまま年齢で引退すると、
//   保有元が国内でも海外扱いになって記録から消えてしまうため。
// ============================================================================

// 引退時の所属として控えるID。レンタル中なら保有元。既に入っていればそれを優先。
export function retiredFromOf(p: Pick<Player, 'teamId' | 'loan' | 'retiredTeamId'>): string | undefined {
  return p.retiredTeamId ?? p.loan?.ownerTeamId ?? (p.teamId || undefined)
}

type DomesticInput = Pick<Player, 'teamId' | 'status' | 'retiredTeamId'>

// 「自分のリーグの記録」に数えてよい選手かどうかを返す関数を作る。
// 画面側はこれを1回作って使い回す（毎回セットを作り直さないため）。
// ★基準は**自分のリーグとつながっているリーグ**（utils/league の samePyramid。日本なら1部〜3部、
//   海外ならそのリーグ）。日本を基準に決め打ちしないこと（海外クラブを指揮すると、そのリーグの記録室になる）
export function makeIsDomestic(clubs: readonly WorldClub[] | undefined, myLeagueId: string | undefined) {
  const index = makeClubIndex(clubs)
  const inMine = (teamId: string) => samePyramid(index.byId(teamId)?.leagueId, myLeagueId)

  return (p: DomesticInput): boolean => {
    if (p.status === 'retired') {
      const from = p.retiredTeamId
      // 引退時の所属が分からない旧セーブの選手は、そのころの世界（日本のリーグだけ）の選手として扱う
      if (!from) return samePyramid(OLD_SAVE_LEAGUE, myLeagueId)
      // 自分のリーグのクラブなら残す。ほかのリーグ、および今は無いクラブID（廃止された旧クラブなど）は外す
      return inMine(from)
    }
    // 現役：無所属（FA）は今までどおり数える。ドラフト候補の '__pool__' は外れる
    return p.teamId === '' || inMine(p.teamId)
  }
}

/** 引退時の所属を持っていない旧セーブの選手が居たリーグ（当時は日本のリーグの記録だけを持っていた） */
const OLD_SAVE_LEAGUE = 'jpel-1'
