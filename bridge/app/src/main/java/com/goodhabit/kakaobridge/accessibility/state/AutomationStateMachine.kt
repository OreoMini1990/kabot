package com.goodhabit.kakaobridge.accessibility.state

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import com.goodhabit.kakaobridge.accessibility.AutomationResult
import com.goodhabit.kakaobridge.accessibility.KakaoAutomationService
import com.goodhabit.kakaobridge.config.SelectorsConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 자동화 상태 머신
 * 
 * UI 자동화를 상태 기반으로 안정적으로 처리
 * 각 상태마다 타임아웃 및 재시도 로직 포함
 */
class AutomationStateMachine {
    
    companion object {
        private const val TAG = "AutomationStateMachine"
        private const val STATE_TIMEOUT_MS = 10000L // 각 상태당 10초 타임아웃
        private const val MAX_RETRIES = 2 // 최대 재시도 횟수
    }
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    
    private var currentState: AutomationState = AutomationState.Idle
    private var roomKey: String = ""
    private var text: String = ""
    private var retryCount: Int = 0
    private var onComplete: ((AutomationResult) -> Unit)? = null
    private var isCancelled: Boolean = false
    
    /**
     * 전송 작업 시작
     */
    fun startSendJob(roomKey: String, text: String, onComplete: (AutomationResult) -> Unit) {
        this.roomKey = roomKey
        this.text = text
        this.onComplete = onComplete
        this.retryCount = 0
        this.isCancelled = false
        
        Log.i(TAG, "Starting send job: roomKey=\"$roomKey\", textLength=${text.length}")
        
        transitionTo(AutomationState.LaunchKakao)
    }
    
    /**
     * 작업 취소
     */
    fun cancel() {
        isCancelled = true
        Log.w(TAG, "Job cancelled")
        complete(AutomationResult.Failed("CANCELLED", "작업이 취소되었습니다"))
    }
    
    /**
     * 상태 전환
     */
    private fun transitionTo(newState: AutomationState) {
        if (isCancelled) return
        
        Log.d(TAG, "State transition: ${currentState.name} -> ${newState.name}")
        currentState = newState
        retryCount = 0
        
        scope.launch {
            processCurrentState()
        }
    }
    
    /**
     * 현재 상태 처리
     */
    private suspend fun processCurrentState() {
        val service = KakaoAutomationService.getInstance() ?: run {
            complete(AutomationResult.Failed("NO_SERVICE", "AccessibilityService가 활성화되지 않았습니다"))
            return
        }
        
        when (currentState) {
            AutomationState.Idle -> {
                // 대기 상태 (작업 없음)
            }
            
            AutomationState.LaunchKakao -> {
                if (!service.launchKakaoTalk()) {
                    handleStateFailure("카카오톡 실행 실패")
                    return
                }
                delay(2000) // 카카오톡 실행 대기
                transitionTo(AutomationState.GoToSearch)
            }
            
            AutomationState.GoToSearch -> {
                val searchButton = service.findNodeByViewId(SelectorsConfig.SEARCH_BUTTON_ID)
                if (searchButton == null) {
                    handleStateFailure("검색 버튼을 찾을 수 없습니다")
                    return
                }
                if (!service.clickNode(searchButton)) {
                    handleStateFailure("검색 버튼 클릭 실패")
                    return
                }
                delay(1000) // 검색창 열림 대기
                transitionTo(AutomationState.SearchRoom)
            }
            
            AutomationState.SearchRoom -> {
                val searchInput = service.findNodeByViewId(SelectorsConfig.SEARCH_INPUT_ID)
                if (searchInput == null) {
                    handleStateFailure("검색 입력창을 찾을 수 없습니다")
                    return
                }
                if (!service.setText(searchInput, roomKey)) {
                    handleStateFailure("검색어 입력 실패")
                    return
                }
                delay(1500) // 검색 결과 대기
                transitionTo(AutomationState.OpenRoom)
            }
            
            AutomationState.OpenRoom -> {
                val roomNode = service.findNodeByTextContains(roomKey)
                if (roomNode == null) {
                    handleStateFailure("채팅방을 찾을 수 없습니다: $roomKey")
                    return
                }
                if (!service.clickNode(roomNode)) {
                    handleStateFailure("채팅방 클릭 실패")
                    return
                }
                delay(2000) // 채팅방 열림 대기
                transitionTo(AutomationState.WaitChatReady)
            }
            
            AutomationState.WaitChatReady -> {
                // 채팅 입력창이 나타날 때까지 대기
                var chatInput: android.view.accessibility.AccessibilityNodeInfo? = null
                var found = false
                repeat(10) { // 최대 10초 대기
                    chatInput = service.findNodeByViewId(SelectorsConfig.CHAT_INPUT_ID)
                    if (chatInput != null) {
                        found = true
                        return@repeat
                    }
                    delay(1000)
                }
                
                if (!found || chatInput == null) {
                    handleStateFailure("채팅 입력창을 찾을 수 없습니다")
                    return
                }
                transitionTo(AutomationState.InputText)
            }
            
            AutomationState.InputText -> {
                val chatInput = service.findNodeByViewId(SelectorsConfig.CHAT_INPUT_ID)
                if (chatInput == null) {
                    handleStateFailure("채팅 입력창을 찾을 수 없습니다")
                    return
                }
                if (!service.setText(chatInput, text)) {
                    handleStateFailure("메시지 입력 실패")
                    return
                }
                delay(500) // 입력 완료 대기
                transitionTo(AutomationState.ClickSend)
            }
            
            AutomationState.ClickSend -> {
                val sendButton = service.findNodeByViewId(SelectorsConfig.SEND_BUTTON_ID)
                    ?: service.findNodeByText("전송")
                
                if (sendButton == null) {
                    handleStateFailure("전송 버튼을 찾을 수 없습니다")
                    return
                }
                if (!service.clickNode(sendButton)) {
                    handleStateFailure("전송 버튼 클릭 실패")
                    return
                }
                delay(1000) // 전송 완료 대기
                transitionTo(AutomationState.VerifySent)
            }
            
            AutomationState.VerifySent -> {
                // (선택) 마지막 메시지 확인
                // 현재는 성공으로 간주
                complete(AutomationResult.Success)
            }
            
            AutomationState.Done -> {
                complete(AutomationResult.Success)
            }
            
            AutomationState.Failed -> {
                complete(AutomationResult.Failed("STATE_FAILED", "상태 머신 실패"))
            }
        }
    }
    
    /**
     * 상태 처리 실패 처리
     */
    private fun handleStateFailure(message: String) {
        if (retryCount < MAX_RETRIES) {
            retryCount++
            Log.w(TAG, "State failure (retry $retryCount/$MAX_RETRIES): $message")
            scope.launch {
                delay(1000)
                processCurrentState() // 재시도
            }
        } else {
            Log.e(TAG, "State failure (max retries exceeded): $message")
            complete(AutomationResult.Failed("STATE_FAILED", message))
        }
    }
    
    /**
     * 작업 완료
     */
    private fun complete(result: AutomationResult) {
        currentState = AutomationState.Done
        onComplete?.invoke(result)
        onComplete = null
    }
    
    /**
     * AccessibilityEvent 처리 (필요시)
     */
    fun handleAccessibilityEvent(event: AccessibilityEvent) {
        // 필요시 이벤트 기반 상태 전환 처리
        // 예: 특정 화면 감지 시 상태 전환
    }
}

/**
 * 자동화 상태 열거형
 */
enum class AutomationState {
    Idle,
    LaunchKakao,        // 카카오톡 실행
    GoToSearch,         // 검색 버튼 클릭
    SearchRoom,         // 검색어 입력
    OpenRoom,           // 채팅방 클릭
    WaitChatReady,      // 채팅 입력창 대기
    InputText,          // 메시지 입력
    ClickSend,          // 전송 버튼 클릭
    VerifySent,         // 전송 확인
    Done,               // 완료
    Failed              // 실패
}

