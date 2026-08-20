package com.yeogidamm.app.share

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.util.Patterns
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.yeogidamm.app.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

class ShareActivity : AppCompatActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var statusLabel: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureContentView()
        processShare(intent)
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun configureContentView() {
        val density = resources.displayMetrics.density
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.argb(80, 0, 0, 0))
        }
        statusLabel = TextView(this).apply {
            text = "릴스 링크를 전달하고 있어요."
            textSize = 17f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(30, 30, 30))
            setPadding((24 * density).toInt(), (20 * density).toInt(), (24 * density).toInt(), (20 * density).toInt())
            background = GradientDrawable().apply {
                setColor(Color.rgb(250, 250, 250))
                cornerRadius = 16 * density
            }
        }
        root.addView(
            statusLabel,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER,
            ).apply {
                marginStart = (24 * density).toInt()
                marginEnd = (24 * density).toInt()
            },
        )
        setContentView(root)
    }

    private fun processShare(intent: Intent?) {
        val rawText = intent?.sharedText()
        val normalizedUrl = rawText?.let(::extractInstagramUrl)
        if (normalizedUrl == null) {
            showResultAndFinish("Instagram 게시물 링크를 확인하지 못했어요.")
            return
        }

        val requestId = UUID.randomUUID().toString()
        ShareResultStore.saveResult(
            this,
            ShareReelResult(
                requestId = requestId,
                url = normalizedUrl,
                rawSharedText = rawText,
                status = "PENDING",
                retryable = true,
            ),
        )

        executor.execute {
            submit(requestId, normalizedUrl, rawText)
            runOnUiThread { showResultAndFinish("릴스 링크가 전달됐어요.") }
        }
    }

    private fun submit(requestId: String, instagramUrl: String, rawText: String) {
        val token = ShareResultStore.accessToken(this)
        if (token.isNullOrBlank()) {
            ShareResultStore.saveResult(
                this,
                ShareReelResult(
                    requestId = requestId,
                    url = instagramUrl,
                    rawSharedText = rawText,
                    status = "FAILED",
                    failureReason = "AUTH401_001",
                    retryable = false,
                ),
            )
            return
        }

        val requestSentAt = System.currentTimeMillis()
        ShareResultStore.saveResult(
            this,
            ShareReelResult(
                requestId = requestId,
                requestSentAt = requestSentAt,
                url = instagramUrl,
                rawSharedText = rawText,
                status = "PENDING",
                retryable = true,
                updatedAt = requestSentAt,
            ),
        )

        var connection: HttpURLConnection? = null
        try {
            connection = URL("${BuildConfig.SUPABASE_URL}/functions/v1/save-instagram-reel")
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
                put("forceReprocess", false)
            }.toString()
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val response = runCatching { JSONObject(responseBody) }.getOrDefault(JSONObject())
            val nestedError = response.optJSONObject("error")

            if (responseCode !in 200..299) {
                val errorCode = response.optNullableString("errorCode")
                    ?: nestedError?.optNullableString("errorCode")
                val message = response.optNullableString("message")
                    ?: nestedError?.optNullableString("message")
                val reason = listOfNotNull(errorCode, message, "HTTP_$responseCode").joinToString(" | ")
                ShareResultStore.saveResult(
                    this,
                    ShareReelResult(
                        requestId = requestId,
                        requestSentAt = requestSentAt,
                        url = instagramUrl,
                        rawSharedText = rawText,
                        status = "FAILED",
                        reelId = response.optNullableString("reelId") ?: nestedError?.optNullableString("reelId"),
                        failureReason = reason,
                        retryable = response.optBoolean("retryable", nestedError?.optBoolean("retryable", responseCode >= 500) ?: (responseCode >= 500)),
                    ),
                )
                return
            }

            ShareResultStore.saveResult(
                this,
                ShareReelResult(
                    requestId = requestId,
                    requestSentAt = requestSentAt,
                    url = instagramUrl,
                    rawSharedText = rawText,
                    status = response.optString("status", "FAILED"),
                    reelId = response.optNullableString("reelId"),
                    failureReason = response.optNullableString("failureReason"),
                    retryable = response.optBoolean("retryable", false),
                    reused = if (response.has("reused") && !response.isNull("reused")) response.getBoolean("reused") else null,
                ),
            )
        } catch (error: Exception) {
            ShareResultStore.saveResult(
                this,
                ShareReelResult(
                    requestId = requestId,
                    requestSentAt = requestSentAt,
                    url = instagramUrl,
                    rawSharedText = rawText,
                    status = "FAILED",
                    failureReason = "CLIENT000_002 | ${error.javaClass.simpleName}: ${error.message.orEmpty()}",
                    retryable = true,
                ),
            )
        } finally {
            connection?.disconnect()
        }
    }

    private fun showResultAndFinish(message: String) {
        statusLabel.text = message
        statusLabel.postDelayed({ finish() }, 1_000)
    }
}

private fun Intent.sharedText(): String? {
    if (action != Intent.ACTION_SEND || type != "text/plain") return null
    return (getStringExtra(Intent.EXTRA_TEXT) ?: getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString())
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
}

private fun extractInstagramUrl(text: String): String? {
    val matcher = Patterns.WEB_URL.matcher(text)
    while (matcher.find()) {
        val candidate = matcher.group().trimEnd('.', ',', ')', ']', '}')
        val uri = runCatching { Uri.parse(candidate) }.getOrNull() ?: continue
        val host = uri.host?.lowercase()?.removePrefix("www.") ?: continue
        if (host != "instagram.com") continue

        val parts = uri.pathSegments.filter { it.isNotBlank() }
        val contentIndex = parts.indexOfFirst { it == "reel" || it == "p" }
        if (contentIndex < 0 || contentIndex + 1 >= parts.size) continue
        return "https://www.instagram.com/${parts[contentIndex]}/${parts[contentIndex + 1]}/"
    }
    return null
}

private fun JSONObject.optNullableString(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
