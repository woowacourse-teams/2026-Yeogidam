import UIKit
import CoreLocation
import KakaoMapsSDK

@objc(KakaoMapContainerView)
final class KakaoMapContainerView: UIView, MapControllerDelegate, CLLocationManagerDelegate {
  @objc var onMapReady: ((NSDictionary) -> Void)?
  @objc var onMapError: ((NSDictionary) -> Void)?

  private let mapContainer = KMViewContainer()
  private var mapController: KMController?
  private lazy var locationManager: CLLocationManager = {
    let manager = CLLocationManager()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    manager.distanceFilter = 3
    return manager
  }()
  private var currentLocationPoi: Poi?
  private var lastKnownLocation: CLLocation?

  private var latitude: Double = 37.5665
  private var longitude: Double = 126.9780
  private var zoomLevel: Int = 15
  private var showsCurrentLocation = false
  private var currentLocationRequestId = 0
  private var enginePrepared = false
  private var mapAdded = false
  private var currentLocationStyleAdded = false
  private var hasCenteredOnCurrentLocation = false

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
    zoomLevel: Int,
    showsCurrentLocation: Bool,
    currentLocationRequestId: Int
  ) {
    self.latitude = latitude
    self.longitude = longitude
    self.zoomLevel = zoomLevel

    if self.showsCurrentLocation != showsCurrentLocation {
      self.showsCurrentLocation = showsCurrentLocation
      hasCenteredOnCurrentLocation = false

      if showsCurrentLocation {
        requestCurrentLocationIfNeeded()
      } else {
        locationManager.stopUpdatingLocation()
        removeCurrentLocationMarker()
      }
    }

    moveCameraIfPossible()

    if self.currentLocationRequestId != currentLocationRequestId {
      self.currentLocationRequestId = currentLocationRequestId
      centerMapOnCurrentLocation()
    }
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
    requestCurrentLocationIfNeeded()

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

  private func requestCurrentLocationIfNeeded() {
    guard showsCurrentLocation, mapAdded, window != nil else { return }

    guard CLLocationManager.locationServicesEnabled() else {
      onMapError?([
        "message": "기기의 위치 서비스가 꺼져 있습니다."
      ])
      return
    }

    switch locationManager.authorizationStatus {
    case .notDetermined:
      locationManager.requestWhenInUseAuthorization()
    case .authorizedAlways, .authorizedWhenInUse:
      locationManager.startUpdatingLocation()
    case .denied, .restricted:
      onMapError?([
        "message": "현재 위치를 표시하려면 위치 권한이 필요합니다."
      ])
    @unknown default:
      break
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    requestCurrentLocationIfNeeded()
  }

  func locationManager(
    _ manager: CLLocationManager,
    didUpdateLocations locations: [CLLocation]
  ) {
    guard
      let location = locations.last,
      location.horizontalAccuracy >= 0
    else {
      return
    }

    updateCurrentLocation(location)
  }

  func locationManager(
    _ manager: CLLocationManager,
    didFailWithError error: Error
  ) {
    if let locationError = error as? CLError,
       locationError.code == .locationUnknown {
      return
    }

    onMapError?([
      "message": "현재 위치를 가져오지 못했습니다: \(error.localizedDescription)"
    ])
  }

  private func updateCurrentLocation(_ location: CLLocation) {
    guard
      showsCurrentLocation,
      let kakaoMap = mapController?.getView("mapview") as? KakaoMap
    else {
      return
    }

    lastKnownLocation = location
    let position = MapPoint(
      longitude: location.coordinate.longitude,
      latitude: location.coordinate.latitude
    )

    if let currentLocationPoi {
      currentLocationPoi.moveAt(position, duration: 200)
    } else {
      addCurrentLocationMarker(to: kakaoMap, at: position)
    }

    if !hasCenteredOnCurrentLocation {
      centerMapOnCurrentLocation()
    }
  }

  private func centerMapOnCurrentLocation() {
    guard
      showsCurrentLocation,
      let location = lastKnownLocation,
      let kakaoMap = mapController?.getView("mapview") as? KakaoMap
    else {
      hasCenteredOnCurrentLocation = false
      requestCurrentLocationIfNeeded()
      return
    }

    let position = MapPoint(
      longitude: location.coordinate.longitude,
      latitude: location.coordinate.latitude
    )
    let cameraUpdate = CameraUpdate.make(
      target: position,
      zoomLevel: zoomLevel,
      mapView: kakaoMap
    )

    hasCenteredOnCurrentLocation = true
    kakaoMap.moveCamera(cameraUpdate)
  }

  private func addCurrentLocationMarker(
    to kakaoMap: KakaoMap,
    at position: MapPoint
  ) {
    let labelManager = kakaoMap.getLabelManager()

    if !currentLocationStyleAdded {
      let iconStyle = PoiIconStyle(
        symbol: makeCurrentLocationMarker(),
        anchorPoint: CGPoint(x: 0.5, y: 0.5)
      )
      let style = PoiStyle(
        styleID: Self.currentLocationStyleID,
        styles: [
          PerLevelPoiStyle(iconStyle: iconStyle, level: 0)
        ]
      )

      labelManager.addPoiStyle(style)
      currentLocationStyleAdded = true
    }

    let layer =
      labelManager.getLabelLayer(layerID: Self.currentLocationLayerID) ??
      labelManager.addLabelLayer(
        option: LabelLayerOptions(
          layerID: Self.currentLocationLayerID,
          competitionType: .none,
          competitionUnit: .symbolFirst,
          orderType: .rank,
          zOrder: 1_000
        )
      )

    let options = PoiOptions(
      styleID: Self.currentLocationStyleID,
      poiID: Self.currentLocationPoiID
    )
    options.rank = 1

    currentLocationPoi = layer?.addPoi(option: options, at: position)
    currentLocationPoi?.show()
  }

  private func removeCurrentLocationMarker() {
    guard
      let kakaoMap = mapController?.getView("mapview") as? KakaoMap,
      let layer = kakaoMap
        .getLabelManager()
        .getLabelLayer(layerID: Self.currentLocationLayerID)
    else {
      currentLocationPoi = nil
      return
    }

    layer.removePoi(poiID: Self.currentLocationPoiID)
    currentLocationPoi = nil
  }

  private func makeCurrentLocationMarker() -> UIImage {
    let size = CGSize(width: 28, height: 28)

    return UIGraphicsImageRenderer(size: size).image { context in
      let bounds = CGRect(origin: .zero, size: size)
      let outerCircle = UIBezierPath(ovalIn: bounds)
      UIColor(red: 92 / 255, green: 117 / 255, blue: 1, alpha: 0.22)
        .setFill()
      outerCircle.fill()

      let whiteCircle = UIBezierPath(
        ovalIn: bounds.insetBy(dx: 4, dy: 4)
      )
      UIColor.white.setFill()
      whiteCircle.fill()

      let blueCircle = UIBezierPath(
        ovalIn: bounds.insetBy(dx: 7, dy: 7)
      )
      UIColor(red: 92 / 255, green: 117 / 255, blue: 1, alpha: 1)
        .setFill()
      blueCircle.fill()

      context.cgContext.setAllowsAntialiasing(true)
    }
  }

  @objc
  private func applicationDidBecomeActive() {
    guard window != nil else { return }
    mapController?.activateEngine()
    requestCurrentLocationIfNeeded()
  }

  @objc
  private func applicationWillResignActive() {
    locationManager.stopUpdatingLocation()
    mapController?.pauseEngine()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    locationManager.stopUpdatingLocation()
    mapController?.pauseEngine()
    mapController?.resetEngine()
  }

  private static let currentLocationLayerID = "yeogidam-current-location-layer"
  private static let currentLocationStyleID = "yeogidam-current-location-style"
  private static let currentLocationPoiID = "yeogidam-current-location-poi"
}
