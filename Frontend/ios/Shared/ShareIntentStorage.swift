import Foundation

enum ShareIntentConstants {
  static let appGroupIdentifier = "group.com.yeogidamm.app.shared"
  static let userDefaultsKey = "share_intent_payload"
  static let shareExtensionHost = "share-extension"
  static let shareExtensionOpenURL = URL(string: "com.yeogidamm.app://share-extension")!
  static let eventName = "shareIntentReceived"
}

struct ShareIntentPayload: Codable {
  let id: String
  let action: String
  let mimeType: String
  let text: String
  let subject: String?
  let kind: String
  let receivedAt: Double

  init(
    action: String,
    mimeType: String,
    text: String,
    subject: String?,
    kind: String,
    id: String = UUID().uuidString,
    receivedAt: Double = Date().timeIntervalSince1970 * 1000
  ) {
    self.id = id
    self.action = action
    self.mimeType = mimeType
    self.text = text
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
  static func makePayload(text: String, subject: String?, mimeType: String) -> ShareIntentPayload {
    let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)

    return ShareIntentPayload(
      action: "ACTION_SEND",
      mimeType: mimeType,
      text: trimmedText,
      subject: subject,
      kind: inferKind(from: trimmedText)
    )
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
