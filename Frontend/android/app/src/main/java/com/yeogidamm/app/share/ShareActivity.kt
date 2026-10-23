package com.yeogidamm.app.share

import android.content.Intent
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.util.Patterns
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.widget.TextViewCompat
import com.yeogidamm.app.R
import com.yeogidamm.app.BuildConfig
import org.json.JSONObject
import java.util.UUID

private const val GUEST_PRACTICE_POST_URL = "https://www.instagram.com/p/Db4gRWqkuUg/"

private enum class ResultCard { SUCCESS, LOGIN_REQUIRED, FAILURE }

private const val RESULT_AUTO_FINISH_MILLIS = 4_000L

/** 카드 안 문구와 버튼 글자의 기준 크기(sp)입니다. */
private const val CARD_TEXT_SIZE_SP = 16

class ShareActivity : AppCompatActivity() {
    private lateinit var card: LinearLayout
    private lateinit var mascotView: ImageView
    private lateinit var messageLabel: TextView
    private lateinit var actionButton: TextView
    private var cardShown = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureContentView()
        processShare(intent)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    /** 화면 하단에 결과 카드(마스코트, 문구, 버튼)만 보여주고, 카드 바깥을 누르면 닫습니다. */
    private fun configureContentView() {
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.argb(80, 0, 0, 0))
            setOnClickListener { finish() }
        }

        mascotView = ImageView(this).apply {
            setImageResource(R.drawable.share_mascot)
            scaleType = ImageView.ScaleType.CENTER_CROP
            // 앱 아이콘 배경색이 원형 후광처럼 보이도록 원으로 잘라 씁니다.
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setOval(0, 0, view.width, view.height)
                }
            }
            clipToOutline = true
        }
        messageLabel = TextView(this).apply {
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.BLACK)
            maxLines = 1
            setPadding(dp(10), 0, dp(8), 0)
            // 한 줄에 다 들어오도록, 길면 글자 크기를 줄입니다. 최대 크기는 버튼 글자와 같습니다.
            TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(
                this, 12, CARD_TEXT_SIZE_SP, 1, TypedValue.COMPLEX_UNIT_SP,
            )
        }
        actionButton = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, CARD_TEXT_SIZE_SP.toFloat())
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.BLACK)
            gravity = Gravity.CENTER
            minWidth = dp(76)
            setPadding(dp(14), 0, dp(14), 0)
            background = GradientDrawable().apply {
                setColor(Color.WHITE)
                cornerRadius = dp(10).toFloat()
            }
            elevation = dp(2).toFloat()
        }

        card = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), 0, dp(12), 0)
            background = GradientDrawable().apply {
                setColor(Color.rgb(218, 223, 250))
                cornerRadius = dp(20).toFloat()
            }
            // 카드를 눌러도 바깥 영역의 닫기 동작이 실행되지 않게 합니다.
            isClickable = true
            alpha = 0f
            translationY = dp(24).toFloat()
            addView(mascotView, LinearLayout.LayoutParams(dp(48), dp(48)))
            addView(messageLabel, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(actionButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)))
        }
        root.addView(
            card,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(72), Gravity.BOTTOM).apply {
                marginStart = dp(16)
                marginEnd = dp(16)
                bottomMargin = dp(16)
            },
        )
        // 제스처 내비게이션 바와 겹치지 않도록 시스템 바 높이만큼 띄웁니다.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)
    }

    /** 결과 카드를 보여줍니다. 처음 나타날 때만 아래에서 위로 올라옵니다. */
    private fun showCard(kind: ResultCard, message: String, buttonTitle: String, onAction: () -> Unit) {
        mascotView.setImageResource(
            if (kind == ResultCard.LOGIN_REQUIRED) R.drawable.share_mascot_sad else R.drawable.share_mascot,
        )
        messageLabel.text = message
        actionButton.text = buttonTitle
        actionButton.setOnClickListener { onAction() }
        if (cardShown) return
        cardShown = true
        card.animate().alpha(1f).translationY(0f).setDuration(250L).start()
    }

    /** 앱을 엽니다. 열지 못하면 직접 열어 달라는 안내 카드로 바꿉니다. */
    private fun openApp(failureMessage: String, stage: String) {
        try {
            startActivity(Intent(this, com.yeogidamm.app.MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            })
            finish()
        } catch (_: Exception) {
            ShareSentryReporter.capture(this, "SHARE_LOGIN_APP_OPEN_FAILED", stage)
            showCard(ResultCard.FAILURE, failureMessage, "닫기") { finish() }
        }
    }

    private fun processShare(intent: Intent?) {
        val requestId = UUID.randomUUID().toString()
        ShareAnalyticsStore.record(this, "reel_share_received", requestId)
        val rawText = try {
            intent?.sharedText()
        } catch (_: Exception) {
            ShareSentryReporter.capture(this, "SHARE_PAYLOAD_READ_FAILED")
            showResultAndFinish("링크를 확인하지 못했어요", requestId, "read_failed", ResultCard.FAILURE)
            return
        }
        val normalizedUrl = try {
            rawText?.let(::extractInstagramUrl)
        } catch (_: Exception) {
            ShareSentryReporter.capture(this, "SHARE_PAYLOAD_READ_FAILED")
            showResultAndFinish("링크를 확인하지 못했어요", requestId, "read_failed", ResultCard.FAILURE)
            return
        }
        if (normalizedUrl == null) {
            ShareAnalyticsStore.record(this, "share_local_save_resolved", requestId,
                JSONObject().put("outcome", "invalid_link"))
            showResultAndFinish(
                "릴스·게시물만 공유할 수 있어요",
                requestId, "invalid_link", ResultCard.FAILURE, outcome = "failed", reason = "invalid_link",
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
                    showResultAndFinish("공유 완료!", requestId, "received", ResultCard.SUCCESS)
                }
                return@Thread
            }
            if (auth is ShareAuthResult.LoginRequired) {
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    showCard(ResultCard.LOGIN_REQUIRED, "로그인 해주세요", "로그인") {
                        onLoginClicked(requestId, normalizedUrl, rawText, auth)
                    }
                    recordOutcomeViewed(requestId, "login_required", loginRequiredReason(auth.reason))
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
                    if (updated) "공유 완료!"
                    else if (isPost) "게시물을 전달하지 못했어요" else "릴스를 전달하지 못했어요",
                    requestId, if (updated) "received" else "save_failed",
                    if (updated) ResultCard.SUCCESS else ResultCard.FAILURE,
                    outcome = if (updated) "accepted" else "failed",
                    reason = if (updated) null else "save_failed",
                )
            }
        }.start()
    }

    /** [outcome]이 null이면 `reel_share_outcome_viewed`를 기록하지 않습니다(예: 가입 전 체험 게시물). */
    private fun showResultAndFinish(
        message: String, requestId: String, feedbackType: String, kind: ResultCard,
        outcome: String? = null, reason: String? = null,
    ) {
        if (kind == ResultCard.SUCCESS) {
            showCard(kind, message, "앱에서 보기") {
                openApp("앱을 직접 열어 주세요", "result_open")
            }
        } else {
            showCard(kind, message, "닫기") { finish() }
        }
        ShareAnalyticsStore.record(
            this, "reel_share_feedback_viewed", requestId,
            JSONObject().put("feedback_type", feedbackType),
        )
        outcome?.let { recordOutcomeViewed(requestId, it, reason) }
        // 로그인 안내와 달리 결과 안내는 잠시 뒤 스스로 닫힙니다.
        card.postDelayed({ if (!isFinishing && !isDestroyed) finish() }, RESULT_AUTO_FINISH_MILLIS)
    }

    /** 로그인을 위해 앱으로 넘기기 전에 공유한 링크를 저장하고 앱을 엽니다. */
    private fun onLoginClicked(
        requestId: String, normalizedUrl: String, rawText: String?, auth: ShareAuthResult.LoginRequired,
    ) {
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
            showResultAndFinish(
                "링크를 저장하지 못했어요",
                requestId, "save_failed", ResultCard.FAILURE, outcome = "failed", reason = "save_failed",
            )
            return
        }
        ShareAnalyticsStore.record(this, "share_local_save_resolved", requestId,
            JSONObject().put("outcome", "saved"))
        openApp("앱을 직접 열어 로그인하세요", "login_handoff")
    }

    private fun recordOutcomeViewed(requestId: String, outcome: String, reason: String?) {
        ShareAnalyticsStore.record(
            this, "reel_share_outcome_viewed", requestId,
            JSONObject().put("outcome", outcome).apply { reason?.let { put("reason", it) } },
        )
    }

    /** 세션이 처음부터 없던 경우만 `no_session`으로 구분하고, 나머지는 확인된 사유를 그대로 씁니다. */
    private fun loginRequiredReason(authReason: String): String =
        if (authReason == "never_logged_in") "no_session" else authReason
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
