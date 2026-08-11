// 記録会の「歴代1位」の更新（世界記録・日本記録）。
// `raceSlice` の `simulateIndividualEvent` から切り出した（挙動不変）。
//
// ■なぜ切り出すのか
//   世界記録と日本記録が**まったく同じ処理を2回**書いていた（45行）。違うのは
//     ・誰を見るか … 全員 ／ JPN国籍だけ
//     ・どこへ書くか … `worldRecords` ／ `japanRecords`
//     ・見出しの scope … `'world'` ／ `'japan'`
//   の3つだけで、更新の判定・タイ記録の扱い・ニュースの出し方は同じ。
//   同じ判断が2箇所にあるので、片方だけ直す事故がいつでも起こせる形だった。
//
// ■タイ記録（同着）の決まり
//   ・**同じレースの中で並んだ**とき … 1位の人が保持者、同タイムの残りが共同保持者
//   ・**後日、既存の記録に並んだ**とき … 既存の保持者はそのままで、共同保持者に足す
//   ・記録が**破られた**ときは、共同保持者ごと丸ごと入れ替わる
//   どちらの場合も、並んだ人ぶんだけニュースが出る。
import { recordHeadline, type NewsItem } from '../utils/newsItems'
import type { EventDistKey, EventTimeRecord } from '../types'

/** 記録の対象になる1走。順位順（速い順）に並んでいること */
export type RankedRun = { playerId: string; timeSec: number }

export type RecordUpdate = {
  /** 更新後の記録（変わらなければ元のまま） */
  record: EventTimeRecord | undefined
  /** 更新・タイのときに出す見出し */
  news: NewsItem[]
}

/**
 * その種目の歴代1位を更新する。**世界記録と日本記録は同じこの1本を通る。**
 *
 * @param ranked  速い順に並んだ全走者。`eligible` を通ったものだけが対象
 * @param eligible 対象にするか（日本記録なら「JPN国籍か」）。世界記録は全員 true
 */
export function updateBestRecord(
  cur: EventTimeRecord | undefined,
  ranked: readonly RankedRun[],
  opts: {
    scope: 'world' | 'japan'
    eligible: (r: RankedRun) => boolean
    nameOf: (playerId: string) => string | undefined
    year: number
    date: string
    distance: number
  },
): RecordUpdate {
  const news: NewsItem[] = []
  const top = ranked.find(opts.eligible)
  const topName = top ? opts.nameOf(top.playerId) : undefined
  if (!top || topName === undefined) return { record: cur, news }

  const coOf = (r: RankedRun) => ({ playerId: r.playerId, playerName: opts.nameOf(r.playerId) ?? '', year: opts.year })
  const headline = (playerName: string, timeSec: number, tie: boolean, coHolder?: true) =>
    ({ date: opts.date,
       headline: recordHeadline({ scope: opts.scope, tie, distance: opts.distance, playerName, timeSec, ...(coHolder ? { coHolder: true } : {}) }),
       category: 'race' as const, relatedIds: [] as string[] })

  if (!cur || top.timeSec < cur.timeSec) {
    // 記録更新。同じレースで並んだ人は共同保持者として一緒に載せる
    const ties = ranked.filter(r => opts.eligible(r) && r.playerId !== top.playerId && r.timeSec === top.timeSec).map(coOf)
    news.push({ ...headline(topName, top.timeSec, false), relatedIds: [top.playerId] })
    for (const c of ties) news.push({ ...headline(c.playerName, top.timeSec, false, true), relatedIds: [c.playerId] })
    return {
      record: { playerId: top.playerId, playerName: topName, timeSec: top.timeSec, year: opts.year, ...(ties.length > 0 ? { coHolders: ties } : {}) },
      news,
    }
  }

  if (top.timeSec === cur.timeSec) {
    // 既存の記録に並んだ。まだ載っていない人だけ共同保持者に足す
    const holderIds = new Set([cur.playerId, ...(cur.coHolders ?? []).map(c => c.playerId)])
    const newCo = ranked.filter(r => opts.eligible(r) && r.timeSec === cur.timeSec && !holderIds.has(r.playerId)).map(coOf)
    if (newCo.length === 0) return { record: cur, news }
    for (const c of newCo) news.push({ ...headline(c.playerName, cur.timeSec, true), relatedIds: [c.playerId] })
    return { record: { ...cur, coHolders: [...(cur.coHolders ?? []), ...newCo] }, news }
  }

  return { record: cur, news }
}

/**
 * 種目別の自己ベスト。**そのタイムのほうが速いときだけ**書き換える。
 * 所属している選手とスカウト候補で同じ処理を2回書いていたので1本にした。
 */
export function withEventBest<T extends { eventBests?: Partial<Record<EventDistKey, { timeSec: number; year: number }>> }>(
  p: T, key: EventDistKey, timeSec: number, year: number,
): T {
  const prev = p.eventBests?.[key]
  if (prev && timeSec >= prev.timeSec) return p
  return { ...p, eventBests: { ...p.eventBests, [key]: { timeSec, year } } }
}

/** 距離から種目キーへ。距離の分け方はここ1本 */
export function eventDistKey(distance: number): EventDistKey {
  return distance === 5000 ? 'd5000' : distance === 10000 ? 'd10000' : distance === 21097 ? 'half' : 'marathon'
}
