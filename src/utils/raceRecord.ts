import type { Race } from '../types'

// レースの走行記録の「唯一の形」。
//
// ■なぜ要るのか
//   走行記録の持ち方が大会ごとにバラバラだった。
//     自分の部・ECL・世界選手権 … races[i].results をそのまま保存
//     裏の部（1部・2部）        … 捨てて awayAppearances（出走数だけ）に置き換え
//     海外リーグ                … 捨てて foreignAppearances（出走数だけ）に置き換え
//   捨てた2つは「区間タイムも順位も誰と競ったかも残らない」ので、
//   移籍の判断材料・区間記録・日程の「実施済み」・監督が海外へ移ったときの過去が作れない。
//   後付けの集計2つも、結果を捨てたから必要になっただけのもの。
//
// ■決まり
//   どの大会でも走行記録はここで詰めた形で持つ。大会で残す／捨てるを分けない。
//   通算成績はここから数え直す（utils/careerStats）ので、別の集計を作らないこと。
//
// ■なぜ詰めるのか（実測）
//   1走者ぶんが {"playerId":…,"timeSec":…,"rank":…} で52バイト、詰めると20バイト。
//   全大会ぶんで1シーズン19,758行なので、0.98MB → 0.38MB。
//   100シーズン遊ぶ前提だと 98MB → 38MB。詰めないと保存も読み込みも保たない。

/** 1走者ぶん。[選手ID, タイム(秒・整数), 区間内順位] */
export type PackedRunner = [string, number, number]
/** 1区間ぶん。[区間番号, 走者…] */
export type PackedSegment = [number, ...PackedRunner[]]
/** 1レースぶん */
export type PackedRace = { id: string; segs: PackedSegment[] }

type RunnerLike = { playerId: string; timeSec: number; rank: number }
type SegmentLike = { segmentIndex: number; runners: RunnerLike[] }

/** レース結果を詰める。タイムは秒の整数まで（表示は分秒なので小数は要らない） */
export function packRace(raceId: string, segments: readonly SegmentLike[]): PackedRace {
  return {
    id: raceId,
    segs: segments.map(s => [
      s.segmentIndex,
      ...s.runners.map(r => [r.playerId, Math.round(r.timeSec), r.rank] as PackedRunner),
    ] as PackedSegment),
  }
}

/** 詰めた形を元に戻す。読む側は今までと同じ形で受け取れる */
export function unpackRace(p: PackedRace): { segmentIndex: number; runners: RunnerLike[] }[] {
  return p.segs.map(([segmentIndex, ...runners]) => ({
    segmentIndex,
    runners: runners.map(([playerId, timeSec, rank]) => ({ playerId, timeSec, rank })),
  }))
}

/** Race からそのまま詰める（結果が無いレースは undefined） */
export function packRaceResults(race: Race): PackedRace | undefined {
  const segs = race.results?.segmentResults
  if (!segs || segs.length === 0) return undefined
  return packRace(race.id, segs as unknown as SegmentLike[])
}

/**
 * 終わったシーズンの走行記録をまとめた箱。**普段のセーブには入れない。**
 *
 * セーブは状態が変わるたびに全部を書き直すので、100シーズンぶん（40MB）を
 * 抱えたままだと1回の操作で1.4秒（実機で3〜5秒）固まる。
 * シーズンが終わったときに1回だけ書き、記録室や選手の履歴を開いたときだけ読む。
 */
export type SeasonArchive = {
  year: number
  /** 大会ごとの走行記録。キーは 'jpel' / 'ecl' / 'world' / リーグID */
  races: Record<string, PackedRace[]>
}

/** 過去シーズンの記録を置くキー。読み書きするのはここ1本 */
export function archiveKeyOf(year: number): string {
  return `jpel-archive-${year}`
}
