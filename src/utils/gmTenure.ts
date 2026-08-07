import type { GmTenure, SeasonStanding } from '../types'
import { seasonDivisionStandings, rankOfTeam, type SeasonStandingsLike } from './league'

// ============================================================================
// 監督（GM）の在任履歴。「何年から何年まで、どのチームの監督だったか」だけを持つ。
//
// ■なぜ要るのか
//   記録室のGMキャリアは、優勝回数も順位推移も通算成績も、全部いまの playerTeamId で
//   過去シーズンの順位表を引いていた。監督が別チームへ移れるようにすると、
//   移った瞬間に前のチームでの優勝がキャリアから消え、
//   移籍先の過去（他人の実績）が自分の成績として出てしまう。
//   年ごとに「その年の自分のチーム」を引けるようにして、それを防ぐ。
//
// ■持ち方
//   期間は重ならない前提で、古い順に並べる。いま指揮しているチームだけ toYear が無い。
//   例: [{ teamId: 'fukuoka', fromYear: 2027, toYear: 2031 }, { teamId: 'tokyo', fromYear: 2032 }]
//
// ■旧セーブ
//   履歴を持っていないセーブは「最初のシーズンからずっと今のチーム」とみなす。
//   これまで表示されていた数字がそのまま出るので、既存プレイヤーの見た目は変わらない。
// ============================================================================

// 履歴が無い・壊れているときに、今のチーム1件だけの履歴を作って返す。
// 中身が正しいセーブは元の配列をそのまま返す（無駄な再描画とセーブ書き込みを避ける）。
export function normalizeTenures(
  tenures: GmTenure[] | undefined,
  playerTeamId: string,
  firstYear: number,
): GmTenure[] {
  const valid = (tenures ?? []).filter(t => t && typeof t.teamId === 'string' && t.teamId !== '' && typeof t.fromYear === 'number')
  if (valid.length === 0) return [{ teamId: playerTeamId, fromYear: firstYear }]
  if (valid.length === (tenures ?? []).length) return tenures as GmTenure[]
  return valid
}

// その年に指揮していたチームID。履歴に無い年は今のチーム扱い。
export function makeTeamIdAt(
  tenures: GmTenure[] | undefined,
  playerTeamId: string,
): (year: number) => string {
  const list = (tenures ?? []).filter(t => t && t.teamId)
  if (list.length === 0) return () => playerTeamId
  return (year: number) => {
    for (const t of list) {
      if (year < t.fromYear) continue
      if (t.toYear != null && year > t.toYear) continue
      return t.teamId
    }
    // 履歴より前の年（移籍前のセーブから引き継いだ古い記録など）は一番古い在任チームに寄せる
    const oldest = list.reduce((a, b) => (b.fromYear < a.fromYear ? b : a))
    return year < oldest.fromYear ? oldest.teamId : playerTeamId
  }
}

// 新しいチームの指揮を始める。今のチームの在任を前年で閉じてから足す。
// 同じチームへ移る指示が来たら何もしない（二重に積まない）。
export function startTenure(
  tenures: GmTenure[] | undefined,
  teamId: string,
  fromYear: number,
  playerTeamId: string,
): GmTenure[] {
  const list = normalizeTenures(tenures, playerTeamId, fromYear)
  const current = list.find(t => t.toYear == null)
  if (current?.teamId === teamId) return list
  return [
    ...list.map(t => (t.toYear == null ? { ...t, toYear: Math.max(t.fromYear, fromYear - 1) } : t)),
    { teamId, fromYear },
  ]
}

// 「その年の自分のチームは何位だったか」を年ごとに並べる。
// 監督が移れるので、順位は必ずその年に指揮していたチームで引く。
// 順位表に自分のチームが載っていない年（そのリーグに居なかった等）は null。
export type GmSeasonRank = { year: number; teamId: string; rank: number | null }

export function gmSeasonRanks(
  seasons: (SeasonStandingsLike<SeasonStanding> & { year: number })[],
  tenures: GmTenure[] | undefined,
  playerTeamId: string,
): GmSeasonRank[] {
  const at = makeTeamIdAt(tenures, playerTeamId)
  return seasons.map(s => {
    const teamId = at(s.year)
    // その年に走った部の中での順位（順位表は部ごとに分かれている）
    const r = rankOfTeam(seasonDivisionStandings(s, teamId), teamId)
    return { year: s.year, teamId, rank: r > 0 ? r : null }
  })
}

// 監督個人の通算。チームの通算（球団史）とは別物。
//
// ここを分けないと、優勝の多いチームへ移った瞬間に
// 前の監督が積んだ優勝が自分の実績として解除されてしまう。
// 逆に、優勝したチームから出ると自分で獲った優勝が消える。
// 引数の seasons は古い順に並んでいること（連覇の判定に順番を使う）。
export function gmCareerTotals(ranks: GmSeasonRank[]): {
  championships: number
  seasons: number
  currentStreak: number
} {
  let championships = 0
  for (const r of ranks) if (r.rank === 1) championships++
  let currentStreak = 0
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (ranks[i]?.rank === 1) currentStreak++
    else break
  }
  return { championships, seasons: ranks.length, currentStreak }
}
