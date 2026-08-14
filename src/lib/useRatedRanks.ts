import { useEffect, useState } from 'react'
import { ratingsByIds } from './ratedApi'
import { ensureAuth } from './supabase'

// ============================================================================
// **名前の横に出す段位を、まとめて引くフック。**
//
// ★フレンド一覧・走友会の名簿・対戦のロビー・殿堂入り…と、他人の名前が並ぶ画面が
//   10か所ある。**1人ずつ引かせないこと**（一覧で20人ぶんの通信が飛ぶ）。
//   画面は「並んでいるIDを全部渡す」だけで、まとめ方はここが持つ。
//
// ★**ランクマッチに一度も出ていない人は入っていない。** 呼ぶ側は
//   `<RankBadge rating={ranks.get(id)} />` と書けばよく（undefined なら何も出ない）、
//   「参加しているか」の分岐を画面に書かないこと（オーナー判断・2026-08-14「何も出さない」）。
//
// ★取れなくても例外を投げない。段位が出ないだけで、一覧そのものは出したい。
// ============================================================================

/**
 * 一度引いた段位はアプリ起動中だけ覚えておく。
 * これが無いと、詳細から一覧へ戻るたびに紋章が**一瞬消えてから出てくる**
 * （`friendsUi` の `useFriendsQuery` が一覧そのものに対して同じことをしている理由と同じ）。
 */
const cache = new Map<string, number>()
/** 「引いてみたが入っていなかった」も覚える。毎回引き直さないため */
const missed = new Set<string>()

/** ランクマッチの結果が動いたときに捨てる（自分のレートが変わったあとなど） */
export function invalidateRatedRanks(): void {
  cache.clear()
  missed.clear()
}

export function useRatedRanks(ids: readonly string[]): Map<string, number> {
  // ★配列そのものを依存に入れない（毎レンダー新しい配列が来るので無限に引き直す）。
  //   並び順は関係ないので、そろえてから文字列にする
  const key = [...ids].sort().join(',')
  const [, bump] = useState(0)

  useEffect(() => {
    const want = key ? key.split(',') : []
    const missing = want.filter(id => !cache.has(id) && !missed.has(id))
    if (missing.length === 0) return
    let alive = true
    void ratingsByIds(missing).then(got => {
      if (!alive) return
      for (const id of missing) {
        const r = got.get(id)
        if (r == null) missed.add(id)   // 未参加。次から引かない
        else cache.set(id, r)
      }
      bump(n => n + 1)
    })
    return () => { alive = false }
  }, [key])

  const out = new Map<string, number>()
  for (const id of (key ? key.split(',') : [])) {
    const r = cache.get(id)
    if (r != null) out.set(id, r)
  }
  return out
}

/** 1人ぶん。詳細ページのように相手が1人しかいないところ用 */
export function useRatedRank(id: string | undefined): number | undefined {
  return useRatedRanks(id ? [id] : []).get(id ?? '')
}

/**
 * **自分の段位。** 相手に見せる物（GMカード）に入れるとき用。
 * ★`fetchMe` を呼ばないこと——あちらは大会の順位や提出まで引く重い口で、
 *   ここが欲しいのはレート1つだけ。上と同じ覚えておく場所を使う。
 */
export function useMyRatedRank(): number | undefined {
  const [me, setMe] = useState<string>('')
  useEffect(() => {
    let alive = true
    void ensureAuth().then(id => { if (alive && id) setMe(id) })
    return () => { alive = false }
  }, [])
  return useRatedRank(me || undefined)
}
