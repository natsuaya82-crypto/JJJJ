import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { C, alpha } from '../../styles/tokens'
import type { Achievement, AchievementRarity } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const RARITY_CONFIG: Record<AchievementRarity, { label: string; color: string; shadow: string; bg: string }> = {
  legendary: { label: 'LEGENDARY', color: '#ff9f1c', shadow: '#7a3b00', bg: alpha('#ff9f1c', 0.12) },
  gold:      { label: 'GOLD',      color: C.gold,    shadow: '#5a3500', bg: alpha(C.gold, 0.10) },
  silver:    { label: 'SILVER',    color: '#c0cdd8',  shadow: '#2a3a4a', bg: alpha('#c0cdd8', 0.08) },
  bronze:    { label: 'BRONZE',    color: '#cd7f32',  shadow: '#4a2a00', bg: alpha('#cd7f32', 0.08) },
}

const RARITY_ORDER: AchievementRarity[] = ['legendary', 'gold', 'silver', 'bronze']

const ALL_POSSIBLE: { id: string; name: string; desc: string; rarity: AchievementRarity }[] = [
  // bronze
  { id: 'top3_first',      name: '初TOP3',          desc: 'レースで初めてトップ3に入賞',           rarity: 'bronze' },
  { id: 'first_win',       name: '初勝利',           desc: 'レースで初めて1位を獲得',               rarity: 'bronze' },
  { id: 'first_seg_win',   name: '初区間賞',          desc: '初めて区間賞を獲得',                   rarity: 'bronze' },
  { id: 'season_complete', name: 'シーズン完走',      desc: '初めてのシーズンを完走した',           rarity: 'bronze' },
  { id: 'runner_up',       name: '準優勝',            desc: 'シーズン2位フィニッシュ',              rarity: 'bronze' },
  { id: 'youth_wave',      name: '若手の台頭',        desc: '22歳以下の選手を3人以上1軍に起用',     rarity: 'bronze' },
  { id: 'veteran_pride',   name: 'ベテランの意地',    desc: '35歳以上の選手が1軍で活躍',           rarity: 'bronze' },
  // silver
  { id: 'hat_trick',       name: 'ハットトリック',    desc: '1レースで3区間以上を制覇',             rarity: 'silver' },
  { id: 'segment_hunter',  name: '区間賞ハンター',    desc: '1シーズンで5区間賞以上を獲得',         rarity: 'silver' },
  { id: 'ace_breeder',     name: 'エース育成者',      desc: 'OVR85以上の選手を育成',               rarity: 'silver' },
  { id: 'mvp_maker',       name: 'MVP輩出',           desc: 'チームからMVP選手を輩出',             rarity: 'silver' },
  { id: 'deep_squad',      name: '選手層充実',        desc: '1軍登録選手が18名以上',               rarity: 'silver' },
  // gold
  { id: 'segment_sweep',   name: '区間完全制覇',      desc: '1レースで全区間1位を獲得',             rarity: 'gold' },
  { id: 'segment_king',    name: '区間賞の帝王',      desc: '1シーズンで10区間賞以上を獲得',        rarity: 'gold' },
  { id: 'champion',        name: 'リーグ王者',        desc: 'シーズン1位を獲得',                   rarity: 'gold' },
  { id: 'back_to_back',    name: '2連覇',             desc: '2シーズン連続で優勝',                 rarity: 'gold' },
  { id: 'ace_factory',     name: 'エース工場',        desc: 'OVR80以上の選手を2人以上保有',        rarity: 'gold' },
  // legendary
  { id: 'dynasty',         name: '王朝の始まり',      desc: '3連覇を達成',                         rarity: 'legendary' },
  { id: 'dynasty_5',       name: '黄金王朝',          desc: '通算5回の優勝を達成',                 rarity: 'legendary' },
]

function TrophyIcon({ rarity }: { rarity: AchievementRarity }) {
  const col = RARITY_CONFIG[rarity].color
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: col }}>
      <path d="M8 21h8M12 17v4M17 3H7v8a5 5 0 0010 0V3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 5H3v2a4 4 0 004 4M17 5h4v2a4 4 0 01-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function AchievementCard({ achieved, meta }: { achieved?: Achievement; meta: typeof ALL_POSSIBLE[0] }) {
  const earned = !!achieved
  const rc = RARITY_CONFIG[meta.rarity]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px', borderRadius: 10,
      background: earned ? rc.bg : alpha(C.surface2, 0.6),
      border: `1px solid ${earned ? alpha(rc.color, 0.35) : C.border}`,
      opacity: earned ? 1 : 0.5,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: earned
          ? `linear-gradient(180deg, ${alpha(rc.color, 0.18)} 0%, ${alpha(rc.color, 0.06)} 100%)`
          : 'linear-gradient(180deg, #1a2c47 0%, #0f1f38 100%)',
        border: `1px solid ${earned ? alpha(rc.color, 0.3) : C.border}`,
      }}>
        {earned
          ? <TrophyIcon rarity={meta.rarity} />
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: C.textGhost }}>
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 800, color: earned ? rc.color : C.textDim }}>{meta.name}</span>
          <span style={{
            fontFamily: SAIRA, fontSize: 8, fontWeight: 900, letterSpacing: '1px',
            padding: '1px 5px', borderRadius: 4,
            background: earned ? alpha(rc.color, 0.18) : alpha(C.textGhost, 0.1),
            color: earned ? rc.color : C.textGhost,
          }}>{rc.label}</span>
        </div>
        <div style={{ fontSize: 11, color: earned ? C.textSub : C.textGhost, lineHeight: 1.3 }}>{meta.desc}</div>
        {achieved?.earnedAtYear && (
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: alpha(rc.color, 0.7), marginTop: 2 }}>
            {achieved.earnedAtYear}年{achieved.earnedAtRace ? ` — ${achieved.earnedAtRace}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AchievementsPage() {
  const navigate = useNavigate()
  const { achievements } = useGameStore()
  const earned = achievements ?? []

  const grouped = RARITY_ORDER.map(rarity => ({
    rarity,
    items: ALL_POSSIBLE.filter(a => a.rarity === rarity),
    earnedCount: ALL_POSSIBLE.filter(a => a.rarity === rarity && earned.some(e => e.id === a.id)).length,
  }))

  const totalEarned = earned.length

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '14px' }}>
          <BackButton/>
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900' }}>ACHIEVEMENTS</div>
            <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: C.text }}>実績 / トロフィー</div>
          </div>
          <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 20, background: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.3)}` }}>
            <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.gold }}>{totalEarned}</span>
            <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}> / {ALL_POSSIBLE.length}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {grouped.map(({ rarity, items, earnedCount }) => {
          const rc = RARITY_CONFIG[rarity]
          return (
            <div key={rarity}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, background: rc.color }} />
                <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: rc.color, letterSpacing: '2px' }}>{rc.label}</span>
                <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, marginLeft: 'auto' }}>{earnedCount} / {items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(meta => (
                  <AchievementCard
                    key={meta.id}
                    meta={meta}
                    achieved={earned.find(e => e.id === meta.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
