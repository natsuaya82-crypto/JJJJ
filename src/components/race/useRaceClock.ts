// レース再生の時計（速さと経過）。**画面が持つ時計はこれ1本。**
//
// 位置や差の計算はしない（`engine/raceTimeline` の仕事）。ここが決めるのは
// 「画面の1秒でレースを何秒進めるか」（`RACE_SPEEDS`）と、止める・飛ばすだけ。
// 本編の中継（`SimPhase`）もオンライン対戦（`online/RacePanel`）もここを通す。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { runnerAt, snapshotAt, type RaceTimeline } from '../../engine/raceTimeline'

/**
 * 再生の速さの段階（レース秒 ÷ 画面の秒）。オーナー・2026-09-28「10 100 200」＝試作「JPEL 3D中継」と同じ。
 * 先頭が既定（試作と同じ ×10）。以前は「自チームの走者が1区間を12〜30秒で走り切る速さ」の1つだけだった
 */
export const RACE_SPEEDS = [10, 100, 200] as const
export type RaceSpeed = typeof RACE_SPEEDS[number]

/** 画面の1フレームで進める上限（裏に回って戻ったときに一気に進めない） */
const MAX_FRAME_MS = 100

/** 追っているチーム（自チームが走っていれば自チーム、いなければ先頭）。区間のスキップが見る */
export function focusTeamOf(tl: RaceTimeline, meId: string, t: number): string | null {
  return runnerAt(tl, meId, t) ? meId : snapshotAt(tl, t).overall[0]?.teamId ?? null
}

/**
 * @param pausedAt その時刻で止めるか。**毎フレーム、いまの時刻で聞く**（イベントの地点で止めるため。
 *                 描画の答えを渡すと、止まったあとに描画が起きず二度と動かなくなる）
 * @param stopAt   ここで止まる（オンライン対戦の区間の待ち合わせ）。null なら最後まで
 * @param speed    レース秒 ÷ 画面の秒（`RACE_SPEEDS`）
 */
export function useRaceClock(tl: RaceTimeline, meId: string, opts: { pausedAt: (t: number) => boolean; stopAt?: number | null; speed: RaceSpeed }) {
  const [t, setT] = useState(0)
  const tRef = useRef(0)
  // 毎フレームの tick が読む「いまの」レースと止め方（描くたびに入れ替える）
  const live = useRef({ tl, meId, opts })
  useLayoutEffect(() => { live.current = { tl, meId, opts } })

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(MAX_FRAME_MS, now - last)
      last = now
      const { tl, opts } = live.current
      const limit = Math.min(tl.endTime, opts.stopAt ?? Infinity)
      if (!opts.pausedAt(tRef.current) && tRef.current < limit) {
        tRef.current = Math.min(limit, tRef.current + dt * opts.speed / 1000)
        setT(tRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  /** そこまで飛ばす（戻しはしない） */
  const jumpTo = useCallback((to: number) => {
    tRef.current = Math.max(tRef.current, Math.min(live.current.tl.endTime, to))
    setT(tRef.current)
  }, [])

  /** 0 秒に戻す（同じ画面のまま次のレースを流すとき） */
  const restart = useCallback(() => { tRef.current = 0; setT(0) }, [])

  return { t, jumpTo, restart }
}
