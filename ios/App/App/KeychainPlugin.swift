import Capacitor
import Security

/// フレンド機能のアカウント（＝フレンドコードの正体）を端末に永続保存するためのプラグイン。
///
/// なぜ Keychain か:
///  - localStorage は WKWebView の管理下で、OSのストレージ整理などで消えることがある。
///  - アプリ内のファイル（Documents）はアプリを削除すると一緒に消える。
///  - Keychain は「アプリを削除しても残る」唯一の保存先。さらに kSecAttrSynchronizable を立てると
///    iCloudキーチェーン経由で同じApple IDの別端末にも引き継がれる（＝機種変更しても同じID）。
///
/// つまりここに置いたものは、ユーザーが明示的にデータ削除するまで消えない。
///
/// 【重要】読み取りに失敗したときは resolve せず reject する。
///   「見つからない(errSecItemNotFound)」と「読めなかった」を JS 側で区別できないと、
///   一時的な失敗で新しいアカウントを作ってしまい、フレンドが全部消えるため。
@objc(KeychainPlugin)
public class KeychainPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "KeychainPlugin"
  public let jsName = "Keychain"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
  ]

  private let service = "com.tokinets.jpelmanager.identity"

  private func baseQuery(_ key: String) -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      // iCloudキーチェーンに同期する（機種変更で引き継がれる）
      kSecAttrSynchronizable as String: kCFBooleanTrue as Any,
    ]
  }

  @objc func get(_ call: CAPPluginCall) {
    guard let key = call.getString("key") else { call.reject("key required"); return }
    var q = baseQuery(key)
    q[kSecReturnData as String] = kCFBooleanTrue as Any
    q[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(q as CFDictionary, &item)
    if status == errSecSuccess, let data = item as? Data, let text = String(data: data, encoding: .utf8) {
      call.resolve(["value": text])
    } else if status == errSecItemNotFound {
      // 保存されていない（＝本当の初回）。空で返す。
      call.resolve([:])
    } else {
      // 読めなかった。JS側はここで新規作成してはいけない。
      call.reject("keychain read failed (\(status))")
    }
  }

  @objc func set(_ call: CAPPluginCall) {
    guard let key = call.getString("key"), let value = call.getString("value") else {
      call.reject("key and value required"); return
    }
    var q = baseQuery(key)
    SecItemDelete(q as CFDictionary)   // 既存があれば置き換える
    q[kSecValueData as String] = Data(value.utf8)
    // 同期する項目に ThisDeviceOnly 系は使えない。再起動直後（未ロック）でも読めるようにする。
    q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

    let status = SecItemAdd(q as CFDictionary, nil)
    if status == errSecSuccess {
      call.resolve()
    } else {
      call.reject("keychain write failed (\(status))")
    }
  }

  @objc func remove(_ call: CAPPluginCall) {
    guard let key = call.getString("key") else { call.reject("key required"); return }
    SecItemDelete(baseQuery(key) as CFDictionary)
    call.resolve()
  }
}
