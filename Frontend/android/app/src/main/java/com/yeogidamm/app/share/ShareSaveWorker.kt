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
        val token = ShareResultStore.accessToken(applicationContext)

        if (token.isNullOrBlank()) {
            saveFailure(
                requestId = requestId,
                instagramUrl = instagramUrl,
                rawSharedText = rawSharedText,
                reason = "AUTH401_001",
                retryable = false,
            )
            return Result.success()
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
                put("clientRequestId", payload.id)
            }.toString()
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val response = runCatching { JSONObject(responseBody) }.getOrDefault(JSONObject())
            val nestedError = response.optJSONObject("error")

            if (responseCode !in 200..299) {
                val retryable = response.optBoolean(
                    "retryable",
                    nestedError?.optBoolean("retryable", responseCode >= 500) ?: (responseCode >= 500),
                )
                if (retryable && runAttemptCount < MAX_RETRY_COUNT) {
                    return Result.retry()
                }

                val errorCode = response.optNullableString("errorCode")
                    ?: nestedError?.optNullableString("errorCode")
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
                Result.success()
            }
        } finally {
            connection?.disconnect()
        }
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
        ) {
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
            )
        }
    }
}

private fun JSONObject.optNullableString(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
