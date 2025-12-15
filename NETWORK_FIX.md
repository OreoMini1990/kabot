# 네트워크 보안 정책 수정

## 문제

Android 9 (API 28) 이상에서는 기본적으로 cleartext (HTTP/ws://) 트래픽이 차단됩니다.

**오류 메시지**:
```
CLEARTEXT communication to 211.218.42.222 not permitted by network security policy
```

## 해결 방법

### 1. network_security_config.xml 생성

`app/src/main/res/xml/network_security_config.xml` 파일을 생성하여 cleartext 트래픽을 허용했습니다.

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Allow cleartext traffic for WebSocket (ws://) -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    
    <!-- Specific domain configuration (optional, more secure) -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">211.218.42.222</domain>
    </domain-config>
</network-security-config>
```

### 2. AndroidManifest.xml 수정

`application` 태그에 다음 속성을 추가했습니다:

```xml
android:networkSecurityConfig="@xml/network_security_config"
android:usesCleartextTraffic="true"
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

3. **서비스 재시작**:
   - 앱에서 "서비스 중지" 후 "서비스 시작" 클릭
   - 또는 앱 재시작

## 확인 방법

로그에서 WebSocket 연결 성공 메시지를 확인:

```powershell
adb logcat | Select-String -Pattern "WebSocket connected|Connecting to WebSocket"
```

**성공 메시지 예시**:
```
D/BridgeForegroundService: Connecting to WebSocket: ws://211.218.42.222:5002/ws
D/BridgeForegroundService: WebSocket connected
```

**실패 메시지 (수정 전)**:
```
E/BridgeForegroundService: CLEARTEXT communication to 211.218.42.222 not permitted
```

## 보안 고려사항

현재 설정은 개발/테스트 환경용입니다. 프로덕션 환경에서는:

1. **HTTPS/wss:// 사용 권장**: 서버에서 SSL/TLS 인증서를 설정하여 `wss://` 사용
2. **특정 도메인만 허용**: `network_security_config.xml`에서 특정 IP/도메인만 허용 (현재 설정됨)
3. **프로덕션 빌드에서 제한**: 프로덕션 빌드에서는 cleartext 트래픽을 제한하는 것을 권장

## 참고

- [Android Network Security Configuration](https://developer.android.com/training/articles/security-config)
- [Cleartext Traffic](https://developer.android.com/guide/topics/manifest/application-element#usesCleartextTraffic)

