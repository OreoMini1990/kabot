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
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    
    private var currentState: AutomationState = AutomationState.Idle
    private var roomKey: String = ""
    private var text: String = ""
    private var imageUrl: String? = null
    private var retryCount: Int = 0
    private var onComplete: ((AutomationResult) -> Unit)? = null
    private var isCancelled: Boolean = false
    
    /**
     * 전송 작업 시작
     */
    fun startSendJob(roomKey: String, text: String, imageUrl: String? = null, onComplete: (AutomationResult) -> Unit) {
        this.roomKey = roomKey
        this.text = text
        this.imageUrl = imageUrl
        this.onComplete = onComplete
        this.retryCount = 0
        this.isCancelled = false
        
        Log.i(TAG, "Starting send job: roomKey=\"$roomKey\", textLength=${text.length}, imageUrl=${imageUrl ?: "none"}")
        
        // 카카오톡은 미리 실행해두므로 바로 홈 화면 바로가기로 시작
        transitionTo(AutomationState.OpenHomeShortcut)
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
        if (isCancelled) {
            Log.w(TAG, "Cannot transition to ${newState.name}: job is cancelled")
            return
        }
        
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "State transition: ${currentState.name} -> ${newState.name}")
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        currentState = newState
        retryCount = 0
        
        Log.i(TAG, "Launching coroutine to process state: ${newState.name}")
        Log.i(TAG, "Current thread: ${Thread.currentThread().name}")
        Log.i(TAG, "Scope context: ${scope.coroutineContext}")
        
        val job = scope.launch {
            try {
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                Log.i(TAG, "Coroutine started! Thread: ${Thread.currentThread().name}")
                Log.i(TAG, "Calling processCurrentState()...")
                Log.i(TAG, "═══════════════════════════════════════════════════════")
            processCurrentState()
                Log.i(TAG, "✓ processCurrentState() completed successfully")
            } catch (e: Exception) {
                Log.e(TAG, "✗✗✗ Exception in processCurrentState() ✗✗✗", e)
                Log.e(TAG, "Exception type: ${e.javaClass.name}")
                Log.e(TAG, "Exception message: ${e.message}")
                e.printStackTrace()
                complete(AutomationResult.Failed("EXCEPTION", e.message ?: "Unknown error: ${e.javaClass.simpleName}"))
            }
        }
        Log.i(TAG, "Coroutine launch completed, job: $job, isActive: ${job.isActive}")
    }
    
    /**
     * 현재 상태 처리
     */
    private suspend fun processCurrentState() {
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "processCurrentState() called for state: ${currentState.name}")
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        
        val service = KakaoAutomationService.getInstance()
        if (service == null) {
            Log.e(TAG, "✗✗✗ KakaoAutomationService.getInstance() is null ✗✗✗")
            complete(AutomationResult.Failed("NO_SERVICE", "AccessibilityService가 활성화되지 않았습니다"))
            return
        }
        
        Log.i(TAG, "✓ KakaoAutomationService instance obtained")
        Log.i(TAG, "Processing state: ${currentState.name}")
        
        when (currentState) {
            AutomationState.Idle -> {
                // 대기 상태 (작업 없음)
                Log.d(TAG, "Idle state - no action")
            }
            
            AutomationState.LaunchKakao -> {
                Log.i(TAG, "LaunchKakao: Attempting to launch KakaoTalk...")
                val launchResult = service.launchKakaoTalk()
                Log.i(TAG, "LaunchKakao: launchKakaoTalk() returned: $launchResult")
                if (!launchResult) {
                    Log.e(TAG, "✗ LaunchKakao: launchKakaoTalk() failed")
                    handleStateFailure("카카오톡 실행 실패")
                    return
                }
                Log.i(TAG, "LaunchKakao: Waiting 2 seconds for KakaoTalk to start...")
                delay(2000)
                
                // 활성 루트가 나타날 때까지 대기 (최대 5초)
                Log.i(TAG, "LaunchKakao: Waiting for active root to appear...")
                var root = service.waitForActiveRoot(5000)
                if (root == null) {
                    Log.w(TAG, "⚠ LaunchKakao: Active root not found after waiting, continuing anyway...")
                } else {
                    val packageName = root.packageName?.toString() ?: ""
                    Log.i(TAG, "✓ LaunchKakao: Active root found (package: $packageName)")
                    
                    // 카카오톡이 아닌 경우 다시 실행 시도
                    if (packageName != "com.kakao.talk") {
                        Log.w(TAG, "⚠ LaunchKakao: Active app is not KakaoTalk ($packageName), retrying launch...")
                        delay(1000)
                        val retryResult = service.launchKakaoTalk()
                        if (retryResult) {
                            delay(2000)
                            root = service.waitForActiveRoot(5000)
                            if (root != null) {
                                val retryPackage = root.packageName?.toString() ?: ""
                                Log.i(TAG, "✓ LaunchKakao: Retry successful (package: $retryPackage)")
                            }
                        }
                    }
                }
                
                // 카카오톡이 실행되었는지 최종 확인
                root = service.getActiveRoot()
                if (root != null) {
                    val packageName = root.packageName?.toString() ?: ""
                    if (packageName != "com.kakao.talk") {
                        Log.e(TAG, "✗ LaunchKakao: KakaoTalk is not active (package: $packageName)")
                        handleStateFailure("카카오톡이 실행되지 않았습니다 (현재 앱: $packageName)")
                        return
                    }
                } else {
                    Log.e(TAG, "✗ LaunchKakao: No active root available")
                    handleStateFailure("활성 앱을 찾을 수 없습니다")
                    return
                }
                
                // BACK 키로 최상위 화면으로 복귀 (팝업/다른 화면 제거)
                // 단, 카카오톡이 실행 중인지 확인하면서 진행
                Log.i(TAG, "LaunchKakao: Pressing BACK 2 times to ensure we're at top level...")
                var shouldStopBack = false
                for (i in 1..2) { // 3번 -> 2번으로 감소 (홈 화면으로 돌아가는 것 방지)
                    if (shouldStopBack) break
                    
                    service.pressBack()
                    delay(500)
                    
                    // BACK 키 누른 후 카카오톡이 여전히 활성인지 확인
                    val currentRoot = service.getActiveRoot()
                    val currentPackage = currentRoot?.packageName?.toString() ?: ""
                    if (currentPackage != "com.kakao.talk") {
                        Log.w(TAG, "⚠ LaunchKakao: KakaoTalk lost focus after BACK (package: $currentPackage), stopping BACK presses")
                        // 카카오톡 다시 실행
                        service.launchKakaoTalk()
                        delay(2000)
                        shouldStopBack = true
                    }
                }
                
                Log.i(TAG, "LaunchKakao: Waiting 1 second after BACK presses...")
                delay(1000)
                
                // 다시 활성 루트 확인 (카카오톡인지 확인)
                Log.i(TAG, "LaunchKakao: Re-checking active root after BACK presses...")
                var finalRoot = service.waitForActiveRoot(3000)
                if (finalRoot == null) {
                    Log.w(TAG, "⚠ LaunchKakao: Active root still not found after BACK presses")
                } else {
                    val finalPackage = finalRoot.packageName?.toString() ?: ""
                    if (finalPackage == "com.kakao.talk") {
                        Log.i(TAG, "✓ LaunchKakao: Active root found after BACK presses (KakaoTalk confirmed)")
                    } else {
                        Log.w(TAG, "⚠ LaunchKakao: Active app is not KakaoTalk after BACK ($finalPackage), retrying...")
                        // 카카오톡 다시 실행
                        service.launchKakaoTalk()
                        delay(2000)
                        finalRoot = service.waitForActiveRoot(3000)
                        if (finalRoot != null) {
                            val retryPackage = finalRoot.packageName?.toString() ?: ""
                            if (retryPackage == "com.kakao.talk") {
                                Log.i(TAG, "✓ LaunchKakao: KakaoTalk restored after retry")
                            } else {
                                Log.e(TAG, "✗ LaunchKakao: Failed to restore KakaoTalk (package: $retryPackage)")
                                handleStateFailure("카카오톡을 복원할 수 없습니다")
                                return
                            }
                        }
                    }
                }
                
                // "채팅" 탭 찾아서 클릭 (최상위 화면에서 채팅 탭으로 이동)
                Log.i(TAG, "LaunchKakao: Looking for '채팅' tab...")
                
                // 1순위: contentDescription이 "채팅 탭"으로 시작하는 노드 찾기
                var chatTab: android.view.accessibility.AccessibilityNodeInfo? = null
                val activeRoot = service.getActiveRoot()
                if (activeRoot != null) {
                    // findAccessibilityNodeInfosByText는 contentDescription도 검색함
                    val nodes = activeRoot.findAccessibilityNodeInfosByText("채팅 탭")
                    if (nodes != null && nodes.size > 0) {
                        chatTab = nodes.firstOrNull { node ->
                            val desc = node.contentDescription?.toString()?.trim() ?: ""
                            desc.startsWith("채팅 탭") && (node.isClickable || node.parent?.isClickable == true)
                        }
                        if (chatTab != null && !chatTab.isClickable) {
                            chatTab = chatTab.parent
                        }
                    }
                    
                    // 2순위: contentDescription에 "채팅" 포함하는 노드 찾기
                    if (chatTab == null) {
                        chatTab = service.findNodeByContentDescriptionContains("채팅 탭")
                        if (chatTab == null) {
                            chatTab = service.findNodeByContentDescriptionContains("채팅")
                        }
                    }
                    
                    // 3순위: text 기반 (하위 호환성)
                    if (chatTab == null) {
                        chatTab = service.findNodeByTextContains("채팅")
                    }
                }
                
                if (chatTab != null) {
                    val desc = chatTab.contentDescription?.toString()?.trim() ?: ""
                    Log.i(TAG, "✓ LaunchKakao: Found '채팅' tab (desc=\"$desc\"), clicking...")
                    if (service.clickNode(chatTab)) {
                        Log.i(TAG, "✓ LaunchKakao: '채팅' tab clicked")
                        delay(1000) // 탭 전환 대기
                    } else {
                        Log.w(TAG, "⚠ LaunchKakao: Failed to click '채팅' tab, continuing anyway...")
                    }
                } else {
                    Log.w(TAG, "⚠ LaunchKakao: '채팅' tab not found, continuing anyway...")
                }
                
                Log.i(TAG, "LaunchKakao: Transitioning to OpenHomeShortcut...")
                transitionTo(AutomationState.OpenHomeShortcut)
            }
            
            AutomationState.OpenHomeShortcut -> {
                Log.i(TAG, "OpenHomeShortcut: Looking for home screen shortcut for room: \"$roomKey\"...")
                
                // 홈 화면으로 이동 (카카오톡이 열려있으면 홈 버튼 누르기)
                Log.i(TAG, "OpenHomeShortcut: Pressing HOME button to go to home screen...")
                val homeResult = service.pressHome()
                if (!homeResult) {
                    Log.w(TAG, "⚠ OpenHomeShortcut: Failed to press HOME button, continuing anyway...")
                }
                delay(1000) // 홈 화면 로드 대기
                
                // 활성 루트가 나타날 때까지 대기 (최대 3초)
                Log.i(TAG, "OpenHomeShortcut: Waiting for active root (home screen)...")
                var root = service.waitForActiveRoot(3000)
                
                if (root == null) {
                    Log.e(TAG, "✗ OpenHomeShortcut: No active root available after waiting")
                    handleStateFailure("홈 화면을 찾을 수 없습니다")
                    return
                }
                
                Log.i(TAG, "✓ OpenHomeShortcut: Active root obtained")
                
                // 홈 화면에서 바로가기 아이콘 찾기 (roomKey로)
                Log.i(TAG, "OpenHomeShortcut: Searching for shortcut icon with text: \"$roomKey\"...")
                delay(500) // 화면 안정화 대기
                
                root = service.getActiveRoot() ?: root
                
                // 1순위: 정확한 텍스트로 찾기
                var shortcutIcon: android.view.accessibility.AccessibilityNodeInfo? = null
                val nodes = root.findAccessibilityNodeInfosByText(roomKey)
                if (nodes != null && nodes.size > 0) {
                    Log.i(TAG, "  Found ${nodes.size} nodes with text=\"$roomKey\"")
                    for (node in nodes) {
                        val nodeText = node.text?.toString()?.trim() ?: ""
                        val nodeDesc = node.contentDescription?.toString()?.trim() ?: ""
                        val isClickable = node.isClickable || node.parent?.isClickable == true
                        
                        Log.i(TAG, "    Node: text=\"$nodeText\", desc=\"$nodeDesc\", clickable=$isClickable")
                        
                        // 텍스트가 정확히 일치하고 클릭 가능한 경우
                        if ((nodeText == roomKey || nodeDesc == roomKey) && isClickable) {
                            shortcutIcon = if (node.isClickable) node else node.parent
                            Log.i(TAG, "  ✓ Found shortcut icon by exact text match")
                            break
                        }
                    }
                }
                
                // 2순위: 텍스트 포함으로 찾기
                if (shortcutIcon == null) {
                    Log.i(TAG, "  Exact text match failed, trying text contains...")
                    shortcutIcon = service.findNodeByTextContains(roomKey)
                    if (shortcutIcon != null) {
                        val nodeText = shortcutIcon.text?.toString()?.trim() ?: ""
                        val nodeDesc = shortcutIcon.contentDescription?.toString()?.trim() ?: ""
                        Log.i(TAG, "  ✓ Found shortcut icon by text contains: text=\"$nodeText\", desc=\"$nodeDesc\"")
                    }
                }
                
                // 3순위: contentDescription으로 찾기
                if (shortcutIcon == null) {
                    Log.i(TAG, "  Text search failed, trying contentDescription...")
                    shortcutIcon = service.findNodeByContentDescription(roomKey)
                    if (shortcutIcon == null) {
                        shortcutIcon = service.findNodeByContentDescriptionContains(roomKey)
                    }
                    if (shortcutIcon != null) {
                        val nodeDesc = shortcutIcon.contentDescription?.toString()?.trim() ?: ""
                        Log.i(TAG, "  ✓ Found shortcut icon by contentDescription: desc=\"$nodeDesc\"")
                    }
                }
                
                // 4순위: 모든 클릭 가능한 아이콘 중에서 찾기
                if (shortcutIcon == null) {
                    Log.i(TAG, "  ContentDescription search failed, trying all clickable icons...")
                    val allClickable = findAllClickableButtons(root)
                    shortcutIcon = allClickable.firstOrNull { icon ->
                        val iconText = icon.text?.toString()?.trim() ?: ""
                        val iconDesc = icon.contentDescription?.toString()?.trim() ?: ""
                        iconText.contains(roomKey) || iconDesc.contains(roomKey)
                    }
                    if (shortcutIcon != null) {
                        val iconText = shortcutIcon.text?.toString()?.trim() ?: ""
                        val iconDesc = shortcutIcon.contentDescription?.toString()?.trim() ?: ""
                        Log.i(TAG, "  ✓ Found shortcut icon by scanning all icons: text=\"$iconText\", desc=\"$iconDesc\"")
                    }
                }
                
                if (shortcutIcon == null) {
                    Log.e(TAG, "✗ OpenHomeShortcut: Shortcut icon not found for room: \"$roomKey\"")
                    Log.i(TAG, "  Dumping all clickable items for debugging...")
                    dumpClickableButtons(root)
                    handleStateFailure("홈 화면에서 바로가기 아이콘을 찾을 수 없습니다: $roomKey")
                    return
                }
                
                val iconText = shortcutIcon.text?.toString()?.trim() ?: ""
                val iconDesc = shortcutIcon.contentDescription?.toString()?.trim() ?: ""
                val className = shortcutIcon.className?.toString() ?: ""
                Log.i(TAG, "✓ OpenHomeShortcut: Shortcut icon found!")
                Log.i(TAG, "  Icon info: className=$className, text=\"$iconText\", contentDescription=\"$iconDesc\"")
                
                if (!service.clickNode(shortcutIcon)) {
                    Log.e(TAG, "✗ OpenHomeShortcut: Failed to click shortcut icon")
                    handleStateFailure("바로가기 아이콘 클릭 실패")
                    return
                }
                
                Log.i(TAG, "✓ OpenHomeShortcut: Shortcut icon clicked, waiting 2 seconds for chat room to open...")
                delay(2000) // 채팅방 열림 대기
                
                // 카카오톡이 열렸는지 확인
                val updatedRoot = service.waitForActiveRoot(2000)
                val updatedPackage = updatedRoot?.packageName?.toString() ?: ""
                if (updatedPackage == "com.kakao.talk") {
                    Log.i(TAG, "✓ OpenHomeShortcut: KakaoTalk opened successfully")
                } else {
                    Log.w(TAG, "⚠ OpenHomeShortcut: KakaoTalk may not be active (package: $updatedPackage), continuing anyway...")
                }
                
                Log.i(TAG, "OpenHomeShortcut: Transitioning to WaitChatReady...")
                transitionTo(AutomationState.WaitChatReady)
            }
            
            AutomationState.OpenTopChat -> {
                // 레거시 상태 (사용 안 함, OpenHomeShortcut으로 대체됨)
                Log.w(TAG, "OpenTopChat: This state is deprecated, should not be reached")
                handleStateFailure("OpenTopChat 상태는 더 이상 사용되지 않습니다")
                return
            }
            
            AutomationState.GoToSearch -> {
                Log.i(TAG, "GoToSearch: Looking for search button...")
                
                // 활성 루트가 나타날 때까지 대기 (최대 3초)
                Log.i(TAG, "GoToSearch: Waiting for active root...")
                var root = service.waitForActiveRoot(3000)
                
                if (root == null) {
                    Log.e(TAG, "✗ GoToSearch: No active root available after waiting")
                    handleStateFailure("활성 윈도우를 찾을 수 없습니다")
                    return
                }
                
                Log.i(TAG, "✓ GoToSearch: Active root obtained")
                
                // 카카오톡이 실행 중인지 확인
                val packageName = root.packageName?.toString() ?: ""
                if (packageName != "com.kakao.talk") {
                    Log.e(TAG, "✗ GoToSearch: KakaoTalk is not active (package: $packageName)")
                    handleStateFailure("카카오톡이 실행되지 않았습니다 (현재 앱: $packageName)")
                    return
                }
                
                // 채팅 탭 확인 및 강제 이동 (검색 버튼은 채팅 탭에서 더 안정적)
                Log.i(TAG, "GoToSearch: Checking if we're on chat tab...")
                val chatTabNodes = root.findAccessibilityNodeInfosByText("채팅 탭")
                val isOnChatTab = chatTabNodes?.any { node ->
                    val desc = node.contentDescription?.toString()?.trim() ?: ""
                    desc.startsWith("채팅 탭") && (node.parent?.isSelected == true || node.isSelected)
                } == true
                
                if (!isOnChatTab) {
                    Log.i(TAG, "GoToSearch: Not on chat tab, attempting to switch...")
                    var chatTab = chatTabNodes?.firstOrNull { node ->
                        val desc = node.contentDescription?.toString()?.trim() ?: ""
                        desc.startsWith("채팅 탭") && (node.isClickable || node.parent?.isClickable == true)
                    }
                    
                    // 채팅 탭을 찾지 못한 경우 다른 방법 시도
                    if (chatTab == null) {
                        chatTab = service.findNodeByContentDescriptionContains("채팅 탭")
                        if (chatTab == null) {
                            chatTab = service.findNodeByContentDescriptionContains("채팅")
                        }
                    }
                    
                    if (chatTab != null) {
                        val clickableTab = if (chatTab.isClickable) chatTab else chatTab.parent
                        if (clickableTab != null && service.clickNode(clickableTab)) {
                            Log.i(TAG, "✓ GoToSearch: Switched to chat tab")
                            delay(1500) // 탭 전환 대기 (1초 -> 1.5초)
                            root = service.waitForActiveRoot(2000) ?: root // 루트 갱신
                            
                            // 다시 카카오톡 확인
                            val updatedPackage = root.packageName?.toString() ?: ""
                            if (updatedPackage != "com.kakao.talk") {
                                Log.e(TAG, "✗ GoToSearch: Lost KakaoTalk after tab switch (package: $updatedPackage)")
                                handleStateFailure("채팅 탭 전환 후 카카오톡이 비활성화되었습니다")
                                return
                            }
                        } else {
                            Log.w(TAG, "⚠ GoToSearch: Failed to click chat tab")
                        }
                    } else {
                        Log.w(TAG, "⚠ GoToSearch: Chat tab not found, continuing anyway...")
                    }
                } else {
                    Log.i(TAG, "✓ GoToSearch: Already on chat tab")
                }
                
                // 여러 방법으로 검색 버튼 찾기 시도 (우선순위 순)
                var searchButton: android.view.accessibility.AccessibilityNodeInfo? = null
                
                Log.i(TAG, "  Root obtained, searching for search button...")
                
                // 1순위: contentDescription 정확 일치 + className="Button" (UI 덤프 기준)
                Log.i(TAG, "  [1] Trying contentDescription='검색' + className='Button'...")
                val allNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
                collectAllNodes(root, allNodes)
                searchButton = allNodes.firstOrNull { node ->
                    val desc = node.contentDescription?.toString()?.trim() ?: ""
                    val className = node.className?.toString() ?: ""
                    desc == "검색" && className.contains("Button") && node.isClickable
                }
                if (searchButton != null) {
                    Log.i(TAG, "  ✓ Found by contentDescription='검색' + className='Button'")
                }
                
                // 2순위: contentDescription 정확 일치 (className 무관)
                if (searchButton == null) {
                    Log.i(TAG, "  [2] Trying contentDescription='검색' (exact match)...")
                    searchButton = service.findNodeByContentDescription("검색")
                    if (searchButton != null) {
                        Log.i(TAG, "  ✓ Found by contentDescription (exact): \"검색\"")
                    }
                }
                
                // 3순위: contentDescription 포함
                if (searchButton == null) {
                    Log.i(TAG, "  [3] Trying contentDescription contains '검색'...")
                    searchButton = service.findNodeByContentDescriptionContains("검색")
                    if (searchButton != null) {
                        val desc = searchButton.contentDescription?.toString() ?: ""
                        Log.i(TAG, "  ✓ Found by contentDescription (contains): desc=\"$desc\"")
                    }
                }
                
                // 4순위: findAccessibilityNodeInfosByText (text와 contentDescription 모두 검색)
                if (searchButton == null) {
                    Log.i(TAG, "  [4] Trying findAccessibilityNodeInfosByText('검색')...")
                    val nodes = root.findAccessibilityNodeInfosByText("검색")
                    if (nodes != null && nodes.size > 0) {
                        Log.i(TAG, "  Found ${nodes.size} nodes with text/contentDescription='검색'")
                        for ((index, node) in nodes.withIndex()) {
                            val desc = node.contentDescription?.toString()?.trim() ?: ""
                            val text = node.text?.toString()?.trim() ?: ""
                            val viewId = node.viewIdResourceName ?: ""
                            val className = node.className?.toString() ?: ""
                            
                            Log.i(TAG, "    Node[$index]: className=$className, text=\"$text\", desc=\"$desc\", viewId=$viewId, clickable=${node.isClickable}, parentClickable=${node.parent?.isClickable}")
                            
                            // 클릭 가능한 노드 찾기
                            if (node.isClickable || node.parent?.isClickable == true) {
                                searchButton = if (node.isClickable) node else node.parent
                                Log.i(TAG, "  ✓ Found by findAccessibilityNodeInfosByText: desc=\"$desc\", text=\"$text\", viewId=$viewId")
                                break
                            }
                        }
                        if (searchButton == null) {
                            Log.w(TAG, "  ✗ Found ${nodes.size} nodes with '검색' but none are clickable")
                        }
                    } else {
                        Log.w(TAG, "  ✗ findAccessibilityNodeInfosByText('검색') returned null or empty")
                    }
                }
                
                // 5순위: 상단 바 영역의 ImageButton/Button 중 clickable 찾기
                if (searchButton == null) {
                    Log.i(TAG, "  [5] Trying ImageButton/Button in toolbar...")
                    searchButton = findClickableButtonInToolbar(root)
                }
                
                // 6순위: 모든 클릭 가능한 버튼을 찾아서 "검색" 관련 버튼 찾기
                if (searchButton == null) {
                    Log.i(TAG, "  [6] Trying all clickable buttons...")
                    val allButtons = findAllClickableButtons(root)
                    Log.i(TAG, "  Found ${allButtons.size} clickable buttons total")
                    
                    // 상위 10개 버튼의 정보 출력 (디버깅용)
                    Log.i(TAG, "  First 10 clickable buttons:")
                    allButtons.take(10).forEachIndexed { index, button ->
                        val text = button.text?.toString()?.trim() ?: ""
                        val desc = button.contentDescription?.toString()?.trim() ?: ""
                        val viewId = button.viewIdResourceName ?: ""
                        val className = button.className?.toString() ?: ""
                        Log.i(TAG, "    [$index] className=$className, text=\"$text\", desc=\"$desc\", viewId=$viewId")
                    }
                    
                    // "검색" 관련 버튼 찾기 (더 엄격한 필터링)
                    searchButton = allButtons.firstOrNull { button ->
                        val text = button.text?.toString()?.trim() ?: ""
                        val desc = button.contentDescription?.toString()?.trim() ?: ""
                        val viewId = button.viewIdResourceName ?: ""
                        val className = button.className?.toString() ?: ""
                        
                        // 검색 관련 키워드 확인
                        val hasSearchKeyword = text.contains("검색", ignoreCase = true) || 
                                             desc.contains("검색", ignoreCase = true) ||
                                             viewId.contains("search", ignoreCase = true) ||
                                             viewId.contains("menu_search", ignoreCase = true) ||
                                             viewId.contains("search_icon", ignoreCase = true)
                        
                        // 제외할 키워드 확인
                        val isExcluded = text.contains("닫기") || text.contains("앱 닫기") || 
                                       desc.contains("닫기") || desc.contains("앱 닫기") ||
                                       text.contains("취소") || desc.contains("취소")
                        
                        if (hasSearchKeyword && !isExcluded) {
                            Log.i(TAG, "  Candidate found: text=\"$text\", desc=\"$desc\", viewId=$viewId, className=$className")
                        }
                        
                        hasSearchKeyword && !isExcluded
                    }
                    
                    if (searchButton != null) {
                        Log.i(TAG, "  ✓ Found search button by scanning all buttons")
                    } else {
                        Log.w(TAG, "  ✗ No search button found in ${allButtons.size} clickable buttons")
                    }
                }
                
                // 7순위: View ID (최후의 수단 - UI 덤프에 없지만 하위 호환성)
                if (searchButton == null) {
                    Log.i(TAG, "  [7] Trying View ID: ${SelectorsConfig.SEARCH_BUTTON_ID} (fallback)...")
                    searchButton = service.findNodeByViewId(SelectorsConfig.SEARCH_BUTTON_ID)
                    if (searchButton != null) {
                        Log.i(TAG, "  ✓ Found by View ID (unexpected but working)")
                    }
                }
                
                if (searchButton == null) {
                    Log.e(TAG, "✗ GoToSearch: Search button not found by any method")
                    Log.e(TAG, "  Tried: View ID, contentDescription, toolbar, all buttons")
                    Log.i(TAG, "  Dumping all clickable buttons for debugging...")
                    dumpClickableButtons(root)
                    
                    // 추가 디버깅: contentDescription이 "검색"인 모든 노드 찾기
                    Log.i(TAG, "  Searching for all nodes with contentDescription containing '검색'...")
                    val allNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
                    collectAllNodes(root, allNodes)
                    val searchNodes = allNodes.filter { node ->
                        val desc = node.contentDescription?.toString()?.trim() ?: ""
                        desc.contains("검색")
                    }
                    Log.i(TAG, "  Found ${searchNodes.size} nodes with contentDescription containing '검색':")
                    searchNodes.forEachIndexed { index, node ->
                        val desc = node.contentDescription?.toString()?.trim() ?: ""
                        val text = node.text?.toString()?.trim() ?: ""
                        val viewId = node.viewIdResourceName ?: ""
                        val className = node.className?.toString() ?: ""
                        Log.i(TAG, "    [$index] className=$className, text=\"$text\", desc=\"$desc\", viewId=$viewId, clickable=${node.isClickable}")
                    }
                    
                    handleStateFailure("검색 버튼을 찾을 수 없습니다")
                    return
                }
                
                Log.i(TAG, "✓ GoToSearch: Search button found!")
                Log.i(TAG, "  Button info: className=${searchButton.className}, text=${searchButton.text}, contentDescription=${searchButton.contentDescription}")
                
                if (!service.clickNode(searchButton)) {
                    Log.e(TAG, "✗ GoToSearch: Failed to click search button")
                    handleStateFailure("검색 버튼 클릭 실패")
                    return
                }
                Log.i(TAG, "✓ GoToSearch: Search button clicked, waiting 1.5 seconds...")
                delay(1500) // 검색창 열림 대기 (1초 -> 1.5초로 증가)
                Log.i(TAG, "GoToSearch: Transitioning to SearchRoom...")
                transitionTo(AutomationState.SearchRoom)
            }
            
            AutomationState.SearchRoom -> {
                Log.i(TAG, "SearchRoom: Looking for search input field...")
                Log.i(TAG, "  Trying View ID: ${SelectorsConfig.SEARCH_INPUT_ID}")
                
                // 여러 방법으로 검색 입력창 찾기 시도
                var searchInput = service.findNodeByViewId(SelectorsConfig.SEARCH_INPUT_ID)
                
                // View ID로 못 찾으면 EditText로 찾기 시도
                if (searchInput == null) {
                    Log.i(TAG, "  View ID not found, trying EditText search...")
                    val root = service.rootInActiveWindow
                    if (root != null) {
                        // 모든 EditText 노드 찾기
                        val editTexts = root.findAccessibilityNodeInfosByViewId("android.widget.EditText")
                        if (editTexts != null && editTexts.size > 0) {
                            // 첫 번째 EditText 사용 (일반적으로 검색창)
                            searchInput = editTexts[0]
                            Log.i(TAG, "  Found EditText: ${editTexts.size} nodes")
                        }
                    }
                }
                
                // 여전히 못 찾으면 텍스트로 찾기
                if (searchInput == null) {
                    Log.i(TAG, "  EditText search failed, trying text search...")
                    val root = service.rootInActiveWindow
                    if (root != null) {
                        // "검색" 또는 "채팅방, 친구 검색" 같은 텍스트로 찾기
                        val nodes = root.findAccessibilityNodeInfosByText("검색")
                        if (nodes != null && nodes.size > 0) {
                            // EditText인 노드 찾기
                            for (node in nodes) {
                                if (node.className?.contains("EditText") == true || node.isEditable) {
                                    searchInput = node
                                    Log.i(TAG, "  Found by text search: EditText node")
                                    break
                                }
                            }
                        }
                    }
                }
                
                // 여전히 못 찾으면 모든 노드에서 isEditable인 것 찾기
                if (searchInput == null) {
                    Log.i(TAG, "  Text search failed, trying editable node search...")
                    val root = service.rootInActiveWindow
                    if (root != null) {
                        searchInput = findEditableNode(root)
                        if (searchInput != null) {
                            Log.i(TAG, "  Found editable node")
                        }
                    }
                }
                
                if (searchInput == null) {
                    Log.e(TAG, "✗ SearchRoom: Search input field not found by any method")
                    Log.e(TAG, "  Tried: View ID, EditText, text '검색', editable node")
                    handleStateFailure("검색 입력창을 찾을 수 없습니다")
                    return
                }
                
                Log.i(TAG, "✓ SearchRoom: Search input field found!")
                Log.i(TAG, "  Input info: className=${searchInput.className}, text=${searchInput.text}, hint=${searchInput.hintText}")
                
                if (!service.setText(searchInput, roomKey)) {
                    Log.e(TAG, "✗ SearchRoom: Failed to set text")
                    handleStateFailure("검색어 입력 실패")
                    return
                }
                Log.i(TAG, "✓ SearchRoom: Text entered, waiting 2.5 seconds for search results...")
                delay(2500) // 검색 결과 대기 (1.5초 -> 2.5초로 증가)
                Log.i(TAG, "SearchRoom: Transitioning to OpenRoom...")
                transitionTo(AutomationState.OpenRoom)
            }
            
            AutomationState.OpenRoom -> {
                Log.i(TAG, "OpenRoom: Looking for chat room: \"$roomKey\"")
                
                // 여러 방법으로 채팅방 찾기 시도
                var roomNode = service.findNodeByTextContains(roomKey)
                
                // 텍스트로 못 찾으면 root에서 찾기
                if (roomNode == null) {
                    Log.i(TAG, "  TextContains search failed, trying root search...")
                    val root = service.rootInActiveWindow
                    if (root != null) {
                        // "의운모" 텍스트로 모든 노드 찾기
                        val nodes = root.findAccessibilityNodeInfosByText(roomKey)
                        if (nodes != null && nodes.size > 0) {
                            // 클릭 가능한 노드 찾기
                            for (node in nodes) {
                                if (node.isClickable || node.parent?.isClickable == true) {
                                    roomNode = if (node.isClickable) node else node.parent
                                    Log.i(TAG, "  Found by root text search: ${nodes.size} nodes")
                                    break
                                }
                            }
                        }
                    }
                }
                
                // 여전히 못 찾으면 부분 일치로 찾기
                if (roomNode == null) {
                    Log.i(TAG, "  Exact text search failed, trying partial match...")
                    val root = service.rootInActiveWindow
                    if (root != null) {
                        // roomKey의 일부로 찾기 (예: "의운모" -> "의운", "운모")
                        val partialKeys = listOf(
                            roomKey.take(roomKey.length - 1), // 마지막 글자 제외
                            roomKey.drop(1) // 첫 글자 제외
                        )
                        for (partialKey in partialKeys) {
                            val nodes = root.findAccessibilityNodeInfosByText(partialKey)
                            if (nodes != null && nodes.size > 0) {
                                for (node in nodes) {
                                    val nodeText = node.text?.toString() ?: node.contentDescription?.toString() ?: ""
                                    if (nodeText.contains(roomKey) || roomKey.contains(nodeText)) {
                                        if (node.isClickable || node.parent?.isClickable == true) {
                                            roomNode = if (node.isClickable) node else node.parent
                                            Log.i(TAG, "  Found by partial match: $partialKey")
                                            break
                                        }
                                    }
                                }
                                if (roomNode != null) break
                            }
                        }
                    }
                }
                
                // 여전히 못 찾으면 첫 번째 클릭 가능한 항목 사용 (검색 결과의 첫 번째 항목)
                if (roomNode == null) {
                    Log.i(TAG, "  All text searches failed, trying first clickable item...")
                    val root = service.rootInActiveWindow
                    if (root != null) {
                        roomNode = findFirstClickableItem(root)
                        if (roomNode != null) {
                            Log.i(TAG, "  Found first clickable item as fallback")
                        }
                    }
                }
                
                if (roomNode == null) {
                    Log.e(TAG, "✗ OpenRoom: Chat room not found by any method: \"$roomKey\"")
                    Log.e(TAG, "  Tried: textContains, root text search, partial match, first clickable")
                    handleStateFailure("채팅방을 찾을 수 없습니다: $roomKey")
                    return
                }
                
                Log.i(TAG, "✓ OpenRoom: Chat room found!")
                Log.i(TAG, "  Room info: text=${roomNode.text}, contentDescription=${roomNode.contentDescription}")
                
                if (!service.clickNode(roomNode)) {
                    Log.e(TAG, "✗ OpenRoom: Failed to click chat room")
                    handleStateFailure("채팅방 클릭 실패")
                    return
                }
                Log.i(TAG, "✓ OpenRoom: Chat room clicked, waiting 2 seconds for chat to open...")
                delay(2000) // 채팅방 열림 대기
                Log.i(TAG, "OpenRoom: Transitioning to WaitChatReady...")
                transitionTo(AutomationState.WaitChatReady)
            }
            
            AutomationState.WaitChatReady -> {
                Log.i(TAG, "WaitChatReady: Looking for chat input field...")
                
                // 채팅 입력창이 나타날 때까지 대기
                var chatInput: android.view.accessibility.AccessibilityNodeInfo? = null
                var found = false
                repeat(10) { // 최대 10초 대기
                    val root = service.getActiveRoot()
                    if (root == null) {
                        Log.w(TAG, "WaitChatReady: No active root available, waiting...")
                        delay(1000)
                        return@repeat
                    }
                    
                    // 1순위: View ID로 찾기
                    if (SelectorsConfig.CHAT_INPUT_ID.isNotBlank()) {
                    chatInput = service.findNodeByViewId(SelectorsConfig.CHAT_INPUT_ID)
                        if (chatInput != null) {
                            Log.i(TAG, "✓ WaitChatReady: Found input by View ID")
                            found = true
                            return@repeat
                        }
                    }
                    
                    // 2순위: MultiAutoCompleteTextView 클래스로 찾기 (카카오톡 실제 사용)
                    val allNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
                    collectAllNodes(root, allNodes)
                    chatInput = allNodes.firstOrNull { node ->
                        val className = node.className?.toString() ?: ""
                        (className.contains("MultiAutoCompleteTextView") || className.contains("EditText")) && 
                        node.isEditable && 
                        node.isFocusable
                    }
                    if (chatInput != null) {
                        Log.i(TAG, "✓ WaitChatReady: Found input by MultiAutoCompleteTextView/EditText class")
                        found = true
                        return@repeat
                    }
                    
                    // 3순위: editable 노드 찾기
                    chatInput = findEditableNode(root)
                    if (chatInput != null) {
                        Log.i(TAG, "✓ WaitChatReady: Found input by editable node search")
                        found = true
                        return@repeat
                    }
                    
                    // 4순위: hint나 placeholder로 찾기 (예: "메시지 입력", "메시지를 입력하세요")
                    val nodesByHint = root.findAccessibilityNodeInfosByText("메시지")
                    if (nodesByHint != null && nodesByHint.isNotEmpty()) {
                        chatInput = nodesByHint.firstOrNull { node ->
                            node.isEditable || node.className?.toString()?.contains("EditText") == true
                        }
                        if (chatInput != null) {
                            Log.i(TAG, "✓ WaitChatReady: Found input by hint text")
                            found = true
                            return@repeat
                        }
                    }
                    
                    Log.d(TAG, "WaitChatReady: Input not found yet, retrying... (attempt ${it + 1}/10)")
                    delay(1000)
                }
                
                if (!found || chatInput == null) {
                    Log.e(TAG, "✗ WaitChatReady: Chat input field not found after 10 attempts")
                    Log.i(TAG, "  Dumping all editable nodes for debugging...")
                    val rootForDump = service.getActiveRoot()
                    if (rootForDump != null) {
                        dumpEditableNodes(rootForDump)
                    }
                    handleStateFailure("채팅 입력창을 찾을 수 없습니다")
                    return
                }
                
                // chatInput이 null이 아님을 확인했으므로 !! 사용
                val finalInput = chatInput!!
                val inputInfo = "className=${finalInput.className}, text=${finalInput.text}, hint=${finalInput.hintText}, editable=${finalInput.isEditable}"
                Log.i(TAG, "✓ WaitChatReady: Chat input field found! $inputInfo")
                transitionTo(AutomationState.InputText)
            }
            
            AutomationState.InputText -> {
                Log.i(TAG, "InputText: Attempting to input text (length=${text.length})...")
                if (imageUrl != null) {
                    Log.i(TAG, "  Image URL provided: $imageUrl")
                }
                
                val root = service.getActiveRoot()
                if (root == null) {
                    handleStateFailure("활성 윈도우를 찾을 수 없습니다")
                    return
                }
                
                // 여러 방법으로 입력창 찾기
                var chatInput: android.view.accessibility.AccessibilityNodeInfo? = null
                
                // 1순위: View ID
                if (SelectorsConfig.CHAT_INPUT_ID.isNotBlank()) {
                    chatInput = service.findNodeByViewId(SelectorsConfig.CHAT_INPUT_ID)
                }
                
                // 2순위: MultiAutoCompleteTextView/EditText 클래스 (카카오톡 실제 사용)
                if (chatInput == null) {
                    val allNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
                    collectAllNodes(root, allNodes)
                    chatInput = allNodes.firstOrNull { node ->
                        val className = node.className?.toString() ?: ""
                        (className.contains("MultiAutoCompleteTextView") || className.contains("EditText")) && 
                        node.isEditable && 
                        node.isFocusable
                    }
                }
                
                // 3순위: editable 노드
                if (chatInput == null) {
                    chatInput = findEditableNode(root)
                }
                
                if (chatInput == null) {
                    Log.e(TAG, "✗ InputText: Chat input field not found")
                    handleStateFailure("채팅 입력창을 찾을 수 없습니다")
                    return
                }
                
                Log.i(TAG, "✓ InputText: Chat input field found")
                
                // Smart cast를 위한 로컬 변수 (null 체크 완료)
                val finalChatInput = chatInput!!
                
                // 이미지가 있으면 먼저 이미지를 붙여넣기
                if (imageUrl != null) {
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    Log.i(TAG, "InputText: Downloading and pasting image from: $imageUrl")
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    val imageHelper = com.goodhabit.kakaobridge.accessibility.util.ImageHelper
                    // service는 AccessibilityService이므로 Context입니다 (AccessibilityService extends Service extends ContextWrapper)
                    val context = service.applicationContext
                    val success = imageHelper.downloadAndSaveToClipboard(context, imageUrl!!)
                    if (!success) {
                        Log.e(TAG, "✗✗✗ InputText: Failed to download/save image to clipboard ✗✗✗")
                        handleStateFailure("이미지 다운로드 실패")
                        return
                    }
                    Log.i(TAG, "✓✓✓ InputText: Image downloaded and saved to clipboard ✓✓✓")
                    
                    // 입력창에 포커스
                    finalChatInput.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_FOCUS)
                    delay(300)
                    
                    // 붙여넣기
                    val pasteSuccess = finalChatInput.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_PASTE)
                    if (!pasteSuccess) {
                        Log.w(TAG, "⚠ InputText: ACTION_PASTE failed, trying alternative method...")
                        // 대안: 클립보드 내용을 텍스트로 가져와서 입력 (이미지는 작동하지 않을 수 있음)
                    }
                    
                    delay(1000) // 이미지 붙여넣기 대기
                    Log.i(TAG, "✓ InputText: Image pasted successfully")
                }
                
                // 텍스트가 있으면 텍스트 입력
                if (text.isNotBlank()) {
                    Log.i(TAG, "InputText: Setting text...")
                    if (!service.setText(finalChatInput, text)) {
                        Log.e(TAG, "✗ InputText: Failed to set text")
                        handleStateFailure("메시지 입력 실패")
                        return
                    }
                    Log.i(TAG, "✓ InputText: Text entered successfully")
                }
                
                Log.i(TAG, "✓ InputText: Input completed, waiting 500ms...")
                delay(500) // 입력 완료 대기
                transitionTo(AutomationState.ClickSend)
            }
            
            AutomationState.ClickSend -> {
                Log.i(TAG, "ClickSend: Looking for send button...")
                
                val root = service.getActiveRoot()
                if (root == null) {
                    handleStateFailure("활성 윈도우를 찾을 수 없습니다")
                    return
                }
                
                // 여러 방법으로 전송 버튼 찾기
                var sendButton: android.view.accessibility.AccessibilityNodeInfo? = null
                
                // 1순위: View ID로 찾기
                if (SelectorsConfig.SEND_BUTTON_ID.isNotBlank()) {
                    sendButton = service.findNodeByViewId(SelectorsConfig.SEND_BUTTON_ID)
                    if (sendButton != null) {
                        Log.i(TAG, "✓ ClickSend: Found send button by View ID")
                    }
                }
                
                // 2순위: contentDescription "전송"으로 찾기 (가장 안정적)
                if (sendButton == null) {
                    sendButton = service.findNodeByContentDescription("전송")
                    if (sendButton != null) {
                        Log.i(TAG, "✓ ClickSend: Found send button by contentDescription='전송'")
                    }
                }
                
                // 3순위: 텍스트 "전송"으로 찾기
                if (sendButton == null) {
                    sendButton = service.findNodeByText("전송")
                    if (sendButton != null) {
                        Log.i(TAG, "✓ ClickSend: Found send button by text='전송'")
                    }
                }
                
                // 4순위: send_button_layout 직접 찾기
                if (sendButton == null) {
                    sendButton = service.findNodeByViewId("com.kakao.talk:id/send_button_layout")
                    if (sendButton != null) {
                        Log.i(TAG, "✓ ClickSend: Found send button by send_button_layout View ID")
                    }
                }
                
                // 5순위: send_layout 내의 클릭 가능한 버튼 찾기
                if (sendButton == null) {
                    val sendLayout = service.findNodeByViewId("com.kakao.talk:id/send_layout")
                    if (sendLayout != null) {
                        Log.i(TAG, "  Found send_layout, searching for clickable button inside...")
                        val allNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
                        collectAllNodes(sendLayout, allNodes)
                        
                        // contentDescription에 "전송" 포함하는 클릭 가능한 노드 찾기
                        sendButton = allNodes.firstOrNull { node ->
                            node.isClickable && node.contentDescription?.toString()?.contains("전송") == true
                        }
                        if (sendButton != null) {
                            Log.i(TAG, "✓ ClickSend: Found send button within send_layout by contentDescription")
                        } else {
                            // Button 클래스인 클릭 가능한 노드 찾기
                            sendButton = allNodes.firstOrNull { node ->
                                node.isClickable && node.className?.toString()?.contains("Button") == true
                            }
                            if (sendButton != null) {
                                Log.i(TAG, "✓ ClickSend: Found send button within send_layout by Button class")
                            }
                        }
                    }
                }
                
                // 6순위: input_window_layout 내의 모든 클릭 가능한 버튼 스캔
                if (sendButton == null) {
                    Log.i(TAG, "  Trying to find send button in input_window_layout...")
                    val inputLayout = service.findNodeByViewId("com.kakao.talk:id/input_window_layout")
                    if (inputLayout != null) {
                        val allNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
                        collectAllNodes(inputLayout, allNodes)
                        
                        // 오른쪽 끝에 있는 클릭 가능한 버튼 찾기 (전송 버튼은 보통 오른쪽 끝)
                        sendButton = allNodes.firstOrNull { node ->
                            node.isClickable && 
                            (node.contentDescription?.toString()?.contains("전송") == true ||
                             node.viewIdResourceName?.contains("send") == true)
                        }
                        if (sendButton != null) {
                            Log.i(TAG, "✓ ClickSend: Found send button in input_window_layout")
                        }
                    }
                }
                
                if (sendButton == null) {
                    Log.e(TAG, "✗ ClickSend: Send button not found by any method")
                    Log.i(TAG, "  Dumping all clickable buttons in input area for debugging...")
                    val inputLayout = service.findNodeByViewId("com.kakao.talk:id/input_window_layout")
                    if (inputLayout != null) {
                        dumpClickableButtons(inputLayout)
                    }
                    handleStateFailure("전송 버튼을 찾을 수 없습니다")
                    return
                }
                
                val buttonInfo = "className=${sendButton.className}, contentDescription=${sendButton.contentDescription}, viewId=${sendButton.viewIdResourceName}"
                Log.i(TAG, "✓ ClickSend: Send button found! $buttonInfo")
                
                if (!service.clickNode(sendButton)) {
                    Log.e(TAG, "✗ ClickSend: Failed to click send button")
                    handleStateFailure("전송 버튼 클릭 실패")
                    return
                }
                
                Log.i(TAG, "✓ ClickSend: Send button clicked, waiting 1 second for message to be sent...")
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
     * 편집 가능한 노드 찾기 (재귀적)
     */
    private fun findEditableNode(root: android.view.accessibility.AccessibilityNodeInfo): android.view.accessibility.AccessibilityNodeInfo? {
        if (root.isEditable) {
            return root
        }
        
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                findEditableNode(child)?.let { return it }
            }
        }
        return null
    }
    
    private fun dumpEditableNodes(root: android.view.accessibility.AccessibilityNodeInfo) {
        val editableNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
        collectEditableNodes(root, editableNodes)
        
        if (editableNodes.isEmpty()) {
            Log.i(TAG, "  No editable nodes found in the current view")
        } else {
            Log.i(TAG, "  Found ${editableNodes.size} editable node(s):")
            editableNodes.forEachIndexed { index, node ->
                val className = node.className?.toString() ?: "null"
                val text = node.text?.toString() ?: ""
                val hint = node.hintText?.toString() ?: ""
                val desc = node.contentDescription?.toString() ?: ""
                val viewId = node.viewIdResourceName ?: ""
                Log.i(TAG, "    [$index] className=$className, text=\"$text\", hint=\"$hint\", desc=\"$desc\", viewId=$viewId")
            }
        }
    }
    
    private fun collectEditableNodes(node: android.view.accessibility.AccessibilityNodeInfo, result: MutableList<android.view.accessibility.AccessibilityNodeInfo>) {
        if (node.isEditable) {
            result.add(node)
        }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                collectEditableNodes(child, result)
            }
        }
    }
    
    /**
     * 첫 번째 클릭 가능한 항목 찾기 (재귀적)
     */
    /**
     * 채팅 목록(RecyclerView/ListView)에서 첫 번째 채팅방 찾기
     */
    private fun findFirstChatRoomInList(root: android.view.accessibility.AccessibilityNodeInfo): android.view.accessibility.AccessibilityNodeInfo? {
        val className = root.className?.toString() ?: ""
        
        // RecyclerView나 ListView 찾기
        if (className.contains("RecyclerView") || className.contains("ListView") || className.contains("AbsListView")) {
            Log.i(TAG, "  Found list container: $className")
            // 리스트의 첫 번째 자식 찾기
            for (i in 0 until root.childCount) {
                root.getChild(i)?.let { child ->
                    // 첫 번째 클릭 가능한 항목 찾기 (채팅방은 보통 클릭 가능)
                    val clickableRoom = findFirstClickableInSubtree(child)
                    if (clickableRoom != null) {
                        Log.i(TAG, "  Found first item in list")
                        return clickableRoom
                    }
                }
            }
        }
        
        // 자식 노드에서 재귀적으로 찾기
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                findFirstChatRoomInList(child)?.let { return it }
            }
        }
        return null
    }
    
    /**
     * 서브트리에서 첫 번째 클릭 가능한 노드 찾기
     */
    private fun findFirstClickableInSubtree(root: android.view.accessibility.AccessibilityNodeInfo): android.view.accessibility.AccessibilityNodeInfo? {
        if (root.isClickable) {
            // 텍스트가 있거나 contentDescription이 있는 클릭 가능한 노드 우선
            val hasText = root.text != null && root.text.toString().trim().isNotEmpty()
            val hasDesc = root.contentDescription != null && root.contentDescription.toString().trim().isNotEmpty()
            if (hasText || hasDesc) {
                return root
            }
        }
        
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                findFirstClickableInSubtree(child)?.let { return it }
            }
        }
        return null
    }
    
    /**
     * 첫 번째 클릭 가능한 항목 찾기 (일반적인 fallback)
     */
    private fun findFirstClickableItem(root: android.view.accessibility.AccessibilityNodeInfo): android.view.accessibility.AccessibilityNodeInfo? {
        if (root.isClickable && root.text != null && root.text.toString().isNotBlank()) {
            return root
        }
        
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                findFirstClickableItem(child)?.let { return it }
            }
        }
        return null
    }
    
    /**
     * 툴바 영역에서 검색 버튼 찾기 (ImageButton/Button)
     * "검색" 관련 텍스트나 설명이 있는 버튼만 반환
     */
    private fun findClickableButtonInToolbar(root: android.view.accessibility.AccessibilityNodeInfo): android.view.accessibility.AccessibilityNodeInfo? {
        val className = root.className?.toString() ?: ""
        
        // ImageButton, Button, ImageView 등 클릭 가능한 경우
        if (root.isClickable && (className.contains("ImageButton") || className.contains("Button") || 
                                 className.contains("ImageView") || className.contains("Image"))) {
            val desc = root.contentDescription?.toString()?.trim() ?: ""
            val text = root.text?.toString()?.trim() ?: ""
            val viewId = root.viewIdResourceName ?: ""
            
            // "검색" 관련 키워드 확인 (더 넓은 범위)
            val isSearchRelated = desc.contains("검색", ignoreCase = true) || 
                                 text.contains("검색", ignoreCase = true) ||
                                 viewId.contains("search", ignoreCase = true) ||
                                 viewId.contains("menu_search", ignoreCase = true) ||
                                 viewId.contains("search_icon", ignoreCase = true)
            
            // 제외할 키워드 확인
            val isExcluded = text.contains("닫기") || text.contains("앱 닫기") || 
                           desc.contains("닫기") || desc.contains("앱 닫기") ||
                           text.contains("취소") || desc.contains("취소")
            
            if (isSearchRelated && !isExcluded) {
                Log.i(TAG, "  Found search button in toolbar: className=$className, text=\"$text\", desc=\"$desc\", viewId=$viewId")
                return root
            }
        }
        
        // 자식 노드 재귀 탐색
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                findClickableButtonInToolbar(child)?.let { return it }
            }
        }
        return null
    }
    
    /**
     * 모든 클릭 가능한 버튼 찾기
     */
    private fun findAllClickableButtons(root: android.view.accessibility.AccessibilityNodeInfo): List<android.view.accessibility.AccessibilityNodeInfo> {
        val buttons = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
        
        if (root.isClickable) {
            buttons.add(root)
        }
        
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                buttons.addAll(findAllClickableButtons(child))
            }
        }
        
        return buttons
    }
    
    /**
     * 모든 노드 수집 (디버깅용)
     */
    private fun collectAllNodes(root: android.view.accessibility.AccessibilityNodeInfo, 
                                 nodes: MutableList<android.view.accessibility.AccessibilityNodeInfo>) {
        nodes.add(root)
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                collectAllNodes(child, nodes)
            }
        }
    }
    
    /**
     * UI 덤프 (디버깅용) - 현재 화면의 모든 클릭 가능한 버튼 정보 출력
     */
    private fun dumpClickableButtons(root: android.view.accessibility.AccessibilityNodeInfo, depth: Int = 0) {
        if (depth > 10) return // 최대 10단계까지
        
        val indent = "    ".repeat(depth)
        val className = root.className?.toString() ?: ""
        val text = root.text?.toString()?.trim() ?: ""
        val desc = root.contentDescription?.toString()?.trim() ?: ""
        val viewId = root.viewIdResourceName ?: ""
        val isClickable = root.isClickable
        val isFocusable = root.isFocusable
        
        // 클릭 가능한 버튼/이미지뷰 출력
        if (isClickable && (className.contains("Button") || className.contains("ImageButton") || 
                           className.contains("ImageView") || className.contains("Image"))) {
            Log.i(TAG, "${indent}[Clickable] className=$className, text=\"$text\", desc=\"$desc\", viewId=$viewId, focusable=$isFocusable")
        }
        
        // 상위 레벨에서는 모든 노드 정보도 출력 (화면 구조 파악용)
        if (depth <= 2) {
            if (text.isNotEmpty() || desc.isNotEmpty() || viewId.isNotEmpty()) {
                Log.i(TAG, "${indent}[Node] className=$className, text=\"$text\", desc=\"$desc\", viewId=$viewId, clickable=$isClickable")
            }
        }
        
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                dumpClickableButtons(child, depth + 1)
            }
        }
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
    OpenHomeShortcut,   // 홈 화면 바로가기 아이콘 클릭
    OpenTopChat,        // 최상단 채팅방 클릭 (레거시, 사용 안 함)
    GoToSearch,         // 검색 버튼 클릭 (레거시, 사용 안 함)
    SearchRoom,         // 검색어 입력 (레거시, 사용 안 함)
    OpenRoom,           // 채팅방 클릭 (레거시, 사용 안 함)
    WaitChatReady,      // 채팅 입력창 대기
    InputText,          // 메시지 입력
    ClickSend,          // 전송 버튼 클릭
    VerifySent,         // 전송 확인
    Done,               // 완료
    Failed              // 실패
}

