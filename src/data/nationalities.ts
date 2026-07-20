// 国籍のメタ情報を集約する唯一の情報源。
// 表示ラベル・アジア判定・生成時の地域別強さ・顔（髪色）用の地域を、ここから全部引く。
// 新しい国籍を足すときは types の Nationality union とこのファイルだけ更新すればよい。

import type { Nationality, ForeignCategory } from '../types'

// 強さ地域（playerGenerator の REGION キーに対応）
export type StrengthRegion = 'AFRICA' | 'EUR_USA' | 'OTHER' | 'ASIA'
// 顔（髪色）用の大まかな地域
export type FaceRegion = 'east_asia' | 'south_asia' | 'africa' | 'europe' | 'oceania' | 'americas' | 'other'

type NatMeta = { label: string; category: ForeignCategory; strength: StrengthRegion; face: FaceRegion }

// domestic=日本 / asian=アジア（東・東南・南・中央・西アジア）/ foreign=それ以外
export const NATIONALITY_META: Record<Nationality, NatMeta> = {
  JPN: { label: '日本',         category: 'domestic', strength: 'ASIA',    face: 'east_asia' },
  KOR: { label: '韓国',         category: 'asian',    strength: 'ASIA',    face: 'east_asia' },
  CHN: { label: '中国',         category: 'asian',    strength: 'ASIA',    face: 'east_asia' },
  TWN: { label: '台湾',         category: 'asian',    strength: 'ASIA',    face: 'east_asia' },
  HKG: { label: '香港',         category: 'asian',    strength: 'ASIA',    face: 'east_asia' },
  MGL: { label: 'モンゴル',     category: 'asian',    strength: 'ASIA',    face: 'east_asia' },
  THA: { label: 'タイ',         category: 'asian',    strength: 'ASIA',    face: 'south_asia' },
  VIE: { label: 'ベトナム',     category: 'asian',    strength: 'ASIA',    face: 'south_asia' },
  INA: { label: 'インドネシア', category: 'asian',    strength: 'ASIA',    face: 'south_asia' },
  MAS: { label: 'マレーシア',   category: 'asian',    strength: 'ASIA',    face: 'south_asia' },
  PHI: { label: 'フィリピン',   category: 'asian',    strength: 'ASIA',    face: 'south_asia' },
  SGP: { label: 'シンガポール', category: 'asian',    strength: 'ASIA',    face: 'south_asia' },
  IND: { label: 'インド',       category: 'asian',    strength: 'OTHER',   face: 'south_asia' },
  SRI: { label: 'スリランカ',   category: 'asian',    strength: 'OTHER',   face: 'south_asia' },
  NEP: { label: 'ネパール',     category: 'asian',    strength: 'OTHER',   face: 'south_asia' },
  KAZ: { label: 'カザフスタン', category: 'asian',    strength: 'OTHER',   face: 'other' },
  // 西アジア（バーレーン・カタールはアフリカ出身帰化ランナーが多く距離が激強）
  BRN: { label: 'バーレーン',   category: 'asian',    strength: 'AFRICA',  face: 'africa' },
  QAT: { label: 'カタール',     category: 'asian',    strength: 'AFRICA',  face: 'africa' },
  KSA: { label: 'サウジアラビア', category: 'asian',  strength: 'OTHER',   face: 'other' },
  // オセアニア
  AUS: { label: 'オーストラリア', category: 'foreign', strength: 'EUR_USA', face: 'oceania' },
  NZL: { label: 'ニュージーランド', category: 'foreign', strength: 'EUR_USA', face: 'oceania' },
  // アフリカ
  ETH: { label: 'エチオピア',   category: 'foreign',  strength: 'AFRICA',  face: 'africa' },
  KEN: { label: 'ケニア',       category: 'foreign',  strength: 'AFRICA',  face: 'africa' },
  UGA: { label: 'ウガンダ',     category: 'foreign',  strength: 'AFRICA',  face: 'africa' },
  TAN: { label: 'タンザニア',   category: 'foreign',  strength: 'AFRICA',  face: 'africa' },
  MAR: { label: 'モロッコ',     category: 'foreign',  strength: 'AFRICA',  face: 'africa' },
  ERI: { label: 'エリトリア',   category: 'foreign',  strength: 'AFRICA',  face: 'africa' },
  RSA: { label: '南アフリカ',   category: 'foreign',  strength: 'OTHER',   face: 'africa' },
  // ヨーロッパ
  GBR: { label: 'イギリス',     category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  GER: { label: 'ドイツ',       category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  FRA: { label: 'フランス',     category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  ITA: { label: 'イタリア',     category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  ESP: { label: 'スペイン',     category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  NED: { label: 'オランダ',     category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  SWE: { label: 'スウェーデン', category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  DEN: { label: 'デンマーク',   category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  AUT: { label: 'オーストリア', category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  POR: { label: 'ポルトガル',   category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  // アメリカ大陸
  USA: { label: 'アメリカ',     category: 'foreign',  strength: 'EUR_USA', face: 'americas' },
  CAN: { label: 'カナダ',       category: 'foreign',  strength: 'EUR_USA', face: 'americas' },
  MEX: { label: 'メキシコ',     category: 'foreign',  strength: 'OTHER',   face: 'americas' },
  BRA: { label: 'ブラジル',     category: 'foreign',  strength: 'OTHER',   face: 'americas' },
  COL: { label: 'コロンビア',   category: 'foreign',  strength: 'OTHER',   face: 'americas' },
  ARG: { label: 'アルゼンチン', category: 'foreign',  strength: 'OTHER',   face: 'americas' },
  ECU: { label: 'エクアドル',   category: 'foreign',  strength: 'OTHER',   face: 'americas' },
  PER: { label: 'ペルー',       category: 'foreign',  strength: 'OTHER',   face: 'americas' },
  CHI: { label: 'チリ',         category: 'foreign',  strength: 'OTHER',   face: 'americas' },
  URU: { label: 'ウルグアイ',   category: 'foreign',  strength: 'OTHER',   face: 'americas' },
  VEN: { label: 'ベネズエラ',   category: 'foreign',  strength: 'OTHER',   face: 'americas' },
  // バケツ（後方互換）
  EUR: { label: 'ヨーロッパ',   category: 'foreign',  strength: 'EUR_USA', face: 'europe' },
  FOREIGN: { label: 'その他外国', category: 'foreign', strength: 'OTHER',  face: 'other' },
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
