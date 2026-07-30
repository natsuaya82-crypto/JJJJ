import type { Player, Specialty, GrowthCurve, Nationality, ForeignCategory, ForeignLeague } from '../types'
import { natCategory, natStrengthRegion } from '../data/nationalities'
import type { TraitId } from '../utils/traitUtils'
import { rankBudgetGrant } from '../data/economy'
import { SPEC_STRONG_STATS, getStatPotentials, faMarketSalary } from '../utils/playerUtils'

const FAMILY_NAMES = [
  '田中','鈴木','佐藤','高橋','伊藤','渡辺','山本','中村','小林','加藤',
  '吉田','山田','佐々木','山口','松本','井上','木村','林','斎藤','清水',
  '山崎','森','阿部','池田','橋本','石川','前田','藤田','後藤','岡田',
  '長谷川','村上','近藤','石井','坂本','遠藤','青木','藤井','西村','福田',
  '太田','三浦','岡本','松田','中島','中野','原田','小野','竹内','金子',
  '浜田','飯田','宮本','津田','野口','熊谷','新井','菊池','小川','今井',
  '大野','松井','島田','高田','工藤','丸山','上野','永田','川口','市川',
  '藤原','石田','杉山','大塚','平野','内田','高木','安藤','谷口','柴田',
  '宮崎','酒井','横山','川崎','松尾','菅原','久保','木下','佐野','大西',
  '松岡','星野','吉川','岩崎','野村','渡部','田村','中山','桜井','望月',
]

const GIVEN_NAMES_MALE = [
  '大輝','颯','蒼','陸','拓海','悠','翔','健太','大地','涼',
  '剛','純','慶','亮','隼人','航','正','蓮','大悟','颯太',
  '雄大','俊','拓哉','直樹','勇気','竜也','裕也','侑哉','快','朔太郎',
  '康平','和也','健司','大輔','将','誠','浩','剛志','誠一','太郎',
  '一郎','次郎','三郎','孝一','孝二','博','猛','勝','浩二','浩一',
  '翔太','悠斗','陽太','湊','樹','遼','慎太郎','圭太','亮太','泰河',
  '昂大','光','匠','駿','岳','徹','学','修平','智也','啓太',
  '祐樹','尚樹','大和','海斗','陽介','涼太','圭吾','洋平','直人','真也',
  '秀平','良太','幸太','賢人','一輝','恭平','玲央','悠真','昌也','篤志',
  '克也','章吾','龍之介','佑','晴人','光希','敦也','敬介','実','進',
]

// 外国人名は姓プールと名プールの組み合わせで生成する
// familyFirst が true の国（韓国・中国・台湾）は「姓・名」、それ以外は「名・姓」の順で表記する
interface ForeignNamePool {
  nat: Nationality   // 実際の国籍コード（JPELに来る外国人にもこれをそのまま持たせる）
  origin: string
  given: string[]
  family: string[]
  familyFirst?: boolean
}

// 東アフリカ系（ケニア・ウガンダ共通）の名
const EAST_AFRICAN_GIVEN = [
  'サイモン','ジェレミア','エリウド','ダニエル','ジョン','ピーター','ポール','ジェームス','ジョセフ','デイビッド',
  'サミュエル','デニス','パトリック','ロナルド','ロバート','エマニュエル','フェリックス','ベンジャミン','アベル','マーク',
  'ルーカス','ジュリアス','ヒラリー','エドウィン','ニコラス','ボアズ','カレブ','モーゼス','アイザック','ティモシー',
  'ビクター','チャールズ','フランシス','アンソニー','マーティン','コスマス',
]

const KEN_FAMILY = [
  'キプタニ','チェランガット','ロサモ','ムワンギ','チェベット','キムタイ','キプコスゲイ','ロノ','キボウエ','コルウェイ',
  'キプランガット','ロティッチ','キルイ','キプサング','ムタイ','キプコルイ','チェプタル','キプタノイ','キプロノ','ムティアイ',
  'キプゲン','ムウィキ','ロトゥル','チェボレイ','キプトー','チェプコイル','キプタネイ','カムウォロル','キプルト','キベット',
  'ンダイ','チュンバ','コエチ','サング','キプケモイ','ラガット',
]

const UGA_FAMILY = [
  'チェプテゲイ','キサザ','チェプロタ','ナムバレ','クィルタ','マヨル','チェムタイ','チェリモ','ウォタ','アチレング',
  'キプロティク','チェプルイ','ムセネ','ムワンジャ','チェモ','チェロノ','チェボイ','キプシロ','チェマタン','ムサグワ',
  'ムトゥンバ','ムガルラ','ワニャマ','オケロ','オチェン','オピオ','ムギシャ','トゥムシメ','キベガ','ルワンガ',
]

// タンザニアの名（スワヒリ系）
const SWAHILI_GIVEN = [
  'ハミシ','アブドラ','ジュマ','サディク','オマリ','ファリド','サレー','ヤコボ','エヴァリスト','アルフレッド',
  'エドワード','レオナルド','ラシディ','セイフ','ムサ','イッサ','カリム','バカリ','スレイマン','ハッサン',
  'フセイン','アリ','サイディ','マジッド','ラマダニ','シャバニ','ザカリア','ヨハナ','ゴッドフレイ','フィリポ',
]

const TAN_FAMILY = [
  'ムリンガ','チャンバ','マウヨ','キラバ','マジャリ','ケルビ','イカンガ','ムソケ','タオ','ムウアンバ',
  'シャラビ','チュンゴ','ンダンバ','ムビンゴ','キラカ','ムワンガ','ンヨニ','キマロ','シャハンガ','マサンジャ',
  'サンガ','ジュマンネ','ムカヤ','ンダロ','マレセラ','ムトンガ','カムワガ','ニャンビ','ムハンド','ルワイモ',
]

// エチオピア・エリトリア共通の名
const HORN_GIVEN = [
  'タデッセ','アブラハム','ヨナス','ゲタチュウ','ムルゲタ','ダウィット','ソロモン','ベルハヌ','フィトサム','ビニヤム',
  'サムソン','ヘノク','アマヌエル','キダネ','エフレム','テドロス','デレジェ','シサイ','タリク','ムクタル',
  'ワセン','ゲブル','ティルフネ','ファジャル','ダリ','アスタル','バーハン','ミルツ','テスファイ','ハゴス',
  'メブラツ','アレマイェフ',
]

const ETH_FAMILY = [
  'ベケレ','バレガ','キンデ','ゲブレハン','テスファイェ','ワルク','アラヌ','ゲブレメディン','ティルネ','メルガ',
  'デゲファ','ビルハネ','ハイレ','ゲブレシラシエ','レガセ','ファンタ','グルム','アルガウ','ジェベサ','アメーデ',
  'テクレ','テスファウ','レメサ','トラ','ネガシュ','アセファ','デスタ','ケベデ','ウォルデ','ゲタネ',
  'ムレタ','ドゥベ',
]

const ERI_FAMILY = [
  'ゴイトム','ベルハン','ゼムイ','アレガウィ','キエドル','テスファマリアム','フィリモン','テウォルデ','キフレ','ゲブレヒウォット',
  'ツェガイ','ハブテ','メハリ','アンドム','ネガシ','アスメロム','ウォルドゥ','ルッソム','テクレマリアム','ゲブレアブ',
  'オクバイ','ヨハンネス','ベヤン','シウム','アブラハ','ガイム','テスフォム','ベラケット','セライ','ドラル',
]

// モロッコの名（アラブ系）
const ARABIC_GIVEN = [
  'ユーセフ','アミン','ハムザ','メフディ','アシュラフ','イリアス','スフィアン','アナス','ビラル','タリック',
  'ラシド','サミル','ハリド','ナビル','アブデラ','ムスタファ','イブラヒム','アユーブ','ワリド','ハキム',
  'サイード','ジャワド','ヌールディン','レダ','オスマン','フアド','アダム','モンセフ','ザカリヤ','ヤシン',
]

const MAR_FAMILY = [
  'アムラン','ブフェン','エルバクリ','アイタラヒム','オウルド','ベンナセル','ベンスリマン','エルカディ','ブアジズ','タハリ',
  'ラムダニ','ベルカセム','アズーズ','エルアラウィ','ブラヒミ','エルハムディ','アイトサイド','サドキ','ファティヒ','ゼルアリ',
  'ベンジェルーン','エルフィラリ','ブータイブ','ハディオウイ','エルカバシュ','ジャブラン','アクナウ','ベルアビド','エルマルーフ','ウアリ',
]

const SOM_GIVEN = [
  'アブディ','アフメド','ハサン','フセイン','ユスフ','リバン','マハド','アブディラフマン','アブドゥラヒ','ムスタフ',
  'サイード','ヤシン','オスマン','モハムード','アリー','アワレ','ダヒル','ヌール','シャリフ','アブディカディル',
  'ハムディ','ムクタール','アブディウェリ','ジャマル','カリード','バシル','イスマイル','ファイサル','アブバカル','ムハンマド',
]

const SOM_FAMILY = [
  'ワルサメ','ファレ','ドゥアレ','ハシ','エルミ','ワイス','ジャマ','ディリエ','サマタル','ムセ',
  'ヌル','アダン','アウェス','ロブレ','ゲディ','バレ','イッセ','アブディレ','シレ','カヒン',
  'アハメド','ハッサン','アブディラシド','マハムード','イガル','アブカル','ヘルシ','ワベリ','ムヒディン','アブシル',
]

const KOR_FAMILY = [
  'イ','キム','パク','チェ','チョン','カン','チョ','ユン','チャン','イム',
  'ハン','オ','ソ','シン','クォン','ファン','アン','ソン','ユ','ホン',
  'コ','ムン','ヤン','ペ','ペク','ホ','ノ','シム','ナ','チュ',
  'リュ','ク',
]

const KOR_GIVEN = [
  'ジョンミン','サンウ','ジュンヒョク','スンジェ','ドンフン','ソクヒョン','テウォン','ジェヒョン','ミンジュン','ヒョンソク',
  'ジュンソ','ドンヒョン','ドユン','テヤン','ジェウォン','ジュンヨン','ソンミン','ドンジュン','テヒョン','セジュン',
  'ウソン','ジュンホ','ジェヒョク','ジュンソク','ヒョヌ','ミンギュ','ソンフン','ジフン','スンヒョン','ジェミン',
  'ウジン','ドヒョン','サンヒョク','ヨンジュン','ミンソク','ハヌル',
]

const CHN_FAMILY = [
  'ワン','リー','チャン','リウ','チェン','ヤン','ホアン','ジャオ','ウー','ジョウ',
  'シュー','スン','マー','ジュ','フー','グオ','ホー','リン','ガオ','ルオ',
  'ジェン','リャン','シエ','タン','ハン','ツァオ','ドン','ダイ','ファン','パン',
  'ジャン','ソン',
]

const CHN_GIVEN = [
  'ハオラン','ユーフェイ','ミンジー','ジェングオ','ウェンフォン','ジーチャン','ボーウェン','チャオ','チェンヤン','ジュンジエ',
  'ジーユエン','ミンフイ','ジュンウェイ','ペンフェイ','ユーチャン','ハオ','ジアミン','レイ','ペン','シャオロン',
  'ユーチン','ジュンホン','ウェンボ','イーファン','ハオユー','ジーハオ','ミンハオ','ルイ','ウェイ','ミン',
  'ジュン','ヨン','シャオフェイ','ティエンユー','ボーハイ','チェンシン',
]

const TWN_FAMILY = [
  'チェン','リン','ホアン','チャン','リー','ワン','ウー','リウ','ツァイ','ヤン',
  'シュー','ジェン','シェ','グオ','ホン','ライ','スー','ルー','パン','チュウ',
  'カオ','フー','ドン','ユー','ペン','ツェン','シャオ','ヤオ','カン','ウェイ',
]

const TWN_GIVEN = [
  'ジャーハオ','ユーシャン','チェンウェイ','チーミン','グァンフイ','ジェンユー','ミンハン','ウェイチェン','シューハオ','カイウェン',
  'ボーシュエン','シンロン','ジュンジェ','チェンハン','ミンダー','ダーウェイ','チュンイー','ヤーティン','ボーウェイ','チーハオ',
  'シェンハン','シェンユエン','カイシャン','ユーチェン','チャオハン','イーシュアン','ジャーウェイ','ミンシュアン','ハオティン','ウェンジェ',
]

// 英語圏（イギリス・アメリカ・オーストラリア・ニュージーランド共通）
const EN_GIVEN = [
  'ライアン','タイラー','ジョーダン','マーカス','キャメロン','タナー','ザック','イライジャ','オーウェン','ネイサン',
  'コール','ブレイク','クリス','カイル','トレイ','マイルス','グレイソン','カラム','トム','ジャック',
  'サム','アレックス','ベン','ジョシュ','マシュー','ブレンダン','リアム','イーサン','ノア','ルーク',
  'ヘンリー','オリバー','ジェイク','ディラン','コナー','ハリソン',
]

const ANGLO_FAMILY = [
  'ミッチェル','ブルックス','ウェブ','ナッシュ','リード','ヘンダーソン','トンプソン','クック','ハリントン','プライス',
  'マクブライド','サンダース','バーンズ','ハリス','フォスター','レイン','ウォード','マクニール','ハロウェイ','クロウ',
  'ウィットフィールド','モーリー','ホートン','ダン','クローリー','クロフォード','ハッチ','クイン','リース','ドナリー',
  'ベイカー','コリンズ','ウォーカー','ライト','ベネット','ハワード','チャップマン','ドイル','マーフィー','グリフィン',
]

const FR_GIVEN = [
  'アントワーヌ','マキシム','ジュール','テオ','ロマン','バティスト','クレマン','ユーゴ','ルイ','ピエール',
  'ニコラ','ギヨーム','トマ','アルチュール','ヴァンサン','ジュリアン','セバスチャン','フロリアン','カンタン','バンジャマン',
  'オレリアン','ダミアン','レミ','マチュー','ガエル','ヤニス','エンゾ','リュカ','シモン','ポール',
]

const FR_FAMILY = [
  'ルフェーブル','ベルトラン','ゴティエ','ラクロワ','ルノー','ラポール','テュルネル','コワル','デュボワ','ルノワール',
  'モロー','フォンテーヌ','ルクレール','ジラール','ペラン','デュラン','ロバン','ブラン','ロシェ','マルシャン',
  'ガルニエ','ルメール','プティ','ロラン','シェヴァリエ','ボワイエ','ペルティエ','デュポン','シャルパンティエ','マルタン',
]

const DE_GIVEN = [
  'ルカス','モリッツ','フェリクス','ジモン','トビアス','ヨナス','ニクラス','フィン','レオン','パウル',
  'マクシミリアン','ヤン','ティム','フローリアン','ダーヴィト','セバスティアン','マルクス','シュテファン','アンドレアス','ミヒャエル',
  'ファビアン','マティアス','ハンネス','ヨハネス','カルステン','ベネディクト','ユリアン','レナート','ティモ','エリアス',
]

const DE_FAMILY = [
  'ブレナー','シュルツェ','ギュンター','ハウザー','クーン','フィッシャー','クラウゼ','ホフマン','ベッカー','シュナイダー',
  'ヴェーバー','ヴァーグナー','ケルナー','ツィンマーマン','ハルトマン','クレーマー','フォークト','ブラウン','ケーニヒ','ローレンツ',
  'ザイデル','リヒター','ノイマン','シュヴァルツ','エンゲル','ブラント','ロート','フランク','ヘルマン','ヴィンター',
]

const IT_GIVEN = [
  'マルコ','ルカ','アンドレア','ジョルジョ','マッテオ','アレッサンドロ','ダヴィデ','フランチェスコ','ロレンツォ','シモーネ',
  'フェデリコ','ジャコモ','リッカルド','ステファノ','パオロ','ジュリオ','ニコロ','ピエトロ','トンマーゾ','ガブリエーレ',
  'サルヴァトーレ','ミケーレ','ダニエーレ','アルベルト','エンリコ','ファビオ','クラウディオ','マッシモ','ジャンルカ','エマヌエーレ',
]

const IT_FAMILY = [
  'フェッラーラ','エスポジト','ロンバルディ','パレルモ','カルーソ','デルーカ','カントーニ','フェラーリ','コッポラ','モレッティ',
  'コロンボ','リナルディ','グレコ','ブルーノ','コンティ','マンチーニ','マリーニ','サントーロ','バルビエリ','ジョルダーノ',
  'デサンティス','パリージ','ヴィターレ','ソレンティーノ','ロマーノ','フィオーレ','ベッリーニ','トスカーノ','ガッリ','ペトルッチ',
]

// スペイン語圏（スペイン・中南米共通）
const ES_GIVEN = [
  'パブロ','ハビエル','アレハンドロ','ルベン','セルヒオ','ダビド','カルロス','ミゲル','ラウル','アドリアン',
  'イバン','ホルヘ','ディエゴ','アルバロ','マルコス','フェルナンド','ゴンサロ','サンティアゴ','ロドリゴ','フアン',
  'ペドロ','アンドレス','イケル','ウナイ','アイトル','オスカル','エクトル','ビセンテ','ラモン','エステバン',
]

const ES_FAMILY = [
  'ムニョス','セラーノ','ビダル','フローレス','モリーナ','バエナ','サラテ','イバラ','ガルシア','フェルナンデス',
  'ロペス','マルティネス','ゴンサレス','ロドリゲス','ペレス','サンチェス','ラミレス','トーレス','カスティージョ','オルテガ',
  'ナバロ','ヒメネス','モレノ','ロメロ','ドミンゲス','ゲレロ','カブレラ','リベラ','キニョネス','ウルタード',
  'メンドサ','バルガス',
]

// オランダ・ベルギー共通
const NL_GIVEN = [
  'ラルス','ダーン','ステイン','ヨリス','バス','ヤスペル','スヴェン','ニールス','フレーク','マールテン',
  'ウィレム','ヘンク','ピート','ヨープ','テイス','ルート','ヨースト','コーエン','イェレ','サンダー',
  'ミヒール','レンス','ヴィム','ヘリット','アリエン','マルセル','エルウィン','トゥーン','ヨルディ','ステフ',
]

const NL_FAMILY = [
  'ファンデンベルフ','フェルメール','ファンデルメール','デヨング','デフリース','バッカー','ヤンセン','フィッセル','スミット','メイエル',
  'ムルダー','デブール','フェルフーフェン','ボス','ペーテルス','ヘンドリクス','デッケル','ブラウエル','ディクストラ','ファンレーウェン',
  'カイパース','ポストマ','ティンメルマンス','ファンドールン','スホルテン','ブリンク','ヴァンダンム','クラーセン','ローゼンダール','ヘールツ',
]

// 北欧（スウェーデン・ノルウェー共通）
const SCAN_GIVEN = [
  'エリック','ヨハン','マグヌス','オラブ','ラーシュ','ミカエル','アンデシュ','グスタフ','フレドリック','ヘンリク',
  'ニルス','ビョルン','シンドレ','エミール','アクセル','イサク','ヨアキム','カスパー','トルビョルン','ハーラル',
  'エイナル','ヴェガール','スティアン','オイヴィン','エスペン','クリステル','ポントゥス','ラスムス','ヤルレ','ハーコン',
]

const SCAN_FAMILY = [
  'ラルセン','ベリ','フォスダール','ヨハンセン','リンドグレン','ニルソン','エリクソン','カールソン','アンデション','ホルム',
  'ルンドクヴィスト','ダール','ハンセン','オルセン','ペデルセン','ソルバッケン','ハウゲン','ストランド','モーエン','リンドベリ',
  'ニーゴール','ベルグストロム','ソールハイム','エングルンド','ヴィークルンド','ノルドストレム','オーケソン','リンドホルム','サンドベリ','ダーレン',
]

// ブラジル（ポルトガル語圏）
const PT_GIVEN = [
  'マテウス','ガブリエル','チアゴ','フェリペ','ラファエル','グスタボ','レアンドロ','ロジェリオ','カイオ','ダニーロ',
  'エヴェルトン','マルセロ','アンドレ','ジョアン','パウロ','ヴィニシウス','エンリケ','ネルソン','オタビオ','ヴァグネル',
  'ジルベルト','セルジオ','ファビアーノ','ミルトン','ワシントン','クレベル','アイルトン','ジエゴ','ブレノ','ルーカス',
]

const PT_FAMILY = [
  'シルバ','フォンセカ','アルヴェス','カルドーゾ','リマ','ドナト','サントス','オリベイラ','ソウザ','ペレイラ',
  'コスタ','ゴメス','リベイロ','カルバーリョ','バルボーザ','モライス','テイシェイラ','フレイタス','ロチャ','ナシメント',
  'モウラ','バティスタ','カンポス','ドゥアルテ','メンドンサ','パチェコ','ヴィエイラ','マチャド','ファリアス','ブランダン',
]

// ── リーグ無し国の姓名（代表プール用）。近隣言語で流用できる国は既存配列を使う ──
const MGL_GIVEN = [
  'バトエルデネ','ガンバータル','ボルド','オトゴンバヤル','テムーレン','ムンフバット','エンフバヤル','ダワースレン','ツェレンドルジ','バヤルサイハン',
  'ガントゥムル','ナランバータル','オユーンボルド','スフバータル','ビャンバスレン','アルタンフヤグ',
]
const MGL_FAMILY = [
  'ボルドバータル','ダムディン','チョイジルスレン','ジャルガル','ドルジ','バザル','ナツァグ','オチル','ツォグト','ムンフ',
  'エルデネ','バト','ガンボルド','セレンゲ','フレルバータル','アマル',
]
const THA_GIVEN = [
  'ソムチャイ','ウィチャイ','アヌチャ','ナロン','プラウィット','サムット','テーラサック','チャイヤポン','ウドム','ピヤポン',
  'スィティチャイ','ナタポン','カンポン','ウィーラポン','タナポン','ソムポン',
]
const THA_FAMILY = [
  'サエンチャイ','ブンヤラタ','ラッタナポン','スワンナプーム','チャローンサック','プロムチャン','インタラウォン','シリチャイ','タウィーサック','ウォンサワン',
  'ジャルーンスック','ナコンサワン','ブンマー','サックダーウォン','カセムスック','ピヤワット',
]
const VIE_GIVEN = [
  'ヴァン','ミン','フン','タン','クアン','ズン','トゥアン','フォン','ロン','ナム',
  'ソン','ヒエウ','チュン','カイン','ヴー','ハイ',
]
const VIE_FAMILY = [
  'グエン','チャン','レー','ファム','ホアン','ファン','ヴォー','ダン','ブイ','ドー',
  'ホー','ゴー','ズオン','リー','チュオン','ダオ',
]
const INA_GIVEN = [
  'アグス','ブディ','デディ','エコ','ファジャル','ハリ','イワン','ジョコ','リョ','プトラ',
  'リザル','スリスティオ','トリ','ワユ','ユディ','バユ',
]
const INA_FAMILY = [
  'ウィボウォ','スサント','プラタマ','ハルタント','クルニアワン','ヌグロホ','サプトラ','ウィジャヤ','ハキム','スティアワン',
  'ラハルジョ','プルノモ','マウラナ','ラマダン','フィルマンシャ','グナワン',
]
const MAS_GIVEN = [
  'アズラン','ファイザル','ハフィズ','イルファン','カイルル','ムハンマド','ナズリ','リドワン','シャフィク','ザイナル',
  'アミルル','ハリス','イズワン','ロスラン','サイフル','ワワン',
]
const MAS_FAMILY = [
  'ビンアフマド','ビンイスマイル','ビンユソフ','ビンオスマン','ビンハッサン','ビンラーマン','ビンアブドラ','ビンザカリア','ビンイブラヒム','ビンムサ',
  'ビンサレー','ビンダウド','ビンラティフ','ビンサマド','ビンハミド','ビンヌール',
]
const IND_GIVEN = [
  'ラジェシュ','アミット','スニル','ヴィカス','アルジュン','ラフル','サンディープ','マノジ','プラディープ','アショク',
  'ヴィジャイ','ディネシュ','ゴビンド','ハリシュ','キラン','ナレシュ',
]
const IND_FAMILY = [
  'シン','クマール','パテル','シャルマ','ヤダフ','レッディ','ラオ','グプタ','ヴァルマ','ナイル',
  'メフタ','チャウハン','ジョシ','デサイ','ピライ','ラトール',
]
const SRI_GIVEN = [
  'ナリン','スニル','チャミンダ','ルワン','カピラ','プラディープ','アジット','ダミス','サマン','ラサンガ',
  'ニルマル','スダット','ジャナカ','ティラク','ウペル','マヒンダ',
]
const SRI_FAMILY = [
  'ペレラ','フェルナンド','シルバ','ジャヤスリヤ','バンダラ','ウィクラマシンハ','ディサナヤカ','ラナシンハ','グナワルダナ','アベイセケラ',
  'ラトナヤカ','ヘラト','ウィジェスーリヤ','クマラ','サマラウィーラ','マドゥシャンカ',
]
const NEP_GIVEN = [
  'ラム','ハリ','ビノド','スレシュ','ディペシュ','プラカシュ','サンジブ','ラジャン','ビカシュ','ゴビンダ',
  'マニシュ','プルナ','ディリップ','ケシャブ','ニルマル','サガル',
]
const NEP_FAMILY = [
  'グルン','タマン','シェルパ','ライ','マガル','タパ','アディカリ','カドカ','バスネット','ポカレル',
  'シュレスタ','ラミチャネ','ラマ','カルキ','ボハラ','ネウパネ',
]
const KAZ_GIVEN = [
  'エルラン','ヌルラン','ダウレト','アルマン','カイラト','セリク','アスハト','ティムール','バウルジャン','ルスラン',
  'ガリム','ムラト','サケン','ダニヤル','アイベク','エルジャン',
]
const KAZ_FAMILY = [
  'ヌルスルタノフ','アビロフ','ジャクシュベコフ','オスパノフ','サドウカソフ','テミルバエフ','ケネソフ','アルタンベコフ','ムサエフ','ベクタノフ',
  'イスカコフ','スルタノフ','オマロフ','セイトカリ','ジュマバエフ','タシュケノフ',
]
const SAUDI_FAMILY = [
  'アルガムディ','アルハルビ','アルシェフリ','アルカフタニ','アルドサリ','アルオタイビ','アルマトラフィ','アルズハラニ','アルシャムラニ','アルバカミ',
  'アルジュハニ','アルアンジ','アルムタイリ','アルラシディ','アルサハリ','アルバルガ',
]
const POL_GIVEN = [
  'ヤクブ','カミル','ミハウ','ピオトル','マルチン','パヴェウ','トマシュ','クシシュトフ','マテウシュ','バルトシュ',
  'ダミアン','グジェゴシュ','ラファウ','シモン','アダム','マレク',
]
const POL_FAMILY = [
  'コヴァルスキ','ノヴァク','ヴィシニェフスキ','ヴイチク','カミンスキ','レヴァンドフスキ','ゼリンスキ','シマンスキ','ヴォイチェホフスキ','カチマレク',
  'マズル','クラフチク','ピオトロフスキ','グラボフスキ','ノヴァコフスキ','パヴロフスキ',
]

const POOL_KEN: ForeignNamePool = { nat: 'KEN', origin: 'ケニア', given: EAST_AFRICAN_GIVEN, family: KEN_FAMILY }
const POOL_UGA: ForeignNamePool = { nat: 'UGA', origin: 'ウガンダ', given: EAST_AFRICAN_GIVEN, family: UGA_FAMILY }
const POOL_TAN: ForeignNamePool = { nat: 'TAN', origin: 'タンザニア', given: SWAHILI_GIVEN, family: TAN_FAMILY }
const POOL_ETH: ForeignNamePool = { nat: 'ETH', origin: 'エチオピア', given: HORN_GIVEN, family: ETH_FAMILY }
const POOL_ERI: ForeignNamePool = { nat: 'ERI', origin: 'エリトリア', given: HORN_GIVEN, family: ERI_FAMILY }
const POOL_MAR: ForeignNamePool = { nat: 'MAR', origin: 'モロッコ', given: ARABIC_GIVEN, family: MAR_FAMILY }
const POOL_SOM: ForeignNamePool = { nat: 'SOM', origin: 'ソマリア', given: SOM_GIVEN, family: SOM_FAMILY }
const POOL_KOR: ForeignNamePool = { nat: 'KOR', origin: '韓国', given: KOR_GIVEN, family: KOR_FAMILY, familyFirst: true }
const POOL_CHN: ForeignNamePool = { nat: 'CHN', origin: '中国', given: CHN_GIVEN, family: CHN_FAMILY, familyFirst: true }
const POOL_TWN: ForeignNamePool = { nat: 'TWN', origin: '台湾', given: TWN_GIVEN, family: TWN_FAMILY, familyFirst: true }
const POOL_GBR: ForeignNamePool = { nat: 'GBR', origin: 'イギリス', given: EN_GIVEN, family: ANGLO_FAMILY }
const POOL_USA: ForeignNamePool = { nat: 'USA', origin: 'アメリカ', given: EN_GIVEN, family: ANGLO_FAMILY }
const POOL_AUS: ForeignNamePool = { nat: 'AUS', origin: 'オーストラリア', given: EN_GIVEN, family: ANGLO_FAMILY }
const POOL_NZL: ForeignNamePool = { nat: 'NZL', origin: 'ニュージーランド', given: EN_GIVEN, family: ANGLO_FAMILY }
const POOL_FRA: ForeignNamePool = { nat: 'FRA', origin: 'フランス', given: FR_GIVEN, family: FR_FAMILY }
const POOL_GER: ForeignNamePool = { nat: 'GER', origin: 'ドイツ', given: DE_GIVEN, family: DE_FAMILY }
const POOL_ITA: ForeignNamePool = { nat: 'ITA', origin: 'イタリア', given: IT_GIVEN, family: IT_FAMILY }
const POOL_ESP: ForeignNamePool = { nat: 'ESP', origin: 'スペイン', given: ES_GIVEN, family: ES_FAMILY }
const POOL_NED: ForeignNamePool = { nat: 'NED', origin: 'オランダ', given: NL_GIVEN, family: NL_FAMILY }
const POOL_BEL: ForeignNamePool = { nat: 'BEL', origin: 'ベルギー', given: NL_GIVEN, family: NL_FAMILY }
const POOL_SWE: ForeignNamePool = { nat: 'SWE', origin: 'スウェーデン', given: SCAN_GIVEN, family: SCAN_FAMILY }
const POOL_NOR: ForeignNamePool = { nat: 'NOR', origin: 'ノルウェー', given: SCAN_GIVEN, family: SCAN_FAMILY }
const POOL_BRA: ForeignNamePool = { nat: 'BRA', origin: 'ブラジル', given: PT_GIVEN, family: PT_FAMILY }
const POOL_COL: ForeignNamePool = { nat: 'COL', origin: 'コロンビア', given: ES_GIVEN, family: ES_FAMILY }
const POOL_ECU: ForeignNamePool = { nat: 'ECU', origin: 'エクアドル', given: ES_GIVEN, family: ES_FAMILY }
const POOL_ARG: ForeignNamePool = { nat: 'ARG', origin: 'アルゼンチン', given: ES_GIVEN, family: ES_FAMILY }
const POOL_CHI: ForeignNamePool = { nat: 'CHI', origin: 'チリ', given: ES_GIVEN, family: ES_FAMILY }
const POOL_PER: ForeignNamePool = { nat: 'PER', origin: 'ペルー', given: ES_GIVEN, family: ES_FAMILY }
const POOL_URU: ForeignNamePool = { nat: 'URU', origin: 'ウルグアイ', given: ES_GIVEN, family: ES_FAMILY }
const POOL_VEN: ForeignNamePool = { nat: 'VEN', origin: 'ベネズエラ', given: ES_GIVEN, family: ES_FAMILY }
const POOL_POR: ForeignNamePool = { nat: 'POR', origin: 'ポルトガル', given: PT_GIVEN, family: PT_FAMILY }
const POOL_AUT: ForeignNamePool = { nat: 'AUT', origin: 'オーストリア', given: DE_GIVEN, family: DE_FAMILY }
const POOL_DEN: ForeignNamePool = { nat: 'DEN', origin: 'デンマーク', given: SCAN_GIVEN, family: SCAN_FAMILY }
// 新設アジア／中東リーグ・既存リーグ追加国のクラブ用
const POOL_MGL: ForeignNamePool = { nat: 'MGL', origin: 'モンゴル',       given: MGL_GIVEN, family: MGL_FAMILY, familyFirst: true }
const POOL_HKG: ForeignNamePool = { nat: 'HKG', origin: '香港',           given: CHN_GIVEN, family: CHN_FAMILY, familyFirst: true }
const POOL_THA: ForeignNamePool = { nat: 'THA', origin: 'タイ',           given: THA_GIVEN, family: THA_FAMILY }
const POOL_VIE: ForeignNamePool = { nat: 'VIE', origin: 'ベトナム',       given: VIE_GIVEN, family: VIE_FAMILY, familyFirst: true }
const POOL_INA: ForeignNamePool = { nat: 'INA', origin: 'インドネシア',   given: INA_GIVEN, family: INA_FAMILY }
const POOL_MAS: ForeignNamePool = { nat: 'MAS', origin: 'マレーシア',     given: MAS_GIVEN, family: MAS_FAMILY }
const POOL_PHI: ForeignNamePool = { nat: 'PHI', origin: 'フィリピン',     given: ES_GIVEN,  family: ES_FAMILY }
const POOL_SGP: ForeignNamePool = { nat: 'SGP', origin: 'シンガポール',   given: CHN_GIVEN, family: CHN_FAMILY, familyFirst: true }
const POOL_IND: ForeignNamePool = { nat: 'IND', origin: 'インド',         given: IND_GIVEN, family: IND_FAMILY }
const POOL_SRI: ForeignNamePool = { nat: 'SRI', origin: 'スリランカ',     given: SRI_GIVEN, family: SRI_FAMILY }
const POOL_NEP: ForeignNamePool = { nat: 'NEP', origin: 'ネパール',       given: NEP_GIVEN, family: NEP_FAMILY }
const POOL_KAZ: ForeignNamePool = { nat: 'KAZ', origin: 'カザフスタン',   given: KAZ_GIVEN, family: KAZ_FAMILY }
const POOL_KSA: ForeignNamePool = { nat: 'KSA', origin: 'サウジアラビア', given: ARABIC_GIVEN, family: SAUDI_FAMILY }
const POOL_BRN: ForeignNamePool = { nat: 'BRN', origin: 'バーレーン',     given: EAST_AFRICAN_GIVEN, family: KEN_FAMILY }
const POOL_QAT: ForeignNamePool = { nat: 'QAT', origin: 'カタール',       given: HORN_GIVEN, family: ETH_FAMILY }
const POOL_RSA: ForeignNamePool = { nat: 'RSA', origin: '南アフリカ',     given: EN_GIVEN,  family: ANGLO_FAMILY }
const POOL_CAN: ForeignNamePool = { nat: 'CAN', origin: 'カナダ',         given: EN_GIVEN,  family: ANGLO_FAMILY }
const POOL_MEX: ForeignNamePool = { nat: 'MEX', origin: 'メキシコ',       given: ES_GIVEN,  family: ES_FAMILY }
// 60か国化で追加（アフリカ／ヨーロッパ／アメリカ大陸を各16へ）
const POOL_RWA: ForeignNamePool = { nat: 'RWA', origin: 'ルワンダ',       given: EAST_AFRICAN_GIVEN, family: KEN_FAMILY }
const POOL_BDI: ForeignNamePool = { nat: 'BDI', origin: 'ブルンジ',       given: EAST_AFRICAN_GIVEN, family: UGA_FAMILY }
const POOL_ALG: ForeignNamePool = { nat: 'ALG', origin: 'アルジェリア',   given: ARABIC_GIVEN, family: MAR_FAMILY }
const POOL_DJI: ForeignNamePool = { nat: 'DJI', origin: 'ジブチ',         given: HORN_GIVEN, family: SOM_FAMILY }
const POOL_SDN: ForeignNamePool = { nat: 'SDN', origin: 'スーダン',       given: ARABIC_GIVEN, family: SAUDI_FAMILY }
const POOL_TUN: ForeignNamePool = { nat: 'TUN', origin: 'チュニジア',     given: ARABIC_GIVEN, family: MAR_FAMILY }
const POOL_ZIM: ForeignNamePool = { nat: 'ZIM', origin: 'ジンバブエ',     given: EN_GIVEN,  family: ANGLO_FAMILY }
const POOL_NGA: ForeignNamePool = { nat: 'NGA', origin: 'ナイジェリア',   given: EN_GIVEN,  family: ANGLO_FAMILY }
const POOL_SUI: ForeignNamePool = { nat: 'SUI', origin: 'スイス',         given: DE_GIVEN,  family: DE_FAMILY }
const POOL_POL: ForeignNamePool = { nat: 'POL', origin: 'ポーランド',     given: POL_GIVEN, family: POL_FAMILY }
const POOL_IRL: ForeignNamePool = { nat: 'IRL', origin: 'アイルランド',   given: EN_GIVEN,  family: ANGLO_FAMILY }
const POOL_FIN: ForeignNamePool = { nat: 'FIN', origin: 'フィンランド',   given: SCAN_GIVEN, family: SCAN_FAMILY }
const POOL_GUA: ForeignNamePool = { nat: 'GUA', origin: 'グアテマラ',     given: ES_GIVEN,  family: ES_FAMILY }
const POOL_BOL: ForeignNamePool = { nat: 'BOL', origin: 'ボリビア',       given: ES_GIVEN,  family: ES_FAMILY }
const POOL_CRC: ForeignNamePool = { nat: 'CRC', origin: 'コスタリカ',     given: ES_GIVEN,  family: ES_FAMILY }
const POOL_CUB: ForeignNamePool = { nat: 'CUB', origin: 'キューバ',       given: ES_GIVEN,  family: ES_FAMILY }
const POOL_JAM: ForeignNamePool = { nat: 'JAM', origin: 'ジャマイカ',     given: EN_GIVEN,  family: ANGLO_FAMILY }

// 重みに応じてプールを展開する（重みが大きい国ほど選ばれやすい）
function weightedPools(entries: [ForeignNamePool, number][]): ForeignNamePool[] {
  return entries.flatMap(([pool, weight]) => Array.from({ length: weight }, () => pool))
}

// JPEL（ドラフト・CPU）用: 従来の国籍出現比率をおおむね維持した重み付きプール
const JPEL_FOREIGN_POOLS: ForeignNamePool[] = weightedPools([
  [POOL_KEN, 21], [POOL_ETH, 16], [POOL_UGA, 5], [POOL_TAN, 4],
  [POOL_MAR, 5], [POOL_ERI, 3], [POOL_SOM, 2],
  [POOL_KOR, 10], [POOL_CHN, 10],
  [POOL_FRA, 5], [POOL_GER, 4], [POOL_ITA, 4], [POOL_ESP, 4], [POOL_GBR, 4],
  [POOL_NED, 2], [POOL_BEL, 1], [POOL_BRA, 4], [POOL_USA, 4],
])

// 海外リーグ用: クラブの国籍(club.country)ごとの名前プール。
// クラブ国籍を実国籍化したので、各国コードに対応する専用プールを引く。
// キーが無い国は下の EUR にフォールバックする（安全弁）。
const FOREIGN_LEAGUE_POOLS: Record<string, ForeignNamePool[]> = {
  // アジア
  KOR: [POOL_KOR],
  CHN: [POOL_CHN],
  TWN: [POOL_TWN],
  // アフリカ
  ETH: weightedPools([[POOL_ETH, 4], [POOL_ERI, 1]]),
  KEN: [POOL_KEN],
  UGA: [POOL_UGA],
  TAN: [POOL_TAN],
  // ヨーロッパ（各国クラブ＝その国の名前）
  GBR: [POOL_GBR],
  GER: [POOL_GER],
  FRA: [POOL_FRA],
  ITA: [POOL_ITA],
  ESP: [POOL_ESP],
  NED: [POOL_NED],
  SWE: [POOL_SWE],
  POR: [POOL_POR],
  AUT: [POOL_AUT],
  DEN: [POOL_DEN],
  // 北米
  USA: [POOL_USA],
  // オセアニア
  AUS: [POOL_AUS],
  NZL: [POOL_NZL],
  // 南米
  BRA: [POOL_BRA],
  COL: [POOL_COL],
  ECU: [POOL_ECU],
  PER: [POOL_PER],
  ARG: [POOL_ARG],
  CHI: [POOL_CHI],
  URU: [POOL_URU],
  VEN: [POOL_VEN],
  // 新設アジア／中東リーグ
  HKG: [POOL_HKG],
  MGL: [POOL_MGL],
  THA: [POOL_THA],
  VIE: [POOL_VIE],
  INA: [POOL_INA],
  MAS: [POOL_MAS],
  PHI: [POOL_PHI],
  SGP: [POOL_SGP],
  IND: [POOL_IND],
  SRI: [POOL_SRI],
  NEP: [POOL_NEP],
  KAZ: [POOL_KAZ],
  BRN: [POOL_BRN],
  QAT: [POOL_QAT],
  KSA: [POOL_KSA],
  // 既存リーグへ追加した国
  MAR: [POOL_MAR],
  ERI: [POOL_ERI],
  RSA: [POOL_RSA],
  CAN: [POOL_CAN],
  MEX: [POOL_MEX],
  // 60か国化で追加
  RWA: [POOL_RWA],
  BDI: [POOL_BDI],
  ALG: [POOL_ALG],
  DJI: [POOL_DJI],
  SOM: [POOL_SOM],
  SDN: [POOL_SDN],
  TUN: [POOL_TUN],
  ZIM: [POOL_ZIM],
  NGA: [POOL_NGA],
  NOR: [POOL_NOR],
  BEL: [POOL_BEL],
  SUI: [POOL_SUI],
  POL: [POOL_POL],
  IRL: [POOL_IRL],
  FIN: [POOL_FIN],
  GUA: [POOL_GUA],
  BOL: [POOL_BOL],
  CRC: [POOL_CRC],
  CUB: [POOL_CUB],
  JAM: [POOL_JAM],
  // フォールバック（万一キーの無い国コードが来たとき用の安全弁）
  _default: weightedPools([
    [POOL_GBR, 6], [POOL_FRA, 5], [POOL_GER, 5], [POOL_ITA, 5], [POOL_ESP, 4],
    [POOL_NED, 2], [POOL_SWE, 2], [POOL_NOR, 2], [POOL_AUS, 3], [POOL_NZL, 2],
  ]),
}

// プールから姓と名を1つずつ選んで名前を組み立てる
function pickForeignName(pool: ForeignNamePool): { name: string; origin: string; nat: Nationality } {
  const given = pool.given[rng(0, pool.given.length - 1)]
  const family = pool.family[rng(0, pool.family.length - 1)]
  return {
    name: pool.familyFirst ? `${family}・${given}` : `${given}・${family}`,
    origin: pool.origin,
    nat: pool.nat,
  }
}

// JPEL用の外国人名を生成する。usedNames と重複したらリトライする
export function generateJpelForeignName(usedNames: Set<string>): { name: string; origin: string; nat: Nationality } {
  const pool = JPEL_FOREIGN_POOLS[rng(0, JPEL_FOREIGN_POOLS.length - 1)]
  let picked = pickForeignName(pool)
  let attempts = 0
  while (usedNames.has(picked.name) && attempts < 60) {
    picked = pickForeignName(pool)
    attempts++
  }
  usedNames.add(picked.name)
  return picked
}

export function nationalityToForeignCategory(nat: Nationality): ForeignCategory {
  return natCategory(nat)
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

// 指名される上位40人(2巡×20)が全員A以上になるよう、A+を46人用意する。
// 残り(B/C/D)は指名漏れ＝FAに回る（＝下位でも使い物にならない選手を指名しなくて済む）。
const DRAFT_RANK_POOL: Rank[] = [
  'SSS', 'SSS',
  'SS', 'SS', 'SS', 'SS', 'SS', 'SS',
  'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S',
  'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A',
  'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B',
  'C', 'C', 'C', 'C', 'C', 'C',
  'D', 'D', 'D', 'D',
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

// avoidNames: 現役・既存選手の名前集合。渡すと同姓同名の再生成を避ける（年をまたいだ重複対策）
export function generateDraftPool(year: number, avoidNames?: Set<string>): Player[] {
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
    // 外国人は出身国の実国籍をそのまま持たせる（日本人は JPN）
    let nationality: Nationality = 'JPN'

    if (isForeign) {
      const fn = generateJpelForeignName(usedNames)
      name = fn.name
      origin = fn.origin
      nationality = fn.nat
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
      } while ((usedNames.has(name) || avoidNames?.has(name)) && attempts < 120)
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
      // 稀に「お化け」隠れ玉：ランクに関わらず高ポテンシャル。現在値は低いままなので下位指名でも化ける。
      // 日本人は総合90前後を上限にしつつ、選手ごとにばらつかせる（全員90一律を避ける＝得意は99も、苦手は低く）。
      potential: isForeign
        ? rng(potential[0], potential[1])
        : (Math.random() < 0.08 ? rng(86, 93) : Math.min(92, rng(potential[0], potential[1]))),
      growthCurve,
      teamId: '__pool__',
      rosterTier: 'main',
      contract: {
        yearsLeft: 4,
        annualSalary: calculateRookieSalary(rank),
        faEligibleYear: year + 7,
      },
      nationality,
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

  // 生成時点で予想指名順位を焼き込む（能力＋将来性の全候補内順位）。
  // ドラフト中に候補が減っても動かないよう、ここで確定してPlayerに保存する。
  const draftVal = (p: Player) => {
    const r = p.ratings
    const o = (r.speed + r.stamina + r.mountainUp + r.mountainDown + r.pacing + r.mental + r.recovery) / 7
    return o + (p.potential ?? 0) * 0.5
  }
  ;[...players].sort((a, b) => draftVal(b) - draftVal(a)).forEach((p, i) => { p.predictedPick = i + 1 })

  return players
}

// 年俸配分：予算合計をスター偏重の傾斜で人数分に配る（上位ほど高額・下限あり・合計は予算内）
function distributeSalaries(total: number, count: number, minSalary: number): number[] {
  const weights = Array.from({ length: count }, (_, i) => Math.pow(count - i, 1.6))
  const wsum = weights.reduce((s, w) => s + w, 0)
  const raw = weights.map(w => total * w / wsum)
  // 下限で底上げした分は、上位の「下限を超える部分」を比例圧縮して合計を維持する
  const fixed = raw.map(v => Math.max(minSalary, v))
  const over = fixed.reduce((s, v) => s + Math.max(0, v - minSalary), 0)
  const deficit = fixed.reduce((s, v) => s + v, 0) - total
  const shrink = over > 0 ? Math.max(0, 1 - deficit / over) : 1
  return fixed.map(v => Math.round((minSalary + Math.max(0, v - minSalary) * shrink) / 500_000) * 500_000)
}

// 年俸から選手ランクを決める（calculateRookieSalaryの帯の中間を境界にする）
function rankForSalary(s: number): Rank {
  if (s >= 36_000_000) return 'SSS'
  if (s >= 28_000_000) return 'SS'
  if (s >= 20_000_000) return 'S'
  if (s >= 14_000_000) return 'A'
  if (s >= 10_000_000) return 'B'
  if (s >= 7_000_000) return 'C'
  return 'D'
}

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

  function makePlayer(
    baseRank: Rank, i: number, teamId: string, tier: 'main' | 'second',
    isForeign: boolean, contractType: 'standard' | 'development' | 'dual' = tier === 'main' ? 'standard' : 'development',
    salary?: number,
  ): Player {
    cpuIdCounter++
    const rank: Rank = baseRank
    const specialty = specialties[rng(0, specialties.length - 1)]
    const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
    const ratings = generateRatings(rank, specialty)
    const { potential } = rankToBaseRange(rank, growthCurve)
    // 年俸上位4人（各チームのエース格）はピーク年齢寄りにして、初年度から完成した選手にする
    const age = tier === 'main' ? (i < 4 ? rng(25, 31) : rng(22, 31)) : rng(19, 25)
    const yearsPro = Math.max(0, age - 22)
    const potentialVal = isForeign ? rng(potential[0], potential[1]) : Math.min(92, rng(potential[0], potential[1]))

    const id = `ai${tier === 'second' ? '2' : ''}-${teamId}-${cpuIdCounter}`
    // 年齢分の成長を焼き込む（海外リーグ生成と同じ処理）。
    // 初年度のリーグが定常状態（毎年の成長・衰え・世代交代が回った後）と同じ厚みで始まるようにする
    bakeAgeGrowth(id, ratings, specialty, growthCurve, potentialVal, age)

    let name: string
    let origin: string
    let nationality: Nationality

    if (isForeign) {
      const fn = generateJpelForeignName(usedNames)
      name = fn.name; origin = fn.origin; nationality = fn.nat
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

    void contractType   // 契約形態は廃止（フラット化）。tier は年齢分布のためだけに使う
    void salary         // 予算配分(distributeSalaries)はランク＝強さの割り当てにだけ使う。年俸は下で相場から出す
    const made: Player = {
      id, name, nameKana: '', age, yearsPro,
      draftYear: year - yearsPro, draftRound: null, draftPick: null,
      ratings, specialty,
      potential: potentialVal,
      growthCurve,
      teamId, rosterTier: 'main',
      contract: {
        yearsLeft: rng(2, 4),
        annualSalary: 0,
        faEligibleYear: year + rng(2, 4),
        contractType: 'standard',
      },
      nationality, origin,
      status: 'active', fatigue: 0, morale: rng(65, 85), form: 0,
      career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
      traits: assignTraits(rank, specialty, age),
      personality: (['salary', 'salary', 'winning', 'winning', 'loyalty'] as const)[rng(0, 4)],
    }
    // 年俸は国内・海外・契約更新すべて共通の相場式で決める（faMarketSalary）。
    // 旧仕様はチーム予算の分配額をそのまま年俸にしていたため、同じOVRでもチームや
    // 国内/海外で額が食い違っていた（海外は最高8650万・国内は最高3550万）。
    made.contract.annualSalary = faMarketSalary(made)
    return made
  }

  for (const team of teams) {
    // グラント（initialRank連動の初期予算）の8割を28人の年俸に充てる。
    // 初期28人＋初回ドラフト2人でロスター上限30ちょうどになる。
    // 年俸から選手の強さを決めるので、予算の大きいチームほど強い選手が揃う。
    const grant = rankBudgetGrant(team.initialRank ?? 10)
    const salaries = distributeSalaries(Math.round(grant * 0.8), 28, 4_000_000)

    const mainIds: string[] = []   // 本契約(standard) 12
    const dualIds: string[] = []   // 2WAY(dual) 3（1軍/2軍共通）
    const secondIds: string[] = [] // 育成(development) 13

    // 本契約(standard) 12人 — 年俸上位から。外国人は2人まで
    // 主力はランクを一段引き上げる：初年度のリーグが定常状態（強豪で80超7〜8人・リーグ85+約18人）
    // と同じ厚みで始まるようにするため（土台が低いと成長焼き込みでも85に届かない）
    const RANK_UP: Record<Rank, Rank> = { D: 'C', C: 'B', B: 'A', A: 'S', S: 'SS', SS: 'SSS', SSS: 'SSS' }
    let teamForeignCount = 0
    for (let i = 0; i < 12; i++) {
      const sal = salaries[i]
      const canBeForeign = teamForeignCount < 2
      const isForeign = canBeForeign && (i < 1 ? Math.random() < 0.55 : Math.random() < 0.08)
      if (isForeign) teamForeignCount++
      const p = makePlayer(RANK_UP[rankForSalary(sal)], i, team.id, 'main', isForeign, 'standard', sal)
      cpuPlayers.push(p); mainIds.push(p.id)
    }
    // 2WAY(dual) 3人 — 1軍側で保持し2軍にも登録（国内）。控えも一段引き上げてプロ水準に
    for (let i = 0; i < 3; i++) {
      const sal = salaries[12 + i]
      const p = makePlayer(RANK_UP[rankForSalary(sal)], 12 + i, team.id, 'main', false, 'dual', sal)
      cpuPlayers.push(p); dualIds.push(p.id)
    }
    // 育成(development) 13人（国内・年俸下位）。最低ランクだと50前後に密集するので一段引き上げる
    for (let i = 0; i < 13; i++) {
      const sal = salaries[15 + i]
      const p = makePlayer(RANK_UP[rankForSalary(sal)], i, team.id, 'second', false, 'development', sal)
      cpuPlayers.push(p); secondIds.push(p.id)
    }

    // フラット化：全員を単一ロスター(main)へ。2軍は使わない
    teamRosters[team.id] = { main: [...mainIds, ...dualIds, ...secondIds], second: [] }
  }

  return { cpuPlayers, teamRosters }
}

// プレイヤーチームの初期28人生成（20位相当・最弱スタート固定）
// 本契約12 + 2WAY3 + 育成13 = 28人（＋初回ドラフト2でロスター上限30ちょうど）、目標年俸合計約2.8億
export function generatePlayerInitialRoster(year: number): {
  players: Player[]
  mainIds: string[]
  dualIds: string[]
  secondIds: string[]
} {
  const MAIN_POOL: Rank[]   = ['A', 'B','B','B','B','B','B','B','B', 'C','C','C']   // 12人
  const DUAL_POOL: Rank[]   = ['B', 'C', 'C']                                        // 3人
  const SECOND_POOL: Rank[] = ['C','C','C','C','C','C','C', 'D','D','D','D','D','D'] // 13人

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
      potential: Math.min(92, rng(potential[0], potential[1])),
      growthCurve,
      teamId: '', rosterTier: 'main',
      contract: {
        yearsLeft: rng(2, 4),
        annualSalary: calculateRookieSalary(rank),
        faEligibleYear: year + rng(2, 5),
        contractType: 'standard',
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

  // フラット化：全員を単一ロスター(main)へ返す（2軍・2wayは使わない）
  return { players, mainIds: [...mainIds, ...dualIds, ...secondIds], dualIds: [], secondIds: [] }
}

// CPUチームの2軍を補充するための若手選手を生成する（teamId付き）。

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

// 海外選手のID採番。カウンタはメモリ上の値なのでアプリ再起動でリセットされる。
// そのままだと再起動後の生成で既存セーブ内のIDと衝突するため、IDには年とランダム接尾辞を含めて一意性を保証する。
let foreignIdCounter = 9000

// 年1回、海外クラブに動きをつける：引退等（removedIds）を外し、若手を1〜2人ずつ新加入。
export function refreshForeignLeagues(
  leagues: ForeignLeague[],
  removedIds: Set<string>,
  year: number,
): { newPlayers: Player[]; updatedLeagues: ForeignLeague[] } {
  // 補充は伸びしろ持ちの若手(19〜22)だけ。数年かけてそのティアのエースに育つ。
  const fresh = generateForeignLeaguePlayers(leagues, year, [19, 22])
  const byId = new Map(fresh.players.map(p => [p.id, p]))
  const newPlayers: Player[] = []
  const updatedLeagues = leagues.map(l => {
    const freshL = fresh.updatedLeagues.find(fl => fl.id === l.id)
    return {
      ...l,
      clubs: l.clubs.map(club => {
        const kept = club.playerIds.filter(id => !removedIds.has(id))
        const freshClub = freshL?.clubs.find(fc => fc.id === club.id)
        // 新人補充の目標は26人まで（上限30に空き枠を残す）。全クラブを毎年30人に
        // 埋めてしまうと買い手枠が消えて海外間の移籍市場が動かなくなる。
        // 上の空きは移籍・引き抜きで埋まり、クラブごとに人数の個性が出る
        const addN = Math.min(3, Math.max(0, 26 - kept.length))
        const adds = (freshClub?.playerIds ?? []).slice(0, addN)
        for (const id of adds) { const p = byId.get(id); if (p) newPlayers.push({ ...p, joinedYear: year }) }
        return { ...club, playerIds: [...kept, ...adds] }
      }),
    }
  })
  return { newPlayers, updatedLeagues }
}

// 生成時に「年齢分の成長」を焼き込む（gameStoreのgrowPlayer年次成長と同じ式・同じレート）。
// 海外選手は再生成のたび素体OVRで生まれるため、毎年成長している国内選手に対して
// 年々見劣りしていく問題の修正。ピーク年齢までの経過年数ぶんだけポテンシャルへ近づける。
function bakeAgeGrowth(id: string, ratings: Player['ratings'], specialty: Specialty, growthCurve: GrowthCurve, potential: number, age: number): void {
  const peakAge = growthCurve === 'early' ? 24 : growthCurve === 'normal' ? 27 : 30
  const years = Math.max(0, Math.min(age, peakAge + 1) - 22)
  if (years === 0) return
  const caps = getStatPotentials({ id, ratings, specialty, potential } as unknown as Player)
  // 毎年の成長(growPlayer)と同じ係数に揃える（ズレると初年度と定常状態で層の厚みが変わる）
  // 若手成長の底上げに合わせて中・低ポテンシャルを強化し、成長窓もピーク+1年に延長（growPlayerと同一）
  const potFactor = potential >= 87 ? 1.8 : potential >= 75 ? 1.3 : 0.85
  const keys = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery'] as const
  for (let y = 0; y < years; y++) {
    for (const stat of keys) {
      const cur = ratings[stat]
      const cap = (caps as Record<string, number>)[stat]
      if (cur >= cap) continue
      // 高ポテンシャルの年長者がちゃんと90-99近くまで育つよう、高数値域の伸びを強めに。
      const diff = cur >= 90 ? 0.5 : cur >= 82 ? 0.8 : cur >= 72 ? 1.0 : 1.2
      const gain = Math.round(rng(0, 2) * potFactor * diff)
      if (gain > 0) ratings[stat] = Math.min(cap, cur + gain)
    }
  }
}

export function generateForeignLeaguePlayers(
  leagues: ForeignLeague[],
  year: number,
  // 年齢範囲。初期ロスターは完成したチームに見せるため22〜30の分布。
  // 毎年の補充(refreshForeignLeagues)は伸びしろ持ちの若手だけを入れるので[19,22]を渡す。
  ageRange: [number, number] = [22, 30],
): { players: Player[]; updatedLeagues: ForeignLeague[] } {
  const players: Player[] = []
  const specialties: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const growthCurves: GrowthCurve[] = ['early', 'normal', 'normal', 'late_bloomer']

  // 地域別の強さ。budget=年俸分配(ランク分布)、potBonus=ポテンシャルの底上げ。
  // 現在値をいきなり90-99にはしない。若手を高ポテンシャルで生成し、bakeAgeGrowth（年長者）＋
  // 毎年の成長（若手）で90-99へ育つ。強さ順：アフリカ ＞ 欧州/欧米 ＞ その他 ＞ アジア(=日本と同等)。
  // minRank=そのリーグの最低ランク。海外クラブは格上なので、ベンチでもこのランク以上にする
  // （下位が D=52 みたいにならないように）。強い地域ほど底も高い。
  // minRank=ベンチの底、maxRank/potCap=主力の天井。天井は地域で差をつけ、90台に届くのはアフリカ勢(帰化の
  // バーレーン/カタール含む)だけ。欧州/米/豪は80台後半、その他・アジアは80台前半で頭打ち（日本は国内生成なので無関係）。
  const REGION: Record<string, { budget: number; potBonus: number; minRank: Rank; maxRank: Rank; potCap: number }> = {
    // ELITE=4大リーグ（北米/アフリカ東/アフリカ北南/欧州西南）。所属選手はすごい＝天井99・底も高い。
    // 2046調整: アジア予選が日本の一方的な無双になっていたため、ASIA/OTHERの天井と底を引き上げ
    // （日本の国内生成トップ層≒90前後と渡り合えるレンジに。バーレーン/カタールはAFRICA帰化枠のまま）
    ELITE:   { budget: 980_000_000, potBonus: 13, minRank: 'S', maxRank: 'SSS', potCap: 99 },
    AFRICA:  { budget: 900_000_000, potBonus: 10, minRank: 'A', maxRank: 'SSS', potCap: 96 },
    EUR_USA: { budget: 820_000_000, potBonus: 5,  minRank: 'A', maxRank: 'SS',  potCap: 89 },
    OTHER:   { budget: 780_000_000, potBonus: 5,  minRank: 'A', maxRank: 'S',   potCap: 87 },
    ASIA:    { budget: 780_000_000, potBonus: 7,  minRank: 'A', maxRank: 'SS',  potCap: 90 },
  }
  // 4大リーグのID（ここ所属＝エリート強度）
  const ELITE_LEAGUES = new Set(['africa_east', 'africa_ns', 'europe_ws', 'north_america'])
  function strengthFor(leagueId: string, country: string) {
    if (ELITE_LEAGUES.has(leagueId)) return REGION.ELITE
    return REGION[natStrengthRegion(country as Nationality)] ?? REGION.OTHER
  }
  const RANK_ORDER: Rank[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']
  const clampRank = (r: Rank, min: Rank, max: Rank): Rank => {
    const i = Math.max(RANK_ORDER.indexOf(min), Math.min(RANK_ORDER.indexOf(max), RANK_ORDER.indexOf(r)))
    return RANK_ORDER[i]
  }

  const updatedLeagues = leagues.map(league => ({
    ...league,
    clubs: league.clubs.map(club => {
      const clubPlayerIds: string[] = []
      const region = strengthFor(league.id, club.country)
      // シャッフルするのは refreshForeignLeagues が先頭数人を新加入として拾うため（常にスターだけ入るのを防ぐ）
      const salaries = distributeSalaries(Math.round(region.budget * 0.8), 22, 4_000_000).sort(() => Math.random() - 0.5)
      const namePools = FOREIGN_LEAGUE_POOLS[club.country as string] ?? FOREIGN_LEAGUE_POOLS._default
      const clubUsedNames = new Set<string>()

      salaries.forEach((clubSalary) => {
        // 海外クラブは格上なので、ベンチでも地域の最低ランク以上にする（下位が52みたいにならない）。
        // 上限ランクで主力の天井も抑える（弱い地域が90を出さない）。
        const rank = clampRank(rankForSalary(clubSalary), region.minRank, region.maxRank)
        foreignIdCounter++
        const specialty = specialties[rng(0, specialties.length - 1)]
        const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
        const ratings = generateRatings(rank, specialty)
        const { potential } = rankToBaseRange(rank, growthCurve)
        const age = rng(ageRange[0], ageRange[1])
        const nat: Nationality = club.country
        const foreignCat = nationalityToForeignCategory(nat)

        // クラブ内で同名が出ないよう組み合わせをリトライする
        const pool = namePools[rng(0, namePools.length - 1)]
        let nameEntry = pickForeignName(pool)
        let nameAttempts = 0
        while (clubUsedNames.has(nameEntry.name) && nameAttempts < 60) {
          nameEntry = pickForeignName(pool)
          nameAttempts++
        }
        clubUsedNames.add(nameEntry.name)

        const id = `fp-${club.id}-${year}-${foreignIdCounter}-${Math.random().toString(36).slice(2, 7)}`
        clubPlayerIds.push(id)

        // 地域でポテンシャルを底上げ（若手は高ポテンシャルで生成 → 成長で伸びる）。現在値はいきなり上げない。
        // potCap で地域ごとの実効OVR天井を決める（bakeAgeGrowth の焼き込み上限）。
        const potentialVal = Math.min(region.potCap, rng(potential[0], potential[1]) + region.potBonus)
        // 年齢分の成長を焼き込む（年長者は既にポテンシャル近くまで育っている）
        bakeAgeGrowth(id, ratings, specialty, growthCurve, potentialVal, age)

        const madeF: Player = {
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
          potential: potentialVal,
          growthCurve,
          teamId: club.id,
          rosterTier: 'main',
          contract: {
            yearsLeft: rng(1, 3),
            annualSalary: 0,
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
        }
        // 年俸は国内リーグと完全に同じ相場式で決める（クラブ予算 clubSalary はランク＝強さの割り当て専用）。
        // 「海外と日本で同じ選手の額が違うのはおかしい」への対応：物差しは1本、違うのはレースだけ。
        madeF.contract.annualSalary = faMarketSalary(madeF)
        players.push(madeF)
      })

      return { ...club, playerIds: clubPlayerIds }
    }),
  }))

  return { players, updatedLeagues }
}
