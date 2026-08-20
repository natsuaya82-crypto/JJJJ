import Capacitor
import UIKit

/// **下タブをネイティブで描く。**
///
/// 【なぜネイティブなのか】
/// Apple の Liquid Glass は iOS 26 の `UIGlassEffect` でしか出せない。WebView の中の
/// CSS（`backdrop-filter`）はぼかしと彩度しか掛けられず、縁の屈折も厚みも出ない
/// （オーナー・2026-08-20「リキッドグラスまがいだよね？本物にしてほしいな」「下タブだけでいいよ」）。
///
/// ガラスだけネイティブにして中身を Web に残す、はできない。ガラスは「下にある物」を
/// 曲げて写すので **WebView より前** に置く必要があり、そうすると Web のアイコンが隠れる。
/// だから**タブまるごと**こちらで描く。
///
/// 【Web 側が渡すもの】4つだけ。全部もともと JS にある情報で、判断はあちらのまま。
///   `apply(items:active:badges:visible:)`  … 一括で反映する（項目・選択中・数字・出す/隠す）
/// 【こちらから返すもの】
///   `tabTap` イベントに `{ key }`。実際に画面を動かすのは Web（ルーティングはあちら1本）
///
/// 【iOS 26 未満】`UIGlassEffect` が無いので `UIBlurEffect(.systemUltraThinMaterialDark)` に落ちる。
/// 見た目はいまの CSS とほぼ同じで、壊れはしない。
@objc(GlassTabBarPlugin)
public class GlassTabBarPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "GlassTabBarPlugin"
  public let jsName = "GlassTabBar"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "apply", returnType: CAPPluginReturnPromise),
  ]

  private var bar: GlassTabBarView?

  /// 項目・選択中・数字・出す/隠すを一度に反映する。
  /// **呼ぶ側で分けないこと**（別々にすると、項目を入れ替えた直後の1フレームだけ
  /// 選択中がずれる。Web の下タブでも同じ形にしてある）
  @objc func apply(_ call: CAPPluginCall) {
    let items = call.getArray("items", JSObject.self) ?? []
    let active = call.getString("active") ?? ""
    let badges = call.getObject("badges") ?? [:]
    let visible = call.getBool("visible") ?? true
    let bottomInset = call.getDouble("bottomInset") ?? 0

    DispatchQueue.main.async {
      guard let host = self.bridge?.viewController?.view else { call.resolve(); return }
      if self.bar == nil {
        let v = GlassTabBarView()
        v.onTap = { [weak self] key in self?.notifyListeners("tabTap", data: ["key": key]) }
        host.addSubview(v)
        self.bar = v
      }
      self.bar?.set(
        items: items.compactMap { item in
          guard let key = item["key"] as? String, let label = item["label"] as? String,
                let icon = item["icon"] as? String else { return nil }
          return GlassTabBarView.Item(key: key, label: label, icon: icon)
        },
        active: active,
        badges: badges.reduce(into: [String: Int]()) { acc, kv in
          if let n = kv.value as? Int { acc[kv.key] = n }
        },
        visible: visible,
        bottomInset: CGFloat(bottomInset))
      call.resolve()
    }
  }
}

/// 見た目の本体。**数字も色もここだけ**（Web 側と2か所に持たない）。
final class GlassTabBarView: UIView {
  struct Item { let key: String; let label: String; let icon: String }

  /// 浮かせたぶんの余白と高さ。Web の `NAV_FLOAT` / `NAV_H` と同じ値
  private let floatMargin: CGFloat = 8
  private let barHeight: CGFloat = 58
  /// 選ばれているときの色（`styles/tokens.ts` の `C.cyan`）
  private let activeColor = UIColor(red: 0x5e/255.0, green: 0xd4/255.0, blue: 0xff/255.0, alpha: 1)
  private let idleColor = UIColor(white: 1, alpha: 0.55)

  var onTap: ((String) -> Void)?
  private var effectView: UIVisualEffectView!
  private var stack: UIStackView!
  private var buttons: [String: TabButton] = [:]
  private var extraBottom: CGFloat = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    let effect: UIVisualEffect
    if #available(iOS 26.0, *) {
      // ★本物の Liquid Glass。縁で背景が曲がって光る
      effect = UIGlassEffect()
    } else {
      effect = UIBlurEffect(style: .systemUltraThinMaterialDark)
    }
    effectView = UIVisualEffectView(effect: effect)
    effectView.clipsToBounds = true
    addSubview(effectView)

    stack = UIStackView()
    stack.axis = .horizontal
    stack.distribution = .fillEqually
    stack.alignment = .fill
    effectView.contentView.addSubview(stack)
  }
  required init?(coder: NSCoder) { fatalError() }

  func set(items: [Item], active: String, badges: [String: Int], visible: Bool, bottomInset: CGFloat) {
    extraBottom = bottomInset
    isHidden = !visible
    // 項目が変わったときだけ作り直す（毎回作り直すと押した瞬間の見た目が飛ぶ）
    let keys = items.map { $0.key }
    if keys != stack.arrangedSubviews.compactMap({ ($0 as? TabButton)?.key }) {
      stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
      buttons.removeAll()
      for it in items {
        let b = TabButton(item: it, activeColor: activeColor, idleColor: idleColor)
        b.addTarget(self, action: #selector(tapped(_:)), for: .touchUpInside)
        stack.addArrangedSubview(b)
        buttons[it.key] = b
      }
    }
    for (key, b) in buttons {
      b.setActive(key == active)
      b.setBadge(badges[key] ?? 0)
    }
    setNeedsLayout()
  }

  @objc private func tapped(_ sender: TabButton) { onTap?(sender.key) }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard let host = superview else { return }
    let safe = host.safeAreaInsets.bottom
    let width = min(host.bounds.width, 480) - floatMargin * 2
    let x = (host.bounds.width - width) / 2
    let y = host.bounds.height - safe - extraBottom - barHeight - floatMargin
    frame = CGRect(x: x, y: y, width: width, height: barHeight)
    effectView.frame = bounds
    // ★角は丸めない（このアプリの形。`CLAUDE.md`「角は丸めません」）
    stack.frame = bounds
  }
}

/// タブ1つ。アイコン＋文字＋右上の数字。
final class TabButton: UIControl {
  let key: String
  private let iconView = UIImageView()
  private let labelView = UILabel()
  private let badgeView = UILabel()
  private let activeColor: UIColor
  private let idleColor: UIColor

  init(item: GlassTabBarView.Item, activeColor: UIColor, idleColor: UIColor) {
    self.key = item.key
    self.activeColor = activeColor
    self.idleColor = idleColor
    super.init(frame: .zero)

    iconView.image = UIImage(named: item.icon)?.withRenderingMode(.alwaysTemplate)
    iconView.contentMode = .scaleAspectFit
    addSubview(iconView)

    labelView.text = item.label
    labelView.font = .systemFont(ofSize: 10, weight: .semibold)
    labelView.textAlignment = .center
    addSubview(labelView)

    badgeView.font = .systemFont(ofSize: 10, weight: .bold)
    badgeView.textColor = .white
    badgeView.backgroundColor = UIColor(red: 0xe8/255.0, green: 0x46/255.0, blue: 0x2a/255.0, alpha: 1)
    badgeView.textAlignment = .center
    badgeView.layer.cornerRadius = 8
    badgeView.clipsToBounds = true
    badgeView.isHidden = true
    addSubview(badgeView)
  }
  required init?(coder: NSCoder) { fatalError() }

  func setActive(_ on: Bool) {
    iconView.tintColor = on ? activeColor : idleColor
    labelView.textColor = on ? activeColor : idleColor
  }

  /// ★数え方は Web 側 1本（`notifications/useOnlineBadge`）。ここでは出すだけ。
  ///   99 を超えたら 99+（Web の `CountBadge` と同じ）
  func setBadge(_ n: Int) {
    badgeView.isHidden = n <= 0
    badgeView.text = n > 99 ? "99+" : "\(n)"
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let iconSize: CGFloat = 22
    iconView.frame = CGRect(x: (bounds.width - iconSize) / 2, y: 9, width: iconSize, height: iconSize)
    labelView.frame = CGRect(x: 0, y: iconView.frame.maxY + 3, width: bounds.width, height: 13)
    let w = max(16, badgeView.intrinsicContentSize.width + 8)
    badgeView.frame = CGRect(x: iconView.frame.maxX - 6, y: 5, width: w, height: 16)
  }
}
