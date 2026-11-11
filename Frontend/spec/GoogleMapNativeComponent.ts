import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';

export interface NativeProps extends ViewProps {
  latitude: CodegenTypes.Double;
  longitude: CodegenTypes.Double;
  zoomLevel?: CodegenTypes.Int32;
  savedPlacesJson?: string;
  zoomMapStylesJson?: string;
  subwayStationsJson?: string;
  subwayStationMinZoom?: CodegenTypes.Int32;
  subwayStationNameMinZoom?: CodegenTypes.Int32;
  onCameraChanged?: CodegenTypes.DirectEventHandler<{
    latitude: CodegenTypes.Double;
    longitude: CodegenTypes.Double;
    zoomLevel: CodegenTypes.Int32;
  }> | null;
}

export default codegenNativeComponent<NativeProps>(
  'YeogidamGoogleMapView',
) as HostComponent<NativeProps>;

// 국내 지도 품질을 카카오맵과 비교하기 위한 개발용 Google 지도
// latitude, longitude, zoomLevel: 처음 띄울 때의 카메라. 이후에는 사용자가 움직인 위치를 유지함
// savedPlacesJson: 저장 장소를 기본 마커로 표시
// zoomMapStylesJson: 줌 단계별 지도 스타일 목록([{ minZoom, styleJson }]). 현재 줌 이하인 가장 큰 minZoom의 스타일을 적용
// subwayStationsJson: 직접 그릴 지하철역 목록(name, latitude, longitude, colors)
// subwayStationMinZoom: 이 줌 이상에서만 지하철역 동그라미를 표시
// subwayStationNameMinZoom: 이 줌 이상에서만 지하철역 이름을 표시
// onCameraChanged: 카메라가 멈출 때마다 위치를 전달해 카카오 지도로 돌아갈 때 같은 곳을 보여줌
