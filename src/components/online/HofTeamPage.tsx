import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import PlayerFace from '../player/PlayerFace'
import { useGameStore } from '../../store/gameStore'
import { HOF_MAX } from '../../utils/hofRoster'
import { SPECIALTY_LABELS } from '../../types'
import { ratingColor } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 殿堂入りチーム。登録した瞬間の選手を凍らせて貯めていく（utils/hofRoster.ts）。
// 監督が別のクラブへ移っても持ち越すので、いろんな年代・いろんなクラブの選手が並ぶ。
export default function HofTeamPage() {
  const navigate = useNavigate()
  const hof = useGameStore(s => s.hofRoster) ?? []
  const remove = useGameStore(s => s.removeHofPlayer)
  const sorted = [...hof].sort((a, b) => b.ovr - a.ovr)

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 90, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900 }}>HALL OF FAME</div>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>殿堂入りチーム</div>
        </div>
        <div style={{
          fontFamily: SAIRA, fontSize: 15, fontWeight: 900,
          color: hof.length >= HOF_MAX ? C.gold : C.textSub,
        }}>
          {hof.length}<span style={{ fontSize: 11, color: C.textDim }}>/{HOF_MAX}</span>
        </div>
      </div>

      <div style={{ padding: '0 16px 12px', fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
        登録した瞬間の能力で固定されます。本人が衰えても引退しても、ここは変わりません。<br />
        監督が別のチームへ移っても持ち越すので、年代もクラブもばらばらの30人を組めます。<br />
        登録は選手のページから。同じ選手をもう一度登録すると、そのときの能力で入れ替わります。
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', color: C.textDim, fontSize: 12, lineHeight: 1.9 }}>
          まだ誰もいません。<br />
          残したい選手のページを開いて「殿堂入りに登録」を押してください。
        </div>
      ) : (
        <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(h => (
            <div key={h.player.id} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 14,
              background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
              border: `1px solid ${alpha(C.gold, 0.22)}`,
            }}>
              <PlayerFace playerId={h.player.id} nationality={h.player.nationality} customFace={h.player.customFace} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.player.name}
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                  {h.year}年 · {h.teamName} · {SPECIALTY_LABELS[h.player.specialty]} · {h.player.age}歳
                </div>
              </div>
              <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: ratingColor(h.ovr), lineHeight: 1 }}>
                {h.ovr}
              </div>
              <button
                onClick={() => remove(h.player.id)}
                style={{
                  padding: '6px 10px', borderRadius: 9, cursor: 'pointer', flexShrink: 0,
                  background: 'transparent', border: `1px solid ${alpha(C.red, 0.45)}`,
                  color: C.red, fontSize: 10, fontWeight: 800, fontFamily: 'inherit',
                }}
              >外す</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '18px 16px 0' }}>
        <button
          onClick={() => navigate('/online')}
          style={{
            width: '100%', padding: 13, borderRadius: 12, cursor: 'pointer', fontFamily: SAIRA,
            background: 'transparent', border: `1px solid ${C.border2}`, color: C.textSub,
            fontSize: 13, fontWeight: 800,
          }}
        >オンラインへ戻る</button>
      </div>
    </div>
  )
}
