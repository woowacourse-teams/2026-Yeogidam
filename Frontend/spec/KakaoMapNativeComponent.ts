import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';

export interface NativeProps extends ViewProps {
  latitude: CodegenTypes.Double;
  longitude: CodegenTypes.Double;
  zoomLevel?: CodegenTypes.Int32;
  onMapReady?: CodegenTypes.DirectEventHandler<{
    ready: boolean;
  }> | null;
  onMapError?: CodegenTypes.DirectEventHandler<{
    message: string;
  }> | null;
}

export default codegenNativeComponent<NativeProps>(
  'YeogidamKakaoMapView',
) as HostComponent<NativeProps>;


// ViewProps: style={{flex: 1}} 같은 기본 React Native View 속성을 사용할 수 있게 함
// latitude, longitude: 지도 중심 좌표
// zoomLevel: 지도 확대 단계
// onMapReady: 카카오 지도가 정상 준비됐다는 네이티브 이벤트
// onMapError: 인증·네트워크 오류를 React에 전달
// YeogidamKakaoMapView: Android/iOS 네이티브 컴포넌트가 공통으로 사용할 이름
// 파일명이 반드시 NativeComponent.ts로 끝나야 Codegen이 인식함