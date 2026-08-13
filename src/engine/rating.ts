// ============================================================================
// **オンラインのレート戦。レート・段位・グループ分けの唯一の決まり。**
//
// オーナー判断（2026-08-13）
//   ・全員0から始める。段位は上がるし**落ちる**（レート戦だから）
//   ・強い相手に勝つほど大きく上がる（10000と0が同じだけ上がるのはおかしい）
//   ・1グループは10〜20人。**20を超えない**
//   ・レートの動きはベータのあいだ「適当に」——**数字はこのファイルの定数だけ**
//
// ★同じ計算を画面やサーバーに書かないこと。アプリも Edge Function もここを呼ぶ。
// ============================================================================

/** 1グループの上限。**ここを超えるグループを作らないこと** */
export const GROUP_MAX = 20
/** 1グループの下限。これを割ると流会（レートも動かない） */
export const GROUP_MIN = 10

/**
 * **1人の相手に勝ったときの重み。** 動かせる数字はこれ1つ。
 *
 * ★人数で割らない（オーナー判断）。相手が多いほど大きく動く＝
 *   20人の組は最大 ±76、14人なら ±52、10人なら ±36。
 *   対戦相手が少ない日は情報も少ないので、動きが小さくなるのが正しい。
 */
export const RATED_K = 4

/** レートの差がこれだけあると、勝率の見積もりが約10倍になる（Eloの慣習） */
const ELO_SCALE = 400

export type RatedEntry = { id: string; rating: number }

/**
 * **総当たりのElo。** グループの N 人が「1回のレースで N−1 試合した」と見る。
 *
 *   相手ごとの期待勝率 E = 1 / (1 + 10^((相手 − 自分) / 400))
 *   実際の勝敗 S        = 自分のほうが速ければ1、遅ければ0、同着なら0.5
 *   増減                = K × Σ(S − E)
 *
 * `order` は**速い順に並べた id**。順位そのものではなくタイム順を渡すこと
 * （同着の扱いを呼ぶ側で書かせない）。
 */
export function applyElo(
  entries: readonly RatedEntry[],
  order: readonly string[],
): Record<string, number> {
  const rating = new Map(entries.map(e => [e.id, e.rating]))
  // 速い順の位置。order に無い者（不参加）は最後尾の扱いで呼ばれることを想定する
  const place = new Map(order.map((id, i) => [id, i]))
  const out: Record<string, number> = {}
  for (const me of entries) {
    const myPlace = place.get(me.id)
    if (myPlace == null) continue
    let sum = 0
    for (const you of entries) {
      if (you.id === me.id) continue
      const yourPlace = place.get(you.id)
      if (yourPlace == null) continue
      const expected = 1 / (1 + Math.pow(10, ((rating.get(you.id) ?? 0) - (rating.get(me.id) ?? 0)) / ELO_SCALE))
      const actual = myPlace < yourPlace ? 1 : myPlace > yourPlace ? 0 : 0.5
      sum += actual - expected
    }
    out[me.id] = Math.round(RATED_K * sum)
  }
  return out
}

/**
 * **段位。** 名前をここ以外に書かないこと（画面もサーバーも `rankOf` を呼ぶ）。
 * 下限だけを持つ。**上がるし落ちる。**
 *
 * ★区切りは**実測で決めた**（`scripts/measure-rated-season.ts`）。
 *   全員0から始めて1か月（30回戦）回すと、レートは **-400〜+460** に散らばる。
 *   最初に 100/250/450/700/1000/1400 と置いたときは**上の3段位に誰も届かず**、
 *   7段階のうち3つが死んでいた。K や回数を変えたら**必ず測り直すこと**。
 *
 * ★**次のシーズンへの持ち越し**は未実装。オーナー判断（2026-08-13）
 *   「持ち越しの調整はレート変動見てこっちが決めればいい」＝
 *   **本物の変動を見てから決める**。ここに勝手に係数を置かないこと。
 */
export const RANK_BANDS = [
  { min: 450, name: 'レジェンド' },
  { min: 360, name: 'マスター' },
  { min: 280, name: 'ダイヤモンド' },
  { min: 200, name: 'プラチナ' },
  { min: 120, name: 'ゴールド' },
  { min: 50, name: 'シルバー' },
  { min: -Infinity, name: 'ブロンズ' },
] as const

export type RankName = (typeof RANK_BANDS)[number]['name']

export function rankOf(rating: number): RankName {
  return (RANK_BANDS.find(b => rating >= b.min) ?? RANK_BANDS[RANK_BANDS.length - 1]).name
}

/**
 * **グループ分け。レート順に、10〜20人で均等に割る。**
 *
 * ★10・15・20 のような決まった大きさにはできない（オーナーと確認済み）。
 *   43人はその3つの組み合わせでは割り切れない（20+20+3 / 20+15+8 / 15+15+13 …）。
 *   「20を超えない・10を下回らない・均等」の3つだけを守る。
 *
 *   20人 → [20]        43人 → [15,14,14]
 *   21人 → [11,10]     50人 → [17,17,16]
 *   25人 → [13,12]    100人 → [20,20,20,20,20]
 *
 * 10人に満たなければ空を返す（＝その日は流会）。
 */
export function splitGroups(entries: readonly RatedEntry[]): RatedEntry[][] {
  if (entries.length < GROUP_MIN) return []
  const sorted = [...entries].sort((a, b) => b.rating - a.rating)
  const groups = Math.ceil(sorted.length / GROUP_MAX)
  const base = Math.floor(sorted.length / groups)
  const extra = sorted.length % groups   // 先頭から1人ずつ多く配る
  const out: RatedEntry[][] = []
  let at = 0
  for (let g = 0; g < groups; g++) {
    const size = base + (g < extra ? 1 : 0)
    out.push(sorted.slice(at, at + size))
    at += size
  }
  return out
}
