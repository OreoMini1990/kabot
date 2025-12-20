# 로그 확인 가이드

## PM2 로그 위치

PM2를 사용하는 경우 로그는 다음 위치에 저장됩니다:

### 1. PM2 로그 명령어로 확인 (권장)

```bash
# 실시간 로그 보기
pm2 logs kakkaobot-server

# 최근 100줄 보기
pm2 logs kakkaobot-server --lines 100

# 에러 로그만 보기
pm2 logs kakkaobot-server --err

# 출력 로그만 보기
pm2 logs kakkaobot-server --out
```

### 2. 로그 파일 위치

`config/ecosystem.config.js`에서 설정한 경로:
- 에러 로그: `./logs/kakkaobot-error.log`
- 출력 로그: `./logs/kakkaobot-out.log`

프로젝트 루트 디렉토리에서 확인:
```bash
# Windows
type logs\kakkaobot-out.log
type logs\kakkaobot-error.log

# Linux/Mac
tail -f logs/kakkaobot-out.log
tail -f logs/kakkaobot-error.log
```

### 3. 서버 상태 확인

```bash
# PM2 프로세스 상태 확인
pm2 status

# 상세 정보 확인
pm2 show kakkaobot-server

# 재시작
pm2 restart kakkaobot-server

# 완전히 중지 후 시작
pm2 stop kakkaobot-server
pm2 start config/ecosystem.config.js
```

## 빠른 테스트 방법

### 1. 서버 시작 확인

```bash
pm2 logs kakkaobot-server --lines 50
```

다음과 같은 로그가 보여야 합니다:
```
[설정] NAVER_CAFE 기능: true (환경변수: true)
[DB] Supabase 클라이언트 초기화 완료
[2025-xx-xx] HTTP listening on 0.0.0.0:5002
[2025-xx-xx] IRIS Core 시작: http://0.0.0.0:5002 / ws://0.0.0.0:5002/ws
```

### 2. 카톡에서 메시지 보낸 후 로그 확인

카톡에서 다음 명령어 입력:
```
!질문 테스트,테스트 내용
```

그리고 바로 다음 명령어 실행:
```bash
pm2 logs kakkaobot-server --lines 50
```

다음과 같은 로그가 보여야 합니다:
```
[handleMessage] 호출됨: room="...", msg="!질문 테스트,테스트 내용", sender="..."
[handleMessage] 채팅방 필터링: roomMatch=true, ROOM_NAME="의운모", room="..."
[handleMessage] 명령어 체크: trimmedMsg="!질문 테스트,테스트 내용"
[handleMessage] 네이버 카페 체크: msgLower="!질문 테스트,테스트 내용", NAVER_CAFE=true, startsWith !질문=true
[네이버 카페] 질문 명령어 처리 시작
```

## 문제 해결

### 로그가 전혀 안 보이면

1. **서버가 실행 중인지 확인:**
   ```bash
   pm2 status
   ```
   상태가 `online`이어야 합니다.

2. **서버 재시작:**
   ```bash
   pm2 restart kakkaobot-server
   ```

3. **코드 변경사항 확인:**
   - `server/labbot-node.js` 파일이 저장되었는지 확인
   - 서버 재시작 전에 파일 저장 확인

4. **직접 실행 테스트 (PM2 없이):**
   ```bash
   cd server
   node -r dotenv/config server.js
   ```
   이렇게 실행하면 터미널에 직접 로그가 출력됩니다.

### WebSocket 연결 확인

서버 로그에서 다음을 확인:
```
[2025-xx-xx] WS 연결: /ws from ...
```

메시지를 보냈을 때:
```
=== RAW MESSAGE FROM CLIENT ===
...
================================
```

## 간단한 테스트 코드 추가

만약 로그가 전혀 안 보인다면, 더 명확한 테스트 로그를 추가할 수 있습니다.










