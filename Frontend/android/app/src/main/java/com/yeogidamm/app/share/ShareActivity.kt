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
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.yeogidamm.app.BuildConfig
import org.json.JSONObject
import java.util.UUID

private const val GUEST_PRACTICE_POST_URL = "https://www.instagram.com/p/Db4gRWqkuUg/"

class ShareActivity : AppCompatActivity() {
    private lateinit var statusLabel: TextView
    private lateinit var loginButton: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureContentView()
        processShare(intent)
    }

    private fun configureContentView() {
        val density = resources.displayMetrics.density
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.argb(80, 0, 0, 0))
        }
        statusLabel = TextView(this).apply {
            text = "공유한 내용을 확인하고 있어요."
            textSize = 17f
            gravity = Gravity.CENTER
            isSingleLine = false
            ellipsize = null
            setTextColor(Color.rgb(30, 30, 30))
            setPadding((24 * density).toInt(), (20 * density).toInt(), (24 * density).toInt(), (20 * density).toInt())
            background = GradientDrawable().apply {
                setColor(Color.rgb(250, 250, 250))
                cornerRadius = 16 * density
            }
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(statusLabel)
        }
        loginButton = TextView(this).apply {
            text = "로그인하고 장소 추출하기"
            textSize = 16f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setPadding((20 * density).toInt(), (14 * density).toInt(), (20 * density).toInt(), (14 * density).toInt())
            background = GradientDrawable().apply {
                setColor(Color.rgb(86, 105, 224))
                cornerRadius = 12 * density
            }
            visibility = android.view.View.GONE
        }
        content.addView(loginButton)
        root.addView(
            content,
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
        val requestId = UUID.randomUUID().toString()
        ShareAnalyticsStore.record(this, "reel_share_received", requestId)
        val rawText = try {
            intent?.sharedText()
        } catch (_: Exception) {
            ShareSentryReporter.capture(this, "SHARE_PAYLOAD_READ_FAILED")
            showResultAndFinish("공유한 링크를 확인하지 못했어요. 다시 공유해 주세요.", requestId, "read_failed")
            return
        }
        val normalizedUrl = try {
            rawText?.let(::extractInstagramUrl)
        } catch (_: Exception) {
            ShareSentryReporter.capture(this, "SHARE_PAYLOAD_READ_FAILED")
            showResultAndFinish("공유한 링크를 확인하지 못했어요. 다시 공유해 주세요.", requestId, "read_failed")
            return
        }
        if (normalizedUrl == null) {
            ShareAnalyticsStore.record(this, "share_local_save_resolved", requestId,
                JSONObject().put("outcome", "invalid_link"))
            showResultAndFinish(
                "인스타그램 릴스 또는 게시물만 공유할 수 있어요.",
                requestId, "invalid_link",
            )
            return
        }

        val isPost = normalizedUrl.contains("/p/")
        Thread {
            val auth = ShareAuth.ensureAccessToken(this)
            if (isFinishing || isDestroyed) return@Thread
            if (auth is ShareAuthResult.LoginRequired && normalizedUrl == GUEST_PRACTICE_POST_URL) {
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    ShareAnalyticsStore.record(this, "share_local_save_resolved", requestId,
                        JSONObject().put("outcome", "guest_practice_success"))
                    showResultAndFinish("공유에 성공했어요.", requestId, "received")
                }
                return@Thread
            }
            if (auth is ShareAuthResult.LoginRequired) {
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    statusLabel.text = "장소를 추출하려면 로그인이 필요해요."
                    if (auth.reason == "never_logged_in") loginButton.text = "로그인하기"
                    loginButton.visibility = android.view.View.VISIBLE
                    loginButton.setOnClickListener {
                        val saved = runCatching {
                            ShareResultStore.saveResult(
                                this,
                                ShareReelResult(
                                    requestId = requestId, url = normalizedUrl, rawSharedText = rawText,
                                    status = "PENDING",
                                    transferStatus = if (auth.reason == "never_logged_in")
                                        "GUEST_LOGIN_PROMPT" else "LOGIN_HANDOFF",
                                    authReason = auth.reason, retryable = false,
                                    release = BuildConfig.VERSION_NAME,
                                ),
                            )
                        }.getOrDefault(false)
                        if (!saved) {
                            ShareSentryReporter.capture(this, "SHARE_PAYLOAD_STORE_FAILED", "login_handoff")
                            showResultAndFinish("링크를 저장하지 못했어요. 다시 공유해 주세요.", requestId, "save_failed")
                            return@setOnClickListener
                        }
                        ShareAnalyticsStore.record(this, "share_local_save_resolved", requestId,
                            JSONObject().put("outcome", "saved"))
                        try {
                            startActivity(Intent(this, com.yeogidamm.app.MainActivity::class.java).apply {
                                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            })
                            finish()
                        } catch (_: Exception) {
                            ShareSentryReporter.capture(this, "SHARE_LOGIN_APP_OPEN_FAILED", "login_handoff")
                            statusLabel.text = "여기담 앱을 열지 못했어요. 앱을 직접 열어 로그인해 주세요."
                        }
                    }
                }
                return@Thread
            }
            val hasNetwork = ShareNetwork.isAvailable(this)
            val transferStatus = when (auth) {
                ShareAuthResult.WaitingForNetwork -> "WAITING_FOR_NETWORK"
                ShareAuthResult.WaitingForAuth -> "WAITING_FOR_AUTH"
                is ShareAuthResult.Ready -> if (hasNetwork) "SAVED" else "WAITING_FOR_NETWORK"
                is ShareAuthResult.LoginRequired -> return@Thread
            }
            if (isFinishing || isDestroyed) return@Thread
            val updated = runCatching {
                ShareResultStore.saveResult(
                    this,
                    ShareReelResult(
                        requestId = requestId,
                        url = normalizedUrl,
                        rawSharedText = rawText,
                        status = "PENDING",
                        transferStatus = transferStatus,
                        authReason = (auth as? ShareAuthResult.LoginRequired)?.reason,
                        retryable = true,
                        release = BuildConfig.VERSION_NAME,
                    ),
                )
            }.getOrDefault(false)
            val queued = updated && transferStatus == "SAVED" &&
                runCatching { ShareSaveWorker.enqueue(this, requestId) }
                    .getOrDefault(false)
            if (auth is ShareAuthResult.WaitingForNetwork) {
                ShareAnalyticsStore.recordDeliveryStatus(this, requestId, "deferred", "network_unavailable")
            } else if (auth is ShareAuthResult.WaitingForAuth) {
                ShareAnalyticsStore.recordDeliveryStatus(this, requestId, "deferred", "auth_pending")
            }
            if (!updated || (transferStatus == "SAVED" && !queued)) {
                if (!updated) {
                    ShareSentryReporter.capture(this, "SHARE_PAYLOAD_STORE_FAILED")
                }
                val reason = when {
                    !updated -> "queue_registration_failed"
                    else -> "queue_registration_failed"
                }
                ShareAnalyticsStore.recordDeliveryStatus(this, requestId, "deferred", reason)
            }
            runOnUiThread {
                showResultAndFinish(
                    if (updated) "링크를 받았어요. 여기담 앱에서 확인해 주세요."
                    else "${if (isPost) "게시물을" else "릴스를"} 전달하지 못했어요. 다시 공유해 주세요.",
                    requestId, if (updated) "received" else "save_failed",
                )
            }
        }.start()
    }

    private fun showResultAndFinish(
        message: String, requestId: String, feedbackType: String,
    ) {
        statusLabel.text = message
        ShareAnalyticsStore.record(
            this, "reel_share_feedback_viewed", requestId,
            JSONObject().put("feedback_type", feedbackType),
        )
        statusLabel.postDelayed({ finish() }, 2_000L)
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
