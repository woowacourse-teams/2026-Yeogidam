package com.yeogidam.app.map

import android.content.Context
import android.util.Log
import android.widget.FrameLayout
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import com.kakao.vectormap.KakaoMap
import com.kakao.vectormap.KakaoMapReadyCallback
import com.kakao.vectormap.LatLng
import com.kakao.vectormap.MapLifeCycleCallback
import com.kakao.vectormap.MapView
import com.kakao.vectormap.camera.CameraUpdateFactory

class KakaoMapView(
    context: Context,
) : FrameLayout(context), LifecycleEventListener {

    private val nativeMapView = MapView(context)
    private var kakaoMap: KakaoMap? = null

    private var latitude = 37.5445
    private var longitude = 127.0557
    private var zoomLevel = 15

    init {
        addView(
            nativeMapView,
            LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT,
            ),
        )

        (context as ReactContext).addLifecycleEventListener(this)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()

        if (!nativeMapView.isStarted) {
            startMap()
        }
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

    private fun moveCamera() {
        val map = kakaoMap ?: return

        val update = CameraUpdateFactory.newCenterPosition(
            LatLng.from(latitude, longitude),
            zoomLevel,
        )

        map.moveCamera(update)
    }

    override fun onHostResume() {
        if (nativeMapView.isStarted) {
            nativeMapView.resume()
        }
    }

    override fun onHostPause() {
        if (nativeMapView.isStarted) {
            nativeMapView.pause()
        }
    }

    override fun onHostDestroy() {
        nativeMapView.finish()
        (context as ReactContext).removeLifecycleEventListener(this)
    }
}
