import { writeFileSync } from 'fs'

const SUFFIX = ['AC', 'RC', 'ランナーズ', 'TC', 'クラブ', 'ハリアーズ', 'ストライダーズ', '陸上クラブ', 'ロードRC', 'アスレティック']

// 国 → 都市（クラブ名の元）
const CITY = {
  KOR: ['ソウル','釜山','仁川','大邱','光州','大田','蔚山','水原','全州','済州'],
  CHN: ['北京','上海','広州','成都','武漢','西安','天津','深圳','杭州','瀋陽'],
  TWN: ['台北','高雄','台中','台南','新竹'],
  MGL: ['ウランバートル','エルデネト','ダルハン','チョイバルサン'],
  THA: ['バンコク','チェンマイ','プーケット','コラート'],
  VIE: ['ハノイ','ホーチミン','ダナン','フエ'],
  IND: ['デリー','ムンバイ','バンガロール','コルカタ','チェンナイ'],
  SRI: ['コロンボ','キャンディ','ゴール'],
  NEP: ['カトマンズ','ポカラ','ラリトプル'],
  KAZ: ['アルマトイ','アスタナ','シムケント'],
  BRN: ['マナーマ','リファ','ムハラク'],
  QAT: ['ドーハ','アルワクラ','アルライヤン'],
  KSA: ['リヤド','ジッダ','メッカ','ダンマーム'],
  HKG: ['香港','九龍','新界'],
  SGP: ['シンガポール','ジュロン','タンピネス'],
  MAS: ['クアラルンプール','ジョホール','ペナン'],
  PHI: ['マニラ','セブ','ダバオ'],
  INA: ['ジャカルタ','スラバヤ','バンドン','メダン'],
  KEN: ['ナイロビ','エルドレット','モンバサ','キスム','ナクル'],
  ETH: ['アディスアベバ','ディレダワ','バハルダール'],
  UGA: ['カンパラ','ジンジャ','エンテベ'],
  TAN: ['ダルエスサラーム','アルーシャ','ドドマ'],
  ERI: ['アスマラ','マッサワ','ケレン'],
  RWA: ['キガリ','ブタレ','ギセニ'],
  BDI: ['ブジュンブラ','ギテガ'],
  DJI: ['ジブチ','アリサビエ'],
  SOM: ['モガディシュ','ハルゲイサ'],
  MAR: ['カサブランカ','ラバト','マラケシュ','フェズ'],
  ALG: ['アルジェ','オラン','コンスタンティーヌ'],
  TUN: ['チュニス','スファックス','スース'],
  SDN: ['ハルツーム','オムドゥルマン','ポートスーダン'],
  NGA: ['ラゴス','アブジャ','カノ','イバダン'],
  RSA: ['ヨハネスブルグ','ケープタウン','ダーバン','プレトリア'],
  ZIM: ['ハラレ','ブラワヨ'],
  GBR: ['ロンドン','マンチェスター','バーミンガム','リーズ'],
  FRA: ['パリ','リヨン','マルセイユ'],
  GER: ['ベルリン','ミュンヘン','ハンブルク'],
  ITA: ['ローマ','ミラノ','トリノ'],
  ESP: ['マドリード','バルセロナ','バレンシア'],
  POR: ['リスボン','ポルト'],
  NED: ['アムステルダム','ロッテルダム'],
  BEL: ['ブリュッセル','アントワープ'],
  SWE: ['ストックホルム','ヨーテボリ','マルメ'],
  DEN: ['コペンハーゲン','オーフス'],
  NOR: ['オスロ','ベルゲン','トロンハイム'],
  FIN: ['ヘルシンキ','タンペレ','トゥルク'],
  AUT: ['ウィーン','グラーツ'],
  SUI: ['チューリッヒ','ジュネーブ','バーゼル'],
  POL: ['ワルシャワ','クラクフ','ウッチ'],
  IRL: ['ダブリン','コーク'],
  USA: ['ニューヨーク','ロサンゼルス','ボストン','シカゴ','デンバー','ポートランド','シアトル','アトランタ','ヒューストン','サンフランシスコ'],
  CAN: ['トロント','バンクーバー','モントリオール','カルガリー','オタワ'],
  MEX: ['メキシコシティ','グアダラハラ','モンテレイ','プエブラ','ティフアナ'],
  GUA: ['グアテマラシティ','ケツァルテナンゴ','エスクィントラ','アンティグア','ミクスコ'],
  CRC: ['サンホセ','アラフエラ','カルタゴ','エレディア','リベリア'],
  CUB: ['ハバナ','サンティアゴ','カマグエイ','オルギン','サンタクララ'],
  JAM: ['キングストン','モンテゴベイ','スパニッシュタウン','ポートモア','マンデビル'],
  BRA: ['サンパウロ','リオ','ベロオリゾンテ'],
  COL: ['ボゴタ','メデジン','カリ'],
  ARG: ['ブエノスアイレス','コルドバ','ロサリオ'],
  ECU: ['キト','グアヤキル'],
  PER: ['リマ','アレキパ'],
  CHI: ['サンティアゴ','バルパライソ'],
  URU: ['モンテビデオ','サルト'],
  VEN: ['カラカス','マラカイボ'],
  BOL: ['ラパス','サンタクルス'],
  AUS: ['シドニー','メルボルン','ブリスベン','パース','アデレード','ゴールドコースト','キャンベラ','ニューカッスル','ホバート','ダーウィン'],
  NZL: ['オークランド','ウェリントン','クライストチャーチ','ハミルトン','ダニーデン','タウランガ','ネイピア','ネルソン','ロトルア','インバーカーギル'],
}

// 国 → 色（国旗ベース）
const COL = {
  KOR:['#C8102E','#0047A0'],CHN:['#DE2910','#FFDE00'],TWN:['#000095','#FE0000'],MGL:['#C4272E','#F9CF02'],
  THA:['#2D2A4A','#A51931'],VIE:['#DA251D','#FFFF00'],IND:['#FF9933','#138808'],SRI:['#8D2029','#EB7400'],
  NEP:['#DC143C','#003893'],KAZ:['#00AFCA','#FEC50C'],BRN:['#CE1126','#FFFFFF'],QAT:['#8A1538','#FFFFFF'],
  KSA:['#006C35','#FFFFFF'],HKG:['#DE2910','#FFFFFF'],SGP:['#EF3340','#FFFFFF'],MAS:['#010066','#CC0001'],
  PHI:['#0038A8','#FCD116'],INA:['#CE1126','#FFFFFF'],
  KEN:['#006600','#BB0000'],ETH:['#078930','#FCDD09'],UGA:['#000000','#FCDC04'],TAN:['#1EB53A','#00A3DD'],
  ERI:['#4189DD','#EA0437'],RWA:['#00A1DE','#FAD201'],BDI:['#1EB53A','#CE1126'],DJI:['#6AB2E7','#12AD2B'],
  SOM:['#4189DD','#FFFFFF'],MAR:['#C1272D','#006233'],ALG:['#006233','#D21034'],TUN:['#E70013','#FFFFFF'],
  SDN:['#D21034','#007229'],NGA:['#008751','#FFFFFF'],RSA:['#007A4D','#FFB915'],ZIM:['#006400','#FFD200'],
  GBR:['#C8102E','#012169'],FRA:['#003189','#EF3340'],GER:['#1A1A1A','#DD0000'],ITA:['#008C45','#CD212A'],
  ESP:['#C60B1E','#FFC400'],POR:['#006600','#FF0000'],NED:['#FF6600','#21468B'],BEL:['#1A1A1A','#FDDA24'],
  SWE:['#006AA7','#FECC02'],DEN:['#C60C30','#FFFFFF'],NOR:['#BA0C2F','#00205B'],FIN:['#003580','#FFFFFF'],
  AUT:['#ED2939','#FFFFFF'],SUI:['#D52B1E','#FFFFFF'],POL:['#DC143C','#FFFFFF'],IRL:['#169B62','#FF883E'],
  USA:['#003087','#BF0A30'],CAN:['#D80621','#FFFFFF'],MEX:['#006847','#CE1126'],
  GUA:['#4997D0','#FFFFFF'],CRC:['#002B7F','#CE1126'],CUB:['#002A8F','#CF142B'],JAM:['#009B3A','#FED100'],
  BRA:['#009C3B','#FFDF00'],COL:['#FCD116','#003087'],ARG:['#74ACDF','#FFFFFF'],ECU:['#FFD100','#0033A0'],
  PER:['#D91023','#FFFFFF'],CHI:['#D52B1E','#0033A0'],URU:['#7BAFD4','#FFFFFF'],VEN:['#FCD116','#CF142B'],
  BOL:['#D52B1E','#F9E300'],AUS:['#00843D','#FFCD00'],NZL:['#000000','#C8102E'],
}

// 9海外リーグ（日本=JPELは国内なので含めない）。tier: 'elite'=4大リーグ
// nations: [国コード, クラブ数] で合計20
const LEAGUES = [
  { id:'asia_league', name:'アジア駅伝リーグ', countryName:'アジア', tier:'std',
    nations:[['KOR',2],['CHN',2],['TWN',1],['MGL',1],['THA',1],['VIE',1],['IND',1],['SRI',1],['NEP',1],['KAZ',1],['BRN',1],['QAT',1],['KSA',1],['HKG',1],['SGP',1],['MAS',1],['PHI',1],['INA',1]] },
  { id:'africa_east', name:'東アフリカ駅伝リーグ', countryName:'アフリカ東', tier:'elite',
    nations:[['KEN',4],['ETH',3],['UGA',2],['TAN',2],['ERI',2],['RWA',2],['BDI',2],['DJI',2],['SOM',1]] },
  { id:'africa_ns', name:'アフリカ北・南駅伝リーグ', countryName:'アフリカ北・南', tier:'elite',
    nations:[['MAR',4],['ALG',3],['TUN',3],['SDN',3],['NGA',3],['RSA',3],['ZIM',1]] },
  { id:'europe_ws', name:'ヨーロッパ西・南リーグ', countryName:'ヨーロッパ西・南', tier:'elite',
    nations:[['GBR',3],['FRA',3],['GER',3],['ITA',3],['ESP',3],['POR',2],['NED',2],['BEL',1]] },
  { id:'europe_ne', name:'ヨーロッパ北・東リーグ', countryName:'ヨーロッパ北・東', tier:'std',
    nations:[['SWE',3],['DEN',2],['NOR',3],['FIN',3],['AUT',2],['SUI',3],['POL',2],['IRL',2]] },
  { id:'north_america', name:'北米リーグ', countryName:'北米', tier:'elite',
    nations:[['USA',10],['CAN',5],['MEX',5]] },
  { id:'central_america', name:'中米・カリブリーグ', countryName:'中米・カリブ', tier:'std',
    nations:[['GUA',5],['CRC',5],['CUB',5],['JAM',5]] },
  { id:'south_america', name:'南米駅伝リーグ', countryName:'南米', tier:'std',
    nations:[['BRA',3],['COL',3],['ARG',3],['ECU',2],['PER',2],['CHI',2],['URU',2],['VEN',2],['BOL',1]] },
  { id:'oceania', name:'オセアニア駅伝リーグ', countryName:'オセアニア', tier:'std',
    nations:[['AUS',10],['NZL',10]] },
]

const leagueCountry = { asia_league:'KOR', africa_east:'KEN', africa_ns:'MAR', europe_ws:'GBR', europe_ne:'SWE', north_america:'USA', central_america:'CUB', south_america:'BRA', oceania:'AUS' }

let out = `import type { ForeignLeague } from '../types'\n\n// ⚠ このファイルは scripts の生成物。9海外リーグ×20クラブ。tier(4大リーグ=elite)は playerGenerator の強さ設定で参照。\nexport const FOREIGN_LEAGUES: ForeignLeague[] = [\n`
for (const lg of LEAGUES) {
  let total = lg.nations.reduce((s,[,n])=>s+n,0)
  if (total !== 20) throw new Error(`${lg.id} has ${total} clubs`)
  out += `  {\n    id: '${lg.id}',\n    name: '${lg.name}',\n    country: '${leagueCountry[lg.id]}',\n    countryName: '${lg.countryName}',\n    clubs: [\n`
  for (const [code, cnt] of lg.nations) {
    const cities = CITY[code]
    const [p, s] = COL[code]
    for (let i = 0; i < cnt; i++) {
      const city = cities[i % cities.length]
      const suf = SUFFIX[i % SUFFIX.length]
      const id = `${code.toLowerCase()}_${i+1}`
      const name = `${city}${suf}`
      const short = city.length > 5 ? city.slice(0,5) : city
      out += `      { id: '${id}', name: '${name}', shortName: '${short}', leagueId: '${lg.id}', country: '${code}', colors: { primary: '${p}', secondary: '${s}' }, playerIds: [] },\n`
    }
  }
  out += `    ],\n  },\n`
}
out += `]\n`
writeFileSync('/tmp/JJJJ/src/data/foreignLeagues.ts', out)
console.log('written. leagues:', LEAGUES.length, 'clubs:', LEAGUES.reduce((s,l)=>s+l.nations.reduce((a,[,n])=>a+n,0),0))
