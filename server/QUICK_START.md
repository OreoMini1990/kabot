# 빠른 시작 가이드

## 🚀 채팅 로그 DB 및 통계 기능 적용

### ✅ 자동화 완료된 작업
- Git 커밋 완료
- 코드 변경사항 적용 완료
- 배포 가이드 문서 작성 완료

---

## 📋 필수 작업 (수동)

### 1. Supabase 데이터베이스 설정

**위치**: Supabase 대시보드 > SQL Editor

**실행 순서**:
1. `server/db/chat_logs_schema.sql` 실행 (필수)
2. `server/db/reports_schema.sql` 실행 (필수)
3. `server/db/chat_logs_aggregation.sql` 실행 (선택)
4. `server/db/chat_logs_search.sql` 실행 (선택)

**소요 시간**: 약 3-5분

---

### 2. 서버 환경변수 설정

**파일**: `server/.env`

**추가할 내용**:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

**소요 시간**: 약 2분

---

### 3. 서버 재시작

```bash
# PM2 사용 시
pm2 restart kakkaobot-server

# 또는
cd server
npm start
```

**소요 시간**: 약 1분

---

### 4. APK 빌드 및 설치 (선택)

**필요한 경우만**:
```bash
cd bridge
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**소요 시간**: 약 5-10분

---

### 5. 접근성 서비스 활성화 (선택)

**위치**: 기기 설정 > 접근성 > 설치된 서비스

**소요 시간**: 약 1분

---

## ⚡ 빠른 테스트

1. 카카오톡에서 메시지 전송
2. 서버 로그 확인: `[채팅 로그] 메시지 저장`
3. Supabase에서 `chat_messages` 테이블 확인

---

## 📚 상세 가이드

- **전체 가이드**: `server/DEPLOYMENT_GUIDE.md`
- **단계별 안내**: `server/DEPLOYMENT_STEPS.md`
- **기술적 제약사항**: `server/NAVER_CAFE_IMAGE_LIMITATIONS.md`
