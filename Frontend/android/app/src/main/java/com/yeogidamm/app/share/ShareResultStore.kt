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
    val transferStatus: String = "SAVED",
    val authReason: String? = null,
    val reelId: String? = null,
    val failureReason: String? = null,
    val retryable: Boolean,
    val updatedAt: Long = System.currentTimeMillis(),
    val reused: Boolean? = null,
    val saveMode: String? = null,
    val receivedAt: Long? = null,
    val queuedAt: Long? = null,
    val apiAcceptedAt: Long? = null,
    val transferFinishedAt: Long? = null,
) {
    fun toJson(): JSONObject =
        JSONObject().apply {
            put("requestId", requestId)
            put("requestSentAt", requestSentAt ?: JSONObject.NULL)
            put("url", url)
            put("rawSharedText", rawSharedText ?: JSONObject.NULL)
            put("status", status)
            put("transferStatus", transferStatus)
            put("authReason", authReason ?: JSONObject.NULL)
            put("reelId", reelId ?: JSONObject.NULL)
            put("failureReason", failureReason ?: JSONObject.NULL)
            put("retryable", retryable)
            put("updatedAt", updatedAt)
            put("reused", reused ?: JSONObject.NULL)
            put("saveMode", saveMode ?: JSONObject.NULL)
            put("receivedAt", receivedAt ?: JSONObject.NULL)
            put("queuedAt", queuedAt ?: JSONObject.NULL)
            put("apiAcceptedAt", apiAcceptedAt ?: JSONObject.NULL)
            put("transferFinishedAt", transferFinishedAt ?: JSONObject.NULL)
        }

    fun toWritableMap(): WritableMap =
        Arguments.createMap().apply {
            putString("requestId", requestId)
            requestSentAt?.let { putDouble("requestSentAt", it.toDouble()) }
            putString("url", url)
            rawSharedText?.let { putString("rawSharedText", it) }
            putString("status", status)
            putString("transferStatus", transferStatus)
            authReason?.let { putString("authReason", it) }
            reelId?.let { putString("reelId", it) }
            failureReason?.let { putString("failureReason", it) }
            putBoolean("retryable", retryable)
            putDouble("updatedAt", updatedAt.toDouble())
            reused?.let { putBoolean("reused", it) }
            saveMode?.let { putString("saveMode", it) }
            receivedAt?.let { putDouble("receivedAt", it.toDouble()) }
            queuedAt?.let { putDouble("queuedAt", it.toDouble()) }
            apiAcceptedAt?.let { putDouble("apiAcceptedAt", it.toDouble()) }
            transferFinishedAt?.let { putDouble("transferFinishedAt", it.toDouble()) }
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
                    transferStatus = json.optString("transferStatus", "SAVED"),
                    authReason = json.optStringOrNull("authReason"),
                    reelId = json.optStringOrNull("reelId"),
                    failureReason = json.optStringOrNull("failureReason"),
                    retryable = json.optBoolean("retryable", false),
                    updatedAt = json.getLong("updatedAt"),
                    reused = if (json.isNull("reused")) null else json.getBoolean("reused"),
                    saveMode = json.optStringOrNull("saveMode"),
                    receivedAt = json.optLongOrNull("receivedAt"),
                    queuedAt = json.optLongOrNull("queuedAt"),
                    apiAcceptedAt = json.optLongOrNull("apiAcceptedAt"),
                    transferFinishedAt = json.optLongOrNull("transferFinishedAt"),
                )
            }.getOrNull()
    }
}

internal object ShareResultStore {
    private const val PREFERENCES_NAME = "share_intent_storage"
    private const val RESULT_KEY_PREFIX = "share_reel_result."

    private fun preferences(context: Context) =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun saveResult(context: Context, result: ShareReelResult): Boolean {
        val previous = loadResult(context, result.requestId)
        val stored = result.copy(
            receivedAt = previous?.receivedAt ?: result.receivedAt
                ?: if (previous == null) result.updatedAt else null,
            queuedAt = previous?.queuedAt ?: result.queuedAt,
            apiAcceptedAt = previous?.apiAcceptedAt ?: result.apiAcceptedAt
                ?: if (result.transferStatus == "API_SUCCEEDED") result.updatedAt else null,
            transferFinishedAt = previous?.transferFinishedAt ?: result.transferFinishedAt
                ?: if (result.transferStatus in setOf("API_SUCCEEDED", "API_FAILED")) result.updatedAt else null,
        )
        return preferences(context).edit()
            .putString("$RESULT_KEY_PREFIX${result.requestId}", stored.toJson().toString())
            .commit()
    }

    @Synchronized
    fun markQueued(context: Context, requestId: String, queuedAt: Long): Boolean {
        val current = loadResult(context, requestId) ?: return false
        return saveResult(
            context,
            current.copy(
                transferStatus = if (current.transferStatus == "SAVED") "QUEUED" else current.transferStatus,
                queuedAt = current.queuedAt ?: queuedAt,
                updatedAt = if (current.transferStatus == "SAVED") queuedAt else current.updatedAt,
            ),
        )
    }

    fun loadResult(context: Context, requestId: String): ShareReelResult? =
        preferences(context).getString("$RESULT_KEY_PREFIX$requestId", null)
            ?.let(ShareReelResult::fromJson)

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
