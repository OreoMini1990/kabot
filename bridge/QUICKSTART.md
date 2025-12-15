# KakaoBridge 빠른 시작 가이드

## 1. APK 빌드

```bash
cd kakkaobot/bridge
./gradlew assembleRelease
```

빌드된 APK: `app/build/outputs/apk/release/app-release.apk`

## 2. 설치

```bash
adb install -r app-release.apk
```

또는 APK 파일을 Galaxy A16으로 전송하여 수동 설치

## 3. 권한 설정 (앱 실행 시 자동 요청)

### 알림 접근 권한
1. 앱 실행 → "알림 접근 권한 설정" 버튼 클릭
2. 설정 화면에서 "KakaoBridge" 활성화
3. 앱으로 돌아가기

### 배터리 최적화 제외
1. 앱 실행 → "배터리 최적화 제외 설정" 버튼 클릭
2. 설정 화면에서 "KakaoBridge" → "제한 없음" 선택
3. 앱으로 돌아가기

## 4. 서비스 시작

앱에서 "서비스 시작" 버튼 클릭

## 5. 테스트

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

## 중요 사항

1. **카카오톡 알림 설정**: 해당 채팅방 알림이 켜져 있어야 RemoteInput 사용 가능
2. **알림 접근 권한 필수**: 카카오톡 알림에 접근하려면 반드시 설정에서 활성화 필요
3. **배터리 최적화 제외 필수**: Galaxy A16에서 백그라운드 안정성을 위해 필수

## 문제 해결

### 메시지가 전송되지 않는 경우
1. 알림 접근 권한 확인
2. 배터리 최적화 제외 확인
3. 카카오톡 알림 설정 확인 (해당 채팅방 알림 켜기)
4. 로그 확인: `adb logcat | grep KakaoBridge`

### WebSocket 연결이 안 되는 경우
1. 네트워크 연결 확인
2. NAS 서버 상태 확인
3. WebSocket URL 확인 (기본값: `ws://211.218.42.222:5002/ws`)

