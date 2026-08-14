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
