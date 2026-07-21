import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { C } from '../../styles/tokens'
import Flag from '../ui/Flag'
import { NAT_LABEL } from '../../data/nationalities'
import { WA_EVENT_LABEL, formatMeetMedal } from '../../engine/worldAthletics'
import { formatRaceTime } from '../../utils/eventTime'
import type { Nationality } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const natName = (n: Nationality) => NAT_LABEL[n] ?? n
const MEDAL = ['🥇', '🥈', '🥉'] // 表示は下でSVG国旗＋色。絵文字は使わないので色で表現
const medalColor = (rank: number) => rank === 1 ? C.gold : rank === 2 ? '#C0C7D0' : rank === 3 ? '#CD7F32' : C.textDim
void MEDAL

export default function NationalResultPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const results = useGameStore(s => s.worldAthleticsResults) ?? []
  const yParam = params.get('y')
  const r = yParam ? results.find(x => x.year === Number(yParam)) ?? results[0] : results[0]
  // 大会直後（?y=なし）は種目ごとに1枚ずつめくる段階表示。記録室からの閲覧（?y=あり）は一括表示
  const staged = !yParam
  const [step, setStep] = useState(0)

  if (!r) {
    return (
      <div style={{ background: C.bg, minHeight: '100dvh', padding: 16 }}>
        <BackButton />
        <div style={{ textAlign: 'center', color: C.textDim, padding: 40 }}>まだ結果がありません</div>
      </div>
    )
  }

  const wrap = (title: string, children: React.ReactNode) => (
    <div style={{ fontFamily: "'Zen Kaku Gothic New','Noto Sans JP',system-ui,sans-serif", background: C.bg, minHeight: '100dvh', paddingBottom: 96 }}>
      <div style={{ padding: '8px 8px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
        <BackButton onClick={() => navigate('/')} />
        <span style={{ fontFamily: SAIRA, fontSize: 19, fontWeight: 900, color: C.text }}>{title}</span>
      </div>
      {children}
    </div>
  )
  const card = (title: string, body: React.ReactNode) => (
    <div style={{ margin: '0 12px 12px', borderRadius: 14, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.purpleDark}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.purple }}>{title}</div>
      <div style={{ padding: '8px 12px 12px' }}>{body}</div>
    </div>
  )
  const natRow = (n: Nationality, right: React.ReactNode, rank?: number) => (
    <div key={n + String(rank)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderBottom: `1px solid ${C.border}` }}>
      {rank != null && <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: medalColor(rank), width: 22, textAlign: 'center' }}>{rank}</span>}
      <Flag code={n} width={24} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: n === 'JPN' ? C.gold : C.text }}>{natName(n)}</span>
      {right}
    </div>
  )

  if (r.kind === 'qualifier') {
    return wrap('世界陸上アジア予選', <>
      <div style={{ padding: '2px 16px 12px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.purple, letterSpacing: 3, fontWeight: 900 }}>{r.year} ASIA QUALIFIER</div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {r.host && <>開催国 <Flag code={r.host} width={18} /> {natName(r.host)} ・ </>}
          上位3カ国が翌年の世界陸上へ。{r.advanced.map(natName).join('・')} が通過。
        </div>
      </div>
      {card('予選順位', r.standings.map(s => natRow(s.nat,
        <span style={{ fontSize: 10, fontWeight: 800, color: s.advanced ? C.green : C.textDim }}>{s.advanced ? '通過' : '—'}</span>, s.rank)))}
    </>)
  }

  // main：セクションを種目→駅伝→総合の順に。段階表示なら1枚ずつ「次へ」でめくる（勝手に全部出さない）
  const totals = r.meet.totals
  const japanIn = r.nations.includes('JPN')

  // 大会直後（staged）は個人種目の結果を駅伝の合間に発表済みなので、駅伝順位＋総合成績だけを出す。
  // 記録室からの閲覧（?y=）は従来どおり全セクション一括表示
  const sections: { title: string; body: React.ReactNode }[] = [
    ...(staged ? [] : r.meet.individuals).map(ir => ({
      title: `${WA_EVENT_LABEL[ir.event]} 決勝`,
      body: card(`${WA_EVENT_LABEL[ir.event]} メダル`, ir.placings.slice(0, 8).map(pl => (
        <div key={pl.playerId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: medalColor(pl.rank), width: 22, textAlign: 'center' }}>{pl.rank}</span>
          <Flag code={pl.nat} width={22} />
          <span style={{ flex: 1, fontSize: 12, color: pl.nat === 'JPN' ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.playerName}</span>
          <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: C.gold }}>{formatRaceTime(pl.timeSec)}</span>
        </div>
      ))),
    })),
    {
      title: '駅伝',
      body: card('駅伝 順位', r.meet.ekiden.map(ek => natRow(ek.nat, <span/>, ek.rank))),
    },
    {
      title: '総合成績',
      body: card('長距離部門 総合成績', totals.map(t => natRow(t.nat,
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: C.textDim }}>{formatMeetMedal(t)}</span>
          <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: C.purple, minWidth: 30, textAlign: 'right' }}>{t.points}<span style={{ fontSize: 9, color: C.textDim }}>p</span></span>
        </span>, t.rank))),
    },
  ]
  const lastStep = sections.length - 1
  const shown = staged ? sections.slice(0, step + 1) : sections
  const isFinished = !staged || step >= lastStep

  return wrap(`世界陸上 ${r.year}`, <>
    <div style={{ padding: '2px 16px 12px' }}>
      <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.purple, letterSpacing: 3, fontWeight: 900 }}>{r.year} WORLD ATHLETICS</div>
      <div style={{ fontSize: 11, color: C.textDim, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
        開催国 <Flag code={r.host} width={18} /> {natName(r.host)} ・ {r.nations.length}カ国
        {japanIn ? (isFinished ? <span> ・ 日本総合 {r.japanRank ?? '—'}位</span> : null) : <span style={{ color: C.red }}> ・ 日本は予選敗退（観戦）</span>}
      </div>
    </div>

    {shown.map((s, i) => <div key={i}>{s.body}</div>)}

    {staged && step < lastStep && (
      <div style={{ padding: '0 12px' }}>
        <button onClick={() => setStep(step + 1)} className="btn-game btn-game--purple" style={{ width: '100%' }}>
          <span className="btn-game__inner">次は {sections[step + 1].title} →</span>
        </button>
      </div>
    )}
    {isFinished && staged && (
      <div style={{ padding: '0 12px' }}>
        <button onClick={() => navigate('/')} className="btn-press" style={{
          width: '100%', padding: '14px 0', borderRadius: 12, cursor: 'pointer', fontFamily: SAIRA,
          background: C.surface2, border: `2px solid ${C.border2}`, color: C.text, fontSize: 14, fontWeight: 900,
        }}>閉じる（シーズン終了へ）</button>
      </div>
    )}
  </>)
}
