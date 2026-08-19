package com.yeogidamm.app.map

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.viewmanagers.YeogidamKakaoMapViewManagerDelegate
import com.facebook.react.viewmanagers.YeogidamKakaoMapViewManagerInterface

class KakaoMapViewManager :
    SimpleViewManager<KakaoMapView>(),
    YeogidamKakaoMapViewManagerInterface<KakaoMapView> {

    private val managerDelegate =
        YeogidamKakaoMapViewManagerDelegate(this)

    override fun getName(): String =
        "YeogidamKakaoMapView"

    override fun createViewInstance(
        reactContext: ThemedReactContext,
    ): KakaoMapView =
        KakaoMapView(reactContext)

    override fun getDelegate() = managerDelegate

    override fun setLatitude(
        view: KakaoMapView,
        value: Double,
    ) {
        view.setLatitude(value)
    }

    override fun setLongitude(
        view: KakaoMapView,
        value: Double,
    ) {
        view.setLongitude(value)
    }

    override fun setZoomLevel(
        view: KakaoMapView,
        value: Int,
    ) {
        view.setZoomLevel(value)
    }

    override fun setCameraMoveRequestId(
        view: KakaoMapView,
        value: Int,
    ) {
        view.setCameraMoveRequestId(value)
    }

    override fun setShowsCurrentLocation(
        view: KakaoMapView,
        value: Boolean,
    ) {
        view.setShowsCurrentLocation(value)
    }

    override fun setCurrentLocationRequestId(
        view: KakaoMapView,
        value: Int,
    ) {
        view.setCurrentLocationRequestId(value)
    }

    override fun setCameraBottomInset(
        view: KakaoMapView,
        value: Double,
    ) {
        view.setCameraBottomInset(value)
    }

    override fun setSavedPlacesJson(
        view: KakaoMapView,
        value: String?,
    ) {
        view.setSavedPlacesJson(value ?: "[]")
    }
}
