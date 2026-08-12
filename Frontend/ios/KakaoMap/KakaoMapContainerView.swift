import UIKit
import KakaoMapsSDK

@objc(KakaoMapContainerView)
final class KakaoMapContainerView: UIView, MapControllerDelegate {
  @objc var onMapReady: ((NSDictionary) -> Void)?
  @objc var onMapError: ((NSDictionary) -> Void)?

  private let mapContainer = KMViewContainer()
  private var mapController: KMController?

  private var latitude: Double = 37.5665
  private var longitude: Double = 126.9780
  private var zoomLevel: Int = 15
  private var enginePrepared = false
  private var mapAdded = false

  override init(frame: CGRect) {
    super.init(frame: frame)
    configure()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure()
  }

  private func configure() {
    addSubview(mapContainer)

    mapController = KMController(viewContainer: mapContainer)
    mapController?.delegate = self

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
  }

  override func layoutSubviews() {
    super.layoutSubviews()

    mapContainer.frame = bounds

    guard bounds.width > 0, bounds.height > 0 else { return }

    if !enginePrepared {
      enginePrepared = true
      mapController?.prepareEngine()

      if window != nil {
        mapController?.activateEngine()
      }
    } else {
      containerDidResized(mapContainer.bounds.size)
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window != nil, enginePrepared {
      mapController?.activateEngine()
    } else {
      mapController?.pauseEngine()
    }
  }

  @objc
  func update(
    latitude: Double,
    longitude: Double,
    zoomLevel: Int
  ) {
    self.latitude = latitude
    self.longitude = longitude
    self.zoomLevel = zoomLevel

    moveCameraIfPossible()
  }

  func addViews() {
    guard !mapAdded else { return }

    let position = MapPoint(
      longitude: longitude,
      latitude: latitude
    )

    let viewInfo = MapviewInfo(
      viewName: "mapview",
      viewInfoName: "map",
      defaultPosition: position,
      defaultLevel: zoomLevel
    )

    mapController?.addView(viewInfo)
  }

  func addViewSucceeded(
    _ viewName: String,
    viewInfoName: String
  ) {
    mapAdded = true
    containerDidResized(mapContainer.bounds.size)
    moveCameraIfPossible()

    onMapReady?([
      "ready": true
    ])
  }

  func addViewFailed(
    _ viewName: String,
    viewInfoName: String
  ) {
    onMapError?([
      "message": "카카오 지도 View 생성에 실패했습니다."
    ])
  }

  func authenticationFailed(
    _ errorCode: Int,
    desc: String
  ) {
    onMapError?([
      "message": "카카오맵 인증 실패(\(errorCode)): \(desc)"
    ])
  }

  func authenticationSucceeded() {
    if window != nil, mapController?.isEngineActive == false {
      mapController?.activateEngine()
    }
  }

  func containerDidResized(_ size: CGSize) {
    guard
      let kakaoMap =
        mapController?.getView("mapview") as? KakaoMap
    else {
      return
    }

    kakaoMap.viewRect = CGRect(
      origin: .zero,
      size: size
    )
  }

  private func moveCameraIfPossible() {
    guard
      mapAdded,
      let kakaoMap =
        mapController?.getView("mapview") as? KakaoMap
    else {
      return
    }

    let position = MapPoint(
      longitude: longitude,
      latitude: latitude
    )

    let cameraUpdate = CameraUpdate.make(
      target: position,
      zoomLevel: zoomLevel,
      mapView: kakaoMap
    )

    kakaoMap.moveCamera(cameraUpdate)
  }

  @objc
  private func applicationDidBecomeActive() {
    guard window != nil else { return }
    mapController?.activateEngine()
  }

  @objc
  private func applicationWillResignActive() {
    mapController?.pauseEngine()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    mapController?.pauseEngine()
    mapController?.resetEngine()
  }
}
