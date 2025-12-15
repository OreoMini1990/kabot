# Raw 메시지 데이터로 채팅방 이름 테스트 가이드

## 문제 해결

### Crypto 모듈 오류
```bash
# 가상환경 활성화 확인
# Windows PowerShell
.venv\Scripts\Activate.ps1

# 가상환경에서 pycryptodome 설치 확인
pip install pycryptodome

# 또는 직접 설치
python -m pip install pycryptodome
```

## 사용 방법

### 1. 실제 Raw 메시지 데이터 준비

이전에 테스트했던 실제 raw 메시지 데이터를 JSON 파일로 저장:

```json
{
  "chat_id": 18469584418690487,
  "user_id": 4897202238384074000,
  "message": "실제암호화된메시지base64",
  "v": "{\"enc\": 31, \"origin\": \"MSG\", \"isMine\": false}",
  "json": {
    "room_name": "실제암호화된채팅방이름base64",
    "room_data": {
      "private_meta": "{\"name\": \"실제암호화된채팅방이름base64\", \"enc\": 31}"
    },
    "userId": 4897202238384074000,
    "myUserId": 429744344
  }
}
```

### 2. 테스트 실행

```bash
# 가상환경 활성화
.venv\Scripts\Activate.ps1

# 테스트 실행
cd D:\JosupAI\kakkaobot
python tests/test_room_name_raw.py tests/실제raw메시지.json 429744344
```

### 3. 실제 데이터 예시

이전 테스트에서 사용했던 실제 데이터:
- chat_id: 18469584418690487
- my_user_id: 429744344
- room_name: 실제 base64 암호화된 문자열 (예: "RcrN4TWyfEL0p6O+yWtOpw==")

## 테스트 결과 확인

성공 시:
```
[✓ 복호화 성공] enc=31, 복호화된 이름: "의운모"
[테스트 결과]
  - 채팅방 이름: "의운모"
  - "의운모" 매칭: True
```

실패 시:
- 채팅방 이름이 복호화되지 않음
- "의운모" 매칭 실패

## 다음 단계

테스트가 성공하면 `kakao_poller.py`의 `get_chat_room_data()` 함수가 정상 동작하는 것입니다.

