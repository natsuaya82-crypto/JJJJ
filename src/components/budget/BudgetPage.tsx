import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { computeNextSeasonBudget, rankBudgetGrant, FACILITY_UPKEEP_PER_LEVEL, operatingCost } from '../../data/economy'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const font = "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif"

function fmt(yen: number, showSign = false) {
  const sign = showSign && yen >= 0 ? '+' : ''
  if (Math.abs(yen) >= 100000000) return `${sign}${(yen / 100000000).toFixed(1)}億`
  if (Math.abs(yen) >= 10000) return `${sign}${Math.round(yen / 10000)}万`
  return `${sign}${yen.toLocaleString()}`
}

function Row({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '10px 0',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: C.textSub }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: color ?? C.text, fontFamily: SAIRA }}>
        {value}
      </div>
    </div>
  )
}

export default function BudgetPage() {
  const navigate = useNavigate()
  const { teams, players, playerTeamId, currentSeason, sponsors } = useGameStore()
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)

  const myTeam = teams.find(t => t.id === playerTeamId)
  const myPlayers = players.filter(p => p.teamId === playerTeamId)
  // フラット化：1軍/2軍の区別なし。全ロスターをまとめて扱う
  const rosterPlayers = myPlayers.filter(p => p.status !== 'retired')

  const budget = myTeam?.finance.budget ?? 0
  const squadSalaryTotal = rosterPlayers.reduce((s, p) => s + p.contract.annualSalary, 0)
  const facLevelSum = Object.values((myTeam?.facilities ?? {}) as Record<string, number>).reduce((s, v) => s + (v ?? 0), 0)
  const facilityUpkeep = facLevelSum * FACILITY_UPKEEP_PER_LEVEL   // 施設Lv連動（施設なしなら0）

  const myTeamSponsorIds = myTeam?.sponsors ?? []
  const myPersonalSponsorIds = rosterPlayers.flatMap(p => p.personalSponsors ?? [])
  const allSponsorIds = [...myTeamSponsorIds, ...myPersonalSponsorIds]
  const sponsorList = allSponsorIds
    .map(id => (sponsors ?? []).find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s != null)
  const sponsorAnnual = sponsorList.reduce((s, sp) => s + sp.annualPayment, 0)

  const sortedStandings = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
  const myRank = sortedStandings.findIndex(s => s.teamId === playerTeamId) + 1
  const nextGrant = rankBudgetGrant(myRank || teams.length)
  // 運営費＝そのシーズンの順位グラント（前年順位ベース）の10%。1年目は最下位20位相当＝3.5億→3500万。
  const seasonGrant = currentSeason.seasonGrant ?? currentSeason.initialBudget ?? nextGrant
  const opCost = operatingCost(seasonGrant)
  const facRunningCost = facilityUpkeep + opCost
  // 初期予算（そのシーズンの開始予算・固定）と今季収支（初期予算 − 固定支出）
  const initialBudget = currentSeason.initialBudget ?? budget
  const seasonBalance = initialBudget - squadSalaryTotal - opCost - facilityUpkeep
  // 初期予算の内訳（2年目以降。前季endSeasonで確定）。何が合わさって初期予算かを表示。
  const bd = currentSeason.budgetBreakdown
  const PRIZE_TABLE = [2000, 1500, 1000, 700, 500, 300, 300, 300]
  const prizePerRace = (PRIZE_TABLE[Math.min(myRank - 1, PRIZE_TABLE.length - 1)] ?? 200) * 10000
  const racesLeft = Math.max(0, (currentSeason.races?.length ?? 10) - currentSeason.currentRaceIndex)
  const racesTotal = currentSeason.races?.length ?? 10

  const estimatedSeasonPrize = (() => {
    const SEASON_PRIZE: Record<number, number> = { 1: 50000000, 2: 30000000, 3: 20000000, 4: 10000000, 5: 10000000 }
    return SEASON_PRIZE[myRank] ?? 5000000
  })()
  const estimatedRemainingRacePrize = prizePerRace * racesLeft
  const estimatedRemainingAttendance = (
    myRank === 1 ? 1800000 : myRank <= 3 ? 1100000 : myRank <= 6 ? 600000 : myRank <= 10 ? 400000 : 300000
  ) * racesLeft
  const estimatedSponsorRemaining = racesLeft > 0 ? Math.round(sponsorAnnual / racesTotal) * racesLeft : 0

  // 来季予算の見込み（現順位を最終順位と仮定・実モデルと同じ計算）
  const seasonRaceIncomeSoFar = currentSeason.seasonRaceIncome ?? 0
  const projectedSeasonRaceIncome = seasonRaceIncomeSoFar + estimatedRemainingRacePrize + estimatedRemainingAttendance
  const projectedNextBudget = computeNextSeasonBudget({
    finalRank: myRank || teams.length,
    prevBalance: budget,
    deficitStreak: myTeam?.finance.deficitStreak ?? 0,
    sponsorAnnual,
    seasonRaceIncome: projectedSeasonRaceIncome,
    objBudgetBonus: 0,
    bonusPayout: 0,
    salaryTotal: squadSalaryTotal,
    runningCost: facRunningCost,
  })

  // 今シーズンの収支＝お金関係を全部合計（予算繰越＋グラント＋スポンサー＋賞金観客 − 年俸 − 運営費 − 施設維持費）。
  const seasonNet = budget + nextGrant + sponsorAnnual + projectedSeasonRaceIncome - squadSalaryTotal - facRunningCost

  const budgetColor = budget < 30000000 ? C.red : budget < 80000000 ? C.orange : C.green

  const topSalaries = [...rosterPlayers]
    .sort((a, b) => b.contract.annualSalary - a.contract.annualSalary)
    .slice(0, 5)

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg,
      fontFamily: font, color: C.text, paddingBottom: 80,
    }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: `linear-gradient(180deg, ${C.bg} 60%, transparent)`,
        padding: '14px 16px 10px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <BackButton/>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.5 }}>財務・予算管理</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>
            {currentSeason.year}シーズン
          </div>
        </div>
      </div>

      <div style={{ margin: '4px 14px 14px' }}>
        <div style={{
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `3px solid ${C.gold}`,
          borderRadius: 16, padding: '20px 18px', position: 'relative', overflow: 'hidden',
          boxShadow: `0 8px 0 #8b6914, 0 12px 30px rgba(0,0,0,0.65), inset 0 2px 0 rgba(255,255,255,0.15)`,
        }}>
          <div style={{ position: 'absolute', inset: 5, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 12, pointerEvents: 'none', zIndex: 0 }}/>
          <div style={{
            position: 'absolute', top: -30, right: -30, width: 120, height: 120,
            background: `linear-gradient(135deg, ${alpha(budgetColor, 0.08)}, transparent)`,
            transform: 'rotate(45deg)', pointerEvents: 'none', zIndex: 0,
          }}/>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 6 }}>
              今シーズンの予算
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: 42, fontWeight: 900, color: budgetColor, lineHeight: 1, textShadow: budgetColor === C.green ? '0 0 10px rgba(46,204,113,0.4)' : budgetColor === C.red ? '0 0 10px rgba(255,71,87,0.4)' : '0 0 10px rgba(255,152,0,0.4)' }}>
              {fmt(budget)}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
              {budget >= 0 ? '移籍・補強に今使えるお金' : '予算不足 — 選手放出を検討してください'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ margin: '0 14px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 8, paddingLeft: 2 }}>
          今シーズンの収支
        </div>
        <div style={{
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${C.goldDark}`,
          borderRadius: 14, padding: '4px 16px', position: 'relative', overflow: 'hidden',
          boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}>
          <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none', zIndex: 0 }}/>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Row label="初期予算" value={`+${fmt(initialBudget)}`} color={C.gold} />
            {bd && (
              <div style={{ padding: '4px 0 8px 12px', marginLeft: 4, marginBottom: 4, borderLeft: `2px solid ${alpha(C.gold, 0.25)}` }}>
                <div style={{ fontSize: 9, color: C.textGhost, marginBottom: 3, letterSpacing: 1 }}>初期予算の内訳</div>
                {([
                  ['昨年繰越', bd.carryover],
                  ['順位グラント', bd.grant],
                  ['賞金・観客収入', bd.raceIncome],
                  ['スポンサー収入', bd.sponsor],
                  ...(bd.objBonus > 0 ? [['目標達成ボーナス', bd.objBonus] as [string, number]] : []),
                  ['前季の年俸・運営費など', -bd.expenses],
                ] as [string, number][]).map(([label, v]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                    <span style={{ fontSize: 11, color: C.textDim }}>{label}</span>
                    <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: v >= 0 ? C.textSub : C.red }}>{v >= 0 ? '+' : '-'}{fmt(Math.abs(v))}</span>
                  </div>
                ))}
              </div>
            )}
            <Row label="総年俸" value={`-${fmt(squadSalaryTotal)}`} color={C.red} sub={`${rosterPlayers.length}名`} />
            <Row label="運営費" value={`-${fmt(opCost)}`} color={C.red} sub="グラントの10%" />
            <Row label="施設維持費" value={`-${fmt(facilityUpkeep)}`} color={C.red} sub={facLevelSum > 0 ? '施設Lvが高いほど高い' : '施設なし'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 4px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>収支</div>
              <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: seasonBalance >= 0 ? C.green : C.red, textShadow: seasonBalance >= 0 ? '0 0 10px rgba(46,204,113,0.4)' : '0 0 10px rgba(255,71,87,0.4)' }}>
                {fmt(seasonBalance, true)}
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.textDim, padding: '2px 0 6px', lineHeight: 1.6 }}>
              賞金・観客・スポンサー収入や順位グラントは<b style={{ color: C.textSub }}>来期の予算に反映</b>（シーズン終了時に確定）。
            </div>
          </div>
        </div>
      </div>

      <div style={{ margin: '0 14px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 8, paddingLeft: 2 }}>
          スポンサー契約 ({sponsorList.length}件)
        </div>
        <div style={{
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${C.goldDark}`,
          borderRadius: 14, padding: '4px 16px', position: 'relative', overflow: 'hidden',
          boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}>
          <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none', zIndex: 0 }}/>
          <div style={{ position: 'relative', zIndex: 1 }}>
            {sponsorList.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: C.textDim }}>
                スポンサーなし
              </div>
            ) : (
              <>
                {sponsorList.slice(0, 6).map(sp => (
                  <Row
                    key={sp.id}
                    label={sp.name}
                    value={fmt(sp.annualPayment) + '/年'}
                    color={C.green}
                    sub={`残り${sp.yearsLeft}年`}
                  />
                ))}
                <Row
                  label="年間スポンサー収入合計"
                  value={fmt(sponsorAnnual)}
                  color={C.green}
                />
              </>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', marginTop: 6 }}>
          <button onClick={() => navigate('/sponsors')} style={{
            background: 'none', border: 'none', color: C.gold,
            fontSize: 11, cursor: 'pointer', fontFamily: font, padding: '2px 0',
          }}>スポンサー管理 →</button>
        </div>
      </div>

      <div style={{ margin: '0 14px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 8, paddingLeft: 2 }}>
          高額給与 TOP5
        </div>
        <div style={{
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${C.goldDark}`,
          borderRadius: 14, padding: '4px 16px', position: 'relative', overflow: 'hidden',
          boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}>
          <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none', zIndex: 0 }}/>
          <div style={{ position: 'relative', zIndex: 1 }}>
            {topSalaries.map((p, i) => (
              <div
                key={p.id}
                onClick={() => openPlayerSheet(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 0',
                  borderBottom: i < topSalaries.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 7, overflow: 'hidden', border: `1px solid ${C.border2}`, flexShrink: 0 }}>
                  <PlayerFace playerId={p.id} nationality={p.nationality} size={30} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: C.textDim }}>残{p.contract.yearsLeft}年</div>
                </div>
                <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 800, color: C.textSub }}>
                  {fmt(p.contract.annualSalary)}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px' }}>
              <div style={{ fontSize: 11, color: C.textDim }}>総年俸（{rosterPlayers.length}名）</div>
              <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: C.text }}>{fmt(squadSalaryTotal)}</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', marginTop: 6 }}>
          <button onClick={() => navigate('/team/roster')} style={{
            background: 'none', border: 'none', color: C.gold,
            fontSize: 11, cursor: 'pointer', fontFamily: font, padding: '2px 0',
          }}>ロスター →</button>
        </div>
      </div>

      {(() => {
        const pastBudgets = myTeam?.history.seasonResults ?? []
        if (pastBudgets.length === 0) return null
        return (
          <div style={{ margin: '0 14px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 8, paddingLeft: 2 }}>
              過去シーズン成績
            </div>
            <div style={{
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${C.goldDark}`,
              borderRadius: 14, padding: '4px 16px', position: 'relative', overflow: 'hidden',
              boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none', zIndex: 0 }}/>
              <div style={{ position: 'relative', zIndex: 1 }}>
                {pastBudgets.slice(-5).reverse().map((r, i) => (
                  <Row
                    key={i}
                    label={`${r.year}シーズン`}
                    value={`${r.rank}位 / ${r.points}pt`}
                    color={r.rank === 1 ? C.gold : r.rank <= 3 ? C.green : C.textSub}
                  />
                ))}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
