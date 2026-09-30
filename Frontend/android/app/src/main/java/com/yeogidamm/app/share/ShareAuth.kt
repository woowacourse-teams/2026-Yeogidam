package com.yeogidamm.app.share

import android.content.Context
import com.yeogidamm.app.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

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
        if (!forceRefresh && session.accessToken.isNotBlank() &&
            session.expiresAt > System.currentTimeMillis() / 1000 + 60
        ) {
            return ShareAuthResult.Ready(session.accessToken)
        }
        var connection: HttpURLConnection? = null
        return try {
            connection = URL("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token")
                .openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 12_000
            connection.readTimeout = 12_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY)
            val body = JSONObject().put("refresh_token", session.refreshToken).toString()
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val response = runCatching {
                JSONObject(stream?.bufferedReader()?.use { it.readText() }.orEmpty())
            }.getOrDefault(JSONObject())

            if (code in 200..299) {
                val latest = ShareAuthStore.load(context)
                if (latest?.refreshToken != session.refreshToken && latest != null) {
                    return if (latest.accessToken.isNotBlank()) ShareAuthResult.Ready(latest.accessToken)
                    else ShareAuthResult.WaitingForAuth
                }
                val access = response.optString("access_token")
                val refresh = response.optString("refresh_token")
                if (access.isBlank() || refresh.isBlank()) return ShareAuthResult.WaitingForAuth
                val expiresAt = response.optLong("expires_at").takeIf { it > 0 }
                    ?: (System.currentTimeMillis() / 1000 + response.optLong("expires_in"))
                if (!ShareAuthStore.save(context, ShareSession(access, refresh, expiresAt, session.userId))) {
                    return ShareAuthResult.WaitingForAuth
                }
                ShareAuthResult.Ready(access)
            } else {
                val errorCode = response.optString("error_code", response.optString("code"))
                val invalid = code in 400..401 && errorCode in setOf(
                    "refresh_token_not_found", "refresh_token_already_used", "invalid_grant", "session_not_found",
                )
                if (invalid) {
                    val latest = ShareAuthStore.load(context)
                    if (latest != null && latest.refreshToken != session.refreshToken) {
                        if (latest.accessToken.isNotBlank()) ShareAuthResult.Ready(latest.accessToken)
                        else ShareAuthResult.WaitingForAuth
                    } else {
                        ShareAuthStore.save(context, null)
                        ShareAuthResult.LoginRequired("refresh_token_invalid")
                    }
                } else ShareAuthResult.WaitingForAuth
            }
        } catch (_: Exception) {
            ShareAuthResult.WaitingForNetwork
        } finally {
            connection?.disconnect()
        }
    }
}
