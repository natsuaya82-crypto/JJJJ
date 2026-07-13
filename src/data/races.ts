import type { Race, IndividualEvent } from '../types'
import { INITIAL_TEAMS } from './teams'

// 記録会（タイムトライアル）年7回。本編レースの合間に配置。種目を散らし、負荷の高いマラソンは夏の休養期に。
const pickTTWeather = (): IndividualEvent['weather'] => {
  // 晴れ・曇り多め、雨・風は控えめ
  const r = Math.random()
  return r < 0.4 ? 'sunny' : r < 0.7 ? 'cloudy' : r < 0.87 ? 'windy' : 'rainy'
}
export function generateIndividualEvents(year: number): IndividualEvent[] {
  const y = String(year)
  return [
    { id: `tt-5k-1-${y}`,   name: `${y} 春季5000m記録会`,   date: `${y}-03-29`, distance: 5000,  weather: pickTTWeather() },
    { id: `tt-10k-1-${y}`,  name: `${y} 春季10000m記録会`,  date: `${y}-04-26`, distance: 10000, weather: pickTTWeather() },
    { id: `tt-half-1-${y}`, name: `${y} 初夏ハーフ記録会`,   date: `${y}-05-24`, distance: 21097, weather: pickTTWeather() },
    { id: `tt-mara-${y}`,   name: `${y} 夏季マラソン記録会`, date: `${y}-08-02`, distance: 42195, weather: pickTTWeather() },
    { id: `tt-10k-2-${y}`,  name: `${y} 夏季10000m記録会`,  date: `${y}-08-23`, distance: 10000, weather: pickTTWeather() },
    { id: `tt-5k-2-${y}`,   name: `${y} 秋季5000m記録会`,   date: `${y}-10-18`, distance: 5000,  weather: pickTTWeather() },
    { id: `tt-half-2-${y}`, name: `${y} 冬季ハーフ記録会`,   date: `${y}-12-06`, distance: 21097, weather: pickTTWeather() },
  ]
}

const ALL_TEAM_IDS = INITIAL_TEAMS.map(t => t.id)

// W = statWeights shorthand. Each segment gets its own unique calibration.
type W = Partial<Record<'speed' | 'stamina' | 'mountainUp' | 'mountainDown' | 'pacing' | 'mental' | 'recovery', number>>

function seg(index: number, distanceKm: number, uphillPct: number, downhillPct: number, w?: W): Race['segments'][number] {
  return { index, distanceKm, uphillPct, downhillPct, ...(w ? { statWeights: w } : {}) }
}

export const SEASON_2027_RACES: Race[] = [
  // ───── Race 01: 出雲開幕戦 ─────
  // 短〜中距離平坦主体。スプリンターと知性型の争い。
  {
    id: 'race-2027-01',
    name: '出雲開幕戦',
    date: '2027-03-15',
    location: '出雲',
    type: 'league',
    conditions: { temperature: 12, weather: 'sunny', elevation: 50 },
    segments: [
      // 1区 8.0km 平坦: 開幕爆走。速さとペース読みが全て
      seg(1, 8.0,  0,  0, { speed: 0.58, pacing: 0.18, mental: 0.12, stamina: 0.08, recovery: 0.04 }),
      // 2区 5.8km 緩傾斜: 短くても起伏あり。ペース管理が鍵
      seg(2, 5.8,  5,  5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      // 3区 8.5km 緩傾斜: 中盤の精神消耗戦。冷静さが差を生む
      seg(3, 8.5,  5,  5, { mental: 0.35, pacing: 0.30, stamina: 0.20, recovery: 0.10, speed: 0.05 }),
      // 4区 6.2km 平坦: 短距離爆発区間。純粋な速さ勝負
      seg(4, 6.2,  0,  0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      // 5区 6.4km 緩傾斜: つなぎ区間。ペースを乱さない安定性
      seg(5, 6.4,  5,  5, { pacing: 0.38, speed: 0.30, mental: 0.18, recovery: 0.08, stamina: 0.06 }),
      // 6区 10.2km 緩上り: 最長アンカー。スタミナと回復力で粘る
      seg(6, 10.2, 8,  3, { stamina: 0.38, pacing: 0.25, recovery: 0.22, mental: 0.10, speed: 0.05 }),
    ],
    participants: ALL_TEAM_IDS,
  },

  // ───── Race 02: 東北桜駅伝 ─────
  // 長距離主体。起伏区間が2回あり、スタミナ・回復力が問われる持久戦。
  {
    id: 'race-2027-02',
    name: '東北桜駅伝',
    date: '2027-04-05',
    location: '仙台',
    type: 'league',
    conditions: { temperature: 13, weather: 'sunny', elevation: 80 },
    segments: [
      // 1区 9.0km 緩傾斜: 精神の立ち上がり。メンタルが初速を決める
      seg(1, 9.0,   5,  5, { mental: 0.32, pacing: 0.30, speed: 0.18, stamina: 0.14, recovery: 0.06 }),
      // 2区 11.5km 起伏: 最初の山岳越え。オールラウンドな山岳力
      seg(2, 11.5, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
      // 3区 17.0km 緩上り: 最長。真のスタミナと回復力の消耗戦
      seg(3, 17.0,  8,  3, { stamina: 0.45, recovery: 0.25, pacing: 0.18, mental: 0.08, speed: 0.04 }),
      // 4区 10.0km 緩傾斜: 中間つなぎ。ペースとメンタルで繋ぐ
      seg(4, 10.0,  5,  5, { pacing: 0.36, mental: 0.26, stamina: 0.22, recovery: 0.12, speed: 0.04 }),
      // 5区 12.5km 起伏: 二度目の山岳越え。疲弊した脚での粘り
      seg(5, 12.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.20, stamina: 0.26, recovery: 0.16, pacing: 0.10 }),
      // 6区 9.5km 緩傾斜: 回復力で後半を粘りきる区間
      seg(6, 9.5,   5,  5, { recovery: 0.38, pacing: 0.28, stamina: 0.22, mental: 0.08, speed: 0.04 }),
      // 7区 16.0km 緩上り: 二つ目の長丁場。スタミナの真価が出る
      seg(7, 16.0,  8,  3, { stamina: 0.42, recovery: 0.24, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      // 8区 7.5km 平坦: 最終スプリントアンカー
      seg(8, 7.5,   0,  0, { speed: 0.60, pacing: 0.18, mental: 0.14, stamina: 0.05, recovery: 0.03 }),
    ],
    participants: ALL_TEAM_IDS,
  },

  // ───── Race 03: 東京スプリント駅伝 ─────
  // 都市型。短い区間が多くスプリンター天国。長い区間は精神・スタミナが要る。
  {
    id: 'race-2027-03',
    name: '東京スプリント駅伝',
    date: '2027-05-03',
    location: '東京',
    type: 'league',
    conditions: { temperature: 17, weather: 'cloudy', elevation: 30 },
    segments: [
      // 1区 6.5km 平坦: 都市開幕スプリント
      seg(1, 6.5,  0,  0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      // 2区 7.0km 平坦: 連続スプリント。前区間との繋ぎが課題
      seg(2, 7.0,  0,  0, { speed: 0.65, pacing: 0.16, mental: 0.10, stamina: 0.06, recovery: 0.03 }),
      // 3区 11.5km 緩傾斜: 長めの精神消耗戦
      seg(3, 11.5, 5,  5, { mental: 0.32, pacing: 0.32, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      // 4区 6.0km 平坦: 純粋速さ爆発区間
      seg(4, 6.0,  0,  0, { speed: 0.70, pacing: 0.14, mental: 0.08, stamina: 0.05, recovery: 0.03 }),
      // 5区 10.8km 緩傾斜: 中盤タクティカル
      seg(5, 10.8, 5,  5, { pacing: 0.38, mental: 0.28, stamina: 0.20, recovery: 0.10, speed: 0.04 }),
      // 6区 5.5km 平坦: 最短区間・絶対速度のみ問われる
      seg(6, 5.5,  0,  0, { speed: 0.72, pacing: 0.12, mental: 0.08, stamina: 0.05, recovery: 0.03 }),
      // 7区 9.2km 緩傾斜: アンカー前の消耗戦
      seg(7, 9.2,  5,  5, { pacing: 0.35, stamina: 0.25, mental: 0.22, recovery: 0.12, speed: 0.06 }),
      // 8区 12.5km 緩上り: 最長アンカー。スタミナ型が有利
      seg(8, 12.5, 8,  3, { stamina: 0.40, pacing: 0.24, recovery: 0.20, mental: 0.12, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },

  // ───── Race 04: 富士山岳駅伝 ─────
  // 本格山岳。登り専門・下り専門に分かれる。フラット選手には過酷。
  {
    id: 'race-2027-04',
    name: '富士山岳駅伝',
    date: '2027-05-31',
    location: '富士山',
    type: 'league',
    conditions: { temperature: 12, weather: 'cloudy', elevation: 1200 },
    segments: [
      // 1区 10.0km アップダウン: 起伏のアプローチ。山岳・スタミナ複合
      seg(1, 10.0, 20, 18, { mountainUp: 0.25, mountainDown: 0.20, stamina: 0.30, pacing: 0.15, recovery: 0.10 }),
      // 2区 12.0km 急登: 長い山登り区間。スタミナで失速しない持続力
      seg(2, 12.0, 55,  2, { mountainUp: 0.68, stamina: 0.18, mental: 0.08, pacing: 0.04, recovery: 0.02 }),
      // 3区 9.0km 急登: 短くて急。爆発的な登攀力が全て
      seg(3, 9.0,  55,  2, { mountainUp: 0.75, stamina: 0.12, mental: 0.07, recovery: 0.04, pacing: 0.02 }),
      // 4区 11.0km 急降: 長い下り。技術と速さのコントロール
      seg(4, 11.0,  2, 55, { mountainDown: 0.62, speed: 0.20, mental: 0.10, pacing: 0.05, recovery: 0.03 }),
      // 5区 9.5km 急降: 短い急降。攻撃的な下り専門が輝く
      seg(5, 9.5,   2, 55, { mountainDown: 0.68, speed: 0.18, mental: 0.08, pacing: 0.04, recovery: 0.02 }),
      // 6区 8.5km アップダウン: 帰路起伏。疲弊した脚で最後の山岳戦
      seg(6, 8.5,  20, 18, { mountainUp: 0.22, mountainDown: 0.25, stamina: 0.28, pacing: 0.15, recovery: 0.10 }),
    ],
    participants: ALL_TEAM_IDS,
  },

  // ───── Race 05: 関西スプリント駅伝 ─────
  // 平坦主体の短距離戦。ただし4区だけ長くスタミナ勝負になる。
  {
    id: 'race-2027-05',
    name: '関西スプリント駅伝',
    date: '2027-06-28',
    location: '大阪',
    type: 'league',
    conditions: { temperature: 24, weather: 'sunny', elevation: 20 },
    segments: [
      // 1区 7.5km 平坦: 速さのオープニング
      seg(1, 7.5,  0,  0, { speed: 0.63, pacing: 0.18, mental: 0.11, stamina: 0.05, recovery: 0.03 }),
      // 2区 8.0km 緩傾斜: ペースの読み合い
      seg(2, 8.0,  5,  5, { pacing: 0.40, speed: 0.26, mental: 0.20, stamina: 0.09, recovery: 0.05 }),
      // 3区 6.5km 平坦: 再び速さ区間
      seg(3, 6.5,  0,  0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      // 4区 13.5km 緩上り: 唯一の長丁場。スタミナと回復力が鍵
      seg(4, 13.5, 8,  3, { stamina: 0.40, recovery: 0.26, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      // 5区 6.0km 平坦: 最短爆発区間
      seg(5, 6.0,  0,  0, { speed: 0.72, pacing: 0.12, mental: 0.08, stamina: 0.05, recovery: 0.03 }),
      // 6区 9.5km 緩傾斜: 精神のアンカー戦
      seg(6, 9.5,  5,  5, { mental: 0.36, pacing: 0.30, stamina: 0.20, recovery: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },

  // ───── Race 06: 九州夏季駅伝 ─────
  // 酷暑。スタミナ・回復力の消耗戦。速さよりメンタルが重要になる。
  {
    id: 'race-2027-06',
    name: '九州夏季駅伝',
    date: '2027-07-19',
    location: '福岡',
    type: 'league',
    conditions: { temperature: 31, weather: 'sunny', elevation: 60 },
    segments: [
      // 1区 7.0km 平坦: 熱気の中の先行。精神とペースが速さより重要
      seg(1, 7.0,  0,  0, { speed: 0.55, pacing: 0.22, mental: 0.14, stamina: 0.06, recovery: 0.03 }),
      // 2区 9.0km 緩傾斜: 夏の精神消耗戦
      seg(2, 9.0,  5,  5, { mental: 0.36, pacing: 0.28, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      // 3区 16.5km 緩上り: 猛暑の長丁場。回復力がないと後半崩壊
      seg(3, 16.5, 8,  3, { stamina: 0.44, recovery: 0.26, pacing: 0.18, mental: 0.08, speed: 0.04 }),
      // 4区 10.5km 緩傾斜: 消耗した体で回復力が問われる
      seg(4, 10.5, 5,  5, { recovery: 0.40, pacing: 0.28, stamina: 0.22, mental: 0.08, speed: 0.02 }),
      // 5区 11.0km 起伏: 夏の起伏。回復力ありきの山岳戦
      seg(5, 11.0, 20, 18, { mountainUp: 0.24, mountainDown: 0.20, stamina: 0.28, recovery: 0.18, pacing: 0.10 }),
      // 6区 6.0km 平坦: 一瞬の爆発区間
      seg(6, 6.0,  0,  0, { speed: 0.65, pacing: 0.16, mental: 0.12, stamina: 0.04, recovery: 0.03 }),
      // 7区 8.5km 緩傾斜: アンカー前。ペースと精神で踏ん張る
      seg(7, 8.5,  5,  5, { pacing: 0.38, mental: 0.26, stamina: 0.20, recovery: 0.12, speed: 0.04 }),
      // 8区 14.5km 緩上り: 夏最長アンカー。スタミナ・回復力の総決算
      seg(8, 14.5, 8,  3, { stamina: 0.42, recovery: 0.28, pacing: 0.18, mental: 0.08, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },

  // ───── Race 07: 信州アルペン駅伝 ─────
  // 山岳に特化。登り下りが連続し、アンカーのみスタミナ型が活きる。
  {
    id: 'race-2027-07',
    name: '信州アルペン駅伝',
    date: '2027-09-13',
    location: '長野',
    type: 'league',
    conditions: { temperature: 19, weather: 'sunny', elevation: 800 },
    segments: [
      // 1区 9.5km 起伏: 山岳へのアプローチ。オールラウンドな山岳力
      seg(1, 9.5,  20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, pacing: 0.14, recovery: 0.10 }),
      // 2区 10.5km 急登: 長い技術的登り。スタミナ込みの山登り力
      seg(2, 10.5, 55,  2, { mountainUp: 0.55, stamina: 0.24, pacing: 0.12, mental: 0.06, recovery: 0.03 }),
      // 3区 8.5km 急登: 短い急登。爆発的登山力が支配
      seg(3, 8.5,  55,  2, { mountainUp: 0.74, stamina: 0.12, mental: 0.08, recovery: 0.04, pacing: 0.02 }),
      // 4区 10.0km 急降: 技術的長い下り。山下りとスピードのバランス
      seg(4, 10.0,  2, 55, { mountainDown: 0.55, speed: 0.22, pacing: 0.12, mental: 0.08, recovery: 0.03 }),
      // 5区 8.5km 急降: 短い急降。攻撃的山下り
      seg(5, 8.5,   2, 55, { mountainDown: 0.68, speed: 0.18, mental: 0.08, pacing: 0.04, recovery: 0.02 }),
      // 6区 11.0km 緩上り: 山から帰るアンカー。スタミナ型の逆襲
      seg(6, 11.0,  8,  3, { stamina: 0.40, pacing: 0.24, recovery: 0.22, mental: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },

  // ───── Race 08: 全日本プロ駅伝 ─────
  // 最難関クラスの長距離大会。全区間が長く、スタミナ・回復力なしには完走できない。
  {
    id: 'race-2027-08',
    name: '全日本プロ駅伝',
    date: '2027-10-11',
    location: '名古屋',
    type: 'league',
    conditions: { temperature: 19, weather: 'sunny', elevation: 50 },
    segments: [
      // 1区 9.5km 平坦: 戦略的開幕。ペースと精神で位置を取る
      seg(1, 9.5,  0,  0, { pacing: 0.38, speed: 0.28, mental: 0.20, stamina: 0.10, recovery: 0.04 }),
      // 2区 13.3km 緩傾斜: 長い戦術区間。回復力でペースを維持
      seg(2, 13.3, 5,  5, { pacing: 0.35, stamina: 0.28, mental: 0.22, recovery: 0.12, speed: 0.03 }),
      // 3区 19.7km 緩上り: 全試合屈指の最長区間。スタミナと回復力が全て
      seg(3, 19.7, 8,  3, { stamina: 0.48, recovery: 0.28, pacing: 0.16, mental: 0.06, speed: 0.02 }),
      // 4区 14.1km 起伏: 長い起伏。脚への累積ダメージに耐える
      seg(4, 14.1, 20, 18, { mountainUp: 0.26, mountainDown: 0.20, stamina: 0.30, recovery: 0.14, pacing: 0.10 }),
      // 5区 18.5km 緩上り: もう一つの超長区間。純粋スタミナ勝負
      seg(5, 18.5, 8,  3, { stamina: 0.46, recovery: 0.26, pacing: 0.18, mental: 0.08, speed: 0.02 }),
      // 6区 12.8km 緩傾斜: メンタルの踏ん張り区間
      seg(6, 12.8, 5,  5, { mental: 0.35, pacing: 0.30, stamina: 0.22, recovery: 0.10, speed: 0.03 }),
      // 7区 11.6km 起伏: 二つ目の起伏。疲弊した体での山岳戦
      seg(7, 11.6, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.10 }),
      // 8区 21.4km 緩上り: シーズン最長アンカー。究極のスタミナ戦
      seg(8, 21.4, 8,  3, { stamina: 0.50, recovery: 0.28, pacing: 0.14, mental: 0.06, speed: 0.02 }),
    ],
    participants: ALL_TEAM_IDS,
  },

  // ───── Race 09: 秋季グランプリ ─────
  // バランス型。スプリンター・山岳・スタミナ型がまんべんなく活きるコース。
  {
    id: 'race-2027-09',
    name: '秋季グランプリ',
    date: '2027-11-08',
    location: '横浜',
    type: 'league',
    conditions: { temperature: 14, weather: 'cloudy', elevation: 40 },
    segments: [
      // 1区 8.5km 平坦: 秋の開幕ダッシュ
      seg(1, 8.5,  0,  0, { speed: 0.60, pacing: 0.20, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      // 2区 12.0km 起伏: 最初の山岳区間
      seg(2, 12.0, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
      // 3区 17.5km 緩上り: 長距離スタミナ区間
      seg(3, 17.5, 8,  3, { stamina: 0.44, recovery: 0.24, pacing: 0.20, mental: 0.08, speed: 0.04 }),
      // 4区 11.0km 緩傾斜: 中間タクティカル
      seg(4, 11.0, 5,  5, { pacing: 0.38, mental: 0.28, stamina: 0.20, recovery: 0.10, speed: 0.04 }),
      // 5区 13.5km 起伏: 二つ目の山岳。スタミナ込みの起伏耐性
      seg(5, 13.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.20, stamina: 0.28, recovery: 0.14, pacing: 0.10 }),
      // 6区 7.0km 平坦: 短い爆発区間
      seg(6, 7.0,  0,  0, { speed: 0.66, pacing: 0.16, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      // 7区 16.5km 緩上り: ラスト前の長丁場
      seg(7, 16.5, 8,  3, { stamina: 0.44, recovery: 0.24, pacing: 0.20, mental: 0.08, speed: 0.04 }),
      // 8区 9.0km 緩傾斜: 精神のアンカー戦
      seg(8, 9.0,  5,  5, { mental: 0.38, pacing: 0.30, stamina: 0.20, recovery: 0.08, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },

  // ───── Race 10: JPELグランドファイナル ─────
  // 全能力が問われる集大成。10区間で全てのスタット型に見せ場がある。
  {
    id: 'race-2027-10',
    name: 'JPELグランドファイナル',
    date: '2027-12-27',
    location: '東京',
    type: 'league',
    conditions: { temperature: 6, weather: 'sunny', elevation: 30 },
    segments: [
      // 1区 9.0km 平坦: 戦術的な幕開け。速さよりも読み合い
      seg(1,  9.0,  0,  0, { pacing: 0.36, speed: 0.28, mental: 0.22, stamina: 0.10, recovery: 0.04 }),
      // 2区 12.0km 緩傾斜: 精神の中盤入り。メンタルが差を生む
      seg(2,  12.0, 5,  5, { mental: 0.36, pacing: 0.30, stamina: 0.22, recovery: 0.08, speed: 0.04 }),
      // 3区 14.5km 起伏: 長い起伏の試練
      seg(3,  14.5, 20, 18, { mountainUp: 0.26, mountainDown: 0.20, stamina: 0.30, recovery: 0.14, pacing: 0.10 }),
      // 4区 21.0km 緩上り: 全レース最長区間。究極のスタミナ持久戦
      seg(4,  21.0, 8,  3, { stamina: 0.48, recovery: 0.28, pacing: 0.16, mental: 0.06, speed: 0.02 }),
      // 5区 11.5km 急登: 技術的登り。スタミナ込みの山岳力
      seg(5,  11.5, 55,  2, { mountainUp: 0.55, stamina: 0.24, pacing: 0.12, mental: 0.06, recovery: 0.03 }),
      // 6区 10.5km 急降: 頂上からの技術的下り
      seg(6,  10.5,  2, 55, { mountainDown: 0.55, speed: 0.22, pacing: 0.12, mental: 0.08, recovery: 0.03 }),
      // 7区 20.0km 緩上り: 二つ目の超長区間。回復力で後半を守る
      seg(7,  20.0, 8,  3, { stamina: 0.46, recovery: 0.26, pacing: 0.18, mental: 0.07, speed: 0.03 }),
      // 8区 13.5km 起伏: 最終起伏の難関
      seg(8,  13.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.10 }),
      // 9区 11.0km 緩傾斜: 回復力で粘り込む終盤
      seg(9,  11.0, 5,  5, { recovery: 0.40, pacing: 0.28, stamina: 0.22, mental: 0.08, speed: 0.02 }),
      // 10区 7.0km 平坦: 大詰めの最終スプリント
      seg(10,  7.0, 0,  0, { speed: 0.62, pacing: 0.18, mental: 0.14, stamina: 0.04, recovery: 0.02 }),
    ],
    participants: ALL_TEAM_IDS,
  },
]

// ── リザーブレース (各区間も固有の重みを持つ) ────────────────────────────
// months: 開催できる月。名前に季節が入っているレースはその季節にしか開催しない（11月に春季オープンを防ぐ）。
// 未指定は通年OK
type RaceTemplate = Omit<Race, 'id' | 'date' | 'results'> & { months?: number[] }
const RESERVE_RACE_POOL: RaceTemplate[] = [
  {
    name: 'リザーブ春季オープン',      location: '川越',  type: 'league', months: [3, 4, 5],
    conditions: { temperature: 14, weather: 'sunny',  elevation: 30 },
    segments: [
      seg(1, 7.0, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(2, 6.5, 5,   5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(3, 9.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.20, recovery: 0.12, speed: 0.06 }),
      seg(4,11.5, 0,   0, { pacing: 0.38, stamina: 0.28, mental: 0.20, recovery: 0.10, speed: 0.04 }),
      seg(5,13.5, 5,   5, { recovery: 0.36, stamina: 0.28, pacing: 0.22, mental: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '東海リザーブ駅伝',          location: '浜松',  type: 'league',
    conditions: { temperature: 18, weather: 'cloudy', elevation: 50 },
    segments: [
      seg(1, 6.0, 0,   0, { speed: 0.64, pacing: 0.18, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      seg(2, 8.5, 5,   5, { mental: 0.34, pacing: 0.30, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      seg(3,10.0,20,  18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
      seg(4, 7.5, 0,   0, { speed: 0.60, pacing: 0.20, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(5,12.0, 8,   3, { recovery: 0.34, stamina: 0.32, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      seg(6,14.5, 0,   0, { stamina: 0.40, pacing: 0.26, recovery: 0.20, mental: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '北関東リザーブ交流戦',       location: '水戸',  type: 'league',
    conditions: { temperature: 20, weather: 'sunny',  elevation: 40 },
    segments: [
      seg(1, 5.5, 0,   0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      seg(2, 7.0, 5,   5, { pacing: 0.40, speed: 0.28, mental: 0.20, stamina: 0.08, recovery: 0.04 }),
      seg(3, 6.0, 0,   0, { speed: 0.65, pacing: 0.16, mental: 0.10, stamina: 0.06, recovery: 0.03 }),
      seg(4, 9.5, 8,   3, { pacing: 0.38, stamina: 0.24, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5,11.0, 5,   5, { mental: 0.34, pacing: 0.30, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '四国リザーブサマーレース',   location: '高松',  type: 'league', months: [6, 9],
    conditions: { temperature: 27, weather: 'sunny',  elevation: 60 },
    segments: [
      seg(1, 6.5, 0,   0, { speed: 0.60, pacing: 0.18, mental: 0.14, stamina: 0.05, recovery: 0.03 }),
      seg(2, 9.0,55,   2, { mountainUp: 0.72, stamina: 0.14, mental: 0.08, recovery: 0.04, pacing: 0.02 }),
      seg(3, 8.5, 2,  55, { mountainDown: 0.66, speed: 0.18, mental: 0.09, pacing: 0.04, recovery: 0.03 }),
      seg(4, 7.0, 5,   5, { pacing: 0.40, speed: 0.26, mental: 0.20, stamina: 0.08, recovery: 0.06 }),
      seg(5,12.5, 8,   3, { recovery: 0.38, stamina: 0.28, pacing: 0.20, mental: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '北東北リザーブ夏季大会',     location: '盛岡',  type: 'league', months: [6, 9],
    conditions: { temperature: 22, weather: 'cloudy', elevation: 70 },
    segments: [
      seg(1, 8.0, 5,   5, { mental: 0.34, pacing: 0.30, speed: 0.18, stamina: 0.12, recovery: 0.06 }),
      seg(2,10.5,20,  18, { mountainUp: 0.28, mountainDown: 0.20, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
      seg(3, 9.0,55,   2, { mountainUp: 0.74, stamina: 0.13, mental: 0.07, recovery: 0.04, pacing: 0.02 }),
      seg(4, 7.5, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(5,13.0, 8,   3, { recovery: 0.36, stamina: 0.30, pacing: 0.20, mental: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: 'リザーブ秋季フィナーレ',     location: '宇都宮', type: 'league', months: [9, 10, 11],
    conditions: { temperature: 20, weather: 'sunny',  elevation: 45 },
    segments: [
      seg(1, 7.5, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(2, 8.0, 5,   5, { mental: 0.35, pacing: 0.30, stamina: 0.20, recovery: 0.10, speed: 0.05 }),
      seg(3,11.5,20,  18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
      seg(4, 9.0, 0,   0, { pacing: 0.38, speed: 0.26, mental: 0.20, stamina: 0.10, recovery: 0.06 }),
      seg(5,13.0, 8,   3, { recovery: 0.36, stamina: 0.30, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      seg(6,15.5, 5,   5, { stamina: 0.42, recovery: 0.26, pacing: 0.20, mental: 0.08, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: 'リザーブファイナル',          location: '千葉',  type: 'league', months: [10, 11],
    conditions: { temperature: 18, weather: 'sunny',  elevation: 35 },
    segments: [
      seg(1, 6.0, 5,   5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(2, 8.0, 0,   0, { pacing: 0.38, speed: 0.28, mental: 0.20, stamina: 0.10, recovery: 0.04 }),
      seg(3,10.5,12,   8, { mental: 0.32, pacing: 0.30, stamina: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(4, 7.5, 0,   0, { speed: 0.64, pacing: 0.16, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(5, 9.0,20,  18, { mountainUp: 0.26, mountainDown: 0.24, stamina: 0.28, pacing: 0.12, recovery: 0.10 }),
      seg(6,14.0, 8,   3, { stamina: 0.40, recovery: 0.26, pacing: 0.20, mental: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '関西リザーブカップ',          location: '大阪',  type: 'league',
    conditions: { temperature: 16, weather: 'cloudy', elevation: 25 },
    segments: [
      seg(1, 5.8, 0,   0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      seg(2, 7.5, 5,   5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(3, 6.5, 0,   0, { speed: 0.66, pacing: 0.16, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      seg(4,10.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5,12.0, 0,   0, { pacing: 0.36, stamina: 0.28, recovery: 0.18, mental: 0.14, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '山岳リザーブ挑戦戦',         location: '甲府',  type: 'league',
    conditions: { temperature: 15, weather: 'sunny',  elevation: 120 },
    segments: [
      seg(1, 7.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(2, 9.5,55,   2, { mountainUp: 0.73, stamina: 0.14, mental: 0.07, recovery: 0.04, pacing: 0.02 }),
      seg(3, 8.0,20,  18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, pacing: 0.14, recovery: 0.10 }),
      seg(4,10.5, 2,  55, { mountainDown: 0.52, speed: 0.24, pacing: 0.12, mental: 0.08, recovery: 0.04 }),
      seg(5, 7.5, 5,   5, { pacing: 0.40, speed: 0.26, mental: 0.20, stamina: 0.08, recovery: 0.06 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '九州リザーブ交流戦',         location: '熊本',  type: 'league',
    conditions: { temperature: 23, weather: 'sunny',  elevation: 55 },
    segments: [
      seg(1, 6.5, 5,   5, { pacing: 0.40, speed: 0.28, mental: 0.18, stamina: 0.09, recovery: 0.05 }),
      seg(2, 9.0, 0,   0, { speed: 0.60, pacing: 0.20, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(3,11.0,20,  18, { mountainUp: 0.24, mountainDown: 0.22, stamina: 0.30, recovery: 0.14, pacing: 0.10 }),
      seg(4, 8.5, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5,10.0, 0,   0, { mental: 0.34, pacing: 0.30, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '中部リザーブ大会',            location: '静岡',  type: 'league',
    conditions: { temperature: 19, weather: 'windy',  elevation: 40 },
    segments: [
      seg(1, 7.5, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(2, 6.0, 5,   5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(3, 8.5, 0,   0, { pacing: 0.38, speed: 0.28, mental: 0.20, stamina: 0.10, recovery: 0.04 }),
      seg(4,11.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5, 9.5, 5,   5, { mental: 0.36, pacing: 0.28, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      seg(6,13.0, 0,   0, { stamina: 0.40, pacing: 0.26, recovery: 0.20, mental: 0.10, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '北海道リザーブ秋冬戦',       location: '旭川',  type: 'league', months: [10, 11],
    conditions: { temperature: 10, weather: 'cloudy', elevation: 65 },
    segments: [
      seg(1, 8.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(2,10.5, 5,   5, { mental: 0.36, pacing: 0.28, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      seg(3, 7.0, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(4,12.5,20,  18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.10 }),
      seg(5, 9.0, 0,   0, { pacing: 0.38, speed: 0.26, mental: 0.20, stamina: 0.10, recovery: 0.06 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: 'スプリント型リザーブ戦',     location: '川崎',  type: 'league',
    conditions: { temperature: 17, weather: 'sunny',  elevation: 20 },
    segments: [
      seg(1, 5.0, 0,   0, { speed: 0.70, pacing: 0.14, mental: 0.08, stamina: 0.05, recovery: 0.03 }),
      seg(2, 4.5, 0,   0, { speed: 0.74, pacing: 0.12, mental: 0.07, stamina: 0.04, recovery: 0.03 }),
      seg(3, 6.0, 5,   5, { speed: 0.55, pacing: 0.24, mental: 0.14, stamina: 0.04, recovery: 0.03 }),
      seg(4, 5.5, 0,   0, { speed: 0.72, pacing: 0.12, mental: 0.08, stamina: 0.05, recovery: 0.03 }),
      seg(5, 7.0, 0,   0, { speed: 0.65, pacing: 0.16, mental: 0.11, stamina: 0.05, recovery: 0.03 }),
      seg(6, 5.8, 0,   0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
    ],
    participants: ALL_TEAM_IDS,
  },
  {
    name: '長距離リザーブ耐久戦',       location: '神戸',  type: 'league',
    conditions: { temperature: 21, weather: 'sunny',  elevation: 55 },
    segments: [
      seg(1, 9.0, 5,   5, { mental: 0.34, pacing: 0.28, stamina: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(2,13.5, 8,   3, { recovery: 0.36, stamina: 0.32, pacing: 0.20, mental: 0.08, speed: 0.04 }),
      seg(3,11.0, 0,   0, { pacing: 0.36, stamina: 0.28, mental: 0.20, recovery: 0.12, speed: 0.04 }),
      seg(4,15.0, 5,   5, { stamina: 0.42, recovery: 0.26, pacing: 0.20, mental: 0.08, speed: 0.04 }),
      seg(5,14.5, 8,   3, { stamina: 0.44, recovery: 0.26, pacing: 0.18, mental: 0.08, speed: 0.04 }),
    ],
    participants: ALL_TEAM_IDS,
  },
]

const RACE_DATES_BY_SLOT = [
  '-03-22', '-04-19', '-05-17', '-06-14', '-09-27', '-10-25', '-11-22',
]

function seededIdx(year: number, slot: number, range: number): number {
  const x = Math.sin(year * 9301 + slot * 1231 + 797) * 43758.5453
  return Math.abs(Math.floor((x - Math.floor(x)) * range)) % range
}

export const SECOND_TEAM_RACES_INITIAL: Race[] = RESERVE_RACE_POOL.slice(0, 7).map(({ months: _months, ...tmpl }, i) => ({
  ...tmpl,
  id: `r2-2027-${String(i + 1).padStart(2, '0')}`,
  date: `2027${RACE_DATES_BY_SLOT[i] ?? '-10-01'}`,
  results: undefined,
}))

// 各スロットの開催月（RACE_DATES_BY_SLOT と対応）
const SLOT_MONTHS = [3, 4, 5, 6, 9, 10, 11]

export function generateSecondTeamRaces(year: number): Race[] {
  const used = new Set<number>()
  const picked: Race[] = []
  for (let slot = 0; slot < 7; slot++) {
    const month = SLOT_MONTHS[slot] ?? 10
    // 開催時期の合うレースだけから抽選（名前の季節と実開催月がズレないように）。足りなければ全体から
    const indexed = RESERVE_RACE_POOL.map((t, i) => ({ t, i })).filter(x => !used.has(x.i))
    const fits = indexed.filter(x => x.t.months == null || x.t.months.includes(month))
    const pool = fits.length > 0 ? fits : indexed
    const pick = pool[seededIdx(year, slot, pool.length)]
    used.add(pick.i)
    const { months: _months, ...tmpl } = pick.t
    picked.push({
      ...tmpl,
      id: `r2-${year}-${String(slot + 1).padStart(2, '0')}`,
      date: `${year}${RACE_DATES_BY_SLOT[slot] ?? '-10-01'}`,
      segments: tmpl.segments.map((s, si) => ({ ...s, index: si + 1 })),
      results: undefined,
    })
  }
  return picked
}

export function generateSeasonRaces(year: number): Race[] {
  return SEASON_2027_RACES.map(r => ({
    ...r,
    id: r.id.replace('2027', String(year)),
    date: r.date.replace('2027', String(year)),
    results: undefined,
  }))
}

export const MAIN_RACE_NAMES: readonly string[] = SEASON_2027_RACES.map(r => r.name)
export const RESERVE_RACE_POOL_NAMES: readonly string[] = RESERVE_RACE_POOL.map(r => r.name)
