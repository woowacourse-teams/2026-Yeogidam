import Foundation
import UniformTypeIdentifiers

/// 공유 확장이 접수를 마친 뒤 화면에 알려야 하는 결과입니다. UI 문구는 각 확장이 정합니다.
enum ShareIntakeOutcome {
  case accepted
  case guestPracticeSuccess
  case loginRequired(reason: String)
}

/// Share Extension과 Action Extension이 함께 쓰는 접수 로직입니다. 화면(UI)에는 의존하지 않습니다.
enum ShareIntake {
  static func extractPayload(
    from extensionContext: NSExtensionContext?,
    shareId: String
  ) async throws -> ShareIntentPayload {
    let extensionItems = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
    // 공유 시트의 이번 호출에서 전달된 최신 항목 하나만 사용합니다.
    guard let item = extensionItems.last else {
      throw ShareIntentStorageError.unsupportedContent
    }
    do {
      let subject = item.attributedTitle?.string.trimmingCharacters(in: .whitespacesAndNewlines)

      for provider in item.attachments ?? [] {
        if
          let urlString = try await loadURLString(from: provider),
          ShareIntentStorage.isInstagramContentURL(urlString)
        {
          return ShareIntentStorage.makePayload(
            text: urlString,
            subject: subject,
            mimeType: UTType.url.identifier,
            id: shareId
          )
        }
      }

      for provider in item.attachments ?? [] {
        if let sharedText = try await loadText(from: provider) {
          let payload = ShareIntentStorage.makePayload(
            text: sharedText,
            subject: subject,
            mimeType: UTType.plainText.identifier,
            id: shareId
          )
          if ShareIntentStorage.isInstagramContentURL(payload.text) {
            return payload
          }
        }
      }

      let additionalTexts = [
        item.attributedContentText?.string,
        item.attributedTitle?.string,
      ]
      for additionalText in additionalTexts.compactMap({ $0 }) {
        let payload = ShareIntentStorage.makePayload(
          text: additionalText,
          subject: subject,
          mimeType: UTType.plainText.identifier,
          id: shareId
        )
        if ShareIntentStorage.isInstagramContentURL(payload.text) {
          return payload
        }
      }
    } catch {
      throw error
    }

    throw ShareIntentStorageError.unsupportedContent
  }

  /// 인증 상태에 따라 결과를 저장하고 전송을 등록합니다.
  static func prepareTransfer(
    _ payload: ShareIntentPayload,
    shareId: String
  ) async throws -> ShareIntakeOutcome {
    let auth = await ShareAuth.ensureAccessToken()
    if case .loginRequired(let reason) = auth {
      if payload.text == ShareIntentConstants.guestPracticePostURL {
        ShareAnalyticsStore.record("share_local_save_resolved", shareId: shareId,
          properties: ["outcome": "guest_practice_success"])
        return .guestPracticeSuccess
      }
      return .loginRequired(reason: reason)
    }
    try ShareIntentStorage.saveResult(ShareReelResult(
      requestId: payload.id, url: payload.text, rawSharedText: payload.rawText,
      status: "PENDING", transferStatus: "SAVED", reelId: nil,
      failureReason: nil, retryable: true, updatedAt: Date().timeIntervalSince1970 * 1000,
      release: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
    ))
    ShareAnalyticsStore.record("share_local_save_resolved", shareId: shareId,
      properties: ["outcome": "saved"])
    guard var result = ShareIntentStorage.loadResults().first(where: { $0.requestId == payload.id }) else {
      ShareAnalyticsStore.recordDeliveryStatus(payload.id, status: "deferred", reason: "queue_registration_failed")
      return .accepted
    }
    switch auth {
    case .ready(let token):
      guard await ShareNetwork.isAvailable() else {
        result.transferStatus = "WAITING_FOR_NETWORK"
        result.updatedAt = Date().timeIntervalSince1970 * 1000
        try ShareIntentStorage.saveResult(result)
        ShareSentryReporter.capture(
          "SHARE_EXTRACTION_NETWORK_DEFERRED", stage: "place_extraction_request",
          exceptionType: String(URLError.notConnectedToInternet.rawValue)
        )
        ShareAnalyticsStore.recordDeliveryStatus(payload.id, status: "deferred", reason: "network_unavailable", release: result.release)
        return .accepted
      }
      do {
        try ShareBackgroundTransfer.shared.enqueue(
          requestId: payload.id, url: payload.text, rawText: payload.rawText, token: token
        )
        return .accepted
      } catch {
        ShareAnalyticsStore.recordDeliveryStatus(payload.id, status: "deferred", reason: "queue_registration_failed", release: result.release)
        return .accepted
      }
    case .loginRequired(let reason):
      // 위에서 이미 처리한 상태라 도달하지 않습니다.
      return .loginRequired(reason: reason)
    case .waitingForNetwork:
      result.transferStatus = "WAITING_FOR_NETWORK"
      result.updatedAt = Date().timeIntervalSince1970 * 1000
      try? ShareIntentStorage.saveResult(result)
      ShareAnalyticsStore.recordDeliveryStatus(payload.id, status: "deferred", reason: "network_unavailable", release: result.release)
    case .waitingForAuth:
      result.transferStatus = "WAITING_FOR_AUTH"
      result.updatedAt = Date().timeIntervalSince1970 * 1000
      try? ShareIntentStorage.saveResult(result)
      ShareAnalyticsStore.recordDeliveryStatus(payload.id, status: "deferred", reason: "auth_pending", release: result.release)
    }
    return .accepted
  }

  /// 로그인을 위해 앱으로 넘기기 전에 결과를 저장합니다.
  static func saveLoginHandoff(
    _ payload: ShareIntentPayload,
    isGuestLogin: Bool,
    shareId: String
  ) throws {
    try ShareIntentStorage.saveResult(ShareReelResult(
      requestId: payload.id, url: payload.text, rawSharedText: payload.rawText,
      status: "PENDING", transferStatus: isGuestLogin ? "GUEST_LOGIN_PROMPT" : "LOGIN_HANDOFF", reelId: nil,
      failureReason: nil, retryable: false, updatedAt: Date().timeIntervalSince1970 * 1000,
      release: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
    ))
    ShareAnalyticsStore.record("share_local_save_resolved", shareId: shareId,
      properties: ["outcome": "saved"])
  }

  private static func loadURLString(from provider: NSItemProvider) async throws -> String? {
    guard provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) else {
      return nil
    }

    let item = try await loadItem(
      from: provider,
      typeIdentifier: UTType.url.identifier
    )

    if let url = item as? URL {
      return url.absoluteString
    }

    if let nsUrl = item as? NSURL, let absoluteString = nsUrl.absoluteString {
      return absoluteString
    }

    if let sharedText = item as? String {
      return sharedText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    return nil
  }

  private static func loadText(from provider: NSItemProvider) async throws -> String? {
    let textTypeIdentifiers = [
      UTType.plainText.identifier,
      UTType.text.identifier,
    ]

    for typeIdentifier in textTypeIdentifiers where provider.hasItemConformingToTypeIdentifier(typeIdentifier) {
      let item = try await loadItem(from: provider, typeIdentifier: typeIdentifier)

      if let sharedText = item as? String {
        let trimmedText = sharedText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedText.isEmpty {
          return trimmedText
        }
      }

      if let url = item as? URL {
        return url.absoluteString
      }

      if let data = item as? Data, let sharedText = String(data: data, encoding: .utf8) {
        let trimmedText = sharedText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedText.isEmpty {
          return trimmedText
        }
      }
    }

    return nil
  }

  private static func loadItem(
    from provider: NSItemProvider,
    typeIdentifier: String
  ) async throws -> NSSecureCoding? {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }

        continuation.resume(returning: item)
      }
    }
  }
}
