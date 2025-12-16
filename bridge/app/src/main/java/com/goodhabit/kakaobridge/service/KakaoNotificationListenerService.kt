package com.goodhabit.kakaobridge.service

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.goodhabit.kakaobridge.config.FeatureFlags
import com.goodhabit.kakaobridge.queue.SendRequest
import com.goodhabit.kakaobridge.queue.SendRequestDao
import com.goodhabit.kakaobridge.queue.SendStatus
import com.goodhabit.kakaobridge.sender.RemoteInputSender
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * 카카오톡 알림 감시 서비스
 * 
 * - 카카오톡 알림을 감시하여 replyAction을 캐싱
 * - 알림이 올라오면 해당 roomKey로 대기 중인 전송 요청이 있는지 확인하여 즉시 처리
 */
class KakaoNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "KakaoNotificationListener"
        private const val KAKAO_TALK_PACKAGE = "com.kakao.talk"
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val notificationCache = NotificationActionCache()
    private lateinit var remoteInputSender: RemoteInputSender
    private var sendRequestDao: SendRequestDao? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        
        remoteInputSender = RemoteInputSender(this, notificationCache)
        
        // Room DB 초기화는 Application 클래스에서 싱글톤으로 관리
        val db = com.goodhabit.kakaobridge.db.AppDatabase.getDatabase(this)
        sendRequestDao = db.sendRequestDao()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        super.onNotificationPosted(sbn)
        
        // 접근성 기반 전송 방식일 때는 알림 처리가 필요 없음 (직접 UI 조작)
        val sendMethod = FeatureFlags.getActiveSendMethod(this)
        if (sendMethod == FeatureFlags.SendMethod.ACCESSIBILITY) {
            Log.d(TAG, "Accessibility mode active, skipping notification processing")
            return
        }
        
        val packageName = sbn.packageName
        if (packageName != KAKAO_TALK_PACKAGE) {
            return // 카카오톡 알림이 아니면 무시
        }

        Log.d(TAG, "KakaoTalk notification posted: ${sbn.key}")

        // 1. roomKey 추출
        val roomKey = extractRoomKey(sbn)
        if (roomKey == null) {
            Log.w(TAG, "Failed to extract roomKey from notification")
            return
        }

        Log.d(TAG, "Extracted roomKey: $roomKey")

        // 2. replyAction 찾기 및 캐싱
        val notification = sbn.notification
        val actions = notification.actions
        if (actions != null) {
            for (action in actions) {
                val remoteInputs = action.remoteInputs
                if (remoteInputs != null && remoteInputs.isNotEmpty() && action.actionIntent != null) {
                    // replyAction 발견
                    Log.d(TAG, "Found replyAction for roomKey: $roomKey")
                    
                    // 기존 캐시가 있으면 시간만 갱신, 없으면 새로 생성
                    val existingCache = notificationCache.getReplyAction(roomKey)
                    if (existingCache != null) {
                        Log.d(TAG, "Refreshing existing cache for roomKey: $roomKey")
                        notificationCache.refreshCacheTime(roomKey)
                        // PendingIntent가 변경되었을 수 있으므로 업데이트
                        notificationCache.updateCache(roomKey, action.actionIntent, remoteInputs)
                    } else {
                        Log.d(TAG, "Creating new cache for roomKey: $roomKey")
                        notificationCache.updateCache(roomKey, action.actionIntent, remoteInputs)
                    }
                    
                    // 캐시 상태 로깅
                    val cacheInfo = notificationCache.getCacheInfo()
                    Log.d(TAG, "Cache status: totalEntries=${cacheInfo["totalEntries"]}")
                    
                    // 3. 해당 roomKey로 대기 중인 전송 요청이 있으면 즉시 처리
                    serviceScope.launch {
                        processPendingRequests(roomKey)
                    }
                    break
                }
            }
        } else {
            Log.d(TAG, "No actions found in notification")
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        super.onNotificationRemoved(sbn)
        // 알림 제거 시 특별한 처리는 필요 없음 (캐시는 유지)
    }

    /**
     * roomKey 추출 및 정규화
     * 
     * 1순위: Notification.EXTRA_CONVERSATION_TITLE
     * 2순위: Notification.EXTRA_TITLE (단, "." 같은 무의미한 값 제외)
     * 3순위: extras 전체 덤프 후 보강
     * 
     * roomKey는 정규화하여 저장 (대소문자, 공백 통일)
     */
    private fun extractRoomKey(sbn: StatusBarNotification): String? {
        val extras = sbn.notification.extras
        
        var roomKey: String? = null
        
        // 디버그: 모든 extras 덤프
        Log.d(TAG, "Notification extras dump:")
        extras.keySet().forEach { key ->
            val value = extras.get(key)
            Log.d(TAG, "  $key = $value (${value?.javaClass?.simpleName})")
        }
        
        // 그룹 채팅 여부 확인
        val isGroupConversation = extras.getBoolean("android.isGroupConversation", false)
        Log.d(TAG, "isGroupConversation: $isGroupConversation")
        
        // 1순위: EXTRA_CONVERSATION_TITLE (채팅방명)
        val conversationTitle = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)
        if (!conversationTitle.isNullOrBlank()) {
            val titleStr = conversationTitle.toString().trim()
            if (titleStr.isNotEmpty() && titleStr != ".") {
                roomKey = titleStr
                Log.d(TAG, "Extracted roomKey from EXTRA_CONVERSATION_TITLE: \"$roomKey\"")
            }
        }

        // 2순위: android.subText (그룹 채팅의 경우 채팅방명일 수 있음)
        if (roomKey.isNullOrBlank() && isGroupConversation) {
            val subText = extras.getCharSequence("android.subText")
            if (!subText.isNullOrBlank()) {
                val subTextStr = subText.toString().trim()
                // "N개의 읽지 않은 메시지" 같은 형식 제외
                if (subTextStr.length >= 2 && !subTextStr.contains("개의") && !subTextStr.contains("읽지")) {
                    roomKey = subTextStr
                    Log.d(TAG, "Extracted roomKey from android.subText (group chat): \"$roomKey\"")
                }
            }
        }

        // 3순위: android.hiddenConversationTitle (숨겨진 채팅방명)
        if (roomKey.isNullOrBlank()) {
            val hiddenTitle = extras.getCharSequence("android.hiddenConversationTitle")
            if (!hiddenTitle.isNullOrBlank()) {
                val titleStr = hiddenTitle.toString().trim()
                if (titleStr.isNotEmpty() && titleStr != ".") {
                    roomKey = titleStr
                    Log.d(TAG, "Extracted roomKey from android.hiddenConversationTitle: \"$roomKey\"")
                }
            }
        }

        // 3순위: android.messagingStyleUser에서 채팅방명 추출
        if (roomKey.isNullOrBlank()) {
            val messagingStyleUser = extras.getBundle("android.messagingStyleUser")
            if (messagingStyleUser != null) {
                try {
                    // Person 객체에서 이름 추출
                    val personName = messagingStyleUser.getCharSequence("name")
                    if (!personName.isNullOrBlank()) {
                        val nameStr = personName.toString().trim()
                        if (nameStr.length >= 2 && nameStr != ".") {
                            roomKey = nameStr
                            Log.d(TAG, "Extracted roomKey from android.messagingStyleUser.name: \"$roomKey\"")
                        }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Failed to parse android.messagingStyleUser: ${e.message}")
                }
            }
        }

        // 4순위: android.messagingUser (Person 객체)에서 채팅방명 추출
        if (roomKey.isNullOrBlank()) {
            val messagingUser = extras.getParcelable<android.app.Person>("android.messagingUser")
            if (messagingUser != null) {
                try {
                    val personName = messagingUser.name
                    if (!personName.isNullOrBlank()) {
                        val nameStr = personName.toString().trim()
                        if (nameStr.length >= 2 && nameStr != ".") {
                            roomKey = nameStr
                            Log.d(TAG, "Extracted roomKey from android.messagingUser.name: \"$roomKey\"")
                        }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Failed to parse android.messagingUser: ${e.message}")
                }
            }
        }

        // 5순위: android.messages 배열에서 채팅방명 추출 (MessagingStyle)
        if (roomKey.isNullOrBlank()) {
            val messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
            if (messages != null && messages.isNotEmpty()) {
                try {
                    Log.d(TAG, "Attempting to parse android.messages array (size=${messages.size})")
                    // 첫 번째 메시지에서 conversationTitle 추출 시도
                    val firstMessage = messages[0] as? android.os.Bundle
                    if (firstMessage != null) {
                        // MessagingStyle.Message의 모든 키 확인
                        Log.d(TAG, "First message keys: ${firstMessage.keySet().joinToString(", ")}")
                        firstMessage.keySet().forEach { key ->
                            val value = firstMessage.get(key)
                            Log.d(TAG, "  messages[0].$key = $value")
                        }
                        
                        // conversationTitle이 별도로 있을 수 있음
                        val msgConversationTitle = firstMessage.getCharSequence("conversationTitle")
                        if (!msgConversationTitle.isNullOrBlank()) {
                            val titleStr = msgConversationTitle.toString().trim()
                            if (titleStr.isNotEmpty() && titleStr != ".") {
                                roomKey = titleStr
                                Log.d(TAG, "Extracted roomKey from messages[0].conversationTitle: \"$roomKey\"")
                            }
                        }
                        
                        // Person 객체에서 이름 추출 시도
                        val person = firstMessage.getParcelable<android.app.Person>("senderPerson")
                        if (person != null && roomKey.isNullOrBlank()) {
                            val personName = person.name
                            if (!personName.isNullOrBlank()) {
                                val nameStr = personName.toString().trim()
                                if (nameStr.length >= 2 && nameStr != ".") {
                                    roomKey = nameStr
                                    Log.d(TAG, "Extracted roomKey from messages[0].senderPerson.name: \"$roomKey\"")
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse messages array: ${e.message}", e)
                }
            }
        }

        // 4순위: EXTRA_TITLE (사용자명일 수 있으므로 낮은 우선순위)
        if (roomKey.isNullOrBlank()) {
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)
            if (!title.isNullOrBlank()) {
                val titleStr = title.toString().trim()
                // "." 같은 무의미한 값 제외, 최소 2자 이상
                if (titleStr.length >= 2 && titleStr != ".") {
                    roomKey = titleStr
                    Log.d(TAG, "Extracted roomKey from EXTRA_TITLE: \"$roomKey\" (may be sender name)")
                } else {
                    Log.d(TAG, "Skipped EXTRA_TITLE (too short or meaningless): \"$titleStr\"")
                }
            }
        }

        // 5순위: android.title (사용자명일 수 있으므로 낮은 우선순위)
        if (roomKey.isNullOrBlank()) {
            val androidTitle = extras.getCharSequence("android.title")
            if (!androidTitle.isNullOrBlank()) {
                val titleStr = androidTitle.toString().trim()
                if (titleStr.length >= 2 && titleStr != ".") {
                    roomKey = titleStr
                    Log.d(TAG, "Extracted roomKey from android.title: \"$roomKey\" (may be sender name)")
                }
            }
        }
        
        // 주의: 
        // - android.text는 메시지 내용이므로 채팅방명으로 사용하지 않음
        // - android.subText는 그룹 채팅의 경우 채팅방명일 수 있음 (이미 위에서 처리)
        // - android.messagingStyleUser.name은 사용자명이므로 낮은 우선순위

        // roomKey 정규화 (대소문자, 공백 통일)
        return roomKey?.let { normalizeRoomKey(it) }
    }
    
    /**
     * roomKey 정규화
     * - 앞뒤 공백 제거
     * - 소문자로 변환 (선택사항, 필요시 주석 해제)
     */
    private fun normalizeRoomKey(roomKey: String): String {
        var normalized = roomKey.trim()
        // 필요시 소문자로 변환 (대소문자 구분이 필요없는 경우)
        // normalized = normalized.lowercase()
        return normalized
    }

    /**
     * 대기 중인 전송 요청 처리
     * 
     * 주의: 이 메서드는 RemoteInput 방식일 때만 호출됩니다.
     * 접근성 방식일 때는 BridgeForegroundService에서 직접 처리합니다.
     */
    private suspend fun processPendingRequests(roomKey: String) {
        // 접근성 기반 전송 방식일 때는 처리하지 않음
        val sendMethod = FeatureFlags.getActiveSendMethod(this)
        if (sendMethod == FeatureFlags.SendMethod.ACCESSIBILITY) {
            Log.d(TAG, "Accessibility mode active, skipping notification-based processing")
            return
        }
        
        if (sendRequestDao == null) {
            Log.w(TAG, "SendRequestDao not initialized, skipping queue processing")
            return
        }

        // WAITING_NOTIFICATION 상태인 요청 조회
        val pendingRequests = sendRequestDao!!.getRequestsByRoomKey(
            roomKey,
            listOf(SendStatus.PENDING, SendStatus.WAITING_NOTIFICATION)
        )

        Log.d(TAG, "Found ${pendingRequests.size} pending requests for roomKey: $roomKey")

        for (request in pendingRequests) {
            try {
                // RemoteInput 방식만 사용 (이 서비스는 알림 기반이므로)
                val result = remoteInputSender.send(request.roomKey, request.text)
                
                when (result) {
                    is com.goodhabit.kakaobridge.sender.SendResult.Success -> {
                        // 전송 성공
                        val updated = request.copy(
                            status = SendStatus.SENT,
                            updatedAt = System.currentTimeMillis()
                        )
                        sendRequestDao!!.update(updated)
                        Log.i(TAG, "Successfully sent message: id=${request.id}")
                    }
                    is com.goodhabit.kakaobridge.sender.SendResult.WaitingNotification -> {
                        // 여전히 알림 없음 (이론적으로는 발생하지 않아야 함)
                        val updated = request.copy(
                            status = SendStatus.WAITING_NOTIFICATION,
                            updatedAt = System.currentTimeMillis(),
                            errorMessage = result.reason
                        )
                        sendRequestDao!!.update(updated)
                        Log.w(TAG, "Still waiting for notification: id=${request.id}")
                    }
                    is com.goodhabit.kakaobridge.sender.SendResult.FailedRetryable -> {
                        // 재시도 가능한 실패
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
                        sendRequestDao!!.update(updated)
                        Log.w(TAG, "Failed (retryable): id=${request.id}, retryCount=$retryCount")
                    }
                    is com.goodhabit.kakaobridge.sender.SendResult.FailedFinal -> {
                        // 최종 실패
                        val updated = request.copy(
                            status = SendStatus.FAILED_FINAL,
                            updatedAt = System.currentTimeMillis(),
                            errorMessage = result.reason
                        )
                        sendRequestDao!!.update(updated)
                        Log.e(TAG, "Failed (final): id=${request.id}, reason=${result.reason}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing request: id=${request.id}", e)
                // 재시도 가능한 오류로 처리
                val updated = request.copy(
                    status = SendStatus.FAILED_RETRYABLE,
                    retryCount = request.retryCount + 1,
                    nextRetryAt = calculateNextRetryTime(request.retryCount + 1),
                    updatedAt = System.currentTimeMillis(),
                    errorMessage = e.message
                )
                sendRequestDao!!.update(updated)
            }
        }
    }

    /**
     * 재시도 시간 계산 (backoff)
     * 5s → 20s → 60s → 3m → 10m
     */
    private fun calculateNextRetryTime(retryCount: Int): Long {
        val delays = listOf(5000L, 20000L, 60000L, 180000L, 600000L)
        val delay = delays.getOrElse(retryCount - 1) { delays.last() }
        return System.currentTimeMillis() + delay
    }

}

