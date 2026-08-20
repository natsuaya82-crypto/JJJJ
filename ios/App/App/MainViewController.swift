import AVFoundation
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
    bridge?.registerPluginInstance(GlassTabBarPlugin()) // 下タブ（iOS 26 のガラス）

    // 音の設定を「ゲーム音」に戻す。
    //
    // AppDelegate が起動時にゲーム音（.ambient＋他アプリと混ぜる）に設定しているが、
    // native-audio プラグインが読み込まれる瞬間に、中で無条件に「音楽アプリ」扱いへ
    // 書き換えてしまう。プラグインの読み込みが終わったこの場所で上から塗り直す。
    // これでユーザーが聴いている音楽が止まらず、コントロールセンターの再生中にも出ない。
    do {
      try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      print("AVAudioSession re-apply failed: \(error)")
    }
  }
}
