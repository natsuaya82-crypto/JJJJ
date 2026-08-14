import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { squadPlayersOf } from '../../utils/rosterSync'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import GlassButton from '../ui/GlassButton'
import { useGameStore } from '../../store/gameStore'
import type { Player } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { fmtYen } from '../../utils/money'
import { SPECIALTIES } from '../../utils/squadNeeds'
import { C, alpha, SAIRA } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import NewBadge from '../ui/NewBadge'
import ActionSheet from '../ui/ActionSheet'
import PlayerRow, { type RowHandlers } from '../player/PlayerRow'
import { ROSTER_MAX, ROSTER_MIN } from '../../data/rosterRules'
import SortSelect from '../ui/SortSelect'
import { comparePlayers, PLAYER_SORT_LABEL, type PlayerSortKey } from '../../utils/playerSort'

const SORT_OPTIONS: { value: PlayerSortKey; label: string }[] = [
  { value: 'ovr', label: PLAYER_SORT_LABEL.ovr },
  { value: 'age', label: PLAYER_SORT_LABEL.age },
]

function TeamStrengthPanel({ players }: { players: Player[] }) {
  const [open, setOpen] = useState(false)
  const mainPlayers = players.filter(p => p.status !== 'retired')
  if (mainPlayers.length === 0) return null

  const avgOvr = Math.round(mainPlayers.reduce((s, p) => s + ovr(p), 0) / mainPlayers.length)
  // 一覧・色・ラベルは1本から引く（ポジションを足すたびに3箇所直す状態だった）
  const specGroups = SPECIALTIES
  const specColors = SPEC_COLOR
  const specLabels = SPECIALTY_LABELS
  const specData = specGroups.map(spec => {
    const group = mainPlayers.filter(p => p.specialty === spec)
    const avg = group.length > 0 ? Math.round(group.reduce((s, p) => s + ovr(p), 0) / group.length) : 0
    return { spec, label: specLabels[spec], count: group.length, avg }
  }).filter(d => d.count > 0).sort((a, b) => b.avg - a.avg)

  const weakSpec = [...specData].sort((a, b) => a.avg - b.avg)[0]
  const injuredCount = players.filter(p => p.status === 'injured').length

  return (
    <div style={{ marginBottom: 12, position: 'relative' }}>
      <div onClick={() => setOpen(v => !v)} style={{
        padding: '11px 0', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        borderTop: `1px solid ${alpha(C.border3, 0.6)}`,
        borderBottom: `1px solid ${alpha(C.border3, open ? 0.35 : 0.6)}`,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9.5, color: C.textDim, letterSpacing: 2, marginBottom: 3 }}>チーム分析</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: ratingColor(avgOvr), fontFamily: SAIRA, lineHeight: 1 }}>{avgOvr}</span>
            <span style={{ fontSize: 9.5, color: C.textDim }}>平均OVR</span>
            {injuredCount > 0 && <span style={{ fontSize: 9.5, color: C.red, fontWeight: 700 }}>{injuredCount}名負傷中</span>}
            {weakSpec && <span style={{ fontSize: 9.5, color: C.textGhost }}>弱点: {weakSpec.label}</span>}
          </div>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: C.textGhost, flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      {open && (
        <div style={{ padding: '12px 0', borderBottom: `1px solid ${alpha(C.border3, 0.6)}` }}>
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



export default function TeamManagement() {
  const { teams, players: allPlayers, playerTeamId, currentSeason, openPlayerSheet, openContractInfo, getTeamPlayers, raceStrategy, setRaceStrategy, setTrainingPlan, setTrainingFocus } = useGameStore()
  const navigate = useNavigate()
  const { section } = useParams<{ section: string }>()
  const [activeTab, setActiveTab] = useState<'main' | 'loan'>('main')
  const [sortKey, setSortKey] = useState<PlayerSortKey>('ovr')
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

  // レンタルで借りている選手（teamId=自チーム・loan付きで所有者が他チーム）。roster配列外の別枠。
  const loanedIn = allPlayers.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId && p.status !== 'retired')
  const rosterSalary = allPlayers.filter(p => p.teamId === playerTeamId && p.status !== 'retired').reduce((s, p) => s + p.contract.annualSalary, 0)
  // ロスター人数は一覧と同じ数え方（rosterSync）。roster配列の長さだとズレたとき表示だけ食い違う
  const rosterCount = squadPlayersOf(allPlayers, playerTeamId).length
  const rawPlayers = activeTab === 'loan' ? loanedIn : getTeamPlayers(playerTeamId)
  const players = [...rawPlayers]
    .filter(p => searchQuery === '' || p.name.includes(searchQuery) || p.nameKana.includes(searchQuery))
    .filter(p => specFilter === 'all' || p.specialty === specFilter)
    .sort(comparePlayers(sortKey, sortKey === 'age' ? 'asc' : 'desc'))


  return (
    <div style={{ paddingTop: '4px', fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif" }}>
      <PageHeader title="ロスター" eyebrow={`${currentSeason.year} ROSTER`} />

      {/* クラブ（枠なし。細い線と文字だけ） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '0 18px 14px' }}>
        <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={40}/>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{team.name}</div>
          <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 2 }}>
            {team.city} ・ 設立{team.founded}年 ・ GM: {team.gmName}
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
              <GlassButton key={opt.key} color={opt.color} onClick={() => setRaceStrategy(opt.key)} style={{
                width: '100%', padding: '16px 18px', marginBottom: '8px',
                justifyContent: 'flex-start', gap: '14px', textAlign: 'left',
                fontFamily: 'inherit', whiteSpace: 'normal',
                opacity: active ? 1 : 0.72,
              }}>
                <div style={{ width: '48px', height: '48px', flexShrink: 0, backgroundColor: alpha(opt.color, active ? 0.25 : 0.08), border: `1px solid ${alpha(opt.color, active ? 0.6 : 0.25)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {active ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={opt.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> : <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: `2px solid ${alpha(opt.color, 0.4)}` }} />}
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '800', color: active ? C.text : C.textSub }}>{opt.label}</span>
                    {active && <span style={{ padding: '1px 7px',backgroundColor: alpha(opt.color, 0.25), color: opt.color, fontSize: '10px', fontWeight: '800', border: `1px solid ${alpha(opt.color, 0.4)}` }}>設定中</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: C.textDim, marginBottom: '3px', lineHeight: 1.4 }}>{opt.desc}</div>
                  <div style={{ fontSize: '10px', color: active ? opt.color : C.textGhost, fontWeight: '600' }}>{opt.stat}</div>
                </div>
              </GlassButton>
            )
          })}
        </div>
      )}

      {section === 'training' && (() => {
        const currentPlan = currentSeason.trainingPlan
        const myMainPlayers = allPlayers.filter(p => p.teamId === playerTeamId && p.status === 'active')
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
            <div style={{ padding: '10px 12px',backgroundColor: C.surface2, border: `1px solid ${C.border2}`, marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <span style={{ fontSize: '9px', color: C.textDim, letterSpacing: '2px' }}>チーム平均疲労度</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: avgFatigue >= 70 ? C.red : avgFatigue >= 50 ? C.gold : C.green, fontFamily: SAIRA }}>{avgFatigue}</span>
              </div>
              <div style={{ height: '5px',backgroundColor: C.border, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${avgFatigue}%`,backgroundColor: avgFatigue >= 70 ? C.red : avgFatigue >= 50 ? C.gold : C.green }} />
              </div>
              {avgFatigue >= 60 && <div style={{ fontSize: '9px', color: C.red, marginTop: '4px' }}>疲労が高め。回復調整を検討してください。</div>}
            </div>
            <div style={{ padding: '8px 12px',backgroundColor: alpha(C.green, 0.06), border: `1px solid ${alpha(C.green, 0.15)}`, marginBottom: '12px' }}>
              <div style={{ fontSize: '9px', color: C.green, fontWeight: '700', marginBottom: '4px', letterSpacing: '1px' }}>適用タイミング</div>
              <div style={{ fontSize: '10px', color: C.textDim, lineHeight: 1.5 }}>選んだプランは<span style={{ color: C.text }}>次のレース終了後</span>から自動適用される。</div>
            </div>
            <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '10px', padding: '0 2px' }}>チームトレーニング計画</div>
            {PLANS.map(plan => {
              const active = currentPlan === plan.key
              return (
                <GlassButton key={plan.key ?? 'none'} color={plan.color} onClick={() => setTrainingPlan(plan.key)} style={{
                  width: '100%', padding: '14px 18px', marginBottom: '8px',
                  justifyContent: 'flex-start', gap: '12px', textAlign: 'left',
                  fontFamily: 'inherit', whiteSpace: 'normal',
                  opacity: active ? 1 : 0.72,
                }}>
                  <div style={{ width: '44px', height: '44px', flexShrink: 0, backgroundColor: alpha(plan.color, active ? 0.25 : 0.08), border: `1px solid ${alpha(plan.color, active ? 0.5 : 0.2)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {active ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={plan.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> : <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: `2px solid ${alpha(plan.color, 0.4)}` }} />}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: active ? C.text : C.textSub }}>{plan.label}</span>
                      {active && <span style={{ padding: '1px 6px',backgroundColor: alpha(plan.color, 0.25), color: plan.color, fontSize: '9px', fontWeight: '800', border: `1px solid ${alpha(plan.color, 0.4)}` }}>実施中</span>}
                    </div>
                    <div style={{ fontSize: '10px', color: C.textDim, marginBottom: '3px', lineHeight: 1.4 }}>{plan.desc}</div>
                    <div style={{ fontSize: '10px', color: active ? plan.color : C.textGhost, fontWeight: '600' }}>効果: {plan.effect}</div>
                  </div>
                </GlassButton>
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
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',backgroundColor: C.surface2, border: `1px solid ${alpha(fatColor, 0.18)}` }}>
                      <div style={{ width: '4px', height: '32px',background: `linear-gradient(180deg, ${fatColor}, ${alpha(fatColor, 0.6)})`, flexShrink: 0 }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                          <NewBadge joinedYear={p.joinedYear} currentYear={currentSeason.year} size={7} />
                        </div>
                        <div style={{ height: '4px',backgroundColor: C.border, marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${fat}%`, backgroundColor: fatColor,}}/>
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: fatColor, fontFamily: SAIRA, flexShrink: 0 }}>{fat}</span>
                      <span style={{ fontSize: '9px', padding: '2px 6px',backgroundColor: alpha(fatColor, 0.15), color: fatColor, fontWeight: '700', border: `1px solid ${alpha(fatColor, 0.3)}`, flexShrink: 0, minWidth: '36px', textAlign: 'center' }}>{statusLabel}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '10px', padding: '0 2px' }}>個別トレーニング設定</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {[...myMainPlayers].sort(comparePlayers('ovr')).map(p => {
                  const currentFocus = (currentSeason.trainingAssignments ?? {})[p.id] ?? ''
                  const specCol = SPEC_COLOR[p.specialty]
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',backgroundColor: C.surface2, border: `1px solid ${C.border}` }}>
                      <div style={{ width: '3px', alignSelf: 'stretch',backgroundColor: specCol, flexShrink: 0 }}/>
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
                        style={{ padding: '5px 6px',border: `1px solid ${currentFocus ? alpha(C.gold, 0.4) : C.border2}`, backgroundColor: C.surface, color: currentFocus ? C.gold : C.textDim, fontSize: '10px', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0, outline: 'none' }}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px 8px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: SAIRA, fontSize: 17, fontWeight: 900, color: C.text }}>ロスター</span>
        {/* 20人未満は赤字で警告（下限15に近づいている） */}
        <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 800, color: rosterCount < 20 ? C.red : C.text }}>
          {rosterCount}<span style={{ fontSize: 11, color: C.textDim }}>/{ROSTER_MAX}</span>
          {rosterCount < 20 && <span style={{ fontSize: 9, marginLeft: 4 }}>下限{ROSTER_MIN}</span>}
        </span>
        <span style={{ fontSize: 11, color: C.textDim }}>総年俸 <span style={{ color: C.textSub, fontWeight: 700, fontFamily: SAIRA }}>{fmtYen(rosterSalary)}</span></span>
        <div style={{ flex: 1 }} />
        {loanedIn.length > 0 && (
          <button onClick={() => setActiveTab(activeTab === 'loan' ? 'main' : 'loan')} style={{
            padding: '5px 11px',cursor: 'pointer', fontFamily: SAIRA, fontSize: 11, fontWeight: 800,
            border: `1px solid ${activeTab === 'loan' ? C.gold : C.border2}`,
            background: activeTab === 'loan' ? alpha(C.gold, 0.15) : 'transparent',
            color: activeTab === 'loan' ? C.gold : C.textDim,
          }}>
            レンタル {loanedIn.length}
          </button>
        )}
      </div>

      {(
        <div style={{ padding: '10px 18px 10px', display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px', borderBottom: `1px solid ${alpha(C.border3, 0.6)}`, minWidth: 0 }}>
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
          <SortSelect options={SORT_OPTIONS} value={sortKey} onChange={setSortKey} style={{ flexShrink: 0 }} />
          <select value={specFilter} onChange={e => setSpecFilter(e.target.value)} style={{ padding: '0 8px',border: `1px solid ${C.border2}`, backgroundColor: C.border, color: C.textSub, fontSize: '11px', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }}>
            <option value="all">全ポジ</option>
            {SPECIALTIES.map(sp => <option key={sp} value={sp}>{SPECIALTY_LABELS[sp]}</option>)}
          </select>
        </div>
      )}

      {activeTab === 'main' && (
        <div style={{ padding: '0 12px', marginBottom: '0' }}>
          <TeamStrengthPanel players={rawPlayers}/>
        </div>
      )}

      {/* 一覧は箱に入れない。カードを縦に並べる */}
      <div style={{ margin: '0 18px 80px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
        const cardEnabled = !!mp && !isRental
        return (
          <ActionSheet
            open={!!mp}
            onClose={() => setMenuPlayerId(null)}
            header={mp ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{overflow: 'hidden', flexShrink: 0 }}>
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
        return createPortal((
          <>
            <div onClick={() => setReleasePlayerId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 320 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 321, width: 'calc(100% - 48px)', maxWidth: 360, background: C.surface, border: `1.5px solid ${C.border2}`,padding: '20px 18px', boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 8 }}>{rp.name}を解雇しますか？</div>
              <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.7, marginBottom: 4 }}>
                違約金：<span style={{ color: buyout > 0 ? C.red : C.textDim, fontWeight: 800 }}>{buyout > 0 ? fmtYen(buyout) : 'なし'}</span>
                {buyout > 0 && <span style={{ color: C.textDim }}>（年俸×残り{rp.contract.yearsLeft - 1}年分を即時支払い）</span>}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6, marginBottom: 14 }}>解雇した選手はフリーになり、戻すことはできません。</div>
              {releaseError && <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>最低ロスター人数を下回るため解雇できません。</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { const ok = releasePlayerWithBuyout(rp.id); if (ok) setReleasePlayerId(null); else setReleaseError(true) }}
                  style={{ flex: 1, padding: '12px',border: 'none', background: C.red, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  解雇する
                </button>
                <button onClick={() => setReleasePlayerId(null)}
                  style={{ flex: 1, padding: '12px',border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  やめる
                </button>
              </div>
            </div>
          </>
        ), document.body)
      })()}
    </div>
  )
}
