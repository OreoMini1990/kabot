package com.goodhabit.kakaobridge.service

import android.app.PendingIntent
import android.app.RemoteInput
import android.util.Log

/**
 * NotificationActionCache: roomKey별 replyAction 캐시
 * 
 * 알림이 올라올 때 replyAction을 캐싱하여, 
 * 전송 요청 시 즉시 사용할 수 있도록 함
 */
class NotificationActionCache {
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
     */
    fun removeOldCache(maxAgeMs: Long = 3600000) { // 기본 1시간
        synchronized(lock) {
            val now = System.currentTimeMillis()
            cache.entries.removeAll { (_, cached) ->
                now - cached.postTime > maxAgeMs
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
}

