// レース再生の時計（速さと経過）。**画面が持つ時計はこれ1本。**
//
// 位置や差の計算はしない（`engine/raceTimeline` の仕事）。ここが決めるのは
// 「画面の1ミリ秒でレースを何秒進めるか」と、止める・飛ばすだけ。
// 本編の中継（`SimPhase`）もオンライン対戦（`online/RacePanel`）もここを通す。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { legEndAt, runnerAt, snapshotAt, type RaceTimeline } from '../../engine/raceTimeline'

/** 1区間を見せる時間（ミリ秒）。距離に比例して12〜30秒 */
export const legPlayMs = (distanceKm: number) => Math.max(12000, Math.min(30000, distanceKm * 1400))

/** 画面の1フレームで進める上限（裏に回って戻ったときに一気に進めない） */
const MAX_FRAME_MS = 100

/** 速さを決めるチーム（自チームが走っていれば自チーム、いなければ先頭） */
export function focusTeamOf(tl: RaceTimeline, meId: string, t: number): string | null {
  return runnerAt(tl, meId, t) ? meId : snapshotAt(tl, t).overall[0]?.teamId ?? null
}

/** レース秒 ÷ 画面のミリ秒。速さを決めるチームがいまの区間を `legPlayMs` で走り切る速さ */
function rateAt(tl: RaceTimeline, meId: string, t: number): number {
  const id = focusTeamOf(tl, meId, t)
  const r = id ? runnerAt(tl, id, t) : null
  if (!id || !r) return 0
  const end = legEndAt(tl, id, r.leg) ?? 0
  const start = r.leg > 0 ? legEndAt(tl, id, r.leg - 1) ?? 0 : 0
  return (end - start) / legPlayMs(tl.distances[r.leg] ?? 10)
}

/**
 * @param pausedAt その時刻で止めるか。**毎フレーム、いまの時刻で聞く**（イベントの地点で止めるため。
 *                 描画の答えを渡すと、止まったあとに描画が起きず二度と動かなくなる）
 * @param stopAt   ここで止まる（オンライン対戦の区間の待ち合わせ）。null なら最後まで
 */
export function useRaceClock(tl: RaceTimeline, meId: string, opts: { pausedAt: (t: number) => boolean; stopAt?: number | null }) {
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
      const { tl, meId, opts } = live.current
      const limit = Math.min(tl.endTime, opts.stopAt ?? Infinity)
      if (!opts.pausedAt(tRef.current) && tRef.current < limit) {
        tRef.current = Math.min(limit, tRef.current + dt * rateAt(tl, meId, tRef.current))
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
