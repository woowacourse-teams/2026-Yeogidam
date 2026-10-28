import Foundation
import React

@objc(ShareIntentModule)
final class ShareIntentModule: RCTEventEmitter {
  private static weak var currentInstance: ShareIntentModule?
  private var hasListeners = false

  override init() {
    super.init()
    ShareIntentModule.currentInstance = self
  }

  override class func requiresMainQueueSetup() -> Bool {
    true
  }

  override func constantsToExport() -> [AnyHashable: Any]! {
    guard let installationId = ShareAnalyticsInstallationIdentity.id() else { return [:] }
    return ["installationId": installationId]
  }

  override func supportedEvents() -> [String]! {
    [ShareIntentConstants.eventName]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc(getPendingShare:rejecter:)
  func getPendingShare(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(ShareIntentStorage.load()?.dictionaryRepresentation)
  }

  @objc(clearPendingShare:resolver:rejecter:)
  func clearPendingShare(
    _ shareId: String?,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    ShareIntentStorage.clear(expectedId: shareId)
    resolve(nil)
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

  /// 앱의 폴더 목록을 공유 확장이 읽을 수 있도록 App Group에 복사합니다.
  @objc(setShareFolders:resolver:rejecter:)
  func setShareFolders(
    _ raw: [[String: Any]],
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let folders = raw.compactMap { item -> ShareFolder? in
      guard let id = item["id"] as? String,
            let name = item["name"] as? String,
            let color = item["color"] as? String else { return nil }
      return ShareFolder(id: id, name: name, color: color)
    }
    ShareFolderStorage.setAppFolders(folders)
    resolve(nil)
  }

  /// 확장에서 새로 만든 폴더를 가져가고 비웁니다.
  @objc(takeShareFolderDrafts:rejecter:)
  func takeShareFolderDrafts(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(ShareFolderStorage.takeDrafts().map { ["id": $0.id, "name": $0.name, "color": $0.color] })
  }

  /// 공유(requestId)별로 확장에서 고른 폴더 id입니다.
  @objc(getShareFolderSelections:rejecter:)
  func getShareFolderSelections(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(ShareFolderStorage.allSelections())
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

  @objc
  static func notifyPendingShareAvailable() {
    DispatchQueue.main.async {
      currentInstance?.emitPendingShareIfNeeded()
    }
  }

  private func emitPendingShareIfNeeded() {
    guard hasListeners, let payload = ShareIntentStorage.load() else {
      return
    }

    sendEvent(withName: ShareIntentConstants.eventName, body: payload.dictionaryRepresentation)
  }
}
