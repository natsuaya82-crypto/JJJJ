import type { Race, SegmentRecord } from '../types'

// 区間記録（歴代トップ10）を、保存してあるレース結果から毎回組み立てる。
//
// ■なぜ作り直すのか
//   以前はレースを走るたびに segmentRecords（大会×区間ごとのトップ10）をセーブに書き足していた。
//   だが元になるレース結果は過去シーズンに全部残っているので、記録は要るときに数え直せる。
//   同じ情報を二重に持たない方がセーブが軽く、集計のズレも起きない。
//
// ■キーの形
//   `${大会名}-${区番号}`。以前セーブに入っていたキーと同じなので、読む側の書き方は変わらない。
//
// ■どの部の走りも同じ記録に入る
//   1部・2部・3部は同じ25本のコースを分け合って走る（data/races.ts の drawSeasonSchedules）。
//   同じコースなら距離も起伏も同じなので、**区間記録はそのコースでいちばん速いタイム**であって
//   部ごとに分ける意味がない。以前は自分の部（`season.races`）しか数えておらず、
//   裏で走っている他の部の走りが記録に一切載らなかった。
//   ここで `divisionRaces`（3部ぶん全部）も一緒に数える。`races` と重なるが、
//   選手ごとに最速の1本だけを残すので二重には数えない。
//
// ■並び
//   同じ選手は一番速い1本だけ。速い順に10人まで。

/** 記録を数える対象。main = JPEL+ECL（1軍）、reserve = リザーブ駅伝 */
export type RecordKind = 'main' | 'reserve'

/** `${大会名}-${区番号}` → 速い順トップ10 */
export type SegmentRecordMap = Record<string, SegmentRecord[]>

/** 過去シーズンでも今シーズンでも同じように読めるように、必要な物だけを受ける */
export type SeasonRacesLike = {
  year: number
  races?: Race[]
  /** 部ごとの日程（1部・2部・3部）。自分が走っていない部もここに入っている */
  divisionRaces?: Partial<Record<number, Race[]>>
  secondTeamRaces?: Race[]
  eclRace?: Race
  eclSeries?: { races: Race[] }
}

function racesOf(s: SeasonRacesLike, kind: RecordKind): Race[] {
  if (kind === 'reserve') return s.secondTeamRaces ?? []
  // ECLは5戦シリーズ。旧セーブの一発勝負（eclRace）も同じコース名なので一緒に数える
  return [
    ...(s.races ?? []),
    // 他の部の走りも同じコースの記録に入る（同じコース＝同じ距離・同じ起伏）
    ...Object.values(s.divisionRaces ?? {}).flat().filter((r): r is Race => !!r),
    ...(s.eclSeries?.races ?? []),
    ...(s.eclRace ? [s.eclRace] : []),
  ]
}

export function buildSegmentRecords(seasons: SeasonRacesLike[], kind: RecordKind = 'main'): SegmentRecordMap {
  // 大会×区間 → 選手 → その選手の最速
  const best = new Map<string, Map<string, SegmentRecord>>()
  for (const s of seasons) {
    if (!s) continue
    for (const race of racesOf(s, kind)) {
      if (!race?.results) continue
      for (const sr of race.results.segmentResults ?? []) {
        const key = `${race.name}-${sr.segmentIndex}`
        let perPlayer = best.get(key)
        if (!perPlayer) { perPlayer = new Map(); best.set(key, perPlayer) }
        for (const run of sr.runners ?? []) {
          if (!run.playerId) continue
          const cur = perPlayer.get(run.playerId)
          if (!cur || run.timeSec < cur.timeSec) {
            perPlayer.set(run.playerId, { playerId: run.playerId, teamId: run.teamId, timeSec: run.timeSec, year: s.year })
          }
        }
      }
    }
  }
  const out: SegmentRecordMap = {}
  for (const [key, perPlayer] of best) {
    out[key] = [...perPlayer.values()].sort((a, b) => a.timeSec - b.timeSec).slice(0, 10)
  }
  return out
}

// 選手一覧や結果画面は同じ記録を何度も読むので、直前の結果を覚えておく。
// レース結果が入れ替わっていなければ同じ物を返すので、画面の作り直しも起きない。
// （ニュースや交渉だけが動いた場合は currentSeason は差し替わるが、レースの中身は同じなので数え直さない）
type CacheSlot = { deps: unknown[]; value: SegmentRecordMap }
const cache: Record<RecordKind, CacheSlot | null> = { main: null, reserve: null }

function depsOf(pastSeasons: SeasonRacesLike[], currentSeason: SeasonRacesLike, kind: RecordKind): unknown[] {
  return kind === 'reserve'
    ? [pastSeasons, currentSeason?.secondTeamRaces]
    : [pastSeasons, currentSeason?.races, currentSeason?.divisionRaces, currentSeason?.eclSeries, currentSeason?.eclRace]
}

/**
 * 区間記録を作る（結果を覚えておく版）。
 * 今シーズンのレースは「結果が入っているぶん」だけ数えるので、
 * 走り終わる前は自動的に「そのレースを走る前の記録」になる。
 */
export function segmentRecordsOf(
  pastSeasons: SeasonRacesLike[],
  currentSeason: SeasonRacesLike,
  kind: RecordKind = 'main',
): SegmentRecordMap {
  const deps = depsOf(pastSeasons, currentSeason, kind)
  const hit = cache[kind]
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value
  const value = buildSegmentRecords([...pastSeasons, currentSeason], kind)
  cache[kind] = { deps, value }
  return value
}
