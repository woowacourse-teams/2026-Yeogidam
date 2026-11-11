package com.yeogidamm.app.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.graphics.RectF
import android.graphics.Typeface
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import org.json.JSONArray
import kotlin.math.ceil
import kotlin.math.max

// Google 기본 역 아이콘은 모양을 바꿀 수 없어 숨기고, 줌이 minZoom 이상일 때
// 화면 안의 역만 직접 그린 마커로 보여 줍니다. 역 이름은 nameMinZoom부터 붙입니다.
class SubwayStationLayer(
    private val density: Float,
) {
    private data class Station(
        val name: String,
        val position: LatLng,
        val colors: List<Int>,
    )

    private class StationIcon(
        val descriptor: BitmapDescriptor,
        val width: Int,
        val height: Int,
        val anchorY: Float,
    ) {
        fun frame(point: Point): RectF {
            val top = point.y - height * anchorY
            return RectF(point.x - width / 2f, top, point.x + width / 2f, top + height)
        }
    }

    var minZoom = 12f
    var nameMinZoom = 14f
    private var stations = listOf<Station>()
    private val markers = mutableMapOf<Int, Marker>()
    private val icons = mutableMapOf<Int, Pair<StationIcon, StationIcon>>()
    private val shownIcons = mutableMapOf<Int, StationIcon>()

    fun setStations(json: String) {
        markers.values.forEach { it.remove() }
        markers.clear()
        icons.clear()
        shownIcons.clear()

        val items = runCatching { JSONArray(json) }.getOrNull() ?: JSONArray()
        stations = (0 until items.length()).mapNotNull { index ->
            val item = items.optJSONObject(index) ?: return@mapNotNull null
            val colors = item.optJSONArray("colors") ?: return@mapNotNull null
            if (!item.has("latitude") || !item.has("longitude")) return@mapNotNull null

            Station(
                name = item.optString("name"),
                position = LatLng(item.getDouble("latitude"), item.getDouble("longitude")),
                colors = (0 until colors.length()).mapNotNull {
                    runCatching { Color.parseColor(colors.getString(it)) }.getOrNull()
                },
            )
        }
    }

    fun refresh(map: GoogleMap) {
        val isVisibleZoom = map.cameraPosition.zoom >= minZoom
        val isNameZoom = map.cameraPosition.zoom >= nameMinZoom
        val bounds = map.projection.visibleRegion.latLngBounds
        val visibleIndexes = mutableListOf<Int>()

        stations.forEachIndexed { index, station ->
            if (isVisibleZoom && bounds.contains(station.position)) {
                visibleIndexes.add(index)
            } else {
                markers[index]?.isVisible = false
            }
        }

        // 역이 몰린 곳에서는 환승 노선이 많은 역부터 이름을 두고, 이미 놓인 이름과 겹치는 역은
        // 동그라미만 보여 줍니다. 순서가 같으면 인덱스로 고정해 지도를 움직일 때 깜빡이지 않게 합니다.
        visibleIndexes.sortWith(compareByDescending<Int> { stations[it].colors.size }.thenBy { it })

        val occupiedFrames = mutableListOf<RectF>()
        visibleIndexes.forEach { index ->
            val station = stations[index]
            val (named, badgeOnly) = icons.getOrPut(index) {
                makeIcon(station, showsName = true) to makeIcon(station, showsName = false)
            }
            val point = map.projection.toScreenLocation(station.position)
            val namedFrame = named.frame(point)
            val showsName = isNameZoom && occupiedFrames.none { RectF.intersects(it, namedFrame) }
            val icon = if (showsName) named else badgeOnly
            occupiedFrames.add(icon.frame(point))

            val marker = markers[index]
                ?: addMarker(map, station, icon)?.also { markers[index] = it }
                ?: return@forEach
            if (shownIcons[index] !== icon) {
                marker.setIcon(icon.descriptor)
                marker.setAnchor(0.5f, icon.anchorY)
            }
            shownIcons[index] = icon
            marker.isVisible = true
        }
    }

    private fun addMarker(map: GoogleMap, station: Station, icon: StationIcon): Marker? =
        // 저장 장소 마커보다 아래에 깔리게 하고, 눌림은 GoogleMapView에서 MARKER_TAG로 무시합니다.
        map.addMarker(
            MarkerOptions()
                .position(station.position)
                .icon(icon.descriptor)
                .anchor(0.5f, icon.anchorY)
                .zIndex(-1f),
        )?.apply { tag = MARKER_TAG }

    // 단일 노선역은 노선 색 테두리의 흰 동그라미, 환승역은 노선 색 점을 나란히 담은
    // 알약 모양으로 그리고 그 아래에 역 이름을 둡니다. 역 좌표는 배지 가운데에 맞춥니다.
    // 역이 많이 깔려도 지도를 덮지 않도록 동그라미는 지름 7dp로 작게, 이름은 10dp로 그립니다.
    private fun makeIcon(station: Station, showsName: Boolean): StationIcon {
        val badgeHeight = 7 * density
        val dotSize = 3.5f * density
        val dotGap = 1 * density
        val isTransfer = station.colors.size > 1
        val badgeWidth =
            if (isTransfer) station.colors.size * (dotSize + dotGap) + 3 * density else badgeHeight

        val namePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 10 * density
            color = Color.rgb(34, 34, 34)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        }
        // 노선이나 도로 위에서도 읽히도록 이름 뒤에 얇은 흰 테두리를 먼저 그립니다.
        val haloPaint = Paint(namePaint).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = 2.5f * density
            strokeJoin = Paint.Join.ROUND
        }
        val nameWidth = if (showsName) namePaint.measureText(station.name) else 0f
        val metrics = namePaint.fontMetrics
        val nameTop = badgeHeight + 1.5f * density
        val width = ceil(max(badgeWidth, nameWidth) + 4 * density).toInt()
        val height =
            if (showsName) ceil(nameTop + metrics.descent - metrics.ascent + density).toInt()
            else ceil(badgeHeight).toInt()

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
        val badgeLeft = (width - badgeWidth) / 2
        val badgeCenterY = badgeHeight / 2

        if (isTransfer) {
            val inset = 0.5f * density
            val rect = RectF(badgeLeft + inset, inset, badgeLeft + badgeWidth - inset, badgeHeight - inset)
            fill.color = Color.WHITE
            canvas.drawRoundRect(rect, badgeCenterY, badgeCenterY, fill)
            stroke.color = Color.rgb(89, 89, 89)
            stroke.strokeWidth = 1 * density
            canvas.drawRoundRect(rect, badgeCenterY, badgeCenterY, stroke)

            var dotX = badgeLeft + 2 * density + dotSize / 2
            station.colors.forEach { color ->
                fill.color = color
                canvas.drawCircle(dotX, badgeCenterY, dotSize / 2, fill)
                dotX += dotSize + dotGap
            }
        } else {
            val radius = badgeHeight / 2 - 0.6f * density
            fill.color = Color.WHITE
            canvas.drawCircle(width / 2f, badgeCenterY, radius, fill)
            stroke.color = station.colors.firstOrNull() ?: Color.GRAY
            stroke.strokeWidth = 1.2f * density
            canvas.drawCircle(width / 2f, badgeCenterY, radius, stroke)
        }

        if (showsName) {
            val nameX = (width - nameWidth) / 2
            val nameBaseline = nameTop - metrics.ascent
            canvas.drawText(station.name, nameX, nameBaseline, haloPaint)
            canvas.drawText(station.name, nameX, nameBaseline, namePaint)
        }
        return StationIcon(
            descriptor = BitmapDescriptorFactory.fromBitmap(bitmap),
            width = width,
            height = height,
            anchorY = badgeCenterY / height,
        )
    }

    companion object {
        const val MARKER_TAG = "subwayStation"
    }
}
