package com.yeogidamm.app.share

import android.content.Intent
import android.util.Patterns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.util.UUID

internal data class ShareIntentPayload(
    val id: String = UUID.randomUUID().toString(),
    val action: String,
    val mimeType: String,
    val text: String,
    val subject: String?,
    val kind: String,
    val receivedAt: Long = System.currentTimeMillis(),
) {
    fun toWritableMap(): WritableMap =
        Arguments.createMap().apply {
            putString("id", id)
            putString("action", action)
            putString("mimeType", mimeType)
            putString("text", text)
            putString("subject", subject)
            putString("kind", kind)
            putDouble("receivedAt", receivedAt.toDouble())
        }
}

internal object ShareIntentCoordinator {
    private var pendingShare: ShareIntentPayload? = null
    private var shareIntentModule: ShareIntentModule? = null

    @Synchronized
    fun setModule(module: ShareIntentModule?) {
        shareIntentModule = module
    }

    @Synchronized
    fun getPendingShare(): ShareIntentPayload? = pendingShare

    @Synchronized
    fun clearPendingShare(shareId: String?) {
        if (shareId == null || pendingShare?.id == shareId) {
            pendingShare = null
        }
    }

    @Synchronized
    fun handleIntent(intent: Intent?): Boolean {
        val payload = parseIntent(intent) ?: return false

        pendingShare = payload
        shareIntentModule?.emitShareIntent(payload)
        return true
    }

    private fun parseIntent(intent: Intent?): ShareIntentPayload? {
        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") {
            return null
        }

        val text =
            (
                intent.getStringExtra(Intent.EXTRA_TEXT)
                    ?: intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
                )
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?: return null

        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim()?.takeIf { it.isNotEmpty() }
        val kind = if (Patterns.WEB_URL.matcher(text).find()) "url" else "text"

        return ShareIntentPayload(
            action = intent.action ?: Intent.ACTION_SEND,
            mimeType = intent.type ?: "text/plain",
            text = text,
            subject = subject,
            kind = kind,
        )
    }
}
