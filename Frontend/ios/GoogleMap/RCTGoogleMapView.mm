#import "RCTGoogleMapView.h"

#import <CoreLocation/CoreLocation.h>
#import <KakaoMapsSDK/KakaoMapsSDK.h>
#import <KakaoMapsSDK/KakaoMapsSDK-Swift.h>
#import <React/RCTEventEmitter.h>

#import "Frontend-Swift.h"

#import <react/renderer/components/YeogidamMapSpec/ComponentDescriptors.h>
#import <react/renderer/components/YeogidamMapSpec/EventEmitters.h>
#import <react/renderer/components/YeogidamMapSpec/Props.h>
#import <react/renderer/components/YeogidamMapSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RCTGoogleMapView ()
  <RCTYeogidamGoogleMapViewViewProtocol>
@end

@implementation RCTGoogleMapView {
  GoogleMapContainerView *_mapView;
}

- (instancetype)init
{
  if (self = [super init]) {
    static const auto defaultProps =
      std::make_shared<const YeogidamGoogleMapViewProps>();

    _props = defaultProps;

    _mapView = [GoogleMapContainerView new];

    __weak RCTGoogleMapView *weakSelf = self;
    _mapView.onMapReady = ^(NSDictionary *event) {
      [weakSelf emitMapReady:event];
    };
    _mapView.onMapError = ^(NSDictionary *event) {
      [weakSelf emitMapError:event];
    };
    _mapView.onCameraChanged = ^(NSDictionary *event) {
      [weakSelf emitCameraChanged:event];
    };
    _mapView.onMarkerPressed = ^(NSDictionary *event) {
      [weakSelf emitMarkerPressed:event];
    };
    _mapView.onMapPanStarted = ^(NSDictionary *event) {
      [weakSelf emitMapPanStarted:event];
    };

    [self addSubview:_mapView];
  }

  return self;
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _mapView.frame = self.bounds;
}

- (void)updateProps:(Props::Shared const &)props
           oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps =
    *std::static_pointer_cast<
      const YeogidamGoogleMapViewProps
    >(props);

  // 스타일과 역 목록을 먼저 넣어, 지도가 처음 그려질 때부터 적용되게 합니다.
  [_mapView updateLogoBottomInset:newProps.logoBottomInset];
  [_mapView updateZoomMapStylesWithJson:[NSString stringWithUTF8String:newProps.zoomMapStylesJson.c_str()]];
  [_mapView updateSubwayStationsWithJson:[NSString stringWithUTF8String:newProps.subwayStationsJson.c_str()]
                                 minZoom:newProps.subwayStationMinZoom
                             nameMinZoom:newProps.subwayStationNameMinZoom];
  [_mapView updateWithLatitude:newProps.latitude
                     longitude:newProps.longitude
                     zoomLevel:newProps.zoomLevel
       cameraMoveRequestId:newProps.cameraMoveRequestId
       cameraFitPointsJson:[NSString stringWithUTF8String:newProps.cameraFitPointsJson.c_str()]
        cameraFitRequestId:newProps.cameraFitRequestId
          showsCurrentLocation:newProps.showsCurrentLocation
      currentLocationRequestId:newProps.currentLocationRequestId
          cameraBottomInset:newProps.cameraBottomInset
            savedPlacesJson:[NSString stringWithUTF8String:newProps.savedPlacesJson.c_str()]];

  [super updateProps:props oldProps:oldProps];
}

- (void)emitMapReady:(NSDictionary *)event
{
  if (!_eventEmitter) {
    return;
  }

  const auto &eventEmitter =
    static_cast<const YeogidamGoogleMapViewEventEmitter &>(*_eventEmitter);

  eventEmitter.onMapReady({
    .ready = [event[@"ready"] boolValue]
  });
}

- (void)emitMapError:(NSDictionary *)event
{
  if (!_eventEmitter) {
    return;
  }

  NSString *message = event[@"message"] ?: @"알 수 없는 지도 오류";
  const auto &eventEmitter =
    static_cast<const YeogidamGoogleMapViewEventEmitter &>(*_eventEmitter);

  eventEmitter.onMapError({
    .message = std::string(message.UTF8String ?: "")
  });
}

- (void)emitMarkerPressed:(NSDictionary *)event
{
  if (!_eventEmitter) {
    return;
  }

  NSString *markerID = event[@"id"] ?: @"";
  const auto &eventEmitter =
    static_cast<const YeogidamGoogleMapViewEventEmitter &>(*_eventEmitter);
  eventEmitter.onMarkerPressed({
    .id = std::string(markerID.UTF8String ?: ""),
    .latitude = [event[@"latitude"] doubleValue],
    .longitude = [event[@"longitude"] doubleValue],
    .zoomLevel = [event[@"zoomLevel"] intValue],
    .cameraBottomInset = [event[@"cameraBottomInset"] doubleValue]
  });
}

- (void)emitMapPanStarted:(NSDictionary *)event
{
  if (!_eventEmitter) {
    return;
  }

  const auto &eventEmitter =
    static_cast<const YeogidamGoogleMapViewEventEmitter &>(*_eventEmitter);
  eventEmitter.onMapPanStarted({
    .started = [event[@"started"] boolValue]
  });
}

- (void)emitCameraChanged:(NSDictionary *)event
{
  if (!_eventEmitter) {
    return;
  }

  const auto &eventEmitter =
    static_cast<const YeogidamGoogleMapViewEventEmitter &>(*_eventEmitter);
  eventEmitter.onCameraChanged({
    .latitude = [event[@"latitude"] doubleValue],
    .longitude = [event[@"longitude"] doubleValue],
    .zoomLevel = [event[@"zoomLevel"] intValue],
    .southLatitude = [event[@"southLatitude"] doubleValue],
    .northLatitude = [event[@"northLatitude"] doubleValue],
    .westLongitude = [event[@"westLongitude"] doubleValue],
    .eastLongitude = [event[@"eastLongitude"] doubleValue]
  });
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<
    YeogidamGoogleMapViewComponentDescriptor
  >();
}

@end
