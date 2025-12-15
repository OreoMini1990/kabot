# 채팅방 이름 조회 테스트 가이드

## 개요
Iris 코드를 참고하여 채팅방 이름을 정확하게 조회하고 복호화하는지 테스트하는 스크립트입니다.

## 실행 방법

### Android 기기에서 실행 (Termux)

```bash
# Termux에서 실행
cd /path/to/kakkaobot
python3 tests/test_room_name.py [chat_id]

# 예시: 특정 chat_id로 테스트
python3 tests/test_room_name.py 18469584418690487

# 예시: 최근 메시지들의 chat_id로 테스트
python3 tests/test_room_name.py
```

### 로컬에서 실행 (DB 경로 지정)

```bash
# 환경 변수로 DB 경로 지정
export KAKAO_DB_PATH="/path/to/KakaoTalk.db"
python3 tests/test_room_name.py [chat_id]

# 또는 직접 수정
# test_room_name.py의 DB_PATH 변수 수정 후 실행
```

## 테스트 내용

1. **자신의 user_id 조회**: `isMine=true`인 메시지에서 user_id 추출
2. **채팅방 이름 조회 (3가지 방법)**:
   - 방법 1: `private_meta` JSON에서 `name` 필드 추출 및 복호화
   - 방법 2: `open_link` 테이블에서 이름 조회
   - 방법 3: `chat_rooms.name` 컬럼 직접 조회
3. **복호화 시도**: 암호화된 이름인 경우 여러 enc 값으로 복호화 시도
4. **결과 확인**: "의운모" 채팅방인지 확인

## 예상 출력

```
[테스트 시작] chat_id=18469584418690487
[정보] 자신의 user_id: 429744344

[방법 1] private_meta 조회 시도
[방법 1] private_meta 조회 성공: 길이=123
[방법 1] JSON 파싱 성공: 키=['name', 'enc', ...]
[방법 1] name 필드 추출: name_element='암호화된문자열', 타입=<class 'str'>
[방법 1] 채팅방 이름이 암호화된 것으로 확인됨 (base64 형태)
[방법 1] 복호화 시도: user_id=429744344, enc 후보=[31, 32, 30]
[✓ 방법 1] 채팅방 이름 복호화 성공!
  - enc: 31
  - 복호화된 이름: "의운모"

[테스트 결과]
  - chat_id: 18469584418690487
  - my_user_id: 429744344
  - room_name: "의운모"
  - "의운모" 매칭: True
```

## 문제 해결

### private_meta가 NULL인 경우
- `open_link` 테이블 확인
- `chat_rooms.name` 컬럼 확인
- 다른 채팅방으로 테스트

### 복호화 실패하는 경우
- `my_user_id`가 올바른지 확인
- `enc` 값이 올바른지 확인 (31, 32, 30 시도)
- `private_meta`에 `enc` 필드가 있는지 확인

### DB 접근 권한 오류
- Termux에서 `su` 권한으로 실행
- 또는 `adb shell`로 접근하여 실행

