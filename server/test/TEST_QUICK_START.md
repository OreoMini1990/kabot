# 테스트 빠른 시작 가이드

## 1. DB v 필드 확인 테스트

### Windows PowerShell에서 실행

```powershell
# 방법 1: DB 파일 경로 직접 지정
node server/test/test_db_v_field.js "C:\path\to\KakaoTalk.db"

# 방법 2: 환경변수로 DB 경로 설정
$env:KAKAO_DB_PATH = "C:\path\to\KakaoTalk.db"
node server/test/test_db_v_field.js
```

### Termux에서 실행 (Android 기기)

```bash
# DB 파일 복사 (root 권한 필요)
adb shell "su -c 'cp /data/data/com.kakao.talk/databases/KakaoTalk.db /sdcard/KakaoTalk.db'"

# PC로 파일 가져오기
adb pull /sdcard/KakaoTalk.db ./KakaoTalk.db

# 테스트 실행
node server/test/test_db_v_field.js ./KakaoTalk.db
```

---

## 2. 네이버 카페 API 이미지 업로드 테스트

### 방법 1: PowerShell 스크립트 사용 (권장)

```powershell
# server 디렉토리에서 실행
cd server
.\test\test_naver_cafe_image.ps1
```

### 방법 2: .env 파일 사용

1. **`server/.env` 파일 생성 또는 수정**:
```env
NAVER_ACCESS_TOKEN=your_access_token_here
NAVER_CAFE_CLUBID=28339939
NAVER_CAFE_MENUID=1
```

2. **테스트 실행**:
```powershell
cd server
node test/test_naver_cafe_image.js
```

### 방법 3: PowerShell에서 직접 환경변수 설정

```powershell
# 환경변수 설정
$env:NAVER_ACCESS_TOKEN = "your_access_token_here"
$env:NAVER_CAFE_CLUBID = "28339939"
$env:NAVER_CAFE_MENUID = "1"

# 테스트 실행
cd server
node test/test_naver_cafe_image.js
```

### 방법 4: 한 줄로 실행 (PowerShell)

```powershell
cd server; $env:NAVER_ACCESS_TOKEN="your_token"; $env:NAVER_CAFE_CLUBID="28339939"; $env:NAVER_CAFE_MENUID="1"; node test/test_naver_cafe_image.js
```

---

## 환경변수 확인

현재 설정된 환경변수를 확인하려면:

### PowerShell
```powershell
$env:NAVER_ACCESS_TOKEN
$env:NAVER_CAFE_CLUBID
$env:NAVER_CAFE_MENUID
```

### Node.js 스크립트로 확인
```powershell
node -e "require('dotenv').config(); console.log('TOKEN:', process.env.NAVER_ACCESS_TOKEN ? '설정됨' : '없음'); console.log('CLUBID:', process.env.NAVER_CAFE_CLUBID); console.log('MENUID:', process.env.NAVER_CAFE_MENUID);"
```

---

## 문제 해결

### 오류: "NAVER_ACCESS_TOKEN 환경변수가 설정되지 않았습니다"

**해결 방법**:
1. `server/.env` 파일이 존재하는지 확인
2. `.env` 파일에 올바른 값이 있는지 확인
3. PowerShell에서 직접 환경변수 설정

### 오류: "테스트 이미지 파일을 찾을 수 없습니다"

**해결 방법**:
- `server/test/catch.JPG` 파일이 존재하는지 확인
- 또는 다른 이미지 파일 경로를 수정

### 오류: "Request failed with status code 401"

**해결 방법**:
- `NAVER_ACCESS_TOKEN`이 유효한지 확인
- 토큰이 만료되었을 수 있으니 새로 발급받기

---

## 예상 출력

### 성공 시:
```
============================================================
네이버 카페 API 이미지 업로드 테스트
============================================================

✅ 환경변수 확인 완료
   CLUB_ID: 28339939
   MENU_ID: 1
   ACCESS_TOKEN: AAAANjARrFheyb3+6rEc...

✅ 테스트 이미지 확인: D:\JosupAI\kakkaobot\server\test\catch.JPG
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
```









