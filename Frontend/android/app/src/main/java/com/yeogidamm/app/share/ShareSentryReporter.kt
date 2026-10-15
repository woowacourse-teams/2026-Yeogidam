package com.yeogidamm.app.share

import android.content.Context
import com.yeogidamm.app.BuildConfig
import io.sentry.Sentry
import io.sentry.SentryLevel
import io.sentry.SentryEvent
import io.sentry.protocol.SentryException
import io.sentry.android.core.SentryAndroid

internal object ShareSentryReporter {
    private const val DSN = "https://f6c4700ac928b9ecc34983fb58d0dcda@o4512179066896384.ingest.us.sentry.io/4512179119456256"

    private val titles = mapOf(
        "SHARE_PAYLOAD_READ_FAILED" to "장소 공유 오류 · 공유 내용 확인",
        "SHARE_PAYLOAD_STORE_FAILED" to "장소 공유 오류 · 기기 저장",
        "SHARE_LOGIN_APP_OPEN_FAILED" to "장소 공유 오류 · 로그인 앱 전환",
        "SHARE_LOGIN_STATE_READ_FAILED" to "장소 공유 오류 · 로그인 상태 확인",
        "SHARE_TOKEN_REFRESH_FAILED" to "장소 공유 오류 · 토큰 갱신",
        "SHARE_EXTRACTION_REQUEST_FAILED" to "장소 공유 오류 · 장소 추출 요청",
        "SHARE_EXTRACTION_NETWORK_DEFERRED" to "장소 공유 오류 · 네트워크",
        "SHARE_EXTRACTION_RESPONSE_INVALID" to "장소 공유 오류 · 응답 확인",
    )

    private val descriptions = mapOf(
        "SHARE_PAYLOAD_READ_FAILED" to "인스타그램에서 공유한 링크를 읽거나 형식을 확인하지 못했습니다.",
        "SHARE_PAYLOAD_STORE_FAILED" to "공유한 링크를 기기에 저장하지 못했습니다.",
        "SHARE_LOGIN_APP_OPEN_FAILED" to "공유한 링크를 이어서 처리하기 위해 여기담 앱을 열지 못했습니다.",
        "SHARE_TOKEN_REFRESH_FAILED" to "공유한 장소를 추출하기 위한 로그인 토큰을 갱신하지 못했습니다.",
        "SHARE_EXTRACTION_REQUEST_FAILED" to "장소 추출 요청을 서버로 보내거나 처리하지 못했습니다.",
        "SHARE_EXTRACTION_NETWORK_DEFERRED" to "장소 추출 요청 전에 네트워크 연결에 실패했습니다.",
        "SHARE_EXTRACTION_RESPONSE_INVALID" to "장소 추출 요청 후 서버 응답의 필수 정보를 확인하지 못했습니다.",
    )

    fun capture(
        context: Context,
        errorCode: String,
        stage: String = "share_intake",
        httpStatus: Int? = null,
        backendErrorCode: String? = null,
        exceptionType: String? = null,
    ) {
        val title = titles[errorCode] ?: return
        val description = descriptions[errorCode] ?: return
        val environment = BuildConfig.APP_ENV.ifBlank { "development" }
        val deferredHandling = if (errorCode == "SHARE_EXTRACTION_NETWORK_DEFERRED") {
            "\n처리: 공유 링크를 기기에 저장했으며, 앱을 다시 열면 재시도합니다."
        } else {
            ""
        }
        val message = "$description\n" +
            "환경·기기: ${environmentLabel(environment)} · Android\n" +
            "원인: ${cause(errorCode, httpStatus, backendErrorCode, exceptionType)}\n" +
            deferredHandling
        runCatching {
            if (!Sentry.isEnabled()) {
                SentryAndroid.init(context.applicationContext) { options ->
                    options.dsn = DSN
                    options.environment = BuildConfig.APP_ENV
                    options.isSendDefaultPii = false
                    options.isEnableAutoSessionTracking = false
                }
            }
            val event = SentryEvent().apply {
                level = SentryLevel.ERROR
                exceptions = listOf(SentryException().apply {
                    type = title
                    value = message
                })
                fingerprints = listOf("instagram-share", stage, "android", errorCode)
            }
            Sentry.captureEvent(event) { scope ->
                scope.setTag("feature", "instagram_share")
                scope.setTag("share.stage", stage)
                scope.setTag("share.source", "instagram")
                scope.setTag("share.platform", "android")
                scope.setTag("share.error_code", errorCode)
                scope.fingerprint = listOf("instagram-share", stage, "android", errorCode)
                httpStatus?.let { scope.setTag("http.status_code", it.toString()) }
                backendErrorCode?.takeIf { it.matches(Regex("[A-Z0-9_]{3,64}")) }
                    ?.let { scope.setTag("share.backend_error_code", it) }
                exceptionType?.takeIf { it.matches(Regex("[A-Za-z0-9_.$]{1,100}")) }
                    ?.let { scope.setTag("share.exception_type", it) }
            }
        }
    }

    private fun environmentLabel(environment: String): String = when (environment.lowercase()) {
        "development" -> "개발"
        "production" -> "운영"
        else -> environment
    }

    private fun cause(
        errorCode: String,
        httpStatus: Int?,
        backendErrorCode: String?,
        exceptionType: String?,
    ): String {
        if (exceptionType != null) {
            return if (errorCode == "SHARE_EXTRACTION_NETWORK_DEFERRED") {
                networkCause(exceptionType)
            } else {
                exceptionCause(exceptionType)
            }
        }
        if (backendErrorCode != null) {
            val details = listOfNotNull(httpStatus?.let { "HTTP $it" }, backendErrorCode).joinToString(", ")
            return "서버 오류 ($details)"
        }
        if (httpStatus != null) {
            return when (errorCode) {
                "SHARE_EXTRACTION_RESPONSE_INVALID" -> "필수 응답값 누락 (HTTP $httpStatus)"
                "SHARE_TOKEN_REFRESH_FAILED" -> "토큰 응답 확인 실패 (HTTP $httpStatus)"
                else -> "HTTP $httpStatus 응답"
            }
        }
        return when (errorCode) {
            "SHARE_PAYLOAD_READ_FAILED" -> "공유 링크 읽기 또는 형식 확인 실패"
            "SHARE_PAYLOAD_STORE_FAILED" -> "기기 저장 실패"
            "SHARE_LOGIN_APP_OPEN_FAILED" -> "앱 열기 실패"
            "SHARE_TOKEN_REFRESH_FAILED" -> "토큰 갱신 네트워크 또는 응답 처리 실패"
            "SHARE_EXTRACTION_REQUEST_FAILED", "SHARE_EXTRACTION_NETWORK_DEFERRED" ->
                "네트워크 연결 오류${exceptionType?.let { " ($it)" }.orEmpty()}"
            "SHARE_EXTRACTION_RESPONSE_INVALID" -> "필수 응답값 누락"
            else -> "원인 분류 필요"
        }
    }

    private fun networkCause(exceptionType: String?): String = when (exceptionType) {
        "UnknownHostException" -> "인터넷 연결 또는 DNS 조회 실패"
        "ConnectException" -> "서버 연결 실패"
        "NoRouteToHostException" -> "네트워크 경로 없음"
        "SocketTimeoutException" -> "요청 시간 초과"
        "SocketException" -> "네트워크 연결 끊김"
        else -> "네트워크 연결 오류${exceptionType?.let { " ($it)" }.orEmpty()}"
    }

    private fun exceptionCause(exceptionType: String): String = when (exceptionType) {
        "UnknownHostException", "ConnectException", "NoRouteToHostException", "SocketTimeoutException", "SocketException" ->
            networkCause(exceptionType)
        else -> "요청 처리 예외 ($exceptionType)"
    }
}
