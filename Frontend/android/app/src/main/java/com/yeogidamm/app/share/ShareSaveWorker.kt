package com.yeogidamm.app.share

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.yeogidamm.app.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

internal class ShareSaveWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : Worker(appContext, workerParams) {

    override fun doWork(): Result {
        val requestId = inputData.getString(KEY_REQUEST_ID) ?: return Result.failure()
        val instagramUrl = inputData.getString(KEY_INSTAGRAM_URL) ?: return Result.failure()
        val rawSharedText = inputData.getString(KEY_RAW_SHARED_TEXT)
        val auth = ShareAuth.ensureAccessToken(applicationContext)
        val token = when (auth) {
            is ShareAuthResult.Ready -> auth.token
            is ShareAuthResult.LoginRequired -> {
                ShareResultStore.saveResult(
                    applicationContext,
                    ShareReelResult(
                        requestId = requestId, url = instagramUrl, rawSharedText = rawSharedText,
                        status = "PENDING", transferStatus = "LOGIN_REQUIRED",
                        authReason = auth.reason, retryable = false,
                    ),
                )
                ShareAnalyticsStore.recordDeliveryStatus(applicationContext, requestId, "deferred", "login_required")
                return Result.success()
            }
            ShareAuthResult.WaitingForNetwork, ShareAuthResult.WaitingForAuth -> {
                ShareAnalyticsStore.recordDeliveryStatus(applicationContext, requestId, "deferred",
                    if (auth is ShareAuthResult.WaitingForNetwork) "network_unavailable" else "auth_pending")
                ShareResultStore.saveResult(
                    applicationContext,
                    ShareReelResult(
                        requestId = requestId, url = instagramUrl, rawSharedText = rawSharedText,
                        status = "PENDING",
                        transferStatus = if (auth is ShareAuthResult.WaitingForNetwork) "WAITING_FOR_NETWORK" else "WAITING_FOR_AUTH",
                        retryable = true,
                    ),
                )
                return Result.retry()
            }
        }

        val requestSentAt = System.currentTimeMillis()
        ShareResultStore.saveResult(
            applicationContext,
            ShareReelResult(
                requestId = requestId,
                requestSentAt = requestSentAt,
                url = instagramUrl,
                rawSharedText = rawSharedText,
                status = "PENDING",
                transferStatus = "REQUESTING",
                retryable = true,
                updatedAt = requestSentAt,
            ),
        )

        var connection: HttpURLConnection? = null
        return try {
            connection = URL("${BuildConfig.SUPABASE_URL}/functions/v1/save-instagram-reel-v2")
                .openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 30_000
            connection.readTimeout = 30_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY)
            connection.setRequestProperty("Authorization", "Bearer $token")
            val body = JSONObject().apply {
                put("instagramUrl", instagramUrl)
                put("source", "instagram_share")
                put("clientRequestId", requestId)
            }.toString()
            ShareAnalyticsStore.record(
                applicationContext, "extraction_request_started", requestId,
                release = ShareResultStore.loadResult(applicationContext, requestId)?.release
                    ?: BuildConfig.VERSION_NAME,
            )
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val response = runCatching { JSONObject(responseBody) }.getOrDefault(JSONObject())
            val nestedError = response.optJSONObject("error")

            if (responseCode !in 200..299) {
                val errorCode = response.optNullableString("errorCode")
                    ?: nestedError?.optNullableString("errorCode")
                if (errorCode == "AUTH401_002" && runAttemptCount == 0) {
                    when (val refreshed = ShareAuth.ensureAccessToken(applicationContext, forceRefresh = true)) {
                        is ShareAuthResult.Ready -> return Result.retry()
                        is ShareAuthResult.LoginRequired -> {
                            ShareResultStore.saveResult(
                                applicationContext,
                                ShareReelResult(
                                    requestId = requestId, url = instagramUrl, rawSharedText = rawSharedText,
                                    status = "PENDING", transferStatus = "LOGIN_REQUIRED",
                                    authReason = refreshed.reason, retryable = false,
                                ),
                            )
                            ShareAnalyticsStore.recordDeliveryStatus(applicationContext, requestId, "deferred", "login_required")
                            return Result.success()
                        }
                        ShareAuthResult.WaitingForNetwork, ShareAuthResult.WaitingForAuth -> {
                            ShareResultStore.saveResult(
                                applicationContext,
                                ShareReelResult(
                                    requestId = requestId, url = instagramUrl, rawSharedText = rawSharedText,
                                    status = "PENDING",
                                    transferStatus = if (refreshed is ShareAuthResult.WaitingForNetwork) "WAITING_FOR_NETWORK" else "WAITING_FOR_AUTH",
                                    retryable = true,
                                ),
                            )
                            ShareAnalyticsStore.recordDeliveryStatus(applicationContext, requestId, "deferred",
                                if (refreshed is ShareAuthResult.WaitingForNetwork) "network_unavailable" else "auth_pending")
                            return Result.retry()
                        }
                    }
                }
                val retryable = response.optBoolean(
                    "retryable",
                    nestedError?.optBoolean("retryable", responseCode >= 500) ?: (responseCode >= 500),
                )
                if (retryable && runAttemptCount < MAX_RETRY_COUNT) {
                    return Result.retry()
                }

                val message = response.optNullableString("message")
                    ?: nestedError?.optNullableString("message")
                saveFailure(
                    requestId = requestId,
                    requestSentAt = requestSentAt,
                    instagramUrl = instagramUrl,
                    rawSharedText = rawSharedText,
                    reason = listOfNotNull(errorCode, message, "HTTP_$responseCode").joinToString(" | "),
                    retryable = retryable,
                    reelId = response.optNullableString("reelId")
                        ?: nestedError?.optNullableString("reelId"),
                )
                recordFinished(requestId, "request_failed", responseCode, when {
                    responseCode == 401 || responseCode == 403 -> "auth_failed"
                    responseCode == 408 || responseCode == 504 -> "timeout"
                    responseCode >= 500 -> "server_error"
                    else -> "invalid_request"
                }, response.optNullableString("reelId") ?: nestedError?.optNullableString("reelId"))
                return Result.success()
            }

            ShareResultStore.saveResult(
                applicationContext,
                ShareReelResult(
                    requestId = requestId,
                    requestSentAt = requestSentAt,
                    url = instagramUrl,
                    rawSharedText = rawSharedText,
                    status = response.optString("status", "FAILED"),
                    transferStatus = "API_SUCCEEDED",
                    reelId = response.optNullableString("reelId"),
                    failureReason = response.optNullableString("failureReason"),
                    retryable = response.optBoolean("retryable", false),
                    reused = if (response.has("reused") && !response.isNull("reused")) {
                        response.getBoolean("reused")
                    } else {
                        null
                    },
                    saveMode = response.optNullableString("saveMode"),
                ),
            )
            recordFinished(requestId, "response_received", responseCode, null,
                response.optNullableString("reelId"))
            Result.success()
        } catch (error: Exception) {
            if (runAttemptCount < MAX_RETRY_COUNT) {
                Result.retry()
            } else {
                saveFailure(
                    requestId = requestId,
                    requestSentAt = requestSentAt,
                    instagramUrl = instagramUrl,
                    rawSharedText = rawSharedText,
                    reason = "CLIENT000_002 | ${error.javaClass.simpleName}: ${error.message.orEmpty()}",
                    retryable = true,
                )
                recordFinished(requestId, "request_failed", null,
                    if (error is java.net.SocketTimeoutException) "timeout" else "network_error")
                Result.success()
            }
        } finally {
            connection?.disconnect()
        }
    }

    private fun recordFinished(
        requestId: String, outcome: String, responseStatus: Int?, failureType: String?, contentId: String? = null,
    ) {
        ShareAnalyticsStore.record(
            applicationContext, "extraction_request_finished", requestId,
            JSONObject().put("outcome", outcome).apply {
                responseStatus?.let { put("response_status", it) }
                failureType?.let { put("failure_type", it) }
                contentId?.let { put("content_id", it) }
            },
            release = ShareResultStore.loadResult(applicationContext, requestId)?.release
                ?: BuildConfig.VERSION_NAME,
        )
    }

    private fun saveFailure(
        requestId: String,
        instagramUrl: String,
        rawSharedText: String?,
        reason: String,
        retryable: Boolean,
        requestSentAt: Long? = null,
        reelId: String? = null,
    ) {
        ShareResultStore.saveResult(
            applicationContext,
            ShareReelResult(
                requestId = requestId,
                requestSentAt = requestSentAt,
                url = instagramUrl,
                rawSharedText = rawSharedText,
                status = "FAILED",
                transferStatus = "API_FAILED",
                reelId = reelId,
                failureReason = reason,
                retryable = retryable,
            ),
        )
    }

    companion object {
        private const val KEY_REQUEST_ID = "request_id"
        private const val KEY_INSTAGRAM_URL = "instagram_url"
        private const val KEY_RAW_SHARED_TEXT = "raw_shared_text"
        private const val MAX_RETRY_COUNT = 2

        fun enqueue(
            context: Context,
            requestId: String,
            instagramUrl: String,
            rawSharedText: String,
        ): Boolean {
            val queuedAt = System.currentTimeMillis()
            val input = Data.Builder()
                .putString(KEY_REQUEST_ID, requestId)
                .putString(KEY_INSTAGRAM_URL, instagramUrl)
                .putString(KEY_RAW_SHARED_TEXT, rawSharedText)
                .build()
            val request = OneTimeWorkRequestBuilder<ShareSaveWorker>()
                .setInputData(input)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "share-save-$requestId",
                ExistingWorkPolicy.KEEP,
                request,
            ).result.get()
            ShareResultStore.markQueued(context, requestId, queuedAt)
            ShareAnalyticsStore.recordDeliveryStatus(context, requestId, "queued", occurredAt = queuedAt)
            return true
        }
    }
}

private fun JSONObject.optNullableString(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
