# 실제 Raw 메시지 데이터 사용법

## 1. 실제 데이터 수집

이전에 테스트했던 실제 raw 메시지 데이터를 수집하세요:

### 방법 1: kakao_poller.py 로그에서 수집
- `send_to_server()` 함수에서 전송하는 `payload` 데이터
- `json` 필드에 `room_name`, `room_data` 등이 포함됨

### 방법 2: 서버 로그에서 수집
- 서버에서 받은 WebSocket 메시지 데이터
- `json.room_name` 또는 `json.room_data.private_meta` 확인

## 2. 데이터 형식

```json
{
  "chat_id": 18469584418690487,
  "user_id": 4897202238384074000,
  "message": "base64암호화된메시지",
  "v": "{\"enc\": 31, \"origin\": \"MSG\", \"isMine\": false}",
  "json": {
    "room_name": "base64암호화된채팅방이름",
    "room_data": {
      "private_meta": "{\"name\": \"base64암호화된채팅방이름\", \"enc\": 31}"
    },
    "myUserId": 429744344
  }
}
```

## 3. 테스트 실행

```bash
# 가상환경 활성화
.venv\Scripts\Activate.ps1

# 테스트 실행
cd D:\JosupAI\kakkaobot
python tests/test_room_name_raw.py tests/실제raw메시지.json 429744344
```

## 4. 예상 결과

성공 시:
```
[✓ 복호화 성공] enc=31, 복호화된 이름: "의운모"
[테스트 결과]
  - 채팅방 이름: "의운모"
  - "의운모" 매칭: True
```

## 5. 실제 데이터 예시

이전 테스트에서 사용했던 실제 값들:
- `chat_id`: 18469584418690487
- `my_user_id`: 429744344
- `room_name`: 실제 base64 문자열 (예: "RcrN4TWyfEL0p6O+yWtOpw==")
- `enc`: 31

## 6. 데이터 확인 방법

실제 데이터가 base64 형태인지 확인:
- 길이가 16의 배수여야 함
- A-Z, a-z, 0-9, +, /, = 문자만 포함
- 복호화 시도 시 유효한 텍스트가 나와야 함

