import UIKit
internal import Expo
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import KakaoMapsSDK

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  private var reactNativeDelegate: ReactNativeDelegate?
  private var reactNativeFactory: RCTReactNativeFactory?

  override func application(
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
  let factory = ExpoReactNativeFactory(delegate: delegate)
  delegate.dependencyProvider = RCTAppDependencyProvider()

  reactNativeDelegate = delegate
  reactNativeFactory = factory
  // Expo 템플릿과 같이 팩토리를 Expo에 묶어 expo-updates가 번들 시작을 가로챌 수 있게 합니다.
  bindReactNativeFactory(factory)

  window = UIWindow(frame: UIScreen.main.bounds)

  factory.startReactNative(
    withModuleName: "Frontend",
    in: window,
    launchOptions: launchOptions
  )

  return super.application(application, didFinishLaunchingWithOptions: launchOptions)
}

  // ExpoAppDelegate가 같은 메서드를 구현하므로 override로 받고, Expo 구독자에게도 넘깁니다.
  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    let isShareExtensionURL = handleShareExtensionURL(url)
    let isLinkingURL = RCTLinkingManager.application(app, open: url, options: options)
    let isExpoURL = super.application(app, open: url, options: options)

    return isShareExtensionURL || isLinkingURL || isExpoURL
  }

  override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let isLinkingActivity = RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
    let isExpoActivity = super.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )

    return isLinkingActivity || isExpoActivity
  }

  override func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    switch identifier {
    case ShareBackgroundTransfer.extensionIdentifier, ShareBackgroundTransfer.appIdentifier:
      ShareBackgroundTransfer.shared.handleEvents(identifier: identifier, completion: completionHandler)
    case ShareAnalyticsTransfer.extensionIdentifier, ShareAnalyticsTransfer.appIdentifier:
      ShareAnalyticsTransfer.shared.handleEvents(identifier: identifier, completion: completionHandler)
    default:
      super.application(
        application,
        handleEventsForBackgroundURLSession: identifier,
        completionHandler: completionHandler
      )
    }
  }

  private func handleShareExtensionURL(_ url: URL) -> Bool {
    guard
      url.scheme == "com.yeogidamm.app",
      url.host == ShareIntentConstants.shareExtensionHost
    else {
      return false
    }

    // 공유 익스텐션은 앱을 열기만 하면 됩니다. 결과는 앱이 App Group에서 폴링으로 읽습니다.
    return true
  }
}

private final class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
