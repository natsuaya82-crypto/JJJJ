import { useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { Player, RosterTier, Team } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr, ratingColor, SPEC_COLOR, formColor } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import NewBadge from '../ui/NewBadge'
import ActionSheet from '../ui/ActionSheet'
import PlayerRow, { type RowHandlers } from '../player/PlayerRow'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function TeamStrengthPanel({ players }: { players: Player[] }) {
  const [open, setOpen] = useState(false)
  const mainPlayers = players.filter(p => p.status !== 'retired')
  if (mainPlayers.length === 0) return null

  const avgOvr = Math.round(mainPlayers.reduce((s, p) => s + ovr(p), 0) / mainPlayers.length)
  const specGroups = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder'] as const
  const specColors: Record<string, string> = { ace: C.gold, mountain_up: C.green, mountain_down: C.cyan, sprinter: C.pink, long: C.blue, allrounder: C.textSub, kick: '#FF6B35', grinder: '#AB8ED6' }
  const specLabels: Record<string, string> = { ace: 'エース', mountain_up: '山登り', mountain_down: '山下り', sprinter: 'スプリンター', long: '長距離', allrounder: 'オールラウンダー', kick: 'スパート型', grinder: '粘り型' }
  const specData = specGroups.map(spec => {
    const group = mainPlayers.filter(p => p.specialty === spec)
    const avg = group.length > 0 ? Math.round(group.reduce((s, p) => s + ovr(p), 0) / group.length) : 0
    return { spec, label: specLabels[spec], count: group.length, avg }
  }).filter(d => d.count > 0).sort((a, b) => b.avg - a.avg)

  const weakSpec = [...specData].sort((a, b) => a.avg - b.avg)[0]
  const injuredCount = players.filter(p => p.status === 'injured').length

  return (
    <div style={{ marginBottom: '12px', position: 'relative' }}>
      <div onClick={() => setOpen(v => !v)} style={{
        borderRadius: open ? '12px 12px 0 0' : '12px',
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${C.goldDark ?? '#b8860b'}`,
        padding: '10px 14px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '10px',
        boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '2px', marginBottom: '2px' }}>チーム分析</div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '22px', fontWeight: '900', color: ratingColor(avgOvr), fontFamily: SAIRA, lineHeight: 1 }}>{avgOvr}</span>
            <span style={{ fontSize: '9px', color: C.textDim }}>平均OVR</span>
            {injuredCount > 0 && <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '6px', backgroundColor: alpha(C.red, 0.09), color: C.red, fontWeight: '700', border: `1px solid ${alpha(C.red, 0.3)}` }}>{injuredCount}名負傷中</span>}
            {weakSpec && <span style={{ fontSize: '9px', color: C.textGhost }}>弱点: {weakSpec.label}</span>}
          </div>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: C.textGhost, flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      {open && (
        <div style={{ background: C.surface2, border: `2px solid ${C.goldDark ?? '#b8860b'}`, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '12px 14px' }}>
          {specData.map(({ spec, label, count, avg }) => {
            const col = specColors[spec]
            return (
              <div key={spec} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                <div style={{ width: '68px', fontSize: '9px', color: col, fontWeight: '700', flexShrink: 0 }}>{label}</div>
                <div style={{ fontSize: '16px', fontWeight: '900', color: ratingColor(avg), fontFamily: SAIRA, minWidth: '28px' }}>{avg}</div>
                <div style={{ fontSize: '9px', color: C.textGhost, flexShrink: 0 }}>{count}名</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


const TIER_MAX: Record<RosterTier, number> = { main: 40, second: 20 }

type SortKey = 'ovr' | 'age'




export default function TeamManagement() {
  const { teams, players: allPlayers, playerTeamId, currentSeason, openPlayerSheet, openContractInfo, getTeamPlayers, raceStrategy, setRaceStrategy, setTrainingPlan, setTrainingFocus } = useGameStore()
  const navigate = useNavigate()
  const { section } = useParams<{ section: string }>()
  const [activeTab, setActiveTab] = useState<RosterTier | 'loan'>('main')
  const [sortKey, setSortKey] = useState<SortKey>('ovr')
  const [searchQuery, setSearchQuery] = useState('')
  const [specFilter, setSpecFilter] = useState<string>('all')
  // 自チーム選手：タップ＝ボトムシートメニュー / 長押し＝選手詳細
  const [menuPlayerId, setMenuPlayerId] = useState<string | null>(null)
  // 解雇確認（違約金を見せてから実行）
  const [releasePlayerId, setReleasePlayerId] = useState<string | null>(null)
  const [releaseError, setReleaseError] = useState(false)
  const releasePlayerWithBuyout = useGameStore(s => s.releasePlayerWithBuyout)
  const lp = useRef<{ t?: number; long: boolean }>({ long: false })

  const rowHandlers = (pid: string): RowHandlers => ({
    onPointerDown: () => { lp.current.long = false; lp.current.t = window.setTimeout(() => { lp.current.long = true; openPlayerSheet(pid) }, 450) },
    onPointerUp: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onPointerLeave: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onPointerMove: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onClick: () => { if (lp.current.long) { lp.current.long = false; return } setMenuPlayerId(pid) },
  })

  const team = teams.find(t => t.id === playerTeamId)
  if (!team) return null

  const activeTier: RosterTier = activeTab === 'loan' ? 'main' : activeTab
  // レンタルで借りている選手（teamId=自チーム・loan付きで所有者が他チーム）。roster配列外の別枠。
  const loanedIn = allPlayers.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId && p.status !== 'retired')
  const rosterSalary = allPlayers.filter(p => p.teamId === playerTeamId && p.status !== 'retired').reduce((s, p) => s + p.contract.annualSalary, 0)
  const fmtYen = (y: number) => y >= 100000000 ? `${(y / 100000000).toFixed(1)}億` : `${Math.round(y / 10000)}万`
  const rawPlayers = activeTab === 'loan' ? loanedIn : getTeamPlayers(playerTeamId, activeTier)
  const players = [...rawPlayers]
    .filter(p => searchQuery === '' || p.name.includes(searchQuery) || p.nameKana.includes(searchQuery))
    .filter(p => specFilter === 'all' || p.specialty === specFilter)
    .sort((a, b) => {
      if (sortKey === 'age') return a.age - b.age
      return ovr(b) - ovr(a)
    })


  return (
    <div style={{ paddingTop: '4px', fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif" }}>
      <div style={{ padding: '8px 16px 4px' }}>
        <BackButton/>
      </div>

      <div style={{
        position: 'relative', overflow: 'hidden',
        margin: '0 12px 16px', borderRadius: '20px',
        background: `linear-gradient(135deg, ${team.colors.primary} 0%, ${C.bg} 65%)`,
        border: `3px solid ${C.gold}`,
        padding: '16px',
        boxShadow: `0 8px 0 #8b6914, 0 12px 30px rgba(0,0,0,0.65), inset 0 2px 0 rgba(255,255,255,0.15)`,
      }}>
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 16, pointerEvents: 'none' }}/>
        <svg style={{ position: 'absolute', right: 0, top: 0, opacity: 0.06 }} width="120" height="120" viewBox="0 0 100 100">
          <line x1="0" y1="0" x2="100" y2="100" stroke={team.colors.secondary} strokeWidth="6"/>
          <line x1="100" y1="0" x2="0" y2="100" stroke={team.colors.secondary} strokeWidth="6"/>
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={56}/>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: C.text, letterSpacing: '-0.5px' }}>{team.name}</div>
            <div style={{ fontSize: '11px', color: C.textSub, marginTop: '2px' }}>{team.city} • 設立{team.founded}年 • GM: {team.gmName}</div>
          </div>
        </div>
      </div>

      {section === 'tactics' && (
        <div style={{ padding: '0 12px', paddingBottom: '80px' }}>
          <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '14px', padding: '0 2px' }}>レース戦略</div>
          {([
            { key: 'aggressive' as const, label: '積極策', desc: '全区間で攻めの走り。順位を狙いに行くが疲労が大きく蓄積する。', stat: '疲労増加 +40% / 区間タイム向上', color: C.red, shadow: '#660e10' },
            { key: 'balanced' as const, label: 'バランス', desc: '攻守のバランスを取った標準戦略。安定した成績を目指す。', stat: '疲労標準 / 安定したパフォーマンス', color: C.gold, shadow: '#5a3500' },
            { key: 'conservative' as const, label: '省エネ策', desc: 'ペースを抑えて疲労を最小化。長期的なコンディション維持を優先。', stat: '疲労減少 -35% / タイムは落ちる', color: C.blue, shadow: '#1a2050' },
          ] as { key: 'aggressive' | 'balanced' | 'conservative'; label: string; desc: string; stat: string; color: string; shadow: string }[]).map(opt => {
            const active = raceStrategy === opt.key
            return (
              <button key={opt.key} onClick={() => setRaceStrategy(opt.key)} style={{
                width: '100%', padding: '16px 18px', marginBottom: '8px',
                borderRadius: 11, cursor: 'pointer',
                background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                border: `2px solid ${active ? opt.color : alpha(opt.color, 0.45)}`,
                color: opt.color,
                display: 'flex', alignItems: 'center', gap: '14px',
                fontFamily: 'inherit',
                boxShadow: `0 4px 0 ${opt.shadow}, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(opt.color, 0.3)}, transparent)`, pointerEvents: 'none' }}/>
                <div style={{ width: '48px', height: '48px', borderRadius: '13px', flexShrink: 0, backgroundColor: alpha(opt.color, active ? 0.25 : 0.08), border: `1px solid ${alpha(opt.color, active ? 0.6 : 0.25)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {active ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={opt.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> : <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: `2px solid ${alpha(opt.color, 0.4)}` }} />}
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '800', color: active ? C.text : C.textSub }}>{opt.label}</span>
                    {active && <span style={{ padding: '1px 7px', borderRadius: '8px', backgroundColor: alpha(opt.color, 0.25), color: opt.color, fontSize: '10px', fontWeight: '800', border: `1px solid ${alpha(opt.color, 0.4)}` }}>設定中</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: C.textDim, marginBottom: '3px', lineHeight: 1.4 }}>{opt.desc}</div>
                  <div style={{ fontSize: '10px', color: active ? opt.color : C.textGhost, fontWeight: '600' }}>{opt.stat}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {section === 'training' && (() => {
        const currentPlan = currentSeason.trainingPlan
        const myMainPlayers = allPlayers.filter(p => p.teamId === playerTeamId && p.rosterTier === 'main' && p.status === 'active')
        const PLANS = [
          { key: null, label: '通常トレーニング', desc: '標準的な練習メニュー。特定の能力を強化しない。', effect: '変化なし', color: C.textDim, shadow: '#333' },
          { key: '持久重視', label: '持久重視', desc: 'スタミナ向上に特化したトレーニング。長距離レースに強くなる。', effect: 'スタミナ +1 (確率35%)', color: C.green, shadow: '#0d3d22' },
          { key: 'スピード重視', label: 'スピード重視', desc: '速力向上のトレーニング。スプリント区間での活躍が期待できる。', effect: '速力 +1 (確率35%)', color: C.red, shadow: '#660e10' },
          { key: '精神強化', label: '精神強化', desc: '精神力・集中力を高める。プレッシャーに強くなる。', effect: '精神 +1 (確率35%)', color: C.blue, shadow: '#1a2050' },
          { key: '登り強化', label: '登り強化', desc: '山岳区間の走力を練習。山登り専門家でなくても効果あり。', effect: '登り +1 (確率35%)', color: C.orange, shadow: '#5a2800' },
          { key: '回復調整', label: '回復調整', desc: '激しいトレーニングを控え疲労回復を優先する調整期。', effect: '疲労 -8 (毎レース)', color: C.cyan, shadow: '#0e3f5a' },
        ]
        const avgFatigue = myMainPlayers.length > 0
          ? Math.round(myMainPlayers.reduce((s, p) => s + (p.fatigue ?? 0), 0) / myMainPlayers.length)
          : 0
        return (
          <div style={{ padding: '0 12px', paddingBottom: '80px' }}>
            <div style={{ padding: '10px 12px', borderRadius: '12px', backgroundColor: C.surface2, border: `1px solid ${C.border2}`, marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <span style={{ fontSize: '9px', color: C.textDim, letterSpacing: '2px' }}>チーム平均疲労度</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: avgFatigue >= 70 ? C.red : avgFatigue >= 50 ? C.gold : C.green, fontFamily: SAIRA }}>{avgFatigue}</span>
              </div>
              <div style={{ height: '5px', borderRadius: '3px', backgroundColor: C.border, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${avgFatigue}%`, borderRadius: '3px', backgroundColor: avgFatigue >= 70 ? C.red : avgFatigue >= 50 ? C.gold : C.green }} />
              </div>
              {avgFatigue >= 60 && <div style={{ fontSize: '9px', color: C.red, marginTop: '4px' }}>疲労が高め。回復調整を検討してください。</div>}
            </div>
            <div style={{ padding: '8px 12px', borderRadius: '10px', backgroundColor: alpha(C.green, 0.06), border: `1px solid ${alpha(C.green, 0.15)}`, marginBottom: '12px' }}>
              <div style={{ fontSize: '9px', color: C.green, fontWeight: '700', marginBottom: '4px', letterSpacing: '1px' }}>適用タイミング</div>
              <div style={{ fontSize: '10px', color: C.textDim, lineHeight: 1.5 }}>選んだプランは<span style={{ color: C.text }}>次のレース終了後</span>から自動適用される。</div>
            </div>
            <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '10px', padding: '0 2px' }}>チームトレーニング計画</div>
            {PLANS.map(plan => {
              const active = currentPlan === plan.key
              return (
                <button key={plan.key ?? 'none'} onClick={() => setTrainingPlan(plan.key)} style={{
                  width: '100%', padding: '14px 18px', marginBottom: '8px',
                  borderRadius: 11, cursor: 'pointer',
                  background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                  border: `2px solid ${active ? plan.color : alpha(plan.color, 0.45)}`,
                  color: plan.color,
                  display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'inherit',
                  boxShadow: `0 4px 0 ${plan.shadow}, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(plan.color, 0.3)}, transparent)`, pointerEvents: 'none' }}/>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0, backgroundColor: alpha(plan.color, active ? 0.25 : 0.08), border: `1px solid ${alpha(plan.color, active ? 0.5 : 0.2)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {active ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={plan.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> : <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: `2px solid ${alpha(plan.color, 0.4)}` }} />}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: active ? C.text : C.textSub }}>{plan.label}</span>
                      {active && <span style={{ padding: '1px 6px', borderRadius: '7px', backgroundColor: alpha(plan.color, 0.25), color: plan.color, fontSize: '9px', fontWeight: '800', border: `1px solid ${alpha(plan.color, 0.4)}` }}>実施中</span>}
                    </div>
                    <div style={{ fontSize: '10px', color: C.textDim, marginBottom: '3px', lineHeight: 1.4 }}>{plan.desc}</div>
                    <div style={{ fontSize: '10px', color: active ? plan.color : C.textGhost, fontWeight: '600' }}>効果: {plan.effect}</div>
                  </div>
                </button>
              )
            })}

            <div style={{ marginTop: '18px', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '10px', padding: '0 2px' }}>ローテーション管理</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {[...myMainPlayers].sort((a, b) => (b.fatigue ?? 0) - (a.fatigue ?? 0)).map(p => {
                  const fat = p.fatigue ?? 0
                  const fatColor = fat >= 70 ? C.red : fat >= 50 ? C.gold : C.green
                  const statusLabel = fat >= 70 ? '要休養' : fat >= 50 ? '注意' : '良好'
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '10px', backgroundColor: C.surface2, border: `1px solid ${alpha(fatColor, 0.18)}` }}>
                      <div style={{ width: '4px', height: '32px', borderRadius: '2px', background: `linear-gradient(180deg, ${fatColor}, ${alpha(fatColor, 0.6)})`, flexShrink: 0 }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                          <NewBadge joinedYear={p.joinedYear} currentYear={currentSeason.year} size={7} />
                        </div>
                        <div style={{ height: '4px', borderRadius: '2px', backgroundColor: C.border, marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${fat}%`, backgroundColor: fatColor, borderRadius: '2px' }}/>
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: fatColor, fontFamily: SAIRA, flexShrink: 0 }}>{fat}</span>
                      <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '6px', backgroundColor: alpha(fatColor, 0.15), color: fatColor, fontWeight: '700', border: `1px solid ${alpha(fatColor, 0.3)}`, flexShrink: 0, minWidth: '36px', textAlign: 'center' }}>{statusLabel}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '10px', padding: '0 2px' }}>個別トレーニング設定</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {[...myMainPlayers].sort((a, b) => ovr(b) - ovr(a)).map(p => {
                  const currentFocus = (currentSeason.trainingAssignments ?? {})[p.id] ?? ''
                  const specCol = SPEC_COLOR[p.specialty]
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '10px', backgroundColor: C.surface2, border: `1px solid ${C.border}` }}>
                      <div style={{ width: '3px', alignSelf: 'stretch', borderRadius: '2px', backgroundColor: specCol, flexShrink: 0 }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                          <NewBadge joinedYear={p.joinedYear} currentYear={currentSeason.year} size={7} />
                        </div>
                        <div style={{ fontSize: '9px', color: C.textDim }}>{p.age}歳 · OVR {ovr(p)}</div>
                      </div>
                      <select
                        value={currentFocus}
                        onChange={e => setTrainingFocus(p.id, e.target.value || null)}
                        style={{ padding: '5px 6px', borderRadius: '8px', border: `1px solid ${currentFocus ? alpha(C.gold, 0.4) : C.border2}`, backgroundColor: C.surface, color: currentFocus ? C.gold : C.textDim, fontSize: '10px', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0, outline: 'none' }}
                      >
                        <option value="">チーム計画</option>
                        <option value="speed">速力</option>
                        <option value="stamina">スタミナ</option>
                        <option value="mountainUp">山登り</option>
                        <option value="mountainDown">山下り</option>
                        <option value="pacing">ペース</option>
                        <option value="mental">精神</option>
                        <option value="recovery">回復</option>
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {(section === 'roster' || !section) && <>
      {/* ロスター見出し：人数・総年俸・（あれば）レンタルトグルを1行に集約 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: SAIRA, fontSize: 17, fontWeight: 900, color: C.text }}>ロスター</span>
        <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 800, color: C.gold }}>
          {team.roster.main.length}<span style={{ fontSize: 11, color: C.textDim }}>/{TIER_MAX.main}</span>
        </span>
        <span style={{ fontSize: 11, color: C.textDim }}>総年俸 <span style={{ color: C.textSub, fontWeight: 700, fontFamily: SAIRA }}>{fmtYen(rosterSalary)}</span></span>
        <div style={{ flex: 1 }} />
        {loanedIn.length > 0 && (
          <button onClick={() => setActiveTab(activeTab === 'loan' ? 'main' : 'loan')} style={{
            padding: '5px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: SAIRA, fontSize: 11, fontWeight: 800,
            border: `1px solid ${activeTab === 'loan' ? C.gold : C.border2}`,
            background: activeTab === 'loan' ? alpha(C.gold, 0.15) : 'transparent',
            color: activeTab === 'loan' ? C.gold : C.textDim,
          }}>
            レンタル {loanedIn.length}
          </button>
        )}
      </div>

      {(
        <div style={{ padding: '10px 12px 8px', display: 'flex', gap: '6px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px', borderRadius: '10px', backgroundColor: C.border, border: `1px solid ${C.border2}`, minWidth: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" stroke={C.textGhost} strokeWidth="2"/>
              <path d="M21 21l-4-4" stroke={C.textGhost} strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="選手名"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '12px', color: C.text, fontFamily: 'inherit', padding: '8px 0', minWidth: 0 }}
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textGhost, padding: 0, flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>}
          </div>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={{ padding: '0 8px', borderRadius: '10px', border: `1px solid ${C.border2}`, backgroundColor: C.border, color: C.textSub, fontSize: '11px', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }}>
            <option value="ovr">OVR順</option>
            <option value="age">年齢順</option>
          </select>
          <select value={specFilter} onChange={e => setSpecFilter(e.target.value)} style={{ padding: '0 8px', borderRadius: '10px', border: `1px solid ${C.border2}`, backgroundColor: C.border, color: C.textSub, fontSize: '11px', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }}>
            <option value="all">全ポジ</option>
            <option value="ace">エース</option>
            <option value="mountain_up">山登り</option>
            <option value="mountain_down">山下り</option>
            <option value="sprinter">スプリンター</option>
            <option value="long">長距離</option>
            <option value="allrounder">オール</option>
          </select>
        </div>
      )}

      {activeTab === 'main' && (
        <div style={{ padding: '0 12px', marginBottom: '0' }}>
          <TeamStrengthPanel players={rawPlayers}/>
        </div>
      )}

      <div style={{ margin: '0 12px', borderRadius: '14px', overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: '80px' }}>
          {players.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: C.textGhost, fontSize: '14px' }}>登録選手なし</div>
          ) : (
            players.map(p => <PlayerRow key={p.id} player={p} handlers={rowHandlers(p.id)} loanOwner={p.loan ? teams.find(t => t.id === p.loan!.ownerTeamId) : undefined}/>)
          )}
        </div>
      </>}

      {(() => {
        const mp = menuPlayerId ? allPlayers.find(p => p.id === menuPlayerId) : undefined
        const isRental = !!(mp?.loan && mp.loan.ownerTeamId !== playerTeamId)
        const cardEnabled = !!mp && mp.rosterTier === 'main' && !isRental
        return (
          <ActionSheet
            open={!!mp}
            onClose={() => setMenuPlayerId(null)}
            header={mp ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  <PlayerFace playerId={mp.id} nationality={mp.nationality} size={44} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{mp.name}</div>
                  <div style={{ fontSize: 10, color: C.textDim }}>{SPECIALTY_LABELS[mp.specialty]} · {mp.age}歳 · 残{mp.contract.yearsLeft}年</div>
                </div>
                <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: ratingColor(ovr(mp)) }}>{ovr(mp)}</div>
              </div>
            ) : undefined}
            items={mp ? [
              { label: 'チャット', onClick: () => { setMenuPlayerId(null); navigate(`/team/chat?player=${mp.id}`) } },
              { label: 'カード練習', disabled: !cardEnabled, onClick: () => { setMenuPlayerId(null); navigate(`/cards?player=${mp.id}`) } },
              { label: '契約確認', onClick: () => { setMenuPlayerId(null); openContractInfo(mp.id) } },
              { label: '解雇する', color: C.red, disabled: isRental, onClick: () => { setMenuPlayerId(null); setReleaseError(false); setReleasePlayerId(mp.id) } },
            ] : []}
          />
        )
      })()}

      {(() => {
        const rp = releasePlayerId ? allPlayers.find(p => p.id === releasePlayerId) : undefined
        if (!rp) return null
        const buyout = rp.contract.annualSalary * Math.max(0, rp.contract.yearsLeft - 1)
        return (
          <>
            <div onClick={() => setReleasePlayerId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 320 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 321, width: 'calc(100% - 48px)', maxWidth: 360, background: C.surface, border: `1.5px solid ${C.border2}`, borderRadius: 16, padding: '20px 18px', boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 8 }}>{rp.name}を解雇しますか？</div>
              <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.7, marginBottom: 4 }}>
                違約金：<span style={{ color: buyout > 0 ? C.red : C.textDim, fontWeight: 800 }}>{buyout > 0 ? fmtYen(buyout) : 'なし'}</span>
                {buyout > 0 && <span style={{ color: C.textDim }}>（年俸×残り{rp.contract.yearsLeft - 1}年分を即時支払い）</span>}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6, marginBottom: 14 }}>解雇した選手はフリーになり、戻すことはできません。</div>
              {releaseError && <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>最低ロスター人数を下回るため解雇できません。</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { const ok = releasePlayerWithBuyout(rp.id); if (ok) setReleasePlayerId(null); else setReleaseError(true) }}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: C.red, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  解雇する
                </button>
                <button onClick={() => setReleasePlayerId(null)}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  やめる
                </button>
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )
}
