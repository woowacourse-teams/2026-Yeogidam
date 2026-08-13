import UIKit
import CoreLocation
import KakaoMapsSDK

@objc(KakaoMapContainerView)
final class KakaoMapContainerView: UIView, MapControllerDelegate, CLLocationManagerDelegate {
  @objc var onMapReady: ((NSDictionary) -> Void)?
  @objc var onMapError: ((NSDictionary) -> Void)?
  @objc var onCameraChanged: ((NSDictionary) -> Void)?

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
  private var cameraStoppedHandler: (any DisposableEventHandler)?
  private var savedPlaceStyleAdded = false
  private var savedPlacesJson = "[]"
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
  private var needsDefaultCameraMove = false
  private var needsCurrentLocationCameraMove = false
  private var cameraMoveScheduled = false

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

    scheduleCameraMove()
    if mapAdded {
      DispatchQueue.main.async { [weak self] in self?.emitCameraChanged() }
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window != nil, enginePrepared {
      mapController?.activateEngine()
      scheduleCameraMove()
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
    currentLocationRequestId: Int,
    savedPlacesJson: String
  ) {
    let defaultCameraChanged =
      self.latitude != latitude ||
      self.longitude != longitude ||
      self.zoomLevel != zoomLevel

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

    if defaultCameraChanged {
      moveCameraIfPossible()
    }

    if self.currentLocationRequestId != currentLocationRequestId {
      self.currentLocationRequestId = currentLocationRequestId
      centerMapOnCurrentLocation()
    }

    if self.savedPlacesJson != savedPlacesJson {
      self.savedPlacesJson = savedPlacesJson
      renderSavedPlaceMarkers()
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
    renderSavedPlaceMarkers()
    if let kakaoMap = mapController?.getView("mapview") as? KakaoMap {
      cameraStoppedHandler = kakaoMap.addCameraStoppedEventHandler(
        target: self,
        handler: { owner in
          { _ in owner.emitCameraChanged() }
        }
      )
    }

    onMapReady?([
      "ready": true
    ])
    DispatchQueue.main.async { [weak self] in self?.emitCameraChanged() }
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

    scheduleCameraMove()
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
    updateCameraMargins()
  }

  private func updateCameraMargins() {
    guard
      let kakaoMap = mapController?.getView("mapview") as? KakaoMap,
      mapContainer.bounds.height > 0
    else { return }

    // Keep the Metal-backed native view at a stable full-screen size. Kakao's
    // camera margin moves the visual center above the bottom sheet without
    // resizing or translating the renderer itself.
    let bottomInset = min(
      cameraBottomInset,
      max(0, mapContainer.bounds.height - 1)
    )
    kakaoMap.setMargins(
      UIEdgeInsets(top: 0, left: 0, bottom: bottomInset, right: 0)
    )
  }

  private func moveCameraIfPossible() {
    needsDefaultCameraMove = true
    scheduleCameraMove()
  }

  private func scheduleCameraMove() {
    guard !cameraMoveScheduled else { return }

    cameraMoveScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }

      self.cameraMoveScheduled = false
      self.flushCameraMoveIfPossible()
    }
  }

  private func flushCameraMoveIfPossible() {
    guard
      mapAdded,
      window != nil,
      mapController?.isEngineActive == true,
      mapContainer.bounds.width > 0,
      mapContainer.bounds.height > 0,
      let kakaoMap =
        mapController?.getView("mapview") as? KakaoMap
    else {
      return
    }

    containerDidResized(mapContainer.bounds.size)

    if needsCurrentLocationCameraMove, let location = lastKnownLocation {
      needsCurrentLocationCameraMove = false
      needsDefaultCameraMove = false

      guard isInsideKakaoMapCoverage(location.coordinate) else {
        onMapError?([
          "message": "현재 위치가 카카오맵 지원 지역 밖에 있습니다. 시뮬레이터에서는 위치를 대한민국 좌표로 설정해 주세요."
        ])
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
      return
    }

    guard needsDefaultCameraMove else { return }
    needsDefaultCameraMove = false

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
    guard isInsideKakaoMapCoverage(location.coordinate) else {
      if needsCurrentLocationCameraMove {
        scheduleCameraMove()
      }
      return
    }

    let position = MapPoint(
      longitude: location.coordinate.longitude,
      latitude: location.coordinate.latitude
    )

    if let currentLocationPoi {
      currentLocationPoi.moveAt(position, duration: 200)
    } else {
      addCurrentLocationMarker(to: kakaoMap, at: position)
    }

    if needsCurrentLocationCameraMove {
      scheduleCameraMove()
    }

    // Preserve the saved-place camera on first load. The location button is
    // the explicit action that moves the map to the user's position.
  }

  private func centerMapOnCurrentLocation() {
    guard showsCurrentLocation else { return }

    needsCurrentLocationCameraMove = true
    guard lastKnownLocation != nil else {
      requestCurrentLocationIfNeeded()
      return
    }

    scheduleCameraMove()
  }

  private func isInsideKakaoMapCoverage(
    _ coordinate: CLLocationCoordinate2D
  ) -> Bool {
    (32.0...39.5).contains(coordinate.latitude) &&
      (123.0...132.0).contains(coordinate.longitude)
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

  private func renderSavedPlaceMarkers() {
    guard
      let kakaoMap = mapController?.getView("mapview") as? KakaoMap,
      let data = savedPlacesJson.data(using: .utf8),
      let places = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return
    }

    let labelManager = kakaoMap.getLabelManager()
    let layer =
      labelManager.getLabelLayer(layerID: Self.savedPlaceLayerID) ??
      labelManager.addLabelLayer(
        option: LabelLayerOptions(
          layerID: Self.savedPlaceLayerID,
          competitionType: .none,
          competitionUnit: .symbolFirst,
          orderType: .rank,
          zOrder: 900
        )
      )
    layer?.clearAllItems()

    if !savedPlaceStyleAdded {
      let iconStyle = PoiIconStyle(
        symbol: makeSavedPlaceMarker(),
        anchorPoint: CGPoint(x: 0.5, y: 0.5)
      )
      labelManager.addPoiStyle(
        PoiStyle(
          styleID: Self.savedPlaceStyleID,
          styles: [PerLevelPoiStyle(iconStyle: iconStyle, level: 0)]
        )
      )
      savedPlaceStyleAdded = true
    }

    places.forEach { place in
      guard
        let id = place["id"] as? String,
        let latitude = place["latitude"] as? Double,
        let longitude = place["longitude"] as? Double
      else { return }
      let options = PoiOptions(styleID: Self.savedPlaceStyleID, poiID: id)
      options.rank = 1
      layer?.addPoi(
        option: options,
        at: MapPoint(longitude: longitude, latitude: latitude)
      )?.show()
    }
  }

  private func emitCameraChanged() {
    guard
      let kakaoMap = mapController?.getView("mapview") as? KakaoMap
    else { return }

    let coordinate = kakaoMap.getPosition(
      CGPoint(x: kakaoMap.viewRect.midX, y: kakaoMap.viewRect.midY)
    ).wgsCoord
    let corners = [
      CGPoint(x: kakaoMap.viewRect.minX, y: kakaoMap.viewRect.minY),
      CGPoint(x: kakaoMap.viewRect.maxX, y: kakaoMap.viewRect.minY),
      CGPoint(x: kakaoMap.viewRect.minX, y: kakaoMap.viewRect.maxY),
      CGPoint(x: kakaoMap.viewRect.maxX, y: kakaoMap.viewRect.maxY)
    ].map { kakaoMap.getPosition($0).wgsCoord }
    let latitudes = corners.map(\.latitude)
    let longitudes = corners.map(\.longitude)
    guard
      let southLatitude = latitudes.min(),
      let northLatitude = latitudes.max(),
      let westLongitude = longitudes.min(),
      let eastLongitude = longitudes.max()
    else { return }
    onCameraChanged?([
      "latitude": coordinate.latitude,
      "longitude": coordinate.longitude,
      "zoomLevel": kakaoMap.zoomLevel,
      "southLatitude": southLatitude,
      "northLatitude": northLatitude,
      "westLongitude": westLongitude,
      "eastLongitude": eastLongitude
    ])
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

  private func makeSavedPlaceMarker() -> UIImage {
    let size = CGSize(width: 34, height: 44)
    return UIGraphicsImageRenderer(size: size).image { _ in
      let center = CGPoint(x: 17, y: 14)
      let radius: CGFloat = 12
      let tail = UIBezierPath()
      tail.move(to: CGPoint(x: 10, y: 20))
      tail.addLine(to: CGPoint(x: 17, y: 44))
      tail.addLine(to: CGPoint(x: 24, y: 20))
      tail.close()
      UIColor.white.setFill()
      tail.fill()
      UIBezierPath(
        ovalIn: CGRect(x: 3, y: 0, width: 28, height: 28)
      ).fill()
      UIColor(red: 122 / 255, green: 199 / 255, blue: 223 / 255, alpha: 1).setFill()
      UIBezierPath(
        ovalIn: CGRect(x: center.x - radius, y: center.y - radius, width: 24, height: 24)
      ).fill()
      UIColor.white.setFill()
      UIBezierPath(ovalIn: CGRect(x: 12.5, y: 9.5, width: 9, height: 9)).fill()
    }
  }

  @objc
  private func applicationDidBecomeActive() {
    guard window != nil else { return }
    mapController?.activateEngine()
    scheduleCameraMove()
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
  private static let savedPlaceLayerID = "yeogidam-saved-place-layer"
  private static let savedPlaceStyleID = "yeogidam-saved-place-style"
}
