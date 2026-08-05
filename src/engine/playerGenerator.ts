import type { Player, Specialty, GrowthCurve, Nationality, ForeignCategory, ForeignLeague } from '../types'
import { natCategory, natStrengthRegion } from '../data/nationalities'
import type { TraitId } from '../utils/traitUtils'
import type { Rank } from '../types'
import { curveOvr } from './ageCurve'
import { tierOf, tierOfClubId, tierPotentialCap, tierRankComposition, TIER_POTENTIAL_CAP, INITIAL_ROSTER_SIZE, type ClubTier } from '../utils/clubTier'
import { SPEC_STRONG_STATS, getStatPotentials, faMarketSalary, peakAgeOf } from '../utils/playerUtils'
import { buildNationalityBag } from '../data/nationTalent'
// 所属は player.teamId が唯一の持ち場。クラブ側に名簿は持たない
import { clubMembersByClub } from '../utils/rosterSync'

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

// 海外クラブの監督名。クラブIDから毎回まったく同じ名前が出る（セーブに持たない）。
// 乱数を使うと画面を開くたびに監督が変わってしまうので、IDのハッシュで固定する。
export function foreignClubGmName(clubId: string, country: string): string {
  let h = 2166136261
  for (let i = 0; i < clubId.length; i++) {
    h ^= clubId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const seed = Math.abs(h)
  const pools = FOREIGN_LEAGUE_POOLS[country] ?? FOREIGN_LEAGUE_POOLS._default
  const pool = pools[seed % pools.length]
  const given = pool.given[(seed >>> 5) % pool.given.length]
  const family = pool.family[(seed >>> 13) % pool.family.length]
  return pool.familyFirst ? `${family}・${given}` : `${given}・${family}`
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

// Rank は types/index.ts の1本（ageCurve・clubTier と共有）

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


function generateRatings(rank: Rank, specialty: Specialty, baseBoost = 0) {
  const { min: min0, max: max0 } = tierRange(rank)
  const min = min0 + baseBoost, max = max0 + baseBoost
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
// 新人のランク配分。DRAFT_POOL_SIZE と同じ長さにすること
// （足りないと余りが 'A' に落ちて、配分が意図とずれる）。
//
// 70人時代（SSS2/SS6/S14/A22/B14/C6/D4 = 68）の【割合をそのまま】120人へ引き伸ばした。
//
// 上位を据え置く案もあったが採らなかった。日本人の頂点が薄いままだと、
// 世界選手権で日本代表が戦えない状態が固定される。チーム数が2.6倍になるなら、
// 超一流の総量も同じだけ増やす。
const DRAFT_RANK_POOL: Rank[] = [
  ...Array<Rank>(4).fill('SSS'),
  ...Array<Rank>(11).fill('SS'),
  ...Array<Rank>(25).fill('S'),
  ...Array<Rank>(37).fill('A'),
  ...Array<Rank>(25).fill('B'),
  ...Array<Rank>(11).fill('C'),
  ...Array<Rank>(7).fill('D'),
]

type OriginType = 'university' | 'high_school' | 'foreign' | 'development'

// Build origin distribution: 40 univ, 15 hs, 10 foreign, 5 dev (total 70)
// 1年に生まれる新人の数。
//
// 20チーム時代は70人だった。3部制で52チームになると、
//   52チーム × 28人 = 1456枠 ／ 平均現役14年（引退32〜40歳）= 毎年104人の欠員
// なので70人では毎年34人ずつ足りず、リーグ全体が痩せていく
// （CPUは ROSTER_MIN=15人まで縮む）。
//
// 需要104に対して120。差の16はFAで循環するぶんの余裕。
// 2部・3部にドラフトは無く、指名されなかった選手がFAに流れるのが唯一の入口なので、
// ここが細いと下部リーグが選手を取れない。
export const DRAFT_POOL_SIZE = 120

function buildOriginPool(): OriginType[] {
  const pool: OriginType[] = []
  for (let i = 0; i < 68; i++) pool.push('university')
  for (let i = 0; i < 26; i++) pool.push('high_school')
  for (let i = 0; i < 17; i++) pool.push('foreign')
  for (let i = 0; i < 9; i++) pool.push('development')
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

    const age = isForeign
      ? rng(19, 25)
      : originType === 'high_school'
      ? 18
      : originType === 'development'
      ? rng(21, 24)
      : 22

    // 稀に「お化け」隠れ玉：ランクに関わらず高ポテンシャル。現在値は低いままなので下位指名でも化ける。
    // 日本人は総合90前後を上限にしつつ、選手ごとにばらつかせる（全員90一律を避ける＝得意は99も、苦手は低く）。
    const prodigyPot = !isForeign && Math.random() < 0.08 ? rng(86, 93) : undefined
    const id = `draft-${year}-${idCounter}`
    // 能力値の作り方は buildRatingsForRank の1本。ここだけ幹を通っておらず、
    // 22歳を超える外国人枠・育成枠に年齢ぶんの成長が焼き込まれていなかった
    // （高卒18・大卒22は元から焼き込み0年なので変化しない）。
    const { ratings, potential } = buildRatingsForRank({
      id, rank, specialty, growthCurve, age,
      potentialCap: isForeign ? 99 : 92,
      potentialOverride: prodigyPot,
    })

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
      id,
      name,
      nameKana: '',
      age,
      yearsPro: 0,
      draftYear: year,
      draftRound: null,
      draftPick: null,
      ratings,
      specialty,
      potential,
      growthCurve,
      teamId: '__pool__',
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
export function distributeSalaries(total: number, count: number, minSalary: number): number[] {
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
export function rankForSalary(s: number): Rank {
  if (s >= 36_000_000) return 'SSS'
  if (s >= 28_000_000) return 'SS'
  if (s >= 20_000_000) return 'S'
  if (s >= 14_000_000) return 'A'
  if (s >= 10_000_000) return 'B'
  if (s >= 7_000_000) return 'C'
  return 'D'
}

export function generateCpuRosters(
  teams: { id: string; initialRank?: number; tier?: ClubTier }[],
  year: number,
): { cpuPlayers: Player[]; teamRosters: Record<string, { main: string[] }> } {
  const cpuPlayers: Player[] = []
  const teamRosters: Record<string, { main: string[] }> = {}
  const usedNames = new Set<string>()
  const specialties: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const growthCurves: GrowthCurve[] = ['early', 'normal', 'normal', 'late_bloomer']
  let cpuIdCounter = 5000

  function makePlayer(rank: Rank, i: number, teamId: string, potentialCap: number, isForeign: boolean): Player {
    cpuIdCounter++
    const specialty = specialties[rng(0, specialties.length - 1)]
    const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
    // 年齢は18〜32でばらけさせる。ランクとは紐づけない
    // （紐づけると「高ランク＝年上」になるが、早熟のSSSは22歳が全盛なので実態と合わない）
    const age = 18 + Math.round(i * 14 / Math.max(1, INITIAL_ROSTER_SIZE - 1))
    const yearsPro = Math.max(0, age - 22)

    const id = `ai-${teamId}-${cpuIdCounter}`
    // 能力値は年齢カーブ1本（engine/ageCurve.ts）。上限はそのクラブの格
    const { ratings, potential: potentialVal } = buildRatingsForRank({
      id, rank, specialty, growthCurve, age, potentialCap,
    })

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

    const made: Player = {
      id, name, nameKana: '', age, yearsPro,
      draftYear: year - yearsPro, draftRound: null, draftPick: null,
      ratings, specialty,
      potential: potentialVal,
      growthCurve,
      teamId,
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
    // ロスターの中身は「格」が決める（そのクラブに各ランクが何人いるか）。
    //
    // 前は 予算 → distributeSalaries で25人に年俸を配る → その額から rankForSalary で
    // ランクを逆算、という中間の仕組み（配分年俸）があった。しかも実際に払う年俸は
    // OVRから計算し直していたので、年俸が2つあって互いを見ていない状態だった。
    // いまは 格 → ランク構成 → 年齢カーブ → OVR → 年俸 の1本。
    const tier = tierOf(team)
    const comp = tierRankComposition(tier)
    const cap = TIER_POTENTIAL_CAP[tier]
    const slots: Rank[] = []
    for (const [r, n] of Object.entries(comp)) for (let k = 0; k < n; k++) slots.push(r as Rank)
    slots.sort(() => Math.random() - 0.5)

    const ids: string[] = []
    let teamForeignCount = 0
    slots.forEach((rank, i) => {
      // 外国人は2人まで（先頭2枠で抽選）
      const canBeForeign = teamForeignCount < 2
      const isForeign = canBeForeign && (i < 1 ? Math.random() < 0.55 : Math.random() < 0.08)
      if (isForeign) teamForeignCount++
      const p = makePlayer(rank, i, team.id, cap, isForeign)
      cpuPlayers.push(p); ids.push(p.id)
    })
    teamRosters[team.id] = { main: ids }
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
    const age = tier === 'main' ? rng(20, 28) : rng(18, 24)
    const yearsPro = Math.max(0, age - 22)
    const id = `pr-${contractType}-${year}-${idCounter}`
    // 能力値の作り方は buildRatingsForRank の1本。ここだけ焼き込みが抜けていて、
    // 自チームの26歳が「22歳の能力のまま歳だけ26」で始まっていた
    const { ratings, potential } = buildRatingsForRank({ id, rank, specialty, growthCurve, age })
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
      id,
      name, nameKana: '', age, yearsPro,
      draftYear: year - yearsPro, draftRound: null, draftPick: null,
      ratings, specialty,
      potential,
      growthCurve,
      teamId: '',
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
  // 各チームの過去成績（年と順位）。呼ぶ側が過去シーズンの順位表から作って渡す
  teams: { id: string; seasonResults: { year: number; rank: number }[] }[],
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

  const isInaugural = teams.every(t => t.seasonResults.length === 0 ||
    !t.seasonResults.find(r => r.year === year - 1))

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
      const rankA = a.seasonResults.find(r => r.year === year - 1)?.rank ?? 20
      const rankB = b.seasonResults.find(r => r.year === year - 1)?.rank ?? 20
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
  players: Player[],
): { newPlayers: Player[]; updatedLeagues: ForeignLeague[] } {
  // 補充は伸びしろ持ちの若手(19〜22)だけ。数年かけてそのティアのエースに育つ。
  const fresh = generateForeignLeaguePlayers(leagues, year, [19, 22])
  // 新人は teamId にクラブが入った状態で作られるので、クラブごとに束ねて取り出す
  const freshByClub = clubMembersByClub(fresh.players)
  const byId = new Map(fresh.players.map(p => [p.id, p]))
  // 今の在籍は選手側の teamId から数える（クラブ側に名簿は無い）
  const membersByClub = clubMembersByClub(players)
  // 在籍選手の年齢を引くための索引（補充を年齢構成で判定するのに使う）
  const currentById = new Map(players.map(p => [p.id, p]))
  const newPlayers: Player[] = []
  for (const l of leagues) {
    for (const club of l.clubs) {
      const kept = (membersByClub.get(club.id) ?? []).filter(id => !removedIds.has(id))
      // 新人補充の目標は26人まで（上限30に空き枠を残す）。全クラブを毎年30人に
      // 埋めてしまうと買い手枠が消えて海外間の移籍市場が動かなくなる。
      // 上の空きは移籍・引き抜きで埋まり、クラブごとに人数の個性が出る。
      //
      // 2046修正: 人数だけで判定していたため、在籍が26人以上あるクラブには新人が
      // 一人も入らなかった。引退は32〜40歳なので在籍はなかなか減らず、結果として
      // 「海外クラブに若手がいない・全員が同じだけ歳を取る」状態になっていた。
      // 人数に関係なく、23歳以下が3人未満なら若手を入れる（枠は上限30まで4人の余裕がある）。
      const young = kept.filter(id => (currentById.get(id)?.age ?? 99) <= 23).length
      const addN = young < 3
        ? Math.min(3, 3 - young)
        : Math.min(3, Math.max(0, 26 - kept.length))
      const adds = (freshByClub.get(club.id) ?? []).slice(0, addN)
      for (const id of adds) { const p = byId.get(id); if (p) newPlayers.push({ ...p, joinedYear: year }) }
    }
  }
  return { newPlayers, updatedLeagues: leagues }
}

// 生成時に「年齢分の成長」を焼き込む（gameStoreのgrowPlayer年次成長と同じ式・同じレート）。
/**
 * ランク・成長タイプ・年齢から「初期能力値とポテンシャル」を作る、ただ1つの場所。
 *
 * 自チーム(generatePlayerInitialRoster) / CPU(generateCpuRosters) / 海外(generateForeignLeaguePlayers)
 * の3つが同じランク体系を使っているのに、生成の手順だけ別々に手書きされていた。その結果
 * 自チームだけ bakeAgeGrowth（年齢ぶんの成長の焼き込み）が抜けており、自チームの26歳が
 * 「22歳の能力のまま歳だけ26」という状態で始まっていた（CPUの26歳は4年ぶん成長済み）。
 * 開幕時点で1軍平均OVRに12ポイント、エースで21ポイントの差がつく原因になっていた。
 *
 * ランクの決め方（年俸から／固定プール／地域補正）と年齢の分布は呼び出し側の裁量。
 * 「ランクと年齢が決まったら能力値がどうなるか」は必ずここを通すこと。
 */
export function buildRatingsForRank(params: {
  id: string
  rank: Rank
  specialty: Specialty
  growthCurve: GrowthCurve
  age: number
  potentialCap?: number      // そのクラブの格の成長上限（utils/clubTier.ts の tierPotentialCap）
  potentialOverride?: number // ランクから抽選せず、この値をポテンシャルにする（ドラフトの「お化け」枠）
}): { ratings: Player['ratings']; potential: number } {
  const { id, rank, specialty, growthCurve, age, potentialCap = 85, potentialOverride } = params
  const potential = potentialOverride ?? potentialCap

  // 能力値は「年齢カーブの値 ＋ 特性ごとの凸凹」。
  // カーブ（engine/ageCurve.ts）は初期生成も年次成長も見る唯一の表。
  // ここでは積み上げ0＝素のカーブなので、生成直後は「その年齢の標準的な選手」になる。
  // 以後の伸びは成長側（applyGrowth）が積み上げていく。
  const base = curveOvr(rank, growthCurve, age)
  const strong = new Set(SPEC_STRONG_STATS[specialty] ?? [])
  const caps = statCapsFor(id, specialty, potential)
  const ratings = {} as Player['ratings']
  for (const stat of ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery'] as const) {
    // 得意は上、苦手は下。7つの平均がカーブの値になるよう、得意の数で振り分け幅を決める
    const n = strong.size || 1
    const up = 7 / n - 1            // 得意3つなら +1.33、2つなら +2.5
    const d = strong.has(stat) ? up * 4 : -4
    ratings[stat] = Math.round(Math.max(30, Math.min(caps[stat], base + d)))
  }
  return { ratings, potential }
}

/** 能力別の上限。得意は高く、苦手は低い。平均がだいたい potential になる */
export function statCapsFor(id: string, specialty: Specialty, potential: number): Record<string, number> {
  const strong = new Set(SPEC_STRONG_STATS[specialty] ?? [])
  const out: Record<string, number> = {}
  for (const stat of ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery'] as const) {
    const jitter = (hashForCap(id + stat) % 9) - 6
    out[stat] = Math.min(99, Math.round((strong.has(stat) ? potential + 12 : potential - 5) + jitter))
  }
  return out
}
function hashForCap(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function generateForeignLeaguePlayers(
  leagues: ForeignLeague[],
  year: number,
  // 年齢範囲。毎年の補充(refreshForeignLeagues)は伸びしろ持ちの若手だけを入れるので[19,22]を渡す。
  //
  // 2046調整: 初期ロスターは[22,30]だった。引退は32〜40歳なので最初の5〜8年は誰も抜けず、
  // 下の補充ゲート（在籍26人未満のときだけ新人を入れる）が一度も開かない。結果、
  // 初期コホートがそのまま歳を取るだけで、海外リーグに若手が一人も居ない状態が続いていた。
  // [18,28]に下げて最初から若手を混ぜる。成長速度の引き上げ（growPlayer / bakeAgeGrowth）と
  // 打ち消し合うので、初年度の強さは従来とほぼ同じまま年齢構成だけが若返る
  // （実測: 中央OVR 70→69 / 80以上 10%→12% / 90以上 0%→0%）。
  ageRange: [number, number] = [18, 28],
): { players: Player[]; updatedLeagues: ForeignLeague[] } {
  const players: Player[] = []
  const specialties: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const growthCurves: GrowthCurve[] = ['early', 'normal', 'normal', 'late_bloomer']

  // 海外クラブの強さも「格」1本で決まる（utils/clubTier.ts）。
  //
  // 前は REGION という別の表があり、budget / potBonus / minRank / maxRank / potCap の
  // 5つのノブで地域ごとに強さを決めていた。国内は格、海外は REGION、と決まりが2本立てで、
  // 「4大リーグへ進む」「3部の原石を奪い合う」を同じ物差しで比べられなかった。
  // いまは全232クラブが同じ格に乗っている。

  // 国籍はクラブの所在国ではなく、data/nationTalent.ts の人数比で配る。
  // クラブの所在国に固定すると、国の選手層＝その国のクラブ数になり、
  // ニュージーランド220人・エチオピア66人のような転倒が起きる（実測）。
  // 袋から順に引くので、全体の人数比がそのまま各国の選手層になる。
  // 強さは下の region（＝どのクラブにいるか）で決まるので、国籍では変えない。
  const natBag = buildNationalityBag()
  for (let i = natBag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[natBag[i], natBag[j]] = [natBag[j], natBag[i]]
  }
  let natIdx = 0
  const nextNationality = (fallback: Nationality): Nationality =>
    natIdx < natBag.length ? natBag[natIdx++] : fallback

  const updatedLeagues = leagues.map(league => ({
    ...league,
    clubs: league.clubs.map(club => {
      const tier = tierOfClubId(club.id)
      const cap = TIER_POTENTIAL_CAP[tier]
      // ロスターの中身は格が決める（そのクラブに各ランクが何人いるか）。
      // シャッフルするのは refreshForeignLeagues が先頭数人を新加入として拾うため
      // （常にスターだけが入るのを防ぐ）
      const comp = tierRankComposition(tier)
      const rankSlots: Rank[] = []
      for (const [r, n] of Object.entries(comp)) for (let k = 0; k < n; k++) rankSlots.push(r as Rank)
      rankSlots.sort(() => Math.random() - 0.5)
      const clubUsedNames = new Set<string>()

      rankSlots.forEach((rank) => {
        foreignIdCounter++
        const specialty = specialties[rng(0, specialties.length - 1)]
        const growthCurve = growthCurves[rng(0, growthCurves.length - 1)]
        const age = rng(ageRange[0], ageRange[1])
        const nat: Nationality = nextNationality(club.country)
        const foreignCat = nationalityToForeignCategory(nat)

        // 名前は所属クラブの国ではなく【国籍】から引く。
        // 切り離した以上、スペインのクラブにいるケニア人にスペイン名が付いてはいけない。
        const namePools = FOREIGN_LEAGUE_POOLS[nat as string] ?? FOREIGN_LEAGUE_POOLS._default
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

        // 能力値の作り方は buildRatingsForRank の1本（年齢ぶんの成長の焼き込みもそこで行う）。
        // 地域でポテンシャルを底上げする（若手は高ポテンシャルで生成 → 成長で伸びる。現在値はいきなり上げない）。
        // potCap で地域ごとの実効OVR天井を決める。
        const { ratings, potential: potentialVal } = buildRatingsForRank({
          id, rank, specialty, growthCurve, age,
          potentialCap: cap,
        })

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

      return club
    }),
  }))

  return { players, updatedLeagues }
}
