package com.goodhabit.kakaobridge.service

import android.app.PendingIntent
import android.app.RemoteInput
import android.util.Log

/**
 * NotificationActionCache: roomKey별 replyAction 캐시
 * 
 * 알림이 올라올 때 replyAction을 캐싱하여, 
 * 전송 요청 시 즉시 사용할 수 있도록 함
 * 
 * 싱글톤으로 구현하여 BridgeForegroundService와 KakaoNotificationListenerService가
 * 같은 캐시 인스턴스를 공유하도록 함
 */
object NotificationActionCache {
    private val cache = mutableMapOf<String, CachedReplyAction>()
    private val lock = Any()

    data class CachedReplyAction(
        val roomKey: String,
        val pendingIntent: PendingIntent,
        val remoteInputs: Array<RemoteInput>,
        val postTime: Long
    )

    /**
     * 알림이 올라올 때 replyAction 캐시 업데이트
     */
    fun updateCache(roomKey: String, pendingIntent: PendingIntent, remoteInputs: Array<RemoteInput>) {
        synchronized(lock) {
            cache[roomKey] = CachedReplyAction(
                roomKey = roomKey,
                pendingIntent = pendingIntent,
                remoteInputs = remoteInputs,
                postTime = System.currentTimeMillis()
            )
            Log.d("NotificationActionCache", "Updated cache for roomKey: $roomKey")
        }
    }

    /**
     * roomKey에 대한 replyAction 조회
     */
    fun getReplyAction(roomKey: String): Pair<PendingIntent, Array<RemoteInput>>? {
        synchronized(lock) {
            val cached = cache[roomKey]
            return if (cached != null) {
                Pair(cached.pendingIntent, cached.remoteInputs)
            } else {
                null
            }
        }
    }

    /**
     * 캐시 초기화 (앱 재시작 시)
     */
    fun clear() {
        synchronized(lock) {
            cache.clear()
        }
    }

    /**
     * 오래된 캐시 제거 (선택사항)
     * 기본 TTL을 2시간으로 연장하여 캐시 유지 강화
     */
    fun removeOldCache(maxAgeMs: Long = 7200000) { // 기본 2시간 (1시간 → 2시간으로 연장)
        synchronized(lock) {
            val now = System.currentTimeMillis()
            val removed = cache.entries.removeAll { (roomKey, cached) ->
                val age = now - cached.postTime
                if (age > maxAgeMs) {
                    Log.d("NotificationActionCache", "Removed old cache: roomKey=\"$roomKey\", age=${age / 1000}s")
                    true
                } else {
                    false
                }
            }
            if (removed) {
                Log.d("NotificationActionCache", "Removed $removed old cache entries")
            }
        }
    }
    
    /**
     * 캐시 유효성 검증
     * @param roomKey 확인할 roomKey
     * @param maxAgeMs 최대 유효 시간 (기본 2시간)
     * @return 캐시가 유효하면 true, 없거나 만료되었으면 false
     */
    fun isCacheValid(roomKey: String, maxAgeMs: Long = 7200000): Boolean {
        synchronized(lock) {
            val cached = cache[roomKey]
            return if (cached != null) {
                val age = System.currentTimeMillis() - cached.postTime
                val isValid = age < maxAgeMs
                if (!isValid) {
                    Log.d("NotificationActionCache", "Cache expired: roomKey=\"$roomKey\", age=${age / 1000}s")
                    cache.remove(roomKey) // 만료된 캐시 제거
                } else {
                    Log.d("NotificationActionCache", "Cache valid: roomKey=\"$roomKey\", age=${age / 1000}s")
                }
                isValid
            } else {
                false
            }
        }
    }
    
    /**
     * 캐시 갱신 시간 업데이트 (알림이 다시 올 때 호출)
     * 기존 캐시가 있으면 시간만 갱신하여 유효성 연장
     */
    fun refreshCacheTime(roomKey: String) {
        synchronized(lock) {
            val cached = cache[roomKey]
            if (cached != null) {
                cache[roomKey] = cached.copy(postTime = System.currentTimeMillis())
                Log.d("NotificationActionCache", "Refreshed cache time: roomKey=\"$roomKey\"")
            }
        }
    }
    
    /**
     * 캐시된 모든 roomKey 목록 반환 (디버깅용)
     */
    fun getAllCachedRoomKeys(): List<String> {
        synchronized(lock) {
            return cache.keys.toList()
        }
    }
    
    /**
     * 캐시 상태 정보 반환 (디버깅용)
     */
    fun getCacheInfo(): Map<String, Any> {
        synchronized(lock) {
            val now = System.currentTimeMillis()
            return mapOf(
                "totalEntries" to cache.size,
                "entries" to cache.map { (roomKey, cached) ->
                    val age = now - cached.postTime
                    mapOf(
                        "roomKey" to roomKey,
                        "ageSeconds" to (age / 1000),
                        "isValid" to (age < 7200000)
                    )
                }
            )
        }
    }
}

