import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore, reinforcementBanned } from '../../store/gameStore'
import { useTeamHistory } from '../../lib/useTeamHistory'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { operatingCostOf } from '../../data/economy'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const font = "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif"

// 財務ページは万円単位で統一表示（例: 4.2億→42,000万、3500万→3,500万）。
// 丸めないので内訳の合計が初期予算とぴったり一致して見える
function fmt(yen: number, showSign = false) {
  const sign = showSign && yen >= 0 ? '+' : ''
  return `${sign}${Math.round(yen / 10_000).toLocaleString()}万`
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
  const longPress = usePlayerLongPress()

  const myTeam = teams.find(t => t.id === playerTeamId)
  // 過去シーズンの成績はセーブに持たず、順位表から数え直す（utils/teamHistory.ts）
  const myHistory = useTeamHistory(playerTeamId)
  const myPlayers = players.filter(p => p.teamId === playerTeamId)
  // フラット化：1軍/2軍の区別なし。全ロスターをまとめて扱う
  const rosterPlayers = myPlayers.filter(p => p.status !== 'retired')

  const budget = myTeam?.finance.budget ?? 0
  const squadSalaryTotal = rosterPlayers.reduce((s, p) => s + p.contract.annualSalary, 0)

  const myTeamSponsorIds = myTeam?.sponsors ?? []
  const myPersonalSponsorIds = rosterPlayers.flatMap(p => p.personalSponsors ?? [])
  const allSponsorIds = [...myTeamSponsorIds, ...myPersonalSponsorIds]
  const sponsorList = allSponsorIds
    .map(id => (sponsors ?? []).find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s != null)
  const sponsorAnnual = sponsorList.reduce((s, sp) => s + sp.annualPayment, 0)

  // 運営費＝総年俸の1割（施設維持費は廃止。施設レベルそのものは残る）
  const opCost = operatingCostOf(squadSalaryTotal)
  // 初期予算（そのシーズンの開始予算・固定）と今季収支（初期予算 ＋ 移籍金収支 − 固定支出）
  const initialBudget = currentSeason.initialBudget ?? budget
  const transferIncome = currentSeason.transferIncome ?? 0
  const transferSpend = currentSeason.transferSpend ?? 0
  // 期末残高は「今の残高 − シーズン終了時に精算する固定支出」。
  // 以前は初期予算＋移籍金収支から組み立て直していたため、ECL賞金・イベント・海外移籍金などが
  // 一切乗らず、来季の初期予算と数字が合わなかった。実際の残高を基準にする。
  const otherIncome = budget - (initialBudget + transferIncome - transferSpend)
  const seasonBalance = budget - squadSalaryTotal - opCost
  // 初期予算の内訳（2年目以降。前季endSeasonで確定）。何が合わさって初期予算かを表示。
  // 旧形式（繰越=精算前の期末残高・支出が別行）のセーブは、表示時に精算後の最終収支へ変換する
  const bdRaw = currentSeason.budgetBreakdown
  const bd = bdRaw ? { ...bdRaw, carryover: bdRaw.carryover - (bdRaw.expenses ?? 0), expenses: 0 } : undefined
  const banned = reinforcementBanned(myTeam)
  const deficitStreak = myTeam?.finance.deficitStreak ?? 0

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
                  ['昨年繰越（最終収支）', bd.carryover],
                  ['クラブ予算', bd.grant],
                  ...(bd.raceIncome > 0 ? [['区間賞賞金', bd.raceIncome] as [string, number]] : []),
                  ['スポンサー収入', bd.sponsor],
                  ...(bd.objBonus > 0 ? [['目標達成ボーナス', bd.objBonus] as [string, number]] : []),
                ] as [string, number][]).map(([label, v]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                    <span style={{ fontSize: 11, color: C.textDim }}>{label}</span>
                    <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: v >= 0 ? C.textSub : C.red }}>{v >= 0 ? '+' : '-'}{fmt(Math.abs(v))}</span>
                  </div>
                ))}
              </div>
            )}
            {transferIncome > 0 && <Row label="移籍金収入" value={`+${fmt(transferIncome)}`} color={C.green} sub="選手・指名権の売却" />}
            {transferSpend > 0 && <Row label="移籍金支出" value={`-${fmt(transferSpend)}`} color={C.red} sub="移籍金での選手獲得" />}
            {otherIncome !== 0 && <Row label="その他収支" value={`${otherIncome >= 0 ? '+' : '-'}${fmt(Math.abs(otherIncome))}`} color={otherIncome >= 0 ? C.green : C.red} sub="ECL賞金・イベント・海外移籍など" />}
            <Row label="総年俸" value={`-${fmt(squadSalaryTotal)}`} color={C.red} sub={`${rosterPlayers.length}名`} />
            <Row label="運営費" value={`-${fmt(opCost)}`} color={C.red} sub="総年俸の10%" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 4px', borderTop: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>期末残高</div>
                <div style={{ fontSize: 9, color: C.textGhost }}>来季へ繰り越す総額</div>
              </div>
              <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: seasonBalance >= 0 ? C.green : C.red, textShadow: seasonBalance >= 0 ? '0 0 10px rgba(46,204,113,0.4)' : '0 0 10px rgba(255,71,87,0.4)' }}>
                {fmt(seasonBalance, true)}
              </div>
            </div>
            {/* 「今季の純増」＝繰越を除いた今シーズン単体の損益。残高が大きくても純増は小さい、を明示する */}
            {(() => {
              const carryover = bd?.carryover ?? 0
              const netThisSeason = seasonBalance - carryover
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 6px' }}>
                  <div style={{ fontSize: 11, color: C.textSub }}>今季の純増<span style={{ fontSize: 9, color: C.textGhost }}>（繰越・移籍金を含む）</span></div>
                  <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: netThisSeason >= 0 ? C.green : C.red }}>{fmt(netThisSeason, true)}</div>
                </div>
              )
            })()}

            {/* 連続赤字＝補強禁止のカウント。判定はシーズン終了時の「期末残高がマイナスかどうか」だけ。
                以前ここに置いていた「単年営業収支」の見込み表示は、確定値ではなく画面を開くたびに
                今季の先を計算し直す予測だったため、上の期末残高と食い違って見えるだけの表示になっていた。撤去。 */}
            <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim, lineHeight: 1.7 }}>
              <div>連続赤字: <b style={{ color: deficitStreak > 0 ? C.red : C.textSub, fontFamily: SAIRA, fontSize: 12 }}>{deficitStreak}年</b>
                <span style={{ color: C.textGhost }}>（シーズン終了時に期末残高がマイナスなら+1年。3年で補強禁止＋ドラフト指名権の強制売却）</span>
              </div>
              {banned && (
                <div style={{ marginTop: 3, color: C.orange }}>
                  現在<b>補強禁止中</b>（{budget < 0 ? '残高マイナス' : `${deficitStreak}年連続赤字`}）。期末残高をプラスで終えると解除されます
                </div>
              )}
            </div>

            <div style={{ fontSize: 10, color: C.textDim, padding: '2px 0 6px', lineHeight: 1.6 }}>
              クラブ予算とスポンサー収入は<b style={{ color: C.textSub }}>来期の予算に反映</b>（シーズン終了時に確定）。成績はクラブ予算そのものを動かします。
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
                {...longPress(p.id)}
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
        const pastBudgets = myHistory.seasonResults
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
