# 세션 변경 사항 요약

## 📦 Node Modules 재설치 명령어

### Windows (PowerShell)
```powershell
cd server
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

### Linux/Mac
```bash
cd server
rm -rf node_modules package-lock.json
npm install
```

---

## 📝 수정된 파일 목록

### 1. 네이버 카페 Access Token 자동 발급 관리

#### 새로 생성된 파일
- `server/db/naver_oauth_tokens.sql` - 네이버 OAuth 토큰 저장 테이블
- `server/integrations/naverCafe/tokenManager.js` - 토큰 자동 관리 서비스

#### 수정된 파일
- `server/api/naverOAuth.js` - OAuth callback에서 토큰 DB 저장 기능 추가
- `server/integrations/naverCafe/cafeWrite.js` - 토큰 자동 갱신 로직 추가
- `server/labbot-node.js` - 토큰 관리 서비스 사용하도록 수정

---

### 2. !질문 명령어 형식 변경 및 필터링 업데이트

#### 수정된 파일
- `server/labbot-node.js` - !질문 형식 변경 (제목,내용 → 제목/내용), 필터링 로직 업데이트

#### 새로 생성된 파일
- `server/db/update_profanity_words_postgres.sql` - 필터링 단어 DB 업데이트 SQL

---

### 3. 네이버 검색 API - !뉴스 기능

#### 새로 생성된 파일
- `server/integrations/naverSearch/naverNews.js` - 네이버 검색 API 뉴스 검색 모듈

#### 수정된 파일
- `server/labbot-node.js` - !뉴스 명령어 처리 로직 추가

---

## 🔄 전체 변경 파일 목록 (업데이트 순서)

### 데이터베이스 스키마 (Supabase에서 실행 필요)
1. `server/db/naver_oauth_tokens.sql` ⭐ 새 파일
2. `server/db/update_profanity_words_postgres.sql` ⭐ 새 파일

### 서버 코드 파일
3. `server/integrations/naverCafe/tokenManager.js` ⭐ 새 파일
4. `server/integrations/naverSearch/naverNews.js` ⭐ 새 파일
5. `server/api/naverOAuth.js` ✏️ 수정됨
6. `server/integrations/naverCafe/cafeWrite.js` ✏️ 수정됨
7. `server/labbot-node.js` ✏️ 수정됨

---

## 🚀 배포 체크리스트

### 1. 데이터베이스 업데이트
- [ ] Supabase에서 `server/db/naver_oauth_tokens.sql` 실행
- [ ] Supabase에서 `server/db/update_profanity_words_postgres.sql` 실행

### 2. 코드 업데이트
- [ ] 모든 수정된 파일이 서버에 업로드되었는지 확인
- [ ] 새로 생성된 디렉토리 `server/integrations/naverSearch/` 확인

### 3. 환경변수 확인
- [ ] `NAVER_CLIENT_ID` 설정 확인
- [ ] `NAVER_CLIENT_SECRET` 설정 확인 (카페 API + 검색 API 모두 사용 가능한지 확인)

### 4. 의존성 설치
- [ ] `cd server`
- [ ] `rm -rf node_modules package-lock.json` (또는 Windows: `Remove-Item -Recurse -Force node_modules, package-lock.json`)
- [ ] `npm install`

### 5. 서버 재시작
- [ ] PM2 재시작: `pm2 restart labbot-node` 또는 `pm2 restart all`
- [ ] 로그 확인: `pm2 logs labbot-node`

---

## 📋 주요 변경 사항 요약

### 기능 추가
1. ✅ 네이버 카페 Access Token 자동 발급 및 갱신 관리
2. ✅ !질문 명령어 형식 변경 (제목,내용 → 제목/내용)
3. ✅ 필터링 시스템 강화 (exact_match, regex_patterns, compound_match)
4. ✅ !뉴스 명령어 추가 (네이버 검색 API)

### 개선 사항
- 토큰 만료 시 자동 갱신
- 필터링 정확도 향상 (NFKC 정규화, alias_map 적용)
- 오류 처리 개선

---

## ⚠️ 주의사항

1. **네이버 검색 API**: 네이버 개발자센터에서 "검색 API"를 별도로 신청해야 합니다.
2. **토큰 관리**: 첫 OAuth 인증 후 토큰이 DB에 저장되면 자동으로 관리됩니다.
3. **필터링 단어**: DB에 단어를 추가한 후 서버 재시작이 필요할 수 있습니다.

---

## 📞 문제 발생 시

### 서버 상태 확인
```powershell
# 서버 상태 확인 스크립트 실행
.\check-server-status.ps1

# 또는 수동 확인
pm2 list
pm2 logs labbot-node --lines 50
netstat -ano | findstr :5002
```

### WebSocket 연결 문제 해결
1. 서버 재시작: `pm2 restart labbot-node`
2. 로그 확인: `pm2 logs labbot-node`
3. 환경변수 확인: `.env` 파일의 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 확인
4. DB 연결 확인: Supabase 연결 상태 확인

### 즉시 응답이 안 오는 경우
- Bridge APK가 알림을 찾지 못하면 `WaitingNotification` 상태가 됩니다
- 카카오톡에서 해당 채팅방으로 메시지를 받으면 자동으로 전송됩니다
- 또는 서버가 실행 중인지 확인하세요

