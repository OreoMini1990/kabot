package com.goodhabit.kakaobridge.sender

/**
 * 메시지 전송 인터페이스
 * 
 * 1단계: RemoteInputSender 구현
 * 2단계(향후): AccessibilitySender 구현 (fallback)
 */
interface MessageSender {
    /**
     * 메시지 전송 시도
     * 
     * @param roomKey 채팅방 식별자
     * @param text 전송할 메시지 텍스트
     * @param imageUrl 이미지 URL (선택사항, 접근성 서비스에서만 지원)
     * @return 전송 결과
     */
    suspend fun send(roomKey: String, text: String, imageUrl: String? = null): SendResult
}

/**
 * 전송 결과
 */
sealed class SendResult {
    data object Success : SendResult()
    data class WaitingNotification(val reason: String = "알림이 없어 대기 중") : SendResult()
    data class FailedRetryable(val reason: String, val retryAfterMs: Long? = null) : SendResult()
    data class FailedFinal(val reason: String) : SendResult()
}





