# 앱 크래시 문제 해결

## 문제

앱이 시작되자마자 크래시하여 열리지 않는 문제가 발생했습니다.

**로그에서 확인된 문제**:
```
Process com.goodhabit.kakaobridge (pid 21254) has died: fg TOP
Process 21254 exited due to signal 9 (Killed)
```

## 원인

`MainActivity`에서 `ActivityManager.getRunningServices()`를 사용하여 서비스 상태를 확인하려고 했는데, Android 8.0 (API 26) 이상에서는 이 메서드가 제한되어 있습니다.

**문제 코드**:
```kotlin
private fun isServiceRunning(): Boolean {
    val activityManager = getSystemService(ActivityManager::class.java)
    val runningServices = activityManager.getRunningServices(Integer.MAX_VALUE)  // ❌ Android 8.0+에서 제한됨
    return runningServices.any { it.service.className == BridgeForegroundService::class.java.name }
}
```

## 해결 방법

### 1. SharedPreferences 사용

Android 8.0 이상에서는 `getRunningServices()` 대신 `SharedPreferences`를 사용하여 서비스 상태를 추적합니다.

**수정된 코드**:
```kotlin
private fun isServiceRunning(): Boolean {
    return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Android 8.0+에서는 SharedPreferences 사용
            val prefs = getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
            prefs.getBoolean("service_running", false)
        } else {
            // Android 7.x 이하에서는 기존 방법 사용
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val runningServices = activityManager.getRunningServices(Integer.MAX_VALUE)
            runningServices.any { it.service.className == BridgeForegroundService::class.java.name }
        }
    } catch (e: Exception) {
        false
    }
}
```

### 2. 서비스 시작/중지 시 상태 저장

서비스를 시작하거나 중지할 때 `SharedPreferences`에 상태를 저장합니다.

**서비스 시작**:
```kotlin
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
```

**서비스 중지**:
```kotlin
private fun stopForegroundService() {
    val intent = Intent(this, BridgeForegroundService::class.java)
    stopService(intent)
    // 서비스 중지 상태 저장
    val prefs = getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
    prefs.edit().putBoolean("service_running", false).apply()
    Toast.makeText(this, "서비스가 중지되었습니다.", Toast.LENGTH_SHORT).show()
    updateServiceState()
}
```

### 3. 서비스 종료 시 상태 업데이트

`BridgeForegroundService`의 `onDestroy()`에서도 상태를 업데이트합니다.

```kotlin
override fun onDestroy() {
    super.onDestroy()
    // ...
    
    // SharedPreferences에도 상태 저장
    try {
        val prefs = getSharedPreferences("bridge_prefs", MODE_PRIVATE)
        prefs.edit().putBoolean("service_running", false).apply()
    } catch (e: Exception) {
        Log.e(TAG, "Failed to save service state", e)
    }
    
    // ...
}
```

## 적용 방법

1. **APK 재빌드**:
   ```powershell
   cd kakkaobot\bridge
   .\gradlew.bat assembleDebug
   ```

2. **APK 재설치**:
   ```powershell
   adb install -r app\build\outputs\apk\debug\app-debug.apk
   ```

3. **앱 재시작**:
   - 기존 앱 데이터 삭제 (선택사항):
     ```powershell
     adb shell pm clear com.goodhabit.kakaobridge
     ```
   - 앱 실행

## 확인 방법

앱이 정상적으로 열리는지 확인:

```powershell
adb shell am start -n com.goodhabit.kakaobridge/.MainActivity
```

크래시 로그 확인:

```powershell
adb logcat | Select-String -Pattern "FATAL|AndroidRuntime.*kakaobridge"
```

## 참고

- [Android 8.0 Behavior Changes - Background Execution Limits](https://developer.android.com/about/versions/oreo/background)
- [ActivityManager.getRunningServices() Deprecation](https://developer.android.com/reference/android/app/ActivityManager#getRunningServices(int))

