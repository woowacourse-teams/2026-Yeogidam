package com.yeogidamm.app.map

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import android.util.Log
import android.widget.FrameLayout
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.kakao.vectormap.KakaoMap
import com.kakao.vectormap.KakaoMapReadyCallback
import com.kakao.vectormap.LatLng
import com.kakao.vectormap.MapLifeCycleCallback
import com.kakao.vectormap.MapView
import com.kakao.vectormap.camera.CameraUpdateFactory
import com.kakao.vectormap.label.Label
import com.kakao.vectormap.label.LabelOptions
import org.json.JSONArray
import kotlin.math.roundToInt

class KakaoMapView(
    context: Context,
) : FrameLayout(context), LifecycleEventListener {

    private val nativeMapView = MapView(context)
    private val reactContext = context as ReactContext
    private val locationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var kakaoMap: KakaoMap? = null
    private var currentLocationLabel: Label? = null
    private var savedPlacesJson = "[]"
    private var lastKnownLocation: Location? = null

    private var latitude = 37.5445
    private var longitude = 127.0557
    private var zoomLevel = 15
    private var showsCurrentLocation = false
    private var currentLocationRequestId = 0
    private var cameraBottomInset = 0
    private var locationUpdatesStarted = false
    private var locationPermissionRequestInFlight = false
    private var locationPermissionDenied = false
    private var hasCenteredOnCurrentLocation = false
    private var pendingCurrentLocationCameraMove = false

    private val locationListener =
        LocationListener { location ->
            updateCurrentLocation(location)
        }

    private val moveToDefaultPosition = Runnable {
        val map = kakaoMap ?: return@Runnable

        if (!isAttachedToWindow) {
            return@Runnable
        }

        map.moveCamera(
            CameraUpdateFactory.newCenterPosition(
                LatLng.from(latitude, longitude),
                zoomLevel,
            ),
        )
    }

    init {
        addView(
            nativeMapView,
            LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT,
            ),
        )

        reactContext.addLifecycleEventListener(this)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()

        if (!nativeMapView.isStarted) {
            startMap()
        }

        post(::resumeMapIfNeeded)
        startCurrentLocationIfNeeded()
    }

    private fun startMap() {
        nativeMapView.start(
            object : MapLifeCycleCallback() {
                override fun onMapDestroy() {
                    Log.d("YeogidamKakaoMap", "지도 종료")
                }

                override fun onMapError(error: Exception) {
                    Log.e("YeogidamKakaoMap", "지도 오류", error)
                }
            },
            object : KakaoMapReadyCallback() {
                override fun onMapReady(map: KakaoMap) {
                    kakaoMap = map
                    applyCameraPadding()
                    map.setOnLabelClickListener { _, _, label ->
                        val placeId = label.tag as? String ?: return@setOnLabelClickListener false
                        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
                            id,
                            "onMarkerPressed",
                            Arguments.createMap().apply { putString("id", placeId) },
                        )
                        true
                    }
                    map.setOnCameraMoveEndListener { _, position, _ ->
                        emitVisibleBounds(position.position, position.zoomLevel)
                    }
                    renderSavedPlaceMarkers()
                    Log.d("YeogidamKakaoMap", "지도 준비 완료")
                    post(::resumeMapIfNeeded)
                    startCurrentLocationIfNeeded()
                    post { emitVisibleBounds() }
                }

                override fun getPosition(): LatLng =
                    LatLng.from(
                        this@KakaoMapView.latitude,
                        this@KakaoMapView.longitude,
                    )

                override fun getZoomLevel(): Int =
                    this@KakaoMapView.zoomLevel
            },
        )
    }

    fun setLatitude(value: Double) {
        latitude = value
        moveCamera()
    }

    fun setLongitude(value: Double) {
        longitude = value
        moveCamera()
    }

    fun setZoomLevel(value: Int) {
        zoomLevel = value
        moveCamera()
    }

    fun setShowsCurrentLocation(value: Boolean) {
        if (showsCurrentLocation == value) {
            return
        }

        showsCurrentLocation = value
        hasCenteredOnCurrentLocation = false

        if (value) {
            locationPermissionDenied = false
            startCurrentLocationIfNeeded()
        } else {
            stopLocationUpdates()
            currentLocationLabel?.remove()
            currentLocationLabel = null
        }
    }

    fun setCurrentLocationRequestId(value: Int) {
        if (currentLocationRequestId == value) {
            return
        }

        currentLocationRequestId = value
        centerMapOnCurrentLocation()
    }

    fun setCameraBottomInset(value: Double) {
        val nextInset =
            (value.coerceAtLeast(0.0) * resources.displayMetrics.density).roundToInt()
        if (cameraBottomInset == nextInset) return

        cameraBottomInset = nextInset
        applyCameraPadding()
    }

    private fun applyCameraPadding() {
        val map = kakaoMap ?: return
        val bottomInset = cameraBottomInset.coerceAtMost((height - 1).coerceAtLeast(0))
        map.setPadding(0, 0, 0, bottomInset)
        post { emitVisibleBounds() }
    }

    fun setSavedPlacesJson(value: String) {
        if (savedPlacesJson == value) return
        savedPlacesJson = value
        renderSavedPlaceMarkers()
    }

    private fun moveCamera() {
        removeCallbacks(moveToDefaultPosition)
        post(moveToDefaultPosition)
    }

    private fun renderSavedPlaceMarkers() {
        val layer = kakaoMap?.labelManager?.layer ?: return
        layer.removeAll()

        try {
            val places = JSONArray(savedPlacesJson)
            for (index in 0 until places.length()) {
                val place = places.getJSONObject(index)
                layer.addLabel(
                    LabelOptions.from(
                        place.getString("id"),
                        LatLng.from(place.getDouble("latitude"), place.getDouble("longitude")),
                    ).setStyles(createSavedPlaceMarker()),
                ).apply {
                    tag = place.getString("id")
                    isClickable = true
                }
            }
        } catch (error: Exception) {
            Log.e("YeogidamKakaoMap", "저장 장소 핀을 표시하지 못했습니다.", error)
        }
    }

    override fun onSizeChanged(
        width: Int,
        height: Int,
        oldWidth: Int,
        oldHeight: Int,
    ) {
        super.onSizeChanged(width, height, oldWidth, oldHeight)
        if (width > 0 && height > 0 && (width != oldWidth || height != oldHeight)) {
            post {
                applyCameraPadding()
                emitVisibleBounds()
            }
        }
    }

    private fun emitVisibleBounds(
        center: LatLng? = kakaoMap?.cameraPosition?.position,
        currentZoomLevel: Int = kakaoMap?.zoomLevel ?: zoomLevel,
    ) {
        val map = kakaoMap ?: return
        if (id == NO_ID || width <= 0 || height <= 0 || center == null) return

        val visibleBottom = (height - map.padding.bottom).coerceAtLeast(1)

        val corners = listOfNotNull(
            map.fromScreenPoint(0, 0),
            map.fromScreenPoint(width, 0),
            map.fromScreenPoint(0, visibleBottom),
            map.fromScreenPoint(width, visibleBottom),
        )
        if (corners.size != 4) return

        val southLatitude = corners.minOf { it.latitude }
        val northLatitude = corners.maxOf { it.latitude }
        val westLongitude = corners.minOf { it.longitude }
        val eastLongitude = corners.maxOf { it.longitude }

        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            id,
            "onCameraChanged",
            Arguments.createMap().apply {
                putDouble("latitude", center.latitude)
                putDouble("longitude", center.longitude)
                putInt("zoomLevel", currentZoomLevel)
                putDouble("southLatitude", southLatitude)
                putDouble("northLatitude", northLatitude)
                putDouble("westLongitude", westLongitude)
                putDouble("eastLongitude", eastLongitude)
            },
        )
    }

    private fun startCurrentLocationIfNeeded() {
        if (!showsCurrentLocation || !isAttachedToWindow || kakaoMap == null) {
            return
        }

        if (hasLocationPermission()) {
            locationPermissionDenied = false
            startLocationUpdates()
        } else if (!locationPermissionDenied) {
            requestLocationPermission()
        }
    }

    private fun hasLocationPermission(): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun requestLocationPermission() {
        if (locationPermissionRequestInFlight) {
            return
        }

        val activity = reactContext.currentActivity as? PermissionAwareActivity

        if (activity == null) {
            Log.e("YeogidamKakaoMap", "위치 권한을 요청할 Activity가 없습니다.")
            return
        }

        locationPermissionRequestInFlight = true
        activity.requestPermissions(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
            LOCATION_PERMISSION_REQUEST_CODE,
        ) { requestCode, _, grantResults ->
            if (requestCode != LOCATION_PERMISSION_REQUEST_CODE) {
                return@requestPermissions false
            }

            locationPermissionRequestInFlight = false

            if (grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
                locationPermissionDenied = false
                startCurrentLocationIfNeeded()
            } else {
                locationPermissionDenied = true
                Log.w("YeogidamKakaoMap", "사용자가 위치 권한을 허용하지 않았습니다.")
            }

            true
        }
    }

    private fun startLocationUpdates() {
        if (locationUpdatesStarted || !hasLocationPermission()) {
            return
        }

        try {
            val enabledProviders =
                listOf(
                    LocationManager.GPS_PROVIDER,
                    LocationManager.NETWORK_PROVIDER,
                ).filter { provider ->
                    locationManager.isProviderEnabled(provider)
                }

            val lastLocation =
                enabledProviders
                    .mapNotNull { provider ->
                        locationManager.getLastKnownLocation(provider)
                    }.maxByOrNull { location -> location.time }

            lastLocation?.let(::updateCurrentLocation)

            enabledProviders.forEach { provider ->
                locationManager.requestLocationUpdates(
                    provider,
                    LOCATION_UPDATE_INTERVAL_MS,
                    LOCATION_UPDATE_DISTANCE_METERS,
                    locationListener,
                    Looper.getMainLooper(),
                )
            }

            locationUpdatesStarted = enabledProviders.isNotEmpty()

            if (!locationUpdatesStarted) {
                Log.w("YeogidamKakaoMap", "사용 가능한 위치 제공자가 없습니다.")
            }
        } catch (error: SecurityException) {
            Log.e("YeogidamKakaoMap", "위치 정보를 읽을 권한이 없습니다.", error)
        }
    }

    private fun stopLocationUpdates() {
        if (!locationUpdatesStarted) {
            return
        }

        locationManager.removeUpdates(locationListener)
        locationUpdatesStarted = false
    }

    private fun updateCurrentLocation(location: Location) {
        val map = kakaoMap ?: return
        lastKnownLocation = location

        if (!isInsideKakaoMapCoverage(location.latitude, location.longitude)) {
            if (pendingCurrentLocationCameraMove) {
                centerMapOnCurrentLocation()
            }
            return
        }

        val position = LatLng.from(location.latitude, location.longitude)
        val label = currentLocationLabel

        if (label == null) {
            val newLabel =
                map.labelManager?.layer?.addLabel(
                    LabelOptions
                        .from(CURRENT_LOCATION_LABEL_ID, position)
                        .setStyles(createCurrentLocationMarker()),
                )
            currentLocationLabel = newLabel

            if (newLabel == null) {
                Log.e("YeogidamKakaoMap", "현재 위치 마커 생성 실패")
            } else {
                Log.d("YeogidamKakaoMap", "현재 위치 마커 생성 완료")
            }
        } else {
            label.moveTo(position)
        }

        if (pendingCurrentLocationCameraMove) {
            centerMapOnCurrentLocation()
        }

        // Keep the initial camera on the saved-place area. The camera moves to
        // the user's location only after the current-location button is tapped.
    }

    private fun centerMapOnCurrentLocation() {
        pendingCurrentLocationCameraMove = true
        val map = kakaoMap
        val location = lastKnownLocation

        if (map == null || location == null) {
            hasCenteredOnCurrentLocation = false
            startCurrentLocationIfNeeded()
            return
        }

        if (!isInsideKakaoMapCoverage(location.latitude, location.longitude)) {
            pendingCurrentLocationCameraMove = false
            emitMapError(
                "현재 위치가 카카오맵 지원 지역 밖에 있습니다. " +
                    "에뮬레이터에서는 위치를 대한민국 좌표로 설정해 주세요.",
            )
            return
        }

        pendingCurrentLocationCameraMove = false
        hasCenteredOnCurrentLocation = true
        removeCallbacks(moveToDefaultPosition)
        post {
            if (!isAttachedToWindow || kakaoMap !== map) {
                hasCenteredOnCurrentLocation = false
                return@post
            }

            map.moveCamera(
                CameraUpdateFactory.newCenterPosition(
                    LatLng.from(location.latitude, location.longitude),
                    zoomLevel,
                ),
            )
            Log.d("YeogidamKakaoMap", "현재 위치로 지도 이동 완료")
        }
    }

    private fun isInsideKakaoMapCoverage(
        latitude: Double,
        longitude: Double,
    ): Boolean =
        latitude in KAKAO_MAP_MIN_LATITUDE..KAKAO_MAP_MAX_LATITUDE &&
            longitude in KAKAO_MAP_MIN_LONGITUDE..KAKAO_MAP_MAX_LONGITUDE

    private fun emitMapError(message: String) {
        if (id == NO_ID) return

        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            id,
            "onMapError",
            Arguments.createMap().apply { putString("message", message) },
        )
    }

    private fun resumeMapIfNeeded() {
        if (
            isAttachedToWindow &&
            nativeMapView.isStarted &&
            reactContext.lifecycleState == LifecycleState.RESUMED
        ) {
            nativeMapView.resume()
        }
    }

    private fun createCurrentLocationMarker(): Bitmap {
        val density = resources.displayMetrics.density
        val size = (CURRENT_LOCATION_MARKER_SIZE_DP * density).roundToInt()
        val center = size / 2f
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        paint.color = Color.argb(55, 92, 117, 255)
        canvas.drawCircle(center, center, center, paint)

        paint.color = Color.WHITE
        canvas.drawCircle(center, center, center * 0.7f, paint)

        paint.color = Color.rgb(92, 117, 255)
        canvas.drawCircle(center, center, center * 0.5f, paint)

        return bitmap
    }

    private fun createSavedPlaceMarker(): Bitmap {
        val density = resources.displayMetrics.density
        val size = (SAVED_PLACE_MARKER_SIZE_DP * density).roundToInt()
        BitmapFactory.decodeResource(resources, R.drawable.map_marker)?.let { markerBitmap ->
            return Bitmap.createScaledBitmap(markerBitmap, size, size, true)
        }

        val width = size
        val height = size
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val centerX = width / 2f
        val radius = width * 0.36f
        val centerY = height / 2f

        paint.color = Color.WHITE
        canvas.drawCircle(centerX, centerY, radius + density * 2, paint)
        paint.color = Color.rgb(122, 199, 223)
        canvas.drawCircle(centerX, centerY, radius, paint)
        paint.color = Color.WHITE
        canvas.drawCircle(centerX, centerY, radius * 0.38f, paint)
        return bitmap
    }

    override fun onHostResume() {
        resumeMapIfNeeded()
        startCurrentLocationIfNeeded()
    }

    override fun onHostPause() {
        stopLocationUpdates()

        if (nativeMapView.isStarted) {
            nativeMapView.pause()
        }
    }

    override fun onHostDestroy() {
        stopLocationUpdates()
        removeCallbacks(moveToDefaultPosition)
        nativeMapView.finish()
        reactContext.removeLifecycleEventListener(this)
    }

    override fun onDetachedFromWindow() {
        stopLocationUpdates()
        removeCallbacks(moveToDefaultPosition)

        if (nativeMapView.isStarted) {
            nativeMapView.pause()
        }

        super.onDetachedFromWindow()
    }

    private companion object {
        const val CURRENT_LOCATION_LABEL_ID = "yeogidam-current-location"
        const val CURRENT_LOCATION_MARKER_SIZE_DP = 28
        const val SAVED_PLACE_MARKER_SIZE_DP = 36
        const val LOCATION_PERMISSION_REQUEST_CODE = 9417
        const val LOCATION_UPDATE_INTERVAL_MS = 2_000L
        const val LOCATION_UPDATE_DISTANCE_METERS = 3f
        const val KAKAO_MAP_MIN_LATITUDE = 32.0
        const val KAKAO_MAP_MAX_LATITUDE = 39.5
        const val KAKAO_MAP_MIN_LONGITUDE = 123.0
        const val KAKAO_MAP_MAX_LONGITUDE = 132.0
    }
}
