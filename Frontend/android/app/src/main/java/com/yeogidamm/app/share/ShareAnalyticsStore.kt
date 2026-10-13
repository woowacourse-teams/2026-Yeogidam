package com.yeogidamm.app.share

import android.content.Context
import android.util.AtomicFile
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import com.yeogidamm.app.BuildConfig
import com.yeogidamm.app.R
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.time.Instant
import java.time.format.DateTimeFormatterBuilder
import java.util.UUID
import java.util.concurrent.TimeUnit

/** A small durable outbox shared by the share activity, Worker, and React Native app. */
internal object ShareAnalyticsStore {
    private const val PREFERENCES_NAME = "share_analytics_outbox"
    private const val EVENT_PREFIX = "event."
    private const val SEEN_PREFIX = "seen."
    private const val IDENTITY_PREFIX = "share_identity."
    private const val STATUS_PREFIX = "delivery_status."
    private const val STATUS_TIME_PREFIX = "delivery_status_time."
    private const val STATUS_SEQUENCE_PREFIX = "delivery_sequence."
    private const val TOKEN_KEY = "posthog_project_token"
    private const val HOST_KEY = "posthog_host"
    private const val INSTALLATION_ID_FILE = "posthog_installation_id"
    private val eventProperties = mapOf(
        "reel_share_received" to emptySet(),
        "reel_share_feedback_viewed" to setOf("feedback_type"),
        "share_local_save_resolved" to setOf("outcome"),
        "share_delivery_status_changed" to setOf("delivery_status", "reason"),
        "extraction_request_started" to emptySet(),
        "extraction_request_finished" to setOf("outcome", "response_status", "failure_type", "content_id"),
    )
    private val timestampFormatter = DateTimeFormatterBuilder().appendInstant(3).toFormatter()

    /** Kept outside Android backup so a reinstall gets a new installation ID. */
    @Synchronized
    fun installationId(context: Context): String? {
        val file = AtomicFile(File(context.noBackupFilesDir, INSTALLATION_ID_FILE))
        val stored = runCatching { file.readFully().toString(Charsets.UTF_8).trim() }.getOrNull()
        if (stored != null && runCatching { UUID.fromString(stored) }.isSuccess) return stored
        val created = UUID.randomUUID().toString()
        return runCatching {
            val stream = file.startWrite()
            try {
                stream.write(created.toByteArray(Charsets.UTF_8))
                file.finishWrite(stream)
                created
            } catch (error: Exception) {
                file.failWrite(stream)
                throw error
            }
        }.getOrNull()
    }

    fun setConfiguration(context: Context, projectToken: String, host: String): Boolean {
        val normalizedHost = host.trim().trimEnd('/')
        val valid = isValidHost(normalizedHost) && projectToken.isNotBlank()
        val saved = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE).edit()
            .putString(TOKEN_KEY, if (valid) projectToken.trim() else "")
            .putString(HOST_KEY, if (valid) normalizedHost else "")
            .commit()
        if (saved && valid) pending(context).forEach { schedule(context, it.optString("id")) }
        return saved
    }

    private fun isValidHost(host: String): Boolean = runCatching {
        val uri = URI(host)
        uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null &&
            (uri.path.isNullOrEmpty() || uri.path == "/") && uri.query == null && uri.fragment == null
    }.getOrDefault(false)

    fun configuration(context: Context): Pair<String, String>? {
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        val token = preferences.getString(TOKEN_KEY, null)?.takeIf { it.isNotBlank() }
            ?: context.getString(R.string.POSTHOG_PROJECT_TOKEN).trim()
        val host = preferences.getString(HOST_KEY, null)?.takeIf { it.isNotBlank() }
            ?: context.getString(R.string.POSTHOG_HOST).trim().trimEnd('/')
        return if (token.isNotEmpty() && isValidHost(host)) token to host else null
    }

    @Synchronized
    fun record(
        context: Context,
        name: String,
        shareId: String,
        properties: JSONObject = JSONObject(),
        occurredAt: Long = System.currentTimeMillis(),
        release: String = BuildConfig.VERSION_NAME,
        eventKey: String = "$name.$shareId",
    ): Boolean {
        val key = "$EVENT_PREFIX$eventKey"
        val identityKey = "$IDENTITY_PREFIX$shareId"
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        if (preferences.contains(key) || preferences.contains("$SEEN_PREFIX$eventKey")) return true
        val distinctId = preferences.getString(identityKey, null)?.takeIf { it.isNotBlank() }
            ?: ShareAuthStore.load(context)?.userId?.takeIf { it.isNotBlank() }
            ?: shareId
        val event = JSONObject().apply {
            put("id", eventKey)
            put("uuid", UUID.randomUUID().toString())
            put("name", name)
            put("share_id", shareId)
            put("distinct_id", distinctId)
            put("occurred_at", occurredAt)
            put("properties", JSONObject(properties.toString()).apply {
                put("platform", "android")
                put("release", release)
                put("environment", BuildConfig.APP_ENV)
                installationId(context)?.let { put("installation_id", it) }
            })
        }
        val saved = preferences.edit()
            .putString(key, event.toString())
            .putBoolean("$SEEN_PREFIX$eventKey", true)
            .putString(identityKey, distinctId)
            .commit()
        if (saved) schedule(context, event.getString("id"))
        return saved
    }

    @Synchronized
    fun recordDeliveryStatus(context: Context, shareId: String, status: String, reason: String? = null,
                             occurredAt: Long = System.currentTimeMillis()): Boolean {
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        val state = "$status.${reason.orEmpty()}"
        val latestAt = preferences.getLong("$STATUS_TIME_PREFIX$shareId", 0)
        if (preferences.getString("$STATUS_PREFIX$shareId", null) == state && occurredAt >= latestAt) return true
        val sequence = preferences.getInt("$STATUS_SEQUENCE_PREFIX$shareId", 0) + 1
        val saved = record(
            context, "share_delivery_status_changed", shareId,
            JSONObject().put("delivery_status", status).apply { reason?.let { put("reason", it) } },
            occurredAt = occurredAt,
            eventKey = "share_delivery_status_changed.$shareId.$sequence",
        )
        if (saved) preferences.edit().apply {
            if (occurredAt >= latestAt) {
                putString("$STATUS_PREFIX$shareId", state)
                putLong("$STATUS_TIME_PREFIX$shareId", occurredAt)
            }
            putInt("$STATUS_SEQUENCE_PREFIX$shareId", sequence)
        }.commit()
        return saved
    }

    fun pending(context: Context): List<JSONObject> =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE).all
            .asSequence()
            .filter { (key, _) -> key.startsWith(EVENT_PREFIX) }
            .mapNotNull { (_, value) -> runCatching { JSONObject(value as String) }.getOrNull() }
            .sortedBy { it.optLong("occurred_at") }
            .toList()

    fun get(context: Context, id: String): JSONObject? =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .getString("$EVENT_PREFIX$id", null)
            ?.let { runCatching { JSONObject(it) }.getOrNull() }

    fun captureBody(event: JSONObject, projectToken: String): JSONObject? {
        val name = event.optString("name")
        val allowed = eventProperties[name] ?: return null
        val shareId = event.optString("share_id")
        val occurredAt = event.optLong("occurred_at")
        if (shareId.isBlank() || occurredAt <= 0) return null
        val distinctId = event.optString("distinct_id").takeIf { it.isNotBlank() } ?: shareId
        val source = event.optJSONObject("properties") ?: JSONObject()
        val properties = JSONObject().apply {
            (allowed + setOf("platform", "release", "environment", "installation_id")).forEach { key ->
                if (source.has(key)) put(key, source.get(key))
            }
            if (optString("environment").isBlank()) put("environment", BuildConfig.APP_ENV)
            put("share_id", shareId)
            if (distinctId == shareId) put("\$process_person_profile", false)
        }
        return JSONObject().apply {
            put("api_key", projectToken)
            put("event", name)
            put("distinct_id", distinctId)
            put("timestamp", timestampFormatter.format(Instant.ofEpochMilli(occurredAt)))
            event.optString("uuid").takeIf { it.isNotBlank() }?.let { put("uuid", it) }
            put("properties", properties)
        }
    }

    private fun schedule(context: Context, id: String) {
        if (id.isBlank() || configuration(context) == null) return
        runCatching {
            val request = OneTimeWorkRequestBuilder<ShareAnalyticsSendWorker>()
                .setInputData(Data.Builder().putString("event_id", id).build())
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "share_analytics.$id", ExistingWorkPolicy.KEEP, request,
            )
        }
    }

    @Synchronized
    fun acknowledge(context: Context, id: String) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit().remove("$EVENT_PREFIX$id").commit()
    }
}

/** Sends one persisted event without requiring the React Native app to start. */
class ShareAnalyticsSendWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val id = inputData.getString("event_id") ?: return Result.failure()
        val event = ShareAnalyticsStore.get(applicationContext, id) ?: return Result.success()
        val (token, host) = ShareAnalyticsStore.configuration(applicationContext) ?: return Result.failure()
        val body = ShareAnalyticsStore.captureBody(event, token) ?: return Result.failure()
        return try {
            val connection = URL("$host/i/v0/e/").openConnection() as HttpURLConnection
            try {
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.doOutput = true
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val status = connection.responseCode
                when {
                    status in 200..299 -> {
                        ShareAnalyticsStore.acknowledge(applicationContext, id)
                        Result.success()
                    }
                    status == 408 || status == 429 || status >= 500 -> Result.retry()
                    else -> Result.failure()
                }
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
