import type { Season, ArchivedSeason } from '../types'

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
    /** 保存する形に整えたリーグ（海外リーグの順位表は1戦ごとの結果を落としてある） */
    leagues: ArchivedSeason['leagues']
    zeroAppearances: ArchivedSeason['zeroAppearances']
  },
): ArchivedSeason {
  return {
    year: season.year,
    // 国内の部も海外リーグも同じだけ残す。大会で残す／捨てるを分けない（utils/raceRecord.ts）
    leagues: parts.leagues,
    waRaces: season.waRaces,
    collegeRaces: season.collegeRaces,
    secondTeamRaces: season.secondTeamRaces,
    secondTeamStandings: season.secondTeamStandings,
    // 海外リーグの出場記録は圧縮版（foreignAppsC）だけ持つ。旧形式の foreignAppearances は
    // わざと書かない（読む側は foreignAppsOf() が旧形式と圧縮版の両方に対応している）
    foreignAppsC: parts.foreignAppsC,
    zeroAppearances: parts.zeroAppearances,
    eclRace: season.eclRace,
    eclSeries: season.eclSeries,
  }
}
