// 国籍のメタ情報を集約する唯一の情報源。
// 表示ラベル・アジア判定・生成時の地域別強さ・顔（髪色）用の地域を、ここから全部引く。
// 新しい国籍を足すときは types の Nationality union とこのファイルだけ更新すればよい。

import type { Nationality, ForeignCategory } from '../types'

// 強さ地域（playerGenerator の REGION キーに対応）
export type StrengthRegion = 'AFRICA' | 'EUR_USA' | 'OTHER' | 'ASIA'
// 顔（髪色）用の大まかな地域
export type FaceRegion = 'east_asia' | 'south_asia' | 'africa' | 'europe' | 'oceania' | 'americas' | 'other'
// 代表タブの地域グルーピング（表示用の大陸）
export type GeoRegion = 'アジア' | 'オセアニア' | 'アフリカ' | 'ヨーロッパ' | 'アメリカ大陸' | 'その他'

// 代表タブでの地域の表示順
export const GEO_REGION_ORDER: GeoRegion[] = ['アジア', 'オセアニア', 'アフリカ', 'ヨーロッパ', 'アメリカ大陸', 'その他']

type NatMeta = { label: string; category: ForeignCategory; strength: StrengthRegion; face: FaceRegion; geo: GeoRegion; flag: string }

// domestic=日本 / asian=アジア（東・東南・南・中央・西アジア）/ foreign=それ以外
export const NATIONALITY_META: Record<Nationality, NatMeta> = {
  JPN: { label: '日本',         category: 'domestic', strength: 'ASIA',    face: 'east_asia',  geo: 'アジア',       flag: '🇯🇵' },
  KOR: { label: '韓国',         category: 'asian',    strength: 'ASIA',    face: 'east_asia',  geo: 'アジア',       flag: '🇰🇷' },
  CHN: { label: '中国',         category: 'asian',    strength: 'ASIA',    face: 'east_asia',  geo: 'アジア',       flag: '🇨🇳' },
  TWN: { label: '台湾',         category: 'asian',    strength: 'ASIA',    face: 'east_asia',  geo: 'アジア',       flag: '🇹🇼' },
  HKG: { label: '香港',         category: 'asian',    strength: 'ASIA',    face: 'east_asia',  geo: 'アジア',       flag: '🇭🇰' },
  MGL: { label: 'モンゴル',     category: 'asian',    strength: 'ASIA',    face: 'east_asia',  geo: 'アジア',       flag: '🇲🇳' },
  THA: { label: 'タイ',         category: 'asian',    strength: 'ASIA',    face: 'south_asia', geo: 'アジア',       flag: '🇹🇭' },
  VIE: { label: 'ベトナム',     category: 'asian',    strength: 'ASIA',    face: 'south_asia', geo: 'アジア',       flag: '🇻🇳' },
  INA: { label: 'インドネシア', category: 'asian',    strength: 'ASIA',    face: 'south_asia', geo: 'アジア',       flag: '🇮🇩' },
  MAS: { label: 'マレーシア',   category: 'asian',    strength: 'ASIA',    face: 'south_asia', geo: 'アジア',       flag: '🇲🇾' },
  PHI: { label: 'フィリピン',   category: 'asian',    strength: 'ASIA',    face: 'south_asia', geo: 'アジア',       flag: '🇵🇭' },
  SGP: { label: 'シンガポール', category: 'asian',    strength: 'ASIA',    face: 'south_asia', geo: 'アジア',       flag: '🇸🇬' },
  IND: { label: 'インド',       category: 'asian',    strength: 'OTHER',   face: 'south_asia', geo: 'アジア',       flag: '🇮🇳' },
  SRI: { label: 'スリランカ',   category: 'asian',    strength: 'OTHER',   face: 'south_asia', geo: 'アジア',       flag: '🇱🇰' },
  NEP: { label: 'ネパール',     category: 'asian',    strength: 'OTHER',   face: 'south_asia', geo: 'アジア',       flag: '🇳🇵' },
  KAZ: { label: 'カザフスタン', category: 'asian',    strength: 'OTHER',   face: 'other',      geo: 'アジア',       flag: '🇰🇿' },
  // 西アジア（バーレーン・カタールはアフリカ出身帰化ランナーが多く距離が激強）
  BRN: { label: 'バーレーン',   category: 'asian',    strength: 'AFRICA',  face: 'africa',     geo: 'アジア',       flag: '🇧🇭' },
  QAT: { label: 'カタール',     category: 'asian',    strength: 'AFRICA',  face: 'africa',     geo: 'アジア',       flag: '🇶🇦' },
  KSA: { label: 'サウジアラビア', category: 'asian',  strength: 'OTHER',   face: 'other',      geo: 'アジア',       flag: '🇸🇦' },
  // オセアニア
  AUS: { label: 'オーストラリア', category: 'foreign', strength: 'EUR_USA', face: 'oceania',   geo: 'オセアニア',   flag: '🇦🇺' },
  NZL: { label: 'ニュージーランド', category: 'foreign', strength: 'EUR_USA', face: 'oceania', geo: 'オセアニア',   flag: '🇳🇿' },
  // アフリカ
  ETH: { label: 'エチオピア',   category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇪🇹' },
  KEN: { label: 'ケニア',       category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇰🇪' },
  UGA: { label: 'ウガンダ',     category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇺🇬' },
  TAN: { label: 'タンザニア',   category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇹🇿' },
  MAR: { label: 'モロッコ',     category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇲🇦' },
  ERI: { label: 'エリトリア',   category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇪🇷' },
  RSA: { label: '南アフリカ',   category: 'foreign',  strength: 'OTHER',   face: 'africa',     geo: 'アフリカ',     flag: '🇿🇦' },
  RWA: { label: 'ルワンダ',     category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇷🇼' },
  BDI: { label: 'ブルンジ',     category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇧🇮' },
  ALG: { label: 'アルジェリア', category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇩🇿' },
  DJI: { label: 'ジブチ',       category: 'foreign',  strength: 'AFRICA',  face: 'africa',     geo: 'アフリカ',     flag: '🇩🇯' },
  SOM: { label: 'ソマリア',     category: 'foreign',  strength: 'OTHER',   face: 'africa',     geo: 'アフリカ',     flag: '🇸🇴' },
  SDN: { label: 'スーダン',     category: 'foreign',  strength: 'OTHER',   face: 'africa',     geo: 'アフリカ',     flag: '🇸🇩' },
  TUN: { label: 'チュニジア',   category: 'foreign',  strength: 'OTHER',   face: 'africa',     geo: 'アフリカ',     flag: '🇹🇳' },
  ZIM: { label: 'ジンバブエ',   category: 'foreign',  strength: 'OTHER',   face: 'africa',     geo: 'アフリカ',     flag: '🇿🇼' },
  NGA: { label: 'ナイジェリア', category: 'foreign',  strength: 'OTHER',   face: 'africa',     geo: 'アフリカ',     flag: '🇳🇬' },
  // ヨーロッパ
  GBR: { label: 'イギリス',     category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇬🇧' },
  GER: { label: 'ドイツ',       category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇩🇪' },
  FRA: { label: 'フランス',     category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇫🇷' },
  ITA: { label: 'イタリア',     category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇮🇹' },
  ESP: { label: 'スペイン',     category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇪🇸' },
  NED: { label: 'オランダ',     category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇳🇱' },
  SWE: { label: 'スウェーデン', category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇸🇪' },
  DEN: { label: 'デンマーク',   category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇩🇰' },
  AUT: { label: 'オーストリア', category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇦🇹' },
  POR: { label: 'ポルトガル',   category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇵🇹' },
  NOR: { label: 'ノルウェー',   category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇳🇴' },
  BEL: { label: 'ベルギー',     category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇧🇪' },
  SUI: { label: 'スイス',       category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇨🇭' },
  POL: { label: 'ポーランド',   category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇵🇱' },
  IRL: { label: 'アイルランド', category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇮🇪' },
  FIN: { label: 'フィンランド', category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇫🇮' },
  // アメリカ大陸
  USA: { label: 'アメリカ',     category: 'foreign',  strength: 'EUR_USA', face: 'americas',   geo: 'アメリカ大陸', flag: '🇺🇸' },
  CAN: { label: 'カナダ',       category: 'foreign',  strength: 'EUR_USA', face: 'americas',   geo: 'アメリカ大陸', flag: '🇨🇦' },
  MEX: { label: 'メキシコ',     category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇲🇽' },
  BRA: { label: 'ブラジル',     category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇧🇷' },
  COL: { label: 'コロンビア',   category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇨🇴' },
  ARG: { label: 'アルゼンチン', category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇦🇷' },
  ECU: { label: 'エクアドル',   category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇪🇨' },
  PER: { label: 'ペルー',       category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇵🇪' },
  CHI: { label: 'チリ',         category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇨🇱' },
  URU: { label: 'ウルグアイ',   category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇺🇾' },
  VEN: { label: 'ベネズエラ',   category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇻🇪' },
  GUA: { label: 'グアテマラ',   category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇬🇹' },
  BOL: { label: 'ボリビア',     category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇧🇴' },
  CRC: { label: 'コスタリカ',   category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇨🇷' },
  CUB: { label: 'キューバ',     category: 'foreign',  strength: 'OTHER',   face: 'americas',   geo: 'アメリカ大陸', flag: '🇨🇺' },
  JAM: { label: 'ジャマイカ',   category: 'foreign',  strength: 'OTHER',   face: 'africa',     geo: 'アメリカ大陸', flag: '🇯🇲' },  // アフロカリブ系（金髪白人が生成されないようafricaプール）
  // バケツ（後方互換）
  EUR: { label: 'ヨーロッパ',   category: 'foreign',  strength: 'EUR_USA', face: 'europe',     geo: 'ヨーロッパ',   flag: '🇪🇺' },
  FOREIGN: { label: 'その他外国', category: 'foreign', strength: 'OTHER',  face: 'other',      geo: 'その他',       flag: '🏳' },
}

export const NAT_LABEL: Record<Nationality, string> =
  Object.fromEntries(Object.entries(NATIONALITY_META).map(([k, v]) => [k, v.label])) as Record<Nationality, string>

export function natLabel(nat: Nationality): string {
  return NATIONALITY_META[nat]?.label ?? String(nat)
}
export function natCategory(nat: Nationality): ForeignCategory {
  return NATIONALITY_META[nat]?.category ?? 'foreign'
}
export function natStrengthRegion(nat: Nationality): StrengthRegion {
  return NATIONALITY_META[nat]?.strength ?? 'OTHER'
}
export function natFaceRegion(nat: Nationality): FaceRegion {
  return NATIONALITY_META[nat]?.face ?? 'other'
}
export function natGeoRegion(nat: Nationality): GeoRegion {
  return NATIONALITY_META[nat]?.geo ?? 'その他'
}
export function natFlag(nat: Nationality): string {
  return NATIONALITY_META[nat]?.flag ?? '🏳'
}
