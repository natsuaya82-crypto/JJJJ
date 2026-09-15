// 引退の年度処理。endSeason から切り出した（挙動不変）。
//
// ■ここでやること
//   1. 今季で引退する選手を決める
//   2. 引退を選手データへ反映する
//
// ■触るときの注意
//   - **引退するかは `utils/playerUtils` の `isRetiringAge` 1本。** 年齢は選手IDから決まる
//     30〜36（`RETIRE_AGE_MIN`〜`RETIRE_AGE_MAX`）。最終戦後の「引退表明」のニュースも、
//     本人が引退を言い出すかの打診も、同じこれを呼ぶ。ここに別の年齢を書くと
//     「引退すると言った選手が引退しない」「言っていない選手が消える」が起きる
//   - ★**誰であっても歳が来たら引退する。除外を付けないこと**（2026-09-15）。
//     以前は「クラブ所属の人だけ」＋「今季契約が切れる人は除く」の2つの除外があり、
//     噛み合って**不死の選手**を作っていた——36歳で契約が切れると満了が優先されてFAになり、
//     FAは引退の対象外なので、そのまま歳を取り続ける（実測で10年目に38歳）。
//     満了と重なったときは**引退が勝つ**（下の expiredIds の扱い）
//   - **引退も `movePlayer` を通す。** 引退は「所属が無くなる」だけなので、
//     控えからの除外・レンタルの解除がまとめて付いてくる。ここで `status` を手で書き換えないこと
//   - **満了と重なったら引退が勝つ**（外すのは `engine/contractExpiry` 側でやる）。
//     二重に処分しないのは同じだが、以前は向きが逆だった。満了を優先すると、
//     引退する歳の選手が「FAになって、そのあと誰も引退させない」に落ちる
//   - 乱数を引かない。**この関数の前後で `Math.random()` の回数と順番が変わらないこと**
//     （海外リーグの年次入れ替えは乱数を引くので、順番が入れ替わると世界が丸ごと変わる）
import { movePlayer } from '../utils/movePlayer'
import { isRetiringAge } from '../utils/playerUtils'
import type { Player } from '../types'

export type RetirementResult = {
  /** 今季で引退する選手のID */
  retiringIds: Set<string>
  /** 引退を反映したあとの選手一覧 */
  players: Player[]
}

export function processRetirements(args: {
  /** 成長処理まで終わった全選手（引退判定はこちらで見る） */
  grownPlayers: Player[]
  /** 契約満了・レンタル返却の処理まで終わった選手一覧（引退はこちらへ反映する） */
  playersAfterFA: Player[]
  /** 今季の年 */
  year: number
}): RetirementResult {
  const { grownPlayers, playersAfterFA, year } = args

  // 引退年齢は utils/playerUtils の retirementAgeOf 1本（最終戦後の引退表明ニュースと同じ式）
  // ★**クラブに居るかどうかは見ない。** 無所属（FA）も歳が来たら引退する。
  //   ドラフト候補（`__pool__`）だけは、まだ世界に入っていないので対象外
  const retiringIds = new Set(
    grownPlayers
      .filter(p => p.status === 'active' && p.teamId !== '__pool__')
      .filter(p => isRetiringAge(p))
      .map(p => p.id)
  )
  // 引退承認済み（今季限りで引退フラグ）はここで確実に引退させる（承認時は即引退しない仕様）
  for (const p of grownPlayers) if (p.pendingRetirementYear != null && p.status === 'active') retiringIds.add(p.id)

  // 引退を反映する。引退も「所属が無くなる」だけなので movePlayer の分岐を通す
  // （引退時の所属の控え・レンタル解除・名簿からの外しがまとめて付いてくる）。
  // クラブ側に名簿は無い（在籍は player.teamId 1本）ので、ここは選手だけ触る
  let players: Player[] = playersAfterFA
  for (const id of retiringIds) {
    const m = movePlayer({ players, teams: [] }, id, '', { year, retire: true })
    if (m.ok) players = m.players
  }

  return { retiringIds, players }
}
