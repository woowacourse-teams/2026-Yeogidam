import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  private var hasProcessedShare = false
  private let statusContainerView = UIView()
  private let statusLabel = UILabel()

  override func loadView() {
    let view = UIView(frame: .zero)
    view.backgroundColor = .systemBackground
    self.view = view
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    configureStatusLabel()

    guard !hasProcessedShare else {
      return
    }

    hasProcessedShare = true
    processShare()
  }

  private func processShare() {
    // 새 공유는 현재 extensionContext의 URL만 사용합니다.
    // 과거 호환용 payload만 제거합니다. requestId별 결과는 서로 독립적으로 유지합니다.
    ShareIntentStorage.clear()
    Task { @MainActor [weak self] in
      guard let self else {
        return
      }

      do {
        let payload = try await self.extractPayload()
        try ShareIntentStorage.saveResult(ShareReelResult(requestId: payload.id, url: payload.text, rawSharedText: payload.rawText, status: "PENDING", reelId: nil, failureReason: nil, retryable: true, updatedAt: Date().timeIntervalSince1970 * 1000))
        try await self.submit(payload)
        self.showStatusLabel()
        try await Task.sleep(nanoseconds: 1_000_000_000)
        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
      } catch {
        let requestId = UUID().uuidString
        try? ShareIntentStorage.saveResult(
          ShareReelResult(
            requestId: requestId,
            url: "",
            rawSharedText: nil,
            status: "FAILED",
            reelId: nil,
            failureReason: "REEL400_001",
            retryable: false,
            updatedAt: Date().timeIntervalSince1970 * 1000
          )
        )
        self.statusLabel.text = "Instagram 게시물 링크를 확인하지 못했어요."
        self.showStatusLabel()
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
      }
    }
  }

  private func submit(_ payload: ShareIntentPayload) async throws {
    let urlString = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String ?? "https://hbbrgudsbvnwuylxqlta.supabase.co"
    let publishableKey = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_PUBLISHABLE_KEY") as? String ?? "sb_publishable_2bScMGo7Zpgmb9Q7lSA1Ag_sXmiGvCX"
    guard let endpoint = URL(string: "\(urlString)/functions/v1/save-instagram-reel") else { throw ShareIntentStorageError.appGroupUnavailable }
    guard let token = ShareIntentStorage.accessToken(), !token.isEmpty else {
      logAPI("auth-missing", "requestId=\(payload.id) url=\(payload.text)")
      try ShareIntentStorage.saveResult(ShareReelResult(requestId: payload.id, url: payload.text, rawSharedText: payload.rawText, status: "FAILED", reelId: nil, failureReason: "AUTH401_001", retryable: false, updatedAt: Date().timeIntervalSince1970 * 1000))
      return
    }
    var request = URLRequest(url: endpoint, timeoutInterval: 30)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(publishableKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "instagramUrl": payload.text,
      "source": "url_input",
      "forceReprocess": false,
    ])
    let requestSentAt = Date().timeIntervalSince1970 * 1000
    logAPI(
      "request",
      "requestId=\(payload.id) method=POST endpoint=\(endpoint.absoluteString) body={instagramUrl: \(payload.text), source: url_input, forceReprocess: false}"
    )
    try ShareIntentStorage.saveResult(ShareReelResult(requestId: payload.id, requestSentAt: requestSentAt, url: payload.text, rawSharedText: payload.rawText, status: "PENDING", reelId: nil, failureReason: nil, retryable: true, updatedAt: requestSentAt))
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse else {
        throw ShareIntentStorageError.appGroupUnavailable
      }
      let responseBody = String(data: data, encoding: .utf8) ?? "<non-utf8 response>"
      logAPI(
        "response",
        "requestId=\(payload.id) httpStatus=\(http.statusCode) body=\(responseBody)"
      )
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      if !(200..<300).contains(http.statusCode) {
        let nested = json?["error"] as? [String: Any]
        let errorCode = json?["errorCode"] as? String ?? nested?["errorCode"] as? String
        let message = json?["message"] as? String ?? nested?["message"] as? String
        let reason = [errorCode, message, "HTTP_\(http.statusCode)"].compactMap { $0 }.joined(separator: " | ")
        let retryable: Bool = json?["retryable"] as? Bool ?? nested?["retryable"] as? Bool ?? (http.statusCode >= 500)
        try ShareIntentStorage.saveResult(ShareReelResult(requestId: payload.id, requestSentAt: requestSentAt, url: payload.text, rawSharedText: payload.rawText, status: "FAILED", reelId: json?["reelId"] as? String ?? nested?["reelId"] as? String, failureReason: reason.isEmpty ? "HTTP_\(http.statusCode)" : reason, retryable: retryable, updatedAt: Date().timeIntervalSince1970 * 1000))
        return
      }
      let status = json?["status"] as? String ?? "FAILED"
      try ShareIntentStorage.saveResult(ShareReelResult(requestId: payload.id, requestSentAt: requestSentAt, url: payload.text, rawSharedText: payload.rawText, status: status, reelId: json?["reelId"] as? String, failureReason: json?["failureReason"] as? String, retryable: json?["retryable"] as? Bool ?? false, updatedAt: Date().timeIntervalSince1970 * 1000, reused: json?["reused"] as? Bool))
    } catch {
      let nsError = error as NSError
      logAPI(
        "error",
        "requestId=\(payload.id) domain=\(nsError.domain) code=\(nsError.code) message=\(nsError.localizedDescription)"
      )
      try ShareIntentStorage.saveResult(ShareReelResult(requestId: payload.id, requestSentAt: requestSentAt, url: payload.text, rawSharedText: payload.rawText, status: "FAILED", reelId: nil, failureReason: "CLIENT000_002 | \(nsError.domain):\(nsError.code) | \(nsError.localizedDescription)", retryable: true, updatedAt: Date().timeIntervalSince1970 * 1000))
    }
  }

  private func logAPI(_ event: String, _ message: String) {
    NSLog("%@", "[InstagramShareExtension][api-\(event)] \(message)")
  }

  private func configureStatusLabel() {
    statusContainerView.translatesAutoresizingMaskIntoConstraints = false
    statusContainerView.backgroundColor = UIColor(white: 0.96, alpha: 1)
    statusContainerView.layer.cornerRadius = 16
    statusContainerView.layer.cornerCurve = .continuous

    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    statusLabel.text = "릴스 링크가 전달됐어요."
    statusLabel.textColor = .label
    statusLabel.font = .systemFont(ofSize: 17, weight: .semibold)
    statusLabel.textAlignment = .center
    statusLabel.alpha = 0

    statusContainerView.addSubview(statusLabel)
    view.addSubview(statusContainerView)

    NSLayoutConstraint.activate([
      statusContainerView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      statusContainerView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      statusContainerView.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
      statusContainerView.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
      statusContainerView.heightAnchor.constraint(greaterThanOrEqualToConstant: 64),

      statusLabel.topAnchor.constraint(equalTo: statusContainerView.topAnchor, constant: 20),
      statusLabel.bottomAnchor.constraint(equalTo: statusContainerView.bottomAnchor, constant: -20),
      statusLabel.leadingAnchor.constraint(equalTo: statusContainerView.leadingAnchor, constant: 24),
      statusLabel.trailingAnchor.constraint(equalTo: statusContainerView.trailingAnchor, constant: -24),
    ])
  }

  private func showStatusLabel() {
    UIView.animate(withDuration: 0.12) {
      self.statusLabel.alpha = 1
    }
  }

  private func extractPayload() async throws -> ShareIntentPayload {
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
            mimeType: UTType.url.identifier
          )
        }
      }

      for provider in item.attachments ?? [] {
        if let sharedText = try await loadText(from: provider) {
          let payload = ShareIntentStorage.makePayload(
            text: sharedText,
            subject: subject,
            mimeType: UTType.plainText.identifier
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
          mimeType: UTType.plainText.identifier
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

  private func loadURLString(from provider: NSItemProvider) async throws -> String? {
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

  private func loadText(from provider: NSItemProvider) async throws -> String? {
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

  private func loadItem(
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
