// 匿名アカウントの用意と、自チーム情報・ロスターのサーバー同期。
// 初回起動時に匿名アカウント（＝フレンドコード）を作り、
// 以降は「起動時（前回から中身が変わっていれば）」と「シーズンが変わったとき」に送る。
// 通信に失敗しても黙って諦める（ゲーム本編は完全にオフラインで動くため）。
import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { ovr } from '../utils/playerUtils'
import { ensureMyProfile, pushMyProfile, pushMyRoster } from './friendsApi'
import { ONLINE_ENABLED } from '../data/featureFlags'

const STAMP_KEY = 'jpel_friend_sync_stamp'

/** 送信内容が前回と同じかを見るための軽い指紋 */
function fingerprint(s: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(36)
}

let running = false

/**
 * 匿名アカウントを用意し、必要なら今のセーブ内容をサーバーへ送る。
 * 送る中身が前回と同じなら通信しない。
 */
export async function syncNow(): Promise<void> {
  if (running) return
  running = true
  try {
    // 初回起動時はここで匿名アカウントとフレンドコードが作られる
    await ensureMyProfile()

    const st = useGameStore.getState()
    const team = st.teams.find(t => t.id === st.playerTeamId)
    if (!st.playerTeamId || !team) return   // ゲーム開始前はアカウントを作るだけ

    const roster = st.players.filter(p => p.teamId === st.playerTeamId)
    if (roster.length === 0) return

    const avgOvr = Math.round(roster.reduce((s, p) => s + ovr(p), 0) / roster.length)
    const stamp = fingerprint(JSON.stringify({
      y: st.currentSeason?.year, n: team.name, s: team.shortName, g: team.gmName, l: team.logoId,
      c: [team.colors.primary, team.colors.secondary], ch: team.history?.championships ?? 0,
      a: avgOvr, r: roster.map(p => `${p.id}:${ovr(p)}`).join(','),
    }))
    if (localStorage.getItem(STAMP_KEY) === stamp) return

    await pushMyProfile(team, avgOvr)
    await pushMyRoster(roster)
    localStorage.setItem(STAMP_KEY, stamp)
  } catch {
    // オフライン等。次回の起動・シーズン更新でまた試す。
  } finally {
    running = false
  }
}

/** Layout に置いて、起動時とシーズン更新時に同期を走らせる */
export function useFriendSync() {
  const playerTeamId = useGameStore(s => s.playerTeamId)
  const year = useGameStore(s => s.currentSeason?.year)

  // オンライン（フレンド）を公開していない間は、アカウント作成もチーム情報の送信も一切行わない
  useEffect(() => { if (ONLINE_ENABLED) void syncNow() }, [playerTeamId, year])
}
