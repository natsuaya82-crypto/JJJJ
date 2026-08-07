import type { Facilities, FacilityKey } from '../types'
import { tierOf, type ClubTier, type TieredTeam } from './clubTier'

// 施設の唯一の決まり。**レベルも維持費もここ1本。**
//
// ■なぜ作ったのか（実際にあった3通り）
//   自チーム   … Team.facilities（自分で建てる。保存され、効果もある）
//   国内CPU   … utils/domesticClubs の initialFacilityLevel（初期順位で1〜4の決め打ち）
//   海外クラブ … utils/foreignClubProfile の foreignClubFacilities
//                **クラブIDのハッシュから作った飾り**。保存も成長もせず、何にも効いていない。
//                画面には Lv4/Lv3 と出るのに、中身は無かった。
//   同じ「そのクラブの施設はどれくらいか」に答えが3つあり、しかも2つは嘘だった。
//
// ■いまの決まり
//   自チーム以外（国内CPU・海外）の施設レベルは**格から決まる**。
//   格1が最上（Lv5）、格20が最下（Lv1）。予算も成長上限もスポンサーも格から降りてくるので、
//   施設だけ別の物差しにする理由がない。自チームだけは自分で建てる（そこが遊びなので）。
//
// ■読むときの決まり
//   クラブの施設を見るときは必ず `facilitiesOf` を通すこと。
//   `team.facilities` を直接読むと、持っていないクラブ（海外・古いセーブ）で 0 になる。

export const FACILITY_KEYS: FacilityKey[] = ['trainingCamp', 'medicalCenter', 'scoutOffice', 'tacticsRoom']

export const FACILITY_LABEL: Record<FacilityKey, string> = {
  trainingCamp: '合宿',
  medicalCenter: '医療',
  scoutOffice: 'スカウト',
  tacticsRoom: '戦術',
}

/** 施設のレベルの上限 */
export const FACILITY_MAX_LEVEL = 5

/**
 * 格からその年の施設レベルを出す（自チーム以外）。格1→Lv5、格20→Lv1。
 * 20段の格を5段のレベルへ落とすので、格4つぶんで1レベル動く。
 */
export function tierFacilityLevel(tier: ClubTier): number {
  return Math.max(1, Math.min(FACILITY_MAX_LEVEL, FACILITY_MAX_LEVEL - Math.floor((tier - 1) / 4)))
}

/**
 * そのクラブの施設。**読むときはここを通す。**
 * 自分で建てたものがあればそれを、無ければ格から出す（国内CPU・海外クラブ）。
 */
export function facilitiesOf(club: (TieredTeam & { facilities?: Facilities }) | undefined): Facilities {
  const own = club?.facilities
  if (own && FACILITY_KEYS.some(k => (own[k] ?? 0) > 0)) return own
  const lv = tierFacilityLevel(tierOf(club))
  return { trainingCamp: lv, medicalCenter: lv, scoutOffice: lv, tacticsRoom: lv }
}

/**
 * 施設1つ・レベル1つあたりの1年の維持費。**額はここ1本。**
 * レベルを上げるほど毎年出ていくので、格の低いクラブは高い施設を維持できない。
 *
 * 実測（scripts/measure-club-cash.ts の 232クラブ）。維持費が無いと年俸が年間予算の
 * 54%しか使われず、全クラブが毎年「年間予算の4割」を貯め込んでいた（半年で移籍金の上限に届く）。
 *
 *   単価/Lv   Lv5の年額   1年の余り(中央)  赤字クラブ  移籍上限まで(中央)
 *   0.00億      0億          0.42            0/232        0.5年   ← 維持費なし
 *   0.10億      2億          0.32            0/232        0.6年
 *   0.20億      4億          0.21            0/232        0.9年
 *   0.25億      5億          0.16            0/232        1.2年   ← いまここ
 *   0.30億      6億          0.11            5/232        1.8年
 *   0.40億      8億          0.01          103/232       23.7年   ← 効きすぎ
 *
 * 数字を変えるときはここだけ。変えたら上の表を測り直すこと。
 */
export const FACILITY_UPKEEP_PER_LEVEL = 25_000_000

/** そのクラブが1年に払う施設の維持費（4施設ぶんの合計） */
export function facilityUpkeepOf(club: (TieredTeam & { facilities?: Facilities }) | undefined): number {
  const f = facilitiesOf(club)
  return FACILITY_KEYS.reduce((s, k) => s + (f[k] ?? 0) * FACILITY_UPKEEP_PER_LEVEL, 0)
}
