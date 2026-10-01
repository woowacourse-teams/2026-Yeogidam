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

      var extractedPayload: ShareIntentPayload?
      do {
        let payload = try await self.extractPayload()
        extractedPayload = payload
        try ShareIntentStorage.saveResult(ShareReelResult(
          requestId: payload.id, url: payload.text, rawSharedText: payload.rawText,
          status: "PENDING", transferStatus: "SAVED", reelId: nil,
          failureReason: nil, retryable: true, updatedAt: Date().timeIntervalSince1970 * 1000
        ))
        self.statusLabel.text = await self.prepareTransfer(payload)
        self.showStatusLabel()
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
      } catch {
        if let payload = extractedPayload {
          let object = payload.text.contains("/p/") ? "게시물을" : "릴스를"
          self.statusLabel.text = "\(object) 전달하지 못했어요. 다시 공유해 주세요."
        } else {
          self.statusLabel.text = "공유한 인스타그램 게시물을 확인하지 못했어요. 다시 공유해 주세요."
        }
        self.showStatusLabel()
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
      }
    }
  }

  private func prepareTransfer(_ payload: ShareIntentPayload) async -> String {
    let auth = await ShareAuth.ensureAccessToken()
    guard var result = ShareIntentStorage.loadResults().first(where: { $0.requestId == payload.id }) else {
      return "공유를 마무리하지 못했어요. 여기담 앱에서 확인해 주세요."
    }
    let receivedMessage = "\(payload.text.contains("/p/") ? "게시물이" : "릴스가") 잘 전달됐어요! 장소를 찾아볼게요."
    switch auth {
    case .ready(let token):
      do {
        try ShareBackgroundTransfer.shared.enqueue(
          requestId: payload.id, url: payload.text, rawText: payload.rawText, token: token
        )
      } catch {
        // The link remains saved and the containing app can register the transfer later.
      }
      return receivedMessage
    case .loginRequired(let reason):
      result.transferStatus = "LOGIN_REQUIRED"
      result.authReason = reason
      result.retryable = false
      result.updatedAt = Date().timeIntervalSince1970 * 1000
      try? ShareIntentStorage.saveResult(result)
      return receivedMessage
    case .waitingForNetwork:
      result.transferStatus = "WAITING_FOR_NETWORK"
      result.updatedAt = Date().timeIntervalSince1970 * 1000
      try? ShareIntentStorage.saveResult(result)
      return receivedMessage
    case .waitingForAuth:
      result.transferStatus = "WAITING_FOR_AUTH"
      result.updatedAt = Date().timeIntervalSince1970 * 1000
      try? ShareIntentStorage.saveResult(result)
      return receivedMessage
    }
  }

  private func configureStatusLabel() {
    statusContainerView.translatesAutoresizingMaskIntoConstraints = false
    statusContainerView.backgroundColor = UIColor(white: 0.96, alpha: 1)
    statusContainerView.layer.cornerRadius = 16
    statusContainerView.layer.cornerCurve = .continuous

    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    statusLabel.text = "공유한 내용을 확인하고 있어요."
    statusLabel.textColor = .label
    statusLabel.font = .systemFont(ofSize: 17, weight: .semibold)
    statusLabel.textAlignment = .center
    statusLabel.numberOfLines = 0
    statusLabel.lineBreakMode = .byWordWrapping
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
      statusLabel.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -96),
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
