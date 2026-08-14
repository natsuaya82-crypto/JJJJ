import type { Team } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { useTeamHistory } from '../../lib/useTeamHistory'
import { titleRows } from '../../utils/teamHistory'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { panelStyle } from '../ui/Panel'


interface Props {
  team: Team
  seasonYear: number
  rank: number
  totalRaces: number
  completedRaces: number
  gmRep: number
  avgMorale: number
  seasonDone: boolean
}

export default function HeroCard({ team, seasonYear, rank, totalRaces, completedRaces, gmRep, avgMorale, seasonDone }: Props) {
  // 優勝回数はセーブに持たず、過去シーズンの順位表から数え直す（utils/teamHistory.ts）
  // ★**ホームはJPELの数だけ**（オーナー・2026-08-14「流石にjpelだけでいい」）。
  //   部ごとの内訳（1部2 / 3部1）は、幅のある記録室とチーム画面で出す。
  //   ここは3つ並ぶ数字の1つなので、他の2つ（GM評判・モラール）と同じく数字1つにする。
  const titles = useTeamHistory(team.id).titles
  const jpelTitles = titleRows(titles).reduce((n, r) => n + r.count, 0)
  const moraleColor = avgMorale >= 75 ? C.green : avgMorale >= 50 ? C.gold : C.red

  return (
    // ★チーム画面の看板と**同じ面**（チームカラー → 面 → 背景のグラデーション＋左の金帯）。
    //   ホームだけ枠なしにしていたので、同じクラブなのに画面で見え方が違っていた。
    <div style={{
      ...panelStyle(C.gold),
      margin: '12px 12px 0',
      background: `linear-gradient(135deg, ${team.colors.primary} 0%, ${C.surface} 55%, ${C.bg} 100%)`,
      padding: '16px 16px 14px',
    }}>
      {/* たすき（チーム画面と同じ） */}
      <div style={{
        position: 'absolute', top: '-40%', right: '-20%', width: 200, height: 200,
        background: `linear-gradient(135deg, transparent 45%, ${alpha(team.colors.secondary, 0.15)} 50%, transparent 55%)`,
        transform: 'rotate(15deg)', pointerEvents: 'none', zIndex: 0,
      }}/>
      {/* クラブ（枠なし。細い線と大きい数字だけで組む） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <TeamLogoSVG
          primary={team.colors.primary} secondary={team.colors.secondary}
          shortName={team.shortName} teamId={team.id} size={54}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: '3px' }}>
            {seasonYear} SEASON
          </div>
          <div style={{
            fontSize: 22, fontWeight: 900, color: C.text, lineHeight: 1.12,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{team.name}</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
            {team.city} ・ GM: {team.gmName}
          </div>
        </div>
        {!seasonDone && rank > 0 && (
          <div style={{ textAlign: 'right', lineHeight: 1 }}>
            <span style={{ fontFamily: SAIRA, fontSize: 32, fontWeight: 900, color: C.text }}>{rank}</span>
            <span style={{ fontSize: 12, color: C.textDim, marginLeft: 1 }}>位</span>
          </div>
        )}
      </div>

      {/* 進み具合 */}
      {!seasonDone && totalRaces > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: SAIRA, fontSize: 9.5, fontWeight: 800, color: C.textDim, letterSpacing: '2.5px' }}>SEASON PROGRESS</span>
            <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: C.textSub }}>
              {completedRaces} / {totalRaces}戦
            </span>
          </div>
          <div style={{ height: 3, background: alpha(C.border3, 0.7) }}>
            <div style={{
              height: '100%', background: C.cyan,
              width: `${(completedRaces / totalRaces) * 100}%`,
            }}/>
          </div>
        </div>
      )}

      {/* 数字3つ（枠なし・ヘアラインで区切る） */}
      <div style={{
        display: 'flex', marginTop: 16,
        borderTop: `1px solid ${alpha(C.border3, 0.6)}`, borderBottom: `1px solid ${alpha(C.border3, 0.6)}`,
      }}>
        {[
          { label: 'JPEL優勝', value: `${jpelTitles}`, color: C.text },
          { label: 'GM評判', value: `${gmRep}`, color: gmRep >= 70 ? C.green : gmRep >= 40 ? C.text : C.red },
          { label: 'モラール', value: `${avgMorale}`, color: moraleColor },
        ].map((item, i) => (
          <div key={item.label} style={{
            flex: 1, padding: '11px 0', textAlign: 'center',
            borderLeft: i === 0 ? 'none' : `1px solid ${alpha(C.border3, 0.6)}`,
          }}>
            <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: item.color, lineHeight: 1 }}>
              {item.value}
            </div>
            <div style={{ fontSize: 9.5, color: C.textDim, marginTop: 4, letterSpacing: '1px' }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
