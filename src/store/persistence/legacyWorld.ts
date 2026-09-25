// 旧い形のクラブ（国内と海外で入れ物が2つだったころ）を、いまの形（`GameState.clubs`＝
// 232クラブの1つの並び）へ均す。**均す場所はここ1本。**
//
// ■旧い形
//   teams          … 国内52クラブ。部は `division`（無ければ1部）
//   foreignLeagues … 海外9リーグ（リーグ → clubs）。リーグの名前・国はデータ（data/leagues）が持つ
//
// ■いまの形
//   clubs … 日本のリーグ（国内52・並びは teams のまま）→ 海外9リーグ（リーグの並び → クラブの並び）。
//           どのリーグのクラブかは `leagueId` だけが持つ（国内は部のリーグ `jpel-<部>`）
//
// ■誰が通すか
//   セーブの移行（migrateSave の v47）だけ。
//
// ★**旧い名前（上の2つ）を state として読み書きしてよいのは、このファイルと migrateSave.ts だけ。**
//   `scripts/check-world-layer.ts` が src の残りを数える。
import { clubsWhere, divisionLeagueId, isJpelLeague } from '../../utils/world'
import { initialWorldClubs } from '../initialWorld'
import type { Division } from '../../types'

type Raw = Record<string, unknown>

const asList = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Raw[] : [])

/** 旧い形（teams / foreignLeagues）を持っているか */
export function hasLegacyWorldShape(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && ('teams' in (raw as Raw) || 'foreignLeagues' in (raw as Raw))
}

/**
 * 旧い形の国内クラブ・海外リーグを、1つの並びのクラブへ。
 * 国内は `division` を所属リーグ（`jpel-<部>`）へ移して `division` を消す。
 * 海外は各クラブの `leagueId`（無ければ入っているリーグのID）をそのまま使う。
 */
export function legacyWorldClubs(teams: unknown, foreignLeagues: unknown): Raw[] {
  // 片方の入れ物がセーブに無い（キーごと無い）ときは、旧い形でも読み込みの合流で
  // **初期状態のもの**が入っていた。同じものを補う（均したあとは clubs があるので合流では補われない）
  const initial = (teams === undefined || foreignLeagues === undefined) ? initialWorldClubs() : []
  const domestic = teams === undefined
    ? clubsWhere(initial, c => isJpelLeague(c.leagueId)) as unknown as Raw[]
    : asList(teams).map(t => {
      const { division, ...rest } = t
      const d = division === 2 || division === 3 ? division : 1
      return { ...rest, leagueId: divisionLeagueId(d as Division) }
    })
  const foreign = foreignLeagues === undefined
    ? clubsWhere(initial, c => !isJpelLeague(c.leagueId)) as unknown as Raw[]
    : asList(foreignLeagues).flatMap(l =>
      asList(l.clubs).map(c => ({ ...c, leagueId: (c.leagueId as string | undefined) ?? (l.id as string) })))
  return [...domestic, ...foreign]
}

/**
 * セーブの状態（生の形）を均す。旧い形が無ければ何もしない。
 * 既に `clubs` があるのに旧い形も残っているセーブ（途中で止まった移行）は、`clubs` を正とする。
 */
export function normalizeWorldClubs(s: Raw): void {
  if (!hasLegacyWorldShape(s)) return
  if (!Array.isArray(s.clubs)) s.clubs = legacyWorldClubs(s.teams, s.foreignLeagues)
  delete s.teams
  delete s.foreignLeagues
}
