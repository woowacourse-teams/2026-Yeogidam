import Foundation
import Security
import Darwin

enum ShareIntentConstants {
  static let appGroupIdentifier = "group.com.yeogidamm.app.shared"
  static let userDefaultsKey = "share_intent_payload"
  static let shareExtensionHost = "share-extension"
  static let shareExtensionOpenURL = URL(string: "com.yeogidamm.app://share-extension")!
  static let eventName = "shareIntentReceived"
  static let authTokenKey = "auth_access_token"
  static let authSessionKey = "share_auth_session_v1"
  static let hadSessionKey = "share_had_session"
  static let supabaseURLKey = "supabase_url"
  static let supabasePublishableKeyKey = "supabase_publishable_key"
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
  var transferStatus: String? = nil
  var authReason: String? = nil
  var reelId: String?
  var failureReason: String?
  var retryable: Bool
  var updatedAt: Double
  var reused: Bool? = nil
  var saveMode: String? = nil
  var receivedAt: Double? = nil
  var queuedAt: Double? = nil
  var apiAcceptedAt: Double? = nil
  var transferFinishedAt: Double? = nil
  var release: String? = nil
}

struct ShareAuthSession: Codable {
  let accessToken: String
  let refreshToken: String
  let expiresAt: Double
  let userId: String
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
  case missingConfiguration
  case secureStoreFailure(OSStatus)
  case resultStoreFailure

  var errorDescription: String? {
    switch self {
    case .appGroupUnavailable:
      return "App Group container could not be resolved."
    case .unsupportedContent:
      return "No supported shared content was found."
    case .missingConfiguration:
      return "Missing Supabase configuration."
    case .secureStoreFailure(let code):
      return "Share credential store failed: \(code)."
    case .resultStoreFailure:
      return "Share result could not be saved."
    }
  }
}

enum ShareIntentStorage {
  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier)
  }

  private static var sessionQuery: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: ShareIntentConstants.authSessionKey,
      kSecAttrAccount as String: "supabase",
      kSecAttrAccessGroup as String: ShareIntentConstants.appGroupIdentifier,
    ]
  }

  static func loadSession() throws -> ShareAuthSession? {
    var query = sessionQuery
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw ShareIntentStorageError.secureStoreFailure(status)
    }
    return try JSONDecoder().decode(ShareAuthSession.self, from: data)
  }

  static func saveSession(_ session: ShareAuthSession?) throws {
    if let session,
       let current = try loadSession(),
       current.userId == session.userId,
       current.expiresAt >= session.expiresAt,
       (!current.accessToken.isEmpty || session.accessToken.isEmpty),
       !(session.accessToken.isEmpty && current.refreshToken != session.refreshToken &&
         current.expiresAt <= Date().timeIntervalSince1970 + 60) {
      return
    }
    guard let session else {
      let deletion = SecItemDelete(sessionQuery as CFDictionary)
      guard deletion == errSecSuccess || deletion == errSecItemNotFound else {
        throw ShareIntentStorageError.secureStoreFailure(deletion)
      }
      return
    }
    let data = try JSONEncoder().encode(session)
    let status = SecItemUpdate(
      sessionQuery as CFDictionary,
      [kSecValueData as String: data] as CFDictionary
    )
    if status == errSecItemNotFound {
      var attributes = sessionQuery
      attributes[kSecValueData as String] = data
      attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      let added = SecItemAdd(attributes as CFDictionary, nil)
      guard added == errSecSuccess else {
        throw ShareIntentStorageError.secureStoreFailure(added)
      }
    } else {
      guard status == errSecSuccess else {
        throw ShareIntentStorageError.secureStoreFailure(status)
      }
    }
    defaults?.set(true, forKey: ShareIntentConstants.hadSessionKey)
    defaults?.removeObject(forKey: ShareIntentConstants.authTokenKey)
  }

  static func hadSession() -> Bool {
    defaults?.bool(forKey: ShareIntentConstants.hadSessionKey) ?? false
  }

  static func saveSupabaseConfiguration(url: String, publishableKey: String) {
    guard let defaults else { return }
    defaults.set(url, forKey: ShareIntentConstants.supabaseURLKey)
    defaults.set(publishableKey, forKey: ShareIntentConstants.supabasePublishableKeyKey)
    defaults.synchronize()
  }

  static func supabaseConfiguration() -> (url: String, publishableKey: String)? {
    guard
      let defaults,
      let url = defaults.string(forKey: ShareIntentConstants.supabaseURLKey),
      !url.isEmpty,
      let publishableKey = defaults.string(forKey: ShareIntentConstants.supabasePublishableKeyKey),
      !publishableKey.isEmpty
    else {
      return nil
    }
    return (url, publishableKey)
  }

  static func saveResult(_ result: ShareReelResult) throws {
    guard let defaults else {
      throw ShareIntentStorageError.appGroupUnavailable
    }
    let storageKey = result.requestId.flatMap { requestId in
      requestId.isEmpty ? nil : "\(ShareIntentConstants.shareResultKeyPrefix)\(requestId)"
    } ?? ShareIntentConstants.shareResultKey
    let previous = defaults.data(forKey: storageKey).flatMap {
      try? JSONDecoder().decode(ShareReelResult.self, from: $0)
    }
    var stored = result
    stored.receivedAt = previous?.receivedAt ?? result.receivedAt
      ?? (previous == nil ? result.updatedAt : nil)
    stored.queuedAt = previous?.queuedAt ?? result.queuedAt
      ?? (result.transferStatus == "QUEUED" ? result.updatedAt : nil)
    stored.apiAcceptedAt = previous?.apiAcceptedAt ?? result.apiAcceptedAt
      ?? (result.transferStatus == "API_SUCCEEDED" ? result.updatedAt : nil)
    stored.transferFinishedAt = previous?.transferFinishedAt ?? result.transferFinishedAt
      ?? (["API_SUCCEEDED", "API_FAILED"].contains(result.transferStatus ?? "") ? result.updatedAt : nil)
    stored.release = previous?.release ?? result.release
    let encoded = try JSONEncoder().encode(stored)
    defaults.set(encoded, forKey: storageKey)
    defaults.synchronize()
    guard defaults.data(forKey: storageKey) == encoded else {
      throw ShareIntentStorageError.resultStoreFailure
    }
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

  static func makePayload(text: String, subject: String?, mimeType: String, id: String) -> ShareIntentPayload {
    let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let extractedText = firstURLString(in: trimmedText) ?? trimmedText

    return ShareIntentPayload(
      action: "ACTION_SEND",
      mimeType: mimeType,
      text: normalizeInstagramURL(extractedText),
      rawText: trimmedText,
      subject: subject,
      kind: inferKind(from: extractedText),
      id: id
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

enum ShareAnalyticsInstallationIdentity {
  static func id() -> String? {
    guard let directory = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: ShareIntentConstants.appGroupIdentifier
    ) else { return nil }

    let lockURL = directory.appendingPathComponent("posthog_installation_id.lock")
    let descriptor = open(lockURL.path, O_CREAT | O_RDWR, 0o600)
    guard descriptor >= 0 else { return nil }
    defer { close(descriptor) }
    guard flock(descriptor, LOCK_EX) == 0 else { return nil }
    defer { flock(descriptor, LOCK_UN) }

    let fileURL = directory.appendingPathComponent("posthog_installation_id")
    if let stored = try? String(contentsOf: fileURL, encoding: .utf8) {
      let normalized = stored.trimmingCharacters(in: .whitespacesAndNewlines)
      if UUID(uuidString: normalized) != nil { return normalized }
    }

    let created = UUID().uuidString.lowercased()
    do {
      try created.write(to: fileURL, atomically: true, encoding: .utf8)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      var mutableURL = fileURL
      try mutableURL.setResourceValues(values)
      return created
    } catch {
      try? FileManager.default.removeItem(at: fileURL)
      return nil
    }
  }
}

enum ShareAnalyticsStore {
  private static let prefix = "share_analytics_event."
  private static let seenPrefix = "share_analytics_seen."
  private static let identityPrefix = "share_analytics_identity."
  private static let statusPrefix = "share_analytics_delivery_status."
  private static let statusSequencePrefix = "share_analytics_delivery_sequence."
  private static let tokenKey = "posthog_project_token"
  private static let hostKey = "posthog_host"
  private static let allowedProperties: [String: Set<String>] = [
    "reel_share_received": [],
    "reel_share_feedback_viewed": ["feedback_type"],
    "share_local_save_resolved": ["outcome"],
    "share_delivery_status_changed": ["delivery_status", "reason"],
    "extraction_request_started": [],
    "extraction_request_finished": ["outcome", "response_status", "failure_type", "content_id"],
  ]

  private static func eventEnvironment() -> String {
    let value = (Bundle.main.object(forInfoDictionaryKey: "APP_ENV") as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return value.flatMap { !$0.isEmpty && !$0.contains("$(") ? $0 : nil } ?? "development"
  }

  static func setConfiguration(projectToken: String, host: String) {
    guard let defaults = UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier) else { return }
    let normalizedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
      .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let token = projectToken.trimmingCharacters(in: .whitespacesAndNewlines)
    let previous = configuration()
    let valid = !token.isEmpty && validHost(normalizedHost)
    defaults.set(valid ? token : "", forKey: tokenKey)
    defaults.set(valid ? normalizedHost : "", forKey: hostKey)
    defaults.synchronize()
    if valid && (previous?.token != token || previous?.host != normalizedHost) {
      ShareAnalyticsTransfer.shared.enqueuePending()
    }
  }

  static func configuration() -> (token: String, host: String)? {
    let defaults = UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier)
    defaults?.synchronize()
    if let token = defaults?.string(forKey: tokenKey), !token.isEmpty,
       let host = defaults?.string(forKey: hostKey), validHost(host) {
      return (token, host)
    }
    guard let token = Bundle.main.object(forInfoDictionaryKey: "POSTHOG_PROJECT_TOKEN") as? String,
          !token.isEmpty, !token.contains("$("),
          let host = Bundle.main.object(forInfoDictionaryKey: "POSTHOG_HOST") as? String,
          validHost(host) else { return nil }
    return (token, host)
  }

  private static func validHost(_ host: String) -> Bool {
    guard let parts = URLComponents(string: host) else { return false }
    return parts.scheme == "https" && parts.host != nil && parts.user == nil &&
      parts.password == nil && (parts.path.isEmpty || parts.path == "/") &&
      parts.query == nil && parts.fragment == nil
  }

  @discardableResult
  static func record(_ name: String, shareId: String, properties: [String: Any] = [:], occurredAt: Double = Date().timeIntervalSince1970 * 1000, release: String? = nil, eventKey: String? = nil) -> Bool {
    guard let defaults = UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier) else { return false }
    defaults.synchronize()
    let id = eventKey ?? "\(name).\(shareId)"
    let key = "\(prefix)\(id)"
    let identityKey = "\(identityPrefix)\(shareId)"
    if defaults.data(forKey: key) != nil || defaults.bool(forKey: "\(seenPrefix)\(id)") { return true }
    var safeProperties = properties
    safeProperties["platform"] = "ios"
    safeProperties["release"] = release ?? Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
    safeProperties["environment"] = eventEnvironment()
    if let installationId = ShareAnalyticsInstallationIdentity.id() {
      safeProperties["installation_id"] = installationId
    }
    let storedUserId = (try? ShareIntentStorage.loadSession())?.userId
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let distinctId = defaults.string(forKey: identityKey).flatMap { $0.isEmpty ? nil : $0 }
      ?? storedUserId.flatMap { $0.isEmpty ? nil : $0 }
      ?? shareId
    let event: [String: Any] = [
      "id": id, "uuid": UUID().uuidString.lowercased(), "name": name, "share_id": shareId,
      "distinct_id": distinctId, "occurred_at": occurredAt, "properties": safeProperties,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: event) else { return false }
    defaults.set(data, forKey: key)
    defaults.set(true, forKey: "\(seenPrefix)\(id)")
    defaults.set(distinctId, forKey: identityKey)
    defaults.synchronize()
    let saved = defaults.data(forKey: key) == data
    if saved { ShareAnalyticsTransfer.shared.enqueue(event: event) }
    return saved
  }

  @discardableResult
  static func recordDeliveryStatus(_ shareId: String, status: String, reason: String? = nil, release: String? = nil) -> Bool {
    guard let defaults = UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier) else { return false }
    defaults.synchronize()
    let state = "\(status).\(reason ?? "")"
    if defaults.string(forKey: "\(statusPrefix)\(shareId)") == state { return true }
    let sequence = defaults.integer(forKey: "\(statusSequencePrefix)\(shareId)") + 1
    var properties: [String: Any] = ["delivery_status": status]
    if let reason { properties["reason"] = reason }
    let saved = record("share_delivery_status_changed", shareId: shareId, properties: properties,
      release: release, eventKey: "share_delivery_status_changed.\(shareId).\(sequence)")
    if saved {
      defaults.set(state, forKey: "\(statusPrefix)\(shareId)")
      defaults.set(sequence, forKey: "\(statusSequencePrefix)\(shareId)")
      defaults.synchronize()
    }
    return saved
  }

  static func pending() -> [[String: Any]] {
    guard let defaults = UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier) else { return [] }
    defaults.synchronize()
    return defaults.dictionaryRepresentation().compactMap { key, value in
      guard key.hasPrefix(prefix), let data = value as? Data else { return nil }
      return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }.sorted {
      ($0["occurred_at"] as? Double ?? 0) < ($1["occurred_at"] as? Double ?? 0)
    }
  }

  static func acknowledge(_ id: String) {
    guard let defaults = UserDefaults(suiteName: ShareIntentConstants.appGroupIdentifier) else { return }
    defaults.removeObject(forKey: "\(prefix)\(id)")
    defaults.synchronize()
  }

  static func captureBody(event: [String: Any], projectToken: String) -> Data? {
    guard let name = event["name"] as? String,
          let allowed = allowedProperties[name],
          let shareId = event["share_id"] as? String, !shareId.isEmpty,
          let occurredAt = event["occurred_at"] as? Double, occurredAt > 0 else { return nil }
    let storedDistinctId = (event["distinct_id"] as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let distinctId = storedDistinctId.flatMap { $0.isEmpty ? nil : $0 } ?? shareId
    let source = event["properties"] as? [String: Any] ?? [:]
    var properties: [String: Any] = [:]
    for key in allowed.union(["platform", "release", "environment", "installation_id"]) {
      properties[key] = source[key]
    }
    if let recordedEnvironment = (properties["environment"] as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines), !recordedEnvironment.isEmpty {
      properties["environment"] = recordedEnvironment
    } else {
      properties["environment"] = eventEnvironment()
    }
    properties["share_id"] = shareId
    if distinctId == shareId { properties["$process_person_profile"] = false }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    var body: [String: Any] = [
      "api_key": projectToken, "event": name, "distinct_id": distinctId,
      "timestamp": formatter.string(from: Date(timeIntervalSince1970: occurredAt / 1000)),
      "properties": properties,
    ]
    if let uuid = event["uuid"] as? String, !uuid.isEmpty { body["uuid"] = uuid }
    return try? JSONSerialization.data(withJSONObject: body)
  }
}

/** Background uploads from the share extension and containing app use separate sessions. */
final class ShareAnalyticsTransfer: NSObject, URLSessionTaskDelegate {
  static let shared = ShareAnalyticsTransfer()
  static let extensionIdentifier = "com.yeogidamm.app.share-analytics-extension"
  static let appIdentifier = "com.yeogidamm.app.share-analytics-app"
  private var sessions: [String: URLSession] = [:]
  private let sessionLock = NSLock()
  private var eventsCompletion: [String: () -> Void] = [:]

  private var ownIdentifier: String {
    Bundle.main.bundleURL.pathExtension == "appex" ? Self.extensionIdentifier : Self.appIdentifier
  }

  private var uploadDirectory: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ShareIntentConstants.appGroupIdentifier)?
      .appendingPathComponent("share-analytics-uploads", isDirectory: true)
  }

  private func session(for identifier: String) -> URLSession {
    sessionLock.lock()
    defer { sessionLock.unlock() }
    if let existing = sessions[identifier] { return existing }
    let configuration = URLSessionConfiguration.background(withIdentifier: identifier)
    configuration.sharedContainerIdentifier = ShareIntentConstants.appGroupIdentifier
    configuration.sessionSendsLaunchEvents = true
    let created = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    sessions[identifier] = created
    return created
  }

  func enqueue(event: [String: Any]) {
    guard let config = ShareAnalyticsStore.configuration(),
          let endpoint = URL(string: "\(config.host)/i/v0/e/"),
          let data = ShareAnalyticsStore.captureBody(event: event, projectToken: config.token),
          let id = event["id"] as? String,
          let directory = uploadDirectory else { return }
    var bodyFile: URL?
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let filename = "\(UUID().uuidString).json"
      let file = directory.appendingPathComponent(filename)
      bodyFile = file
      try data.write(to: file, options: .atomic)
      var request = URLRequest(url: endpoint)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      let task = session(for: ownIdentifier).uploadTask(with: request, fromFile: file)
      task.taskDescription = "\(id)|\(filename)"
      task.resume()
    } catch {
      if let bodyFile { try? FileManager.default.removeItem(at: bodyFile) }
      // The event remains in the app group outbox for the next app launch.
    }
  }

  func enqueuePending() {
    for event in ShareAnalyticsStore.pending() { enqueue(event: event) }
  }

  func handleEvents(identifier: String, completion: @escaping () -> Void) {
    eventsCompletion[identifier] = completion
    _ = session(for: identifier)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let description = task.taskDescription,
          let separator = description.firstIndex(of: "|") else { return }
    let id = String(description[..<separator])
    let filename = String(description[description.index(after: separator)...])
    if error == nil, let response = task.response as? HTTPURLResponse,
       (200..<300).contains(response.statusCode) {
      ShareAnalyticsStore.acknowledge(id)
    }
    if let directory = uploadDirectory {
      try? FileManager.default.removeItem(at: directory.appendingPathComponent(filename))
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    guard let identifier = session.configuration.identifier else { return }
    DispatchQueue.main.async {
      self.eventsCompletion.removeValue(forKey: identifier)?()
    }
  }
}

enum ShareAuthOutcome {
  case ready(String)
  case loginRequired(String)
  case waitingForNetwork
  case waitingForAuth
}

enum ShareAuth {
  static func ensureAccessToken(forceRefresh: Bool = false) async -> ShareAuthOutcome {
    let session: ShareAuthSession
    do {
      guard let stored = try ShareIntentStorage.loadSession() else {
        return .loginRequired(ShareIntentStorage.hadSession() ? "refresh_token_missing" : "never_logged_in")
      }
      session = stored
    } catch {
      return .waitingForAuth
    }
    if session.refreshToken.isEmpty {
      return .loginRequired("refresh_token_missing")
    }
    if !forceRefresh && !session.accessToken.isEmpty &&
       session.expiresAt > Date().timeIntervalSince1970 + 60 {
      return .ready(session.accessToken)
    }
    guard let config = ShareIntentStorage.supabaseConfiguration(),
          let endpoint = URL(string: "\(config.url)/auth/v1/token?grant_type=refresh_token") else {
      return .waitingForAuth
    }
    var request = URLRequest(url: endpoint, timeoutInterval: 12)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["refresh_token": session.refreshToken])
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse else { return .waitingForAuth }
      let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
      if (200..<300).contains(http.statusCode) {
        if let latest = try? ShareIntentStorage.loadSession(),
           latest.refreshToken != session.refreshToken {
          return latest.accessToken.isEmpty ? .waitingForAuth : .ready(latest.accessToken)
        }
        guard let access = json["access_token"] as? String, !access.isEmpty,
              let refresh = json["refresh_token"] as? String, !refresh.isEmpty else {
          return .waitingForAuth
        }
        let expiresAt = (json["expires_at"] as? Double)
          ?? (Date().timeIntervalSince1970 + ((json["expires_in"] as? Double) ?? 0))
        do {
          try ShareIntentStorage.saveSession(ShareAuthSession(
            accessToken: access, refreshToken: refresh, expiresAt: expiresAt, userId: session.userId
          ))
          return .ready(access)
        } catch { return .waitingForAuth }
      }
      let code = json["error_code"] as? String ?? json["code"] as? String ?? ""
      if (400...401).contains(http.statusCode),
         ["refresh_token_not_found", "refresh_token_already_used", "invalid_grant", "session_not_found"].contains(code) {
        if let latest = try? ShareIntentStorage.loadSession(),
           latest.refreshToken != session.refreshToken {
          return latest.accessToken.isEmpty ? .waitingForAuth : .ready(latest.accessToken)
        }
        try? ShareIntentStorage.saveSession(nil)
        return .loginRequired("refresh_token_invalid")
      }
      return .waitingForAuth
    } catch {
      return .waitingForNetwork
    }
  }
}

final class ShareBackgroundTransfer: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
  static let shared = ShareBackgroundTransfer()
  static let identifier = "com.yeogidamm.app.instagram-share-upload"
  private var responseData: [Int: Data] = [:]
  private var eventsCompletion: (() -> Void)?

  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
    configuration.sharedContainerIdentifier = ShareIntentConstants.appGroupIdentifier
    configuration.sessionSendsLaunchEvents = true
    return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }()

  private var uploadDirectory: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ShareIntentConstants.appGroupIdentifier)?
      .appendingPathComponent("share-uploads", isDirectory: true)
  }

  func enqueue(requestId: String, url: String, rawText: String?, token: String) throws {
    guard let config = ShareIntentStorage.supabaseConfiguration(),
          let endpoint = URL(string: "\(config.url)/functions/v1/save-instagram-reel-v2"),
          let directory = uploadDirectory else { throw ShareIntentStorageError.appGroupUnavailable }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let bodyFile = directory.appendingPathComponent("\(requestId).json")
    let body = try JSONSerialization.data(withJSONObject: [
      "instagramUrl": url, "source": "instagram_share", "clientRequestId": requestId,
    ])
    try body.write(to: bodyFile, options: .atomic)
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    let task = session.uploadTask(with: request, fromFile: bodyFile)
    task.taskDescription = requestId
    do {
      try ShareIntentStorage.saveResult(ShareReelResult(
        requestId: requestId, url: url, rawSharedText: rawText,
        status: "PENDING", transferStatus: "QUEUED", reelId: nil,
        failureReason: nil, retryable: true, updatedAt: Date().timeIntervalSince1970 * 1000
      ))
      ShareAnalyticsStore.recordDeliveryStatus(requestId, status: "queued")
      task.resume()
    } catch {
      task.cancel()
      try? FileManager.default.removeItem(at: bodyFile)
      throw error
    }
  }

  func handleEvents(completion: @escaping () -> Void) {
    eventsCompletion = completion
    _ = session
  }

  func resumeWaitingShares() async {
    let waiting = ShareIntentStorage.loadResults().filter {
      ["SAVED", "WAITING_FOR_NETWORK", "WAITING_FOR_AUTH", "LOGIN_REQUIRED"].contains($0.transferStatus ?? "")
    }
    for result in waiting {
      guard let requestId = result.requestId, !result.url.isEmpty else { continue }
      let auth = await ShareAuth.ensureAccessToken(
        forceRefresh: result.failureReason == "AUTH401_002"
      )
      switch auth {
      case .ready(let token):
        do {
          try enqueue(requestId: requestId, url: result.url, rawText: result.rawSharedText, token: token)
        } catch {
          ShareAnalyticsStore.recordDeliveryStatus(requestId, status: "deferred", reason: "queue_registration_failed", release: result.release)
        }
      case .loginRequired(let reason):
        var updated = result
        updated.transferStatus = "LOGIN_REQUIRED"
        updated.authReason = reason
        updated.updatedAt = Date().timeIntervalSince1970 * 1000
        try? ShareIntentStorage.saveResult(updated)
        ShareAnalyticsStore.recordDeliveryStatus(requestId, status: "deferred", reason: "login_required", release: result.release)
      case .waitingForNetwork:
        ShareAnalyticsStore.recordDeliveryStatus(requestId, status: "deferred", reason: "network_unavailable", release: result.release)
      case .waitingForAuth:
        ShareAnalyticsStore.recordDeliveryStatus(requestId, status: "deferred", reason: "auth_pending", release: result.release)
      }
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
                  didSendBodyData bytesSent: Int64, totalBytesSent: Int64,
                  totalBytesExpectedToSend: Int64) {
    guard let requestId = task.taskDescription,
          var result = ShareIntentStorage.loadResults().first(where: { $0.requestId == requestId }),
          result.requestSentAt == nil else { return }
    result.requestSentAt = Date().timeIntervalSince1970 * 1000
    result.transferStatus = "REQUESTING"
    result.updatedAt = result.requestSentAt ?? result.updatedAt
    try? ShareIntentStorage.saveResult(result)
    ShareAnalyticsStore.record(
      "extraction_request_started", shareId: requestId,
      occurredAt: result.requestSentAt ?? result.updatedAt, release: result.release
    )
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    responseData[dataTask.taskIdentifier, default: Data()].append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    defer {
      responseData.removeValue(forKey: task.taskIdentifier)
      if let requestId = task.taskDescription, let directory = uploadDirectory {
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("\(requestId).json"))
      }
    }
    guard let requestId = task.taskDescription,
          var result = ShareIntentStorage.loadResults().first(where: { $0.requestId == requestId }) else { return }
    if result.requestSentAt == nil && task.response is HTTPURLResponse {
      ShareAnalyticsStore.record("extraction_request_started", shareId: requestId, release: result.release)
    }
    result.updatedAt = Date().timeIntervalSince1970 * 1000
    var analyticsOutcome: String?
    var analyticsProperties: [String: Any] = [:]
    if let error {
      result.status = "FAILED"
      result.transferStatus = "API_FAILED"
      result.failureReason = "CLIENT000_002 | \((error as NSError).code)"
      result.retryable = true
      analyticsOutcome = "request_failed"
      analyticsProperties["failure_type"] = (error as NSError).code == NSURLErrorTimedOut ? "timeout" : "network_error"
    } else if let http = task.response as? HTTPURLResponse {
      let json = (try? JSONSerialization.jsonObject(with: responseData[task.taskIdentifier] ?? Data())) as? [String: Any] ?? [:]
      let nested = json["error"] as? [String: Any] ?? [:]
      if (200..<300).contains(http.statusCode) {
        analyticsOutcome = "response_received"
        analyticsProperties["response_status"] = http.statusCode
        result.status = json["status"] as? String ?? "FAILED"
        result.transferStatus = "API_SUCCEEDED"
        result.reelId = json["reelId"] as? String
        result.failureReason = json["failureReason"] as? String
        result.retryable = json["retryable"] as? Bool ?? false
        result.reused = json["reused"] as? Bool
        result.saveMode = json["saveMode"] as? String
      } else {
        let code = json["errorCode"] as? String ?? nested["errorCode"] as? String ?? "HTTP_\(http.statusCode)"
        result.status = "FAILED"
        result.transferStatus = code == "AUTH401_002" ? "WAITING_FOR_AUTH" : "API_FAILED"
        result.failureReason = code
        result.reelId = json["reelId"] as? String ?? nested["reelId"] as? String
        result.retryable = json["retryable"] as? Bool ?? (http.statusCode >= 500)
        if result.transferStatus == "API_FAILED" {
          analyticsOutcome = "request_failed"
          analyticsProperties["response_status"] = http.statusCode
          analyticsProperties["failure_type"] = [401, 403].contains(http.statusCode) ? "auth_failed" :
            [408, 504].contains(http.statusCode) ? "timeout" :
            http.statusCode >= 500 ? "server_error" : "invalid_request"
        }
      }
    } else {
      result.status = "FAILED"
      result.transferStatus = "API_FAILED"
      result.failureReason = "CLIENT000_003"
      result.retryable = true
      analyticsOutcome = "request_failed"
      analyticsProperties["failure_type"] = "network_error"
    }
    try? ShareIntentStorage.saveResult(result)
    if result.transferStatus == "WAITING_FOR_AUTH" {
      ShareAnalyticsStore.recordDeliveryStatus(requestId, status: "deferred", reason: "auth_pending", release: result.release)
    }
    if let analyticsOutcome {
      analyticsProperties["outcome"] = analyticsOutcome
      if let contentId = result.reelId { analyticsProperties["content_id"] = contentId }
      ShareAnalyticsStore.record(
        "extraction_request_finished", shareId: requestId,
        properties: analyticsProperties, release: result.release
      )
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async {
      self.eventsCompletion?()
      self.eventsCompletion = nil
    }
  }
}
