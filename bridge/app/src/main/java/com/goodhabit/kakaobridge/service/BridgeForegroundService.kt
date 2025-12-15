package com.goodhabit.kakaobridge.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.goodhabit.kakaobridge.MainActivity
import com.goodhabit.kakaobridge.R
import com.goodhabit.kakaobridge.queue.SendRequest
import com.goodhabit.kakaobridge.queue.SendRequestDao
import com.goodhabit.kakaobridge.queue.SendStatus
import com.goodhabit.kakaobridge.sender.RemoteInputSender
import com.goodhabit.kakaobridge.sender.MessageSender
import com.goodhabit.kakaobridge.accessibility.AccessibilitySender
import com.goodhabit.kakaobridge.accessibility.KakaoAutomationService
import com.goodhabit.kakaobridge.config.FeatureFlags
import com.goodhabit.kakaobridge.config.SelectorsConfig
import com.goodhabit.kakaobridge.websocket.BridgeWebSocketClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Foreground Service: WebSocket 연결 유지 및 명령 수신
 * 
 * Galaxy A16의 백그라운드 제한을 고려하여 Foreground Service로 운영
 */
class BridgeForegroundService : Service() {

    companion object {
        private const val TAG = "BridgeForegroundService"
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "bridge_foreground_channel"
        const val ACTION_SERVICE_STATE_CHANGED = "com.goodhabit.kakaobridge.SERVICE_STATE_CHANGED"
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var webSocketClient: BridgeWebSocketClient? = null
    private var sendRequestDao: SendRequestDao? = null
    private var remoteInputSender: RemoteInputSender? = null
    private var accessibilitySender: AccessibilitySender? = null
    private var activeSender: MessageSender? = null // 기능 플래그에 따라 선택된 전송 방식
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")

        // WakeLock 획득 (항상 깨어있도록)
        val powerManager = getSystemService(PowerManager::class.java)
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "KakaoBridge::WakeLock"
        ).apply {
            acquire(10 * 60 * 60 * 1000L /*10 hours*/)
            Log.d(TAG, "WakeLock acquired")
        }

        createNotificationChannel()
        updateNotification(true)

        // DB 및 Sender 초기화
        val db = com.goodhabit.kakaobridge.db.AppDatabase.getDatabase(this)
        sendRequestDao = db.sendRequestDao()
        
        // Selector 설정 로드
        SelectorsConfig.loadFromAssets(this)
        
        // 기능 플래그에 따라 전송 방식 선택
        val sendMethod = FeatureFlags.getActiveSendMethod(this)
        Log.i(TAG, "Active send method: ${sendMethod.name}")
        
        when (sendMethod) {
            FeatureFlags.SendMethod.ACCESSIBILITY -> {
                // 접근성 기반 전송 방식 (새로운 방식)
                val automationService = KakaoAutomationService.getInstance()
                if (automationService != null) {
                    accessibilitySender = AccessibilitySender(this, automationService)
                    activeSender = accessibilitySender
                    Log.i(TAG, "AccessibilitySender initialized")
                } else {
                    Log.w(TAG, "AccessibilityService not available, falling back to RemoteInputSender")
                    // Fallback to RemoteInputSender
                    val notificationCache = NotificationActionCache()
                    remoteInputSender = RemoteInputSender(this, notificationCache)
                    activeSender = remoteInputSender
                    
                    // 캐시 정리 태스크 시작
                    serviceScope.launch {
                        cleanupCachePeriodically(notificationCache)
                    }
                }
            }
            FeatureFlags.SendMethod.REMOTE_INPUT -> {
                // 알림 기반 전송 방식 (기존 방식)
                val notificationCache = NotificationActionCache()
                remoteInputSender = RemoteInputSender(this, notificationCache)
                activeSender = remoteInputSender
                Log.i(TAG, "RemoteInputSender initialized")
                
                // 캐시 정리 태스크 시작
                serviceScope.launch {
                    cleanupCachePeriodically(notificationCache)
                }
            }
        }

        // 서비스 상태 브로드캐스트 전송
        broadcastServiceState(true)

        // WebSocket 연결 시작
        serviceScope.launch {
            startWebSocketConnection()
        }

        // 재시도 큐 처리 시작
        serviceScope.launch {
            processRetryQueue()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service started")
        return START_STICKY // 서비스가 종료되면 자동 재시작
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        
        // 서비스 상태를 false로 설정 (이미 아래에서 호출됨)
        
        // WakeLock 해제
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "WakeLock released")
            }
        }
        wakeLock = null
        
        // 서비스 상태 브로드캐스트 전송
        broadcastServiceState(false)
        
        // SharedPreferences에도 상태 저장
        try {
            val prefs = getSharedPreferences("bridge_prefs", MODE_PRIVATE)
            prefs.edit().putBoolean("service_running", false).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save service state", e)
        }
        
        webSocketClient?.close()
        serviceScope.cancel()
    }

    /**
     * 알림 채널 생성
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_channel_description)
                setShowBadge(false)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * Foreground 알림 생성/업데이트
     */
    private fun updateNotification(isRunning: Boolean) {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(if (isRunning) getString(R.string.foreground_notification_title) else "KakaoBridge 서비스 중지됨")
            .setContentText(if (isRunning) getString(R.string.foreground_notification_text) else "서비스가 중지되었습니다")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(isRunning)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setShowWhen(false)
            .build()
        
        startForeground(NOTIFICATION_ID, notification)
    }
    
    /**
     * 서비스 상태 브로드캐스트 전송 및 SharedPreferences 업데이트
     */
    private fun broadcastServiceState(isRunning: Boolean) {
        // SharedPreferences에 상태 저장 (MainActivity에서 확인용)
        getSharedPreferences("bridge_prefs", MODE_PRIVATE)
            .edit()
            .putBoolean("service_running", isRunning)
            .apply()
        
        // 브로드캐스트 전송
        val intent = Intent(ACTION_SERVICE_STATE_CHANGED).apply {
            putExtra("isRunning", isRunning)
        }
        sendBroadcast(intent)
        Log.d(TAG, "Broadcasted service state: isRunning=$isRunning")
    }

    /**
     * WebSocket 연결 시작
     */
    private suspend fun startWebSocketConnection() {
        // TODO: SharedPreferences에서 WebSocket URL 읽기
        val wsUrl = getSharedPreferences("bridge_prefs", MODE_PRIVATE)
            .getString("websocket_url", "ws://211.218.42.222:5002/ws") ?: "ws://211.218.42.222:5002/ws"

        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "Connecting to WebSocket: $wsUrl")
        Log.i(TAG, "═══════════════════════════════════════════════════════")

        webSocketClient = BridgeWebSocketClient(
            url = wsUrl,
            onMessage = { message ->
                Log.d(TAG, "WebSocket message callback triggered")
                serviceScope.launch {
                    handleWebSocketMessage(message)
                }
            },
            onError = { error ->
                Log.e(TAG, "✗✗✗ WebSocket error callback", error)
            },
            onClose = {
                Log.w(TAG, "⚠ WebSocket closed callback, reconnecting in 5 seconds...")
                // 재연결 시도
                serviceScope.launch {
                    delay(5000)
                    startWebSocketConnection()
                }
            }
        )

        Log.i(TAG, "Calling webSocketClient.connect()...")
        try {
            webSocketClient?.connect()
            Log.i(TAG, "✓ webSocketClient.connect() called successfully")
        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to call webSocketClient.connect()", e)
        }
    }

    /**
     * WebSocket 메시지 처리
     */
    private suspend fun handleWebSocketMessage(message: String) {
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "Received WebSocket message: ${message.take(200)}${if (message.length > 200) "..." else ""}")

        try {
            val json = org.json.JSONObject(message)
            val type = json.optString("type")

            Log.d(TAG, "Message type: $type")

            when (type) {
                "send" -> {
                    val id = json.optString("id", UUID.randomUUID().toString())
                    var roomKey = json.optString("roomKey")
                    val text = json.optString("text")

                    // roomKey 정규화 (알림에서 추출한 roomKey와 매칭하기 위해)
                    roomKey = normalizeRoomKey(roomKey)

                    Log.i(TAG, "Processing send request:")
                    Log.i(TAG, "  id: $id")
                    Log.i(TAG, "  roomKey (normalized): \"$roomKey\"")
                    Log.i(TAG, "  textLength: ${text.length}")

                    if (roomKey.isBlank() || text.isBlank()) {
                        Log.w(TAG, "✗ Invalid send message: roomKey='$roomKey', text='${text.take(50)}'")
                        sendAck(id, "FAILED", "Invalid message: roomKey or text is empty")
                        return
                    }

                    // 중복 메시지 체크 (이미 처리 중이거나 완료된 메시지 무시)
                    val dao = sendRequestDao ?: run {
                        Log.e(TAG, "SendRequestDao is null, cannot process message: id=$id")
                        return
                    }
                    
                    val existingRequest = dao.getById(id)
                    if (existingRequest != null) {
                        Log.w(TAG, "⚠ Duplicate message detected, ignoring: id=$id, status=${existingRequest.status}")
                        // 이미 처리 중이거나 완료된 메시지는 무시
                        if (existingRequest.status == SendStatus.SENT || existingRequest.status == SendStatus.PENDING) {
                            Log.d(TAG, "Message already processed or processing, skipping: id=$id")
                            return
                        }
                    }

                    // 큐에 적재
                    val request = SendRequest(
                        id = id,
                        roomKey = roomKey,
                        text = text,
                        status = SendStatus.PENDING,
                        createdAt = System.currentTimeMillis(),
                        updatedAt = System.currentTimeMillis()
                    )

                    try {
                        dao.insert(request)
                        Log.d(TAG, "✓ Inserted request to queue: id=$id")
                    } catch (e: Exception) {
                        // Primary key 충돌 시 (이미 존재하는 경우)
                        Log.w(TAG, "⚠ Failed to insert (duplicate?): id=$id, error=${e.message}")
                        return
                    }

                    // 즉시 전송 시도
                    serviceScope.launch {
                        processSendRequest(request)
                    }
                }
                else -> {
                    Log.w(TAG, "Unknown message type: $type")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to parse WebSocket message: ${e.message}", e)
        }
        Log.i(TAG, "═══════════════════════════════════════════════════════")
    }
    
    /**
     * roomKey 정규화 (알림에서 추출한 roomKey와 매칭하기 위해)
     */
    private fun normalizeRoomKey(roomKey: String): String {
        var normalized = roomKey.trim()
        // 필요시 소문자로 변환 (대소문자 구분이 필요없는 경우)
        // normalized = normalized.lowercase()
        return normalized
    }

    /**
     * 전송 요청 처리
     * 
     * 기능 플래그에 따라 선택된 전송 방식 사용
     */
    private suspend fun processSendRequest(request: SendRequest) {
        val sender = activeSender ?: run {
            Log.e(TAG, "No active sender available, cannot process request: id=${request.id}")
            val dao = sendRequestDao ?: return
            val updated = request.copy(
                status = SendStatus.FAILED_FINAL,
                updatedAt = System.currentTimeMillis(),
                errorMessage = "No active sender available"
            )
            dao.update(updated)
            sendAck(request.id, "FAILED", "No active sender available")
            return
        }
        val dao = sendRequestDao ?: run {
            Log.e(TAG, "SendRequestDao is null, cannot process request: id=${request.id}")
            return
        }

        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "Processing send request:")
        Log.i(TAG, "  id: ${request.id}")
        Log.i(TAG, "  roomKey: \"${request.roomKey}\"")
        Log.i(TAG, "  textLength: ${request.text.length}")
        Log.i(TAG, "  text: ${request.text.take(100)}${if (request.text.length > 100) "..." else ""}")
        Log.i(TAG, "  sender type: ${sender.javaClass.simpleName}")

        try {
            val result = sender.send(request.roomKey, request.text)
            
            Log.i(TAG, "Send result for id=${request.id}: ${result.javaClass.simpleName}")

            when (result) {
                is com.goodhabit.kakaobridge.sender.SendResult.Success -> {
                    val updated = request.copy(
                        status = SendStatus.SENT,
                        updatedAt = System.currentTimeMillis()
                    )
                    dao.update(updated)
                    sendAck(request.id, "SENT")
                    Log.i(TAG, "✓ Message sent successfully: id=${request.id}, roomKey=${request.roomKey}")
                }
                is com.goodhabit.kakaobridge.sender.SendResult.WaitingNotification -> {
                    val updated = request.copy(
                        status = SendStatus.WAITING_NOTIFICATION,
                        updatedAt = System.currentTimeMillis(),
                        errorMessage = result.reason
                    )
                    dao.update(updated)
                    sendAck(request.id, "WAITING_NOTIFICATION", result.reason)
                    Log.d(TAG, "⏳ Waiting for notification: id=${request.id}, reason=${result.reason}")
                }
                is com.goodhabit.kakaobridge.sender.SendResult.FailedRetryable -> {
                    val retryCount = request.retryCount + 1
                    val nextRetryAt = result.retryAfterMs?.let {
                        System.currentTimeMillis() + it
                    } ?: calculateNextRetryTime(retryCount)

                    val updated = request.copy(
                        status = SendStatus.FAILED_RETRYABLE,
                        retryCount = retryCount,
                        nextRetryAt = nextRetryAt,
                        updatedAt = System.currentTimeMillis(),
                        errorMessage = result.reason
                    )
                    dao.update(updated)
                    sendAck(request.id, "FAILED", result.reason)
                    Log.w(TAG, "⚠ Failed (retryable): id=${request.id}, retryCount=$retryCount, reason=${result.reason}, nextRetryAt=$nextRetryAt")
                }
                is com.goodhabit.kakaobridge.sender.SendResult.FailedFinal -> {
                    val updated = request.copy(
                        status = SendStatus.FAILED_FINAL,
                        updatedAt = System.currentTimeMillis(),
                        errorMessage = result.reason
                    )
                    dao.update(updated)
                    sendAck(request.id, "FAILED", result.reason)
                    Log.e(TAG, "✗ Failed (final): id=${request.id}, reason=${result.reason}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Exception processing send request: id=${request.id}, error=${e.message}", e)
            val updated = request.copy(
                status = SendStatus.FAILED_RETRYABLE,
                retryCount = request.retryCount + 1,
                nextRetryAt = calculateNextRetryTime(request.retryCount + 1),
                updatedAt = System.currentTimeMillis(),
                errorMessage = e.message
            )
            dao.update(updated)
            sendAck(request.id, "FAILED", e.message ?: "Unknown error")
        }
    }

    /**
     * 재시도 큐 처리
     */
    private suspend fun processRetryQueue() {
        while (true) {
            try {
                val dao = sendRequestDao ?: continue
                val now = System.currentTimeMillis()

                // 재시도 가능한 요청 조회
                val retryableRequests = dao.getReadyToRetry(SendStatus.FAILED_RETRYABLE, now)

                for (request in retryableRequests) {
                    // 재시도 한계 확인 (최대 5회)
                    if (request.retryCount >= 5) {
                        val updated = request.copy(
                            status = SendStatus.FAILED_FINAL,
                            updatedAt = now,
                            errorMessage = "재시도 한계 초과"
                        )
                        dao.update(updated)
                        continue
                    }

                    // 재시도
                    processSendRequest(request)
                }

                delay(10000) // 10초마다 확인
            } catch (e: Exception) {
                Log.e(TAG, "Error processing retry queue", e)
                delay(10000)
            }
        }
    }

    /**
     * 재시도 시간 계산
     */
    private fun calculateNextRetryTime(retryCount: Int): Long {
        val delays = listOf(5000L, 20000L, 60000L, 180000L, 600000L)
        val delay = delays.getOrElse(retryCount - 1) { delays.last() }
        return System.currentTimeMillis() + delay
    }
    
    /**
     * 주기적으로 캐시 정리 (오래된 캐시 제거)
     * 30분마다 실행하여 2시간 이상 된 캐시 제거
     */
    private suspend fun cleanupCachePeriodically(cache: NotificationActionCache) {
        while (true) {
            try {
                Log.d(TAG, "Starting cache cleanup...")
                val beforeCount = cache.getAllCachedRoomKeys().size
                cache.removeOldCache(maxAgeMs = 7200000) // 2시간
                val afterCount = cache.getAllCachedRoomKeys().size
                val removedCount = beforeCount - afterCount
                
                if (removedCount > 0) {
                    Log.i(TAG, "Cache cleanup completed: removed $removedCount entries, remaining: $afterCount")
                } else {
                    Log.d(TAG, "Cache cleanup completed: no entries removed, total: $afterCount")
                }
                
                // 캐시 상태 로깅
                val cacheInfo = cache.getCacheInfo()
                Log.d(TAG, "Cache status: ${cacheInfo["totalEntries"]} entries")
                
                delay(1800000) // 30분마다 실행
            } catch (e: Exception) {
                Log.e(TAG, "Error during cache cleanup", e)
                delay(1800000)
            }
        }
    }

    /**
     * ACK 전송
     */
    private fun sendAck(id: String, status: String, detail: String? = null) {
        val ack = org.json.JSONObject().apply {
            put("type", "ack")
            put("id", id)
            put("status", status)
            if (detail != null) {
                put("detail", detail)
            }
            put("device", android.os.Build.MODEL)
            put("ts", System.currentTimeMillis())
        }

        val ackString = ack.toString()
        Log.d(TAG, "Sending ACK: $ackString")
        webSocketClient?.send(ackString) ?: Log.w(TAG, "WebSocket client is null, cannot send ACK")
    }
}

