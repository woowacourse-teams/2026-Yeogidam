package com.yeogidamm.app.share

import android.content.Context
import com.yeogidamm.app.BuildConfig
import io.sentry.Sentry
import io.sentry.SentryLevel
import io.sentry.android.core.SentryAndroid

internal object ShareSentryReporter {
    private const val DSN = "https://f6c4700ac928b9ecc34983fb58d0dcda@o4512179066896384.ingest.us.sentry.io/4512179119456256"

    private val messages = mapOf(
        "SHARE_PAYLOAD_READ_FAILED" to "인스타그램에서 공유한 데이터를 읽지 못했습니다 (SHARE_PAYLOAD_READ_FAILED)",
        "SHARE_PAYLOAD_STORE_FAILED" to "인스타그램에서 받은 공유 데이터를 앱에 저장하지 못했습니다 (SHARE_PAYLOAD_STORE_FAILED)",
    )

    fun capture(context: Context, errorCode: String) {
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
            Sentry.captureMessage(message, SentryLevel.ERROR) { scope ->
                scope.setTag("feature", "instagram_share")
                scope.setTag("share.stage", "share_intake")
                scope.setTag("share.source", "instagram")
                scope.setTag("share.platform", "android")
                scope.setTag("share.error_code", errorCode)
                scope.fingerprint = listOf("instagram-share", "share_intake", "android", errorCode)
            }
        }
    }
}
