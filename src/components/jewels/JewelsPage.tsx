import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { showRewardAd, getAdDay, ADS_PER_DAY } from '../../utils/ads'
import { C, alpha, SAIRA, F } from '../../styles/tokens'
import PageHeader from '../ui/PageHeader'
import ConfirmDialog from '../ui/ConfirmDialog'
import { JewelIcon } from '../icons/Icons'


function J({ n, dim }: { n: number; dim?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <JewelIcon size={12} opacity={dim ? 0.4 : 1}detailed />
      <span style={{ fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 800, color: dim ? 'rgba(109,213,250,0.4)' : C.jewel }}>+{n}</span>
    </span>
  )
}

function Section({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 8px' }}>
      <div style={{ width: 3, height: 14,background: C.jewel }}/>
      <span style={{ fontFamily: SAIRA, fontSize: F.label, fontWeight: 800, color: C.jewel, letterSpacing: '3px' }}>{title}</span>
    </div>
  )
}

function Row({ label, right, sub }: { label: string; right: React.ReactNode; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${alpha(C.border, 0.5)}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: SAIRA, fontSize: F.bodyLg, color: C.text }}>{label}</div>
        {sub && <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
      <div>{right}</div>
    </div>
  )
}

function LinkCard({ label, sub, path, onClick }: { label: string; sub: string; path?: string; onClick?: () => void }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => { if (path) navigate(path); onClick?.() }}
      style={{ width: '100%', background: alpha(C.surface3, 0.5), border: `1px solid ${C.border}`,padding: '12px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <div>
        <div style={{ fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 700, color: C.text }}>{label}</div>
        <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginTop: 2 }}>{sub}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke={C.textDim} strokeWidth="2" strokeLinecap="round"/></svg>
    </button>
  )
}

export default function JewelsPage() {
  const { jewels, watchAd, lastAdDate, adsWatchedToday } = useGameStore()
  const [adResult, setAdResult] = useState<{ before: number; after: number } | null>(null)
  const [watching, setWatching] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const sameDay = lastAdDate === getAdDay()
  const adsLeft = ADS_PER_DAY - (sameDay ? (adsWatchedToday ?? 0) : 0)
  const runWatchAd = async () => {
    setConfirmOpen(false)
    if (adsLeft <= 0 || watching) return
    setWatching(true)
    try {
      const ok = await showRewardAd()
      if (!ok) return
      const before = jewels
      const gained = watchAd()
      if (gained) setAdResult({ before, after: before + gained })
    } finally {
      setWatching(false)
    }
  }
  const handleWatchAd = () => {
    if (adsLeft <= 0 || watching) return
    setConfirmOpen(true)
  }

  return (
    <div style={{ minHeight: '100%' }}>
      {confirmOpen && (
        <ConfirmDialog
          title="動画を見ますか？"
          message={`動画を最後まで見ると +100J 受け取れます（残り ${adsLeft}/${ADS_PER_DAY} 回）。`}
          confirmLabel="動画を見る"
          accent={C.jewel}
          onConfirm={runWatchAd}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
      <div style={{ borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
        <PageHeader eyebrow="CURRENCY" title="ジュエル" />
      </div>

      {/* 残高 */}
      <div style={{ margin: '16px 16px 8px', background: `linear-gradient(135deg, #0f2240 0%, ${C.bg} 100%)`, border: `1px solid ${alpha(C.jewel, 0.35)}`,padding: '20px', textAlign: 'center', boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(168,228,255,0.1)` }}>
        <div style={{ fontFamily: SAIRA, fontSize: F.label, color: alpha(C.jewel, 0.85), letterSpacing: '3px', marginBottom: 8 }}>保有ジュエル</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <JewelIcon size={28}detailed />
          <span style={{ fontFamily: SAIRA, fontSize: 40, fontWeight: 900, color: C.jewel, textShadow: '0 0 20px rgba(109,213,250,0.6)', lineHeight: 1 }}>{jewels.toLocaleString()}</span>
        </div>
      </div>

      {/* 広告視聴 */}
      <div style={{ margin: '12px 16px 0' }}>
        <div style={{ background: `linear-gradient(135deg, #0f2240 0%, ${C.bg} 100%)`, border: `1px solid ${alpha(C.jewel, adsLeft > 0 ? 0.4 : 0.15)}`,padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: adsLeft > 0 ? C.jewel : C.textDim }}>広告を見る</div>
            <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginTop: 3 }}>残り {adsLeft} / 3 回 · 1日3回まで</div>
            {adResult !== null && (
              <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.jewel, marginTop: 4, fontWeight: 700 }}>
                {adResult.before.toLocaleString()} → {adResult.after.toLocaleString()} J（+{adResult.after - adResult.before}）
              </div>
            )}
          </div>
          <button
            onClick={handleWatchAd}
            disabled={adsLeft <= 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px',cursor: adsLeft > 0 ? 'pointer' : 'default',
              background: adsLeft > 0 ? 'linear-gradient(180deg, #1a4a7a 0%, #0f2a4a 100%)' : C.surface2,
              border: `1px solid ${adsLeft > 0 ? alpha(C.jewel, 0.5) : C.border}`,
              fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 900,
              color: adsLeft > 0 ? C.jewel : C.textGhost, flexShrink: 0,
            }}
          >
            <JewelIcon size={14}detailed />
            +100
          </button>
        </div>
      </div>

      {/* 入手方法 */}
      <Section title="入手方法"/>
      <div style={{ margin: '0 16px', background: C.surface2, border: `1px solid ${C.border}`,overflow: 'hidden' }}>
        <Row label="レース1位" right={<J n={20}/>}/>
        <Row label="レース2位" right={<J n={10}/>}/>
        <Row label="レース3位" right={<J n={5}/>}/>
        <Row label="区間賞" right={<J n={5}/>} sub="1区間ごと"/>
        <Row label="シーズン1位" right={<J n={200}/>} sub="最終順位ボーナス"/>
        <Row label="シーズン2位" right={<J n={100}/>} sub="最終順位ボーナス"/>
        <Row label="シーズン3位" right={<J n={50}/>} sub="最終順位ボーナス"/>
        <Row label="実績解除 (bronze)" right={<J n={10}/>}/>
        <Row label="実績解除 (silver)" right={<J n={20}/>}/>
        <Row label="実績解除 (gold)" right={<J n={50}/>}/>
        <Row label="実績解除 (legendary)" right={<J n={100}/>}/>
        <Row label="広告視聴" right={<J n={100}/>} sub="1日3回まで"/>
      </div>

      <div style={{ margin: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <LinkCard label="シーズン目標" sub="目標達成ごとにジュエル獲得" path="/objectives"/>
        <LinkCard label="ログインボーナス" sub="毎日ログインでジュエル獲得" path="/login-bonus"/>
        <LinkCard label="ショップ" sub="広告視聴でジュエル入手" path="/shop"/>
      </div>
    </div>
  )
}
