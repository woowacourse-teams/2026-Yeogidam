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

  @objc(setAccessToken:resolver:rejecter:)
  func setAccessToken(_ token: String?, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    ShareIntentStorage.saveAccessToken(token)
    resolve(nil)
  }

  @objc(setSupabaseConfiguration:publishableKey:resolver:rejecter:)
  func setSupabaseConfiguration(
    _ url: String,
    publishableKey: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    ShareIntentStorage.saveSupabaseConfiguration(url: url, publishableKey: publishableKey)
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
