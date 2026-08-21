// 移籍の意思決定の唯一の場所。
//
// ■ 何を決めるか
//   「その選手が、そのクラブへ行くことに納得するか」だけ。
//   クラブ同士が金で合意するかは別（data/economy.ts の入札まわり）。
//
// ■ なぜ1本にするのか
//   同意の判定は、買う側（入札→契約交渉）・売る側（オファー承諾・逆提示・売出の自動買取）・
//   トレード・CPU間の引き抜き・FA接触、と6つの入口がある。ここが入口ごとに違うと、
//   「自チームが買うときだけ本人に聞く」「売るときは聞かない」のような非対称が生まれる。
//   実際そうなっていた。入口が増えても判断の本体はこのファイル1つにする。
//
// ■ 何を見るか（オーナーの指定）
//   移籍は「そこで出られるか」と「格上でやりたいか」で基本が決まる。
//   それに「優勝したい」「ECLに出たい」が乗る。
//
//     1. 格差          … 行き先が今より格上か。格上なら基本断らない
//     2. 行き先での序列 … そのクラブで何番手になるか。4大リーグでも2年ベンチなら行かない
//     3. 今の出場機会   … 今のクラブで干されているほど動きたがる
//     4. 優勝           … 行き先が上位争いをしているか
//     5. ECL           … 行き先が今季ECLに出ているか
//
//   出場機会を求めて格下へ落ちる（ステップダウン）も、2と3で自然に成立する。
//
// ■ 断らない側に寄せてある
//   以前は性格(loyalty)が格上への移籍まで潰していて、2段上のクラブでも1/4が断っていた。
//   性格は「同格・格下のときだけ」効かせる。格上の話を愛着で蹴るのは、移籍の絵として不自然。

import type { OverseasRegion, Player } from '../types'
import { inTierBand } from './playerTier'
import { ovr } from './playerUtils'
import { clubIndexOf } from './rosterSync'
import { strHash } from './hash'
import { isDeclining } from '../engine/ageCurve'
import { TIER_POTENTIAL_CAP, type ClubTier } from './clubTier'
import { RUNNING_SLOTS, SQUAD_DEPTH_SLOTS } from '../data/rosterRules'
// 「そのクラブで何番手か」は squadNeeds の1本
import { squadRankOf } from './squadNeeds'
import { MORALE_DEFAULT } from './condition'

/**
 * 憧れの地域は選手のタイプで決まる。持久系→アフリカ高地／スピード系→ヨーロッパのトラック／
 * 山・万能→北米。**保存しない**（タイプから毎回同じ答えが出るので持つ必要がない）。
 * 海外挑戦の直訴（gameStore の overseasRequests）の行き先もここを見る。
 */
export function dreamRegionOf(specialty: Player['specialty']): OverseasRegion {
  return (specialty === 'long' || specialty === 'grinder') ? 'africa'
    : (specialty === 'sprinter' || specialty === 'kick' || specialty === 'ace') ? 'europe'
    : 'america'
}

/**
 * 憧れの地域の呼び方。会話にそのまま出す。**呼び名はここ1本。**
 * 以前は3か所にあり、`america` だけ「北米・南米」と「北米」で食い違っていた
 * （chatLines.ts と ChatPage.tsx は同じ表の丸写し）。
 */
export const DREAM_LABEL: Record<OverseasRegion, string> = {
  africa: 'アフリカ', europe: 'ヨーロッパ', america: '北米',
}

/** 地域の呼び名（保存された文字列から引くとき用）。分からなければ「海外」 */
export function dreamLabelOf(region: string | undefined): string {
  return DREAM_LABEL[(region ?? '') as OverseasRegion] ?? '海外'
}

// 走れる人数は data/rosterRules.ts の1本。ここは今までどおり使えるように通すだけ
export { RUNNING_SLOTS } from '../data/rosterRules'

/**
 * 「そのクラブでは出番が無い」と言える序列。**国内も海外もこの1本で判定する。**
 *
 * 線は `data/rosterRules` の `SQUAD_DEPTH_SLOTS`（＝走れる人数の2倍。7区間なら14番手まで）。
 * **買う側（`squadNeeds.needsPlayer`）と同じ線です。** ここで ×2 を手書きしないこと
 * （出す側と買う側で線が食い違うと、8〜14番手が「誰もが売るが誰も買わない」層になります）。
 */
export function hasNoPlayingTime(squadRank: number, slots: number = SQUAD_DEPTH_SLOTS): boolean {
  return squadRank > slots
}

// ── 誰が市場に出るか（供給の唯一の決まり）─────────────────────
//
// ■なぜ要るのか
//   「序列から落ちた人は移籍する」だけにすると、ロスター30人のクラブは毎年
//   下半分（15人以上）がまるごと市場に出る。1クラブ23人が動く計算になり、市場が壊れる。
//   実際に出ていくのは「走れていたのに走れなくなった」人で、かつ待っていられない人だけ。
//
// ■3つの条件（全部満たしたときだけ出る）
//   1. 序列が届いていない            … hasNoPlayingTime
//   2. 実際に走れていない            … 今季の出走率が APPEARANCE_FLOOR 未満
//   3. 待っていられない              … SEEK_MIN_AGE 以上。若手は残ってレンタルで出番を作る
//
// ■「落ちた」か「続いている」か
//   去年は走れていたのに今季走れなくなった（＝スタメンを失った）人は、その年に動く。
//   もともと走れていない人は、若いうちは伸びしろに賭けて残り、SEEK_PATIENCE_AGE を超えたら動く。

/** 「走れている」と言える出走率。今季これを下回ると出番が無い扱い */
export const APPEARANCE_FLOOR = 0.34
/** これ未満は移籍せず残る（出番はレンタルで作る） */
export const SEEK_MIN_AGE = 24
/** もともと控えの選手が「もう待てない」と判断する年齢 */
export const SEEK_PATIENCE_AGE = 27

/**
 * **出す側にとって、その選手は余剰か。**（移籍の②「その選手は出せるか」の唯一の決まり）
 *
 * 余剰なら通常の対価だけで手放す。主力なら**割増の対価**（`playerUtils.transferFeeFor`）と
 * **本人の同意**が要る。**形（現金・トレード・レンタル・FA）でも、国内か海外かでも変わらない。**
 *
 * 以前はこの線が4通りに割れていました。
 *
 * | どこ | 何を「余剰」と呼んでいたか |
 * |---|---|
 * | 国内CPU間の移籍 | 序列・名簿の厚さ・干され（これが正） |
 * | 海外↔海外 | **見ていない**（上位10人から無条件に引き抜く） |
 * | 海外→日本 | **見ていない**（現有超のOVRなら誰でも） |
 * | 日本→海外 | 「層が厚いタイプの中位以下」という別の数え方 |
 *
 * その結果、海外がらみの移籍27件は**全部が出す側の1〜4番手**（＝主力）でした。
 *
 * ■**序列だけで言う**（2026-08-12・オーナー判断「序列15番手以降だけでいいよ」）
 *   以前はここに「名簿が21人より多ければ、下の序列はまとめて余剰」という条件が
 *   同居していました。ところが全232クラブが23〜25人なので**常に当たり**、
 *   `isSurplus` が恒真になっていた——つまり割増も本人同意も一度も発火していませんでした。
 *   「今季干されているか」も外しました（`seeksPlayingTime` の中で
 *   `hasNoPlayingTime` を先に見るので、そもそも序列に含まれる）。
 */
export function isSurplus(a: {
  /** 出す側のクラブでの序列（1が最上位） */
  squadRank: number
  /** 戦力に入る序列（既定 `SQUAD_DEPTH_SLOTS`＝14）。**区間数ではありません** */
  slots?: number
}): boolean {
  return hasNoPlayingTime(a.squadRank, a.slots)
}

/**
 * **残り契約年数 → 出す側が話に応じる割合。**（移籍の②「その選手は出せるか」の一部）
 * 添字が残り年数。0番と1番は使わない（残り1年以下は `willRelease` が先に true を返す）。
 *
 * 契約が長いほど渋る。**壁ではなく坂**にしてあるのが肝で、残り5年でも0ではありません。
 * オーナー判断（2026-08-14）。
 *
 * ■傾きは実測で決めました（`check-market-rate` の1年 ＋ 232クラブ・6年の churn）
 *
 *   | 坂 | 1クラブ1年の移籍 | 1年の散らばり | 翌年もまた動いた選手 |
 *   |---|---|---|---|
 *   | 無し | 5.3人 | 平ら | 67.7% |
 *   | **1 / 0.75 / 0.45 / 0.24 / 0.12** | **4.9人** | **平ら** | **64.4%** |
 *   | 1 / 0.6 / 0.3 / 0.15 / 0.07 | 4.3人 | **後半が細る**（点検が落ちる） | 61%台 |
 *
 *   目安は「1クラブが1年に5人」（オーナー・2026-08-12。`check-market-rate`）。
 *   これ以上急にすると量そのものより先に**年の後半の在庫が尽きて**落ちます。
 *
 *   契約年数ごとの移籍率は 21.3 / 21.2 / 11.8 / 3.6 / 1.0%（残り1〜5年）。
 *   **残り5年の選手はほぼ動きません**が、0ではありません。
 *
 * ■**これだけでは「1年でぽんぽん」は消えません**（67.7% → 64.4%）
 *   市場は1年に1,200件動かすのに、出せる選手（余剰かつ欲しがられる）は
 *   1,800人ほどしかいません。**足りないぶんは同じ人が何度も動く**ので、
 *   供給を絞っても「誰が動くか」が入れ替わるだけで回数は減りません。
 *   連続で動くのは 24〜28歳に集中（1,218人中 882人）——移ると2〜4年を結び、
 *   翌年には1〜3年に減ってまた坂を通れるためです。
 *   ここから先を減らすには**量の目安（5人／年）そのものを下げる**しかなく、
 *   それはオーナー判断です（`docs/BACKLOG.md` A-15）。
 */
export const RELEASE_CHANCE = [1, 1, 0.75, 0.45, 0.24, 0.12] as const

/**
 * 1年に市場が回る回数。`RELEASE_CHANCE`（1年ぶんの確率）を1回ぶんへ割り戻すのに使う。
 * 日程から出る数で、1部の16回（`engine/cpuOffseason` の `cpuMarketRounds`＝21日ごと
 * ＋ドラフト直前の1回）。**日程を増やしたらここも合わせること**——多少ずれても
 * 坂の向きは変わらないので、正確さより「16回前後」であることのほうが大事。
 */
const MARKET_ROUNDS_PER_YEAR = 16

/**
 * **契約が残っている選手を、出す側が手放す気になるか。**
 *
 * ■なぜ要るのか（オーナー指摘・2026-08-14「1年でぽんぽんチーム変えるのはなあ」）
 *   `runTransferMarket` は `yearsLeft` を**一度も見ていません**でした。効いていたのは
 *   移籍金の係数（残り1年1.1倍〜4年1.4倍）だけですが、**これに移籍を止める力はありません**。
 *   実測で、残り年数ごとの移籍率は 16.41 / 16.48 / 15.52 / 15.31%（1〜4年）。
 *   **残り4年を3.0倍にしても14.90%**にしかならず、関門ごとに数えても「金が足りない」で
 *   落ちる件数は**0件**でした（買う側の上限＝格の年間予算の20%が、移籍金よりずっと大きい）。
 *   つまり止めるなら、金ではなく年数そのものを判定に入れるしかありません。
 *
 * ■**壁（「残り2年を切るまで動けない」）にしないこと**
 *   壁にすると動けるのが残り1〜2年の選手だけになり、**移籍金の係数の 1.3・1.4 が
 *   誰にも当たらなくなります**（オーナーは係数を「残す」と決めている）。
 *   坂なら残り4年の選手も「たまに動く、そのかわり高い」になり、係数が初めて意味を持ちます。
 *
 * ■**引き直す単位は「市場が回った日」。ただし確率は1年ぶんから割り戻します**
 *   ここは2回作り直しています。どちらの素直な形も壊れました。
 *
 *   | 形 | 何が起きたか |
 *   |---|---|
 *   | 年に1回だけ引く | **年の後半が空っぽ**になる。その年に出せる人しか居ないので在庫が尽きる（1年16回で 77/77/…/46/5/0）。2026-08-12 に均した「年に一度の塊」が形を変えて戻ってきたのと同じ |
 *   | 回るたびに `RELEASE_CHANCE` で引く | **坂が消える。** 1年に16回引けるので、9%の選手でも 1-0.91¹⁶ ＝ 78% がどこかで通る。実測で残り3年 24.6% ＞ 残り2年 22.5% と逆転した |
 *
 *   なので `RELEASE_CHANCE` は**1年ぶんの確率**として書き、1回ぶんへ割り戻します
 *   （`1 - (1 - p)^(1/回数)`）。**年で見た割合は表のとおり**のまま、
 *   出せる日が1年へ散るので在庫も尽きません。
 *
 * ■**乱数を使わないこと**（`newContractYears` と同じ理由）
 *   選手ID・日・残り年数からの引き。点検のゴールデンが毎回変わらないようにするため。
 */
export function willRelease(p: Pick<Player, 'id' | 'contract'>, when: string): boolean {
  const yl = p.contract.yearsLeft
  if (yl <= 1) return true
  const yearly = RELEASE_CHANCE[Math.min(yl, RELEASE_CHANCE.length - 1)]
  const perRound = 1 - Math.pow(1 - yearly, 1 / MARKET_ROUNDS_PER_YEAR)
  return (strHash(`${p.id}-${when}-${yl}-release`) % 10000) / 10000 < perRound
}

export function seeksPlayingTime(a: {
  /** そのクラブでの序列（1が最上位） */
  squadRank: number
  age: number
  /** 今季の出走数とチームのレース数 */
  races: number
  teamRaces: number
  /** 前季の出走数とチームのレース数。分からなければ省略 */
  prevRaces?: number
  prevTeamRaces?: number
  /** 戦力に入る序列（既定 `SQUAD_DEPTH_SLOTS`＝14）。**区間数ではありません** */
  slots?: number
}): boolean {
  if (!hasNoPlayingTime(a.squadRank, a.slots)) return false
  if (a.age < SEEK_MIN_AGE) return false
  // ★まだ1戦も走っていない（＝分からない）を「出番が無い」と読まないこと。
  //   出場率は utils/playRate の playRateOf で数えるが、シーズン頭や日程が引けない
  //   クラブでは 0戦になる。それを0%として扱うと、**その時点で全員が「出番が無い」**に
  //   なり、他の部の主力まで市場へ出てくる（3部で遊ぶと1部の主力が流れてきていた）。
  if (a.teamRaces <= 0) return false
  const rate = a.races / a.teamRaces
  if (rate >= APPEARANCE_FLOOR) return false
  // 前季が分からない（加入1年目・古いセーブ）なら今季だけで判断する
  if (a.prevRaces == null || !a.prevTeamRaces) return true
  const prevRate = a.prevRaces / a.prevTeamRaces
  // 去年は走れていた＝スタメンを失った年。すぐ動く
  if (prevRate >= APPEARANCE_FLOOR) return true
  // もともと控え。伸びしろに賭けられる年齢のうちは残る
  return a.age >= SEEK_PATIENCE_AGE
}

/** 承諾ライン。これ以上で行く */
export const CONSENT_LINE = 0.5

/**
 * 無所属を「格いくつ」として数えるか。**格は1〜20なので、その外側**。
 * クラブが無い状態はどのクラブよりも下、という意味しか持たせていない。
 */
const FREE_AGENT_TIER = 21

/**
 * 1人の選手に同時に来る買い取り打診の上限。
 * 良い選手は複数クラブで取り合いになるのが普通なので、1件ずつ来る形はやめた。
 * 5件並べて本人に「どこへ行きたいか」を聞く（rankOffers）
 */
export const MAX_OFFERS_PER_PLAYER = 5

/**
 * リーグ → 憧れの地域。**この表が唯一の決まり。両方向ともここから引く。**
 *
 * ・満たしたか（`regionOfLeague`）… 移籍の同意で「憧れの地域か」を見る
 * ・声が掛かるか（`leaguesOfRegion`）… 海外挑戦に登録した選手へオファーが来る発生源
 *
 * 以前はこの2つが別の表だった。満たす側はここ、声が掛かる側は clubs.ts の
 * `ELITE_LEAGUES_BY_REGION`。**欧州北東へ移った選手は「憧れのヨーロッパへ行けた」と
 * 加点されるのに、海外挑戦に登録しても欧州北東からは一生オファーが来ない**状態だった。
 *
 * ★アメリカは北米だけ。中米・南米は別の地域なので、どちらにも属さない。
 *   以前ここだけ north_america / central_america / south_america を全部 'america' に
 *   潰していて、呼び名も DREAM_LABEL だけ「北米・南米」（チャット側は2か所とも「北米」）
 *   と3通りに割れていた。**呼び名は DREAM_LABEL 1本。**
 *
 * アジア・オセアニア・中米・南米・国内はどの地域にも属さない＝憧れの対象外
 * （海外なのに憧れの地域ではない＝減点になる）。
 */
const REGION_BY_LEAGUE: Readonly<Record<string, OverseasRegion>> = {
  africa_east: 'africa',
  africa_ns: 'africa',
  europe_ws: 'europe',
  europe_ne: 'europe',
  north_america: 'america',
}

/** リーグID → 憧れの地域。該当しないリーグ（アジア・オセアニア・国内）は undefined */
export function regionOfLeague(leagueId: string | undefined): OverseasRegion | undefined {
  return REGION_BY_LEAGUE[leagueId ?? '']
}

/** 憧れの地域 → そのリーグID一覧。海外挑戦のオファーがどこから来るか */
export function leaguesOfRegion(region: OverseasRegion): string[] {
  return Object.keys(REGION_BY_LEAGUE).filter(id => REGION_BY_LEAGUE[id] === region)
}

/** 行き先クラブの姿。呼び出し側は buildDestination で作る */
export type Destination = {
  clubId: string
  tier: ClubTier
  /** そのクラブに入ったとき、OVR順で何番手になるか（1が最上位） */
  squadRank: number
  /** そのクラブの在籍人数 */
  squadSize: number
  /** 今季ECLに出ているクラブか */
  inEcl: boolean
  /** 行き先の順位（1が首位）。分からなければ undefined */
  leagueRank?: number
  /** 行き先のリーグのチーム数 */
  leagueSize?: number
  /** 海外クラブか。国内移籍には「憧れの地域」が効かない */
  isForeign?: boolean
  /**
   * 行き先の地域。憧れの3区分（アフリカ／ヨーロッパ／北米南米）に当たるときだけ入る。
   * アジア・オセアニアは誰の憧れでもないので undefined＝「憧れではない海外」になる
   */
  region?: OverseasRegion
}

/** 今の状況 */
export type MoveContext = {
  /** 今の所属クラブの格。無所属(FA)は undefined */
  srcTier?: ClubTier
  /**
   * **今のクラブでの出場割合 0..1 と、今季の消化レース数。省略できません。**
   *
   * 引くのは `utils/playRate` の `playRateOf` 1本（裏の部と海外リーグまで見る唯一の入口）。
   * 分からないときはその関数が `{ fraction: 0.5, teamRaces: 0 }` を返すので、
   * **呼ぶ側で 0.5 / 0 を書かないこと。**
   *
   * ★ここが省略可だったころ、7つの呼び出し口のうち**移籍の唯一の経路を含む5つ**が
   *   渡しておらず、既定の 0 が入って下の
   *     starterNow = races >= 3 && frac >= 0.5
   *   が常に false になり、オーナー指示（2026-08-14「格下げてまでエースになりたい
   *   やついないだろ。海外でやってる久保がいきなりJ3に移籍するか？」）で入れた
   *   関門 `tooFarDown` が**世界中で一度も発火していませんでした**。
   *   実測（232クラブ5800人・1年）：格下へ動いた561件のうち131件（23.4%）が本来は止まる。
   *   必須にしてあるのは、同じことがもう一度起きないようにするためです。**戻さないこと。**
   */
  playFraction: number
  teamRaces: number
  /**
   * **選手の格**（`utils/playerTier` の `playerTierOf`）。クラブの格と同じ1〜20。
   * **省略できません**——落ちていい幅（選手の格 + TIER_FALL_LIMIT）の関門がこれを見ます。
   *
   * ★線（各格の走れる7人）は世界全体から引くので、**市場を回すたびに1回だけ
   *   `tierLines` を組んで、そこから引いた値を渡すこと**（選手ごとに引き直さない）。
   */
  playerTier: ClubTier
  /** 交渉ボーナス（スカウト施設・年俸の上積みなど） */
  bonus?: number
  /**
   * クラブ間で移籍金が合意済みの公認移籍。
   * 売る判断はクラブが済ませているので「主力だから残りたい」の減点は働かない
   */
  clubBlessed?: boolean
  /**
   * **監督について行く話**（退任するときに1人だけ声をかける）。
   *
   * オーナー判断（2026-08-13）「移籍と同じでいいよ。愛着がチームから監督に移るだけで」。
   * 見るものは移籍とまったく同じで、**愛着の向き先だけが変わる**。
   *   ふつうの移籍 … 愛着はいまのクラブへ向く → 出て行きにくい（-0.15）
   *   監督について行く … 愛着は監督へ向く   → ついて行きやすい（+0.15）
   *
   * ★格上・格下で効き方を変えないこと。ふつうの移籍で愛着を「同格・格下のときだけ」に
   *   しているのは「格上の話を愛着で蹴らせない」ためで、こちらは逆に働くので蹴らない。
   */
  followGm?: boolean
  /**
   * **1年のレンタル**。移籍ではないので、較べる相手が違う。
   *
   * 保有元は変わらず、期限が来れば戻る。だから「格下のクラブへ行くのは嫌だ」は
   * ここでは効かない——選ぶのは「**このまま控えでいるか、1年よそで走るか**」で、
   * クラブを乗り換えるかどうかではない。
   *
   * 実測（国内51クラブ・オフ1回）：レンタル26件は**全部が格下へ**で、
   * 借り手での序列は中央値6番手（最下位でも7番手＝全員走れる）。それでも
   * 24件が「格下へ行きたくない」で断っていた。**走らせてもらえるのに断る**という
   * 筋の通らない判定だったので、格下の減点だけを外す（出番の項はそのまま効く）。
   */
  loan?: boolean
}

/**
 * ============================================================================
 * **移籍の理由の文字は、この2つの表だけ。** 他所に書かないこと。
 * ============================================================================
 *
 * ■なぜ1本にするのか（実際に起きていたこと）
 *   同じ `lead` に対する断り文句が**3つの表**に分かれていて、文字が割れていました。
 *
 *     transferDecision の REASON_NO  … 「◯◯は「23番手では出番がない」と考えている」
 *     transferDecision の SHORT_NO   … 「23番手で出番がない」
 *     chatLines の gmInviteNoLine    … 「出場機会が見込めない」
 *
 *   決まりは**「出場機会がない」に統一**（オーナー・2026-08-14「19番手かどうかって
 *   わからんくね？」）だったのに、直したのは3つ目だけでした。残る2つがチャットの
 *   代理人のセリフ・通知・入札シートに出ていて、**番手が画面に出続けていました**
 *   （オーナー・2026-08-21「何番手ってもう無くしたはずだよね？」）。
 *   同じファイルの中でも割れていて、REASON_YES だけは同じ `no_playing_time` を
 *   「出場機会が見込めない」と書いていました。
 *
 * ■決まり
 *   ★**序列（何番手か）を文面に入れないこと。** 本人にも代理人にも分からない数字で、
 *     セリフにすると嘘になる。物差しとしての序列（`squadRankOf`）は今までどおり使う。
 *   ★**長い形・短い形を作らないこと。** 選手名を足すかどうかは呼ぶ側の文の作り方で、
 *     理由の文字は1つ（「◯◯とのことです」「◯◯クラブ 1.2億 ◯◯」のどちらにも入る）。
 *   ★`Record<MoveReason, string>` なので、**理由を足したら埋めないと型で落ちます。**
 */
export type MoveReason =
  | Appraisal['lead']
  /** 主力として起用されている（`playerConsentToMove` の別軸。lead には出ない） */
  | 'key_player'
  /** 移籍金が用意できない（`appraiseGmInvite`。本人の意思ではない） */
  | 'fee'

/** 断るときの理由。`belowTier` は「行き先の格が選手の格より下か」 */
export function moveDeclineText(lead: MoveReason, o: { dream: string; belowTier?: boolean }): string {
  const T: Record<MoveReason, string> = {
    out_of_band: o.belowTier ? 'このクラブで走れる力にまだ届いていない' : '格の離れたクラブへ移る段階にない',
    no_playing_time: '出場機会が見込めない',
    wrong_region: `挑戦したいのは${o.dream}で、この地域ではない`,
    tier_down: '格下への移籍に前向きでない',
    loyalty: '今のチームへの愛着が強い',
    key_player: '主力として起用されており、移籍を望んでいない',
    fee: '移籍金が用意できない',
    dream: '乗り気ではない',
    playing_time: '乗り気ではない',
    capped: '乗り気ではない',
    ecl: '乗り気ではない',
    title: '乗り気ではない',
    tier_up: '乗り気ではない',
    even: '乗り気ではない',
  }
  return T[lead]
}

/** 行くときの理由 */
export function moveAcceptText(lead: MoveReason, o: { dream: string }): string {
  const T: Record<MoveReason, string> = {
    dream: `憧れの${o.dream}で走りたい`,
    wrong_region: '行きたい地域ではない',
    tier_up: '格上のクラブで挑戦したい',
    playing_time: '出場機会が見込める',
    no_playing_time: '出場機会が見込めない',
    tier_down: '格下だが受け入れる',
    loyalty: '今のチームに愛着がある',
    capped: 'このクラブではもう伸びしろがない',
    ecl: 'ECLで走りたい',
    title: '優勝を争えるクラブで走りたい',
    out_of_band: '条件は悪くない',
    even: '条件は悪くない',
    key_player: '条件は悪くない',
    fee: '条件は悪くない',
  }
  return T[lead]
}

/** 判定の内訳。画面と会話でそのまま使う */
export type Appraisal = {
  score: number
  ok: boolean
  /** 一番効いた要素。断った理由・選んだ理由の文言はこれで決める */
  lead: 'tier_up' | 'tier_down' | 'playing_time' | 'no_playing_time' | 'title' | 'ecl' | 'dream' | 'wrong_region' | 'capped' | 'loyalty' | 'even' | 'out_of_band'
  /**
   * その理由の文字。**`moveDeclineText` / `moveAcceptText` 1本から出る**ので、
   * 会話・通知・入札シートで同じ字になる（長い形・短い形の2本立ては廃止）。
   */
  reason: string
  parts: {
    tier: number
    playingTime: number
    benched: number
    title: number
    ecl: number
    dreamFit: number
    capped: number
    personality: number
    morale: number
    bonus: number
  }
}

/** そのクラブに入ったときの序列と姿を作る */
export function buildDestination(
  clubId: string,
  tier: ClubTier,
  players: readonly Player[],
  opts?: { inEcl?: boolean; leagueRank?: number; leagueSize?: number; isForeign?: boolean; region?: OverseasRegion; player?: Player },
): Destination {
  // クラブの名簿は索引から引く（1人見るたびに全選手を走査しない・utils/rosterSync）
  const roster = clubIndexOf(players).get(clubId) ?? []
  const squadSize = roster.length
  // 何番手になるかの数え方は squadNeeds の squadRankOf 1本（FAを取るかの判断と同じ物差し）
  const squadRank = opts?.player ? squadRankOf(roster, opts.player) : Math.ceil(squadSize / 2)
  return {
    clubId, tier, squadRank, squadSize,
    inEcl: !!opts?.inEcl,
    leagueRank: opts?.leagueRank,
    leagueSize: opts?.leagueSize,
    isForeign: opts?.isForeign,
    region: opts?.region,
  }
}

/**
 * 「そこで出られるか」の点数。
 * 走れるのは7区間なので、7番手までに入るなら主力、そこから離れるほど出番が無い。
 * 4大リーグから声が掛かっても20番手なら行かない、が成立する。
 */
function playingTimeScore(d: Destination): number {
  if (d.squadRank <= 3) return 0.22           // エース格
  if (d.squadRank <= RUNNING_SLOTS) return 0.14
  if (d.squadRank <= RUNNING_SLOTS + 3) return 0    // 当落線上
  if (d.squadRank <= RUNNING_SLOTS + 8) return -0.16
  return -0.28                                 // 何年も出番が無い
}

/**
 * その選手がその移籍をどう見るか。**移籍の可否を出すところは必ずここを通すこと。**
 */
export function appraiseMove(p: Player, d: Destination, ctx: MoveContext): Appraisal {
  const declining = isDeclining(p.growthCurve ?? 'normal', p.age)

  // ★**無所属（FA）は、比べる相手が「クラブが無い」状態**。
  //   この関数は「いまの居場所」と「行き先」を較べるものなので、居場所が無い選手に
  //   そのまま当てると基準がずれる。無所属の「いま」は出番ゼロ・収入ゼロなので、
  //   **どのクラブもそれより上**。だから
  //     ・格差 … 無所属は格外（どのクラブよりも下）として数える＝どこへ行っても格上
  //     ・出番 … 少なくても**減点にしない**（0が下限）。ゼロと較べているので下がりようがない
  //   良し悪しの差は加点の側に残るので、複数の話があるときに rankOffers が
  //   一番良いところを選ぶ、という形はそのまま働く。
  //
  //   これを入れる前は、FAの成立52件のうち43件が「20番手では出番がない」で断られていた。
  //   その44件は「頭数の確保」の枠（在籍23人→24人）で、**無職より控えの方がまし**という
  //   当たり前が判定に入っていなかった（`docs/AUDIT_TRANSFERS.md` 2-1）。
  const freeAgent = !p.teamId

  // 1. 格差。行き先が格上なら基本は行く（0.65〜0.90）。同格0.50。格下は落ちる
  const gap = (freeAgent ? FREE_AGENT_TIER : ctx.srcTier ?? d.tier) - d.tier
  let tier = gap > 0
    ? 0.65 + Math.min(0.25, gap * 0.03)
    : gap === 0 ? 0.50 : 0.50 + gap * 0.04
  // ピークを過ぎた選手は格へのこだわりが薄れる（残りのキャリアで走れる場所を選ぶ）
  if (declining) tier = 0.5 + (tier - 0.5) * 0.6
  // レンタルは保有元が変わらず期限が来れば戻るので、**格下への減点は効かない**（上の loan）。
  // 格上へ借りられるなら加点はそのまま乗る
  if (ctx.loan) tier = Math.max(0.50, tier)

  // 2. 行き先で出られるか（無所属は減点しない。上の★）
  const playingTime = freeAgent ? Math.max(0, playingTimeScore(d)) : playingTimeScore(d)

  // 3. 今のクラブで干されているか。
  //    ★行き先でも出られないなら効かない。「出たいから動く」のであって、
  //      別のベンチへ移りたいわけではない（格上でも20番手なら行かない、が保たれる）
  const races = ctx.teamRaces
  const frac = ctx.playFraction
  const benched = races >= 3 && frac < 0.4 && playingTime > 0 ? 0.2 : 0

  // 4. 優勝争いをしているクラブか
  const title = d.leagueRank != null && d.leagueRank <= 3 ? 0.08 : 0

  // 5. ECLに出ているクラブか
  const ecl = d.inEcl ? 0.1 : 0

  // 6. 憧れの地域か。海外へ出るときだけ効く。
  //    「OVR90でヨーロッパに行きたいのにアジアへ移籍する」を止める。
  //    憧れの地域なら後押し、別の地域の海外クラブなら渋る。国内移籍には効かない
  //    アジア・オセアニアは誰の憧れでもないので、海外なのに憧れの地域でない＝減点になる。
  //    「OVR90でヨーロッパに行きたいのにアジアへ移籍」がこれで止まる。
  //    減点は-0.22から-0.12へ。-0.22だと「格上(+0.90)＋控え(-0.16)＋地域違い(-0.22)」が
  //    0.47で同意ラインを割り、3部の選手が格上の海外を断っていた
  const dream = dreamRegionOf(p.specialty)
  const dreamFit = !d.isForeign ? 0 : d.region === dream ? 0.12 : -0.12

  // 今のクラブの成長上限に達していて、行き先の上限が高い＝ここではもう伸びない
  const capped = ctx.srcTier != null && !declining
    && ovr(p) >= TIER_POTENTIAL_CAP[ctx.srcTier] - 1
    && TIER_POTENTIAL_CAP[d.tier] > TIER_POTENTIAL_CAP[ctx.srcTier]
    ? 0.15 : 0

  // 性格は「同格・格下のとき」だけ効く。格上の話を愛着で蹴らせない。
  // ★無所属（srcTier が無い）には効かない。愛着は「今のクラブへの」愛着で、
  //   FAには対象になるクラブが無い。ここを効かせていたので、無所属の選手が
  //   愛着を理由に加入を断るという意味の通らない判定になっていた
  const personality = ctx.followGm
    // 監督について行く話。愛着の向き先が監督なので、そのまま加点になる
    ? ((p.personality ?? 'salary') === 'loyalty' ? 0.15
      : (p.personality ?? 'salary') === 'winning' ? 0.05 : 0)
    : gap > 0 || ctx.srcTier == null ? 0
    : (p.personality ?? 'salary') === 'loyalty' ? -0.15
    : (p.personality ?? 'salary') === 'winning' ? 0.05
    : 0

  const morale = (p.morale ?? MORALE_DEFAULT) < 40 ? 0.1 : (p.morale ?? MORALE_DEFAULT) >= 75 ? -0.05 : 0
  const bonus = ctx.bonus ?? 0

  // ★★**移籍で落ちていい格の幅は「選手の格 + TIER_FALL_LIMIT」まで**（`utils/playerTier` 1本）。
  //   選手の格はクラブの格とまったく同じ1〜20の目盛りで、世界中の在籍枠と選手を
  //   順位で突き合わせて出す。**上へは制限を置きません**——買う側の `needsPlayer` が
  //   「そのクラブで14番手以内に入れるか」を見ているので、際限なく上へは行けません。
  //
  //   ここは点数の綱引きではなく関門です。格上の加点(+0.65〜0.90)も、行き先で
  //   エースになれる加点(+0.22)も、格差の減点(1段 -0.04)を軽く押し切ってしまうため。
  //
  //   ★**この1本が、以前あった蓋3枚を置き換えています。戻さないこと。**
  //       `unproven`                  … 1戦も走っていない選手は格上へ行かない
  //       `tooFarDown`                … 走れている選手は2段以上下へ行かない
  //       `cpuMarket` の格差フィルタ    … 2段以上格下のクラブは主力に打診しない
  //     どれも「どこまで動いていいか」を誰も決めていない状態への後付けで、
  //     物差しが3つとも違っていました（出場率／出場率／序列）。
  //
  //   ★**レンタルには当てません**（`loan`）。保有元は変わらないので、
  //     若手が格下のクラブへ1年出て走るのは、格のズレを埋める話ではない。
  //   ★**監督について行く話にも当てません**（`followGm`）。これは市場が選手を動かす話
  //     ではなく、**人について行く**話で、決めるのは本人の愛着です。当てると
  //     「格1の選手が、監督の移った格8のクラブへは行けない」となり、
  //     **1人だけ連れて行くという遊びが丸ごと成立しなくなります**（実測：12人全員が断る）。
  //     ★オーナーに確認すること（2026-08-20 の時点では私の判断で外してあります）。
  //   ★**無所属にも当てます。** 17クラブが欲しがるOVR83のFAが3部へ即加入する、
  //     という以前の形はこれで止まります。
  const outOfBand = !ctx.loan && !ctx.followGm && !inTierBand(ctx.playerTier, d.tier)

  const score = tier + playingTime + benched + title + ecl + dreamFit + capped + personality + morale + bonus
  const ok = score >= CONSENT_LINE && !outOfBand
  const parts = { tier, playingTime, benched, title, ecl, dreamFit, capped, personality, morale, bonus }
  // 見出しにする理由は「一番効いた要素」。行くときは一番の後押し、断るときは一番の足かせ。
  //
  // ★決め打ちの順番で選ばないこと。
  //   以前は ok のとき dreamFit を最初に見ていたので、格上(+0.40)に惹かれて行く選手でも
  //   憧れ(+0.12)が付いていれば必ず「憧れの◯◯で走りたい」になっていた。
  //   行き先で23番手（出番 -0.28）でも見出しは憧れのままなので、
  //   「出番がないのに憧れだから行きたい」という筋の通らない話に見える。
  //
  // 格(tier)だけは0.50が「同格＝素の状態」なので、そこからの差で他と比べる。
  // 生の値で比べると、同格の0.50が常に最大になって全部「格」の話になってしまう。
  const weights: { lead: Appraisal['lead']; v: number }[] = [
    { lead: gap > 0 ? 'tier_up' : gap < 0 ? 'tier_down' : 'even', v: tier - 0.50 },
    { lead: playingTime > 0 ? 'playing_time' : 'no_playing_time', v: playingTime },
    { lead: 'playing_time', v: benched },
    { lead: 'title', v: title },
    { lead: 'ecl', v: ecl },
    { lead: dreamFit >= 0 ? 'dream' : 'wrong_region', v: dreamFit },
    { lead: 'capped', v: capped },
    { lead: personality < 0 ? 'loyalty' : 'even', v: personality },
  ]
  const best = weights.reduce((a, b) => (ok ? b.v > a.v : b.v < a.v) ? b : a)
  // どれも効いていない（横並び）なら「条件は悪くない」で締める。
  // 関門で止めたときは、その理由をそのまま見出しにする（点数の内訳から選ばない）
  const lead: Appraisal['lead'] = outOfBand ? 'out_of_band'
    : (ok ? best.v <= 0 : best.v >= 0) ? 'even' : best.lead

  // 理由の文字は moveDeclineText / moveAcceptText 1本（この関数の外・上の表）。
  // ★ここに表を書き戻さないこと。3つに割れて番手が画面に出ていたのがそれ。
  const dreamLabel = DREAM_LABEL[dreamRegionOf(p.specialty)]
  const reason = ok ? moveAcceptText(lead, { dream: dreamLabel })
    : moveDeclineText(lead, { dream: dreamLabel, belowTier: d.tier < ctx.playerTier })

  return { score, ok, lead, reason, parts }
}

/**
 * 複数クラブから同時に話が来たときの、本人の希望順。
 * 点数の高い順に並べ、承諾ラインに届いているものだけが「行ってもいい」先。
 */
export function rankOffers(
  p: Player, dests: readonly Destination[], ctx: MoveContext,
): { dest: Destination; appraisal: Appraisal }[] {
  return dests
    .map(dest => ({ dest, appraisal: appraiseMove(p, dest, ctx) }))
    .sort((a, b) => b.appraisal.score - a.appraisal.score)
}
