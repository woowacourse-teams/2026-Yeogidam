package com.yeogidamm.app.map

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import android.util.Log
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.common.LifecycleState
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.kakao.vectormap.KakaoMap
import com.kakao.vectormap.KakaoMapReadyCallback
import com.kakao.vectormap.LatLng
import com.kakao.vectormap.MapLifeCycleCallback
import com.kakao.vectormap.MapView
import com.kakao.vectormap.PoiCategory
import com.kakao.vectormap.camera.CameraUpdateFactory
import com.kakao.vectormap.label.Label
import com.kakao.vectormap.label.LabelOptions
import com.kakao.vectormap.label.LabelStyle
import com.kakao.vectormap.label.LabelStyles
import com.kakao.vectormap.label.LabelTransition
import com.kakao.vectormap.label.Transition
import com.yeogidamm.app.R
import org.json.JSONArray
import kotlin.math.roundToInt

class KakaoMapView(
    context: ThemedReactContext,
) : FrameLayout(context), LifecycleEventListener {

    private val nativeMapView = MapView(context)
    private val reactContext = context
    private val applicationReactContext = context.reactApplicationContext
    private var isDisposed = false
    private val locationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var kakaoMap: KakaoMap? = null
    private var currentLocationLabel: Label? = null
    private var savedPlacesJson = "[]"
    private val savedPlaceStyleKeyById = mutableMapOf<String, String>()
    private val coloredPlaceStyles = mutableMapOf<String, LabelStyles>()
    private var savedPlaceMarkers = listOf<SavedPlaceMarker>()
    private var placeNameShownIds = setOf<String>()
    private val placeNameTextSizes = mutableMapOf<String, Pair<Float, Float>>()
    private var lastKnownLocation: Location? = null

    private val savedPlaceStyles: Map<Boolean, LabelStyles> by lazy {
        mapOf(
            false to createSavedPlaceStyles(selected = false),
            true to createSavedPlaceStyles(selected = true),
        )
    }

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

    private val fitSearchResultPoints = Runnable {
        val map = kakaoMap ?: return@Runnable

        if (!isAttachedToWindow) {
            return@Runnable
        }

        try {
            val points = JSONArray(cameraFitPointsJson).let { places ->
                (0 until places.length()).mapNotNull { index ->
                    places.optJSONObject(index)?.let { place ->
                        if (place.has("latitude") && place.has("longitude")) {
                            LatLng.from(
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

            map.moveCamera(
                CameraUpdateFactory.fitMapPoints(
                    points.toTypedArray(),
                    SEARCH_RESULT_CAMERA_PADDING,
                    SEARCH_RESULT_MAX_ZOOM_LEVEL,
                ),
            )
        } catch (error: Exception) {
            Log.e("YeogidamKakaoMap", "검색 결과 범위에 카메라를 맞추지 못했습니다.", error)
        }
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
        if (isDisposed) return

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
                    if (isDisposed) return
                    // SDK 2.14.1 ignores this setting before the renderer is
                    // initialized. Retain the engine during Fabric reorders
                    // and finish it explicitly when this view is dropped.
                    nativeMapView.setFinishManually(true)
                    kakaoMap = map
                    // 기본 지도의 가게 정보만 숨깁니다. 지하철역·지명·도로 같은 길 찾기 정보는 남깁니다.
                    listOf(
                        PoiCategory.PLACE,
                        PoiCategory.BRAND,
                        PoiCategory.FACILITIES,
                        PoiCategory.INDOOR_PLACE,
                        PoiCategory.DETAIL_CATEGORY,
                    ).forEach { map.setVisiblePoiCategory(it, false) }
                    map.setPoiClickable(false)
                    applyCameraPadding()
                    map.setOnLabelClickListener { _, _, label ->
                        val placeId = label.tag as? String ?: return@setOnLabelClickListener false
                        val cameraPosition = map.cameraPosition ?: return@setOnLabelClickListener false
                        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
                            id,
                            "onMarkerPressed",
                            Arguments.createMap().apply {
                                putString("id", placeId)
                                putDouble("latitude", cameraPosition.position.latitude)
                                putDouble("longitude", cameraPosition.position.longitude)
                                putInt("zoomLevel", cameraPosition.zoomLevel)
                                putDouble(
                                    "cameraBottomInset",
                                    cameraBottomInset.coerceAtMost((height - 1).coerceAtLeast(0)) /
                                        resources.displayMetrics.density.toDouble(),
                                )
                            },
                        )
                        true
                    }
                    map.setOnCameraMoveEndListener { _, position, _ ->
                        emitVisibleBounds(position.position, position.zoomLevel)
                        refreshPlaceNames()
                    }
                    map.setOnCameraMoveStartListener { _, gestureType ->
                        if (
                            gestureType == com.kakao.vectormap.GestureType.Pan ||
                            gestureType == com.kakao.vectormap.GestureType.LongTapAndDrag ||
                            gestureType == com.kakao.vectormap.GestureType.Zoom ||
                            gestureType == com.kakao.vectormap.GestureType.OneFingerZoom ||
                            gestureType == com.kakao.vectormap.GestureType.RotateZoom ||
                            gestureType == com.kakao.vectormap.GestureType.OneFingerDoubleTap ||
                            gestureType == com.kakao.vectormap.GestureType.TwoFingerSingleTap
                        ) {
                            reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(
                                id,
                                "onMapPanStarted",
                                Arguments.createMap().apply { putBoolean("started", true) },
                            )
                        }
                    }
                    renderSavedPlaceMarkers()
                    if (cameraFitRequestId > 0) {
                        moveCameraToFitSearchResults()
                    }
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

    private fun moveCameraToFitSearchResults() {
        removeCallbacks(fitSearchResultPoints)
        post(fitSearchResultPoints)
    }

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
            Log.e("YeogidamKakaoMap", "저장 장소 핀을 표시하지 못했습니다.", error)
        }
    }

    // 카메라가 멈출 때 이름을 보여 줄 핀이 달라졌으면 핀 스타일을 다시 적용합니다.
    private fun refreshPlaceNames() {
        val map = kakaoMap ?: return
        if (placeIdsShowingName(map) != placeNameShownIds) {
            applySavedPlaceMarkers()
        }
    }

    private fun applySavedPlaceMarkers() {
        val map = kakaoMap ?: return
        val layer = map.labelManager?.layer ?: return

        // 이름은 겹치지 않는 핀에만 붙입니다.
        placeNameShownIds = placeIdsShowingName(map)
        val nextStyleKeyById = savedPlaceMarkers.associate { it.id to placeStyleKey(it) }

        (savedPlaceStyleKeyById.keys - nextStyleKeyById.keys).forEach { removedId ->
            layer.getLabel(removedId)?.remove()
        }

        savedPlaceMarkers.forEach { marker ->
            val position = LatLng.from(marker.latitude, marker.longitude)
            val styleKey = nextStyleKeyById.getValue(marker.id)
            val style = placeStyles(
                marker.selected,
                marker.colorHex,
                marker.category,
                marker.name.takeIf { marker.id in placeNameShownIds },
            )
            val label = layer.getLabel(marker.id)
            val rank = if (marker.selected) Int.MAX_VALUE.toLong() - 1 else 1L

            if (label == null) {
                layer.addLabel(
                    LabelOptions
                        .from(marker.id, position)
                        .setRank(rank)
                        .setStyles(style),
                ).apply {
                    tag = marker.id
                    isClickable = true
                }
            } else {
                label.moveTo(position)
                label.rank = rank
                label.tag = marker.id
                label.isClickable = true

                if (savedPlaceStyleKeyById[marker.id] != styleKey) {
                    label.changeStyles(style, false)
                }
            }
        }

        savedPlaceStyleKeyById.clear()
        savedPlaceStyleKeyById.putAll(nextStyleKeyById)
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
    private fun placeIdsShowingName(map: KakaoMap): Set<String> {
        val shown = savedPlaceMarkers.filter { it.selected && it.name.isNotEmpty() }.map { it.id }.toMutableSet()
        if (width <= 0 || height <= 0) return shown

        val margin = 40 * resources.displayMetrics.density
        val viewBounds = android.graphics.RectF(-margin, -margin, width + margin, height + margin)
        val onScreen = savedPlaceMarkers
            .mapNotNull { marker ->
                val point = map.toScreenPoint(LatLng.from(marker.latitude, marker.longitude))
                    ?: return@mapNotNull null
                marker to android.graphics.PointF(point.x.toFloat(), point.y.toFloat())
            }
            .filter { (_, center) -> viewBounds.contains(center.x, center.y) }
        fun pinRect(marker: SavedPlaceMarker, center: android.graphics.PointF): android.graphics.RectF {
            val radius = placeMarkerDiameter(marker.selected) / 2
            return android.graphics.RectF(center.x - radius, center.y - radius, center.x + radius, center.y + radius)
        }

        val takenNameRects = mutableListOf<android.graphics.RectF>()
        val candidates = onScreen.sortedByDescending { (marker, _) -> marker.selected }
        for ((marker, center) in candidates) {
            if (marker.name.isEmpty()) continue
            val nameRect = placeNameRect(marker, center)
            if (marker.selected) {
                takenNameRects += nameRect
                continue
            }
            if (map.zoomLevel < PLACE_NAME_MIN_ZOOM_LEVEL) continue
            val hitsPin = onScreen.any { (other, otherCenter) ->
                other.id != marker.id && android.graphics.RectF.intersects(pinRect(other, otherCenter), nameRect)
            }
            val hitsName = takenNameRects.any { android.graphics.RectF.intersects(it, nameRect) }
            if (!hitsPin && !hitsName) {
                shown += marker.id
                takenNameRects += nameRect
            }
        }
        return shown
    }

    // addPlaceName이 그리는 이름 영역을 원 중심 기준 화면 좌표로 돌려줍니다.
    private fun placeNameRect(marker: SavedPlaceMarker, center: android.graphics.PointF): android.graphics.RectF {
        val (textWidth, textHeight) = placeNameTextSizes.getOrPut(marker.name) {
            val paint = placeNamePaint()
            val metrics = paint.fontMetrics
            fittedPlaceName(marker.name, paint).let(paint::measureText) to (metrics.descent - metrics.ascent)
        }
        val density = resources.displayMetrics.density
        val halo = PLACE_NAME_HALO_DP * density
        val top = center.y + placeMarkerDiameter(marker.selected) / 2 + density
        val halfWidth = textWidth / 2 + halo
        return android.graphics.RectF(center.x - halfWidth, top, center.x + halfWidth, top + textHeight + halo)
    }

    private fun placeMarkerDiameter(selected: Boolean): Float =
        (if (selected) 26 else 20) * resources.displayMetrics.density

    private fun placeNamePaint(): Paint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = PLACE_NAME_TEXT_SIZE_DP * resources.displayMetrics.density
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
            color = Color.rgb(33, 33, 38)
            textAlign = Paint.Align.CENTER
        }

    private fun fittedPlaceName(name: String, paint: Paint): String =
        android.text.TextUtils
            .ellipsize(
                name,
                android.text.TextPaint(paint),
                PLACE_NAME_MAX_WIDTH_DP * resources.displayMetrics.density,
                android.text.TextUtils.TruncateAt.END,
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

    // 폴더 색이나 카테고리 아이콘이 있는 핀은 조합별 스타일을 한 번만 만들어 재사용합니다.
    private fun placeStyles(selected: Boolean, colorHex: String?, category: String?, name: String?): LabelStyles {
        val iconResource = categoryIconResources[category]
        val color = parseColor(colorHex)
            ?: (if (iconResource != null) defaultPinColor else null)
            ?: return savedPlaceStyles.getValue(selected)
        return coloredPlaceStyles.getOrPut(placeStyleKey(selected, colorHex, category, name)) {
            val marker = createColoredPlaceMarker(
                color,
                selected,
                iconResource?.let { ContextCompat.getDrawable(context, it) },
            )
            // 이름을 보여 줄 핀은 핀 이미지 아래에 이름을 직접 그립니다(placeIdsShowingName 참고).
            // 레벨 구성 개수가 다른 스타일로 바꾸면 SDK가 죽으므로, 모든 핀 스타일은 레벨 하나만 씁니다.
            val (bitmap, anchorY) = name?.let { addPlaceName(it, marker) } ?: (marker to 0.5f)
            LabelStyles.from(
                LabelStyle
                    .from(bitmap)
                    .setAnchorPoint(0.5f, anchorY)
                    .setIconTransition(
                        LabelTransition
                            .from(Transition.Scale, Transition.Scale)
                            .enableTransitionWhenChange(true, true),
                    ),
            )
        }
    }

    // 원 핀 아래에 흰 외곽선이 있는 장소 이름을 붙인 비트맵과, 원 중심을 가리키는 세로 기준점을 돌려줍니다.
    private fun addPlaceName(name: String, marker: Bitmap): Pair<Bitmap, Float> {
        val text = name.trim()
        if (text.isEmpty()) return marker to 0.5f

        val density = resources.displayMetrics.density
        val halo = PLACE_NAME_HALO_DP * density
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
        val density = resources.displayMetrics.density
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

    private fun createSavedPlaceStyles(selected: Boolean): LabelStyles =
        LabelStyles.from(
            LabelStyle
                .from(createSavedPlaceMarker(selected))
                .setAnchorPoint(0.5f, 1.0f)
                .setIconTransition(
                    LabelTransition
                        .from(Transition.Scale, Transition.Scale)
                        .enableTransitionWhenChange(true, true),
                ),
        )

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

    private fun emitVisibleBounds(
        center: LatLng? = kakaoMap?.cameraPosition?.position,
        currentZoomLevel: Int = kakaoMap?.zoomLevel ?: zoomLevel,
    ) {
        val map = kakaoMap ?: return
        if (id == NO_ID || width <= 0 || height <= 0 || center == null) return

        // The list should include every pin visible on the map, including
        // pins covered by a partially expanded bottom sheet. Keep map padding
        // for camera positioning, but calculate list bounds from the full map
        // viewport.
        val visibleBottom = height.coerceAtLeast(1)

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
        if (isDisposed || !showsCurrentLocation || !isAttachedToWindow || kakaoMap == null) {
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
                        .setRank(Int.MAX_VALUE.toLong())
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
        removeCallbacks(moveToDefaultPosition)
        post {
            if (!isAttachedToWindow || kakaoMap !== map) {
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
            !isDisposed &&
            isAttachedToWindow &&
            nativeMapView.isStarted &&
            // ThemedReactContext forwards listeners but keeps its own initial
            // lifecycle state. Read the actual host state from the app context.
            applicationReactContext.lifecycleState == LifecycleState.RESUMED
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
        val density = resources.displayMetrics.density
        val markerSizeDp =
            if (selected) SAVED_PLACE_SELECTED_MARKER_SIZE_DP
            else SAVED_PLACE_MARKER_SIZE_DP
        val size = (markerSizeDp * density).roundToInt()
        val resourceId = if (selected) R.drawable.map_marker_selected else R.drawable.map_marker
        BitmapFactory.decodeResource(resources, resourceId)?.let { markerBitmap ->
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

        if (!isDisposed && nativeMapView.isStarted) {
            nativeMapView.pause()
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
        nativeMapView.finish()
        kakaoMap = null
        currentLocationLabel = null
    }

    override fun onDetachedFromWindow() {
        stopLocationUpdates()
        removeCallbacks(moveToDefaultPosition)
        removeCallbacks(fitSearchResultPoints)

        if (!isDisposed && nativeMapView.isStarted) {
            nativeMapView.pause()
        }

        super.onDetachedFromWindow()
    }

    private companion object {
        const val CURRENT_LOCATION_LABEL_ID = "yeogidam-current-location"
        const val CURRENT_LOCATION_MARKER_SIZE_DP = 44
        const val SAVED_PLACE_MARKER_SIZE_DP = 26
        const val SAVED_PLACE_SELECTED_MARKER_SIZE_DP = 32
        const val SEARCH_RESULT_CAMERA_PADDING = 48
        const val SEARCH_RESULT_MAX_ZOOM_LEVEL = 16
        // 이 줌 레벨부터 선택되지 않은 핀에도 장소 이름을 보여 줍니다.
        const val PLACE_NAME_MIN_ZOOM_LEVEL = 13
        const val PLACE_NAME_TEXT_SIZE_DP = 10f
        const val PLACE_NAME_HALO_DP = 1f
        const val PLACE_NAME_MAX_WIDTH_DP = 120f
        const val LOCATION_UPDATE_INTERVAL_MS = 2_000L
        const val LOCATION_UPDATE_DISTANCE_METERS = 3f
        const val KAKAO_MAP_MIN_LATITUDE = 32.0
        const val KAKAO_MAP_MAX_LATITUDE = 39.5
        const val KAKAO_MAP_MIN_LONGITUDE = 123.0
        const val KAKAO_MAP_MAX_LONGITUDE = 132.0
    }
}
