import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { IconFlag, IconRace, IconTrophy } from '../icons/Icons'
import { courseDistanceKm } from '../../engine/ratedCourse'
import { Card, RankChip, RatedShell, TileButton } from './ratedUi'
import {
  canJoin, fetchMe, fetchResult, fetchToday,
  RESULT_HHMM, SUBMIT_DEADLINE_HHMM,
  type RatedMe, type RatedResult, type RatedToday,
} from '../../lib/ratedApi'
import { C, alpha, SAIRA } from '../../styles/tokens'

// ============================================================================
// レート戦のトップ。イベント → レート戦 → ここ。
//   1枚に「自分のレート・今日のコース・提出」を出して、
//   **結果と順位表は別ページ**（結果はレース再生に入るので、見出しの下に
//   埋め込むとレース画面が箱の中に入って狭くなる）。
// ============================================================================

export default function RatedPage() {
  const navigate = useNavigate()
  const hof = useGameStore(s => s.hofRoster)
  const [me, setMe] = useState<RatedMe | null>(null)
  const [today, setToday] = useState<RatedToday | null>(null)
  const [result, setResult] = useState<RatedResult | null>(null)

  useEffect(() => {
    void fetchMe().then(setMe)
    void fetchToday().then(setToday)
    void fetchResult().then(setResult)
  }, [])

  const eligible = canJoin(hof)
  const segCount = today?.course.segments.length ?? 0
  const submitted = Object.keys(me?.lineup ?? {}).length >= segCount && segCount > 0
  const myDelta = result ? (result.delta[result.meUserId] ?? 0) : 0

  return (
    <RatedShell title="レート戦">
      {/* 自分のレートと段位 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14,
        background: `linear-gradient(135deg, ${alpha(C.cyan, 0.18)}, ${C.surface2})`,
        border: `1px solid ${alpha(C.cyan, 0.4)}`, marginBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '2px', marginBottom: 2 }}>RATING</div>
          <div style={{ fontFamily: SAIRA, fontSize: 32, fontWeight: 900, color: C.text, lineHeight: 1 }}>
            {me?.rating ?? '—'}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <RankChip rating={me?.rating ?? 0} />
          <div style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>
            {me ? `${me.entrants}人中 ${me.overall}位` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: C.textDim }}>大会</div>
          <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 800, color: C.text }}>
            {today ? `${today.day} / ${today.totalDays}日目` : ''}
          </div>
        </div>
      </div>

      {!eligible && (
        <Card accent={C.orange}>
          <div style={{ fontSize: 12, color: C.orange, fontWeight: 800 }}>
            殿堂入り {hof?.length ?? 0} / 30
          </div>
        </Card>
      )}

      {/* 今日のコース */}
      {today && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>今日のコース</span>
            <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.cyan }}>
              {segCount}区間 / {courseDistanceKm(today.course)}km
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textDim }}>{today.dateISO}</span>
          </div>
          {/* 区間の起伏を横棒で。登り＝赤 / 下り＝青 / 平坦＝灰 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {today.course.segments.map(s => (
              <div key={s.index} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 26, fontSize: 9, color: C.textDim, fontFamily: SAIRA, flexShrink: 0 }}>{s.index}区</span>
                <span style={{ width: 44, fontSize: 10, color: C.textSub, fontFamily: SAIRA, flexShrink: 0 }}>{s.distanceKm}km</span>
                <div style={{ flex: 1, height: 7, borderRadius: 4, overflow: 'hidden', display: 'flex', background: C.surface }}>
                  <div style={{ width: `${s.uphillPct}%`, background: alpha(C.red, 0.75) }} />
                  <div style={{ width: `${100 - s.uphillPct - s.downhillPct}%`, background: alpha(C.textDim, 0.35) }} />
                  <div style={{ width: `${s.downhillPct}%`, background: alpha(C.blue, 0.75) }} />
                </div>
                <span style={{ width: 56, fontSize: 9, color: C.textDim, fontFamily: SAIRA, textAlign: 'right', flexShrink: 0 }}>
                  ↑{s.uphillPct} ↓{s.downhillPct}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: C.textDim }}>
            天候 {today.course.conditions.weather === 'sunny' ? '晴れ' : today.course.conditions.weather === 'rainy' ? '雨' : today.course.conditions.weather === 'windy' ? '強風' : 'くもり'}
            {'  '}気温 {today.course.conditions.temperature}度
          </div>
        </Card>
      )}

      {/* 締め切りと提出の状態（丸ボタンのすぐ上に1行だけ） */}
      {today && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', marginBottom: 10,
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: submitted ? C.green : C.gold }}>
            {submitted ? '提出ずみ' : '未提出'}
          </span>
          <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>
            {segCount}人 ／ 締め切り {SUBMIT_DEADLINE_HHMM} ／ 結果 翌{RESULT_HHMM}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: 11, color: C.textSub }}>
            あと {Math.floor(today.minutesLeft / 60)}:{String(today.minutesLeft % 60).padStart(2, '0')}
          </span>
        </div>
      )}

      {/* 四角い立体ボタン3つ */}
      <div style={{ display: 'flex', gap: 6 }}>
        <TileButton
          label="順位表" tone="blue" icon={<IconTrophy size={26} />}
          onClick={() => navigate('/online/rated/standings')}
        />
        <TileButton
          label={submitted ? '組み直す' : '参加する'} tone="gold" icon={<IconRace size={28} />}
          disabled={!eligible}
          onClick={() => navigate('/online/rated/lineup')}
        />
        <TileButton
          label="昨日の結果" tone={myDelta >= 0 ? 'green' : 'red'} icon={<IconFlag size={26} />}
          disabled={!result}
          onClick={() => navigate('/online/rated/result')}
        />
      </div>
    </RatedShell>
  )
}
