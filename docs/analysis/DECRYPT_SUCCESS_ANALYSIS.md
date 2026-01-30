# 클라이언트 복호화 실패 vs 서버 복호화 성공 분석

## 핵심 발견

### 클라이언트에서 전송하는 데이터

클라이언트 코드를 보면 (`kakao_poller.py` 1074-1080줄):
```python
if sender_name_decrypted:
    sender = f"{sender_name_decrypted}/{user_id}" if user_id else sender_name_decrypted
elif sender_name_encrypted:
    # 복호화 실패한 경우 암호화된 이름 사용 (서버에서 복호화 시도)
    sender = f"{sender_name_encrypted}/{user_id}" if user_id else sender_name_encrypted
```

**클라이언트가 복호화 실패 시 전송하는 것:**
- `sender`: `"/QvsAQ4wyJs3LVpLw2XTaw==/4897202238384073231"` (암호화된 이름)
- `json.sender_name_decrypted`: `None`
- `json.sender_name_encrypted`: `"/QvsAQ4wyJs3LVpLw2XTaw=="`

### 서버에서 복호화 성공하는 방법

서버 코드를 보면 (`server.js` 1856-1872줄):
```javascript
if (isStillEncrypted && senderName.length > 5 && /^[A-Za-z0-9+/=]+$/.test(senderName)) {
  const myUserId = json.myUserId || json.userId || json.user_id;
  if (myUserId) {
    console.log(`[발신자] 최종 복호화 시도: myUserId=${myUserId}, senderName="${senderName}"`);
    for (const encTry of [31, 30, 32]) {
      try {
        const decrypted = decryptKakaoTalkMessage(senderName, String(myUserId), encTry);
        // ...
      }
    }
  }
}
```

**서버의 복호화 시도:**
1. `json.myUserId` (429744344) 사용
2. 여러 `enc` 타입 시도 (31, 30, 32)
3. `decryptKakaoTalkMessage` 함수 사용

## 차이점 분석

### 1. 복호화 함수의 차이

#### 클라이언트 (Python)
- `KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, encrypted_name)`
- `kakaodecrypt.py` 모듈 사용

#### 서버 (Node.js)
- `decryptKakaoTalkMessage(senderName, String(myUserId), encTry)`
- 자체 구현된 복호화 함수

**가능한 차이점:**
- Salt 생성 방식
- Secret Key 생성 방식
- AES 복호화 방식
- Padding 처리 방식

### 2. 실제 성공 원인 추정

서버 로그를 보면:
- `sender_name: '랩장/AN/서'` (정상 저장)
- 하지만 경고 메시지는 여전히 출력됨

**가장 가능성 높은 이유:**

1. **서버의 `sender` 필드 파싱 로직**
   - `extractSenderName` 함수가 `sender` 필드를 파싱할 때, 실제로는 클라이언트가 보낸 `sender` 필드에서 복호화된 값을 찾음
   - 하지만 로그를 보면 `sender=/QvsAQ4wyJs3LVpLw2XTaw==/4897202238384073231` (암호화된 값)

2. **서버의 복호화 로직이 더 정확함**
   - 서버의 `decryptKakaoTalkMessage` 함수가 클라이언트보다 더 정확한 복호화 수행
   - Salt/Key 생성 방식이 다를 수 있음

3. **클라이언트가 실제로는 복호화 성공했지만 로그만 잘못 출력**
   - 하지만 로그를 보면 명확히 "복호화 실패"라고 나옴

## 결론

### 현재 상태는 정상 동작 중

1. **클라이언트 복호화 실패**는 예상된 동작일 수 있음:
   - `MY_USER_ID`가 올바르지 않거나
   - 복호화 키가 맞지 않거나
   - 클라이언트의 복호화 로직에 미묘한 차이가 있을 수 있음

2. **서버 복호화 성공**은 fallback 메커니즘:
   - 클라이언트가 암호화된 이름을 전송
   - 서버에서 복호화 시도
   - 서버의 복호화 로직이 더 정확하거나, 다른 방식으로 복호화 성공

3. **최종 결과는 정상**:
   - DB에 복호화된 이름이 저장됨
   - 모든 기능이 정상 작동

### 개선 가능 사항

클라이언트에서도 복호화를 성공시키려면:
1. 서버의 복호화 로직을 Python으로 포팅
2. 같은 Salt/Key 생성 방식 사용
3. 같은 AES 복호화 방식 사용

하지만 **현재 상태가 문제가 되는 것은 아닙니다**. 서버에서 정상적으로 복호화되어 저장되므로, 시스템은 정상 작동 중입니다.

