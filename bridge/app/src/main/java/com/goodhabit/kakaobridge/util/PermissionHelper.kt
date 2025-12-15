package com.goodhabit.kakaobridge.util

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * 권한 확인 헬퍼
 */
class PermissionHelper(private val context: Context) {

    /**
     * 알림 접근 권한 확인
     * 
     * enabled_notification_listeners 형식: "package.name/component.name:package.name2/component.name2"
     * 패키지명만 추출하여 비교
     */
    fun hasNotificationListenerPermission(): Boolean {
        val packageName = context.packageName
        
        // Settings.Secure 사용 (모든 API 레벨 지원)
        val flat = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        )
        
        Log.d("PermissionHelper", "Checking notification permission for package: $packageName")
        Log.d("PermissionHelper", "enabled_notification_listeners value: $flat")
        
        if (flat.isNullOrBlank()) {
            Log.d("PermissionHelper", "No enabled notification listeners found")
            return false
        }
        
        // "package.name/component.name:package.name2/component.name2" 형식 파싱
        // 각 항목은 ":"로 구분되고, 각 항목은 "package/component" 형식
        val enabledListeners = flat.split(":").mapNotNull { entry ->
            // 각 항목에서 패키지명만 추출 (첫 번째 '/' 앞부분)
            val trimmedEntry = entry.trim()
            if (trimmedEntry.isEmpty()) {
                null
            } else {
                val slashIndex = trimmedEntry.indexOf('/')
                if (slashIndex > 0) {
                    trimmedEntry.substring(0, slashIndex)
                } else {
                    trimmedEntry // '/'가 없으면 전체를 패키지명으로 간주
                }
            }
        }.toSet()
        
        Log.d("PermissionHelper", "Enabled packages: $enabledListeners")
        val hasPermission = enabledListeners.contains(packageName)
        Log.d("PermissionHelper", "Has permission: $hasPermission")
        
        return hasPermission
    }

    /**
     * 배터리 최적화 제외 확인
     */
    fun isBatteryOptimizationExempted(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true // M 미만에서는 항상 true
        }

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * 배터리 최적화 제외 요청 Intent 생성
     */
    fun getBatteryOptimizationExemptionIntent(): android.content.Intent {
        val intent = android.content.Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        intent.data = android.net.Uri.parse("package:${context.packageName}")
        return intent
    }
}

