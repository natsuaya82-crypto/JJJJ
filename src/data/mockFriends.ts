// フレンド機能のUIモックデータ。後で Supabase 接続に差し替える「サーバー相当」。
// ロスターは既存の生成関数で本物の Player を作り、既存の PlayerRow でそのまま表示する。
import type { Player } from '../types'
import { generatePlayerInitialRoster } from '../engine/playerGenerator'
import { ovr } from '../utils/playerUtils'

export type Friend = {
  id: string
  code: string            // 数字10桁（表示は5桁ずつ区切り）
  teamName: string
  shortName: string
  gmName: string
  logoId: string
  primary: string
  secondary: string
  champs: number
  lastLogin: string       // 最終ログイン（表示用。後でSupabaseのタイムスタンプから算出）
}

export const MOCK_FRIENDS: Friend[] = [
  { id: 'f1', code: '4820379165', teamName: '相模原ストライダーズ', shortName: 'SGM', gmName: '御子柴 亮', logoId: 'logo_05', primary: '#1a2c47', secondary: '#f5c842', champs: 3, lastLogin: '3時間前' },
  { id: 'f2', code: '9013746528', teamName: '仙台ノーザンライツ', shortName: 'SND', gmName: '如月 冬吾', logoId: 'logo_21', primary: '#0f2240', secondary: '#5ed4ff', champs: 1, lastLogin: '昨日' },
  { id: 'f3', code: '2657104839', teamName: '博多レッドファング', shortName: 'HKT', gmName: '大宰 錬', logoId: 'logo_03', primary: '#7a1f1f', secondary: '#f5c842', champs: 0, lastLogin: '5日前' },
]

export const getFriend = (id: string | undefined) => MOCK_FRIENDS.find(f => f.id === id)

// フレンド申請（送信＝申請 / 受信＝承認）のモック。後で Supabase の申請テーブルに差し替え。
export type FriendRequest = {
  id: string; code: string; teamName: string; shortName: string; gmName: string
  logoId: string; primary: string; secondary: string
}
// 承認タブ：相手から届いた申請（承認 / 拒否）
export const MOCK_RECEIVED: FriendRequest[] = [
  { id: 'r1', code: '7734028519', teamName: '名古屋ゴールドウイングス', shortName: 'NGO', gmName: '不破 迅', logoId: 'logo_06', primary: '#0d3b2e', secondary: '#f5c842' },
  { id: 'r2', code: '1902847365', teamName: '金沢スノーフォックス', shortName: 'KNZ', gmName: '白鷺 累', logoId: 'logo_25', primary: '#1a2c47', secondary: '#e0e6f0' },
]
// 申請タブ：自分が送って承認待ちの申請
export const MOCK_SENT: FriendRequest[] = [
  { id: 's1', code: '5561230948', teamName: '大阪ブレイズ', shortName: 'OSK', gmName: '轟 剛', logoId: 'logo_15', primary: '#7a1f1f', secondary: '#f5c842' },
]

// フレンドのロスター（本物の Player）。初回アクセス時に生成してセッション中はキャッシュ。
// Supabase接続後は「相手が上げたロスター・スナップショット」に置き換える。
const rosterCache: Record<string, Player[]> = {}
export function getFriendRoster(id: string): Player[] {
  if (!rosterCache[id]) {
    const gen = generatePlayerInitialRoster(2027)
    rosterCache[id] = gen.players
      .map(p => ({ ...p, teamId: `friend_${id}` }))   // FA表示にならないよう所属を持たせる
      .sort((a, b) => ovr(b) - ovr(a))
  }
  return rosterCache[id]
}

// フレンドコード（数字10桁）。今は端末ID代わりにシード文字列から決定的生成。
export function mockMyCode(seed: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  const ten = String(h % 10000000000).padStart(10, '0')
  return `${ten.slice(0, 5)} ${ten.slice(5)}`
}
