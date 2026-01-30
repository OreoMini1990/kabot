# 닉네임 복호화 문제 분석 및 해결 방안

## 문제 요약

**현상**: senderName이 "R1Znx2lwf3K"처럼 암호화된 상태로 표시됨  
**예상 결과**: "환영하는 라이언"

## Iris-main 코드 분석

### KakaoDB.kt의 getNameOfUserId()

```kotlin
fun getNameOfUserId(userId: Long): String? {
    // SQL 쿼리로 name과 enc 조회
    val encryptedName = cursor.getString(cursor.getColumnIndexOrThrow("name"))
    val enc = cursor.getInt(cursor.getColumnIndexOrThrow("enc"))
    
    try {
        KakaoDecrypt.decrypt(enc, encryptedName, Configurable.botId)
    } catch (e: Exception) {
        encryptedName  // 실패 시 원본 반환
    }
}
```

**핵심**: `Configurable.botId` (자신의 user_id)를 사용하여 복호화

### KakaoDecrypt.kt의 decrypt()

```kotlin
fun decrypt(encType: Int, b64_ciphertext: String, user_id: Long): String {
    val salt = genSalt(user_id, encType)  // user_id와 encType으로 salt 생성
    val key = deriveKey(keyBytes, salt, 2, 32)
    // ... AES 복호화
}
```

**시그니처**: `decrypt(encType, ciphertext, user_id)`

## 현재 Python 코드 분석

### kakaodecrypt.py의 decrypt()

```python
@staticmethod
def decrypt(user_id, enc, cipher_b64):
    salt = KakaoDecrypt.genSalt(user_id, enc)
    key = KakaoDecrypt.pkcs12_key(KAKAO_PASSWORD, salt, iterations=2, dkeySize=32)
    # ... AES 복호화
```

**시그니처**: `decrypt(user_id, enc, cipher_b64)`  
**차이점**: 파라미터 순서가 다르지만, Python 구현은 자체적으로 올바르게 구현됨

### kakao_poller.py의 get_name_of_user_id()

```python
decrypted = KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, encrypted_name)
```

**호출 순서**: `decrypt(user_id, enc, ciphertext)` - 올바름

## 주요 차이점 및 문제점

### 1. 복호화 로직은 올바름 ✅
- Python 구현은 Iris와 동일한 알고리즘 사용
- 파라미터 순서는 다르지만 기능적으로 동일

### 2. 가능한 문제점

#### 문제 1: MY_USER_ID가 잘못되었을 수 있음
- Iris: `Configurable.botId` 사용 (chat_logs에서 isMine=true로 조회)
- 현재: `MY_USER_ID` 사용 (파일에서 로드 또는 추정)

**해결**: MY_USER_ID가 정확한지 확인 필요

#### 문제 2: enc 값이 정확하지 않을 수 있음
- Iris: DB에서 조회한 enc 값을 우선 사용
- 현재: DB에서 조회한 enc를 사용하지만, 실패 시 31, 30만 시도

**해결**: 더 많은 enc 후보 시도는 복호화 로직 수정이므로 하지 않음 (규칙 준수)

#### 문제 3: 복호화 실패 시 원본 반환
- Iris: 실패 시 `encryptedName` 반환 (서버에서 추가 복호화 시도)
- 현재: 동일하게 원본 반환

**현재 동작은 올바름**: 서버에서 복호화를 시도하도록 설계됨

## 테스트 방법

### 1. MY_USER_ID 확인
```bash
# 파일에서 확인
cat ~/my_user_id.txt

# 또는 추정 함수 실행
python -c "from kakao_poller import guess_my_user_id; print(guess_my_user_id())"
```

### 2. 닉네임 복호화 테스트
```bash
# MY_USER_ID를 알고 있는 경우
python tests/test_nickname_decrypt.py <MY_USER_ID>

# 예시
python tests/test_nickname_decrypt.py 429744344
```

### 3. DB에서 직접 확인
```sql
-- friends 테이블
SELECT name, enc FROM db2.friends WHERE name = 'R1Znx2lwf3K';

-- open_chat_member 테이블
SELECT nickname, enc FROM db2.open_chat_member WHERE nickname = 'R1Znx2lwf3K';
```

## 해결 방안

### 방안 1: MY_USER_ID 정확성 확인 (권장)
1. DB에서 직접 확인
2. 테스트 스크립트 실행
3. 올바른 MY_USER_ID 사용

### 방안 2: 서버에서 복호화 개선 (이미 구현됨)
- 클라이언트에서 복호화 실패 시 서버에서 재시도
- 서버 코드는 이미 개선되어 있음

### 방안 3: 로그 강화 (이미 구현됨)
- 복호화 시도 시 상세 로그 출력
- 실패 시 디버그 정보 출력

## 결론

**코드 자체는 올바르게 구현되어 있습니다.**

문제는 다음 중 하나일 가능성이 높습니다:
1. **MY_USER_ID가 잘못됨** - 가장 가능성 높음
2. **enc 값이 예상과 다름** - DB에서 직접 확인 필요
3. **복호화는 성공하지만 결과 검증 실패** - 로그 확인 필요

**다음 단계**: MY_USER_ID를 정확히 확인하고 테스트 스크립트로 검증하세요.

