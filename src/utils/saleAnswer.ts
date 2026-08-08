// ============================================================================
// 「その選手について、GMはもう返事を出したか」を扱う唯一の場所。
//
// ■なぜ要るのか
//   買い取り打診に「譲ります」と返すと、決着は次のレース（そのあいだに他クラブが
//   上乗せしてくる）。だから**返事をした事実だけを覚えておく**必要がある。
//
//   ところがその置き場所が `Season.pendingSale` という**シーズンに1件しか無い枠**だった。
//   同じレース間に2人ぶん返事をすると、あとの返事が前の返事を丸ごと上書きする。
//   上書きされた側は
//     ・チャットを開き直すと「移籍先を選んで承諾」がまた出る（何度でも返事できる）
//     ・ベルの数字と通知が「返事待ち」に戻る
//     ・レースを進めても決着しない＝**返事そのものが無かったことになる**
//   という状態になっていた。「一回答えたのにすぐまた同じ答えになる」の正体がこれ。
//
//   選手ごとに1件持てば、返事が消えることはもう起きない。
//
// ■返事をした選手は、他の処分に出せない
//   返事は出したが決着は次のレース、という状態の選手をトレードや貸出に出せてしまうと、
//   1人の選手を二重に処分できる。`utils/transferEligibility` がここを見て止める。
//
// ■読み書きは必ずここを通すこと
//   `season.pendingSale` / `season.pendingSales` を直接読む場所を増やさない
//   （`npm run check` が見張る）。旧セーブの1件枠もここで吸収するので、
//   呼ぶ側は置き場所が2つあることを知らなくていい。
// ============================================================================

/** GMが「譲ります」と返した1件。決着は次のレース（gameStore の runRace の頭） */
export type SaleAnswer = { offerId: string; playerId: string; atRaceIndex: number }

/** 読み書きに要るものだけ。currentSeason をそのまま渡せる形 */
export type SaleAnswerSeason = {
  /** いまの置き場所（選手ごとに1件） */
  pendingSales?: SaleAnswer[]
  /** 旧セーブの置き場所（シーズンに1件）。読むときだけ見る */
  pendingSale?: SaleAnswer
}

/** 決着待ちの返事の一覧。**新旧どちらの置き場所からも読む** */
export function saleAnswers(season: SaleAnswerSeason | undefined): SaleAnswer[] {
  const list = season?.pendingSales ?? []
  const old = season?.pendingSale
  if (!old) return list
  return list.some(a => a.playerId === old.playerId) ? list : [...list, old]
}

/** 返事を出して決着を待っている選手のID */
export function saleAnsweredIds(season: SaleAnswerSeason | undefined): Set<string> {
  return new Set(saleAnswers(season).map(a => a.playerId))
}

/** その選手について、もう返事を出したか */
export function isSaleAnswered(season: SaleAnswerSeason | undefined, playerId: string): boolean {
  return saleAnswers(season).some(a => a.playerId === playerId)
}

/**
 * 返事を1件足す。**同じ選手の返事は上書き**（行き先を選び直した扱い）。
 * 旧セーブの1件枠は、ここを通った時点で新しい置き場所へ畳む。
 */
export function withSaleAnswer<T extends SaleAnswerSeason>(season: T, answer: SaleAnswer): T {
  const rest = saleAnswers(season).filter(a => a.playerId !== answer.playerId)
  return { ...season, pendingSales: [...rest, answer], pendingSale: undefined }
}

/** 決着した（あるいは前提が崩れた）ぶんを落とす。残す選手IDを渡す */
export function keepSaleAnswers<T extends SaleAnswerSeason>(season: T, keep: (a: SaleAnswer) => boolean): T {
  const next = saleAnswers(season).filter(keep)
  const before = saleAnswers(season)
  if (next.length === before.length && !season.pendingSale) return season
  return { ...season, pendingSales: next, pendingSale: undefined }
}
