// 匿名アカウントの用意と、自チーム情報・ロスターのサーバー同期。
// 初回起動時に匿名アカウント（＝フレンドコード）を作り、
// 以降は「起動時（前回から中身が変わっていれば）」と「シーズンが変わったとき」に送る。
// 通信に失敗しても黙って諦める（ゲーム本編は完全にオフラインで動くため）。
import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { ovr } from '../utils/playerUtils'
import { ensureMyProfile, pushMyProfile, pushMyRoster } from './friendsApi'
import { gmSeasonRanks, gmCareerTotals } from '../utils/gmTenure'
import { ONLINE_ENABLED } from '../data/featureFlags'
import { saveSlotSuffix } from '../store/saveSlot'

// 指紋の置き場もスロットごと。共通だと、別スロットで送った指紋と一致して
// 「前と同じだから送らない」と誤判定し、そのスロットの情報が一生送られない
const STAMP_KEY = `jpel_friend_sync_stamp${saveSlotSuffix()}`

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
    // 殿堂入りチーム。ロスターと同じ行に相乗りさせて送る（lib/friendsApi の pushMyRoster）
    const hof = st.hofRoster ?? []

    const avgOvr = Math.round(roster.reduce((s, p) => s + ovr(p), 0) / roster.length)
    // 優勝回数はセーブに持たず、過去シーズンの順位表から数え直す（utils/teamHistory.ts）。
    // 監督は別のチームへ移れるので、年ごとに「その年に指揮していたチーム」で数える。
    // 今のチームで数えると、移籍した瞬間に移籍先の過去の優勝が自分の記録として友達に出る
    const champs = gmCareerTotals(gmSeasonRanks(st.pastSeasons, st.gmTenures, st.playerTeamId)).championships
    const stamp = fingerprint(JSON.stringify({
      y: st.currentSeason?.year, n: team.name, s: team.shortName, g: team.gmName, l: team.logoId,
      c: [team.colors.primary, team.colors.secondary], ch: champs,
      // 名前も指紋に入れる。入れないと、改名しただけのときに「前と同じ」と判断されて
      // 一生送られず、友達側にいつまでも古い名前が出たままになる。
      a: avgOvr, r: roster.map(p => `${p.id}:${p.name}:${ovr(p)}`).join(','),
      // 殿堂入りも指紋に入れる。入れないと、登録・解除しただけのときに
      // 「前と同じ」と判断されて一生送られず、相手にいつまでも出ない
      h: hof.map(x => `${x.player.id}:${x.year}:${x.ovr}`).join(','),
    }))
    if (localStorage.getItem(STAMP_KEY) === stamp) return

    await pushMyProfile(team, avgOvr, champs)
    await pushMyRoster(roster, hof)
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
  // 殿堂入りは「登録した直後に相手へ出る」ものなので、シーズンの変わり目まで待たない。
  // 配列は登録・解除のときだけ差し替わるので、これで通信が増え続けることはない
  // （中身が前と同じなら syncNow が指紋を見て通信しない）
  const hofRoster = useGameStore(s => s.hofRoster)

  // オンライン（フレンド）を公開していない間は、アカウント作成もチーム情報の送信も一切行わない
  useEffect(() => { if (ONLINE_ENABLED) void syncNow() }, [playerTeamId, year, hofRoster])
}
