# 채팅 로그 DB 및 통계 기능 배포 가이드

## 개요
채팅 로그 DB와 통계 기능을 서버, 클라이언트, APK에 적용하는 단계별 가이드입니다.

## 사전 준비사항
- Supabase 프로젝트 생성 및 접근 권한
- 서버 접근 권한 (SSH 또는 직접 접근)
- APK 빌드 환경 (Android Studio 또는 Gradle)

---

## 1단계: Supabase 데이터베이스 설정 ✅ (자동화 불가)

### 1.1 Supabase 대시보드 접속
1. https://supabase.com 접속
2. 프로젝트 선택 또는 새 프로젝트 생성

### 1.2 SQL Editor에서 스키마 실행
**순서대로 실행:**

1. **`server/db/chat_logs_schema.sql`** 실행
   - 모든 테이블, 제약조건, 인덱스, 트리거 생성
   - 실행 시간: 약 1-2분

2. **`server/db/chat_logs_aggregation.sql`** 실행 (선택사항)
   - 통계 집계 함수 생성
   - 실행 시간: 약 30초

3. **`server/db/chat_logs_search.sql`** 실행 (선택사항)
   - 검색 함수 생성
   - 실행 시간: 약 30초

4. **`server/db/reports_schema.sql`** 실행
   - 신고 테이블 생성
   - 실행 시간: 약 30초

### 1.3 환경변수 확인
Supabase 프로젝트 설정에서 다음 정보 확인:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`

---

## 2단계: 서버 환경변수 설정 ✅ (수동 작업 필요)

### 2.1 `.env` 파일 수정
서버 디렉토리의 `.env` 파일에 다음 추가:

```env
# Supabase 설정
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
# 또는 서비스 키 사용 (더 많은 권한)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 2.2 Supabase 클라이언트 패키지 확인
```bash
cd server
npm list @supabase/supabase-js
```

없으면 설치:
```bash
npm install @supabase/supabase-js
```

---

## 3단계: 서버 코드 배포 ✅ (자동화 가능)

### 3.1 Git에서 최신 코드 가져오기
```bash
cd /path/to/kakkaobot
git pull origin main
```

### 3.2 서버 재시작
```bash
# PM2 사용 시
pm2 restart kakkaobot-server

# 또는 직접 실행 시
cd server
npm start
```

### 3.3 로그 확인
```bash
# PM2 사용 시
pm2 logs kakkaobot-server --lines 50

# 직접 실행 시
# 콘솔에서 로그 확인
```

**확인 사항:**
- `[채팅 로그]` 관련 로그가 정상적으로 출력되는지 확인
- Supabase 연결 오류가 없는지 확인

---

## 4단계: Bridge APK 빌드 및 배포 ✅ (자동화 가능)

### 4.1 APK 빌드
```bash
cd bridge
./gradlew assembleDebug
# 또는
./gradlew assembleRelease
```

### 4.2 APK 설치
```bash
# ADB 사용
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 또는 직접 기기에 전송하여 설치
```

### 4.3 접근성 서비스 활성화
1. 기기 설정 > 접근성 > 설치된 서비스
2. "KakaoBridge Accessibility Service" 활성화

---

## 5단계: 기능 테스트 ✅ (수동 작업 필요)

### 5.1 채팅 로그 저장 테스트
1. 카카오톡에서 일반 메시지 전송
2. 서버 로그에서 `[채팅 로그] 메시지 저장` 확인
3. Supabase에서 `chat_messages` 테이블 확인

### 5.2 통계 명령어 테스트
카카오톡에서 다음 명령어 테스트:
- `/오늘 채팅`
- `/이번주 채팅`
- `/통계`

### 5.3 신고 기능 테스트
1. 타 유저 메시지에 답장 버튼 클릭
2. `@랩봇 !신고` 입력
3. 신고 접수 확인 메시지 확인
4. Supabase에서 `reports` 테이블 확인

### 5.4 닉네임 변경 감지 테스트
1. 사용자가 닉네임 변경
2. 메시지 전송
3. 닉네임 변경 알림 확인
4. Supabase에서 `user_name_history` 테이블 확인

---

## 6단계: 문제 해결

### 문제 1: Supabase 연결 실패
**증상:** `[채팅 로그] 저장 실패` 오류

**해결:**
1. `.env` 파일의 Supabase URL/Key 확인
2. Supabase 프로젝트의 API 설정 확인
3. 네트워크 연결 확인

### 문제 2: 테이블이 없다는 오류
**증상:** `relation "chat_messages" does not exist`

**해결:**
1. Supabase SQL Editor에서 스키마 재실행
2. 테이블 목록에서 생성 확인

### 문제 3: 권한 오류
**증상:** `permission denied for table chat_messages`

**해결:**
1. Supabase에서 RLS (Row Level Security) 정책 확인
2. 서비스 키 사용 또는 정책 수정

---

## 자동화 가능한 작업

다음 작업들은 자동화 스크립트로 수행 가능합니다:

1. ✅ Git 커밋 및 푸시
2. ✅ 서버 코드 배포 (Git pull)
3. ✅ APK 빌드 (Gradle)
4. ✅ APK 설치 (ADB)

---

## 수동 작업 필요 항목

다음 작업들은 수동으로 수행해야 합니다:

1. ❌ Supabase SQL 스키마 실행
2. ❌ Supabase 환경변수 설정
3. ❌ 서버 `.env` 파일 수정
4. ❌ 접근성 서비스 활성화 (기기 설정)
5. ❌ 기능 테스트 및 검증

---

## 체크리스트

배포 전 확인사항:

- [ ] Supabase 프로젝트 생성 완료
- [ ] 모든 SQL 스키마 실행 완료
- [ ] Supabase 환경변수 확인 완료
- [ ] 서버 `.env` 파일 설정 완료
- [ ] 서버 재시작 완료
- [ ] APK 빌드 및 설치 완료
- [ ] 접근성 서비스 활성화 완료
- [ ] 기능 테스트 완료

---

## 다음 단계

배포 완료 후:
1. 프론트엔드 관리자 페이지 개발 (신고 내역 확인 등)
2. 통계 대시보드 개발
3. 추가 기능 구현






