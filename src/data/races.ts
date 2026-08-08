import type { Race, IndividualEvent, Specialty } from '../types'

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

// W = statWeights shorthand. Each segment gets its own unique calibration.
type W = Partial<Record<'speed' | 'stamina' | 'mountainUp' | 'mountainDown' | 'pacing' | 'mental' | 'recovery', number>>

// recommended は末尾の追加引数（既存呼び出し側との後方互換のため）。
// SEASON_2027_RACES は全区間に渡すが、RESERVE_RACE_POOL 等は省略したまま（未指定でよい）。
function seg(index: number, distanceKm: number, uphillPct: number, downhillPct: number, w?: W, recommended?: Specialty): Race['segments'][number] {
  return { index, distanceKm, uphillPct, downhillPct, ...(w ? { statWeights: w } : {}), ...(recommended ? { recommended } : {}) }
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
      seg(1, 8.0,  0,  0, { speed: 0.58, pacing: 0.18, mental: 0.12, stamina: 0.08, recovery: 0.04 }, 'sprinter'),
      // 2区 5.8km 緩傾斜: 短くても起伏あり。ペース管理が鍵
      seg(2, 5.8,  5,  5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }, 'sprinter'),
      // 3区 8.5km 緩傾斜: 中盤の精神消耗戦。冷静さが差を生む
      seg(3, 8.5,  5,  5, { mental: 0.35, pacing: 0.30, stamina: 0.20, recovery: 0.10, speed: 0.05 }, 'ace'),
      // 4区 6.2km 平坦: 短距離爆発区間。純粋な速さ勝負
      seg(4, 6.2,  0,  0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
      // 5区 6.4km 緩傾斜: つなぎ区間。ペースを乱さない安定性
      seg(5, 6.4,  5,  5, { pacing: 0.38, speed: 0.30, mental: 0.18, recovery: 0.08, stamina: 0.06 }, 'sprinter'),
      // 6区 10.2km 緩上り: 最長アンカー。スタミナと回復力で粘る
      seg(6, 10.2, 8,  3, { stamina: 0.38, pacing: 0.25, recovery: 0.22, mental: 0.10, speed: 0.05 }, 'long'),
      // 7区  9.5km 平坦: 追加区間
      seg(7,  9.5, 0,   0, { pacing: 0.38, stamina: 0.30, mental: 0.20, recovery: 0.08, speed: 0.04 }, 'long'),
      // 8区  7.5km 緩起伏: 追加区間
      seg(8,  7.5, 5,   5, { pacing: 0.36, stamina: 0.30, mental: 0.18, recovery: 0.12, speed: 0.04 }, 'undulating'),
      // 9区 11.0km 平坦: 追加区間
      seg(9, 11.0, 0,   0, { pacing: 0.38, stamina: 0.30, mental: 0.20, recovery: 0.08, speed: 0.04 }, 'grinder'),
      // 10区  6.5km 平坦: 追加区間
      seg(10,  6.5, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'sprinter'),
    ],
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
      seg(1, 9.0,   5,  5, { mental: 0.32, pacing: 0.30, speed: 0.18, stamina: 0.14, recovery: 0.06 }, 'ace'),
      // 2区 11.5km 起伏: 最初の山岳越え。オールラウンドな山岳力
      seg(2, 11.5, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }, 'allrounder'),
      // 3区 17.0km 緩上り: 最長。真のスタミナと回復力の消耗戦
      seg(3, 17.0,  8,  3, { stamina: 0.45, recovery: 0.25, pacing: 0.18, mental: 0.08, speed: 0.04 }, 'long'),
      // 4区 10.0km 緩傾斜: 中間つなぎ。ペースとメンタルで繋ぐ
      seg(4, 10.0,  5,  5, { pacing: 0.36, mental: 0.26, stamina: 0.22, recovery: 0.12, speed: 0.04 }, 'ace'),
      // 5区 12.5km 起伏: 二度目の山岳越え。疲弊した脚での粘り
      seg(5, 12.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.20, stamina: 0.26, recovery: 0.16, pacing: 0.10 }, 'allrounder'),
      // 6区 9.5km 緩傾斜: 回復力で後半を粘りきる区間
      seg(6, 9.5,   5,  5, { recovery: 0.38, pacing: 0.28, stamina: 0.22, mental: 0.08, speed: 0.04 }, 'grinder'),
      // 7区 16.0km 緩上り: 二つ目の長丁場。スタミナの真価が出る
      seg(7, 16.0,  8,  3, { stamina: 0.42, recovery: 0.24, pacing: 0.20, mental: 0.10, speed: 0.04 }, 'long'),
      // 8区 7.5km 平坦: 最終スプリントアンカー
      seg(8, 7.5,   0,  0, { speed: 0.60, pacing: 0.18, mental: 0.14, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
    ],
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
      seg(1, 6.5,  0,  0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
      // 2区 7.0km 平坦: 連続スプリント。前区間との繋ぎが課題
      seg(2, 7.0,  0,  0, { speed: 0.65, pacing: 0.16, mental: 0.10, stamina: 0.06, recovery: 0.03 }, 'sprinter'),
      // 3区 11.5km 緩傾斜: 長めの精神消耗戦
      seg(3, 11.5, 5,  5, { mental: 0.32, pacing: 0.32, stamina: 0.22, recovery: 0.10, speed: 0.04 }, 'ace'),
      // 4区 6.0km 平坦: 純粋速さ爆発区間
      seg(4, 6.0,  0,  0, { speed: 0.70, pacing: 0.14, mental: 0.08, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
      // 5区 10.8km 緩傾斜: 中盤タクティカル
      seg(5, 10.8, 5,  5, { pacing: 0.38, mental: 0.28, stamina: 0.20, recovery: 0.10, speed: 0.04 }, 'ace'),
      // 6区 5.5km 平坦: 最短区間・絶対速度のみ問われる
      seg(6, 5.5,  0,  0, { speed: 0.72, pacing: 0.12, mental: 0.08, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
      // 7区 9.2km 緩傾斜: アンカー前の消耗戦
      seg(7, 9.2,  5,  5, { pacing: 0.35, stamina: 0.25, mental: 0.22, recovery: 0.12, speed: 0.06 }, 'ace'),
      // 8区 12.5km 緩上り: 最長アンカー。スタミナ型が有利
      seg(8, 12.5, 8,  3, { stamina: 0.40, pacing: 0.24, recovery: 0.20, mental: 0.12, speed: 0.04 }, 'long'),
    ],
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
      seg(1, 10.0, 20, 18, { mountainUp: 0.25, mountainDown: 0.20, stamina: 0.30, pacing: 0.15, recovery: 0.10 }, 'allrounder'),
      // 2区 12.0km 急登: 長い山登り区間。スタミナで失速しない持続力
      seg(2, 12.0, 55,  2, { mountainUp: 0.68, stamina: 0.18, mental: 0.08, pacing: 0.04, recovery: 0.02 }, 'mountain_up'),
      // 3区 9.0km 急登: 短くて急。爆発的な登攀力が全て
      seg(3, 9.0,  55,  2, { mountainUp: 0.75, stamina: 0.12, mental: 0.07, recovery: 0.04, pacing: 0.02 }, 'mountain_up'),
      // 4区 11.0km 急降: 長い下り。技術と速さのコントロール
      seg(4, 11.0,  2, 55, { mountainDown: 0.62, speed: 0.20, mental: 0.10, pacing: 0.05, recovery: 0.03 }, 'mountain_down'),
      // 5区 9.5km 急降: 短い急降。攻撃的な下り専門が輝く
      seg(5, 9.5,   2, 55, { mountainDown: 0.68, speed: 0.18, mental: 0.08, pacing: 0.04, recovery: 0.02 }, 'mountain_down'),
      // 6区 8.5km アップダウン: 帰路起伏。疲弊した脚で最後の山岳戦
      seg(6, 8.5,  20, 18, { mountainUp: 0.22, mountainDown: 0.25, stamina: 0.28, pacing: 0.15, recovery: 0.10 }, 'allrounder'),
    ],
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
      seg(1, 7.5,  0,  0, { speed: 0.63, pacing: 0.18, mental: 0.11, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
      // 2区 8.0km 緩傾斜: ペースの読み合い
      seg(2, 8.0,  5,  5, { pacing: 0.40, speed: 0.26, mental: 0.20, stamina: 0.09, recovery: 0.05 }, 'sprinter'),
      // 3区 6.5km 平坦: 再び速さ区間
      seg(3, 6.5,  0,  0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
      // 4区 13.5km 緩上り: 唯一の長丁場。スタミナと回復力が鍵
      seg(4, 13.5, 8,  3, { stamina: 0.40, recovery: 0.26, pacing: 0.20, mental: 0.10, speed: 0.04 }, 'long'),
      // 5区 6.0km 平坦: 最短爆発区間
      seg(5, 6.0,  0,  0, { speed: 0.72, pacing: 0.12, mental: 0.08, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
      // 6区 9.5km 緩傾斜: 精神のアンカー戦
      seg(6, 9.5,  5,  5, { mental: 0.36, pacing: 0.30, stamina: 0.20, recovery: 0.10, speed: 0.04 }, 'ace'),
    ],
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
      seg(1, 7.0,  0,  0, { speed: 0.55, pacing: 0.22, mental: 0.14, stamina: 0.06, recovery: 0.03 }, 'sprinter'),
      // 2区 9.0km 緩傾斜: 夏の精神消耗戦
      seg(2, 9.0,  5,  5, { mental: 0.36, pacing: 0.28, stamina: 0.22, recovery: 0.10, speed: 0.04 }, 'ace'),
      // 3区 16.5km 緩上り: 猛暑の長丁場。回復力がないと後半崩壊
      seg(3, 16.5, 8,  3, { stamina: 0.44, recovery: 0.26, pacing: 0.18, mental: 0.08, speed: 0.04 }, 'long'),
      // 4区 10.5km 緩傾斜: 消耗した体で回復力が問われる
      seg(4, 10.5, 5,  5, { recovery: 0.40, pacing: 0.28, stamina: 0.22, mental: 0.08, speed: 0.02 }, 'grinder'),
      // 5区 11.0km 起伏: 夏の起伏。回復力ありきの山岳戦
      seg(5, 11.0, 20, 18, { mountainUp: 0.24, mountainDown: 0.20, stamina: 0.28, recovery: 0.18, pacing: 0.10 }, 'allrounder'),
      // 6区 6.0km 平坦: 一瞬の爆発区間
      seg(6, 6.0,  0,  0, { speed: 0.65, pacing: 0.16, mental: 0.12, stamina: 0.04, recovery: 0.03 }, 'sprinter'),
      // 7区 8.5km 緩傾斜: アンカー前。ペースと精神で踏ん張る
      seg(7, 8.5,  5,  5, { pacing: 0.38, mental: 0.26, stamina: 0.20, recovery: 0.12, speed: 0.04 }, 'ace'),
      // 8区 14.5km 緩上り: 夏最長アンカー。スタミナ・回復力の総決算
      seg(8, 14.5, 8,  3, { stamina: 0.42, recovery: 0.28, pacing: 0.18, mental: 0.08, speed: 0.04 }, 'long'),
    ],
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
      seg(1, 9.5,  20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, pacing: 0.14, recovery: 0.10 }, 'allrounder'),
      // 2区 10.5km 急登: 長い技術的登り。スタミナ込みの山登り力
      seg(2, 10.5, 55,  2, { mountainUp: 0.55, stamina: 0.24, pacing: 0.12, mental: 0.06, recovery: 0.03 }, 'mountain_up'),
      // 3区 8.5km 急登: 短い急登。爆発的登山力が支配
      seg(3, 8.5,  55,  2, { mountainUp: 0.74, stamina: 0.12, mental: 0.08, recovery: 0.04, pacing: 0.02 }, 'mountain_up'),
      // 4区 10.0km 急降: 技術的長い下り。山下りとスピードのバランス
      seg(4, 10.0,  2, 55, { mountainDown: 0.55, speed: 0.22, pacing: 0.12, mental: 0.08, recovery: 0.03 }, 'mountain_down'),
      // 5区 8.5km 急降: 短い急降。攻撃的山下り
      seg(5, 8.5,   2, 55, { mountainDown: 0.68, speed: 0.18, mental: 0.08, pacing: 0.04, recovery: 0.02 }, 'mountain_down'),
      // 6区 11.0km 緩上り: 山から帰るアンカー。スタミナ型の逆襲
      seg(6, 11.0,  8,  3, { stamina: 0.40, pacing: 0.24, recovery: 0.22, mental: 0.10, speed: 0.04 }, 'long'),
    ],
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
      seg(1, 9.5,  0,  0, { pacing: 0.38, speed: 0.28, mental: 0.20, stamina: 0.10, recovery: 0.04 }, 'ace'),
      // 2区 13.3km 緩傾斜: 長い戦術区間。回復力でペースを維持
      seg(2, 13.3, 5,  5, { pacing: 0.35, stamina: 0.28, mental: 0.22, recovery: 0.12, speed: 0.03 }, 'ace'),
      // 3区 19.7km 緩上り: 全試合屈指の最長区間。スタミナと回復力が全て
      seg(3, 19.7, 8,  3, { stamina: 0.48, recovery: 0.28, pacing: 0.16, mental: 0.06, speed: 0.02 }, 'long'),
      // 4区 14.1km 起伏: 長い起伏。脚への累積ダメージに耐える
      seg(4, 14.1, 20, 18, { mountainUp: 0.26, mountainDown: 0.20, stamina: 0.30, recovery: 0.14, pacing: 0.10 }, 'allrounder'),
      // 5区 18.5km 緩上り: もう一つの超長区間。純粋スタミナ勝負
      seg(5, 18.5, 8,  3, { stamina: 0.46, recovery: 0.26, pacing: 0.18, mental: 0.08, speed: 0.02 }, 'long'),
      // 6区 12.8km 緩傾斜: メンタルの踏ん張り区間
      seg(6, 12.8, 5,  5, { mental: 0.35, pacing: 0.30, stamina: 0.22, recovery: 0.10, speed: 0.03 }, 'ace'),
      // 7区 11.6km 起伏: 二つ目の起伏。疲弊した体での山岳戦
      seg(7, 11.6, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.10 }, 'allrounder'),
      // 8区 21.4km 緩上り: シーズン最長アンカー。究極のスタミナ戦
      seg(8, 21.4, 8,  3, { stamina: 0.50, recovery: 0.28, pacing: 0.14, mental: 0.06, speed: 0.02 }, 'long'),
    ],
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
      seg(1, 8.5,  0,  0, { speed: 0.60, pacing: 0.20, mental: 0.12, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
      // 2区 12.0km 起伏: 最初の山岳区間
      seg(2, 12.0, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }, 'allrounder'),
      // 3区 17.5km 緩上り: 長距離スタミナ区間
      seg(3, 17.5, 8,  3, { stamina: 0.44, recovery: 0.24, pacing: 0.20, mental: 0.08, speed: 0.04 }, 'long'),
      // 4区 11.0km 緩傾斜: 中間タクティカル
      seg(4, 11.0, 5,  5, { pacing: 0.38, mental: 0.28, stamina: 0.20, recovery: 0.10, speed: 0.04 }, 'ace'),
      // 5区 13.5km 起伏: 二つ目の山岳。スタミナ込みの起伏耐性
      seg(5, 13.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.20, stamina: 0.28, recovery: 0.14, pacing: 0.10 }, 'allrounder'),
      // 6区 7.0km 平坦: 短い爆発区間
      seg(6, 7.0,  0,  0, { speed: 0.66, pacing: 0.16, mental: 0.10, stamina: 0.05, recovery: 0.03 }, 'sprinter'),
      // 7区 16.5km 緩上り: ラスト前の長丁場
      seg(7, 16.5, 8,  3, { stamina: 0.44, recovery: 0.24, pacing: 0.20, mental: 0.08, speed: 0.04 }, 'long'),
      // 8区 9.0km 緩傾斜: 精神のアンカー戦
      seg(8, 9.0,  5,  5, { mental: 0.38, pacing: 0.30, stamina: 0.20, recovery: 0.08, speed: 0.04 }, 'ace'),
    ],
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
      seg(1,  9.0,  0,  0, { pacing: 0.36, speed: 0.28, mental: 0.22, stamina: 0.10, recovery: 0.04 }, 'ace'),
      // 2区 12.0km 緩傾斜: 精神の中盤入り。メンタルが差を生む
      seg(2,  12.0, 5,  5, { mental: 0.36, pacing: 0.30, stamina: 0.22, recovery: 0.08, speed: 0.04 }, 'ace'),
      // 3区 14.5km 起伏: 長い起伏の試練
      seg(3,  14.5, 20, 18, { mountainUp: 0.26, mountainDown: 0.20, stamina: 0.30, recovery: 0.14, pacing: 0.10 }, 'allrounder'),
      // 4区 21.0km 緩上り: 全レース最長区間。究極のスタミナ持久戦
      seg(4,  21.0, 8,  3, { stamina: 0.48, recovery: 0.28, pacing: 0.16, mental: 0.06, speed: 0.02 }, 'long'),
      // 5区 11.5km 急登: 技術的登り。スタミナ込みの山岳力
      seg(5,  11.5, 55,  2, { mountainUp: 0.55, stamina: 0.24, pacing: 0.12, mental: 0.06, recovery: 0.03 }, 'mountain_up'),
      // 6区 10.5km 急降: 頂上からの技術的下り
      seg(6,  10.5,  2, 55, { mountainDown: 0.55, speed: 0.22, pacing: 0.12, mental: 0.08, recovery: 0.03 }, 'mountain_down'),
      // 7区 20.0km 緩上り: 二つ目の超長区間。回復力で後半を守る
      seg(7,  20.0, 8,  3, { stamina: 0.46, recovery: 0.26, pacing: 0.18, mental: 0.07, speed: 0.03 }, 'long'),
      // 8区 13.5km 起伏: 最終起伏の難関
      seg(8,  13.5, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.10 }, 'allrounder'),
      // 9区 11.0km 緩傾斜: 回復力で粘り込む終盤
      seg(9,  11.0, 5,  5, { recovery: 0.40, pacing: 0.28, stamina: 0.22, mental: 0.08, speed: 0.02 }, 'grinder'),
      // 10区 7.0km 平坦: 大詰めの最終スプリント
      seg(10,  7.0, 0,  0, { speed: 0.62, pacing: 0.18, mental: 0.14, stamina: 0.04, recovery: 0.02 }, 'sprinter'),
    ],
  },
]

// ── リーグコースプール（3部制）───────────────────────────────────────
// JPELは1部・2部・3部の3部制。各部の最終走（ファイナル）だけ固定で、
// 残りは全部共通の LEAGUE_COURSE_POOL から毎年抽選で配る（抽選そのものはここでは実装しない）。
// 配分は 1部10本・2部8本・3部7本（各部ともファイナル1本を含む）。
//
//   FINAL_COURSES（3本・抽選対象外）
//     1部: JPELグランドファイナル … SEASON_2027_RACES の race-10 をそのまま流用
//     2部: 金沢ファイナル駅伝     … 新規
//     3部: 房総ファイナル駅伝     … 旧リザーブファイナル（千葉）を改名して転用
//   LEAGUE_COURSE_POOL（22本・抽選対象）
//     = SEASON_2027_RACES の非ファイナル9本（出雲開幕戦〜秋季グランプリ）
//     + 旧 RESERVE_RACE_POOL 14本のうちリザーブファイナルを除いた13本（location据え置きで改名済み）
//
//   22（プール） + 3（ファイナル） = 25本。全コース6〜10区間。
//
// 旧リザーブ（2軍）制度そのものは廃止済み。リザーブ用の日程生成
// （RACE_DATES_BY_SLOT / seededIdx / SECOND_TEAM_RACES_INITIAL / generateSecondTeamRaces）
// は既に削除されている。
//
// months: 開催できる月。名前に季節が入っているレースはその季節にしか開催しない（11月に春季オープンを防ぐ）。
// 未指定は通年OK。location は区間記録の紐付けに使うため、改名しても変更しないこと。
export type RaceTemplate = Omit<Race, 'id' | 'date' | 'results'> & { months?: number[] }

/**
 * 既存レース → 抽選用のテンプレ。
 * ★months を必ず入れること。落とすと「東北桜駅伝が10月」「秋季グランプリが5月」のように
 *   名前の季節と開催月が食い違う（実際にそうなっていた）。元の開催日の月 ±1 を窓にする。
 */
function toTemplate(r: Race): RaceTemplate {
  const m = Number(r.date.slice(5, 7))
  const wrap = (x: number) => ((x - 1 + 12) % 12) + 1
  return {
    name: r.name, location: r.location, type: r.type, conditions: r.conditions, segments: r.segments,
    months: [wrap(m - 2), wrap(m - 1), m, wrap(m + 1), wrap(m + 2)],
  }
}

export const LEAGUE_COURSE_POOL: RaceTemplate[] = [
  // SEASON_2027_RACES の非ファイナル9本（1部専用ではなく全部共通プールに合流）
  ...SEASON_2027_RACES.slice(0, 9).map(toTemplate),

  // 旧 RESERVE_RACE_POOL（改名済み、5区間だった9本は6区間に拡張済み）
  {
    name: '川越春季オープン',          location: '川越',  type: 'league', months: [3, 4, 5],
    conditions: { temperature: 14, weather: 'sunny',  elevation: 30 },
    segments: [
      seg(1, 7.0, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(2, 6.5, 5,   5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(3, 9.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.20, recovery: 0.12, speed: 0.06 }),
      seg(4,11.5, 0,   0, { pacing: 0.38, stamina: 0.28, mental: 0.20, recovery: 0.10, speed: 0.04 }),
      seg(5,13.5, 5,   5, { recovery: 0.36, stamina: 0.28, pacing: 0.22, mental: 0.10, speed: 0.04 }),
      // 6区 6.5km 平坦: 新設アンカー。純粋な速さで締める
      seg(6, 6.5, 0,   0, { speed: 0.60, pacing: 0.20, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      // 7区 8.5km 平坦: 追加区間
      seg(7, 8.5, 0,   0, { speed: 0.52, pacing: 0.26, mental: 0.14, stamina: 0.05, recovery: 0.03 }),
      // 8区 10.0km 緩起伏: 追加区間
      seg(8,10.0, 7,   7, { pacing: 0.36, stamina: 0.30, mental: 0.18, recovery: 0.12, speed: 0.04 }, 'undulating'),
      // 9区 7.0km 平坦: 追加区間。アンカー
      seg(9, 7.0, 0,   0, { speed: 0.58, pacing: 0.20, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'sprinter'),
    ],
  },
  {
    name: '浜松東海駅伝',              location: '浜松',  type: 'league',
    conditions: { temperature: 18, weather: 'cloudy', elevation: 50 },
    segments: [
      seg(1, 6.0, 0,   0, { speed: 0.64, pacing: 0.18, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      seg(2, 8.5, 5,   5, { mental: 0.34, pacing: 0.30, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      seg(3,10.0,20,  18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
      seg(4, 7.5, 0,   0, { speed: 0.60, pacing: 0.20, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(5,12.0, 8,   3, { recovery: 0.34, stamina: 0.32, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      seg(6,14.5, 0,   0, { stamina: 0.40, pacing: 0.26, recovery: 0.20, mental: 0.10, speed: 0.04 }),
      // 7区  8.8km 平坦: 追加区間
      seg(7,  8.8, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }),
      // 8区 10.5km 登り: 追加区間
      seg(8, 10.5, 8,   4, { mountainUp: 0.52, stamina: 0.24, mental: 0.16, pacing: 0.06, speed: 0.02 }, 'mountain_up'),
      // 9区  9.0km 下り: 追加区間
      seg(9,  9.0, 4,   8, { mountainDown: 0.50, speed: 0.24, mental: 0.16, pacing: 0.08, stamina: 0.02 }, 'mountain_down'),
      // 10区  7.2km 平坦: 追加区間
      seg(10,  7.2, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'kick'),
    ],
  },
  {
    name: '水戸交流駅伝',              location: '水戸',  type: 'league',
    conditions: { temperature: 20, weather: 'sunny',  elevation: 40 },
    segments: [
      seg(1, 5.5, 0,   0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      seg(2, 7.0, 5,   5, { pacing: 0.40, speed: 0.28, mental: 0.20, stamina: 0.08, recovery: 0.04 }),
      seg(3, 6.0, 0,   0, { speed: 0.65, pacing: 0.16, mental: 0.10, stamina: 0.06, recovery: 0.03 }),
      seg(4, 9.5, 8,   3, { pacing: 0.38, stamina: 0.24, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5,11.0, 5,   5, { mental: 0.34, pacing: 0.30, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      // 6区 7.0km 平坦: 新設アンカー。速さ勝負で決着
      seg(6, 7.0, 0,   0, { speed: 0.66, pacing: 0.16, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      // 7区 7.5km 平坦: 追加区間。速さで締める
      seg(7, 7.5, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'sprinter'),
    ],
  },
  {
    name: '高松サマー駅伝',            location: '高松',  type: 'league', months: [6, 9],
    conditions: { temperature: 27, weather: 'sunny',  elevation: 60 },
    segments: [
      seg(1, 6.5, 0,   0, { speed: 0.60, pacing: 0.18, mental: 0.14, stamina: 0.05, recovery: 0.03 }),
      seg(2, 9.0,55,   2, { mountainUp: 0.72, stamina: 0.14, mental: 0.08, recovery: 0.04, pacing: 0.02 }),
      seg(3, 8.5, 2,  55, { mountainDown: 0.66, speed: 0.18, mental: 0.09, pacing: 0.04, recovery: 0.03 }),
      seg(4, 7.0, 5,   5, { pacing: 0.40, speed: 0.26, mental: 0.20, stamina: 0.08, recovery: 0.06 }),
      seg(5,12.5, 8,   3, { recovery: 0.38, stamina: 0.28, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      // 6区 10.0km アップダウン: 新設。夏の疲労を回復力で乗り切る仕上げ区間
      seg(6,10.0, 5,   5, { recovery: 0.34, stamina: 0.28, pacing: 0.20, mental: 0.12, speed: 0.06 }),
      // 7区 8.0km 緩起伏: 追加区間。粘りどころ
      seg(7, 8.0, 6,   6, { pacing: 0.38, stamina: 0.30, mental: 0.18, recovery: 0.10, speed: 0.04 }, 'grinder'),
    ],
  },
  {
    name: '盛岡夏季大会',              location: '盛岡',  type: 'league', months: [6, 9],
    conditions: { temperature: 22, weather: 'cloudy', elevation: 70 },
    segments: [
      seg(1, 8.0, 5,   5, { mental: 0.34, pacing: 0.30, speed: 0.18, stamina: 0.12, recovery: 0.06 }),
      seg(2,10.5,20,  18, { mountainUp: 0.28, mountainDown: 0.20, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
      seg(3, 9.0,55,   2, { mountainUp: 0.74, stamina: 0.13, mental: 0.07, recovery: 0.04, pacing: 0.02 }),
      seg(4, 7.5, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(5,13.0, 8,   3, { recovery: 0.36, stamina: 0.30, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      // 6区 11.5km 緩上り: 新設アンカー。長丁場でスタミナと回復力を試す
      seg(6,11.5, 8,   3, { stamina: 0.40, recovery: 0.26, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      // 7区  9.0km 緩起伏: 追加区間
      seg(7,  9.0, 6,   6, { pacing: 0.36, stamina: 0.30, mental: 0.18, recovery: 0.12, speed: 0.04 }, 'undulating'),
      // 8区 12.0km 平坦: 追加区間
      seg(8, 12.0, 0,   0, { pacing: 0.38, stamina: 0.30, mental: 0.20, recovery: 0.08, speed: 0.04 }, 'long'),
      // 9区  7.0km 平坦: 追加区間
      seg(9,  7.0, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'kick'),
    ],
  },
  {
    name: '宇都宮秋季フィナーレ',       location: '宇都宮', type: 'league', months: [9, 10, 11],
    conditions: { temperature: 20, weather: 'sunny',  elevation: 45 },
    segments: [
      seg(1, 7.5, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(2, 8.0, 5,   5, { mental: 0.35, pacing: 0.30, stamina: 0.20, recovery: 0.10, speed: 0.05 }),
      seg(3,11.5,20,  18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
      seg(4, 9.0, 0,   0, { pacing: 0.38, speed: 0.26, mental: 0.20, stamina: 0.10, recovery: 0.06 }),
      seg(5,13.0, 8,   3, { recovery: 0.36, stamina: 0.30, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      seg(6,15.5, 5,   5, { stamina: 0.42, recovery: 0.26, pacing: 0.20, mental: 0.08, speed: 0.04 }),
      // 7区 10.0km 緩起伏: 追加区間
      seg(7, 10.0, 7,   7, { pacing: 0.36, stamina: 0.30, mental: 0.18, recovery: 0.12, speed: 0.04 }, 'undulating'),
      // 8区  8.5km 平坦: 追加区間
      seg(8,  8.5, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }),
      // 9区  6.8km 平坦: 追加区間
      seg(9,  6.8, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'sprinter'),
    ],
  },
  {
    name: '大阪カップ',                location: '大阪',  type: 'league',
    conditions: { temperature: 16, weather: 'cloudy', elevation: 25 },
    segments: [
      seg(1, 5.8, 0,   0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      seg(2, 7.5, 5,   5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(3, 6.5, 0,   0, { speed: 0.66, pacing: 0.16, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      seg(4,10.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5,12.0, 0,   0, { pacing: 0.36, stamina: 0.28, recovery: 0.18, mental: 0.14, speed: 0.04 }),
      // 6区 8.0km 平坦: 新設アンカー。速さで押し切る仕上げ
      seg(6, 8.0, 0,   0, { speed: 0.58, pacing: 0.22, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      // 7区 6.8km 平坦: 追加区間。アンカー前の勝負区
      seg(7, 6.8, 0,   0, { speed: 0.54, pacing: 0.24, mental: 0.14, stamina: 0.05, recovery: 0.03 }, 'kick'),
    ],
  },
  {
    name: '甲府山岳駅伝',              location: '甲府',  type: 'league',
    conditions: { temperature: 15, weather: 'sunny',  elevation: 120 },
    segments: [
      seg(1, 7.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(2, 9.5,55,   2, { mountainUp: 0.73, stamina: 0.14, mental: 0.07, recovery: 0.04, pacing: 0.02 }),
      seg(3, 8.0,20,  18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, pacing: 0.14, recovery: 0.10 }),
      seg(4,10.5, 2,  55, { mountainDown: 0.52, speed: 0.24, pacing: 0.12, mental: 0.08, recovery: 0.04 }),
      seg(5, 7.5, 5,   5, { pacing: 0.40, speed: 0.26, mental: 0.20, stamina: 0.08, recovery: 0.06 }),
      // 6区 9.0km アップダウン: 新設アンカー。山岳の締めくくりに複合力を問う
      seg(6, 9.0,20,  18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
    ],
  },
  {
    name: '熊本交流駅伝',              location: '熊本',  type: 'league',
    conditions: { temperature: 23, weather: 'sunny',  elevation: 55 },
    segments: [
      seg(1, 6.5, 5,   5, { pacing: 0.40, speed: 0.28, mental: 0.18, stamina: 0.09, recovery: 0.05 }),
      seg(2, 9.0, 0,   0, { speed: 0.60, pacing: 0.20, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(3,11.0,20,  18, { mountainUp: 0.24, mountainDown: 0.22, stamina: 0.30, recovery: 0.14, pacing: 0.10 }),
      seg(4, 8.5, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5,10.0, 0,   0, { mental: 0.34, pacing: 0.30, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      // 6区 9.5km アップダウン: 新設アンカー。精神力で最後の起伏を制する
      seg(6, 9.5, 5,   5, { mental: 0.34, pacing: 0.28, stamina: 0.22, recovery: 0.12, speed: 0.04 }),
      // 7区  8.0km 平坦: 追加区間
      seg(7,  8.0, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'sprinter'),
    ],
  },
  {
    name: '静岡中部駅伝',              location: '静岡',  type: 'league',
    conditions: { temperature: 19, weather: 'windy',  elevation: 40 },
    segments: [
      seg(1, 7.5, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(2, 6.0, 5,   5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(3, 8.5, 0,   0, { pacing: 0.38, speed: 0.28, mental: 0.20, stamina: 0.10, recovery: 0.04 }),
      seg(4,11.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(5, 9.5, 5,   5, { mental: 0.36, pacing: 0.28, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      seg(6,13.0, 0,   0, { stamina: 0.40, pacing: 0.26, recovery: 0.20, mental: 0.10, speed: 0.04 }),
      // 7区 9.5km 緩傾斜: 追加区間。起伏をこなす力が要る
      seg(7, 9.5, 8,   8, { pacing: 0.34, stamina: 0.30, mental: 0.20, recovery: 0.12, speed: 0.04 }, 'undulating'),
    ],
  },
  {
    name: '旭川秋冬駅伝',              location: '旭川',  type: 'league', months: [10, 11],
    conditions: { temperature: 10, weather: 'cloudy', elevation: 65 },
    segments: [
      seg(1, 8.0, 8,   3, { pacing: 0.36, stamina: 0.26, mental: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(2,10.5, 5,   5, { mental: 0.36, pacing: 0.28, stamina: 0.22, recovery: 0.10, speed: 0.04 }),
      seg(3, 7.0, 0,   0, { speed: 0.62, pacing: 0.18, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(4,12.5,20,  18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.10 }),
      seg(5, 9.0, 0,   0, { pacing: 0.38, speed: 0.26, mental: 0.20, stamina: 0.10, recovery: 0.06 }),
      // 6区 11.0km 緩上り: 新設アンカー。冷え込みの中でスタミナと回復力を試す
      seg(6,11.0, 8,   3, { stamina: 0.40, recovery: 0.28, pacing: 0.18, mental: 0.10, speed: 0.04 }),
      // 7区 10.0km 平坦: 追加区間
      seg(7, 10.0, 0,   0, { pacing: 0.38, stamina: 0.30, mental: 0.20, recovery: 0.08, speed: 0.04 }, 'long'),
      // 8区  8.0km 緩起伏: 追加区間
      seg(8,  8.0, 6,   6, { pacing: 0.36, stamina: 0.30, mental: 0.18, recovery: 0.12, speed: 0.04 }, 'undulating'),
      // 9区 12.5km 平坦: 追加区間
      seg(9, 12.5, 0,   0, { pacing: 0.38, stamina: 0.30, mental: 0.20, recovery: 0.08, speed: 0.04 }, 'grinder'),
      // 10区  6.8km 平坦: 追加区間
      seg(10,  6.8, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'sprinter'),
    ],
  },
  {
    name: '川崎スプリント駅伝',        location: '川崎',  type: 'league',
    conditions: { temperature: 17, weather: 'sunny',  elevation: 20 },
    segments: [
      seg(1, 5.0, 0,   0, { speed: 0.70, pacing: 0.14, mental: 0.08, stamina: 0.05, recovery: 0.03 }),
      seg(2, 4.5, 0,   0, { speed: 0.74, pacing: 0.12, mental: 0.07, stamina: 0.04, recovery: 0.03 }),
      seg(3, 6.0, 5,   5, { speed: 0.55, pacing: 0.24, mental: 0.14, stamina: 0.04, recovery: 0.03 }),
      seg(4, 5.5, 0,   0, { speed: 0.72, pacing: 0.12, mental: 0.08, stamina: 0.05, recovery: 0.03 }),
      seg(5, 7.0, 0,   0, { speed: 0.65, pacing: 0.16, mental: 0.11, stamina: 0.05, recovery: 0.03 }),
      seg(6, 5.8, 0,   0, { speed: 0.68, pacing: 0.14, mental: 0.10, stamina: 0.05, recovery: 0.03 }),
      // 7区  7.0km 平坦: 追加区間
      seg(7,  7.0, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'sprinter'),
      // 8区  9.5km 緩起伏: 追加区間
      seg(8,  9.5, 5,   5, { pacing: 0.36, stamina: 0.30, mental: 0.18, recovery: 0.12, speed: 0.04 }, 'undulating'),
      // 9区  8.2km 平坦: 追加区間
      seg(9,  8.2, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }),
      // 10区  6.0km 平坦: 追加区間
      seg(10,  6.0, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }, 'kick'),
    ],
  },
  {
    name: '神戸耐久駅伝',              location: '神戸',  type: 'league',
    conditions: { temperature: 21, weather: 'sunny',  elevation: 55 },
    segments: [
      seg(1, 9.0, 5,   5, { mental: 0.34, pacing: 0.28, stamina: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(2,13.5, 8,   3, { recovery: 0.36, stamina: 0.32, pacing: 0.20, mental: 0.08, speed: 0.04 }),
      seg(3,11.0, 0,   0, { pacing: 0.36, stamina: 0.28, mental: 0.20, recovery: 0.12, speed: 0.04 }),
      seg(4,15.0, 5,   5, { stamina: 0.42, recovery: 0.26, pacing: 0.20, mental: 0.08, speed: 0.04 }),
      seg(5,14.5, 8,   3, { stamina: 0.44, recovery: 0.26, pacing: 0.18, mental: 0.08, speed: 0.04 }),
      // 6区 2.0km 平坦: 新設。長い耐久戦の締めに置く短い勝負スプリント
      seg(6, 2.0, 0,   0, { speed: 0.30, pacing: 0.26, mental: 0.18, stamina: 0.16, recovery: 0.10 }),
      // 7区 12.0km 平坦: 追加区間
      seg(7,12.0, 0,   0, { pacing: 0.38, stamina: 0.30, mental: 0.20, recovery: 0.08, speed: 0.04 }, 'long'),
      // 8区 9.0km 緩起伏: 追加区間
      seg(8, 9.0, 6,   6, { pacing: 0.36, stamina: 0.30, mental: 0.18, recovery: 0.12, speed: 0.04 }, 'undulating'),
      // 9区 7.5km 平坦: 追加区間。アンカー
      seg(9, 7.5, 0,   0, { speed: 0.56, pacing: 0.22, mental: 0.13, stamina: 0.06, recovery: 0.03 }),
    ],
  },
]

export const FINAL_COURSES: RaceTemplate[] = [
  // 1部ファイナル: JPELグランドファイナル（SEASON_2027_RACES race-10 をそのまま流用）
  toTemplate(SEASON_2027_RACES[9]),
  {
    // 2部ファイナル: 金沢ファイナル駅伝（新規・25本目。location は他の24本と重複しない）
    name: '金沢ファイナル駅伝', location: '金沢', type: 'league', months: [11, 12],
    conditions: { temperature: 9, weather: 'cloudy', elevation: 20 },
    segments: [
      // 1区 8.5km 平坦: 戦術的な幕開け
      seg(1, 8.5,  0,  0, { pacing: 0.38, speed: 0.28, mental: 0.20, stamina: 0.10, recovery: 0.04 }),
      // 2区 10.5km 起伏: 最初の山岳複合区間
      seg(2, 10.5, 20, 18, { mountainUp: 0.26, mountainDown: 0.22, stamina: 0.28, pacing: 0.14, recovery: 0.10 }),
      // 3区 16.0km 緩上り: 長距離スタミナ区間
      seg(3, 16.0, 8,  3, { stamina: 0.44, recovery: 0.24, pacing: 0.20, mental: 0.08, speed: 0.04 }),
      // 4区 9.5km 緩傾斜: 中盤の精神消耗戦
      seg(4, 9.5,  5,  5, { mental: 0.36, pacing: 0.28, stamina: 0.20, recovery: 0.12, speed: 0.04 }),
      // 5区 12.5km 急登: 技術的登り。スタミナ込みの山岳力
      seg(5, 12.5, 55, 2, { mountainUp: 0.55, stamina: 0.24, pacing: 0.12, mental: 0.06, recovery: 0.03 }),
      // 6区 11.0km 急降: 技術的下り。速さとコントロール
      seg(6, 11.0, 2, 55, { mountainDown: 0.55, speed: 0.22, pacing: 0.12, mental: 0.08, recovery: 0.03 }),
      // 7区 10.0km 緩上り: 回復力で後半を支える
      seg(7, 10.0, 8,  3, { recovery: 0.38, stamina: 0.28, pacing: 0.20, mental: 0.10, speed: 0.04 }),
      // 8区 13.0km 起伏: 疲弊した脚での二度目の山岳戦
      seg(8, 13.0, 20, 18, { mountainUp: 0.28, mountainDown: 0.22, stamina: 0.26, recovery: 0.14, pacing: 0.10 }),
      // 9区 8.0km 平坦: 最終スプリントアンカー
      seg(9, 8.0,  0,  0, { speed: 0.62, pacing: 0.18, mental: 0.14, stamina: 0.04, recovery: 0.02 }),
    ],
  },
  {
    // 3部ファイナル: 房総ファイナル駅伝（旧リザーブファイナルを改名して転用。location・区間は据え置き）
    name: '房総ファイナル駅伝', location: '千葉',  type: 'league', months: [10, 11],
    conditions: { temperature: 18, weather: 'sunny',  elevation: 35 },
    segments: [
      seg(1, 6.0, 5,   5, { pacing: 0.42, speed: 0.28, mental: 0.18, stamina: 0.08, recovery: 0.04 }),
      seg(2, 8.0, 0,   0, { pacing: 0.38, speed: 0.28, mental: 0.20, stamina: 0.10, recovery: 0.04 }),
      seg(3,10.5,12,   8, { mental: 0.32, pacing: 0.30, stamina: 0.22, recovery: 0.12, speed: 0.04 }),
      seg(4, 7.5, 0,   0, { speed: 0.64, pacing: 0.16, mental: 0.12, stamina: 0.05, recovery: 0.03 }),
      seg(5, 9.0,20,  18, { mountainUp: 0.26, mountainDown: 0.24, stamina: 0.28, pacing: 0.12, recovery: 0.10 }),
      seg(6,14.0, 8,   3, { stamina: 0.40, recovery: 0.26, pacing: 0.20, mental: 0.10, speed: 0.04 }),
    ],
  },
]

// ── シーズンの日程を部ごとに抽選する ──────────────────────────
//
// 25本のうちファイナル3本は部ごとに固定。残り22本を3つの部が**取り合う**。
//   1部 プール9 + JPELグランドファイナル = 10戦
//   2部 プール7 + 金沢ファイナル駅伝     =  8戦
//   3部 プール6 + 房総ファイナル駅伝     =  7戦
//   9 + 7 + 6 = 22 でプールをちょうど使い切る（同じコースが2つの部に出ることはない）。
//
// 開催月（RaceTemplate.months）は守る。季節が名前に入っているコースを違う季節に置かない。

/** 各部の開催日。1部は SEASON_2027_RACES と同じ10日。2部・3部はその中から間引く */
// 開催日は固定。**記録会と同じ日にしないこと**（記録会は上の generateIndividualEvents が
// 03-29 / 04-26 / 05-24 / 08-02 / 08-23 / 10-18 / 12-06 の7日で固定）。
// 2部の 05-24・12-06、3部の 03-29・04-26・10-18 が記録会と重なっていて、
// 年間予定表に同じ日が2つ並んでいた。
const DIVISION_RACE_DATES: Record<number, string[]> = {
  1: ['03-15', '04-05', '05-03', '05-31', '06-28', '07-19', '09-13', '10-11', '11-08', '12-27'],
  2: ['03-22', '04-19', '05-10', '06-21', '07-26', '09-27', '10-25', '12-13'],
  3: ['03-08', '04-12', '05-17', '06-14', '09-20', '10-04', '11-29'],
}

/** その月に開催してよいコースか（months 未指定は通年OK） */
function fitsMonth(t: RaceTemplate, month: number): boolean {
  return !t.months || t.months.includes(month)
}

/**
 * 部ごとのシーズン日程を組む。プールは3部で取り合いになり、重複しない。
 * rng を渡せば結果を固定できる（テスト用。通常は Math.random）。
 */
export function drawSeasonSchedules(year: number, rng: () => number = Math.random): Record<number, Race[]> {
  const pool = [...LEAGUE_COURSE_POOL]
  // シャッフル（Fisher-Yates）
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  // ファイナル以外の枠を全部（22個）集めてから、**置けるコースが少ない枠から順に**埋める。
  // 部ごとに順番へ取っていくと、あとの部にその月のコースが残らず月がずれる。
  type Slot = { div: number; index: number; date: string; month: number }
  const slots: Slot[] = []
  for (const div of [1, 2, 3]) {
    const dates = DIVISION_RACE_DATES[div]
    for (let i = 0; i < dates.length - 1; i++) {
      slots.push({ div, index: i, date: dates[i], month: Number(dates[i].slice(0, 2)) })
    }
  }
  // 毎回「置けるコースが一番少ない枠」を選び、そこへ「開催月の窓が一番狭いコース」を入れる。
  // 窓の広いコース（通年OK）は後回しにしないと、季節限定のコースの置き場が先に潰れる。
  const picked: Record<number, Race[]> = { 1: [], 2: [], 3: [] }
  const remaining = [...slots]
  while (remaining.length > 0) {
    let si = 0, best = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const n = pool.filter(t => fitsMonth(t, remaining[i].month)).length
      if (n < best) { best = n; si = i }
    }
    const [slot] = remaining.splice(si, 1)
    const fits = pool.map((t, i) => ({ t, i })).filter(x => fitsMonth(x.t, slot.month))
    const cands = fits.length > 0 ? fits : pool.map((t, i) => ({ t, i }))   // 合うものが無ければ日程を欠かさない方を優先
    const narrow = Math.min(...cands.map(x => x.t.months?.length ?? 99))
    const tight = cands.filter(x => (x.t.months?.length ?? 99) === narrow)
    const chosen = tight[Math.floor(rng() * tight.length)]
    pool.splice(chosen.i, 1)
    picked[slot.div].push({
      ...chosen.t, id: `race-d${slot.div}-${slot.index + 1}`, date: `${year}-${slot.date}`, results: undefined,
    })
  }

  const out: Record<number, Race[]> = {}
  for (const div of [1, 2, 3]) {
    const dates = DIVISION_RACE_DATES[div]
    const races = picked[div].sort((a, b) => a.date.localeCompare(b.date))
    // 最終戦はその部のファイナルで固定
    races.push({
      ...FINAL_COURSES[div - 1],
      id: `race-d${div}-final`, date: `${year}-${dates[dates.length - 1]}`, results: undefined,
    })
    out[div] = races
  }
  return out
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

// 1部にも出る非ファイナル9本（MAIN_RACE_NAMES で既にカバー）を除いた、下部リーグ固有のコース。
// matchCourses.ts（オンライン対戦の「リザーブ」カテゴリ）が引き続きこの名前を参照する
export const RESERVE_RACE_POOL: RaceTemplate[] = [
  ...LEAGUE_COURSE_POOL.slice(9),
  ...FINAL_COURSES.slice(1),
]

/**
 * コースの種別（「山岳」「起伏」「スプリント」「持久」「バランス」）。**判定はここ1本。**
 *
 * 距離で重みを付けた平均の登り・下りで山岳・起伏を見て、そのあと1区間の平均距離で
 * スプリント・持久を分ける。
 *
 * ★以前は dashboard/NextRaceCard と schedule/SchedulePage が同じ式を別々に持っていて、
 *   短いコースの呼び名だけが「スピード」と「スプリント」で食い違っていた。
 *   同じ駅伝がホームでは「スピード」、日程表では「スプリント」と出ていた。
 *   区間の呼び名（utils/terrain の sprint）に合わせて「スプリント」で揃えた。
 */
export function courseTypeOf(segments: readonly { uphillPct: number; downhillPct: number; distanceKm: number }[]): string {
  const { totalDist, avgUp, avgDown } = courseProfile(segments)
  if (totalDist === 0) return 'バランス'
  if (avgUp > 30) return '山岳'
  if (avgUp + avgDown > 25) return '起伏'
  if (totalDist / segments.length < 10) return 'スプリント'
  if (totalDist / segments.length > 14) return '持久'
  return 'バランス'
}

/**
 * コースの起伏の平均（距離で重みを付ける）。**計算はここ1本。**
 * コースの種別（courseTypeOf）も、区間配置の画面に出す「平均登り◯%」もここから引く。
 */
export function courseProfile(segments: readonly { uphillPct: number; downhillPct: number; distanceKm: number }[]): {
  totalDist: number; avgUp: number; avgDown: number
} {
  const totalDist = segments.reduce((s, sg) => s + sg.distanceKm, 0)
  if (totalDist === 0) return { totalDist: 0, avgUp: 0, avgDown: 0 }
  return {
    totalDist,
    avgUp: segments.reduce((s, sg) => s + sg.uphillPct * sg.distanceKm, 0) / totalDist,
    avgDown: segments.reduce((s, sg) => s + sg.downhillPct * sg.distanceKm, 0) / totalDist,
  }
}
