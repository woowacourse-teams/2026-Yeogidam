package com.yeogidamm.app.map

import android.graphics.Color
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.yeogidamm.app.BuildConfig
import org.json.JSONArray
import kotlin.math.roundToInt

// 국내 지도 품질을 카카오맵과 비교하기 위한 개발용 Google 지도입니다.
class GoogleMapView(
    context: ThemedReactContext,
) : FrameLayout(context), LifecycleEventListener {

    private val reactContext = context
    // 키가 없으면 MapView가 앱을 종료시키므로 지도를 만들지 않습니다.
    private val nativeMapView =
        if (BuildConfig.GOOGLE_MAPS_ANDROID_API_KEY.isEmpty()) null else MapView(context)
    private var googleMap: GoogleMap? = null
    private var isDisposed = false
    private var markers = listOf<Marker>()

    private var latitude = 37.5665
    private var longitude = 126.9780
    private var zoomLevel = 15
    private var savedPlacesJson = "[]"
    private var zoomMapStylesJson = ""
    private var zoomMapStyles = listOf<Pair<Float, MapStyleOptions>>()
    private var appliedMapStyleIndex: Int? = null
    private var subwayStationsJson = ""
    private val subwayStationLayer = SubwayStationLayer(context.resources.displayMetrics.density)

    init {
        nativeMapView?.let { mapView ->
            addView(
                mapView,
                LayoutParams(
                    LayoutParams.MATCH_PARENT,
                    LayoutParams.MATCH_PARENT,
                ),
            )
            mapView.onCreate(null)
            mapView.getMapAsync { map ->
                if (isDisposed) return@getMapAsync
                googleMap = map
                // 처음 보일 때의 카메라로만 옮기고, 이후에는 사용자가 움직인 위치를 유지합니다.
                map.moveCamera(
                    CameraUpdateFactory.newLatLngZoom(
                        LatLng(latitude, longitude),
                        zoomLevel.toFloat(),
                    ),
                )
                applyMapStyle()
                map.setOnCameraMoveListener {
                    applyMapStyle()
                    subwayStationLayer.refresh(map)
                }
                map.setOnCameraIdleListener {
                    subwayStationLayer.refresh(map)
                    emitCameraChanged(map)
                }
                // 지하철역 마커는 눌러도 아무 동작도 하지 않게 합니다.
                map.setOnMarkerClickListener { it.tag == SubwayStationLayer.MARKER_TAG }
                renderMarkers()
            }
        }

        reactContext.addLifecycleEventListener(this)
    }

    fun setLatitude(value: Double) {
        latitude = value
    }

    fun setLongitude(value: Double) {
        longitude = value
    }

    fun setZoomLevel(value: Int) {
        zoomLevel = value
    }

    fun setSavedPlacesJson(value: String) {
        if (savedPlacesJson == value) return
        savedPlacesJson = value
        renderMarkers()
    }

    fun setSubwayStationsJson(value: String) {
        if (subwayStationsJson == value) return
        subwayStationsJson = value
        subwayStationLayer.setStations(value)
        googleMap?.let { subwayStationLayer.refresh(it) }
    }

    fun setSubwayStationMinZoom(value: Int) {
        subwayStationLayer.minZoom = value.toFloat()
        googleMap?.let { subwayStationLayer.refresh(it) }
    }

    fun setSubwayStationNameMinZoom(value: Int) {
        subwayStationLayer.nameMinZoom = value.toFloat()
        googleMap?.let { subwayStationLayer.refresh(it) }
    }

    fun setZoomMapStylesJson(value: String) {
        if (zoomMapStylesJson == value) return
        zoomMapStylesJson = value

        val items = runCatching { JSONArray(value) }.getOrNull() ?: JSONArray()
        zoomMapStyles = (0 until items.length()).mapNotNull { index ->
            val item = items.optJSONObject(index) ?: return@mapNotNull null
            val styleJson = item.optString("styleJson").takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            item.optDouble("minZoom").toFloat() to MapStyleOptions(styleJson)
        }
        appliedMapStyleIndex = null
        applyMapStyle()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (isDisposed) return
        nativeMapView?.onStart()
        nativeMapView?.onResume()
    }

    override fun onDetachedFromWindow() {
        if (!isDisposed) {
            nativeMapView?.onPause()
            nativeMapView?.onStop()
        }
        super.onDetachedFromWindow()
    }

    override fun onHostResume() {
        if (!isDisposed) nativeMapView?.onResume()
    }

    override fun onHostPause() {
        if (!isDisposed) nativeMapView?.onPause()
    }

    override fun onHostDestroy() {
        dispose()
    }

    fun dispose() {
        if (isDisposed) return
        isDisposed = true
        reactContext.removeLifecycleEventListener(this)
        nativeMapView?.onDestroy()
        googleMap = null
    }

    private fun emitCameraChanged(map: GoogleMap) {
        if (id == NO_ID) return
        val position = map.cameraPosition

        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            id,
            "onCameraChanged",
            Arguments.createMap().apply {
                putDouble("latitude", position.target.latitude)
                putDouble("longitude", position.target.longitude)
                putInt("zoomLevel", position.zoom.roundToInt())
            },
        )
    }

    // 줌이 단계 경계를 넘을 때만 스타일을 바꿔 끼워, 매 프레임 다시 그리지 않게 합니다.
    private fun applyMapStyle() {
        val map = googleMap ?: return
        val zoom = map.cameraPosition.zoom
        val index = zoomMapStyles.indexOfLast { (minZoom, _) -> minZoom <= zoom }.takeIf { it >= 0 }
        if (index == appliedMapStyleIndex) return

        appliedMapStyleIndex = index
        runCatching { map.setMapStyle(index?.let { zoomMapStyles[it].second }) }
    }

    private fun renderMarkers() {
        val map = googleMap ?: return
        val places = runCatching { JSONArray(savedPlacesJson) }.getOrNull() ?: return

        markers.forEach { it.remove() }
        markers = (0 until places.length()).mapNotNull { index ->
            val place = places.optJSONObject(index) ?: return@mapNotNull null
            if (!place.has("latitude") || !place.has("longitude")) return@mapNotNull null

            val options = MarkerOptions()
                .position(LatLng(place.getDouble("latitude"), place.getDouble("longitude")))
                .title(place.optString("name"))
            markerHue(place.optString("color"))?.let {
                options.icon(BitmapDescriptorFactory.defaultMarker(it))
            }
            map.addMarker(options)
        }
    }

    private fun markerHue(colorHex: String): Float? {
        val color = runCatching { Color.parseColor(colorHex) }.getOrNull() ?: return null
        val hsv = FloatArray(3)
        Color.colorToHSV(color, hsv)
        return hsv[0]
    }
}
