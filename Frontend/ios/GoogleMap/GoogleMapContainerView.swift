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
  private lazy var cameraDelegate = CameraDelegate { [weak self] position in
    self?.onCameraChanged?([
      "latitude": position.target.latitude,
      "longitude": position.target.longitude,
      "zoomLevel": Int(position.zoom.rounded()),
    ])
  }

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
    renderMarkers()
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
  private let onIdle: (GMSCameraPosition) -> Void

  init(onIdle: @escaping (GMSCameraPosition) -> Void) {
    self.onIdle = onIdle
  }

  func mapView(_ mapView: GMSMapView, idleAt position: GMSCameraPosition) {
    onIdle(position)
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
