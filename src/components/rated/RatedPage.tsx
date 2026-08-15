import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import PageHeader from '../ui/PageHeader'
import PressButton from '../ui/PressButton'
import { courseDistanceKm } from '../../engine/ratedCourse'
import { rankProgressOf } from '../../engine/rating'
import { RANK_ART } from './rankArt'
import { RatedHelpButton } from './ratedRules'
import {
  canJoin, fetchMe, fetchResult, fetchToday, joinRated, SUBMIT_DEADLINE_HHMM,
  type RatedMe, type RatedResult, type RatedToday,
} from '../../lib/ratedApi'
import { HOF_MAX } from '../../utils/hofRoster'
import { C, alpha, SAIRA, FONT, F } from '../../styles/tokens'
import type { Segment } from '../../types'

// ============================================================================
// ランクマッチのトップ。オンライン → イベント（一覧）→ ここ。
//
// ★見た目の方針（オーナー指示・2026-08-13）
//   ・**カードを積まない。** 細い横線と余白で区切る
//   ・**レートの数字が画面でいちばん強い**
//   ・**「参加する」が操作でいちばん強い**
//   ・光らせない・グラデーションを重ねない・立体にしない
//   ・色は 濃紺 / 白 / 灰青 / シアン、金は段位のときだけ
//
// ★段位の名前と次の段位までは `engine/rating` の
//   `rankProgressOf` 1本。画面で計算しないこと。
// ============================================================================

const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

/** 区間の起伏。同じ区間なら必ず同じ形 */
function ElevationLine({ seg, width = 116, height = 20 }: { seg: Segment; width?: number; height?: number }) {
  const pts = useMemo(() => {
    let s = (seg.index * 2654435761 + seg.uphillPct * 40503 + seg.downhillPct * 12289) >>> 0
    const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    const n = 24
    const amp = Math.max(6, Math.min(46, seg.uphillPct + seg.downhillPct)) / 46
    const out: string[] = []
    let y = 0.5
    for (let i = 0; i < n; i++) {
      y += (next() - 0.5) * 0.32 * amp
      y = Math.max(0.1, Math.min(0.9, y))
      out.push(`${(i / (n - 1)) * width},${(1 - y) * height}`)
    }
    return out.join(' ')
  }, [seg, width, height])
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={alpha(C.cyan, 0.7)} strokeWidth="1.1" />
    </svg>
  )
}

/** 節の見出し。細い縦線＋英字だけ */
function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
      <div style={{ width: 2, height: 12, background: C.cyan }} />
      <span style={{ fontFamily: SAIRA, fontSize: F.label, fontWeight: 800, color: C.cyan, letterSpacing: '2.5px' }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: alpha(C.border3, 0.7) }} />
    </div>
  )
}

export default function RatedPage() {
  const navigate = useNavigate()
  const hof = useGameStore(s => s.hofRoster)
  const [me, setMe] = useState<RatedMe | null>(null)
  const [today, setToday] = useState<RatedToday | null>(null)
  const [result, setResult] = useState<RatedResult | null>(null)
  const [left, setLeft] = useState(0)
  // 参加の申し込みが通らなかったときの一言。**黙って何も起きない、にしない**
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void fetchMe().then(setMe)
    // ★まだ 10:00 前・大会をやっていない・通信できない、のどれでも null が返る。
    //   仮のデータで埋めないこと（動いているように見えてしまう）
    void fetchToday().then(t => { setToday(t); setLeft((t?.minutesLeft ?? 0) * 60) })
    void fetchResult().then(setResult)
  }, [])

  // 締め切りまでの残り。**表示だけ**（締め切りの判定はサーバー）
  useEffect(() => {
    const t = setInterval(() => setLeft(v => Math.max(0, v - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  const eligible = canJoin(hof)
  const segs = today?.course.segments ?? []
  const submitted = Object.keys(me?.lineup ?? {}).length >= segs.length && segs.length > 0
  const prog = rankProgressOf(me?.rating ?? 0)
  const art = RANK_ART[prog.name]
  const d = today ? new Date(`${today.dateISO}T00:00:00Z`) : null
  const hh = String(Math.floor(left / 3600)).padStart(2, '0')
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const weather = today?.course.conditions.weather
  const weatherJa = weather === 'sunny' ? '晴れ' : weather === 'rainy' ? '雨' : weather === 'windy' ? '強風' : 'くもり'

  return (
    <div style={{ fontFamily: FONT, minHeight: '100dvh', paddingBottom: 96 }}>
      {/* ── 見出し ──
          ★**スクロールしても上に残す**（オーナー・2026-08-14「このボタンは固定して」）。
            下へ送ると戻る矢印が消えて、戻るのに一番上まで戻す必要があった。
          ★**シーズンは出さない**（同「人によって違うんだから表記いらない」）。
            空いたところに `?` を置いて、遊びかたはそこから見せる（画面に直書きしない）。 */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.bg }}>
        <PageHeader
          eyebrow="RANKED MATCH"
          title="ランクマッチ"
          right={<RatedHelpButton onClick={() => navigate('/rated/help')} />}
        />
      </div>

      {/* ── レート ── */}
      <div style={{ padding: '4px 18px 18px', borderTop: `1px solid ${alpha(C.border3, 0.55)}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 16 }}>
          <img src={art.img} alt="" width={86} height={86} style={{ flexShrink: 0, display: 'block' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 900, color: art.color,
              letterSpacing: '3px', lineHeight: 1,
            }}>{prog.en}</div>
            <div style={{
              fontFamily: SAIRA, fontSize: 76, fontWeight: 900, color: '#fdfdfb',
              lineHeight: 0.92, letterSpacing: '-3px', marginTop: 2,
            }}>{me?.rating ?? '—'}</div>
            <div style={{
              fontFamily: SAIRA, fontSize: F.caption, fontWeight: 800, color: C.textDim,
              letterSpacing: '4px', marginTop: 4,
            }}>RATING</div>
          </div>
          <div style={{ textAlign: 'right', alignSelf: 'flex-end' }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.hero, fontWeight: 900, color: C.text, lineHeight: 1 }}>
              {me?.overall ?? '—'}<span style={{ fontSize: F.body, color: C.textDim, marginLeft: 1 }}>位</span>
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginTop: 2 }}>/ {me?.entrants ?? 0}人</div>
          </div>
        </div>

        {/* 次の段位まで */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: SAIRA, fontSize: F.tiny, fontWeight: 800, color: C.textDim, letterSpacing: '2.5px' }}>NEXT RANK</span>
            <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: F.body, fontWeight: 900, color: C.textSub }}>
              {prog.to ?? 'MAX'}
            </span>
          </div>
          <div style={{ height: 3, background: alpha(C.border3, 0.6), position: 'relative' }}>
            <div style={{ width: `${Math.round(prog.ratio * 100)}%`, height: '100%', background: C.cyan }} />
          </div>
        </div>
      </div>

      {today && (
        <>
          {/* ── 今日のコース ── */}
          <div style={{ padding: '16px 18px 0', borderTop: `1px solid ${alpha(C.border3, 0.55)}` }}>
            <SectionLabel text="TODAY'S STAGE" />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
              <div style={{ fontFamily: SAIRA, fontSize: 38, fontWeight: 900, color: C.text, lineHeight: 0.95, letterSpacing: '-1px' }}>
                {d ? `${d.getUTCMonth() + 1}.${d.getUTCDate()}` : ''}
                <span style={{ fontSize: F.sub, color: C.cyan, marginLeft: 7, letterSpacing: '1px' }}>{d ? WEEK[d.getUTCDay()] : ''}</span>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, textAlign: 'right' }}>
                <div>
                  <div style={{ fontFamily: SAIRA, fontSize: F.head, fontWeight: 900, color: C.text, lineHeight: 1 }}>{segs.length}</div>
                  <div style={{ fontFamily: SAIRA, fontSize: F.tiny, color: C.textDim, letterSpacing: '1.5px' }}>STAGES</div>
                </div>
                <div>
                  <div style={{ fontFamily: SAIRA, fontSize: F.head, fontWeight: 900, color: C.text, lineHeight: 1 }}>{courseDistanceKm(today.course)}</div>
                  <div style={{ fontFamily: SAIRA, fontSize: F.tiny, color: C.textDim, letterSpacing: '1.5px' }}>KM</div>
                </div>
              </div>
            </div>
          </div>

          {/* 区間表 */}
          <div style={{ padding: '14px 18px 0' }}>
            {segs.map((s, i) => (
              <div key={s.index} style={{
                display: 'flex', alignItems: 'center', padding: '7px 0',
                borderTop: i === 0 ? `1px solid ${alpha(C.border3, 0.55)}` : 'none',
                borderBottom: `1px solid ${alpha(C.border3, 0.28)}`,
              }}>
                <span style={{ width: 30, fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 900, color: alpha(C.cyan, 0.85) }}>
                  {String(s.index).padStart(2, '0')}
                </span>
                <span style={{ width: 68, textAlign: 'right', fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 800, color: C.text }}>
                  {s.distanceKm.toFixed(1)}
                  <span style={{ fontSize: F.tiny, color: C.textDim, marginLeft: 3 }}>km</span>
                </span>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
                  <ElevationLine seg={s} />
                </div>
                <span style={{ width: 38, textAlign: 'right', fontFamily: SAIRA, fontSize: F.body, fontWeight: 800, color: alpha(C.red, 0.9) }}>
                  ↑{s.uphillPct}
                </span>
                <span style={{ width: 38, textAlign: 'right', fontFamily: SAIRA, fontSize: F.body, fontWeight: 800, color: alpha(C.cyan, 0.85) }}>
                  ↓{s.downhillPct}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 26, padding: '11px 0 0', fontSize: F.label, color: C.textDim }}>
              <span>天候{'\u3000'}<span style={{ color: C.textSub }}>{weatherJa}</span></span>
              <span>気温{'\u3000'}<span style={{ color: C.textSub }}>{today.course.conditions.temperature}°C</span></span>
            </div>
          </div>

          {/* ── 締め切り ── */}
          <div style={{
            margin: '18px 0 0', padding: '14px 18px',
            borderTop: `1px solid ${alpha(C.border3, 0.55)}`, borderBottom: `1px solid ${alpha(C.border3, 0.55)}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SAIRA, fontSize: F.headLg, fontWeight: 900, color: C.text, lineHeight: 1 }}>
                {segs.length}<span style={{ fontSize: F.label, color: C.textDim, letterSpacing: '1.5px', marginLeft: 5 }}>PLAYERS</span>
              </div>
              <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textDim, letterSpacing: '1.5px', marginTop: 2 }}>YET TO ENTER</div>
              <div style={{ fontSize: F.caption, color: C.textGhost, marginTop: 4 }}>締切 {SUBMIT_DEADLINE_HHMM}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: SAIRA, fontSize: F.tiny, fontWeight: 800, color: C.textDim, letterSpacing: '2px' }}>ENTRY CLOSES IN</div>
              <div style={{ fontFamily: SAIRA, fontSize: 30, fontWeight: 900, color: C.cyan, lineHeight: 1.05, letterSpacing: '1px' }}>
                {hh}:{mm}:{ss}
              </div>
            </div>
          </div>

          {/* ── 参加する ── */}
          <div style={{ padding: '18px 14px 0' }}>
            <PressButton
              onClick={() => {
                if (!eligible) return
                // ★編成の前に**参加の申し込みを通す**。通っていないと提出が 'join' で弾かれる
                //   （参加済みなら `on conflict do nothing` で何も起きない）
                void joinRated().then(r => {
                  if (r === 'ok') { navigate('/online/rated/lineup'); return }
                  setNotice(
                    r === 'hof' ? `殿堂入りが${HOF_MAX}人そろっていません`
                    : r === 'closed' ? 'いまは大会をやっていません'
                    : 'サーバーにつながりませんでした')
                })
              }}
              pressScale={0.985}
              style={{
                width: '100%', padding: '18px 0 16px', cursor: eligible ? 'pointer' : 'default',
                fontFamily: 'inherit', border: 'none', position: 'relative',
                background: eligible ? C.cyan : C.surface2,
                clipPath: 'polygon(0 0, 100% 0, 100% 68%, calc(100% - 18px) 100%, 0 100%)',
              }}
            >
              <div style={{ fontSize: F.titleLg, fontWeight: 900, color: eligible ? '#04202e' : C.textDim, letterSpacing: '8px' }}>
                {submitted ? '組み直す' : '参加する'}
              </div>
              <div style={{
                fontFamily: SAIRA, fontSize: F.tiny, fontWeight: 800, letterSpacing: '4px', marginTop: 3,
                color: eligible ? alpha('#04202e', 0.6) : C.textGhost,
              }}>ENTER RANKED</div>
            </PressButton>
            {!eligible && (
              <div style={{ fontSize: F.label, color: C.orange, marginTop: 8, textAlign: 'center' }}>
                殿堂入り {hof?.length ?? 0} / {HOF_MAX}
              </div>
            )}
            {!!notice && (
              <div style={{ fontSize: F.label, color: C.orange, marginTop: 8, textAlign: 'center' }}>{notice}</div>
            )}
          </div>
        </>
      )}

      {/* ── 順位表・前日の結果 ── */}
      <div style={{ display: 'flex', padding: '14px 14px 0' }}>
        {([
          { label: '順位表', en: 'RANKING', to: '/online/rated/standings', on: true },
          { label: '前日の結果', en: 'LAST RESULT', to: '/online/rated/result', on: !!result },
        ] as const).map((b, i) => (
          <PressButton
            key={b.to}
            onClick={() => { if (b.on) navigate(b.to) }}
            style={{
              flex: 1, padding: '10px 4px', background: 'none', fontFamily: 'inherit',
              border: 'none', borderLeft: i === 1 ? `1px solid ${alpha(C.border3, 0.55)}` : 'none',
              cursor: b.on ? 'pointer' : 'default', opacity: b.on ? 1 : 0.4,
            }}
          >
            <div style={{ fontSize: F.body, fontWeight: 800, color: C.textSub }}>{b.label}</div>
            <div style={{ fontFamily: SAIRA, fontSize: F.micro, fontWeight: 700, color: C.textGhost, letterSpacing: '2px', marginTop: 2 }}>{b.en}</div>
          </PressButton>
        ))}
      </div>
    </div>
  )
}
