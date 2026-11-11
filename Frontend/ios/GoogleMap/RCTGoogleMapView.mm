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
    _mapView.onCameraChanged = ^(NSDictionary *event) {
      [weakSelf emitCameraChanged:event];
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

  [_mapView updateWithLatitude:newProps.latitude
                     longitude:newProps.longitude
                     zoomLevel:newProps.zoomLevel
               savedPlacesJson:[NSString stringWithUTF8String:newProps.savedPlacesJson.c_str()]];
  [_mapView updateZoomMapStylesWithJson:[NSString stringWithUTF8String:newProps.zoomMapStylesJson.c_str()]];
  [_mapView updateSubwayStationsWithJson:[NSString stringWithUTF8String:newProps.subwayStationsJson.c_str()]
                                 minZoom:newProps.subwayStationMinZoom
                             nameMinZoom:newProps.subwayStationNameMinZoom];

  [super updateProps:props oldProps:oldProps];
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
    .zoomLevel = [event[@"zoomLevel"] intValue]
  });
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<
    YeogidamGoogleMapViewComponentDescriptor
  >();
}

@end
