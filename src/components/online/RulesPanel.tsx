import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { secondsLeft } from '../../lib/serverTime'
import type { MatchRules } from '../../lib/roomsApi'
import { MATCH_COURSES, CATEGORY_LABEL, courseById, randomCourseIds, type CourseCategory } from '../../data/matchCourses'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const RACE_COUNTS = [1, 3, 5, 10] as const

type Props = {
  rules: MatchRules
  isHost: boolean
  /** 締め切り時刻（サーバー基準ms）。null なら時間制限なし */
  deadline: number | null
  /** いま部屋にいる人間のチーム数 */
  teams: number
  maxTeams: number
  onChange: (r: MatchRules) => void
  onConfirm: () => void
  busy?: boolean
}

/** 45秒のあいだホストがルールを決める画面。ゲストは同じ内容を見ているだけ。 */
export default function RulesPanel({ rules, isHost, deadline, teams, maxTeams, onChange, onConfirm, busy }: Props) {
  const [left, setLeft] = useState(() => (deadline ? secondsLeft(deadline) : 0))
  const [picking, setPicking] = useState<number | null>(null)

  useEffect(() => {
    if (!deadline) return
    setLeft(secondsLeft(deadline))
    const t = setInterval(() => setLeft(secondsLeft(deadline)), 250)
    return () => clearInterval(t)
  }, [deadline])

  const cpuMax = Math.max(0, maxTeams - teams)

  // レース数を変えたら、選んであるコースの本数も合わせる
  const setRaces = (races: MatchRules['races']) => {
    if (!isHost) return
    const courses = rules.courses === 'random'
      ? 'random' as const
      : resize(rules.courses, races)
    onChange({ ...rules, races, courses })
  }

  const setCourseMode = (mode: 'random' | 'pick') => {
    if (!isHost) return
    onChange({ ...rules, courses: mode === 'random' ? 'random' : randomCourseIds(rules.races) })
  }

  const list = rules.courses === 'random' ? [] : rules.courses

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* 残り時間 */}
      <div style={{ margin: '4px 12px 0', padding: '14px 16px', borderRadius: 16, textAlign: 'center', background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${alpha(C.gold, 0.4)}` }}>
        <div style={{ fontFamily: SAIRA, fontSize: 9, color: alpha(C.gold, 0.6), letterSpacing: '4px', fontWeight: 900 }}>RULES</div>
        <div style={{ fontFamily: SAIRA, fontSize: 40, fontWeight: 900, color: left <= 10 ? C.red : C.gold, lineHeight: 1.2 }}>{left}</div>
        <div style={{ fontSize: 10, color: C.textDim }}>{isHost ? 'ルールを決めてください' : 'ホストが決めています'}</div>
      </div>

      {/* レース数 */}
      <Row label="レース数">
        <Segmented
          options={RACE_COUNTS.map(n => ({ key: String(n), label: `${n}戦` }))}
          value={String(rules.races)}
          disabled={!isHost}
          onChange={k => setRaces(Number(k) as MatchRules['races'])}
        />
      </Row>

      {/* メンバー */}
      <Row label="出せる選手">
        <Segmented
          options={[{ key: 'all', label: '全員' }, { key: 'select20', label: '20人選抜' }]}
          value={rules.pool}
          disabled={!isHost}
          onChange={k => isHost && onChange({ ...rules, pool: k as MatchRules['pool'] })}
        />
      </Row>

      {/* コース */}
      <Row label="コース">
        <Segmented
          options={[{ key: 'random', label: 'ランダム' }, { key: 'pick', label: '選ぶ' }]}
          value={rules.courses === 'random' ? 'random' : 'pick'}
          disabled={!isHost}
          onChange={k => setCourseMode(k as 'random' | 'pick')}
        />
        {rules.courses !== 'random' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {list.map((id, i) => {
              const c = courseById(id)
              return (
                <button
                  key={i}
                  onClick={() => isHost && setPicking(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '9px 12px', borderRadius: 10, background: C.surface2,
                    border: `1px solid ${C.border}`, cursor: isHost ? 'pointer' : 'default', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: C.gold, width: 22 }}>R{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c?.name ?? '—'}
                  </span>
                  <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>
                    {c ? `${c.segments.length}区 ${c.distanceKm}km` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Row>

      {/* CPU */}
      <Row label="CPUを足す">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Step disabled={!isHost || rules.cpu <= 0} label="−" onClick={() => onChange({ ...rules, cpu: Math.max(0, rules.cpu - 1) })} />
          <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text, minWidth: 44, textAlign: 'center' }}>{rules.cpu}</div>
          <Step disabled={!isHost || rules.cpu >= cpuMax} label="＋" onClick={() => onChange({ ...rules, cpu: Math.min(cpuMax, rules.cpu + 1) })} />
          <div style={{ fontSize: 10, color: C.textDim }}>合計 {teams + rules.cpu} チーム</div>
        </div>
      </Row>

      {/* 決定 */}
      {isHost && (
        <div style={{ padding: '20px 12px 0' }}>
          <button onClick={onConfirm} disabled={busy} className="btn-press" style={{
            width: '100%', padding: '16px 14px', borderRadius: 14, border: `2px solid ${C.goldDark}`,
            background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
            boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5)',
            color: C.gold, fontFamily: SAIRA, fontSize: 17, fontWeight: 900, cursor: 'pointer', opacity: busy ? 0.5 : 1,
          }}>
            決定して選手を選ぶ
          </button>
        </div>
      )}

      {picking !== null && (
        <CoursePicker
          onPick={id => {
            const next = [...list]
            next[picking] = id
            onChange({ ...rules, courses: next })
            setPicking(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}

function resize(ids: string[], n: number): string[] {
  if (ids.length === n) return ids
  if (ids.length > n) return ids.slice(0, n)
  return [...ids, ...randomCourseIds(n - ids.length)]
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '18px 16px 0' }}>
      <div style={{ fontFamily: SAIRA, fontSize: 10, color: alpha(C.gold, 0.55), letterSpacing: '2px', fontWeight: 900, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

function Segmented({ options, value, disabled, onChange }: {
  options: { key: string; label: string }[]
  value: string
  disabled?: boolean
  onChange: (key: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(o => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            onClick={() => !disabled && onChange(o.key)}
            style={{
              flex: 1, padding: '10px 4px', borderRadius: 10,
              border: `2px solid ${on ? C.gold : C.border2}`,
              background: on ? alpha(C.gold, 0.15) : C.surface2,
              color: on ? C.gold : C.textDim,
              fontFamily: SAIRA, fontSize: 13, fontWeight: 900,
              cursor: disabled ? 'default' : 'pointer', opacity: disabled && !on ? 0.5 : 1,
            }}
          >{o.label}</button>
        )
      })}
    </div>
  )
}

function Step({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={() => !disabled && onClick()} style={{
      width: 44, height: 44, borderRadius: 12, border: `2px solid ${disabled ? C.border2 : C.goldDark}`,
      background: C.surface2, color: disabled ? C.textGhost : C.gold,
      fontFamily: SAIRA, fontSize: 20, fontWeight: 900, cursor: disabled ? 'default' : 'pointer',
    }}>{label}</button>
  )
}

/** コースを選ぶ全画面リスト。1軍・リザーブ・ECLの34コースから選ぶ。
 *  ページ側は変形アニメが掛かっていて重なり順が効かないので、body直下に出す。 */
function CoursePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<CourseCategory>('main')
  const rows = useMemo(() => MATCH_COURSES.filter(c => c.category === tab), [tab])

  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: C.bg,
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 8px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: C.text, flex: 1 }}>コースを選ぶ</div>
        <button onClick={onClose} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 11, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>閉じる</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px' }}>
        {(['main', 'reserve', 'ecl'] as CourseCategory[]).map(k => {
          const on = k === tab
          return (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: '9px 4px', borderRadius: 10,
              border: `2px solid ${on ? C.gold : C.border2}`,
              background: on ? alpha(C.gold, 0.15) : C.surface2,
              color: on ? C.gold : C.textDim, fontFamily: SAIRA, fontSize: 12, fontWeight: 900, cursor: 'pointer',
            }}>{CATEGORY_LABEL[k]}</button>
          )
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(c => (
          <button key={c.id} onClick={() => onPick(c.id)} className="btn-press" style={{
            width: '100%', textAlign: 'left', padding: '11px 13px', borderRadius: 12,
            background: C.surface2, border: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{c.name}</div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, marginTop: 2 }}>
              {c.location}・{c.segments.length}区間・{c.distanceKm}km
            </div>
          </button>
        ))}
      </div>
    </div>
  ), document.body)
}
