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
 * **1人の相手に勝ったときの重み。**
 *
 * ★2026-08-14 にオーナー判断で 4 → 40（「レートと変動10倍にしない？数値の変動
 *   小さすぎない？」）。**`ELO_SCALE` と `RANK_BANDS` も同時に10倍**にしてあるので、
 *   動き方はそれ以前とまったく同じ比率で、桁だけが増えている。
 *
 * ★人数で割らない（オーナー判断）。相手が多いほど大きく動く＝
 *   20人の組は最大 ±760、14人なら ±520、10人なら ±360。
 *   対戦相手が少ない日は情報も少ないので、動きが小さくなるのが正しい。
 */
export const RATED_K = 40

/**
 * レートの差がこれだけあると、勝率の見積もりが約10倍になる（Eloの慣習の400を10倍）。
 *
 * ★**`RATED_K` と `RANK_BANDS` と必ず一緒に動かすこと。** この3つの比が中身で、
 *   桁は見た目でしかない。ここだけ400のままKを上げると、レート差が400開いた時点で
 *   「勝って当然」の扱いになって増えなくなり、**上のほうが詰まる**
 *   （実測：全部×10なら14日で −2682〜2984、Kだけ×10だと −1239〜1370 で頭打ち。
 *   しかも1日の最大は 438 対 572 で、幅は狭いのに揺れは大きい）。
 */
export const ELO_SCALE = 4000

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
 *   最初に 100/250/450/700/1000/1400 と置いたときは**上の3段位に誰も届かず**、
 *   7段階のうち3つが死んでいた。**K や目盛りや回数を変えたら必ず測り直すこと。**
 *
 * ★2026-08-14 に `RATED_K` / `ELO_SCALE` と**まとめて10倍**にした
 *   （オーナー「レートと変動10倍にしない？」）。3つの比は変えていないので、
 *   段位の届き方はそれ以前とまったく同じ。**ここだけ10倍を忘れると初日で
 *   レジェンドに届く**ので、3つは必ず一緒に動かすこと。
 *
 * ★**1回の大会で上まで行かないのが正しい**（オーナー・2026-08-14
 *   「レートは継続されるんだから一回でマスターとかいかれると逆に困る」）。
 *   実測（60人・14日・全員提出）で 14日後は **−2682〜2984**＝ダイヤモンドが上限。
 *   マスター（3600）とレジェンド（4500）は**大会を何度か重ねて**届く。
 *
 * ★**次のシーズンへの持ち越しの係数**は未実装。オーナー判断（2026-08-13）
 *   「持ち越しの調整はレート変動見てこっちが決めればいい」＝
 *   **本物の変動を見てから決める**。ここに勝手に係数を置かないこと。
 *   （レートそのものが大会をまたいで続くのとは別の話。あちらは実装済み）
 */
export const RANK_BANDS = [
  { min: 4500, name: 'レジェンド', en: 'LEGEND' },
  { min: 3600, name: 'マスター', en: 'MASTER' },
  { min: 2800, name: 'ダイヤモンド', en: 'DIAMOND' },
  { min: 2000, name: 'プラチナ', en: 'PLATINUM' },
  { min: 1200, name: 'ゴールド', en: 'GOLD' },
  { min: 500, name: 'シルバー', en: 'SILVER' },
  { min: -Infinity, name: 'ブロンズ', en: 'BRONZE' },
] as const

export type RankName = (typeof RANK_BANDS)[number]['name']

export function rankOf(rating: number): RankName {
  return (RANK_BANDS.find(b => rating >= b.min) ?? RANK_BANDS[RANK_BANDS.length - 1]).name
}

/** いちばん下の段位の下限。表示のためだけの数（判定には使わない） */
const BOTTOM_FLOOR = 0

/**
 * **段位の中のどこにいるか。** 画面がこれを自分で計算しないこと。
 *
 *   name/en … 段位
 *   from/to … その段位の下限と、次の段位の下限（いちばん上は to = null）
 *   ratio   … from→to のどこまで来たか（0〜1）。いちばん上は常に1
 *
 * ★段位の中をさらに I / II / III に割らない（オーナー判断・2026-08-13「123はいらん」）。
 */
export function rankProgressOf(rating: number): {
  name: RankName; en: string
  from: number; to: number | null; ratio: number
} {
  const i = RANK_BANDS.findIndex(b => rating >= b.min)
  const at = i < 0 ? RANK_BANDS.length - 1 : i
  const band = RANK_BANDS[at]
  const from = band.min === -Infinity ? BOTTOM_FLOOR : band.min
  const to = at === 0 ? null : RANK_BANDS[at - 1].min
  const ratio = to == null ? 1 : Math.max(0, Math.min(1, (rating - from) / (to - from)))
  return { name: band.name, en: band.en, from, to, ratio }
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
