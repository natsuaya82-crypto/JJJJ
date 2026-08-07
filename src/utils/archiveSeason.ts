import type { Season, ArchivedSeason } from '../types'
import { packForeignApps } from './playerUtils'

// ============================================================================
// 過去シーズン（pastSeasons）の保存形を決める唯一の場所。
//
// ■方針：許可リスト（残す物だけを書き出す）
//   以前は Season を丸ごと積んでから要らない項目を1つずつ空にしていたため、Season に項目を足す
//   たびに過去シーズンが自動で太っていった。ここを反転させてあるので、下に書いた項目以外は
//   過去シーズンには一切保存されない。
//
// ■残す項目を増やしたい / 減らしたいとき
//   types の ArchivedSeason と、この2つの関数の返り値。この3箇所を必ず揃えること。
//   （減らす場合、その項目を読んでいる箇所は全部コンパイルエラーになるので先に潰す）
//
// ■落としている物（いずれも過去シーズンから読む箇所がゼロ）
//   記録会の全結果 / ニュース / チャット / 交渉・オファー・通知の類 / 育成・スカウト・練習の設定 /
//   財務（初期予算・グラント・内訳・収入・移籍金）/ 目標 / ECL最終結果（eclHistory と重複）
// ============================================================================

// シーズン終了時に呼ぶ変換。新しく積む過去シーズンは必ずここを通る。
export function archiveSeason(
  season: Season,
  parts: {
    foreignAppsC: ArchivedSeason['foreignAppsC']
    foreignStandings: ArchivedSeason['foreignStandings']
    zeroAppearances: ArchivedSeason['zeroAppearances']
  },
): ArchivedSeason {
  return {
    year: season.year,
    races: season.races,
    // 裏の部と海外も同じだけ残す。大会で残す／捨てるを分けない（utils/raceRecord.ts）
    divisionRaces: season.divisionRaces,
    foreignRaces: season.foreignRaces,
    waRaces: season.waRaces,
    collegeRaces: season.collegeRaces,
    standings: season.standings,
    secondTeamRaces: season.secondTeamRaces,
    secondTeamStandings: season.secondTeamStandings,
    // 海外リーグの出場記録は圧縮版（foreignAppsC）だけ持つ。旧形式の foreignAppearances は
    // わざと書かない（読む側は foreignAppsOf() が旧形式と圧縮版の両方に対応している）
    foreignAppsC: parts.foreignAppsC,
    foreignStandings: parts.foreignStandings,
    foreignRaceIndex: season.foreignRaceIndex,
    zeroAppearances: parts.zeroAppearances,
    eclRace: season.eclRace,
    eclSeries: season.eclSeries,
  }
}

// 既存セーブの移行用。すでに保存されている過去シーズン1年ぶんを、上と同じ形まで削り落とす。
// migrate から呼ぶので、入力は「型が付いていない生データ」であることに注意（欠損・型違いに耐えること）。
export function toArchivedShape(raw: Record<string, unknown>): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return raw
  // 海外リーグの出場記録：旧形式（foreignAppearances）が残っていれば圧縮版に詰め替える。
  // すでに foreignAppsC を持っている年はそのまま使う（二重変換しない）
  let appsC = raw.foreignAppsC
  if (appsC == null && raw.foreignAppearances && typeof raw.foreignAppearances === 'object') {
    appsC = packForeignApps(raw.foreignAppearances as Parameters<typeof packForeignApps>[0])
  }
  // 海外リーグ順位表：過去ぶんは合計ポイントしか読まないので1戦ごとの結果を落とす
  // （新しいセーブでは保存時に落としてある。ごく古いセーブのための保険）
  let fStand = raw.foreignStandings
  if (fStand && typeof fStand === 'object') {
    fStand = Object.fromEntries(
      Object.entries(fStand as Record<string, unknown>).map(([lid, st]) => [
        lid,
        Array.isArray(st)
          ? (st as Record<string, unknown>[]).map(x => ({ clubId: x.clubId, totalPoints: x.totalPoints, raceResults: [] }))
          : st,
      ]),
    )
  }
  return {
    year: raw.year,
    races: raw.races,
    divisionRaces: raw.divisionRaces,
    foreignRaces: raw.foreignRaces,
    waRaces: raw.waRaces,
    collegeRaces: raw.collegeRaces,
    standings: raw.standings,
    secondTeamRaces: raw.secondTeamRaces,
    secondTeamStandings: raw.secondTeamStandings,
    foreignAppsC: appsC,
    foreignStandings: fStand,
    foreignRaceIndex: raw.foreignRaceIndex,
    zeroAppearances: raw.zeroAppearances,
    eclRace: raw.eclRace,
    eclSeries: raw.eclSeries,
  }
}
