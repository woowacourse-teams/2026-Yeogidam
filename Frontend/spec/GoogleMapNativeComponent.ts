import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';

export interface NativeProps extends ViewProps {
  latitude: CodegenTypes.Double;
  longitude: CodegenTypes.Double;
  zoomLevel?: CodegenTypes.Int32;
  /** Increments to force a camera move, even when the coordinates are unchanged. */
  cameraMoveRequestId?: CodegenTypes.Int32;
  /** JSON array of coordinates to keep visible when cameraFitRequestId changes. */
  cameraFitPointsJson?: string;
  /** Increments to fit all cameraFitPointsJson coordinates into the map viewport. */
  cameraFitRequestId?: CodegenTypes.Int32;
  showsCurrentLocation?: boolean;
  currentLocationRequestId?: CodegenTypes.Int32;
  cameraBottomInset?: CodegenTypes.Double;
  logoBottomInset?: CodegenTypes.Double;
  savedPlacesJson?: string;
  zoomMapStylesJson?: string;
  subwayStationsJson?: string;
  subwayStationMinZoom?: CodegenTypes.Int32;
  subwayStationNameMinZoom?: CodegenTypes.Int32;
  onMapReady?: CodegenTypes.DirectEventHandler<{
    ready: boolean;
  }> | null;
  onMapError?: CodegenTypes.DirectEventHandler<{
    message: string;
  }> | null;
  onMarkerPressed?: CodegenTypes.DirectEventHandler<{
    id: string;
    latitude: CodegenTypes.Double;
    longitude: CodegenTypes.Double;
    zoomLevel: CodegenTypes.Int32;
    cameraBottomInset: CodegenTypes.Double;
  }> | null;
  onMapPanStarted?: CodegenTypes.DirectEventHandler<{
    started: boolean;
  }> | null;
  onCameraChanged?: CodegenTypes.DirectEventHandler<{
    latitude: CodegenTypes.Double;
    longitude: CodegenTypes.Double;
    zoomLevel: CodegenTypes.Int32;
    southLatitude: CodegenTypes.Double;
    northLatitude: CodegenTypes.Double;
    westLongitude: CodegenTypes.Double;
    eastLongitude: CodegenTypes.Double;
  }> | null;
}

export default codegenNativeComponent<NativeProps>(
  'YeogidamGoogleMapView',
) as HostComponent<NativeProps>;

// 지도 화면의 Google 지도. 카카오 지도(KakaoMapNativeComponent)와 같은 props·이벤트를 받음
// latitude, longitude, zoomLevel: 지도 중심 좌표와 확대 단계. 값이나 cameraMoveRequestId가 바뀌면 카메라 이동
// cameraBottomInset: 바텀시트에 가려진 높이. 카메라 중심을 그 위쪽 영역 가운데에 맞춤
// logoBottomInset: Google 로고를 둘 아래쪽 높이. 지도 여백을 이 값으로 고정해 시트가 움직여도 지도가 다시 맞춰지지 않게 함
// showsCurrentLocation: 현재 위치 마커 표시, currentLocationRequestId: 값이 바뀔 때마다 현재 위치로 카메라 이동
// savedPlacesJson: 저장 장소 핀(id, name, latitude, longitude, selected, color, category)
// zoomMapStylesJson: 줌 단계별 지도 스타일 목록([{ minZoom, styleJson }]). 현재 줌 이하인 가장 큰 minZoom의 스타일을 적용
// subwayStationsJson: 직접 그릴 지하철역 목록(name, latitude, longitude, colors)
// subwayStationMinZoom: 이 줌 이상에서만 지하철역 동그라미를 표시
// subwayStationNameMinZoom: 이 줌 이상에서만 지하철역 이름을 표시
// onCameraChanged: 카메라가 멈출 때 중심과 지도 전체 범위를 전달. iOS는 움직이는 동안 뒤집힌 범위를 보내 목록을 비움
