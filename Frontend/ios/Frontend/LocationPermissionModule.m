#import <CoreLocation/CoreLocation.h>
#import <React/RCTBridgeModule.h>

@interface LocationPermissionModule : NSObject <RCTBridgeModule, CLLocationManagerDelegate>
@property (nonatomic, strong) CLLocationManager *locationManager;
@property (nonatomic, copy) RCTPromiseResolveBlock pendingResolve;
@end

@implementation LocationPermissionModule

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (NSString *)currentStatus
{
  if (![CLLocationManager locationServicesEnabled]) {
    return @"disabled";
  }

  if (self.locationManager == nil) {
    self.locationManager = [CLLocationManager new];
  }

  switch (self.locationManager.authorizationStatus) {
    case kCLAuthorizationStatusAuthorizedAlways:
    case kCLAuthorizationStatusAuthorizedWhenInUse:
      return @"granted";
    case kCLAuthorizationStatusNotDetermined:
      return @"notDetermined";
    case kCLAuthorizationStatusDenied:
    case kCLAuthorizationStatusRestricted:
      return @"denied";
  }
  return @"denied";
}

RCT_EXPORT_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([self currentStatus]);
}

RCT_EXPORT_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *status = [self currentStatus];
  if (![status isEqualToString:@"notDetermined"]) {
    resolve(status);
    return;
  }

  if (self.pendingResolve != nil) {
    reject(@"LOCATION_REQUEST_IN_PROGRESS", @"A location permission request is already in progress.", nil);
    return;
  }

  self.pendingResolve = resolve;
  self.locationManager.delegate = self;
  [self.locationManager requestWhenInUseAuthorization];
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager
{
  if (self.pendingResolve == nil) {
    return;
  }

  NSString *status = [self currentStatus];
  if ([status isEqualToString:@"notDetermined"]) {
    return;
  }

  RCTPromiseResolveBlock resolve = self.pendingResolve;
  self.pendingResolve = nil;
  self.locationManager.delegate = nil;
  resolve(status);
}

@end
