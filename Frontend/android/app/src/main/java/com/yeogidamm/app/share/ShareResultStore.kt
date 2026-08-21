package com.yeogidamm.app.share

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject

internal data class ShareReelResult(
    val requestId: String,
    val requestSentAt: Long? = null,
    val url: String,
    val rawSharedText: String? = null,
    val status: String,
    val reelId: String? = null,
    val failureReason: String? = null,
    val retryable: Boolean,
    val updatedAt: Long = System.currentTimeMillis(),
    val reused: Boolean? = null,
) {
    fun toJson(): JSONObject =
        JSONObject().apply {
            put("requestId", requestId)
            put("requestSentAt", requestSentAt ?: JSONObject.NULL)
            put("url", url)
            put("rawSharedText", rawSharedText ?: JSONObject.NULL)
            put("status", status)
            put("reelId", reelId ?: JSONObject.NULL)
            put("failureReason", failureReason ?: JSONObject.NULL)
            put("retryable", retryable)
            put("updatedAt", updatedAt)
            put("reused", reused ?: JSONObject.NULL)
        }

    fun toWritableMap(): WritableMap =
        Arguments.createMap().apply {
            putString("requestId", requestId)
            requestSentAt?.let { putDouble("requestSentAt", it.toDouble()) }
            putString("url", url)
            rawSharedText?.let { putString("rawSharedText", it) }
            putString("status", status)
            reelId?.let { putString("reelId", it) }
            failureReason?.let { putString("failureReason", it) }
            putBoolean("retryable", retryable)
            putDouble("updatedAt", updatedAt.toDouble())
            reused?.let { putBoolean("reused", it) }
        }

    companion object {
        fun fromJson(value: String): ShareReelResult? =
            runCatching {
                val json = JSONObject(value)
                ShareReelResult(
                    requestId = json.getString("requestId"),
                    requestSentAt = json.optLongOrNull("requestSentAt"),
                    url = json.getString("url"),
                    rawSharedText = json.optStringOrNull("rawSharedText"),
                    status = json.getString("status"),
                    reelId = json.optStringOrNull("reelId"),
                    failureReason = json.optStringOrNull("failureReason"),
                    retryable = json.optBoolean("retryable", false),
                    updatedAt = json.getLong("updatedAt"),
                    reused = if (json.isNull("reused")) null else json.getBoolean("reused"),
                )
            }.getOrNull()
    }
}

internal object ShareResultStore {
    private const val PREFERENCES_NAME = "share_intent_storage"
    private const val ACCESS_TOKEN_KEY = "auth_access_token"
    private const val RESULT_KEY_PREFIX = "share_reel_result."

    private fun preferences(context: Context) =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun saveAccessToken(context: Context, token: String?) {
        preferences(context).edit().apply {
            if (token.isNullOrBlank()) remove(ACCESS_TOKEN_KEY) else putString(ACCESS_TOKEN_KEY, token)
        }.apply()
    }

    fun accessToken(context: Context): String? =
        preferences(context).getString(ACCESS_TOKEN_KEY, null)

    fun saveResult(context: Context, result: ShareReelResult) {
        preferences(context)
            .edit()
            .putString("$RESULT_KEY_PREFIX${result.requestId}", result.toJson().toString())
            .apply()
    }

    fun loadResults(context: Context): List<ShareReelResult> =
        preferences(context).all
            .asSequence()
            .filter { (key, _) -> key.startsWith(RESULT_KEY_PREFIX) }
            .mapNotNull { (_, value) -> (value as? String)?.let(ShareReelResult::fromJson) }
            .sortedBy { it.requestSentAt ?: it.updatedAt }
            .toList()

    fun clearResult(context: Context, requestId: String?) {
        if (requestId.isNullOrBlank()) return
        preferences(context).edit().remove("$RESULT_KEY_PREFIX$requestId").apply()
    }
}

private fun JSONObject.optStringOrNull(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

private fun JSONObject.optLongOrNull(key: String): Long? =
    if (isNull(key)) null else optLong(key)
