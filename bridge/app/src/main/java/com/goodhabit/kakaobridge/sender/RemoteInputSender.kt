package com.goodhabit.kakaobridge.sender

import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.os.Bundle
import android.util.Log
import com.goodhabit.kakaobridge.service.NotificationActionCache

/**
 * RemoteInput 기반 메시지 전송 엔진
 * 
 * Iris Replier.kt의 sendMessageInternal() 로직을 참고하여 구현
 * - RemoteInput.addResultsToIntent() 사용
 * - PendingIntent.send() 실행
 */
class RemoteInputSender(
    private val context: Context,
    private val notificationCache: NotificationActionCache
) : MessageSender {

    companion object {
        private const val TAG = "RemoteInputSender"
        private const val KAKAO_TALK_PACKAGE = "com.kakao.talk"
    }

    override suspend fun send(roomKey: String, text: String): SendResult {
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "send() called")
        Log.i(TAG, "  roomKey: \"$roomKey\"")
        Log.i(TAG, "  text: ${text.take(100)}${if (text.length > 100) "..." else ""}")
        Log.i(TAG, "  textLength: ${text.length}")

        // roomKey 정규화 (알림에서 추출한 roomKey와 매칭하기 위해)
        val normalizedRoomKey = roomKey.trim()

        // 1. roomKey에 대한 replyAction 캐시 조회
        val cachedAction = notificationCache.getReplyAction(normalizedRoomKey)
        if (cachedAction == null) {
            val availableKeys = notificationCache.getAllCachedRoomKeys()
            Log.w(TAG, "✗ No cached replyAction for roomKey: \"$normalizedRoomKey\"")
            Log.w(TAG, "  Available cached roomKeys (${availableKeys.size}):")
            availableKeys.forEach { key ->
                Log.w(TAG, "    - \"$key\"")
            }
            Log.w(TAG, "  → roomKey 매칭 실패! 서버에서 보낸 roomKey와 알림에서 추출한 roomKey가 일치하지 않습니다.")
            Log.w(TAG, "  → 해결 방법: 해당 채팅방으로 메시지를 받아서 알림을 생성하거나, roomKey를 정확히 일치시켜야 합니다.")
            return SendResult.WaitingNotification("채팅방 '$normalizedRoomKey'에 대한 알림이 없습니다. 카카오톡에서 해당 채팅방으로 메시지를 받으면 자동으로 전송됩니다.")
        }

        val (pendingIntent, remoteInputs) = cachedAction
        Log.d(TAG, "✓ Found cached replyAction")
        Log.d(TAG, "  pendingIntent: $pendingIntent")
        Log.d(TAG, "  remoteInputs count: ${remoteInputs.size}")
        remoteInputs.forEachIndexed { index, remoteInput ->
            Log.d(TAG, "    remoteInput[$index]: resultKey=${remoteInput.resultKey}, label=${remoteInput.label}")
        }

        // 2. RemoteInput 결과 Bundle 생성
        // Iris 코드: Bundle().putCharSequence("reply_message", msg)
        val resultsBundle = Bundle().apply {
            // RemoteInput의 resultKey를 키로 사용
            // 카카오톡의 경우 일반적으로 "reply_message" 또는 첫 번째 RemoteInput의 resultKey 사용
            val resultKey = remoteInputs.firstOrNull()?.resultKey ?: "reply_message"
            putCharSequence(resultKey, text)
            Log.d(TAG, "Created resultsBundle:")
            Log.d(TAG, "  resultKey: $resultKey")
            Log.d(TAG, "  text: ${text.take(50)}...")
        }

        // 3. RemoteInput 결과를 Intent에 주입
        // Iris 코드: RemoteInput.addResultsToIntent(arrayOf(remoteInput), this, results)
        val fillInIntent = android.content.Intent()
        try {
            RemoteInput.addResultsToIntent(remoteInputs, fillInIntent, resultsBundle)
            Log.d(TAG, "✓ Added RemoteInput results to intent")
        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to add RemoteInput results", e)
            return SendResult.FailedRetryable("RemoteInput 결과 주입 실패: ${e.message}")
        }

        // 4. PendingIntent.send() 실행
        // Iris 코드: AndroidHiddenApi.startService(intent)
        // 여기서는 PendingIntent.send()를 사용 (일반 Android API)
        return try {
            Log.d(TAG, "Attempting to send via PendingIntent.send()...")
            pendingIntent.send(context, 0, fillInIntent)
            Log.i(TAG, "✓✓✓ Message sent successfully via PendingIntent.send() ✓✓✓")
            Log.d(TAG, "═══════════════════════════════════════════════════════")
            SendResult.Success
        } catch (e: PendingIntent.CanceledException) {
            Log.e(TAG, "✗ PendingIntent was canceled", e)
            Log.d(TAG, "═══════════════════════════════════════════════════════")
            SendResult.FailedRetryable("PendingIntent 취소됨: ${e.message}", retryAfterMs = 5000)
        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to send message", e)
            Log.d(TAG, "═══════════════════════════════════════════════════════")
            SendResult.FailedRetryable("전송 실패: ${e.message}", retryAfterMs = 5000)
        }
    }
}

