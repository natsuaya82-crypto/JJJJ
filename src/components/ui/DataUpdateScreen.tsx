import { useEffect, useRef, useState } from 'react'
import { C, alpha, SAIRA, FONT } from '../../styles/tokens'
import { useGameStore } from '../../store/gameStore'
import { flushSaveNow } from '../../store/saveStorage'
import { segmentRecordsOf } from '../../utils/segmentRecords'
import { teamHistoriesOf } from '../../utils/teamHistory'
import { seasonAwardsOf } from '../../utils/awards'
import { eclHistoryOf } from '../../utils/eclHistory'
import { withCareerCounts } from '../../utils/careerStats'


// アップデート後の初回起動だけ出す「データ更新中」画面。
//
// 2.0.1 で、記録や成績をセーブに貯めるのをやめ、保存してあるレース結果から
// 数え直す形に変えた。数え直した結果は一度作れば覚えておくので、
// ここで先に全部作っておくと、記録室やチーム詳細を最初に開いたときに固まらない。
// 最後に新しい形でセーブを書き直して、古い重いセーブを置き換える。
//
// どの手順も何度やっても同じ結果になる（冪等）ので、途中でアプリを閉じても壊れない。
type Step = { label: string; run: () => void | Promise<void> }

const STEPS: Step[] = [
  {
    label: '区間記録',
    run: () => {
      const s = useGameStore.getState()
      segmentRecordsOf(s.pastSeasons, s.currentSeason, 'main')
      segmentRecordsOf(s.pastSeasons, s.currentSeason, 'reserve')
    },
  },
  {
    label: 'チームの成績',
    run: () => { teamHistoriesOf(useGameStore.getState().pastSeasons) },
  },
  {
    label: '年度MVP・新人王',
    run: () => {
      const s = useGameStore.getState()
      seasonAwardsOf(s.pastSeasons, s.players, s.removedPlayers)
    },
  },
  {
    label: 'ECLの歴代記録',
    run: () => {
      const s = useGameStore.getState()
      eclHistoryOf(s.pastSeasons, s.currentSeason)
    },
  },
  {
    label: '選手の通算成績',
    run: () => {
      const s = useGameStore.getState()
      const next = withCareerCounts(s.players, s.pastSeasons, s.currentSeason, s.removedPlayers)
      if (next !== s.players) useGameStore.setState({ players: next })
    },
  },
  {
    label: 'セーブデータの書き込み',
    run: async () => {
      // 中身が何も変わっていなくても必ず1回書き直させる。
      // 書き込みは「状態が変わったとき」に走るので、ここで空更新を1回入れないと
      // 古い形（記録や通算成績を抱えたまま）のセーブがディスクに残り続ける
      useGameStore.setState({})
      await flushSaveNow()
    },
  },
]

// 画面を描き直す隙間を作る（重い処理を挟むと、間に入れないとバーが動かない）
const tick = (ms: number) => new Promise<void>(r => { setTimeout(r, ms) })

export default function DataUpdateScreen({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(0)
  const [label, setLabel] = useState(STEPS[0].label)
  const started = useRef(false)

  useEffect(() => {
    // React の開発モードは effect を2回走らせるので、二重に始めないようにする
    if (started.current) return
    started.current = true
    let alive = true
    void (async () => {
      for (const step of STEPS) {
        if (!alive) return
        setLabel(step.label)
        await tick(340)          // ラベルとバーを先に描かせてから処理に入る
        try {
          await step.run()
        } catch (e) {
          // どの手順も失敗しても致命的ではない（次の起動でまた作り直される）。
          // ここで止めると更新画面から抜けられなくなるので、続ける。
          console.error('[update] step failed:', step.label, e)
        }
        if (!alive) return
        setDone(d => d + 1)
      }
      await tick(700)
      if (alive) onDone()
    })()
    return () => { alive = false }
  }, [onDone])

  const pct = Math.round((done / STEPS.length) * 100)
  const finished = done >= STEPS.length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998, overflow: 'hidden',
      background: 'radial-gradient(120% 80% at 50% 32%, #12101c 0%, #09070f 46%, #050409 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT,
      padding: '0 28px',
    }}>
      <style>{`
        @keyframes jpel-du-sweep {0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        .jpel-du-fill{position:absolute;top:0;left:0;height:100%;border-radius:3px;
          background:linear-gradient(90deg, ${C.goldDark}, ${C.gold} 70%, ${C.goldHi});
          box-shadow:0 0 12px ${alpha(C.gold, 0.55)};
          transition:width .45s cubic-bezier(.4,0,.2,1)}
        .jpel-du-fill::after{content:"";position:absolute;inset:0;
          background:linear-gradient(90deg,transparent,${alpha('#ffffff', 0.45)},transparent);
          animation:jpel-du-sweep 1.4s linear infinite}
        @media (prefers-reduced-motion:reduce){.jpel-du-fill::after{animation:none}}
      `}</style>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 140px 40px rgba(0,0,0,0.75)' }} />

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 320, textAlign: 'center' }}>
        <div style={{ fontFamily: SAIRA, fontWeight: 900, fontSize: 13, letterSpacing: 9, color: C.gold, textShadow: `0 0 18px ${alpha(C.gold, 0.35)}` }}>
          JPEL MANAGER
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: C.text, marginTop: 26, letterSpacing: 1 }}>
          {finished ? 'データの更新が完了しました' : 'データ更新中'}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.85, color: C.textDim, marginTop: 12, whiteSpace: 'pre-line' }}>
          {finished
            ? 'お待たせしました。そのまま続きから遊べます'
            : 'アップデートに合わせてセーブデータを整えています。\nそのままお待ちください（数秒で終わります）'}
        </div>

        <div style={{ marginTop: 34 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 9, fontSize: 12, color: C.textSub,
          }}>
            <span style={{ fontWeight: 600 }}>{finished ? '完了' : label}</span>
            <span style={{ fontFamily: SAIRA, fontWeight: 900, fontSize: 14, letterSpacing: 1, color: C.gold }}>{pct}%</span>
          </div>
          <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div className="jpel-du-fill" style={{ width: `${pct}%` }} />
          </div>
          <div style={{ marginTop: 9, fontFamily: SAIRA, fontSize: 11, letterSpacing: 3, color: C.textGhost }}>
            {done} / {STEPS.length}
          </div>
        </div>
      </div>
    </div>
  )
}
