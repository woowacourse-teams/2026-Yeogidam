package com.yeogidamm.app.share

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ShareIntentModule.NAME)
class ShareIntentModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        ShareIntentCoordinator.setModule(this)
    }

    override fun getName(): String = NAME

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
