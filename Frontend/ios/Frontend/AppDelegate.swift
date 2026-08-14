import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import KakaoMapsSDK

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

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
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
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
