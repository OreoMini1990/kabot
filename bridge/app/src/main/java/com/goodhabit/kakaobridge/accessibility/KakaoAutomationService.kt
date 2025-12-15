package com.goodhabit.kakaobridge.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.goodhabit.kakaobridge.accessibility.state.AutomationStateMachine
import com.goodhabit.kakaobridge.accessibility.state.AutomationState
import com.goodhabit.kakaobridge.accessibility.util.UiNodeHelper
import com.goodhabit.kakaobridge.config.SelectorsConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.CompletableFuture

/**
 * 카카오톡 UI 자동화를 위한 AccessibilityService
 * 
 * 알림이 없어도 카카오톡을 직접 조작하여 메시지 전송 가능
 * 
 * 주의: 이 서비스는 기능 플래그로 활성화/비활성화 가능
 */
class KakaoAutomationService : AccessibilityService() {
    
    companion object {
        private const val TAG = "KakaoAutomationService"
        private const val KAKAO_TALK_PACKAGE = "com.kakao.talk"
        
        // 싱글톤 인스턴스 (서비스가 활성화된 경우에만 설정됨)
        @Volatile
        private var instance: KakaoAutomationService? = null
        
        fun getInstance(): KakaoAutomationService? = instance
    }
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val stateMachine = AutomationStateMachine()
    private val sendMutex = Mutex() // 단일 실행 보장
    
    // 현재 진행 중인 작업
    private var currentJob: CompletableFuture<AutomationResult>? = null
    
    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "AccessibilityService connected")
        
        // 서비스 정보 설정
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                        AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                   AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
            notificationTimeout = 100
            packageNames = arrayOf(KAKAO_TALK_PACKAGE)
        }
        setServiceInfo(info)
        
        Log.i(TAG, "AccessibilityService configured for KakaoTalk")
    }
    
    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.i(TAG, "AccessibilityService destroyed")
    }
    
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 상태 머신이 이벤트를 처리하도록 전달
        event?.let {
            stateMachine.handleAccessibilityEvent(it)
        }
    }
    
    override fun onInterrupt() {
        Log.w(TAG, "AccessibilityService interrupted")
    }
    
    /**
     * 서비스가 활성화되어 있는지 확인
     */
    fun isServiceEnabled(): Boolean {
        return instance != null
    }
    
    /**
     * 메시지 전송 요청
     * 
     * 단일 실행 원칙: 동시에 여러 작업이 실행되지 않도록 Mutex로 보호
     */
    suspend fun sendMessage(roomKey: String, text: String): AutomationResult {
        return sendMutex.withLock {
            // 이미 진행 중인 작업이 있으면 대기
            currentJob?.get()?.let { return it }
            
            Log.i(TAG, "Starting message send automation: roomKey=\"$roomKey\", textLength=${text.length}")
            
            val future = CompletableFuture<AutomationResult>()
            currentJob = future
            
            try {
                // 상태 머신 초기화 및 작업 시작
                stateMachine.startSendJob(roomKey, text) { result ->
                    future.complete(result)
                }
                
                // 타임아웃 설정 (60초)
                serviceScope.launch {
                    delay(60000)
                    if (!future.isDone) {
                        Log.e(TAG, "Send job timeout")
                        stateMachine.cancel()
                        future.complete(AutomationResult.Timeout("작업 타임아웃 (60초)"))
                    }
                }
                
                // 결과 대기
                val result = future.get()
                currentJob = null
                return result
                
            } catch (e: Exception) {
                Log.e(TAG, "Exception during sendMessage", e)
                currentJob = null
                return AutomationResult.Failed("EXCEPTION", e.message ?: "Unknown error")
            }
        }
    }
    
    /**
     * UI 노드 탐색 헬퍼 (상태 머신에서 사용)
     */
    fun findNodeByViewId(viewId: String): AccessibilityNodeInfo? {
        return rootInActiveWindow?.let { root ->
            UiNodeHelper.findNodeByViewId(root, viewId)
        }
    }
    
    fun findNodeByText(text: String): AccessibilityNodeInfo? {
        return rootInActiveWindow?.let { root ->
            UiNodeHelper.findNodeByText(root, text)
        }
    }
    
    fun findNodeByTextContains(text: String): AccessibilityNodeInfo? {
        return rootInActiveWindow?.let { root ->
            UiNodeHelper.findNodeByTextContains(root, text)
        }
    }
    
    /**
     * 노드 클릭
     */
    fun clickNode(node: AccessibilityNodeInfo?): Boolean {
        return UiNodeHelper.clickNode(node)
    }
    
    /**
     * 텍스트 입력
     */
    fun setText(node: AccessibilityNodeInfo?, text: String): Boolean {
        return UiNodeHelper.setText(this, node, text)
    }
    
    /**
     * 카카오톡 실행
     */
    fun launchKakaoTalk(): Boolean {
        return try {
            val intent = packageManager.getLaunchIntentForPackage(KAKAO_TALK_PACKAGE)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                Log.d(TAG, "KakaoTalk launched")
                true
            } else {
                Log.e(TAG, "Failed to get launch intent for KakaoTalk")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch KakaoTalk", e)
            false
        }
    }
}

