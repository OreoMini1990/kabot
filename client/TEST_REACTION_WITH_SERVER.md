# 반응 업데이트 테스트 가이드 (서버 전송 포함)

## 목적

클라이언트(`kakao_poller.py`)의 `poll_reaction_updates()` 함수가 카카오톡 DB에서 `v` 필드와 `supplement` 필드의 반응 데이터를 제대로 가져와서 서버로 전송하고, Supabase DB에 저장되는지 전체 플로우를 테스트합니다.

## 테스트 스크립트

`client/test_reaction_with_server.py` - 실제 클라이언트 코드를 사용하여 반응 업데이트를 확인하고 서버로 전송

## 사용 방법

### 방법 1: 테스트 스크립트 직접 실행 (권장)

#### Termux에서 실행

```bash
# Termux에서 실행
cd ~/kakkaobot
python client/test_reaction_with_server.py
```

#### Windows/Linux에서 실행 (DB 파일이 있는 경우)

```bash
# DB 파일 경로 지정
python client/test_reaction_with_server.py "C:\path\to\KakaoTalk.db"

# 또는 환경변수 사용
export KAKAO_DB_PATH=/path/to/KakaoTalk.db
python client/test_reaction_with_server.py
```

### 방법 2: !반응 명령어 사용

카카오톡에서 `!반응` 명령어를 입력하면 테스트 방법 안내를 받을 수 있습니다:

```
📋 반응 업데이트 테스트 안내

클라이언트에서 반응 데이터를 확인하고 서버로 전송합니다.

💡 테스트 방법:
1. Termux에서 다음 명령어 실행:
   python client/test_reaction_with_server.py

2. 또는 클라이언트가 실행 중이면 자동으로 10초마다 확인됩니다.

📊 확인 내용:
- 카카오톡 DB의 v 필드에서 defaultEmoticonsCount 확인
- supplement 필드에서 reactions 상세 정보 확인
- 반응 변화 감지 시 서버로 전송
- Supabase DB에 저장 확인
```

### 방법 3: 실제 클라이언트 실행 시 자동 확인

`kakao_poller.py`를 실행하면 자동으로 10초마다 반응 업데이트를 확인합니다:

```bash
# Termux에서
cd ~/kakkaobot
python client/kakao_poller.py
```

로그에서 다음 메시지를 확인하세요:
- `[반응 업데이트 확인] 시작: 최근 메시지 N개 확인`
- `[반응 확인] msg_id=XXX, defaultEmoticonsCount=N`
- `[반응 업데이트 감지] ✅`
- `[반응 업데이트 전송] 서버로 전송 시작`

## 테스트 내용

이 스크립트는 다음을 수행합니다:

1. ✅ DB 접근 확인
2. ✅ DB 구조 확인 (v, supplement 컬럼)
3. ✅ MY_USER_ID 로드
4. ✅ WebSocket 연결
5. ✅ `poll_reaction_updates()` 함수 호출 (실제 클라이언트 코드)
   - 최근 24시간 내 메시지 100개 조회
   - v 필드에서 `defaultEmoticonsCount` 파싱
   - supplement 필드에서 `reactions` 또는 `emoticons` 파싱
   - 반응 변화 감지
   - 서버로 `reaction_update` 타입 메시지 전송

## 서버 처리 및 DB 저장 확인

서버는 `reaction_update` 타입 메시지를 받으면:

1. `supplement`에서 반응 상세 정보 추출
2. `kakao_log_id`로 실제 `chat_messages.id` 찾기
3. `chatLogger.saveReaction()` 호출하여 `chat_reactions` 테이블에 저장
4. `moderationLogger.saveReactionLog()` 호출하여 `reaction_logs` 테이블에 저장

### Supabase DB 확인 방법

1. **chat_reactions 테이블**:
```sql
SELECT * FROM chat_reactions 
ORDER BY created_at DESC 
LIMIT 10;
```

2. **reaction_logs 테이블**:
```sql
SELECT * FROM reaction_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

3. **특정 메시지의 반응 확인**:
```sql
SELECT cr.*, cm.message_text, cm.sender_name
FROM chat_reactions cr
JOIN chat_messages cm ON cr.message_id = cm.id
WHERE cm.kakao_log_id = 'YOUR_KAKAO_LOG_ID'
ORDER BY cr.created_at DESC;
```

## 예상 출력

### 성공 시

```
============================================================
클라이언트 반응 데이터 조회 및 서버 전송 테스트
============================================================
DB 경로: /data/data/com.kakao.talk/databases/KakaoTalk.db
WebSocket URL: ws://192.168.0.15:5002/ws

[1단계] DB 접근 확인
------------------------------------------------------------
✅ DB 접근 성공

[2단계] DB 구조 확인
------------------------------------------------------------
✅ DB 구조 확인 완료

[3단계] MY_USER_ID 로드
------------------------------------------------------------
✅ MY_USER_ID: 1234567890

[4단계] WebSocket 연결
------------------------------------------------------------
✅ WebSocket 연결 성공

============================================================
[5단계] 반응 업데이트 확인 및 서버 전송
============================================================

클라이언트의 poll_reaction_updates() 함수 호출...
(이 함수는 최근 24시간 내 메시지의 반응 변화를 확인하고 서버로 전송합니다)

[반응 업데이트 확인] 시작: 최근 메시지 50개 확인, 캐시 크기=0
[DB 검증] 첫 메시지: msg_id=12345, 컬럼 수=6
[DB 검증] v 필드 존재=True, supplement 존재=True
[반응 확인] msg_id=12345, defaultEmoticonsCount=2
[반응 업데이트 감지] ✅ msg_id=12345, 이전=0, 현재=2, 증가=2
[반응 업데이트] supplement에서 reactions 추출: msg_id=12345, reactions 개수=2
[반응 업데이트] 새 반응 발견: reactor_id=9876543210, type=thumbs_up
[반응 업데이트 전송] 서버로 전송 시작: 2개 반응
[반응 업데이트 전송] [1/2] msg_id=12345, reaction_type=thumbs_up
[✓] 반응 업데이트 전송 성공: msg_id=12345
[반응 업데이트 확인] 완료: 2개 반응 변화 감지, 2개 전송 성공

============================================================
테스트 결과
============================================================
감지된 반응 변화: 2개

✅ 반응 데이터가 감지되어 서버로 전송되었습니다.

📋 다음 단계:
  1. 서버 로그에서 '[반응 처리]' 또는 '[반응 저장]' 메시지 확인
  2. Supabase DB의 chat_reactions 테이블에서 저장 확인
  3. Supabase DB의 reaction_logs 테이블에서 로그 확인
```

### 반응이 없는 경우

```
============================================================
테스트 결과
============================================================
감지된 반응 변화: 0개

⚠️ 반응 변화가 감지되지 않았습니다.

📋 가능한 원인:
  1. 최근 24시간 내 반응이 추가/변경된 메시지가 없음
  2. 반응이 있는 메시지가 없음
  3. v 필드나 supplement 필드에 반응 정보가 없음

💡 테스트 방법:
  1. 카카오톡에서 실제로 메시지에 반응을 눌러보세요
  2. 몇 분 후 이 스크립트를 다시 실행하세요
```

## 문제 해결

### 오류: "kakao_poller 모듈 import 실패"

**해결 방법**:
- `client/kakao_poller.py` 파일이 존재하는지 확인
- 필요한 Python 패키지가 설치되어 있는지 확인 (`websocket-client` 등)

### 오류: "WebSocket 연결 실패"

**해결 방법**:
- 서버가 실행 중인지 확인
- `WS_URL`이 올바른지 확인
- 네트워크 연결 확인

### 반응이 감지되지 않음

**해결 방법**:
1. 카카오톡에서 실제로 메시지에 반응(👍, ❤️ 등)을 눌러보세요
2. 몇 분 기다린 후 다시 테스트하세요
3. `test_reaction_polling.py`를 먼저 실행하여 DB에 반응 데이터가 있는지 확인

### 서버로 전송되었지만 DB에 저장되지 않음

**확인 사항**:
1. 서버 로그 확인: `[반응 처리]`, `[반응 저장]` 메시지 확인
2. 오류 메시지 확인: `[반응 저장] 실패` 메시지 확인
3. Supabase 연결 확인: 서버가 Supabase에 연결되어 있는지 확인
4. 테이블 존재 확인: `chat_reactions`, `reaction_logs` 테이블이 존재하는지 확인

## 추가 정보

- **클라이언트 코드**: `client/kakao_poller.py`의 `poll_reaction_updates()` 함수
- **서버 처리**: `server/server.js`의 `reaction_update` 타입 메시지 처리
- **DB 저장**: `server/db/chatLogger.js`의 `saveReaction()` 함수
- **DB 로그**: `server/db/moderationLogger.js`의 `saveReactionLog()` 함수










