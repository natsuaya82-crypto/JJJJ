import type { Player, Specialty, GrowthCurve, Nationality, ForeignCategory, ForeignLeague } from '../types'
import type { TraitId } from '../utils/traitUtils'

const FAMILY_NAMES = [
  '田中','鈴木','佐藤','高橋','伊藤','渡辺','山本','中村','小林','加藤',
  '吉田','山田','佐々木','山口','松本','井上','木村','林','斎藤','清水',
  '山崎','森','阿部','池田','橋本','石川','前田','藤田','後藤','岡田',
  '長谷川','村上','近藤','石井','坂本','遠藤','青木','藤井','西村','福田',
  '太田','三浦','岡本','松田','中島','中野','原田','小野','竹内','金子',
  '浜田','飯田','宮本','津田','野口','熊谷','新井','菊池','小川','今井',
  '大野','松井','島田','高田','工藤','丸山','上野','永田','川口','市川',
]

const GIVEN_NAMES_MALE = [
  '大輝','颯','蒼','陸','拓海','悠','翔','健太','大地','涼',
  '剛','純','慶','亮','隼人','航','正','蓮','大悟','颯太',
  '雄大','俊','拓哉','直樹','勇気','竜也','裕也','侑哉','快','朔太郎',
  '康平','和也','健司','大輔','将','誠','浩','剛志','誠一','太郎',
  '一郎','次郎','三郎','孝一','孝二','博','猛','勝','浩二','浩一',
]

const FOREIGN_NAMES: { name: string; origin: string }[] = [
  // Kenya
  { name: 'キプタニ', origin: 'ケニア' },
  { name: 'チェランガット', origin: 'ケニア' },
  { name: 'ロサモ', origin: 'ケニア' },
  { name: 'ムウァンギ', origin: 'ケニア' },
  { name: 'チェベット', origin: 'ケニア' },
  { name: 'キムタイ', origin: 'ケニア' },
  { name: 'キプコスゲイ', origin: 'ケニア' },
  { name: 'カモウ', origin: 'ケニア' },
  { name: 'ロノ', origin: 'ケニア' },
  { name: 'チェサレク', origin: 'ケニア' },
  { name: 'キボウエ', origin: 'ケニア' },
  { name: 'ムウォレ', origin: 'ケニア' },
  { name: 'コルウェイ', origin: 'ケニア' },
  { name: 'キプランガット', origin: 'ケニア' },
  { name: 'ロティッチ', origin: 'ケニア' },
  { name: 'キルイ', origin: 'ケニア' },
  { name: 'マテス', origin: 'ケニア' },
  { name: 'キプサング', origin: 'ケニア' },
  { name: 'サイモン・ムタイ', origin: 'ケニア' },
  { name: 'ジョシア・キプランガット', origin: 'ケニア' },
  { name: 'エベネザー・ロサモ', origin: 'ケニア' },
  // Ethiopia
  { name: 'ハイレ', origin: 'エチオピア' },
  { name: 'ベケレ', origin: 'エチオピア' },
  { name: 'バレガ', origin: 'エチオピア' },
  { name: 'キンデ', origin: 'エチオピア' },
  { name: 'ゲブレハン', origin: 'エチオピア' },
  { name: 'テスファイェ', origin: 'エチオピア' },
  { name: 'ワルク', origin: 'エチオピア' },
  { name: 'アラヌ', origin: 'エチオピア' },
  { name: 'ゲブレメディン', origin: 'エチオピア' },
  { name: 'ティルネ', origin: 'エチオピア' },
  { name: 'メルガ', origin: 'エチオピア' },
  { name: 'デゲファ', origin: 'エチオピア' },
  { name: 'ビルハネ', origin: 'エチオピア' },
  { name: 'ゲラナ・バレガ', origin: 'エチオピア' },
  { name: 'タデッセ・ハイレ', origin: 'エチオピア' },
  { name: 'ヨンナス・テスファイェ', origin: 'エチオピア' },
  // Uganda
  { name: 'チェプテゲイ', origin: 'ウガンダ' },
  { name: 'クィルタ', origin: 'ウガンダ' },
  { name: 'キサザ', origin: 'ウガンダ' },
  { name: 'チェプロタ', origin: 'ウガンダ' },
  { name: 'ナムバレ', origin: 'ウガンダ' },
  // Tanzania
  { name: 'ムリンガ', origin: 'タンザニア' },
  { name: 'チャンバ', origin: 'タンザニア' },
  { name: 'マウヨ', origin: 'タンザニア' },
  { name: 'キラバ', origin: 'タンザニア' },
  // Morocco
  { name: 'アムラン', origin: 'モロッコ' },
  { name: 'ブフェン', origin: 'モロッコ' },
  { name: 'エルバクリ', origin: 'モロッコ' },
  { name: 'アイタラヒム', origin: 'モロッコ' },
  { name: 'オウルド', origin: 'モロッコ' },
  // Eritrea
  { name: 'テスファマリアム', origin: 'エリトリア' },
  { name: 'ビンヤム', origin: 'エリトリア' },
  { name: 'フィリモン', origin: 'エリトリア' },
  // Senegal
  { name: 'ディアロ', origin: 'セネガル' },
  { name: 'ンジャイ', origin: 'セネガル' },
  { name: 'シセ', origin: 'セネガル' },
  // Somalia
  { name: 'ワルサメ', origin: 'ソマリア' },
  { name: 'ファレ', origin: 'ソマリア' },
  // Korea
  { name: 'イ・ジョンミン', origin: '韓国' },
  { name: 'キム・サンウ', origin: '韓国' },
  { name: 'パク・ジュンヒョク', origin: '韓国' },
  { name: 'チェ・スンジェ', origin: '韓国' },
  { name: 'ハン・ドンフン', origin: '韓国' },
  { name: 'ユン・ソクヒョン', origin: '韓国' },
  { name: 'リュ・テウォン', origin: '韓国' },
  { name: 'オ・ジェヒョン', origin: '韓国' },
  { name: 'ソン・ミンジュン', origin: '韓国' },
  { name: 'クォン・ヒョンソク', origin: '韓国' },
  // France
  { name: 'ラポール', origin: 'フランス' },
  { name: 'テュルネル', origin: 'フランス' },
  { name: 'コワル', origin: 'フランス' },
  { name: 'デュボワ', origin: 'フランス' },
  { name: 'ルノワール', origin: 'フランス' },
  // Germany
  { name: 'フィッシャー', origin: 'ドイツ' },
  { name: 'クラウゼ', origin: 'ドイツ' },
  { name: 'ホフマン', origin: 'ドイツ' },
  { name: 'ベッカー', origin: 'ドイツ' },
  // Italy
  { name: 'デ・ルカ', origin: 'イタリア' },
  { name: 'カントーニ', origin: 'イタリア' },
  { name: 'フェラーリ', origin: 'イタリア' },
  { name: 'コッポラ', origin: 'イタリア' },
  // Spain
  { name: 'モリーナ', origin: 'スペイン' },
  { name: 'バエナ', origin: 'スペイン' },
  { name: 'サラテ', origin: 'スペイン' },
  { name: 'イバラ', origin: 'スペイン' },
  // UK
  { name: 'ウォード', origin: 'イギリス' },
  { name: 'マクニール', origin: 'イギリス' },
  { name: 'ハロウェイ', origin: 'イギリス' },
  { name: 'クロウ', origin: 'イギリス' },
  // Netherlands / Belgium
  { name: 'ファンデルメール', origin: 'オランダ' },
  { name: 'デヨング', origin: 'オランダ' },
  { name: 'ヴァンダンム', origin: 'ベルギー' },
  // Brazil
  { name: 'ドナト', origin: 'ブラジル' },
  { name: 'アルヴェス', origin: 'ブラジル' },
  { name: 'カルドーゾ', origin: 'ブラジル' },
  { name: 'リマ', origin: 'ブラジル' },
  // USA
  { name: 'ノックス', origin: 'アメリカ' },
  { name: 'ドーソン', origin: 'アメリカ' },
  { name: 'ローレンス', origin: 'アメリカ' },
  { name: 'ホルト', origin: 'アメリカ' },
  // China
  { name: 'ワン・レイ', origin: '中国' },
  { name: 'リウ・ヤン', origin: '中国' },
  { name: 'チェン・ウェイ', origin: '中国' },
  { name: 'ジャン・ミン', origin: '中国' },
  { name: 'リー・ジアン', origin: '中国' },
  { name: 'ジャオ・チン', origin: '中国' },
  { name: 'スン・ハオ', origin: '中国' },
  { name: 'マ・ロン', origin: '中国' },
  { name: 'ウー・チン', origin: '中国' },
  { name: 'チャン・ジュン', origin: '中国' },
]

const FOREIGN_NAMES_BY_NATIONALITY: Record<string, { name: string; origin: string }[]> = {
  KOR: [
    { name: 'イ・ジョンミン', origin: '韓国' }, { name: 'キム・サンウ', origin: '韓国' },
    { name: 'パク・ジュンヒョク', origin: '韓国' }, { name: 'チェ・スンジェ', origin: '韓国' },
    { name: 'ハン・ドンフン', origin: '韓国' }, { name: 'ユン・ソクヒョン', origin: '韓国' },
    { name: 'リュ・テウォン', origin: '韓国' }, { name: 'オ・ジェヒョン', origin: '韓国' },
    { name: 'ソン・ミンジュン', origin: '韓国' }, { name: 'クォン・ヒョンソク', origin: '韓国' },
    { name: 'カン・ジュンソ', origin: '韓国' }, { name: 'シン・ドンヒョン', origin: '韓国' },
    { name: 'チョン・ドユン', origin: '韓国' }, { name: 'イム・テヤン', origin: '韓国' },
    { name: 'ソ・ジェウォン', origin: '韓国' }, { name: 'ノ・ジュンヨン', origin: '韓国' },
    { name: 'ムン・ソンミン', origin: '韓国' }, { name: 'ペ・ドンジュン', origin: '韓国' },
    { name: 'ホ・ミンジュン', origin: '韓国' }, { name: 'チョ・ヒョンソク', origin: '韓国' },
    { name: 'キム・テヒョン', origin: '韓国' }, { name: 'パク・セジュン', origin: '韓国' },
    { name: 'イ・ウソン', origin: '韓国' }, { name: 'チェ・ジュンホ', origin: '韓国' },
    { name: 'アン・ジェヒョク', origin: '韓国' }, { name: 'ユ・ジュンソク', origin: '韓国' },
  ],
  CHN: [
    { name: 'ワン・ハオラン', origin: '中国' }, { name: 'リウ・ユーフェイ', origin: '中国' },
    { name: 'チェン・ミンジー', origin: '中国' }, { name: 'ジャン・ジェングオ', origin: '中国' },
    { name: 'リー・ウェンフォン', origin: '中国' }, { name: 'ジャオ・ジーチャン', origin: '中国' },
    { name: 'スン・ボーウェン', origin: '中国' }, { name: 'マー・チャオ', origin: '中国' },
    { name: 'ウー・チェンヤン', origin: '中国' }, { name: 'ジュ・ジュンジエ', origin: '中国' },
    { name: 'ジョウ・ジーユエン', origin: '中国' }, { name: 'シュー・ミンフイ', origin: '中国' },
    { name: 'リン・ジーチャン', origin: '中国' }, { name: 'タン・ジュンウェイ', origin: '中国' },
    { name: 'グオ・ペンフェイ', origin: '中国' }, { name: 'ホウ・ユーチャン', origin: '中国' },
    { name: 'ファン・ハオ', origin: '中国' }, { name: 'チェン・ジアン', origin: '中国' },
    { name: 'ワン・ジアミン', origin: '中国' }, { name: 'リウ・チャオ', origin: '中国' },
    { name: 'スー・レイ', origin: '中国' }, { name: 'ジャン・ペン', origin: '中国' },
    { name: 'ウー・シャオロン', origin: '中国' }, { name: 'ダイ・ユーチン', origin: '中国' },
    { name: 'リー・ジュンホン', origin: '中国' }, { name: 'チャン・ウェンボ', origin: '中国' },
  ],
  ETH: [
    { name: 'ゲブレメスケル・テスファイェ', origin: 'エチオピア' },
    { name: 'アブラハム・キンデ', origin: 'エチオピア' },
    { name: 'イェゲネフ・バレガ', origin: 'エチオピア' },
    { name: 'タデッセ・ワルク', origin: 'エチオピア' },
    { name: 'ゲルマン・ハイレ', origin: 'エチオピア' },
    { name: 'キンデ・ゲブレハン', origin: 'エチオピア' },
    { name: 'アラムニュ・ジェベサ', origin: 'エチオピア' },
    { name: 'ワセン・ムクタル', origin: 'エチオピア' },
    { name: 'ゲブル・テクレ', origin: 'エチオピア' },
    { name: 'タリク・アメーデ', origin: 'エチオピア' },
    { name: 'ムラドレイ・テスファ', origin: 'エチオピア' },
    { name: 'ハイレ・ゲブレシラシエ', origin: 'エチオピア' },
    { name: 'ベケレ・アルガウ', origin: 'エチオピア' },
    { name: 'ファジャル・ライラ', origin: 'エチオピア' },
    { name: 'ダリ・ベケレ', origin: 'エチオピア' },
    { name: 'ゲラ・テスファウ', origin: 'エチオピア' },
    { name: 'アスタル・グルム', origin: 'エチオピア' },
    { name: 'バーハン・ゲブレ', origin: 'エチオピア' },
    { name: 'ティルフネ・レガセ', origin: 'エチオピア' },
    { name: 'アジメラ・ファンタ', origin: 'エチオピア' },
    { name: 'ヨナス・キエドル', origin: 'エリトリア' },
    { name: 'アブラハム・アレガウィ', origin: 'エリトリア' },
    { name: 'テスファイ・ゴイトム', origin: 'エリトリア' },
    { name: 'フィトサム・ベルハン', origin: 'エリトリア' },
    { name: 'ミルツ・ゼムイ', origin: 'エリトリア' },
  ],
  KEN: [
    { name: 'エリウド・キプコルイ', origin: 'ケニア' },
    { name: 'ロナルド・キプコスゲイ', origin: 'ケニア' },
    { name: 'エマニュエル・チェプタル', origin: 'ケニア' },
    { name: 'ベンジャミン・キムタイ', origin: 'ケニア' },
    { name: 'フェリックス・チェランガット', origin: 'ケニア' },
    { name: 'ジョン・ロモルン', origin: 'ケニア' },
    { name: 'サイモン・キプタノイ', origin: 'ケニア' },
    { name: 'ウィルソン・キプロノ', origin: 'ケニア' },
    { name: 'アベル・ムティアイ', origin: 'ケニア' },
    { name: 'ポール・ムワンギ', origin: 'ケニア' },
    { name: 'マーク・チェベット', origin: 'ケニア' },
    { name: 'ダニエル・キプゲン', origin: 'ケニア' },
    { name: 'ジョセフ・ムウィキ', origin: 'ケニア' },
    { name: 'ルーカス・ロトゥル', origin: 'ケニア' },
    { name: 'ジュリアス・チェボレイ', origin: 'ケニア' },
    { name: 'カルビン・キプトー', origin: 'ケニア' },
    { name: 'ヒラリー・チェプコイル', origin: 'ケニア' },
    { name: 'エドウィン・キプタネイ', origin: 'ケニア' },
    { name: 'ゲオフリー・カムウォロル', origin: 'ケニア' },
    { name: 'ニコラス・キプルト', origin: 'ケニア' },
    { name: 'ボアズ・キプラガット', origin: 'ケニア' },
    { name: 'タデウス・キベット', origin: 'ケニア' },
    { name: 'ジェームス・ンダイ', origin: 'ケニア' },
    { name: 'ドミトリ・チュンバ', origin: 'ケニア' },
    { name: 'アブネル・ムタイ', origin: 'ケニア' },
  ],
  UGA: [
    { name: 'ジョシュア・チェプテゲイ', origin: 'ウガンダ' },
    { name: 'ジェイコブ・クゥィルタ', origin: 'ウガンダ' },
    { name: 'オスカル・キサザ', origin: 'ウガンダ' },
    { name: 'スティーブン・チェプロタ', origin: 'ウガンダ' },
    { name: 'アロン・マヨル', origin: 'ウガンダ' },
    { name: 'トビアス・コリル', origin: 'ウガンダ' },
    { name: 'ジョン・チェリモ', origin: 'ウガンダ' },
    { name: 'ロナルド・ウォタ', origin: 'ウガンダ' },
    { name: 'ピーター・アチレング', origin: 'ウガンダ' },
    { name: 'フレデリック・キプロティク', origin: 'ウガンダ' },
    { name: 'サイモン・チェプルイ', origin: 'ウガンダ' },
    { name: 'ダビデ・ムセネ', origin: 'ウガンダ' },
    { name: 'クリスチャン・ムワンジャ', origin: 'ウガンダ' },
    { name: 'ヘンリー・チェモ', origin: 'ウガンダ' },
    { name: 'マイケル・チェロノ', origin: 'ウガンダ' },
  ],
  TAN: [
    { name: 'ゲルフ・ムリンガ', origin: 'タンザニア' },
    { name: 'アンバッサ・チャンバ', origin: 'タンザニア' },
    { name: 'ファリド・マウヨ', origin: 'タンザニア' },
    { name: 'サレー・キラバ', origin: 'タンザニア' },
    { name: 'ハミシ・マジャリ', origin: 'タンザニア' },
    { name: 'アブドラ・ケルビ', origin: 'タンザニア' },
    { name: 'ジュマ・イカンガ', origin: 'タンザニア' },
    { name: 'エドワード・ムソケ', origin: 'タンザニア' },
    { name: 'ヤコボ・タオ', origin: 'タンザニア' },
    { name: 'サディク・ムウアンバ', origin: 'タンザニア' },
    { name: 'オマル・シャラビ', origin: 'タンザニア' },
    { name: 'パトリック・チュンゴ', origin: 'タンザニア' },
    { name: 'アルフレッド・ンダンバ', origin: 'タンザニア' },
    { name: 'エヴァリスト・ムビンゴ', origin: 'タンザニア' },
    { name: 'レオナルド・キラカ', origin: 'タンザニア' },
  ],
  EUR: [
    // UK
    { name: 'カラム・フォスター', origin: 'イギリス' }, { name: 'トム・ウィットフィールド', origin: 'イギリス' },
    { name: 'ジャック・モーリー', origin: 'イギリス' }, { name: 'サム・ホートン', origin: 'イギリス' },
    { name: 'アレックス・ダン', origin: 'イギリス' }, { name: 'ベン・クローリー', origin: 'イギリス' },
    // France
    { name: 'アントワーヌ・ルフェーブル', origin: 'フランス' }, { name: 'マキシム・ベルトラン', origin: 'フランス' },
    { name: 'ロメ・ゴティエ', origin: 'フランス' }, { name: 'ジュール・ラクロワ', origin: 'フランス' },
    { name: 'テオ・ルノー', origin: 'フランス' },
    // Germany
    { name: 'ルーカス・ブレナー', origin: 'ドイツ' }, { name: 'モリッツ・シュルツェ', origin: 'ドイツ' },
    { name: 'フェリックス・ギュンター', origin: 'ドイツ' }, { name: 'ジモン・ハウザー', origin: 'ドイツ' },
    { name: 'トビアス・クーン', origin: 'ドイツ' },
    // Italy
    { name: 'マルコ・フェッラーラ', origin: 'イタリア' }, { name: 'ルカ・エスポジト', origin: 'イタリア' },
    { name: 'アンドレア・ロンバルディ', origin: 'イタリア' }, { name: 'ジョルジョ・パレルモ', origin: 'イタリア' },
    { name: 'マッテオ・カルーソ', origin: 'イタリア' },
    // Spain
    { name: 'パブロ・ムニョス', origin: 'スペイン' }, { name: 'ハビエル・セラーノ', origin: 'スペイン' },
    { name: 'アレハンドロ・ビダル', origin: 'スペイン' }, { name: 'ルベン・フローレス', origin: 'スペイン' },
    // Netherlands / Scandinavia
    { name: 'ラルス・ファンデンベルフ', origin: 'オランダ' }, { name: 'ダーン・フェルメール', origin: 'オランダ' },
    { name: 'エリック・ラルセン', origin: 'スウェーデン' }, { name: 'ヨハン・ベリ', origin: 'スウェーデン' },
    { name: 'オラブ・フォスダール', origin: 'ノルウェー' }, { name: 'マグヌス・ヨハンセン', origin: 'ノルウェー' },
    // Australia / NZ (EURとして扱う)
    { name: 'ライアン・クロフォード', origin: 'オーストラリア' }, { name: 'カリン・ドナリー', origin: 'オーストラリア' },
    { name: 'ブレンダン・ハッチ', origin: 'オーストラリア' }, { name: 'マシュー・クイン', origin: 'ニュージーランド' },
    { name: 'ジョシュ・リース', origin: 'ニュージーランド' },
  ],
  USA: [
    { name: 'ライアン・ミッチェル', origin: 'アメリカ' }, { name: 'タイラー・ブルックス', origin: 'アメリカ' },
    { name: 'ジョーダン・サラス', origin: 'アメリカ' }, { name: 'マーカス・ウェブ', origin: 'アメリカ' },
    { name: 'デヴォン・コール', origin: 'アメリカ' }, { name: 'キャメロン・ナッシュ', origin: 'アメリカ' },
    { name: 'タナー・リード', origin: 'アメリカ' }, { name: 'アンドレ・ウィリアムズ', origin: 'アメリカ' },
    { name: 'ザック・ヘンダーソン', origin: 'アメリカ' }, { name: 'ダリウス・トンプソン', origin: 'アメリカ' },
    { name: 'イライジャ・クック', origin: 'アメリカ' }, { name: 'オーウェン・ハリントン', origin: 'アメリカ' },
    { name: 'ネイサン・プライス', origin: 'アメリカ' }, { name: 'コール・マクブライド', origin: 'アメリカ' },
    { name: 'ブレイク・サンダース', origin: 'アメリカ' }, { name: 'クリス・バーンズ', origin: 'アメリカ' },
    { name: 'カイル・ハリス', origin: 'アメリカ' }, { name: 'トレイ・ジョーンズ', origin: 'アメリカ' },
    { name: 'マイルス・フォスター', origin: 'アメリカ' }, { name: 'グレイソン・レイン', origin: 'アメリカ' },
    // Latin America (USAリーグ枠)
    { name: 'マテウス・シルバ', origin: 'ブラジル' }, { name: 'ルーカス・フォンセカ', origin: 'ブラジル' },
    { name: 'セバスティアン・モレノ', origin: 'コロンビア' }, { name: 'ディエゴ・リベラ', origin: 'コロンビア' },
    { name: 'アンドレス・キニョネス', origin: 'エクアドル' }, { name: 'カルロス・ウルタード', origin: 'エクアドル' },
    { name: 'パブロ・ロドリゲス', origin: 'アルゼンチン' }, { name: 'フアン・ペレス', origin: 'チリ' },
  ],
}

export function nationalityToForeignCategory(nat: Nationality): ForeignCategory {
  if (nat === 'JPN') return 'domestic'
  if (nat === 'KOR' || nat === 'CHN' || nat === 'TWN') return 'asian'
  return 'foreign'
}

const UNIVERSITIES = [
  '北都大学','南星大学','東翔大学','西陸大学','明和大学',
  '清泉大学','光輝大学','常葉大学','星稜大学','天翔大学',
  '瑞穂大学','碧海大学','翠嵐大学','暁星大学','陽光大学',
  '蒼天大学','葵陵大学','白鷹大学','麗華大学','紫峰大学',
]

const HIGHSCHOOLS = [
  '北都高校','南星高校','東翔高校','西陸高校','明和高校',
  '清泉高校','光輝高校','常葉高校','星陵高校','翠嵐高校',
]

const DEVELOPMENT_ORGS = [
  'JPELアカデミー','陸上自衛隊体育学校','実業団ジュニア','ナショナルアカデミー',
]

type Rank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS'

function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function tierRange(rank: Rank): { min: number; max: number } {
  const ranges: Record<Rank, [number, number]> = {
    'D':   [48, 55],
    'C':   [52, 59],
    'B':   [57, 64],
    'A':   [61, 68],
    'S':   [65, 72],
    'SS':  [70, 77],
    'SSS': [76, 84],
  }
  const [min, max] = ranges[rank] ?? ranges['A']
  return { min, max }
}

function rankToBaseRange(rank: Rank, growthCurve: GrowthCurve): { min: number; max: number; potential: [number, number] } {
  const { min, max } = tierRange(rank)
  const growthDelta: Record<string, [number, number]> = {
    early:        [2, 12],
    normal:       [8, 20],
    late_bloomer: [15, 28],
  }
  const [dMin, dMax] = growthDelta[growthCurve] ?? growthDelta.normal
  return { min, max, potential: [Math.min(99, max + dMin), Math.min(99, max + dMax)] }
}


function generateRatings(rank: Rank, specialty: Specialty) {
  const { min, max } = tierRange(rank)
  const base = () => rng(min, max)
  const weak = () => rng(Math.max(30, min - 12), Math.max(45, max - 12))
  const r = {
    speed: base(), stamina: base(), mountainUp: base(),
    mountainDown: base(), pacing: base(), mental: base(), recovery: base(),
  }
  if (specialty === 'ace') {
    r.stamina = clamp(r.stamina + rng(6, 12), 0, 99)
    r.pacing  = clamp(r.pacing  + rng(6, 12), 0, 99)
    r.mental  = clamp(r.mental  + rng(4, 8),  0, 99)
    r.mountainUp   = weak()
    r.mountainDown = weak()
  } else if (specialty === 'mountain_up') {
    r.mountainUp   = clamp(r.mountainUp + rng(12, 20), 0, 99)
    r.speed        = weak()
    r.mountainDown = weak()
  } else if (specialty === 'mountain_down') {
    r.mountainDown = clamp(r.mountainDown + rng(12, 20), 0, 99)
    r.mountainUp   = weak()
    r.stamina      = weak()
  } else if (specialty === 'sprinter') {
    r.speed      = clamp(r.speed + rng(10, 18), 0, 99)
    r.stamina    = weak()
    r.mountainUp = weak()
  } else if (specialty === 'long') {
    r.stamina      = clamp(r.stamina + rng(8, 14), 0, 99)
    r.pacing       = clamp(r.pacing  + rng(5, 10), 0, 99)
    r.speed        = weak()
    r.mountainDown = weak()
  } else if (specialty === 'kick') {
    r.speed   = clamp(r.speed  + rng(10, 16), 0, 99)
    r.mental  = clamp(r.mental + rng(4, 8),   0, 99)
    r.stamina = weak()
    r.pacing  = weak()
  } else if (specialty === 'grinder') {
    r.stamina  = clamp(r.stamina + rng(8, 14), 0, 99)
    r.pacing   = clamp(r.pacing  + rng(4, 8),  0, 99)
    r.speed    = weak()
    r.recovery = weak()
  } else if (specialty === 'allrounder') {
    r.speed   = clamp(r.speed   + rng(3, 6), 0, 99)
    r.stamina = clamp(r.stamina + rng(3, 6), 0, 99)
    r.pacing  = clamp(r.pacing  + rng(2, 5), 0, 99)
    r.mental  = clamp(r.mental  + rng(2, 4), 0, 99)
    r.mountainDown = weak()
  }
  return r
}

function assignTraits(rank: Rank, specialty: Specialty, age: number): TraitId[] {
  const maxTraits =
    rank === 'SSS' ? rng(1, 3) :
    rank === 'SS' || rank === 'S' ? rng(0, 2) :
    rank === 'A' ? (Math.random() < 0.45 ? 1 : 0) :
    0

  if (maxTraits === 0) return []

  const pool: TraitId[] = ['consistent', 'consistent', 'team_player', 'iron_will', 'clutch', 'fade', 'volatile', 'big_stage', 'pressure_weak']

  if (specialty === 'mountain_up' || specialty === 'mountain_down') {
    pool.push('mountain_ace', 'mountain_ace', 'mountain_ace')
  }
  if (specialty === 'sprinter') {
    pool.push('sprint_burst', 'sprint_burst', 'sprint_burst')
  }
  if (specialty === 'ace') {
    pool.push('big_stage', 'big_stage', 'clutch', 'clutch')
    pool.push('pressure_weak')
  }
  if (specialty === 'long') {
    pool.push('consistent', 'consistent', 'fade')
  }
  if (age >= 30) pool.push('fade', 'fade', 'consistent')
  if (age <= 22) pool.push('volatile', 'volatile', 'sprint_burst')

  const OPPOSITES: [TraitId, TraitId][] = [
    ['big_stage', 'pressure_weak'],
    ['consistent', 'volatile'],
    ['clutch', 'fade'],
  ]

  const result = new Set<TraitId>()
  let attempts = 0
  while (result.size < maxTraits && attempts < 40) {
    attempts++
    const pick = pool[rng(0, pool.length - 1)]
    const conflict = OPPOSITES.some(([a, b]) => (pick === a && result.has(b)) || (pick === b && result.has(a)))
    if (!conflict) result.add(pick)
  }

  return [...result]
}

let idCounter = 1000

const DRAFT_RANK_POOL: Rank[] = [
  'SSS', 'SSS',
  'SS', 'SS', 'SS', 'SS', 'SS',
  'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S',
  'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A',
  'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B',
  'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C',
  'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D',
]

type OriginType = 'university' | 'high_school' | 'foreign' | 'development'

// Build origin distribution: 40 univ, 15 hs, 10 foreign, 5 dev (total 70)
function buildOriginPool(): OriginType[] {
  const pool: OriginType[] = []
  for (let i = 0; i < 40; i++) pool.push('university')
  for (let i = 0; i < 15; i++) pool.push('high_school')
  for (let i = 0; i < 10; i++) pool.push('foreign')
  for (let i = 0; i < 5; i++) pool.push('development')
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

export function generateDraftPool(year: number): Player[] {
  const players: Player[] = []
  const rankPool = [...DRAFT_RANK_POOL].sort(() => Math.random() - 0.5)
  const originPool = buildOriginPool()

  const specialties: Specialty[] = [
    'long','long','long','long','long','long','long','long','long',
    'sprinter','sprinter','sprinter','sprinter','sprinter','sprinter','sprinter','sprinter',
    'kick','kick','kick','kick','kick','kick','kick',
    'ace','ace','ace','ace','ace','ace',
    'allrounder','allrounder','allrounder','allrounder','allrounder',
    'mountain_up','mountain_up','mountain_up','mountain_up','mountain_up',
    'mountain_down','mountain_down','mountain_down','mountain_down',
    'grinder','grinder','grinder',
  ]
  const growthCurves: GrowthCurve[] = ['early','normal','normal','late_bloomer']

  const usedNames = new Set<string>()
  let rankIdx = 0

  originPool.forEach((originType) => {
    idCounter++
    const isForeign = originType === 'foreign'
    const rank: Rank = rankPool[rankIdx++] ?? 'A'
    const specialty = specialties[rng(0, specialties.length - 1)]
    const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
    const { potential } = rankToBaseRange(rank, growthCurve)
    const ratings = generateRatings(rank, specialty)

    const age = isForeign
      ? rng(19, 25)
      : originType === 'high_school'
      ? 18
      : originType === 'development'
      ? rng(21, 24)
      : 22

    let origin: string
    let name: string

    if (isForeign) {
      const fn = FOREIGN_NAMES[rng(0, FOREIGN_NAMES.length - 1)]
      name = fn.name
      origin = fn.origin
    } else {
      origin = originType === 'high_school'
        ? HIGHSCHOOLS[rng(0, HIGHSCHOOLS.length - 1)]
        : originType === 'development'
        ? DEVELOPMENT_ORGS[rng(0, DEVELOPMENT_ORGS.length - 1)]
        : UNIVERSITIES[rng(0, UNIVERSITIES.length - 1)]

      let attempts = 0
      do {
        name = `${FAMILY_NAMES[rng(0, FAMILY_NAMES.length - 1)]} ${GIVEN_NAMES_MALE[rng(0, GIVEN_NAMES_MALE.length - 1)]}`
        attempts++
      } while (usedNames.has(name) && attempts < 60)
      usedNames.add(name)
    }

    players.push({
      id: `draft-${year}-${idCounter}`,
      name,
      nameKana: '',
      age,
      yearsPro: 0,
      draftYear: year,
      draftRound: null,
      draftPick: null,
      ratings,
      specialty,
      potential: isForeign ? rng(potential[0], potential[1]) : Math.min(90, rng(potential[0], potential[1])),
      growthCurve,
      teamId: '__pool__',
      rosterTier: 'main',
      contract: {
        yearsLeft: 4,
        annualSalary: calculateRookieSalary(rank),
        faEligibleYear: year + 7,
      },
      nationality: isForeign ? 'FOREIGN' : 'JPN',
      origin,
      status: 'draft_eligible',
      fatigue: 0,
      morale: 90,
      form: 0,
      career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
      traits: assignTraits(rank, specialty, age),
      personality: (['salary', 'salary', 'winning', 'winning', 'loyalty'] as const)[rng(0, 4)],
    })
  })

  // バケモン年: 10%の確率で別格の逸材が1人出現（OVR 83〜89、ポテ90〜99）
  if (Math.random() < 0.10) {
    idCounter++
    const spec = specialties[rng(0, specialties.length - 1)]
    const gc = growthCurves[rng(0, growthCurves.length - 1)]
    const baseRng = () => rng(83, 89)
    const pr = {
      speed: baseRng(), stamina: baseRng(), mountainUp: baseRng(),
      mountainDown: baseRng(), pacing: baseRng(), mental: baseRng(), recovery: baseRng(),
    }
    let pName: string
    let attempts = 0
    do {
      pName = `${FAMILY_NAMES[rng(0, FAMILY_NAMES.length - 1)]} ${GIVEN_NAMES_MALE[rng(0, GIVEN_NAMES_MALE.length - 1)]}`
      attempts++
    } while (usedNames.has(pName) && attempts < 60)
    usedNames.add(pName)
    const pOrig = UNIVERSITIES[rng(0, UNIVERSITIES.length - 1)]
    players.unshift({
      id: `draft-${year}-prodigy-${idCounter}`,
      name: pName,
      nameKana: '',
      age: 22,
      yearsPro: 0,
      draftYear: year,
      draftRound: null,
      draftPick: null,
      ratings: pr,
      specialty: spec,
      potential: rng(90, 99),
      growthCurve: gc,
      teamId: '__pool__',
      rosterTier: 'main',
      contract: { yearsLeft: 4, annualSalary: 40000000, faEligibleYear: year + 7 },
      nationality: 'JPN',
      origin: pOrig,
      status: 'draft_eligible',
      fatigue: 0,
      morale: 90,
      form: 0,
      career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
      traits: assignTraits('SSS', spec, 22),
      personality: (['salary', 'salary', 'winning', 'winning', 'loyalty'] as const)[rng(0, 4)],
    })
  }

  // 大器晩成バケモン: 10%の確率で初期は平凡だが異常な伸びしろを持つ逸材
  if (Math.random() < 0.10) {
    idCounter++
    const spec = specialties[rng(0, specialties.length - 1)]
    const lbRatings = generateRatings('A', spec)
    let lbName: string
    let lbAttempts = 0
    do {
      lbName = `${FAMILY_NAMES[rng(0, FAMILY_NAMES.length - 1)]} ${GIVEN_NAMES_MALE[rng(0, GIVEN_NAMES_MALE.length - 1)]}`
      lbAttempts++
    } while (usedNames.has(lbName) && lbAttempts < 60)
    usedNames.add(lbName)
    const lbOrig = UNIVERSITIES[rng(0, UNIVERSITIES.length - 1)]
    const lbAge = rng(18, 22)
    players.push({
      id: `draft-${year}-latebloomer-${idCounter}`,
      name: lbName,
      nameKana: '',
      age: lbAge,
      yearsPro: 0,
      draftYear: year,
      draftRound: null,
      draftPick: null,
      ratings: lbRatings,
      specialty: spec,
      potential: rng(94, 99),
      growthCurve: 'late_bloomer',
      teamId: '__pool__',
      rosterTier: 'main',
      contract: { yearsLeft: 4, annualSalary: calculateRookieSalary('A'), faEligibleYear: year + 7 },
      nationality: 'JPN',
      origin: lbOrig,
      status: 'draft_eligible',
      fatigue: 0,
      morale: 90,
      form: 0,
      career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
      traits: assignTraits('A', spec, lbAge),
      personality: (['salary', 'salary', 'winning', 'winning', 'loyalty'] as const)[rng(0, 4)],
    })
  }

  return players
}

// AI roster rank distribution per team tier (main: 20, second: 15)
const AI_GRADE_POOL_ELITE: Rank[] = [
  'SSS', 'SSS',
  'SS', 'SS', 'SS', 'SS',
  'S', 'S', 'S', 'S', 'S', 'S',
  'A', 'A', 'A', 'A',
  'B', 'B', 'B', 'B',
]
const AI_GRADE_POOL_MID: Rank[] = [
  'SS',
  'S', 'S', 'S', 'S',
  'A', 'A', 'A', 'A', 'A', 'A',
  'B', 'B', 'B', 'B', 'B',
  'C', 'C', 'C', 'C',
]
const AI_GRADE_POOL_WEAK: Rank[] = [
  'S',
  'A', 'A', 'A', 'A',
  'B', 'B', 'B', 'B', 'B', 'B', 'B',
  'C', 'C', 'C', 'C', 'C',
  'D', 'D', 'D',
]
const AI_SECOND_POOL_ELITE: Rank[] = [
  'A', 'A', 'A',
  'B', 'B', 'B', 'B', 'B',
  'C', 'C', 'C', 'C', 'C',
  'D', 'D',
]
const AI_SECOND_POOL_MID: Rank[] = [
  'B', 'B', 'B',
  'C', 'C', 'C', 'C', 'C', 'C', 'C',
  'D', 'D', 'D', 'D', 'D',
]
const AI_SECOND_POOL_WEAK: Rank[] = [
  'C', 'C', 'C',
  'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D',
]

export function generateCpuRosters(
  teams: { id: string; initialRank?: number }[],
  year: number,
): { cpuPlayers: Player[]; teamRosters: Record<string, { main: string[]; second: string[] }> } {
  const cpuPlayers: Player[] = []
  const teamRosters: Record<string, { main: string[]; second: string[] }> = {}
  const usedNames = new Set<string>()
  const specialties: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const growthCurves: GrowthCurve[] = ['early', 'normal', 'normal', 'late_bloomer']
  let cpuIdCounter = 5000

  const tierMap = new Map<string, 'elite' | 'mid' | 'weak'>()
  for (const t of teams) {
    const rank = t.initialRank ?? 10
    tierMap.set(t.id, rank <= 6 ? 'elite' : rank <= 14 ? 'mid' : 'weak')
  }

  function makePlayer(
    baseRank: Rank, i: number, teamId: string, tier: 'main' | 'second',
    isForeign: boolean, contractType: 'standard' | 'development' | 'dual' = tier === 'main' ? 'standard' : 'development',
  ): Player {
    cpuIdCounter++
    const rank: Rank = baseRank
    const specialty = specialties[rng(0, specialties.length - 1)]
    const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
    const ratings = generateRatings(rank, specialty)
    const { potential } = rankToBaseRange(rank, growthCurve)
    const age = tier === 'main' ? rng(22, 31) : rng(19, 25)
    const yearsPro = Math.max(0, age - 22)
    const potentialVal = isForeign ? rng(potential[0], potential[1]) : Math.min(90, rng(potential[0], potential[1]))

    // 経験年数に応じて各能力値を底上げ
    if (yearsPro > 0) {
      const bonus = Math.floor(yearsPro * 1.6)
      ;(Object.keys(ratings) as Array<keyof typeof ratings>).forEach(key => {
        ratings[key] = Math.min(potentialVal, Math.min(99, ratings[key] + bonus + rng(-3, 5)))
      })
    }

    let name: string
    let origin: string
    let nationality: 'JPN' | 'FOREIGN'

    if (isForeign) {
      const fn = FOREIGN_NAMES[rng(0, FOREIGN_NAMES.length - 1)]
      name = fn.name; origin = fn.origin; nationality = 'FOREIGN'
    } else {
      origin = Math.random() < 0.6
        ? UNIVERSITIES[rng(0, UNIVERSITIES.length - 1)]
        : HIGHSCHOOLS[rng(0, HIGHSCHOOLS.length - 1)]
      nationality = 'JPN'
      let attempts = 0
      do {
        name = `${FAMILY_NAMES[rng(0, FAMILY_NAMES.length - 1)]} ${GIVEN_NAMES_MALE[rng(0, GIVEN_NAMES_MALE.length - 1)]}`
        attempts++
      } while (usedNames.has(name) && attempts < 60)
      usedNames.add(name)
    }

    const id = `ai${tier === 'second' ? '2' : ''}-${teamId}-${cpuIdCounter}`
    return {
      id, name, nameKana: '', age, yearsPro,
      draftYear: year - yearsPro, draftRound: null, draftPick: null,
      ratings, specialty,
      potential: potentialVal,
      growthCurve,
      teamId, rosterTier: tier,
      contract: {
        yearsLeft: rng(1, 3),
        annualSalary: calculateRookieSalary(rank),
        faEligibleYear: year + rng(1, 3),
        contractType,
      },
      nationality, origin,
      status: 'active', fatigue: 0, morale: rng(65, 85), form: 0,
      career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
      traits: assignTraits(rank, specialty, age),
      personality: (['salary', 'salary', 'winning', 'winning', 'loyalty'] as const)[rng(0, 4)],
    }
  }

  for (const team of teams) {
    const teamTier = tierMap.get(team.id) ?? 'mid'
    const mainPool = teamTier === 'elite' ? AI_GRADE_POOL_ELITE : teamTier === 'weak' ? AI_GRADE_POOL_WEAK : AI_GRADE_POOL_MID
    const secondPool = teamTier === 'elite' ? AI_SECOND_POOL_ELITE : teamTier === 'weak' ? AI_SECOND_POOL_WEAK : AI_SECOND_POOL_MID

    const mainIds: string[] = []   // 本契約(standard) 12
    const dualIds: string[] = []   // 2WAY(dual) 3（1軍/2軍共通）
    const secondIds: string[] = [] // 育成(development) 15

    const mainGrades = [...mainPool].sort(() => Math.random() - 0.5)
    const secondGrades = [...secondPool].sort(() => Math.random() - 0.5)

    // 本契約(standard) 12人 — 外国人は2人まで
    let teamForeignCount = 0
    for (let i = 0; i < 12; i++) {
      const grade = mainGrades[i % mainGrades.length]
      const canBeForeign = teamForeignCount < 2
      const isForeign = canBeForeign && (i < 1 ? Math.random() < 0.55 : Math.random() < 0.08)
      if (isForeign) teamForeignCount++
      const p = makePlayer(grade, i, team.id, 'main', isForeign, 'standard')
      cpuPlayers.push(p); mainIds.push(p.id)
    }
    // 2WAY(dual) 3人 — 1軍側で保持し2軍にも登録（国内）
    for (let i = 0; i < 3; i++) {
      const grade = secondGrades[i % secondGrades.length]
      const p = makePlayer(grade, 12 + i, team.id, 'main', false, 'dual')
      cpuPlayers.push(p); dualIds.push(p.id)
    }
    // 育成(development) 15人（国内）
    for (let i = 0; i < 15; i++) {
      const grade = secondGrades[(i + 3) % secondGrades.length]
      const p = makePlayer(grade, i, team.id, 'second', false, 'development')
      cpuPlayers.push(p); secondIds.push(p.id)
    }

    // 2WAY は1軍・2軍の両方に登録
    teamRosters[team.id] = { main: [...mainIds, ...dualIds], second: [...secondIds, ...dualIds] }
  }

  return { cpuPlayers, teamRosters }
}

// プレイヤーチームの初期30人生成（20位相当・最弱スタート固定）
// 本契約12 + 2WAY3 + 育成15 = 30人、目標年俸合計約2.8億
export function generatePlayerInitialRoster(year: number): {
  players: Player[]
  mainIds: string[]
  dualIds: string[]
  secondIds: string[]
} {
  const MAIN_POOL: Rank[]   = ['A', 'B','B','B','B','B','B','B','B', 'C','C','C']   // 12人
  const DUAL_POOL: Rank[]   = ['B', 'C', 'C']                                        // 3人
  const SECOND_POOL: Rank[] = ['C','C','C','C','C','C','C','C', 'D','D','D','D','D','D','D'] // 15人

  const specialties: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const growthCurves: GrowthCurve[] = ['early', 'normal', 'normal', 'late_bloomer']
  const usedNames = new Set<string>()
  const players: Player[] = []
  const mainIds: string[] = []
  const dualIds: string[] = []
  const secondIds: string[] = []

  function makePRPlayer(rank: Rank, tier: 'main' | 'second', contractType: 'standard' | 'dual' | 'development'): Player {
    idCounter++
    const specialty = specialties[rng(0, specialties.length - 1)]
    const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
    const ratings = generateRatings(rank, specialty)
    const { potential } = rankToBaseRange(rank, growthCurve)
    const age = tier === 'main' ? rng(20, 28) : rng(18, 24)
    const yearsPro = Math.max(0, age - 22)
    const origin = Math.random() < 0.6
      ? UNIVERSITIES[rng(0, UNIVERSITIES.length - 1)]
      : HIGHSCHOOLS[rng(0, HIGHSCHOOLS.length - 1)]
    let name: string, attempts = 0
    do {
      name = `${FAMILY_NAMES[rng(0, FAMILY_NAMES.length - 1)]} ${GIVEN_NAMES_MALE[rng(0, GIVEN_NAMES_MALE.length - 1)]}`
      attempts++
    } while (usedNames.has(name) && attempts < 60)
    usedNames.add(name)
    return {
      id: `pr-${contractType}-${year}-${idCounter}`,
      name, nameKana: '', age, yearsPro,
      draftYear: year - yearsPro, draftRound: null, draftPick: null,
      ratings, specialty,
      potential: Math.min(90, rng(potential[0], potential[1])),
      growthCurve,
      teamId: '', rosterTier: tier,
      contract: {
        yearsLeft: rng(2, 4),
        annualSalary: calculateRookieSalary(rank),
        faEligibleYear: year + rng(2, 5),
        contractType,
      },
      nationality: 'JPN', origin,
      status: 'active', fatigue: 0, morale: rng(70, 90), form: 0,
      career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
      traits: assignTraits(rank, specialty, age),
      personality: (['salary', 'salary', 'winning', 'winning', 'loyalty'] as const)[rng(0, 4)],
    }
  }

  for (const rank of [...MAIN_POOL].sort(() => Math.random() - 0.5)) {
    const p = makePRPlayer(rank, 'main', 'standard')
    players.push(p); mainIds.push(p.id)
  }
  for (const rank of [...DUAL_POOL].sort(() => Math.random() - 0.5)) {
    const p = makePRPlayer(rank, 'main', 'dual')
    players.push(p); dualIds.push(p.id)
  }
  for (const rank of [...SECOND_POOL].sort(() => Math.random() - 0.5)) {
    const p = makePRPlayer(rank, 'second', 'development')
    players.push(p); secondIds.push(p.id)
  }

  return { players, mainIds, dualIds, secondIds }
}

// CPUチームの2軍を補充するための若手選手を生成する（teamId付き）。
export function generateCpuSecondPlayers(teamId: string, count: number, year: number): Player[] {
  const POOL: Rank[] = ['B', 'B', 'C', 'C', 'C', 'C', 'D', 'D', 'D', 'D']
  const specialties: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const growthCurves: GrowthCurve[] = ['early', 'normal', 'normal', 'late_bloomer']
  const usedNames = new Set<string>()
  const players: Player[] = []
  for (let i = 0; i < count; i++) {
    idCounter++
    const rank = POOL[rng(0, POOL.length - 1)]
    const specialty = specialties[rng(0, specialties.length - 1)]
    const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
    const ratings = generateRatings(rank, specialty)
    const { potential } = rankToBaseRange(rank, growthCurve)
    const age = rng(19, 24)
    const yearsPro = Math.max(0, age - 22)
    const origin = Math.random() < 0.6
      ? UNIVERSITIES[rng(0, UNIVERSITIES.length - 1)]
      : HIGHSCHOOLS[rng(0, HIGHSCHOOLS.length - 1)]
    let name: string, attempts = 0
    do {
      name = `${FAMILY_NAMES[rng(0, FAMILY_NAMES.length - 1)]} ${GIVEN_NAMES_MALE[rng(0, GIVEN_NAMES_MALE.length - 1)]}`
      attempts++
    } while (usedNames.has(name) && attempts < 60)
    usedNames.add(name)
    players.push({
      id: `ai2gen-${teamId}-${year}-${idCounter}`,
      name, nameKana: '', age, yearsPro,
      draftYear: year - yearsPro, draftRound: null, draftPick: null,
      ratings, specialty,
      potential: Math.min(90, rng(potential[0], potential[1])),
      growthCurve,
      teamId, rosterTier: 'second',
      contract: { yearsLeft: rng(1, 3), annualSalary: calculateRookieSalary(rank), faEligibleYear: year + rng(1, 3) },
      nationality: 'JPN', origin,
      status: 'active', fatigue: 0, morale: rng(65, 85), form: 0,
      career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
      traits: assignTraits(rank, specialty, age),
      personality: (['salary', 'salary', 'winning', 'winning', 'loyalty'] as const)[rng(0, 4)],
    })
  }
  return players
}

function calculateRookieSalary(rank: Rank): number {
  if (rank === 'SSS') return 40000000
  if (rank === 'SS')  return 32000000
  if (rank === 'S')   return 24000000
  if (rank === 'A')   return 17000000
  if (rank === 'B')   return 12000000
  if (rank === 'C')   return 8000000
  return 6000000
}

// Build the draft pick order for all 20 teams (2 rounds, 40 picks)
// Uses NBA-style weighted lottery for the top picks.
export function buildDraftOrder(
  teams: { id: string; history: { seasonResults: { year: number; rank: number }[] } }[],
  year: number,
  playerTeamId?: string,
): string[] {
  // Helper: weighted lottery — draws all candidates in weighted order
  function runLottery(candidates: string[], weights: number[]): string[] {
    const result: string[] = []
    const pool = candidates.map((id, i) => ({ id, w: weights[i] ?? 1 }))
    while (result.length < candidates.length) {
      const total = pool.reduce((s, x) => s + x.w, 0)
      let r = Math.random() * total
      let winner = pool[pool.length - 1]
      for (const x of pool) { r -= x.w; if (r <= 0) { winner = x; break } }
      result.push(winner.id)
      pool.splice(pool.indexOf(winner), 1)
    }
    return result
  }

  const isInaugural = teams.every(t => t.history.seasonResults.length === 0 ||
    !t.history.seasonResults.find(r => r.year === year - 1))

  let round1: string[]

  if (isInaugural) {
    // Inaugural year: all teams except playerTeam enter equal lottery.
    // PlayerTeam gets a slight advantage (weight 3x) simulating a top-5 guarantee.
    const nonPlayer = teams.filter(t => t.id !== playerTeamId).map(t => t.id)
    const allIds = playerTeamId ? [...nonPlayer, playerTeamId] : [...nonPlayer]
    const weights = allIds.map(id => id === playerTeamId ? 3 : 1)
    round1 = runLottery(allIds, weights)

    // Ensure playerTeam is within top 5
    if (playerTeamId) {
      const pos = round1.indexOf(playerTeamId)
      if (pos > 4) {
        round1.splice(pos, 1)
        // Insert at a random position within top 5
        const insertAt = Math.floor(Math.random() * 5)
        round1.splice(insertAt, 0, playerTeamId)
      }
    }
  } else {
    // Subsequent years: sort teams by previous season rank (worst first = highest rank number)
    const sorted = [...teams].sort((a, b) => {
      const rankA = a.history.seasonResults.find(r => r.year === year - 1)?.rank ?? 20
      const rankB = b.history.seasonResults.find(r => r.year === year - 1)?.rank ?? 20
      return rankB - rankA // worst rank (highest number) first
    })

    // Bottom 10 teams enter weighted lottery for picks 1-10
    const LOTTERY_WEIGHTS = [250, 199, 156, 119, 88, 63, 43, 28, 17, 11]
    const lotteryTeams = sorted.slice(0, 10).map(t => t.id)
    const lotteryOrder = runLottery(lotteryTeams, LOTTERY_WEIGHTS)

    // Teams ranked 11-20 draft in reverse standings order for picks 11-20
    const tailOrder = sorted.slice(10).map(t => t.id)

    round1 = [...lotteryOrder, ...tailOrder]
  }

  const round2 = [...round1].reverse()
  return [...round1, ...round2]
}

let foreignIdCounter = 9000

// 年1回、海外クラブに動きをつける：引退等（removedIds）を外し、若手を1〜2人ずつ新加入。
export function refreshForeignLeagues(
  leagues: ForeignLeague[],
  removedIds: Set<string>,
  year: number,
): { newPlayers: Player[]; updatedLeagues: ForeignLeague[] } {
  const fresh = generateForeignLeaguePlayers(leagues, year)
  const byId = new Map(fresh.players.map(p => [p.id, p]))
  const newPlayers: Player[] = []
  const updatedLeagues = leagues.map(l => {
    const freshL = fresh.updatedLeagues.find(fl => fl.id === l.id)
    return {
      ...l,
      clubs: l.clubs.map(club => {
        const kept = club.playerIds.filter(id => !removedIds.has(id))
        const freshClub = freshL?.clubs.find(fc => fc.id === club.id)
        const addN = 3 + (Math.random() < 0.5 ? 1 : 0)
        const adds = (freshClub?.playerIds ?? []).slice(0, addN)
        for (const id of adds) { const p = byId.get(id); if (p) newPlayers.push({ ...p, joinedYear: year }) }
        return { ...club, playerIds: [...kept, ...adds] }
      }),
    }
  })
  return { newPlayers, updatedLeagues }
}

export function generateForeignLeaguePlayers(
  leagues: ForeignLeague[],
  year: number,
): { players: Player[]; updatedLeagues: ForeignLeague[] } {
  const players: Player[] = []
  const specialties: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const growthCurves: GrowthCurve[] = ['early', 'normal', 'normal', 'late_bloomer']

  // 地域別グレードプール（日本S/A帯を基準に強弱）
  const GRADE_POOL: Record<string, Rank[]> = {
    // アフリカ（ETH/KEN/UGA/TAN）: かなり高め
    AFRICA: [
      'SSS', 'SSS', 'SSS', 'SSS', 'SSS',
      'SS', 'SS', 'SS', 'SS', 'SS',
      'S', 'S', 'S', 'S',
      'A', 'A', 'A',
      'B', 'B',
      'C', 'C', 'C',
    ],
    // ユーロ・アメリカ: 日本平均より高め
    EUR_USA: [
      'SSS', 'SSS', 'SSS',
      'SS', 'SS', 'SS', 'SS',
      'S', 'S', 'S', 'S', 'S',
      'A', 'A', 'A', 'A',
      'B', 'B', 'B',
      'C', 'C', 'C',
    ],
    // 中国・韓国・台湾: 日本平均より低め
    ASIA: [
      'S', 'S',
      'A', 'A', 'A', 'A',
      'B', 'B', 'B', 'B', 'B',
      'C', 'C', 'C', 'C',
      'D', 'D', 'D', 'D', 'D',
      'D', 'D',
    ],
  }

  function gradePoolFor(country: string): Rank[] {
    if (['ETH', 'KEN', 'UGA', 'TAN'].includes(country)) return GRADE_POOL.AFRICA
    if (['EUR', 'USA'].includes(country)) return GRADE_POOL.EUR_USA
    if (['CHN', 'KOR', 'TWN'].includes(country)) return GRADE_POOL.ASIA
    return GRADE_POOL.EUR_USA
  }

  const updatedLeagues = leagues.map(league => ({
    ...league,
    clubs: league.clubs.map(club => {
      const clubPlayerIds: string[] = []
      const grades = [...gradePoolFor(club.country)].sort(() => Math.random() - 0.5)
      const namePool = FOREIGN_NAMES_BY_NATIONALITY[club.country as string]
        ?? FOREIGN_NAMES_BY_NATIONALITY.EUR
        ?? []

      grades.forEach((rank, i) => {
        foreignIdCounter++
        const specialty = specialties[rng(0, specialties.length - 1)]
        const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
        const ratings = generateRatings(rank, specialty)
        const { potential } = rankToBaseRange(rank, growthCurve)
        const age = rng(22, 30)
        const nat: Nationality = club.country
        const foreignCat = nationalityToForeignCategory(nat)

        const nameEntry = namePool.length > 0
          ? namePool[rng(0, namePool.length - 1)]
          : FOREIGN_NAMES[rng(0, FOREIGN_NAMES.length - 1)]

        const id = `fp-${club.id}-${foreignIdCounter}`
        clubPlayerIds.push(id)

        players.push({
          id,
          name: nameEntry.name,
          nameKana: '',
          age,
          yearsPro: age - 22,
          draftYear: year - (age - 22),
          draftRound: null,
          draftPick: null,
          ratings,
          specialty,
          potential: rng(potential[0], potential[1]),
          growthCurve,
          teamId: club.id,
          rosterTier: 'main',
          contract: {
            yearsLeft: rng(1, 3),
            annualSalary: calculateRookieSalary(rank),
            faEligibleYear: year + rng(1, 3),
          },
          nationality: nat,
          foreignCategory: foreignCat,
          origin: nameEntry.origin,
          status: 'active',
          fatigue: 0,
          morale: rng(65, 85),
          form: 0,
          career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
          traits: assignTraits(rank, specialty, age),
          personality: (['salary', 'salary', 'winning', 'winning', 'loyalty'] as const)[rng(0, 4)],
        })
      })

      return { ...club, playerIds: clubPlayerIds }
    }),
  }))

  return { players, updatedLeagues }
}
