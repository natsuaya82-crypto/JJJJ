import type { ContractType } from '../data/rosterRules'
import { canSignContract } from '../data/rosterRules'
import type { Player, Team, TeamRole, TransferRecord } from '../types'
import { retiredFromOf } from './domesticPlayers'
import { ovr } from './playerUtils'

// ============================================================================
// 「選手がクラブを移る」を扱う唯一の場所。
//
// ■なぜ要るのか
//   移籍・トレード・レンタル・放出・FA加入・ドラフト……と入口が35ヶ所くらいあって、
//   そのどれもが同じ後始末を手書きしていた。書き忘れが必ず出る。実際に出ていた。
//     ・元のクラブの名簿から外し忘れる（ロスターに出ないのに走れる選手）
//     ・移籍金を片側しか動かさない
//     ・移籍履歴に残らない（トレードで来た選手の経歴が空になる）
//     ・加入年を入れ忘れて「1シーズン1回まで」の制限をすり抜ける
//     ・移籍リスト入りの札が付いたまま新しいクラブへ行く
//   ここを通せば、どの入口から入っても同じ後始末になる。
//
// ■考え方
//   国内(JPEL)も海外リーグも同じ「クラブ」。違うのは国だけなので処理は分けない。
//   海外クラブは teams に居ないだけで、選手側の teamId は同じように動く。
//
//   移動元(from)は渡さずに選手の今の所属から取る。呼び出し側が古い値を渡す事故を無くすため。
//   レンタル中の選手を戻すときも、今居るクラブ(借り手)が移動元になる。
//
//   引退も「所属が無くなる」だけなので、ここの分岐(retire)で扱う。
//   引退だけ別に手書きしていたせいで、引退時の所属の控え忘れ・名簿からの外し忘れが
//   3ヶ所でそれぞれ起きていた。
//
// ■ここでやること / やらないこと
//   やる   … 所属(teamId)の付け替え、移籍金の受け渡し、
//            加入年・加入節、レンタルの設定と解除、移籍リスト/海外移籍リストの札はがし、
//            調子リセット、再移籍の禁止期限、契約内容、移籍履歴と退団のお知らせの下書き、
//            引退（所属を消して引退時の所属を控える）
//   やらない… ニュース記事の文面（入口ごとに書き分けたいので呼び出し側で作る）、
//            引退選手のデータ削り（セーブを軽くする話で、移動とは別）
// ============================================================================

export type MoveOptions = {
  // 今の年。加入年と移籍履歴に使う（必須）
  year: number
  // 移籍金。フリー・トレード・ドラフトは 0
  fee?: number
  // レンタルの期限（年）。入れるとレンタル扱いになり、保有元は移動元のまま
  until?: number
  // 移籍履歴に残す種類。金銭移籍は省略
  kind?: 'free' | 'trade'
  // 移籍履歴の日付 'YYYY-MM-DD'
  date?: string
  // 加入した節（acquiredRaceIndex）
  raceIndex?: number
  // 契約内容。渡した項目だけ上書き
  contract?: { annualSalary?: number; yearsLeft?: number; contractType?: ContractType }
  // チーム内の役割
  teamRole?: TeamRole
  // 再移籍の禁止期限（この年までは動かせない）
  lockUntilYear?: number
  /**
   * **レンタルの期間だけ**（何年借りるか）。
   *
   * ★**移籍の契約年数をここに書かないこと。** 移籍履歴と退団のお知らせに出る年数は、
   *   下で**実際に結んだ契約（`contract.yearsLeft`）から出します**。
   *   以前はここに `years: 2` と手で書いた道が2つあり（CPUの移籍市場・シーズン中のFA）、
   *   契約そのものは `newContractYears`（1〜5年）なのに**画面には全部「2年」**と出ていました。
   *   1年回して数えると移籍1,232件のうち **971件（78.8%）が食い違い**。
   */
  years?: number
  // 移動先の名前。海外クラブは teams に居ないので呼び出し側から渡す
  toName?: string
  // 自チームのID。移籍金の収支と退団のお知らせを出すかの判定に使う
  myTeamId?: string
  // 退団のお知らせの理由。既定はレンタル→'loan'、放出→'fa'、それ以外→'transfer'
  reason?: 'transfer' | 'fa' | 'loan'
  // false で移籍履歴に残さない（ドラフトなど）
  history?: boolean
  // false で移籍金を動かさない
  money?: boolean
  // true で人数上限（ROSTER_MAX）を超えるなら移動させない
  checkCapacity?: boolean
  // true で引退。移動先は無視して無所属になり、引退時の所属を控える
  retire?: boolean
}

export type DepartureNotice = {
  id: string
  playerId: string
  playerName: string
  toTeamName: string
  reason: 'transfer' | 'fa' | 'loan'
  fee?: number
  years?: number
}

export type MoveResult = {
  // 移動できたか。できなかった場合 players/teams は元のまま返す
  ok: boolean
  players: Player[]
  teams: Team[]
  // 実際の移動元（選手の今の所属から取ったもの）
  from: string
  // 移籍履歴に足す1件。残さない移動では null
  record: TransferRecord | null
  // 自チームから出ていくときの退団のお知らせ。それ以外は null
  notice: DepartureNotice | null
  // 自チームが払った移籍金 / 受け取った移籍金
  spend: number
  income: number
}

// ※ 名簿(roster.main)の付け替えはここにあったが消した。
//   在籍は player.teamId が唯一の持ち場で、クラブ側の名簿は同じ事実の写しだった。
//   写しがある限り「片方だけ更新して食い違う」が起き続ける（実際にトレードが片落ちしていた）。

// 移籍金を動かす。移動先が払い、移動元が受け取る。
// 海外クラブは teams に居ないので、その側は自動的に素通りする（片側だけ動く）。
function withMoney(teams: Team[], fromTeamId: string, toTeamId: string, fee: number): Team[] {
  if (fee <= 0) return teams
  let changed = false
  const next = teams.map(t => {
    if (t.id === toTeamId) { changed = true; return { ...t, finance: { ...t.finance, budget: t.finance.budget - fee } } }
    if (t.id === fromTeamId) { changed = true; return { ...t, finance: { ...t.finance, budget: t.finance.budget + fee } } }
    return t
  })
  return changed ? next : teams
}

export function movePlayer(
  world: { players: Player[]; teams: Team[] },
  playerId: string,
  toTeamId: string,
  opts: MoveOptions,
): MoveResult {
  const { players, teams } = world
  const fail = (from = ''): MoveResult =>
    ({ ok: false, players, teams, from, record: null, notice: null, spend: 0, income: 0 })

  const player = players.find(p => p.id === playerId)
  if (!player) return fail()
  // 引退した選手は動かさない（うっかり復活させないための歯止め）。
  // 引退の呼び出しだけは通す（すでに引退済みでも同じ形に整えるだけなので何度通しても同じ）
  if (player.status === 'retired' && !opts.retire) return fail(player.teamId)

  // 引退は行き先が無い。呼び出し側が何を渡しても無所属にする
  const dest = opts.retire ? '' : toTeamId
  const fromTeamId = player.teamId
  // 同じクラブへの移動は何もしない。ただし契約更新など中身だけ変える呼び出しは通す
  const clubChanged = fromTeamId !== dest
  if (opts.checkCapacity && clubChanged && dest && !canSignContract(players, dest)) return fail(fromTeamId)

  const fee = Math.max(0, Math.round(opts.fee ?? 0))
  const onLoan = opts.until != null
  // レンタルの期限が来て保有元へ帰るだけの移動。移籍ではないので履歴には残さない
  const backToOwner = !onLoan && !!player.loan && dest === player.loan.ownerTeamId

  const nextPlayers = players.map(p => {
    if (p.id !== playerId) return p
    const q: Player = { ...p, teamId: dest }
    if (clubChanged && !opts.retire) {
      q.form = 0
      q.joinedYear = opts.year
      if (opts.raceIndex != null) q.acquiredRaceIndex = opts.raceIndex
    }
    // 移籍リスト・海外移籍リストの札は移動した時点で必ずはがす
    q.transferListed = undefined
    q.overseasListed = undefined
    // レンタルの設定と解除。保有元は「すでにレンタル中ならその保有元」を引き継ぐ
    q.loan = onLoan ? { ownerTeamId: p.loan?.ownerTeamId ?? fromTeamId, untilYear: opts.until! } : undefined
    if (dest) {
      q.status = 'active'
      q.faSinceYear = undefined
    }
    if (opts.retire) {
      // teamId を消す前に引退時の所属を控える。レンタル中なら保有元。
      // これが無いと記録室の国内限定ランキングが、海外で引退した選手を見分けられなくなる
      q.retiredTeamId = retiredFromOf(p)
      q.retiredYear = p.retiredYear ?? opts.year
      q.status = 'retired'
      q.form = 0
      q.fatigue = 0
      q.faSinceYear = undefined
      // 引退後は能力が消えるので、歴代ドラフト・移籍履歴の表示用に総合値だけ控える
      q.finalOvr = p.finalOvr ?? ovr(p)
    }
    // ★**加入したときの契約に印を付ける**（`utils/transferEligibility` の `isTransferLocked`）。
    //   この印が立っている間は移籍で動かせない。契約を更新したら消す。
    //   レンタル（`onLoan`）と、レンタルから戻るとき（`backToOwner`）は保有権が動かないので付けない。
    //   ★ここで付けるのは、**クラブ間の移動は movePlayer 1本を通る**から。
    //     呼ぶ側で書くと、1つ書き忘れた経路だけロックが効かない形になる。
    if (opts.contract) {
      q.contract = { ...p.contract, ...opts.contract }
      if (!onLoan && !backToOwner && dest) q.contract.signedOnJoin = true
    }
    if (opts.teamRole) q.teamRole = opts.teamRole
    if (opts.lockUntilYear != null) q.transferLockedUntilYear = opts.lockUntilYear
    return q
  })

  let nextTeams = teams
  if (opts.money !== false) nextTeams = withMoney(nextTeams, fromTeamId, dest, fee)

  // ★**画面に出す契約年数は、実際に結んだ契約から出す。**
  //   呼ぶ側が数字を書けるようにしておくと必ずズレる（`years: 2` の手書きが2つあった）。
  //   レンタルだけは「何年借りるか」で契約年数ではないので、呼ぶ側の値をそのまま使う。
  const shownYears = onLoan
    ? opts.years
    : nextPlayers.find(p => p.id === playerId)?.contract.yearsLeft

  // 移籍履歴。レンタル・レンタルからの復帰・放出（無所属になるだけ）は残さない
  const keepHistory = opts.history !== false && clubChanged && !onLoan && !backToOwner && !!dest
  const record: TransferRecord | null = keepHistory
    ? {
        year: opts.year,
        ...(opts.date ? { date: opts.date } : {}),
        playerId,
        fromTeamId,
        toTeamId: dest,
        fee,
        ...(opts.kind ? { kind: opts.kind } : {}),
        ...(shownYears != null ? { years: shownYears } : {}),
      }
    : null

  // 退団のお知らせは自チームから出ていくときだけ
  const toName = opts.toName ?? teams.find(t => t.id === dest)?.name ?? ''
  // 引退は退団のお知らせを出さない（引退のニュースは呼び出し側で別に作っている）
  const leavingMyTeam = !!opts.myTeamId && clubChanged && !opts.retire && fromTeamId === opts.myTeamId
  const notice: DepartureNotice | null = leavingMyTeam
    ? {
        id: `dep_${playerId}`,
        playerId,
        playerName: player.name,
        toTeamName: toName,
        reason: opts.reason ?? (onLoan || backToOwner ? 'loan' : dest ? 'transfer' : 'fa'),
        ...(fee > 0 ? { fee } : {}),
        ...(shownYears != null ? { years: shownYears } : {}),
      }
    : null

  const moneyOn = opts.money !== false
  return {
    ok: true,
    players: nextPlayers,
    teams: nextTeams,
    from: fromTeamId,
    record,
    notice,
    spend: moneyOn && opts.myTeamId && dest === opts.myTeamId ? fee : 0,
    income: moneyOn && opts.myTeamId && fromTeamId === opts.myTeamId ? fee : 0,
  }
}
