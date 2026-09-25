// 旧い形のシーズン（日程・順位表が国内と海外で別の入れ物だったころ）を、
// いまの形（`Season.leagues`＝リーグID → 日程・順位表）へ均す。**均す場所はここ1本。**
//
// ■旧い形
//   races            … 自分の部の日程（結果はこちらに入る）
//   divisionRaces    … 部 → 日程（3部ぶん。自分の部のぶんは結果が入らない写し）
//   standings        … 部 → 順位表
//   foreignRaces     … 海外リーグID → 走り終えたレース
//   foreignStandings … 海外リーグID → 順位表（v39 より前は行のキーが clubId）
//   foreignRaceIndex … 海外で消化したマッチデー数
//
// ■誰が通すか
//   ・セーブの移行（migrateSave の v46）… 今シーズンと、セーブに入っている過去シーズン
//   ・別ファイルに書き出した過去シーズンの走行記録は、キー（jpel / div-<部> / lg-<リーグ>）で
//     詰めてあるだけでシーズンの形を持たない。読み戻しは store/seasonArchive の
//     `packedRacesOfLeague` 1本がどのキーからでも拾う
//
// ★**旧い名前（上の6つ）を書いてよいのは、このファイルと migrateSave.ts だけ。**
//   `scripts/check-season-leagues.ts` が src の残りを数える。
import type { Division, LeagueSeason, Race, SeasonStanding } from '../../types'
import { DIVISIONS, divisionLeagueId } from '../../utils/league'
import { normalizeStandingRows } from '../../utils/clubStanding'
import { packForeignApps } from '../../utils/playerUtils'

type Raw = Record<string, unknown>

const LEGACY_KEYS = ['races', 'divisionRaces', 'standings', 'foreignRaces', 'foreignStandings', 'foreignRaceIndex'] as const

/** 旧い形の項目を1つでも持っているか */
export function hasLegacySeasonShape(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && LEGACY_KEYS.some(k => k in (raw as Raw))
}

const asRaces = (v: unknown): Race[] => (Array.isArray(v) ? v as Race[] : [])
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})

/**
 * 自分の部の日程（旧 `races`）が、どの部のものだったか。
 *   1. 部ごとの日程とレースIDが重なる部（いちばん確か）
 *   2. 自チームが順位表に載っている部
 *   3. そのレースに出ていたクラブがいちばん多く載っている部
 *   4. レースIDの `race-d<部>-` の印
 */
function myDivisionByIds(raw: Raw): number | undefined {
  const ids = new Set(asRaces(raw.races).map(r => r?.id))
  const divRaces = asRecord(raw.divisionRaces)
  for (const d of DIVISIONS) {
    if (asRaces(divRaces[d]).some(r => ids.has(r?.id))) return d
  }
  return undefined
}

function myDivisionOf(raw: Raw, myTeamId: string | undefined): number | undefined {
  const races = asRaces(raw.races)
  const standings = asRecord(raw.standings)
  const byIds = myDivisionByIds(raw)
  if (byIds != null) return byIds
  const rowsOf = (d: number) => (Array.isArray(standings[d]) ? standings[d] as { teamId?: string }[] : [])
  if (myTeamId) {
    for (const d of DIVISIONS) if (rowsOf(d).some(r => r?.teamId === myTeamId)) return d
  }
  const ran = new Set<string>()
  for (const r of races) for (const tr of r?.results?.teamRankings ?? []) ran.add(tr.teamId)
  if (ran.size > 0) {
    let best: number | undefined, bestN = 0
    for (const d of DIVISIONS) {
      const n = rowsOf(d).filter(r => r?.teamId && ran.has(r.teamId)).length
      if (n > bestN) { best = d; bestN = n }
    }
    if (best != null) return best
  }
  for (const r of races) {
    const m = /^race-d(\d)-/.exec(r?.id ?? '')
    if (m && (DIVISIONS as readonly number[]).includes(Number(m[1]))) return Number(m[1])
  }
  return undefined
}

/**
 * 旧い形のシーズンを、いまの形へ均す。**冪等**（いまの形のものはそのまま返す）。
 * @param myTeamId 自チームのID（旧 `races` がどの部のものかを決める手がかりの1つ）
 */
export function normalizeSeasonLeagues<T extends Raw>(raw: T, myTeamId?: string): T {
  if (!raw || typeof raw !== 'object' || !hasLegacySeasonShape(raw)) return raw
  const leagues: Record<string, LeagueSeason> = { ...(asRecord(raw.leagues) as Record<string, LeagueSeason>) }
  const races = asRaces(raw.races)
  const divRaces = asRecord(raw.divisionRaces)
  const standings = asRecord(raw.standings)
  const myDiv = races.length > 0 ? (myDivisionOf(raw, myTeamId) ?? DIVISIONS[0]) : undefined

  // 国内の部。自分の部の日程は旧 `races`（結果はこちらに入っている）
  for (const d of DIVISIONS) {
    const id = divisionLeagueId(d)
    const sched = d === myDiv ? races : asRaces(divRaces[d])
    const rows = normalizeStandingRows(Array.isArray(standings[d]) ? standings[d] as unknown[] : [])
    if (leagues[id] && sched.length === 0 && rows.length === 0) continue
    leagues[id] = { races: sched, standings: rows }
  }

  // 自チームの行が「走った部」と違う部に載っている年（build 110 までのズレ）は、走った部へ移す。
  // 以前は起動のたびに bootRepair が日程のIDの重なりで直していた。いまの形では結果から直すが、
  // 結果を別ファイルへ出してある年は起動時にはまだ結果が無いので、ここで1回だけ直しておく
  const ranDiv = myDivisionByIds(raw)
  if (ranDiv != null && myTeamId) {
    const want = divisionLeagueId(ranDiv as Division)
    for (const d of DIVISIONS) {
      const id = divisionLeagueId(d)
      if (id === want) continue
      const row = leagues[id]?.standings.find(r => r.teamId === myTeamId)
      if (!row || leagues[want]?.standings.some(r => r.teamId === myTeamId)) continue
      leagues[id] = { ...leagues[id], standings: leagues[id].standings.filter(r => r.teamId !== myTeamId) }
      leagues[want] = { ...leagues[want], standings: [...leagues[want].standings, row] }
    }
  }

  // 海外リーグ
  const fRaces = asRecord(raw.foreignRaces)
  const fStand = asRecord(raw.foreignStandings)
  const fIndex = typeof raw.foreignRaceIndex === 'number' ? raw.foreignRaceIndex : 0
  for (const lid of new Set([...Object.keys(fStand), ...Object.keys(fRaces)])) {
    const ran = asRaces(fRaces[lid])
    // 走行記録を残す前のセーブは、消化数（foreignRaceIndex）だけが残っている。
    // 消化した回を「結果の無い済み」として置いておく（数え直すと同じ回をもう一度走ってしまう）
    const filled = [...ran]
    for (let i = filled.length; i < fIndex && i < races.length; i++) {
      filled.push({ ...races[i], id: `${races[i].id}@${lid}`, results: { teamRankings: [], segmentResults: [] } })
    }
    leagues[lid] = {
      races: filled,
      standings: normalizeStandingRows(Array.isArray(fStand[lid]) ? fStand[lid] as unknown[] : []) as SeasonStanding[],
    }
  }

  const out: Raw = { ...raw, leagues }
  for (const k of LEGACY_KEYS) delete out[k]
  return out as T
}

// 既存セーブの移行用（utils/archiveSeason の archiveSeason と同じ形まで削る）。すでに保存されている過去シーズン1年ぶんを、上と同じ形まで削り落とす。
// migrate から呼ぶので、入力は「型が付いていない生データ」であることに注意（欠損・型違いに耐えること）。
// ★v19 の段から呼ばれる。その時点のセーブはまだ旧い形（部ごと・海外別）なので、
//   旧い項目もそのまま通す（いまの形へ均すのは v46 の段＝store/persistence/legacySeason）。
export function toArchivedShape(raw: Record<string, unknown>): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return raw
  // 海外リーグの出場記録：旧形式（foreignAppearances）が残っていれば圧縮版に詰め替える。
  // すでに foreignAppsC を持っている年はそのまま使う（二重変換しない）
  let appsC = raw.foreignAppsC
  if (appsC == null && raw.foreignAppearances && typeof raw.foreignAppearances === 'object') {
    appsC = packForeignApps(raw.foreignAppearances as Parameters<typeof packForeignApps>[0])
  }
  const LEGACY = ['races', 'divisionRaces', 'foreignRaces', 'standings', 'foreignStandings', 'foreignRaceIndex']
  const legacy = Object.fromEntries(LEGACY.filter(k => k in raw).map(k => [k, raw[k]]))
  // 海外リーグ順位表：過去ぶんは合計ポイントしか読まないので1戦ごとの結果を落とす
  // （新しいセーブでは保存時に落としてある。ごく古いセーブのための保険）
  const fKey = LEGACY[4]
  const fStand = legacy[fKey]
  if (fStand && typeof fStand === 'object') {
    legacy[fKey] = Object.fromEntries(
      Object.entries(fStand as Record<string, unknown>).map(([lid, st]) => [
        lid,
        Array.isArray(st)
          ? (st as Record<string, unknown>[]).map(x => ({ teamId: x.teamId ?? x.clubId, totalPoints: x.totalPoints, raceResults: [] }))
          : st,
      ]),
    )
  }
  return {
    year: raw.year,
    ...legacy,
    ...(raw.leagues ? { leagues: raw.leagues } : {}),
    waRaces: raw.waRaces,
    collegeRaces: raw.collegeRaces,
    secondTeamRaces: raw.secondTeamRaces,
    secondTeamStandings: raw.secondTeamStandings,
    foreignAppsC: appsC,
    zeroAppearances: raw.zeroAppearances,
    eclRace: raw.eclRace,
    eclSeries: raw.eclSeries,
  }
}
