import Capacitor
import StoreKit

@objc(IAPPlugin)
public class IAPPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "IAPPlugin"
  public let jsName = "IAP"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
  ]

  private let productId = "com.tokinets.jpelmanager.noads"

  /// 商品情報が取れるかだけを見る。購入シートは出さない。
  ///
  /// これが false のときに購入ボタンを押させても「商品情報を取得できませんでした」しか
  /// 出せないので、画面を開いた時点で先に調べてボタンを止めるために使う。
  /// 通信できなかった場合も available = false になる（購入できないのは同じなので）。
  @objc func available(_ call: CAPPluginCall) {
    Task {
      do {
        let products = try await Product.products(for: [self.productId])
        call.resolve(["available": !products.isEmpty])
      } catch {
        call.resolve(["available": false])
      }
    }
  }

  @objc func purchase(_ call: CAPPluginCall) {
    // 購入シートは画面表示なので必ずメインスレッドで走らせる。
    // ここを付けないと iPad でシートが出ないまま止まることがある。
    Task { @MainActor in
      do {
        let products = try await Product.products(for: [self.productId])
        guard let product = products.first else {
          call.reject("Product not found")
          return
        }
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
          switch verification {
          case .verified(let transaction):
            await transaction.finish()
            call.resolve(["result": "purchased"])
          case .unverified:
            call.reject("Unverified transaction")
          }
        case .userCancelled:
          call.resolve(["result": "cancelled"])
        case .pending:
          call.resolve(["result": "pending"])
        @unknown default:
          call.reject("Unknown result")
        }
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func restore(_ call: CAPPluginCall) {
    Task { @MainActor in
      var restored = false
      for await result in Transaction.currentEntitlements {
        if case .verified(let transaction) = result,
           transaction.productID == self.productId {
          await transaction.finish()
          restored = true
        }
      }
      call.resolve(["restored": restored])
    }
  }
}
