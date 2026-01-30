# 테스트 스크립트 사용 가이드

## 1. DB v 필드 확인 테스트

### 목적
카카오톡 DB에서 `v` 필드와 `supplement` 필드 데이터를 제대로 가져오는지 확인합니다.

### 사용법

```bash
# 방법 1: DB 경로를 인자로 전달
node server/test/test_db_v_field.js /path/to/KakaoTalk.db

# 방법 2: 환경변수로 DB 경로 설정
export KAKAO_DB_PATH=/path/to/KakaoTalk.db
node server/test/test_db_v_field.js
```

### 출력 정보
- 테이블 구조 (컬럼 목록)
- v 컬럼 및 supplement 컬럼 존재 여부
- 최근 20개 메시지의 v 필드 내용
- `defaultEmoticonsCount`가 있는 메시지 목록

### 예시 출력
```
============================================================
DB v 필드 확인 테스트
============================================================
DB 경로: /path/to/KakaoTalk.db
DB 파일 존재: ✅ 예

✅ DB 연결 성공

📋 chat_logs 테이블 컬럼:
  _id, chat_id, user_id, message, v, supplement, type, created_at

  v 컬럼 존재: ✅ 예
  supplement 컬럼 존재: ✅ 예

📊 최근 메시지 조회 (v 필드가 있는 메시지):

총 20개 메시지 발견

[1] 메시지 ID: 9451
    chat_id: 18469584418690487
    user_id: 4897202238384073231
    type: 1
    created_at: 1734674818123
    message: 안녕하세요
    v 필드 (JSON):
      keys: enc, origin, isMine, defaultEmoticonsCount
      defaultEmoticonsCount: 2
      내용 (일부): {"enc":31,"origin":"MSG","isMine":false,"defaultEmoticonsCount":2}...
```

---

## 2. 네이버 카페 API 이미지 업로드 테스트

### 목적
네이버 카페 API로 이미지가 포함된 글이 제대로 작성되는지 확인합니다.

### 사전 요구사항
- 환경변수 설정 필요:
  - `NAVER_ACCESS_TOKEN`: 네이버 OAuth 액세스 토큰
  - `NAVER_CAFE_CLUBID`: 카페 ID
  - `NAVER_CAFE_MENUID`: 게시판 메뉴 ID
- 테스트 이미지: `server/test/catch.JPG` (자동으로 찾음)

### 사용법

```bash
# 환경변수 설정 (Linux/Mac)
export NAVER_ACCESS_TOKEN="your_token_here"
export NAVER_CAFE_CLUBID="28339939"
export NAVER_CAFE_MENUID="1"

# 또는 .env 파일 사용
# .env 파일에 위 변수들을 추가하고 dotenv가 자동으로 로드됨

# 테스트 실행
node server/test/test_naver_cafe_image.js
```

### 출력 정보
- 환경변수 확인
- 이미지 파일 확인
- API 호출 결과
- 작성된 글 URL

### 예시 출력
```
============================================================
네이버 카페 API 이미지 업로드 테스트
============================================================

✅ 환경변수 확인 완료
   CLUB_ID: 28339939
   MENU_ID: 1
   ACCESS_TOKEN: AAAANjARrFheyb3+6rEc...

✅ 테스트 이미지 확인: /path/to/server/test/catch.JPG
   파일 크기: 123456 bytes

✅ 이미지 파일 읽기 완료: 123456 bytes

📤 네이버 카페 API 호출 준비:
   URL: https://openapi.naver.com/v1/cafe/28339939/menu/1/articles
   이미지: catch.JPG (123456 bytes)

✅ API 호출 성공!
   상태 코드: 200

📥 응답 데이터:
{
  "result": {
    "msg": "Success",
    "cafeUrl": "ramrc",
    "articleId": 691,
    "articleUrl": "https://cafe.naver.com/ramrc/691"
  }
}

✅ 글 작성 성공!
   글 URL: https://cafe.naver.com/ramrc/691

브라우저에서 위 URL을 열어서 이미지가 정상적으로 표시되는지 확인하세요.
```

### 문제 해결

#### 이미지 파일을 찾을 수 없음
```
❌ 테스트 이미지 파일을 찾을 수 없습니다.
시도한 경로:
  - /path/to/server/test/catch.JPG
  - ...
```
→ `server/test/catch.JPG` 파일이 존재하는지 확인하세요.

#### Access Token 오류
```
❌ 오류 발생: Request failed with status code 401
   상태 코드: 401
```
→ `NAVER_ACCESS_TOKEN`이 유효한지 확인하세요. 토큰이 만료되었을 수 있습니다.

#### 권한 오류
```
❌ 오류 발생: Request failed with status code 403
   상태 코드: 403
```
→ 카페 글쓰기 권한이 있는지 확인하세요.

---

## 빠른 테스트 실행

### 1. DB v 필드 확인
```bash
# Termux에서 실행 (카카오톡 DB 경로 사용)
adb shell "su -c 'cp /data/data/com.kakao.talk/databases/KakaoTalk.db /sdcard/KakaoTalk.db'"
adb pull /sdcard/KakaoTalk.db ./KakaoTalk.db
node server/test/test_db_v_field.js ./KakaoTalk.db
```

### 2. 네이버 카페 이미지 업로드
```bash
# .env 파일 확인 후 실행
node server/test/test_naver_cafe_image.js
```









