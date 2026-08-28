#import "RCTKakaoMapView.h"

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

@interface RCTKakaoMapView ()
  <RCTYeogidamKakaoMapViewViewProtocol>
@end

@implementation RCTKakaoMapView {
  KakaoMapContainerView *_mapView;
}

- (instancetype)init
{
  if (self = [super init]) {
    static const auto defaultProps =
      std::make_shared<const YeogidamKakaoMapViewProps>();

    _props = defaultProps;

    _mapView = [KakaoMapContainerView new];

    __weak RCTKakaoMapView *weakSelf = self;
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
      const YeogidamKakaoMapViewProps
    >(props);

  [_mapView updateWithLatitude:newProps.latitude
                     longitude:newProps.longitude
                     zoomLevel:newProps.zoomLevel
       cameraMoveRequestId:newProps.cameraMoveRequestId
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
    static_cast<const YeogidamKakaoMapViewEventEmitter &>(*_eventEmitter);

  eventEmitter.onMapReady({
    .ready = [event[@"ready"] boolValue]
  });
}

- (void)emitMapError:(NSDictionary *)event
{
  if (!_eventEmitter) {
    return;
  }

  NSString *message = event[@"message"] ?: @"알 수 없는 카카오맵 오류";
  const auto &eventEmitter =
    static_cast<const YeogidamKakaoMapViewEventEmitter &>(*_eventEmitter);

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
    static_cast<const YeogidamKakaoMapViewEventEmitter &>(*_eventEmitter);
  eventEmitter.onMarkerPressed({
    .id = std::string(markerID.UTF8String ?: "")
  });
}

- (void)emitCameraChanged:(NSDictionary *)event
{
  if (!_eventEmitter) {
    return;
  }

  const auto &eventEmitter =
    static_cast<const YeogidamKakaoMapViewEventEmitter &>(*_eventEmitter);
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
    YeogidamKakaoMapViewComponentDescriptor
  >();
}

@end
