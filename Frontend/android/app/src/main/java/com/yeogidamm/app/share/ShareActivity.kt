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
import java.util.UUID

class ShareActivity : AppCompatActivity() {
    private lateinit var statusLabel: TextView

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
            showResultAndFinish("공유한 인스타그램 게시물을 확인하지 못했어요. 다시 공유해 주세요.")
            return
        }

        val isPost = normalizedUrl.contains("/p/")
        val requestId = UUID.randomUUID().toString()
        val saved = ShareResultStore.saveResult(
            this,
            ShareReelResult(
                requestId = requestId,
                url = normalizedUrl,
                rawSharedText = rawText,
                status = "PENDING",
                retryable = true,
            ),
        )
        if (!saved) {
            showResultAndFinish("${if (isPost) "게시물을" else "릴스를"} 전달하지 못했어요. 다시 공유해 주세요.")
            return
        }

        Thread {
            val auth = ShareAuth.ensureAccessToken(this)
            val transferStatus = when (auth) {
                is ShareAuthResult.LoginRequired -> "LOGIN_REQUIRED"
                ShareAuthResult.WaitingForNetwork -> "WAITING_FOR_NETWORK"
                ShareAuthResult.WaitingForAuth -> "WAITING_FOR_AUTH"
                is ShareAuthResult.Ready -> "SAVED"
            }
            val updated = ShareResultStore.saveResult(
                this,
                ShareReelResult(
                    requestId = requestId,
                    url = normalizedUrl,
                    rawSharedText = rawText,
                    status = "PENDING",
                    transferStatus = transferStatus,
                    authReason = (auth as? ShareAuthResult.LoginRequired)?.reason,
                    retryable = auth !is ShareAuthResult.LoginRequired,
                ),
            )
            if (updated && auth !is ShareAuthResult.LoginRequired) {
                runCatching { ShareSaveWorker.enqueue(this, requestId, normalizedUrl, rawText) }
            }
            runOnUiThread {
                showResultAndFinish("${if (isPost) "게시물이" else "릴스가"} 잘 전달됐어요! 장소를 찾아볼게요.")
            }
        }.start()
    }

    private fun showResultAndFinish(message: String) {
        statusLabel.text = message
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
