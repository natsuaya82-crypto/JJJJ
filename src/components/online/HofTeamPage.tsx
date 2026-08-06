import { useState } from 'react'
import BackButton from '../ui/BackButton'
import PlayerRow from '../player/PlayerRow'
import PlayerFace from '../player/PlayerFace'
import ActionSheet from '../ui/ActionSheet'
import { useGameStore } from '../../store/gameStore'
import { HOF_MAX } from '../../utils/hofRoster'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 殿堂入りチーム。登録した瞬間の選手を凍らせて貯める（utils/hofRoster.ts）。
// 見た目はロスター（移籍方針ページ等）と同じ PlayerRow を使う。専用の並べ方を作らないこと。
export default function HofTeamPage() {
  const hof = useGameStore(s => s.hofRoster) ?? []
  const remove = useGameStore(s => s.removeHofPlayer)
  const [sheetId, setSheetId] = useState<string | null>(null)
  const sorted = [...hof].sort((a, b) => b.ovr - a.ovr)
  const target = sorted.find(h => h.player.id === sheetId)

  const badge = (text: string) => (
    <span style={{
      fontSize: 8, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
      backgroundColor: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.3)}`, color: C.gold,
    }}>{text}</span>
  )

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 90, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900 }}>HALL OF FAME</div>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>殿堂入りチーム</div>
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: hof.length >= HOF_MAX ? C.gold : C.textSub }}>
          {hof.length}<span style={{ fontSize: 11, color: C.textDim }}>/{HOF_MAX}</span>
        </div>
      </div>

      <div style={{ padding: '0 16px 10px', fontSize: 11, color: C.textDim }}>
        登録した時点の能力で固定。タップで外せます。
      </div>

      <div style={{ margin: '0 12px', borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {sorted.map(h => (
          <PlayerRow
            key={h.player.id}
            player={h.player}
            handlers={{ onClick: () => setSheetId(h.player.id) }}
            hideStatusBadges
            extra={badge(`${h.year}年 ${h.teamName}`)}
          />
        ))}
        {sorted.length === 0 && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: C.textGhost, fontSize: 13, lineHeight: 1.8 }}>
            まだ誰もいません<br />
            <span style={{ fontSize: 11 }}>選手のページから登録できます</span>
          </div>
        )}
      </div>

      {target && (
        <ActionSheet
          open={!!target}
          onClose={() => setSheetId(null)}
          header={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                <PlayerFace playerId={target.player.id} nationality={target.player.nationality} customFace={target.player.customFace} size={44} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{target.player.name}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{target.year}年 · {target.teamName} · OVR{target.ovr} で固定</div>
              </div>
            </div>
          }
          items={[{
            label: '殿堂入りから外す',
            color: C.red,
            onClick: () => { remove(target.player.id); setSheetId(null) },
          }]}
        />
      )}
    </div>
  )
}
