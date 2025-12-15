package com.goodhabit.kakaobridge.queue

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverters
import com.goodhabit.kakaobridge.db.Converters

/**
 * 전송 요청 상태
 */
enum class SendStatus {
    PENDING,                    // 큐에 적재됨, 아직 전송 안 함
    WAITING_NOTIFICATION,       // 해당 roomKey에 replyAction 캐시가 없어 대기
    SENT,                       // 전송 성공
    FAILED_RETRYABLE,           // 재시도 예정
    FAILED_FINAL                // 재시도 한계 초과
}

/**
 * 전송 요청 엔티티 (Room DB)
 */
@Entity(tableName = "send_requests")
@TypeConverters(Converters::class)
data class SendRequest(
    @PrimaryKey
    val id: String,                     // UUID
    val roomKey: String,                // 채팅방 식별자 (채팅방 이름 또는 ID)
    val text: String,                   // 전송할 메시지 텍스트
    val status: SendStatus,             // 현재 상태
    val retryCount: Int = 0,            // 재시도 횟수
    val nextRetryAt: Long? = null,      // 다음 재시도 시각 (timestamp)
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val errorMessage: String? = null    // 오류 메시지 (실패 시)
)

