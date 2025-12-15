package com.goodhabit.kakaobridge.accessibility

import android.content.Context
import android.util.Log
import com.goodhabit.kakaobridge.sender.MessageSender
import com.goodhabit.kakaobridge.sender.SendResult
import kotlinx.coroutines.delay

/**
 * 접근성 기반 메시지 전송 엔진
 * 
 * AccessibilityService를 사용하여 카카오톡 UI를 직접 조작하여 메시지 전송
 * 알림이 없어도 전송 가능
 * 
 * 주의: 이 클래스는 기능 플래그로 활성화/비활성화 가능
 * 기본값: 비활성화 (기존 RemoteInputSender 사용)
 */
class AccessibilitySender(
    private val context: Context,
    private val automationService: KakaoAutomationService
) : MessageSender {
    
    companion object {
        private const val TAG = "AccessibilitySender"
    }
    
    override suspend fun send(roomKey: String, text: String): SendResult {
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "AccessibilitySender.send() called")
        Log.i(TAG, "  roomKey: \"$roomKey\"")
        Log.i(TAG, "  text: ${text.take(100)}${if (text.length > 100) "..." else ""}")
        Log.i(TAG, "  textLength: ${text.length}")
        
        // 접근성 서비스가 활성화되어 있는지 확인
        if (!automationService.isServiceEnabled()) {
            Log.w(TAG, "✗ AccessibilityService is not enabled")
            return SendResult.FailedFinal("접근성 서비스가 활성화되지 않았습니다. 설정 > 접근성에서 활성화해주세요.")
        }
        
        // 자동화 작업 큐에 추가
        return try {
            val result = automationService.sendMessage(roomKey, text)
            
            when (result) {
                is AutomationResult.Success -> {
                    Log.i(TAG, "✓✓✓ Message sent successfully via AccessibilityService ✓✓✓")
                    Log.d(TAG, "═══════════════════════════════════════════════════════")
                    SendResult.Success
                }
                is AutomationResult.Failed -> {
                    Log.e(TAG, "✗ Failed to send message: ${result.errorCode} - ${result.message}")
                    Log.d(TAG, "═══════════════════════════════════════════════════════")
                    SendResult.FailedRetryable(
                        reason = "${result.errorCode}: ${result.message}",
                        retryAfterMs = 5000
                    )
                }
                is AutomationResult.Timeout -> {
                    Log.e(TAG, "✗ Timeout: ${result.message}")
                    Log.d(TAG, "═══════════════════════════════════════════════════════")
                    SendResult.FailedRetryable(
                        reason = "Timeout: ${result.message}",
                        retryAfterMs = 10000
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "✗ Exception during send", e)
            Log.d(TAG, "═══════════════════════════════════════════════════════")
            SendResult.FailedRetryable(
                reason = "Exception: ${e.message}",
                retryAfterMs = 5000
            )
        }
    }
}

/**
 * 자동화 작업 결과
 */
sealed class AutomationResult {
    data object Success : AutomationResult()
    data class Failed(val errorCode: String, val message: String) : AutomationResult()
    data class Timeout(val message: String) : AutomationResult()
}

