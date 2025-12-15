package com.goodhabit.kakaobridge.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.goodhabit.kakaobridge.db.AppDatabase
import com.goodhabit.kakaobridge.queue.SendRequest
import com.goodhabit.kakaobridge.queue.SendStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * BroadcastReceiver: 로컬 테스트용
 * 
 * Termux/adb에서 am broadcast로 전송 명령 전달 가능
 */
class BridgeCommandReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BridgeCommandReceiver"
        private const val ACTION_SEND = "com.goodhabit.kakaobridge.SEND"
        private const val EXTRA_TOKEN = "token"
        private const val EXTRA_ROOM_KEY = "roomKey"
        private const val EXTRA_TEXT = "text"
        
        // 로컬 개발용 토큰 (운영 환경에서는 암호화된 토큰 사용)
        private const val LOCAL_DEV_TOKEN = "LOCAL_DEV_TOKEN"
    }

    private val receiverScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SEND) {
            return
        }

        Log.d(TAG, "Received broadcast: ${intent.action}")

        // 토큰 검증
        val token = intent.getStringExtra(EXTRA_TOKEN)
        if (token != LOCAL_DEV_TOKEN) {
            Log.w(TAG, "Invalid token, ignoring broadcast")
            return
        }

        val roomKey = intent.getStringExtra(EXTRA_ROOM_KEY)
        val text = intent.getStringExtra(EXTRA_TEXT)

        if (roomKey.isNullOrBlank() || text.isNullOrBlank()) {
            Log.w(TAG, "Invalid parameters: roomKey=$roomKey, text=$text")
            return
        }

        Log.d(TAG, "Processing send request: roomKey=$roomKey, text=${text.take(50)}...")

        // 큐에 적재
        receiverScope.launch {
            val db = AppDatabase.getDatabase(context)
            val request = SendRequest(
                id = UUID.randomUUID().toString(),
                roomKey = roomKey,
                text = text,
                status = SendStatus.PENDING,
                createdAt = System.currentTimeMillis(),
                updatedAt = System.currentTimeMillis()
            )

            db.sendRequestDao().insert(request)
            Log.i(TAG, "Request queued: id=${request.id}")

            // 즉시 전송 시도 (NotificationListenerService가 처리)
            // 또는 ForegroundService가 처리
        }
    }
}

