import Capacitor
import StoreKit

@objc(IAPPlugin)
public class IAPPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "IAPPlugin"
  public let jsName = "IAP"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
  ]

  private let productId = "com.tokinets.jpelmanager.noads"

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
