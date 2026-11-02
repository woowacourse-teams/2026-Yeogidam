import UIKit
import CoreLocation
import KakaoMapsSDK

@objc(KakaoMapContainerView)
final class KakaoMapContainerView: UIView, MapControllerDelegate, CLLocationManagerDelegate, KakaoMapEventDelegate {
  @objc var onMapReady: ((NSDictionary) -> Void)?
  @objc var onMapError: ((NSDictionary) -> Void)?
  @objc var onCameraChanged: ((NSDictionary) -> Void)?
  @objc var onMarkerPressed: ((NSDictionary) -> Void)?
  @objc var onMapPanStarted: ((NSDictionary) -> Void)?

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
  private var viewResizedHandler: (any DisposableEventHandler)?
  private var savedPlaceStyleAdded = false
  private var savedPlacesJson = "[]"
  private var savedPlaceStyleIDByID: [String: String] = [:]
  private var savedPlaceMarkers: [SavedPlaceMarker] = []
  private var placeNameShownIDs = Set<String>()
  private var placeNameTextSizes: [String: CGSize] = [:]
  private var coloredPlaceStyleIDs = Set<String>()
  private var lastKnownLocation: CLLocation?

  private var latitude: Double = 37.5665
  private var longitude: Double = 126.9780
  private var zoomLevel: Int = 15
  private var cameraMoveRequestId = 0
  private var cameraFitPointsJson = "[]"
  private var cameraFitRequestId = 0
  private var showsCurrentLocation = false
  private var currentLocationRequestId = 0
  private var cameraBottomInset: CGFloat = 0
  private var enginePrepared = false
  private var mapAdded = false
  private var currentLocationStyleAdded = false
  private var needsDefaultCameraMove = false
  private var needsFitSearchResultsCameraMove = false
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
      updateCameraMargins()
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
    if let kakaoMap = mapController?.getView("mapview") as? KakaoMap {
      kakaoMap.eventDelegate = self
      // 기본 지도의 가게 정보만 숨깁니다. 지하철역·지명·도로 같은 길 찾기 정보는 남깁니다.
      let shopCategories: [LabelCategory] = [
        .place, .brand, .facilities, .indoor_Place, .detail_Category,
      ]
      shopCategories.forEach { kakaoMap.setLabelCategoryVisible(category: $0, visible: false) }
      kakaoMap.poiClickable = false
    }
    containerDidResized(mapContainer.bounds.size)
    moveCameraIfPossible()
    requestCurrentLocationIfNeeded()
    renderSavedPlaceMarkers()
    if let kakaoMap = mapController?.getView("mapview") as? KakaoMap {
      cameraStoppedHandler = kakaoMap.addCameraStoppedEventHandler(
        target: self,
        handler: { owner in
          { _ in
            owner.emitCameraChanged()
            owner.refreshPlaceNames()
          }
        }
      )
      viewResizedHandler = kakaoMap.addViewResizedEventHandler(
        target: self,
        handler: { owner in
          { _ in
            owner.emitCameraChanged()
            owner.refreshPlaceNames()
          }
        }
      )
    }

    onMapReady?([
      "ready": true
    ])
    DispatchQueue.main.async { [weak self] in self?.emitCameraChanged() }
  }

  func poiDidTapped(
    kakaoMap: KakaoMap,
    layerID: String,
    poiID: String,
    position: MapPoint
  ) {
    guard layerID == Self.savedPlaceLayerID else { return }
    let coordinate = cameraTarget(in: kakaoMap)
    onMarkerPressed?([
      "id": poiID,
      "latitude": coordinate.latitude,
      "longitude": coordinate.longitude,
      "zoomLevel": kakaoMap.zoomLevel,
      "cameraBottomInset": kakaoMap.margins.bottom
    ])
  }

  // The direct camera-stopped handler is not called for every user gesture on
  // all SDK versions. Use the map event delegate as well, so the JS list is
  // always recalculated from the camera the user is actually looking at.
  func cameraDidStopped(kakaoMap: KakaoMap, by: MoveBy) {
    emitCameraChanged()
    refreshPlaceNames()
  }

  func cameraWillMove(kakaoMap: KakaoMap, by: MoveBy) {
    if by == .pan ||
      by == .longTapAndDrag ||
      by == .zoom ||
      by == .oneFingerZoom ||
      by == .rotateZoom ||
      by == .doubleTapZoomIn ||
      by == .twoFingerTapZoomOut
    {
      onMapPanStarted?(["started": true])
    }

    // An inverted range is a lightweight signal over the existing Fabric
    // event: JS clears the previous list while the user is moving the map.
    // `cameraDidStopped` immediately replaces it with the final real bounds.
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

  // A bottom-sheet resize changes the effective map viewport through margins.
  // Emit only after the SDK has applied that margin, rather than relying on the
  // previous frame's bounds.
  func kakaoMapMarginDidUpdated(kakaoMap: KakaoMap) {
    emitCameraChanged()
  }

  func kakaoMapDidResized(kakaoMap: KakaoMap) {
    emitCameraChanged()
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
      mapContainer.bounds.width > 0,
      mapContainer.bounds.height > 0
    else { return }

    // Keep the map view itself full-screen and use the SDK's camera margins for
    // the part covered by the bottom sheet. `viewRect` alone only clips the
    // rendered map; it does not change the camera's target-point calculation.
    // A bottom margin makes a target coordinate land at the centre of the
    // exposed area above the sheet.
    kakaoMap.viewRect = CGRect(
      x: 0,
      y: 0,
      width: mapContainer.bounds.width,
      height: mapContainer.bounds.height
    )
    kakaoMap.setMargins(
      UIEdgeInsets(
        top: 0,
        left: 0,
        bottom: cameraBottomInset,
        right: 0
      )
    )
    DispatchQueue.main.async { [weak self] in self?.emitCameraChanged() }
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

      kakaoMap.moveCamera(cameraUpdate)
      return
    }

    if needsFitSearchResultsCameraMove {
      needsFitSearchResultsCameraMove = false
      needsDefaultCameraMove = false

      guard let points = searchResultPoints(), points.count >= 2 else {
        return
      }

      let cameraUpdate = CameraUpdate.make(
        area: AreaRect(points: points),
        levelLimit: Self.searchResultMaxZoomLevel
      )
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

  private func searchResultPoints() -> [MapPoint]? {
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

      return MapPoint(longitude: longitude, latitude: latitude)
    }
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
    needsCurrentLocationCameraMove = true
    guard showsCurrentLocation else { return }
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
          zOrder: 10_000
        )
      )

    let options = PoiOptions(
      styleID: Self.currentLocationStyleID,
      poiID: Self.currentLocationPoiID
    )
    options.rank = Int.max

    currentLocationPoi = layer?.addPoi(option: options, at: position)
    currentLocationPoi?.show()
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

  // 카메라가 멈출 때 이름을 보여 줄 핀이 달라졌으면 핀 스타일을 다시 적용합니다.
  private func refreshPlaceNames() {
    guard let kakaoMap = mapController?.getView("mapview") as? KakaoMap else { return }
    if placeIDsShowingName(in: kakaoMap) != placeNameShownIDs {
      applySavedPlaceMarkers()
    }
  }

  private func applySavedPlaceMarkers() {
    guard let kakaoMap = mapController?.getView("mapview") as? KakaoMap else { return }

    let labelManager = kakaoMap.getLabelManager()
    let layer =
      labelManager.getLabelLayer(layerID: Self.savedPlaceLayerID) ??
      labelManager.addLabelLayer(
        option: LabelLayerOptions(
          layerID: Self.savedPlaceLayerID,
          competitionType: .none,
          competitionUnit: .symbolFirst,
          orderType: .rank,
          zOrder: 9_000
        )
      )
    // Kakao Maps disables POI interaction by default. Both the layer and its
    // POIs must be made clickable for `poiDidTapped` to fire.
    layer?.setClickable(true)

    if !savedPlaceStyleAdded {
      for selected in [false, true] {
        let iconStyle = PoiIconStyle(
          symbol: makeSavedPlaceMarker(selected: selected),
          anchorPoint: CGPoint(x: 0.5, y: 1.0),
          transition: PoiTransition(entrance: .scale, exit: .scale)
        )
        labelManager.addPoiStyle(
          PoiStyle(
            styleID: selected ? Self.selectedPlaceStyleID : Self.savedPlaceStyleID,
            styles: [PerLevelPoiStyle(iconStyle: iconStyle, level: 0)]
          )
        )
      }
      savedPlaceStyleAdded = true
    }

    // 폴더 색이나 카테고리 아이콘이 있는 핀은 조합별 스타일을 만들어 쓰고,
    // 둘 다 없으면 기본 핀 이미지를 씁니다. 이름은 겹치지 않는 핀에만 붙입니다.
    placeNameShownIDs = placeIDsShowingName(in: kakaoMap)
    let nextStyleIDByID = savedPlaceMarkers.reduce(into: [String: String]()) { result, marker in
      result[marker.id] = placeStyleID(for: marker)
    }

    for removedID in savedPlaceStyleIDByID.keys where nextStyleIDByID[removedID] == nil {
      layer?.removePoi(poiID: removedID)
    }

    for marker in savedPlaceMarkers {
      let position = MapPoint(longitude: marker.longitude, latitude: marker.latitude)
      let styleID = placeStyleID(for: marker)
      ensureColoredPlaceStyle(
        labelManager: labelManager,
        styleID: styleID,
        selected: marker.selected,
        colorHex: marker.colorHex,
        category: marker.category,
        name: placeNameShownIDs.contains(marker.id) ? marker.name : nil
      )

      if let poi = layer?.getPoi(poiID: marker.id) {
        poi.position = position
        poi.clickable = true
        poi.rank = marker.selected ? Int.max - 1 : 1

        if savedPlaceStyleIDByID[marker.id] != styleID {
          poi.changeStyle(styleID: styleID, enableTransition: false)
        }
      } else {
        let options = PoiOptions(styleID: styleID, poiID: marker.id)
        options.rank = marker.selected ? Int.max - 1 : 1
        options.clickable = true
        layer?.addPoi(option: options, at: position)?.show()
      }
    }

    savedPlaceStyleIDByID = nextStyleIDByID
  }

  private func placeStyleID(for marker: SavedPlaceMarker) -> String {
    Self.placeStyleID(
      selected: marker.selected,
      colorHex: marker.colorHex,
      category: marker.category,
      name: placeNameShownIDs.contains(marker.id) ? marker.name : nil
    )
  }

  // 이름을 보여 줄 핀을 고릅니다. 선택된 핀은 항상 보여 주고, 나머지는 충분히 확대했을 때
  // 이름이 다른 핀이나 먼저 자리 잡은 이름과 겹치지 않을 때만 보여 줍니다.
  private func placeIDsShowingName(in kakaoMap: KakaoMap) -> Set<String> {
    var shown = Set(savedPlaceMarkers.filter { $0.selected && !$0.name.isEmpty }.map(\.id))
    guard let toScreen = geoToScreen(in: kakaoMap) else { return shown }

    let viewBounds = CGRect(origin: .zero, size: kakaoMap.viewRect.size).insetBy(dx: -40, dy: -40)
    let onScreen = savedPlaceMarkers
      .map { (marker: $0, center: toScreen($0.latitude, $0.longitude)) }
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
      guard kakaoMap.zoomLevel >= Self.placeNameMinZoomLevel else { continue }
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
      y: center.y + Self.placeMarkerDiameter(selected: marker.selected) / 2 + 1,
      width: width,
      height: textSize.height + halo
    )
  }

  // SDK에는 지도 좌표를 화면 좌표로 바꾸는 API가 없어서, 화면 세 꼭짓점의 지도 좌표로 변환식을 만듭니다.
  // 지도가 회전해 있어도 맞습니다. 화면 범위 안에서는 메르카토르 왜곡이 작아 선형 근사로 충분합니다.
  private func geoToScreen(in kakaoMap: KakaoMap) -> ((Double, Double) -> CGPoint)? {
    let width = kakaoMap.viewRect.width
    let height = kakaoMap.viewRect.height
    guard width > 0, height > 0 else { return nil }
    let origin = kakaoMap.getPosition(CGPoint(x: 0, y: 0)).wgsCoord
    let right = kakaoMap.getPosition(CGPoint(x: width, y: 0)).wgsCoord
    let bottom = kakaoMap.getPosition(CGPoint(x: 0, y: height)).wgsCoord
    let ux = right.longitude - origin.longitude, uy = right.latitude - origin.latitude
    let vx = bottom.longitude - origin.longitude, vy = bottom.latitude - origin.latitude
    let determinant = ux * vy - uy * vx
    guard abs(determinant) > .ulpOfOne else { return nil }
    return { latitude, longitude in
      let dx = longitude - origin.longitude, dy = latitude - origin.latitude
      let a = (dx * vy - dy * vx) / determinant
      let b = (ux * dy - uy * dx) / determinant
      return CGPoint(x: a * width, y: b * height)
    }
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
  // 이 줌 레벨부터 선택되지 않은 핀에도 장소 이름을 보여 줍니다.
  private static let placeNameMinZoomLevel = 13
  private static let placeNameFont = UIFont.systemFont(ofSize: 8, weight: .semibold)
  private static let placeNameHalo: CGFloat = 1
  private static let placeNameMaxWidth: CGFloat = 120

  private static func placeMarkerDiameter(selected: Bool) -> CGFloat {
    selected ? 26 : 20
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

  private func ensureColoredPlaceStyle(
    labelManager: LabelManager,
    styleID: String,
    selected: Bool,
    colorHex: String?,
    category: String?,
    name: String?
  ) {
    let icon = Self.categoryIconAssetName(category).flatMap { UIImage(named: $0) }
    guard
      let color = colorHex.flatMap({ UIColor(hex: $0) })
        ?? (icon != nil ? UIColor(hex: Self.defaultPinColorHex) : nil),
      !coloredPlaceStyleIDs.contains(styleID)
    else { return }

    let marker = makeColoredPlaceMarker(color: color, selected: selected, icon: icon)
    // 이름을 보여 줄 핀은 핀 이미지 아래에 이름을 직접 그립니다(placeIDsShowingName 참고).
    // 레벨 구성 개수가 다른 스타일로 바꾸면 SDK가 죽으므로, 모든 핀 스타일은 레벨 하나만 씁니다.
    let symbol = name.map { Self.addPlaceName($0, below: marker) } ?? (marker, 0.5)
    let iconStyle = PoiIconStyle(
      symbol: symbol.image,
      anchorPoint: CGPoint(x: 0.5, y: symbol.anchorY),
      transition: PoiTransition(entrance: .scale, exit: .scale)
    )
    labelManager.addPoiStyle(
      PoiStyle(styleID: styleID, styles: [PerLevelPoiStyle(iconStyle: iconStyle, level: 0)])
    )
    coloredPlaceStyleIDs.insert(styleID)
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
      .foregroundColor: UIColor(red: 0.13, green: 0.13, blue: 0.15, alpha: 1),
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
    let textTop = marker.size.height - 2
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
    let border: CGFloat = 2
    let shadowBlur: CGFloat = 2
    let padding = shadowBlur + 1
    let size = CGSize(width: diameter + padding * 2, height: diameter + padding * 2)
    return UIGraphicsImageRenderer(size: size).image { context in
      let center = CGPoint(x: size.width / 2, y: size.height / 2)
      func circle(_ radius: CGFloat) -> UIBezierPath {
        UIBezierPath(ovalIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
      }

      context.cgContext.saveGState()
      context.cgContext.setShadow(
        offset: CGSize(width: 0, height: 0.5),
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

  private func cameraTarget(in kakaoMap: KakaoMap) -> GeoCoordinate {
    // CameraUpdate.make(target:..., mapView:...) targets the centre AFTER
    // margins. Use that same centre when cloning a map for a detail scene.
    let margins = kakaoMap.margins
    let centre = CGPoint(
      x: (margins.left + kakaoMap.viewRect.width - margins.right) / 2,
      y: (margins.top + kakaoMap.viewRect.height - margins.bottom) / 2
    )
    return kakaoMap.getPosition(centre).wgsCoord
  }

  private func emitCameraChanged() {
    guard
      let kakaoMap = mapController?.getView("mapview") as? KakaoMap
    else { return }

    // The list should include every pin visible on the map, including pins
    // currently covered by a partially expanded bottom sheet. Camera margins
    // still keep programmatic camera moves centred in the exposed area, but
    // bounds for list filtering must cover the full map viewport.
    let visibleRect = CGRect(
      x: 0,
      y: 0,
      width: kakaoMap.viewRect.width,
      height: kakaoMap.viewRect.height
    )
    let coordinate = cameraTarget(in: kakaoMap)
    let corners = [
      CGPoint(x: visibleRect.minX, y: visibleRect.minY),
      CGPoint(x: visibleRect.maxX, y: visibleRect.minY),
      CGPoint(x: visibleRect.minX, y: visibleRect.maxY),
      CGPoint(x: visibleRect.maxX, y: visibleRect.maxY)
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
    let size = CGSize(width: 40, height: 40)
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
        ovalIn: CGRect(x: center.x - 6, y: center.y - 6, width: 12, height: 12)
      )
      UIColor.white.setFill()
      whiteCircle.fill()

      let blueCircle = UIBezierPath(
        ovalIn: CGRect(x: center.x - 4.5, y: center.y - 4.5, width: 9, height: 9)
      )
      blueColor.setFill()
      blueCircle.fill()
    }
  }

  private func makeSavedPlaceMarker(selected: Bool) -> UIImage {
    let size = selected ? CGSize(width: 32, height: 32) : CGSize(width: 26, height: 26)

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
      UIBezierPath(ovalIn: CGRect(x: center.x - 5, y: center.y - 5, width: 10, height: 10)).fill()
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
  private static let searchResultMaxZoomLevel = 16
  private static let savedPlaceStyleID = "yeogidam-saved-place-style"
  private static let savedPlaceMarkerAssetName = "MapMarker"
  private static let selectedPlaceStyleID = "yeogidam-selected-place-style"
  private static let selectedPlaceMarkerAssetName = "MapMarkerSelected"
}

private extension UIColor {
  convenience init?(hex: String) {
    var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("#") { value.removeFirst() }
    guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }
    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1
    )
  }
}
