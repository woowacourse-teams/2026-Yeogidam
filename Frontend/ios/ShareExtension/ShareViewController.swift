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
    Task { @MainActor [weak self] in
      guard let self else {
        return
      }

      do {
        let payload = try await self.extractPayload()
        try ShareIntentStorage.save(payload)
        self.showStatusLabel()
        try await Task.sleep(nanoseconds: 1_000_000_000)
        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
      } catch {
        self.extensionContext?.cancelRequest(withError: error)
      }
    }
  }

  private func configureStatusLabel() {
    statusContainerView.translatesAutoresizingMaskIntoConstraints = false
    statusContainerView.backgroundColor = UIColor(white: 0.96, alpha: 1)
    statusContainerView.layer.cornerRadius = 16
    statusContainerView.layer.cornerCurve = .continuous

    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    statusLabel.text = "저장되었습니다."
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

    for item in extensionItems {
      let subject = item.attributedTitle?.string.trimmingCharacters(in: .whitespacesAndNewlines)

      for provider in item.attachments ?? [] {
        if let urlString = try await loadURLString(from: provider) {
          return ShareIntentStorage.makePayload(
            text: urlString,
            subject: subject,
            mimeType: UTType.url.identifier
          )
        }
      }

      for provider in item.attachments ?? [] {
        if let sharedText = try await loadText(from: provider) {
          return ShareIntentStorage.makePayload(
            text: sharedText,
            subject: subject,
            mimeType: UTType.plainText.identifier
          )
        }
      }
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
