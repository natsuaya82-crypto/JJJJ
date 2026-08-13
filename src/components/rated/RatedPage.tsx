import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG } from '../icons/Icons'
import { courseDistanceKm } from '../../engine/ratedCourse'
import { rankOf } from '../../engine/rating'
import FinishPanel from '../online/FinishPanel'
import {
  canJoin, fetchMe, fetchResult, fetchStandings, fetchToday, ratedCourseOf,
  RESULT_HHMM, SUBMIT_DEADLINE_HHMM,
  type RatedMe, type RatedResult, type RatedRow, type RatedToday,
} from '../../lib/ratedApi'
import { C, alpha, SAIRA, FONT } from '../../styles/tokens'

// ============================================================================
// レート戦。イベント → レート戦 → ここ。
//   今日  … その日のコースと提出（23:59まで何度でも編集できる）
//   結果  … 前日の順位。レースを見ることもできる
//   順位  … 大会全体のレート順
//
// ★段位の名前を直書きしないこと（`engine/rating` の rankOf を呼ぶ）。
// ★サーバーとのやりとりは `lib/ratedApi` 1本（いまは仮のデータを返している）。
// ============================================================================

/** 段位の色。**名前は rating.ts が持ち、色だけここ** */
const RANK_COLOR: Record<string, string> = {
  ブロンズ: '#b87333', シルバー: '#b8c4d0', ゴールド: '#f5c842',
  プラチナ: '#7fe3d4', ダイヤモンド: '#7fc4ff', マスター: '#c78bff', レジェンド: '#ff8a5c',
}

const fmtTime = (s: number) =>
  `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`

function RankChip({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const name = rankOf(rating)
  const col = RANK_COLOR[name] ?? C.textSub
  return (
    <span style={{
      fontSize: size === 'sm' ? 9 : 11, fontWeight: 900, color: col,
      background: alpha(col, 0.14), border: `1px solid ${alpha(col, 0.5)}`,
      borderRadius: 6, padding: size === 'sm' ? '1px 5px' : '2px 8px', whiteSpace: 'nowrap',
    }}>{name}</span>
  )
}

function Card({ children, accent = C.cyan }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      border: `1px solid ${alpha(accent, 0.25)}`, borderRadius: 14,
      padding: '12px 14px', marginBottom: 10,
    }}>{children}</div>
  )
}

export default function RatedPage() {
  const navigate = useNavigate()
  const hof = useGameStore(s => s.hofRoster)
  const [tab, setTab] = useState<'today' | 'result' | 'standings'>('today')
  const [me, setMe] = useState<RatedMe | null>(null)
  const [today, setToday] = useState<RatedToday | null>(null)
  const [result, setResult] = useState<RatedResult | null>(null)
  const [standings, setStandings] = useState<RatedRow[] | null>(null)

  useEffect(() => {
    void fetchMe().then(setMe)
    void fetchToday().then(setToday)
    void fetchResult().then(setResult)
    void fetchStandings().then(setStandings)
  }, [])

  const eligible = canJoin(hof)
  const segCount = today?.course.segments.length ?? 0
  const submitted = Object.keys(me?.lineup ?? {}).length >= segCount && segCount > 0

  return (
    <div style={{ fontFamily: FONT, paddingBottom: 90, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '8px 12px 0' }}><BackButton /></div>
      <div style={{ padding: '8px 16px 12px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.cyan, letterSpacing: '3px', fontWeight: 900, marginBottom: 4 }}>RATED SERIES</div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>レート戦</div>
      </div>

      {/* 自分のレートと段位 */}
      <div style={{ padding: '0 12px' }}>
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
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px' }}>
        {([['today', '今日'], ['result', '結果'], ['standings', '順位表']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="btn-press" style={{
            flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 800,
            border: `1px solid ${tab === k ? C.cyan : C.border3}`,
            background: tab === k ? alpha(C.cyan, 0.16) : 'transparent',
            color: tab === k ? C.cyan : C.textSub,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px' }}>
        {tab === 'today' && today && (
          <>
            {!eligible && (
              <Card accent={C.orange}>
                <div style={{ fontSize: 12, color: C.orange, fontWeight: 800 }}>
                  殿堂入り {hof?.length ?? 0} / 30
                </div>
              </Card>
            )}

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
                　気温 {today.course.conditions.temperature}度
              </div>
            </Card>

            <Card accent={submitted ? C.green : C.gold}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: submitted ? C.green : C.gold }}>
                  {submitted ? '提出ずみ' : 'まだ提出していません'}
                </span>
                <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: 11, color: C.textSub }}>
                  締め切りまで {Math.floor(today.minutesLeft / 60)}時間{today.minutesLeft % 60}分
                </span>
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 10 }}>
                {segCount}人 ／ 締め切り {SUBMIT_DEADLINE_HHMM} ／ 結果 翌{RESULT_HHMM}
              </div>
              <button
                onClick={() => navigate('/online/rated/lineup')}
                disabled={!eligible}
                className="btn-press"
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 12, cursor: eligible ? 'pointer' : 'default',
                  border: 'none', background: eligible ? C.gold : C.border3, color: eligible ? '#1a0d00' : C.textDim,
                  fontSize: 15, fontWeight: 900, fontFamily: SAIRA,
                }}>{submitted ? 'メンバーを組み直す' : 'メンバーを組む'}</button>
            </Card>
          </>
        )}

        {tab === 'result' && result && (
          <>
            <Card>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>前日の結果</span>
                <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textSub }}>
                  グループ{result.group} / {result.groups}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textDim }}>{result.dateISO}</span>
              </div>
              {/* レートの増減はレート戦だけの話なので、ここに出す */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: C.textSub }}>自分のレート</span>
                <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.text }}>{me?.rating ?? 0}</span>
                {(() => {
                  const d = result.race.teams.find(t => t.name === '千葉タイガー')
                  const delta = d ? (result.delta[d.id] ?? 0) : 0
                  return (
                    <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: delta > 0 ? C.green : delta < 0 ? C.red : C.textDim }}>
                      {delta > 0 ? '+' : ''}{delta}
                    </span>
                  )
                })()}
              </div>
            </Card>

            {/* ★順位も区間記録も再生も、オンライン対戦の FinishPanel をそのまま使う。
                似た画面を2つ作らない（course だけは日付から作るので courseOf で渡す） */}
            <FinishPanel
              races={[result.race]}
              meId={result.race.teams.find(t => t.name === '千葉タイガー')?.id ?? ''}
              history
              leaveLabel="閉じる"
              onLeave={() => setTab('today')}
              courseOf={ratedCourseOf}
            />
          </>
        )}

        {tab === 'standings' && standings && (
          <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {standings.map((r, i) => (
              <div key={r.userId} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px',
                background: r.mine ? alpha(C.gold, 0.14) : C.surface2,
                borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ width: 22, textAlign: 'center', fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.textDim, flexShrink: 0 }}>{i + 1}</span>
                <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.teamName} teamId={r.userId} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</div>
                  <div style={{ fontSize: 9, color: C.textDim }}>GM {r.gmName}</div>
                </div>
                <RankChip rating={r.rating} size="sm" />
                <span style={{ width: 38, textAlign: 'right', fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.text, flexShrink: 0 }}>{r.rating}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
