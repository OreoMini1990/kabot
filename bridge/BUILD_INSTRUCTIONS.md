# KakaoBridge Android APK 빌드 가이드

## 필수 요구사항

- Android Studio Hedgehog (2023.1.1) 이상
- JDK 17 이상
- Android SDK (API 26 이상)
- Gradle 8.0 이상

## 빌드 방법

### 1. 프로젝트 열기
```bash
cd kakkaobot/bridge
# Android Studio에서 열기
```

### 2. Gradle 동기화
Android Studio에서 "Sync Project with Gradle Files" 실행

### 3. APK 빌드
```bash
# Debug APK
./gradlew assembleDebug

# Release APK
./gradlew assembleRelease
```

빌드된 APK는 다음 위치에 생성됩니다:
- Debug: `app/build/outputs/apk/debug/app-debug.apk`
- Release: `app/build/outputs/apk/release/app-release.apk`

## 설치 방법

### ADB를 통한 설치
```bash
adb install -r app-release.apk
```

### 수동 설치
1. APK 파일을 Galaxy A16로 전송
2. 파일 관리자에서 APK 파일 열기
3. "알 수 없는 소스" 허용 (필요 시)
4. 설치 진행

## 설정 방법

### 1. 앱 실행 후 권한 설정
앱 실행 시 다음 권한을 자동으로 요청합니다:
- 알림 접근 권한: "설정 열기" 버튼 클릭 → KakaoBridge 활성화
- 배터리 최적화 제외: "설정 열기" 버튼 클릭 → KakaoBridge "제한 없음" 선택

### 2. WebSocket URL 설정 (선택사항)
앱 내 설정에서 NAS WebSocket URL 입력 (기본값: `ws://211.218.42.222:5002/ws`)

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
  "id": "uuid-1234",
  "roomKey": "의운모",
  "text": "안녕하세요",
  "ts": 1734230000
}
```

## Galaxy A16 최적화 체크리스트

✅ 알림 접근 권한 활성화 (앱에서 자동 요청)
✅ 배터리 최적화 제외 (앱에서 자동 요청)
✅ Foreground Service 모드 (자동 활성화)
✅ 카카오톡 알림 설정 확인 (해당 채팅방 알림 켜기)

## 문제 해결

### 알림 접근 권한이 작동하지 않는 경우
1. 설정 → 알림 → 고급 설정 → 알림 접근
2. KakaoBridge 활성화 확인
3. 앱 재시작

### 배터리 최적화 제외가 작동하지 않는 경우
1. 설정 → 배터리 → 백그라운드 사용 제한
2. KakaoBridge "제한 없음" 선택
3. 앱 재시작

### WebSocket 연결이 안 되는 경우
1. 네트워크 연결 확인
2. WebSocket URL 확인 (앱 내 설정)
3. NAS 서버 상태 확인

## 참고 문서

- [README.md](README.md) - 프로젝트 개요
- [docs/TECHNICAL_LIMITATIONS.md](../docs/TECHNICAL_LIMITATIONS.md) - 기술적 한계 분석

