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
        val pending = ShareResultStore.loadResult(applicationContext, requestId) ?: return Result.failure()
        val instagramUrl = pending.url.takeIf { it.isNotBlank() } ?: run {
            if (pending.transferStatus == "REQUESTING" && pending.reelId == null) {
                saveFailure(requestId, "REQUEST_INTERRUPTED", requestSentAt = pending.requestSentAt)
                recordFinished(requestId, "request_failed", null, "interrupted")
            }
            return Result.success()
        }
        val rawSharedText = pending.rawSharedText
        val auth = ShareAuth.ensureAccessToken(applicationContext)
        val token = when (auth) {
            is ShareAuthResult.Ready -> auth.token
            is ShareAuthResult.LoginRequired -> {
                ShareResultStore.saveResult(
                    applicationContext,
                    ShareReelResult(
                        requestId = requestId, url = instagramUrl, rawSharedText = rawSharedText,
                        status = "PENDING", transferStatus = "LOGIN_HANDOFF",
                        authReason = auth.reason, retryable = false,
                    ),
                )
                ShareAnalyticsStore.recordDeliveryStatus(applicationContext, requestId, "deferred", "login_required")
                recordFinished(requestId, "blocked_before_request", null, "auth_failed")
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
                // 네트워크 대기는 연결 조건과 재시도 간격에 맞춰 다시 실행한다.
                // 로그인 확인 대기는 앱이 새 토큰을 줄 때까지 기다린다.
                return if (auth is ShareAuthResult.WaitingForNetwork) retryOrWaitForApp() else Result.success()
            }
        }

        var connection: HttpURLConnection? = null
        var requestSentAt: Long? = null
        var outputStreamAcquired = false
        return try {
            connection = URL("${BuildConfig.API_BASE_URL}/api/v1/shares")
                .openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 30_000
            connection.readTimeout = 30_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $token")
            // 서버에는 멱등키가 없어 instagramUrl만 보낸다.
            val body = JSONObject().put("instagramUrl", instagramUrl).toString()
            connection.connect()
            connection.outputStream.use { stream ->
                outputStreamAcquired = true
                requestSentAt = System.currentTimeMillis()
                ShareResultStore.saveResult(
                    applicationContext,
                    ShareReelResult(
                        requestId = requestId, requestSentAt = requestSentAt,
                        url = "", rawSharedText = null,
                        status = "PENDING", transferStatus = "REQUESTING",
                        retryable = false, updatedAt = requestSentAt!!,
                    ),
                )
                ShareAnalyticsStore.record(
                    applicationContext, "extraction_request_started", requestId,
                    release = ShareResultStore.loadResult(applicationContext, requestId)?.release
                        ?: BuildConfig.VERSION_NAME,
                )
                stream.write(body.toByteArray(Charsets.UTF_8))
            }

            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val response = runCatching { JSONObject(responseBody) }.getOrDefault(JSONObject())

            if (responseCode !in 200..299) {
                // Spring 오류 응답: {message, errorCode}. 401은 앱 화면 계약에 맞춰 AUTH401_001로 남긴다.
                val errorCode = if (responseCode == 401) "AUTH401_001" else response.optNullableString("errorCode")
                val message = response.optNullableString("message")
                if (responseCode == 408 || responseCode == 429 || responseCode == 504 || responseCode >= 500) {
                    ShareSentryReporter.capture(
                        applicationContext,
                        "SHARE_EXTRACTION_REQUEST_FAILED",
                        "place_extraction_request",
                        responseCode,
                        errorCode,
                    )
                }
                saveFailure(
                    requestId = requestId,
                    requestSentAt = requestSentAt,
                    reason = listOfNotNull(errorCode, message, "HTTP_$responseCode").joinToString(" | "),
                    responseStatus = responseCode,
                )
                recordFinished(requestId, "request_failed", responseCode, when {
                    responseCode == 401 || responseCode == 403 -> "auth_failed"
                    responseCode == 408 || responseCode == 504 -> "timeout"
                    responseCode >= 500 -> "server_error"
                    else -> "invalid_request"
                })
                return Result.success()
            }

            // Spring 응답(202): {sharedMediaId, extractionStatus}
            val reelId = if (response.isNull("sharedMediaId")) null
                else response.optLong("sharedMediaId", -1L).takeIf { it >= 0 }?.toString()
            val extractionStatus = response.optNullableString("extractionStatus")
            if (reelId == null || extractionStatus == null) {
                ShareSentryReporter.capture(
                    applicationContext,
                    "SHARE_EXTRACTION_RESPONSE_INVALID",
                    "place_extraction_request",
                    responseCode,
                )
            }
            ShareResultStore.saveResult(
                applicationContext,
                ShareReelResult(
                    requestId = requestId,
                    requestSentAt = requestSentAt,
                    url = "",
                    rawSharedText = null,
                    status = if (reelId == null) "FAILED" else toReelStatus(extractionStatus),
                    transferStatus = if (reelId == null) "API_FAILED" else "API_SUCCEEDED",
                    reelId = reelId,
                    failureReason = if (reelId == null) "MISSING_REEL_ID" else null,
                    responseStatus = responseCode,
                    retryable = false,
                    reused = reelId?.let { extractionStatus == "SUCCEEDED" },
                    saveMode = "AUTO_SAVE",
                ),
            )
            recordFinished(requestId, if (reelId == null) "request_failed" else "response_received",
                responseCode, if (reelId == null) "invalid_response" else null, reelId)
            Result.success()
        } catch (error: Exception) {
            if (!outputStreamAcquired) {
                val networkFailure = isConnectionFailure(error)
                val savedLocally = ShareResultStore.saveResult(
                    applicationContext,
                    ShareReelResult(
                        requestId = requestId, url = instagramUrl, rawSharedText = rawSharedText,
                        status = "PENDING", transferStatus = if (networkFailure) "WAITING_FOR_NETWORK" else "SAVED",
                        retryable = true,
                    ),
                )
                if (networkFailure && savedLocally) {
                    ShareSentryReporter.capture(
                        applicationContext,
                        "SHARE_EXTRACTION_NETWORK_DEFERRED",
                        "place_extraction_request",
                        exceptionType = error.javaClass.simpleName,
                    )
                }
                ShareAnalyticsStore.recordDeliveryStatus(applicationContext, requestId, "deferred",
                    if (networkFailure) "network_unavailable" else "pre_request_error")
                // 요청을 보내기 전에 난 네트워크 오류라 다시 보내도 공유가 두 번 생기지 않는다.
                return if (networkFailure) retryOrWaitForApp() else Result.success()
            }
            saveFailure(
                requestId = requestId,
                requestSentAt = requestSentAt,
                reason = "CLIENT000_002 | ${error.javaClass.simpleName}: ${error.message.orEmpty()}",
            )
            ShareSentryReporter.capture(
                applicationContext,
                "SHARE_EXTRACTION_REQUEST_FAILED",
                "place_extraction_request",
                exceptionType = error.javaClass.simpleName,
            )
            recordFinished(requestId, "request_failed", null,
                if (error is java.net.SocketTimeoutException) "timeout" else "network_error")
            Result.success()
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * 네트워크 오류는 재시도 간격(30초부터 두 배씩)에 맞춰 다시 실행한다.
     * 간격이 길어지면 앱을 열어도 남은 간격을 기다려야 하므로, 정해진 횟수가 넘으면
     * 지금처럼 앱을 열 때 다시 등록되기를 기다린다.
     */
    private fun retryOrWaitForApp(): Result =
        if (runAttemptCount < MAX_NETWORK_RETRY_COUNT) Result.retry() else Result.success()

    private fun isConnectionFailure(error: Exception): Boolean =
        error is java.net.UnknownHostException ||
            error is java.net.ConnectException ||
            error is java.net.NoRouteToHostException ||
            error is java.net.SocketTimeoutException ||
            error is java.net.SocketException

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
        reason: String,
        responseStatus: Int? = null,
        requestSentAt: Long? = null,
        reelId: String? = null,
    ) {
        ShareResultStore.saveResult(
            applicationContext,
            ShareReelResult(
                requestId = requestId,
                requestSentAt = requestSentAt,
                url = "",
                rawSharedText = null,
                status = "FAILED",
                transferStatus = "API_FAILED",
                reelId = reelId,
                failureReason = reason,
                responseStatus = responseStatus,
                retryable = false,
            ),
        )
    }

    companion object {
        private const val KEY_REQUEST_ID = "request_id"
        private const val MAX_NETWORK_RETRY_COUNT = 5

        /** Spring ExtractionStatus를 앱 처리 상태로 바꾼다. */
        fun toReelStatus(extractionStatus: String?): String = when (extractionStatus) {
            "SUCCEEDED" -> "COMPLETED"
            "FAILED" -> "FAILED"
            else -> "PROCESSING"
        }

        fun enqueue(
            context: Context,
            requestId: String,
        ): Boolean {
            val queuedAt = System.currentTimeMillis()
            val input = Data.Builder()
                .putString(KEY_REQUEST_ID, requestId)
                .build()
            val request = OneTimeWorkRequestBuilder<ShareSaveWorker>()
                .setInputData(input)
                // 네트워크가 없으면 연결될 때까지 기다리고, 다시 시도할 때마다 간격을 늘린다.
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
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
