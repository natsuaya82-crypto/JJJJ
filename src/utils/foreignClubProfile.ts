import type { Facilities, ForeignClub, Player } from '../types'
import { ovr } from './playerUtils'
import { FOREIGN_CLUB_CITY } from '../data/foreignClubCities'
import { foreignClubGmName } from '../engine/playerGenerator'
import { isEliteLeague } from './clubs'

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
// 国内(JPEL)の1位が5.2億なので、海外はどのリーグもそれ以上。
// 4大リーグ（北米・東アフリカ・アフリカ北南・欧州西南）が一番大きい。
// ここを1本の表にしておかないと、順位別の表（data/economy.ts の RANK_BUDGET）を
// そのまま流用することになり、9リーグぶん＝10クラブが「1位の金額」を持ってしまう。
export const FOREIGN_LEAGUE_BUDGET_BASE: Record<string, number> = {
  north_america: 1_150_000_000,
  africa_east: 1_150_000_000,
  europe_ws: 1_100_000_000,
  africa_ns: 1_050_000_000,
  europe_ne: 900_000_000,
  asia_league: 880_000_000,
  south_america: 850_000_000,
  oceania: 850_000_000,
  central_america: 800_000_000,
}
const FOREIGN_BUDGET_DEFAULT = 850_000_000

// 前季順位ぶんの増減。1位で+15%、最下位で-12%（国内の1位/最下位の開きと同じくらい）。
// 順位が分からないとき（rank<=0）は基準額のまま。
function rankFactor(rank: number, clubCount: number): number {
  if (rank <= 0 || clubCount <= 1) return 1
  const t = (rank - 1) / (clubCount - 1)   // 1位=0 〜 最下位=1
  return 1.15 - t * 0.27
}

// クラブの年間予算。
export function foreignClubBudget(
  club: Pick<ForeignClub, 'id' | 'leagueId'>,
  rank = 0,
  clubCount = 20,
): number {
  const base = FOREIGN_LEAGUE_BUDGET_BASE[club.leagueId] ?? FOREIGN_BUDGET_DEFAULT
  // クラブごとの色づけ（±4%）。同じリーグの全クラブが同じ額にならないように
  const jitter = 0.96 + ((hashId(club.id) % 9) / 100)
  return Math.round((base * rankFactor(rank, clubCount) * jitter) / 1_000_000) * 1_000_000
}

// 施設のレベル（各Lv1〜5）。強いリーグほど高く、同じリーグの中でも差が出る。
// 国内は初期が順位連動で1〜4なので、海外は2〜5にして「格上」を表す。

export function foreignClubFacilities(club: Pick<ForeignClub, 'id' | 'leagueId'>): Facilities {
  const h = hashId(club.id)
  const base = isEliteLeague(club.leagueId) ? 3 : 2
  const lv = (shift: number) => Math.min(5, base + ((h >>> shift) % 3))
  return {
    trainingCamp: lv(3),
    medicalCenter: lv(9),
    scoutOffice: lv(15),
    tacticsRoom: lv(21),
  }
}

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
 * 年齢を加味した実効OVR。33歳から1歳ごとに3下げる。
 * 35歳のOVR85は実効79相当＝格上のリーグからは声が掛からない。
 * 「高齢の高OVRは翌年急落するので、移籍金を払ってまで獲らない」を表す。
 */
export function effectiveOvr(p: Player): number {
  return ovr(p) - Math.max(0, (p.age - 33) * 3)
}
