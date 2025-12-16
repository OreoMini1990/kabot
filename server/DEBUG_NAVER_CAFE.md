# 네이버 카페 기능 디버깅 가이드

## 문제: 명령어에 반응하지 않음

### 1단계: 서버 재시작 확인

```bash
# PM2 사용 시
pm2 restart kakkaobot-server

# 로그 확인
pm2 logs kakkaobot-server --lines 50
```

### 2단계: 서버 시작 로그 확인

서버 시작 시 다음 로그가 나타나야 합니다:

```
[설정] NAVER_CAFE 기능: true (환경변수: true)
```

만약 `false`로 나오면:
- `.env` 파일 확인
- `NAVER_CAFE_ENABLED=true` 설정 확인
- 서버 재시작

### 3단계: 명령어 테스트

카톡에서 다음 명령어 입력:
```
!질문 테스트,테스트 내용
```

서버 로그에서 다음을 확인:
```
[디버그] 메시지 체크: msg="!질문 테스트,테스트 내용", lower="!질문 테스트,테스트 내용", NAVER_CAFE=true, startsWith !질문=true
[네이버 카페] 질문 명령어 감지됨
```

### 4단계: 문제별 해결

#### 문제 1: NAVER_CAFE가 false로 표시됨

**원인:** 환경변수가 로드되지 않음

**해결:**
1. `.env` 파일 위치 확인 (server 디렉토리 내)
2. `.env` 파일 내용 확인:
   ```
   NAVER_CAFE_ENABLED=true
   ```
3. `dotenv` 패키지 설치 확인:
   ```bash
   cd server
   npm list dotenv
   ```
4. 서버 재시작

#### 문제 2: 명령어 체크 로그가 나타나지 않음

**원인:** 메시지가 handleMessage 함수에 도달하지 않음

**해결:**
1. 채팅방 이름 확인: "의운모" 채팅방인지 확인
2. WebSocket 연결 확인
3. 다른 명령어(!hi) 테스트

#### 문제 3: 로그는 나타나지만 반응 없음

**원인:** 조건문 실패 또는 오류 발생

**해결:**
1. 서버 로그에서 오류 메시지 확인
2. try-catch 블록 내 오류 확인
3. 환경변수 값 확인 (NAVER_ACCESS_TOKEN, CLUBID, MENUID)

### 5단계: 환경변수 수동 확인

서버 시작 시 다음 코드로 환경변수 확인 가능:

```javascript
console.log('NAVER_CAFE_ENABLED:', process.env.NAVER_CAFE_ENABLED);
console.log('NAVER_ACCESS_TOKEN:', process.env.NAVER_ACCESS_TOKEN ? '설정됨' : '없음');
console.log('NAVER_CAFE_CLUBID:', process.env.NAVER_CAFE_CLUBID);
console.log('NAVER_CAFE_MENUID:', process.env.NAVER_CAFE_MENUID);
```

### 6단계: 명령어 형식 확인

올바른 형식:
```
!질문 제목,내용
```

잘못된 형식:
- `!질문제목,내용` (띄어쓰기 없음 - 문제 없을 수도 있음)
- `! 질문 제목,내용` (띄어쓰기 있음 - 문제 없을 수도 있음)

코드는 `trim()`과 `toLowerCase()`를 사용하므로 대소문자와 앞뒤 공백은 문제 없습니다.

### 7단계: 빠른 테스트

간단한 테스트 응답 추가 (임시):

```javascript
// labbot-node.js의 handleMessage 함수 내
if (trimmedMsg.toLowerCase().includes("질문")) {
    console.log('[테스트] 질문 키워드 감지:', trimmedMsg);
    replies.push("테스트: 질문 명령어가 감지되었습니다.");
    return replies;
}
```

이 코드를 추가하면 "질문"이라는 단어가 포함된 메시지에 반응합니다.



