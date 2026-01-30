# 닉네임 감지 및 반응 감지 문제 해결

## 수정 내용

### 1. 닉네임 감지 문제 해결

**문제**: senderName이 "R1Znx2lwf3K"처럼 암호화된 상태로 표시됨

**원인**: 
- 클라이언트에서 복호화 실패 시 암호화된 원본을 그대로 반환
- 서버에서 복호화 시도하지만 enc 후보가 부족

**해결**:
1. **클라이언트 (`kakao_poller.py`)**:
   - 복호화 시도 시 더 많은 enc 후보 사용 (31, 30, 32)
   - 복호화 실패 시 상세 로그 출력
   - 복호화 성공 시 로그 출력

2. **서버 (`server.js`)**:
   - json에서 encType 정보 확인하여 우선 사용
   - 더 많은 enc 후보 시도 (31, 30, 32)
   - 복호화 실패 시 상세 디버그 정보 출력

**확인 방법**:
```bash
# 클라이언트 로그에서 확인
[발신자] 복호화 성공: user_id=..., enc=31, "R1Znx2lwf3K..." -> "실제닉네임"

# 서버 로그에서 확인
[발신자 복호화] 성공: "R1Znx2lwf3K..." -> "실제닉네임" (enc=31)
```

### 2. 반응 감지 문제 해결

**문제**: 반응(따봉)이 감지되지 않음

**원인**:
- 반응 타입 범위가 너무 좁음 (71, 72, 73만 확인)
- 반응 감지 시 로그가 부족하여 디버깅 어려움

**해결**:
1. **반응 타입 범위 확장**:
   - 기존: 71, 72, 73만 확인
   - 수정: 70-79 범위 모두 확인

2. **상세 로그 추가**:
   - 반응 감지 시 즉시 로그 출력
   - 반응 전송 시 상세 정보 출력
   - 오류 발생 시 traceback 출력

3. **추가 정보 전송**:
   - 원본 msg_type과 attachment를 json에 포함하여 서버에서 추가 분석 가능

**확인 방법**:
```bash
# 클라이언트 로그에서 확인
[반응 감지] type 컬럼에서 반응 감지: msg_type=71, msg_id=...
[반응 처리] 반응 메시지 감지: msg_id=..., type=71, reaction_type=thumbs_up
[✓] 반응 정보 전송 성공: ID=..., 타입=thumbs_up

# 서버 로그에서 확인
[반응 저장] 성공: { message_id: ..., reaction_type: 'thumbs_up', reactor: '닉네임', ... }
```

### 3. 알림 리플라이 기능 테스트 방법

**테스트 스크립트**: `test-bridge-reply.ps1` 실행

#### 방법 1: ADB를 통한 직접 테스트
```bash
adb shell am broadcast -a com.goodhabit.kakaobridge.SEND \
  -n com.goodhabit.kakaobridge/.BridgeCommandReceiver \
  --es roomKey "의운모" \
  --es text "테스트 메시지"
```

#### 방법 2: 카카오톡 알림 테스트
1. 카카오톡에서 테스트할 채팅방으로 이동
2. 다른 기기나 계정에서 메시지 전송 (알림 발생)
3. Bridge APK가 알림을 감지하고 roomKey를 캐시하는지 확인
4. 서버에서 응답 메시지 전송 시 자동으로 리플라이 사용

#### 방법 3: 로그 확인
```bash
# Bridge APK 로그
adb logcat -s BridgeForegroundService:D KakaoNotificationListenerService:D RemoteInputSender:D

# 서버 로그
# 서버 콘솔에서 '[Bridge 전송]' 로그 확인
```

#### 정상 동작 확인
1. Bridge APK가 WebSocket으로 'type: send' 메시지 수신
2. 큐에 전송 요청 저장 (PENDING 상태)
3. 카카오톡 알림 감지 시 roomKey 추출 및 replyAction 캐싱
4. RemoteInputSender로 메시지 전송 (알림 리플라이)
5. ACK 응답 전송 (type: ack, status: SENT)

#### 문제 발생 시 확인사항
1. 알림 접근 권한 확인 (설정 > 앱 > Bridge APK > 알림)
2. 배터리 최적화 제외 확인
3. 카카오톡 알림이 켜져 있는지 확인
4. 해당 채팅방 알림이 활성화되어 있는지 확인

## 수정된 파일

1. `client/kakao_poller.py`
   - `get_name_of_user_id()`: 복호화 로직 개선, 로그 강화
   - 반응 감지: 타입 범위 확장 (70-79), 상세 로그 추가

2. `server/server.js`
   - 발신자 복호화: enc 후보 확장, json.encType 우선 사용, 상세 로그 추가

3. `test-bridge-reply.ps1` (신규)
   - Bridge APK 알림 리플라이 기능 테스트 가이드

## 다음 단계

1. **닉네임 복호화 테스트**:
   - 클라이언트와 서버 로그에서 복호화 성공/실패 확인
   - 실패 시 MY_USER_ID 확인 필요

2. **반응 감지 테스트**:
   - 카카오톡에서 반응(따봉) 추가
   - 클라이언트 로그에서 반응 감지 확인
   - 서버 로그에서 반응 저장 확인

3. **알림 리플라이 테스트**:
   - `test-bridge-reply.ps1` 스크립트 실행
   - ADB 로그 확인
   - 서버 로그 확인

