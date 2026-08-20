// セーブの肥大化対策。endSeason から切り出した（挙動不変）。
//
//   1. 海外クラブの在籍上限からはみ出した選手を外す
//   2. 引退選手を軽くする（能力値などを落として、名前と実績だけ残す）
//   3. 「二度と名前が出ない選手」は選手データごと消す
//
// ■触るときの注意
//   - **実績のある選手は絶対に消さない。** 消してよいのは、どの画面にも名前が出ない選手だけ。
//     残す条件（`protectedIds` と `isWorthKeeping`）を削るときは、その記録を読む画面が
//     本当に無いかを先に確かめること。1つでも見落とすと、ニュース・記録・歴代優勝から
//     選手詳細が開けなくなる
//   - 消した選手は `removedPlayers` に**名前と国籍だけ**残す。過去レースの区間配置や
//     移籍履歴では名前も国籍もそのまま出て、選手詳細だけが開けなくなる
//   - **人数上限は `ROSTER_MAX` 1本。** 30 と書かないこと
//   - 引退そのものは `movePlayer` に任せる。ここでやるのはデータ削りだけ
//   - 乱数を引かない
import { ROSTER_MAX } from '../data/rosterRules'
import { seasonAwardsOf } from '../utils/awards'
import { eclHistoryOf } from '../utils/eclHistory'
import { movePlayer } from '../utils/movePlayer'
import { ovr } from '../utils/playerUtils'
import { clubMembersByClub } from '../utils/rosterSync'
import { segmentRecordsOf } from '../utils/segmentRecords'
import type { ForeignLeague, GameState, Nationality, Player } from '../types'

export type PruneResult = {
  players: Player[]
  /** 消した選手の「名前・国籍」だけの控え */
  removedPlayers: Record<string, [string, Nationality]>
}

export function pruneSaveData(args: {
  /** 移籍処理まで終わった選手一覧 */
  players: Player[]
  /** 移籍処理まで終わった海外リーグ */
  foreignLeagues: ForeignLeague[]
  /** 今季の状態（読むだけ） */
  state: GameState
  /** 来季の年 */
  newYear: number
}): PruneResult {
  const { players, foreignLeagues, state: st, newYear } = args

  // ── 長期プレイでの肥大化対策（記録は名前焼き込みで残るため消えない） ──
  // 1) 海外クラブの在籍上限(30人)をここで適用する。所属は選手側の teamId だけが記録なので、
  //    クラブごとに数えて、はみ出したぶん（能力の低い順）を下の整理で外す
  const playerByIdCl = new Map(players.map(p => [p.id, p]))
  const foreignDropIds = new Set<string>()
  {
    // 数えるのは現役だけ。負傷中の選手まで数に入れると、怪我をしただけで
    // 上限からはみ出して引退させられてしまう
    const membersByClub = clubMembersByClub(players.filter(p => p.status === 'active'))
    for (const l of foreignLeagues) {
      for (const c of l.clubs) {
        const ids = membersByClub.get(c.id) ?? []
        // 人数上限は data/rosterRules の ROSTER_MAX 1本。30 と書かない
        if (ids.length <= ROSTER_MAX) continue
        const sorted = [...ids].sort((a, b) => {
          const pa = playerByIdCl.get(a); const pb = playerByIdCl.get(b)
          return (pb ? ovr(pb) : 0) - (pa ? ovr(pa) : 0)
        })
        sorted.slice(ROSTER_MAX).forEach(id => foreignDropIds.add(id))
      }
    }
  }
  // 2) 引退選手の軽量化（能力履歴・特性などを落として名前と実績だけ残す）
  //    ＋整理のルールは国内・海外で共通：「実績（出走・区間賞・記録会ベスト）のある選手は絶対に消さず引退として残す」。
  //    実績ゼロの選手だけ削除する。これでニュース・記録・歴代優勝から選手詳細が必ず開ける
  //    引退後の選手詳細は1ページ目（能力レーダー・契約・市場価値）を表示しないので、
  //    能力値・EXP・上限解放などは持たせない。セーブ容量の節約。
  //    ratings は型上は必須だが、読む側は safeRatings/ovr で欠損に耐える作りにしてある。
  //    contract は残す（引退ニュースのカードが p.contract.annualSalary を直接読むため）
  const LEAN_DROP_KEYS = ['ratings', 'exp', 'potentialBoosts', 'trophyBoosts', 'customCaps', 'segmentPBs', 'personalSponsors', 'predictedPick', 'ovrHistory', 'traits'] as const
  // 引退そのものは movePlayer の分岐に任せる（上の引退処理を通っていない経路もここに来るため）。
  // ここに残すのはセーブを軽くするためのデータ削りだけ
  const leanRetired = (p: Player, retiredYear = st.currentSeason.year): Player => {
    const moved = movePlayer({ players: [p], teams: [] }, p.id, '', { year: retiredYear, retire: true })
    const q: Record<string, unknown> = { ...(moved.ok ? moved.players[0] : p) }
    for (const k of LEAN_DROP_KEYS) delete q[k]
    return q as unknown as Player
  }
  // 3) 「二度と名前が出ない選手」は選手データごと削除してセーブを軽くする。
  //    残すのは画面のどこかで名前が出る可能性がある選手だけ：
  //      ・一度でも自チームに所属した
  //      ・区間賞を取ったことがある（通算区間賞ランキング）
  //      ・区間記録／記録会の歴代記録（世界記録・日本記録・種目別トップ10・チーム歴代記録）の保持者
  //      ・駅伝代表に選ばれたことがある（全出場国の代表20人ぶんが worldRepresentatives に入る）
  //      ・MVP・新人王・ECL優勝メンバー・ECL MVP
  //      ・ドラフト指名歴がある（歴代ドラフトの一覧が歯抜けになる）
  //      ・スター（★）を付けている
  //    削除した選手は removedPlayers に「名前・国籍」だけ残すので、過去レースの区間配置や
  //    移籍履歴では名前も顔もそのまま出る（選手詳細だけ開けなくなる）。
  const protectedIds = new Set<string>()
  for (const list of Object.values(segmentRecordsOf(st.pastSeasons, st.currentSeason))) {
    for (const r of list) protectedIds.add(r.playerId)
  }
  for (const rec of [...Object.values(st.worldRecords ?? {}), ...Object.values(st.japanRecords ?? {})]) {
    if (!rec) continue
    protectedIds.add(rec.playerId)
    for (const co of rec.coHolders ?? []) protectedIds.add(co.playerId)
  }
  for (const g of st.eventSeasonTops ?? []) for (const t of g.top) protectedIds.add(t.playerId)
  for (const t of st.teams) {
    for (const list of Object.values(t.eventRecords ?? {})) for (const r of list ?? []) protectedIds.add(r.playerId)
  }
  // 年度MVP・新人王はセーブに持たず、過去シーズンのレース結果から選び直す（utils/awards.ts）
  for (const a of seasonAwardsOf(st.pastSeasons, st.players, st.removedPlayers)) {
    if (a.mvpId) protectedIds.add(a.mvpId)
    if (a.rookieId) protectedIds.add(a.rookieId)
  }
  // ECLの歴代優勝もセーブに持たず、保存してあるECLのレース結果から数え直す（utils/eclHistory.ts）
  for (const e of eclHistoryOf(st.pastSeasons, st.currentSeason)) {
    if (e.mvpPlayerId) protectedIds.add(e.mvpPlayerId)
    for (const id of e.winnerPlayerIds ?? []) protectedIds.add(id)
  }
  for (const r of st.worldRepresentatives ?? []) protectedIds.add(r.playerId)
  for (const id of st.worldSquad?.playerIds ?? []) protectedIds.add(id)
  // 各国代表に選ばれた20人。代表タブはこの20人をそのまま出すので、
  // ここで守らないと引退した選手が名簿から消えて「20人選ばれたはずが18人」になる。
  // 次の選出で入れ替わるまでは、引退していても20人のまま見せる
  // ★**大陸予選（欧州・アフリカ・アメリカ）の代表も同じ扱い。** ここが漏れていて、
  //   代表の記録がそこにしか無い（worldRepresentatives へ二重保存していない）ので、
  //   他の条件で守られていない選手が消えると「大陸代表だった」という事実と
  //   駅伝代表バッジ（utils/badges.ts）が静かに消えていた（docs/BACKLOG.md A-5）
  for (const squads of [
    st.worldTournament?.squads,
    ...(st.worldAthleticsResults ?? []).map(r => r.squads),
    ...(st.worldAthleticsResults ?? []).flatMap(r => ('continentals' in r ? r.continentals ?? [] : []).map(c => c.squads)),
  ]) {
    for (const ids of Object.values(squads ?? {})) for (const id of ids ?? []) protectedIds.add(id)
  }
  for (const id of [...(st.starredOpponents ?? []), ...(st.starredProspects ?? [])]) protectedIds.add(id)
  // 自チーム在籍歴：過去シーズンの出走記録・0出走記録から拾う（印が無い旧セーブぶんの救済）
  // 監督は移籍できるので、今のチームだけでなく過去に指揮したチーム全部を見る。
  // ここを今のチームだけにすると、移籍した瞬間に前のチームのOBが消える
  const myTeamIdsEver = new Set<string>([st.playerTeamId, ...(st.gmTenures ?? []).map(t => t.teamId)])
  for (const season of [...st.pastSeasons, st.currentSeason]) {
    for (const race of [...(season.races ?? []), ...(season.secondTeamRaces ?? [])]) {
      if (!race.results) continue
      for (const sr of race.results.segmentResults) {
        for (const r of sr.runners) if (myTeamIdsEver.has(r.teamId)) protectedIds.add(r.playerId)
      }
    }
    for (const z of season.zeroAppearances ?? []) if (myTeamIdsEver.has(z.teamId)) protectedIds.add(z.playerId)
  }
  const isWorthKeeping = (p: Player) =>
    p.wasPlayerTeam === true
    || p.isMyPlayer === true
    || protectedIds.has(p.id)
    || p.career.segmentWins > 0
    || p.draftRound != null
  const removedPlayers: Record<string, [string, Nationality]> = { ...(st.removedPlayers ?? {}) }
  const dropPlayer = (p: Player): Player[] => {
    removedPlayers[p.id] = [p.name, p.nationality]
    return []
  }
  const cleanedPlayers = players
    // 今season自チームに居た選手には在籍歴の印を付ける（以後の整理で絶対に消えない）
    .map(p => (p.teamId === st.playerTeamId && p.wasPlayerTeam !== true ? { ...p, wasPlayerTeam: true } : p))
    .flatMap((p): Player[] => {
      // 海外クラブの名簿から溢れた選手
      if (foreignDropIds.has(p.id)) {
        return isWorthKeeping(p) ? [leanRetired(p)] : dropPlayer(p)
      }
      if (p.status === 'retired') return isWorthKeeping(p) ? [leanRetired(p)] : dropPlayer(p)
      if (p.status === 'active' && p.teamId === '') {
        const since = p.faSinceYear ?? st.currentSeason.year
        if (newYear - since >= 2) {
          return isWorthKeeping(p)
            ? [leanRetired(p, since)]
            : dropPlayer(p)
        }
        return [{ ...p, faSinceYear: since }]
      }
      return [p.faSinceYear != null ? { ...p, faSinceYear: undefined } : p]
    })
  return { players: cleanedPlayers, removedPlayers }
}
