// 引退の年度処理。endSeason から切り出した（挙動不変）。
//
// ■ここでやること
//   1. 今季で引退する選手を決める
//   2. 自チームの「まだ引退しないが、そろそろの選手」に判断イベントを出す
//   3. 引退を選手データへ反映する
//
// ■触るときの注意
//   - **引退年齢は `utils/playerUtils` の `retirementAgeOf` 1本。** 選手IDから決まる32〜40で、
//     最終戦後に出る「引退表明」のニュースとまったく同じ式を使う。ここに別の年齢を書くと、
//     「引退すると言った選手が引退しない」「言っていない選手が消える」が起きる
//   - **引退も `movePlayer` を通す。** 引退は「所属が無くなる」だけなので、
//     控えからの除外・レンタルの解除がまとめて付いてくる。ここで `status` を手で書き換えないこと
//   - **契約満了（expiredIds）の選手は引退させない。** 満了はFAとして市場に出る側なので、
//     両方に入れると同じ選手を二重に処分することになる
//   - 乱数を引かない。**この関数の前後で `Math.random()` の回数と順番が変わらないこと**
//     （海外リーグの年次入れ替えは乱数を引くので、順番が入れ替わると世界が丸ごと変わる）
import { movePlayer } from '../utils/movePlayer'
import { ovr, retirementAgeOf } from '../utils/playerUtils'
import type { GameEvent, Player } from '../types'

/** 引退を考えてもらう年齢の幅と、その下限OVR（この水準未満は黙って引退する） */
const CONSIDER_AGE_MIN = 34
const CONSIDER_AGE_MAX = 37
const CONSIDER_OVR_MIN = 60

export type RetirementResult = {
  /** 今季で引退する選手のID */
  retiringIds: Set<string>
  /** 引退を反映したあとの選手一覧 */
  players: Player[]
  /** 自チーム向けの「引退を考慮」イベント（最大1件） */
  events: GameEvent[]
}

export function processRetirements(args: {
  /** 成長処理まで終わった全選手（引退判定はこちらで見る） */
  grownPlayers: Player[]
  /** 契約満了・レンタル返却の処理まで終わった選手一覧（引退はこちらへ反映する） */
  playersAfterFA: Player[]
  /** 今季で契約が切れる選手（FAとして出るので引退させない） */
  expiredIds: Set<string>
  /** 今季の年 */
  year: number
  playerTeamId: string
}): RetirementResult {
  const { grownPlayers, playersAfterFA, expiredIds, year, playerTeamId } = args

  // 引退年齢は utils/playerUtils の retirementAgeOf 1本（最終戦後の引退表明ニュースと同じ式）
  const retiringIds = new Set(
    grownPlayers
      .filter(p => p.status === 'active' && p.teamId && p.teamId !== '__pool__' && !expiredIds.has(p.id))
      .filter(p => p.age >= retirementAgeOf(p))
      .map(p => p.id)
  )
  // 引退承認済み（今季限りで引退フラグ）はここで確実に引退させる（承認時は即引退しない仕様）
  for (const p of grownPlayers) if (p.pendingRetirementYear != null && p.status === 'active') retiringIds.add(p.id)

  // Pre-retirement consideration events (age 34-36, didn't retire, active on player team)
  const considerRetirement = grownPlayers.filter(p =>
    p.teamId === playerTeamId &&
    p.status === 'active' &&
    !retiringIds.has(p.id) &&
    !expiredIds.has(p.id) &&
    p.age >= CONSIDER_AGE_MIN && p.age <= CONSIDER_AGE_MAX &&
    ovr(p) >= CONSIDER_OVR_MIN
  ).slice(0, 1)

  const events: GameEvent[] = considerRetirement.map(p => ({
    id: `retire-consid-${p.id}-${year + 1}`,
    type: 'player_retirement' as const,
    raceIndex: 0,
    title: `${p.name}が引退を考慮`,
    body: `${p.age}歳になった${p.name}が今後のキャリアについて考えています。特別ボーナスで続投を要請するか、引退を受け入れますか？`,
    playerId: p.id,
    choices: [
      { label: '続投ボーナス2000万で要請', desc: '来季も戦力になるが予算圧迫' },
      { label: '引退を受け入れる（感謝の式）', desc: 'GM評判+3、チームの士気UP' },
    ],
    resolved: false }))

  // 引退を反映する。引退も「所属が無くなる」だけなので movePlayer の分岐を通す
  // （引退時の所属の控え・レンタル解除・名簿からの外しがまとめて付いてくる）。
  // クラブ側に名簿は無い（在籍は player.teamId 1本）ので、ここは選手だけ触る
  let players: Player[] = playersAfterFA
  for (const id of retiringIds) {
    const m = movePlayer({ players, teams: [] }, id, '', { year, retire: true })
    if (m.ok) players = m.players
  }

  return { retiringIds, players, events }
}
