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

    private val messages = mapOf(
        "SHARE_PAYLOAD_READ_FAILED" to "인스타그램에서 공유한 데이터를 읽지 못했습니다. (SHARE_PAYLOAD_READ_FAILED)",
        "SHARE_PAYLOAD_STORE_FAILED" to "인스타그램에서 받은 공유 데이터를 앱에 저장하지 못했습니다. (SHARE_PAYLOAD_STORE_FAILED)",
        "SHARE_LOGIN_APP_OPEN_FAILED" to "로그인을 위해 여기담 앱을 열지 못했습니다. (SHARE_LOGIN_APP_OPEN_FAILED)",
        "SHARE_TOKEN_REFRESH_FAILED" to "공유한 장소를 추출하기 위한 로그인 토큰 갱신에 실패했습니다. (SHARE_TOKEN_REFRESH_FAILED)",
        "SHARE_EXTRACTION_REQUEST_FAILED" to "공유한 장소 추출 요청을 서버에 전달하지 못했습니다. (SHARE_EXTRACTION_REQUEST_FAILED)",
        "SHARE_EXTRACTION_RESPONSE_INVALID" to "장소 추출 요청의 서버 응답을 확인하지 못했습니다. (SHARE_EXTRACTION_RESPONSE_INVALID)",
    )

    fun capture(
        context: Context,
        errorCode: String,
        stage: String = "share_intake",
        httpStatus: Int? = null,
        backendErrorCode: String? = null,
        exceptionType: String? = null,
    ) {
        val message = messages[errorCode] ?: return
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
                    type = "장소 공유 오류"
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
}
