# ADB 유용한 명령어 모음

## 디바이스 관리

### 디바이스 연결 확인
```powershell
adb devices
```

### 디바이스 정보 확인
```powershell
adb shell getprop ro.product.model          # 디바이스 모델명
adb shell getprop ro.build.version.release  # Android 버전
```

## Bridge APK 관련

### 서비스 상태 확인
```powershell
adb shell "dumpsys activity services | grep -i 'BridgeForegroundService'"
```

### 알림 접근 권한 확인
```powershell
adb shell "settings get secure enabled_notification_listeners"
```

### APK 설치 확인
```powershell
adb shell pm list packages | grep kakaobridge
```

### APK 정보 확인
```powershell
adb shell dumpsys package com.goodhabit.kakaobridge | grep -i version
```

### APK 재설치
```powershell
cd kakkaobot\bridge
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

## 로그 확인

### 실시간 로그 확인 (Bridge APK 관련)
```powershell
adb logcat | Select-String -Pattern "BridgeForegroundService|RemoteInputSender|KakaoNotificationListener"
```

### 로그 초기화 후 확인
```powershell
adb logcat -c
adb logcat | Select-String -Pattern "BridgeForegroundService"
```

### 특정 태그만 확인
```powershell
adb logcat -s BridgeForegroundService:D RemoteInputSender:D KakaoNotificationListener:D
```

### 로그 레벨별 확인
```powershell
# Error만
adb logcat *:E

# Debug 이상
adb logcat *:D

# Info 이상
adb logcat *:I
```

### 로그 파일로 저장
```powershell
adb logcat > bridge_logs.txt
```

## 앱 관리

### 앱 시작
```powershell
adb shell am start -n com.goodhabit.kakaobridge/.MainActivity
```

### 앱 강제 종료
```powershell
adb shell am force-stop com.goodhabit.kakaobridge
```

### 앱 데이터 삭제
```powershell
adb shell pm clear com.goodhabit.kakaobridge
```

### 앱 제거
```powershell
adb uninstall com.goodhabit.kakaobridge
```

## 파일 관리

### APK 파일 푸시
```powershell
adb push app\build\outputs\apk\debug\app-debug.apk /sdcard/
```

### 로그 파일 가져오기
```powershell
adb pull /sdcard/bridge_logs.txt .
```

### 디바이스 내 파일 확인
```powershell
adb shell ls -la /data/data/com.goodhabit.kakaobridge/
```

## 디버깅

### 프로세스 확인
```powershell
adb shell ps | grep kakaobridge
```

### 메모리 사용량 확인
```powershell
adb shell dumpsys meminfo com.goodhabit.kakaobridge
```

### CPU 사용량 확인
```powershell
adb shell top -n 1 | grep kakaobridge
```

### 배터리 최적화 상태 확인
```powershell
adb shell dumpsys deviceidle | grep -i kakaobridge
```

## 네트워크

### 네트워크 연결 확인
```powershell
adb shell ping -c 3 211.218.42.222
```

### WebSocket 연결 테스트 (curl 사용)
```powershell
adb shell "curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Key: test' -H 'Sec-WebSocket-Version: 13' http://211.218.42.222:5002/ws"
```

## 알림 관련

### 현재 알림 확인
```powershell
adb shell dumpsys notification | grep -A 10 "com.kakao.talk"
```

### 알림 권한 상세 확인
```powershell
adb shell dumpsys notification_listener | grep kakaobridge
```

## 데이터베이스 (Room DB)

### Room DB 파일 확인
```powershell
adb shell run-as com.goodhabit.kakaobridge ls -la databases/
```

### Room DB 파일 가져오기
```powershell
adb shell run-as com.goodhabit.kakaobridge cat databases/bridge_database > bridge_database.db
```

## 빠른 테스트 스크립트

### 전체 상태 확인
```powershell
Write-Host "=== Device Info ===" -ForegroundColor Cyan
adb devices
Write-Host "`n=== Service Status ===" -ForegroundColor Cyan
adb shell "dumpsys activity services | grep -i 'BridgeForegroundService'"
Write-Host "`n=== Notification Permission ===" -ForegroundColor Cyan
adb shell "settings get secure enabled_notification_listeners"
Write-Host "`n=== Installed Packages ===" -ForegroundColor Cyan
adb shell pm list packages | grep kakaobridge
```

## 문제 해결

### ADB 서버 재시작
```powershell
adb kill-server
adb start-server
adb devices
```

### 권한 문제 해결
```powershell
adb root
adb remount
```

### 로그 버퍼 크기 확인
```powershell
adb logcat -g
```

### 로그 버퍼 크기 설정
```powershell
adb logcat -G 16M
```

