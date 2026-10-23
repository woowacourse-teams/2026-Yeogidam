package com.yeogidamm.app.share

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.yeogidamm.app.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

internal sealed interface ShareAuthResult {
    data class Ready(val token: String) : ShareAuthResult
    data class LoginRequired(val reason: String) : ShareAuthResult
    data object WaitingForNetwork : ShareAuthResult
    data object WaitingForAuth : ShareAuthResult
}

internal object ShareAuth {
    @Synchronized
    fun ensureAccessToken(context: Context, forceRefresh: Boolean = false): ShareAuthResult {
        val session = ShareAuthStore.load(context)
            ?: return ShareAuthResult.LoginRequired(
                if (ShareAuthStore.hadSession(context)) "refresh_token_missing" else "never_logged_in",
            )
        if (session.refreshToken.isBlank()) return ShareAuthResult.LoginRequired("refresh_token_missing")
        if (!forceRefresh && session.accessToken.isNotBlank() &&
            session.expiresAt > System.currentTimeMillis() / 1000 + 60
        ) {
            return ShareAuthResult.Ready(session.accessToken)
        }
        var connection: HttpURLConnection? = null
        return try {
            connection = URL("${BuildConfig.API_BASE_URL}/api/v1/auth/token-refreshes")
                .openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 12_000
            connection.readTimeout = 12_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            val body = JSONObject().put("refreshToken", session.refreshToken).toString()
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val response = runCatching {
                JSONObject(stream?.bufferedReader()?.use { it.readText() }.orEmpty())
            }.getOrDefault(JSONObject())

            if (code in 200..299) {
                // 갱신 중 로그아웃으로 세션이 지워졌다면 새 토큰을 다시 저장하지 않는다.
                val latest = ShareAuthStore.load(context)
                    ?: return ShareAuthResult.LoginRequired("refresh_token_missing")
                if (latest.refreshToken != session.refreshToken) return latest.readyOrWaiting()
                val access = response.optString("accessToken")
                val refresh = response.optString("refreshToken")
                // Spring은 만료 시각을 ISO-8601(Instant) 문자열로 준다. 공유 세션은 epoch초로 저장한다.
                val expiresAt = runCatching {
                    Instant.parse(response.optString("expiresAt")).epochSecond
                }.getOrNull()
                if (access.isBlank() || refresh.isBlank() || expiresAt == null) {
                    ShareSentryReporter.capture(context, "SHARE_TOKEN_REFRESH_FAILED", "token_refresh", code)
                    return ShareAuthResult.WaitingForAuth
                }
                if (!ShareAuthStore.save(context, ShareSession(access, refresh, expiresAt, session.userId))) {
                    ShareSentryReporter.capture(context, "SHARE_TOKEN_REFRESH_FAILED", "token_refresh", code)
                    return ShareAuthResult.WaitingForAuth
                }
                ShareAuthResult.Ready(access)
            } else {
                val errorCode = response.optString("errorCode")
                if (code == 408 || code == 429 || code == 504 || code >= 500) {
                    ShareSentryReporter.capture(
                        context, "SHARE_TOKEN_REFRESH_FAILED", "token_refresh", code, errorCode,
                    )
                }
                val latest = ShareAuthStore.load(context)
                when {
                    code !in 400..401 -> ShareAuthResult.WaitingForAuth
                    // 다른 프로세스(앱)가 같은 토큰을 먼저 회전했다면 저장소에 새 토큰이 있다.
                    latest != null && latest.refreshToken != session.refreshToken -> latest.readyOrWaiting()
                    // AUTH401_005: 직전 토큰 재사용(10초 이내). 앱이 새 토큰을 공유할 때까지 기다린다.
                    errorCode == "AUTH401_005" -> ShareAuthResult.WaitingForAuth
                    else -> {
                        ShareAuthStore.save(context, null)
                        ShareAuthResult.LoginRequired("refresh_token_invalid")
                    }
                }
            }
        } catch (error: Exception) {
            ShareSentryReporter.capture(
                context,
                "SHARE_TOKEN_REFRESH_FAILED",
                "token_refresh",
                exceptionType = error.javaClass.simpleName,
            )
            ShareAuthResult.WaitingForNetwork
        } finally {
            connection?.disconnect()
        }
    }

    private fun ShareSession.readyOrWaiting(): ShareAuthResult =
        if (accessToken.isNotBlank()) ShareAuthResult.Ready(accessToken) else ShareAuthResult.WaitingForAuth
}

internal object ShareNetwork {
    fun isAvailable(context: Context): Boolean {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        return manager.getNetworkCapabilities(network)
            ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
    }
}
