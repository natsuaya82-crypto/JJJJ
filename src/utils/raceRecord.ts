import type { Race, RaceResults } from '../types'
import { buildTeamRankings } from '../engine/raceEngine'

// レースの走行記録の「唯一の形」。
//
// ■なぜ要るのか
//   走行記録の持ち方が大会ごとにバラバラだった。
//     自分の部・ECL・世界選手権 … races[i].results をそのまま保存
//     裏の部（1部・2部）        … 捨てて awayAppearances（出走数だけ）に置き換え
//     海外リーグ                … 捨てて foreignAppearances（出走数だけ）に置き換え
//   捨てた2つは「区間タイムも順位も誰と競ったかも残らない」ので、
//   移籍の判断材料・区間記録・監督が海外へ移ったときの過去が作れない。
//
// ■決まり
//   どの大会でも走行記録はここで詰めた形で持つ。大会で残す／捨てるを分けない。
//   通算成績はここから数え直す（utils/careerStats）ので、別の集計を作らないこと。
//
// ■何を残して、何を作り直すか
//   残すのは「誰が・どのクラブで・何秒で走ったか」と「そのレースに出たクラブ」だけ。
//   区間内順位・チーム順位・順位ポイント・区間賞ポイントは**全部そこから作り直せる**ので持たない。
//     区間内順位   タイムの昇順
//     チーム順位   区間タイムの合計（走り切れなかったクラブは下）… engine/raceEngine の buildTeamRankings
//     順位ポイント 出走クラブ数 + 1 - 着順（utils/league の positionPointsFor）
//     区間賞       各区間の1〜3位に 3 / 2 / 1
//   順位の決まりは buildTeamRankings 1本を呼ぶ。ここで別に書くと、
//   本編のレースと過去の記録で順位のつけ方がズレる。
//
// ■大きさ（実測）
//   1走者ぶんが {"playerId":…,"teamId":…,"timeSec":…,"rank":…} で約70バイト、詰めると約25バイト。
//   タイムは1/100秒の整数で持つ（表示は0.1秒まで）。

/** 1走者ぶん。[選手ID, チームの番号（teams の添字）, タイム(1/100秒)] */
export type PackedRunner = [string, number, number]
/** 1区間ぶん。[区間番号, 走者…]。走者はタイムの昇順 */
export type PackedSegment = [number, ...PackedRunner[]]
/** 1レースぶん。teams はそのレースに出たクラブ（1人も走らせなかったクラブも含む） */
export type PackedRace = { id: string; teams: string[]; segs: PackedSegment[] }

/** タイムの持ち方。1/100秒の整数 */
const toCs = (sec: number) => Math.round(sec * 100)
const fromCs = (cs: number) => cs / 100

/** レース結果を詰める。出たクラブの一覧も一緒に渡すこと（走者0人のクラブが消えないように） */
export function packRace(raceId: string, teamIds: readonly string[], results: RaceResults): PackedRace {
  const teams = [...teamIds]
  const idx = new Map(teams.map((t, i) => [t, i]))
  return {
    id: raceId,
    teams,
    segs: results.segmentResults.map(s => [
      s.segmentIndex,
      ...[...s.runners]
        .sort((a, b) => a.timeSec - b.timeSec)
        .map(r => [r.playerId, idx.get(r.teamId) ?? 0, toCs(r.timeSec)] as PackedRunner),
    ] as PackedSegment),
  }
}

/** Race からそのまま詰める（結果が無いレースは undefined） */
export function packRaceResults(race: Race): PackedRace | undefined {
  const res = race.results
  if (!res || res.segmentResults.length === 0) return undefined
  // 出たクラブは teamRankings が持っている（走者0人のクラブもここには並ぶ）
  return packRace(race.id, res.teamRankings.map(tr => tr.teamId), res)
}

/**
 * 詰めた形からレース結果を作り直す。読む側は今までとまったく同じ形で受け取れる。
 * 順位・勝ち点の付け方は本編のレースと同じ関数（buildTeamRankings）を通す。
 */
export function unpackRace(p: PackedRace): RaceResults {
  const cumTime: Record<string, number> = {}
  const segCountByTeam: Record<string, number> = {}
  const segPts: Record<string, number> = {}
  for (const t of p.teams) { cumTime[t] = 0; segCountByTeam[t] = 0; segPts[t] = 0 }

  const segmentResults: RaceResults['segmentResults'] = p.segs.map(([segmentIndex, ...runners]) => ({
    segmentIndex,
    runners: runners.map(([playerId, teamIdx, cs], i) => {
      const teamId = p.teams[teamIdx] ?? ''
      const timeSec = fromCs(cs)
      cumTime[teamId] = (cumTime[teamId] ?? 0) + timeSec
      segCountByTeam[teamId] = (segCountByTeam[teamId] ?? 0) + 1
      // 区間賞は各区間の1〜3位に 3 / 2 / 1（走者はタイムの昇順で入っている）
      if (i < 3) segPts[teamId] = (segPts[teamId] ?? 0) + (3 - i)
      return { playerId, teamId, timeSec, rank: i + 1 }
    }),
  }))

  return {
    teamRankings: buildTeamRankings({
      teamIds: p.teams, cumTime, segCountByTeam, segPts, totalSegs: p.segs.length,
    }),
    segmentResults,
  }
}

/**
 * 終わったシーズンの走行記録をまとめた箱。**普段のセーブには入れない。**
 *
 * セーブは状態が変わるたびに全部を書き直すので、100シーズンぶんを抱えたままだと
 * 1回の操作で数秒固まる（実測：40MBで書き込み1.4秒、実機はさらに2〜4倍）。
 * シーズンが終わったときに1回だけ書き、アプリを開いたときに1回だけ読む。
 */
export type SeasonArchive = {
  year: number
  /** 大会ごとの走行記録。キーは utils/seasonArchive の COMPETITIONS */
  races: Record<string, PackedRace[]>
}

/** 過去シーズンの記録を置くキー。読み書きするのはここ1本 */
export function archiveKeyOf(year: number): string {
  return `jpel-archive-${year}`
}

// ── 既存データを壊さないための境目 ─────────────────────────────
//
// ■原則
//   **本体から外すのは、書き出したものを読み戻して中身が一致したときだけ。**
//   一致しなければ本体に残したままにする（重いほうがまし。消えたら戻せない）。
//   外した年は GameState.archivedYears に記録し、そこに無い年は絶対に外さない。

/**
 * 書き出したものを読み戻して、中身が一致するかを確かめる。
 * 一致しなければ呼ぶ側は**本体から外さない**こと。
 */
export function archiveMatches(written: string, readBack: string | null): boolean {
  return typeof readBack === 'string' && readBack.length === written.length && readBack === written
}
