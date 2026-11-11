import UIKit
import CoreLocation
import GoogleMaps

// 지도 화면의 Google 지도입니다. 카카오 지도(KakaoMapContainerView)와 같은 props·이벤트를 받고,
// 핀 모양·이름 표시·카메라 이동도 카카오 지도와 똑같이 동작하도록 옮겼습니다.
@objc(GoogleMapContainerView)
final class GoogleMapContainerView: UIView, CLLocationManagerDelegate {
  @objc var onMapReady: ((NSDictionary) -> Void)?
  @objc var onMapError: ((NSDictionary) -> Void)?
  @objc var onCameraChanged: ((NSDictionary) -> Void)?
  @objc var onMarkerPressed: ((NSDictionary) -> Void)?
  @objc var onMapPanStarted: ((NSDictionary) -> Void)?

  private var mapView: GMSMapView?
  private lazy var locationManager: CLLocationManager = {
    let manager = CLLocationManager()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    manager.distanceFilter = 3
    return manager
  }()
  private var currentLocationMarker: GMSMarker?
  private var savedPlacesJson = "[]"
  private var savedPlaceMarkers: [SavedPlaceMarker] = []
  private var placeMarkersByID: [String: GMSMarker] = [:]
  private var placeStyleIDByID: [String: String] = [:]
  private var placeIcons: [String: (image: UIImage, anchorY: CGFloat)] = [:]
  private var placeNameShownIDs = Set<String>()
  private var placeNameTextSizes: [String: CGSize] = [:]
  private var lastKnownLocation: CLLocation?
  private var zoomMapStylesJson = ""
  private var zoomMapStyles: [(minZoom: Float, style: GMSMapStyle?)] = []
  private var appliedMapStyleIndex: Int?
  private var subwayStationsJson = ""
  private let subwayStationLayer = SubwayStationLayer()

  private var latitude: Double = 37.5665
  private var longitude: Double = 126.9780
  private var zoomLevel: Int = 15
  private var cameraMoveRequestId = 0
  private var cameraFitPointsJson = "[]"
  private var cameraFitRequestId = 0
  private var showsCurrentLocation = false
  private var currentLocationRequestId = 0
  private var cameraBottomInset: CGFloat = 0
  private var needsDefaultCameraMove = false
  private var needsFitSearchResultsCameraMove = false
  private var needsCurrentLocationCameraMove = false
  private var cameraMoveScheduled = false
  private var reportedMissingApiKey = false
  private var isAdjustingPadding = false
  private var logoBottomInset: CGFloat = 0
  private var lastPlaceNameRefreshTime: CFTimeInterval = 0

  private lazy var mapDelegate = MapDelegate(
    onWillMove: { [weak self] isGesture in
      self?.cameraWillMove(isGesture: isGesture)
    },
    onChange: { [weak self] in
      self?.applyMapStyle()
      self?.refreshSubwayStations()
      self?.refreshPlaceNamesWhileMoving()
    },
    onIdle: { [weak self] in
      self?.emitCameraChanged()
      self?.refreshPlaceNames()
      self?.refreshSubwayStations()
    },
    onTapMarker: { [weak self] marker in
      self?.markerTapped(marker)
    }
  )

  override init(frame: CGRect) {
    super.init(frame: frame)
    configure()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure()
  }

  private func configure() {
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
    guard bounds.width > 0, bounds.height > 0 else { return }

    if let mapView {
      mapView.frame = bounds
      scheduleCameraMove()
      DispatchQueue.main.async { [weak self] in
        self?.emitCameraChanged()
        self?.refreshPlaceNames()
      }
      return
    }

    createMap()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window != nil {
      scheduleCameraMove()
    }
  }

  private func createMap() {
    // AppDelegate가 키를 넘기지 못했으면 지도를 만들 때 앱이 종료되므로, 지도 대신 오류를 알립니다.
    guard Self.hasApiKey else {
      if !reportedMissingApiKey {
        reportedMissingApiKey = true
        onMapError?([
          "message": "Google 지도 키가 설정되지 않아 지도를 표시할 수 없습니다."
        ])
      }
      return
    }

    let options = GMSMapViewOptions()
    options.frame = bounds
    options.camera = GMSCameraPosition(
      latitude: latitude,
      longitude: longitude,
      zoom: Float(zoomLevel)
    )
    let mapView = GMSMapView(options: options)
    mapView.delegate = mapDelegate
    mapView.settings.indoorPicker = false
    // Google 로고가 시트 위에 보이도록 아래쪽 여백을 둡니다(mapBottomPadding 참고).
    mapView.padding = UIEdgeInsets(top: 0, left: 0, bottom: mapBottomPadding, right: 0)
    addSubview(mapView)
    self.mapView = mapView
    // 안전 영역을 먼저 잡아 두어야 첫 카메라 이동부터 시트 위쪽 가운데에 정확히 놓입니다.
    mapView.layoutIfNeeded()

    applyMapStyle()
    // 여백이 적용된 뒤의 화면 가운데에 처음 카메라를 다시 맞춥니다.
    moveCameraIfPossible()
    requestCurrentLocationIfNeeded()
    renderSavedPlaceMarkers()
    refreshSubwayStations()

    onMapReady?([
      "ready": true
    ])
    DispatchQueue.main.async { [weak self] in self?.emitCameraChanged() }
  }

  @objc
  func update(
    latitude: Double,
    longitude: Double,
    zoomLevel: Int,
    cameraMoveRequestId: Int,
    cameraFitPointsJson: String,
    cameraFitRequestId: Int,
    showsCurrentLocation: Bool,
    currentLocationRequestId: Int,
    cameraBottomInset: Double,
    savedPlacesJson: String
  ) {
    let defaultCameraChanged =
      self.latitude != latitude ||
      self.longitude != longitude ||
      self.zoomLevel != zoomLevel

    self.latitude = latitude
    self.longitude = longitude
    self.zoomLevel = zoomLevel
    self.cameraFitPointsJson = cameraFitPointsJson

    let nextCameraBottomInset = max(0, CGFloat(cameraBottomInset))
    if self.cameraBottomInset != nextCameraBottomInset {
      self.cameraBottomInset = nextCameraBottomInset
      updateCameraPadding()
    }

    if self.showsCurrentLocation != showsCurrentLocation {
      self.showsCurrentLocation = showsCurrentLocation
      if showsCurrentLocation {
        requestCurrentLocationIfNeeded()
        if needsCurrentLocationCameraMove, lastKnownLocation != nil {
          scheduleCameraMove()
        }
      } else {
        locationManager.stopUpdatingLocation()
        removeCurrentLocationMarker()
      }
    }

    if defaultCameraChanged || self.cameraMoveRequestId != cameraMoveRequestId {
      self.cameraMoveRequestId = cameraMoveRequestId
      moveCameraIfPossible()
    }

    if self.cameraFitRequestId != cameraFitRequestId {
      self.cameraFitRequestId = cameraFitRequestId
      moveCameraToFitSearchResultsIfPossible()
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

  @objc
  func updateZoomMapStyles(json: String) {
    guard zoomMapStylesJson != json else { return }
    zoomMapStylesJson = json

    let items = json.data(using: .utf8)
      .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [[String: Any]] } ?? []
    zoomMapStyles = items.compactMap { item in
      guard
        let minZoom = item["minZoom"] as? Double,
        let styleJson = item["styleJson"] as? String
      else { return nil }
      return (Float(minZoom), try? GMSMapStyle(jsonString: styleJson))
    }
    appliedMapStyleIndex = nil
    applyMapStyle()
  }

  @objc
  func updateSubwayStations(json: String, minZoom: Int, nameMinZoom: Int) {
    subwayStationLayer.minZoom = Float(minZoom)
    subwayStationLayer.nameMinZoom = Float(nameMinZoom)
    if subwayStationsJson != json {
      subwayStationsJson = json
      subwayStationLayer.setStations(json: json)
    }
    refreshSubwayStations()
  }

  private func refreshSubwayStations() {
    guard let mapView else { return }
    subwayStationLayer.refresh(on: mapView)
  }

  // 줌이 단계 경계를 넘을 때만 스타일을 바꿔 끼워, 매 프레임 다시 그리지 않게 합니다.
  private func applyMapStyle() {
    guard let mapView else { return }
    let zoom = mapView.camera.zoom
    let index = zoomMapStyles.lastIndex { $0.minZoom <= zoom }
    guard index != appliedMapStyleIndex else { return }

    appliedMapStyleIndex = index
    mapView.mapStyle = index.flatMap { zoomMapStyles[$0].style }
  }

  private func cameraWillMove(isGesture: Bool) {
    // 시트 높이에 맞춰 지도를 제자리에 두는 이동은 사용자가 지도를 움직인 것이 아니므로 알리지 않습니다.
    guard !isAdjustingPadding else { return }

    if isGesture {
      onMapPanStarted?(["started": true])
    }

    // An inverted range is a lightweight signal over the existing Fabric
    // event: JS clears the previous list while the user is moving the map.
    // The idle callback immediately replaces it with the final real bounds.
    onCameraChanged?([
      "latitude": latitude,
      "longitude": longitude,
      "zoomLevel": zoomLevel,
      "southLatitude": 1,
      "northLatitude": 0,
      "westLongitude": 1,
      "eastLongitude": 0
    ])
  }

  // 저장 장소 핀만 눌림을 전달합니다. 어떤 핀이든 Google 기본 동작(말풍선, 카메라 이동)은 막습니다.
  private func markerTapped(_ marker: GMSMarker) {
    guard let mapView, let placeID = marker.userData as? String else { return }
    let coordinate = mapView.projection.coordinate(for: exposedCenterPoint(in: mapView))
    onMarkerPressed?([
      "id": placeID,
      "latitude": coordinate.latitude,
      "longitude": coordinate.longitude,
      "zoomLevel": Int(mapView.camera.zoom.rounded()),
      "cameraBottomInset": cameraBottomInset
    ])
  }

  // 여백을 바꿀 때마다 Google이 다음 프레임에 카메라를 새 여백 가운데로 다시 맞추면서 지도가 깜빡이므로,
  // 여백은 Google 로고 자리로만 씁니다. JS가 준 높이(시트를 내린 높이) 위에 로고를 고정하고,
  // 시트에 가려진 영역을 피해 카메라를 맞추는 일은 exposedCenterPoint로 직접 합니다.
  // 로고는 시트 둥근 모서리에 걸리지 않는 선에서 시트 쪽으로 조금 내립니다.
  private var mapBottomPadding: CGFloat {
    max(0, logoBottomInset - Self.logoLowering)
  }

  @objc
  func updateLogoBottomInset(_ value: Double) {
    let nextValue = max(0, CGFloat(value))
    guard logoBottomInset != nextValue else { return }
    logoBottomInset = nextValue
    updateCameraPadding()
  }

  private func updateCameraPadding() {
    guard let mapView else { return }
    defer { DispatchQueue.main.async { [weak self] in self?.emitCameraChanged() } }

    let bottomPadding = mapBottomPadding
    guard mapView.padding.bottom != bottomPadding else { return }

    // 여백이 바뀌는 드문 경우에도 보이는 지도는 그대로 두려고, 새 여백 가운데 자리에 있던 좌표로
    // 카메라를 다시 맞춥니다. Google은 여백에 안전 영역(상태바 등)까지 더해 가운데를 잡습니다.
    let newCenter = paddedCenterPoint(in: mapView, bottomPadding: bottomPadding)
    let target = mapView.projection.coordinate(for: newCenter)
    mapView.padding = UIEdgeInsets(top: 0, left: 0, bottom: bottomPadding, right: 0)
    isAdjustingPadding = true
    mapView.moveCamera(GMSCameraUpdate.setTarget(target))
    isAdjustingPadding = false
  }

  // Google이 카메라 중심(target)을 두는 화면 위치입니다.
  private func paddedCenterPoint(in mapView: GMSMapView, bottomPadding: CGFloat? = nil) -> CGPoint {
    let safeArea = mapView.safeAreaInsets
    let bottom = bottomPadding ?? mapView.padding.bottom
    return CGPoint(
      x: mapView.bounds.midX,
      y: (safeArea.top + mapView.bounds.height - bottom - safeArea.bottom) / 2
    )
  }

  // 바텀시트에 가려지지 않은 영역의 가운데입니다. 카메라를 옮길 좌표는 여기에 놓입니다.
  private func exposedCenterPoint(in mapView: GMSMapView) -> CGPoint {
    let safeArea = mapView.safeAreaInsets
    return CGPoint(
      x: mapView.bounds.midX,
      y: (safeArea.top + mapView.bounds.height - cameraBottomInset - safeArea.bottom) / 2
    )
  }

  // 좌표를 Google 카메라 중심이 아니라 시트 위쪽 영역 가운데에 오도록 카메라를 옮깁니다.
  // 두 번 옮기지만 같은 순간에 처리되어 화면에는 마지막 위치만 그려집니다.
  private func moveCamera(_ mapView: GMSMapView, to coordinate: CLLocationCoordinate2D, zoom: Float) {
    mapView.moveCamera(GMSCameraUpdate.setTarget(coordinate, zoom: zoom))
    let padded = paddedCenterPoint(in: mapView)
    let exposed = exposedCenterPoint(in: mapView)
    let target = mapView.projection.coordinate(for: CGPoint(x: padded.x, y: padded.y * 2 - exposed.y))
    mapView.moveCamera(GMSCameraUpdate.setTarget(target))
  }

  private func moveCameraIfPossible() {
    needsDefaultCameraMove = true
    scheduleCameraMove()
  }

  private func moveCameraToFitSearchResultsIfPossible() {
    needsFitSearchResultsCameraMove = true
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
      let mapView,
      window != nil,
      mapView.bounds.width > 0,
      mapView.bounds.height > 0
    else {
      return
    }

    if needsCurrentLocationCameraMove, let location = lastKnownLocation {
      needsCurrentLocationCameraMove = false
      needsDefaultCameraMove = false

      moveCamera(mapView, to: location.coordinate, zoom: Float(zoomLevel))
      return
    }

    if needsFitSearchResultsCameraMove {
      needsFitSearchResultsCameraMove = false
      needsDefaultCameraMove = false

      guard let points = searchResultPoints(), points.count >= 2 else {
        return
      }

      // 시트에 가려지지 않은 영역 안에 모든 좌표가 들어오는 줌을 메르카토르 좌표로 직접 구합니다.
      let padding = Self.searchResultCameraPadding
      let safeArea = mapView.safeAreaInsets
      let availableWidth = mapView.bounds.width - padding * 2
      let availableHeight =
        mapView.bounds.height - safeArea.top - safeArea.bottom - cameraBottomInset - padding * 2
      let xs = points.map { ($0.longitude + 180) / 360 }
      let ys = points.map { point -> Double in
        let sine = sin(point.latitude * .pi / 180)
        return 0.5 - log((1 + sine) / (1 - sine)) / (4 * .pi)
      }
      guard
        let minX = xs.min(), let maxX = xs.max(),
        let minY = ys.min(), let maxY = ys.max(),
        availableWidth > 0, availableHeight > 0
      else {
        return
      }
      let spanX = max(maxX - minX, .ulpOfOne)
      let spanY = max(maxY - minY, .ulpOfOne)
      let fitZoom = log2(min(Double(availableWidth) / (256 * spanX), Double(availableHeight) / (256 * spanY)))
      let centerY = (minY + maxY) / 2
      let center = CLLocationCoordinate2D(
        latitude: atan(sinh(.pi * (1 - 2 * centerY))) * 180 / .pi,
        longitude: (minX + maxX) / 2 * 360 - 180
      )
      moveCamera(mapView, to: center, zoom: min(Float(fitZoom), Self.searchResultMaxZoomLevel))
      return
    }

    guard needsDefaultCameraMove else { return }
    needsDefaultCameraMove = false

    moveCamera(
      mapView,
      to: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
      zoom: Float(zoomLevel)
    )
  }

  private func searchResultPoints() -> [CLLocationCoordinate2D]? {
    guard
      let data = cameraFitPointsJson.data(using: .utf8),
      let places = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return nil
    }

    return places.compactMap { place in
      guard
        let latitude = place["latitude"] as? Double,
        let longitude = place["longitude"] as? Double
      else {
        return nil
      }

      return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
  }

  private func requestCurrentLocationIfNeeded() {
    guard showsCurrentLocation, mapView != nil, window != nil else { return }

    guard CLLocationManager.locationServicesEnabled() else {
      onMapError?([
        "message": "기기의 위치 서비스가 꺼져 있습니다."
      ])
      return
    }

    switch locationManager.authorizationStatus {
    case .notDetermined:
      break
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
    guard showsCurrentLocation, let mapView else { return }

    lastKnownLocation = location

    if let currentLocationMarker {
      CATransaction.begin()
      CATransaction.setAnimationDuration(0.2)
      currentLocationMarker.position = location.coordinate
      CATransaction.commit()
    } else {
      let marker = GMSMarker(position: location.coordinate)
      marker.icon = makeCurrentLocationMarker()
      marker.groundAnchor = CGPoint(x: 0.5, y: 0.5)
      marker.zIndex = Int32.max
      marker.isTappable = false
      marker.map = mapView
      currentLocationMarker = marker
    }

    if needsCurrentLocationCameraMove {
      scheduleCameraMove()
    }

    // Preserve the saved-place camera on first load. The location button is
    // the explicit action that moves the map to the user's position.
  }

  private func centerMapOnCurrentLocation() {
    needsCurrentLocationCameraMove = true
    guard showsCurrentLocation else { return }
    guard lastKnownLocation != nil else {
      requestCurrentLocationIfNeeded()
      return
    }

    scheduleCameraMove()
  }

  private func removeCurrentLocationMarker() {
    currentLocationMarker?.map = nil
    currentLocationMarker = nil
  }

  private struct SavedPlaceMarker {
    let id: String
    let latitude: Double
    let longitude: Double
    let selected: Bool
    let colorHex: String?
    let category: String?
    let name: String
  }

  private func renderSavedPlaceMarkers() {
    guard
      let data = savedPlacesJson.data(using: .utf8),
      let places = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return
    }

    savedPlaceMarkers = places.compactMap { place in
      guard
        let id = place["id"] as? String,
        let latitude = place["latitude"] as? Double,
        let longitude = place["longitude"] as? Double
      else { return nil }

      return SavedPlaceMarker(
        id: id,
        latitude: latitude,
        longitude: longitude,
        selected: place["selected"] as? Bool ?? false,
        colorHex: place["color"] as? String,
        category: place["category"] as? String,
        name: (place["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      )
    }
    applySavedPlaceMarkers()
  }

  // 카메라가 멈출 때 이름을 보여 줄 핀이 달라졌으면 핀 이미지를 다시 적용합니다.
  // 지도가 멈출 때까지 기다리면 이름이 늦게 붙으므로, 움직이는 동안에도 짧은 간격으로 다시 계산합니다.
  // 매 프레임 계산하면 무거워서 placeNameRefreshInterval마다 한 번만 합니다.
  private func refreshPlaceNamesWhileMoving() {
    let now = CACurrentMediaTime()
    guard now - lastPlaceNameRefreshTime >= Self.placeNameRefreshInterval else { return }
    lastPlaceNameRefreshTime = now
    refreshPlaceNames()
  }

  private func refreshPlaceNames() {
    guard let mapView else { return }
    if placeIDsShowingName(in: mapView) != placeNameShownIDs {
      applySavedPlaceMarkers()
    }
  }

  private func applySavedPlaceMarkers() {
    guard let mapView else { return }

    // 폴더 색이나 카테고리 아이콘이 있는 핀은 조합별 이미지를 만들어 쓰고,
    // 둘 다 없으면 기본 핀 이미지를 씁니다. 이름은 겹치지 않는 핀에만 붙입니다.
    placeNameShownIDs = placeIDsShowingName(in: mapView)
    let nextStyleIDByID = savedPlaceMarkers.reduce(into: [String: String]()) { result, marker in
      result[marker.id] = placeStyleID(for: marker)
    }

    for removedID in placeMarkersByID.keys where nextStyleIDByID[removedID] == nil {
      placeMarkersByID.removeValue(forKey: removedID)?.map = nil
    }

    for marker in savedPlaceMarkers {
      let position = CLLocationCoordinate2D(latitude: marker.latitude, longitude: marker.longitude)
      let styleID = placeStyleID(for: marker)
      let icon = placeIcon(styleID: styleID, marker: marker)
      // 선택된 핀이 다른 핀 위로 올라오고, 현재 위치 마커(Int32.max)보다는 아래에 둡니다.
      let zIndex: Int32 = marker.selected ? Int32.max - 1 : 1

      if let existing = placeMarkersByID[marker.id] {
        existing.position = position
        existing.zIndex = zIndex
        if placeStyleIDByID[marker.id] != styleID {
          existing.icon = icon.image
          existing.groundAnchor = CGPoint(x: 0.5, y: icon.anchorY)
        }
      } else {
        let placeMarker = GMSMarker(position: position)
        placeMarker.userData = marker.id
        placeMarker.icon = icon.image
        placeMarker.groundAnchor = CGPoint(x: 0.5, y: icon.anchorY)
        placeMarker.zIndex = zIndex
        placeMarker.appearAnimation = .pop
        placeMarker.map = mapView
        placeMarkersByID[marker.id] = placeMarker
      }
    }

    placeStyleIDByID = nextStyleIDByID
  }

  private func placeStyleID(for marker: SavedPlaceMarker) -> String {
    Self.placeStyleID(
      selected: marker.selected,
      colorHex: marker.colorHex,
      category: marker.category,
      name: placeNameShownIDs.contains(marker.id) ? marker.name : nil
    )
  }

  // 핀 이미지는 스타일 ID별로 한 번만 만들어 재사용합니다.
  private func placeIcon(styleID: String, marker: SavedPlaceMarker) -> (image: UIImage, anchorY: CGFloat) {
    if let icon = placeIcons[styleID] { return icon }

    let iconImage = Self.categoryIconAssetName(marker.category).flatMap { UIImage(named: $0) }
    let icon: (image: UIImage, anchorY: CGFloat)
    if let color = marker.colorHex.flatMap({ UIColor(hex: $0) })
      ?? (iconImage != nil ? UIColor(hex: Self.defaultPinColorHex) : nil) {
      let pin = makeColoredPlaceMarker(color: color, selected: marker.selected, icon: iconImage)
      // 이름을 보여 줄 핀은 핀 이미지 아래에 이름을 직접 그립니다(placeIDsShowingName 참고).
      let name = placeNameShownIDs.contains(marker.id) ? marker.name : nil
      icon = name.map { Self.addPlaceName($0, below: pin) } ?? (pin, 0.5)
    } else {
      icon = (makeSavedPlaceMarker(selected: marker.selected), 1.0)
    }
    placeIcons[styleID] = icon
    return icon
  }

  // 이름을 보여 줄 핀을 고릅니다. 선택된 핀은 항상 보여 주고, 나머지는 충분히 확대했을 때
  // 이름이 다른 핀이나 먼저 자리 잡은 이름과 겹치지 않을 때만 보여 줍니다.
  private func placeIDsShowingName(in mapView: GMSMapView) -> Set<String> {
    var shown = Set(savedPlaceMarkers.filter { $0.selected && !$0.name.isEmpty }.map(\.id))

    let projection = mapView.projection
    let viewBounds = mapView.bounds.insetBy(dx: -40, dy: -40)
    let onScreen = savedPlaceMarkers
      .map { marker in
        (
          marker: marker,
          center: projection.point(
            for: CLLocationCoordinate2D(latitude: marker.latitude, longitude: marker.longitude)
          )
        )
      }
      .filter { viewBounds.contains($0.center) }
    func pinRect(_ item: (marker: SavedPlaceMarker, center: CGPoint)) -> CGRect {
      let radius = Self.placeMarkerDiameter(selected: item.marker.selected) / 2
      return CGRect(x: item.center.x - radius, y: item.center.y - radius, width: radius * 2, height: radius * 2)
    }

    var takenNameRects: [CGRect] = []
    let candidates = onScreen.sorted { $0.marker.selected && !$1.marker.selected }
    for item in candidates where !item.marker.name.isEmpty {
      let nameRect = placeNameRect(item.marker, center: item.center)
      if item.marker.selected {
        takenNameRects.append(nameRect)
        continue
      }
      guard mapView.camera.zoom >= Self.placeNameMinZoomLevel else { continue }
      let hitsPin = onScreen.contains { $0.marker.id != item.marker.id && pinRect($0).intersects(nameRect) }
      let hitsName = takenNameRects.contains { $0.intersects(nameRect) }
      if !hitsPin && !hitsName {
        shown.insert(item.marker.id)
        takenNameRects.append(nameRect)
      }
    }
    return shown
  }

  // addPlaceName이 그리는 이름 영역을 원 중심 기준 화면 좌표로 돌려줍니다.
  private func placeNameRect(_ marker: SavedPlaceMarker, center: CGPoint) -> CGRect {
    let textSize = placeNameTextSizes[marker.name] ?? {
      let size = Self.placeNameTextSize(marker.name)
      placeNameTextSizes[marker.name] = size
      return size
    }()
    let halo = Self.placeNameHalo
    let width = textSize.width + halo * 2
    return CGRect(
      x: center.x - width / 2,
      y: center.y + Self.placeMarkerDiameter(selected: marker.selected) / 2 + Self.markerScale,
      width: width,
      height: textSize.height + halo
    )
  }

  // 서버 범주 코드(categoryCode)별 핀 아이콘 에셋(벡터 SVG)입니다. 목록에 없는 카테고리는 아이콘 없이 점을 씁니다.
  private static let categoryIconAssetNames: [String: String] = [
    "CAFE": "pin-category-cafe",
    "DESSERT": "pin-category-dessert",
    "KOREAN": "pin-category-korean",
    "WESTERN": "pin-category-western",
    "JAPANESE": "pin-category-japanese",
    "CHINESE": "pin-category-chinese",
    "BUNSIK": "pin-category-bunsik",
    "BAR": "pin-category-bar",
    "SPECIALTY": "pin-category-specialty",
    "CULTURE_LEISURE": "pin-category-culture_leisure",
    "ETC": "pin-category-etc",
  ]
  private static let defaultPinColorHex = "#8FA2FF"
  // 이 줌부터 선택되지 않은 핀에도 장소 이름을 보여 줍니다.
  private static let placeNameMinZoomLevel: Float = 13
  // 카카오 지도는 핀 이미지를 1.5배로 키워 그렸으므로, 같은 크기로 보이도록 핀·이름·현재 위치 마커를
  // 모두 이 배율로 그립니다.
  private static let markerScale: CGFloat = 1.5
  // 장소 이름은 지도의 동·역 이름보다 크고 진하게, 두꺼운 흰 테두리로 그려 지도 위에서 잘 읽히게 합니다.
  private static let placeNameFont = UIFont.systemFont(ofSize: 13, weight: .semibold)
  private static let placeNameHalo: CGFloat = 1.5
  private static let placeNameMaxWidth: CGFloat = 120 * markerScale
  private static let placeNameRefreshInterval: CFTimeInterval = 0.15

  private static func placeMarkerDiameter(selected: Bool) -> CGFloat {
    (selected ? 26 : 20) * markerScale
  }

  private static func placeNameTextSize(_ name: String) -> CGSize {
    let size = (name as NSString).size(withAttributes: [.font: placeNameFont])
    return CGSize(width: min(ceil(size.width), placeNameMaxWidth), height: ceil(size.height))
  }

  private static func categoryIconAssetName(_ category: String?) -> String? {
    guard let category else { return nil }
    return categoryIconAssetNames[category]
  }

  // 이름을 붙인 핀은 이미지에 이름까지 그리므로 이름도 스타일 ID에 넣습니다.
  private static func placeStyleID(selected: Bool, colorHex: String?, category: String?, name: String?) -> String {
    let hasColor = colorHex.flatMap { UIColor(hex: $0) } != nil
    let iconName = categoryIconAssetName(category)
    guard hasColor || iconName != nil else {
      return selected ? selectedPlaceStyleID : savedPlaceStyleID
    }
    let color = (hasColor ? colorHex : nil) ?? defaultPinColorHex
    let nameKey = name.map { "-name-\($0)" } ?? ""
    return "yeogidam-place-style-\(color.lowercased())-\(iconName ?? "none")-\(selected ? "selected" : "normal")\(nameKey)"
  }

  // 원 핀 아래에 흰 외곽선이 있는 장소 이름을 붙인 이미지와, 원 중심을 가리키는 세로 기준점을 돌려줍니다.
  private static func addPlaceName(_ name: String, below marker: UIImage) -> (image: UIImage, anchorY: CGFloat) {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return (marker, 0.5) }

    let font = placeNameFont
    let halo = placeNameHalo
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byTruncatingTail
    let fill: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: UIColor(red: 0.1, green: 0.1, blue: 0.11, alpha: 1),
      .paragraphStyle: paragraph,
    ]
    // strokeWidth는 글자 크기 대비 백분율이고 선의 가운데를 기준으로 그려지므로, 바깥쪽 halo만큼 두 배로 잡습니다.
    var outline = fill
    outline[.foregroundColor] = UIColor.white
    outline[.strokeColor] = UIColor.white
    outline[.strokeWidth] = halo * 2 / font.pointSize * 100

    let text = trimmed as NSString
    let textSize = placeNameTextSize(trimmed)
    let textWidth = textSize.width
    let textHeight = textSize.height
    // 마커 이미지에는 그림자 여백(3pt)이 있으므로 원 바로 아래에서 1pt 띄웁니다.
    let textTop = marker.size.height - 2 * markerScale
    let size = CGSize(
      width: max(marker.size.width, textWidth + halo * 2),
      height: textTop + textHeight + halo
    )
    let image = UIGraphicsImageRenderer(size: size).image { context in
      marker.draw(at: CGPoint(x: (size.width - marker.size.width) / 2, y: 0))
      let textRect = CGRect(x: (size.width - textWidth) / 2, y: textTop, width: textWidth, height: textHeight)
      // 외곽선 모서리가 뾰족하게 튀어나오지 않도록 둥글게 잇습니다.
      context.cgContext.setLineJoin(.round)
      text.draw(in: textRect, withAttributes: outline)
      text.draw(in: textRect, withAttributes: fill)
    }
    return (image, (marker.size.height / 2) / size.height)
  }

  // 색 핀: 흰 테두리와 옅은 그림자가 있는 색 원. 기준점은 원 중심입니다.
  // 카테고리 아이콘(흰색)이 있으면 원 안에 비율 그대로 얹고, 없으면 흰 점을 찍습니다.
  private func makeColoredPlaceMarker(color: UIColor, selected: Bool, icon: UIImage?) -> UIImage {
    let diameter = Self.placeMarkerDiameter(selected: selected)
    let border = 2 * Self.markerScale
    let shadowBlur = 2 * Self.markerScale
    let padding = shadowBlur + Self.markerScale
    let size = CGSize(width: diameter + padding * 2, height: diameter + padding * 2)
    return UIGraphicsImageRenderer(size: size).image { context in
      let center = CGPoint(x: size.width / 2, y: size.height / 2)
      func circle(_ radius: CGFloat) -> UIBezierPath {
        UIBezierPath(ovalIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
      }

      context.cgContext.saveGState()
      context.cgContext.setShadow(
        offset: CGSize(width: 0, height: 0.5 * Self.markerScale),
        blur: shadowBlur,
        color: UIColor.black.withAlphaComponent(0.25).cgColor
      )
      UIColor.white.setFill()
      circle(diameter / 2).fill()
      context.cgContext.restoreGState()

      let radius = diameter / 2 - border
      color.setFill()
      circle(radius).fill()

      UIColor.white.setFill()
      guard let icon, icon.size.width > 0, icon.size.height > 0 else {
        circle(radius * 0.42).fill()
        return
      }
      let box = radius * 1.25
      let scale = box / max(icon.size.width, icon.size.height)
      let iconSize = CGSize(width: icon.size.width * scale, height: icon.size.height * scale)
      icon.draw(in: CGRect(
        x: center.x - iconSize.width / 2,
        y: center.y - iconSize.height / 2,
        width: iconSize.width,
        height: iconSize.height
      ))
    }
  }

  private func emitCameraChanged() {
    guard let mapView, mapView.bounds.width > 0, mapView.bounds.height > 0 else { return }

    // The list should include every pin visible on the map, including pins
    // currently covered by a partially expanded bottom sheet. Map padding
    // still keeps programmatic camera moves centred in the exposed area, but
    // bounds for list filtering must cover the full map viewport.
    let projection = mapView.projection
    let visibleRect = mapView.bounds
    let corners = [
      CGPoint(x: visibleRect.minX, y: visibleRect.minY),
      CGPoint(x: visibleRect.maxX, y: visibleRect.minY),
      CGPoint(x: visibleRect.minX, y: visibleRect.maxY),
      CGPoint(x: visibleRect.maxX, y: visibleRect.maxY)
    ].map { projection.coordinate(for: $0) }
    let latitudes = corners.map(\.latitude)
    let longitudes = corners.map(\.longitude)
    guard
      let southLatitude = latitudes.min(),
      let northLatitude = latitudes.max(),
      let westLongitude = longitudes.min(),
      let eastLongitude = longitudes.max()
    else { return }

    // 카메라 이동과 같은 기준인, 시트에 가려지지 않은 영역의 가운데 좌표를 보냅니다.
    let coordinate = projection.coordinate(for: exposedCenterPoint(in: mapView))
    onCameraChanged?([
      "latitude": coordinate.latitude,
      "longitude": coordinate.longitude,
      "zoomLevel": Int(mapView.camera.zoom.rounded()),
      "southLatitude": southLatitude,
      "northLatitude": northLatitude,
      "westLongitude": westLongitude,
      "eastLongitude": eastLongitude
    ])
  }

  private func makeCurrentLocationMarker() -> UIImage {
    let scale = Self.markerScale
    let size = CGSize(width: 40 * scale, height: 40 * scale)
    let center = CGPoint(x: size.width / 2, y: size.height / 2)

    return UIGraphicsImageRenderer(size: size).image { context in
      let cgContext = context.cgContext
      cgContext.setAllowsAntialiasing(true)

      let blueColor = UIColor(red: 92 / 255, green: 117 / 255, blue: 1, alpha: 1)
      if let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [
          blueColor.withAlphaComponent(0.34).cgColor,
          blueColor.withAlphaComponent(0.3).cgColor,
          blueColor.withAlphaComponent(0.2).cgColor,
          blueColor.withAlphaComponent(0.08).cgColor,
          blueColor.withAlphaComponent(0).cgColor
        ] as CFArray,
        locations: [0, 0.35, 0.6, 0.82, 1]
      ) {
        cgContext.drawRadialGradient(
          gradient,
          startCenter: center,
          startRadius: 0,
          endCenter: center,
          endRadius: size.width / 2,
          options: []
        )
      }

      let whiteCircle = UIBezierPath(
        ovalIn: CGRect(x: center.x - 6 * scale, y: center.y - 6 * scale, width: 12 * scale, height: 12 * scale)
      )
      UIColor.white.setFill()
      whiteCircle.fill()

      let blueCircle = UIBezierPath(
        ovalIn: CGRect(x: center.x - 4.5 * scale, y: center.y - 4.5 * scale, width: 9 * scale, height: 9 * scale)
      )
      blueColor.setFill()
      blueCircle.fill()
    }
  }

  private func makeSavedPlaceMarker(selected: Bool) -> UIImage {
    let length = (selected ? 32 : 26) * Self.markerScale
    let size = CGSize(width: length, height: length)

    let assetName = selected ? Self.selectedPlaceMarkerAssetName : Self.savedPlaceMarkerAssetName
    if let markerImage = UIImage(named: assetName) {
      return UIGraphicsImageRenderer(size: size).image { _ in
        markerImage.draw(in: CGRect(origin: .zero, size: size))
      }
    }

    return UIGraphicsImageRenderer(size: size).image { _ in
      let center = CGPoint(x: size.width / 2, y: size.height / 2)
      let radius = size.width * 0.36
      UIColor.white.setFill()
      UIBezierPath(ovalIn: CGRect(origin: .zero, size: size)).fill()
      UIColor(red: 122 / 255, green: 199 / 255, blue: 223 / 255, alpha: 1).setFill()
      UIBezierPath(
        ovalIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
      ).fill()
      UIColor.white.setFill()
      let dotRadius = 5 * Self.markerScale
      UIBezierPath(ovalIn: CGRect(x: center.x - dotRadius, y: center.y - dotRadius, width: dotRadius * 2, height: dotRadius * 2)).fill()
    }
  }

  @objc
  private func applicationDidBecomeActive() {
    guard window != nil else { return }
    scheduleCameraMove()
    requestCurrentLocationIfNeeded()
  }

  @objc
  private func applicationWillResignActive() {
    locationManager.stopUpdatingLocation()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    locationManager.stopUpdatingLocation()
  }

  private static let hasApiKey: Bool = {
    guard let key = Bundle.main.object(forInfoDictionaryKey: "GOOGLE_MAPS_IOS_API_KEY") as? String else {
      return false
    }
    return !key.isEmpty && key != "$(GOOGLE_MAPS_IOS_API_KEY)"
  }()
  private static let logoLowering: CGFloat = 4
  private static let searchResultCameraPadding: CGFloat = 48
  private static let searchResultMaxZoomLevel: Float = 16
  private static let savedPlaceStyleID = "yeogidam-saved-place-style"
  private static let savedPlaceMarkerAssetName = "MapMarker"
  private static let selectedPlaceStyleID = "yeogidam-selected-place-style"
  private static let selectedPlaceMarkerAssetName = "MapMarkerSelected"
}

// GMSMapViewDelegate를 컨테이너가 직접 채택하면 Frontend-Swift.h에 노출되어
// 이 헤더를 쓰는 다른 .mm 파일이 GoogleMaps를 import해야 하므로 분리합니다.
private final class MapDelegate: NSObject, GMSMapViewDelegate {
  private let onWillMove: (Bool) -> Void
  private let onChange: () -> Void
  private let onIdle: () -> Void
  private let onTapMarker: (GMSMarker) -> Void

  init(
    onWillMove: @escaping (Bool) -> Void,
    onChange: @escaping () -> Void,
    onIdle: @escaping () -> Void,
    onTapMarker: @escaping (GMSMarker) -> Void
  ) {
    self.onWillMove = onWillMove
    self.onChange = onChange
    self.onIdle = onIdle
    self.onTapMarker = onTapMarker
  }

  func mapView(_ mapView: GMSMapView, willMove gesture: Bool) {
    onWillMove(gesture)
  }

  func mapView(_ mapView: GMSMapView, didChange position: GMSCameraPosition) {
    onChange()
  }

  func mapView(_ mapView: GMSMapView, idleAt position: GMSCameraPosition) {
    onIdle()
  }

  // true를 돌려줘 Google 기본 동작(말풍선, 핀으로 카메라 이동)을 막습니다.
  func mapView(_ mapView: GMSMapView, didTap marker: GMSMarker) -> Bool {
    onTapMarker(marker)
    return true
  }
}

// Google 기본 역 아이콘은 모양을 바꿀 수 없어 숨기고, 줌이 minZoom 이상일 때
// 화면 안의 역만 직접 그린 마커로 보여 줍니다. 역 이름은 nameMinZoom부터 붙입니다.
private final class SubwayStationLayer {
  private struct Station {
    let name: String
    let coordinate: CLLocationCoordinate2D
    let colors: [UIColor]
  }

  private struct StationIcon {
    let image: UIImage
    let anchorY: CGFloat

    func frame(at point: CGPoint) -> CGRect {
      CGRect(
        x: point.x - image.size.width / 2,
        y: point.y - image.size.height * anchorY,
        width: image.size.width,
        height: image.size.height
      )
    }
  }

  var minZoom: Float = 12
  var nameMinZoom: Float = 14
  private var stations: [Station] = []
  private var markers: [Int: GMSMarker] = [:]
  private var icons: [Int: (named: StationIcon, badgeOnly: StationIcon)] = [:]

  func setStations(json: String) {
    markers.values.forEach { $0.map = nil }
    markers = [:]
    icons = [:]

    guard
      let data = json.data(using: .utf8),
      let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      stations = []
      return
    }

    stations = items.compactMap { item in
      guard
        let name = item["name"] as? String,
        let latitude = item["latitude"] as? Double,
        let longitude = item["longitude"] as? Double,
        let colors = item["colors"] as? [String]
      else { return nil }

      return Station(
        name: name,
        coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
        colors: colors.compactMap { UIColor(hex: $0) }
      )
    }
  }

  func refresh(on mapView: GMSMapView) {
    let isVisibleZoom = mapView.camera.zoom >= minZoom
    let isNameZoom = mapView.camera.zoom >= nameMinZoom
    let bounds = GMSCoordinateBounds(region: mapView.projection.visibleRegion())
    var visibleIndexes: [Int] = []

    for (index, station) in stations.enumerated() {
      if isVisibleZoom && bounds.contains(station.coordinate) {
        visibleIndexes.append(index)
      } else if let marker = markers[index], marker.map != nil {
        marker.map = nil
      }
    }

    // 역이 몰린 곳에서는 환승 노선이 많은 역부터 이름을 두고, 이미 놓인 이름과 겹치는 역은
    // 동그라미만 보여 줍니다. 순서가 같으면 인덱스로 고정해 지도를 움직일 때 깜빡이지 않게 합니다.
    visibleIndexes.sort {
      let lhs = stations[$0].colors.count
      let rhs = stations[$1].colors.count
      return lhs != rhs ? lhs > rhs : $0 < $1
    }

    var occupiedFrames: [CGRect] = []
    for index in visibleIndexes {
      let station = stations[index]
      let stationIcons = icons[index] ?? (
        named: Self.makeIcon(for: station, showsName: true),
        badgeOnly: Self.makeIcon(for: station, showsName: false)
      )
      icons[index] = stationIcons

      let point = mapView.projection.point(for: station.coordinate)
      let namedFrame = stationIcons.named.frame(at: point)
      let showsName = isNameZoom && !occupiedFrames.contains { $0.intersects(namedFrame) }
      let icon = showsName ? stationIcons.named : stationIcons.badgeOnly
      occupiedFrames.append(icon.frame(at: point))

      let marker = markers[index] ?? makeMarker(for: station)
      markers[index] = marker
      if marker.icon !== icon.image {
        marker.icon = icon.image
        marker.groundAnchor = CGPoint(x: 0.5, y: icon.anchorY)
      }
      if marker.map == nil { marker.map = mapView }
    }
  }

  private func makeMarker(for station: Station) -> GMSMarker {
    let marker = GMSMarker(position: station.coordinate)
    // 저장 장소 마커보다 아래에 깔리고, 눌러도 반응하지 않게 합니다.
    marker.zIndex = -1
    marker.isTappable = false
    return marker
  }

  // 단일 노선역은 노선 색 테두리의 흰 동그라미, 환승역은 노선 색 점을 나란히 담은
  // 알약 모양으로 그리고 그 아래에 역 이름을 둡니다. 역 좌표는 배지 가운데에 맞춥니다.
  // 역이 많이 깔려도 지도를 덮지 않도록 동그라미는 지름 7pt로 작게, 이름은 10pt로 그립니다.
  private static func makeIcon(for station: Station, showsName: Bool) -> StationIcon {
    let badgeHeight: CGFloat = 7
    let dotSize: CGFloat = 3.5
    let dotGap: CGFloat = 1
    let isTransfer = station.colors.count > 1
    let badgeWidth = isTransfer
      ? CGFloat(station.colors.count) * (dotSize + dotGap) + 3
      : badgeHeight
    let nameFont = UIFont.systemFont(ofSize: 10, weight: .medium)
    let nameColor = UIColor(white: 0.13, alpha: 1)
    let name = NSAttributedString(
      string: station.name,
      attributes: [.font: nameFont, .foregroundColor: nameColor]
    )
    // 노선이나 도로 위에서도 읽히도록 이름 뒤에 얇은 흰 테두리를 먼저 그립니다.
    let nameHalo = NSAttributedString(
      string: station.name,
      attributes: [
        .font: nameFont,
        .strokeColor: UIColor.white,
        .strokeWidth: 6,
      ]
    )
    let nameSize = showsName ? name.size() : .zero
    let nameTop = badgeHeight + 1.5
    let size = CGSize(
      width: ceil(max(badgeWidth, nameSize.width)) + 4,
      height: showsName ? ceil(nameTop + nameSize.height) + 1 : badgeHeight
    )

    let image = UIGraphicsImageRenderer(size: size).image { _ in
      let badgeRect = CGRect(
        x: (size.width - badgeWidth) / 2,
        y: 0,
        width: badgeWidth,
        height: badgeHeight
      )

      if isTransfer {
        let badge = UIBezierPath(
          roundedRect: badgeRect.insetBy(dx: 0.5, dy: 0.5),
          cornerRadius: badgeHeight / 2
        )
        UIColor.white.setFill()
        badge.fill()
        UIColor(white: 0.35, alpha: 1).setStroke()
        badge.lineWidth = 1
        badge.stroke()

        var dotX = badgeRect.minX + 2
        for color in station.colors {
          color.setFill()
          UIBezierPath(
            ovalIn: CGRect(x: dotX, y: badgeRect.midY - dotSize / 2, width: dotSize, height: dotSize)
          ).fill()
          dotX += dotSize + dotGap
        }
      } else {
        let badge = UIBezierPath(ovalIn: badgeRect.insetBy(dx: 0.6, dy: 0.6))
        UIColor.white.setFill()
        badge.fill()
        (station.colors.first ?? .gray).setStroke()
        badge.lineWidth = 1.2
        badge.stroke()
      }

      if showsName {
        let namePoint = CGPoint(x: (size.width - nameSize.width) / 2, y: nameTop)
        nameHalo.draw(at: namePoint)
        name.draw(at: namePoint)
      }
    }

    return StationIcon(image: image, anchorY: badgeHeight / 2 / size.height)
  }
}

private extension UIColor {
  convenience init?(hex: String) {
    let value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }

    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1
    )
  }
}
