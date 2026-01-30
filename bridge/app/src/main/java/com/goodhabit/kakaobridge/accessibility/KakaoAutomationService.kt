package com.goodhabit.kakaobridge.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityWindowInfo
import com.goodhabit.kakaobridge.accessibility.state.AutomationStateMachine
import com.goodhabit.kakaobridge.accessibility.state.AutomationState
import com.goodhabit.kakaobridge.accessibility.util.UiNodeHelper
import com.goodhabit.kakaobridge.accessibility.AutomationResult
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
        private const val SERVICE_ID = "com.goodhabit.kakaobridge/.accessibility.KakaoAutomationService"
        
        // 싱글톤 인스턴스 (서비스가 활성화된 경우에만 설정됨)
        @Volatile
        private var instance: KakaoAutomationService? = null
        
        fun getInstance(): KakaoAutomationService? = instance
        
        /**
         * Settings.Secure를 사용하여 서비스가 활성화되어 있는지 확인
         * getInstance()는 onServiceConnected() 이후에만 작동하므로,
         * 이 메서드를 사용하여 설정에서 활성화되었는지 확인
         */
        fun isServiceEnabled(context: Context): Boolean {
            // 먼저 인스턴스가 있으면 true (이미 연결됨)
            if (instance != null) {
                Log.d(TAG, "isServiceEnabled: instance exists, returning true")
                return true
            }
            
            // Settings.Secure로 직접 확인 (더 신뢰할 수 있음)
            val packageName = context.packageName
            val serviceComponent = "$packageName/.accessibility.KakaoAutomationService"
            
            val enabledServices = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )
            
            Log.d(TAG, "isServiceEnabled check:")
            Log.d(TAG, "  instance=${instance != null}")
            Log.d(TAG, "  packageName=$packageName")
            Log.d(TAG, "  serviceComponent=$serviceComponent")
            Log.d(TAG, "  enabledServices=$enabledServices")
            
            if (enabledServices.isNullOrBlank()) {
                Log.d(TAG, "  No enabled accessibility services found")
                return false
            }
            
            // "package.name/component.name:package.name2/component.name2" 형식 파싱
            val enabledList = enabledServices.split(":").map { it.trim() }.toSet()
            val isEnabled = enabledList.contains(serviceComponent) || 
                          enabledList.any { it.startsWith(packageName) && it.contains("KakaoAutomationService") }
            
            Log.d(TAG, "  enabledList size=${enabledList.size}")
            Log.d(TAG, "  isEnabled=$isEnabled")
            
            return isEnabled
        }
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
                        AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                        AccessibilityEvent.TYPE_WINDOWS_CHANGED  // 윈도우 변경 이벤트 추가
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
    suspend fun sendMessage(roomKey: String, text: String, imageUrl: String? = null): AutomationResult {
        return sendMutex.withLock {
            // 이미 진행 중인 작업이 있으면 대기
            currentJob?.get()?.let { return it }
            
            Log.i(TAG, "Starting message send automation: roomKey=\"$roomKey\", textLength=${text.length}, imageUrl=${imageUrl ?: "none"}")
            
            val future = CompletableFuture<AutomationResult>()
            currentJob = future
            
            try {
                // 상태 머신 초기화 및 작업 시작
                stateMachine.startSendJob(roomKey, text, imageUrl) { result ->
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
     * 활성/포커스 윈도우의 루트 노드 가져오기 (getWindows() 폴백 포함)
     */
    fun getActiveRoot(): AccessibilityNodeInfo? {
        // 1순위: rootInActiveWindow 사용
        val activeWindowRoot = rootInActiveWindow
        if (activeWindowRoot != null) {
            Log.d(TAG, "getActiveRoot: Found via rootInActiveWindow")
            return activeWindowRoot
        }
        
        // 2순위: getWindows()에서 활성/포커스 윈도우 찾기
        val windows = windows
        Log.d(TAG, "getActiveRoot: rootInActiveWindow is null, checking getWindows()...")
        Log.d(TAG, "  windows != null: ${windows != null}")
        Log.d(TAG, "  windows.size: ${windows?.size ?: 0}")
        
        if (windows != null && windows.isNotEmpty()) {
            // 모든 윈도우 정보 로깅
            windows.forEachIndexed { index, window ->
                Log.d(TAG, "  Window[$index]: type=${window.type}, isActive=${window.isActive}, isFocused=${window.isFocused}, root=${window.root != null}")
            }
            
            // 활성 윈도우 우선
            windows.find { it.isActive }?.let { win ->
                Log.d(TAG, "  Found active window, root: ${win.root != null}")
                win.root?.let { return it }
            }
            
            // 포커스 윈도우
            windows.find { it.isFocused }?.let { win ->
                Log.d(TAG, "  Found focused window, root: ${win.root != null}")
                win.root?.let { return it }
            }
            
            // 카카오톡 패키지의 애플리케이션 윈도우 찾기
            windows.find { 
                it.type == AccessibilityWindowInfo.TYPE_APPLICATION && 
                it.root != null 
            }?.let { win ->
                Log.d(TAG, "  Found application window, root: ${win.root != null}")
                win.root?.let { return it }
            }
            
            // 모든 윈도우에서 루트가 있는 첫 번째 윈도우
            windows.find { it.root != null }?.let { win ->
                Log.d(TAG, "  Found window with root (fallback)")
                return win.root
            }
        } else {
            Log.w(TAG, "getActiveRoot: windows is null or empty")
        }
        
        Log.w(TAG, "getActiveRoot: No active root found")
        return null
    }
    
    /**
     * 활성 루트가 나타날 때까지 대기 (최대 timeoutMs)
     */
    suspend fun waitForActiveRoot(timeoutMs: Long = 5000): AccessibilityNodeInfo? {
        val startTime = System.currentTimeMillis()
        while (System.currentTimeMillis() - startTime < timeoutMs) {
            getActiveRoot()?.let {
                Log.i(TAG, "waitForActiveRoot: Root found after ${System.currentTimeMillis() - startTime}ms")
                return it
            }
            kotlinx.coroutines.delay(200) // 200ms마다 체크
        }
        Log.w(TAG, "waitForActiveRoot: Timeout after ${timeoutMs}ms")
        return null
    }
    
    /**
     * UI 노드 탐색 헬퍼 (상태 머신에서 사용)
     */
    fun findNodeByViewId(viewId: String): AccessibilityNodeInfo? {
        return getActiveRoot()?.let { root ->
            UiNodeHelper.findNodeByViewId(root, viewId)
        }
    }
    
    fun findNodeByText(text: String): AccessibilityNodeInfo? {
        return getActiveRoot()?.let { root ->
            UiNodeHelper.findNodeByText(root, text)
        }
    }
    
    fun findNodeByTextContains(text: String): AccessibilityNodeInfo? {
        return getActiveRoot()?.let { root ->
            UiNodeHelper.findNodeByTextContains(root, text)
        }
    }
    
    fun findNodeByContentDescription(description: String): AccessibilityNodeInfo? {
        val root = getActiveRoot()
        if (root == null) {
            Log.w(TAG, "findNodeByContentDescription: No active root available")
            return null
        }
        Log.d(TAG, "findNodeByContentDescription: Searching for description=\"$description\"")
        val result = UiNodeHelper.findNodeByContentDescription(root, description)
        if (result != null) {
            Log.i(TAG, "findNodeByContentDescription: Found node with description=\"$description\"")
        } else {
            Log.w(TAG, "findNodeByContentDescription: No node found with description=\"$description\"")
        }
        return result
    }
    
    fun findNodeByContentDescriptionContains(description: String): AccessibilityNodeInfo? {
        return getActiveRoot()?.let { root ->
            UiNodeHelper.findNodeByContentDescriptionContains(root, description)
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
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
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
    
    /**
     * BACK 키 입력 (최상위로 복귀)
     */
    fun pressBack(): Boolean {
        return try {
            performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            Log.d(TAG, "BACK key pressed")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to press BACK", e)
            false
        }
    }
    
    fun pressHome(): Boolean {
        return try {
            performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
            Log.d(TAG, "HOME key pressed")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to press HOME", e)
            false
        }
    }
    
    /**
     * 홈 화면으로 이동
     */
    fun goHome(): Boolean {
        return try {
            performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
            Log.d(TAG, "HOME key pressed")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to press HOME", e)
            false
        }
    }
    
    /**
     * 메시지 삭제
     * 
     * 프로세스:
     * 1. 메시지 텍스트로 메시지 찾기
     * 2. 메시지 길게 누르기
     * 3. "삭제" 버튼 클릭
     * 4. "모두에게서 삭제" 선택 확인 (이미 선택되어 있을 수 있음)
     * 5. "확인" 버튼 클릭
     */
    suspend fun deleteMessage(roomKey: String, messageText: String): AutomationResult {
        return sendMutex.withLock {
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "🗑️ 메시지 삭제 시작")
            Log.i(TAG, "  roomKey: $roomKey")
            Log.i(TAG, "  messageText: ${messageText.take(50)}...")
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            
            try {
                // 1. 카카오톡 실행 (필요한 경우)
                if (!isKakaoTalkActive()) {
                    Log.i(TAG, "카카오톡이 실행되지 않음, 실행 시도...")
                    launchKakaoTalk()
                    delay(2000) // 카카오톡 실행 대기
                }
                
                // 2. 활성 루트 대기
                val root = waitForActiveRoot(5000)
                if (root == null) {
                Log.e(TAG, "활성 루트를 찾을 수 없음")
                return AutomationResult.Failed("TIMEOUT", "활성 루트를 찾을 수 없습니다")
                }
                
                // 2-1. 덤프 생성하여 노드 구조 파악 (접근성 제어 개선)
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                Log.i(TAG, "📋 UI 덤프 생성 중... (접근성 제어 개선)")
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                try {
                    // AccessibilityService에서 rootInActiveWindow를 사용하여 노드 트리 덤프
                    val root = getActiveRoot()
                    if (root != null) {
                        Log.i(TAG, "✅ 활성 루트 노드 발견, 노드 구조 분석 중...")
                        // 노드 트리를 순회하여 덤프 정보 수집
                        val nodeInfo = StringBuilder()
                        dumpNodeTree(root, nodeInfo, 0, 3) // 최대 3단계 깊이까지
                        Log.d(TAG, "📋 UI 노드 구조 (처음 1000자):\n${nodeInfo.toString().take(1000)}")
                        Log.i(TAG, "✅ UI 덤프 생성 완료")
                    } else {
                        Log.w(TAG, "⚠️ 활성 루트 노드를 찾을 수 없음 (계속 진행)")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ UI 덤프 생성 중 오류 발생 (계속 진행): ${e.message}")
                }
                
                // 3. 메시지 텍스트로 메시지 찾기 (부분 일치)
                Log.i(TAG, "메시지 찾는 중: \"${messageText.take(30)}...\"")
                val messageNode = findNodeByTextContains(messageText)
                
                if (messageNode == null) {
                    Log.w(TAG, "메시지를 찾을 수 없음")
                    return AutomationResult.Failed("MESSAGE_NOT_FOUND", "메시지를 찾을 수 없습니다: ${messageText.take(30)}...")
                }
                
                Log.i(TAG, "✓ 메시지 찾음")
                
                // 4. 메시지 길게 누르기
                Log.i(TAG, "메시지 길게 누르는 중...")
                val longClickResult = UiNodeHelper.longClickNode(messageNode)
                if (!longClickResult) {
                    Log.e(TAG, "메시지 길게 누르기 실패")
                    return AutomationResult.Failed("LONG_CLICK_FAILED", "메시지 길게 누르기 실패")
                }
                
                Log.i(TAG, "✓ 메시지 길게 누름")
                delay(1000) // 메뉴 표시 대기
                
                // 5. "삭제" 버튼 찾기 및 클릭
                Log.i(TAG, "\"삭제\" 버튼 찾는 중...")
                val deleteButton = findNodeByText("삭제")
                if (deleteButton == null) {
                    Log.e(TAG, "\"삭제\" 버튼을 찾을 수 없음")
                    pressBack() // 다이얼로그 닫기
                    return AutomationResult.Failed("DELETE_BUTTON_NOT_FOUND", "\"삭제\" 버튼을 찾을 수 없습니다")
                }
                
                Log.i(TAG, "✓ \"삭제\" 버튼 찾음, 클릭 중...")
                val deleteClickResult = clickNode(deleteButton)
                if (!deleteClickResult) {
                    Log.e(TAG, "\"삭제\" 버튼 클릭 실패")
                    pressBack()
                    return AutomationResult.Failed("DELETE_BUTTON_CLICK_FAILED", "\"삭제\" 버튼 클릭 실패")
                }
                
                Log.i(TAG, "✓ \"삭제\" 버튼 클릭됨")
                delay(1000) // 삭제 다이얼로그 표시 대기
                
                // 6. "모두에게서 삭제" 라디오 버튼 확인 (이미 선택되어 있을 수 있음)
                Log.i(TAG, "\"모두에게서 삭제\" 옵션 확인 중...")
                val deleteForAll = findNodeByContentDescription("모두에게서 삭제")
                if (deleteForAll != null) {
                    // 라디오 버튼이 선택되어 있지 않으면 클릭
                    val isChecked = deleteForAll.isChecked
                    Log.i(TAG, "  \"모두에게서 삭제\" 선택 상태: $isChecked")
                    if (!isChecked) {
                        Log.i(TAG, "  \"모두에게서 삭제\" 선택 중...")
                        val selectResult = clickNode(deleteForAll)
                        if (!selectResult) {
                            Log.w(TAG, "  \"모두에게서 삭제\" 선택 실패 (계속 진행)")
                        } else {
                            Log.i(TAG, "  ✓ \"모두에게서 삭제\" 선택됨")
                        }
                        delay(500)
                    } else {
                        Log.i(TAG, "  ✓ \"모두에게서 삭제\" 이미 선택됨")
                    }
                } else {
                    Log.w(TAG, "  \"모두에게서 삭제\" 옵션을 찾을 수 없음 (계속 진행)")
                }
                
                // 7. "확인" 버튼 찾기 및 클릭
                Log.i(TAG, "\"확인\" 버튼 찾는 중...")
                val confirmButton = findNodeByText("확인")
                if (confirmButton == null) {
                    Log.e(TAG, "\"확인\" 버튼을 찾을 수 없음")
                    pressBack() // 다이얼로그 닫기
                    return AutomationResult.Failed("CONFIRM_BUTTON_NOT_FOUND", "\"확인\" 버튼을 찾을 수 없습니다")
                }
                
                Log.i(TAG, "✓ \"확인\" 버튼 찾음, 클릭 중...")
                val confirmClickResult = clickNode(confirmButton)
                if (!confirmClickResult) {
                    Log.e(TAG, "\"확인\" 버튼 클릭 실패")
                    pressBack()
                    return AutomationResult.Failed("CONFIRM_BUTTON_CLICK_FAILED", "\"확인\" 버튼 클릭 실패")
                }
                
                Log.i(TAG, "✓ \"확인\" 버튼 클릭됨")
                delay(1000) // 삭제 완료 대기
                
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                Log.i(TAG, "✅✅✅ 메시지 삭제 성공 ✅✅✅")
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                
                return AutomationResult.Success
                
            } catch (e: Exception) {
                Log.e(TAG, "메시지 삭제 중 오류 발생", e)
                return AutomationResult.Failed("EXCEPTION", "오류: ${e.message}")
            }
        }
    }
    
    /**
     * 카카오톡이 활성 상태인지 확인
     */
    private fun isKakaoTalkActive(): Boolean {
        val root = getActiveRoot()
        return root != null && root.packageName == KAKAO_TALK_PACKAGE
    }
    
    /**
     * 노드 트리를 재귀적으로 덤프 (디버깅용)
     */
    private fun dumpNodeTree(node: AccessibilityNodeInfo?, sb: StringBuilder, depth: Int, maxDepth: Int) {
        if (node == null || depth > maxDepth) return
        
        val indent = "  ".repeat(depth)
        val className = node.className?.toString() ?: "null"
        val text = node.text?.toString()?.take(50) ?: ""
        val desc = node.contentDescription?.toString()?.take(50) ?: ""
        val viewId = node.viewIdResourceName ?: ""
        val isClickable = node.isClickable
        val isFocusable = node.isFocusable
        
        sb.append("$indent[Node] className=$className")
        if (text.isNotEmpty()) sb.append(", text=\"$text\"")
        if (desc.isNotEmpty()) sb.append(", desc=\"$desc\"")
        if (viewId.isNotEmpty()) sb.append(", viewId=$viewId")
        if (isClickable) sb.append(", clickable")
        if (isFocusable) sb.append(", focusable")
        sb.append("\n")
        
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                dumpNodeTree(child, sb, depth + 1, maxDepth)
            }
        }
    }
}

