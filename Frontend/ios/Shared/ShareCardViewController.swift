import UIKit

/// Share Extension과 Action Extension이 함께 쓰는 화면입니다. 화면 하단에 결과 카드만 보여줍니다.
class ShareCardViewController: UIViewController {
  private enum CardState {
    case success
    case loginRequired
    case failure
  }

  /// 카드 안 문구와 버튼 글자의 기준 크기입니다. 문구가 길면 한 줄에 맞게 줄어듭니다.
  private static let textSize: CGFloat = 16

  private enum Palette {
    static let card = UIColor(red: 218 / 255, green: 223 / 255, blue: 250 / 255, alpha: 1)
    static let text = UIColor.black
    static let buttonBackground = UIColor.white
  }

  private let shareId = UUID().uuidString
  private var hasProcessedShare = false
  private var hasHandledAction = false
  private var cardState: CardState = .success
  private var pendingLoginPayload: ShareIntentPayload?
  private var pendingGuestLogin = false
  private var autoDismissTask: Task<Void, Never>?

  private let dimView = UIView()
  private let cardView = UIView()
  private let mascotView = UIImageView()
  private let messageLabel = UILabel()
  private let actionButton = UIButton(type: .system)

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    makeHostContainerTransparent()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    makeHostContainerTransparent()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    makeHostContainerTransparent()
  }

  /// 시스템이 확장 화면 뒤에 깔아 주는 흰 배경을 지워, 아래의 공유 시트가 비쳐 보이게 합니다.
  private func makeHostContainerTransparent() {
    var current = view.superview
    while let container = current {
      container.backgroundColor = .clear
      current = container.superview
    }
    view.window?.backgroundColor = .clear
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    configureDimView()
    configureDismissArea()
    configureCard()

    guard !hasProcessedShare else { return }
    hasProcessedShare = true
    processShare()
  }

  // MARK: - 접수

  private func processShare() {
    ShareAnalyticsStore.record("reel_share_received", shareId: shareId)
    // 과거 호환용 payload만 제거합니다. requestId별 결과는 서로 독립적으로 유지합니다.
    ShareIntentStorage.clear()
    Task { @MainActor [weak self] in
      guard let self else { return }

      var extractedPayload: ShareIntentPayload?
      do {
        let payload = try await ShareIntake.extractPayload(from: self.extensionContext, shareId: self.shareId)
        extractedPayload = payload
        switch try await ShareIntake.prepareTransfer(payload, shareId: self.shareId) {
        case .accepted:
          self.show(.success, message: "공유 완료!", buttonTitle: "앱에서 보기")
          self.recordFeedback("received", outcome: "accepted")
          self.scheduleAutoDismiss()
        case .guestPracticeSuccess:
          self.show(.success, message: "공유 완료!", buttonTitle: "앱에서 보기")
          self.recordFeedback("received")
          self.scheduleAutoDismiss()
        case .loginRequired(let reason):
          self.pendingLoginPayload = payload
          self.pendingGuestLogin = reason == "never_logged_in"
          self.show(.loginRequired, message: "로그인 해주세요", buttonTitle: "로그인")
          self.recordFeedback(
            "login_required", outcome: "login_required",
            reason: reason == "never_logged_in" ? "no_session" : reason
          )
        }
      } catch {
        if let storageError = error as? ShareIntentStorageError,
           case .unsupportedContent = storageError {
          // 지원하지 않거나 잘못된 공유 내용은 예상 가능한 사용자 입력이라 오류로 보고하지 않습니다.
        } else {
          ShareSentryReporter.capture(
            extractedPayload == nil ? "SHARE_PAYLOAD_READ_FAILED" : "SHARE_PAYLOAD_STORE_FAILED"
          )
        }
        let isInvalidLink = extractedPayload == nil
        ShareAnalyticsStore.record("share_local_save_resolved", shareId: self.shareId,
          properties: ["outcome": isInvalidLink ? "invalid_link" : "storage_failed"])
        let message: String
        if let payload = extractedPayload {
          message = payload.text.contains("/p/") ? "게시물을 전달하지 못했어요" : "릴스를 전달하지 못했어요"
        } else {
          message = "릴스·게시물만 공유할 수 있어요"
        }
        self.show(.failure, message: message, buttonTitle: "닫기")
        self.recordFeedback(
          isInvalidLink ? "invalid_link" : "save_failed", outcome: "failed",
          reason: isInvalidLink ? "invalid_link" : "save_failed"
        )
        self.scheduleAutoDismiss()
      }
    }
  }

  private func recordFeedback(_ feedbackType: String, outcome: String? = nil, reason: String? = nil) {
    ShareAnalyticsStore.record("reel_share_feedback_viewed", shareId: shareId,
      properties: ["feedback_type": feedbackType])
    if let outcome {
      var properties: [String: Any] = ["outcome": outcome]
      if let reason { properties["reason"] = reason }
      ShareAnalyticsStore.record("reel_share_outcome_viewed", shareId: shareId, properties: properties)
    }
  }

  // MARK: - 버튼 동작

  @objc private func handleActionButton() {
    switch cardState {
    case .success:
      openApp(fallbackMessage: "앱을 직접 열어 주세요")
    case .loginRequired:
      handleLogin()
    case .failure:
      finish()
    }
  }

  private func handleLogin() {
    guard !hasHandledAction, let payload = pendingLoginPayload else { return }
    hasHandledAction = true
    do {
      try ShareIntake.saveLoginHandoff(payload, isGuestLogin: pendingGuestLogin, shareId: shareId)
      openApp(fallbackMessage: "앱을 직접 열어 로그인하세요")
    } catch {
      hasHandledAction = false
      ShareSentryReporter.capture("SHARE_PAYLOAD_STORE_FAILED", stage: "login_handoff")
      ShareAnalyticsStore.record("share_local_save_resolved", shareId: shareId,
        properties: ["outcome": "storage_failed"])
      show(.failure, message: "링크를 저장하지 못했어요", buttonTitle: "닫기")
    }
  }

  private func openApp(fallbackMessage: String) {
    autoDismissTask?.cancel()
    guard let extensionContext else {
      ShareSentryReporter.capture("SHARE_LOGIN_APP_OPEN_FAILED", stage: "login_handoff")
      show(.failure, message: fallbackMessage, buttonTitle: "닫기")
      return
    }
    extensionContext.open(ShareIntentConstants.shareExtensionOpenURL) { [weak self] opened in
      DispatchQueue.main.async {
        guard let self else { return }
        if opened {
          self.finish()
        } else {
          ShareSentryReporter.capture("SHARE_LOGIN_APP_OPEN_FAILED", stage: "login_handoff")
          self.show(.failure, message: fallbackMessage, buttonTitle: "닫기")
        }
      }
    }
  }

  private func scheduleAutoDismiss() {
    autoDismissTask?.cancel()
    // 로그인 안내는 사용자가 누르기 전까지 유지하고, 결과 안내만 잠시 뒤 닫습니다.
    autoDismissTask = Task { @MainActor [weak self] in
      try? await Task.sleep(nanoseconds: 4_000_000_000)
      guard !Task.isCancelled else { return }
      self?.finish()
    }
  }

  @objc private func handleBackgroundTap() {
    finish()
  }

  private func finish() {
    autoDismissTask?.cancel()
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  // MARK: - 화면

  private func show(_ state: CardState, message: String, buttonTitle: String) {
    cardState = state
    messageLabel.text = message
    mascotView.image = UIImage(named: state == .loginRequired ? "MascotSad" : "Mascot")
    var configuration = actionButton.configuration ?? UIButton.Configuration.plain()
    var title = AttributedString(buttonTitle)
    title.font = .systemFont(ofSize: Self.textSize, weight: .semibold)
    configuration.attributedTitle = title
    actionButton.configuration = configuration

    guard cardView.alpha == 0 else { return }
    UIView.animate(withDuration: 0.25, delay: 0, options: .curveEaseOut) {
      self.dimView.alpha = 1
      self.cardView.alpha = 1
      self.cardView.transform = .identity
    }
  }

  /// 카드 뒤 화면을 반투명 검정 레이어로 덮습니다. 카드가 나타날 때 함께 나타납니다.
  private func configureDimView() {
    dimView.translatesAutoresizingMaskIntoConstraints = false
    dimView.backgroundColor = UIColor.black.withAlphaComponent(0.25)
    dimView.alpha = 0
    view.addSubview(dimView)
    NSLayoutConstraint.activate([
      dimView.topAnchor.constraint(equalTo: view.topAnchor),
      dimView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      dimView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      dimView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
  }

  private func configureDismissArea() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(handleBackgroundTap))
    view.addGestureRecognizer(tap)
  }

  private func configureCard() {
    cardView.translatesAutoresizingMaskIntoConstraints = false
    cardView.backgroundColor = Palette.card
    cardView.layer.cornerRadius = 20
    cardView.layer.cornerCurve = .continuous
    cardView.alpha = 0
    cardView.transform = CGAffineTransform(translationX: 0, y: 24)
    view.addSubview(cardView)

    // 앱 아이콘 배경색(카드보다 살짝 밝음)이 원형 후광처럼 보이도록 원으로 잘라 씁니다.
    mascotView.translatesAutoresizingMaskIntoConstraints = false
    mascotView.image = UIImage(named: "Mascot")
    mascotView.contentMode = .scaleAspectFill
    mascotView.clipsToBounds = true
    mascotView.layer.cornerRadius = 24
    mascotView.isAccessibilityElement = false

    messageLabel.translatesAutoresizingMaskIntoConstraints = false
    messageLabel.textColor = Palette.text
    messageLabel.font = .systemFont(ofSize: Self.textSize, weight: .semibold)
    messageLabel.numberOfLines = 1
    messageLabel.adjustsFontSizeToFitWidth = true
    messageLabel.minimumScaleFactor = 0.75
    messageLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

    var configuration = UIButton.Configuration.plain()
    configuration.baseForegroundColor = Palette.text
    configuration.background.backgroundColor = Palette.buttonBackground
    configuration.background.cornerRadius = 10
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 14, bottom: 0, trailing: 14)
    actionButton.configuration = configuration
    actionButton.translatesAutoresizingMaskIntoConstraints = false
    actionButton.layer.shadowColor = UIColor(red: 0.34, green: 0.41, blue: 0.88, alpha: 1).cgColor
    actionButton.layer.shadowOpacity = 0.18
    actionButton.layer.shadowRadius = 6
    actionButton.layer.shadowOffset = CGSize(width: 0, height: 2)
    actionButton.setContentCompressionResistancePriority(.required, for: .horizontal)
    actionButton.setContentHuggingPriority(.required, for: .horizontal)
    actionButton.addTarget(self, action: #selector(handleActionButton), for: .touchUpInside)

    cardView.addSubview(mascotView)
    cardView.addSubview(messageLabel)
    cardView.addSubview(actionButton)

    let guide = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      cardView.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
      cardView.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
      // 공유 시트 안쪽 하단에 들어가도록 홈 인디케이터 영역까지 내려 붙입니다.
      cardView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -16),
      cardView.heightAnchor.constraint(equalToConstant: 72),

      mascotView.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 12),
      mascotView.centerYAnchor.constraint(equalTo: cardView.centerYAnchor),
      mascotView.widthAnchor.constraint(equalToConstant: 48),
      mascotView.heightAnchor.constraint(equalToConstant: 48),

      messageLabel.leadingAnchor.constraint(equalTo: mascotView.trailingAnchor, constant: 10),
      messageLabel.centerYAnchor.constraint(equalTo: cardView.centerYAnchor),
      messageLabel.trailingAnchor.constraint(lessThanOrEqualTo: actionButton.leadingAnchor, constant: -12),

      actionButton.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -12),
      actionButton.centerYAnchor.constraint(equalTo: cardView.centerYAnchor),
      actionButton.heightAnchor.constraint(equalToConstant: 40),
      actionButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 76),
    ])
  }
}
