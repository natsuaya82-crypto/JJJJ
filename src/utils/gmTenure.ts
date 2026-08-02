import type { GmTenure } from '../types'

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
