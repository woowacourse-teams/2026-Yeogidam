import Foundation
import React

@objc(ShareIntentModule)
final class ShareIntentModule: RCTEventEmitter {
  override class func requiresMainQueueSetup() -> Bool {
    true
  }

  override func constantsToExport() -> [AnyHashable: Any]! {
    guard let installationId = ShareAnalyticsInstallationIdentity.id() else { return [:] }
    return ["installationId": installationId]
  }

  /// 앱은 네이티브 결과를 폴링으로 읽으므로 JS로 보내는 이벤트가 없습니다.
  override func supportedEvents() -> [String]! {
    []
  }

  @objc(setShareSession:resolver:rejecter:)
  func setShareSession(_ raw: [String: Any]?, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      let session: ShareAuthSession? = raw.flatMap {
        guard let access = $0["accessToken"] as? String,
              let refresh = $0["refreshToken"] as? String,
              let expiresAt = $0["expiresAt"] as? Double,
              let userId = $0["userId"] as? String else { return nil }
        return ShareAuthSession(accessToken: access, refreshToken: refresh, expiresAt: expiresAt, userId: userId)
      }
      try ShareIntentStorage.saveSession(session)
      resolve(nil)
    } catch {
      reject("SHARE_AUTH_STORE", "공유 세션을 저장하지 못했습니다.", error)
    }
  }

  @objc(getShareSession:rejecter:)
  func getShareSession(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      guard let session = try ShareIntentStorage.loadSession(),
            let data = try? JSONEncoder().encode(session),
            let object = try? JSONSerialization.jsonObject(with: data) else {
        resolve(nil)
        return
      }
      resolve(object)
    } catch {
      reject("SHARE_AUTH_STORE", "공유 세션을 읽지 못했습니다.", error)
    }
  }

  @objc(resumeWaitingShares:rejecter:)
  func resumeWaitingShares(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    Task {
      await ShareBackgroundTransfer.shared.resumeWaitingShares()
      resolve(nil)
    }
  }

  @objc(setApiConfiguration:resolver:rejecter:)
  func setApiConfiguration(
    _ url: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    ShareIntentStorage.saveApiConfiguration(url: url)
    resolve(nil)
  }

  @objc(setPostHogConfiguration:host:resolver:rejecter:)
  func setPostHogConfiguration(
    _ projectToken: String,
    host: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    ShareAnalyticsStore.setConfiguration(projectToken: projectToken, host: host)
    resolve(nil)
  }

  @objc(getShareResult:rejecter:)
  func getShareResult(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guard let result = ShareIntentStorage.loadResult(), let data = try? JSONEncoder().encode(result), let object = try? JSONSerialization.jsonObject(with: data) else { resolve(nil); return }
    resolve(object)
  }

  @objc(getShareResults:rejecter:)
  func getShareResults(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let results = ShareIntentStorage.loadResults()
    guard
      let data = try? JSONEncoder().encode(results),
      let object = try? JSONSerialization.jsonObject(with: data)
    else {
      resolve([])
      return
    }
    resolve(object)
  }

  @objc(clearShareResult:resolver:rejecter:)
  func clearShareResult(
    _ requestId: String?,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    ShareIntentStorage.clearResult(expectedRequestId: requestId)
    resolve(nil)
  }

  @objc(getPendingShareAnalyticsEvents:rejecter:)
  func getPendingShareAnalyticsEvents(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(ShareAnalyticsStore.pending())
  }

  @objc(acknowledgeShareAnalyticsEvent:resolver:rejecter:)
  func acknowledgeShareAnalyticsEvent(
    _ id: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock
  ) {
    ShareAnalyticsStore.acknowledge(id)
    resolve(nil)
  }
}
