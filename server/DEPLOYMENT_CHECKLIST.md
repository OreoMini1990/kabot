# 채팅 로그 DB 및 통계 기능 배포 체크리스트

## ✅ 자동화 완료된 작업

- [x] Git 커밋 완료
- [x] 코드 변경사항 적용 완료
- [x] 테스트 스크립트 작성 완료
- [x] 배포 가이드 문서 작성 완료

---

## 📋 사용자가 수행해야 할 작업

### 1단계: Supabase 데이터베이스 설정 (수동, 필수)

#### 1.1 Supabase 대시보드 접속
- [ ] https://supabase.com 접속
- [ ] 프로젝트 선택 또는 새 프로젝트 생성

#### 1.2 SQL Editor에서 스키마 실행
**중요**: 다음 순서대로 실행해야 합니다.

- [ ] **`server/db/chat_logs_schema.sql`** 실행
  - 실행 시간: 약 1-2분
  - **필수**: 반드시 먼저 실행
  
- [ ] **`server/db/reports_schema.sql`** 실행
  - 실행 시간: 약 30초
  - **필수**: 신고 기능 사용 시 필요
  
- [ ] **`server/db/chat_logs_aggregation.sql`** 실행 (선택사항)
  - 실행 시간: 약 30초
  - **선택**: 통계 집계 기능 사용 시 필요
  
- [ ] **`server/db/chat_logs_search.sql`** 실행 (선택사항)
  - 실행 시간: 약 30초
  - **선택**: 키워드 검색 기능 사용 시 필요

#### 1.3 환경변수 확인
- [ ] Supabase 프로젝트 설정에서 `SUPABASE_URL` 확인
- [ ] `SUPABASE_ANON_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY` 확인

---

### 2단계: 서버 환경변수 설정 (수동, 필수)

#### 2.1 `.env` 파일 수정
- [ ] `server/.env` 파일 열기
- [ ] 다음 내용 추가:
  ```env
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_ANON_KEY=your-anon-key-here
  # 또는
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
  ```

#### 2.2 Supabase 클라이언트 패키지 확인
- [ ] `cd server && npm list @supabase/supabase-js` 실행
- [ ] 없으면 `npm install @supabase/supabase-js` 실행

---

### 3단계: 서버 코드 배포 (자동화 가능)

#### 3.1 Git에서 최신 코드 가져오기
```bash
cd /path/to/kakkaobot
git pull origin main
```

#### 3.2 서버 재시작
```bash
# PM2 사용 시
pm2 restart kakkaobot-server

# 또는 직접 실행 시
cd server
npm start
```

#### 3.3 로그 확인
```bash
# PM2 사용 시
pm2 logs kakkaobot-server --lines 50
```

**확인 사항**:
- [ ] `[DB] Supabase 클라이언트 초기화 완료` 로그 확인
- [ ] `[채팅 로그]` 관련 로그가 정상적으로 출력되는지 확인
- [ ] Supabase 연결 오류가 없는지 확인

---

### 4단계: Bridge APK 빌드 및 배포 (자동화 가능, 선택)

#### 4.1 APK 빌드
```bash
cd bridge
./gradlew assembleDebug
```

#### 4.2 APK 설치
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

#### 4.3 접근성 서비스 활성화 (수동)
- [ ] 기기 설정 > 접근성 > 설치된 서비스
- [ ] "KakaoBridge Accessibility Service" 활성화

---

### 5단계: 자동 테스트 실행 (자동화 가능)

#### 5.1 테스트 스크립트 실행
```bash
cd server
node test/test-chat-logging.js
```

**예상 결과**:
```
[테스트] 1. DB 연결 테스트
  ✅ DB 연결 성공
[테스트] 2. 메시지 저장 테스트
  ✅ 메시지 저장 성공 (ID: ...)
...
```

---

### 6단계: 수동 기능 테스트 (수동 작업 필요)

자세한 내용은 `server/test/test-manual-checklist.md` 참고

#### 6.1 기본 메시지 저장 테스트
- [ ] 카카오톡에서 메시지 전송
- [ ] 서버 로그 확인
- [ ] Supabase에서 `chat_messages` 테이블 확인

#### 6.2 통계 명령어 테스트
- [ ] `/오늘 채팅` 명령어 테스트
- [ ] `/이번주 채팅` 명령어 테스트
- [ ] `/통계` 명령어 테스트

#### 6.3 신고 기능 테스트
- [ ] 답장 버튼 + `@랩봇 !신고` 테스트
- [ ] Supabase에서 `reports` 테이블 확인

#### 6.4 닉네임 변경 감지 테스트
- [ ] 닉네임 변경 후 메시지 전송
- [ ] 닉네임 변경 알림 확인

#### 6.5 !질문 기능 개선 테스트
- [ ] 이미지 없을 때 안내 메시지 확인
- [ ] 연속 등록 제한 확인
- [ ] 직전 메시지 이미지 감지 확인

---

## 🎯 빠른 시작

**최소 필수 작업만 수행하려면**:

1. Supabase SQL 스키마 실행 (1-2분)
2. 서버 `.env` 파일 설정 (2분)
3. 서버 재시작 (1분)
4. 자동 테스트 실행 (1분)

**총 소요 시간**: 약 5-10분

---

## 📚 상세 가이드

- **전체 가이드**: `server/DEPLOYMENT_GUIDE.md`
- **단계별 안내**: `server/DEPLOYMENT_STEPS.md`
- **빠른 시작**: `server/QUICK_START.md`
- **자동 테스트**: `server/test/test-chat-logging.js`
- **수동 테스트**: `server/test/test-manual-checklist.md`






