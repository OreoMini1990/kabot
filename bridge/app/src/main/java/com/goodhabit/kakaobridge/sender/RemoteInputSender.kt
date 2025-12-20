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

    override suspend fun send(roomKey: String, text: String, imageUrl: String?): SendResult {
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "send() called")
        Log.i(TAG, "  roomKey: \"$roomKey\"")
        Log.i(TAG, "  text: ${text.take(100)}${if (text.length > 100) "..." else ""}")
        Log.i(TAG, "  textLength: ${text.length}")
        if (imageUrl != null) {
            Log.w(TAG, "  ⚠ imageUrl provided but RemoteInputSender does not support images (ignoring)")
        }

        // roomKey 정규화 (알림에서 추출한 roomKey와 매칭하기 위해)
        val normalizedRoomKey = roomKey.trim()
        
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "[알림 리플라이] roomKey 매칭 시도")
        Log.i(TAG, "  원본 roomKey: \"$roomKey\"")
        Log.i(TAG, "  정규화된 roomKey: \"$normalizedRoomKey\"")
        Log.i(TAG, "  roomKey 길이: ${roomKey.length} → ${normalizedRoomKey.length}")

        // 1. roomKey에 대한 replyAction 캐시 조회 및 유효성 검증
        // 캐시 유효성 검증 (2시간 TTL)
        val isCacheValid = notificationCache.isCacheValid(normalizedRoomKey, maxAgeMs = 7200000)
        val cachedAction = notificationCache.getReplyAction(normalizedRoomKey)
        
        Log.i(TAG, "  캐시 조회 결과:")
        Log.i(TAG, "    cachedAction != null: ${cachedAction != null}")
        Log.i(TAG, "    isCacheValid: $isCacheValid")
        
        if (cachedAction == null || !isCacheValid) {
            val availableKeys = notificationCache.getAllCachedRoomKeys()
            val cacheInfo = notificationCache.getCacheInfo()
            
            Log.w(TAG, "✗✗✗ 알림 리플라이 실패: 캐시 없음 또는 만료 ✗✗✗")
            Log.w(TAG, "  요청한 roomKey: \"$normalizedRoomKey\" (길이: ${normalizedRoomKey.length})")
            Log.w(TAG, "  Cache exists: ${cachedAction != null}")
            Log.w(TAG, "  Cache valid: $isCacheValid")
            Log.w(TAG, "  캐시된 roomKey 개수: ${availableKeys.size}")
            
            if (availableKeys.isEmpty()) {
                Log.w(TAG, "  ⚠ 캐시가 완전히 비어있습니다!")
                Log.w(TAG, "  → 알림이 한 번도 감지되지 않았거나, 캐시가 초기화되었습니다.")
                Log.w(TAG, "  → 카카오톡에서 해당 채팅방으로 메시지를 받아야 알림이 생성되고 캐시됩니다.")
            } else {
                Log.w(TAG, "  캐시된 roomKey 목록:")
                availableKeys.forEachIndexed { index, key ->
                    val keyValid = notificationCache.isCacheValid(key)
                    val keyLength = key.length
                    val isExactMatch = key == normalizedRoomKey
                    val containsMatch = key.contains(normalizedRoomKey) || normalizedRoomKey.contains(key)
                    Log.w(TAG, "    [$index] \"$key\" (길이: $keyLength, 유효: $keyValid, 완전일치: $isExactMatch, 포함: $containsMatch)")
                }
                
                // roomKey 유사도 분석
                Log.w(TAG, "  roomKey 매칭 분석:")
                availableKeys.forEach { cachedKey ->
                    val similarity = calculateSimilarity(normalizedRoomKey, cachedKey)
                    Log.w(TAG, "    \"$normalizedRoomKey\" vs \"$cachedKey\": 유사도=$similarity")
                }
            }
            
            // 캐시 상세 정보 로깅
            Log.w(TAG, "  캐시 상세 정보:")
            val entries = cacheInfo["entries"] as? List<Map<String, Any>>
            entries?.forEach { entry ->
                val entryRoomKey = entry["roomKey"] as? String
                val ageSeconds = entry["ageSeconds"]
                val isValid = entry["isValid"]
                Log.w(TAG, "    roomKey: \"$entryRoomKey\", age: ${ageSeconds}s, valid: $isValid")
            }
            
            Log.w(TAG, "  → 원인 분석:")
            Log.w(TAG, "    1. 서버에서 보낸 roomKey와 알림에서 추출한 roomKey가 일치하지 않음")
            Log.w(TAG, "    2. 캐시가 만료됨 (2시간 이상 지남)")
            Log.w(TAG, "    3. 알림이 아직 수신되지 않음")
            Log.w(TAG, "  → 해결 방법:")
            Log.w(TAG, "    - 해당 채팅방으로 메시지를 받아서 알림을 생성")
            Log.w(TAG, "    - 서버에서 보내는 roomKey와 알림에서 추출한 roomKey를 비교하여 정확히 일치시킴")
            Log.w(TAG, "═══════════════════════════════════════════════════════")
            return SendResult.WaitingNotification("채팅방 '$normalizedRoomKey'에 대한 알림이 없거나 캐시가 만료되었습니다. 카카오톡에서 해당 채팅방으로 메시지를 받으면 자동으로 전송됩니다.")
        }
        
        // 캐시 유효성 확인 로그
        Log.i(TAG, "✓✓✓ 캐시 발견 및 유효성 검증 통과 ✓✓✓")
        Log.i(TAG, "  매칭된 roomKey: \"$normalizedRoomKey\"")

        val (pendingIntent, remoteInputs) = cachedAction
        Log.i(TAG, "✓ Found cached replyAction")
        Log.i(TAG, "  pendingIntent: $pendingIntent")
        Log.i(TAG, "  remoteInputs count: ${remoteInputs.size}")
        remoteInputs.forEachIndexed { index, remoteInput ->
            Log.i(TAG, "    remoteInput[$index]: resultKey=${remoteInput.resultKey}, label=${remoteInput.label}")
        }
        Log.i(TAG, "═══════════════════════════════════════════════════════")

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
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "[알림 리플라이] PendingIntent.send() 실행 시도")
            Log.i(TAG, "  roomKey: \"$normalizedRoomKey\"")
            Log.i(TAG, "  text: ${text.take(100)}${if (text.length > 100) "..." else ""}")
            Log.i(TAG, "  pendingIntent: $pendingIntent")
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
    
    /**
     * 두 문자열의 유사도 계산 (간단한 Levenshtein 거리 기반)
     * 디버깅용으로 사용
     */
    private fun calculateSimilarity(s1: String, s2: String): Double {
        if (s1 == s2) return 1.0
        if (s1.isEmpty() || s2.isEmpty()) return 0.0
        
        val longer = if (s1.length > s2.length) s1 else s2
        val shorter = if (s1.length > s2.length) s2 else s1
        
        if (longer.length == 0) return 1.0
        
        val editDistance = levenshteinDistance(s1, s2)
        return (longer.length - editDistance).toDouble() / longer.length
    }
    
    /**
     * Levenshtein 거리 계산
     */
    private fun levenshteinDistance(s1: String, s2: String): Int {
        val m = s1.length
        val n = s2.length
        val dp = Array(m + 1) { IntArray(n + 1) }
        
        for (i in 0..m) dp[i][0] = i
        for (j in 0..n) dp[0][j] = j
        
        for (i in 1..m) {
            for (j in 1..n) {
                val cost = if (s1[i - 1] == s2[j - 1]) 0 else 1
                dp[i][j] = minOf(
                    dp[i - 1][j] + 1,      // deletion
                    dp[i][j - 1] + 1,      // insertion
                    dp[i - 1][j - 1] + cost // substitution
                )
            }
        }
        
        return dp[m][n]
    }
}

