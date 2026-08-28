import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import KakaoMapsSDK

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  private var reactNativeDelegate: ReactNativeDelegate?
  private var reactNativeFactory: RCTReactNativeFactory?

  func application(
  _ application: UIApplication,
  didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
) -> Bool {
  guard
    let kakaoNativeAppKey =
      Bundle.main.object(forInfoDictionaryKey: "KAKAO_NATIVE_APP_KEY") as? String,
    !kakaoNativeAppKey.isEmpty,
    kakaoNativeAppKey != "$(KAKAO_NATIVE_APP_KEY)"
  else {
    fatalError("KAKAO_NATIVE_APP_KEY가 설정되지 않았습니다.")
  }

  SDKInitializer.InitSDK(appKey: kakaoNativeAppKey)

  let delegate = ReactNativeDelegate()
  let factory = RCTReactNativeFactory(delegate: delegate)
  delegate.dependencyProvider = RCTAppDependencyProvider()

  reactNativeDelegate = delegate
  reactNativeFactory = factory

  window = UIWindow(frame: UIScreen.main.bounds)

  factory.startReactNative(
    withModuleName: "Frontend",
    in: window,
    launchOptions: launchOptions
  )

  return true
}

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    let isShareExtensionURL = handleShareExtensionURL(url)
    let isLinkingURL = RCTLinkingManager.application(app, open: url, options: options)

    return isShareExtensionURL || isLinkingURL
  }

  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }

  private func handleShareExtensionURL(_ url: URL) -> Bool {
    guard
      url.scheme == "com.yeogidamm.app",
      url.host == ShareIntentConstants.shareExtensionHost
    else {
      return false
    }

    ShareIntentModule.notifyPendingShareAvailable()
    return true
  }
}

private final class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
