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

// ── 既存データを壊さないための境目 ─────────────────────────────
//
// ■原則
//   **すでに遊んだシーズンは一切さわらない。** 走行記録を残していなかった年は、
//   あとから作れない（結果が存在しない）。無理に作れば嘘の記録になる。
//   新しい数え方は**新しいシーズンから**動かし、古い年は今までどおり
//   出走数の集計（awayAppearances / foreignAppearances）で読む。
//
// ■そのための目印
//   シーズンごとに「このシーズンは走行記録を全部残してあるか」を持つ。
//   読む側はこれを見て、数え方を選ぶ。**判断はここ1本**。
//   呼ぶ側で「年で分ける」「フィールドの有無で分ける」と書かないこと。
//   （片方だけ直すと、通算出走数が経路によって食い違う）
//
// ■安全網
//   1. 目印が無いシーズンは絶対に新しい数え方をしない（古い集計をそのまま使う）
//   2. 書き出しは「書く → 読み戻して一致を確認 → そのとき初めて本体から外す」
//      確認できなければ本体に残したままにする（消えるより重い方がまし）
//   3. 古い集計は消さない。新しい年で使わなくなるだけ

/** そのシーズンが「走行記録を全部残してある」年か。数え方の分岐はここだけ */
export function seasonHasFullRecords(season: { recordsFull?: boolean } | undefined): boolean {
  return season?.recordsFull === true
}

/**
 * 書き出したものを読み戻して、中身が一致するかを確かめる。
 * 一致しなければ呼ぶ側は**本体から外さない**こと（安全網2）。
 */
export function archiveMatches(written: string, readBack: string | null): boolean {
  return typeof readBack === 'string' && readBack.length === written.length && readBack === written
}
