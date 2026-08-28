package com.yeogidamm.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.kakao.vectormap.KakaoMapSdk
import com.yeogidamm.app.map.KakaoMapPackage
import com.yeogidamm.app.share.ShareIntentPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
            add(KakaoMapPackage())
            add(ShareIntentPackage())
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()

      KakaoMapSdk.init(
          this,
          BuildConfig.KAKAO_NATIVE_APP_KEY,
      )

      loadReactNative(this)
  }
}
