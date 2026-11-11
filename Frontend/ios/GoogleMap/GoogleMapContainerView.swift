import UIKit
import GoogleMaps

// 국내 지도 품질을 카카오맵과 비교하기 위한 개발용 Google 지도입니다.
@objc(GoogleMapContainerView)
final class GoogleMapContainerView: UIView {
  @objc var onCameraChanged: ((NSDictionary) -> Void)?

  private var mapView: GMSMapView?
  private var latitude: Double = 37.5665
  private var longitude: Double = 126.9780
  private var zoomLevel: Int = 15
  private var savedPlacesJson = "[]"
  private var markers: [GMSMarker] = []
  private var zoomMapStylesJson = ""
  private var zoomMapStyles: [(minZoom: Float, style: GMSMapStyle?)] = []
  private var appliedMapStyleIndex: Int?
  private var subwayStationsJson = ""
  private let subwayStationLayer = SubwayStationLayer()
  private lazy var cameraDelegate = CameraDelegate(
    onChange: { [weak self] _ in
      self?.applyMapStyle()
      self?.refreshSubwayStations()
    },
    onIdle: { [weak self] position in
      self?.refreshSubwayStations()
      self?.onCameraChanged?([
        "latitude": position.target.latitude,
        "longitude": position.target.longitude,
        "zoomLevel": Int(position.zoom.rounded()),
      ])
    }
  )

  @objc
  func update(
    latitude: Double,
    longitude: Double,
    zoomLevel: Int,
    savedPlacesJson: String
  ) {
    self.latitude = latitude
    self.longitude = longitude
    self.zoomLevel = zoomLevel

    if self.savedPlacesJson != savedPlacesJson {
      self.savedPlacesJson = savedPlacesJson
      renderMarkers()
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

  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.width > 0, bounds.height > 0 else { return }

    if let mapView {
      mapView.frame = bounds
      return
    }

    // 처음 보일 때의 카메라로만 띄우고, 이후에는 사용자가 움직인 위치를 유지합니다.
    let options = GMSMapViewOptions()
    options.frame = bounds
    options.camera = GMSCameraPosition(
      latitude: latitude,
      longitude: longitude,
      zoom: Float(zoomLevel)
    )
    let mapView = GMSMapView(options: options)
    mapView.delegate = cameraDelegate
    addSubview(mapView)
    self.mapView = mapView
    applyMapStyle()
    renderMarkers()
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

  private func renderMarkers() {
    guard
      let mapView,
      let data = savedPlacesJson.data(using: .utf8),
      let places = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return
    }

    markers.forEach { $0.map = nil }
    markers = places.compactMap { place in
      guard
        let latitude = place["latitude"] as? Double,
        let longitude = place["longitude"] as? Double
      else { return nil }

      let marker = GMSMarker(
        position: CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      )
      marker.title = place["name"] as? String
      if let colorHex = place["color"] as? String, let color = UIColor(hex: colorHex) {
        marker.icon = GMSMarker.markerImage(with: color)
      }
      marker.map = mapView
      return marker
    }
  }
}

// GMSMapViewDelegate를 컨테이너가 직접 채택하면 Frontend-Swift.h에 노출되어
// 이 헤더를 쓰는 다른 .mm 파일이 GoogleMaps를 import해야 하므로 분리합니다.
private final class CameraDelegate: NSObject, GMSMapViewDelegate {
  private let onChange: (GMSCameraPosition) -> Void
  private let onIdle: (GMSCameraPosition) -> Void

  init(
    onChange: @escaping (GMSCameraPosition) -> Void,
    onIdle: @escaping (GMSCameraPosition) -> Void
  ) {
    self.onChange = onChange
    self.onIdle = onIdle
  }

  func mapView(_ mapView: GMSMapView, didChange position: GMSCameraPosition) {
    onChange(position)
  }

  func mapView(_ mapView: GMSMapView, idleAt position: GMSCameraPosition) {
    onIdle(position)
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
  // 크기는 네이버 지도 스크린샷의 역 표시(지름 약 9pt, 얇은 테두리, 10pt 이름)에 맞췄습니다.
  private static func makeIcon(for station: Station, showsName: Bool) -> StationIcon {
    let badgeHeight: CGFloat = 9
    let dotSize: CGFloat = 5
    let dotGap: CGFloat = 1.5
    let isTransfer = station.colors.count > 1
    let badgeWidth = isTransfer
      ? CGFloat(station.colors.count) * (dotSize + dotGap) + 4
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

        var dotX = badgeRect.minX + 2.75
        for color in station.colors {
          color.setFill()
          UIBezierPath(
            ovalIn: CGRect(x: dotX, y: badgeRect.midY - dotSize / 2, width: dotSize, height: dotSize)
          ).fill()
          dotX += dotSize + dotGap
        }
      } else {
        let badge = UIBezierPath(ovalIn: badgeRect.insetBy(dx: 0.75, dy: 0.75))
        UIColor.white.setFill()
        badge.fill()
        (station.colors.first ?? .gray).setStroke()
        badge.lineWidth = 1.5
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
