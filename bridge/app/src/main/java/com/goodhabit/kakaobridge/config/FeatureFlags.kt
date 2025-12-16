package com.goodhabit.kakaobridge.config

import android.content.Context
import android.content.SharedPreferences

/**
 * 기능 플래그 관리
 * 
 * 두 가지 전송 방식을 전환할 수 있도록 구성:
 * 1. RemoteInputSender (기존 방식 - 알림 기반)
 * 2. AccessibilitySender (새로운 방식 - 접근성 기반)
 * 
 * 언제든 롤백 가능하도록 플래그로 제어
 */
object FeatureFlags {
    private const val PREFS_NAME = "feature_flags"
    private const val KEY_ACCESSIBILITY_SEND_ENABLED = "accessibility_send_enabled"
    private const val KEY_REMOTE_INPUT_SEND_ENABLED = "remote_input_send_enabled"
    
    // 기본값: 접근성만 사용 (알림 리플라이 비활성화)
    // 접근성 서비스가 활성화되면 접근성만 사용
    private const val DEFAULT_ACCESSIBILITY_ENABLED = true
    private const val DEFAULT_REMOTE_INPUT_ENABLED = false
    
    /**
     * 접근성 기반 전송 활성화 여부
     */
    fun isAccessibilitySendEnabled(context: Context): Boolean {
        return getPrefs(context).getBoolean(KEY_ACCESSIBILITY_SEND_ENABLED, DEFAULT_ACCESSIBILITY_ENABLED)
    }
    
    /**
     * RemoteInput 기반 전송 활성화 여부
     */
    fun isRemoteInputSendEnabled(context: Context): Boolean {
        return getPrefs(context).getBoolean(KEY_REMOTE_INPUT_SEND_ENABLED, DEFAULT_REMOTE_INPUT_ENABLED)
    }
    
    /**
     * 접근성 기반 전송 활성화/비활성화
     */
    fun setAccessibilitySendEnabled(context: Context, enabled: Boolean) {
        getPrefs(context).edit()
            .putBoolean(KEY_ACCESSIBILITY_SEND_ENABLED, enabled)
            .apply()
    }
    
    /**
     * RemoteInput 기반 전송 활성화/비활성화
     */
    fun setRemoteInputSendEnabled(context: Context, enabled: Boolean) {
        getPrefs(context).edit()
            .putBoolean(KEY_REMOTE_INPUT_SEND_ENABLED, enabled)
            .apply()
    }
    
    /**
     * 현재 활성화된 전송 방식 반환
     * 
     * 둘 다 활성화되어 있으면 접근성 방식 우선 (더 직접적이고 안정적)
     */
    fun getActiveSendMethod(context: Context): SendMethod {
        return when {
            isAccessibilitySendEnabled(context) -> SendMethod.ACCESSIBILITY
            isRemoteInputSendEnabled(context) -> SendMethod.REMOTE_INPUT
            else -> SendMethod.REMOTE_INPUT // 기본값
        }
    }
    
    /**
     * 하이브리드 모드 여부 (둘 다 활성화되어 있으면 true)
     */
    fun isHybridMode(context: Context): Boolean {
        return isAccessibilitySendEnabled(context) && isRemoteInputSendEnabled(context)
    }
    
    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    enum class SendMethod {
        ACCESSIBILITY,  // 접근성 기반 (새로운 방식)
        REMOTE_INPUT    // 알림 기반 (기존 방식)
    }
}

