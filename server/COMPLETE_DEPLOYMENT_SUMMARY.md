# 채팅 로그 DB 및 통계 기능 완전 배포 가이드

## 📋 개요

이 문서는 채팅 로그 DB와 통계 기능을 서버, 클라이언트, APK에 완전히 적용하기 위한 종합 가이드입니다.

---

## ✅ 자동화 완료된 작업

다음 작업들은 이미 완료되었으며, 추가 작업이 필요 없습니다:

1. ✅ **Git 커밋 완료**
   - 모든 변경사항이 Git에 커밋됨
   - 커밋 메시지: "Feat: Complete chat logging system implementation"

2. ✅ **코드 변경사항 적용 완료**
   - 서버 코드에 모든 기능 구현 완료
   - 클라이언트 코드 변경 불필요 (서버에서 처리)
   - APK 코드 변경 불필요 (서버에서 처리)

3. ✅ **테스트 스크립트 작성 완료**
   - 자동 테스트: `server/test/test-chat-logging.js`
   - 수동 테스트 체크리스트: `server/test/test-manual-checklist.md`
   - 테스트 실행 스크립트: `run-tests.sh`, `run-tests.ps1`

4. ✅ **배포 가이드 문서 작성 완료**
   - 전체 가이드: `server/DEPLOYMENT_GUIDE.md`
   - 단계별 안내: `server/DEPLOYMENT_STEPS.md`
   - 빠른 시작: `server/QUICK_START.md`
   - 체크리스트: `server/DEPLOYMENT_CHECKLIST.md`
   - 테스트 가이드: `server/TEST_GUIDE.md`

---

## 📋 사용자가 수행해야 할 작업 (단계별)

### 🔴 필수 작업 (반드시 수행)

#### 1단계: Supabase 데이터베이스 설정 (약 5분)

**위치**: Supabase 대시보드 > SQL Editor

**순서**:
1. `server/db/chat_logs_schema.sql` 실행 (필수)
2. `server/db/reports_schema.sql` 실행 (필수)
3. `server/db/chat_logs_aggregation.sql` 실행 (선택)
4. `server/db/chat_logs_search.sql` 실행 (선택)

**확인 방법**: Supabase Table Editor에서 테이블 목록 확인

---

#### 2단계: 서버 환경변수 설정 (약 2분)

**파일**: `server/.env`

**추가할 내용**:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
# 또는 더 많은 권한이 필요하면
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**확인 방법**: 서버 시작 시 `[DB] Supabase 클라이언트 초기화 완료` 로그 확인

---

#### 3단계: 서버 재시작 (약 1분)

```bash
# PM2 사용 시
pm2 restart kakkaobot-server

# 또는 직접 실행 시
cd server
npm start
```

**확인 방법**: 서버 로그에서 Supabase 연결 확인

---

### 🟡 선택 작업 (필요한 경우만)

#### 4단계: APK 빌드 및 설치 (약 10분)

**필요한 경우만** (코드 변경이 없으므로 일반적으로 불필요):

```bash
cd bridge
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**확인 방법**: APK가 정상적으로 설치되었는지 확인

---

#### 5단계: 접근성 서비스 활성화 (약 1분)

**위치**: 기기 설정 > 접근성 > 설치된 서비스

**확인 방법**: "KakaoBridge Accessibility Service"가 활성화되어 있는지 확인

---

## 🧪 테스트 실행

### 자동 테스트 (권장)

```bash
cd server
node test/test-chat-logging.js
```

**또는**:
- Windows: `.\test\run-tests.ps1`
- Linux/Mac: `./test/run-tests.sh`

**예상 결과**: 모든 테스트 통과

---

### 수동 테스트

자세한 내용은 `server/test/test-manual-checklist.md` 참고

**주요 테스트 항목**:
1. 메시지 저장 테스트
2. 통계 명령어 테스트 (`/오늘 채팅`, `/이번주 채팅`, `/통계`)
3. 신고 기능 테스트 (`@랩봇 !신고`)
4. 닉네임 변경 감지 테스트
5. !질문 기능 개선 테스트

---

## 📊 작업 소요 시간 요약

| 작업 | 소요 시간 | 필수 여부 |
|------|----------|----------|
| Supabase SQL 스키마 실행 | 5분 | ✅ 필수 |
| 서버 환경변수 설정 | 2분 | ✅ 필수 |
| 서버 재시작 | 1분 | ✅ 필수 |
| 자동 테스트 실행 | 1분 | ✅ 권장 |
| 수동 테스트 | 10-15분 | ✅ 권장 |
| APK 빌드 및 설치 | 10분 | 선택 |
| 접근성 서비스 활성화 | 1분 | 선택 |

**최소 필수 작업 총 소요 시간**: 약 9분

---

## 🎯 빠른 시작 (최소 작업만)

1. Supabase SQL 스키마 실행 (5분)
2. 서버 `.env` 파일 설정 (2분)
3. 서버 재시작 (1분)
4. 자동 테스트 실행 (1분)

**총 소요 시간**: 약 9분

---

## 📚 상세 문서

- **전체 가이드**: `server/DEPLOYMENT_GUIDE.md`
- **단계별 안내**: `server/DEPLOYMENT_STEPS.md`
- **빠른 시작**: `server/QUICK_START.md`
- **체크리스트**: `server/DEPLOYMENT_CHECKLIST.md`
- **테스트 가이드**: `server/TEST_GUIDE.md`
- **자동 테스트**: `server/test/test-chat-logging.js`
- **수동 테스트**: `server/test/test-manual-checklist.md`

---

## ✅ 배포 완료 확인

다음 항목을 모두 확인하세요:

- [ ] Supabase SQL 스키마 실행 완료
- [ ] 서버 `.env` 파일 설정 완료
- [ ] 서버 재시작 완료
- [ ] 자동 테스트 통과
- [ ] 수동 테스트 완료
- [ ] Supabase에서 데이터 확인 완료

---

## 🆘 문제 해결

### 문제 1: Supabase 연결 실패
**해결**: `.env` 파일의 Supabase 설정 확인

### 문제 2: 테이블이 없다는 오류
**해결**: Supabase SQL 스키마 재실행

### 문제 3: 테스트 실패
**해결**: `server/TEST_GUIDE.md`의 문제 해결 섹션 참고

---

## 📞 다음 단계

배포 완료 후:
1. 프론트엔드 관리자 페이지 개발 (신고 내역 확인 등)
2. 통계 대시보드 개발
3. 추가 기능 구현

