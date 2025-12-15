package com.goodhabit.kakaobridge

import android.app.ActivityManager
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.goodhabit.kakaobridge.db.AppDatabase
import com.goodhabit.kakaobridge.queue.SendRequest
import com.goodhabit.kakaobridge.queue.SendStatus
import com.goodhabit.kakaobridge.service.BridgeForegroundService
import com.goodhabit.kakaobridge.service.KakaoNotificationListenerService
import com.goodhabit.kakaobridge.util.PermissionHelper
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var permissionButton: Button
    private lateinit var batteryButton: Button
    private lateinit var startServiceButton: Button
    private lateinit var db: AppDatabase
    private lateinit var permissionHelper: PermissionHelper
    
    private val serviceStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == BridgeForegroundService.ACTION_SERVICE_STATE_CHANGED) {
                val isRunning = intent.getBooleanExtra("isRunning", false)
                updateServiceButton(isRunning)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        try {
            android.util.Log.d("MainActivity", "onCreate started")
            setContentView(R.layout.activity_main)
            android.util.Log.d("MainActivity", "setContentView completed")

            // UI 초기화
            statusText = findViewById(R.id.statusText)
            permissionButton = findViewById(R.id.permissionButton)
            batteryButton = findViewById(R.id.batteryButton)
            startServiceButton = findViewById(R.id.startServiceButton)
            android.util.Log.d("MainActivity", "UI initialized")

            // DB 초기화
            db = AppDatabase.getDatabase(this)
            android.util.Log.d("MainActivity", "Database initialized")

            // 권한 헬퍼 초기화
            permissionHelper = PermissionHelper(this)
            android.util.Log.d("MainActivity", "PermissionHelper initialized")

            // 버튼 클릭 리스너
            permissionButton.setOnClickListener {
                requestNotificationPermission()
            }

            batteryButton.setOnClickListener {
                requestBatteryOptimizationExemption()
            }

            startServiceButton.setOnClickListener {
                toggleService()
            }
            android.util.Log.d("MainActivity", "Button listeners set")

            // 초기 상태 확인
            checkPermissions()
            updateServiceState()
            android.util.Log.d("MainActivity", "Initial state checked")
            
            // 서비스 상태 변경 브로드캐스트 수신 등록
            try {
                val filter = IntentFilter(BridgeForegroundService.ACTION_SERVICE_STATE_CHANGED)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    registerReceiver(serviceStateReceiver, filter, RECEIVER_NOT_EXPORTED)
                } else {
                    registerReceiver(serviceStateReceiver, filter)
                }
                android.util.Log.d("MainActivity", "BroadcastReceiver registered")
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Failed to register BroadcastReceiver", e)
                // BroadcastReceiver 등록 실패해도 앱은 계속 실행
            }
            
            android.util.Log.d("MainActivity", "onCreate completed successfully")
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "FATAL ERROR in onCreate", e)
            throw e
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(serviceStateReceiver)
        } catch (e: Exception) {
            // 이미 등록 해제되었을 수 있음
        }
    }

    override fun onResume() {
        super.onResume()
        checkPermissions()
        updateServiceState()
    }

    /**
     * 권한 상태 확인 및 UI 업데이트
     */
    private fun checkPermissions() {
        val hasNotificationPermission = permissionHelper.hasNotificationListenerPermission()
        val isBatteryOptimizationExempted = permissionHelper.isBatteryOptimizationExempted()
        val isServiceRunning = isServiceRunning()

        val status = buildString {
            append("알림 접근 권한: ")
            append(if (hasNotificationPermission) "✓ 허용됨" else "✗ 필요")
            append("\n")
            append("배터리 최적화 제외: ")
            append(if (isBatteryOptimizationExempted) "✓ 제외됨" else "✗ 필요")
            append("\n")
            append("서비스 상태: ")
            append(if (isServiceRunning) "✓ 서비스 중" else "✗ 중지됨")
        }

        statusText.text = status

        permissionButton.isEnabled = !hasNotificationPermission
        batteryButton.isEnabled = !isBatteryOptimizationExempted
        updateServiceButton(isServiceRunning)
    }
    
    /**
     * 서비스 실행 중인지 확인
     * Android 8.0+에서는 getRunningServices가 제한되므로 다른 방법 사용
     */
    private fun isServiceRunning(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Android 8.0+에서는 ActivityManager.getRunningServiceInfos 사용 불가
                // 대신 SharedPreferences나 다른 방법 사용
                // 여기서는 간단히 false 반환하고 서비스 시작 시 true로 설정
                val prefs = getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
                prefs.getBoolean("service_running", false)
            } else {
                val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                val runningServices = activityManager.getRunningServices(Integer.MAX_VALUE)
                runningServices.any { it.service.className == BridgeForegroundService::class.java.name }
            }
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * 서비스 상태 업데이트
     */
    private fun updateServiceState() {
        val isRunning = isServiceRunning()
        updateServiceButton(isRunning)
    }
    
    /**
     * 서비스 버튼 상태 업데이트
     */
    private fun updateServiceButton(isRunning: Boolean) {
        val hasNotificationPermission = permissionHelper.hasNotificationListenerPermission()
        val isBatteryOptimizationExempted = permissionHelper.isBatteryOptimizationExempted()
        
        if (isRunning) {
            startServiceButton.text = getString(R.string.button_stop_service)
            startServiceButton.isEnabled = true
        } else {
            startServiceButton.text = getString(R.string.button_start_service)
            startServiceButton.isEnabled = hasNotificationPermission && isBatteryOptimizationExempted
        }
    }
    
    /**
     * 서비스 토글 (시작/중지)
     */
    private fun toggleService() {
        val isRunning = isServiceRunning()
        
        if (isRunning) {
            // 서비스 중지
            stopForegroundService()
        } else {
            // 서비스 시작
            startForegroundService()
        }
    }

    /**
     * 알림 접근 권한 요청
     */
    private fun requestNotificationPermission() {
        if (permissionHelper.hasNotificationListenerPermission()) {
            Toast.makeText(this, "이미 알림 접근 권한이 허용되어 있습니다.", Toast.LENGTH_SHORT).show()
            return
        }

        AlertDialog.Builder(this)
            .setTitle(R.string.permission_notification_title)
            .setMessage(R.string.permission_notification_message)
            .setPositiveButton("설정 열기") { _, _ ->
                val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                startActivity(intent)
            }
            .setNegativeButton("취소", null)
            .show()
    }

    /**
     * 배터리 최적화 제외 요청
     */
    private fun requestBatteryOptimizationExemption() {
        if (permissionHelper.isBatteryOptimizationExempted()) {
            Toast.makeText(this, "이미 배터리 최적화가 제외되어 있습니다.", Toast.LENGTH_SHORT).show()
            return
        }

        AlertDialog.Builder(this)
            .setTitle(R.string.permission_battery_title)
            .setMessage(R.string.permission_battery_message)
            .setPositiveButton("설정 열기") { _, _ ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    startActivity(intent)
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    /**
     * Foreground Service 시작
     */
    private fun startForegroundService() {
        val intent = Intent(this, BridgeForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        // 서비스 시작 상태 저장
        val prefs = getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("service_running", true).apply()
        Toast.makeText(this, "서비스가 시작되었습니다.", Toast.LENGTH_SHORT).show()
        updateServiceState()
    }
    
    /**
     * 서비스 중지
     */
    private fun stopForegroundService() {
        val intent = Intent(this, BridgeForegroundService::class.java)
        stopService(intent)
        // 서비스 중지 상태 저장
        val prefs = getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("service_running", false).apply()
        Toast.makeText(this, "서비스가 중지되었습니다.", Toast.LENGTH_SHORT).show()
        updateServiceState()
    }
}

