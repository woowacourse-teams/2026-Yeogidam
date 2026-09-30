package com.yeogidamm.app.share

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class ShareSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long,
    val userId: String,
) {
    fun toJson() = JSONObject().apply {
        put("accessToken", accessToken)
        put("refreshToken", refreshToken)
        put("expiresAt", expiresAt)
        put("userId", userId)
    }

    companion object {
        fun fromJson(json: JSONObject): ShareSession? {
            val access = json.optString("accessToken")
            val refresh = json.optString("refreshToken")
            val user = json.optString("userId")
            if (refresh.isBlank() || user.isBlank()) return null
            return ShareSession(access, refresh, json.optLong("expiresAt"), user)
        }
    }
}

internal object ShareAuthStore {
    private const val STORE = "share_auth_secure"
    private const val SESSION = "session"
    private const val HAD_SESSION = "had_session"
    private const val KEY_ALIAS = "yeogidam_share_session_v1"

    private fun preferences(context: Context) = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    @Synchronized
    fun load(context: Context): ShareSession? = runCatching {
        val encoded = preferences(context).getString(SESSION, null) ?: return null
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
        val json = JSONObject(String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8))
        ShareSession.fromJson(json)
    }.getOrNull()

    @Synchronized
    fun save(context: Context, session: ShareSession?): Boolean {
        if (session == null) {
            return preferences(context).edit().remove(SESSION).commit()
        }
        val current = load(context)
        // A delayed SDK callback must not replace a newer rotated refresh token.
        if (current?.userId == session.userId &&
            current.expiresAt >= session.expiresAt &&
            (current.accessToken.isNotBlank() || session.accessToken.isBlank()) &&
            !(session.accessToken.isBlank() && current.refreshToken != session.refreshToken &&
                current.expiresAt <= System.currentTimeMillis() / 1000 + 60)
        ) return true
        return runCatching {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val encrypted = cipher.doFinal(session.toJson().toString().toByteArray(Charsets.UTF_8))
            val encoded = Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
            preferences(context).edit().putString(SESSION, encoded).putBoolean(HAD_SESSION, true).commit()
        }.getOrDefault(false)
    }

    fun hadSession(context: Context) = preferences(context).getBoolean(HAD_SESSION, false)
}
