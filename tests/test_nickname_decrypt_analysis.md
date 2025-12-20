# 닉네임 복호화 분석 결과

## 문제 발견

### Iris-main 코드 분석

Iris KakaoDB.kt의 `getNameOfUserId()` 함수:
```kotlin
KakaoDecrypt.decrypt(enc, encryptedName, Configurable.botId)
```

시그니처: `decrypt(encType: Int, b64_ciphertext: String, user_id: Long)`
- 순서: **encType, ciphertext, user_id**

### 현재 Python 코드

kakaodecrypt.py의 `decrypt()` 함수:
```python
def decrypt(user_id, enc, cipher_b64):
```

시그니처: `decrypt(user_id, enc, cipher_b64)`
- 순서: **user_id, enc, cipher_b64**

**차이점**: 파라미터 순서가 다릅니다!

### 현재 호출 코드

kakao_poller.py:
```python
KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, encrypted_name)
```

이것은 Python 구현에 맞는 올바른 순서입니다.

## 테스트 방법

```bash
# MY_USER_ID를 알고 있는 경우
python tests/test_nickname_decrypt.py <MY_USER_ID>

# 예시
python tests/test_nickname_decrypt.py 429744344
```

## 예상 결과

"R1Znx2lwf3K"를 "환영하는 라이언"으로 복호화하려면:
- 올바른 MY_USER_ID 필요
- 올바른 enc 값 필요 (보통 31, 30, 또는 DB에서 조회한 값)

## 다음 단계

1. 실제 MY_USER_ID 확인
2. 테스트 실행
3. 결과 분석

