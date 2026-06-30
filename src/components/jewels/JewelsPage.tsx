import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { showRewardAd } from '../../utils/ads'
import { C, alpha } from '../../styles/tokens'
import BackButton from '../ui/BackButton'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function JewelIcon({ size = 14, opacity = 1 }: { size?: number; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" fill="url(#jg-p)" stroke="#4ab8ea" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" fill="none" stroke="#a8e4ff" strokeWidth="0.6" strokeLinejoin="round" opacity="0.5" transform="scale(0.55) translate(10.9 10.9)"/>
      <defs>
        <linearGradient id="jg-p" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a8e4ff"/>
          <stop offset="100%" stopColor="#3b9fd4"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function J({ n, dim }: { n: number; dim?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <JewelIcon size={12} opacity={dim ? 0.4 : 1}/>
      <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: dim ? 'rgba(109,213,250,0.4)' : '#6dd5fa' }}>+{n}</span>
    </span>
  )
}

function Section({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 8px' }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: '#6dd5fa' }}/>
      <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 800, color: '#6dd5fa', letterSpacing: '3px' }}>{title}</span>
    </div>
  )
}

function Row({ label, right, sub }: { label: string; right: React.ReactNode; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${alpha(C.border, 0.5)}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: SAIRA, fontSize: 13, color: C.text }}>{label}</div>
        {sub && <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, marginTop: 2 }}>{sub}</div>}
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
      style={{ width: '100%', background: alpha(C.surface3, 0.5), border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <div>
        <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 700, color: C.text }}>{label}</div>
        <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, marginTop: 2 }}>{sub}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke={C.textDim} strokeWidth="2" strokeLinecap="round"/></svg>
    </button>
  )
}

export default function JewelsPage() {
  const { jewels, watchAd, lastAdDate, adsWatchedToday } = useGameStore()
  const [adResult, setAdResult] = useState<number | null>(null)
  const today = new Date().toDateString()
  const sameDay = lastAdDate === today
  const adsLeft = 3 - (sameDay ? (adsWatchedToday ?? 0) : 0)
  const handleWatchAd = async () => {
    if (adsLeft <= 0) return
    const ok = await showRewardAd()
    if (!ok) return
    const gained = watchAd()
    setAdResult(gained)
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
        <BackButton />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 11, color: '#6dd5fa', letterSpacing: '3px', fontWeight: 900 }}>CURRENCY</div>
          <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.text }}>ジュエル</div>
        </div>
      </div>

      {/* 残高 */}
      <div style={{ margin: '16px 16px 8px', background: 'linear-gradient(135deg, #0f2240 0%, #0a1729 100%)', border: `1px solid ${alpha('#6dd5fa', 0.35)}`, borderRadius: 16, padding: '20px', textAlign: 'center', boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(168,228,255,0.1)` }}>
        <div style={{ fontFamily: SAIRA, fontSize: 11, color: alpha('#6dd5fa', 0.6), letterSpacing: '3px', marginBottom: 8 }}>保有ジュエル</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <JewelIcon size={28}/>
          <span style={{ fontFamily: SAIRA, fontSize: 40, fontWeight: 900, color: '#6dd5fa', textShadow: '0 0 20px rgba(109,213,250,0.6)', lineHeight: 1 }}>{jewels.toLocaleString()}</span>
        </div>
      </div>

      {/* 広告視聴 */}
      <div style={{ margin: '12px 16px 0' }}>
        <div style={{ background: 'linear-gradient(135deg, #0f2240 0%, #0a1729 100%)', border: `1px solid ${alpha('#6dd5fa', adsLeft > 0 ? 0.4 : 0.15)}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: adsLeft > 0 ? '#6dd5fa' : C.textDim }}>広告を見る</div>
            <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, marginTop: 3 }}>残り {adsLeft} / 3 回 · 1日3回まで</div>
            {adResult !== null && (
              <div style={{ fontFamily: SAIRA, fontSize: 12, color: '#6dd5fa', marginTop: 4, fontWeight: 700 }}>+{adResult}J 受け取り済み</div>
            )}
          </div>
          <button
            onClick={handleWatchAd}
            disabled={adsLeft <= 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 10, cursor: adsLeft > 0 ? 'pointer' : 'default',
              background: adsLeft > 0 ? 'linear-gradient(180deg, #1a4a7a 0%, #0f2a4a 100%)' : C.surface2,
              border: `1px solid ${adsLeft > 0 ? alpha('#6dd5fa', 0.5) : C.border}`,
              fontFamily: SAIRA, fontSize: 15, fontWeight: 900,
              color: adsLeft > 0 ? '#6dd5fa' : C.textGhost, flexShrink: 0,
            }}
          >
            <JewelIcon size={14}/>
            +100
          </button>
        </div>
      </div>

      {/* 入手方法 */}
      <Section title="入手方法"/>
      <div style={{ margin: '0 16px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
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
