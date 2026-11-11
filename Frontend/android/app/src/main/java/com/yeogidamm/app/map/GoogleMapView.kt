package com.yeogidamm.app.map

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.graphics.PointF
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import android.text.TextPaint
import android.text.TextUtils
import android.util.Log
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.common.LifecycleState
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.yeogidamm.app.BuildConfig
import com.yeogidamm.app.R
import org.json.JSONArray
import kotlin.math.roundToInt

// 지도 화면의 Google 지도입니다. 카카오 지도(KakaoMapView)와 같은 props·이벤트를 받고,
// 핀 모양·이름 표시·카메라 이동도 카카오 지도와 똑같이 동작하도록 옮겼습니다.
class GoogleMapView(
    context: ThemedReactContext,
) : FrameLayout(context), LifecycleEventListener {

    private val reactContext = context
    private val applicationReactContext = context.reactApplicationContext
    // 키가 없으면 MapView가 앱을 종료시키므로 지도를 만들지 않습니다.
    private val nativeMapView =
        if (BuildConfig.GOOGLE_MAPS_ANDROID_API_KEY.isEmpty()) null else MapView(context)
    private var googleMap: GoogleMap? = null
    private var isDisposed = false
    private var isMapStarted = false
    private val locationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var currentLocationMarker: Marker? = null
    private var savedPlacesJson = "[]"
    private var savedPlaceMarkers = listOf<SavedPlaceMarker>()
    private val placeMarkersById = mutableMapOf<String, Marker>()
    private val placeStyleKeyById = mutableMapOf<String, String>()
    private val placeIcons = mutableMapOf<String, Pair<BitmapDescriptor, Float>>()
    private var placeNameShownIds = setOf<String>()
    private val placeNameTextSizes = mutableMapOf<String, Pair<Float, Float>>()
    private var lastKnownLocation: Location? = null
    private var zoomMapStylesJson = ""
    private var zoomMapStyles = listOf<Pair<Float, MapStyleOptions>>()
    private var appliedMapStyleIndex: Int? = null
    private var subwayStationsJson = ""
    private val subwayStationLayer = SubwayStationLayer(context.resources.displayMetrics.density)
    // 카카오 지도는 핀 이미지를 1.5배로 키워 그렸으므로, 같은 크기로 보이도록 핀·이름·현재 위치 마커를
    // 모두 이 배율을 곱한 밀도로 그립니다.
    private val markerDensity = context.resources.displayMetrics.density * MARKER_SCALE

    private var latitude = 37.5445
    private var longitude = 127.0557
    private var zoomLevel = 15
    private var cameraMoveRequestId = 0
    private var cameraFitPointsJson = "[]"
    private var cameraFitRequestId = 0
    private var showsCurrentLocation = false
    private var currentLocationRequestId = 0
    private var cameraBottomInset = 0
    private var locationUpdatesStarted = false
    private var pendingCurrentLocationCameraMove = false
    private var appliedBottomPadding = 0

    private val locationListener =
        LocationListener { location ->
            updateCurrentLocation(location)
        }

    private val moveToDefaultPosition = Runnable {
        val map = googleMap ?: return@Runnable

        if (!isAttachedToWindow) {
            return@Runnable
        }

        map.moveCamera(
            CameraUpdateFactory.newLatLngZoom(
                LatLng(latitude, longitude),
                zoomLevel.toFloat(),
            ),
        )
    }

    private val fitSearchResultPoints = Runnable {
        val map = googleMap ?: return@Runnable

        if (!isAttachedToWindow) {
            return@Runnable
        }

        try {
            val points = JSONArray(cameraFitPointsJson).let { places ->
                (0 until places.length()).mapNotNull { index ->
                    places.optJSONObject(index)?.let { place ->
                        if (place.has("latitude") && place.has("longitude")) {
                            LatLng(
                                place.getDouble("latitude"),
                                place.getDouble("longitude"),
                            )
                        } else {
                            null
                        }
                    }
                }
            }

            if (points.size < 2) {
                return@Runnable
            }

            val bounds = LatLngBounds.builder().apply { points.forEach(::include) }.build()
            val padding = (SEARCH_RESULT_CAMERA_PADDING_DP * resources.displayMetrics.density).roundToInt()
            map.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds, padding))
            if (map.cameraPosition.zoom > SEARCH_RESULT_MAX_ZOOM_LEVEL) {
                map.moveCamera(CameraUpdateFactory.zoomTo(SEARCH_RESULT_MAX_ZOOM_LEVEL))
            }
        } catch (error: Exception) {
            Log.e("YeogidamGoogleMap", "검색 결과 범위에 카메라를 맞추지 못했습니다.", error)
        }
    }

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
            mapView.getMapAsync(::onMapReady)
        }

        reactContext.addLifecycleEventListener(this)
    }

    private fun onMapReady(map: GoogleMap) {
        if (isDisposed) return
        googleMap = map
        map.uiSettings.isMapToolbarEnabled = false
        map.uiSettings.isIndoorLevelPickerEnabled = false
        map.moveCamera(
            CameraUpdateFactory.newLatLngZoom(
                LatLng(latitude, longitude),
                zoomLevel.toFloat(),
            ),
        )
        applyMapStyle()
        applyCameraPadding()

        map.setOnMarkerClickListener { marker ->
            val tag = marker.tag
            if (tag is PlaceMarkerTag) emitMarkerPressed(map, tag.id)
            // true를 돌려줘 Google 기본 동작(말풍선, 핀으로 카메라 이동)을 막습니다.
            true
        }
        map.setOnCameraMoveStartedListener { reason ->
            if (reason == GoogleMap.OnCameraMoveStartedListener.REASON_GESTURE) {
                reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
                    id,
                    "onMapPanStarted",
                    Arguments.createMap().apply { putBoolean("started", true) },
                )
            }
        }
        map.setOnCameraMoveListener {
            applyMapStyle()
            subwayStationLayer.refresh(map)
        }
        map.setOnCameraIdleListener {
            emitVisibleBounds()
            refreshPlaceNames()
            subwayStationLayer.refresh(map)
        }

        renderSavedPlaceMarkers()
        subwayStationLayer.refresh(map)
        moveCamera()
        if (cameraFitRequestId > 0) {
            moveCameraToFitSearchResults()
        }
        startCurrentLocationIfNeeded()
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            id,
            "onMapReady",
            Arguments.createMap().apply { putBoolean("ready", true) },
        )
        post { emitVisibleBounds() }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (isDisposed) return

        if (nativeMapView == null) {
            emitMapError("Google 지도 키가 설정되지 않아 지도를 표시할 수 없습니다.")
            return
        }
        if (!isMapStarted) {
            nativeMapView.onStart()
            isMapStarted = true
        }
        post(::resumeMapIfNeeded)
        startCurrentLocationIfNeeded()
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

    fun setCameraMoveRequestId(value: Int) {
        if (cameraMoveRequestId == value) {
            return
        }

        cameraMoveRequestId = value
        moveCamera()
    }

    fun setCameraFitPointsJson(value: String) {
        cameraFitPointsJson = value
    }

    fun setCameraFitRequestId(value: Int) {
        if (cameraFitRequestId == value) {
            return
        }

        cameraFitRequestId = value
        moveCameraToFitSearchResults()
    }

    fun setShowsCurrentLocation(value: Boolean) {
        if (showsCurrentLocation == value) {
            return
        }

        showsCurrentLocation = value
        if (value) {
            startCurrentLocationIfNeeded()
        } else {
            stopLocationUpdates()
            currentLocationMarker?.remove()
            currentLocationMarker = null
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

    fun setSavedPlacesJson(value: String) {
        if (savedPlacesJson == value) return
        savedPlacesJson = value
        renderSavedPlaceMarkers()
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

    // 지도 뷰는 전체 화면 그대로 두고, 바텀시트에 가려진 부분은 여백으로 처리합니다.
    // 여백을 두면 카메라 중심 좌표와 Google 로고가 시트 위쪽 영역으로 올라갑니다.
    private fun applyCameraPadding() {
        val map = googleMap ?: return
        val bottomInset = cameraBottomInset.coerceAtMost((height - 1).coerceAtLeast(0))
        // Google 로고는 여백 안쪽 왼쪽 아래에 놓입니다. 시트 둥근 모서리에 걸리지 않는 선에서
        // 로고를 시트 쪽으로 조금 내리려고 여백을 시트 높이보다 살짝 줄입니다.
        val logoLowering = (LOGO_LOWERING_DP * resources.displayMetrics.density).roundToInt()
        val bottomPadding = (bottomInset - logoLowering).coerceAtLeast(0)
        if (bottomPadding == appliedBottomPadding) return

        // Google은 여백이 바뀌면 카메라 중심을 새 여백의 가운데로 옮겨 지도가 시트를 따라 움직입니다.
        // 카카오 지도처럼 보이는 지도는 그대로 두려고, 새 중심 자리에 있던 좌표로 카메라를 다시 맞춥니다.
        val camera = map.cameraPosition
        val target = map.projection.fromScreenLocation(Point(width / 2, (height - bottomPadding) / 2))
        map.setPadding(0, 0, 0, bottomPadding)
        appliedBottomPadding = bottomPadding
        if (width > 0 && height > 0) {
            map.moveCamera(
                CameraUpdateFactory.newCameraPosition(
                    CameraPosition(target, camera.zoom, camera.tilt, camera.bearing),
                ),
            )
        }
        post { emitVisibleBounds() }
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

    private fun moveCamera() {
        removeCallbacks(moveToDefaultPosition)
        post(moveToDefaultPosition)
    }

    private fun moveCameraToFitSearchResults() {
        removeCallbacks(fitSearchResultPoints)
        post(fitSearchResultPoints)
    }

    private fun emitMarkerPressed(map: GoogleMap, placeId: String) {
        val cameraPosition = map.cameraPosition
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            id,
            "onMarkerPressed",
            Arguments.createMap().apply {
                putString("id", placeId)
                putDouble("latitude", cameraPosition.target.latitude)
                putDouble("longitude", cameraPosition.target.longitude)
                putInt("zoomLevel", cameraPosition.zoom.roundToInt())
                putDouble(
                    "cameraBottomInset",
                    cameraBottomInset.coerceAtMost((height - 1).coerceAtLeast(0)) /
                        resources.displayMetrics.density.toDouble(),
                )
            },
        )
    }

    private data class PlaceMarkerTag(val id: String)

    private data class SavedPlaceMarker(
        val id: String,
        val latitude: Double,
        val longitude: Double,
        val selected: Boolean,
        val colorHex: String?,
        val category: String?,
        val name: String,
    )

    private fun renderSavedPlaceMarkers() {
        try {
            val places = JSONArray(savedPlacesJson)
            val markersById = linkedMapOf<String, SavedPlaceMarker>()
            for (index in 0 until places.length()) {
                val place = places.getJSONObject(index)
                val id = place.getString("id")
                markersById[id] = SavedPlaceMarker(
                    id = id,
                    latitude = place.getDouble("latitude"),
                    longitude = place.getDouble("longitude"),
                    selected = place.optBoolean("selected", false),
                    colorHex = place.optString("color", "").takeIf { it.isNotEmpty() },
                    category = place.optString("category", "").takeIf { it.isNotEmpty() },
                    name = place.optString("name", "").trim(),
                )
            }
            savedPlaceMarkers = markersById.values.toList()
            applySavedPlaceMarkers()
        } catch (error: Exception) {
            Log.e("YeogidamGoogleMap", "저장 장소 핀을 표시하지 못했습니다.", error)
        }
    }

    // 카메라가 멈출 때 이름을 보여 줄 핀이 달라졌으면 핀 이미지를 다시 적용합니다.
    private fun refreshPlaceNames() {
        val map = googleMap ?: return
        if (placeIdsShowingName(map) != placeNameShownIds) {
            applySavedPlaceMarkers()
        }
    }

    private fun applySavedPlaceMarkers() {
        val map = googleMap ?: return

        // 이름은 겹치지 않는 핀에만 붙입니다.
        placeNameShownIds = placeIdsShowingName(map)
        val nextStyleKeyById = savedPlaceMarkers.associate { it.id to placeStyleKey(it) }

        (placeMarkersById.keys - nextStyleKeyById.keys).forEach { removedId ->
            placeMarkersById.remove(removedId)?.remove()
        }

        savedPlaceMarkers.forEach { marker ->
            val position = LatLng(marker.latitude, marker.longitude)
            val styleKey = nextStyleKeyById.getValue(marker.id)
            val (icon, anchorY) = placeIcon(styleKey, marker)
            // 선택된 핀이 다른 핀 위로 올라오고, 현재 위치 마커보다는 아래에 둡니다.
            val zIndex = if (marker.selected) SELECTED_PLACE_Z_INDEX else PLACE_Z_INDEX
            val existing = placeMarkersById[marker.id]

            if (existing == null) {
                map.addMarker(
                    MarkerOptions()
                        .position(position)
                        .icon(icon)
                        .anchor(0.5f, anchorY)
                        .zIndex(zIndex),
                )?.let {
                    it.tag = PlaceMarkerTag(marker.id)
                    placeMarkersById[marker.id] = it
                }
            } else {
                existing.position = position
                existing.zIndex = zIndex
                if (placeStyleKeyById[marker.id] != styleKey) {
                    existing.setIcon(icon)
                    existing.setAnchor(0.5f, anchorY)
                }
            }
        }

        placeStyleKeyById.clear()
        placeStyleKeyById.putAll(nextStyleKeyById)
    }

    private fun placeStyleKey(marker: SavedPlaceMarker): String =
        placeStyleKey(
            marker.selected,
            marker.colorHex,
            marker.category,
            marker.name.takeIf { marker.id in placeNameShownIds },
        )

    // 이름을 보여 줄 핀을 고릅니다. 선택된 핀은 항상 보여 주고, 나머지는 충분히 확대했을 때
    // 이름이 다른 핀이나 먼저 자리 잡은 이름과 겹치지 않을 때만 보여 줍니다.
    private fun placeIdsShowingName(map: GoogleMap): Set<String> {
        val shown = savedPlaceMarkers.filter { it.selected && it.name.isNotEmpty() }.map { it.id }.toMutableSet()
        if (width <= 0 || height <= 0) return shown

        val projection = map.projection
        val margin = 40 * resources.displayMetrics.density
        val viewBounds = RectF(-margin, -margin, width + margin, height + margin)
        val onScreen = savedPlaceMarkers
            .map { marker ->
                val point = projection.toScreenLocation(LatLng(marker.latitude, marker.longitude))
                marker to PointF(point.x.toFloat(), point.y.toFloat())
            }
            .filter { (_, center) -> viewBounds.contains(center.x, center.y) }
        fun pinRect(marker: SavedPlaceMarker, center: PointF): RectF {
            val radius = placeMarkerDiameter(marker.selected) / 2
            return RectF(center.x - radius, center.y - radius, center.x + radius, center.y + radius)
        }

        val takenNameRects = mutableListOf<RectF>()
        val candidates = onScreen.sortedByDescending { (marker, _) -> marker.selected }
        for ((marker, center) in candidates) {
            if (marker.name.isEmpty()) continue
            val nameRect = placeNameRect(marker, center)
            if (marker.selected) {
                takenNameRects += nameRect
                continue
            }
            if (map.cameraPosition.zoom < PLACE_NAME_MIN_ZOOM_LEVEL) continue
            val hitsPin = onScreen.any { (other, otherCenter) ->
                other.id != marker.id && RectF.intersects(pinRect(other, otherCenter), nameRect)
            }
            val hitsName = takenNameRects.any { RectF.intersects(it, nameRect) }
            if (!hitsPin && !hitsName) {
                shown += marker.id
                takenNameRects += nameRect
            }
        }
        return shown
    }

    // addPlaceName이 그리는 이름 영역을 원 중심 기준 화면 좌표로 돌려줍니다.
    private fun placeNameRect(marker: SavedPlaceMarker, center: PointF): RectF {
        val (textWidth, textHeight) = placeNameTextSizes.getOrPut(marker.name) {
            val paint = placeNamePaint()
            val metrics = paint.fontMetrics
            fittedPlaceName(marker.name, paint).let(paint::measureText) to (metrics.descent - metrics.ascent)
        }
        val density = markerDensity
        val halo = PLACE_NAME_HALO_DP * resources.displayMetrics.density
        val top = center.y + placeMarkerDiameter(marker.selected) / 2 + density
        val halfWidth = textWidth / 2 + halo
        return RectF(center.x - halfWidth, top, center.x + halfWidth, top + textHeight + halo)
    }

    private fun placeMarkerDiameter(selected: Boolean): Float =
        (if (selected) 26 else 20) * markerDensity

    private fun placeNamePaint(): Paint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = PLACE_NAME_TEXT_SIZE_DP * resources.displayMetrics.density
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            color = Color.rgb(26, 26, 28)
            textAlign = Paint.Align.CENTER
        }

    private fun fittedPlaceName(name: String, paint: Paint): String =
        TextUtils
            .ellipsize(
                name,
                TextPaint(paint),
                PLACE_NAME_MAX_WIDTH_DP * markerDensity,
                TextUtils.TruncateAt.END,
            )
            .toString()

    private fun parseColor(colorHex: String?): Int? =
        colorHex?.let {
            try {
                Color.parseColor(it)
            } catch (error: IllegalArgumentException) {
                null
            }
        }

    // 서버 범주 코드(categoryCode)별 핀 아이콘(VectorDrawable)입니다. 목록에 없는 카테고리는 아이콘 없이 점을 씁니다.
    private val categoryIconResources = mapOf(
        "CAFE" to R.drawable.pin_category_cafe,
        "DESSERT" to R.drawable.pin_category_dessert,
        "KOREAN" to R.drawable.pin_category_korean,
        "WESTERN" to R.drawable.pin_category_western,
        "JAPANESE" to R.drawable.pin_category_japanese,
        "CHINESE" to R.drawable.pin_category_chinese,
        "BUNSIK" to R.drawable.pin_category_bunsik,
        "BAR" to R.drawable.pin_category_bar,
        "SPECIALTY" to R.drawable.pin_category_specialty,
        "CULTURE_LEISURE" to R.drawable.pin_category_culture_leisure,
        "ETC" to R.drawable.pin_category_etc,
    )
    private val defaultPinColor = Color.parseColor("#8FA2FF")

    // 이름을 붙인 핀은 이미지에 이름까지 그리므로 이름도 스타일 키에 넣습니다.
    private fun placeStyleKey(selected: Boolean, colorHex: String?, category: String?, name: String?): String {
        val color = parseColor(colorHex)
        val hasIcon = categoryIconResources.containsKey(category)
        if (color == null && !hasIcon) {
            return if (selected) "default-selected" else "default"
        }
        val colorKey = (if (color != null) colorHex!!.lowercase() else "default")
        val nameKey = name?.let { "-name-$it" } ?: ""
        return "$colorKey-${if (hasIcon) category else "none"}-${if (selected) "selected" else "normal"}$nameKey"
    }

    // 폴더 색이나 카테고리 아이콘이 있는 핀은 조합별 이미지를 한 번만 만들어 재사용하고,
    // 둘 다 없으면 기본 핀 이미지를 씁니다.
    private fun placeIcon(styleKey: String, marker: SavedPlaceMarker): Pair<BitmapDescriptor, Float> =
        placeIcons.getOrPut(styleKey) {
            val iconResource = categoryIconResources[marker.category]
            val color = parseColor(marker.colorHex)
                ?: (if (iconResource != null) defaultPinColor else null)
            if (color == null) {
                BitmapDescriptorFactory.fromBitmap(createSavedPlaceMarker(marker.selected)) to 1.0f
            } else {
                val pin = createColoredPlaceMarker(
                    color,
                    marker.selected,
                    iconResource?.let { ContextCompat.getDrawable(context, it) },
                )
                // 이름을 보여 줄 핀은 핀 이미지 아래에 이름을 직접 그립니다(placeIdsShowingName 참고).
                val name = marker.name.takeIf { marker.id in placeNameShownIds }
                val (bitmap, anchorY) = name?.let { addPlaceName(it, pin) } ?: (pin to 0.5f)
                BitmapDescriptorFactory.fromBitmap(bitmap) to anchorY
            }
        }

    // 원 핀 아래에 흰 외곽선이 있는 장소 이름을 붙인 비트맵과, 원 중심을 가리키는 세로 기준점을 돌려줍니다.
    private fun addPlaceName(name: String, marker: Bitmap): Pair<Bitmap, Float> {
        val text = name.trim()
        if (text.isEmpty()) return marker to 0.5f

        val density = markerDensity
        val halo = PLACE_NAME_HALO_DP * resources.displayMetrics.density
        val fill = placeNamePaint()
        val outline = Paint(fill).apply {
            style = Paint.Style.STROKE
            strokeWidth = halo * 2
            strokeJoin = Paint.Join.ROUND
            color = Color.WHITE
        }
        val label = fittedPlaceName(text, fill)
        val textWidth = fill.measureText(label)
        val metrics = fill.fontMetrics
        val textHeight = metrics.descent - metrics.ascent
        // 마커 비트맵에는 그림자 여백(3dp)이 있으므로 원 바로 아래에서 1dp 띄웁니다.
        val textTop = marker.height - 2 * density
        val width = maxOf(marker.width.toFloat(), textWidth + halo * 2).roundToInt()
        val height = (textTop + textHeight + halo).roundToInt()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawBitmap(marker, (width - marker.width) / 2f, 0f, null)
        val baseline = textTop - metrics.ascent
        canvas.drawText(label, width / 2f, baseline, outline)
        canvas.drawText(label, width / 2f, baseline, fill)
        return bitmap to (marker.height / 2f) / height
    }

    // 흰 테두리와 옅은 그림자가 있는 색 원 핀입니다. 기준점은 원 중심입니다.
    // 카테고리 아이콘(흰색)이 있으면 원 안에 비율 그대로 얹고, 없으면 흰 점을 찍습니다.
    private fun createColoredPlaceMarker(color: Int, selected: Boolean, icon: Drawable?): Bitmap {
        val density = markerDensity
        val diameter = placeMarkerDiameter(selected)
        val border = 2 * density
        val shadowBlur = 2 * density
        val padding = shadowBlur + density
        val size = (diameter + padding * 2).roundToInt()
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val center = size / 2f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

        paint.color = Color.WHITE
        paint.setShadowLayer(shadowBlur, 0f, 0.5f * density, Color.argb(64, 0, 0, 0))
        canvas.drawCircle(center, center, diameter / 2, paint)
        paint.clearShadowLayer()

        val radius = diameter / 2 - border
        paint.color = color
        canvas.drawCircle(center, center, radius, paint)

        paint.color = Color.WHITE
        if (icon == null || icon.intrinsicWidth <= 0 || icon.intrinsicHeight <= 0) {
            canvas.drawCircle(center, center, radius * 0.42f, paint)
            return bitmap
        }
        val box = radius * 1.25f
        val scale = box / maxOf(icon.intrinsicWidth, icon.intrinsicHeight)
        val iconWidth = icon.intrinsicWidth * scale
        val iconHeight = icon.intrinsicHeight * scale
        icon.setBounds(
            (center - iconWidth / 2).roundToInt(),
            (center - iconHeight / 2).roundToInt(),
            (center + iconWidth / 2).roundToInt(),
            (center + iconHeight / 2).roundToInt(),
        )
        icon.draw(canvas)
        return bitmap
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
                refreshPlaceNames()
            }
        }
    }

    private fun emitVisibleBounds() {
        val map = googleMap ?: return
        if (id == NO_ID || width <= 0 || height <= 0) return

        // The list should include every pin visible on the map, including
        // pins covered by a partially expanded bottom sheet. Keep map padding
        // for camera positioning, but calculate list bounds from the full map
        // viewport.
        val projection = map.projection
        val corners = listOf(
            Point(0, 0),
            Point(width, 0),
            Point(0, height),
            Point(width, height),
        ).map(projection::fromScreenLocation)

        // 여백이 있으면 Google 카메라 중심(target)은 여백을 뺀 영역의 가운데입니다.
        val cameraPosition = map.cameraPosition
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            id,
            "onCameraChanged",
            Arguments.createMap().apply {
                putDouble("latitude", cameraPosition.target.latitude)
                putDouble("longitude", cameraPosition.target.longitude)
                putInt("zoomLevel", cameraPosition.zoom.roundToInt())
                putDouble("southLatitude", corners.minOf { it.latitude })
                putDouble("northLatitude", corners.maxOf { it.latitude })
                putDouble("westLongitude", corners.minOf { it.longitude })
                putDouble("eastLongitude", corners.maxOf { it.longitude })
            },
        )
    }

    private fun startCurrentLocationIfNeeded() {
        if (isDisposed || !showsCurrentLocation || !isAttachedToWindow || googleMap == null) {
            return
        }

        if (hasLocationPermission()) {
            startLocationUpdates()
        }
    }

    private fun hasLocationPermission(): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

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
                Log.w("YeogidamGoogleMap", "사용 가능한 위치 제공자가 없습니다.")
            }
        } catch (error: SecurityException) {
            Log.e("YeogidamGoogleMap", "위치 정보를 읽을 권한이 없습니다.", error)
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
        val map = googleMap ?: return
        lastKnownLocation = location

        val position = LatLng(location.latitude, location.longitude)
        val marker = currentLocationMarker

        if (marker == null) {
            currentLocationMarker =
                map.addMarker(
                    MarkerOptions()
                        .position(position)
                        .icon(BitmapDescriptorFactory.fromBitmap(createCurrentLocationMarker()))
                        .anchor(0.5f, 0.5f)
                        .zIndex(CURRENT_LOCATION_Z_INDEX),
                )
        } else {
            marker.position = position
        }

        if (pendingCurrentLocationCameraMove) {
            centerMapOnCurrentLocation()
        }

        // Keep the initial camera on the saved-place area. The camera moves to
        // the user's location only after the current-location button is tapped.
    }

    private fun centerMapOnCurrentLocation() {
        pendingCurrentLocationCameraMove = true
        val map = googleMap
        val location = lastKnownLocation

        if (map == null || location == null) {
            startCurrentLocationIfNeeded()
            return
        }

        pendingCurrentLocationCameraMove = false
        removeCallbacks(moveToDefaultPosition)
        post {
            if (!isAttachedToWindow || googleMap !== map) {
                return@post
            }

            map.moveCamera(
                CameraUpdateFactory.newLatLngZoom(
                    LatLng(location.latitude, location.longitude),
                    zoomLevel.toFloat(),
                ),
            )
        }
    }

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
            !isDisposed &&
            isAttachedToWindow &&
            isMapStarted &&
            // ThemedReactContext forwards listeners but keeps its own initial
            // lifecycle state. Read the actual host state from the app context.
            applicationReactContext.lifecycleState == LifecycleState.RESUMED
        ) {
            nativeMapView?.onResume()
        }
    }

    private fun createCurrentLocationMarker(): Bitmap {
        val density = markerDensity
        val size = (CURRENT_LOCATION_MARKER_SIZE_DP * density).roundToInt()
        val center = size / 2f
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        paint.shader = RadialGradient(
            center,
            center,
            center,
            intArrayOf(
                Color.argb(87, 92, 117, 255),
                Color.argb(77, 92, 117, 255),
                Color.argb(51, 92, 117, 255),
                Color.argb(20, 92, 117, 255),
                Color.TRANSPARENT,
            ),
            floatArrayOf(0f, 0.35f, 0.6f, 0.82f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(center, center, center, paint)

        paint.shader = null
        paint.color = Color.WHITE
        canvas.drawCircle(center, center, 6.6f * density, paint)

        paint.color = Color.rgb(92, 117, 255)
        canvas.drawCircle(center, center, 5 * density, paint)

        return bitmap
    }

    private fun createSavedPlaceMarker(selected: Boolean): Bitmap {
        val density = markerDensity
        val markerSizeDp =
            if (selected) SAVED_PLACE_SELECTED_MARKER_SIZE_DP
            else SAVED_PLACE_MARKER_SIZE_DP
        val size = (markerSizeDp * density).roundToInt()
        val resourceId = if (selected) R.drawable.map_marker_selected else R.drawable.map_marker
        BitmapFactory.decodeResource(resources, resourceId)?.let { markerBitmap ->
            return Bitmap.createScaledBitmap(markerBitmap, size, size, true)
        }

        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val center = size / 2f
        val radius = size * 0.36f

        paint.color = Color.WHITE
        canvas.drawCircle(center, center, radius + density * 2, paint)
        paint.color = Color.rgb(122, 199, 223)
        canvas.drawCircle(center, center, radius, paint)
        paint.color = Color.WHITE
        canvas.drawCircle(center, center, radius * 0.38f, paint)
        return bitmap
    }

    override fun onHostResume() {
        resumeMapIfNeeded()
        startCurrentLocationIfNeeded()
    }

    override fun onHostPause() {
        stopLocationUpdates()

        if (!isDisposed && isMapStarted) {
            nativeMapView?.onPause()
        }
    }

    override fun onHostDestroy() {
        dispose()
    }

    fun dispose() {
        if (isDisposed) return
        isDisposed = true
        stopLocationUpdates()
        removeCallbacks(moveToDefaultPosition)
        removeCallbacks(fitSearchResultPoints)
        reactContext.removeLifecycleEventListener(this)
        if (isMapStarted) {
            nativeMapView?.onPause()
            nativeMapView?.onStop()
            isMapStarted = false
        }
        nativeMapView?.onDestroy()
        googleMap = null
        currentLocationMarker = null
    }

    override fun onDetachedFromWindow() {
        stopLocationUpdates()
        removeCallbacks(moveToDefaultPosition)
        removeCallbacks(fitSearchResultPoints)

        if (!isDisposed && isMapStarted) {
            nativeMapView?.onPause()
            nativeMapView?.onStop()
            isMapStarted = false
        }

        super.onDetachedFromWindow()
    }

    private companion object {
        const val MARKER_SCALE = 1.5f
        const val LOGO_LOWERING_DP = 4
        const val CURRENT_LOCATION_MARKER_SIZE_DP = 44
        const val SAVED_PLACE_MARKER_SIZE_DP = 26
        const val SAVED_PLACE_SELECTED_MARKER_SIZE_DP = 32
        const val SEARCH_RESULT_CAMERA_PADDING_DP = 48
        const val SEARCH_RESULT_MAX_ZOOM_LEVEL = 16f
        // 이 줌부터 선택되지 않은 핀에도 장소 이름을 보여 줍니다.
        const val PLACE_NAME_MIN_ZOOM_LEVEL = 13f
        // 장소 이름은 지도의 동·역 이름보다 크고 진하게, 두꺼운 흰 테두리로 그려 지도 위에서 잘 읽히게 합니다.
        const val PLACE_NAME_TEXT_SIZE_DP = 13f
        const val PLACE_NAME_HALO_DP = 1.5f
        const val PLACE_NAME_MAX_WIDTH_DP = 120f
        const val LOCATION_UPDATE_INTERVAL_MS = 2_000L
        const val LOCATION_UPDATE_DISTANCE_METERS = 3f
        // 지하철역 마커(-1)보다 위, 선택된 핀은 다른 핀 위, 현재 위치 마커는 맨 위에 그립니다.
        const val PLACE_Z_INDEX = 1f
        const val SELECTED_PLACE_Z_INDEX = 1_000_000f
        const val CURRENT_LOCATION_Z_INDEX = 2_000_000f
    }
}
