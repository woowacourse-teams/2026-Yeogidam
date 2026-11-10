package com.yeogidamm.app.map

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.viewmanagers.YeogidamGoogleMapViewManagerDelegate
import com.facebook.react.viewmanagers.YeogidamGoogleMapViewManagerInterface

class GoogleMapViewManager :
    SimpleViewManager<GoogleMapView>(),
    YeogidamGoogleMapViewManagerInterface<GoogleMapView> {

    private val managerDelegate =
        YeogidamGoogleMapViewManagerDelegate(this)

    override fun getName(): String =
        "YeogidamGoogleMapView"

    override fun createViewInstance(
        reactContext: ThemedReactContext,
    ): GoogleMapView =
        GoogleMapView(reactContext)

    override fun getDelegate() = managerDelegate

    override fun onDropViewInstance(view: GoogleMapView) {
        view.dispose()
        super.onDropViewInstance(view)
    }

    override fun setLatitude(
        view: GoogleMapView,
        value: Double,
    ) {
        view.setLatitude(value)
    }

    override fun setLongitude(
        view: GoogleMapView,
        value: Double,
    ) {
        view.setLongitude(value)
    }

    override fun setZoomLevel(
        view: GoogleMapView,
        value: Int,
    ) {
        view.setZoomLevel(value)
    }

    override fun setSavedPlacesJson(
        view: GoogleMapView,
        value: String?,
    ) {
        view.setSavedPlacesJson(value ?: "[]")
    }
}
