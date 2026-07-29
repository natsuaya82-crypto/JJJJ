import Capacitor

/// アプリ自作のプラグイン（IAP・Keychain）をブリッジに登録するための画面クラス。
///
/// 【なぜ必要か】
/// Capacitor 8 が自動で登録するのは、capacitor.config.json の packageClassList に
/// 並んでいるクラスだけ。あの一覧は `npx cap sync ios` が npm パッケージから作るので、
/// このアプリの中に直接置いた Swift のプラグインは一生載らない。
/// 結果として JS 側から呼んだときに
///   「"IAP" plugin is not implemented on ios」
/// で失敗する（GMパスの購入が失敗していた原因はこれ）。
///
/// capacitorDidLoad() はブリッジが出来た直後に呼ばれる場所で、
/// registerPluginInstance() は自動登録の設定に関係なく必ず登録してくれる。
/// なので、ここで手で登録するのが正しいやり方。
///
/// 【注意】プラグインを足したら、必ずここにも1行足すこと。
/// Main.storyboard の customClass がこのクラスを指していることも前提。
class MainViewController: CAPBridgeViewController {
  override func capacitorDidLoad() {
    bridge?.registerPluginInstance(IAPPlugin())      // GMパス（広告なし）の購入・復元
    bridge?.registerPluginInstance(KeychainPlugin()) // フレンド機能のアカウント保存
  }
}
