package com.yeogidamm.app.share

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ShareIntentModule.NAME)
class ShareIntentModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        ShareIntentCoordinator.setModule(this)
    }

    override fun getName(): String = NAME

    override fun getConstants(): Map<String, Any> =
        ShareAnalyticsStore.installationId(reactApplicationContext)
            ?.let { mapOf("installationId" to it) }
            ?: emptyMap()

    @ReactMethod
    fun getPendingShare(promise: Promise) {
        promise.resolve(ShareIntentCoordinator.getPendingShare()?.toWritableMap())
    }

    @ReactMethod
    fun clearPendingShare(shareId: String?, promise: Promise) {
        ShareIntentCoordinator.clearPendingShare(shareId)
        promise.resolve(null)
    }

    @ReactMethod
    fun setShareSession(session: ReadableMap?, promise: Promise) {
        val parsed = session?.let {
            ShareSession(
                accessToken = it.getString("accessToken").orEmpty(),
                refreshToken = it.getString("refreshToken").orEmpty(),
                expiresAt = it.getDouble("expiresAt").toLong(),
                userId = it.getString("userId").orEmpty(),
            )
        }
        if (ShareAuthStore.save(reactApplicationContext, parsed)) promise.resolve(null)
        else promise.reject("SHARE_AUTH_STORE", "공유 세션을 저장하지 못했습니다.")
    }

    @ReactMethod
    fun getShareSession(promise: Promise) {
        val session = ShareAuthStore.load(reactApplicationContext)
        if (session == null) {
            promise.resolve(null)
            return
        }
        promise.resolve(Arguments.createMap().apply {
            putString("accessToken", session.accessToken)
            putString("refreshToken", session.refreshToken)
            putDouble("expiresAt", session.expiresAt.toDouble())
            putString("userId", session.userId)
        })
    }

    @ReactMethod
    fun resumeWaitingShares(promise: Promise) {
        Thread {
            val session = ShareAuthStore.load(reactApplicationContext)
            if (session != null) {
                ShareResultStore.loadResults(reactApplicationContext)
                    .filter { it.transferStatus in setOf("SAVED", "LOGIN_REQUIRED", "WAITING_FOR_AUTH", "WAITING_FOR_NETWORK") }
                    .forEach { result ->
                        runCatching {
                            ShareSaveWorker.enqueue(
                                reactApplicationContext,
                                result.requestId,
                                result.url,
                                result.rawSharedText.orEmpty(),
                            )
                        }
                    }
            }
            promise.resolve(null)
        }.start()
    }

    @ReactMethod
    fun getShareResult(promise: Promise) {
        promise.resolve(
            ShareResultStore.loadResults(reactApplicationContext).firstOrNull()?.toWritableMap(),
        )
    }

    @ReactMethod
    fun getShareResults(promise: Promise) {
        val results = Arguments.createArray()
        ShareResultStore.loadResults(reactApplicationContext).forEach {
            results.pushMap(it.toWritableMap())
        }
        promise.resolve(results)
    }

    @ReactMethod
    fun clearShareResult(requestId: String?, promise: Promise) {
        ShareResultStore.clearResult(reactApplicationContext, requestId)
        promise.resolve(null)
    }

    @ReactMethod
    fun getPendingShareAnalyticsEvents(promise: Promise) {
        val events = Arguments.createArray()
        ShareAnalyticsStore.pending(reactApplicationContext).forEach { event ->
            val properties = Arguments.createMap()
            val source = event.optJSONObject("properties")
            source?.keys()?.forEach { key ->
                when (val value = source.get(key)) {
                    is String -> properties.putString(key, value)
                    is Int -> properties.putInt(key, value)
                    is Boolean -> properties.putBoolean(key, value)
                }
            }
            events.pushMap(Arguments.createMap().apply {
                putString("id", event.getString("id"))
                putString("uuid", event.optString("uuid"))
                putString("name", event.getString("name"))
                putString("share_id", event.getString("share_id"))
                putString("distinct_id", event.optString("distinct_id"))
                putDouble("occurred_at", event.getDouble("occurred_at"))
                putMap("properties", properties)
            })
        }
        promise.resolve(events)
    }

    @ReactMethod
    fun setPostHogConfiguration(projectToken: String, host: String, promise: Promise) {
        if (ShareAnalyticsStore.setConfiguration(reactApplicationContext, projectToken, host)) {
            promise.resolve(null)
        } else {
            promise.reject("SHARE_ANALYTICS_STORE", "PostHog 설정을 저장하지 못했습니다.")
        }
    }

    @ReactMethod
    fun acknowledgeShareAnalyticsEvent(id: String, promise: Promise) {
        ShareAnalyticsStore.acknowledge(reactApplicationContext, id)
        promise.resolve(null)
    }

    @ReactMethod
    fun addListener(eventName: String?) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    internal fun emitShareIntent(payload: ShareIntentPayload) {
        if (!reactApplicationContext.hasActiveReactInstance()) {
            return
        }

        reactApplicationContext.emitDeviceEvent(EVENT_SHARE_INTENT_RECEIVED, payload.toWritableMap())
    }

    override fun invalidate() {
        ShareIntentCoordinator.setModule(null)
        super.invalidate()
    }

    companion object {
        const val NAME = "ShareIntentModule"
        const val EVENT_SHARE_INTENT_RECEIVED = "shareIntentReceived"
    }
}
