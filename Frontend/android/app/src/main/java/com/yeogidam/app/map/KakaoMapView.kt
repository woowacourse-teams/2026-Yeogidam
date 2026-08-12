package com.yeogidam.app.map

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
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
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.PermissionAwareActivity
import com.kakao.vectormap.KakaoMap
import com.kakao.vectormap.KakaoMapReadyCallback
import com.kakao.vectormap.LatLng
import com.kakao.vectormap.MapLifeCycleCallback
import com.kakao.vectormap.MapView
import com.kakao.vectormap.camera.CameraUpdateFactory
import com.kakao.vectormap.label.Label
import com.kakao.vectormap.label.LabelOptions
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
    private var lastKnownLocation: Location? = null

    private var latitude = 37.5445
    private var longitude = 127.0557
    private var zoomLevel = 15
    private var showsCurrentLocation = false
    private var currentLocationRequestId = 0
    private var locationUpdatesStarted = false
    private var locationPermissionRequestInFlight = false
    private var locationPermissionDenied = false
    private var hasCenteredOnCurrentLocation = false

    private val locationListener =
        LocationListener { location ->
            updateCurrentLocation(location)
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
                    Log.d("YeogidamKakaoMap", "지도 준비 완료")
                    moveCamera()
                    startCurrentLocationIfNeeded()
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

    private fun moveCamera() {
        val map = kakaoMap ?: return

        val update = CameraUpdateFactory.newCenterPosition(
            LatLng.from(latitude, longitude),
            zoomLevel,
        )

        map.moveCamera(update)
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

        if (!hasCenteredOnCurrentLocation) {
            centerMapOnCurrentLocation()
        }
    }

    private fun centerMapOnCurrentLocation() {
        val map = kakaoMap
        val location = lastKnownLocation

        if (map == null || location == null) {
            hasCenteredOnCurrentLocation = false
            startCurrentLocationIfNeeded()
            return
        }

        hasCenteredOnCurrentLocation = true
        map.moveCamera(
            CameraUpdateFactory.newCenterPosition(
                LatLng.from(location.latitude, location.longitude),
                zoomLevel,
            ),
        )
        Log.d("YeogidamKakaoMap", "현재 위치로 지도 이동 완료")
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

    override fun onHostResume() {
        if (nativeMapView.isStarted) {
            nativeMapView.resume()
        }

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
        nativeMapView.finish()
        reactContext.removeLifecycleEventListener(this)
    }

    override fun onDetachedFromWindow() {
        stopLocationUpdates()
        super.onDetachedFromWindow()
    }

    private companion object {
        const val CURRENT_LOCATION_LABEL_ID = "yeogidam-current-location"
        const val CURRENT_LOCATION_MARKER_SIZE_DP = 28
        const val LOCATION_PERMISSION_REQUEST_CODE = 9417
        const val LOCATION_UPDATE_INTERVAL_MS = 2_000L
        const val LOCATION_UPDATE_DISTANCE_METERS = 3f
    }
}
