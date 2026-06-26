import { useGameStore } from '../../store/gameStore'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import { formatTime as fmtTime } from '../../engine/raceEngine'
import PlayerFace from '../player/PlayerFace'

function RadarChart({ vals, size = 180 }: { vals: [string, number][]; size?: number }) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.33
  const n = vals.length
  const angles = vals.map((_, i) => (i / n) * 2 * Math.PI - Math.PI / 2)

  const pt = (a: number, ratio: number) => ({
    x: cx + r * ratio * Math.cos(a),
    y: cy + r * ratio * Math.sin(a),
  })

  const gridPolygons = [0.25, 0.5, 0.75, 1.0].map(level =>
    angles.map(a => pt(a, level)).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  )

  const dataPolygon = vals
    .map(([, v], i) => pt(angles[i], Math.min(v, 100) / 100))
    .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridPolygons.map((pts, i) => (
        <polygon key={i} points={pts} fill="none"
          stroke={i === 3 ? '#2E2B42' : '#1A1828'}
          strokeWidth={i === 3 ? 1 : 0.5} />
      ))}
      {angles.map((a, i) => {
        const end = pt(a, 1)
        return <line key={i} x1={cx.toFixed(1)} y1={cy.toFixed(1)} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)} stroke="#1A1828" strokeWidth="0.5" />
      })}
      <polygon points={dataPolygon} fill="#C9A84C1A" stroke="#C9A84C" strokeWidth="1.5" />
      {vals.map(([, v], i) => {
        const p = pt(angles[i], Math.min(v, 100) / 100)
        return <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3" fill="#C9A84C" />
      })}
      {vals.map(([label], i) => {
        const lp = pt(angles[i], 1.26)
        return (
          <text key={i} x={lp.x.toFixed(1)} y={lp.y.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="10" fill="#9B97A8"
            fontFamily="'Noto Sans JP', system-ui, sans-serif">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

type Props = {
  playerId: string
  onClose: () => void
  showRecords?: boolean
}

export default function ScoutSheet({ playerId, onClose, showRecords = false }: Props) {
  const players = useGameStore(s => s.players)
  const currentSeason = useGameStore(s => s.currentSeason)

  const p = players.find(pl => pl.id === playerId)
  if (!p) return null

  const records: { raceName: string; segIndex: number; timeSec: number; rank: number }[] = []
  if (showRecords) {
    for (const race of currentSeason.races) {
      if (!race.results) continue
      for (const seg of race.results.segmentResults) {
        const runner = seg.runners.find(r => r.playerId === playerId)
        if (runner) {
          records.push({ raceName: race.name, segIndex: seg.segmentIndex, timeSec: runner.timeSec, rank: runner.rank })
        }
      }
    }
  }

  const rating = ovr(p)
  const specCol = SPEC_COLOR[p.specialty]

  const radarVals: [string, number][] = [
    ['速', p.ratings.speed],
    ['持', p.ratings.stamina],
    ['登', p.ratings.mountainUp],
    ['下', p.ratings.mountainDown],
    ['ペ', p.ratings.pacing],
    ['精', p.ratings.mental],
    ['回', p.ratings.recovery],
  ]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.65)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px',
        zIndex: 201,
        backgroundColor: '#14121F',
        borderTop: '2px solid #2E2B42',
        borderRadius: '20px 20px 0 0',
        paddingBottom: '80px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#2E2B42' }} />
        </div>

        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 16,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#5C5870', padding: 4,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div style={{ padding: '10px 16px 4px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <PlayerFace playerId={p.id} nationality={p.nationality} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#F0EDE8', marginBottom: 3 }}>{p.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ padding: '1px 6px', borderRadius: 8, backgroundColor: `${specCol}15`, color: specCol, fontSize: 9, fontWeight: 700 }}>
                {SPECIALTY_LABELS[p.specialty]}
              </span>
              <span style={{ fontSize: 9, color: '#5C5870' }}>{p.age}歳</span>
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'monospace', color: ratingColor(rating), flexShrink: 0 }}>
            {rating}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 0' }}>
          <RadarChart vals={radarVals} size={180} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '2px 16px 14px', flexWrap: 'wrap' }}>
          {radarVals.map(([label, val]) => (
            <div key={label} style={{ textAlign: 'center', minWidth: 28 }}>
              <div style={{ fontSize: 8, color: '#3A3758', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: val >= 75 ? '#C9A84C' : '#9B97A8', fontFamily: 'monospace' }}>{val}</div>
            </div>
          ))}
        </div>

        {showRecords && (
          <div style={{ padding: '0 12px 8px' }}>
            <div style={{ fontSize: 9, color: '#3A3758', letterSpacing: 2, marginBottom: 8, paddingLeft: 4 }}>RACE RECORDS</div>
            {records.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', color: '#3A3758', fontSize: 11 }}>記録なし</div>
            ) : records.map((rec, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', marginBottom: 4,
                backgroundColor: '#0E0D17', borderRadius: 8, border: '1px solid #1A1828',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: '#5C5870' }}>
                    {rec.raceName.length > 8 ? rec.raceName.slice(0, 8) + '…' : rec.raceName}
                  </span>
                  <span style={{ fontSize: 10, color: '#3A3758', marginLeft: 5 }}>第{rec.segIndex + 1}区</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#C9A84C', fontFamily: 'monospace' }}>
                  {fmtTime(rec.timeSec)}
                </span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: rec.rank <= 3 ? '#C9A84C' : '#5C5870' }}>
                  {rec.rank}位
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
