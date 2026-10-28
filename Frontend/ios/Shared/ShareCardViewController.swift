import UIKit

/// Share Extension과 Action Extension이 함께 쓰는 화면입니다. 화면 하단에 결과 카드만 보여줍니다.
class ShareCardViewController: UIViewController, UIGestureRecognizerDelegate {
  private enum CardState {
    case success
    case loginRequired
    case failure
  }

  /// 카드 안 문구와 버튼 글자의 기준 크기입니다. 문구가 길면 한 줄에 맞게 줄어듭니다.
  private static let textSize: CGFloat = 16
  /// 카드 안 버튼 글자 크기입니다. 버튼 두 개가 한 줄에 들어가도록 문구보다 작게 씁니다.
  private static let buttonTextSize: CGFloat = 13

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
  private let folderButton = UIButton(type: .system)
  private let buttonStack = UIStackView()
  private var folderSheet: ShareFolderSheetView?
  private var selectedFolderIds: [String] = []

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
          self.selectedFolderIds = ShareFolderStorage.selection(requestId: payload.id)
          self.show(.success, message: "공유 완료!", buttonTitle: "앱에서 보기", offersFolderSelection: true)
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

  /// 앱을 엽니다. 공식 경로(`extensionContext.open`)가 실패하면 responder chain의 대체 경로를 시도하고,
  /// 그래도 열지 못하면 직접 열어 달라는 안내 카드로 바꿉니다.
  private func openApp(fallbackMessage: String) {
    autoDismissTask?.cancel()
    let url = ShareIntentConstants.shareExtensionOpenURL
    let fail = { [weak self] in
      guard let self else { return }
      ShareSentryReporter.capture("SHARE_LOGIN_APP_OPEN_FAILED", stage: "login_handoff")
      self.show(.failure, message: fallbackMessage, buttonTitle: "닫기")
    }
    guard let extensionContext else {
      fail()
      return
    }
    extensionContext.open(url) { [weak self] opened in
      DispatchQueue.main.async {
        guard let self else { return }
        if opened {
          self.finish()
          return
        }
        // 공유·작업 확장에서는 공식 open이 보통 false를 돌려줍니다.
        self.openViaResponderChain(url) { opened in
          if opened { self.finish() } else { fail() }
        }
      }
    }
  }

  private typealias OpenURLCompletion = @convention(block) (Bool) -> Void
  private typealias OpenURLImplementation = @convention(c) (
    AnyObject, Selector, NSURL, NSDictionary, OpenURLCompletion?
  ) -> Void

  /// responder chain에서 `UIApplication` 객체를 찾아 같은 URL을 엽니다.
  /// Apple이 확장에서 공식 지원하는 방법이 아니라서 OS 버전에 따라 동작하지 않을 수 있습니다.
  private func openViaResponderChain(_ url: URL, completion: @escaping (Bool) -> Void) {
    let selector = NSSelectorFromString("openURL:options:completionHandler:")
    guard let applicationClass = NSClassFromString("UIApplication") else {
      completion(false)
      return
    }
    var responder: UIResponder? = self
    while let current = responder {
      responder = current.next
      guard current.isKind(of: applicationClass), current.responds(to: selector) else { continue }

      // completion이 호출되지 않는 OS 조합에서도 화면이 멈추지 않도록 한 번만 완료합니다.
      var didComplete = false
      let finishOnce: (Bool) -> Void = { opened in
        guard !didComplete else { return }
        didComplete = true
        completion(opened)
      }
      let handler: OpenURLCompletion = { opened in DispatchQueue.main.async { finishOnce(opened) } }
      let openURL = unsafeBitCast(current.method(for: selector), to: OpenURLImplementation.self)
      openURL(current, selector, url as NSURL, [:] as NSDictionary, handler)
      DispatchQueue.main.asyncAfter(deadline: .now() + 1) { finishOnce(true) }
      return
    }
    completion(false)
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
    if folderSheet != nil {
      closeFolderSheet()
      return
    }
    finish()
  }

  private func finish() {
    autoDismissTask?.cancel()
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  // MARK: - 폴더 선택

  @objc private func handleFolderButton() {
    guard folderSheet == nil else { return }
    autoDismissTask?.cancel()
    let sheet = ShareFolderSheetView(folders: ShareFolderStorage.allFolders(), selectedIds: Set(selectedFolderIds))
    sheet.onSave = { [weak self] ids in self?.saveFolderSelection(ids) }
    sheet.onCreate = { [weak self] in self?.promptNewFolder() }
    sheet.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(sheet)
    NSLayoutConstraint.activate([
      sheet.topAnchor.constraint(equalTo: view.topAnchor),
      sheet.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      sheet.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      sheet.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
    folderSheet = sheet
    cardView.isHidden = true
    sheet.present()
  }

  private func closeFolderSheet() {
    guard let sheet = folderSheet else { return }
    folderSheet = nil
    sheet.dismiss { [weak self] in
      self?.cardView.isHidden = false
      self?.scheduleAutoDismiss()
    }
  }

  private func saveFolderSelection(_ ids: [String]) {
    selectedFolderIds = ids
    ShareFolderStorage.saveSelection(requestId: shareId, folderIds: ids)
    ShareAnalyticsStore.record("share_folder_selected", shareId: shareId, properties: ["count": ids.count])
    messageLabel.text = ids.isEmpty ? "공유 완료!" : "선택 완료!"
    updateFolderButtonTitle()
    closeFolderSheet()
  }

  private func updateFolderButtonTitle() {
    var configuration = folderButton.configuration ?? UIButton.Configuration.plain()
    var title = AttributedString(selectedFolderIds.isEmpty ? "폴더 선택" : "폴더 변경")
    title.font = .systemFont(ofSize: Self.buttonTextSize, weight: .semibold)
    configuration.attributedTitle = title
    folderButton.configuration = configuration
  }

  private func promptNewFolder() {
    guard let sheet = folderSheet else { return }
    if ShareFolderStorage.allFolders().count >= ShareFolderStorage.maxFolderCount {
      let alert = UIAlertController(
        title: "폴더는 최대 \(ShareFolderStorage.maxFolderCount)개까지 만들 수 있어요.",
        message: nil, preferredStyle: .alert
      )
      alert.addAction(UIAlertAction(title: "확인", style: .default))
      present(alert, animated: true)
      return
    }
    let alert = UIAlertController(title: "새 폴더", message: nil, preferredStyle: .alert)
    alert.addTextField { field in
      field.placeholder = "폴더 이름 (최대 \(ShareFolderStorage.maxNameLength)자)"
      field.autocorrectionType = .no
      field.returnKeyType = .done
    }
    alert.addAction(UIAlertAction(title: "취소", style: .cancel))
    alert.addAction(UIAlertAction(title: "만들기", style: .default) { [weak alert] _ in
      let name = alert?.textFields?.first?.text ?? ""
      guard let folder = ShareFolderStorage.createDraft(name: name) else { return }
      sheet.addFolder(folder, selected: true)
    })
    present(alert, animated: true)
  }

  // MARK: - 화면

  private func show(
    _ state: CardState, message: String, buttonTitle: String, offersFolderSelection: Bool = false
  ) {
    cardState = state
    folderButton.isHidden = !offersFolderSelection
    updateFolderButtonTitle()
    messageLabel.text = message
    mascotView.image = UIImage(named: state == .loginRequired ? "MascotSad" : "Mascot")
    var configuration = actionButton.configuration ?? UIButton.Configuration.plain()
    var title = AttributedString(buttonTitle)
    title.font = .systemFont(ofSize: Self.buttonTextSize, weight: .semibold)
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
    tap.delegate = self
    view.addGestureRecognizer(tap)
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    // 폴더 선택 시트 안의 터치는 배경 탭(닫기)으로 취급하지 않습니다.
    guard let sheet = folderSheet else { return true }
    return !(touch.view?.isDescendant(of: sheet.panel) ?? false)
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
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 10)
    for button in [actionButton, folderButton] {
      button.configuration = configuration
      button.translatesAutoresizingMaskIntoConstraints = false
      button.layer.shadowColor = UIColor(red: 0.34, green: 0.41, blue: 0.88, alpha: 1).cgColor
      button.layer.shadowOpacity = 0.18
      button.layer.shadowRadius = 6
      button.layer.shadowOffset = CGSize(width: 0, height: 2)
      button.setContentCompressionResistancePriority(.required, for: .horizontal)
      button.setContentHuggingPriority(.required, for: .horizontal)
    }

    actionButton.addTarget(self, action: #selector(handleActionButton), for: .touchUpInside)
    folderButton.isHidden = true
    folderButton.addTarget(self, action: #selector(handleFolderButton), for: .touchUpInside)

    buttonStack.translatesAutoresizingMaskIntoConstraints = false
    buttonStack.axis = .horizontal
    buttonStack.spacing = 8
    buttonStack.alignment = .center
    buttonStack.addArrangedSubview(folderButton)
    buttonStack.addArrangedSubview(actionButton)

    cardView.addSubview(mascotView)
    cardView.addSubview(messageLabel)
    cardView.addSubview(buttonStack)

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
      messageLabel.trailingAnchor.constraint(lessThanOrEqualTo: buttonStack.leadingAnchor, constant: -10),

      buttonStack.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -12),
      buttonStack.centerYAnchor.constraint(equalTo: cardView.centerYAnchor),
      actionButton.heightAnchor.constraint(equalToConstant: 34),
      folderButton.heightAnchor.constraint(equalToConstant: 34),
    ])
  }
}

/// 공유 확장에서 폴더를 고르는 바텀 시트입니다. 새 폴더 생성 행, 폴더 체크 목록, "저장하기" 버튼으로 구성됩니다.
final class ShareFolderSheetView: UIView {
  private enum Palette {
    static let accent = UIColor(red: 143 / 255, green: 162 / 255, blue: 255 / 255, alpha: 1)
    static let text = UIColor(red: 32 / 255, green: 33 / 255, blue: 36 / 255, alpha: 1)
    static let muted = UIColor(red: 107 / 255, green: 114 / 255, blue: 128 / 255, alpha: 1)
    static let checkOff = UIColor(red: 229 / 255, green: 231 / 255, blue: 235 / 255, alpha: 1)
    static let border = UIColor(red: 227 / 255, green: 230 / 255, blue: 245 / 255, alpha: 1)
  }

  var onSave: (([String]) -> Void)?
  var onCreate: (() -> Void)?

  let panel = UIView()
  private let listStack = UIStackView()
  private let scrollView = UIScrollView()
  private let emptyLabel = UILabel()
  private let saveButton = UIButton(type: .system)
  private var panelBottom: NSLayoutConstraint?
  private var emptyHeight: NSLayoutConstraint?
  private var folders: [ShareFolder]
  private var selectedIds: Set<String>
  private var rowChecks: [String: UIImageView] = [:]

  init(folders: [ShareFolder], selectedIds: Set<String>) {
    self.folders = folders
    self.selectedIds = selectedIds.intersection(folders.map(\.id))
    super.init(frame: .zero)
    build()
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  private func build() {
    backgroundColor = UIColor.black.withAlphaComponent(0.25)
    alpha = 0

    panel.translatesAutoresizingMaskIntoConstraints = false
    panel.backgroundColor = .white
    panel.layer.cornerRadius = 24
    panel.layer.cornerCurve = .continuous
    panel.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
    addSubview(panel)

    let handle = UIView()
    handle.translatesAutoresizingMaskIntoConstraints = false
    handle.backgroundColor = Palette.checkOff
    handle.layer.cornerRadius = 2.5

    let titleLabel = UILabel()
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    titleLabel.text = "폴더 선택"
    titleLabel.font = .systemFont(ofSize: 17, weight: .bold)
    titleLabel.textColor = Palette.text

    let createRow = makeCreateRow()

    listStack.axis = .vertical
    listStack.spacing = 0
    listStack.translatesAutoresizingMaskIntoConstraints = false
    scrollView.translatesAutoresizingMaskIntoConstraints = false
    scrollView.showsVerticalScrollIndicator = false
    scrollView.alwaysBounceVertical = false
    scrollView.addSubview(listStack)

    emptyLabel.translatesAutoresizingMaskIntoConstraints = false
    emptyLabel.text = "아직 폴더가 없어요. 새 폴더를 만들어 보세요."
    emptyLabel.font = .systemFont(ofSize: 14)
    emptyLabel.textColor = Palette.muted
    emptyLabel.textAlignment = .center

    var configuration = UIButton.Configuration.filled()
    configuration.baseBackgroundColor = Palette.accent
    configuration.baseForegroundColor = .white
    configuration.cornerStyle = .medium
    var title = AttributedString("저장하기")
    title.font = .systemFont(ofSize: 16, weight: .bold)
    configuration.attributedTitle = title
    saveButton.configuration = configuration
    saveButton.translatesAutoresizingMaskIntoConstraints = false
    saveButton.addTarget(self, action: #selector(handleSave), for: .touchUpInside)

    [handle, titleLabel, createRow, scrollView, emptyLabel, saveButton].forEach { panel.addSubview($0) }

    let listHeight = scrollView.heightAnchor.constraint(equalTo: listStack.heightAnchor)
    listHeight.priority = .defaultHigh
    let bottom = panel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: 400)
    panelBottom = bottom
    emptyHeight = scrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 0)
    emptyHeight?.isActive = true
    NSLayoutConstraint.activate([
      panel.leadingAnchor.constraint(equalTo: leadingAnchor),
      panel.trailingAnchor.constraint(equalTo: trailingAnchor),
      bottom,
      panel.heightAnchor.constraint(lessThanOrEqualTo: heightAnchor, multiplier: 0.7),

      handle.topAnchor.constraint(equalTo: panel.topAnchor, constant: 10),
      handle.centerXAnchor.constraint(equalTo: panel.centerXAnchor),
      handle.widthAnchor.constraint(equalToConstant: 36),
      handle.heightAnchor.constraint(equalToConstant: 5),

      titleLabel.topAnchor.constraint(equalTo: handle.bottomAnchor, constant: 14),
      titleLabel.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: 24),

      createRow.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
      createRow.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: 24),
      createRow.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -24),

      scrollView.topAnchor.constraint(equalTo: createRow.bottomAnchor),
      scrollView.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: 24),
      scrollView.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -24),
      scrollView.bottomAnchor.constraint(equalTo: saveButton.topAnchor, constant: -16),
      listHeight,

      listStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
      listStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
      listStack.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor),
      listStack.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor),

      emptyLabel.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
      emptyLabel.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
      emptyLabel.topAnchor.constraint(equalTo: scrollView.topAnchor, constant: 16),

      saveButton.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: 20),
      saveButton.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -20),
      saveButton.heightAnchor.constraint(equalToConstant: 52),
      saveButton.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -34),
    ])

    for folder in folders { listStack.addArrangedSubview(makeFolderRow(folder)) }
    refreshEmptyState()
  }

  private func refreshEmptyState() {
    emptyLabel.isHidden = !folders.isEmpty
    emptyHeight?.constant = folders.isEmpty ? 60 : 0
  }

  private func makeCreateRow() -> UIView {
    let row = UIControl()
    row.translatesAutoresizingMaskIntoConstraints = false
    row.addTarget(self, action: #selector(handleCreate), for: .touchUpInside)

    let icon = UIImageView(image: UIImage(systemName: "plus"))
    icon.translatesAutoresizingMaskIntoConstraints = false
    icon.tintColor = Palette.muted
    icon.contentMode = .center
    icon.backgroundColor = UIColor(red: 243 / 255, green: 244 / 255, blue: 246 / 255, alpha: 1)
    icon.layer.cornerRadius = 14
    icon.clipsToBounds = true
    icon.isUserInteractionEnabled = false

    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = "새 폴더 생성"
    label.font = .systemFont(ofSize: 16, weight: .semibold)
    label.textColor = Palette.muted
    label.isUserInteractionEnabled = false

    row.addSubview(icon)
    row.addSubview(label)
    NSLayoutConstraint.activate([
      row.heightAnchor.constraint(equalToConstant: 52),
      icon.leadingAnchor.constraint(equalTo: row.leadingAnchor),
      icon.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      icon.widthAnchor.constraint(equalToConstant: 28),
      icon.heightAnchor.constraint(equalToConstant: 28),
      label.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 12),
      label.centerYAnchor.constraint(equalTo: row.centerYAnchor),
    ])
    return row
  }

  private func makeFolderRow(_ folder: ShareFolder) -> UIView {
    let row = UIControl()
    row.translatesAutoresizingMaskIntoConstraints = false
    row.accessibilityLabel = folder.name
    row.accessibilityTraits = .button
    row.addAction(UIAction { [weak self] _ in self?.toggle(folder.id) }, for: .touchUpInside)

    let dot = UIView()
    dot.translatesAutoresizingMaskIntoConstraints = false
    dot.backgroundColor = ShareFolderSheetView.color(hex: folder.color)
    dot.layer.cornerRadius = 3
    dot.isUserInteractionEnabled = false

    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = folder.name
    label.font = .systemFont(ofSize: 16, weight: .medium)
    label.textColor = Palette.text
    label.isUserInteractionEnabled = false

    let check = UIImageView()
    check.translatesAutoresizingMaskIntoConstraints = false
    check.contentMode = .scaleAspectFit
    check.isUserInteractionEnabled = false
    rowChecks[folder.id] = check
    applyCheck(check, selected: selectedIds.contains(folder.id))

    row.addSubview(dot)
    row.addSubview(label)
    row.addSubview(check)
    NSLayoutConstraint.activate([
      row.heightAnchor.constraint(equalToConstant: 52),
      dot.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 7),
      dot.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      dot.widthAnchor.constraint(equalToConstant: 14),
      dot.heightAnchor.constraint(equalToConstant: 14),
      label.leadingAnchor.constraint(equalTo: dot.trailingAnchor, constant: 19),
      label.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      label.trailingAnchor.constraint(lessThanOrEqualTo: check.leadingAnchor, constant: -12),
      check.trailingAnchor.constraint(equalTo: row.trailingAnchor),
      check.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      check.widthAnchor.constraint(equalToConstant: 26),
      check.heightAnchor.constraint(equalToConstant: 26),
    ])
    return row
  }

  private func applyCheck(_ view: UIImageView, selected: Bool) {
    view.image = UIImage(systemName: "checkmark.circle.fill")
    view.tintColor = selected ? Palette.accent : Palette.checkOff
  }

  private func toggle(_ id: String) {
    if selectedIds.contains(id) { selectedIds.remove(id) } else { selectedIds.insert(id) }
    if let check = rowChecks[id] { applyCheck(check, selected: selectedIds.contains(id)) }
  }

  /// 새로 만든 폴더를 목록 끝에 추가하고 바로 선택합니다.
  func addFolder(_ folder: ShareFolder, selected: Bool) {
    folders.append(folder)
    if selected { selectedIds.insert(folder.id) }
    listStack.addArrangedSubview(makeFolderRow(folder))
    refreshEmptyState()
    layoutIfNeeded()
  }

  @objc private func handleCreate() { onCreate?() }

  @objc private func handleSave() {
    // 목록 순서(생성 순서)를 유지해 돌려줍니다.
    onSave?(folders.map(\.id).filter { selectedIds.contains($0) })
  }

  func present() {
    layoutIfNeeded()
    panelBottom?.constant = 0
    UIView.animate(withDuration: 0.28, delay: 0, options: .curveEaseOut) {
      self.alpha = 1
      self.layoutIfNeeded()
    }
  }

  func dismiss(completion: @escaping () -> Void) {
    panelBottom?.constant = panel.bounds.height
    UIView.animate(withDuration: 0.22, delay: 0, options: .curveEaseIn, animations: {
      self.alpha = 0
      self.layoutIfNeeded()
    }, completion: { _ in
      self.removeFromSuperview()
      completion()
    })
  }

  private static func color(hex: String) -> UIColor {
    var value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if value.count != 6 { value = "8FA2FF" }
    var rgb: UInt64 = 0
    Scanner(string: value).scanHexInt64(&rgb)
    return UIColor(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1
    )
  }
}
