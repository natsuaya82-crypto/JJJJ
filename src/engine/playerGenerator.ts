import type { Player, Specialty, GrowthCurve, Nationality, ForeignCategory, ForeignLeague } from '../types'
import type { TraitId } from '../utils/traitUtils'
import { rankBudgetGrant } from '../data/economy'

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

const SEN_GIVEN = [
  'ママドゥ','アブドゥライ','シェイク','ウスマン','イブラヒマ','アリウン','パパ','モクター','バブカル','サンバ',
  'ダウダ','マリック','アマドゥ','ラミン','オマール','ドゥドゥ','エルハッジ','アダマ','ブバカル','チェルノ',
  'サリウ','イスマイラ','マンスール','セリーニュ','イドリサ','バイ','モドゥ','セクー','ファロウ','パスカル',
]

const SEN_FAMILY = [
  'ディアロ','ンジャイ','シセ','ンドゥール','ディオップ','フォール','サール','ゲイェ','ムベンゲ','ソウ',
  'バ','カマラ','ケイタ','トゥーレ','マンガ','ティアム','ニアン','ワデ','セック','ダボ',
  'バルデ','シラ','コナテ','ジェング','サニェ','サコ','クリバリ','ドラメ','バジ','マネ',
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

const POOL_KEN: ForeignNamePool = { origin: 'ケニア', given: EAST_AFRICAN_GIVEN, family: KEN_FAMILY }
const POOL_UGA: ForeignNamePool = { origin: 'ウガンダ', given: EAST_AFRICAN_GIVEN, family: UGA_FAMILY }
const POOL_TAN: ForeignNamePool = { origin: 'タンザニア', given: SWAHILI_GIVEN, family: TAN_FAMILY }
const POOL_ETH: ForeignNamePool = { origin: 'エチオピア', given: HORN_GIVEN, family: ETH_FAMILY }
const POOL_ERI: ForeignNamePool = { origin: 'エリトリア', given: HORN_GIVEN, family: ERI_FAMILY }
const POOL_MAR: ForeignNamePool = { origin: 'モロッコ', given: ARABIC_GIVEN, family: MAR_FAMILY }
const POOL_SEN: ForeignNamePool = { origin: 'セネガル', given: SEN_GIVEN, family: SEN_FAMILY }
const POOL_SOM: ForeignNamePool = { origin: 'ソマリア', given: SOM_GIVEN, family: SOM_FAMILY }
const POOL_KOR: ForeignNamePool = { origin: '韓国', given: KOR_GIVEN, family: KOR_FAMILY, familyFirst: true }
const POOL_CHN: ForeignNamePool = { origin: '中国', given: CHN_GIVEN, family: CHN_FAMILY, familyFirst: true }
const POOL_TWN: ForeignNamePool = { origin: '台湾', given: TWN_GIVEN, family: TWN_FAMILY, familyFirst: true }
const POOL_GBR: ForeignNamePool = { origin: 'イギリス', given: EN_GIVEN, family: ANGLO_FAMILY }
const POOL_USA: ForeignNamePool = { origin: 'アメリカ', given: EN_GIVEN, family: ANGLO_FAMILY }
const POOL_AUS: ForeignNamePool = { origin: 'オーストラリア', given: EN_GIVEN, family: ANGLO_FAMILY }
const POOL_NZL: ForeignNamePool = { origin: 'ニュージーランド', given: EN_GIVEN, family: ANGLO_FAMILY }
const POOL_FRA: ForeignNamePool = { origin: 'フランス', given: FR_GIVEN, family: FR_FAMILY }
const POOL_GER: ForeignNamePool = { origin: 'ドイツ', given: DE_GIVEN, family: DE_FAMILY }
const POOL_ITA: ForeignNamePool = { origin: 'イタリア', given: IT_GIVEN, family: IT_FAMILY }
const POOL_ESP: ForeignNamePool = { origin: 'スペイン', given: ES_GIVEN, family: ES_FAMILY }
const POOL_NED: ForeignNamePool = { origin: 'オランダ', given: NL_GIVEN, family: NL_FAMILY }
const POOL_BEL: ForeignNamePool = { origin: 'ベルギー', given: NL_GIVEN, family: NL_FAMILY }
const POOL_SWE: ForeignNamePool = { origin: 'スウェーデン', given: SCAN_GIVEN, family: SCAN_FAMILY }
const POOL_NOR: ForeignNamePool = { origin: 'ノルウェー', given: SCAN_GIVEN, family: SCAN_FAMILY }
const POOL_BRA: ForeignNamePool = { origin: 'ブラジル', given: PT_GIVEN, family: PT_FAMILY }
const POOL_COL: ForeignNamePool = { origin: 'コロンビア', given: ES_GIVEN, family: ES_FAMILY }
const POOL_ECU: ForeignNamePool = { origin: 'エクアドル', given: ES_GIVEN, family: ES_FAMILY }
const POOL_ARG: ForeignNamePool = { origin: 'アルゼンチン', given: ES_GIVEN, family: ES_FAMILY }
const POOL_CHI: ForeignNamePool = { origin: 'チリ', given: ES_GIVEN, family: ES_FAMILY }

// 重みに応じてプールを展開する（重みが大きい国ほど選ばれやすい）
function weightedPools(entries: [ForeignNamePool, number][]): ForeignNamePool[] {
  return entries.flatMap(([pool, weight]) => Array.from({ length: weight }, () => pool))
}

// JPEL（ドラフト・CPU）用: 従来の国籍出現比率をおおむね維持した重み付きプール
const JPEL_FOREIGN_POOLS: ForeignNamePool[] = weightedPools([
  [POOL_KEN, 21], [POOL_ETH, 16], [POOL_UGA, 5], [POOL_TAN, 4],
  [POOL_MAR, 5], [POOL_ERI, 3], [POOL_SEN, 3], [POOL_SOM, 2],
  [POOL_KOR, 10], [POOL_CHN, 10],
  [POOL_FRA, 5], [POOL_GER, 4], [POOL_ITA, 4], [POOL_ESP, 4], [POOL_GBR, 4],
  [POOL_NED, 2], [POOL_BEL, 1], [POOL_BRA, 4], [POOL_USA, 4],
])

// 海外リーグ用: 国コードごとのプール（重みは従来の構成比を踏襲）
const FOREIGN_LEAGUE_POOLS: Record<string, ForeignNamePool[]> = {
  KOR: [POOL_KOR],
  CHN: [POOL_CHN],
  TWN: [POOL_TWN],
  ETH: weightedPools([[POOL_ETH, 4], [POOL_ERI, 1]]),
  KEN: [POOL_KEN],
  UGA: [POOL_UGA],
  TAN: [POOL_TAN],
  EUR: weightedPools([
    [POOL_GBR, 6], [POOL_FRA, 5], [POOL_GER, 5], [POOL_ITA, 5], [POOL_ESP, 4],
    [POOL_NED, 2], [POOL_SWE, 2], [POOL_NOR, 2], [POOL_AUS, 3], [POOL_NZL, 2],
  ]),
  USA: weightedPools([
    [POOL_USA, 20], [POOL_BRA, 2], [POOL_COL, 2], [POOL_ECU, 2], [POOL_ARG, 1], [POOL_CHI, 1],
  ]),
}

// プールから姓と名を1つずつ選んで名前を組み立てる
function pickForeignName(pool: ForeignNamePool): { name: string; origin: string } {
  const given = pool.given[rng(0, pool.given.length - 1)]
  const family = pool.family[rng(0, pool.family.length - 1)]
  return {
    name: pool.familyFirst ? `${family}・${given}` : `${given}・${family}`,
    origin: pool.origin,
  }
}

// JPEL用の外国人名を生成する。usedNames と重複したらリトライする
function generateJpelForeignName(usedNames: Set<string>): { name: string; origin: string } {
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
      const fn = generateJpelForeignName(usedNames)
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
      // 稀に「お化け」隠れ玉：ランクに関わらず高ポテンシャル(85〜90)。現在値は低いままなので下位指名でも化ける。
      potential: isForeign
        ? rng(potential[0], potential[1])
        : (Math.random() < 0.06 ? rng(85, 90) : Math.min(90, rng(potential[0], potential[1]))),
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
      const fn = generateJpelForeignName(usedNames)
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
    void contractType   // 契約形態は廃止（フラット化）。tier は年齢分布のためだけに使う
    return {
      id, name, nameKana: '', age, yearsPro,
      draftYear: year - yearsPro, draftRound: null, draftPick: null,
      ratings, specialty,
      potential: potentialVal,
      growthCurve,
      teamId, rosterTier: 'main',
      contract: {
        yearsLeft: rng(2, 4),
        annualSalary: salary ?? calculateRookieSalary(rank),
        faEligibleYear: year + rng(2, 4),
        contractType: 'standard',
      },
      nationality, origin,
      status: 'active', fatigue: 0, morale: rng(65, 85), form: 0,
      career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
      traits: assignTraits(rank, specialty, age),
      personality: (['salary', 'salary', 'winning', 'winning', 'loyalty'] as const)[rng(0, 4)],
    }
  }

  for (const team of teams) {
    // グラント（initialRank連動の初期予算）の8割を30人の年俸に充てる。
    // 年俸から選手の強さを決めるので、予算の大きいチームほど強い選手が揃う。
    const grant = rankBudgetGrant(team.initialRank ?? 10)
    const salaries = distributeSalaries(Math.round(grant * 0.8), 30, 4_000_000)

    const mainIds: string[] = []   // 本契約(standard) 12
    const dualIds: string[] = []   // 2WAY(dual) 3（1軍/2軍共通）
    const secondIds: string[] = [] // 育成(development) 15

    // 本契約(standard) 12人 — 年俸上位から。外国人は2人まで
    let teamForeignCount = 0
    for (let i = 0; i < 12; i++) {
      const sal = salaries[i]
      const canBeForeign = teamForeignCount < 2
      const isForeign = canBeForeign && (i < 1 ? Math.random() < 0.55 : Math.random() < 0.08)
      if (isForeign) teamForeignCount++
      const p = makePlayer(rankForSalary(sal), i, team.id, 'main', isForeign, 'standard', sal)
      cpuPlayers.push(p); mainIds.push(p.id)
    }
    // 2WAY(dual) 3人 — 1軍側で保持し2軍にも登録（国内）
    for (let i = 0; i < 3; i++) {
      const sal = salaries[12 + i]
      const p = makePlayer(rankForSalary(sal), 12 + i, team.id, 'main', false, 'dual', sal)
      cpuPlayers.push(p); dualIds.push(p.id)
    }
    // 育成(development) 15人（国内・年俸下位）
    for (let i = 0; i < 15; i++) {
      const sal = salaries[15 + i]
      const p = makePlayer(rankForSalary(sal), i, team.id, 'second', false, 'development', sal)
      cpuPlayers.push(p); secondIds.push(p.id)
    }

    // フラット化：全員を単一ロスター(main)へ。2軍は使わない
    teamRosters[team.id] = { main: [...mainIds, ...dualIds, ...secondIds], second: [] }
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
        // クラブ人数は30人上限（無制限に膨らんでセーブが肥大するのを防ぐ）
        const addN = Math.min(3 + (Math.random() < 0.5 ? 1 : 0), Math.max(0, 30 - kept.length))
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

  // 地域別の仮想予算。JPELと同じく8割を22人の年俸に充て、年俸から強さを決める。
  // アフリカ（ETH/KEN/UGA/TAN）はJPEL首位（グラント7億）を上回る
  const REGION_BUDGET: Record<string, number> = {
    AFRICA: 850_000_000,
    EUR_USA: 700_000_000,
    ASIA: 400_000_000,
  }
  function budgetFor(country: string): number {
    if (['ETH', 'KEN', 'UGA', 'TAN'].includes(country)) return REGION_BUDGET.AFRICA
    if (['EUR', 'USA'].includes(country)) return REGION_BUDGET.EUR_USA
    if (['CHN', 'KOR', 'TWN'].includes(country)) return REGION_BUDGET.ASIA
    return REGION_BUDGET.EUR_USA
  }

  const updatedLeagues = leagues.map(league => ({
    ...league,
    clubs: league.clubs.map(club => {
      const clubPlayerIds: string[] = []
      // シャッフルするのは refreshForeignLeagues が先頭数人を新加入として拾うため（常にスターだけ入るのを防ぐ）
      const salaries = distributeSalaries(Math.round(budgetFor(club.country) * 0.8), 22, 4_000_000).sort(() => Math.random() - 0.5)
      const namePools = FOREIGN_LEAGUE_POOLS[club.country as string] ?? FOREIGN_LEAGUE_POOLS.EUR
      const clubUsedNames = new Set<string>()

      salaries.forEach((clubSalary) => {
        const rank = rankForSalary(clubSalary)
        foreignIdCounter++
        const specialty = specialties[rng(0, specialties.length - 1)]
        const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
        const ratings = generateRatings(rank, specialty)
        const { potential } = rankToBaseRange(rank, growthCurve)
        const age = rng(22, 30)
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
            annualSalary: clubSalary,
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
