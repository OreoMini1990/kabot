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
    private var reconnectJob: kotlinx.coroutines.Job? = null
    private var reconnectAttempts = 0
    private val MAX_RECONNECT_ATTEMPTS = 10

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "🚀🚀🚀 BridgeForegroundService.onCreate() 호출됨 🚀🚀🚀")
        Log.i(TAG, "═══════════════════════════════════════════════════════")

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
        
        // 접근성 서비스가 활성화되어 있는지 확인 (AccessibilityManager 사용)
        val isAccessibilityEnabled = KakaoAutomationService.isServiceEnabled(this)
        val automationServiceInstance = KakaoAutomationService.getInstance()
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "Checking AccessibilityService:")
        Log.i(TAG, "  isServiceEnabled(context): $isAccessibilityEnabled")
        Log.i(TAG, "  getInstance() != null: ${automationServiceInstance != null}")
        
        // 하이브리드 모드: RemoteInput 우선, 알림이 없으면 Accessibility로 fallback
        // FeatureFlags 명시적으로 하이브리드 모드로 설정 (둘 다 활성화)
        FeatureFlags.setAccessibilitySendEnabled(this, true)
        FeatureFlags.setRemoteInputSendEnabled(this, true)
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "HYBRID MODE: RemoteInput 우선, Accessibility fallback")
        Log.i(TAG, "  Strategy: Try RemoteInput first, fallback to Accessibility if no notification")
        Log.i(TAG, "  FeatureFlags 설정:")
        Log.i(TAG, "    isRemoteInputEnabled: ${FeatureFlags.isRemoteInputSendEnabled(this)}")
        Log.i(TAG, "    isAccessibilityEnabled: ${FeatureFlags.isAccessibilitySendEnabled(this)}")
        Log.i(TAG, "    isHybridMode: ${FeatureFlags.isHybridMode(this)}")
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        
        // 두 sender 모두 초기화
        // 1. RemoteInputSender 초기화 (항상)
        // NotificationActionCache는 싱글톤이므로 직접 사용
        remoteInputSender = RemoteInputSender(this, NotificationActionCache)
        Log.i(TAG, "✓ RemoteInputSender initialized")
        
        // 캐시 정리 태스크 시작
        serviceScope.launch {
            cleanupCachePeriodically(NotificationActionCache)
        }
        
        // 2. AccessibilitySender 초기화 (접근성 서비스가 활성화되어 있으면)
        if (isAccessibilityEnabled) {
            val automationService = KakaoAutomationService.getInstance()
            if (automationService != null) {
                accessibilitySender = AccessibilitySender(this, automationService)
                Log.i(TAG, "✓ AccessibilitySender initialized (service connected)")
            } else {
                Log.i(TAG, "⚠ AccessibilityService enabled but not connected yet")
                Log.i(TAG, "  AccessibilitySender will be initialized when service connects")
            }
        } else {
            Log.w(TAG, "⚠ AccessibilityService NOT enabled in settings")
            Log.w(TAG, "  Fallback to Accessibility will not be available")
            Log.w(TAG, "  To enable: Settings > Accessibility > Installed services > KakaoBridge")
        }
        
        // 기본 sender는 RemoteInputSender (우선 사용)
        activeSender = remoteInputSender
        
        Log.i(TAG, "Final configuration:")
        Log.i(TAG, "  Primary sender: RemoteInputSender (notification reply)")
        Log.i(TAG, "  Fallback sender: AccessibilitySender (if enabled)")
        Log.i(TAG, "  RemoteInputSender available: ${remoteInputSender != null}")
        Log.i(TAG, "  AccessibilitySender available: ${accessibilitySender != null}")
        Log.i(TAG, "  Strategy: Try RemoteInput → if WaitingNotification → use Accessibility")
        Log.i(TAG, "═══════════════════════════════════════════════════════")

        // 서비스 상태 브로드캐스트 전송
        broadcastServiceState(true)

        // WebSocket 연결 시작
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "📡 WebSocket 연결 시작 예약")
        Log.i(TAG, "  serviceScope: ${serviceScope}")
        Log.i(TAG, "  Dispatchers.Main: ${kotlinx.coroutines.Dispatchers.Main}")
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        
        serviceScope.launch {
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "📡📡📡 WebSocket 연결 코루틴 시작 📡📡📡")
            Log.i(TAG, "  현재 스레드: ${Thread.currentThread().name}")
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            startWebSocketConnection()
        }

        // 재시도 큐 처리 시작
        serviceScope.launch {
            processRetryQueue()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "▶▶▶ BridgeForegroundService.onStartCommand() 호출됨 ▶▶▶")
        Log.i(TAG, "  intent: $intent")
        Log.i(TAG, "  flags: $flags")
        Log.i(TAG, "  startId: $startId")
        Log.i(TAG, "  webSocketClient != null: ${webSocketClient != null}")
        Log.i(TAG, "═══════════════════════════════════════════════════════")
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
        
        reconnectJob?.cancel()
        reconnectJob = null
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
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "📡📡📡 startWebSocketConnection() 시작 📡📡📡")
        Log.i(TAG, "  현재 스레드: ${Thread.currentThread().name}")
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        
        // TODO: SharedPreferences에서 WebSocket URL 읽기
        val wsUrl = getSharedPreferences("bridge_prefs", MODE_PRIVATE)
            .getString("websocket_url", "ws://211.218.42.222:5002/ws") ?: "ws://211.218.42.222:5002/ws"

        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "🔌 WebSocket 연결 시도")
        Log.i(TAG, "  URL: $wsUrl")
        Log.i(TAG, "  기존 webSocketClient != null: ${webSocketClient != null}")
        Log.i(TAG, "═══════════════════════════════════════════════════════")

        webSocketClient = BridgeWebSocketClient(
            url = wsUrl,
            onMessage = { message ->
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                Log.i(TAG, "🔔🔔🔔 WebSocket message callback triggered 🔔🔔🔔")
                Log.i(TAG, "  Message length: ${message.length}")
                Log.i(TAG, "  Message preview: ${message.take(200)}${if (message.length > 200) "..." else ""}")
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                // 메시지를 받으면 재연결 시도 횟수 초기화
                reconnectAttempts = 0
                serviceScope.launch {
                    handleWebSocketMessage(message)
                }
            },
            onError = { error ->
                Log.e(TAG, "✗✗✗ WebSocket error callback", error)
                Log.e(TAG, "Error details: ${error.message}", error)
                // 에러 발생 시 재연결 시도
                scheduleReconnect()
            },
            onClose = {
                Log.w(TAG, "⚠ WebSocket closed callback")
                // 연결 종료 시 재연결 시도
                scheduleReconnect()
            }
        )

        Log.i(TAG, "Calling webSocketClient.connect()...")
        Log.i(TAG, "  webSocketClient != null: ${webSocketClient != null}")
        try {
            webSocketClient?.connect()
            Log.i(TAG, "✓ webSocketClient.connect() called successfully")
            Log.i(TAG, "  Waiting for onOpen callback...")
        } catch (e: Exception) {
            Log.e(TAG, "═══════════════════════════════════════════════════════")
            Log.e(TAG, "✗✗✗ Failed to call webSocketClient.connect() ✗✗✗")
            Log.e(TAG, "  오류: ${e.message}")
            Log.e(TAG, "  스택 트레이스:", e)
            Log.e(TAG, "═══════════════════════════════════════════════════════")
            scheduleReconnect()
        }
    }
    
    /**
     * WebSocket 재연결 스케줄링
     */
    private fun scheduleReconnect() {
        // 기존 재연결 작업 취소
        reconnectJob?.cancel()
        
        reconnectAttempts++
        
        if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            Log.e(TAG, "✗✗✗ 최대 재연결 시도 횟수 초과 (${MAX_RECONNECT_ATTEMPTS}회). 재연결 중단.")
            reconnectAttempts = 0 // 다음 수동 연결을 위해 초기화
            return
        }
        
        // 지수 백오프: 5초, 10초, 20초, 40초... 최대 60초
        val delayMs = minOf(5000L * (1 shl (reconnectAttempts - 1)), 60000L)
        
        Log.w(TAG, "⚠ WebSocket 재연결 시도 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} (${delayMs}ms 후)")
        
        reconnectJob = serviceScope.launch {
            delay(delayMs)
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "재연결 시도 시작...")
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            startWebSocketConnection()
        }
    }

    /**
     * WebSocket 메시지 처리
     */
    private suspend fun handleWebSocketMessage(message: String) {
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "📨📨📨 handleWebSocketMessage 호출됨 📨📨📨")
        Log.i(TAG, "  Message length: ${message.length}")
        Log.i(TAG, "  Message preview: ${message.take(200)}${if (message.length > 200) "..." else ""}")
        Log.i(TAG, "═══════════════════════════════════════════════════════")

        try {
            val json = org.json.JSONObject(message)
            val type = json.optString("type")

            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "JSON 파싱 성공:")
            Log.i(TAG, "  type: \"$type\"")
            Log.i(TAG, "  JSON keys: ${json.keys().asSequence().joinToString(", ")}")
            Log.i(TAG, "═══════════════════════════════════════════════════════")

            when (type) {
                "send" -> {
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    Log.i(TAG, "✓✓✓ type='send' 메시지 처리 시작 ✓✓✓")
                    
                    val id = json.optString("id", UUID.randomUUID().toString())
                    var roomKey = json.optString("roomKey")
                    val text = json.optString("text")
                    val imageUrl = json.optString("imageUrl", "").takeIf { it.isNotBlank() }
                    
                    Log.i(TAG, "  원본 파라미터:")
                    Log.i(TAG, "    id: \"$id\"")
                    Log.i(TAG, "    roomKey (raw): \"$roomKey\" (길이: ${roomKey.length})")
                    Log.i(TAG, "    text: \"${text.take(50)}${if (text.length > 50) "..." else ""}\"")
                    Log.i(TAG, "    imageUrl: ${imageUrl ?: "null"}")

                    // roomKey 정규화 (알림에서 추출한 roomKey와 매칭하기 위해)
                    val originalRoomKey = roomKey
                    roomKey = normalizeRoomKey(roomKey)
                    
                    Log.i(TAG, "  roomKey 정규화:")
                    Log.i(TAG, "    원본: \"$originalRoomKey\" (길이: ${originalRoomKey.length})")
                    Log.i(TAG, "    정규화: \"$roomKey\" (길이: ${roomKey.length})")
                    
                    // 현재 캐시 상태 확인
                    val notificationCache = (remoteInputSender as? com.goodhabit.kakaobridge.sender.RemoteInputSender)?.let {
                        // RemoteInputSender의 notificationCache에 접근할 수 없으므로
                        // 로그만 출력 (실제 캐시 확인은 RemoteInputSender에서 수행)
                    }
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    Log.i(TAG, "Processing send request:")
                    Log.i(TAG, "  id: $id")
                    Log.i(TAG, "  roomKey (normalized): \"$roomKey\"")
                    Log.i(TAG, "  textLength: ${text.length}")
                    Log.i(TAG, "  text: ${text.take(50)}${if (text.length > 50) "..." else ""}")
                    if (imageUrl != null) {
                        Log.i(TAG, "  ═══ IMAGE URL DETECTED ═══")
                        Log.i(TAG, "  imageUrl: $imageUrl")
                    } else {
                        Log.i(TAG, "  imageUrl: null (no image)")
                    }
                    Log.i(TAG, "═══════════════════════════════════════════════════════")

                    if (roomKey.isBlank() || (text.isBlank() && imageUrl == null)) {
                        Log.w(TAG, "✗ Invalid send message: roomKey='$roomKey', text='${text.take(50)}', imageUrl=$imageUrl")
                        sendAck(id, "FAILED", "Invalid message: roomKey is empty or both text and imageUrl are empty")
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
                        updatedAt = System.currentTimeMillis(),
                        imageUrl = imageUrl
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
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    Log.i(TAG, "🚀🚀🚀 processSendRequest 호출 시작 🚀🚀🚀")
                    Log.i(TAG, "  request.id: ${request.id}")
                    Log.i(TAG, "  request.roomKey: \"${request.roomKey}\"")
                    Log.i(TAG, "  request.text.length: ${request.text.length}")
                    Log.i(TAG, "  request.imageUrl: ${request.imageUrl ?: "null"}")
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    
                    serviceScope.launch {
                        processSendRequest(request)
                    }
                }
                else -> {
                    Log.w(TAG, "═══════════════════════════════════════════════════════")
                    Log.w(TAG, "⚠⚠⚠ Unknown message type: \"$type\" ⚠⚠⚠")
                    Log.w(TAG, "  전체 메시지: $message")
                    Log.w(TAG, "═══════════════════════════════════════════════════════")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "═══════════════════════════════════════════════════════")
            Log.e(TAG, "✗✗✗ Failed to parse WebSocket message ✗✗✗")
            Log.e(TAG, "  오류: ${e.message}")
            Log.e(TAG, "  메시지: ${message.take(500)}")
            Log.e(TAG, "  스택 트레이스:", e)
            Log.e(TAG, "═══════════════════════════════════════════════════════")
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
     * 하이브리드 모드일 때는 첫 번째 방식 실패 시 자동으로 두 번째 방식으로 fallback
     */
    private suspend fun processSendRequest(request: SendRequest) {
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
        if (request.imageUrl != null) {
            Log.i(TAG, "  ═══ IMAGE URL DETECTED: ${request.imageUrl} ═══")
        }
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        
        // 이미지가 있는 경우: RemoteInputSender는 이미지 전송을 지원하지 않으므로
        // 바로 AccessibilitySender 사용 (알림 리플라이 건너뛰기)
        val hasImage = request.imageUrl != null && request.imageUrl!!.isNotBlank()
        if (hasImage) {
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "⚠ 이미지 전송 요청 감지: RemoteInputSender 건너뛰기")
            Log.i(TAG, "  RemoteInputSender는 이미지 전송을 지원하지 않으므로")
            Log.i(TAG, "  바로 AccessibilitySender 사용")
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            
            // AccessibilitySender로 바로 처리
            val isAccessibilityEnabled = KakaoAutomationService.isServiceEnabled(this)
            var automationServiceVar: KakaoAutomationService? = KakaoAutomationService.getInstance()
            
            if (isAccessibilityEnabled && automationServiceVar == null) {
                Log.i(TAG, "AccessibilityService is enabled but not connected yet, waiting...")
                repeat(3) {
                    kotlinx.coroutines.delay(500)
                    automationServiceVar = KakaoAutomationService.getInstance()
                    if (automationServiceVar != null) {
                        Log.i(TAG, "✓ AccessibilityService connected after wait")
                        return@repeat
                    }
                }
            }
            
            val automationService = automationServiceVar
            if (isAccessibilityEnabled && automationService != null) {
                if (accessibilitySender == null) {
                    accessibilitySender = AccessibilitySender(this, automationService)
                    Log.i(TAG, "✓ AccessibilitySender initialized for image sending")
                }
                
                val imageSender = accessibilitySender
                if (imageSender != null) {
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    Log.i(TAG, "🚀 이미지 전송: Using AccessibilitySender 🚀")
                    Log.i(TAG, "  imageUrl: ${request.imageUrl}")
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    
                    val imageResult = trySend(imageSender, request.roomKey, request.text, request.imageUrl)
                    Log.i(TAG, "AccessibilitySender result: ${imageResult?.javaClass?.simpleName ?: "null"}")
                    
                    if (imageResult is com.goodhabit.kakaobridge.sender.SendResult.Success) {
                        Log.i(TAG, "✓✓✓✓✓ IMAGE SENT SUCCESSFULLY via AccessibilitySender ✓✓✓✓✓")
                        handleSendResult(imageResult, request, dao)
                    } else {
                        Log.e(TAG, "✗✗✗ IMAGE SEND FAILED via AccessibilitySender ✗✗✗")
                        handleSendResult(imageResult, request, dao)
                    }
                    return
                } else {
                    Log.e(TAG, "✗ AccessibilitySender is null even though service is available")
                    val updated = request.copy(
                        status = SendStatus.FAILED_FINAL,
                        updatedAt = System.currentTimeMillis(),
                        errorMessage = "AccessibilitySender not initialized for image sending"
                    )
                    dao.update(updated)
                    sendAck(request.id, "FAILED", "AccessibilitySender not initialized for image sending")
                    return
                }
            } else {
                Log.e(TAG, "✗ AccessibilityService is not enabled or not connected")
                val updated = request.copy(
                    status = SendStatus.FAILED_FINAL,
                    updatedAt = System.currentTimeMillis(),
                    errorMessage = "AccessibilityService not available for image sending"
                )
                dao.update(updated)
                sendAck(request.id, "FAILED", "AccessibilityService not available for image sending")
                return
            }
        }
        
        // 이미지가 없는 경우: RemoteInputSender 시도 (알림 리플라이)
        val primarySender = remoteInputSender ?: run {
            Log.e(TAG, "RemoteInputSender is null, cannot process request: id=${request.id}")
            val updated = request.copy(
                status = SendStatus.FAILED_FINAL,
                updatedAt = System.currentTimeMillis(),
                errorMessage = "RemoteInputSender not initialized"
            )
            dao.update(updated)
            sendAck(request.id, "FAILED", "RemoteInputSender not initialized")
            return
        }
        
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "Step 1: Trying RemoteInputSender (notification reply)")
        Log.i(TAG, "  request.roomKey: \"${request.roomKey}\" (길이: ${request.roomKey.length})")
        Log.i(TAG, "  request.text: \"${request.text.take(50)}${if (request.text.length > 50) "..." else ""}\"")
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        // RemoteInputSender는 이미지 전송을 지원하지 않으므로 text만 전달
        val firstResult = trySend(primarySender, request.roomKey, request.text, null)
        val resultType = firstResult?.javaClass?.simpleName ?: "null"
        Log.i(TAG, "RemoteInputSender result type: $resultType")
        if (firstResult is com.goodhabit.kakaobridge.sender.SendResult.WaitingNotification) {
            Log.i(TAG, "  WaitingNotification reason: ${firstResult.reason}")
        }
        
        // RemoteInputSender가 성공하면 완료
        if (firstResult is com.goodhabit.kakaobridge.sender.SendResult.Success) {
            Log.i(TAG, "✓✓✓✓✓ RemoteInputSender SUCCESS - 알림 리플라이로 전송 완료 ✓✓✓✓✓")
            handleSendResult(firstResult, request, dao)
            return
        }
        
        // WaitingNotification인 경우: 알림이 없음 → AccessibilitySender로 fallback
        if (firstResult is com.goodhabit.kakaobridge.sender.SendResult.WaitingNotification) {
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "⚠⚠⚠ RemoteInputSender 실패: WaitingNotification ⚠⚠⚠")
            Log.i(TAG, "  이유: ${firstResult.reason}")
            Log.i(TAG, "  → 알림 리플라이 불가능, AccessibilitySender로 fallback")
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            
            // 접근성 서비스 확인 및 초기화
            val isAccessibilityEnabled = KakaoAutomationService.isServiceEnabled(this)
            var automationService: KakaoAutomationService? = KakaoAutomationService.getInstance()
            
            // 인스턴스가 아직 연결되지 않았지만 설정에서 활성화되어 있으면 잠시 대기
            if (isAccessibilityEnabled && automationService == null) {
                Log.i(TAG, "AccessibilityService is enabled but not connected yet, waiting...")
                repeat(3) {
                    kotlinx.coroutines.delay(500)
                    automationService = KakaoAutomationService.getInstance()
                    if (automationService != null) {
                        Log.i(TAG, "✓ AccessibilityService connected after wait")
                        return@repeat
                    }
                }
            }
            
            val connectedService = automationService
            if (isAccessibilityEnabled && connectedService != null) {
                // AccessibilitySender가 없으면 초기화
                if (accessibilitySender == null) {
                    accessibilitySender = AccessibilitySender(this, connectedService)
                    Log.i(TAG, "✓ AccessibilitySender initialized during fallback")
                }
                
                val fallbackSender = accessibilitySender
                if (fallbackSender == null) {
                    Log.e(TAG, "✗ AccessibilitySender is null even though service is available")
                    Log.e(TAG, "  Handling RemoteInputSender result (WaitingNotification)")
                    handleSendResult(firstResult, request, dao)
                    return
                }
                
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                Log.i(TAG, "🚀🚀🚀 FALLBACK: Using AccessibilitySender 🚀🚀🚀")
                Log.i(TAG, "  Reason: No notification available for RemoteInput")
                Log.i(TAG, "  This should send immediately via UI automation")
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                
                val fallbackResult = trySend(fallbackSender, request.roomKey, request.text, request.imageUrl)
                Log.i(TAG, "AccessibilitySender result: ${fallbackResult?.javaClass?.simpleName ?: "null"}")
                
                if (fallbackResult is com.goodhabit.kakaobridge.sender.SendResult.Success) {
                    Log.i(TAG, "✓✓✓✓✓ FALLBACK SUCCEEDED: AccessibilitySender sent message ✓✓✓✓✓")
                    handleSendResult(fallbackResult, request, dao)
                } else {
                    Log.w(TAG, "⚠⚠⚠ FALLBACK FAILED: AccessibilitySender also failed ⚠⚠⚠")
                    Log.w(TAG, "  Handling RemoteInputSender result (WaitingNotification)")
                    handleSendResult(firstResult, request, dao)
                }
            } else {
                Log.w(TAG, "═══════════════════════════════════════════════════════")
                Log.w(TAG, "⚠ AccessibilityService NOT available for fallback")
                Log.w(TAG, "  isServiceEnabled: $isAccessibilityEnabled")
                Log.w(TAG, "  getInstance() != null: ${automationService != null}")
                Log.w(TAG, "  → Cannot fallback, handling RemoteInputSender result (WaitingNotification)")
                Log.w(TAG, "  → Message will be sent when notification arrives")
                Log.w(TAG, "═══════════════════════════════════════════════════════")
                handleSendResult(firstResult, request, dao)
            }
            return
        }
        
        // 다른 실패 결과 (FailedRetryable, FailedFinal 등)
        Log.w(TAG, "RemoteInputSender failed (not WaitingNotification), handling result")
        handleSendResult(firstResult, request, dao)
        Log.i(TAG, "═══════════════════════════════════════════════════════")
    }
    
    /**
     * 실제 전송 시도
     */
    private suspend fun trySend(
        sender: MessageSender,
        roomKey: String,
        text: String,
        imageUrl: String? = null
    ): com.goodhabit.kakaobridge.sender.SendResult? {
        return try {
            // 모든 sender의 send() 메서드에 imageUrl 전달 (RemoteInputSender는 무시함)
            sender.send(roomKey, text, imageUrl)
        } catch (e: Exception) {
            Log.e(TAG, "Exception during send attempt: ${e.message}", e)
            com.goodhabit.kakaobridge.sender.SendResult.FailedRetryable("Exception: ${e.message}")
        }
    }
    
    /**
     * 전송 결과 처리
     */
    private suspend fun handleSendResult(
        result: com.goodhabit.kakaobridge.sender.SendResult?,
        request: SendRequest,
        dao: SendRequestDao
    ) {
        if (result == null) {
            Log.e(TAG, "Send result is null for request: id=${request.id}")
            return
        }

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
                
                // 이미지 캐시도 정리
                com.goodhabit.kakaobridge.accessibility.util.ImageHelper.cleanupOldImages(this, maxAgeMs = 3600000) // 1시간
                
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
        
        val sent = webSocketClient?.send(ackString) ?: false
        if (!sent) {
            Log.w(TAG, "⚠ WebSocket client is null or not connected, cannot send ACK. Attempting to reconnect...")
            // WebSocket이 연결되지 않았으면 재연결 시도
            serviceScope.launch {
                if (reconnectAttempts == 0) {
                    Log.i(TAG, "Starting WebSocket reconnection...")
                    startWebSocketConnection()
                }
            }
        } else {
            Log.d(TAG, "✓ ACK sent: id=$id, status=$status")
        }
    }
}

