import Foundation

enum ShareIntentConstants {
  static let appGroupIdentifier = "group.com.yeogidamm.app.shared"
  static let userDefaultsKey = "share_intent_payload"
  static let shareExtensionHost = "share-extension"
  static let shareExtensionOpenURL = URL(string: "com.yeogidamm.app://share-extension")!
  static let eventName = "shareIntentReceived"
  static let authTokenKey = "auth_access_token"
  // Legacy single-result key. Kept only so existing installed builds can migrate
  // an unconsumed result after updating.
  static let shareResultKey = "share_reel_result"
  static let shareResultKeyPrefix = "share_reel_result."
}

struct ShareReelResult: Codable {
  var requestId: String? = nil
  var requestSentAt: Double? = nil
  let url: String
  var rawSharedText: String?
  var status: String
  var reelId: String?
  var failureReason: String?
  var retryable: Bool
  var updatedAt: Double
  var reused: Bool? = nil
}

struct ShareIntentPayload: Codable {
  let id: String
  let action: String
  let mimeType: String
  let text: String
  let rawText: String?
  let subject: String?
  let kind: String
  let receivedAt: Double

  init(
    action: String,
    mimeType: String,
    text: String,
    rawText: String? = nil,
    subject: String?,
    kind: String,
    id: String = UUID().uuidString,
    receivedAt: Double = Date().timeIntervalSince1970 * 1000
  ) {
    self.id = id
    self.action = action
    self.mimeType = mimeType
    self.text = text
    self.rawText = rawText
    self.subject = subject
    self.kind = kind
    self.receivedAt = receivedAt
  }

  var dictionaryRepresentation: [String: Any] {
    [
      "id": id,
      "action": action,
      "mimeType": mimeType,
      "text": text,
      "rawText": rawText as Any,
      "subject": subject as Any,
      "kind": kind,
      "receivedAt": receivedAt,
    ]
  }
}

enum ShareIntentStorageError: LocalizedError {
  case appGroupUnavailable
  case unsupportedContent

  var errorDescription: String? {
    switch self {
    case .appGroupUnavailable:
      return "App Group container could not be resolved."
    case .unsupportedContent:
      return "No supported shared content was found."
    }
  }
}

enum ShareIntentStorage {
  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier)
  }

  static func saveAccessToken(_ token: String?) {
    guard let defaults else { return }
    if let token, !token.isEmpty { defaults.set(token, forKey: ShareIntentConstants.authTokenKey) }
    else { defaults.removeObject(forKey: ShareIntentConstants.authTokenKey) }
  }

  static func accessToken() -> String? { defaults?.string(forKey: ShareIntentConstants.authTokenKey) }

  static func saveResult(_ result: ShareReelResult) throws {
    guard let defaults else {
      throw ShareIntentStorageError.appGroupUnavailable
    }
    let encoded = try JSONEncoder().encode(result)
    let storageKey = result.requestId.flatMap { requestId in
      requestId.isEmpty ? nil : "\(ShareIntentConstants.shareResultKeyPrefix)\(requestId)"
    } ?? ShareIntentConstants.shareResultKey
    defaults.set(encoded, forKey: storageKey)
    defaults.synchronize()
  }

  static func loadResult() -> ShareReelResult? {
    loadResults().first
  }

  static func loadResults() -> [ShareReelResult] {
    guard let defaults else { return [] }
    defaults.synchronize()

    let decoder = JSONDecoder()
    var results = defaults.dictionaryRepresentation().compactMap { key, value -> ShareReelResult? in
      guard
        key.hasPrefix(ShareIntentConstants.shareResultKeyPrefix),
        let data = value as? Data
      else {
        return nil
      }
      return try? decoder.decode(ShareReelResult.self, from: data)
    }

    // Preserve one result written by an older single-slot build until the app
    // consumes it. A keyed result with the same requestId takes precedence.
    if
      let legacyData = defaults.data(forKey: ShareIntentConstants.shareResultKey),
      let legacyResult = try? decoder.decode(ShareReelResult.self, from: legacyData),
      !results.contains(where: { $0.requestId != nil && $0.requestId == legacyResult.requestId })
    {
      results.append(legacyResult)
    }

    return results.sorted {
      ($0.requestSentAt ?? $0.updatedAt) < ($1.requestSentAt ?? $1.updatedAt)
    }
  }

  static func clearResult(expectedRequestId: String? = nil) {
    guard let defaults else {
      return
    }

    if let expectedRequestId, !expectedRequestId.isEmpty {
      defaults.removeObject(
        forKey: "\(ShareIntentConstants.shareResultKeyPrefix)\(expectedRequestId)"
      )
      if
        let legacyData = defaults.data(forKey: ShareIntentConstants.shareResultKey),
        let legacyResult = try? JSONDecoder().decode(ShareReelResult.self, from: legacyData),
        legacyResult.requestId == expectedRequestId
      {
        defaults.removeObject(forKey: ShareIntentConstants.shareResultKey)
      }
    } else {
      // A result without requestId can only address the legacy single slot.
      // Never remove keyed results belonging to other shares.
      defaults.removeObject(forKey: ShareIntentConstants.shareResultKey)
    }
    defaults.synchronize()
  }

  static func makePayload(text: String, subject: String?, mimeType: String) -> ShareIntentPayload {
    let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let extractedText = firstURLString(in: trimmedText) ?? trimmedText

    return ShareIntentPayload(
      action: "ACTION_SEND",
      mimeType: mimeType,
      text: normalizeInstagramURL(extractedText),
      rawText: trimmedText,
      subject: subject,
      kind: inferKind(from: extractedText)
    )
  }

  private static func firstURLString(in text: String) -> String? {
    guard
      let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue),
      !text.isEmpty
    else {
      return nil
    }

    let matches = detector.matches(
        in: text,
        options: [],
        range: NSRange(location: 0, length: text.utf16.count)
      )
    let urls = matches.compactMap(\.url)
    if let contentURL = urls.first(where: { isInstagramContentURL($0.absoluteString) }) {
      return contentURL.absoluteString
    }
    return urls.first?.absoluteString
  }

  static func isInstagramContentURL(_ value: String) -> Bool {
    guard
      let url = URL(string: value),
      let host = url.host?.lowercased(),
      host == "instagram.com" || host == "www.instagram.com"
    else {
      return false
    }
    let pathParts = url.path.split(separator: "/").map(String.init)
    guard
      let contentIndex = pathParts.firstIndex(where: { $0 == "reel" || $0 == "p" })
    else {
      return false
    }
    return pathParts.indices.contains(contentIndex + 1) && !pathParts[contentIndex + 1].isEmpty
  }

  private static func normalizeInstagramURL(_ value: String) -> String {
    guard
      let url = URL(string: value),
      let host = url.host?.lowercased(),
      host == "instagram.com" || host == "www.instagram.com"
    else {
      return value
    }

    var components = URLComponents()
    components.scheme = "https"
    components.host = "www.instagram.com"
    let pathParts = url.path.split(separator: "/").map(String.init)
    if
      let contentIndex = pathParts.firstIndex(where: { $0 == "reel" || $0 == "p" }),
      pathParts.indices.contains(contentIndex + 1)
    {
      let contentType = pathParts[contentIndex]
      let shortcode = pathParts[contentIndex + 1]
      components.path = "/\(contentType)/\(shortcode)/"
    } else {
      components.path = url.path.hasSuffix("/") ? url.path : "\(url.path)/"
    }
    return components.url?.absoluteString ?? value
  }

  static func save(_ payload: ShareIntentPayload) throws {
    guard let userDefaults = UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier) else {
      throw ShareIntentStorageError.appGroupUnavailable
    }

    let encodedPayload = try JSONEncoder().encode(payload)
    userDefaults.set(encodedPayload, forKey: ShareIntentConstants.userDefaultsKey)
  }

  static func load() -> ShareIntentPayload? {
    guard
      let userDefaults = UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier),
      let encodedPayload = userDefaults.data(forKey: ShareIntentConstants.userDefaultsKey)
    else {
      return nil
    }

    return try? JSONDecoder().decode(ShareIntentPayload.self, from: encodedPayload)
  }

  static func clear(expectedId: String? = nil) {
    guard let userDefaults = UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier) else {
      return
    }

    if let expectedId, let payload = load(), payload.id != expectedId {
      return
    }

    userDefaults.removeObject(forKey: ShareIntentConstants.userDefaultsKey)
  }

  static func inferKind(from text: String) -> String {
    guard
      let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue),
      let match = detector.firstMatch(
        in: text,
        options: [],
        range: NSRange(location: 0, length: text.utf16.count)
      ),
      match.range.length == text.utf16.count
    else {
      return "text"
    }

    return match.url == nil ? "text" : "url"
  }
}
