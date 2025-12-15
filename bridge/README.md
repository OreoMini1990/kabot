# KakaoBridge Android APK

NAS(Node.js)에서 생성한 응답 메시지를 Galaxy A16에서 카카오톡으로 전송하는 브릿지 앱입니다.

## 주요 기능

- ✅ 알림 리플라이(RemoteInput) 기반 카카오톡 메시지 전송
- ✅ 알림 접근 권한 자동 요청
- ✅ 배터리 최적화 제외 자동 요청
- ✅ 큐/재시도 시스템 (Room DB 기반)
- ✅ WebSocket 연동 (NAS 통신)
- ✅ Galaxy A16 최적화

## 빠른 시작

### 1. Gradle Wrapper 생성 (최초 1회, Gradle 설치 불필요!)
```powershell
.\create-gradle-wrapper-simple.ps1
```

**참고**: 이 스크립트는 Gradle을 설치하지 않고도 Wrapper 파일을 직접 생성합니다.

### 2. 빌드 및 설치 (한 줄 명령어)
```powershell
.\build-and-install.ps1
```

### 3. 권한 설정 (앱 실행 시 자동 요청)
앱 실행 시 다음 권한을 자동으로 요청합니다:
- 알림 접근 권한 (NotificationListenerService)
- 배터리 최적화 제외

### 4. WebSocket 연결 설정
앱 내 설정에서 NAS WebSocket URL을 입력합니다.

## Cursor에서 작업하기

**Android Studio 없이도 Cursor에서 충분히 개발 가능합니다!**

자세한 내용은 [README_CURSOR.md](README_CURSOR.md) 참고

## 개발 구조

```
bridge/
├── app/
│   ├── src/main/
│   │   ├── java/com/goodhabit/kakaobridge/
│   │   │   ├── service/
│   │   │   │   ├── KakaoNotificationListenerService.kt
│   │   │   │   └── BridgeForegroundService.kt
│   │   │   ├── sender/
│   │   │   │   ├── RemoteInputSender.kt
│   │   │   │   └── MessageSender.kt (인터페이스)
│   │   │   ├── queue/
│   │   │   │   ├── SendQueue.kt
│   │   │   │   └── SendRequest.kt
│   │   │   ├── receiver/
│   │   │   │   └── BridgeCommandReceiver.kt
│   │   │   ├── db/
│   │   │   │   └── AppDatabase.kt
│   │   │   └── MainActivity.kt
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
└── build.gradle.kts
```

## 테스트 방법

### 로컬 테스트 (BroadcastReceiver)
```bash
adb shell am broadcast -a com.goodhabit.kakaobridge.SEND \
  -n com.goodhabit.kakaobridge/.BridgeCommandReceiver \
  --es token "LOCAL_DEV_TOKEN" \
  --es roomKey "의운모" \
  --es text "테스트 메시지"
```

### WebSocket 테스트
NAS에서 WebSocket으로 메시지 전송:
```json
{
  "type": "send",
  "id": "uuid",
  "roomKey": "의운모",
  "text": "안녕하세요",
  "ts": 1734230000
}
```

## Galaxy A16 최적화

앱이 안정적으로 작동하려면 다음 설정이 필요합니다:
1. 알림 접근 권한 활성화 (자동 요청)
2. 배터리 최적화 제외 (자동 요청)
3. Foreground Service 모드 (자동 활성화)

## 참고

- Iris 원본 코드 기반: `docs/LABBOT/Iris-main`
- 기술적 한계 문서: `docs/TECHNICAL_LIMITATIONS.md`

