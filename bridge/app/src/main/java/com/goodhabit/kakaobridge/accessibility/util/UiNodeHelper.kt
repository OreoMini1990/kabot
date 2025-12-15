package com.goodhabit.kakaobridge.accessibility.util

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

/**
 * UI 노드 탐색 및 조작 헬퍼
 */
object UiNodeHelper {
    
    private const val TAG = "UiNodeHelper"
    
    /**
     * View ID로 노드 찾기
     */
    fun findNodeByViewId(root: AccessibilityNodeInfo, viewId: String): AccessibilityNodeInfo? {
        if (root.viewIdResourceName == viewId) {
            return root
        }
        
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                findNodeByViewId(child, viewId)?.let { return it }
            }
        }
        return null
    }
    
    /**
     * 텍스트로 노드 찾기 (정확히 일치)
     */
    fun findNodeByText(root: AccessibilityNodeInfo, text: String): AccessibilityNodeInfo? {
        root.text?.toString()?.let { nodeText ->
            if (nodeText == text) {
                return root
            }
        }
        
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                findNodeByText(child, text)?.let { return it }
            }
        }
        return null
    }
    
    /**
     * 텍스트 포함으로 노드 찾기
     */
    fun findNodeByTextContains(root: AccessibilityNodeInfo, text: String): AccessibilityNodeInfo? {
        root.text?.toString()?.let { nodeText ->
            if (nodeText.contains(text)) {
                return root
            }
        }
        
        root.contentDescription?.toString()?.let { desc ->
            if (desc.contains(text)) {
                return root
            }
        }
        
        for (i in 0 until root.childCount) {
            root.getChild(i)?.let { child ->
                findNodeByTextContains(child, text)?.let { return it }
            }
        }
        return null
    }
    
    /**
     * 노드 클릭
     */
    fun clickNode(node: AccessibilityNodeInfo?): Boolean {
        if (node == null) {
            Log.w(TAG, "Cannot click: node is null")
            return false
        }
        
        return try {
            if (node.isClickable) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            } else {
                // 부모 노드에서 클릭 가능한 노드 찾기
                var parent = node.parent
                while (parent != null) {
                    if (parent.isClickable) {
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        return true
                    }
                    parent = parent.parent
                }
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to click node", e)
            false
        }
    }
    
    /**
     * 텍스트 입력
     * 
     * ACTION_SET_TEXT를 시도하고, 실패하면 클립보드 붙여넣기 fallback 사용
     */
    fun setText(service: AccessibilityService, node: AccessibilityNodeInfo?, text: String): Boolean {
        if (node == null) {
            Log.w(TAG, "Cannot set text: node is null")
            return false
        }
        
        if (!node.isEditable) {
            Log.w(TAG, "Node is not editable")
            return false
        }
        
        // 1순위: ACTION_SET_TEXT 시도
        val setTextArgs = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        
        if (node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, setTextArgs)) {
            Log.d(TAG, "Text set via ACTION_SET_TEXT")
            return true
        }
        
        // 2순위: 클립보드 붙여넣기 fallback
        Log.d(TAG, "ACTION_SET_TEXT failed, trying clipboard paste")
        return try {
            val clipboard = service.getSystemService(AccessibilityService.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("message", text)
            clipboard.setPrimaryClip(clip)
            
            // 입력창에 포커스
            node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
            android.os.SystemClock.sleep(200)
            
            // 붙여넣기
            node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            Log.d(TAG, "Text set via clipboard paste")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set text via clipboard", e)
            false
        }
    }
}

