import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import PageHeader from '../ui/PageHeader'
import PlayerFace from './PlayerFace'
import BottomSheet from '../ui/BottomSheet'
import { useAdHeight } from '../layout/Layout'
import Flag from '../ui/Flag'
import { useGameStore, MY_PLAYER_POINTS } from '../../store/gameStore'
import { SPECIALTY_LABELS } from '../../types'
import type { Specialty, Ratings, Nationality } from '../../types'
import { NATIONALITY_META, GEO_REGION_ORDER, natLabel } from '../../data/nationalities'
import { SPECIALTIES } from '../../utils/squadNeeds'
import { C, alpha, SAIRA, FONT, bottomStack, F } from '../../styles/tokens'
import ScreenPortal from '../ui/ScreenPortal'


const STATS: { key: keyof Ratings; label: string }[] = [
  { key: 'speed', label: '速力' },
  { key: 'stamina', label: '持久' },
  { key: 'mountainUp', label: '登り' },
  { key: 'mountainDown', label: '下り' },
  { key: 'pacing', label: 'ペース' },
  { key: 'mental', label: '精神' },
  { key: 'recovery', label: '回復' },
]
// 一覧は utils/squadNeeds の SPECIALTIES 1本（ポジションを足したらここも自動で増える）
// 国籍は地域ごとにまとめて出す（data/nationalities.ts の GeoRegion）
const NATS_BY_REGION = GEO_REGION_ORDER.map(geo => ({
  geo,
  list: (Object.keys(NATIONALITY_META) as Nationality[]).filter(n => NATIONALITY_META[n].geo === geo),
})).filter(g => g.list.length > 0)
const HAIRS = ['black_light', 'black_dark', 'brown_light', 'blond_light'] as const
const HAIR_LABEL: Record<string, string> = { black_light: '黒', black_dark: '黒(濃)', brown_light: '茶', blond_light: '金' }
const STAT_MAX = 99

export default function CreateMyPlayerPage() {
  const navigate = useNavigate()
  const createMyPlayer = useGameStore(s => s.createMyPlayer)
  // 作れるのは新規データの初年度に1人だけ（ドラフトに参加しない代わり）
  const TOTAL = MY_PLAYER_POINTS
  const alreadyCreated = useGameStore(s => s.inauguralPlayerCreated)

  const adH = useAdHeight()
  const [name, setName] = useState('')
  const [age, setAge] = useState(20)
  const [specialty, setSpecialty] = useState<Specialty>('ace')
  const [nationality, setNationality] = useState<Nationality>('JPN')
  const [natSheet, setNatSheet] = useState(false)
  const [ratings, setRatings] = useState<Ratings>(() => {
    // 初期値は「均等割り＋端数を速力へ」。合計がちょうど TOTAL になるので、
    // 開いた時点で残り0＝そのまま確定できる（500と560で初期値が変わる）
    const base = Math.floor(MY_PLAYER_POINTS / 7)
    const rest = MY_PLAYER_POINTS - base * 7
    return { speed: base + rest, stamina: base, mountainUp: base, mountainDown: base, pacing: base, mental: base, recovery: base }
  })
  const [face, setFace] = useState({ style: 3, eye: 5, hair: 'black_light' as typeof HAIRS[number], flip: false })
  const [done, setDone] = useState(false)

  const used = STATS.reduce((s, st) => s + ratings[st.key], 0)
  const remaining = TOTAL - used

  const setStat = (key: keyof Ratings, v: number) => {
    const clamped = Math.max(1, Math.min(STAT_MAX, v))
    // 合計560を超えないよう、増やす分は残りポイントまで
    const delta = clamped - ratings[key]
    if (delta > 0 && delta > remaining) return
    setRatings(r => ({ ...r, [key]: clamped }))
  }

  // 育て切った時の平均92（合計644）を試算表示：低い能力から水割り
  const grownCaps = (() => {
    const caps: Record<string, number> = {}
    for (const st of STATS) caps[st.key] = ratings[st.key]
    let budget = 644 - used
    let guard = 0
    while (budget > 0 && guard++ < 1000) {
      let low: string | null = null
      for (const st of STATS) { if (caps[st.key] < 92 && (low === null || caps[st.key] < caps[low])) low = st.key }
      if (!low) break
      caps[low] += 1; budget -= 1
    }
    return caps
  })()

  const canConfirm = name.trim().length > 0 && remaining === 0 && !alreadyCreated

  const confirm = () => {
    if (!canConfirm) return
    const ok = createMyPlayer({ name: name.trim(), age, specialty, nationality, ratings, customFace: face })
    if (ok) setDone(true)
  }

  if (alreadyCreated && !done) {
    return (
      <div style={{ fontFamily: FONT, minHeight: '100dvh', color: C.text, padding: 16 }}>
        <BackButton onClick={() => navigate('/')} />
        <div style={{ textAlign: 'center', padding: 40, color: C.textDim }}>マイプレイヤーは作成済みです（1回きり）。</div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={{ fontFamily: FONT, minHeight: '100dvh', color: C.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.gold, letterSpacing: 3, fontWeight: 900 }}>MY PLAYER CREATED</div>
        <div style={{overflow: 'hidden', border: `3px solid ${C.gold}`, boxShadow: `0 0 24px ${alpha(C.gold, 0.5)}` }}>
          <PlayerFace playerId="preview" nationality={nationality} size={120} customFace={face} />
        </div>
        <div style={{ fontSize: F.headLg, fontWeight: 900 }}>{name}</div>
        <div style={{ fontSize: F.bodyLg, color: C.textSub }}>{age}歳 ・ {SPECIALTY_LABELS[specialty]} ・ マイチームに加入</div>
        <button onClick={() => navigate('/team/roster')} className="btn-game btn-game--gold" style={{ width: '80%', marginTop: 8 }}><span className="btn-game__inner">ロスターで確認 →</span></button>
        <button onClick={() => navigate('/')} className="btn-press" style={{ width: '80%', padding: '12px 0',background: C.surface2, border: `2px solid ${C.border2}`, color: C.text, fontSize: F.sub, fontWeight: 900, cursor: 'pointer', fontFamily: SAIRA }}>ホームへ</button>
      </div>
    )
  }

  const card = (title: string, children: React.ReactNode) => (
    <div style={{ margin: '0 12px 12px',background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.goldDark}`, overflow: 'hidden' }}>
      <div style={{ padding: '9px 14px', borderBottom: `1px solid ${C.border}`, fontFamily: SAIRA, fontSize: F.body, fontWeight: 900, color: C.gold, letterSpacing: 1 }}>{title}</div>
      <div style={{ padding: '10px 12px 12px' }}>{children}</div>
    </div>
  )

  return (
    <div style={{ fontFamily: FONT, minHeight: '100dvh', color: C.text, paddingBottom: bottomStack(adH, { aboveNav: true, extra: 84 }) }}>
      <PageHeader title="マイプレイヤー作成" onBack={() => navigate('/')} />
      <div style={{ padding: '0 16px 10px', fontSize: F.label, color: C.textDim }}>初年度はドラフトに参加しない代わりに、選手を1人つくれます。</div>

      {/* プレビュー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '0 12px 12px', padding: 12,background: `linear-gradient(135deg, ${alpha(C.gold, 0.14)}, ${C.surface2})`, border: `2px solid ${C.goldDark}` }}>
        <div style={{overflow: 'hidden', border: `2px solid ${alpha(C.gold, 0.5)}`, flexShrink: 0 }}>
          <PlayerFace playerId="preview" nationality={nationality} size={72} customFace={face} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: F.title, fontWeight: 900, color: name ? C.text : C.textGhost }}>{name || '（名前未入力）'}</div>
          <div style={{ fontSize: F.label, color: C.textSub, marginTop: 2 }}>{age}歳 ・ {SPECIALTY_LABELS[specialty]}</div>
          <div style={{ fontSize: F.caption, color: C.textDim, marginTop: 3 }}>現OVR {Math.round(used / 7)} → 育成上限 平均{Math.round(Object.values(grownCaps).reduce((a, b) => a + b, 0) / 7)}</div>
        </div>
      </div>

      {card('名前・年齢', (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={name} onChange={e => setName(e.target.value.slice(0, 8))} placeholder="選手名（8文字まで）" maxLength={8}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px',background: C.surface, border: `1px solid ${C.border2}`, color: C.text, fontSize: F.subLg, fontFamily: FONT }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: F.body, color: C.textDim, width: 40 }}>国籍</span>
            <button onClick={() => setNatSheet(true)} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              background: C.surface, border: `1px solid ${C.border2}`, color: C.text, fontSize: F.bodyLg, cursor: 'pointer', fontFamily: FONT,
            }}>
              <Flag code={nationality} width={22} />
              <span style={{ flex: 1, textAlign: 'left' }}>{natLabel(nationality)}</span>
              <span style={{ color: C.textDim, fontSize: F.label }}>変更</span>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: F.body, color: C.textDim, width: 40 }}>年齢</span>
            {[18, 19, 20, 21, 22].map(a => (
              <button key={a} onClick={() => setAge(a)} style={{ flex: 1, padding: '7px 0',cursor: 'pointer', fontFamily: SAIRA, fontSize: F.sub, fontWeight: 800, border: 'none', background: age === a ? C.gold : C.surface, color: age === a ? '#fff' : C.textDim }}>{a}</button>
            ))}
          </div>
        </div>
      ))}

      {card('ポジション（レース相性に影響）', (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {SPECIALTIES.map(sp => (
            <button key={sp} onClick={() => setSpecialty(sp)} style={{ textAlign: 'left', padding: '8px 10px',cursor: 'pointer', background: specialty === sp ? alpha(C.gold, 0.18) : C.surface, border: `1.5px solid ${specialty === sp ? C.gold : C.border}`, fontFamily: FONT }}>
              <div style={{ fontSize: F.body, fontWeight: 800, color: specialty === sp ? C.gold : C.text }}>{SPECIALTY_LABELS[sp]}</div>
            </button>
          ))}
        </div>
      ))}

      {card(`能力を振り分け（残り ${remaining}）`, (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontSize: F.tiny, color: C.textGhost, marginBottom: 2 }}>合計{TOTAL}を振り分け。育て切ると全体平均が92（合計644）になるよう、低い能力から自動で伸びます。尖らせるほど残りの伸びしろが減ります。</div>
          {STATS.map(st => {
            const v = ratings[st.key]
            const cap = grownCaps[st.key]
            return (
              <div key={st.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: F.label, color: C.textSub, width: 36, flexShrink: 0 }}>{st.label}</span>
                <button onClick={() => setStat(st.key, v - 1)} style={{ width: 26, height: 26,border: `1px solid ${C.border2}`, background: C.surface, color: C.text, fontSize: F.title, cursor: 'pointer', flexShrink: 0 }}>−</button>
                <div style={{ flex: 1, position: 'relative', height: 8,background: C.border2, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${cap}%`, background: alpha(C.green, 0.35) }} />
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${v}%`, background: C.gold }} />
                </div>
                <button onClick={() => setStat(st.key, v + 1)} disabled={remaining <= 0} style={{ width: 26, height: 26,border: `1px solid ${C.border2}`, background: remaining <= 0 ? C.surface2 : C.surface, color: remaining <= 0 ? C.textGhost : C.text, fontSize: F.title, cursor: remaining <= 0 ? 'default' : 'pointer', flexShrink: 0 }}>＋</button>
                <span style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: C.text, width: 46, textAlign: 'right', flexShrink: 0 }}>{v}<span style={{ fontSize: F.tiny, color: C.green }}>→{cap}</span></span>
              </div>
            )
          })}
        </div>
      ))}

      {card('顔', (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{overflow: 'hidden', border: `1px solid ${C.border2}`, flexShrink: 0 }}>
            <PlayerFace playerId="preview" nationality={nationality} size={64} customFace={face} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <FaceRow label="髪型" onPrev={() => setFace(f => ({ ...f, style: (f.style + 23) % 24 }))} onNext={() => setFace(f => ({ ...f, style: (f.style + 1) % 24 }))} value={`${face.style + 1}/24`} />
            <FaceRow label="目" onPrev={() => setFace(f => ({ ...f, eye: (f.eye + 26) % 27 }))} onNext={() => setFace(f => ({ ...f, eye: (f.eye + 1) % 27 }))} value={`${face.eye + 1}/27`} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: F.caption, color: C.textDim, width: 30 }}>髪色</span>
              {HAIRS.map(h => (
                <button key={h} onClick={() => setFace(f => ({ ...f, hair: h }))} style={{ flex: 1, padding: '5px 0',cursor: 'pointer', fontSize: F.caption, fontWeight: 700, border: `1px solid ${face.hair === h ? C.gold : C.border}`, background: face.hair === h ? alpha(C.gold, 0.18) : C.surface, color: face.hair === h ? C.gold : C.textDim }}>{HAIR_LABEL[h]}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setFace(f => ({ ...f, flip: !f.flip }))} style={{ flex: 1, padding: '6px 0',cursor: 'pointer', fontSize: F.label, fontWeight: 700, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub }}>左右反転</button>
              <button onClick={() => setFace({ style: Math.floor(Math.random() * 24), eye: Math.floor(Math.random() * 27), hair: HAIRS[Math.floor(Math.random() * HAIRS.length)], flip: Math.random() < 0.5 })} style={{ flex: 1, padding: '6px 0',cursor: 'pointer', fontSize: F.label, fontWeight: 800, border: `1px solid ${C.goldDark}`, background: alpha(C.gold, 0.12), color: C.gold }}>ランダム</button>
            </div>
          </div>
        </div>
      ))}

      <BottomSheet open={natSheet} onClose={() => setNatSheet(false)} title="国籍">
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {NATS_BY_REGION.map(({ geo, list }) => (
            <div key={geo} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: F.caption, color: C.textDim, fontFamily: SAIRA, letterSpacing: 1, margin: '4px 2px 6px' }}>{geo}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {list.map(n => (
                  <button key={n} onClick={() => { setNationality(n); setNatSheet(false) }} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',cursor: 'pointer',
                    background: nationality === n ? alpha(C.gold, 0.18) : C.surface,
                    border: `1.5px solid ${nationality === n ? C.gold : C.border}`,
                    color: nationality === n ? C.gold : C.text, fontSize: F.body, fontFamily: FONT, textAlign: 'left',
                  }}>
                    <Flag code={n} width={20} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{natLabel(n)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>

      <ScreenPortal>
        {/* 確定バー（下部固定） */}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: bottomStack(adH, { aboveNav: true }), maxWidth: 480, margin: '0 auto', padding: '12px 14px 10px', background: `linear-gradient(180deg, transparent, ${C.bg} 40%)`, zIndex: 50 }}>
          <button onClick={confirm} disabled={!canConfirm} className={`btn-game ${canConfirm ? 'btn-game--gold' : ''}`} style={{ width: '100%', opacity: canConfirm ? 1 : 0.5 }}>
            <span className="btn-game__inner">{remaining !== 0 ? `残り ${remaining} を振り分けてください` : !name.trim() ? '名前を入力してください' : 'この選手で確定'}</span>
          </button>
        </div>
      </ScreenPortal>
    </div>
  )
}

function FaceRow({ label, value, onPrev, onNext }: { label: string; value: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: F.caption, color: C.textDim, width: 30 }}>{label}</span>
      <button onClick={onPrev} style={{ width: 30, height: 26,border: `1px solid ${C.border2}`, background: C.surface, color: C.text, fontSize: F.bodyLg, cursor: 'pointer' }}>◀</button>
      <span style={{ flex: 1, textAlign: 'center', fontFamily: SAIRA, fontSize: F.body, color: C.textSub }}>{value}</span>
      <button onClick={onNext} style={{ width: 30, height: 26,border: `1px solid ${C.border2}`, background: C.surface, color: C.text, fontSize: F.bodyLg, cursor: 'pointer' }}>▶</button>
    </div>
  )
}
