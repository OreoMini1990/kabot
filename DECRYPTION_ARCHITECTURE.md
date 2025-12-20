# 복호화 아키텍처 설계 문서

## 개요

카카오톡 메시지 및 발신자 이름 복호화를 효율적이고 안전하게 처리하기 위한 아키텍처입니다.

## 복호화 전략: 하이브리드 방식

### 원칙

1. **클라이언트 우선 복호화**: 클라이언트에서 가능한 모든 복호화 시도
2. **서버 fallback**: 클라이언트 복호화 실패 시 서버에서 재시도
3. **명시적 상태 전달**: 복호화 성공/실패 여부를 명확히 구분하여 전달

### 장점

- **보안**: 복호화된 데이터만 네트워크로 전송 (가능한 경우)
- **효율성**: 클라이언트에서 복호화 성공 시 서버 부하 감소
- **안정성**: 클라이언트 실패 시에도 서버에서 재시도 가능
- **명확성**: 복호화 상태를 명시적으로 구분

## 메시지 플로우

### 1. 발신자 이름 복호화

#### 클라이언트 (kakao_poller.py)

```python
# DB에서 전체 암호화된 이름 조회
encrypted_name = "R1Znx2lwf3K/2e+WAtA1UAH30GbjviPEfvKZ84iiqdE="  # 전체 문자열
enc = 31  # DB에서 조회한 enc 값

# 복호화 시도
decrypted_name = KakaoDecrypt.decrypt(MY_USER_ID, enc, encrypted_name)
# 성공: "환영하는 라이언"
```

**전송 데이터 구조:**

```json
{
  "type": "message",
  "sender": "환영하는 라이언/4897202238384073231",  // 복호화 성공 시
  "json": {
    "sender_name_decrypted": "환영하는 라이언",      // 복호화 성공 (우선 사용)
    "sender_name_encrypted": null,                  // 복호화 실패 시만 값 있음
    "user_name": "환영하는 라이언",                  // 서버 호환성
    "myUserId": 429744344,
    "user_id": 4897202238384073231
  }
}
```

**복호화 실패 시:**

```json
{
  "type": "message",
  "sender": "R1Znx2lwf3K/2e+WAtA1UAH30GbjviPEfvKZ84iiqdE=/4897202238384073231",
  "json": {
    "sender_name_decrypted": null,
    "sender_name_encrypted": "R1Znx2lwf3K/2e+WAtA1UAH30GbjviPEfvKZ84iiqdE=",
    "user_name": null,
    "myUserId": 429744344,
    "user_id": 4897202238384073231
  }
}
```

#### 서버 (server.js)

**우선순위:**

1. `json.sender_name_decrypted` 사용 (클라이언트 복호화 성공)
2. `json.user_name` 사용 (fallback, 이미 복호화된 값)
3. `json.sender_name_encrypted`로 서버 복호화 시도
4. `sender` 필드에서 추출 (하위 호환성)

```javascript
// 1. 클라이언트에서 복호화된 이름 우선 사용
if (json.sender_name_decrypted) {
  senderName = json.sender_name_decrypted;
}

// 2. 서버에서 복호화 시도 (클라이언트 실패 시)
else if (json.sender_name_encrypted) {
  const myUserId = json.myUserId;
  for (const enc of [31, 30, 32]) {
    const decrypted = decryptKakaoTalkMessage(json.sender_name_encrypted, myUserId, enc);
    if (decrypted) {
      senderName = decrypted;
      break;
    }
  }
}
```

### 2. 메시지 복호화

메시지 복호화는 클라이언트에서만 수행 (서버 fallback 없음)

**이유:**
- 메시지는 이미 클라이언트에서 복호화되어 전송됨
- 서버에서는 복호화된 메시지만 처리

## 핵심 구현 사항

### 클라이언트 (kakao_poller.py)

1. **전체 암호화 문자열 사용**
   - DB에서 조회한 전체 암호화된 이름 사용
   - 부분 문자열로는 복호화 실패 가능

2. **명시적 상태 구분**
   - `sender_name_decrypted`: 복호화 성공 시
   - `sender_name_encrypted`: 복호화 실패 시 (서버 재시도용)

3. **상세 로그**
   - `[DB조회]`: DB 조회 정보 (enc 값, 암호화된 이름)
   - `[발신자] 복호화 성공/실패`: 복호화 결과

### 서버 (server.js)

1. **우선순위 기반 처리**
   - 클라이언트 복호화 결과 우선 사용
   - 서버 복호화는 최후의 수단

2. **중복 로직 제거**
   - 복호화 시도 로직 단순화
   - 명시적 필드 우선 사용

## 보안 고려사항

1. **네트워크 전송**
   - 복호화 성공 시: 복호화된 데이터만 전송 ✅
   - 복호화 실패 시: 암호화된 데이터 전송 (서버 재시도용)

2. **MY_USER_ID 보호**
   - 클라이언트에만 저장 (서버로 전송하지 않음 - 이미 전송 중이지만 필요 최소한의 정보)
   - 복호화에 필수이므로 클라이언트에서만 사용

3. **에러 처리**
   - 복호화 실패 시 원본 암호화 데이터 보존
   - 서버에서 재시도 가능하도록 정보 제공

## 테스트 방법

1. **클라이언트 복호화 성공 케이스**
   - 로그에서 `[발신자] 복호화 성공` 확인
   - 서버 로그에서 `클라이언트에서 복호화된 이름 사용` 확인

2. **클라이언트 복호화 실패 케이스**
   - 로그에서 `[발신자] 복호화 실패` 확인
   - 서버 로그에서 `서버에서 복호화 시도` 확인
   - 서버 복호화 성공/실패 확인

3. **DB 조회 확인**
   - 로그에서 `[DB조회]` 항목 확인
   - `enc` 값과 전체 암호화된 이름 확인

## 문제 해결

### 복호화 실패 시

1. **MY_USER_ID 확인**
   ```bash
   python tests/find_my_user_id.py
   ```

2. **DB에서 실제 enc 값 확인**
   - 로그에서 `[DB조회]` 항목 확인
   - 또는 직접 DB 조회

3. **전체 암호화 문자열 확인**
   - 부분 문자열이 아닌 전체 문자열 사용 확인
   - 로그에서 `[DB조회] 결과: name=...` 확인

## 변경 이력

- 2024-XX-XX: 하이브리드 방식 도입
  - 클라이언트 우선 복호화, 서버 fallback
  - 명시적 상태 필드 추가 (sender_name_decrypted/encrypted)
  - 전체 암호화 문자열 사용으로 변경

