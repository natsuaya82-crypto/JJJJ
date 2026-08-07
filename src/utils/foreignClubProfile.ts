import type { ForeignClub, Player } from '../types'
import { ovr } from './playerUtils'
import { FOREIGN_CLUB_CITY } from '../data/foreignClubCities'
import { foreignClubGmName } from '../engine/playerGenerator'

// ============================================================================
// 海外クラブを国内チームと同じ作りにするための「クラブ情報」。
//
// 本拠地・創設年・監督名・予算・施設は、どれもクラブIDから毎回同じ値が出る
// 計算で求める。セーブには持たせない。
//   ・180クラブぶんを保存すると毎回セーブが重くなる
//   ・古いセーブに項目が無いので、後から足す処理（移行）が要る
//   ・乱数で作ると画面を開くたびに監督や創設年が変わってしまう
// 本拠地だけはクラブ名から復元できない（名前を手で直してあり、shortNameは
// 5文字で切られている）ので、data/foreignClubCities.ts の表から引く。
// ============================================================================

// クラブIDを数値にする（FNV-1a）。同じIDなら必ず同じ数になる。
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

// 本拠地（都市名）。表に無ければ略称で代用する。
export function foreignClubCity(club: Pick<ForeignClub, 'id' | 'shortName'>): string {
  return FOREIGN_CLUB_CITY[club.id] ?? club.shortName
}

// 創設年。1921〜2000年のあいだでクラブごとに固定。
export function foreignClubFounded(club: Pick<ForeignClub, 'id'>): number {
  return 1921 + (hashId(club.id) % 80)
}

// 監督名。クラブの国の名前プールから固定で1つ選ぶ（engine/playerGenerator.ts）。
export function foreignClubGm(club: Pick<ForeignClub, 'id' | 'country'>): string {
  return foreignClubGmName(club.id, club.country as string)
}

// リーグごとの予算の基準額。
// ※ ここには海外クラブ専用の「年間予算」と「施設レベル」があったが消した。
//
//   年間予算  … リーグ別の基準額 × 前季順位 × クラブIDのハッシュ、という別の式だった。
//               予算は格1本（utils/clubTier の tierBudget）と決めてあるのに、
//               **海外クラブが選手を買うときの資金がこの古い式から出ていた**
//               （engine/foreignTransfers）。格を上げても買えるようにならず、
//               画面に出ていた「年間予算 9.9億」も格と食い違う別の数字だった。
//   施設レベル … クラブIDのハッシュから作った飾り。保存も成長もせず、何にも効いていなかった。
//               施設は utils/facilities の1本（国内CPUも海外も同じ決まり）。

// ── そのリーグが受け入れる選手の水準 ────────────────────────
//
// ■なぜ要るのか
//   海外クラブからの買い取り打診で、行き先のクラブを**全180クラブから機械的に1つ**選んでいた。
//   そのため3部（格20）のOVR70の選手に、格1のマドリードから打診が来ていた。
//   海外クラブ同士の移籍（engine/foreignTransfers）には元からこの下限があったのに、
//   打診の生成側がそれを見ていなかった。**同じ物差しをここ1本から出す。**

/** リーグ（国）ごとのOVR下限。これ未満の選手はそのリーグから声が掛からない */
const FOREIGN_LEAGUE_MIN_OVR: Record<string, number> = {
  ETH: 85, KEN: 85, UGA: 85, TAN: 85,   // アフリカ
  USA: 80,                               // 米国
  KOR: 70, CHN: 70, TWN: 70,             // アジア
}
export function foreignMinOvr(country: string | undefined): number {
  return FOREIGN_LEAGUE_MIN_OVR[country ?? ''] ?? 75   // その他
}

/**
 * 年齢を加味した実効OVR。**「歳を考えるといくら相当か」はここ1本。**
 *
 * 33歳から1歳ごとに3下げる。35歳のOVR85は実効79相当＝格上のリーグからは声が掛からない。
 * 「高齢の高OVRは翌年急落するので、移籍金を払ってまで獲らない」を表す。
 *
 * ★同じ式が3か所に手書きされていて、しかも**基準の年齢が2通り**あった
 *   （海外移籍は33歳から、FA補強と打診の生成は32歳から）。同じ選手が
 *   経路によって別の評価になるので、ここへ寄せて33に揃えた。
 *   下げ始める年齢と1歳あたりの幅はバランスの数字なので、変えるならこの2つだけ。
 */
export function effectiveOvr(p: Player): number {
  return ovr(p) - Math.max(0, (p.age - 33) * 3)
}
